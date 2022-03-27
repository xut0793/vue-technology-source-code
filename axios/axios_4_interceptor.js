/**
 * interceptor 拦截器的实现：
 * 将请求拦截器 interceptor.request 和响应拦截器 interceptor.response 分别放在chain数组的两端，中间是发送请求的方法，一步一步成对执行，将这么多promise进行串联，非常巧妙。
 */

/**
 * axios 拦截器的基本使用
 */
// 添加请求拦截器
axios.interceptors.request.use(function (config) {
  // 在发送请求之前做些什么， config 合并后的配置对象
  return config;
}, function (error) {
  // 对请求错误做些什么
  return Promise.reject(error);
});

// 添加响应拦截器
axios.interceptors.response.use(function (response) {
  // 对响应数据做点什么
  return response;
}, function (error) {
  // 对响应错误做点什么
  return Promise.reject(error);
});

// use 函数注册的每个拦截器都会返回其注册的序号，可以用于取消该拦截器，类似注册定义器如 timer = setTimeout() 和取消定义器 clearTimeout(timer)
const myInterceptor = axios.interceptors.request.use(function () {/*...*/});
axios.interceptors.request.eject(myInterceptor);

/**
 * 源码
 * 注册 interceptors 对象
 */
function Axios(instanceConfig) {
  this.defaults = instanceConfig;
  this.interceptors = {
    request: new InterceptorManager(),
    response: new InterceptorManager()
  };
}

// 可以看到不管是注册请求拦截器还是注册响应拦截器，内部调用的都是一个单独的 InterceptorManager 实例
function InterceptorManager() {
  // 维护了一个存放拦截器的数组，内部存入一个对象，对象包含已解决和报错的处理句柄
  this.handlers = [];
}

	/**
	 * Add a new interceptor to the stack
	 *
	 * @param {Function} fulfilled The function to handle `then` for a `Promise`
	 * @param {Function} rejected The function to handle `reject` for a `Promise`
	 *
	 * @return {Number} An ID used to remove interceptor later
	 */
	InterceptorManager.prototype.use = function use(fulfilled, rejected) {
	  this.handlers.push({
	    fulfilled: fulfilled,
	    rejected: rejected
	  });
	  return this.handlers.length - 1; // 返回一个可用于移除拦截器的序号
	};
	
	/**
	 * Remove an interceptor from the stack
	 *
	 * @param {Number} id The ID that was returned by `use`
	 */
	InterceptorManager.prototype.eject = function eject(id) {
	  if (this.handlers[id]) {
	    this.handlers[id] = null;
	  }
	};
	
	/**
	 * Iterate over all the registered interceptors
	 *
	 * This method is particularly useful for skipping over any
	 * interceptors that may have become `null` calling `eject`.
	 *
	 * @param {Function} fn The function to call for each interceptor
	 */
	InterceptorManager.prototype.forEach = function forEach(fn) {
	  utils.forEach(this.handlers, function forEachHandler(h) { 
      // h = {fulfilled: fulfilled, rejected: rejected}
	    if (h !== null) { // 取消某个拦截器就是将 handlers 数组对应项设置为 null，所以这里判断就会跳过 null 项
	      fn(h);
	    }
	  });
  };
  
  /** 
   * 执行拦截器函数
   * 
   * axios 不管如果调用，都集中到 Axios.prototype.request 方法
   */
  Axios.prototype.request = function request(config) {
	  // 省略代码：处理 config 配置对象
	
	  // 定义一个请求处理事务链
	  var chain = [dispatchRequest, undefined];
    
    // 将请求拦截器插入 chain 的头部，在业务代码中如果有多个，则代码位置靠后定义的先执行
	  this.interceptors.request.forEach(function unshiftRequestInterceptors(interceptor) {
	    chain.unshift(interceptor.fulfilled, interceptor.rejected);
	  });
  
    // 将响应拦截器插入 chain 的尾部，在业务代码中如果有多个，则代码位置靠后的后执行
	  this.interceptors.response.forEach(function pushResponseInterceptors(interceptor) {
	    chain.push(interceptor.fulfilled, interceptor.rejected);
	  });
  
    var promise = Promise.resolve(config);
	  while (chain.length) {
	    promise = promise.then(chain.shift(), chain.shift());
	  }
	
	  return promise;
  };
  
  /**
   * 总结：
   * 1. 拦截器的注册都是成对的 fulfilled 和 rejected
   * 2. 请求拦截器先注册的后执行，并且需要返回拦截器处理后的 config 对象给请求方法 dispatchRequest 作为入参
   * 3. 响应拦截器先注册先执行。入参是 dispatchRequest 方法返回的响应对象 response
   */
  // 请求拦截器入参的配置对象 config 数据结构：
  interface AxiosRequestConfig {
    baseURL?: string
    url?: string
    method?: string // get
    params?: any // url query 查询参数对象
    paramsSerializer?: (params: any) => string // 负责 `params` 序列化的函数，借用 qs 库：（params) => {return Qs.stringify(params, {arrayFormat: 'brackets'}) }
    data?: any // 请求主体数据，只适用于这些请求方法 'PUT', 'POST', 和 'PATCH'
    headers?: any // 请求头
    responseType?: XMLHttpRequestResponseType // 响应数据类型，默认 json，也可以是 'arraybuffer', 'blob', 'document', 'json', 'text', 'stream'（node专属）
    transformRequest?: AxiosTransformer | AxiosTransformer[] // 请求数据转换器，默认有提供一个根据请求 data 类型判断修改 Content-Type 的函数：formData / isArrayBuffer / isStream / isFile / isBlob / isArrayBufferView / isURLSearchParams / isObject
    transformResponse?: AxiosTransformer | AxiosTransformer[] // 响应数据转换器，默认有提供一个将 reponse 数据转换为 json 格式的函数: (data) => { if (typeof data === 'string') { type {data = JSON.parse(data)} catch(e) {}} return data }
    validateStatus?: (status: number) => boolean // 请求响应状态校验：默认函数：（status) => {return status >= 200 && status < 300 }
    withCredentials?: boolean // 表示跨域请求时是否需要使用凭证，默认值 false
    auth?: AxiosBasicCredentials // 将设置一个 `Authorization` 头，覆写掉现有的任意使用 `headers` 设置的自定义 `Authorization`头
    timeout?: number // 请求超时设置，默认值0，代表无超时时间
    xsrfCookieName?: string // 默认值 'XSRF-TOKEN'
    xsrfHeaderName?: string // 默认值 'X-XSRF-TOKEN'
    adapter?: AxiosAdapter // getDefaultAdapter() 默认适配器，在浏览器环境下 XMLHttpRequest,
    proxy?: ProxyDefaultType // 定义代理服务器的主机名称和端口
    cancelToken?: CancelToken // 指定用于取消请求的 cancel token
    onUploadProgress?: (e: ProgressEvent) => void // 上传进度处理函数
    onDownloadProgress?: (e: ProgressEvent) => void // 下载进度处理函数
  }

  // 响应拦截器入参的响应对象 response 数据结构，在 xhrAdapter 函数内组装响应数据
  interface AxiosResponse {
    data: T // 业务代码返回数据结构
    status: number
    statusText: string
    headers: any // 响应头
    config: AxiosRequestConfig
    request: any // request = new XMLHttpRequest() 请求实例
  }

