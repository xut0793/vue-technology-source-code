/**
 * Vue 渲染流程
 * 1. HTML 模板，只有 <div id="app"></div>
 * 2. 加载 js，在 js 中执行 new Vue 里的一系列初始化代码
 * 3. 挂载：vm.$mount('#app')
 *    3.1 cmopile: 编译模板成渲染函数赋值给 vm.$option.render，即 with(this) {...}
 *    3.2 render: vm._render 执行 vm.$option.render 渲染生成 Vnode，依赖收集也在这步进行
 *    3.3 update：vm._update ：属性事件等数据更新，及挂载DOM
 *        3.3.1 执行旧 oldVnode 和新 Vnode 对比 patch / patchVnode，完成属性等数据到真实 DOM中；主要由 invokeCreateHooks 函数完成
 *        下面这步就是 SSR 的分界点：
 *        3.3.2 如果是服务端渲染：不执行挂载，直接退出。因为此时已经将相关节点的属性、事件等数据同步到 DOM 中。
 * 
 * 所以 SSR 操作中，同一份 HTML 片段同时在服务器和客户端被初始化、编译、到一半的 _update 过程，所以 SSR 也称为同构。
 */

// virtual DOM patching 算法主要逻辑，具体见 vue_template_update.js 解析
function createPatchFunction (backend) {
  // 省略代码...
  return function patch (oldVnode, vnode, hydrating, removeOnly) {
    if (isUndef(vnode)) {
      if (isDef(oldVnode)) { invokeDestroyHook(oldVnode); }
      return
    }

    var isInitialPatch = false;
    var insertedVnodeQueue = [];

    if (isUndef(oldVnode)) {
      // empty mount (likely as component), create new root element
      // 如果没有旧节点可对比，说明此时是首次初始化节点，不需要对比，直接用 vnode 创建DOM元素
      isInitialPatch = true;
      createElm(vnode, insertedVnodeQueue);
    } else {
      var isRealElement = isDef(oldVnode.nodeType);
      if (!isRealElement && sameVnode(oldVnode, vnode)) {
        // patch existing root node
        patchVnode(oldVnode, vnode, insertedVnodeQueue, null, null, removeOnly);
      } else {
        if (isRealElement) {
          // 服务端渲染 SSR 视图更新的主要逻辑：hydrate 函数
          //  var SSR_ATTR = 'data-server-rendered';
          if (oldVnode.nodeType === 1 && oldVnode.hasAttribute(SSR_ATTR)) {
            oldVnode.removeAttribute(SSR_ATTR);
            hydrating = true;
          }
          if (isTrue(hydrating)) {
            /**
             * 由于服务器已经渲染好了 HTML，我们显然无需将其丢弃再重新创建所有的 DOM 元素。
             * 相反，我们需要"激活"这些静态的 HTML，然后使他们成为动态的（能够响应后续的数据变化）。
             * 这步就是 hydrate 过程，最后返回的是服务渲染好的 oldVnode
             */
            /**
             * 在开发模式下， hydrate 过程中，Vue 将推断客户端生成的虚拟 DOM 树 (virtual DOM tree)，
             * 是否与从服务器渲染的 DOM 结构 (DOM structure) 匹配。
             * 
             * 在生产模式下，此检测会被跳过，以避免性能损耗。
             */
            if (hydrate(oldVnode, vnode, insertedVnodeQueue)) {
              invokeInsertHook(vnode, insertedVnodeQueue, true);
              // 执行的还是 componentVNodeHooks.insert 插入函数，挂载 insertedVnodeQueue 内子组件 callHook(componentInstance, 'mounted');
              return oldVnode

            } else {
              warn(
                'The client-side rendered virtual DOM tree is not matching ' +
                'server-rendered content. This is likely caused by incorrect ' +
                'HTML markup, for example nesting block-level elements inside ' +
                '<p>, or missing <tbody>. Bailing hydration and performing ' +
                'full client-side render.'
              );
            }
          }
          /**
           * hydrate 执行返回 False, 无法匹配，它将退出混合模式，丢弃现有的 DOM 并从头开始渲染。
           * 这是下面的代码：将服务器渲染出来拿到真实 Dom 元素 （oldVnode ）置为空节点，
           * 并且继续 if 下面的 createElm 函数，用浏览器端渲染出来的 vnode 创建真实 DOM 元素
           */
          // either not server-rendered, or hydration failed.
          // create an empty node and replace it
          oldVnode = emptyNodeAt(oldVnode);
        }

        // replacing existing element
        var oldElm = oldVnode.elm;
        var parentElm = nodeOps.parentNode(oldElm);

        // create new node
        // 省略调用 createElm() 函数
}

 /**
  * 客户端与服务端同构的区分是在 vm._update 函数中执行 patch 函数中两个函数的代码：createElm / hydrating
  */

/**
 * hydrating 函数只在由服务端渲染的首屏时使用，主要执行一步操作：
 * 1. 执行旧 oldVnode 和新 Vnode 对比 patch / patchVnode，完成属性等数据到真实 DOM中；这一步在服务端渲染特有的即 hydrating 激活阶段
 * 而页面 DOM 复用由服务端渲染出来的
 */
// Note: this is a browser-only function so we can assume elms are DOM nodes.
function hydrate (elm, vnode, insertedVnodeQueue, inVPre) {
  var i;
  var tag = vnode.tag;
  var data = vnode.data;
  var children = vnode.children;
  inVPre = inVPre || (data && data.pre);
  vnode.elm = elm;

  if (isTrue(vnode.isComment) && isDef(vnode.asyncFactory)) {
    vnode.isAsyncPlaceholder = true;
    return true
  }
  // assert node match 断言确定 vnode 是一个组件节点或与node 一样的节点类型
  {
    if (!assertNodeMatch(elm, vnode, inVPre)) {
      return false
    }
  }
  // componentVNodeHooks.init 主要渲染 vnode 及嵌套的子组件：child.$mount(hydrating ? vnode.elm : undefined, hydrating);
  if (isDef(data)) {
    if (isDef(i = data.hook) && isDef(i = i.init)) { i(vnode, true /* hydrating */); }
    if (isDef(i = vnode.componentInstance)) {
      // child component. it should have hydrated its own tree.
      initComponent(vnode, insertedVnodeQueue);
      return true
    }
  }
  if (isDef(tag)) {
    if (isDef(children)) {
      // empty element, allow client to pick up and populate children
      if (!elm.hasChildNodes()) {
        createChildren(vnode, children, insertedVnodeQueue);
      } else {
        // v-html and domProps: innerHTML
        if (isDef(i = data) && isDef(i = i.domProps) && isDef(i = i.innerHTML)) {
          if (i !== elm.innerHTML) {
            /* istanbul ignore if */
            if (typeof console !== 'undefined' &&
              !hydrationBailed
            ) {
              hydrationBailed = true;
              console.warn('Parent: ', elm);
              console.warn('server innerHTML: ', i);
              console.warn('client innerHTML: ', elm.innerHTML);
            }
            return false
          }
        } else {
          // iterate and compare children lists
          var childrenMatch = true;
          var childNode = elm.firstChild;
          for (var i$1 = 0; i$1 < children.length; i$1++) {
            if (!childNode || !hydrate(childNode, children[i$1], insertedVnodeQueue, inVPre)) {
              childrenMatch = false;
              break
            }
            childNode = childNode.nextSibling;
          }
          // if childNode is not null, it means the actual childNodes list is
          // longer than the virtual children list.
          if (!childrenMatch || childNode) {
            /* istanbul ignore if */
            if (typeof console !== 'undefined' &&
              !hydrationBailed
            ) {
              hydrationBailed = true;
              console.warn('Parent: ', elm);
              console.warn('Mismatching childNodes vs. VNodes: ', elm.childNodes, children);
            }
            return false
          }
        }
      }
    }
    if (isDef(data)) {
      var fullInvoke = false;
      for (var key in data) {
        if (!isRenderedModule(key)) {
          fullInvoke = true;
          // 组件的属性事件如何映射到真实的 DOM 元素，就是此函数执行。
          invokeCreateHooks(vnode, insertedVnodeQueue);
          break
        }
      }
      if (!fullInvoke && data['class']) {
        // ensure collecting deps for deep class bindings for future updates
        traverse(data['class']);
      }
    }
  } else if (elm.data !== vnode.text) {
    elm.data = vnode.text;
  }
  return true
}
// 断言确定 vnode 是一个组件节点或与node 一样的节点类型
function assertNodeMatch (node, vnode, inVPre) {
  if (isDef(vnode.tag)) {
    return vnode.tag.indexOf('vue-component') === 0 || (
      !isUnknownElement$$1(vnode, inVPre) &&
      vnode.tag.toLowerCase() === (node.tagName && node.tagName.toLowerCase())
    )
  } else {
    return node.nodeType === (vnode.isComment ? 8 : 3)
  }
}




/**
 * createElm 函数在客户端渲染时使用，主要执行以下两步操作：
 * 1. 执行旧 oldVnode 和新 Vnode 对比 patch / patchVnode，完成属性等数据到真实 DOM中；主要由 invokeCreateHooks 函数完成
 * 2. 使用 node 中相关 API 进行插入到真实的 DOM 中，放在 nodeOps 对象中
 */ 
function createElm (
  vnode,
  insertedVnodeQueue,
  parentElm,
  refElm,
  nested,
  ownerArray,
  index
) {
  if (isDef(vnode.elm) && isDef(ownerArray)) {
    // This vnode was used in a previous render!
    // now it's used as a new node, overwriting its elm would cause
    // potential patch errors down the road when it's used as an insertion
    // reference node. Instead, we clone the node on-demand before creating
    // associated DOM element for it.
    vnode = ownerArray[index] = cloneVNode(vnode);
  }

  vnode.isRootInsert = !nested; // for transition enter check
  // createElm 无论怎样都尝试当成组件创建，观察是否成功。
  // 如果当前节点 vnode 不能作为组件创建返回 false，即往下继承执行
  // 如果当前节点是组件 vnode 则执行组件实例化，并返回 true，当前函数退出
  if (createComponent(vnode, insertedVnodeQueue, parentElm, refElm)) {
    return
  }

  var data = vnode.data;
  var children = vnode.children;
  var tag = vnode.tag;
  if (isDef(tag)) {
    {
      if (data && data.pre) {
        creatingElmInVPre++;
      }
      if (isUnknownElement$$1(vnode, creatingElmInVPre)) {
        warn(
          'Unknown custom element: <' + tag + '> - did you ' +
          'register the component correctly? For recursive components, ' +
          'make sure to provide the "name" option.',
          vnode.context
        );
      }
    }

    vnode.elm = vnode.ns
      ? nodeOps.createElementNS(vnode.ns, tag)
      : nodeOps.createElement(tag, vnode);
    setScope(vnode);

    /* istanbul ignore if */
    {
      createChildren(vnode, children, insertedVnodeQueue);
      if (isDef(data)) {
        invokeCreateHooks(vnode, insertedVnodeQueue);
      }
      insert(parentElm, vnode.elm, refElm);
    }

    if (data && data.pre) {
      creatingElmInVPre--;
    }
  } else if (isTrue(vnode.isComment)) {
    vnode.elm = nodeOps.createComment(vnode.text);
    insert(parentElm, vnode.elm, refElm);
  } else {
    vnode.elm = nodeOps.createTextNode(vnode.text);
    insert(parentElm, vnode.elm, refElm);
  }
}

var nodeOps = /*#__PURE__*/Object.freeze({
  createElement: createElement$1,
  createElementNS: createElementNS,
  createTextNode: createTextNode,
  createComment: createComment,
  insertBefore: insertBefore,
  removeChild: removeChild,
  appendChild: appendChild,
  parentNode: parentNode,
  nextSibling: nextSibling,
  tagName: tagName,
  setTextContent: setTextContent,
  setStyleScope: setStyleScope
});
