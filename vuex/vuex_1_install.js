// import Vuex from 'vuex'
var index = {
  Store,
  install,
  version: '3.5.1',
  mapState,
  mapMutations,
  mapGetters,
  mapActions,
  createNamespacedHelpers,
  createLogger
};

export default index;
export { Store, createLogger, createNamespacedHelpers, install, mapActions, mapGetters, mapMutations, mapState };

// Vue.use(Vuex) => install
let Vue
function install (_Vue) {
  if (Vue && _Vue === Vue) {
    {
      console.error(
        '[vuex] already installed. Vue.use(Vuex) should be called only once.'
      );
    }
    return
  }
  Vue = _Vue;
  applyMixin(Vue);
}

function applyMixin (Vue) {
  const version = Number(Vue.version.split('.')[0]);

  if (version >= 2) {
    Vue.mixin({ beforeCreate: vuexInit });
  } else {
    // override init and inject vuex init procedure
    // for 1.x backwards compatibility.
    const _init = Vue.prototype._init;
    Vue.prototype._init = function (options = {}) {
      options.init = options.init
        ? [vuexInit].concat(options.init)
        : vuexInit;
      _init.call(this, options);
    };
  }

  /**
   * Vuex init hook, injected into each instances init hooks list.
   * 向每个组件实例注入 this.$store 引用
   */
  function vuexInit () {
    const options = this.$options;
    // store injection
    if (options.store) { // new Vue(options) 实例化根组件时
      this.$store = typeof options.store === 'function'
        ? options.store()
        : options.store;
    } else if (options.parent && options.parent.$store) { // 其它组件实例化时获取父组件中的引用
      this.$store = options.parent.$store;
    }
  }
}
