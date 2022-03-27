/**
 * axios 支持 Promise API 调用
 * 
 * axios(config).then(res => {...}).catch(err => {...})
 * 
 * axios.all([axios.get(url), axios.get(url2)]).then(resArr => {...}).catch(err=>{...})
 * 
 * 通过上一节知道，不管是 axios(config) 还是 axios.get(url) 调用，最终调用的都是 Axios.prototype.request 方法
 * 
 * 所以，axios 支持 Promise API 的实现也是这里
 */

/**
 * Dispatch a request
 *
 * @param {Object} config The config specific for this request (merged with this.defaults)
 */
Axios.prototype.request = function request(config) {

  // 兼容 axios(config) 和 axios(url[, config]) 的调用方式，类似 fetch API
  if (typeof config === 'string') {
    config = arguments[1] || {};
    config.url = arguments[0];
  } else {
    config = config || {};
  }
  
  // 将自定义配置与默认配置合并
  config = mergeConfig(this.defaults, config);

  // Set config.method 将请求方法转为小写，没有传入的话，默认 get
  if (config.method) {
    config.method = config.method.toLowerCase();
  } else if (this.defaults.method) {
    config.method = this.defaults.method.toLowerCase();
  } else {
    config.method = 'get';
  }

  var chain = [dispatchRequest, undefined];
  var promise = Promise.resolve(config);

  // Axios 拦截器的实现
  this.interceptors.request.forEach(function unshiftRequestInterceptors(interceptor) {
    chain.unshift(interceptor.fulfilled, interceptor.rejected);
  });

  this.interceptors.response.forEach(function pushResponseInterceptors(interceptor) {
    chain.push(interceptor.fulfilled, interceptor.rejected);
  });

  while (chain.length) {
    promise = promise.then(chain.shift(), chain.shift());
  }

  return promise;
};

/**
 * 这里我们只关注 Axios 对 Promise API 的实现，忽略拦截器实现的代码，所以可以把代码精简成如下代码
 */
function request(config) {
  /**
   * 省略代码：
   * 1. 对 axios(config) 和 axios(url[, config]) 的兼容处理
   * 2. 对 config.method 的小写和默认值的处理
   */

  var promise = Promise.resolve(config);
  promise = promise.then(dispatchRequest)
  // 此时会把上一行代码中定义 promise 时传入的 config 对象传入 dispatchRequest 函数。
  // 即相当于执行 dispatchRequest(config)，但该函数的返回值就变成了 Promise 对象
  return promise
}

/**
 * 其中 dispatchRequest 函数也是返回一个 Promise 对象
 */
function dispatchRequest(config) {
  /**
   * 省略代码：
   * 1. 请求数据的转换
   * 2. 请求头的扁平化和修剪
   * 3. 请求成功或失败后响应数据的加工和转换
   */

  var adapter = config.adapter || defaults.adapter;
  return adapter(config).then(
    function onAdapterResolution(response) {/** 响应成功数据的加工和转换 */ return response},
    function onAdapterRejection(reason) {/** 响应错误数据的加工和转换 */ return Promise.reject(reason);}
  )
}

/**
 * 实际上，如果不考虑拦截器的实现原理，只考虑执行一个dispatchRequest 执行的话，因为 dispatchRequest 函数返回的就是 Promise 对象
 * 所以 request 函数也可以改为直接返回 dispatchRequest 函数执行结果
 */
function request(config) {
  var promise = Promise.resolve(config);
  promise = promise.then(dispatchRequest)
  return promise
}

// 变为
function request(config) {
  return dispatchRequest(config)
}

// 但是因为需要实现拦截器逻辑，所以增加一个执行链 chain 队列
function request(config) {
  var chain = [dispatchRequest, undefined];
  var promise = Promise.resolve(config);

  this.interceptors.request.forEach(function unshiftRequestInterceptors(interceptor) {
    chain.unshift(interceptor.fulfilled, interceptor.rejected);
  });

  this.interceptors.response.forEach(function pushResponseInterceptors(interceptor) {
    chain.push(interceptor.fulfilled, interceptor.rejected);
  });

  while (chain.length) {
    promise = promise.then(chain.shift(), chain.shift());
  }

  return promise;
}

// 所以，Axios 实现拦截器逻辑的代码是非常巧妙的。