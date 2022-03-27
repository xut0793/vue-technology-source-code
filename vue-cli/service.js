/**
 * vue-cli-plugin-service
 * 
 * 本身作为 vue-cli 的插件，但同时其自身也是采用同 vue-cli 类似的插件模式，只不过相对于 vue-cli-service 来说，注入的插件就是其命令。
 * 可以向 vue-cli-service 服务注入所需的命令，如默认的 serve / build / inspect / help 命令，也可以根据 vue-cli-service 提供的 pluginAPI 自定义命令。
 * 
 * 与 vue-cli 通过 generatorApi 实现插件注册，vue-cli-service 是通过 pluginApi 实现命令注册。
 * 
 * 
 * 
 * 这里只解析 service 的核心逻辑，
 * 关于 vue-cli-plugin-service 插件在 vue-cli 中什么时候注册的，如何注册的，见 vue-cli 的 create.js 和 creator.js 分析。
 * 以及 generator/index 执行和 generator/tempmlate 模板拷贝，见 generator.js 和 template .js 分析
 * 
 * 入口：
 * 1. vue serve / vue build
 * 2. npx vue-cli-service serve / build
 * 3. npm run serve
 */
const program = require('commander')
program
  .command('serve')
  .description('alias of "npm run serve" in the current project')
  .allowUnknownOption()
  .action(() => {
    require('../lib/util/runNpmScript')('serve', process.argv.slice(3))
  })

program
  .command('build')
  .description('alias of "npm run serve" in the current project')
  .action((cmd) => {
    require('../lib/util/runNpmScript')('build', process.argv.slice(3))
  })

/***************************************************************************
 * @vue/cli/lib/util/runNpmScript
 ***************************************************************************/
const pkgDir = require('pkg-dir')
const PackageManager = require('./ProjectPackageManager')
const { chalk, execa } = require('@vue/cli-shared-utils')

module.exports = async function runNpmScript (task, additonalArgs) {
  const projectRoot = await pkgDir(process.cwd()) // pkg-dir 包是用来查找距离当前目录 process.cwd() 最近的 package.json 所在目录，因为 package.json 都定义在项目根目录，所以基本用来查找项目根目录
  const pm = new PackageManager({ context: projectRoot }) // 获得当前项目所使用的包管理器，默认 npm

  const args = [task, ...additonalArgs]
  if (pm.bin !== 'yarn') {
    args.unshift('run') 
  }

  const command = chalk.dim(`${pm.bin} ${args.join(' ')}`) // npm run serve [options]
  console.log(`Running ${command}`)

  return await execa(pm.bin, args, { cwd: projectRoot, stdio: 'inherit' })
  // 这里执行 npm run serve 或 npm run build，实际执行的也是 vue-cli-plugin-service 插件向 package.json 的 script 中注入的 vue-cli-service 命令
}

/**************************************************************************
 * @vue/vue-cli-service/bin/vue-cli-service.js
 *************************************************************************/
const { semver, error } = require('@vue/cli-shared-utils')
const requiredVersion = require('../package.json').engines.node

/**
 * 确定当前用户 node 环境版本是不是符合 vue-cli-serivce 项目 package.json 中 engines.node 限制的版本范围内
 */
if (!semver.satisfies(process.version, requiredVersion, { includePrerelease: true })) {
  error(
    `You are using Node ${process.version}, but vue-cli-service ` +
    `requires Node ${requiredVersion}.\nPlease upgrade your Node version.`
  )
  process.exit(1)
}

/**
 * 解析 vue-cli-service 命令传入的参数，基本都是布尔值类型
 */
const rawArgv = process.argv.slice(2)
const args = require('minimist')(rawArgv, {
  boolean: [
    // build
    'modern',
    'report',
    'report-json',
    'inline-vue',
    'watch',
    // serve
    'open',
    'copy',
    'https',
    // inspect
    'verbose'
  ]
})
const command = args._[0] // vue-cli-service serve --open 中的 serve 命令；vue-cli-service build --report 中的 build 命令

const Service = require('../lib/Service')

/**
 * new Service 初始化 constructor 函数内主要逻辑就是解析 service 服务需要用到的插件 plugins，它是一个数组项：
 * [{id, apply},...], 其中 id 为插件名称，并有 built-in: 和 local: 前缀区分，apply 为插件导出的函数 fn(pluginApi) {}，会以 pluginApi 作为入参
 */
const service = new Service(process.env.VUE_CLI_CONTEXT || process.cwd())

service.run(command, args, rawArgv).catch(err => {
  error(err)
  process.exit(1)
})

/********************************************************************************
 * ../lib/Service.js
 ********************************************************************************/
module.exports = class Service {
  constructor (context, { plugins, pkg, inlineOptions, useBuiltIn } = {}) {
    checkWebpack(context) // 检查 webpack 版本

    process.VUE_CLI_SERVICE = this
    this.initialized = false
    this.context = context
    this.inlineOptions = inlineOptions
    this.webpackChainFns = []
    this.webpackRawConfigFns = []
    this.devServerConfigFns = []
    /**
     * this.commands 存放着 vue-cli-service 解析到所有命令，包含默认的内部命令和用户自定义的命令
     * 
     * commands 这个值由调用插件 apply(new PluginAPI(id, this), this.projectOptions) 过程中 api.registerCommand() 函数中初始化
     * 
     * 即 PluginAPI 中提供的
     *   PluginAPI.prototype.registerCommand (name, opts, fn) {
     *     if (typeof opts === 'function') {
     *       fn = opts
     *       opts = null
     *     }
     *     this.service.commands[name] = { fn, opts: opts || {} }
     *   }
     * 
     * 所以 this.commands 的结构是
     * this.commands = {
     *  serve: {fn, opts},
     *  build: {fn, opts},
     *  ...
     * }
     * 
     * 这其中 opts 是信息会由 vue-cli-serve help serve 命令使用统一打印对应命令的帮助信息
     * 而命令的主要业务逻辑定义在 fn 函数中。在 this.run 函数中被执行
     *   let command = this.commands[name]
     *   const { fn } = command
     *   return fn(args, rawArgv)
     */
    this.commands = {}
    // Folder containing the target package.json for plugins
    this.pkgContext = context
    // package.json containing the plugins
    this.pkg = this.resolvePkg(pkg) // 解析到 pckage.json 对象
    // If there are inline plugins, they will be used instead of those
    // found in package.json.
    // When useBuiltIn === false, built-in plugins are disabled. This is mostly
    // for testing.
    // plugins 是解析获取的插件数组 [{id, apply},...], 其中 id 为插件名称，并有 built-in: 和 local: 前缀，apply 为插件导出的函数 fn(pluginApi) {}
    this.plugins = this.resolvePlugins(plugins, useBuiltIn)
    // pluginsToSkip will be populated during run()
    // 缓存已安装过的插件
    this.pluginsToSkip = new Set()
    // resolve the default mode to use for each command
    // this is provided by plugins as module.exports.defaultModes
    // so we can get the information without actually applying the plugin.
    /**
     * 这里要了解 vue-cli-service 插件的定义结构，在插件入口文件默认导出插件调用函数 fn(pluginAPI)，还导出一个 defaultModes 对象指明插件应用对应命令时环境变量 NODE_ENV 值
     * module.exports.defaultModes = {
     *   serve: 'development'
     * }
     */
    this.modes = this.plugins.reduce((modes, { apply: { defaultModes } }) => {
      return Object.assign(modes, defaultModes)
    }, {})
  }

  /**
   * vue-cli-service 服务指定的 package.json 有三个来源
   * 1. 项目根目录下的 package.json
   * 2. 在项目根目录下的 package.json 中 vuePlugins.resolveFrom 指定的路径下的 package.json
   * 3. 命令行传入的行内 json，基本很少用
   * 
   */
  resolvePkg (inlinePkg, context = this.context) {
    if (inlinePkg) {
      return inlinePkg
    }
    const pkg = resolvePkg(context)
    if (pkg.vuePlugins && pkg.vuePlugins.resolveFrom) {
      this.pkgContext = path.resolve(context, pkg.vuePlugins.resolveFrom)
      return this.resolvePkg(null, this.pkgContext)
    }
    return pkg
  }

  /**
   * 解析插件，vue-cli-service 中有三种插件：
   * 1. builtInPlugins：vue-cli-service 内置的插件，见下面 builtInPlugins 定义的数组
   * 2. projectPlugins: package.json 的开发依赖 devDependencies 和生产依赖 dependencies 中 @vue/cli-plugin-xx 或 vue-cli-plugin-xx 开头的插件
   * 3. inlinePlugins: 指的是直接在实例化 Service 时传入
   * 4. localPlugins: package.json 中 vuePlugins.service = [] 自定义的本地插件
   * 
   * 1 和 2 的插件标识前缀：built-in:
   * 4 的插件标识前缀：local:
   * 
   * 结果返回所有类型插件合并后的数组 [{id, apply},...] apply 是插件具体执行逻辑，导出一个函数，函数接受入参 pluginApi
   */
  resolvePlugins (inlinePlugins, useBuiltIn) {
    const idToPlugin = (id, absolutePath) => ({
      id: id.replace(/^.\//, 'built-in:'), // "built-in:commands/serve"
      apply: require(absolutePath || id) // require('./commands/serve')
    })

    let plugins

    const builtInPlugins = [
      './commands/serve',
      './commands/build',
      './commands/inspect',
      './commands/help',
      // config plugins are order sensitive
      './config/base',
      './config/assets',
      './config/css',
      './config/prod',
      './config/app'
    ].map((id) => idToPlugin(id))

    if (inlinePlugins) {
      plugins = useBuiltIn !== false
        ? builtInPlugins.concat(inlinePlugins)
        : inlinePlugins
    } else {
      const projectPlugins = Object.keys(this.pkg.devDependencies || {})
        .concat(Object.keys(this.pkg.dependencies || {}))
        .filter(isPlugin) // const isPlugin = (id) => /^(@vue\/|vue-|@[\w-]+(\.)?[\w-]+\/vue-)cli-plugin-/.test(id)
        .map(id => {
          if (
            this.pkg.optionalDependencies &&
            id in this.pkg.optionalDependencies
          ) {
            let apply = loadModule(id, this.pkgContext)
            if (!apply) {
              warn(`Optional dependency ${id} is not installed.`)
              apply = () => {}
            }

            return { id, apply }
          } else {
            return idToPlugin(id, resolveModule(id, this.pkgContext))
          }
        })
      plugins = builtInPlugins.concat(projectPlugins)
    }

    // Local plugins 加载本地自定义的 service 插件，package.json 中的 vuePlugins.service = ['/local/plugin/path', ...] 要求数组形式
    if (this.pkg.vuePlugins && this.pkg.vuePlugins.service) {
      const files = this.pkg.vuePlugins.service
      if (!Array.isArray(files)) {
        throw new Error(`Invalid type for option 'vuePlugins.service', expected 'array' but got ${typeof files}.`)
      }
      plugins = plugins.concat(files.map(file => ({
        id: `local:${file}`,
        apply: loadModule(`./${file}`, this.pkgContext)
      })))
    }

    return plugins
  }


  /**
   * const service = new Service(process.env.VUE_CLI_CONTEXT || process.cwd())
   * new Service 服务实例化后，接着调用 run 函数：
   * service.run(command, args, rawArgv).catch(err => {
   *   error(err)
   *   process.exit(1)
   * })
   */
  async run (name, args = {}, rawArgv = []) {
    // resolve mode
    // prioritize inline --mode
    // fallback to resolved default modes from plugins or development if --watch is defined
    // 确定命令对应的构建模式 mode，后面 webpack 运行的 mode 会依赖于此 mode
    const mode = args.mode || (name === 'build' && args.watch ? 'development' : this.modes[name])

    // --skip-plugins arg may have plugins that should be skipped during init()
    // 如果命令行中指明在 init 初始化过程中要跳过的插件名，则将该插件解析插入到 this.pluginsToSkip 中缓存起来
    // vue-cli-service serve --skip-plugins eslint babel
    this.setPluginsToSkip(args)

    // load env variables, load user config, apply plugins
    // 加载环境文件、加载 vue.config.js 、注册插件（即注册命令）
    this.init(mode)


    /**
     * 对 CLI 命令进行一个判断，主要有一下三种情况：
     * 1. 输入了命令 name ，但是并没有通过 api.registerCommand 注册，即非法命令，process.exit(1)
     * 2. 直接输入了 vue-cli-service 或者 vue-cli-service --help，加载内置 help 插件
     * 3. 正常输入执行注册插件时返回的 fn 函数。如 vue-cli-service serve 的 fn 函数主要是调用 pluginAPI.prototype.resolveWebpackConfig 拿到 webpack 完整配置，运行 webpack 和 webpack-dev-service
     */
    args._ = args._ || []
    let command = this.commands[name] // 加载插件时注册了 command，api.registerCommand() 返回值 command = {fn, opts}
    // 1. 未注册的命令报错
    if (!command && name) {
      error(`command "${name}" does not exist.`)
      process.exit(1)
    }
    // 2. vue-cli-service 或者 vue-cli-service --help，加载内置 help 插件，打印已注册命令的 opts
    if (!command || args.help || args.h) {
      command = this.commands.help
    } else {
      // vue-cli-service serve --open 将 vue-cli-service 命令收集的命令行参数中去掉命令自身 serve，剩余的就是该命令下传入的命令行参数
      args._.shift() // remove command itself
      rawArgv.shift()
    }
    /**
     * 执行对应命令插件的核心逻辑,这里 fn 即在上述 this.init(mode) 函数中调用 api.registerCommand(command,opts,fn) 注册命令函数传入的第三参数。
     * 即 PluginAPI 中提供的
     *   PluginAPI.prototype.registerCommand (name, opts, fn) {
     *     if (typeof opts === 'function') {
     *       fn = opts
     *       opts = null
     *     }
     *     this.service.commands[name] = { fn, opts: opts || {} }
     *   }
     * 
     * 所以 this.commands 的结构是
     * this.commands = {
     *  serve: {fn, opts},
     *  build: {fn, opts},
     *  ...
     * }
     */
    const { fn } = command
    return fn(args, rawArgv)
  }

  /**
   * 进入 this.init(mode)
   * 
   * service.init 主要有三个功能：
   * 1. loadEnv 加载对应模式下本地的环境变量文件
   * 2. loadUserOptions 解析 vue.config.js 或者 package.vue
   * 3. apply 执行所有被加载的插件，这里就是该命令下动态生成 webpack 配置 config 并执行
   */
  init (mode = process.env.VUE_CLI_MODE) {
    if (this.initialized) {
      return
    }
    this.initialized = true
    this.mode = mode

    /**
     * 注意这里两个 loadEnv 函数执行的顺序，即说明 .env.development 优于 .env 文件
     */
    // load mode .env
    if (mode) {
      this.loadEnv(mode)
    }
    // load base .env
    this.loadEnv()

    // load user config
    const userOptions = this.loadUserOptions() // 加载 vue.config.js 配置文件 或者 package.json 文件中的 vue 属性值
    this.projectOptions = defaultsDeep(userOptions, defaults())
    /**
     * _.defaultsDeep({ 'a': { 'b': 2 } }, { 'a': { 'b': 1, 'c': 3 } });
     *  => { 'a': { 'b': 2, 'c': 3 } }
     */

    debug('vue:project-config')(this.projectOptions)

    // apply plugins. 注册插件
    // 对于buit-in:command/xx 如 serve / build / inspect 插件 apply 调用执行 api.registerCommand() 函数，向 this.commands 对象中注册命令
    // 对于 built-in:config/xx 如 app / base / css / assert 插件，调用 api.chainWebpack 或 api.configureWebpack 函数向 this.webpackChainFns 数组和 this.webpackRawConfigFns 数组中添加 vue 项目所需的基本的 webpack 配置
    this.plugins.forEach(({ id, apply }) => {
      if (this.pluginsToSkip.has(id)) return
      apply(new PluginAPI(id, this), this.projectOptions)
    })

    // 将 vue.config.js 中 webapck 相关配置函数收集到统一的 webpackChainFns 和 webpackRawConfigFns 中
    // apply webpack configs from project config file
    if (this.projectOptions.chainWebpack) {
      this.webpackChainFns.push(this.projectOptions.chainWebpack)
    }
    if (this.projectOptions.configureWebpack) {
      this.webpackRawConfigFns.push(this.projectOptions.configureWebpack)
    }
  }

  /**
   * 加载本地的环境文件，环境文件的作用就是设置某个模式下特有的变量
   * 加载环境变量其实要注意的就是优先级的问题，下面的代码中 load 函数调用顺序已经体现了：
   * 先加载 .env.mode.local，然后加载 .env.mode 最后再加载 .env
   * 由于 dotenv-expand.js 库中源码：(https://github.com/motdotla/dotenv-expand/blob/master/lib/main.js)
   * value = environment.hasOwnProperty(key) ? environment[key] : (config.parsed[key] || '')
   * 所以环境变量值不会被覆盖，即 .env.mode.local 的优先级最高，.env.mode 次之，.env 优先级最低
   * 另外，注意一点：.env 环境文件中的变量不会覆盖命令行中执行时设置的环境变量，比如 corss-env NODE_ENV=development vue-cli-service serve
   * 
   * 总之一句话，更早设置的环境变量不会被后面设置的覆盖。
   * 
   * .env.mode.local 与 .env.mode 的区别就是前者会被 git 追踪文件时忽略掉。
   * 
   * 关于环境变量 [node-expand_使用dotenv-expand掌握Node.js上的环境变量](https://blog.csdn.net/weixin_26737625/article/details/108648901)
   */
  loadEnv (mode) {
    const logger = debug('vue:env')
    // path/.env.production || path/.env.development || ...
    const basePath = path.resolve(this.context, `.env${mode ? `.${mode}` : ``}`)
    // path/.env.local.production
    const localPath = `${basePath}.local`

    const load = envPath => {
      try {
        const env = dotenv.config({ path: envPath, debug: process.env.DEBUG })

        /**
         * dotenv-expand.js 源码比较短的 46行：(https://github.com/motdotla/dotenv-expand/blob/master/lib/main.js)
         * 有一句核心代码：
         * var environment = config.ignoreProcessEnv ? {} : process.env
         * value = environment.hasOwnProperty(key) ? environment[key] : (config.parsed[key] || '')
         * for (var processKey in config.parsed) {
         *   environment[processKey] = config.parsed[processKey]
         * }
         * 即已存在 process.env[key]=value 优先级更高，不会被覆盖
         * 所以先加载 .env.development 再加载 .env
         * 即 .env.development 变量优先级高于 .env
         */
        dotenvExpand(env) // 会把 .env 设置的变量挂载到 process.env 对象上
        logger(envPath, env)
      } catch (err) {
        // only ignore error if file is not found
        if (err.toString().indexOf('ENOENT') < 0) {
          error(err)
        }
      }
    }

    load(localPath)
    load(basePath)

    // 省略代码...
  }
}

/************************************************************************
 * 上面基本就是 service 运行的逻辑了。
 * 但是看到这里，可能还有一个疑问，不管是运行 vue-cli-service serve 还是 build 命令，
 * vue 项目的 webpack 是怎么配置和运行的呢？
 * 
 * 这就涉及到 vue-cli-service 的具体插件的代码逻辑了。
 * 这里以 serve 插件举例
 ***********************************************************************/

/**
 * 这里再简短介绍下 vue-cli-service 插件和命令的注册过程
 * 
 * 第一步：向 vue-cli-service 注册插件
 * 发生在 Service 类的构造函数中 constructor(): this.plugins = this.resolvePlugins(plugins, useBuiltIn)
 * 定义一个内置默认插件数组 ['./commands/serve.js',...]，通过 idToPlugin 函数，解析成 this.plugins = [{id, apply},...], 
 * 其中 id 为插件名称，并有 built-in: 和 local: 前缀，apply 为插件导出的函数 fn(pluginApi) {}
 * 
 * 第二步：执行插件 apply 函数向 vue-cli-service 注册命令 api.registerCommand(name,options,fn)
 * 发生在 Service.prototype.run() 函数中调用 Service.prototype.init() 函数中
 * 
 *  this.plugins.forEach(({ id, apply }) => {
 *       if (this.pluginsToSkip.has(id)) return
 *       apply(new PluginAPI(id, this), this.projectOptions)
 *     })
 * 
 * 第三步：执行函数核心逻辑，即 this.commands[name].fn
 * 发生在 Service.prototype.run() 函数最后
 *     const { fn } = command
 *     return fn(args, rawArgv)
 */

 // 所以现在看下 serve.js 代码: @vue/cli-service/lib/commands/serve.js
 module.exports = (api, options) => { // 这里的 options 即 projectOptions 即 vue.config.js 配置对象
  api.registerCommand(
    'serve',

    /**
     * 这部分命令帮助信息会由 vue-cli-service help serve 命令调用打印在终端
     */
    {
      description: 'start development server',
      usage: 'vue-cli-service serve [options] [entry]',
      options: {
        '--open': `open browser on server start`,
        '--copy': `copy url to clipboard on server start`,
        '--stdin': `close when stdin ends`,
        '--mode': `specify env mode (default: development)`,
        '--host': `specify host (default: ${defaults.host})`,
        '--port': `specify port (default: ${defaults.port})`,
        '--https': `use https (default: ${defaults.https})`,
        '--public': `specify the public network URL for the HMR client`,
        '--skip-plugins': `comma-separated list of plugin names to skip for this run`
      }
    },

    /**
     * 这个业务函数会由 Service 原型方法 run 函数最后调用。
     * const { fn } = command 
     * return fn(args, rawArgv)
     * 
     * @param {*} args vue-cli-service serve --open 中解析的命令行参数 args = {open:true}
     * 
     * 主要分为以下步骤：
     * 1. 注入 serve 特别的 webpack 配置： api.chainWebpack
     * 2. 获取 webpack 配置并校验：api.resolveWebpackConfig() / validateWebpackConfig
     * 3. 获取 devServer 配置
     * 4. 注入 webpack-dev-server 和 hot-reload（HRM）中间件入口
     * 5. 创建 compiler 和  webpack-dev-server 实例 service 
     */
    async function serve (args) {
      info('Starting development server...')

      // although this is primarily a dev server, it is possible that we
      // are running it in a mode with a production env, e.g. in E2E tests.
      const isInContainer = checkInContainer()
      const isProduction = process.env.NODE_ENV === 'production'

      const url = require('url')
      const { chalk } = require('@vue/cli-shared-utils')
      const webpack = require('webpack')
      const WebpackDevServer = require('webpack-dev-server')
      const portfinder = require('portfinder')
      const prepareURLs = require('../util/prepareURLs')
      const prepareProxy = require('../util/prepareProxy')
      const launchEditorMiddleware = require('launch-editor-middleware')
      const validateWebpackConfig = require('../util/validateWebpackConfig')
      const isAbsoluteUrl = require('../util/isAbsoluteUrl')

      // configs that only matters for dev server
      api.chainWebpack(webpackConfig => {
        if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') {
          webpackConfig
            .devtool('eval-cheap-module-source-map')

          webpackConfig
            .plugin('hmr')
              .use(require('webpack/lib/HotModuleReplacementPlugin'))

          // https://github.com/webpack/webpack/issues/6642
          // https://github.com/vuejs/vue-cli/issues/3539
          webpackConfig
            .output
              .globalObject(`(typeof self !== 'undefined' ? self : this)`)

          if (!process.env.VUE_CLI_TEST && options.devServer.progress !== false) {
            webpackConfig
              .plugin('progress')
              .use(webpack.ProgressPlugin)
          }
        }
      })

      // resolve webpack config
      const webpackConfig = api.resolveWebpackConfig()

      // check for common config errors
      validateWebpackConfig(webpackConfig, api, options)

      // load user devServer options with higher priority than devServer
      // in webpack config
      const projectDevServerOptions = Object.assign(
        webpackConfig.devServer || {},
        options.devServer
      )

      // expose advanced stats
      if (args.dashboard) {
        const DashboardPlugin = require('../webpack/DashboardPlugin')
        ;(webpackConfig.plugins = webpackConfig.plugins || []).push(new DashboardPlugin({
          type: 'serve'
        }))
      }

      // entry arg
      const entry = args._[0]
      if (entry) {
        webpackConfig.entry = {
          app: api.resolve(entry)
        }
      }

      // resolve server options
      const useHttps = args.https || projectDevServerOptions.https || defaults.https
      const protocol = useHttps ? 'https' : 'http'
      const host = args.host || process.env.HOST || projectDevServerOptions.host || defaults.host
      portfinder.basePort = args.port || process.env.PORT || projectDevServerOptions.port || defaults.port
      const port = await portfinder.getPortPromise()
      const rawPublicUrl = args.public || projectDevServerOptions.public
      const publicUrl = rawPublicUrl
        ? /^[a-zA-Z]+:\/\//.test(rawPublicUrl)
          ? rawPublicUrl
          : `${protocol}://${rawPublicUrl}`
        : null
      const publicHost = publicUrl ? /^[a-zA-Z]+:\/\/([^/?#]+)/.exec(publicUrl)[1] : undefined

      const urls = prepareURLs(
        protocol,
        host,
        port,
        isAbsoluteUrl(options.publicPath) ? '/' : options.publicPath
      )
      const localUrlForBrowser = publicUrl || urls.localUrlForBrowser

      const proxySettings = prepareProxy(
        projectDevServerOptions.proxy,
        api.resolve('public')
      )

      // inject dev & hot-reload middleware entries
      if (!isProduction) {
        const sockPath = projectDevServerOptions.sockPath || '/sockjs-node'
        const sockjsUrl = publicUrl
          // explicitly configured via devServer.public
          ? `?${publicUrl}&sockPath=${sockPath}`
          : isInContainer
            // can't infer public network url if inside a container...
            // use client-side inference (note this would break with non-root publicPath)
            ? ``
            // otherwise infer the url
            : `?` + url.format({
              protocol,
              port,
              hostname: urls.lanUrlForConfig || 'localhost'
            }) + `&sockPath=${sockPath}`
        const devClients = [
          // dev server client
          require.resolve(`webpack-dev-server/client`) + sockjsUrl,
          // hmr client
          require.resolve(projectDevServerOptions.hotOnly
            ? 'webpack/hot/only-dev-server'
            : 'webpack/hot/dev-server')
          // TODO custom overlay client
          // `@vue/cli-overlay/dist/client`
        ]
        if (process.env.APPVEYOR) {
          devClients.push(`webpack/hot/poll?500`)
        }
        // inject dev/hot client
        addDevClientToEntry(webpackConfig, devClients)
      }

      // create compiler
      const compiler = webpack(webpackConfig)

      // handle compiler error
      compiler.hooks.failed.tap('vue-cli-service serve', msg => {
        error(msg)
        process.exit(1)
      })

      // create server
      const server = new WebpackDevServer(compiler, Object.assign({
        logLevel: 'silent',
        clientLogLevel: 'silent',
        historyApiFallback: {
          disableDotRule: true,
          htmlAcceptHeaders: [
            'text/html',
            'application/xhtml+xml'
          ],
          rewrites: genHistoryApiFallbackRewrites(options.publicPath, options.pages)
        },
        contentBase: api.resolve('public'),
        watchContentBase: !isProduction,
        hot: !isProduction,
        injectClient: false,
        compress: isProduction,
        publicPath: options.publicPath,
        overlay: isProduction // TODO disable this
          ? false
          : { warnings: false, errors: true }
      }, projectDevServerOptions, {
        https: useHttps,
        proxy: proxySettings,
        public: publicHost,
        // eslint-disable-next-line no-shadow
        before (app, server) {
          // launch editor support.
          // this works with vue-devtools & @vue/cli-overlay
          app.use('/__open-in-editor', launchEditorMiddleware(() => console.log(
            `To specify an editor, specify the EDITOR env variable or ` +
            `add "editor" field to your Vue project config.\n`
          )))
          // allow other plugins to register middlewares, e.g. PWA
          api.service.devServerConfigFns.forEach(fn => fn(app, server))
          // apply in project middlewares
          projectDevServerOptions.before && projectDevServerOptions.before(app, server)
        },
        // avoid opening browser
        open: false
      }))

      ;['SIGINT', 'SIGTERM'].forEach(signal => {
        process.on(signal, () => {
          server.close(() => {
            process.exit(0)
          })
        })
      })

      if (args.stdin) {
        process.stdin.on('end', () => {
          server.close(() => {
            process.exit(0)
          })
        })

        process.stdin.resume()
      }

      // on appveyor, killing the process with SIGTERM causes execa to
      // throw error
      if (process.env.VUE_CLI_TEST) {
        process.stdin.on('data', data => {
          if (data.toString() === 'close') {
            console.log('got close signal!')
            server.close(() => {
              process.exit(0)
            })
          }
        })
      }

      return new Promise((resolve, reject) => {
        // log instructions & open browser on first compilation complete
        let isFirstCompile = true
        compiler.hooks.done.tap('vue-cli-service serve', stats => {
          if (stats.hasErrors()) {
            return
          }

          let copied = ''
          if (isFirstCompile && args.copy) {
            try {
              require('clipboardy').writeSync(localUrlForBrowser)
              copied = chalk.dim('(copied to clipboard)')
            } catch (_) {
              /* catch exception if copy to clipboard isn't supported (e.g. WSL), see issue #3476 */
            }
          }

          const networkUrl = publicUrl
            ? publicUrl.replace(/([^/])$/, '$1/')
            : urls.lanUrlForTerminal

          console.log()
          console.log(`  App running at:`)
          console.log(`  - Local:   ${chalk.cyan(urls.localUrlForTerminal)} ${copied}`)
          if (!isInContainer) {
            console.log(`  - Network: ${chalk.cyan(networkUrl)}`)
          } else {
            console.log()
            console.log(chalk.yellow(`  It seems you are running Vue CLI inside a container.`))
            if (!publicUrl && options.publicPath && options.publicPath !== '/') {
              console.log()
              console.log(chalk.yellow(`  Since you are using a non-root publicPath, the hot-reload socket`))
              console.log(chalk.yellow(`  will not be able to infer the correct URL to connect. You should`))
              console.log(chalk.yellow(`  explicitly specify the URL via ${chalk.blue(`devServer.public`)}.`))
              console.log()
            }
            console.log(chalk.yellow(`  Access the dev server via ${chalk.cyan(
              `${protocol}://localhost:<your container's external mapped port>${options.publicPath}`
            )}`))
          }
          console.log()

          if (isFirstCompile) {
            isFirstCompile = false

            if (!isProduction) {
              const buildCommand = hasProjectYarn(api.getCwd()) ? `yarn build` : hasProjectPnpm(api.getCwd()) ? `pnpm run build` : `npm run build`
              console.log(`  Note that the development build is not optimized.`)
              console.log(`  To create a production build, run ${chalk.cyan(buildCommand)}.`)
            } else {
              console.log(`  App is served in production mode.`)
              console.log(`  Note this is for preview or E2E testing only.`)
            }
            console.log()

            if (args.open || projectDevServerOptions.open) {
              const pageUri = (projectDevServerOptions.openPage && typeof projectDevServerOptions.openPage === 'string')
                ? projectDevServerOptions.openPage
                : ''
              openBrowser(localUrlForBrowser + pageUri)
            }

            // Send final app URL
            if (args.dashboard) {
              const ipc = new IpcMessenger()
              ipc.send({
                vueServe: {
                  url: localUrlForBrowser
                }
              })
            }

            // resolve returned Promise
            // so other commands can do api.service.run('serve').then(...)
            resolve({
              server,
              url: localUrlForBrowser
            })
          } else if (process.env.VUE_CLI_TEST) {
            // signal for test to check HMR
            console.log('App updated')
          }
        })

        server.listen(port, host, err => {
          if (err) {
            reject(err)
          }
        })
      })
    }
  )
}

/**
 * 通过 serve 插件的 fn 函数，我们可以看出 vue-cli 创建的项目，webpack 配置都是存在内存中的，并没有实际的 webpack.config.js 文件
 * 主要是通过 webpack 提供的 api 调用方式运行 webpack：
 * const compiler = webpack(webpackConfig)
 * const server = new WebpackDevServer(compiler, options)
 * server.listen(port, host, cb)
 * 
 * webpackConfg 配置将基本配置和命令特定配置都作为 Service 的插件通过 PluginApi 开放的接品进行注册，存入 Service 实例的
 * this.webapckChainFns 和 this.webpackRawConfigFns 数组中，开发服务器配置存入 this.devServerConfigFns 数组中。
 * 最后通过 this.resolveWebpackConfig 函数合成最终的一份 config 用于生成 compiler = webpack(config)
 */


/**********************************************************
 * 这里 get 一个有意思的知识点是，如何校验一个对象各个属性格式符合预期规范
 * 即使用 joi.js 这个库
 * 
 * 比如校验用户 vue.config.js 配置对象是否符合预期
 * 在看这里看下@vue/cli-shared-utils 和  @vue/cli-service/lib/options.js
 *********************************************************/
// @vue/cli-shared-utils
exports.createSchema = fn => {
  const joi = require('joi')

  let schema = fn(joi)
  if (typeof schema === 'object' && typeof schema.validate !== 'function') {
    schema = joi.object(schema)
  }

  return schema
}

exports.validate = (obj, schema, cb) => {
  const { error } = schema.validate(obj)
  if (error) {
    cb(error.details[0].message)

    if (process.env.VUE_CLI_TEST) {
      throw error
    } else {
      exit(1)
    }
  }
}

//  @vue/cli-service/lib/options.js
const { createSchema, validate } = require('@vue/cli-shared-utils')
exports.validate = (options, cb) => {
  validate(options, schema, cb) // options 是获取的实际配置对象，schema 定义配置对象预期结构模型
}

// 其中 schema 即定义的 vue.config.js 配置对象的结构模型
const schema = createSchema(joi => joi.object({
  publicPath: joi.string().allow(''),
  outputDir: joi.string(),
  assetsDir: joi.string().allow(''),
  indexPath: joi.string(),
  filenameHashing: joi.boolean(),
  runtimeCompiler: joi.boolean(),
  transpileDependencies: joi.array(),
  productionSourceMap: joi.boolean(),
  parallel: joi.alternatives().try(
    joi.boolean(),
    joi.number().integer()
  ),
  devServer: joi.object(),
  pages: joi.object().pattern(
    /\w+/,
    joi.alternatives().try(
      joi.string().required(),
      joi.array().items(joi.string().required()),

      joi.object().keys({
        entry: joi.alternatives().try(
          joi.string().required(),
          joi.array().items(joi.string().required())
        ).required()
      }).unknown(true)
    )
  ),
  crossorigin: joi.string().valid('', 'anonymous', 'use-credentials'),
  integrity: joi.boolean(),

  // css
  css: joi.object({
    modules:
      joi.boolean()
      .warning('deprecate.error', {
        message: 'Please use `css.requireModuleExtension` instead.'
      })
      .message({
        'deprecate.error':
          'The {#label} option in vue.config.js is deprecated. {#message}'
      }),
    requireModuleExtension: joi.boolean(),
    extract: joi.alternatives().try(joi.boolean(), joi.object()),
    sourceMap: joi.boolean(),
    loaderOptions: joi.object({
      css: joi.object(),
      sass: joi.object(),
      scss: joi.object(),
      less: joi.object(),
      stylus: joi.object(),
      postcss: joi.object()
    })
  }),

  // webpack
  chainWebpack: joi.func(),
  configureWebpack: joi.alternatives().try(
    joi.object(),
    joi.func()
  ),

  // known runtime options for built-in plugins
  lintOnSave: joi.any().valid(true, false, 'error', 'warning', 'default'),
  pwa: joi.object(),

  // 3rd party plugin options
  pluginOptions: joi.object()
}))