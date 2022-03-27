/**
 * 二、初始化阶段
 * 主要是创建 renderer 的两类函数：
 * 1. createRenderer
 * 2. createBundleRenderer
 * 
 * server.js 中会在node启动时初始化一个 renderer 单例对象
 */

/**
 * 1. createRenderer
 * 函数可以接受对象传入 template
 */
const vueServerRenderer = require('vue-server-renderer')
const template = fs.readFileSync('./index.template.html', 'utf-8')
const rendererWithTemplate = vueServerRenderer.createRenderer({
  template: template
})

/**
 * 2. createBundleRenderer
 * 函数接受两个参数，serverBundle 内容和 options 配置
 */
const template = fs.readFileSync(path.join(process.cwd(), './index.template.html'), 'utf-8')
const serverBundle = require('./dist/server/vue-ssr-server-bundle.json')
const clientManifest = require('./dist/client/vue-ssr-client-manifest.json')
const renderer = VueServerRenderer.createBundleRenderer(serverBundle, {
  runInNewContext: false,
  inject: true,
  template,
  clientManifest
})

/**
 * vue-server-renderer 相关源码
 */

/**
 * vue-server-renderer 入口
 * const vueServerRenderer = require('vue-server-renderer')
 * 
 */
process.env.VUE_ENV = 'server';

function createRenderer$1 (options) {
  if ( options === void 0 ) options = {};

  return createRenderer(extend(extend({}, options), {
    isUnaryTag: isUnaryTag,
    canBeLeftOpenTag: canBeLeftOpenTag,
    modules: modules,
    directives: extend(baseDirectives, options.directives)
  }))
}

var createBundleRenderer = createBundleRendererCreator(createRenderer$1);

exports.createRenderer = createRenderer$1;
exports.createBundleRenderer = createBundleRenderer;

/**
 * createBundleRendererCreator 包装函数
 */
function createBundleRendererCreator (createRenderer) {

  return function createBundleRenderer ( bundle,  rendererOptions  ) {
    if ( rendererOptions === void 0 ) rendererOptions = {};

    var files, entry, maps;
    var basedir = rendererOptions.basedir;

    // load bundle if given filepath
    if (
      typeof bundle === 'string' &&
      /\.js(on)?$/.test(bundle) &&
      path$2.isAbsolute(bundle) // var path$2 = require('path');
    ) {
      if (fs.existsSync(bundle)) {
        var isJSON = /\.json$/.test(bundle);
        basedir = basedir || path$2.dirname(bundle);
        bundle = fs.readFileSync(bundle, 'utf-8');
        if (isJSON) {
          try {
            bundle = JSON.parse(bundle);
          } catch (e) {
            throw new Error(("Invalid JSON bundle file: " + bundle))
          }
        }
      } else {
        throw new Error(("Cannot locate bundle file: " + bundle))
      }
    }

    /**
     * server bundle
     * { 
     *    "entry": "static/js/app.80f0e94fe005dfb1b2d7.js", 
     *    "files": { 
     *       "app.80f0e94fe005dfb1b2d7.js": "module.exports=function(t...", // 所有服务端运行的代码
     *  } 
     */
    if (typeof bundle === 'object') {
      entry = bundle.entry;
      files = bundle.files;

      basedir = basedir || bundle.basedir;
      maps = createSourceMapConsumers(bundle.maps);

      if (typeof entry !== 'string' || typeof files !== 'object') {
        throw new Error(INVALID_MSG)
      }

    } else if (typeof bundle === 'string') {
      entry = '__vue_ssr_bundle__';
      files = { '__vue_ssr_bundle__': bundle };
      maps = {};
    } else {
      throw new Error(INVALID_MSG)
    }

    var renderer = createRenderer(rendererOptions);
    /**
     * 这里创建的 run 就代替了我们在 server.js 手动执行 createApp(context) 代码的关键。
     */
    var run = createBundleRunner(
      entry,
      files,
      basedir,
      rendererOptions.runInNewContext
    );

    return {
      renderToString: function (context, cb) {
        // 省略到 渲染阶段分析
      },

      renderToStream: function (context) {
        // 省略到 渲染阶段分析
      }
    }
  }
}


/**
 * 共用的核心： createRenderer 
 * 
 * 关键代码：生成 render templateRenderer
 */
function createRenderer (ref) {
  if ( ref === void 0 ) ref = {};
  var modules = ref.modules; if ( modules === void 0 ) modules = [];
  var directives = ref.directives; if ( directives === void 0 ) directives = {};
  var isUnaryTag = ref.isUnaryTag; if ( isUnaryTag === void 0 ) isUnaryTag = (function () { return false; });
  var template = ref.template;
  var inject = ref.inject;
  var cache = ref.cache;
  var shouldPreload = ref.shouldPreload;
  var shouldPrefetch = ref.shouldPrefetch;
  var clientManifest = ref.clientManifest;
  var serializer = ref.serializer;

  var render = createRenderFunction(modules, directives, isUnaryTag, cache);
  var templateRenderer = new TemplateRenderer({
    template: template,
    inject: inject,
    shouldPreload: shouldPreload,
    shouldPrefetch: shouldPrefetch,
    clientManifest: clientManifest,
    serializer: serializer
  });

  return {
    renderToString: function renderToString (component, context, cb ) {
      // 省略到 渲染阶段分析
    },

    renderToStream: function renderToStream (component, context ) {
      // 省略到 渲染阶段分析
    }
  }
}

/**
 * var render = createRenderFunction(modules, directives, isUnaryTag, cache);
 * 这里五步：
 */
function createRenderFunction ( modules, directives, isUnaryTag, cache) {
  return function render ( component, write, userContext, done ) {
    warned = Object.create(null);

    // 1. 生成渲染上下文
    var context = new RenderContext({
      activeInstance: component,
      userContext: userContext,
      write: write, 
      done: done, 
      renderNode: renderNode,
      modules: modules, 
      isUnaryTag: isUnaryTag, 
      directives: directives,
      cache: cache
    });

    // 2. 安装服务端渲染的工具函数
    installSSRHelpers(component);
    //3. 编译组件生成 $options.render 属性，即生成 compiled 编译模板，生成$options.render 和 $options.staticRenderFns，同 Vue 源码编译阶段一样 
    normalizeRender(component);

    var resolve = function () { 
      // 5. 渲染组件，比较下 vue 源码： vm._update(vm._render(), hydrating), 差异就是 _update 过程，即 patch 过程
      // Vue.prototype._render 关键代码就是执行编译生成的渲染函数，即 with 语句
      // vnode = component.$options.render.call(vm, vm.$createElement);
      renderNode(component._render(), true, context);
    };
    // 4. 等待组件 serverPrefetch 执行，获取组件依赖的数据
    waitForServerPrefetch(component, resolve, done);
  }
}

/**
 * 1. 生成渲染上下文
 */
var RenderContext = function RenderContext (options) {
  this.userContext = options.userContext;
  this.activeInstance = options.activeInstance;
  this.renderStates = [];

  this.write = options.write;
  this.done = options.done;
  this.renderNode = options.renderNode;

  this.isUnaryTag = options.isUnaryTag;
  this.modules = options.modules;
  this.directives = options.directives;

  var cache = options.cache;
  if (cache && (!cache.get || !cache.set)) {
    throw new Error('renderer cache must implement at least get & set.')
  }
  this.cache = cache;
  this.get = cache && normalizeAsync(cache, 'get');
  this.has = cache && normalizeAsync(cache, 'has');

  this.next = this.next.bind(this);
};

RenderContext.prototype.next = function next () {
  // eslint-disable-next-line
  while (true) {
    var lastState = this.renderStates[this.renderStates.length - 1];
    if (isUndef(lastState)) {
      return this.done()
    }
    /* eslint-disable no-case-declarations */
    switch (lastState.type) {
      case 'Element':
      case 'Fragment':
        var children = lastState.children;
      var total = lastState.total;
        var rendered = lastState.rendered++;
        if (rendered < total) {
          return this.renderNode(children[rendered], false, this)
        } else {
          this.renderStates.pop();
          if (lastState.type === 'Element') {
            return this.write(lastState.endTag, this.next)
          }
        }
        break
      case 'Component':
        this.renderStates.pop();
        this.activeInstance = lastState.prevActive;
        break
      case 'ComponentWithCache':
        this.renderStates.pop();
        var buffer = lastState.buffer;
        var bufferIndex = lastState.bufferIndex;
        var componentBuffer = lastState.componentBuffer;
        var key = lastState.key;
        var result = {
          html: buffer[bufferIndex],
          components: componentBuffer[bufferIndex]
        };
        this.cache.set(key, result);
        if (bufferIndex === 0) {
          // this is a top-level cached component,
          // exit caching mode.
          this.write.caching = false;
        } else {
          // parent component is also being cached,
          // merge self into parent's result
          buffer[bufferIndex - 1] += result.html;
          var prev = componentBuffer[bufferIndex - 1];
          result.components.forEach(function (c) { return prev.add(c); });
        }
        buffer.length = bufferIndex;
        componentBuffer.length = bufferIndex;
        break
    }
  }
};

/**
 * 2. 安装服务端渲染的工具函数
 */
var ssrHelpers = {
  _ssrEscape: escape,
  _ssrNode: renderStringNode,
  _ssrList: renderStringList,
  _ssrAttr: renderAttr,
  _ssrAttrs: renderAttrs$1,
  _ssrDOMProps: renderDOMProps$1,
  _ssrClass: renderSSRClass,
  _ssrStyle: renderSSRStyle
};

function installSSRHelpers (vm) {
  if (vm._ssrNode) {
    return
  }
  var Vue = vm.constructor;
  // 向上找到根的 vue 构造函数
  while (Vue.super) {
    Vue = Vue.super;
  }
  extend(Vue.prototype, ssrHelpers);
  if (Vue.FunctionalRenderContext) {
    extend(Vue.FunctionalRenderContext.prototype, ssrHelpers);
  }
}

/**
 * 3. 编译组件生成 $options.render 属性，即生成 compiled 编译模板，生成$options.render 和 $options.staticRenderFns，
 * 同 Vue 源码编译阶段一样 
 */
var normalizeRender = function (vm) {
  var ref = vm.$options;
  var render = ref.render;
  var template = ref.template;
  var _scopeId = ref._scopeId;
  if (isUndef(render)) {
    if (template) {
      var compiled = compileToFunctions(template, {
        scopeId: _scopeId,
        warn: onCompilationError
      }, vm);

      vm.$options.render = compiled.render;
      vm.$options.staticRenderFns = compiled.staticRenderFns;
    } else {
      throw new Error(
        ("render function or template not defined in component: " + (vm.$options.name || vm.$options._componentTag || 'anonymous'))
      )
    }
  }
};

/**
 * 4. 等待组件 serverPrefetch 执行，获取组件依赖的数据
 */
function waitForServerPrefetch (vm, resolve, reject) {
  var handlers = vm.$options.serverPrefetch;
  if (isDef(handlers)) {
    if (!Array.isArray(handlers)) { handlers = [handlers]; }
    try {
      var promises = [];
      for (var i = 0, j = handlers.length; i < j; i++) {
        var result = handlers[i].call(vm, vm);
        if (result && typeof result.then === 'function') {
          promises.push(result);
        }
      }
      Promise.all(promises).then(resolve).catch(reject);
      return
    } catch (e) {
      reject(e);
    }
  }
  resolve();
}

/**
 * 5. 渲染组件，比较下 vue 源码： vm._update(vm._render(), hydrating), 差异就是 _update 过程，即 patch 过程
 */
function renderNode (node, isRoot, context) {
  /**
   * 根据节点的类型，使用不同方式处理
   */
  if (node.isString) {
    renderStringNode$1(node, context);
  } else if (isDef(node.componentOptions)) {
    renderComponent(node, isRoot, context);
  } else if (isDef(node.tag)) {
    renderElement(node, isRoot, context);
  } else if (isTrue(node.isComment)) {
    if (isDef(node.asyncFactory)) {
      // async component
      renderAsyncComponent(node, isRoot, context);
    } else {
      context.write(("<!--" + (node.text) + "-->"), context.next);
    }
  } else {
    context.write(
      node.raw ? node.text : escape(String(node.text)),
      context.next
    );
  }
}

/**
 * 5.1 renderStringNode$1
 */
function renderStringNode$1 (el, context) {
  var write = context.write;
  var next = context.next;
  if (isUndef(el.children) || el.children.length === 0) {
    write(el.open + (el.close || ''), next);
  } else {
    var children = el.children;
    context.renderStates.push({
      type: 'Element',
      children: children,
      rendered: 0,
      total: children.length,
      endTag: el.close
    });
    write(el.open, next);
  }
}

/**
 * 5.2 renderComponent
 */
function renderComponent (node, isRoot, context) {
  var write = context.write;
  var next = context.next;
  var userContext = context.userContext;

  // check cache hit
  var Ctor = node.componentOptions.Ctor;
  var getKey = Ctor.options.serverCacheKey;
  var name = Ctor.options.name;
  var cache = context.cache;
  var registerComponent = registerComponentForCache(Ctor.options, write);

  if (isDef(getKey) && isDef(cache) && isDef(name)) {
    var rawKey = getKey(node.componentOptions.propsData);
    if (rawKey === false) {
      renderComponentInner(node, isRoot, context);
      return
    }
    var key = name + '::' + rawKey;
    var has = context.has;
    var get = context.get;
    if (isDef(has)) {
      has(key, function (hit) {
        if (hit === true && isDef(get)) {
          get(key, function (res) {
            if (isDef(registerComponent)) {
              registerComponent(userContext);
            }
            res.components.forEach(function (register) { return register(userContext); });
            write(res.html, next);
          });
        } else {
          renderComponentWithCache(node, isRoot, key, context);
        }
      });
    } else if (isDef(get)) {
      get(key, function (res) {
        if (isDef(res)) {
          if (isDef(registerComponent)) {
            registerComponent(userContext);
          }
          res.components.forEach(function (register) { return register(userContext); });
          write(res.html, next);
        } else {
          renderComponentWithCache(node, isRoot, key, context);
        }
      });
    }
  } else {
    if (isDef(getKey) && isUndef(cache)) {
      warnOnce(
        "[vue-server-renderer] Component " + (Ctor.options.name || '(anonymous)') + " implemented serverCacheKey, " +
        'but no cache was provided to the renderer.'
      );
    }
    if (isDef(getKey) && isUndef(name)) {
      warnOnce(
        "[vue-server-renderer] Components that implement \"serverCacheKey\" " +
        "must also define a unique \"name\" option."
      );
    }
    renderComponentInner(node, isRoot, context);
  }
}

function renderComponentWithCache (node, isRoot, key, context) {
  var write = context.write;
  write.caching = true;
  var buffer = write.cacheBuffer;
  var bufferIndex = buffer.push('') - 1;
  var componentBuffer = write.componentBuffer;
  componentBuffer.push(new Set());
  context.renderStates.push({
    type: 'ComponentWithCache',
    key: key,
    buffer: buffer,
    bufferIndex: bufferIndex,
    componentBuffer: componentBuffer
  });
  renderComponentInner(node, isRoot, context);
}

function renderComponentInner (node, isRoot, context) {
  var prevActive = context.activeInstance;
  // expose userContext on vnode
  node.ssrContext = context.userContext;
  var child = context.activeInstance = createComponentInstanceForVnode(
    node,
    context.activeInstance
  );
  normalizeRender(child);

  var resolve = function () {
    var childNode = child._render();
    childNode.parent = node;
    context.renderStates.push({
      type: 'Component',
      prevActive: prevActive
    });
    // 递归处理子组件
    renderNode(childNode, isRoot, context);
  };

  var reject = context.done;

  waitForServerPrefetch(child, resolve, reject);
}
 /**
 * 5.3 renderElement
 */
function renderElement (el, isRoot, context) {
  var write = context.write;
  var next = context.next;

  if (isTrue(isRoot)) {
    if (!el.data) { el.data = {}; }
    if (!el.data.attrs) { el.data.attrs = {}; }
    el.data.attrs[SSR_ATTR] = 'true';
  }

  if (el.fnOptions) {
    registerComponentForCache(el.fnOptions, write);
  }

  var startTag = renderStartingTag(el, context);
  var endTag = "</" + (el.tag) + ">";
  if (context.isUnaryTag(el.tag)) {
    write(startTag, next);
  } else if (isUndef(el.children) || el.children.length === 0) {
    write(startTag + endTag, next);
  } else {
    var children = el.children;
    context.renderStates.push({
      type: 'Element',
      children: children,
      rendered: 0,
      total: children.length,
      endTag: endTag
    });
    write(startTag, next);
  }
}

 /**
 * 5.3 renderAsyncComponent
 */
function renderAsyncComponent (node, isRoot, context) {
  var factory = node.asyncFactory;

  var resolve = function (comp) {
    if (comp.__esModule && comp.default) {
      comp = comp.default;
    }
    var ref = node.asyncMeta;
    var data = ref.data;
    var children = ref.children;
    var tag = ref.tag;
    var nodeContext = node.asyncMeta.context;
    var resolvedNode = createComponent(
      comp,
      data,
      nodeContext,
      children,
      tag
    );
    if (resolvedNode) {
      if (resolvedNode.componentOptions) {
        // normal component
        renderComponent(resolvedNode, isRoot, context);
      } else if (!Array.isArray(resolvedNode)) {
        // single return node from functional component
        renderNode(resolvedNode, isRoot, context);
      } else {
        // multiple return nodes from functional component
        context.renderStates.push({
          type: 'Fragment',
          children: resolvedNode,
          rendered: 0,
          total: resolvedNode.length
        });
        context.next();
      }
    } else {
      // invalid component, but this does not throw on the client
      // so render empty comment node
      context.write("<!---->", context.next);
    }
  };

  if (factory.resolved) {
    resolve(factory.resolved);
    return
  }

  var reject = context.done;
  var res;
  try {
    res = factory(resolve, reject);
  } catch (e) {
    reject(e);
  }
  if (res) {
    if (typeof res.then === 'function') {
      res.then(resolve, reject).catch(reject);
    } else {
      // new syntax in 2.3
      var comp = res.component;
      if (comp && typeof comp.then === 'function') {
        comp.then(resolve, reject).catch(reject);
      }
    }
  }
}

 /**
 * 5.4 node.isComment
 */
context.write(("<!--" + (node.text) + "-->"), context.next);

/**
 * 5.5 其它
 */
context.write(node.raw ? node.text : escape(String(node.text)), context.next);