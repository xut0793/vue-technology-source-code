//#region Dep 依赖管理器，或者说依赖注册中心
// 每个option.data 中的数据在 initData => defineReactive$$1 中会有一个对应的 dep = new Dep，用来管理其依赖 watcher

var uid = 0;

/**
  * A dep is an observable that can have multiple
  * directives subscribing to it.
  * subscriber 订阅者
  * observer 被观察的实例
  * dependency 依赖，即 watcher
  */
var Dep = function Dep () {
  this.id = uid++;
  this.subs = [];
};

Dep.prototype.addSub = function addSub (sub) {
  this.subs.push(sub);
};

Dep.prototype.removeSub = function removeSub (sub) {
  remove(this.subs, sub);
};

Dep.prototype.depend = function depend () {
  /**
   * 该方法最关键的点： Dep.target = watcher，会在数据的 getter 中设置 pushTarget(this)
   * 并且添加依赖不是直接调 this.addSub，而是绕到 dep.append(wathcer) => watcher.addDep(dep) => dep.addSub(wathcer)
   * 之所以这样绕一圈，是因为既需要在 dep.subs 中持有全部 watcher，又需要在每个 watcher 的 depIds/deps 中持有相应的 dep。
   */
  if (Dep.target) {
    Dep.target.addDep(this);
  }
};

Dep.prototype.notify = function notify () {
  // stabilize the subscriber list first
  var subs = this.subs.slice();
  if (!config.async) {
    // subs aren't sorted in scheduler if not running async， we need to sort them now to make sure they fire in correct order
    /**
     * 这里就会依赖 watcher.id 的从小到大的顺序，即 watcher 声明选后的顺序。
     * 以此保证后面 watcher.run 调用时，先派发父组件的依赖，再派发子组件依赖。
     */
    subs.sort(function (a, b) { return a.id - b.id; });
  }
  for (var i = 0, l = subs.length; i < l; i++) {
    subs[i].update(); // watcher.update => 根据watcher 类型不同决定： 如果是 computed-watcher，则 watcher.dirty=true，其它类型运行 watcher.run()
  }
};  

// The current target watcher being evaluated.
// This is globally unique because only one watcher
// can be evaluated at a time.
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

//#endregion