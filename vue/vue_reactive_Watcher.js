//#region watcher 观察者
/**
 * Class Watcher: 有三种：render-watcher / user-watcher / computed-watcher
 * 
 * watcher.user  - 用户在 option.watch 或调用 this.$watch() 自定义的 watcher，即 user-watch
 * watcher.lazy  - 用于标记 computed 中实例 watcher, 即 computed-watcher
 * watcher.dirty - 标记 computed-watcher 是否需要重新计算值，还是使用缓存的值 watcher.value
 * isRenderWatcher = true 时，表示当前实例化的 render-watcher ，实例赋值在 vm._watcher，也存入 vm._watchers
 *
 * Watcher.prototype 原型对象方法：
 * get(): 关键代码是开头 pushTarget(this) 和结尾的 popTarget()，以及 this.getter.call(vm,vm)
 * addDep(): 判断 dep 是否重复添加的关键，只有 watcher 中的 newDepIds 中不存在才添加 dep.addSub(this)
 * cleanupDeps(): get()方法执行的善后处理，处理 deps/newDeps 和 depIds/newDepIds。比如 v-if/v-else 这类视图，一次更新，if 绑定的数据依赖就不需要了，在新一轮依赖收集完成后，要将上一次旧的无用依赖清除掉，并将新的转为旧的，新的清空。
 * update(): 1. 对 computed-watcher 只设置 this.dirty=true，2. 其它 watcher，加入队列执行 queueWatcher(this)
 * run(): 执行实例 watcher 时传入的回调函数 this.cb.call(this.vm, value, oldValue);
 * evaluate(): 针对 computed-watcher ，获取 coputed 最新值
 * depend(): 循环遍历该 watcher 中的 dep，向其中再加入当前 watcher, 会计算属性 getter 有调用
 * teardown(): 将 watcher 从 dep.subs 中删除
 */


var uid$2 = 0;

/**
  * A watcher parses an expression, collects dependencies,
  * and fires callback when the expression value changes.
  * This is used for both the $watch() api and directives.
  */
var Watcher = function Watcher (
  vm,
  expOrFn,
  cb,
  options,
  isRenderWatcher
) {
  this.vm = vm;
  if (isRenderWatcher) { // mountComponent 函数中 new Watcher 会传入 isRenderWatcher = true
    vm._watcher = this; // render-watcher
  }
  vm._watchers.push(this);
  // options
  if (options) {
    this.deep = !!options.deep;
    this.user = !!options.user; // 用户在option.watch 或 this.$watch() 时自定义的 watcher，即 user-watch,
    this.lazy = !!options.lazy; // 用于标记 computed 中实例watcher,即 computed-watcher
    this.sync = !!options.sync;
    this.before = options.before; // render-watcher 会传入这个属性，即 beforeUpdate 钩子函数
  } else {
    this.deep = this.user = this.lazy = this.sync = false;
  }
  this.cb = cb;
  this.id = ++uid$2; // uid for batching
  this.active = true;
  this.dirty = this.lazy; // for lazy watchers 标记 computed-watcher 是否需要重新计算值，还是使用缓存的值 watcher.value
  this.deps = [];
  this.newDeps = [];
  this.depIds = new _Set();
  this.newDepIds = new _Set();
  this.expression = expOrFn.toString();
  // parse expression for getter
  if (typeof expOrFn === 'function') {
    this.getter = expOrFn; // computed watcher 和 updateComponent
  } else {
    this.getter = parsePath(expOrFn); // user watcher
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
  this.value = this.lazy
    ? undefined
    : this.get();
};

/**
  * Evaluate the getter, and re-collect dependencies.
  */
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
  * Add a dependency to this directive.
  */
Watcher.prototype.addDep = function addDep (dep) {
  var id = dep.id;
  if (!this.newDepIds.has(id)) {
    this.newDepIds.add(id);
    this.newDeps.push(dep);
    if (!this.depIds.has(id)) {
      dep.addSub(this);
    }
  }
};

/**
  * Clean up for dependency collection.
  */
Watcher.prototype.cleanupDeps = function cleanupDeps () {
  var i = this.deps.length;
  while (i--) {
    var dep = this.deps[i];
    if (!this.newDepIds.has(dep.id)) {
      dep.removeSub(this);
    }
  }
  var tmp = this.depIds;
  this.depIds = this.newDepIds;
  this.newDepIds = tmp;
  this.newDepIds.clear();
  tmp = this.deps;
  this.deps = this.newDeps;
  this.newDeps = tmp;
  this.newDeps.length = 0;
};

/**
  * Subscriber interface.
  * Will be called when a dependency changes.
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
  * Scheduler job interface.
  * Will be called by the scheduler.
  */
Watcher.prototype.run = function run () {
  if (this.active) {
    var value = this.get();
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
      if (this.user) {
        try {
          this.cb.call(this.vm, value, oldValue);
        } catch (e) {
          handleError(e, this.vm, ("callback for watcher \"" + (this.expression) + "\""));
        }
      } else {
        this.cb.call(this.vm, value, oldValue);
      }
    }
  }
};

/**
  * Evaluate the value of the watcher.
  * This only gets called for lazy watchers.
  */
Watcher.prototype.evaluate = function evaluate () {
  this.value = this.get();
  this.dirty = false;
};

/**
  * Depend on all deps collected by this watcher.
  */
Watcher.prototype.depend = function depend () {
    var i = this.deps.length;
    while (i--) {
      this.deps[i].depend();
    }
};

/**
  * Remove self from all dependencies' subscriber list.
  */
Watcher.prototype.teardown = function teardown () {
  if (this.active) {
    // remove self from vm's watcher list
    // this is a somewhat expensive operation so we skip it
    // if the vm is being destroyed.
    if (!this.vm._isBeingDestroyed) {
      remove(this.vm._watchers, this);
    }
    var i = this.deps.length;
    while (i--) {
      this.deps[i].removeSub(this);
    }
    this.active = false;
  }
};


/**
  * Push a watcher into the watcher queue.
  * Jobs with duplicate IDs will be skipped unless it's
  * pushed when the queue is being flushed.
  */
/**
 * 这里引入了一个队列的概念，这也是 Vue 在做派发更新的时候的一个优化的点:
 * 它并不会每次数据改变都触发 watcher 的回调，而是把这些 watcher 先添加到一个队列里，然后在 nextTick 后执行 flushSchedulerQueue。
 * 这里有几个细节要注意一下:
 *   首先用 has 对象保证同一个 Watcher 只添加一次；
 *   接着对 flushing 的判断当前是不是正在执行监听回调 cb() 的过程中，区别处理
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
      // if already flushing, splice the watcher based on its id
      // if already past its id, it will be run next immediately.
      // 当 flushSchedulerQueue 正进执行时，派发了依赖更新，则视 watcher.id 的先后插入到队列未执行的任务中
      var i = queue.length - 1;
      while (i > index && queue[i].id > watcher.id) {
        i--;
      }
      queue.splice(i + 1, 0, watcher);
    }
    // queue the flush
    if (!waiting) {
      waiting = true;

      if (!config.async) {
        flushSchedulerQueue();
        return
      }
      nextTick(flushSchedulerQueue);
    }
  }
}


/**
  * Flush both queues and run the watchers.
  */
function flushSchedulerQueue () {
  currentFlushTimestamp = getNow();
  flushing = true;
  var watcher, id;

  // Sort queue before flush.
  // This ensures that:
  // 1. Components are updated from parent to child. (because parent is always
  //    created before the child)
  // 2. A component's user watchers are run before its render watcher (because
  //    user watchers are created before the render watcher)
  // 3. If a component is destroyed during a parent component's watcher run,
  //    its watchers can be skipped.
  /**
   * queue.sort((a, b) => a.id - b.id) 对队列做了从小到大的排序，这么做主要有以下要确保以下几点：
   * 1.组件的更新由父到子；因为父组件的创建过程是先于子的，所以 watcher 的创建也是先父后子，执行顺序也应该保持先父后子。
   * 2.用户的自定义 watcher 要优先于渲染 watcher 执行；因为用户自定义 watcher 是在渲染 watcher 之前创建的。
   * 3.如果一个组件在父组件的 watcher 执行期间被销毁，那么它对应的 watcher 执行都可以被跳过，所以父组件的 watcher 应该先执行。
   * 
  */
  queue.sort(function (a, b) { return a.id - b.id; });

  // do not cache length because more watchers might be pushed
  // as we run existing watchers
  /**
   * index 不能定义在局部，因为在队列执行过程中，可能还会有 watcher 插入队列，队列的 queue.length 会变化，并且当前遍历到的 index 在 queueWatcher 也要使用
  */
  for (index = 0; index < queue.length; index++) {
    watcher = queue[index];
    if (watcher.before) {
      watcher.before();
    }
    id = watcher.id;
    has[id] = null;
    watcher.run();
    // in dev build, check and stop circular updates.
    if (has[id] != null) {
      circular[id] = (circular[id] || 0) + 1;
      if (circular[id] > MAX_UPDATE_COUNT) {
        warn(
          'You may have an infinite update loop ' + (
            watcher.user
              ? ("in watcher with expression \"" + (watcher.expression) + "\"")
              : "in a component render function."
          ),
          watcher.vm
        );
        break
      }
    }
  }

  // keep copies of post queues before resetting state
  var activatedQueue = activatedChildren.slice();
  var updatedQueue = queue.slice();

  // 队列执行完成后重置相关状态
  resetSchedulerState();

  // call component updated and activated hooks
  // 激活相关生命周期钩子函数
  callActivatedHooks(activatedQueue);
  callUpdatedHooks(updatedQueue);

  // devtool hook
  /* istanbul ignore if */
  if (devtools && config.devtools) {
    devtools.emit('flush');
  }
}

function resetSchedulerState () {
  index = queue.length = activatedChildren.length = 0;
  has = {};
  waiting = flushing = false;
}
//#endregion

//#region  stateMixin $watch crateWatcher

/**
 * initWatch: 扁平化处理 options.watch 中数组形式
 * stateMixin：prototype.$set / $delete / $watch
 * createWatcher: 扁平化处理 handler 对象形式、字符串形式
 * $watch: 1. option.user=true 标记当前watcher实例为 user-watcher；
 *         2. new Watcher() 创建watcher 实例
 *         3. options.immediate 判断是否需要立即执行一次 cb.call(vm, watcher.value);
 *         4. return unwatchFn，即 watcher.teardown()
 */

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

  function createWatcher (
    vm,
    expOrFn,
    handler,
    options
  ) {
    if (isPlainObject(handler)) {
      options = handler;
      handler = handler.handler;
    }
    if (typeof handler === 'string') {
      handler = vm[handler];
    }
    return vm.$watch(expOrFn, handler, options)
  }

  function stateMixin (Vue) {
    // flow somehow has problems with directly declared definition object
    // when using Object.defineProperty, so we have to procedurally build up
    // the object here.
    var dataDef = {};
    dataDef.get = function () { return this._data };
    var propsDef = {};
    propsDef.get = function () { return this._props };
    {
      dataDef.set = function () {
        warn(
          'Avoid replacing instance root $data. ' +
          'Use nested data properties instead.',
          this
        );
      };
      propsDef.set = function () {
        warn("$props is readonly.", this);
      };
    }
    Object.defineProperty(Vue.prototype, '$data', dataDef);
    Object.defineProperty(Vue.prototype, '$props', propsDef);

    Vue.prototype.$set = set;
    Vue.prototype.$delete = del;

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
      var watcher = new Watcher(vm, expOrFn, cb, options);
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

//#endregion

/**
   * Set a property on an object. Adds the new property and
   * triggers change notification if the property doesn't
   * already exist.
   */
  function set (target, key, val) {
    if (isUndef(target) || isPrimitive(target)
    ) {
      warn(("Cannot set reactive property on undefined, null, or primitive value: " + ((target))));
    }
    if (Array.isArray(target) && isValidArrayIndex(key)) {
      target.length = Math.max(target.length, key);
      target.splice(key, 1, val);
      return val
    }
    if (key in target && !(key in Object.prototype)) {
      target[key] = val;
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
    if (!ob) {
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