/**
 * axios 即可以当函数使用，也可以当对象使用
 * API:
 * axios(config)
 * axios(url[, config])
 * 
 * 使用工厂函数创建独立上下文环境的实例
 * instance = axios.create(config)
 * 
 * 请求的别名：instance 实例同样拥有这些方法
 * axios.request(config)
 * axios.get(url[, config])
 * axios.delete(url[, config])
 * axios.head(url[, config])
 * axios.options(url[, config])
 * axios.post(url[, data[, config]])
 * axios.put(url[, data[, config]])
 * axios.patch(url[, data[, config]])
 * 
 * 并发请求
 * axios.all(iterable)
 */

// 先看下我们导入的 axios 对象是怎么生成的
// import axios from 'axios'  或 const axios = require('axios')

// Create the default instance to be exported
var axios = createInstance(defaults);

/**
 * Create an instance of Axios
 *
 * @param {Object} defaultConfig The default config for the instance
 * @return {Axios} A new instance of Axios
 */
function createInstance(defaultConfig) {
  var context = new Axios(defaultConfig);
  var instance = bind(Axios.prototype.request, context);
  // instance(args) 相当于执行包装函数 function wrap(...args) {return context.request(args)}

  // Copy axios.prototype to instance
  // 将 Axios.prototype 上的方法都绑定到 context 上，并复制到 instance 上。
  utils.extend(instance, Axios.prototype, context);

  // Copy context to instance
  utils.extend(instance, context);

  return instance;
}

// 在 createInstance 函数内部可以知道，业务代码中使用的并不是直接 new Axios(defaultConfig) 的值，而是经过 bind 函数包装的值，所以看下 bind 函数的实现
function bind(fn, thisArg) {
  return function wrap() {
    var args = new Array(arguments.length);
    for (var i = 0; i < args.length; i++) {
      args[i] = arguments[i];
    }
    return fn.apply(thisArg, args);
  };
};

/**
 * 所以 bind 函数作用就是将某个函数绑定个特定的this下执行
 * bind 函数返回值就是一个包装函数，所以简单说业务代码使用的 axios 就是这个包装函数 wrap
 * 
 * axios = function wrap(...args) { return new Axios(defaultConfig).request(args)}
 * 
 * 此时 axios 作为函数使用，实现调用的是 Axios.prototype.requet(config) 方法。
 * 而函数类型本身也可以作用对象添加属性。所以通过 extend 函数向该包装函数添加对象属性
 */

/**
 * Extends object a by mutably adding to it the properties of object b.
 *
 * @param {Object} a The object to be extended
 * @param {Object} b The object to copy properties from
 * @param {Object} thisArg The object to bind function to
 * @return {Object} The resulting value of object a
 */
function extend(a, b, thisArg) {
  forEach(b, function assignValue(val, key) {
    if (thisArg && typeof val === 'function') {
      a[key] = bind(val, thisArg);
    } else {
      a[key] = val;
    }
  });
  return a;
}

// 将 Axios.prototype 上的方法都绑定到 context 上，并复制到 instance 上。即 axios.prototype.request / get / post 等等
utils.extend(instance, Axios.prototype, context);
// 将 Axios 实例属性都复制到 instance 上，即 axios.defaults 和 axios.interceptors
utils.extend(instance, context);

// 现在我们来看下 Axios.prototype 上的方法和 new Axios() 实例的属性，即 Axios 构造函数的定义

/**
 * Create a new instance of Axios
 *
 * @param {Object} instanceConfig The default config for the instance
 * @example
 * axios.interceptors.request.use(fulfilled, rejected)
 * axios.interceptors.response.use(fulfilled, rejected)
 */
function Axios(instanceConfig) {
  // 这两个实例属性就是 utils.extend(instance, context) 语句要拷贝的属性
  this.defaults = instanceConfig;
  this.interceptors = {
    request: new InterceptorManager(),
    response: new InterceptorManager()
  };
}

// 以下 Axios.prototype 上的属性即 utils.extend(instance, Axios.prototype, context) 语句要拷贝的属性
Axios.prototype.request = function request(config) {/*请求的核心代码，其它请求别名都是基于它*/}

// 基于 request 方法定义一系列别名方法，分为不包含和包含请求主体数据 data 两种情形。
utils.forEach(['delete', 'get', 'head', 'options'], function forEachMethodNoData(method) {
  Axios.prototype[method] = function(url, config) {
    return this.request(mergeConfig(config || {}, {
      method: method,
      url: url
    }));
  };
});

utils.forEach(['post', 'put', 'patch'], function forEachMethodWithData(method) {
  Axios.prototype[method] = function(url, data, config) {
    return this.request(mergeConfig(config || {}, {
      method: method,
      url: url,
      data: data
    }));
  };
});

/**
 * 总结：
 * 
 * 1. axios 即可以作为函数调用 axios(config)，也可以调用对象调用 axios.request(config)
 * 是因为在业务代码中导出的 axios 实际上是一个包装函数 wrap，该函数调用返回的是 Axios.prototype.request 方法
 * 
 * axios(config) => wrap(config) => Axios.propotype.request(config)
 * 
 * 而能作为对象使用，是因为函数也是对象类型一种，可以像对象一样添加属性和方法。
 * 所以将 Axios 实例属性和原型属性都通过 extend 函数拷贝到了包装函数 wrap 函数对象上。 
 * 
 * axios.request(config) => wrap.request(config) => Axios.prototype.request(config)
 */

/**
 * 并发的实现，即 Promise.all 的 api
 */
axios.all = function all(promises) {
  return Promise.all(promises);
};
  
