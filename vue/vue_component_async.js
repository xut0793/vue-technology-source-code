// vue 中异步组件注册有三种方式，需要配合 webpack 构造
/**
 * 第一种：组件注册时传入函数
 * Vue.component('async-example', function (resolve, reject) {
   // 这个特殊的 require 语法告诉 webpack, 自动将编译后的代码分割成不同的块， 这些块将通过 Ajax 请求自动下载。
   require(['./my-async-component'], resolve)
})


  第二种：支持 promise 创建异步组件
  Vue.component(
    'async-webpack-example',
    // 该 `import` 函数返回一个 `Promise` 对象。
    () => import('./my-async-component')
  )

  第三种：高级异步组件
  Vue.component('async-example', () => ({
    // 需要加载的组件。应当是一个 Promise
    component: import('./MyComp.vue'),
    // 加载中应当渲染的组件
    loading: LoadingComp,
    // 出错时渲染的组件
    error: ErrorComp,
    // 渲染加载中组件前的等待时间。默认：200ms。
    delay: 200,
    // 最长等待时间。超出此时间则渲染错误组件。默认：Infinity
    timeout: 3000
  }))
 */


// 组件创建函数路径：vm._render => render-function => _createElement => createComponent
function createComponent (
  Ctor,
  data,
  context,
  children,
  tag
) {
  if (isUndef(Ctor)) {
    return
  }

  var baseCtor = context.$options._base;

  // plain options object: turn it into a constructor 普通 export default 导出组件对象时创建组件构造函数
  if (isObject(Ctor)) {
    Ctor = baseCtor.extend(Ctor);
  }

  // if at this stage it's not a constructor or an async component factory,
  // reject.
  if (typeof Ctor !== 'function') {
    {
      warn(("Invalid Component definition: " + (String(Ctor))), context);
    }
    return
  }

  // async component 异步组件解析
  // 正常生成的组件构造函数都有 cid 标识，在 Vue.extend 函数中可以看到。
  // 如果当前传入的 Ctor 即不普通对象，也不是包含 Ctor.cid 的组件构造器，那就当作异步组件函数解析
  var asyncFactory;
  if (isUndef(Ctor.cid)) {
    asyncFactory = Ctor;
    Ctor = resolveAsyncComponent(asyncFactory, baseCtor);
    // resolveAsyncComponent 函数异步处理异步组件的加载，除高级异步组件返回 LoadingComp 组件外，其它情形都返回 undefined，所以会执行下面代码创建一个注释节点占位符
    if (Ctor === undefined) {
      // return a placeholder node for async component, which is rendered
      // as a comment node but preserves all the raw information for the node.
      // the information will be used for async server-rendering and hydration.
      return createAsyncPlaceholder(
        asyncFactory,
        data,
        context,
        children,
        tag
      )
    }
  }

  data = data || {};

  // resolve constructor options in case global mixins are applied after
  // component constructor creation
  resolveConstructorOptions(Ctor);

  // transform component v-model data into props & events
  if (isDef(data.model)) {
    transformModel(Ctor.options, data);
  }

  // extract props
  var propsData = extractPropsFromVNodeData(data, Ctor, tag);

  // functional component
  if (isTrue(Ctor.options.functional)) {
    return createFunctionalComponent(Ctor, propsData, data, context, children)
  }

  // extract listeners, since these needs to be treated as
  // child component listeners instead of DOM listeners
  var listeners = data.on;
  // replace with listeners with .native modifier
  // so it gets processed during parent component patch.
  data.on = data.nativeOn;

  if (isTrue(Ctor.options.abstract)) {
    // abstract components do not keep anything
    // other than props & listeners & slot

    // work around flow
    var slot = data.slot;
    data = {};
    if (slot) {
      data.slot = slot;
    }
  }

  // install component management hooks onto the placeholder node
  installComponentHooks(data);

  // return a placeholder vnode
  var name = Ctor.options.name || tag;
  var vnode = new VNode(
    ("vue-component-" + (Ctor.cid) + (name ? ("-" + name) : '')),
    data, undefined, undefined, undefined, context,
    { Ctor: Ctor, propsData: propsData, listeners: listeners, tag: tag, children: children },
    asyncFactory
  );

  return vnode
}

// 这个函数就相对复杂些，因为要针对上述三种情形注册注册异步组件进行解析
function resolveAsyncComponent (
  factory, // 注册异步组件传入的函数
  baseCtor // Vue 构造函数
) {
  // 已经加载渲染过的异步组件都会在该函数添加静态属性，加载失败的为 factory.error，加载成功 factory.resolved
  // 所以下面两个判断可以确保异步组件在多次调用时只加载一次，再次加载会把保留在静态属性的结果返回
  if (isTrue(factory.error) && isDef(factory.errorComp)) {
    return factory.errorComp
  }

  if (isDef(factory.resolved)) {
    return factory.resolved
  }

  var owner = currentRenderingInstance;
  // 如果异步在加载中，另一个上下文对象也需要加载该异步组件，则将该上下文对象添加到 owners 中，在组件完成异步加载后触发全部上下文更新
  if (owner && isDef(factory.owners) && factory.owners.indexOf(owner) === -1) {
    // already pending
    factory.owners.push(owner);
  }

  // 高级异步组件：如果当前异步组件正在加载，返回传入的加载中组件
  if (isTrue(factory.loading) && isDef(factory.loadingComp)) {
    return factory.loadingComp
  }

  // 首次加载异步组件解析从这里开始
  if (owner && !isDef(factory.owners)) {
    var owners = factory.owners = [owner];
    var sync = true;
    var timerLoading = null;
    var timerTimeout = null;

    owner.$on('hook:destroyed', function () { return remove(owners, owner); });

    var forceRender = function (renderCompleted) {
      for (var i = 0, l = owners.length; i < l; i++) {
        (owners[i]).$forceUpdate();
      }

      if (renderCompleted) {
        owners.length = 0;
        if (timerLoading !== null) {
          clearTimeout(timerLoading);
          timerLoading = null;
        }
        if (timerTimeout !== null) {
          clearTimeout(timerTimeout);
          timerTimeout = null;
        }
      }
    };

    /**
     * Ensure a function is called only once.
     * 使用闭包确保函数 fn 只被调用一次
      function once (fn) {
        var called = false;
        return function () {
          if (!called) {
            called = true;
            fn.apply(this, arguments);
          }
        }
      }
     */
    var resolve = once(function (res) {
      // cache resolved
      factory.resolved = ensureCtor(res, baseCtor);
      // invoke callbacks only if this is not a synchronous resolve
      // (async resolves are shimmed as synchronous during SSR)
      if (!sync) {
        // 此时异步组件已经请求完成返回，并把请求组件构造函数赋值到工厂函数的 resolve中
        // 此时强制触发使用异步组件的父组件重新渲染，当再次解析到该函数时，在前面的 if (isDef(factory.resolved)) { return factory.resolved } 返回上次解析的结果
        forceRender(true);
      } else {
        owners.length = 0;
      }
    });

    var reject = once(function (reason) {
      warn(
        "Failed to resolve async component: " + (String(factory)) +
        (reason ? ("\nReason: " + reason) : '')
      );
      // 同理，跟 reslove 一样，只不过当父组件再次渲染时返回异步组件加载失败的结果。
      if (isDef(factory.errorComp)) {
        factory.error = true;
        forceRender(true);
      }
    });

    // 调用注册异步组件时传入的 factory，并将封装的 resolve ,reject 作为实参，
    /**
     * 第一种：functin(resolve, reject) { require(['./my-async-component'], resolve)} 会触发 webapck 的 require API，在编译后生产环境会发起网络请求资源
     * 第二种： () => import('./my-async-component') 调用会返回一个 Promise 对象 ，这是 import() 不是ES 原生API, 是webpack 2+ 支持了异步加载的语法糖
     * 第三种： () => {component: import('./my-async-component), loading: LoadingComp, error: ErrorComp, delay: 200, timeout: 3000}
     */
    var res = factory(resolve, reject);

    if (isObject(res)) {
      if (isPromise(res)) {
        // () => Promise 对应第二种方式注册异步函数
        if (isUndef(factory.resolved)) {
          res.then(resolve, reject);
        }
      } else if (isPromise(res.component)) { 
        // 对应第三种注册异步组件的解析
        res.component.then(resolve, reject);

        if (isDef(res.error)) {
          factory.errorComp = ensureCtor(res.error, baseCtor);
        }

        if (isDef(res.loading)) {
          factory.loadingComp = ensureCtor(res.loading, baseCtor);
          if (res.delay === 0) {
            // 异步组件加载请求中
            factory.loading = true;
          } else {
            timerLoading = setTimeout(function () {
              timerLoading = null;
              if (isUndef(factory.resolved) && isUndef(factory.error)) {
                factory.loading = true;
                forceRender(false);
              }
            }, res.delay || 200);
          }
        }

        if (isDef(res.timeout)) {
          timerTimeout = setTimeout(function () {
            timerTimeout = null;
            if (isUndef(factory.resolved)) {
              reject(
                "timeout (" + (res.timeout) + "ms)"
              );
            }
          }, res.timeout);
        }
      }
    }

    sync = false;
    // return in case resolved synchronously
    return factory.loading
      ? factory.loadingComp
      : factory.resolved
  }
}

function ensureCtor (comp, base) {
  if (
    comp.__esModule ||
    (hasSymbol && comp[Symbol.toStringTag] === 'Module')
  ) {
    comp = comp.default;
  }
  // 异步组件网络请求返回结果，如果是对象，需要使用 Vue.extend 处理成组件构造函数，如果请求下来的就是组件构造函数，则直接返回
  return isObject(comp)
    ? base.extend(comp)
    : comp
}

function createAsyncPlaceholder (
  factory,
  data,
  context,
  children,
  tag
) {
  var node = createEmptyVNode();
  node.asyncFactory = factory;
  node.asyncMeta = { data: data, context: context, children: children, tag: tag };
  return node
}

/**
 * 异步组件实现的本质是触使父组件 二 次渲染，
 * 除了 0 delay 的高级异步组件第一次直接渲染成 loading 组件外，
 * 其它都是第一次渲染生成一个注释节点，
 * 当异步获取组件成功后，再通过调用 parent.forceRender 强制父组件重新渲染，这样就能正确渲染出我们异步加载的子组件了。
 */