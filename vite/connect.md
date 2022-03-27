# connect 中间件框架

## 理解 Connect.js

在解析 vite 处理静态资源之前，需要先了解下在 vite@2.5.0 版本中本地服务启动时采用的 connect.js 服务端框架。（vite@1.x 是服务端框架采用 koa2）。

> vite 在 1.x 和 2.x 早期的时候其实是使用 Koa 去实现中间件模式的，为什么从 Koa 迁移到 connect 呢，从 《Migration from v1》的最后一段话可以了解到其原因。
> 大致意思：由于 vite 的逻辑处理由原先的中间件处理逐渐倾向于使用插件的钩子函数来处理，所以 vite 对中间件模式的依赖逐渐变小，而采用了更合适的 connect。

`Connect` 在它的官方介绍中,它是一个 node 中间件（middleware）框架，它的作用是基于 Node 原生的 http 服务器，来作为服务器的中间件管理器。

至于如何处理网络请求，这些任务通过路由分派给它管理的中间件们进行处理。它的处理模型仅仅只是一个中间队列，进行流式处理而已，流式处理可能性能不是最优，但是却是最易于被理解和接受。

理解中间件的概念，就比如把一个http处理过程比作是污水处理，中间件就像是一层层的过滤网。每个中间件在http处理过程中通过改写http 服务的 request 或 response 的数据、状态，实现该中间特定的功能。

回顾一下Node.js最简单的Web服务器是如何编写的:
```js
const http = require('http');
http.createServer(function (req, res) {
  res.writeHead(200, {'Content-Type': 'application/json'});
  res.end('Hello World');
}).listen(3000, () => console.log('server is running on port 3000'))
```
如果把 `createServer` 函数中的回调函数抽出来单独定义，可以改写为：
```js
const http = require('http');
http.createServer(app).listen(3000, () => console.log('server is running on port 3000'))

function app(req, res) {/* handle */}
```
HTTP模块基于事件处理网络访问无外乎也是处理两个主要参数对象：请求 request 和响应 response。

Connect 的中间件也是扮演这样一个角色，处理请求，然后响应客户端，或是让下一个中间件继续处理。所以 app 函数就是 Connect 框架中间件的主要骨架，但 connect 增加了一个 next 参数。
```js
function middleware(req, res, next) {/* handle */}
```

## 使用 Connect.js

Connect 的使用也特别简单：
```js
// 生成一个app，它即是一个函数，也是对象。（函数本身也是对象类型，可以添加属性和方法）
const app = connect()

// 注册基础通用中间件
app.use(connect.staticCache()) // 注册 connect 自带的中间件，它自身捆绑了 18个特定功能的中间件
app.use(bodyParser.urlencoded({extended: false})); // 注册第三方中间件
app.use(function(req, res, next) {/* 自定义中间件 */ next()}

// 注册路由中间件
app.use("/foo", function fooMiddleware(req, res, next) {
  // req.url starts with "/foo"
  next();
});

// 错误处理中间件
// 有四个入参的视为处理错误的中间件
app.use(function onerror(err, req, res, next) {
  // an error occurred!
});

// 服务启动
app.listen(2000);
// 另一种方式是将中间件传递给 http 来创建服务
http.createServer(app).listen(3000);
```

## Connect 原理

Conncet 的核心逻辑，它通过 `use` 方法来维护一个中间件队列。然后在请求来临的时候，通过 `next` 方法依次调用队列中的中间件，直到某个中间件调用 `res.end`, 不再调用下一个中间件为止。
> 必须要有一个中间件调用res.end()方法来告知客户端请求已被处理完成,否则客户端将一直处于等待状态

伪代码实现，实际源码需要处理各种分支逻辑，源码不多，可以尝试阅读。
```js
const METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'HEAD', 'OPTIONS'];
function createServer() {
  // 声明实例 app 函数，并在 app 函数对象上声明属性和方法
  function app(req, res) {
    app.handle(req, res);
  }

  // 初始化默认中间件的堆栈
  app.stack = [];

  app.use = (route, fn) => {

    var handle = fn;
    var path = route;

    if (typeof route !== "string") {
      handle = route;
      path = "/";
    }

    this.stack.push({ method: null, route: path, handle: handle });
    return this
  };

  METHODS.forEach(item => {
    const method = item.toLowerCase();
    app[method] = (path, fn) => {
        routes.push({
            method,
            path,
            handler: fn
        });
    };
  });

  app.handle(req, res) {
    const pathname = decodeURI(url.parse(req.url).pathname);
    const method = req.method.toLowerCase();
    const stack = this.stack
    let i = 0;

    const next = () => {
      let layer = stack[i++];
      if (!layer) return;
      const routeForAllRequest = !layer.method && !layer.path;
      if (routeForAllRequest || (route.method === method && pathname === route.path)){
        layer.handler(req, res, next);
      } else {
        next();
      }
    }

    next()
  }

  return app;
}
```
