/**
 * 组件插槽 slot 分默认插槽、具名插槽、作用域插槽
 * 组件内定义插槽：
 * const customSection = Vue.extend({
    template: `<section>
        <header>
        // 具名和作用域插槽
        <slot name="title" :title="innerTitle"></slot>
        </header>

        <main>
        // 默认插槽
        <slot></slot>
        </main>

        <footer>
        // 具名插槽
        <slot name="time"></slot>
        </footer>
    </section>`,
    data:() => {
        return {
            innerTitle: '写在子级的标题'
        }
    }
})
 * 父组件内插槽使用：v-slot 可以简写 #
 <div id="app">
    <p>这里可以直接引用父级标题：{{ outerTitle }}</p>
    <custom-section>
        <template v-slot:title="slotProp">{{ slotProp.title }}</template>
        <template>这是段落正文部分，内容很长，这里就省略了......</template>
        <template #time>2019-5-26</template>
    </custom-section>
</div>
 */

// 先看下组件内定义插槽的元素解析：<slot name="title" :title="innerTitle"></slot>
// 通过前面理解，在解析过程，slot 还是作为正常标签解析：函数路径： $mount => compileToFunctions => baseCompiler => parse => parseHTML => parseStartTag => handleStartTag => options.start => closeElement => processElement => processSlotOutlet => processAttrs

// parseStartTag 处理结果
var startTagMatch = {
  tagName: 'slot',
  attrs: [
    [' name="title"', "name", "=", "title", index: 0, input: ' name="title" :title="innerTitle"></slot>', groups: undefined, start: 36, end: 49],
    [' :title="innerTitle"', ":title", "=", "innerTitle", index: 0, input: ' :title="innerTitle"></slot>', groups: undefined, start: 49, end: 69]
  ],
  start: 31,
  end: 70,
  unarySlash: ''
}

// handerStartTag 处理结果
attrs: [
  { name: "name", value: "title", start: 37, end: 49 },
  { name: ":title", value: "innerTitle", start: 50, end: 69 }
]

// options.start(tagName, attrs, unary, match.start, match.end)
// options.start('slot', attrs, false, 31, 70)
// createASTElement(tag, attrs, cuurentParent)
ASTElement = {
  tag: 'slot',
  type: 1,
  attrsList: [
    { name: "name", value: "title", start: 37, end: 49 },
    { name: ":title", value: "innerTitle", start: 50, end: 69 }
  ],
  attrsMap: {
    'name': 'title',
    ':title': 'innerTitle'
  },
  parent: Headers,
  childrend: []
}

// start => closeElement => processElement => processSlotOutlet
// handle <slot/> outlets
function processSlotOutlet(el) {
  if (el.tag === 'slot') {
    el.slotName = getBindingAttr(el, 'name'); // 会调用 getAndRemoveAttr(el, name)
    // 这一步之后
    // el.soltName = '"title"', attrsList: [{name: ":title", value: "innerTitle", start: 50, end: 69}]
    if (el.key) {
      warn$2(
        "`key` does not work on <slot> because slots are abstract outlets " +
        "and can possibly expand into multiple elements. " +
        "Use the key on a wrapping element instead.",
        getRawBindingAttr(el, 'key')
      );
    }
  }
}

// 然后在generate => genElement => genSlot
function genSlot(el, state) {
  var slotName = el.slotName || '"default"';
  var children = genChildren(el, state);
  var res = "_t(" + slotName + (children ? ("," + children) : ''); // _t("title",
  // attrs = '{"title": innerTitle}'
  var attrs = el.attrs || el.dynamicAttrs
    ? genProps((el.attrs || []).concat(el.dynamicAttrs || []).map(function (attr) {
      return ({
        // slot props are camelized
        name: camelize(attr.name),
        value: attr.value,
        dynamic: attr.dynamic
      });
    }))
    : null;
  var bind$$1 = el.attrsMap['v-bind'];
  if ((attrs || bind$$1) && !children) {
    res += ",null";
  }
  if (attrs) {
    res += "," + attrs;
  }
  if (bind$$1) {
    res += (attrs ? '' : ',null') + "," + bind$$1;
  }
  return res + ')' // "_t("title",null,{"title":innerTitle})"， "_t("default")
}

// 最终 generate 处理后，得到 vm.render =
// new Function (with(this){return _c('section',[_c('header',[_t("title",null,{"title":innerTitle})],2),_v(" "),_c('main',[_t("default")],2),_v(" "),_c('footer',[_t("time")],2)])})

// 然后在 vm._render 调用时，执行 vnode = render.call(vm._renderProxy, vm.$createElement);
// 就会执行 _t 函数，即执行 renderSlot 函数
function installRenderHelpers(target) {
  target._o = markOnce;
  target._n = toNumber;
  target._s = toString;
  target._l = renderList;
  target._t = renderSlot;
  target._q = looseEqual;
  target._i = looseIndexOf;
  target._m = renderStatic;
  target._f = resolveFilter;
  target._k = checkKeyCodes;
  target._b = bindObjectProps;
  target._v = createTextVNode;
  target._e = createEmptyVNode;
  target._u = resolveScopedSlots;
  target._g = bindObjectListeners;
  target._d = bindDynamicKeys;
  target._p = prependModifier;
}


/**
 * Runtime helper for rendering <slot>
 * 会返回一个 slot 的 vnode 节点
 */
function renderSlot(
  name, // title
  fallback, // null
  props, // {title: "写在子级的标题"} this.innerTitle 的值 ”写在子级的标题“
  bindObject // nudefined
) {
  var scopedSlotFn = this.$scopedSlots[name];
  var nodes;
  if (scopedSlotFn) { // scoped slot
    props = props || {};
    if (bindObject) {
      if (!isObject(bindObject)) {
        warn(
          'slot v-bind without argument expects an Object',
          this
        );
      }
      props = extend(extend({}, bindObject), props);
    }
    nodes = scopedSlotFn(props) || fallback;
  } else {
    nodes = this.$slots[name] || fallback;
  }

  var target = props && props.slot;
  if (target) {
    return this.$createElement('template', { slot: target }, nodes)
  } else {
    return nodes
  }
}

// 这里的关键是 var scopedSlotFn = this.$scopedSlots[name];  $scopedSlots 保留了父组件所有插槽，是在组件挂载调用 vm._render函数初始化完成的
// this.$scopedSlot 属性从哪获取到，即涉及到父组件中关于插槽的使用部分的解析
//  <template v-slot:title="slotProp">{{ slotProp.title }}</template>
// 解析函数的路径同样：$mount => createToFunction => baseCompiler => parse => parseHTML => parseStartTag => handleStartTag => options.start => closeElement => processElement => processSlotContent

// options.start 调用 createASTElement(tag, attrs, currentParent)
ASTElement = {
  tag: 'template',
  type: 1,
  attrsList: [
    { name: 'v-slot:title', value: 'slotProp' start, end }
  ],
  attrsMap: { 'v-slot:title': 'slotProp' },
  parent: customSection_vnode，
  children: [
    {
      text: "{{ slotProp.title }}",
      expression: "_s(slotProp.title)",
      type: 2,
      start: 65,
      end: 85
    }
  ],
  start: 31,
  end: 65
}

// 生成 ASTElement 之后调用 closeElement => processElement => processSlotContent
// handle content being passed to a component as slot,
// e.g. <template slot="xxx">, <div slot-scope="xxx">，
// vue 2.6 增加 v-slot 语法：e.g. <template v-slot:title="slotProp">{{ slotProp.title }}</template>
function processSlotContent(el) {
  var slotScope;
  // scope slot-scope 都是 v-slot 语法出现之前的语法
  if (el.tag === 'template') {
    slotScope = getAndRemoveAttr(el, 'scope');
    /* istanbul ignore if */
    if (slotScope) {
      warn$2(
        "the \"scope\" attribute for scoped slots have been deprecated and " +
        "replaced by \"slot-scope\" since 2.5. The new \"slot-scope\" attribute " +
        "can also be used on plain elements in addition to <template> to " +
        "denote scoped slots.",
        el.rawAttrsMap['scope'],
        true
      );
    }
    el.slotScope = slotScope || getAndRemoveAttr(el, 'slot-scope');
  } else if ((slotScope = getAndRemoveAttr(el, 'slot-scope'))) {
    /* istanbul ignore if */
    if (el.attrsMap['v-for']) {
      warn$2(
        "Ambiguous combined usage of slot-scope and v-for on <" + (el.tag) + "> " +
        "(v-for takes higher priority). Use a wrapper <template> for the " +
        "scoped slot to make it clearer.",
        el.rawAttrsMap['slot-scope'],
        true
      );
    }
    el.slotScope = slotScope;
  }

  // slot="xxx"
  var slotTarget = getBindingAttr(el, 'slot');
  if (slotTarget) {
    el.slotTarget = slotTarget === '""' ? '"default"' : slotTarget;
    el.slotTargetDynamic = !!(el.attrsMap[':slot'] || el.attrsMap['v-bind:slot']);
    // preserve slot as an attribute for native shadow DOM compat
    // only for non-scoped slots.
    if (el.tag !== 'template' && !el.slotScope) {
      addAttr(el, 'slot', slotTarget, getRawBindingAttr(el, 'slot'));
    }
  }

  // 2.6 v-slot syntax
  // <template v-slot:title="slotProp">{{ slotProp.title }}</template>
  // ASTElement 元素的 attrsList = {name: "v-slot:title", value: "slotProp", start: 41, end: 64}
  //                   attrsMap = {"v-slot:title", "slotProp"}
  {
    if (el.tag === 'template') {
      // v-slot on <template>
      var slotBinding = getAndRemoveAttrByRegex(el, slotRE); //  var slotRE = /^v-slot(:|$)|^#/;
      if (slotBinding) { // slotBinding = {name: "v-slot:title", value: "slotProp", start: 41, end: 64}
        {
          if (el.slotTarget || el.slotScope) {
            warn$2(
              "Unexpected mixed usage of different slot syntaxes.",
              el
            );
          }
          if (el.parent && !maybeComponent(el.parent)) {
            warn$2(
              "<template v-slot> can only appear at the root level inside " +
              "the receiving component",
              el
            );
          }
        }
        var ref = getSlotName(slotBinding); // ref={name: ""title"", dynamic: false}
        var name = ref.name;  // name='"title"'
        var dynamic = ref.dynamic; // false
        // 此时将插槽相关信息赋值到 ASTElement 对象属性上，这些属性会在子组件 <slot name="title" :title="innerTitle"></slot> 在 proecessSlotContent 上会用到
        el.slotTarget = name;
        el.slotTargetDynamic = dynamic;
        el.slotScope = slotBinding.value || emptySlotScopeToken; // force it into a scoped slot for perf
      }
    } else {
      // v-slot on component, denotes default slot
      // 当插槽只有默认插槽时，可以将 v-slot 写在父组件上
      // e.g. <child v-slot="slotProp"></child>,<child #default="slotProp"></child>
      var slotBinding$1 = getAndRemoveAttrByRegex(el, slotRE);
      if (slotBinding$1) {
        {
          if (!maybeComponent(el)) {
            warn$2(
              "v-slot can only be used on components or <template>.",
              slotBinding$1
            );
          }
          if (el.slotScope || el.slotTarget) {
            warn$2(
              "Unexpected mixed usage of different slot syntaxes.",
              el
            );
          }
          if (el.scopedSlots) {
            warn$2(
              "To avoid scope ambiguity, the default slot should also use " +
              "<template> syntax when there are other named slots.",
              slotBinding$1
            );
          }
        }
        // add the component's children to its default slot
        var slots = el.scopedSlots || (el.scopedSlots = {});
        var ref$1 = getSlotName(slotBinding$1);
        var name$1 = ref$1.name;
        var dynamic$1 = ref$1.dynamic;
        var slotContainer = slots[name$1] = createASTElement('template', [], el);
        slotContainer.slotTarget = name$1;
        slotContainer.slotTargetDynamic = dynamic$1;
        slotContainer.children = el.children.filter(function (c) {
          if (!c.slotScope) {
            c.parent = slotContainer;
            return true
          }
        });
        slotContainer.slotScope = slotBinding$1.value || emptySlotScopeToken;
        // remove children as they are returned from scopedSlots now
        el.children = [];
        // mark el non-plain so data gets generated
        el.plain = false;
      }
    }
  }
}

/**
 * slotRE = /^v-slot(:|$)|^#/;
 * @param {*} binding e.g. {name: "v-slot:title", value: "slotProp", start: 41, end: 64}
 */
function getSlotName(binding) {
  var name = binding.name.replace(slotRE, ''); // title
  if (!name) {
    // 默认插槽调用 <template>这是默认插槽内容</template>
    // binding.name = undefined 即赋值为 default
    if (binding.name[0] !== '#') {
      name = 'default';
    } else {
      warn$2(
        "v-slot shorthand syntax requires a slot name.",
        binding
      );
    }
  }
  return dynamicArgRE.test(name) // var dynamicArgRE = /^\[.*\]$/;
    // dynamic [name]
    ? { name: name.slice(1, -1), dynamic: true }
    // static name
    : { name: ("\"" + name + "\""), dynamic: false }
}

// 每个插槽元素 teplate 编译结束后，在 closeElement 建立父子关系前：
function closeElement(element) {
  element = processElement

  // 省略代码

  // 建立父子嵌套关系
  if (currentParent && !element.forbidden) {
    if (element.elseif || element.else) {
      processIfConditions(element, currentParent);
    } else {
      if (element.slotScope) { // 只有具名插槽或作用域插槽才会有 slotScope 函数。所以此步骤只处理这两中插槽，默认插槽内容存储在组件的子节点 children，会在组件初始化时合并配置中处理到 vm.slots 中
        // 如果此时组件是插槽元素，即存储 slotScope，需要向父组件添加 scopedSlots
        var name = element.slotTarget || '"default"';  // v-slot="slotProp"，此时命名为 default
        (currentParent.scopedSlots || (currentParent.scopedSlots = {}))[name] = element;
      }
      currentParent.children.push(element);
      element.parent = currentParent;
    }
  }
}

// 此时在 parse 完成包含插槽的组件解析后生成的组件 ASTElemnt 对象：
ASTElemnt_component = {
  tag:'custom-section',
  type: 1,
  attrsList: [],
  attrsMap: {},
  childrend: [template_vnode,...],
  rawAttrsMap: {},
  scopedSlots: {
    'title': title_vnode,
    'time': time_vnode
  }
}

// 然后将 ast 传入 generate 函数调用 generate => genElement => genData => genScopedSlots
function genScopedSlots (
  el,
  slots,
  state
) {
  // by default scoped slots are considered "stable", this allows child
  // components with only scoped slots to skip forced updates from parent.
  // but in some cases we have to bail-out of this optimization
  // for example if the slot contains dynamic names, has v-if or v-for on them...
  var needsForceUpdate = el.for || Object.keys(slots).some(function (key) {
    var slot = slots[key];
    return (
      slot.slotTargetDynamic ||
      slot.if ||
      slot.for ||
      containsSlotChild(slot) // is passing down slot from parent which may be dynamic
    )
  });

  // #9534: if a component with scoped slots is inside a conditional branch,
  // it's possible for the same component to be reused but with different
  // compiled slot content. To avoid that, we generate a unique key based on
  // the generated code of all the slot contents.
  var needsKey = !!el.if;

  // OR when it is inside another scoped slot or v-for (the reactivity may be
  // disconnected due to the intermediate scope variable)
  // #9438, #9506
  // TODO: this can be further optimized by properly analyzing in-scope bindings
  // and skip force updating ones that do not actually use scope variables.
  if (!needsForceUpdate) {
    var parent = el.parent;
    while (parent) {
      if (
        (parent.slotScope && parent.slotScope !== emptySlotScopeToken) ||
        parent.for
      ) {
        needsForceUpdate = true;
        break
      }
      if (parent.if) {
        needsKey = true;
      }
      parent = parent.parent;
    }
  }

  var generatedSlots = Object.keys(slots)
    .map(function (key) { return genScopedSlot(slots[key], state); })
    .join(',');

  return ("scopedSlots:_u([" + generatedSlots + "]" + (needsForceUpdate ? ",null,true" : "") + (!needsForceUpdate && needsKey ? (",null,false," + (hash(generatedSlots))) : "") + ")")
}

// 注意此时 genScopedSlot
function genScopedSlot ( el,  state) {
  var isLegacySyntax = el.attrsMap['slot-scope'];
  if (el.if && !el.ifProcessed && !isLegacySyntax) {
    return genIf(el, state, genScopedSlot, "null")
  }
  if (el.for && !el.forProcessed) {
    return genFor(el, state, genScopedSlot)
  }
  // slotScope = "slotProp"
  var slotScope = el.slotScope === emptySlotScopeToken ? "" : String(el.slotScope);
  
  // 将具名插槽或作用域插槽包装成执行函数：fn = "function(slotProp){return [_v(_s(slotProp.title))]}"
  var fn = "function(" + slotScope + "){" +
    "return " + (el.tag === 'template'
      ? el.if && isLegacySyntax
        ? ("(" + (el.if) + ")?" + (genChildren(el, state) || 'undefined') + ":undefined")
        : genChildren(el, state) || 'undefined'
      : genElement(el, state)) + "}";
  // reverse proxy v-slot without scope on this.$slots
  var reverseProxy = slotScope ? "" : ",proxy:true";
  return ("{key:" + (el.slotTarget || "\"default\"") + ",fn:" + fn + reverseProxy + "}")
}

// 此时在父组件完成模板编译 generate 函数生成的代码字符串：
with (this) { 
  return _c('custom-section', { 
    scopedSlots: _u([
      { key: "title", fn: function (slotProp) { return [_v(_s(slotProp.title))] } },
      { key: "time", fn: function () { return [_v("2019-5-26")] }, proxy: true }
    ]) 
  }, 
  [_v(" "), [_v("这是段落正文部分，内容很长，这里就省略了......")]],
  2)
}

// 父组件 customSectiion 完成编译，调用 vm._render，执行 createElement 函数（_c)

function _createElement (
  context,
  tag,
  data,
  children,
  normalizationType
) {
  // 省略代码...
  if (typeof tag === 'string') {
    var Ctor;
    if (config.isReservedTag(tag)) {
      // platform built-in elements
      if (isDef(data) && isDef(data.nativeOn)) {
        warn(
          ("The .native modifier for v-on is only valid on components but it was used on <" + tag + ">."),
          context
        );
      }
      vnode = new VNode(
        config.parsePlatformTagName(tag), data, children,
        undefined, undefined, context
      );
    } else if ((!data || !data.pre) && isDef(Ctor = resolveAsset(context.$options, 'components', tag))) {
      // 因为 customSelection 是一个组件，可以从 vm.$optioins.components = {customSection} 拿到组件的 export default 导出的 options 对象,或者直接是一个组件的构造函数
      // 本例传入的是 Vue.extend()的结果，即组件构造函数
      // component
      vnode = createComponent(Ctor, data, context, children, tag);
    } else {
      // unknown or unlisted namespaced elements
      // check at runtime because it may get assigned a namespace when its
      // parent normalizes children
      vnode = new VNode( tag, data, children, undefined, undefined, context );
    }
  } else {
    // direct component options / constructor
    vnode = createComponent(tag, data, context, children);
  }
  if (Array.isArray(vnode)) {
    return vnode
  } else if (isDef(vnode)) {
    if (isDef(ns)) { applyNS(vnode, ns); }
    if (isDef(data)) { registerDeepBindings(data); }
    return vnode
  } else {
    return createEmptyVNode()
  }
}

function createComponent(Ctor,  data,  context,  children,  tag) {
  // 省略代码

  // 在 createComponent 中安装组件钩子函数，包括将来在 vm.update 中调用的 init 函数
  installComponentHooks(data);

  var vnode = new VNode(
    ("vue-component-" + (Ctor.cid) + (name ? ("-" + name) : '')),
    data, undefined, undefined, undefined, context,
    { Ctor: Ctor, propsData: propsData, listeners: listeners, tag: tag, children: children },
    asyncFactory
  );
  return vnode
}


// 调用 createComponent 函数生成组件的 vnode
component_vnode = {
  tag: 'vue-component-1-custom-section',
  data: {
    scopedSlots: {},
  },
  componentOptons: {
    Ctor,
    children: [vnode]
  }
  // 省略
}

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
      var child = vnode.componentInstance = createComponentInstanceForVnode(vnode, activeInstance);
      // 调用挂载函数，会调用 vm._update(vm._render())，开始组件编译和函数过程，然后回到上面开始时处理插槽
      child.$mount(hydrating ? vnode.elm : undefined, hydrating);
    }
  },
  prePatch(...),
  insert(...),
  destory(...),
}

function createComponentInstanceForVnode (
  vnode, // we know it's MountedComponentVNode but flow doesn't
  parent // activeInstance in lifecycle state
) {
  var options = {
    _isComponent: true,
    _parentVnode: vnode, // 父组件的 vnode.data.scopedSlots 对象转移到 options._parentVnode
    parent: parent
  };
  // check inline-template render functions
  var inlineTemplate = vnode.data.inlineTemplate;
  if (isDef(inlineTemplate)) {
    options.render = inlineTemplate.render;
    options.staticRenderFns = inlineTemplate.staticRenderFns;
  }
  return new vnode.componentOptions.Ctor(options)
}

// 之后将组件 vnode 传入 vm._update，调用 crateComponent，执行组件实例化 init()
// vm._update => vm.__patch__ => patch =>createPatchFunction => createElm => createCompoent
function createComponent (vnode, insertedVnodeQueue, parentElm, refElm) {
  // 这里拿到的 vnode.data 是在 vm._render 函数中 createComponent 函数中创建返回的 vnode
  // 其中  installComponentHooks(data) 执行即安装了组件创建的钩子函数 vnode.data.hook
  var i = vnode.data;
  if (isDef(i)) {
    var isReactivated = isDef(vnode.componentInstance) && i.keepAlive;
    // dsDef(i=i.hook)在执行的同时将 i 变为了 hook 对象，同样 isDef(i=i.init)便得最终 i= vnode.data.hook.init 函数
    if (isDef(i = i.hook) && isDef(i = i.init)) {
      // init 函数执行处理了主要处理两件：
      // 1. new vnode.componentOptions.Ctor(options) 
      // 2. child.$mount(hydrating ? vnode.elm : undefined, hydrating); => mountComponent
      // 这样即使得在 createComponent 函数内即触发了组件 wathcer 的生成和组件编译和渲染 vm._update(vm._render())
      i(vnode, false /* hydrating */);
    }
    // after calling the init hook, if the vnode is a child component
    // it should've created a child instance and mounted it. the child
    // component also has set the placeholder vnode's elm.
    // in that case we can just return the element and be done.
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

// 在 init 函数中会执行两步：
// 第一步：createComponentInstanceForVnode = new vnode.componentOptions.Ctor(options) => Sub._init => Vue._init
// 第二步： child.$mount(hydrating ? vnode.elm : undefined, hydrating);，即执行 vm._update(vm._render())，即执行子组件的编译函数
// 第一步中注意 _init 函数执行时，组件选项合并调用 initInternalComponent(vm, options)，这个函数中有关键代码
function initInternalComponent (vm, options) {
  var opts = vm.$options = Object.create(vm.constructor.options);
  // doing this because it's faster than dynamic enumeration.
  var parentVnode = options._parentVnode;
  opts.parent = options.parent;
  opts._parentVnode = parentVnode;

  var vnodeComponentOptions = parentVnode.componentOptions;
  opts.propsData = vnodeComponentOptions.propsData;
  opts._parentListeners = vnodeComponentOptions.listeners;
  // 组件的子节点应该是全部作为默认插槽的内容。因为具名插槽和作用域插槽还在 _parentVnode.data.scopedSlots 中
  opts._renderChildren = vnodeComponentOptions.children; 
  opts._componentTag = vnodeComponentOptions.tag;

  if (options.render) {
    opts.render = options.render;
    opts.staticRenderFns = options.staticRenderFns;
  }
}

// 然后在 _init => initRender 函数中
function initRender (vm) {
  vm._vnode = null; // the root of the child tree
  vm._staticTrees = null; // v-once cached trees
  var options = vm.$options;
  var parentVnode = vm.$vnode = options._parentVnode; // the placeholder node in parent tree
  var renderContext = parentVnode && parentVnode.context;
  vm.$slots = resolveSlots(options._renderChildren, renderContext); // 将默认插槽元素全部定义在 vm.$slots.default 数组中
  vm.$scopedSlots = emptyObject; // 赋值空对象，将在 vm._render 函数中处理为存入具名插槽和作用域插槽的容器
  // 省略代码...
}

function resolveSlots (
  children,
  context
) {
  if (!children || !children.length) {
    return {}
  }
  var slots = {};
  for (var i = 0, l = children.length; i < l; i++) {
    var child = children[i];
    var data = child.data;
    // remove slot attribute if the node is resolved as a Vue slot node
    if (data && data.attrs && data.attrs.slot) {
      delete data.attrs.slot;
    }
    // named slots should only be respected if the vnode was rendered in the
    // same context.
    if ((child.context === context || child.fnContext === context) &&
      data && data.slot != null
    ) {
      var name = data.slot;
      var slot = (slots[name] || (slots[name] = []));
      if (child.tag === 'template') {
        slot.push.apply(slot, child.children || []);
      } else {
        slot.push(child);
      }
    } else {
      // 组件的子元素全部转为默认插槽的内容，定义在 slots.default 数组中
      (slots.default || (slots.default = [])).push(child);
    }
  }
  // ignore slots that contains only whitespace
  for (var name$1 in slots) {
    if (slots[name$1].every(isWhitespace)) {
      delete slots[name$1];
    }
  }
  return slots
}

// 注意 vm._render函数中这段代码
Vue.prototype._render = function () {
  var vm = this;
  var ref = vm.$options;
  var render = ref.render;
  var _parentVnode = ref._parentVnode;

  // 父组件的具名插槽和作用域插槽解析后的数据存储在 _parentVnode.data.scopedSlots 中
  // 以下操作后，子组件可以通过 vm.$scopedSlots 获取父组件上定义的插槽数据，在子组件解析 vm._render 时调用 _t 即 renderSlot 时会用到
  if (_parentVnode) {
    vm.$scopedSlots = normalizeScopedSlots(
      _parentVnode.data.scopedSlots, // 存储着具名插槽和作用域插槽
      vm.$slots, // 存放着默认插槽
      vm.$scopedSlots // 在 initRender 函数中初始化为空对象 {}
    );
  }
  // 经过上面处理，组件插槽的所有内容包括默认、具名、作用域数据都保存在 vm.$scopedSlots
  /**
   * vm.$scopedSlots = {
   *  default: fn,
   *  time: fn,
   *  title: fn
   * }
   */
  
  // set parent vnode. this allows render functions to have access
  // to the data on the placeholder node.
  vm.$vnode = _parentVnode;
  // render self
  var vnode;
  try {
    currentRenderingInstance = vm;
    vnode = render.call(vm._renderProxy, vm.$createElement);
  } catch (e) {
   // 省略代码
  } finally {
    currentRenderingInstance = null;
  }
  // 省略代码
  // set parent
  vnode.parent = _parentVnode;
  return vnode
};