//#region observere 被观察者的观察类 defineReactive 转为 getter setter 响应式

/*
  * not type checking this file because flow doesn't play well with
  * dynamically accessing methods on Array prototype
  */

var arrayProto = Array.prototype;
var arrayMethods = Object.create(arrayProto);

var methodsToPatch = [
  'push',
  'pop',
  'shift',
  'unshift',
  'splice',
  'sort',
  'reverse'
];

/**
  * Intercept mutating methods and emit events
  * 函数劫持：劫持数组原生的部分方法，在方法中依赖更新
  */
methodsToPatch.forEach(function (method) {
  // cache original method
  var original = arrayProto[method];
  def(arrayMethods, method, function mutator () {
    var args = [], len = arguments.length;
    while ( len-- ) args[ len ] = arguments[ len ];

    var result = original.apply(this, args);
    var ob = this.__ob__; // __ob__ 是在 new Observer 时将当前observer绑定到value，即value.__ob__=observer
    
    // 如果是向数组中插入新值，则需要将该新值转为响应式
    var inserted;
    switch (method) {
      case 'push':
      case 'unshift':
        inserted = args;
        break
      case 'splice':
        inserted = args.slice(2);
        break
    }
    if (inserted) { ob.observeArray(inserted); }

    // notify change 数组的任何变化都需要触发依赖更新
    ob.dep.notify();
    return result
  });
});

/*  */

var arrayKeys = Object.getOwnPropertyNames(arrayMethods);

/**
  * In some cases we may want to disable observation inside a component's
  * update computation.
  */
var shouldObserve = true;

function toggleObserving (value) {
  shouldObserve = value;
}

/**
  * Attempt to create an observer instance for a value,
  * returns the new observer if successfully observed,
  * or the existing observer if the value already has one.
  * 
  * 尝试为一个值创建一个 observer 观察者实例
  * 如果当前值是否已经有一个实例（value__ob__)，则返回该实例，否则新建一个 new Observer返回
  */
function observe (value, asRootData) {
  // isObject(value) {return obj !== null && typeof obj === 'object'}
  // 非对象类型数据或者 VNode 类型退出
  if (!isObject(value) || value instanceof VNode) {
    return
  }
  var ob;
  if (hasOwn(value, '__ob__') && value.__ob__ instanceof Observer) { // 如果 value.__ob__存在，且为 Observer 实例，则返回原来的__ob__
    ob = value.__ob__;
  } else if (
    shouldObserve &&                                                                       // 可以观察
    !isServerRendering() &&                                                                // 不是服务端渲染
    (Array.isArray(value) || isPlainObject(value)) && Object.isExtensible(value) &&        // 是数组或者普通对象，且对象可扩展
    !value._isVue                                                                          // 不是Vue实例
  ) {
    ob = new Observer(value);
  }
  if (asRootData && ob) {  // 是观察实例的options.data数据时，asRootData=true。查看initState(vm)/initData(vm)
    ob.vmCount++;
  }
  return ob
}


/**
  * Observer class that is attached to each observed
  * object. Once attached, the observer converts the target
  * object's property keys into getter/setters that
  * collect dependencies and dispatch updates.
  * 
  * 1. 设置 value.__ob__ = this
  * 2. value 是数组，调用 this.observeArray(value)
  * 3. value 是对象，调用 this.walk(value)，（如果命名 observerObject 列好理解）
  */
var Observer = function Observer (value) {
  this.value = value;
  def(value, '__ob__', this);
  this.dep = new Dep();
  // 这个 dep 有两个作用，1. 用于数组放置依赖；2. 在 user-watcher 定义 depp=true 时对下层对象值添加当前依赖，用于 traverse 深层遍历的优化
  this.vmCount = 0;
  if (Array.isArray(value)) {
    if (hasProto) { // var hasProto = '__proto__' in {};
      protoAugment(value, arrayMethods); // value__proto__ = arrayMethods
    } else {
      copyAugment(value, arrayMethods, arrayKeys); 
      // var arrayKeys = Object.getOwnPropertyNames(arrayMethods) 返回指定对象的所有自身属性的属性名,包括不可枚举的属性（enumberable:false)。Object.keys()只能获取可枚举的属性
    }
    this.observeArray(value);
  } else {
    this.walk(value);
  }
};

/**
  * Walk through all properties and convert them into
  * getter/setters. This method should only be called when
  * value type is Object.
  */
Observer.prototype.walk = function walk (obj) {
  var keys = Object.keys(obj);
  for (var i = 0; i < keys.length; i++) {
    defineReactive$$1(obj, keys[i]);
  }
};

/**
  * Observe a list of Array items.
  */
Observer.prototype.observeArray = function observeArray (items) {
  for (var i = 0, l = items.length; i < l; i++) {
    observe(items[i]);
  }
};

// helpers

/**
  * Augment a target Object or Array by intercepting
  * the prototype chain using __proto__
  */
function protoAugment (target, src) {
  /* eslint-disable no-proto */
  target.__proto__ = src;
  /* eslint-enable no-proto */
}

/**
  * Augment a target Object or Array by defining
  * hidden properties.
  */
/* istanbul ignore next */
function copyAugment (target, src, keys) {
  for (var i = 0, l = keys.length; i < l; i++) {
    var key = keys[i];
    def(target, key, src[key]);
  }
}


/**
  * Define a reactive property on an Object.
  */
function defineReactive$$1 (
  obj,
  key,
  val,
  customSetter,
  shallow
) {
  var dep = new Dep();

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
      if (Dep.target) { // 此时 Dep.target 是 render-watcher
        /**
          data() {
            return {
              str: 'str',
              arr: [1,2],
              name: {firstName: 'x'},
            }
          }

          data() {
            return {
              __ob__.dep
              str: {
                闭包-dep
                'str'
              },
              arr: {
                闭包-dep
                [1,2, __ob__.dep]
              },
              name: {
                闭包-dep
                firstName: {
                  __ob__.dep
                  闭包-dep
                  'x'
                }
              }
            }
          }
         */

        // 事实上，下面这段代码会让嵌套对象的每个属性都有两个 dep： 一个是 defineReactive 函数闭包中的 dep，一个是 observer实例中的 dep。
        // 对对象而言：闭包-dep 和 __ob__.dep 保存着一样的 watcher。但setter 中用到的是闭包 dep。而 __ob__.dep 用于 user-watcher 中 deep=true 时，traverse 深层遍历的优化
        // 对数组而言：闭包-dep 和 __ob__.dep 保存着一样的 watcher，setter 以及 traverse 中用到的都是 __ob__.dep
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
      var value = getter ? getter.call(obj) : val; 
      // 这里还会触发 dep.depend()，如果去重？
      // 在 watcher.addDep 函数中会有 if (!this.newDepIds.has(id)) 和 if (!this.depIds.has(id)) 的判断。 其中 newDepIds 和 depIds 都是 new Set() 类型。
      
      /* eslint-disable no-self-compare */
      if (newVal === value || (newVal !== newVal && value !== value)) {
        return
      }
      /* eslint-enable no-self-compare */
      if (customSetter) {
        customSetter();
      }
      // #7981: for accessor properties without setter
      if (getter && !setter) { return }
      if (setter) {
        setter.call(obj, newVal);
      } else {
        val = newVal;
      }
      childOb = !shallow && observe(newVal); // 设置的newVal也需要转为响应式
      dep.notify(); 
      // 遍历dep.subs中的每个watcher，调用watcher.update
      // 判断是computed-watcher，则 watcher.dirty=true，其它运行 watcher.run() 
      // run() => this.cb.call(this.vm, value, oldValue)
    }
  });
}

/**
  * Set a property on an object. Adds the new property and
  * triggers change notification if the property doesn't
  * already exist.
  */
function set (target, key, val) {
  if (isUndef(target) || isPrimitive(target)) {
    warn(("Cannot set reactive property on undefined, null, or primitive value: " + ((target))));
  }
  if (Array.isArray(target) && isValidArrayIndex(key)) {
    target.length = Math.max(target.length, key);
    target.splice(key, 1, val); // 如果是向数组添加元素，splice 插入会触发 dep.notify,并且观察新值，在上面重写的 arrayMethods
    return val
  }
  if (key in target && !(key in Object.prototype)) {
    target[key] = val; // 设置对象中已经是响应式的key，则直接赋值，会触发该key的setter，然后触发 dep.notify
    return val
  }
  var ob = (target).__ob__;
  if (target._isVue || (ob && ob.vmCount)) {
    warn(
      'Avoid adding reactive properties to a Vue instance or its root $data ' +
      'at runtime - declare it upfront in the data option.'
    );
    return val
  }
  if (!ob) { // 如果设置的目标对象本身就不是响应式对象，则不需要为其设置新值的响应式，直接赋值返回
    target[key] = val;
    return val
  }
  defineReactive$$1(ob.value, key, val);
  ob.dep.notify();
  return val
}

/**
  * Delete a property and trigger change if necessary.
  */
function del (target, key) {
  if (isUndef(target) || isPrimitive(target)
  ) {
    warn(("Cannot delete reactive property on undefined, null, or primitive value: " + ((target))));
  }
  if (Array.isArray(target) && isValidArrayIndex(key)) {
    target.splice(key, 1);
    return
  }
  var ob = (target).__ob__;
  if (target._isVue || (ob && ob.vmCount)) {
    warn(
      'Avoid deleting properties on a Vue instance or its root $data ' +
      '- just set it to null.'
    );
    return
  }
  if (!hasOwn(target, key)) {
    return
  }
  delete target[key];
  if (!ob) {
    return
  }
  ob.dep.notify();
}

/**
  * Collect dependencies on array elements when the array is touched, since
  * we cannot intercept array element access like property getters.
  */
function dependArray (value) {
  for (var e = (void 0), i = 0, l = value.length; i < l; i++) {
    e = value[i];
    e && e.__ob__ && e.__ob__.dep.depend();
    if (Array.isArray(e)) {
      dependArray(e);
    }
  }
}

//#endregion