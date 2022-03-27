# optimize 预优化

在 `httpServer.listen` 启动服务之前，vite 会选执行 `runOptimize` 预优化流程，并且通过`isOptimized`变量控制，预优化流程只运行一次。

```js
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
```
看看 `runOptimize` 函数执行，同样在创建服务时生成：
```js
import { optimizeDeps } from '../optimizer'
export async function createServer(inlineConfig: InlineConfig = {}): romise<ViteDevServer> {
    const runOptimize = async () => {
    if (config.cacheDir) {
      server._isRunningOptimizer = true
      try {
        server._optimizeDepsMetadata = await optimizeDeps(config)
      } finally {
        server._isRunningOptimizer = false
      }
      server._registerMissingImport = createMissingImporterRegisterFn(server)
    }
  }
}
```
关键代码：`await optimizeDeps(config)`
```js
// vite/src/node/optimizer/index.ts
export async function optimizeDeps(
  config: ResolvedConfig,
  force = config.server.force,
  asCommand = false,
  newDeps?: Record<string, string>, // missing imports encountered after server has started
  ssr?: boolean
): Promise<DepOptimizationMetadata | null> {
  config = {
    ...config,
    command: 'build'
  }

  const { root, logger, cacheDir } = config
  const log = asCommand ? logger.info : debug

  if (!cacheDir) {
    log(`No cache directory. Skipping.`)
    return null
  }

  const dataPath = path.join(cacheDir, '_metadata.json')
  /************************************************************************
   * 关键步骤一：
   * 依据 config 中 mode/root/resolve/assetsInclude/plugins/optimizeDeps，
   * 以及项目依赖的 lock 文件内容计算出一个 hash 值用来下面的比对，
   * 所以说只要这些项有变动，就会触发重新预编译，如果这些内容没有变量，就不会执行预编译，启动时间更快
  *************************************************************************/
  const mainHash = getDepHash(root, config)
  const data: DepOptimizationMetadata = {
    hash: mainHash,
    browserHash: mainHash,
    optimized: {}
  }

  // 尝试读取缓存目录下的 _metadata.json 文件，首次启动不存在不执行，
  // 当再次执行构建时，比较上次预构建信息（_metadata.json）中 hash，与此时计算出的 hash 比较，决定是否重新构建
  // 所以 vite 本地开发服务，第二次启动服务时间会比首次更快，因为如果依赖没变，省略了预构建的执行时间
  if (!force) {
    let prevData: DepOptimizationMetadata | undefined
    try {
      prevData = JSON.parse(fs.readFileSync(dataPath, 'utf-8'))
    } catch (e) {}
    
    // hash is consistent, no need to re-bundle
    if (prevData && prevData.hash === data.hash) {
      log('Hash is consistent. Skipping. Use --force to override.')
      return prevData
    }
  }

  // 如果 cacheDir 已存在，则清空，不存在，则新建
  if (fs.existsSync(cacheDir)) {
    emptyDir(cacheDir)
  } else {
    fs.mkdirSync(cacheDir, { recursive: true })
  }
  // a hint for Node.js
  // all files in the cache directory should be recognized as ES modules
  // 向 cacheDir 目录中写入 package.json 文件内容
  writeFile(
    path.resolve(cacheDir, 'package.json'),
    JSON.stringify({ type: 'module' })
  )

  /************************************************************************
   * 关键步骤二：扫描源码，获取需要进行预打包的 npm 包
  *************************************************************************/
  let deps: Record<string, string>,
      missing: Record<string, string>

  if (!newDeps) {
    ;({ deps, missing } = await scanImports(config))
  } else {
    deps = newDeps
    missing = {}
  }

  // update browser hash 仅根据依赖生成一个 hash 
  data.browserHash = createHash('sha256')
    .update(data.hash + JSON.stringify(deps))
    .digest('hex')
    .substr(0, 8)

  const missingIds = Object.keys(missing)
  if (missingIds.length) {
    throw new Error(
      `The following dependencies are imported but could not be resolved:\n\n  ${missingIds
        .map(
          (id) =>
            `${chalk.cyan(id)} ${chalk.white.dim(
              `(imported by ${missing[id]})`
            )}`
        )
        .join(`\n  `)}\n\nAre they installed?`
    )
  }

  const include = config.optimizeDeps?.include
  if (include) {
    const resolve = config.createResolver({ asSrc: false })
    for (const id of include) {
      if (!deps[id]) {
        const entry = await resolve(id)
        if (entry) {
          deps[id] = entry
        } else {
          throw new Error(
            `Failed to resolve force included dependency: ${chalk.cyan(id)}`
          )
        }
      }
    }
  }

  const qualifiedIds = Object.keys(deps)

  // 如果没有合格依赖，则写入data 后退出
  if (!qualifiedIds.length) {
    // dataPath = path.join(cacheDir, '_metadata.json')
    // data = {hash: string, browserHash:string, optimized: {}}
    writeFile(dataPath, JSON.stringify(data, null, 2))
    log(`No dependencies to bundle. Skipping.\n\n\n`)
    return data
  }

  const total = qualifiedIds.length
  const maxListed = 5
  const listed = Math.min(total, maxListed)
  const extra = Math.max(0, total - maxListed)
  const depsString = chalk.yellow(
    qualifiedIds.slice(0, listed).join(`\n  `) +
      (extra > 0 ? `\n  (...and ${extra} more)` : ``)
  )
  if (!asCommand) {
    if (!newDeps) {
      // This is auto run on server start - let the user know that we are
      // pre-optimizing deps
      logger.info(
        chalk.greenBright(`Pre-bundling dependencies:\n  ${depsString}`)
      )
      logger.info(
        `(this will be run only when your dependencies or config have changed)`
      )
    }
  } else {
    logger.info(chalk.greenBright(`Optimizing dependencies:\n  ${depsString}`))
  }

  /************************************************************************
   * 关键步骤三：利用 es-module-lexer 扁平化嵌套的源码依赖
  *************************************************************************/
  // esbuild generates nested directory output with lowest common ancestor base
  // this is unpredictable and makes it difficult to analyze entry / output
  // mapping. So what we do here is:
  // 1. flatten all ids to eliminate slash
  // 2. in the plugin, read the entry ourselves as virtual files to retain the path.
  const flatIdDeps: Record<string, string> = {}
  const idToExports: Record<string, ExportsData> = {}
  const flatIdToExports: Record<string, ExportsData> = {}

  await init
  for (const id in deps) {
    const flatId = flattenId(id)
    flatIdDeps[flatId] = deps[id]
    const entryContent = fs.readFileSync(deps[id], 'utf-8')
    const exportsData = parse(entryContent) as ExportsData
    for (const { ss, se } of exportsData[0]) {
      const exp = entryContent.slice(ss, se)
      if (/export\s+\*\s+from/.test(exp)) {
        exportsData.hasReExports = true
      }
    }
    idToExports[id] = exportsData
    flatIdToExports[flatId] = exportsData
  }

  const define: Record<string, string> = {
    'process.env.NODE_ENV': JSON.stringify(config.mode)
  }
  for (const key in config.define) {
    const value = config.define[key]
    define[key] = typeof value === 'string' ? value : JSON.stringify(value)
  }

  /************************************************************************
   * 关键步骤四：解析用户依赖优化配置，调用esbuild构建文件，
   * 并将构建结果存入 outdir: cacheDir
  *************************************************************************/
  const start = Date.now()

  const { plugins = [], ...esbuildOptions } =
    config.optimizeDeps?.esbuildOptions ?? {}

  const result = await build({
    absWorkingDir: process.cwd(),
    entryPoints: Object.keys(flatIdDeps),
    bundle: true,
    format: 'esm',
    external: config.optimizeDeps?.exclude,
    logLevel: 'error',
    splitting: true,
    sourcemap: true,
    outdir: cacheDir,
    treeShaking: 'ignore-annotations',
    metafile: true,
    define,
    plugins: [
      ...plugins,
      esbuildDepPlugin(flatIdDeps, flatIdToExports, config, ssr) // 自定义的 esbuild 插件，能将 cjs 规范的依赖包换成 ES6 形式。
    ],
    ...esbuildOptions
  })

  /************************************************************************
   * 关键步骤五：将构建后的依赖信息存入 _metadata.json
  *************************************************************************/
  const meta = result.metafile!
  // path.relative () 方法根据当前工作目录返回从 from 到 to 的相对路径。
  // the paths in `meta.outputs` are relative to `process.cwd()`
  const cacheDirOutputPath = path.relative(process.cwd(), cacheDir)
  //组装依赖 optimized 对象，key 是依赖名称，value 值是该依赖相关的文件路径和嵌套依赖信息
  for (const id in deps) {
    const entry = deps[id]
    data.optimized[id] = {
      file: normalizePath(path.resolve(cacheDir, flattenId(id) + '.js')),
      src: entry,
      needsInterop: needsInterop(
        id,
        idToExports[id],
        meta.outputs,
        cacheDirOutputPath
      )
    }
  }
  // 存入 _metadata.json
  writeFile(dataPath, JSON.stringify(data, null, 2))

  debug(`deps bundled in ${Date.now() - start}ms`)
  return data
}
```
`getDepHash` 文件指纹的生成，可以看出会自动触发预构建的 lock 文件和 `vite.config.js` 中字段：
```js
const lockfileFormats = ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml']
function getDepHash(root: string, config: ResolvedConfig): string {
  let content = lookupFile(root, lockfileFormats) || ''
  // also take config into account
  // only a subset of config options that can affect dep optimization
  content += JSON.stringify(
    {
      mode: config.mode,
      root: config.root,
      resolve: config.resolve,
      assetsInclude: config.assetsInclude,
      plugins: config.plugins.map((p) => p.name),
      optimizeDeps: {
        include: config.optimizeDeps?.include,
        exclude: config.optimizeDeps?.exclude
      }
    },
    (_, value) => {
      if (typeof value === 'function' || value instanceof RegExp) {
        return value.toString()
      }
      return value
    }
  )
  return createHash('sha256').update(content).digest('hex').substr(0, 8)
}
```

关键代码，扫描源码，获取依赖 `({ deps, missing } = await scanImports(config))`
```js
// vite/src/node/optimizer/scan.ts
export async function scanImports(config: ResolvedConfig): Promise<{
  deps: Record<string, string>
  missing: Record<string, string>
}> {
  const s = Date.now()

  /****************************************
   * 解析得到 entries
   ****************************************/
  let entries: string[] = []

  const explicitEntryPatterns = config.optimizeDeps?.entries
  const buildInput = config.build.rollupOptions?.input

  if (explicitEntryPatterns) {
    entries = await globEntries(explicitEntryPatterns, config)
  } else if (buildInput) {
    const resolvePath = (p: string) => path.resolve(config.root, p)
    if (typeof buildInput === 'string') {
      entries = [resolvePath(buildInput)]
    } else if (Array.isArray(buildInput)) {
      entries = buildInput.map(resolvePath)
    } else if (isObject(buildInput)) {
      entries = Object.values(buildInput).map(resolvePath)
    } else {
      throw new Error('invalid rollupOptions.input value.')
    }
  } else {
    entries = await globEntries('**/*.html', config)
  }

  // Non-supported entry file types and virtual files should not be scanned for
  // dependencies.
  entries = entries.filter(
    (entry) =>
      (JS_TYPES_RE.test(entry) || htmlTypesRE.test(entry)) &&
      fs.existsSync(entry)
  )

  if (!entries.length) {
    config.logger.warn(
      'Could not determine entry point from rollupOptions or html files. Skipping dependency pre-bundling.'
    )
    return { deps: {}, missing: {} }
  } else {
    debug(`Crawling dependencies using entries:\n  ${entries.join('\n  ')}`)
  }

  /*******************************************************************
   * 对每个 entry 单独 build，
   * 自定义了一个 esbuildScanPlugin 插件，主要是注册 build 中钩子函数事件
   ********************************************************************/
  const deps: Record<string, string> = {}
  const missing: Record<string, string> = {}
  const container = await createPluginContainer(config)
  const plugin = esbuildScanPlugin(config, container, deps, missing, entries)

  const { plugins = [], ...esbuildOptions } =
    config.optimizeDeps?.esbuildOptions ?? {}

  await Promise.all(
    entries.map((entry) =>
      build({
        absWorkingDir: process.cwd(),
        write: false,
        entryPoints: [entry],
        bundle: true,
        format: 'esm',
        logLevel: 'error',
        plugins: [...plugins, plugin],
        ...esbuildOptions
      })
    )
  )

  debug(`Scan completed in ${Date.now() - s}ms:`, deps)

  return {
    deps,
    missing
  }
}
```
所以不管是 关键步骤二 `scanImports` ，还是关键步骤四，都用到了 esbuild 的 build 函数。

// TODO: build 函数深入。

