# CLI 命令

## vite CLI 命令
```json
"scripts": {
	"dev": "vite", // 启动开发服务器，或者 vite server
	"build": "vite build", // 为生产环境构建产物
	"serve": "vite preview" // 本地预览生产构建产物
}
```
主要关注 vite 作为开发环境下的流程。

`npm run dev` 执行 `vite` 或 `vite server`，其中 `bin` 文件路径：`vite/bin/vite.js`
```js
// 省略一些调试逻辑的代码，主要代码

function start() {
  require('../dist/node/cli')
}

start()
```
```js
// vite/src/node/cli.ts
const cli = cac('vite') // cac 是一个类似 yargs 的命令行工具
// 注册命令行参数
cli
  .option('-c, --config <file>', `[string] use specified config file 指定的配置文件路径，默认根路径`)
  .option('-r, --root <path>', `[string] use specified root directory 指定的根目录`)
  .option('--base <path>', `[string] public base path (default: /) 指定项目根路径，默认 /`)
  .option('-l, --logLevel <level>', `[string]指定打印的日志级别，可选的值： info | warn | error | silent`)
  .option('--clearScreen', `[boolean] allow/disable clear screen when logging`)
  .option('-d, --debug [feat]', `[string | boolean] show debug logs 是否显示调试日志`)
  .option('-f, --filter <filter>', `[string] filter debug logs 过滤调试日志`)
  .option('-m, --mode <mode>', `[string] set env mode 设置环境模式`)

// 注册开发服务 server 子命令
cli
  .command('[root]') // default command
  .alias('serve')
  .option('--host [host]', `[string] specify hostname 指定主机名，默认 127.0.0.1`)
  .option('--port <port>', `[number] specify port 指定端口号，默认`)
  .option('--https', `[boolean] use TLS + HTTP/2`)
  .option('--open [path]', `[boolean | string] open browser on startup 是否服务开启后打开浏览器，或指定浏览器打开指定页面`)
  .option('--cors', `[boolean] enable CORS 是否开启 CORS`)
  .option('--strictPort', `[boolean] exit if specified port is already in use 设为 true 时，端口占用则退出`)
  .option(
    '--force',
    `[boolean] force the optimizer to ignore the cache and re-bundle 强制重新构建，并更新已缓存的依赖`
  )
  .action(async (root: string, options: ServerOptions & GlobalCLIOptions) => {
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
  })

// 省略 build optimize preview 子命令注册代码
cli.help()
cli.version(require('../../package.json').version)
cli.parse()
```
可以看下，启动开发服务的主要代码在 `./server` 文件。下一节继续看开发服务的创建、启动、停止的源码流程。