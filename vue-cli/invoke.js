/**
 * vue invoke plugin
 * 在 vue-cli 项目中如果一个插件已经被安装，你可以使用 vue invoke 命令跳过安装过程，只调用它的生成器 generator.js。
 * 
 * vue add plugin 在最后也依赖了 invoke 命令
 * invoke(pluginName, options, context)
 */

// 命令入口
program
  .command('invoke <plugin> [pluginOptions]')
  .description('invoke the generator of a plugin in an already created project')
  .option('--registry <url>', 'Use specified npm registry when installing dependencies (only for npm)')
  .allowUnknownOption()
  .action((plugin) => {
    require('../lib/invoke')(plugin, minimist(process.argv.slice(3)))
  })

/**
 * ../lib/invoke
 */
module.exports = (...args) => {
  return invoke(...args).catch(err => {
    error(err)
    if (!process.env.VUE_CLI_TEST) {
      process.exit(1)
    }
  })
}

/**
 * vue invoke eslint --registry https:wwww.npm.com
 * 
 * @param {*} pluginName 安装插件的名称：eslint
 * @param {*} options // 传入的命令行参数，即 minimist(process.argv.slice(3)) 返回 {registry: 'https:wwww.npm.com'}
 * @param {*} context 
 */
async function invoke (pluginName, options = {}, context = process.cwd()) {
  /**
   * 第一步：确认当前项目有没有未暂存的状态，提示用户
   * 
   * 具体见 add.js。
   * 主要原理是尝试执行 
   * onst { stdout } = await execa('git', ['status', '--porcelain'], { cwd: context })
   * 如果没有输出 stdout if 判断为假，说明当前工作区是干净的，返回 true
   * 如果有输出 stdout if 判断为真，则说明工作区有未暂存的文件，则提示提交暂存区，或询问用户选择是否覆盖或退出
   */
  if (!(await confirmIfGitDirty(context))) {
    return
  }

  delete options._
  const pkg = getPkg(context)

  // attempt to locate the plugin in package.json
  /**
   * 第二步：尝试在 package.json 中查找该插件，没有找到则提示报错
   * 
   * 所以在 vue add 命令中是先执行 npm install plugin 后，再调用 invoke 命令，
   * 确保 npm install 后将插件信息更新到了 package.json 依赖对象中。
   */
  const findPlugin = deps => {
    if (!deps) return
    let name
    // official
    if (deps[(name = `@vue/cli-plugin-${pluginName}`)]) {
      return name
    }
    // full id, scoped short, or default short 将插件别名解析成完整的插件名称，具体见 add.js
    if (deps[(name = resolvePluginId(pluginName))]) {
      return name
    }
  }

  const id = findPlugin(pkg.devDependencies) || findPlugin(pkg.dependencies)
  if (!id) {
    throw new Error(
      `Cannot resolve plugin ${chalk.yellow(pluginName)} from package.json. ` +
        `Did you forget to install it?`
    )
  }

  /**
   * 第三步：确定插件已经安装后，加载插件目录下的 generator.js 或 generator/index.js
   */
  const pluginGenerator = loadModule(`${id}/generator`, context)
  if (!pluginGenerator) {
    throw new Error(`Plugin ${id} does not have a generator.`)
  }

  // resolve options if no command line options (other than --registry) are passed,
  // and the plugin contains a prompt module.
  // eslint-disable-next-line prefer-const
  // options 即终端调用命令传入的参数： minimist(process.argv.slice(3)) 返回 {registry: 'https:wwww.npm.com'}
  let { registry, $inlineOptions, ...pluginOptions } = options
  if ($inlineOptions) {
    try {
      pluginOptions = JSON.parse($inlineOptions)
    } catch (e) {
      throw new Error(`Couldn't parse inline options JSON: ${e.message}`)
    }
  } else if (!Object.keys(pluginOptions).length) {
    // 执行插件目录下的 prompts.js 文件，进行命令行交互
    let pluginPrompts = loadModule(`${id}/prompts`, context)
    if (pluginPrompts) {
      const prompt = inquirer.createPromptModule()

      if (typeof pluginPrompts === 'function') {
        pluginPrompts = pluginPrompts(pkg, prompt)
      }
      if (typeof pluginPrompts.getPrompts === 'function') {
        pluginPrompts = pluginPrompts.getPrompts(pkg, prompt)
      }
      pluginOptions = await prompt(pluginPrompts)
    }
  }

  const plugin = {
    id,
    apply: pluginGenerator,
    options: {
      registry,
      ...pluginOptions
    }
  }

  await runGenerator(context, plugin, pkg)
}

/**
 * 
 * @param {*} context 当前项目根路径
 * @param {*} plugin 插件信息 {id, apply, options}, 其中 apply 即插件的 generator.js
 * @param {*} pkg package.json 解析出的对象
 * 
 * 关于 Generator 类的初始化和 Generator.gererator() 调用，可以具体查看 generator.js 的解析
 */
async function runGenerator (context, plugin, pkg = getPkg(context)) {
  const isTestOrDebug = process.env.VUE_CLI_TEST || process.env.VUE_CLI_DEBUG
  const afterInvokeCbs = []
  const afterAnyInvokeCbs = []

  /**
   * 初始化 Generator 类
   */
  const generator = new Generator(context, {
    pkg,
    plugins: [plugin],
    files: await readFiles(context),
    afterInvokeCbs,
    afterAnyInvokeCbs,
    invoking: true
  })

  log()
  log(`🚀  Invoking generator for ${plugin.id}...`)
  /**
   * 执行插件 genertor.js 文件
   */
  await generator.generate({
    extractConfigFiles: true,
    checkExisting: true
  })

  /**
   * 因为 generator.js 的作用是通过 generatorAPI 可以向项目添加文件或修改现有文件，
   * 所以需要比较调用插件 generataor.js 后，package.json 中的依赖有没有变化，
   * 如果有变化，需要重新执行 npm install
   * 
   * 注意这里比较两个对象是否相等的方式
   */
  const newDeps = generator.pkg.dependencies
  const newDevDeps = generator.pkg.devDependencies
  const depsChanged =
    JSON.stringify(newDeps) !== JSON.stringify(pkg.dependencies) ||
    JSON.stringify(newDevDeps) !== JSON.stringify(pkg.devDependencies)

  if (!isTestOrDebug && depsChanged) {
    log(`📦  Installing additional dependencies...`)
    log()
    const pm = new PackageManager({ context })
    await pm.install()
  }

  /**
   * 安装后，执行 generator.js 调用过程中注入的完成回调函数
   */
  if (afterInvokeCbs.length || afterAnyInvokeCbs.length) {
    logWithSpinner('⚓', `Running completion hooks...`)
    for (const cb of afterInvokeCbs) {
      await cb()
    }
    for (const cb of afterAnyInvokeCbs) {
      await cb()
    }
    stopSpinner()
    log()
  }

  /**
   * 最后，看下项目文件有没有变化，如果有，在终端下打印出不同的内容，并提示用户 git diff 查看不同，或 git commit 提交变更
   */
  log(`${chalk.green('✔')}  Successfully invoked generator for plugin: ${chalk.cyan(plugin.id)}`)
  const changedFiles = getChangedFiles(context)
  if (changedFiles.length) {
    log(`   The following files have been updated / added:\n`)
    log(chalk.red(changedFiles.map(line => `     ${line}`).join('\n')))
    log()
    log(
      `   You should review these changes with ${chalk.cyan(
        'git diff'
      )} and commit them.`
    )
    log()
  }

  generator.printExitLogs()
}

/**
 * getChangedFiles 原理同 hasYarn hasGit 一样，
 * 都是尝试执行下 git 命令，看是否有输出
 */
module.exports = async function getChangedFiles (context) {
  if (!hasProjectGit(context)) return []

  const { stdout } = await execa('git', [
    'ls-files',
    '-o',
    '--exclude-standard',
    '--full-name'
  ], {
    cwd: context
  })
  if (stdout.trim()) {
    return stdout.split(/\r?\n/g)
  }
  return []
}