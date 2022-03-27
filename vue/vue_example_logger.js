/**
 * 面试题：
 * 下面 Vue 实例化过程中 created mounted computed watch 中 logger 输出顺序
 */

const vm = new Vue({
  el: '#app',
  template: `<div>{{ computed_value }}</div>`,
  data() {
    return {
      example: 'default value'
    }
  },
  created() {
    this.example = 'created changed'
    console.log('craeted logger', this.example)
  },
  mounted() {
    console.log('mounted logger', this.example)
  },
  computed: {
    computed_example() {
      console.log('computed logger:', this.example)
      return this.example
    }
  },
  watch: {
    example(newValue, oldValue) {
      console.log('watch logger: newValue:%s, oldValue: %s', newValue, oldValue)
    }
  }
})

/**
 * 在解析前需要了解以下几个问题：
 * 1. 在 Vue 中什么是依赖：所谓依赖就是一个 Watcher 实例，dep 收集起来存入 subs 数组中的就是 watcher
 * 2. 在 Vue 中 watcher 有三种：
 *    1)、组件渲染的 render-watcher，new Watcher 时会传入 isRenderWatcher = true
 *    2)、声明computed 的每一个属性是 computed-watcher，标识符是 watcher.lazy = true
 *    3)、自定义 watch 的每一个属性是 user-watcher，标识符是 watcher.user = true
 * 
 * 要关注它们的区别：
 *    1)、render-watcher 作为组件渲染依赖，触发 dep.depend 去收集的时机是在每一个 data / computed / props / inject 的 getter
 *    2)、computed-watcher 作为计算属性依赖，触发 dep.depend 去收集的时机是 vm._render　函数调用过程中执行_createElement 函数调用各类辅助函数 _c / _s / _v 等，即模板渲染时
 *    3)、user-watcher 作为用户自定义依赖，触发 dep.depend 去收集的时机是它自身被创建时。只有 user-watcher 是创建依赖即完成依赖收集。
 */

 /**
  * 简短解析：
  * Vue 实例化过程中，对 options 对象的属性初始化顺序是：initProps / initMethods / initData / initComputed / initWatch
  * 所以上述属性的解析过程是：
  * 1. initData：对 data.example 处理成响应式 getter / setter
  * 2. initComputed 对 computed_example 处理成响应式 getter / setter，在这个过程中会创建 computed-watcher，但因为 computed-watcher.lazy = true，所以仅是创建依赖保存在 vm._computedWatchers 中，并不会触发收集依赖
  * 3. initWatch 会创建 user-watcher，同时触发依赖收集，使得 example 的 dep.subs = [user-watcher]
  * 4. callHook(vm, 'created') 会执行 this.example = 'created changed'语句，调用 example 的 setter 函数，派发依赖更新，因为此时 subs 数组中只有 user-wathcer，所以将它推入了异步队列，等待执行
  * 5. 之后执行 Vue 组件编译和生成虚拟 dom，在生成虚拟dom 的 _createElement 函数调用过程中会读取 vm.computed_example 的值，执行计算属性的 getter，
  * 6. computed-watcher.getter() 执行过程会打印 logger，并完成依赖收集，此时 dep.subs = [user-watcher, computed-wathcer]
  * 7. 同时computed-watcher.getter()执行过程中获取到最新值后，也会把 render-watcher 作为依赖收集到 example 的 dep.subs 中，此时 dep.subs = [user-watcher, computed-wathcer， render-watcher]
  * 8. 之后完成视图渲染挂载后，执行 $mount 打印 logger
  * 
  * 即结果是：
  * craeted logger created changed
  * computed logger: created changed
  * mounted logger created changed
  * watch logger: newValue:created changed, oldValue: default value
  */

  /**
   * 举一返三
   * 1. 如果在 mounted 函数中再次对 example 赋值，输出结果又会怎么样？
   */
  mounted() {
    this.example = 'mounted changed'
    console.log('mounted logger', this.example)
  }
  /**
   * 2. 如果在自定义的 watch 中传入 immediate = true ，输出结果又会怎么样？
   */
  watch: {
    example: {
      immediate: true,
      handler(newValue, oldValue) {
        console.log('watch logger: newValue:%s, oldValue: %s', newValue, oldValue)
      },
    }
  }

  /**
  * 源码解析上述例子实例化过程。
  *  new Vue 实例化最终调用的函数是 Vue.prototype._init
  */
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

// 可以看到 created 钩子函数是在 initState 函数之后调用。而 initState 函数处理了我们需要关注的 options 对象的 data / computed / watch
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

// 看到 options 对象中各个属性处理的先后顺序是 props methods data computed watch
// 因为我们的例子data 只有一个 value 属性，它会被 Vue 的 Observer 处理成响应式对象。
// 每一个 data 属性都对应一个它的依赖管理器 Dep 实例，dep.subs 数组内保存所有观察 value 的依赖 watcher
/**
  * initData 函数执行：
  *   1). 兼容 data 对象形式和组件 data 函数形式，获取最终的对象 data；
  *   2). 校验 data 的每个 key 不能与 props 和 methods 中的属性重名；
  *   3)、代理 proxy： vm.key = vm._data.key
  * 然后调用 observe(data) 函数：尝试为一个值创建一个 observer 观察者实例，如果 value.__ob__ 存在，则直接返回，否则 new Observer
  * 然后调用 new Observer(data) 函数：兼容对象和数组类型值，分别采用不同的响应式处理方式；
  * data 是对象，调用遍历对象每个 key 调用 defineReactive(data, key) 将 value 转为响应式的 getter / setter
  */
 function defineReactive$$1 (
  obj,
  key,
  val,
  customSetter,
  shallow
) {
  var dep = new Dep(); // data 中的每一个属性 key 都对应一个对应闭包对象 dep

  var property = Object.getOwnPropertyDescriptor(obj, key);
  if (property && property.configurable === false) {
    return
  }

  // cater for pre-defined getter/setters
  var getter = property && property.get;
  var setter = property && property.set;
  if ((!getter || setter) && arguments.length === 2) {
    val = obj[key];
  }

  var childOb = !shallow && observe(val);
  Object.defineProperty(obj, key, {
    enumerable: true,
    configurable: true,
    get: function reactiveGetter () {
      var value = getter ? getter.call(obj) : val;
      if (Dep.target) { // Dep.target = watcher
        dep.depend();
        if (childOb) {
          childOb.dep.depend();
          if (Array.isArray(value)) {
            dependArray(value);
          }
        }
      }
      return value
    },
    set: function reactiveSetter (newVal) {
      var value = getter ? getter.call(obj) : val; // 这里还会触发 dep.depend()，如果去重？在 Dep.target.addDep(dep)会去判断当前dep是否已添加DepIds，若没有 dep.addSub(watcher)
      if (newVal === value || (newVal !== newVal && value !== value)) {
        return
      }

      if (getter && !setter) { return }
      if (setter) {
        setter.call(obj, newVal);
      } else {
        val = newVal;
      }
      childOb = !shallow && observe(newVal); // 赋值的新值 newVal 也需要尝试去转为响应式
      dep.notify(); 
      // 遍历dep.subs中的每个watcher，调用watcher.update
      // 判断是computed-watcher，则 watcher.dirty=true，其它运行 watcher.run() 
      // run() => this.cb.call(this.vm, value, oldValue)
    }
  });
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
    // 1. 实例化 computed watcher
    watchers[key] = new Watcher(
      vm,
      getter || noop,
      noop,
      computedWatcherOptions
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

// 这里先看 defineComputed(vm, key, userDef)，再看 new Watcher 实例化
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
  // 省略了代码
  if (typeof userDef === 'function') {
    sharedPropertyDefinition.get = createComputedGetter(key)
    sharedPropertyDefinition.set = noop;
  } else {
    sharedPropertyDefinition.get = createComputedGetter(key)
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

// initComputed 函数的关键就是为 computed 属性自定义的 getter 函数
function createComputedGetter (key) {
  return function computedGetter () {
    var watcher = this._computedWatchers && this._computedWatchers[key];
    if (watcher) {
      // watcher.dirty 标识符是专为 computed watcher 设定的，也是 computed 具有缓存特性的关键，它决定了计算属性返回缓存值学是获取新值
      if (watcher.dirty) {
        watcher.evaluate(); 
      }
      if (Dep.target) { // 此时 Dep.target 是 render-watcher
        watcher.depend();
      }
      // computed 的值缓存在它对应的 computed watcher.value 上。
      return watcher.value
    }
  }
}

/**
 * 此时我们定义的 computed_example 属性转为类似这样的 getter / setter：
 */
vm.computed_example = {
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
// 跟 initData 函数的处理结果 data.example 对比下：
vm.example = vm._data.example = {
  get () {
    var value = getter ? getter.call(obj) : val;
    if (Dep.target) { // 此时 Dep.target 是 render-watcher
      dep.depend();
      if (childOb) {
        childOb.dep.depend();
        if (Array.isArray(value)) {
          dependArray(value);
        }
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

// 了解了 defineComputed 函数的作用是将一个 computed 属性也转为 getter / setter 后，
// 再回头看 initComputed 中 new Watcher 过程,对本例来说相当于：
vm._computedWatchers['computed_example'] = new Watcher(
  vm,
  function () {console.log('computed logger:', this.example)}, // getter
  function () {}, // noop
  {lazy:true} // computedWatcherOptions
);

// 此时我们看下相对于 computed 的 new Watcher 执行
var Watcher = function Watcher (
  vm,
  expOrFn,
  cb,
  options,
  isRenderWatcher
) {
  this.vm = vm;
  if (isRenderWatcher) { // 组件 render-watcher 专属标识 isRenderWatcher
    vm._watcher = this; 
  }
  vm._watchers.push(this); // 当前组件所有 watcher：包含 render-watcher / user-watcher / computed-watcher
  // options
  if (options) {
    this.deep = !!options.deep;
    this.user = !!options.user; // 用户在option.watch 自定义的 watcher，即 user-watch,
    this.lazy = !!options.lazy; // 用于标记 computed 中实例watcher,即 computed-watcher
    this.before = options.before; // render-watcher 会传入这个属性，即 beforeUpdate 钩子函数
  } 
  this.cb = cb;
  this.id = ++uid$2; // uid for batching
  this.active = true;
  this.dirty = this.lazy; // 标记 computed-watcher 是否需要重新计算值，还是使用缓存的值 watcher.value
  this.deps = []; // 当前 watcher 被哪些 data 的 dep 所持有
  this.newDeps = [];
  this.depIds = new _Set();
  this.newDepIds = new _Set();
  this.expression = expOrFn.toString();
  // 
  if (typeof expOrFn === 'function') {
    this.getter = expOrFn; // computed-watcher 计算属性定义的函数 或者 render-wathcer 的传入 updateComponent 函数
  } else {
    this.getter = parsePath(expOrFn); // user-watcher 会解析值，比如 watcher 监听的 obj.a.b，相对我们例子监听 example，则 getter 是 function(vm) {return vm.example } 函数
    if (!this.getter) {
      this.getter = noop;
      warn(
        "Failed watching path: \"" + expOrFn + "\" " +
        'Watcher only accepts simple dot-delimited paths. ' +
        'For full control, use a function instead.',
        vm
      );
    }
  }

  /**
   * 注意这里，在 computed watcher 中因为传入的 lazy = true，
   * 所以计算属性的 new Wacher 调用到此结束，往后执行 defineComputed 过程，如上面分析
   */
  this.value = this.lazy
    ? undefined
    : this.get();
};

// initComputed 函数也执行完毕。接下来是 initWatch 函数执行
function initWatch (vm, watch) {
  for (var key in watch) {
    var handler = watch[key];
    if (Array.isArray(handler)) {
      for (var i = 0; i < handler.length; i++) {
        createWatcher(vm, key, handler[i]);
      }
    } else {
      createWatcher(vm, key, handler);
    }
  }
}
/**
 * 可以看到，定义的 watch 是数组还是函数，都执行 createWatcher
 * 
 * 针对我们的例子，传入的:
 * expOrFn = 'example'
 * hander 是函数:
 *  handler = function (newValue, oldValue) { 
 *   console.log('watch logger: newValue:%s, oldValue: %s', newValue, oldValue)
 *  }
 */
function createWatcher (
  vm,
  expOrFn,
  handler,
  options
) {
  /**
   * 如果 handler 是对象，类似 {dee:true, handler:function (newValue,oldValue){...}}
   */
  if (isPlainObject(handler)) {
    options = handler;
    handler = handler.handler;
  }
  // handler 是调用 methods 中方法名时，获取函数
  if (typeof handler === 'string') {
    handler = vm[handler];
  }
  return vm.$watch(expOrFn, handler, options)
}

// 再看下 $watch 函数
Vue.prototype.$watch = function (
  expOrFn,
  cb,
  options
) {
  var vm = this;
  // 省略代码...
  options = options || {};
  options.user = true; // 自定义 watcher 的标识符
  var watcher = new Watcher(vm, expOrFn, cb, options);

  // 省略代码...

  // 返回一个可以取消观察回调的函数
  return function unwatchFn () {
    watcher.teardown();
  }
};

// 到这里为此，又执行 new Watcher()，同上面 initComputed 分析一样，不同的是此时
option.user = true
this.lazy = false
// 所以此时 new Watcher 会执行到 this.get() 方法，它定义在 Watcher 类的原型对象上。
this.value = this.lazy
? undefined
: this.get();

Watcher.prototype.get = function get () {
  pushTarget(this);
  var value;
  var vm = this.vm;
  try {
    value = this.getter.call(vm, vm);
  } catch (e) {
    if (this.user) {
      handleError(e, vm, ("getter for watcher \"" + (this.expression) + "\""));
    } else {
      throw e
    }
  } finally {
    // "touch" every property so they are all tracked as
    // dependencies for deep watching
    if (this.deep) {
      traverse(value);
    }
    popTarget();
    this.cleanupDeps();
  }
  return value
};

/**
 * 注意这里几点关键代码：
 * 1. pushTarget(this)，即把当前 Dep.target = user-watcher，并压入保存 target 的堆栈 targetStack.push(user-watcher)
 */
Dep.target = null;
var targetStack = [];

function pushTarget (target) {
  targetStack.push(target);
  Dep.target = target;
}

function popTarget () {
  targetStack.pop();
  Dep.target = targetStack[targetStack.length - 1];
}

/**
 * 然后是第二点注意： value = this.getter.call(vm, vm);
 * 针对我们的例子，此时 this.getter 是在 new Watcher 时解析出来的 this.getter = function(vm) {return vm.example}
 * 
 * 因为 example 我们在 initData 函数时已经处理了，它是一个被代理过的响应式对象，相当于调用
 * vm.example = vm._data.example = get () {}
 */
function reactiveGetter () {
  var value = getter ? getter.call(obj) : val; // value = 'default value'
  if (Dep.target) { // 此时 Dep.target 是上面 pushTarget 进入的 user-watcher
    dep.depend();
    // 省略代码...
  }
  return value
}

/**
 * 因为 example 已经是响应式的，所以此处调用 example 的 getter 会触发 example 属性对应的 dep 实例收集依赖，即收集对应的 watcher
 * 
 * dep.depend()
 */
var Dep = function Dep () {
  this.id = uid++;
  this.subs = [];
};
Dep.prototype.depend = function depend () {
  /**
   * 该方法最关键的点：添加依赖不是直接调 dep.addSub 方法，而是绕到 Dep.target.addDep(this) 即 watcher.addDep(dep) => dep.addSub(wathcer)
   * 之所以这样绕一圈，是因为既需要在 dep.subs 中持有全部 watcher，又需要在每个 watcher 的 depIds/deps 中持有相应的 dep。
   */
  if (Dep.target) {
    Dep.target.addDep(this);
  }
};
Dep.prototype.addSub = function addSub (sub) {
  this.subs.push(sub);
};

// 之前 Watcher 原型定义的方法
Watcher.prototype.addDep = function addDep (dep) {
  var id = dep.id;
  // 这里 if 判断保证的 watcher.newDeps 不会重复持有相同的 dep
  if (!this.newDepIds.has(id)) {
    this.newDepIds.add(id);
    this.newDeps.push(dep);
    // 这个 if 判断保证了 Dep.subs 中的依赖不会被重复添加
    if (!this.depIds.has(id)) {
      dep.addSub(this);
    }
  }
};

/**
 * 到此完成了 initWatch 函数的执行，即完成了 watch 的依赖收集。
 * 此时，共生成了两个 watcher: computed-watcher 和 user-watcher，并且 computed-watcher 更先生成，这个先后顺序是有关的。
 * 即 computed-watcher.id = 1; user-watcher.id = 2
 * 以及创建了 data.example 响应式属性对应依赖管理器 dep
 * 但是由于初始化过程中，computed-watcher.lazy = true，即计算属性在创建依赖时并没有马上完成依赖收集
 * 只有 user-watcher 在 new Watcher 创建依赖的同时，因为 this.get() => this.getter() 函数的调用，在初始化的同时即完成了依赖收集
 * 此时 data.example 的 dep.subs= [user-watcher]
 * user-watcher.newDeps = [dep]
 * 
 * 那计算属性的依赖收集在什么时机触发的呢？往下看
 */ 

// 整个 _init 函数在完成了 initState(vm) 函数的执行后，接下来会调用到本例中的 created 函数
Vue.prototype._init = function (options) {
  // 省略代码
  var vm = this;
  vm._self = vm;
  initLifecycle(vm);
  initEvents(vm);
  initRender(vm);
  callHook(vm, 'beforeCreate');
  initInjections(vm);
  initState(vm); // 初始 options 中的属性：initProps/initMethods/initData/initComputed/initWatch
  initProvide(vm);
  callHook(vm, 'created');

  if (vm.$options.el) {
    vm.$mount(vm.$options.el);
  }
};

// callHook(vm, 'created') 函数调用会执行下面我们定义的函数
created() {
  this.example = 'created changed'
  console.log('craeted logger', this.example)
}

/**
 * 此时可以看到 ceated 函数内进行了赋值操作，此时会触发 this.example 属性的 setter
 */
function reactiveSetter (newValue) {
    /**
     * 针对我们例子， getter = function () { return vm.example },
     * 执行 getter.call(obj) 函数获取 vm.example 的值，又会触发 vm.example 的 getter 函数，
     * 但因为当前之前 initWatch 调用 user-watcher.get() 后执行了 popTarget，所以此时 Dep.target = undefined，
     * 所以直接返回 vm.example = vm._data.exammple 的值
     */
    var value = getter ? getter.call(obj) : val; // value = 'default value'
    if (newVal === value || (newVal !== newVal && value !== value)) {
      return
    }

    // 省略代码...
    val = newVal;
    dep.notify(); 
  }
  
  /**
   * 1. 将 newVal 赋值给 val
   * 2. dep.notify() 看下这个函数的定义
   */
  Dep.prototype.notify = function notify () {
    var subs = this.subs.slice();
    // sort 函数调用确保派发更新时 watcher 的执行是按 new Watcher 创建的先后执行，也就是说组件内的 compued-watcher / user-watcher 永远在 render-watcher之前调用
    subs.sort(function (a, b) { return a.id - b.id; });
    for (var i = 0, l = subs.length; i < l; i++) {
      subs[i].update();
    }
  };  

  /**
   * 这里我们通过之前 initWatch 函数调用后，已经说过，因为 compued-watcher.lazy = true, 计算属性的依赖未被收集，只有当前的 user-watcher 被收集了。
   * 所以此时 subs = [user-watcher]，只有一个自定义的 watcher，我们看下它的 update 方法
   * 可以看到这里直接执行了 queueWatcher(this)
   */
  Watcher.prototype.update = function update () {
    /* istanbul ignore else */
    if (this.lazy) {
      this.dirty = true;
    } else if (this.sync) {
      this.run();
    } else {
      queueWatcher(this);
    }
  };

/**
 * 这里引入了一个队列的概念，这也是 Vue 在做派发更新的时候的一个优化的点:
 * 它并不会每次数据改变都触发 watcher 的回调，而是把这些 watcher 先添加到一个队列里，然后在 nextTick 后执行 flushSchedulerQueue。
 * 这里有几个细节要注意一下:
 *   首先用 has 对象保证同一个 Watcher 在一个 tick 中只被添加一次；
 *   最后通过 waiting 保证对 nextTick(flushSchedulerQueue) 的调用逻辑只有一次;
*/
var MAX_UPDATE_COUNT = 100;
var queue = [];
var has = {};
var waiting = false;
var flushing = false;
var index = 0;

function queueWatcher (watcher) {
  var id = watcher.id;
  if (has[id] == null) {
    has[id] = true;
    if (!flushing) {
      queue.push(watcher);
    } else {
      // 省略代码...
    }
    // queue the flush
    if (!waiting) {
      waiting = true;

      // 省略代码
      nextTick(flushSchedulerQueue);
    }
  }
}

/**
 * 可以看到这里执行了 nextTick 函数，此函数的源码这里不作解析，只要知道最终会执行类似下面的代码
 * Promise.resolve().then(flushSchedulerQueue)
 * 那这样就把当前的 user-watcher 的回调执行推入了异步队列。主线程继续执行
 * 即打印 create 函数中的 console.log('craeted logger', this.example)
 * 此时控制台终于有第一个 logger 输出了。
 * 
 * 接下来，主线程接着执行以下代码：vm.$mount(vm.$options.el);
 */
Vue.prototype._init = function (options) {
  // 省略代码...
  callHook(vm, 'beforeCreate');
  // 省略代码...
  initState(vm);
  // 省略代码...
  callHook(vm, 'created');

  if (vm.$options.el) {
    vm.$mount(vm.$options.el);
  }
};

/**
 * $mount 函数在 Vue 中有两个：
 * 1. 一个是核心渲染使用的，执行渲染挂载
 * 2. 一个是平台模块特有的，在 web 平台上，$mount 是执行模板编译功能，生成 代码字符串
 */
var mount = Vue.prototype.$mount; // 保留核心渲染使用的 $mount 
Vue.prototype.$mount = function ( // 改写 $mount 函数功能执行模板编译
  el,
  hydrating
) {
  el = el && query(el);

  /* 挂载点元素不能是 body 或者 document */
  if (el === document.body || el === document.documentElement) {
    warn(
      "Do not mount Vue to <html> or <body> - mount to normal elements instead."
    );
    return this
  }

  var options = this.$options;
  if (!options.render) { // 如果不存在 render
    var template = options.template;
    // 省略代码...
    if (template) {
      // 省略代码...
      // 如果 template 值存在，则进行模板解析，得到渲染函数，赋值给 render 属性。
      var ref = compileToFunctions(template, {
        outputSourceRange: "development" !== 'production',
        shouldDecodeNewlines: shouldDecodeNewlines,
        shouldDecodeNewlinesForHref: shouldDecodeNewlinesForHref,
        delimiters: options.delimiters,
        comments: options.comments
      }, this);
      var render = ref.render;
      var staticRenderFns = ref.staticRenderFns;
      options.render = render;
      options.staticRenderFns = staticRenderFns;

    }
  }
  return mount.call(this, el, hydrating)
};

/**
 * compileToFunction 函数将调用 Vue 的 baseCompiler 函数，执行模板编译：
 * 调用： parse(template.trim(), options) => optimize(ast, options) => generate(ast, options) 
 */
function baseCompile ( template, options) {
  var ast = parse(template.trim(), options);
  if (options.optimize !== false) {
    optimize(ast, options);
  }
  var code = generate(ast, options);
  return {
    ast: ast,
    render: code.render,
    staticRenderFns: code.staticRenderFns
  }
}

/**
 *  generate 函数返回的 code.render 就是代码字符串，用 with 语法包裹
 *  针对我们例子：template: `<div>{{ computed_value }}</div>`
 *  生成的代码字符串结果是 code.render = `with(this){return _c('div',[_v(_s(computed_value))])}`
 *  然后 code 会传入 new Function(code.render)执行，生成渲染函数赋值给 vm.$options.render
 */
function createFunction (code, errors) {
  try {
    return new Function(code)
  } catch (err) {
    errors.push({ err: err, code: code });
    return noop
  }
}

// 最后 vm.$options.render 函数：
function anonymous( ) {
  with(this){return _c('div',[_v(_s(computed_value))])}
}

/**
 * 到此，执行模板编译的 $mount 函数后，会调用：
 * return mount.call(this, el, hydrating)
 * 即调用核心的渲染 $mount 函数
 */
Vue.prototype.$mount = function (el, hydrating) {
  el = el && inBrowser ? query(el) : undefined;
  return mountComponent(this, el, hydrating)
};

function mountComponent ( vm, el, hydrating) {
  vm.$el = el;
  // 如果模板编译后，仍不存在 render 属性，则创建一个注释的空节点挂载
  if (!vm.$options.render) {
    vm.$options.render = createEmptyVNode;
  }
  callHook(vm, 'beforeMount');

  var updateComponent;
  // 省略代码...
  updateComponent = function () {
    vm._update(vm._render(), hydrating);
  };

  /**
   * 这里看到熟悉代码，在模板编译后的渲染函数中，先会 new Watcher，注意两点：
   * 1. 此时第五个实参 true，即 isRenderWatcher = true，所以这个 watcher 就是当前 new Vue 实例的组件级 watcher
   * 2. 传入的第二实参是 updateComponent 函数。第三个实参即回调函数 cb = noop，即空回调。这种创建 watcher 跟 计算属性的 watcher创建类似：第二种实参为函数，第三个实参回调为空函数
   */
  new Watcher(vm, updateComponent, noop, {
    before: function before () {
      if (vm._isMounted && !vm._isDestroyed) {
        callHook(vm, 'beforeUpdate');
      }
    }
  }, true /* isRenderWatcher */);
  hydrating = false;

  if (vm.$vnode == null) {
    vm._isMounted = true;
    callHook(vm, 'mounted');
  }
  return vm
}

/**
 * 经过前面 计算属性 创建 computed-watcher 和自定义 watch 创建 user-watcher 中对 Watcher的分析，
 * 我们知道此时 new Watcher 会触发 this.get() 函数执行
 */
var Watcher = function Watcher (
  vm,
  expOrFn,
  cb,
  options,
  isRenderWatcher
) {
  this.vm = vm;
  if (isRenderWatcher) { // 传入 true
    vm._watcher = this; // 此时 vm._wathcer = render-watcher
  }
  vm._watchers.push(this); // 当前组件所有 watcher：包含 render-watcher / user-watcher / computed-watcher
  if (options) {
    // 省略代码...
    this.before = options.before; // render-watcher 会传入这个属性，即isRenderWatcher=true
  } 
  this.cb = cb; // cb = noop
  this.id = ++uid$2;
  this.active = true;
  this.dirty = this.lazy; // 标记 computed-watcher 是否需要重新计算值，还是使用缓存的值 watcher.value
  this.deps = []; // 当前 watcher 被哪些 data 的 dep 所持有
  this.newDeps = [];
  this.depIds = new _Set();
  this.newDepIds = new _Set();
  this.expression = expOrFn.toString();
  // 
  if (typeof expOrFn === 'function') {
    this.getter = expOrFn; // 此时传入 updateComponent 函数 function () { vm._update(vm._render(), hydrating); };
  } else {
    // 省略代码...
  }

  /**
   * 这里 options.lazy = undefined，所以执行 this.get()
   */
  this.value = this.lazy
    ? undefined
    : this.get();
};

Watcher.prototype.get = function get () {
  pushTarget(this); // 将当前 render watcher 赋值 Dep.target，并且 targetStack = [render-watcher]
  var value;
  var vm = this.vm;
  try {
    value = this.getter.call(vm, vm);
  } catch (e) {
    if (this.user) {
      handleError(e, vm, ("getter for watcher \"" + (this.expression) + "\""));
    } else {
      throw e
    }
  } finally {
    // "touch" every property so they are all tracked as
    // dependencies for deep watching
    if (this.deep) {
      traverse(value);
    }
    popTarget();
    this.cleanupDeps();
  }
  return value
};

// 看上面的关键代码： this.getter.call(vm,vm)
// render wathcer 传入的 getter 就是 updateComponent 函数，即执行 vm._update(vm._render(), hydrating);
// 所以先执行 vm._render()
Vue.prototype._render = function () {
  var vm = this;
  var ref = vm.$options;
  var render = ref.render;
  // 省略代码...
  try {
    currentRenderingInstance = vm;
    vnode = render.call(vm._renderProxy, vm.$createElement);
  } catch (e) {
    // 省略代码...
  } finally {
    currentRenderingInstance = null;
  }
  // 省略代码...
  return vnode
};

/**
 * vm._render 函数执行 vm.$options.render 函数，即我们在模板编译生成的函数，即执行 with 语句
 */
function anonymous( ) {
  with(this){return _c('div',[_v(_s(computed_value))])}
}

/**
 * _v / _s 是在整个 Vue 构造函数初始化时 renderMixin => installRenderHelpers(Vue.prototype);
 * _c 是在 new Vue 实例化过程中 initRender 定义, vm._c => createElement => _createElement
 */
Vue.prototype._s = function toString (val) {
  return val == null
    ? ''
    : Array.isArray(val) || (isPlainObject(val) && val.toString === _toString)
      ? JSON.stringify(val, null, 2) // 如果是对象，直接输出字符串形式，这也是为什么调试时可以直接在 Vue 模板打印对象值的原因
      : String(val)
}

Vue.prototype._v =   function createTextVNode (val) {
  return new VNode(undefined, undefined, undefined, String(val))
}

/**
 * 这里的关键是代码是 _s 函数的执行，它会读取 vm.computed_value 的值
 * 那肯定会触发 vm._data.computed_value 的 getter
 * 
 * 针对我们的例子，vm._data.computed_example 的 getter 在实例化时 initComputed 中定义的
 */
vm.computed_example = {
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

/**
 * 在计算属性首次创建依赖时 this.dirty = this.lazy = true
 * 所以这次读取计算属性值时，调用 getter 函数执行，会触发它的 watcher.evaluate 函数执行
 * 1. 读取当前计算属性的值
 * 1. 将 dirty 设置 false，如果之后计算属性依赖的 data 没有变化，将不会再重新获取值，而使用缓存的 wathcer.value
 */
Watcher.prototype.evaluate = function evaluate () {
  this.value = this.get();
  this.dirty = false;
};

/**
 * 这里会调用 get 函数
 * 注意此时 pushTarget(this) 函数执行后的结果
 * 上面 mountComponent 函数调用创建 new wathcer 时已经推入了 render-watcher
 * 所以此时再将当前计算属性的 watcher 推入，即 targetStack = [render-watcher, computed-watcher]
 */
Watcher.prototype.get = function get () {
  pushTarget(this);
  var value;
  var vm = this.vm;
  try {
    value = this.getter.call(vm, vm);
  } catch (e) {
    // 省略代码
  } finally {
    // 省略代码
    popTarget(); // 完成 computed 获取值后
    this.cleanupDeps();
  }
  return value
};

/**
 * 接着执行 value = this.getter.call(vm, vm); 
 * 实际调用的是我们在 computed 定义的函数
 */
this.getter = function() {
  console.log('computed logger:', this.example)
  return this.example
}

// 所以这里会在控制台打印出第二个记录，此时控制台显示了 cteate 和 computed 的 logger
/**
 * 接着返回当前 this.example 的值，默认值是 default value，因为 craeated 函数中赋值修改了，所以此时值为 created changed
 * 
 * 另外，需要注意，这里读取 this.example 的值，相当于 this._data.example 的值 getter，仍旧会触发 dep.depend => Dep.target.addDep
 * 因为读取计算属性调用 computed-watcher.get 函数中调用了 pushTarget 函数，所以此时 Dep.target = computed-watcher
 * 
 * 即 computed-watcher.addDep(dep) 会做两步：
 * 1. 将当前 example 的 dep 添加到 computed-watcher 中的 newDeps 中
 * 2. 触发 dep.addSub(computed-watcher) 会将当前 computed-watcher 添加到 dep.subs 中。
 */
Watcher.prototype.addDep = function addDep (dep) {
  var id = dep.id;
  if (!this.newDepIds.has(id)) {
    this.newDepIds.add(id); 
    this.newDeps.push(dep); // 1. 将当前 example 的 dep 添加到 computed-watcher 中的 newDeps 中
    if (!this.depIds.has(id)) {
      dep.addSub(this); // 2. 触发 dep.addSub(computed-watcher) 会将当前 computed-watcher 添加到 dep.subs 中。
    }
  }
};

// 此时被观察的数据 data.example 对应的 dep.subs = [user-watcher, computed-watcher]
// 到此完成了计算属性的依赖收集
// 然后继承执行 computed-watcher.get 函数下面的代码
// popTarget() 函数将当前 computed-watcher 弹出依赖堆栈，此时恢复
// Dep.target = render-watcher; targetStack = [render-watcher]
Watcher.prototype.get = function get () {
  pushTarget(this);
  var value;
  var vm = this.vm;
  try {
    value = this.getter.call(vm, vm);
  } catch (e) {
    // 省略代码
  } finally {
    // 省略代码
    popTarget(); // 完成 computed 获取值后
    this.cleanupDeps(); // 每完成一次依赖收集，都要清理一下新旧依赖，这里不展开
  }
  return value
};

// 之后 return value，使得 computed-watcher.value = 'created changed'，并且 computed-watcher.dirty = false
Watcher.prototype.evaluate = function evaluate () {
  this.value = this.get();
  this.dirty = false;
};

/**
 * 完成计算属性的依赖收集之后，返回计算属性的 getter 函数，接着执行 if (Dep.target) {watcher.depend()}
 * 
 * 上面完成计算属性依赖收集之后执行了 popTarget()，所以此时 Dep.target = render-watcher; targetStack = [render-watcher]
 */
vm.computed_example = {
  get () {
    var watcher = this._computedWatchers && this._computedWatchers['computed_example'];
    if (watcher) {
      // watcher.dirty 标识符是专为 computed watcher 设定的，也是 computed 具有缓存特性的关键，它决定了计算属性返回缓存值学是获取新值
      if (watcher.dirty) { 
        watcher.evaluate(); 
      }
      if (Dep.target) { 
        // 此时 Dep.target 是 render-watcher
        // 这里会触发组件渲染依赖的收集：
        // render-watcher.depend() => computed-watcher.dep.depend() => Dep.target.addDep(dep) => dep.addSub(rener-watcher)
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

// 到下完成了 data.example 所有依赖的收集： example 对应的 dep.subs = [user-watcher, computed-watcher, render-watcher]
// 之后，渲染函数继续执行 _v 和 _c
function anonymous( ) {
  with(this){return _c('div',[_v('created changed')])}
}

// 最终 vm._render 函数生成嵌套的 vnode ，即虚拟节点树，类似下面
vnode = {
  tag:'div',
  children: [
    {
      text: 'created changed'
    }
  ]
}

// 然后将这个 vnode 传入 vm._update(vnode)，调用 patch 函数，挂载到视图上。
// new Vue 实例化的全局实例 vm.$vnode = undefined，注意组件实例的 Child.$vnode 有值
// 所以执行到最终 mountComponent 函数的最后
if (vm.$vnode == null) {
  vm._isMounted = true;
  callHook(vm, 'mounted');
}
return vm

// 即调用 callHook(vm, 'mounted)，执行我们自定义的 mounted 钩子函数
mounted() {
  console.log('mounted logger', this.value)
}
// 现在控制台输出第三条 logger 
// 到相主线程执行完毕，会处理异步任何队列中的回调。
// 因为我们在 create 函数中改变了我们观察的数据 example，派发过一次依赖更新，将 user-watcher 推入了异步队列 nextTick(flushSchedulerQueue);，
// 此时主线程完成了渲染，然后会从异步队列会取出回调执行，即 flushSchedulerQueue 函数

function flushSchedulerQueue () {
  currentFlushTimestamp = getNow();
  flushing = true;
  var watcher, id;
  // 可以看到这里还会对 watcher 做一次排列，前面 dep.notify() 调用也 sort 了。所以 watcher 的创建先后是比较重要的
  queue.sort(function (a, b) { return a.id - b.id; });

  /**
   * index 不能定义在局部，因为在队列执行过程中，可能还会有 watcher 插入队列，队列的 queue.length 会变化，并且当前遍历到的 index 在 queueWatcher 也要使用
  */
  for (index = 0; index < queue.length; index++) {
    watcher = queue[index];
    // 省略代码...
    id = watcher.id;
    has[id] = null; // 置空，避免 queueWatcher 能再次插入
    watcher.run();
    // 省略代码...
  }
  // 省略代码...
}

// 执行 user-watcher.run() 函数
Watcher.prototype.run = function run () {
  if (this.active) {
    var value = this.get(); // 取出当前 vm.example 最新值 ，即 'craete changed'
    if (
      value !== this.value ||
      // Deep watchers and watchers on Object/Arrays should fire even
      // when the value is the same, because the value may
      // have mutated.
      isObject(value) ||
      this.deep
    ) {
      // set new value
      var oldValue = this.value;
      this.value = value;
      if (this.user) { // 如果是自定义 user-watcher
        try {
          /**
           * 调用 user-wathcer 的回调，即此时打印出 watch logger
           */
          this.cb.call(this.vm, value, oldValue);
        } catch (e) {
          handleError(e, this.vm, ("callback for watcher \"" + (this.expression) + "\""));
        }
      } else {
        // 非 user-watcher, 即 computed-watcher 和 render-watcher 的回调 cb = noop，即空函数。
        this.cb.call(this.vm, value, oldValue);
      }
    }
  }
};

/**
 * 到此本例的答案，控制台输出的顺序是：
 * craeted logger created changed
 * computed logger: created changed
 * mounted logger created changed
 * watch logger: newValue:created changed, oldValue: default value
 */

 /**
  * 举一反三：
  * 如果在 mounted 函数中再改变一次 example 的值，那输出顺序又如何
  * 
  */
 created() {
    this.example = 'created changed'
    console.log('craeted logger', this.example)
  },
  mounted() {
    this.example = 'mounted changed'
    console.log('mounted logger', this.example)
  },
  computed: {
    computed_example() {
      console.log('computed logger:', this.example)
      return this.example
    }
  },
  watch: {
    example(newValue, oldValue) {
      console.log('watch logger: newValue:%s, oldValue: %s', newValue, oldValue)
    }
  }

  /**
   * 此时在主线程中，this.example = 'mounted changed' 的赋值，会导致 example的 setter 函数调用
   * setter => dep.notify => 对subs 排序 sort 后，循环遍历 subs[i].update
   * 此时 subs = [computed-watcher, user-watcher, render-watcher]，即每个个都会调用 watcher.update
   * 此时这三种依赖的执行结果就有区别了：
   * 首先 computed-watcher.update() 调用仅仅是把它的 computed-watcher.dirty = true
   * 再是 user-watcher.update() 调用会执行 queueWatcher，因为之前 created 函数中赋值已经把当前这个 user-watcher 推入异步队列，所以此时再触发这个依赖无法再推入队列会
   * 再是 render-watcher.update() 调用会把 rener-watcher 推入 queue 等待异步执行
   * 然后主线程打印第一次的 mouted 函数。之后取出异步任务回调执行 user-watcher 和 render-watcher 的 get
   * user-watcher.cb 执行打印
   * rener-watcher.run 执行会触发 this.get() ，再次执行 updateComponent => vm._update(vm._render)
   * 即打印 computed-watcher
   * 最后再打印 mounted函数
   * 
   * 所以结果是
  * craeted logger created changed
  * computed logger: created changed
  * mounted logger mouted changed
  * watch logger: newValue:mouted changed, oldValue: default value
  * computed logger: mouted changed
   */

   
   /**
    * 另外，如果在 user-watcher 中开启 immediate = true，会怎么输出呢？
    */
   created() {
    this.example = 'created changed'
    console.log('craeted logger', this.example)
  },
  mounted() {
    this.example = 'mounted changed'
    console.log('mounted logger', this.example)
  },
  computed: {
    computed_example() {
      console.log('computed logger:', this.example)
      return this.example
    }
  },
  watch: {
    example: {
      immediate: true,
      handler(newValue, oldValue) {
        console.log('watch logger: newValue:%s, oldValue: %s', newValue, oldValue)
      },
    }
  }

  /**
   * initWatch => createWatcher => vm.$watcher 函数在判断 immediate = true，执行一次回调，再接着执行 callHook(vm, 'create') 及接下去的渲染更新
    * watch logger: newValue:default value, oldValue: undefined
    * craeted logger created changed
    * computed logger: created changed
    * mounted logger mouted changed
    * watch logger: newValue: created changed, oldValue: default value
    */
   Vue.prototype.$watch = function (
    expOrFn,
    cb,
    options
  ) {
    var vm = this;
    if (isPlainObject(cb)) {
      return createWatcher(vm, expOrFn, cb, options)
    }
    options = options || {};
    options.user = true;
    // 创建 user-watcher ，并将 user-watchr 插入异步任务队列等待主线程空闲后执行
    var watcher = new Watcher(vm, expOrFn, cb, options);

    // 如果 immediate = true，立即调用回调
    /**
     * 所以自定义 watch 中如果开启了 immediate = true，则不能操作 DOM 相关逻辑，因为此时组件还没挂载，还执行到 $mount 函数渲染挂载视图。
     */
    if (options.immediate) {
      try {
        cb.call(vm, watcher.value);
      } catch (error) {
        handleError(error, vm, ("callback for immediate watcher \"" + (watcher.expression) + "\""));
      }
    }
    return function unwatchFn () {
      watcher.teardown();
    }
  };
}

