# plugin 插件体系

Vite 插件扩展于设计出色的 Rollup 插件体系，并添加了一些 Vite 独有的钩子选项。所以 Rollup 插件可以直接应用于 vite 的生产构建中。

## 插件搜索
你可以在这些地方搜索合适的插件：
- [Vite Rollup Plugins](https://vite-rollup-plugins.patak.dev/)
- [awesome-vite#plugins](https://github.com/vitejs/awesome-vite#plugins)
- [npm vite 插件搜索链接](https://www.npmjs.com/search?q=vite-plugin&ranking=popularity)

## 插件的使用

使用 vite 插件两步：
1. 下载安装插件
```sh
npm i -D @vitejs/plugin-legacy
```
2. 注册插件，添加到 `vite.config.js` 配置项 `plugins` 中
```js
import legacy from '@vitejs/plugin-legacy'
import { defineConfig } from 'vite'
export default defineConfig({
  plugins: [
    legacy({
      targets: ['defaults', 'not IE 11']
    })
  ]
})
```
为了与某些 Rollup 插件兼容，可能需要强制执行插件的顺序，可以使用 `enforce` 字段来强制插件的调用位置。
```js
// pre：在 Vite 核心插件之前调用该插件
// 默认：在 Vite 核心插件之后调用该插件
// post：在 Vite 构建插件之后调用该插件
export default defineConfig({
  plugins: [
    {
      ...image(), // vite 或 rollup 插件函数执行导出的是一个对象，所以这里解构
      enforce: 'pre'
    }
  ]
})
```
插件也可以视功能需要，指定插件应用范围是在开发环境还是生产环境使用，默认插件在开发和生产模式中都会调用，通过 `apply` 字段指定作用范围。
```js
 plugins: [
    {
      ...typescript2(),
      apply: 'build'
    }
  ]
```
## 插件钩子

Vite/Rollup 插件定义为一个工厂函数，该函数可以接受允许用户自定义插件行为的选项，然后返回实际插件对象。
Rollup 插件的钩子和vite插件特定的钩子都作为该插件对象的方法存在。
- 其中 Vite 自定义的 hook 5个: `config / configResolved / configureServer / transformIndexHtml / handleHotUpdate`
- 兼容 Rollup 的 Hook 7个: `options / buildStart / resolvedId / load / transform / buildEnd / closeBundle` 。
- Hook 执行顺序：从上到下。
```js
export default function myPlugin(options) {
  return {
    name: 'my-plugin',
    enforce?: 'pre' | 'post'
    apply?: 'serve' | 'build'
    // 在服务器启动时被调用
    config?: (config: UserConfig, env: { mode: string, command: string }) => UserConfig | null | void | Promise<UserConfig | null | void>
    configResolved?: (config: ResolvedConfig) => void | Promise<void>, // 拿到最终解析后的 config
    options() {},
    configureServer?:(server: ViteDevServer) => (() => void) | void | Promise<(() => void) | void>, // 开发服务器对象,
    buildStart() {},

    // 在有传入模块请求时被调用
    transformIndexHtml() {},
    resolvedId() {},
    load() {},
    transform() {},

    // 在热更新时调用
    handleHotUpdate() {}

    // 在服务器关闭时被调用
    buildEnd()
    closeBundle()
  }
}
```

## 插件源码流程
- `resolveConfig`：插件解析，分类，执行各个插件的 `config / configResolved` 钩子
- `resolvePlugins`：加入Vite内置的插件，如`vite:css` 等
- `createPluginContainer`：创建插件统一管理器`container`，并执行插件的 `configureServer`  钩子
- `server.listen`：开启服务时，通过 `container.buildStart({})` 执行插件的`buildStart` 钩子

### `resolveConfig`：插件解析，分类，执行各个插件的 config 钩子
```js
// vite/src/node/server.index.ts
import { resolveConfig } from '../config'
export async function createServer(inlineConfig: InlineConfig = {}): romise<ViteDevServer> {
  // 解析 CLI 传入的配置项
  const config = await resolveConfig(inlineConfig, 'serve', 'development')
}

// vite/src/node/config.ts
export async function resolveConfig(inlineConfig: InlineConfig, command: 'build' | 'serve',  defaultMode = 'development'): Promise<ResolvedConfig> {
  let config = inlineConfig

  // 省略代码

  //  先执行 flat()，所以定义插件的时候返回可以有嵌套[[pulginA,pulginB],pulginC]，所以可以自定义一个预设插件，返回多个插件数组
	//  然后筛选应用 apply 对应场景(serve|build)的插件
  const rawUserPlugins = (config.plugins || []).flat().filter((p) => {
    return p && (!p.apply || p.apply === command)
  }) as Plugin[]

  // 根据enforce字段对插件进行排序，enforce可以填pre、 post
  const [prePlugins, normalPlugins, postPlugins] = sortUserPlugins(rawUserPlugins)

  // 按 pre normal post 顺序执行插件的 config hook，这个钩子内可以再次添加自定义配置
  const userPlugins = [...prePlugins, ...normalPlugins, ...postPlugins]
  for (const p of userPlugins) {
    if (p.config) {
      const res = await p.config(config, configEnv)
      if (res) {
        config = mergeConfig(config, res)
      }
    }
  }

  // 组合最终要返回配置对象
  const resolved: ResolvedConfig = {
    // 省略代码
    ...config,
    command,
    plugins: userPlugins,
  }

  ;(resolved.plugins as Plugin[]) = await resolvePlugins(
    resolved,
    prePlugins,
    normalPlugins,
    postPlugins
  )

  // call configResolved hooks
  await Promise.all(userPlugins.map((p) => p.configResolved?.(resolved)))
  return resolved
}

export function sortUserPlugins(plugins: (Plugin | Plugin[])[] | undefined): Plugin[], Plugin[], Plugin[]] {
  const prePlugins: Plugin[] = []
  const postPlugins: Plugin[] = []
  const normalPlugins: Plugin[] = []

  if (plugins) {
    plugins.flat().forEach((p) => {
      if (p.enforce === 'pre') prePlugins.push(p)
      else if (p.enforce === 'post') postPlugins.push(p)
      else normalPlugins.push(p)
    })
  }

  return [prePlugins, normalPlugins, postPlugins]
}
```

### `resolvePlugins`：加入Vite内置的插件

其中关键代码 `resolvePlugins` 函数，主要是添加一系列 vite 内置的处理插件，与用户传入的插件合并。
> 此时注意，数组内插件的位置是有严格要求的。靠前的先执行。
```js
// vite/src/node/plguins/index.ts
export async function resolvePlugins(
  config: ResolvedConfig,
  prePlugins: Plugin[],
  normalPlugins: Plugin[],
  postPlugins: Plugin[]
): Promise<Plugin[]> {
  const isBuild = config.command === 'build'

  const buildPlugins = isBuild
    ? (await import('../build')).resolveBuildPlugins(config)
    : { pre: [], post: [] }

  return [
    isBuild ? null : preAliasPlugin(),
    aliasPlugin({ entries: config.resolve.alias }),
    ...prePlugins,
    config.build.polyfillModulePreload
      ? modulePreloadPolyfillPlugin(config)
      : null,
    resolvePlugin({
      ...config.resolve,
      root: config.root,
      isProduction: config.isProduction,
      isBuild,
      ssrTarget: config.ssr?.target,
      asSrc: true
    }),
    htmlInlineScriptProxyPlugin(),
    cssPlugin(config),
    config.esbuild !== false ? esbuildPlugin(config.esbuild) : null,
    jsonPlugin(
      {
        namedExports: true,
        ...config.json
      },
      isBuild
    ),
    wasmPlugin(config),
    webWorkerPlugin(config),
    assetPlugin(config),
    ...normalPlugins,
    definePlugin(config),
    cssPostPlugin(config),
    ...buildPlugins.pre,
    ...postPlugins,
    ...buildPlugins.post,
    // internal server-only plugins are always applied after everything else
    ...(isBuild
      ? []
      : [clientInjectionsPlugin(config), importAnalysisPlugin(config)])
  ].filter(Boolean) as Plugin[]
}
```
因为插件解析经过 `filter(Boolean)` 筛选，所以插件数组 `Plugins` 中 `Falsy` 虚值位置的插件将被忽略，所以在`vite.config.js`中通过函数返回值配置时，可依据环境轻松地判断，决定是启用或停用插件。
```js
export default defineConfig(({ command, mode }) => {
  plugins: [
    command === 'serve' ? someServerPlugin : null,
  ]
})
```

### `createPluginContainer`：创建插件统一管理器，并执行插件的 configureServer 钩子

```js
// vite/src/node/server.index.ts
import { resolveConfig } from '../config'
export async function createServer(inlineConfig: InlineConfig = {}): romise<ViteDevServer> {
  // 解析 CLI 传入的配置项
  const config = await resolveConfig(inlineConfig, 'serve', 'development')

  const plugins = config.plugins
  const container = await createPluginContainer(config, watcher)

  // apply server configuration hooks from plugins
  const postHooks: ((() => void) | void)[] = []
  for (const plugin of plugins) {
    if (plugin.configureServer) {
      postHooks.push(await plugin.configureServer(server))
    }
  }

  // 省略一堆中间件的注册 middleware.use(xxx)

  // 这是在html中间件 indexHtmlMiddleware 之前运行后置配置插件，以便用户中间件可以提供自定义内容而不是index.html。
  postHooks.forEach((fn) => fn && fn())

  return server
}
```
### 在启动服务时，执行所有插件的 `buildStart` 钩子。
```js
if (!middlewareMode && httpServer) {
    let isOptimized = false
    const listen = httpServer.listen.bind(httpServer)
    httpServer.listen = (async (port: number, ...args: any[]) => {
      if (!isOptimized) {
        try {
          await container.buildStart({}) // 执行 buildStart 钩子
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
    await container.buildStart({}) // 执行 buildStart 钩子
    await runOptimize()
  }
```
### 插件统一管理器

关键代码：`const container = await createPluginContainer(config, watcher)`

```js
// vite/src/node/server/pluginContainer.ts
export async function createPluginContainer(
  { plugins, logger, root, build: { rollupOptions } }: ResolvedConfig,
  watcher?: FSWatcher
): Promise<PluginContainer> {

  const MODULES = new Map()
  const watchFiles = new Set<string>()

  // 创建插件钩子执行的上下文对象
  class Context implements PluginContext {
    meta = minimalContext.meta
    ssr = false
    _activePlugin: Plugin | null
    _activeId: string | null = null
    _activeCode: string | null = null
    _resolveSkips?: Set<Plugin>
    _addedImports: Set<string> | null = null

    constructor(initialPlugin?: Plugin) {
      this._activePlugin = initialPlugin || null
    }

    parse(code: string, opts: any = {}) {
      return parser.parse(code, {
        sourceType: 'module',
        ecmaVersion: 2020,
        locations: true,
        ...opts
      })
    }

    async resolve(
      id: string,
      importer?: string,
      options?: { skipSelf?: boolean }
    ) {
      let skips: Set<Plugin> | undefined
      if (options?.skipSelf && this._activePlugin) {
        skips = new Set(this._resolveSkips)
        skips.add(this._activePlugin)
      }
      let out = await container.resolveId(id, importer, skips, this.ssr)
      if (typeof out === 'string') out = { id: out }
      return out as ResolvedId | null
    }

    getModuleInfo(id: string) {
      let mod = MODULES.get(id)
      if (mod) return mod.info
      mod = {
        /** @type {import('rollup').ModuleInfo} */
        // @ts-ignore-next
        info: {}
      }
      MODULES.set(id, mod)
      return mod.info
    }

    getModuleIds() {
      return MODULES.keys()
    }

    addWatchFile(id: string) {
      watchFiles.add(id)
      ;(this._addedImports || (this._addedImports = new Set())).add(id)
      if (watcher) ensureWatchedFile(watcher, id, root)
    }

    getWatchFiles() {
      return [...watchFiles]
    }

    // 省略代码
  }

  const container: PluginContainer = {

    //注意，options是一个立即调用函数，插件的options hook 在此时执行，它可以直接是配置对象，也可以是返回配置对象的函数
    options: await (async () => {
      let options = rollupOptions
      for (const plugin of plugins) {
        if (!plugin.options) continue
        options =
          (await plugin.options.call(minimalContext, options)) || options
      }
      if (options.acornInjectPlugins) {
        parser = acorn.Parser.extend(
          ...[
            acornClassFields,
            acornStaticClassFeatures,
            acornNumericSeparator
          ].concat(options.acornInjectPlugins)
        )
      }
      return {
        acorn,
        acornInjectPlugins: [],
        ...options
      }
    })(),

    async buildStart() {
      await Promise.all(
        plugins.map((plugin) => {
          if (plugin.buildStart) {
            return plugin.buildStart.call(
              new Context(plugin) as any,
              container.options as NormalizedInputOptions
            )
          }
        })
      )
    },

    async resolveId(rawId, importer = join(root, 'index.html'), skips, ssr) {
      const ctx = new Context()
      ctx.ssr = !!ssr
      ctx._resolveSkips = skips
      const resolveStart = isDebug ? Date.now() : 0

      let id: string | null = null
      const partial: Partial<PartialResolvedId> = {}
      for (const plugin of plugins) {
        if (!plugin.resolveId) continue
        if (skips?.has(plugin)) continue

        ctx._activePlugin = plugin

        const pluginResolveStart = isDebug ? Date.now() : 0
        const result = await plugin.resolveId.call(
          ctx as any,
          rawId,
          importer,
          {},
          ssr
        )
        if (!result) continue

        if (typeof result === 'string') {
          id = result
        } else {
          id = result.id
          Object.assign(partial, result)
        }

        isDebug &&
          debugPluginResolve(
            timeFrom(pluginResolveStart),
            plugin.name,
            prettifyUrl(id, root)
          )

        // resolveId() is hookFirst - first non-null result is returned.
        break
      }

      if (isDebug && rawId !== id && !rawId.startsWith(FS_PREFIX)) {
        const key = rawId + id
        // avoid spamming
        if (!seenResolves[key]) {
          seenResolves[key] = true
          debugResolve(
            `${timeFrom(resolveStart)} ${chalk.cyan(rawId)} -> ${chalk.dim(id)}`
          )
        }
      }

      if (id) {
        partial.id = isExternalUrl(id) ? id : normalizePath(id)
        return partial as PartialResolvedId
      } else {
        return null
      }
    },

    async load(id, ssr) {
      const ctx = new Context()
      ctx.ssr = !!ssr
      for (const plugin of plugins) {
        if (!plugin.load) continue
        ctx._activePlugin = plugin
        const result = await plugin.load.call(ctx as any, id, ssr)
        if (result != null) {
          return result
        }
      }
      return null
    },

    async transform(code, id, inMap, ssr) {
      const ctx = new TransformContext(id, code, inMap as SourceMap)
      ctx.ssr = !!ssr
      for (const plugin of plugins) {
        if (!plugin.transform) continue
        ctx._activePlugin = plugin
        ctx._activeId = id
        ctx._activeCode = code
        const start = isDebug ? Date.now() : 0
        let result: TransformResult | string | undefined
        try {
          result = await plugin.transform.call(ctx as any, code, id, ssr)
        } catch (e) {
          ctx.error(e)
        }
        if (!result) continue
        isDebug &&
          debugPluginTransform(
            timeFrom(start),
            plugin.name,
            prettifyUrl(id, root)
          )
        if (isObject(result)) {
          code = result.code || ''
          if (result.map) ctx.sourcemapChain.push(result.map)
        } else {
          code = result
        }
      }
      return {
        code,
        map: ctx._getCombinedSourcemap()
      }
    },

    watchChange(id, event = 'update') {
      const ctx = new Context()
      if (watchFiles.has(id)) {
        for (const plugin of plugins) {
          if (!plugin.watchChange) continue
          ctx._activePlugin = plugin
          plugin.watchChange.call(ctx as any, id, { event })
        }
      }
    },

    async close() {
      if (closed) return
      const ctx = new Context()
      await Promise.all(
        plugins.map((p) => p.buildEnd && p.buildEnd.call(ctx as any))
      )
      await Promise.all(
        plugins.map((p) => p.closeBundle && p.closeBundle.call(ctx as any))
      )
      closed = true
    }
  }

  return container
}
```