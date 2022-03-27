# server 开发服务

## 原生 node 开启一个 http 服务

```js
const http = require('http')
const port = 3000

// 创建服务对象
const server = http.createServer((req, res) => {
  res.statusCode = 200
  res.setHeader('Content-Type', 'text/plain')
  res.end('你好世界\n')
})

// 启动 HTTP 服务器监听连接
server.listen(port, () => {
  console.log(`服务器运行在 http://${hostname}:${port}/`)
})

// 停止服务器接受新连接
server.close(() => {
  console.log('服务已关闭')
})
```

## vite 本地服务

在 CLI 命令中，当我们运行 `vite` 或 `vite server` 命令时，执行如下代码，开启本地开发服务器：
```js
const { createServer } = await import('./server')
try {
  const server = await createServer({
    root,
    base: options.base,
    mode: options.mode,
    configFile: options.config,
    logLevel: options.logLevel,
    clearScreen: options.clearScreen,
    server: cleanOptions(options)
  })
  await server.listen()
} catch (e) {
  createLogger(options.logLevel).error(
    chalk.red(`error when starting dev server:\n${e.stack}`),
    { error: e }
  )
  process.exit(1)
}
```

## 服务创建 `createServer`

```js
// 会省略部分代码，关注当前主题的逻辑
export async function createServer(inlineConfig: InlineConfig = {}): romise<ViteDevServer> {
  // 解析 CLI 传入的配置项
  const config = await resolveConfig(inlineConfig, 'serve', 'development')

  // 使用 Connect 中间件结构创建服务对象
  const middlewares = connect() as Connect.Server
  const httpServer = await resolveHttpServer(serverConfig, middlewares)

  // 组装服务对象
  const server: ViteDevServer = {
    config: config,
    middlewares,
    httpServer,
    listen(port?: number, isRestart?: boolean) {
      return startServer(server, port, isRestart)
    },
    async close() {
      process.off('SIGTERM', exitProcess)

      await Promise.all([
        watcher.close(),
        ws.close(),
        container.close(),
        closeHttpServer()
      ])
    },
  }

  // 省略一堆代码中间件注册代码 middlewares.use(xxx)

  // 为了兼容服务端使用，在浏览器使用时，重写 server.listen 代码
  // 在服务端时，vite 本身以中间件形式运行，所以 middlewareMode = true，但在浏览器端 middlewareMode = false
  if (!middlewareMode && httpServer) {
    let isOptimized = false
    const listen = httpServer.listen.bind(httpServer)
    httpServer.listen = (async (port: number, ...args: any[]) => {
      if (!isOptimized) {
        try {
          await container.buildStart({})
          await runOptimize()
          isOptimized = true
        } catch (e) {
          httpServer.emit('error', e)
          return
        }
      }
      return listen(port, ...args)
    }) as any
  } else {
    await container.buildStart({})
    await runOptimize()
  }

  return server
}

```
关键代码`const httpServer = await resolveHttpServer(serverConfig, middlewares)`
```js
// vite/src/node/server/http.ts
export async function resolveHttpServer({ proxy }: ServerOptions, app: Connect.Server,  httpsOptions?: ttpsServerOptions): Promise<HttpServer> {
  if (!httpsOptions) {
    return require('http').createServer(app)
  }
  // 省略代码
}
```
## 服务开启 `server.listen()`

服务开启 `server.listen()` 实际执行的是：
```js
const server:ViteDevServer = {
  listen(port?: number, isRestart?: boolean) {
    return startServer(server, port, isRestart)
  },
}
```
所以看 `startServer(server, port, isRestart)` 函数逻辑：
```js
// vite/src/node/server/index.ts
async function startServer(server: ViteDevServer, inlinePort?: number, isRestart: boolean = false): Promise<ViteDevServer> {
  const httpServer = server.httpServer
  if (!httpServer) {
    throw new Error('Cannot call server.listen in middleware mode.')
  }

  const options = server.config.server
  const port = inlinePort || options.port || 3000
  const hostname = resolveHostname(options.host)

  const protocol = options.https ? 'https' : 'http'
  const info = server.config.logger.info
  const base = server.config.base

  const serverPort = await httpServerStart(httpServer, {
    port,
    strictPort: options.strictPort,
    host: hostname.host,
    logger: server.config.logger
  })

  // 省略调试代码

  if (options.open && !isRestart) {
    const path = typeof options.open === 'string' ? options.open : base
    openBrowser(
      `${protocol}://${hostname.name}:${serverPort}${path}`,
      true,
      server.config.logger
    )
  }

  return server
}
```
关键代码：`httpServerStart` 函数：
```js
// vite/src/node/server/http.ts
export async function httpServerStart(
  httpServer: HttpServer,
  serverOptions: {
    port: number
    strictPort: boolean | undefined
    host: string | undefined
    logger: Logger
  }
): Promise<number> {
  return new Promise((resolve, reject) => {
    let { port, strictPort, host, logger } = serverOptions

    // 省略代码 httpServer.on('error', onError) onError 实现

    httpServer.listen(port, host, () => {
      httpServer.removeListener('error', onError)
      resolve(port)
    })
  })
}
```

## 服务停止

当我们开启本地服务，想要停止时，在命令行窗口按 `Ctrl + C`，就会退出当前的 node 进程，主要是 `Ctrl + C` 会向进程发送 `SIGTERM` 信号，所以只要向进程注册该信号监听事件，即可处理服务退出逻辑。

```js
export async function createServer(inlineConfig: InlineConfig = {}): romise<ViteDevServer> {
  // 解析 CLI 传入的配置项
  const config = await resolveConfig(inlineConfig, 'serve', 'development')

  // 使用 Connect 中间件结构创建服务对象
  const middlewares = connect() as Connect.Server
  const httpServer = await resolveHttpServer(serverConfig, middlewares)
  // 创建关闭服务
  const closeHttpServer = createServerCloseFn(httpServer)

  // 组装服务对象
  const server: ViteDevServer = {
    config: config,
    middlewares,
    httpServer,
    listen(port?: number, isRestart?: boolean) {
      return startServer(server, port, isRestart)
    },


    async close() {
      process.off('SIGTERM', exitProcess)

      await Promise.all([
        watcher.close(),
        ws.close(),
        container.close(),
        closeHttpServer()
      ])
    },
  }

  // 注册 SIGTERM 信号监听事件
  exitProcess = async () => {
    try {
      await server.close()
    } finally {
      process.exit(0)
    }
  }

  process.once('SIGTERM', exitProcess)
}
```
在 `server.close()` 函数中在关闭服务`closeHttpServer()`的同时，也处理了 `watcher.close() / ws.close() / container.close()` 的关闭事件。
在这里，我们先关注 `closeHttpServer()` 函数的代码 


```js
const closeHttpServer = createServerCloseFn(httpServer)
function createServerCloseFn(server: http.Server | null) {
  if (!server) {
    return () => {}
  }

  let hasListened = false

  // TODO: 收集 socket 并在关闭时清除，有什么作用？
  const openSockets = new Set<net.Socket>()
  server.on('connection', (socket) => {
    openSockets.add(socket)
    socket.on('close', () => {
      openSockets.delete(socket)
    })
  })

  server.once('listening', () => {
    hasListened = true
  })

  return () =>
    new Promise<void>((resolve, reject) => {
      openSockets.forEach((s) => s.destroy())
      if (hasListened) {
        server.close((err) => {
          if (err) {
            reject(err)
          } else {
            resolve()
          }
        })
      } else {
        resolve()
      }
    })
}
```