/**
 * Adapter 适配器的实现：
 * 1. 根据环境自动选择，浏览器环境基于 XMLHttpRequest，node 环境基于 http 模块
 * 2. 还可根据用户自行配置，降低耦合，且给用户留了口子，很人性化。
 */
function dispatchRequest(config) {
  // 省略代码

  var adapter = config.adapter || defaults.adapter;
  return adapter(config).then(function onAdapterResolution(response) {/**... */}, function onAdapterRejection(reason) {/**... */})
}

/**
 * adapter 优先使用配置对象中自定义的 adapter 函数，所以这里实现了适配器可以由用户自行配置。
 * 
 * 然后再看下，默认配置的适配器
 */

var defaults = {
  // 省略代码

  adapter: getDefaultAdapter(),
}

function getDefaultAdapter() {
  var adapter;
  if (typeof XMLHttpRequest !== 'undefined') {
    // For browsers use XHR adapter
    adapter = xhrAdapter;
  } else if (typeof process !== 'undefined' && Object.prototype.toString.call(process) === '[object process]') {
    // For node use HTTP adapter
    adapter = httpAdapter;
  }
  return adapter;
}

// 可以看到，Axios 通过检测 XMLHttpRequest 对象和 process 对象来区分浏览器环境和 node 环境。

/**
 * config 配置项优先级的合并策略。
 * 1. 内部定义 defaults 对象包含着默认配置项
 * 2. instance = axios.create(config) 创建实例时，传入的 config 自定义配置项，与 defaults 对象会合并。
 * 3. axios.post(url, data[,config]) 或 instance.post(url, data[,config]) 传入的配置项会也上面两步已合并的 defaluts 合并
 * 
 * 核发函数是 mergeConfig。但需要掌握的是合并优先级
 */

/**
 * 直接使用导入的 axios 时
 * 导入的 axios 使用 createInstance 函数传入的默认配置对象 defaults
 */
var axios = createInstance(defaults);

function createInstance(defaultConfig) {
  var context = new Axios(defaultConfig);
  var instance = bind(Axios.prototype.request, context);
  // 省略代码
  return instance;
}

function Axios(instanceConfig) {
  this.defaults = instanceConfig; // 此时 this.defauts 就是 defaults
  // 省略代码
}

/**
 * 如果创建独立的实例请求，会将传入的配置与默认配置合并
 * const instance = axios.create(instanceConfig)
 */
axios.create = function create(instanceConfig) {
	return createInstance(mergeConfig(axios.defaults, instanceConfig));
	// 将创建实例传入的配置与默认配置合并后，赋值给 this.defaults，作为自定义实例的默认配置
};


/**
 * 之后，不管是调用用 axios(config) axios(url[, config]) axios.request(config) axios.get(url)
 * 还是 instance(config) instance(url [, config]) instance.request(config) instance.get(url)
 * 实际调用的都是 Axios.prototype.request 函数。
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
  
    // 将方法传入的自定义配置与默认配置 defaultConfig 或创建实例中合并后的配置，再合并
	  config = mergeConfig(this.defaults, config);
	
	  // Set config.method
	  if (config.method) {
	    config.method = config.method.toLowerCase();
	  } else if (this.defaults.method) {
	    config.method = this.defaults.method.toLowerCase();
	  } else {
	    config.method = 'get';
    }
    
    // 省略代码
	
  };
	
	utils.forEach(['delete', 'get', 'head', 'options'], function forEachMethodNoData(method) {
	  Axios.prototype[method] = function(url, config) {
      // 处理 axios.get(url) 调用时 url 的配置
	    return this.request(mergeConfig(config || {}, {
	      method: method,
	      url: url
	    }));
	  };
	});
	
	utils.forEach(['post', 'put', 'patch'], function forEachMethodWithData(method) {
	  Axios.prototype[method] = function(url, data, config) {
      // 处理 axios.post(url, data[,config]) 的配置
	    return this.request(mergeConfig(config || {}, {
	      method: method,
	      url: url,
	      data: data
	    }));
	  };
  });
  
// 所以关注下 mergeConfig 函数的实现
/**
	 * Config-specific merge-function which creates a new config-object
	 * by merging two configuration objects together.
	 *
	 * @param {Object} config1 target 默认配置
	 * @param {Object} config2 source 自定义
	 * @returns {Object} New object resulting from merging config2 to config1
	 */
function mergeConfig(config1, config2) {
	  // eslint-disable-next-line no-param-reassign
	  config2 = config2 || {};
	  var config = {};
	
	  var valueFromConfig2Keys = ['url', 'method', 'data']; // 以用户自定义为准的 key
	  var mergeDeepPropertiesKeys = ['headers', 'auth', 'proxy', 'params']; // 需要深度合并的属性 key
	  var defaultToConfig2Keys = [ // 
	    'baseURL', 'transformRequest', 'transformResponse', 'paramsSerializer',
	    'timeout', 'timeoutMessage', 'withCredentials', 'adapter', 'responseType', 'xsrfCookieName',
	    'xsrfHeaderName', 'onUploadProgress', 'onDownloadProgress', 'decompress',
	    'maxContentLength', 'maxBodyLength', 'maxRedirects', 'transport', 'httpAgent',
	    'httpsAgent', 'cancelToken', 'socketPath', 'responseEncoding'
	  ];
	  var directMergeKeys = ['validateStatus']; // 直接合并的 key
	
	  function getMergedValue(target, source) {
	    if (utils.isPlainObject(target) && utils.isPlainObject(source)) {
	      return utils.merge(target, source);
	    } else if (utils.isPlainObject(source)) {
	      return utils.merge({}, source);
	    } else if (utils.isArray(source)) {
	      return source.slice();
	    }
	    return source;
	  }
	
	  function mergeDeepProperties(prop) {
	    if (!utils.isUndefined(config2[prop])) { // 用户有自定义的属性，则以用户为准进行合并
	      config[prop] = getMergedValue(config1[prop], config2[prop]);
	    } else if (!utils.isUndefined(config1[prop])) { // 保留不在默认属性内的用户自定义的属性
	      config[prop] = getMergedValue(undefined, config1[prop]);
	    }
	  }
	
	  utils.forEach(valueFromConfig2Keys, function valueFromConfig2(prop) {
	    if (!utils.isUndefined(config2[prop])) {
	      config[prop] = getMergedValue(undefined, config2[prop]);
	    }
	  });
	
	  utils.forEach(mergeDeepPropertiesKeys, mergeDeepProperties);
	
	  utils.forEach(defaultToConfig2Keys, function defaultToConfig2(prop) {
	    if (!utils.isUndefined(config2[prop])) { // 用户有定义，直接合并用户自定义的值
	      config[prop] = getMergedValue(undefined, config2[prop]);
	    } else if (!utils.isUndefined(config1[prop])) { // 否则合并默认配置属性值
	      config[prop] = getMergedValue(undefined, config1[prop]);
	    }
	  });
	
	  utils.forEach(directMergeKeys, function merge(prop) {
	    if (prop in config2) {
	      config[prop] = getMergedValue(config1[prop], config2[prop]);
	    } else if (prop in config1) {
	      config[prop] = getMergedValue(undefined, config1[prop]);
	    }
	  });
	
	  var axiosKeys = valueFromConfig2Keys
	    .concat(mergeDeepPropertiesKeys)
	    .concat(defaultToConfig2Keys)
	    .concat(directMergeKeys);
	
	  var otherKeys = Object
	    .keys(config1)
	    .concat(Object.keys(config2))
	    .filter(function filterAxiosKeys(key) {
	      return axiosKeys.indexOf(key) === -1;
	    });
	
	  utils.forEach(otherKeys, mergeDeepProperties);
	
	  return config;
  };
  
/**
 * Accepts varargs expecting each argument to be an object, then
 * immutably merges the properties of each object and returns result.
 *
 * When multiple objects contain the same key the later object in
 * the arguments list will take precedence.
 *
 * Example:
 *
 * ```js
 * var result = merge({foo: 123}, {foo: 456});
 * console.log(result.foo); // outputs 456
 * ```
 *
 * @param {Object} obj1 Object to merge
 * @returns {Object} Result of all merge properties
 */
function merge(/* obj1, obj2, obj3, ... */) {
  var result = {};
  function assignValue(val, key) {
    if (isPlainObject(result[key]) && isPlainObject(val)) {
      result[key] = merge(result[key], val);
    } else if (isPlainObject(val)) {
      result[key] = merge({}, val);
    } else if (isArray(val)) {
      result[key] = val.slice();
    } else {
      result[key] = val;
    }
  }

  for (var i = 0, l = arguments.length; i < l; i++) {
    forEach(arguments[i], assignValue);
  }
  return result;
}

/**
 * 总结：
 * 1. axios 库内部维护了一个默认配置对象 defaults，部分属性有默认值
 * 2. 如果有创建独立的请求实例，那传入的 instaceConfig 会与原来默认对象进行合并后，作为当前实例的默认配置对象 defaults
 * 3. 具体请求方法中传入的 config，会与默认配置对象再合并。
 * 
 * 所以优先级： 请求方法的配置 > 实例配置 > 默认配置
 */

