/**
 * 在混入 new Vue 实例化时 beforeCreate 函数中 this.router.init(vm) 的过程
 */
function install (Vue) {
  // 省略代码
  Vue.mixin({
    beforeCreate: function beforeCreate () {
      if (isDef(this.$options.router)) { // 此时是 new Vue 实例化时
        this._routerRoot = this; // 当前组件实例 vm
        this._router = this.$options.router; // new Vue 时传入的 new VueRouter 实例
        this._router.init(this); // 路由实例初始化
        Vue.util.defineReactive(this, '_route', this._router.history.current);
      } else { // 其它组件实例化
        this._routerRoot = (this.$parent && this.$parent._routerRoot) || this;
      }
      registerInstance(this, this);
    },
    destroyed: function destroyed () {
      registerInstance(this);
    }
  });
  // 省略代码...
}

/**
 * VueRouter.prototype.init
 */
class VueRouter {
  constructor (options = {}) {
    // 省略代码
    // 主要处理：1、生成路由映射关系；2、new History 实例化路由
  }

  /**
   * 在路由初始化时，核心就是进行路由的跳转，改变 URL 然后渲染对应的组件
   * init 调用分两种情况：全局 new Vue 实例时和 component 组件实例时
   * 
   * 一、component 组件实例时 new vnode.componentOptions.Ctor(options)
   *    1)、 this.apps.push(app)
   *    2)、 在组件销毁钩子函数注册一个回调函数，用于删除保存在 apps 数组中的实例和取消路由监听事件
   * 二、new Vue 全局实例时，除上面两个任务，还有
   *    1)、调用 history.transitionTo 函数进行路径切换
   *    2)、调用 history.listen 函数添加路由视图渲染的回调函数 
   *        (route => { this.apps.forEach(app => { app._route = route; });
   * 
   *        在install安装混入 beforeCreate 函数中的回调函数代码 Vue.util.defineReactive(this, '_route', this._router.history.current)
   *        已将 _route 属性设为响应式，所以对其赋值会触发组件视图渲染更新
    }
   * 
   */
  init (app /* Vue component instance */) {
    
    assert(
      install.installed,
      `not installed. Make sure to call \`Vue.use(VueRouter)\` ` +
        `before creating root instance.`
    );

    this.apps.push(app);

    // set up app destroyed handler
    // 组件销毁钩子回调函数，主要处理：将销毁的组件从 apps 数组中删除，移除相关事件监听
    app.$once('hook:destroyed', () => {
      // clean out app from this.apps array once destroyed
      const index = this.apps.indexOf(app);
      if (index > -1) this.apps.splice(index, 1);
      // ensure we still have a main app or null if no apps
      // we do not release the router so it can be reused
      if (this.app === app) this.app = this.apps[0] || null;

      if (!this.app) {
        // clean up event listeners
        // https://github.com/vuejs/vue-router/issues/2341
        this.history.teardownListeners();
      }
    });

    // main app previously initialized
    // return as we don't need to set up new history listener
    /**
     * 从此往上部分，是 new Vue 和 new vnode.componentOptions.Ctor(options) 都会运行的。
     * 从此往下往下部分，只会初次注册 new Vue({router}) 时才会运行，即注册 transitionTo 和 listen
     */
    if (this.app) {
      return
    }

    this.app = app;

    const history = this.history;

    if (history instanceof HTML5History || history instanceof HashHistory) {
      history.transitionTo(
        history.getCurrentLocation(), // /info/13?q=test
        setupListeners, // onComplete
        setupListeners // onAbort
      );
      
      function setupListeners(routeOrError) {
        history.setupListeners();
        handleInitialScroll(routeOrError);
      };

      function handleInitialScroll (routeOrError) {
        const from = history.current;
        const expectScroll = this.options.scrollBehavior;
        const supportsScroll = supportsPushState && expectScroll;

        if (supportsScroll && 'fullPath' in routeOrError) {
          handleScroll(this, routeOrError, from, false);
        }
      };
      
    }

    history.listen(route => {
      this.apps.forEach(app => {
        app._route = route;
      });
    });
  }

  /**
   * 省略原型方法
   * push
   * replace
   * go
   * back
   * forward
   * currentRoute
   * addRoutes
   * match
   * getMatchedComponents
   * onReady
   * onError
   * beforeEach
   * beforeResolve
   * afterEach
   */
}

/**
 * 关注 history.transitionTo 函数调用进行路径切换
 * History.prototype.transitionTo => History.prototype.comfirmTransition
 */
class History {
  constructor (router, base) {
    this.router = router;
    this.base = normalizeBase(base);
    // start with a route object that stands for "nowhere"
    this.current = START; // {path: '/'}
    this.pending = null;
    this.ready = false;
    this.readyCbs = [];
    this.readyErrorCbs = [];
    this.errorCbs = [];
    this.listeners = [];
  }

  transitionTo (
    location,
    onComplete,
    onAbort
  ) {
    let route;
    try {
      /**
       * 获取匹配当前 URL 的路由信息
       * this.router.match => this.router.matcher.match => _createRoute => createRoute
       * route = {
          name: location.name || (record && record.name),
          meta: (record && record.meta) || {},
          path: location.path || '/',
          hash: location.hash || '',
          query: query,
          params: location.params || {},
          fullPath: getFullPath(location, stringifyQuery),
          matched: record ? formatMatch(record) : []
        };
       */
      route = this.router.match(location, this.current);
    } catch (e) {
      this.errorCbs.forEach(cb => {
        cb(e);
      });
      // Exception should still be thrown
      throw e
    }
    this.confirmTransition(
      route,
      () => { // 切换路由成功的回调
        const prev = this.current;
        this.updateRoute(route); // 更新路由信息，对组件的 _route 属性进行赋值，触发组件渲染
        onComplete && onComplete(route); // transitionTo 函数的成功回调
        this.ensureURL(); // 更新路由
        this.router.afterHooks.forEach(hook => {
          hook && hook(route, prev);
        });

        // fire ready cbs once 只执行一次 ready 回调
        if (!this.ready) {
          this.ready = true;
          this.readyCbs.forEach(cb => {
            cb(route);
          });
        }
      },
      err => { // 中断路由的回调
        if (onAbort) {
          onAbort(err);
        }
        if (err && !this.ready) {
          this.ready = true;
          // Initial redirection should still trigger the onReady onSuccess
          // https://github.com/vuejs/vue-router/issues/3225
          if (!isNavigationFailure(err, NavigationFailureType.redirected)) {
            this.readyErrorCbs.forEach(cb => {
              cb(err);
            });
          } else {
            this.readyCbs.forEach(cb => {
              cb(route);
            });
          }
        }
      }
    );
  }

  confirmTransition (route, onComplete, onAbort) {
    // 当前路由对象 current， 跳转目标路由对象 route
    const current = this.current; // this.current = START = {path: '/'}
    // 中断路由跳转的函数
    const abort = err => {
      // changed after adding errors with
      // https://github.com/vuejs/vue-router/pull/3047 before that change,
      // redirect and aborted navigation would produce an err == null
      if (!isNavigationFailure(err) && isError(err)) {
        if (this.errorCbs.length) {
          this.errorCbs.forEach(cb => {
            cb(err);
          });
        } else {
          warn(false, 'uncaught error during route navigation:');
          console.error(err);
        }
      }
      onAbort && onAbort(err);
    };
    const lastRouteIndex = route.matched.length - 1;
    const lastCurrentIndex = current.matched.length - 1;

    // 如果是相同路由就不跳转
    if (
      isSameRoute(route, current) &&
      // in the case the route map has been dynamically appended to
      lastRouteIndex === lastCurrentIndex &&
      route.matched[lastRouteIndex] === current.matched[lastCurrentIndex]
    ) {
      this.ensureURL();
      return abort(createNavigationDuplicatedError(current, route))
    }

    // 通过对比路由，解析出可复用的组件，需要渲染的组件，失活的组件
    const { updated, deactivated, activated } = resolveQueue(
      this.current.matched,
      route.matched
    );
    
    // 导航守卫数组
    /**
     * 1. 在失活的组件里调用离开守卫。
     * 2. 调用全局的 beforeEach 守卫。
     * 3. 在重用的组件里调用 beforeRouteUpdate 守卫
     * 4. 在激活的路由配置里调用 beforeEnter。
     * 5. 解析异步路由组件。
     */
    const queue = [].concat(
      // in-component leave guards 失活离开的组件钩子
      extractLeaveGuards(deactivated),
      // global before hooks 全局 beforeEach 钩子
      this.router.beforeHooks,
      // in-component update hooks 在当前路由改变，但是该组件被复用时调用
      extractUpdateHooks(updated),
      // in-config enter guards 需要渲染的组件 enter 守卫钩子
      activated.map(m => m.beforeEnter),
      // async components 解析异步路由组件
      resolveAsyncComponents(activated)
    );

    this.pending = route; // 保存将要跳转的目标路由
    // 迭代器，用于执行 queue 中的导航守卫钩子
    const iterator = (hook, next) => {
      if (this.pending !== route) {
        return abort(createNavigationCancelledError(current, route))
      }
      try {
        hook(route, current, (to) => {
          if (to === false) {
            // next(false) -> abort navigation, ensure current URL
            this.ensureURL(true);
            abort(createNavigationAbortedError(current, route));
          } else if (isError(to)) {
            this.ensureURL(true);
            abort(to);
          } else if (
            typeof to === 'string' ||
            (typeof to === 'object' &&
              (typeof to.path === 'string' || typeof to.name === 'string'))
          ) {
            // next('/') or next({ path: '/' }) -> redirect
            abort(createNavigationRedirectedError(current, route));
            if (typeof to === 'object' && to.replace) {
              this.replace(to);
            } else {
              this.push(to);
            }
          } else {
            // confirm transition and pass on the value
            // 也就是执行下面函数 runQueue 中的 step(index + 1)
            next(to);
          }
        });
      } catch (e) {
        abort(e);
      }
    };

    runQueue(queue, iterator, () => {
      const postEnterCbs = [];
      const isValid = () => this.current === route;
      // wait until async components are resolved before
      // extracting in-component enter guards
      const enterGuards = extractEnterGuards(activated, postEnterCbs, isValid);
      const queue = enterGuards.concat(this.router.resolveHooks);
      runQueue(queue, iterator, () => {
        if (this.pending !== route) {
          return abort(createNavigationCancelledError(current, route))
        }
        this.pending = null;
        onComplete(route);
        if (this.router.app) {
          this.router.app.$nextTick(() => {
            postEnterCbs.forEach(cb => {
              cb();
            });
          });
        }
      });
    });
  }
}

function resolveQueue (
  current,
  next
) {
  let i;
  const max = Math.max(current.length, next.length);
  // 当前路由路径和跳转路由路径不同时跳出遍历
  for (i = 0; i < max; i++) {
    if (current[i] !== next[i]) {
      break
    }
  }
  return {
    updated: next.slice(0, i),
    activated: next.slice(i),
    deactivated: current.slice(i)
  }
}

// 经典的同步执行异步函数
function runQueue (queue, fn, cb) {
  const step = index => {
    // 队列中的函数都执行完毕，就执行回调函数
    if (index >= queue.length) {
      cb();
    } else {
      if (queue[index]) {
        // 执行迭代器，用户在钩子函数中执行 next() 回调
			  // 回调中判断传参，没有问题就执行 next()，也就是 fn 函数中的第二个参数
        fn(queue[index], () => {
          step(index + 1);
        });
      } else {
        step(index + 1);
      }
    }
  };
  // 取出队列中第一个钩子函数
  step(0);
}


/**
 * 路径变化是路由中最重要的功能，我们要记住以下内容：
 * 路由始终会维护当前的线路，路由切换的时候会把当前线路切换到目标线路，
 * 切换过程中会执行一系列的导航守卫钩子函数，会更改 url，同样也会渲染对应的组件，
 * 切换完毕后会把目标线路更新替换当前线路，这样就会作为下一次的路径切换的依据。
 */