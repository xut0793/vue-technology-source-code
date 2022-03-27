/**
 * new Vuex.Store({
 *  state,
 *  getters,
 *  mutations,
 *  actions,
 *  modules
 * })
 * 
 * 对 new Store 执行 constructor 函数，核心是处理四件事：
 * 1. 初始化模块 this._modules = new ModuleCollection(options)，形成一颗从 root 开始含有 _children 的嵌套树
 * 2. 安装模块 installModule(this, state, [], this._modules.root); 目标就是对模块中的 state、getters、mutations、actions 做初始化工作
 * 3. 初始化和设置 store_vm
 * 4. 如果有插件，安装插件 plugins.forEach(plugin => plugin(this));
 */
class Store {
  constructor (options = {}) {
    // Auto install if it is not done yet and `window` has `Vue`.
    // To allow users to avoid auto-installation in some cases,
    // this code should be placed here. See #731
    // <script src=""></script>引入vue 和 vuex 时自动注册
    if (!Vue && typeof window !== 'undefined' && window.Vue) {
      install(window.Vue);
    }

    {
      assert(Vue, `must call Vue.use(Vuex) before creating a store instance.`);
      assert(typeof Promise !== 'undefined', `vuex requires a Promise polyfill in this browser.`);
      assert(this instanceof Store, `store must be called with the new operator.`);
    }

    const {
      plugins = [],
      strict = false
    } = options;

    // store internal state
    this._committing = false;
    this._actions = Object.create(null);
    this._actionSubscribers = [];
    this._mutations = Object.create(null);
    this._wrappedGetters = Object.create(null);
    this._modules = new ModuleCollection(options); // 形成一颗含有 _children 的嵌套树：this._modules = {root: {runtime:false, state, _rawModule, _children: {moduleA: {...}}}}
    this._modulesNamespaceMap = Object.create(null);
    this._subscribers = [];
    this._watcherVM = new Vue();
    this._makeLocalGettersCache = Object.create(null);

    // bind commit and dispatch to self
    const store = this;
    const { dispatch, commit } = this;
    this.dispatch = function boundDispatch (type, payload) {
      return dispatch.call(store, type, payload)
    };
    this.commit = function boundCommit (type, payload, options) {
      return commit.call(store, type, payload, options)
    };

    // strict mode
    this.strict = strict;

    const state = this._modules.root.state;

    // init root module.
    // this also recursively registers all sub-modules
    // and collects all module getters inside this._wrappedGetters
    installModule(this, state, [], this._modules.root);

    // initialize the store vm, which is responsible for the reactivity
    // (also registers _wrappedGetters as computed properties)
    resetStoreVM(this, state);

    // apply plugins
    plugins.forEach(plugin => plugin(this));

    const useDevtools = options.devtools !== undefined ? options.devtools : Vue.config.devtools;
    if (useDevtools) {
      devtoolPlugin(this);
    }
  }

  get state () {
    return this._vm._data.$$state
  }

  set state (v) {
    {
      assert(false, `use store.replaceState() to explicit replace store state.`);
    }
  }

  commit (_type, _payload, _options) {
    // check object-style commit
    const {
      type,
      payload,
      options
    } = unifyObjectStyle(_type, _payload, _options);

    const mutation = { type, payload };
    const entry = this._mutations[type];
    if (!entry) {
      {
        console.error(`[vuex] unknown mutation type: ${type}`);
      }
      return
    }
    this._withCommit(() => {
      entry.forEach(function commitIterator (handler) {
        handler(payload);
      });
    });

    this._subscribers
      .slice() // shallow copy to prevent iterator invalidation if subscriber synchronously calls unsubscribe
      .forEach(sub => sub(mutation, this.state));

    if (
      
      options && options.silent
    ) {
      console.warn(
        `[vuex] mutation type: ${type}. Silent option has been removed. ` +
        'Use the filter functionality in the vue-devtools'
      );
    }
  }

  dispatch (_type, _payload) {
    // check object-style dispatch
    const {
      type,
      payload
    } = unifyObjectStyle(_type, _payload);

    const action = { type, payload };
    const entry = this._actions[type];
    if (!entry) {
      {
        console.error(`[vuex] unknown action type: ${type}`);
      }
      return
    }

    try {
      this._actionSubscribers
        .slice() // shallow copy to prevent iterator invalidation if subscriber synchronously calls unsubscribe
        .filter(sub => sub.before)
        .forEach(sub => sub.before(action, this.state));
    } catch (e) {
      {
        console.warn(`[vuex] error in before action subscribers: `);
        console.error(e);
      }
    }

    const result = entry.length > 1
      ? Promise.all(entry.map(handler => handler(payload)))
      : entry[0](payload);

    return new Promise((resolve, reject) => {
      result.then(res => {
        try {
          this._actionSubscribers
            .filter(sub => sub.after)
            .forEach(sub => sub.after(action, this.state));
        } catch (e) {
          {
            console.warn(`[vuex] error in after action subscribers: `);
            console.error(e);
          }
        }
        resolve(res);
      }, error => {
        try {
          this._actionSubscribers
            .filter(sub => sub.error)
            .forEach(sub => sub.error(action, this.state, error));
        } catch (e) {
          {
            console.warn(`[vuex] error in error action subscribers: `);
            console.error(e);
          }
        }
        reject(error);
      });
    })
  }

  subscribe (fn, options) {
    return genericSubscribe(fn, this._subscribers, options)
  }

  subscribeAction (fn, options) {
    const subs = typeof fn === 'function' ? { before: fn } : fn;
    return genericSubscribe(subs, this._actionSubscribers, options)
  }

  watch (getter, cb, options) {
    {
      assert(typeof getter === 'function', `store.watch only accepts a function.`);
    }
    return this._watcherVM.$watch(() => getter(this.state, this.getters), cb, options)
  }

  replaceState (state) {
    this._withCommit(() => {
      this._vm._data.$$state = state;
    });
  }

  registerModule (path, rawModule, options = {}) {
    if (typeof path === 'string') path = [path];

    {
      assert(Array.isArray(path), `module path must be a string or an Array.`);
      assert(path.length > 0, 'cannot register the root module by using registerModule.');
    }

    this._modules.register(path, rawModule);
    installModule(this, this.state, path, this._modules.get(path), options.preserveState);
    // reset store to update getters...
    resetStoreVM(this, this.state);
  }

  unregisterModule (path) {
    if (typeof path === 'string') path = [path];

    {
      assert(Array.isArray(path), `module path must be a string or an Array.`);
    }

    this._modules.unregister(path);
    this._withCommit(() => {
      const parentState = getNestedState(this.state, path.slice(0, -1));
      Vue.delete(parentState, path[path.length - 1]);
    });
    resetStore(this);
  }

  hasModule (path) {
    if (typeof path === 'string') path = [path];

    {
      assert(Array.isArray(path), `module path must be a string or an Array.`);
    }

    return this._modules.isRegistered(path)
  }

  hotUpdate (newOptions) {
    this._modules.update(newOptions);
    resetStore(this, true);
  }

  _withCommit (fn) {
    const committing = this._committing;
    this._committing = true;
    fn();
    this._committing = committing;
  }
}

/**
 * 1. 初始化模块 this._modules = new ModuleCollection(options);
 * 
 * new Vuex.Store(options)
 * options = {
 *  state,
 *  getters,
 *  mutations,
 *  actions,
 *  modules: {
 *    moduleA: {
        state: () => ({ ... }),
        mutations: { ... },
        actions: { ... },
        getters: { ... },
        modules: {
          moduleA1: {}
        }
      },
      moduleB: {
        state: () => ({ ... }),
        mutations: { ... },
        actions: { ... }
      }
 *  }
 * }
 * 
 * 最终的结果 this._modules = new ModuleCollection(options);
 * this._modules = {
 *    root: {
 *      runtime: false,
 *      state: options.state
 *      _rawModule: options,
 *      _children: {
 *        moduleA: {
 *          runtime: false,
 *          state: moduleA.satate,
 *          _rawModule: moduleA,
 *          _children: {
 *            moduleA1: {
 *              runtime: false,
 *              state: moduleA1.state,
 *              _rawModule: moduleA1,
 *              _children: {}
 *            }
 *          }
 *        }
 *      },
 *      moduleB: {
 *        runtime：false,
 *        state: moduleB.state,
 *        _rawModule: moduleB,
 *        _children: {}
 *      }
 *    }
 * }
 */
class ModuleCollection {
  constructor (rawRootModule) {
    // register root module (Vuex.Store options)
    // 注册根模块，path = [], 运行时创建模块 runtime = false
    this.register([], rawRootModule, false);
  }

  register (path, rawModule, runtime = true) {
    {
      // 校验 new Store({state, getters, mutations, actions})中传入的 getters / mutations 对象的每个属性值必须是函数， actions 每个属性值必须是函数或者对象形式中含有 handler 函数。
      assertRawModule(path, rawModule);
    }

    const newModule = new Module(rawModule, runtime);
    if (path.length === 0) {// path = []，是根模块
      this.root = newModule;
    } else {
      /**
       * 通过将嵌套模块的 key 按先后顺序存入数组中，除最后一项，前面的都为父模块路径
       * path = [moduleA] 或者 [moduleA, moduleA1]
       * 然后从 this.root 开始向下get 到父模块，向其 _children 添加当前模块
       * 最终构成一颗嵌套的模块树
       */
      const parent = this.get(path.slice(0, -1));
      parent.addChild(path[path.length - 1], newModule); // addChild (key, module) { this._children[key] = module; }
    }

    // register nested modules
    /**
     * options = {
     *  modules: {
     *    moduleA: {},
     *    modulesB: {}
     *  }
     * }
     */
    if (rawModule.modules) {
      forEachValue(rawModule.modules, (rawChildModule, key) => {
        this.register(path.concat(key), rawChildModule, runtime);
      });
    }
  }

  unregister (path) {
    const parent = this.get(path.slice(0, -1));
    const key = path[path.length - 1];
    const child = parent.getChild(key);

    if (!child) {
      {
        console.warn(
          `[vuex] trying to unregister module '${key}', which is ` +
          `not registered`
        );
      }
      return
    }

    if (!child.runtime) {
      return
    }

    parent.removeChild(key);
  }

  isRegistered (path) {
    const parent = this.get(path.slice(0, -1));
    const key = path[path.length - 1];

    return parent.hasChild(key)
  }

  get (path) {
    return path.reduce((module, key) => {
      return module.getChild(key)
    }, this.root)
  }

  getNamespace (path) {
    let module = this.root;
    return path.reduce((namespace, key) => {
      module = module.getChild(key);
      return namespace + (module.namespaced ? key + '/' : '')
    }, '')
  }

  update (rawRootModule) {
    update([], this.root, rawRootModule);
  }
}

/**
 * const newModule = new Module(rawModule, runtime);
 * rawModule = { 
 *  state: () => ({ ... }),
 *  mutations: { ... },
 *  actions: { ... },
 *  getters: { ... },
 *  modules: { 
 *    moduleA1: { ... } 
 *  }
 * 
 * newModule = {
 *  runtime: Boolean,
 *  _rawModule: rawModule,
 *  _children: {},
 *  state: rawModule.state
 * }
 */
class Module {
  constructor (rawModule, runtime) {
    this.runtime = runtime;
    // Store some children item
    this._children = Object.create(null);
    // Store the origin module object which passed by programmer
    this._rawModule = rawModule;
    const rawState = rawModule.state;

    // Store the origin module's state
    this.state = (typeof rawState === 'function' ? rawState() : rawState) || {};
  }

  get namespaced () {
    return !!this._rawModule.namespaced
  }

  addChild (key, module) {
    this._children[key] = module;
  }

  removeChild (key) {
    delete this._children[key];
  }

  getChild (key) {
    return this._children[key]
  }

  hasChild (key) {
    return key in this._children
  }

  update (rawModule) {
    this._rawModule.namespaced = rawModule.namespaced;
    if (rawModule.actions) {
      this._rawModule.actions = rawModule.actions;
    }
    if (rawModule.mutations) {
      this._rawModule.mutations = rawModule.mutations;
    }
    if (rawModule.getters) {
      this._rawModule.getters = rawModule.getters;
    }
  }

  forEachChild (fn) {
    forEachValue(this._children, fn);
  }

  forEachGetter (fn) {
    if (this._rawModule.getters) {
      forEachValue(this._rawModule.getters, fn);
    }
  }

  forEachAction (fn) {
    if (this._rawModule.actions) {
      forEachValue(this._rawModule.actions, fn);
    }
  }

  forEachMutation (fn) {
    if (this._rawModule.mutations) {
      forEachValue(this._rawModule.mutations, fn);
    }
  }
}

/**
 * 第二步：安装模块 installModule(this, state, [], this._modules.root); 
 * 目标就是对模块中的 state、getters、mutations、actions 做初始化工作
 * 
 * rootState = store._modules.root.state
 * module = store._modules.root = {
 *  runtime: false,
 *  state: {
 *    rootState
 *    moduleA: {
 *      state: ModuleA.state
 *    },
 *    moduleB: {
 *      state: ModlueB.state
 *    }
 *  },
 *  _rawModule: options,
 *  _children: {
 *    moduleA: {...},
 *    moduleB: {...}
 *  }
 * }
 * 
 * installModule 最终的处理结果是将嵌套模块内的 getters mutations actions 都是平铺在 store._warppedGetters / store._mutations / store._actions
 * 其中 state 是通过 reduce 方法获取嵌套的 state
 * 
 * store = {
 *  _modules: {root},
 *  _wrappedGetters: {},
 *  _mutations: {},
 *  _actions: {}
 * }
 */
function installModule (store, rootState, path, module, hot) {
  const isRoot = !path.length;
  // namespace + (module.namespaced ? key + '/' : '')
  // 如果 namespaced = true，则 namespace = 'moduleA/moduleA1/'，否则就是模块名称 'moudleA1'
  const namespace = store._modules.getNamespace(path); 

  // register in namespace map
  // 如果有命名空间，则维护一份路径跟模块的映射关系：store._modulesNamespaceMap = {'moduleA/moduleA1': moduleA1}
  if (module.namespaced) {
    if (store._modulesNamespaceMap[namespace] && true) {
      console.error(`[vuex] duplicate namespace ${namespace} for the namespaced module ${path.join('/')}`);
    }
    store._modulesNamespaceMap[namespace] = module;
  }

  // 建立 state 的嵌套树
  /**
   * this._moudules = {
   *  root: {
   *    state: {name: rootTest},
   *    _children: {
   *      moduleB: {
   *        state: {name: 'B'}
   *      }
   *    }
   *  }
   * }
   * 
   * 经过下面代码，会形成 state 嵌套树
   * this._moudules = {
   *  root: {
   *    state: {
   *      name: rootTest,
   *      moduleB: {
   *        state: {name: 'B'}
   *      }
   *    },
   *    _children: {
   *      moduleB: {
   *        state: {name: 'B'}
   *      }
   *    }
   *  }
   * }
   */
  if (!isRoot && !hot) {
    // function getNestedState (state, path) { return path.reduce((state, key) => state[key], state)}
    const parentState = getNestedState(rootState, path.slice(0, -1));
    const moduleName = path[path.length - 1];
    store._withCommit(() => {
      {
        if (moduleName in parentState) {
          console.warn(
            `[vuex] state field "${moduleName}" was overridden by a module with the same name at "${path.join('.')}"`
          );
        }
      }
      Vue.set(parentState, moduleName, module.state);
    });
  }

  /**
   * 以下内部主要是将当前模块的 mutations / actions / getters 里的属性分别注册到 store 实例的 _mutations / _actions / _wrappedGetters
   * 然后区别有没有添加命名空间 namespaced，有没命名空间区别在于 _mutations / _actions / _wrappedGetters 对象中的 key 值不同。
   */

  // 主要针对是定义了 namespace：
  // 如果定义了命名空间 namespace = 'moduleA/moduleA1'，则模块A中的某个方法的寻址就是 _mutations['moduleA/moduleA1/key']
  // 如果没有命名就是 _mutations['key']
  // 所以 makeLocalContext 方法就是为每个模块建立当前模块寻址的上下文空间
  const local = module.context = makeLocalContext(store, namespace, path);

  // 仓库实例上声明 store._mutations[namespacedType] = [(payload) => {mutation.call(store, local.state, payload)}]
  module.forEachMutation((mutation, key) => {
    const namespacedType = namespace + key; // 'moduleA/moudleA1/key'
    registerMutation(store, namespacedType, mutation, local);
  });
  /**
   * store._actions[type] = [(payload) => {return handler.call(store, {
   *  dispatch: local.dispatch,
   *  commit: local.commit,
   *  getters: local.getters,
   *  state: local.state,
   *  rootGetters: store.getters,
   *  rootState: store.state
   * }, payload)}]
   */
  module.forEachAction((action, key) => {
    const type = action.root ? key : namespace + key;
    const handler = action.handler || action;
    registerAction(store, type, handler, local);
  });
  // store._wrappedGetters[namespacedType] = function (store) {return getter(store)}
  /**
   * store._wrappedGetters[namespacedType] = function (store) {
   *  return getter(
   *    local.state,
   *    local.getters,
   *    store.state,
   *    store.getters
   * )}
   * 
   * 即模块中的 getter 函数可以有四个入参
   * moudleA = {
   *  getters: {
   *    getName(state, getters, rootState, rootGetters) {...}
   *  }
   * }
   */
  module.forEachGetter((getter, key) => {
    const namespacedType = namespace + key;
    registerGetter(store, namespacedType, getter, local);
  });

  // 递归处理嵌套的子模块的 state / getters / mutations / actions
  module.forEachChild((child, key) => {
    installModule(store, rootState, path.concat(key), child, hot);
  });
}

/**
 * 3. 初始化和设置 store_vm
 * 
 * resetStoreVM 的作用实际上是建立 getters 和 state 的联系，
 * 因为从设计上 getters 的获取就依赖了 state ，并且希望它的依赖能被缓存起来，且只有当它的依赖值发生了改变才会被重新计算。
 * 因此这里利用了 Vue 中用 computed 计算属性来实现
 * 
 * resetStoreVM(this, state)
 */
function resetStoreVM (store, state, hot) {
  const oldVm = store._vm;

  // bind store public getters
  store.getters = {};
  // reset local getters cache
  store._makeLocalGettersCache = Object.create(null);
  const wrappedGetters = store._wrappedGetters;
  const computed = {};
  forEachValue(wrappedGetters, (fn, key) => {
    // use computed to leverage its lazy-caching mechanism
    // direct inline function use will lead to closure preserving oldVm.
    // using partial to return function with only arguments preserved in closure environment.
    // function partial(fn, arg) { return function () { return fn(arg)}} 将 store 作为闭包变量缓存起来
    computed[key] = partial(fn, store);
    Object.defineProperty(store.getters, key, {
      get: () => store._vm[key],
      enumerable: true // for local getters
    });
  });

  // use a Vue instance to store the state tree
  // suppress warnings just in case the user has added
  // some funky global mixins
  const silent = Vue.config.silent;
  Vue.config.silent = true;
  store._vm = new Vue({
    data: {
      $$state: state
    },
    computed
  });
  Vue.config.silent = silent;

  // enable strict mode for new vm
  if (store.strict) {
    enableStrictMode(store);
  }

  if (oldVm) {
    if (hot) {
      // dispatch changes in all subscribed watchers
      // to force getter re-evaluation for hot reloading.
      store._withCommit(() => {
        oldVm._data.$$state = null;
      });
    }
    Vue.nextTick(() => oldVm.$destroy());
  }
}

function partial (fn, arg) {
  return function () {
    return fn(arg)
  }
}

// 严格模式下，如果 state 的值不是通过 commit 更改的将报错
function enableStrictMode (store) {
  store._vm.$watch(function () { return this._data.$$state }, () => {
    {
      assert(store._committing, `do not mutate vuex store state outside mutation handlers.`);
    }
  }, { deep: true, sync: true });
}

Store.prototype._withCommit = function (fn) {
  const committing = this._committing;
  this._committing = true;
  fn();
  this._committing = committing;
}
