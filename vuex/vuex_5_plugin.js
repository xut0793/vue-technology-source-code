const myPlugin = store => {
  const removeMutationPlugin = store.subscribe((mutation, state) => {
    // 每次 mutation 之后调用
    // mutation 的格式为 { type, payload }
  })

  const removeActionPlugin = store.actionsSubscribe((action, state) => {
    // 每次 action 之后调用
    // action 格式 { type, payload }
  })
}

class Store {
  constructor(options = {}) {
    // 省略代码...

    // 存入插件函数
    this._subscribers = []; // 针对 mutaions 执行的插件
    this._actionSubscribers = []; // 针对 actions 执行的插件

    const {
      plugins = [],
      strict = false
    } = options;

    // 遍历执行插件函数
    plugins.forEach(plugin => plugin(this));
  }

  subscribe (fn, options) {
    return genericSubscribe(fn, this._subscribers, options)
  }

  subscribeAction (fn, options) {
    // fn 可以是对象，分别定义 before / after / error，即当前 action 方法执行前、执行后、执行出错时调用插件。
    const subs = typeof fn === 'function' ? { before: fn } : fn;
    return genericSubscribe(subs, this._actionSubscribers, options)
  }
}

function genericSubscribe (fn, subs, options) {
  if (subs.indexOf(fn) < 0) {
    options && options.prepend
      ? subs.unshift(fn)
      : subs.push(fn);
  }

  // 返回一个移除插件的函数
  return () => {
    const i = subs.indexOf(fn);
    if (i > -1) {
      subs.splice(i, 1);
    }
  }
}

// this._subscribe 在 mutation 方法执行后调用，所以调用时机在 commit 函数中
commit (_type, _payload, _options) {
  const { type, payload, options } = unifyObjectStyle(_type, _payload, _options);

  const entry = this._mutations[type];
  if (!entry) {
    console.error(`[vuex] unknown mutation type: ${type}`);
    return
  }
  this._withCommit(() => {
    entry.forEach(function commitIterator (handler) {
      handler(payload);
    });
  });

  // 针对 mutation 插件执行
  const mutation = { type, payload };
  this._subscribers
    .slice() // shallow copy to prevent iterator invalidation if subscriber synchronously calls unsubscribe
    .forEach(sub => sub(mutation, this.state));
}

dispatch (_type, _payload) {
  const { type, payload } = unifyObjectStyle(_type, _payload);

  const entry = this._actions[type];
  if (!entry) {
    console.error(`[vuex] unknown action type: ${type}`);
    return
  }

  const action = { type, payload };
  try {
    this._actionSubscribers
      .slice() // shallow copy to prevent iterator invalidation if subscriber synchronously calls unsubscribe
      .filter(sub => sub.before)
      .forEach(sub => sub.before(action, this.state));
  } catch (e) {
    console.warn(`[vuex] error in before action subscribers: `);
    console.error(e);
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
        console.warn(`[vuex] error in after action subscribers: `);
        console.error(e);
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

// 内置插件 logger 实现源码
function createLogger ({
  collapsed = true,
  filter = (mutation, stateBefore, stateAfter) => true,
  transformer = state => state,
  mutationTransformer = mut => mut,
  actionFilter = (action, state) => true,
  actionTransformer = act => act,
  logMutations = true,
  logActions = true,
  logger = console
} = {}) {
  return store => {
    let prevState = deepCopy(store.state);

    if (typeof logger === 'undefined') {
      return
    }

    if (logMutations) {
      store.subscribe((mutation, state) => {
        const nextState = deepCopy(state);

        if (filter(mutation, prevState, nextState)) {
          const formattedTime = getFormattedTime();
          const formattedMutation = mutationTransformer(mutation);
          const message = `mutation ${mutation.type}${formattedTime}`;

          startMessage(logger, message, collapsed);
          logger.log('%c prev state', 'color: #9E9E9E; font-weight: bold', transformer(prevState));
          logger.log('%c mutation', 'color: #03A9F4; font-weight: bold', formattedMutation);
          logger.log('%c next state', 'color: #4CAF50; font-weight: bold', transformer(nextState));
          endMessage(logger);
        }

        prevState = nextState;
      });
    }

    if (logActions) {
      store.subscribeAction((action, state) => {
        if (actionFilter(action, state)) {
          const formattedTime = getFormattedTime();
          const formattedAction = actionTransformer(action);
          const message = `action ${action.type}${formattedTime}`;

          startMessage(logger, message, collapsed);
          logger.log('%c action', 'color: #03A9F4; font-weight: bold', formattedAction);
          endMessage(logger);
        }
      });
    }
  }
}

function startMessage (logger, message, collapsed) {
  const startMessage = collapsed
    ? logger.groupCollapsed
    : logger.group;

  // render
  try {
    startMessage.call(logger, message);
  } catch (e) {
    logger.log(message);
  }
}

function endMessage (logger) {
  try {
    logger.groupEnd();
  } catch (e) {
    logger.log('—— log end ——');
  }
}

function getFormattedTime () {
  const time = new Date();
  return ` @ ${pad(time.getHours(), 2)}:${pad(time.getMinutes(), 2)}:${pad(time.getSeconds(), 2)}.${pad(time.getMilliseconds(), 3)}`
}