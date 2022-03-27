/**
 * 安装没有作用域的包：
 * vue add eslint 会被解析成 vue add vue-cli-plugin-eslint
 * 有作用域时:
 * vue add @vue/eslint 会被解析成 vue add @vue/cli-plugin-eslint
 * 
 * vue add 命令主要两件事：
 * 第一步： 确认当前项目有没有未暂存的状态，提示用户
 * 第二步： 解析插件成完整名称
 * 第三步： 安装插件 npm install vue-cli-plugin-eslint@6.2.0
 * 第四步： 解析插件 generator.js 或 generator/index.js 路径，并调用 invoke 命令执行插件的 generator
 */

/**
 * 入口
 */
program
  .command('add <plugin> [pluginOptions]')
  .description('install a plugin and invoke its generator in an already created project')
  .option('--registry <url>', 'Use specified npm registry when installing dependencies (only for npm)')
  .allowUnknownOption()
  .action((plugin) => {
    require('../lib/add')(plugin, minimist(process.argv.slice(3)))
  })

/**
 * ../lib/add.js
 */
module.exports = (...args) => {
  return add(...args).catch(err => {
    error(err)
    if (!process.env.VUE_CLI_TEST) {
      process.exit(1)
    }
  })
}

/**
 * vue add eslint --config airbnb --lintOn save
 * 
 * @param {*} pluginToAdd 安装插件的名称：eslint
 * @param {*} options // 传入的命令行参数，即 minimist(process.argv.slice(3)) 返回 {config: 'airbnb', lintOn: 'save'}
 * @param {*} context 
 */
async function add (pluginToAdd, options = {}, context = process.cwd()) {
  // 第一步：确认当前项目有没有未暂存的状态，提示用户
  if (!(await confirmIfGitDirty(context))) {
    return
  }

  const pluginRe = /^(@?[^@]+)(?:@(.+))?$/
  const [
    // eslint-disable-next-line
    _skip,
    pluginName,
    pluginVersion
  ] = pluginToAdd.match(pluginRe) // vue add @vue/eslint@6.3.4 匹配出 pluginName='@vue/eslint' pluginVersion='6.3.4'

  // 第二步：解析插件成完整名称
  const packageName = resolvePluginId(pluginName)

  log()
  log(`📦  Installing ${chalk.cyan(packageName)}...`)
  log()

  const pm = new PackageManager({ context })

  /**
   * 第三步： 安装插件 npm install vue-cli-plugin-eslint@6.2.0
   * 
   * ./utils/ProjectPackageManager.js
   * 
   *   npm: {
   *     install: ['install', '--loglevel', 'error'],
   *     add: ['install', '--loglevel', 'error'],
   *     upgrade: ['update', '--loglevel', 'error'],
   *     remove: ['uninstall', '--loglevel', 'error']
   *   },
   * 
   * 如何知道当前安装完成或者报错呢？
   * 因为调用的
   * const execa = require('execa') 
   * const child = execa(command, args, options) 返回的 child 是 node 子进程 child_process 
   * 可以监听 child.on('end', cb) 事件确定命令执行结果。
   * 
   * 具体查看 ./utils/ProjectPackageManager.js 和 ./utils/executeCommand.js
   */
  if (pluginVersion) {
    await pm.add(`${packageName}@${pluginVersion}`)
  } else if (isOfficialPlugin(packageName)) {
    const { latestMinor } = await getVersions()
    await pm.add(`${packageName}@~${latestMinor}`)
  } else {
    await pm.add(packageName, { tilde: true })
  }

  log(`${chalk.green('✔')}  Successfully installed plugin: ${chalk.cyan(packageName)}`)
  log()

  /**
   * 第四步：
   * 解析插件 generator.js 或 generator/index.js 路径
   * 并调用 invoke 命令执行插件的 generator
   */
  const generatorPath = resolveModule(`${packageName}/generator`, context)
  if (generatorPath) {
    invoke(pluginName, options, context)
  } else {
    log(`Plugin ${packageName} does not have a generator to invoke`)
  }
}

/*******************************************************************************************/

/**
 *  第一步：检查当前项目 git 状态
 * const confirmIfGitDirty = require('./util/confirmIfGitDirty')
 */
module.exports = async function confirmIfGitDirty (context) {
  if (process.env.VUE_CLI_SKIP_DIRTY_GIT_PROMPT || process.env.VUE_CLI_API_MODE) {
    return true
  }

  process.env.VUE_CLI_SKIP_DIRTY_GIT_PROMPT = true

  if (!hasProjectGit(context)) {
    return true
  }

  /**
   * 尝试执行 git status --porcelain 如果没有输出说明当前工作区是干净的,
   * 如果有输出，则说明工作区有未暂存的文件
   * 
   * 因为安装插件执行插件的 generator.js 会修改文件或新增文件，
   * 所以执行前工作区有未暂存文件则建议用户暂存，或者询问用户是否强制覆盖
   */
  const { stdout } = await execa('git', ['status', '--porcelain'], { cwd: context })
  if (!stdout) {
    return true
  }

  warn(`There are uncommitted changes in the current repository, it's recommended to commit or stash them first.`)
  const { ok } = await inquirer.prompt([
    {
      name: 'ok',
      type: 'confirm',
      message: 'Still proceed?',
      default: false
    }
  ])
  return ok
}

/**
 * 第二步：解析插件成完整名称: 无作用域型：vue-cli-plugin-foo   有作用域：@vue/cli-plugin-foo
 * const packageName = resolvePluginId(pluginName)
 * 
 * const { resolvePluginId } = require('@vue/cli-shared-utils')
 */
exports.resolvePluginId = id => {
  // already full id
  // e.g. vue-cli-plugin-foo, @vue/cli-plugin-foo, @bar/vue-cli-plugin-foo
  // const pluginRE = /^(@vue\/|vue-|@[\w-]+(\.)?[\w-]+\/vue-)cli-plugin-/
  if (pluginRE.test(id)) {
    return id
  }

  if (id === '@vue/cli-service') {
    return id
  }

  // const officialPlugins = [
  //   'babel',
  //   'e2e-cypress',
  //   'e2e-nightwatch',
  //   'e2e-webdriverio',
  //   'eslint',
  //   'pwa',
  //   'router',
  //   'typescript',
  //   'unit-jest',
  //   'unit-mocha',
  //   'vuex',
  //   'webpack-4'
  // ]
  if (officialPlugins.includes(id)) {
    return `@vue/cli-plugin-${id}`
  }
  // scoped short
  // e.g. @vue/foo, @bar/foo
  if (id.charAt(0) === '@') {
    const scopeMatch = id.match(scopeRE) // const scopeRE = /^@[\w-]+(\.)?[\w-]+\//
    if (scopeMatch) {
      const scope = scopeMatch[0]
      const shortId = id.replace(scopeRE, '')
      return `${scope}${scope === '@vue/' ? `` : `vue-`}cli-plugin-${shortId}`
    }
  }
  // default short
  // e.g. foo
  return `vue-cli-plugin-${id}`
}


/**
 * 第四步：
 * 解析插件 generator.js 或 generator/index.js 路径
 * 并调用 invoke 命令执行插件的 generator
 * 
 *  const generatorPath = resolveModule(`${packageName}/generator`, context)
 * 
 *  const {  resolveModule } = require('@vue/cli-shared-utils')
 */
exports.resolveModule = function (request, context) {
  // 省略代码....

  let resolvedPath
  try {
    try {
      // path.resolve(context, 'package.json') 生成绝对路径
      // createRequire 是一个 node module 的兼容 polyfill
      resolvedPath = createRequire(path.resolve(context, 'package.json')).resolve(request)
    } catch (e) {
      // resolve 即 require.resolve
      resolvedPath = resolve(request, { paths: [context] })
    }
  } catch (e) {}

  return resolvedPath
}