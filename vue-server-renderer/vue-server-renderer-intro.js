/**
 * 服务端服务阶段：
 * 一、webpack 编译阶段:
 *  1.1 入口 entry-client.js 生成用于客户端浏览器渲染的 js 文件和一份用于template组装的json 文件：vue-ssr-server-bundle.json
 *  1.2 服务端打包入口 entry-server.js，生成客户端渲染的 json 文件：vue-ssr-server-bundle.json
 * 
 * 该阶段依赖于 webpack.client.config.js 和 webpack.server.config.js 构建文件，
 * 其中依赖于 vue-server-renderer 的两个插件包：vue-server-renderer/client-plugin 和 vue-server-renderer/server-plugin
 */
/**
 * Server Bundle中 vue-ssr-server-bundle.json 包含了所有要在服务端运行的代码列表，和一个入口文件名。
 */
{ 
  "entry": "static/js/app.80f0e94fe005dfb1b2d7.js", 
  "files": { 
    "app.80f0e94fe005dfb1b2d7.js": "module.exports=function(t...", // 所有服务端运行的代码
  } 
}
/**
 * Client Bundle 包含了所有需要在客户端运行的脚本和静态资源，如：js、css图片、字体等。
 * 还有一份clientManifest文件清单：vue-ssr-client-manifest.json:
 * 清单中initial数组中的js将会在ssr输出时插入到html字符串中作为preload和script脚本引用。
 * async和modules将配合检索出异步组件和异步依赖库的js文件的引入，在输出阶段我们会详细解读。
 */
{ 
  "publicPath": "//cdn.xxx.cn/xxx/", 
  "all": [ 
    "static/js/app.80f0e94fe005dfb1b2d7.js", 
    "static/css/app.d3f8a9a55d0c0be68be0.css"
  ], 
  "initial": [ 
    "static/js/app.80f0e94fe005dfb1b2d7.js",
    "static/css/app.d3f8a9a55d0c0be68be0.css"
  ], 
  "async": [ 
    "static/js/xxx.29dba471385af57c280c.js" 
  ], 
  "modules": { 
    "00f0587d": [ 0, 1 ] 
    // 省略... 
    } 
}

/**
 * 二、初始化阶段
 * server.js
 * ssr应用会在node启动时初始化一个renderer单例对象
 * renderer对象由vue-server-renderer库的createBundleRenderer函数创建，函数接受两个参数，serverBundle 内容和 options 配置
 */
// server.js
const template = fs.readFileSync(path.join(process.cwd(), './index.template.html'), 'utf-8')
const serverBundle = require('./dist/server/vue-ssr-server-bundle.json')
const clientManifest = require('./dist/client/vue-ssr-client-manifest.json')
const renderer = VueServerRenderer.createBundleRenderer(serverBundle, {
  runInNewContext: false,
  inject: true,
  template,
  clientManifest
})


/**
 * 三、渲染阶段
 * 初始化完成，当用户发起请求时，renderer.renderToString 或者 renderer.renderToStream 函数将完成 vue组件到 html 字符串的过程。
 * 
 * bundleRenderer.renderToString 函数并传入用户上下文context 对象
 * context 对象可以包含一些服务端的信息，比如：url、a等等，也可以包含一些用户信息，用于 template 模板的组装。
 * 其中 context.state / context.rendered 在使用 createBundleRenderer 创建的 renderer 中会在内部添加
 */
server.get('*', (req, res) => {
  const context = {url: req.url}
  renderer.renderToString(context).then(html => {
    res.status(200)
    res.set('Content-Type', 'text/html')
    res.send(html)
  }).catch((err) => {
    console.error(err);
    res.status(500).end('Internal Server')
  })
})

/**
 * 如果使用了vue-router库，则在创建vue实例时，调用router.push(url) 后 router 开始导航，
 * router 负责根据 url 匹配对应的 vue 组件并实例化他们，最后在router.onReady回调函数中返回整个vue实例。
 */
import { createApp } from './app.js';
export default (context) => {
  return new Promise((reslove, reject) => {
    const { app, router, store } = createApp()
    
    router.push(context.url)
    router.onReady(() => {
      /**
       * 组件内部使用 asyncData 预求数据时需要这段代码
       * 如果在组件内部使用 vue 2.6.x 以上的 API：serverPrefetch ，则不需要，vue-server-renderer 会内部自动处理，见下面
       */
      const matchedComponents = router.getMatchedComponents()

      if (!matchedComponents.length) {
        return reject({code: 404, message: 'Not Found!'})
      }

      Promise.all(matchedComponents.map(Component => {
        if (Component.asyncData) {
          return Component.asyncData({
            store,
            route: router.currentRoute
          })
        }
      })).then(() => {
        reslove(app)
      }).catch(reject)

      /**
       * 在 serverPrefetch() 执行之后，我们需要知道应用在什么时候渲染完成，在server render 上下文中，我们可以使用rendered()钩子方法。
       * context.rendered vue 2.6.x 新API：组件渲染后调用
       * 
       * 在内部的 render 函数回调中：
       * if (context && context.rendered) {
       *     context.rendered(context);
       * }
       */
      // context.rendered = () => {
      //   context.state = store.state;
      // };
      // resolve (app)
    }, reject)
  })
}

/**
 * 四、HTML 内容输出阶段
 * 渲染阶段我们已经拿到了vue组件渲染结果，它是一个html字符串，
 * 在浏览器中展示页面我们还需要css、js 等依赖资源的引入标签 和 通过 store 同步我们在服务端的渲染数据，
 * 这些最终组装成一个完整的 html 报文输出到浏览器中。
 * 
 * Vue 提供两种选项：
 * 1. 没有定义 template 模板： 需要在服务端使用其它模板引擎来渲染：此时页页DOM结构为 html字符，其它依赖资源存在 context 对象上。
 *   const styles = context.renderStyles();
 *   const scripts = context.renderScripts();
 *   const resources = context.renderResourceHints();
 *   const states = context.renderState();
 * 
 * 2. 定义了 template 模板：在初始化阶段将模板文件传入 createBundleRenderer 函数的配置对象参数中，在内部会使用生成的 TemplateRenderer 来解析模板。
 * 实际上 createBundleRenderer 函数调用会生成: renderer 用来渲染 vue 组件成 marker；templateRenderer 用来处理组装模板文件成最终输出的 html，此时就会使用 clientManifest
 */
function renderToString (
  component,
  context,
  cb
) {
  var assign;

  if (typeof context === 'function') {
    cb = context;
    context = {};
  }
  if (context) {
    templateRenderer.bindRenderFns(context);
  }

  // no callback, return Promise
  var promise;
  if (!cb) {
    assign = createPromiseCallback()
    promise = assign.promise
    cb = assign.cb
  }

  var result = '';
  var write = createWriteFunction(function (text) {
    result += text;
    return false
  }, cb);
  try {
    //渲染阶段： renderer 用来渲染 vue 组件成 marker；
    render(component, write, context, function (err) {
      if (err) {
        return cb(err)
      }
      if (context && context.rendered) {
        // vue 组件渲染完成回调时机
        context.rendered(context);
      }
      if (template) {
        try {
          // 在渲染阶段的回调中，组装输出 HTL：templateRenderer 用来处理组装模板文件成最终输出的 html，此时就会使用 clientManifest
          var res = templateRenderer.render(result, context);
          if (typeof res !== 'string') {
            // function template returning promise
            res.then(function (html) { return cb(null, html); }).catch(cb);
          } else {
            cb(null, res);
          }
        } catch (e) {
          cb(e);
        }
      } else {
        cb(null, result);
      }
    });
  } catch (e) {
    cb(e);
  }

  return promise
}
/**
 * 利用闭包来兼容 cb 回调和 promise 两种写法
 * fn(arg, (err, res) => {...})
 * fn(arg).then(res => {...}).catch(err => {...})
 */
function createPromiseCallback () {
  var resolve, reject;
  var promise = new Promise(function (_resolve, _reject) {
    resolve = _resolve;
    reject = _reject;
  });
  var cb = function (err, res) {
    if (err) { return reject(err) }
    resolve(res || '');
  };
  return { promise: promise, cb: cb }
}
 

 /**
  * 五、客户端激活阶段
  * 当客户端发起了请求，服务端返回 HTML，用户就已经可以看到页面渲染结果了，不用等待js加载和执行。但此时页面还不能交互，需要激活客户页面，即 hydirating 过程。
  * 服务端返回的数据有两种：
  *   一个是服务端渲染的页面结果 HTML；
  *   另一个在服务端输出需要同步到浏览器的数据状态，通过 window.__INITIAL_STATE__ 字段作为中介联系，并且通过 Vuex 的实例 store 来完成数据状态的同步。
  */

  // vue-server-renderer 源码通过 TemplateRenderer.prototype.renderState
  TemplateRenderer.prototype.renderState = function renderState (context, options) {
    var ref = options || {};
    var contextKey = ref.contextKey; if ( contextKey === void 0 ) contextKey = 'state';
    var windowKey = ref.windowKey; if ( windowKey === void 0 ) windowKey = '__INITIAL_STATE__';
    var state = this.serialize(context[contextKey]);
    var autoRemove = '';
    var nonceAttr = context.nonce ? (" nonce=\"" + (context.nonce) + "\"") : '';
    return context[contextKey]
      ? ("<script" + nonceAttr + ">window." + windowKey + "=" + state + autoRemove + "</script>")
      : ''
  };

  // entry-client.js 客户端利用 vuex 的 API： store.replaceState 同步：
  if (window.__INITIAL_STATE__) {
    store.replaceState(window.__INITIAL_STATE__)
  }

  /**
   * 从 vue 源码看 hydirating 过程
   * 
   * 常规 SPA ：1. 编译成 $optons.render => 2. render 生成虚拟 Vnode (同时也完成依赖收集)=> 3. patch （ 3.1：生成 DOM 元素事件属性等; 3.2 调用浏览器 DOM 接口插入页面渲染）
   * 结合 SSR 的 SPA：1. 编译成 $optons.render => 2. render 生成虚拟 Vnode (同时也完成依赖收集)=> 3. patch （ 3.1：生成 DOM 元素事件属性等;）
   * 所以 SSR 也叫同构的原因是同一套代码，几乎在服务端和客户端都执行了一段，差异的地方就是 SSR 时客户端在 patch 时不用生成并插入真实的 DOM 元素，而是让浏览器使用服务器返回 HTML 渲染 DOM。
   * 而激活的过程，即 hydrating 过程主要就是 patch 中的 3.1 步，同步事件和属性数据，让页面可交互。
   * 
   * 见 vue-server-renderer-client-hydrating.js
   */
