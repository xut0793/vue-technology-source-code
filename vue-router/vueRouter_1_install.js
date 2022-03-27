/**
 * VueRouter 路由在视图模板中的基本使用
 * 1. 路由入口：导航，提供了组件形式 router-link 和 js 方法 this.$router.push/go/replace 等
 * 2. 路由出口：视图，使用组件 router-veiw
 * 
 * <p>
 *     <!-- 路由入口：使用 router-link 组件来导航，通过传入 `to` 属性指定导航目的地. -->
 *     <!-- <router-link> 默认会被渲染成一个 `<a>` 标签 -->
 *     <router-link to="/foo">Go to Foo</router-link>
 *     <router-link to="/bar">Go to Bar</router-link>
 * </p>
 *   <!-- 路由出口：路由匹配到的组件将渲染在这里 -->
 *   <router-view></router-view>
 * 
 * 也可以使用 js 形式实现路由导航
 * this.$router.push('/foo')
 */

/**
 * VueRouter 插件在 Vue 注册
 * 
 */
import Vue from 'vue'
import VueRouter from 'vue-router'
import App from './App'

Vue.use(VueRouter)

/**
 * VueRouter 使用
 */
// 1. 定义路由
// 每个路由应该映射一个组件。 其中"component" 可以是通过 Vue.extend() 创建的组件构造器，或者，只是一个组件配置对象。
const routes = [
  { path: '/foo', component: Foo },
  { path: '/bar', component: Bar }
]

// 2. 创建 router 实例，然后传 `routes` 配置
// 你还可以传别的配置参数, 不过先这么简单着吧。
const router = new VueRouter({
  routes // （缩写）相当于 routes: routes
})

// 3. 创建和挂载根实例。
// 记得要通过 router 配置参数注入路由，从而让整个应用都有路由功能
const app = new Vue({
  el: '#app',
  render(h) {
    return h(App)
  },
  router
})


/**
 * 插件注册 Vue.use(plugin)
 * 
 * Vue 提供了 Vue.use 的全局 API 来注册这些插件，函数路径 installGlobalAPI(Vue) => initUse(Vue)
 * 
 * Vue.use 接受一个 plugin 参数，并且维护了一个 _installedPlugins 数组，它存储所有注册过的 plugin；
 * 1. 如果缓存插件的数组中已有，则说明该插件已注册过，直接返回
 * 2. 函数中判断 plugin 有没有定义 install 方法，如果有的话则调用该方法，并且该方法执行的第一个参数是 Vue；
 * 3. 如果 plugin 没有定义 install 方法，则自身必须是一个接受 vue 入参的函数。
 * 4. 最后把 plugin 存储到 installedPlugins 中。
 */ 

function initUse (Vue) {
  Vue.use = function (plugin) {
    var installedPlugins = (this._installedPlugins || (this._installedPlugins = []));
    if (installedPlugins.indexOf(plugin) > -1) {
      return this
    }

    // additional parameters
    var args = toArray(arguments, 1); // 返回空数组 []
    args.unshift(this); // [Vue]
    if (typeof plugin.install === 'function') {
      plugin.install.apply(plugin, args);
    } else if (typeof plugin === 'function') {
      plugin.apply(null, args);
    }
    installedPlugins.push(plugin);
    return this
  };
}

  /**
   * Convert an Array-like object to a real Array.
   */
  function toArray (list, start) {
    start = start || 0;
    var i = list.length - start;
    var ret = new Array(i);
    while (i--) {
      ret[i] = list[i + start];
    }
    return ret
  }

  /**
   * VueRouter 的 install 函数
   * 1. install.installed 标识自身是否已注册过
   * 2. Vue.mixin 全局混入 beforeCreate 和 destoryed 生命周期钩子函数，会在每个组件实例化时混入。
   *    两个生命周期中主要是执行 registerInstance => registerRouteInstance 函数
   * 3. 在 Vue.prototype 原型对象上定义两个只读的 $router / $route
   * 4. 注册 路由入口 RouterLink 和 路由出口 RouterView 组件
   * 
   * 总结： VueRouter 的 install 函数关键的是路由实例的 init 函数 和 registerRouteInstance 函数。
   * 即在每个组件初始化钩子函数 beforeCreate 中会执行路由器实例的 init 方法，
   * 主要是将当前组件实例 push 到 router.app 数组中 this.apps.push(app)，
   * 以及注册一个 destory 钩子函数的回调函数，在回调函数中清理 apps 存储的组件实例，并制裁路由事件监听器
   */
  var _Vue;
  function install (Vue) {
    // install.installed 标识自身是否已注册过，已注册过无需重复注册
    if (install.installed && _Vue === Vue) { return }
    install.installed = true;

    _Vue = Vue;

    // 混入组件的生命周期钩子，实现 VueRouter 初始化和注册
    // Vue.mixin 函数把要混入的对象通过 mergeOptions 合并到 Vue 的 options 中。
    // 然后组件构造函数 Sub 生成时会将 Vue.options 合并到自身的 options，
    // 所以也相当于每个组件都定义了 mixin 中的选项。
    Vue.mixin({
      beforeCreate: function beforeCreate () {
        if (isDef(this.$options.router)) { // 此时是 new Vue 实例化时
          this._routerRoot = this; // 当前组件实例 vm
          this._router = this.$options.router; // new Vue 时传入的 new VueRouter 实例
          this._router.init(this); // 路由初始化
          Vue.util.defineReactive(this, '_route', this._router.history.current);
          /**
           * this._route = {
           *  get () {
           *    var value = this._router.history.current
           *    if (Dep.target) { dep.depend() }
           *    return value
           *  },
           *  set (newVal) {
           *    var value = this._router.history.current
           *    val = newValue
           *     dep.notify()
           *  }
           * }
           */
        } else { // 其它组件实例化
          this._routerRoot = (this.$parent && this.$parent._routerRoot) || this;
        }
        registerInstance(this, this);
      },
      destroyed: function destroyed () {
        registerInstance(this);
      }
    });

    // 在 Vue.prototype 原型对象上定义两个只读的 $router / $route
    Object.defineProperty(Vue.prototype, '$router', {
      get: function get () { return this._routerRoot._router }
    });

    Object.defineProperty(Vue.prototype, '$route', {
      get: function get () { return this._routerRoot._route }
    });

    // 注册 路由入口 RouterLink 和 路由出口 RouterView 组件
    Vue.component('RouterView', View);
    Vue.component('RouterLink', Link);

    var strats = Vue.config.optionMergeStrategies;
    // use the same hook merging strategy for route hooks
    strats.beforeRouteEnter = strats.beforeRouteLeave = strats.beforeRouteUpdate = strats.created;


    // helper
    function isDef (v) { return v !== undefined; };
    function registerInstance (vm, callVal) {
      var i = vm.$options._parentVnode;
      if (isDef(i) && isDef(i = i.data) && isDef(i = i.registerRouteInstance)) {
        i(vm, callVal);
      }
    };
  }
  

function initMixin$1 (Vue) {
  Vue.mixin = function (mixin) {
    this.options = mergeOptions(this.options, mixin);
    return this
  };
}

function mergeOptions ( parent, child, vm) {
  // 省略代码...
  var options = {};
  var key;
  // 先以父构造器上的 options 中的 key 为基础，合并 parent.key 和 child.key 到 options
  for (key in parent) {
    mergeField(key);
  }
  // 合并 父构造器 options 上没有，但子组件上有定义的 key 赋值到 options.key 中
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