Vue.prototype._init = function (options) {
  // 省略代码
  var vm = this;
  vm._self = vm;
  initLifecycle(vm); // 挂载内部属性：$root/$parent/$refs=[]/$children=[]/_watcher=null，以及一些生命状态标志 flag: _inactive=null/_isMounted=false/_isDestoryed=false/_isBeingDestoryed=false
  initEvents(vm); // 挂载父组件传入的事件监听器 listeners 到实例 vm._events 对象上，来源于 template 解析到的 v-on 绑定的事件函数
  initRender(vm); // 挂载 $attrs/$listeners，以及绑定 _c/$createElement
  callHook(vm, 'beforeCreate');
  initInjections(vm); // 1. 解析 inject 属性的数据；2. 并将其设置响应式（即k-v转为getter/setter）同时挂载到 vm 上
  initState(vm); // 初始 options 中的属性：initProps/initMethods/initData/initComputed/initWatch
  initProvide(vm); // resolve provide after data/props
  callHook(vm, 'created');

  if (vm.$options.el) {
    vm.$mount(vm.$options.el);
  }
};

function initState (vm) {
  vm._watchers = [];
  var opts = vm.$options;
  if (opts.props) { initProps(vm, opts.props); }
  if (opts.methods) { initMethods(vm, opts.methods); }
  if (opts.data) {
    initData(vm);
  } else {
    observe(vm._data = {}, true /* asRootData */);
  }
  if (opts.computed) { initComputed(vm, opts.computed); }
  if (opts.watch && opts.watch !== nativeWatch) {
    initWatch(vm, opts.watch);
  }
}

/**
 * 接着 initComputed(vm, opts.computed) 函数，做两件事：
 * 1. new Watcher 创建一个 computed-watcher，注意传入的 computedWatcherOptions = {lazy:true}
 * 2. 如果 computed 属性 key 不与 data/props 重名的话，为每一个 computed 属性定义它的响应式 getter / setter
 */
var computedWatcherOptions = { lazy: true };
function initComputed (vm, computed) {
  // computed watcher 除了会保存在 vm._watchers 数组内，也会存一份在 vm._computedWatchers 对象中
  var watchers = vm._computedWatchers = Object.create(null);

  for (var key in computed) {
    var userDef = computed[key];
    var getter = typeof userDef === 'function' ? userDef : userDef.get;
    /**
     * 1. 实例化 computed watcher，在 new Watcher 执行最后，因为 lazy = true，所以不会执行依赖收集
     * 即 计算属性的依赖在创建 new Watcher　实例化中只是把它存入了　vm._computedWatchers 数组中
     * 并不会像 user watcher那样创建依赖即完成依赖收集，计算属性依赖收集是发生在 vm._render 函数执行过程中，
     * 再次读取计算属性值时调用它自身的 computed-watcher.evaluate() 函数时才触发依赖收集
     */
    watchers[key] = new Watcher(
      vm,
      getter || noop,
      noop,
      computedWatcherOptions // { lazy: true };
    );

    if (!(key in vm)) {
      // 2. 定义 computed 每个 key 的 getter / setter
      defineComputed(vm, key, userDef);
    } else {
      if (key in vm.$data) {
        warn(("The computed property \"" + key + "\" is already defined in data."), vm);
      } else if (vm.$options.props && key in vm.$options.props) {
        warn(("The computed property \"" + key + "\" is already defined as a prop."), vm);
      }
    }
  }
}

var sharedPropertyDefinition = {
  enumerable: true,
  configurable: true,
  get: noop,
  set: noop
};

function defineComputed (
  target,
  key,
  userDef
) {
  var shouldCache = !isServerRendering();
  if (typeof userDef === 'function') {
    sharedPropertyDefinition.get = shouldCache
      ? createComputedGetter(key)
      : createGetterInvoker(userDef);
    sharedPropertyDefinition.set = noop;
  } else {
    sharedPropertyDefinition.get = userDef.get
      ? shouldCache && userDef.cache !== false
        ? createComputedGetter(key)
        : createGetterInvoker(userDef.get)
      : noop;
    sharedPropertyDefinition.set = userDef.set || noop;
  }
  if (sharedPropertyDefinition.set === noop) {
    sharedPropertyDefinition.set = function () {
      warn(
        ("Computed property \"" + key + "\" was assigned to but it has no setter."),
        this
      );
    };
  }
  Object.defineProperty(target, key, sharedPropertyDefinition);
}

function createComputedGetter (key) {
  return function computedGetter () {
    var watcher = this._computedWatchers && this._computedWatchers[key];
    if (watcher) {
      if (watcher.dirty) {
        watcher.evaluate();  // 计算属性依赖收集会在这里触发
        // 这里执行会获取computed 的getter，执行时也会触发计算属性的getter，所以此时 targetStack=[render-watcher, computed-watcher]
        // 当读取计算属性依赖的数据的 getter 时，会将 computed-watcher 添加到其 dep.subs中，同时将该dep 添加到 computed-watcher 的 deps 中。
      }
      if (Dep.target) { // 此时 Dep.target 是 render-watcher
        watcher.depend(); 
        // render-watcer 的依赖收集会在这里触发收集，或许也会在 data 属性的 getter 中。
        // 遍历 computed-watcher 中被添加 deps，执行dep.depend => Dep.target.addDep(dep) => dep.addSub(render-watcher)，即将 render-watcher 添加到了每个依赖项 dep 中。
        // 此时computed所依赖的每个数据dep中subs=[computed-watcher, render-watcher]，并且顺序也是重要的，因为queueWatcher中需要排序。
      }
      return watcher.value
    }
  }
}

function createGetterInvoker(fn) {
  return function computedGetter () {
    return fn.call(this, this)
  }
}

/**
 * 总结下，options 中可能会被初始化后转为 getter / setter 的形式
 */

 // data 的每个属性
 vm.attr = {
  get () {
    return this._data.attr
  },
  set (val) {
    this._data.attr = val
  }
 }
vm._data.attr = {
  get () {
    var value = getter ? getter.call(obj) : val;
        if (Dep.target) {
          dep.depend();
          if (childOb) {
            childOb.dep.depend();
            if (Array.isArray(value)) {
              dependArray(value);
            }
          }
          if (Array.isArray(value) && childOb) {
            dependArray(value);
          }
        }
        return value
  },
  set () {
    var value = getter ? getter.call(obj) : val; // 这里还会触发 dep.depend()，如果去重？在 Dep.target.addDep(dep)会去判断当前dep是否已添加DepIds，若没有 dep.addSub(watcher)
    // 值没改变不通知依赖更新
    if (newVal === value || (newVal !== newVal && value !== value)) {
      return
    }

    if (getter && !setter) { return }
    if (setter) {
      setter.call(obj, newVal);
    } else {
      val = newVal;
    }
    childOb = !shallow && observe(newVal); // 设置的newVal也需要转为响应式
    dep.notify(); 
  }
}

// props 的每一个属性
// initProps 期间 toggleObserving(false); 因为 prop 在父组件已经设置为响应式
vm.porp = {
  get () {
    return this._props.prop
  },
  set (val) {
    this._props.prop = val
  }
}

vm._props.prop = {
  get () {
    if (Dep.target) {
      dep.depend();
      if (childOb) {
        childOb.dep.depend();
        if (Array.isArray(value)) {
          dependArray(value);
        }
      }
      if (Array.isArray(value) && childOb) {
        dependArray(value);
      }
    }
    return value
  },
  set () {
    var value = getter ? getter.call(obj) : val;
    /* eslint-disable no-self-compare */
    if (newVal === value || (newVal !== newVal && value !== value)) {
      return
    }
    // initProps 时会定义这个 customSetter，主要弹出 prop 值不能直接赋值修改
    if (customSetter) {
      customSetter();
    }
  }
}

// computed 的每个属性
vm.computed_attr = {
  get () {
    var watcher = this._computedWatchers && this._computedWatchers['computed_example'];
    if (watcher) {
      // watcher.dirty 标识符是专为 computed watcher 设定的，也是 computed 具有缓存特性的关键，它决定了计算属性返回缓存值学是获取新值
      if (watcher.dirty) {
        watcher.evaluate(); 
      }
      if (Dep.target) { // 此时 Dep.target 是 render-watcher
        watcher.depend();
      }
      return watcher.value
    }
  },
  set () {
    warn(
      ("Computed property \"" + key + "\" was assigned to but it has no setter."),
      this
    );
  }
}

// inject 的每一个属性
// initJections 期间 toggleObserving(false)
vm.inject = {
  get () {
    var value = getter ? getter.call(obj) : val;
    if (Dep.target) {
      dep.depend();
      if (childOb) {
        childOb.dep.depend();
        if (Array.isArray(value)) {
          dependArray(value);
        }
      }
      if (Array.isArray(value) && childOb) {
        dependArray(value);
      }
    }
    return value
  },
  set () {
    var value = getter ? getter.call(obj) : val;
    /* eslint-disable no-self-compare */
    if (newVal === value || (newVal !== newVal && value !== value)) {
      return
    }
    // initInjections 时会定义这个 customSetter，主要弹出 inject 值不能直接赋值修改
    if (customSetter) {
      customSetter();
    }
  }
}

// methods 
vm.method = fn

// watch
vm._watchers = [watch]


