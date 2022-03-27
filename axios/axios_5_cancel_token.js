/**
 * CancelToken 取消请求：
 * 在取消HTTP请求的逻辑中，axios巧妙的使用了一个Promise来作为触发器，将resolve函数通过callback中参数的形式传递到了外部。
 * 这样既能够保证内部逻辑的连贯性，也能够保证在需要进行取消请求时，不需要直接进行相关类的示例数据改动，最大程度上避免了侵入其他的模块。
 */

 // 取消请求的基本用法：
 // axios.CancelToken.source 工厂函数

const CancelToken = axios.CancelToken;
const source = CancelToken.source(); 
/**
 * source() 函数就是一个工厂函数，用于创建 CancelToken 实例，会返回一个对象，对象包含 CancelToken 实例 和该实例对应的取消请求的方法 cancel
 * 
 * CancelToken 实例创建后使用时，将实例对象 source.token 作为配置值值传入请求的 config.cancelToken 中，然后如果在需要取消该请求时，调用取消实例对应的取消方法 source.cancel
 * 
 * config.cancelToken 可以全局配置或对应请求配置
 */
const instance = axios.create({
  cancelToken: source.token
})
// 或针对单个请求
axios.get(url, {
  cancelToken: source.token
})

// 取消当前请求
source.cancel('cancel reason')

/**
 * 源码
 * 1. CancelToken 构造函数的实现，及其 source 工厂函数
 * 2. config.cancelToken 属性的作用
 * 3. cancel 函数执行逻辑
 */
var axios = createInstance(defaults);
axios.CancelToken = CancelToken
axios.Cancel = Cancel
axios.isCancel = isCancel

/**
 * A `CancelToken` is an object that can be used to request cancellation of an operation.
 *
 * @class
 * @param {Function} executor The executor function.
 */
function CancelToken(executor) {
  if (typeof executor !== 'function') {
    throw new TypeError('executor must be a function.');
  }

  // token 就是 CancelToken 实例
  var token = this;


  var resolvePromise;
  this.promise = new Promise(function promiseExecutor(resolve) {
    resolvePromise = resolve;
  });
  
  executor(function cancel(message) {
    if (token.reason) {
      // Cancellation has already been requested
      // 如果当前实例 toekn 已经存在 reason 属性，说明请求已绑定一个取消实例
      // 即一个请求只能绑定个取消实例，但某个取消实例 cancelToken 可以应用于多个请求。
      return;
    }

    token.reason = new Cancel(message); // token.reason = {message, __CANCEL__: true}
    /**
     * axios 的 CancelToken api 的精髓就是 resolvePromise 函数的实现。
     */
    resolvePromise(token.reason);
  });
}

/**
 * Returns an object that contains a new `CancelToken` and a function that, when called,
 * cancels the `CancelToken`.
 */
CancelToken.source = function source() {
  var cancel;
  var token = new CancelToken(function executor(c) {
    cancel = c;
  });
  return {
    token: token,
    cancel: cancel
  };
};

/**
 * A `Cancel` is an object that is thrown when an operation is canceled.
 *
 * @class
 * @param {string=} message The message.
 */
function Cancel(message) {
  this.message = message;
}

Cancel.prototype.toString = function toString() {
  return 'Cancel' + (this.message ? ': ' + this.message : '');
};

Cancel.prototype.__CANCEL__ = true;


function isCancel(value) {
  return !!(value && value.__CANCEL__);
};


/**
 * 通过上面我们可以看到，当我们调用 source.cancel(message) 时，
 * 会创建一个取消的实例对象 cancel = {message, __CANCEL__：true}
 * 这个取消的对象会作为 resolve　函数的入参，保存在　cancelToken.promise　属性上。
 * 
 * 所以在请求发送前，通过　config.cancelToken.promise 来判断当前请求是否需要请求，如果已取消，则取消取消
 * 
 * 对 XMLHttpRequest 取消请求，即 xhr.abort()
 */

function xhrAdapter(config) {

  // 省略其它代码

  var request = new XMLHttpRequest();
  request.open(config.method.toUpperCase(), buildURL(fullPath, config.params, config.paramsSerializer), true);
  // 注册一系列请求监听事件 onreadystatechange onabort onerror ontimeout progress

  if (config.cancelToken) {
    // Handle cancellation
    config.cancelToken.promise.then(function onCanceled(cancel) {
      if (!request) {
        return;
      }

      request.abort();
      reject(cancel);
      // Clean up request
      request = null;
    });
  }

  request.send(requestData);
}

/**
 * 把关键代码整理下：
 */
// CancelToken
var resolvePromise;
this.promise = new Promise(function promiseExecutor(resolve) {
  resolvePromise = resolve;
});

// xhrAdapter
config.cancelToken.promise.then(function onCanceled(cancel) {
  if (!request) {
    return;
  }

  request.abort();
  reject(cancel);
  // Clean up request
  request = null;
});

/**
 * 可以关联起来
 */
resolvePromise = resolve = function onCanceled(cancel) {
                            if (!request) {
                              return;
                            }

                            request.abort();
                            reject(cancel);
                            // Clean up request
                            request = null;
                          }

// 而 resolvePromise 函数的调用时机，即 resolve 的触发时机，即 onCanceled 调用时机，就是 source.cancel() 调用的时候，所以 cancel 是 resolve 的触发器
// 即在 source.cancel 调用之前， cancelToken.promise 一直处理 pending 状态。
executor(function cancel(message) {
  if (token.reason) {
    return;
  }
  token.reason = new Cancel(message); // token.reason = {message, __CANCEL__: true}
  resolvePromise(token.reason);
});

/**
 * resolve 是取消语法的开头函数，通过一个闭包变量 resolvePromise 巧妙到把它移到外部暂存
 * 并把操作这个 resolve 开头函数的方法 cancel 又巧妙的作为构造函数的入参 executor 函数的参数传递到业务代码中。
 * 只要 resolve 函数不调用，即 cancel 不在外部调用，则 token.promise 就一直处理 pending 状态，如果调用了，promise 也会一直保留 fulfilled 的状态，
 * 直到在请求发送前，通过 token.promise.then() 调用去实现 fulfilled 的执行函数 onCanceled。
 * 
 * 一个 promise 如果状态已经确定 fulfiled 或 rejected 后，无论什么时候调用，或者重复调用多少次都会执行对应的 resolve 或 reject 函数。
 */

/**
 * 另外在 axios 的 dispatchRequest 函数中，会在发起请求前、请求响应成功后，请求响应失败后，分别判断当前请求是否已取消：
 */

/**
 * Throws a `Cancel` if cancellation has been requested.
 */
function throwIfCancellationRequested(config) {
  if (config.cancelToken) {
    config.cancelToken.throwIfRequested();
  }
}

/**
 * Throws a `Cancel` if cancellation has been requested.
 */
CancelToken.prototype.throwIfRequested = function throwIfRequested() {
  if (this.reason) {
    throw this.reason;
  }
};

function dispatchRequest(config) {
  // 发起请求前
  throwIfCancellationRequested(config);

  // 省略代码

  return adapter(config).then(function onAdapterResolution(response) {
    // 请求成功响应，返回响应数据前
    throwIfCancellationRequested(config);

    // Transform response data 对业务响应数据应用预定义的数据转换器
    response.data = transformData(
      response.data,
      response.headers,
      config.transformResponse
    );

    return response;
  }, function onAdapterRejection(reason) {
    // 如果是已经取消的请求，则 reason = {message, __CANCEL__: true}
    if (!isCancel(reason)) { 
      // 只有此时返回错误前还有取消，才进入。并在返回错误数据前再判断一次。
      throwIfCancellationRequested(config);

      // Transform response data
      if (reason && reason.response) {
        reason.response.data = transformData(
          reason.response.data,
          reason.response.headers,
          config.transformResponse
        );
      }
    }

    return Promise.reject(reason);
  });
};

/**
 * 所以在 AXIOS 中，dispatchRequest 核心函数，请求的参数的转换和错误的错误都在该函数中处理，包括取消请求的抛出信息
 */

/**
 * 总结：
 * CancelToken 实例含有的属性：
 * token = {
 *    reason： {message, __CANCEL__: true},
 *    promise,
 *    source, // 创建实例的工厂函数
 *    throwIfRequested, // 如果已取消，抛出取消原因的函数
 * }
 * 
 * Axios 取消请求的实现，最妙的是，通过 Promise 语法对  cancel 的赋值和调用
 */