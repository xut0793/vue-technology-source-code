/**
 * Axios 对 timeout 超时和 offline 断网状态的捕获
 * 思路：
 *  1. 在响应拦截器中捕获: axios.interceptors.response.use()
 *  2. 在捕获的错误进行判断：
 *    1. timeout 的状态标志：源码中标识请求超时 error.code = ECONNABORTED，且 error.message.includes('timeout')
 *    2. 断网标识： window.navigator.onLine = false
 */
axios.interceptors.response.use(function (response) {
  /**
   * xhr 请求正常发出有响应就算请求成功，此时 response.status 是标准的 http status 的值
   * 但 axios 通过 validateStatus 函数只对 2xx 的状态码响应到 reponse 这层
   * 另外，常见的业务系统返回的 data 是包装一层对象，其中包括自定义的业务错误码和数据
   * 
   * response = {
   *  data: responseData, // 常见的 json 返回结构： { code, data} code 业务状态码 data 业务数据
   *  status: request.status, // 2xx
   *  statusText: request.statusText,
   *  headers: responseHeaders,
   *  config: config,
   *  request: request
   * }
   */
  return response;
}, function (error) {
  /**
   * 当 http 请求失败时执行此回调
   * 1. 请求已发出，但请求状态码不在 2xx 范围内的，如 1xx, 4xx, 5xx 时，转入到 error 这层，且此时必存在 error.response
   * 2. 请求未发出时已失败：如 timeout 请求超时、abort 请求中断、断网等
   * 
   * error = {
   *  code, // null 或 ECONNABORTED（timeout / abort)
   *  message, // new Error(message) 时传入的 message
   *  config,
   *  request,
   *  response, // http 请求错误从这里取 response.status
   *  isAxiosError: true,
   *  toJSON: fn => object
   * }
   */

  const { response } = error
  if (response) {
    // 请求已发出，但返回请求出错，可以定义一个统一错误处理方法
    handleHttpError(response.status, response.statusText)
  } else {
    // 请求未发出，已报错
    if (!window.navigator.onLine) {
      // 处理断网的情况
      // eg:请求超时或断网时，更新 state 的 networkOnline 状态
      // network状态在app.vue中控制着一个全局的断网提示组件的显示隐藏
      // 关于断网组件中的刷新重新获取数据，会在断网组件中说明
      store.commit('changeNetwork', false);
    } else if (error.code == 'ECONNABORTED' && error.message.includes('timeout')) {
      // 请求请时的情况： 在 axios.defaut.timeout 设置超时时间
      // 可以定义超时重试次数，重新发起请求，当超出重试次数时报错
      const originalRequest = error.config
      axios.request(originalRequest)
    } else {
      // 其它错误，弹窗提示
    }
  }

  return Promise.reject(error);
});

/**
 * 源码分析：
 * 1. 哪些请求发出返回状态会进入 response 中？哪些请求错误会进入 error 中
 * 2. xhrAdapter 适配层对哪些 XHR 错误监控，并返回哪种状态错误消息
 */
module.exports = function xhrAdapter(config) {
  return new Promise(function dispatchXhrRequest(resolve, reject) {
    // 省略代码

    var request = new XMLHttpRequest();

    
    // Set the request timeout in MS
    request.timeout = config.timeout;
    
    /**
     * 哪些请求发出返回状态会进入 response 中？哪些请求错误会进入 error 中
     * 就是能触使 XHR readyState === 4 的时候
     */
    // Listen for ready state
    request.onreadystatechange = function handleLoad() {
      if (!request || request.readyState !== 4) {
        return;
      }

      // The request errored out and we didn't get a response, this will be
      // handled by onerror instead
      // With one exception: request that using file: protocol, most browsers
      // will return status as 0 even though it's a successful request
      if (request.status === 0 && !(request.responseURL && request.responseURL.indexOf('file:') === 0)) {
        return;
      }

      // Prepare the response
      var responseHeaders = 'getAllResponseHeaders' in request ? parseHeaders(request.getAllResponseHeaders()) : null;
      var responseData = !config.responseType || config.responseType === 'text' ? request.responseText : request.response;
      var response = {
        data: responseData,
        status: request.status,
        statusText: request.statusText,
        headers: responseHeaders,
        config: config,
        request: request
      };

      settle(resolve, reject, response);

      // Clean up request
      request = null;
    };
    
    /**
     * 请求错误
     */
    // Handle low level network errors
    request.onerror = function handleError() {
      // Real errors are hidden from us by the browser
      // onerror should only fire if it's a network error
      reject(createError('Network Error', config, null, request));

      // Clean up request
      request = null;
    };

    /**
     * xhrAdapter 适配层对哪些 XHR 错误监控，并返回哪种状态错误消息
     * 对 abort timeout 都返回 code = ECONNABORTED
     * 对 error 返回
     */
    // Handle browser request cancellation (as opposed to a manual cancellation)
    request.onabort = function handleAbort() {
      if (!request) {
        return;
      }

      reject(createError('Request aborted', config, 'ECONNABORTED', request));

      // Clean up request
      request = null;
    };

    // Handle timeout
    request.ontimeout = function handleTimeout() {
      var timeoutErrorMessage = 'timeout of ' + config.timeout + 'ms exceeded';
      if (config.timeoutErrorMessage) {
        timeoutErrorMessage = config.timeoutErrorMessage;
      }
      reject(createError(timeoutErrorMessage, config, 'ECONNABORTED',
        request));

      // Clean up request
      request = null;
    };

    // 省略代码
    // Send the request
    request.send(requestData);
  })
}


/**
 * 请求发起后的响应处理
 * Resolve or reject a Promise based on response status.
 *
 * @param {Function} resolve A function that resolves the promise.
 * @param {Function} reject A function that rejects the promise.
 * @param {object} response The response.
 */
module.exports = function settle(resolve, reject, response) {
  var validateStatus = response.config.validateStatus;
  if (!response.status || !validateStatus || validateStatus(response.status)) {
    resolve(response);
  } else {
    reject(createError(
      'Request failed with status code ' + response.status,
      response.config,
      null,
      response.request,
      response
    ));
  }
};

validateStatus: function validateStatus(status) {
  return status >= 200 && status < 300;
}


/**
 * 使用指定的消息、配置、错误代码、请求和响应创建一个错误。
 * Create an Error with the specified message, config, error code, request and response.
 *
 * @param {string} message The error message.
 * @param {Object} config The config.
 * @param {string} [code] The error code (for example, 'ECONNABORTED').
 * @param {Object} [request] The request.
 * @param {Object} [response] The response.
 * @returns {Error} The created error.
 */
module.exports = function createError(message, config, code, request, response) {
  var error = new Error(message);
  return enhanceError(error, config, code, request, response);
};

/**
 * 增加错误返回结构：使用指定的配置、错误代码和响应更新错误
 * Update an Error with the specified config, error code, and response.
 *
 * @param {Error} error The error to update.
 * @param {Object} config The config.
 * @param {string} [code] The error code (for example, 'ECONNABORTED').
 * @param {Object} [request] The request.
 * @param {Object} [response] The response.
 * @returns {Error} The error.
 */
module.exports = function enhanceError(error, config, code, request, response) {
  error.config = config;
  if (code) {
    error.code = code;
  }

  error.request = request;
  error.response = response;
  error.isAxiosError = true;

  error.toJSON = function toJSON() {
    return {
      // Standard
      message: this.message,
      name: this.name,
      // Axios
      config: this.config,
      code: this.code,
      
      // 省略代码
    };
  };
  return error;
};

/**
 * 通过 axios 中 createError 函数的调用，只有在请求发出后的 settle 函数处理中才传入了 reponse 参数。
 * 其它的 timeout abort onerror 都是没有 reponse 参数传入的。
 * 所以在响应拦截器，可以通过判断 error.response 是否存在来判断请求是否 http 请求出错。
 */