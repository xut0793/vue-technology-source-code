/**
 * transformData 数据转换器：
 * 分请求转换器 transformRequest 和响应转换器 transformResponse
 * 自动根据数据类型转换数据，不用用户手动转换，用户自行也可以在配置中自定义设置，很人性化。
 */

// 转换器函数都在默认对象中，包括默认的和用户传入的自定义的
var defaults = {
  // 省略其它属性

  transformRequest: [function transformRequest(data, headers) {
    // normalizeHeaderName 主要统一头字段大小写不统一的情况，如 Accept 和 accept  Content-Type 和 content-type
    normalizeHeaderName(headers, 'Accept');
    normalizeHeaderName(headers, 'Content-Type');
    // 如果请求数据格式是 formData ArrayBuffer Buffer File Blob 格式，直接使用
    if (utils.isFormData(data) ||
      utils.isArrayBuffer(data) ||
      utils.isBuffer(data) ||
      utils.isStream(data) ||
      utils.isFile(data) ||
      utils.isBlob(data)
    ) {
      return data;
    }
    if (utils.isArrayBufferView(data)) {
      return data.buffer;
    }

    // 如果 data 是 URLSearchParams 实例对象并且未设置头字段 Content-Type 时，则将请求头字段Content-Type 设置表单默认提交格式
    // 如果有配置头字段 Content-Type 时，以配置的为准
    if (utils.isURLSearchParams(data)) {
      setContentTypeIfUnset(headers, 'application/x-www-form-urlencoded;charset=utf-8');
      return data.toString();
    }
    // 如果 data 是普通对象并且未设置头字段 Content-Type 时，，则请求头字段 Content-Type 设置为 json 格式
    // 如果有配置头字段 Content-Type 时，以配置的为准
    if (utils.isObject(data)) {
      setContentTypeIfUnset(headers, 'application/json;charset=utf-8');
      return JSON.stringify(data);
    }
    return data;
  }],

  transformResponse: [function transformResponse(data, headers) {
    /**
     * 如果请求返回的data是字符串，可能是 JSON 字符串，尝试解析成对象
     */
    if (typeof data === 'string') {
      try {
        data = JSON.parse(data);
      } catch (e) { /* Ignore */ }
    }
    return data;
  }],
};

function normalizeHeaderName(headers, normalizedName) {
  utils.forEach(headers, function processHeader(value, name) {
    if (name !== normalizedName && name.toUpperCase() === normalizedName.toUpperCase()) {
      headers[normalizedName] = value;
      delete headers[name];
    }
  });
};

function setContentTypeIfUnset(headers, value) {
  if (!utils.isUndefined(headers) && utils.isUndefined(headers['Content-Type'])) {
    headers['Content-Type'] = value;
  }
}

// 使用转换器
function dispatchRequest(config) {
  // 省略其它代码

  // Transform request data 转换请求数据
  config.data = transformData(
    config.data,
    config.headers,
    config.transformRequest
  );


  var adapter = config.adapter || defaults.adapter;

  return adapter(config).then(function onAdapterResolution(response) {

    // Transform response data 对业务响应数据应用预定义的数据转换器
    response.data = transformData(
      response.data,
      response.headers,
      config.transformResponse
    );

    return response;
  }, function onAdapterRejection(reason) {
    if (!isCancel(reason)) {

      // Transform response data  对业务响应数据应用预定义的数据转换器
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


function transformData(data, headers, fns) {
  /*eslint no-param-reassign:0*/
  utils.forEach(fns, function transform(fn) {
    data = fn(data, headers);
  });

  return data;
};

/**
 * 总结：
 * 1. 数据转换器可以通过 config 的 transformRequest 和 transformResponse 属性定义
 * 2. 因为它是一个数组，为不覆盖原默认的处理函数，建立单独使用 axios.defaults.transformRequest.push(fn) 增加
 * 3. 请求数据转换器和响应数据转换器都在 dispatchRequest 函数内被调用。搂注册先后顺序调用，入参都是 data 和 headers
 */