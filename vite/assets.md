# Assets 静态资源处理

同浏览器加载网页应用一样，以 html 文件为入口解析各种类型的静态资源，包括 JS / CSS，以及图片等其它资源。

同样，vite 以 index.html 文件为项目的入口文件，Vite 解析 `<script type="module" src="...">` ，这个标签指向你的 JavaScript 源码。甚至内联引入 JavaScript 的 `<script type="module">` 和引用 CSS 的 `<link href>` 也能利用 Vite 特有的功能被解析，包括元素的 src 属性值 和 CSS 中 `url()` 函数的 URL 地址链接也将被解析转换。

```js
export async function createServer(inlineConfig: InlineConfig = {}): Promise<ViteDevServer> {
  const config = await resolveConfig(inlineConfig, 'serve', 'development')

  const root = config.root
  const serverConfig = config.server
  let { middlewareMode } = serverConfig
  if (middlewareMode === true) {
    middlewareMode = 'ssr'
  }

  const middlewares = connect() as Connect.Server

  const server: ViteDevServer = {
    config,
    middlewares,
    transformIndexHtml: null!, // to be immediately set
  }

  server.transformIndexHtml = createDevHtmlTransformFn(server)

  // 省略代码

  // 一堆中间件注册
  // request timer
  if (process.env.DEBUG) {
    middlewares.use(timeMiddleware(root))
  }

  // cors (enabled by default) 跨域设置，默认开启
  const { cors } = serverConfig
  if (cors !== false) {
    middlewares.use(corsMiddleware(typeof cors === 'boolean' ? {} : cors))
  }

  // proxy 请求代理
  const { proxy } = serverConfig
  if (proxy) {
    middlewares.use(proxyMiddleware(httpServer, config))
  }

  // base
  if (config.base !== '/') {
    middlewares.use(baseMiddleware(server))
  }

  // open in editor support
  middlewares.use('/__open-in-editor', launchEditorMiddleware())

  // hmr reconnect ping
  // Keep the named function. The name is visible in debug logs via `DEBUG=connect:dispatcher ...`
  middlewares.use('/__vite_ping', function viteHMRPingMiddleware(_, res) {
    res.end('pong')
  })

  //decode request url 路由编码
  middlewares.use(decodeURIMiddleware())

  // serve static files under /public 公共路径
  // this applies before the transform middleware so that these files are served as-is without transforms.
  if (config.publicDir) {
    middlewares.use(servePublicMiddleware(config.publicDir))
  }

  // main transform middleware 最主要的资源处理中间件，执行插件的 hook: resolveId load transform
  // 304请求处理
  // 如果是请求 cacheDir 目录内的文件，设置 max-age=31536000,immutable
  middlewares.use(transformMiddleware(server))

  // serve static files 静态资源处理
  middlewares.use(serveRawFsMiddleware(server))
  middlewares.use(serveStaticMiddleware(root, config))

  // spa fallback
  if (!middlewareMode || middlewareMode === 'html') {
    middlewares.use(
      history({
        logger: createDebugger('vite:spa-fallback'),
        // support /dir/ without explicit index.html
        rewrites: [
          {
            from: /\/$/,
            to({ parsedUrl }: any) {
              const rewritten = parsedUrl.pathname + 'index.html'
              if (fs.existsSync(path.join(root, rewritten))) {
                return rewritten
              } else {
                return `/index.html`
              }
            }
          }
        ]
      })
    )
  }

  if (!middlewareMode || middlewareMode === 'html') {
    // transform index.html
    middlewares.use(indexHtmlMiddleware(server))
    // handle 404s
    // Keep the named function. The name is visible in debug logs via `DEBUG=connect:dispatcher ...`
    middlewares.use(function vite404Middleware(_, res) {
      res.statusCode = 404
      res.end()
    })
  }

  // error handler
  middlewares.use(errorMiddleware(server, !!middlewareMode))

  // 省略代码

  return server
}
```

## HTML 文件处理

关键代码：
```js
server.transformIndexHtml = createDevHtmlTransformFn(server)

middlewares.use(indexHtmlMiddleware(server))
```
先看 `indexHtmlMiddleware` 中间件
```js
// vite/src/node/server/middlewares/indexHtmls.ts
export function indexHtmlMiddleware(server: ViteDevServer): Connect.NextHandleFunction {
  return async function viteIndexHtmlMiddleware(req, res, next) {
    // 去掉url中的 ? 查询参数和# hash参数
    const url = req.url && cleanUrl(req.url)

    if (url?.endsWith('.html') && req.headers['sec-fetch-dest'] !== 'script') {

      // filename = path.join(server.config.root, url.slice(1))
      const filename = getHtmlFilename(url, server) 

      if (fs.existsSync(filename)) {
        try {
          let html = fs.readFileSync(filename, 'utf-8')
          html = await server.transformIndexHtml(url, html, req.originalUrl)

          return send(req, res, html, 'html')
        } catch (e) {
          return next(e)
        }
      }
    }
    next()
  }
}
```
其中的关键代码 `html = await server.transformIndexHtml(url, html, req.originalUrl)` 即是在 `createServer` 中赋值的 `server.transformIndexHtml = createDevHtmlTransformFn(server)`

```js
// vite/src/node/server/middlewares/indexHtmls.ts
export function createDevHtmlTransformFn(server: ViteDevServer): (url: string, html: string, originalUrl: string) => Promise<string> {
  const [preHooks, postHooks] = resolveHtmlTransforms(server.config.plugins)

  return (url: string, html: string, originalUrl: string): Promise<string> => {
    return applyHtmlTransforms(html, [...preHooks, devHtmlHook, ...postHooks], {
      path: url,
      filename: getHtmlFilename(url, server),
      server,
      originalUrl
    })
  }
}
```
解析所有插件钩子 `transformIndexHtml`，以及添加内部的 `devHtmlHook` 钩子处理函数
```js
// vite/src/node/plugins/index.ts
export function resolveHtmlTransforms(plugins: readonly Plugin[]): [IndexHtmlTransformHook[], IndexHtmlTransformHook[]] {
  const preHooks: IndexHtmlTransformHook[] = []
  const postHooks: IndexHtmlTransformHook[] = []

  for (const plugin of plugins) {
    const hook = plugin.transformIndexHtml
    if (hook) {
      if (typeof hook === 'function') {
        postHooks.push(hook)
      } else if (hook.enforce === 'pre') {
        preHooks.push(hook.transform)
      } else {
        postHooks.push(hook.transform)
      }
    }
  }

  return [preHooks, postHooks]
}
```
然后函数赋值给 `server.transformIndexHtml`，接着注册中间件，在html文件请求到来时执行 `html = await server.transformIndexHtml(url, html, req.originalUrl)` 实际返回的是 `applyHtmlTransforms` 函数的执行结果。
```js
// vite/src/node/plugins/index.ts
export async function applyHtmlTransforms(html: string, hooks: IndexHtmlTransformHook[], ctx: IndexHtmlTransformContext): Promise<string> {
  const headTags: HtmlTagDescriptor[] = []
  const headPrependTags: HtmlTagDescriptor[] = []
  const bodyTags: HtmlTagDescriptor[] = []
  const bodyPrependTags: HtmlTagDescriptor[] = []

  for (const hook of hooks) {
    const res = await hook(html, ctx)
    if (!res) {
      continue
    }
    if (typeof res === 'string') {
      html = res
    } else {
      let tags: HtmlTagDescriptor[]
      if (Array.isArray(res)) {
        tags = res
      } else {
        html = res.html || html
        tags = res.tags
      }
      for (const tag of tags) {
        if (tag.injectTo === 'body') {
          bodyTags.push(tag)
        } else if (tag.injectTo === 'body-prepend') {
          bodyPrependTags.push(tag)
        } else if (tag.injectTo === 'head') {
          headTags.push(tag)
        } else {
          headPrependTags.push(tag)
        }
      }
    }
  }

  // inject tags
  if (headPrependTags.length) {
    html = injectToHead(html, headPrependTags, true)
  }
  if (headTags.length) {
    html = injectToHead(html, headTags)
  }
  if (bodyPrependTags.length) {
    html = injectToBody(html, bodyPrependTags, true)
  }
  if (bodyTags.length) {
    html = injectToBody(html, bodyTags)
  }

  return html
}
```
`applyHtmlTransforms` 函数主要是顺序执行传入的钩子函数 `[...preHooks, devHtmlHook, ...postHooks]`。所以重点关注内部实现的函数 `devHtmlHook`。

```js
// vite/src/node/plugins/index.ts
// const res = await hook(html, ctx)
const devHtmlHook: IndexHtmlTransformHook = async (html, { path: htmlPath, server, originalUrl }) => {
  const config = server?.config!
  const base = config.base || '/'


  /*******************************
   * 假设您有一些源代码，您想对其进行一些轻微的修改，比如在这里和那里替换几个字符，用页眉和页脚包裹它，等等。
   * 另一种需求，你希望在末尾生成一个 sourceMap。为此你可以使用 MagicString ，这是一个用于操作字符串和生成源映射的小而快速的实用程序。
   * var s = new MagicString( 'problems = 99' );
   * s.overwrite( 0, 8, 'answer' );
   * s.toString(); // 'answer = 99'
  */
  const s = new MagicString(html)
  let scriptModuleIndex = -1

  await traverseHtml(html, htmlPath, (node) => {
    if (node.type !== NodeTypes.ELEMENT) {
      return
    }

    // script tags
    if (node.tag === 'script') {
      const { src, isModule } = getScriptInfo(node)
      if (isModule) {
        scriptModuleIndex++
      }

      if (src) {
        processNodeUrl(src, s, config, htmlPath, originalUrl)
      } else if (isModule) {
        // inline js module. convert to src="proxy"
        s.overwrite(
          node.loc.start.offset,
          node.loc.end.offset,
          `<script type="module" src="${
            config.base + htmlPath.slice(1)
          }?html-proxy&index=${scriptModuleIndex}.js"></script>`
        )
      }
    }

    // elements with [href/src] attrs
    const assetAttrs = assetAttrsConfig[node.tag]
    if (assetAttrs) {
      for (const p of node.props) {
        if (
          p.type === NodeTypes.ATTRIBUTE &&
          p.value &&
          assetAttrs.includes(p.name)
        ) {
          processNodeUrl(p, s, config, htmlPath, originalUrl)
        }
      }
    }
  })

  html = s.toString()

  return {
    html,
    tags: [
      {
        tag: 'script',
        attrs: {
          type: 'module',
          src: path.posix.join(base, CLIENT_PUBLIC_PATH)
        },
        injectTo: 'head-prepend'
      }
    ]
  }
}

export async function traverseHtml(html: string, filePath: string, visitor: NodeTransform): Promise<void> {
  // lazy load compiler
  const { parse, transform } = await import('@vue/compiler-dom')
  // @vue/compiler-core doesn't like lowercase doctypes
  html = html.replace(/<!doctype\s/i, '<!DOCTYPE ')
  try {
    const ast = parse(html, { comments: true })
    transform(ast, {
      nodeTransforms: [visitor]
    })
  } catch (e) {
    const parseError = {
      loc: filePath,
      frame: '',
      ...formatParseError(e, filePath, html)
    }
    throw new Error(
      `Unable to parse ${JSON.stringify(parseError.loc)}\n${parseError.frame}`
    )
  }
}
```


