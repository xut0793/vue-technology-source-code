/**
 * <keep-alive> 包裹动态组件时，会缓存不活动的组件实例，而不是销毁。
 * 
 * <keep-alive> 是一个抽象组件：它自身不会渲染一个 DOM 元素，也不会出现在组件的父组件链中。
 * 即 abstract = true
 * 
 * 实际渲染的是内部第一个子元素节点
 * 
 * 组件属性 props：
 * include - 字符串或正则表达式或数组。只有名称匹配的组件会被缓存。
 * exclude - 字符串或正则表达式或数组。任何名称匹配的组件都不会被缓存。
 * max - 数字。最多可以缓存多少组件实例。
 * 
 * include / exclude 匹配规则：
 * 首先检查组件自身的 name 选项，如果 name 选项不可用，则匹配它的局部注册名称 (父组件 components 选项的键值)。匿名组件不能被匹配。
 * 
 * 使用要求：
 * 1. 它要求被切换到的组件都有自己的名字，不论是通过组件的 name 选项还是局部/全局注册。
 * 2. 它内部子组件要求同时只有一个子元素被渲染，所以不能用其子元素上使用 v-for 中。常见的情形是在 v-if 切换组件、component is 动态组件、router-link 路由组件
 *    因为 keep-alive 只处理第一个子元素，即内部实现了 vnode = getFirstComponentChild(slot)
 * 
 * 用法：
 * <keep-alive>
 *   <comp-a v-if="a > 1"></comp-a>
 *   <comp-b v-else></comp-b>
 * </keep-alive>
 * 
 * <keep-alive include="/a|b/" :max="10">
 *   <component :is="view"></component>
 * </keep-alive>
 * 
 * <keep-alive>
 *  <router-link></router-link>
 * </keep-alive>
 */


/**
 * 一、keepAlive 组件的内部定义，使用 render 函数渲染
 * 1. keepAlive 组件实现缓存的主要是因为在组件内部定义了 this.cache 数组存储了内部组件
 * 2. keepAlive 组件对缓存的优化使用了 LRU，即删除最少使用的已缓存组件。通过 keys 、 pruneCache函数和 pruneCacheEntry 函数实现
 *    表现在最新使用的组件 key 插入 keys 尾部，达到缓存限制时删除头部。
 */
var patternTypes = [String, RegExp, Array];
var KeepAlive = {
  name: 'keep-alive',
  abstract: true,

  props: {
    include: patternTypes,
    exclude: patternTypes,
    max: [String, Number]
  },

  created: function created () {
    this.cache = Object.create(null); // 组件缓存： key: comp
    this.keys = []; // 缓存优化：最近使用的组件 key 推入尾部，需要清理时删除首个元素
  },

  destroyed: function destroyed () {
    // keepAlive 组件自身卸载时，也对已缓存的组件进行卸载，实现内存优化
    for (var key in this.cache) {
      pruneCacheEntry(this.cache, key, this.keys);
    }
  },

  mounted: function mounted () {
    var this$1 = this;
    // 监听 include / exclude 的变化，更新缓存 cache 值，对已经不满足 include 的组件退出缓存，或满足 exclude 的组件也退出缓存
    this.$watch('include', function (val) {
      pruneCache(this$1, function (name) { return matches(val, name); });
    });
    this.$watch('exclude', function (val) {
      pruneCache(this$1, function (name) { return !matches(val, name); });
    });
  },

  render: function render () {
    // keepAlive 组件内子元素
    var slot = this.$slots.default;
    var vnode = getFirstComponentChild(slot); // 获取第一个子元素作为keepAlive要渲染的组件
    var componentOptions = vnode && vnode.componentOptions;
    if (componentOptions) {
      // check pattern
      var name = getComponentName(componentOptions);
      var ref = this;
      var include = ref.include;
      var exclude = ref.exclude;
      if (
        // not included 对不匹配 include 条件的组件直接返回 vnode
        (include && (!name || !matches(include, name))) ||
        // excluded 对匹配 excluded 条件的组件也直接返回 vonde
        (exclude && name && matches(exclude, name))
      ) {
        return vnode
      }

      var ref$1 = this;
      var cache = ref$1.cache;
      var keys = ref$1.keys;

      // 如果组件没有定义 key，则用 cid + tag::+tag,如 1::ComA
      var key = vnode.key == null
        // same constructor may get registered as different local components
        // so cid alone is not enough (#3269)
        ? componentOptions.Ctor.cid + (componentOptions.tag ? ("::" + (componentOptions.tag)) : '')
        : vnode.key;
      if (cache[key]) {
        vnode.componentInstance = cache[key].componentInstance;
        // make current key freshest
        remove(keys, key);
        keys.push(key);
      } else {
        // 子组件首次渲染时，将其缓存进 cache 对象和 keys 数组
        cache[key] = vnode;
        keys.push(key);
        // prune oldest entry 如果当前已缓存的组件已超出预设缓存数量，则将 keys[0] 首位节点数据删除
        if (this.max && keys.length > parseInt(this.max)) {
          pruneCacheEntry(cache, keys[0], keys, this._vnode);
        }
      }

      // keepAlive 组件标识位
      vnode.data.keepAlive = true;
    }

    // keepAlive 
    return vnode || (slot && slot[0])
  }
};

// helper
function getComponentName (opts) {
  return opts && (opts.Ctor.options.name || opts.tag)
}

function matches (pattern, name) {
  if (Array.isArray(pattern)) {
    return pattern.indexOf(name) > -1
  } else if (typeof pattern === 'string') {
    return pattern.split(',').indexOf(name) > -1
  } else if (isRegExp(pattern)) {
    return pattern.test(name)
  }
  /* istanbul ignore next */
  return false
}

function pruneCache (keepAliveInstance, filter) {
  var cache = keepAliveInstance.cache;
  var keys = keepAliveInstance.keys;
  var _vnode = keepAliveInstance._vnode;
  for (var key in cache) {
    var cachedNode = cache[key];
    if (cachedNode) {
      var name = getComponentName(cachedNode.componentOptions);
      if (name && !filter(name)) {
        pruneCacheEntry(cache, key, keys, _vnode);
      }
    }
  }
}

function pruneCacheEntry (
  cache,
  key,
  keys,
  current
) {
  var cached$$1 = cache[key];
  // key 存在组件缓存，且不是当前显示的组件，则清除
  if (cached$$1 && (!current || cached$$1.tag !== current.tag)) {
    cached$$1.componentInstance.$destroy();
  }
  cache[key] = null;
  remove(keys, key);
}

// 二、内部组件 keepAlive 什么时候注册的
var builtInComponents = {
  KeepAlive: KeepAlive
};

initGlobalAPI(Vue);
function initGlobalAPI (Vue) {
 // 省略代码...

  Vue.options = Object.create(null);
  ASSET_TYPES.forEach(function (type) { // ASSET_TYPES = ['component', 'directive', 'filter']
    Vue.options[type + 's'] = Object.create(null);
  });
  // Vue.options.components / Vue.options.directives / Vue.options.filters

  extend(Vue.options.components, builtInComponents);
  // Vue.optioins.componens.KeepAlive = KeepAlive
}

// 经过 initGlobalAPI(Vue) 后，Vue 构造函数的默认选项
Vue.options = {
  components: {
    KeepAlive: KeepAlive,
    Transition: Transition,
    TransitionGroup: TransitionGroup,
  },
  directives: {
    model: {inserted: ƒ, componentUpdated: ƒ},
    show: {bind: ƒ, update: ƒ, unbind: ƒ}
  },
  filters: {},
  _base: Vue
}

// 然后在组件实例化时 _init
Vue.prototype._init = function (options) {
  // 省略代码...

  // merge options
  if (options && options._isComponent) {
    // 组件实例化时选项合并
    initInternalComponent(vm, options);
  } else {
    // new Vue 时选项合并
    vm.$options = mergeOptions(
      resolveConstructorOptions(vm.constructor), // Vue.options
      options || {},
      vm
    );
  }
}

// 先看 new Vue 时 mergeOptions
function mergeOptions (
  parent,
  child,
  vm
) {
  // 省略代码...

  var options = {};
  var key;
  for (key in parent) {
    mergeField(key);
  }
  for (key in child) {
    if (!hasOwn(parent, key)) {
      mergeField(key);
    }
  }

  function mergeField (key) {
    var strat = strats[key] || defaultStrat;
    options[key] = strat(parent[key], child[key], vm, key);
  }
  return options
}

// strat(Vue.options.components, child.components, vm, components)
ASSET_TYPES.forEach(function (type) {
  strats[type + 's'] = mergeAssets;
});

function mergeAssets (
  parentVal,
  childVal,
  vm,
  key
) {
  var res = Object.create(parentVal || null); // 以 Vue.options.components 为原型
  if (childVal) {
    assertObjectType(key, childVal, vm);
    return extend(res, childVal)
  } else {
    return res
  }
}

/**
 * 结果就是:
 * vm.$options = {
 *  components: {
 *    childComponents,
 *    __proto__: {
 *      KeepAlive: KeepAlive
 *    }
 *  }
 * }
 */

// 组件实例化时：合并选项调用 initInternalComponent
function initInternalComponent (vm, options) {
  var opts = vm.$options = Object.create(vm.constructor.options); // vm.constructor = Sub
  // 省略代码...
}

//_createElement => createComponent =>  Ctor = baseCtor.extend(childOptions);
Vue.extend = function (extendOptions) {
  // 省略代码...
  Sub.options = mergeOptions(
    Super.options, // Vue.options
    extendOptions
  );
  
  /**
   * 结果就是:
   * Sub.options = {
   *  components: {
   *    childComponents,
   *    __proto__: {
   *      KeepAlive: KeepAlive
   *    }
   *  }
   * }
   */
  return Sub
};

/**
 * 三、KeepAlive 首次渲染，同常规组件一样，不同的是，此时因为 KeepAlive 组件定义有 options.render 函数。
 * $mount => mountComponent => updateComponent => vm._update(vm._render(), false) => vm._render
 */
Vue.prototype._render = function () {
  var vm = this;
  // 省略代码...
  try {
    currentRenderingInstance = vm;
    vnode = render.call(vm._renderProxy, vm.$createElement);
  } catch (e) {
    // 省略代码...
  } finally {
    currentRenderingInstance = null;
  }
  return vnode
};

// 此时执行 KeepAlive 定义的 render 方法，见上面
// 因为是首次渲染，所以获取this.$slot.defalut 的第一个子元素组件，进行缓存 cache 、 keys，后，返回该子元素组件的 vnode
// 注意在 KeepAlive 组件的 render 函数里，会将获取的子元素组件 vnode.data.keepAlive = true
// 然后 vm.update 就会渲染子元素组件一直到挂载显示：vm._update => createElm => createComponent => i => init
var componentVNodeHooks = {
  init: function init (vnode, hydrating) {
    if (
      vnode.componentInstance &&
      !vnode.componentInstance._isDestroyed &&
      vnode.data.keepAlive
    ) {
      // kept-alive components, treat as a patch
      var mountedNode = vnode; // work around flow
      componentVNodeHooks.prepatch(mountedNode, mountedNode);
    } else {
      // 此时 keepAlive 首次渲染，if 分支会走这里，正常进行组件实例化
      var child = vnode.componentInstance = createComponentInstanceForVnode(
        vnode,
        activeInstance
      );
      child.$mount(hydrating ? vnode.elm : undefined, hydrating);
    }
  }
}

// 三、缓存渲染
// 当父组件的数据改变，派发依赖更新：updateComponent => vm._update(vm._render()) => vm._update => patch => patchVnode => updateChildren
// 此时更新到组件中的 KeepAlive
function patchVnode (
  oldVnode,
  vnode,
  insertedVnodeQueue,
  ownerArray,
  index,
  removeOnly
) {
  // 省略代码

  var i;
  var data = vnode.data;
  if (isDef(data) && isDef(i = data.hook) && isDef(i = i.prepatch)) {
    i(oldVnode, vnode);
  }
  // 省略代码
}

prepatch: function prepatch (oldVnode, vnode) {
  var options = vnode.componentOptions;
  var child = vnode.componentInstance = oldVnode.componentInstance;
  updateChildComponent(
    child,
    options.propsData, // updated props
    options.listeners, // updated listeners
    vnode, // new parent vnode
    options.children // new children
  );
}

function updateChildComponent (
  vm,
  propsData,
  listeners,
  parentVnode,
  renderChildren
) {

  // determine whether component has slot children
  // we need to do this before overwriting $options._renderChildren.

  // check if there are dynamic scopedSlots (hand-written or compiled but with
  // dynamic slot names). Static scoped slots compiled from template has the
  // "$stable" marker.
  var newScopedSlots = parentVnode.data.scopedSlots;
  var oldScopedSlots = vm.$scopedSlots;
  var hasDynamicScopedSlot = !!(
    (newScopedSlots && !newScopedSlots.$stable) ||
    (oldScopedSlots !== emptyObject && !oldScopedSlots.$stable) ||
    (newScopedSlots && vm.$scopedSlots.$key !== newScopedSlots.$key)
  );

  // Any static slot children from the parent may have changed during parent's
  // update. Dynamic scoped slots may also have changed. In such cases, a forced
  // update is necessary to ensure correctness.
  var needsForceUpdate = !!(
    renderChildren ||               // has new static slots
    vm.$options._renderChildren ||  // has old static slots
    hasDynamicScopedSlot
  );

  // resolve slots + force update if has children
  if (needsForceUpdate) {
    vm.$slots = resolveSlots(renderChildren, parentVnode.context);
    vm.$forceUpdate();
  }
}

/**
 * updateChildComponent 方法主要是去更新组件实例的一些属性，这里我们重点关注一下 slot 部分，
 * 由于 <keep-alive> 组件本质上支持了 slot，所以它执行 prepatch 的时候，需要对自己的 children，也就是这些 slots 做重新解析
 * 并触发 <keep-alive> 组件实例 $forceUpdate 逻辑，即 vm._watcher.update() =>vm._watcher.run() => vm._watcher.get() = vm._watcher.getter() => updateComponent => vm._update(vm._render())
 * 也就是重新执行 <keep-alive> 的 render 方法，这个时候如果它包裹的第一个组件 vnode 命中缓存，则直接返回缓存中的 vnode.componentInstance
 */
vnode.componentInstance = cache[key].componentInstance;
// 然后在执行 vm._update 时vm._update => createElm => createComponent => init
function createComponent (vnode, insertedVnodeQueue, parentElm, refElm) {
  // 这里拿到的 vnode.data 是在 vm._render 函数中 createComponent 函数中创建返回的 vnode
  // 其中  installComponentHooks(data) 执行即安装了组件创建的钩子函数 vnode.data.hook
  var i = vnode.data;
  if (isDef(i)) {
    var isReactivated = isDef(vnode.componentInstance) && i.keepAlive; // true
    if (isDef(i = i.hook) && isDef(i = i.init)) {
      i(vnode, false /* hydrating */);
    }
    if (isDef(vnode.componentInstance)) {
      initComponent(vnode, insertedVnodeQueue);
      insert(parentElm, vnode.elm, refElm);
      if (isTrue(isReactivated)) {
        reactivateComponent(vnode, insertedVnodeQueue, parentElm, refElm);
      }
      return true
    }
  }
}

/**
 * 这里同样会执行到keep-alive 组件内部的 init
 */
var componentVNodeHooks = {
  init: function init (vnode, hydrating) {
    if (
      vnode.componentInstance &&
      !vnode.componentInstance._isDestroyed &&
      vnode.data.keepAlive
    ) {
      // kept-alive 更新渲染，会走向这个分支
      var mountedNode = vnode; // work around flow
      componentVNodeHooks.prepatch(mountedNode, mountedNode);
    } else {
      // 此时 keepAlive 首次渲染
      var child = vnode.componentInstance = createComponentInstanceForVnode(
        vnode,
        activeInstance
      );
      child.$mount(hydrating ? vnode.elm : undefined, hydrating);
    }
  }
}

// 此时 vnode.componentInstance 是 keepAlive 组件的第一个元素，
// 所以 componentVNodeHooks.prepatch(mountedNode, mountedNode) 会触发 keepAlive 组件的第一个元素进行强制更新渲染。
// 之后，createComponent 继续执行，调用 insert(parentElm, vnode.elm, refElm) 插入 DOM
// if (isDef(vnode.componentInstance)) { isDef(vnode.componentInstance)) 分支执行两次 insert 似乎有点多余
function createComponent (vnode, insertedVnodeQueue, parentElm, refElm) {
  var i = vnode.data;
  if (isDef(i)) {
    var isReactivated = isDef(vnode.componentInstance) && i.keepAlive; // true
    if (isDef(i = i.hook) && isDef(i = i.init)) {
      i(vnode, false /* hydrating */);
    }
    if (isDef(vnode.componentInstance)) {
      initComponent(vnode, insertedVnodeQueue);
      insert(parentElm, vnode.elm, refElm);
      if (isTrue(isReactivated)) {
        reactivateComponent(vnode, insertedVnodeQueue, parentElm, refElm);
      }
      return true
    }
  }
}

// 生命周期
// 因为 keepAlive 组件再次渲染时，并不会走 $mount函数，而是　prepatch 函数，所以不会再次执行 beforeMount 和 mounted 钩子函数。
// 而是在 insert 函数中执行 actived 钩子函数

insert: function insert (vnode) {
  var context = vnode.context;
  var componentInstance = vnode.componentInstance;
  if (!componentInstance._isMounted) {
    componentInstance._isMounted = true;
    callHook(componentInstance, 'mounted');
  }
  if (vnode.data.keepAlive) {
    if (context._isMounted) {
      queueActivatedComponent(componentInstance);
    } else {
      activateChildComponent(componentInstance, true /* direct */);
    }
  }
}
// vnode.data.keepAlive = true 判断如果是被 <keep-alive> 包裹的组件已经 mounted，
// 如果被 keep-alive 包裹的组件已经挂载了，则执行 queueActivatedComponent
function queueActivatedComponent (vm) {
  // setting _inactive to false here so that a render function can
  // rely on checking whether it's in an inactive tree (e.g. router-view)
  vm._inactive = false;
  activatedChildren.push(vm);
}
// 这个逻辑很简单，把当前 vm 实例添加到 activatedChildren 数组中，
// 等所有的渲染完毕，在 nextTick后会执行 flushSchedulerQueue 函数中执行
function flushSchedulerQueue () {
  // ...
  const activatedQueue = activatedChildren.slice()
  callActivatedHooks(activatedQueue)
  // ...
} 

function callActivatedHooks (queue) {
  // 遍历所有的 activatedChildren，执行 activateChildComponent 方法
  // 通过队列调的方式就是把整个 activated 时机延后了
  for (let i = 0; i < queue.length; i++) {
    queue[i]._inactive = true
    activateChildComponent(queue[i], true)  }
}

// 如果被 keep-alive 包裹的组件还没有挂载，则执行 activateChildComponent
function activateChildComponent (vm, direct) {
  if (direct) {
    vm._directInactive = false;
    if (isInInactiveTree(vm)) {
      return
    }
  } else if (vm._directInactive) {
    return
  }
  if (vm._inactive || vm._inactive === null) {
    vm._inactive = false;
    for (var i = 0; i < vm.$children.length; i++) {
      activateChildComponent(vm.$children[i]);
    }
    callHook(vm, 'activated');
  }
}
// 可以看到这里就是执行组件的 acitvated 钩子函数，
// 并且递归去执行它的所有子组件的 activated 钩子函数。

// 有 activated 钩子函数，也就有对应的 deactivated 钩子函数，
// 它是发生在 vnode 的 destory 钩子函数
destroy: function (vnode) {
  const { componentInstance } = vnode
  if (!componentInstance._isDestroyed) {
    if (!vnode.data.keepAlive) {
      componentInstance.$destroy()
    } else {
      deactivateChildComponent(componentInstance, true /* direct */)
    }
  }
}

function deactivateChildComponent (vm, direct) {
  if (direct) {
    vm._directInactive = true;
    if (isInInactiveTree(vm)) {
      return
    }
  }
  if (!vm._inactive) {
    vm._inactive = true;
    for (var i = 0; i < vm.$children.length; i++) {
      deactivateChildComponent(vm.$children[i]);
    }
    callHook(vm, 'deactivated');
  }
}

// 和 activateChildComponent 方法类似，就是执行组件的 deacitvated 钩子函数，
// 并且递归去执行它的所有子组件的 deactivated 钩子函数

/**
 * 程序的内存空间是有限的，所以我们无法无节制的对数据进行存储，这时候需要有策略去淘汰不那么重要的数据，保持最大数据存储量的一致。
 * 这种类型的策略称为缓存优化策略，根据淘汰的机制不同，常用的有以下三类。
 * 1.FIFO： 先进先出策略，我们通过记录数据使用的时间，当缓存大小即将溢出时，优先清除离当前时间最远的数据。
 * 2.LRU： 最近最少使用策略, 遵循的原则是，如果数据最近被访问(使用)过，那么将来被访问的几率会更高，
 *        如果以一个数组去记录数据，当有一数据被访问时，该数据会被移动到数组的末尾，表明最近被使用过，当缓存溢出时，会删除数组的头部数据，即将最不频繁使用的数据移除。
 * 3.LFU: 计数最少策略。用次数去标记数据使用频率，次数最少的会在缓存溢出时被淘汰。
 * 
 * 这三种缓存算法各有优劣，各自适用不同场景，而我们看keep-alive在缓存时的优化处理，很明显利用了LRU的缓存策略。
 * 以下就是vue中对keep-alive缓存处理的优化代码
 */

var keepAlive = {
  render: function() {
    // 省略代码···
    if (cache[key]) {
      vnode.componentInstance = cache[key].componentInstance;
      remove(keys, key); // 删除当前的，然后插入到未尾
      keys.push(key);
    } else {
      cache[key] = vnode;
      keys.push(key);
      // 当缓存达到最大值时，删除最不常用的首个元素
      if (this.max && keys.length > parseInt(this.max)) {
        pruneCacheEntry(cache, keys[0], keys, this._vnode);
      }
    }
  }
}
function remove (arr, item) {
  if (arr.length) {
    var index = arr.indexOf(item);
    if (index > -1) {
      return arr.splice(index, 1)
    }
  }
}


