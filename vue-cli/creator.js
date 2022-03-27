module.exports = class Creator extends EventEmitter {

  constructor (name, context, promptModules) {
    super()
    // 省略初始化预设交互的代码
  }
  /**
   * 
   * @param {object} cliOptions vue create -f project_name 命令中解析出来的命令行参数对象
   * 
   * cliOptions = {
   *  preset: <presetName>, 忽略提示符并使用已保存的或远程的预设选项
   *  default: Boolean, 忽略提示符并使用默认预设选项
   *  inlinePreset: <json>, 忽略提示符并使用内联的 JSON 字符串预设选项
   *  packageManager: <command>, 在安装依赖时使用指定的 npm 客户端: npm yarn
   *  registry: <url>, 在安装依赖时使用指定的 npm registry
   *  git: [message], 强制 / 跳过 git 初始化，并可选的指定初始化提交信息
   *  force: Boolean, 跳过 git 初始化
   *  merge: Boolean, 覆写目标目录可能存在的配置
   *  clone: Boolean, 使用 git clone 获取远程预设选项
   *  proxy: <proxyUrl>, 使用指定的代理创建项目
   *  bare:  Boolean, 创建项目时省略默认组件中的新手指导信息
   *  skipGetStarted:  Boolean, 跳过显示“Get started”说明
   * }
   */
  async create (cliOptions = {}, preset = null) {
    /**
     * Creator.create  函数前部分完成了解析交互输入的各种 feature 后得到的预设，
     * 也就是插件的集合。
     * 
     * preset = {
     *       useConfigFiles: answers.useConfigFiles === 'files',
     *       plugins: {
     *          '@vue/cli-plugin-eslint': {},
     *          '@vue/cli-plugin-babel': {},
     *          省略...
     *        }
     *     }
     */

    // 确定用户终端使用的包管理器
    const packageManager = (
      cliOptions.packageManager ||
      loadOptions().packageManager || // loadOptions() 函数是用来加载缓存的配置或 .vuerc 文件中配置选项
      (hasYarn() ? 'yarn' : null) || 
      (hasPnpm3OrLater() ? 'pnpm' : 'npm')
    )

    // hasYarn 函数：在 '@vue/cli-shared-utils' => env.js 
    // exports.hasYarn = () => {
    //   if (process.env.VUE_CLI_TEST) {
    //     return true
    //   }
    //   if (_hasYarn != null) {
    //     return _hasYarn
    //   }
    //   try {
    //     execSync('yarn --version', { stdio: 'ignore' })
    //     return (_hasYarn = true)
    //   } catch (e) {
    //     return (_hasYarn = false)
    //   }
    // }
    await clearConsole()
    /**
     * PackageManager 是一个为了兼容 npm yarn pnpm 等各类包管理器方法的类
     * 相当于一个适配多种包管理器的适配层，根据实际包管理器的不同，实现了
     * 1. 获取和设置注册源 getRegistry / setRegistryEnvs
     * 2. 包管理器的基本命令：install / add / remove / upgrade
     * 等等。
     * 这里我们只关心 Pm.install 即可
     */
    const pm = new PackageManager({ context, forcePackageManager: packageManager })

    log(`✨  Creating project in ${chalk.yellow(context)}.`)
    this.emit('creation', { event: 'creating' })

    // get latest CLI plugin version 获取最新的 cli 版本
    const { latestMinor } = await getVersions()

    // generate package.json with plugin dependencies
    // 生成带有依赖项的 package.json 文件
    const pkg = {
      name,
      version: '0.1.0',
      private: true,
      devDependencies: {},
      ...resolvePkg(context) // 依赖于 read-pkg 库，如果当前项目根目录下已有 package.json 文件则合并其中的选项
    }

    // resolvePkg 在 @vue/cli-shared-utils 中 pkg.js
    // const fs = require('fs')
    // const path = require('path')
    // const readPkg = require('read-pkg')

    // exports.resolvePkg = function (context) {
    //   if (fs.existsSync(path.join(context, 'package.json'))) {
    //     return readPkg.sync({ cwd: context })
    //   }
    //   return {}
    // }


    /**
     * 将之前解析预设结果中的 preset.plugins 中插件遍历：
     * 1. 确定各插件的版本号，如果没有且是官方的插件，则使用与 vue-cli 相同版本
     * 2. 将各插件作为开发依赖，写入 package.json 中的 devDependencies 对象中
     */
    const deps = Object.keys(preset.plugins)
    deps.forEach(dep => {
      if (preset.plugins[dep]._isPreset) {
        return
      }

      let { version } = preset.plugins[dep]

      if (!version) {
        if (isOfficialPlugin(dep) || dep === '@vue/cli-service' || dep === '@vue/babel-preset-env') {
          version = isTestOrDebug ? `latest` : `~${latestMinor}`
        } else {
          version = 'latest'
        }
      }

      pkg.devDependencies[dep] = version
    })

    /**
     * 在项目根目录下写入 package.json
     * writeFileTree 函数主要是这两句代码
     *  fs.ensureDirSync(path.dirname(filePath)) // 创建目录
     *  fs.writeFileSync(filePath, files[name]) // 写入文件
     */
    await writeFileTree(context, {
      'package.json': JSON.stringify(pkg, null, 2)
    })
    
    // 在安装依赖前先初始化 git，这样 vue-cli-service 就能设置 git hooks 了
    // 如果当前项目还没有初始化为 git 项目，除 vue create --no-git 指明不初始化 git，
    // 否则默认会将项目初始化为 git ，即调用 git init 命令
    const shouldInitGit = this.shouldInitGit(cliOptions)
    if (shouldInitGit) {
      log(`🗃  Initializing git repository...`)
      this.emit('creation', { event: 'git-init' })
      await run('git init') // execa('git init', args, { cwd: this.context })
    }

    //#region region
    // shouldInitGit / hasGit / hasProjectGit 函数代码如下。这类 has 开头的代码基本都是 execSync 传入 { stdio: 'ignore' } 尝试执行，如果没报错即 true
    // shouldInitGit (cliOptions) {
    //   if (!hasGit()) {
    //     return false
    //   }
    //   // --git
    //   if (cliOptions.forceGit) {
    //     return true
    //   }
    //   // --no-git
    //   if (cliOptions.git === false || cliOptions.git === 'false') {
    //     return false
    //   }
    //   // default: true unless already in a git repo
    //   return !hasProjectGit(this.context)
    // }
    // exports.hasGit = () => {
    //   if (process.env.VUE_CLI_TEST) {
    //     return true
    //   }
    //   if (_hasGit != null) {
    //     return _hasGit
    //   }
    //   try {
    //     execSync('git --version', { stdio: 'ignore' })
    //     return (_hasGit = true)
    //   } catch (e) {
    //     return (_hasGit = false)
    //   }
    // }
    
    // exports.hasProjectGit = (cwd) => {
    //   if (_gitProjects.has(cwd)) {
    //     return _gitProjects.get(cwd)
    //   }
    
    //   let result
    //   try {
    //     execSync('git status', { stdio: 'ignore', cwd })
    //     result = true
    //   } catch (e) {
    //     result = false
    //   }
    //   _gitProjects.set(cwd, result)
    //   return result
    // }
    //#endregion

    // install plugins 安装插件，即开发依赖 devDependencies
    log(`⚙\u{fe0f}  Installing CLI plugins. This might take a while...`)
    log()
    this.emit('creation', { event: 'plugins-install' })

    if (isTestOrDebug && !process.env.VUE_CLI_TEST_DO_INSTALL_PLUGIN) {
      // in development, avoid installation process
      await require('./util/setupDevProject')(context)
    } else {
      await pm.install()
      // pm.install 默认参数执行的还是：
      // execa('npm', ['install', '--loglevel', 'error'], {cwd: context, stdio: ['inherit']})
    }

    //#region 
    // pm 是一个兼容 npm / yarn / pnpm 的包管理器适配层
    // async install () {
    //   const args = []
  
    //   if (this.needsPeerDepsFix) {
    //     args.push('--legacy-peer-deps')
    //   }
  
    //   if (process.env.VUE_CLI_TEST) {
    //     args.push('--silent', '--no-progress')
    //   }
  
    //   return await this.runCommand('install', args)
    // }

    // 其中 runCommand 方法执行
    // async runCommand (command, args) {
    //   const prevNodeEnv = process.env.NODE_ENV
    //   // In the use case of Vue CLI, when installing dependencies,
    //   // the `NODE_ENV` environment variable does no good;
    //   // it only confuses users by skipping dev deps (when set to `production`).
    //   delete process.env.NODE_ENV
  
    //   await this.setRegistryEnvs()
    //   await executeCommand(
    //     this.bin, // 即确定的包管理器，默认 npm
    //     [
    //       ...PACKAGE_MANAGER_CONFIG[this.bin][command],
    //       ...(args || [])
    //     ],
    //     this.context
    //   )
  
    //   if (prevNodeEnv) {
    //     process.env.NODE_ENV = prevNodeEnv
    //   }
    // }
    //#endregion
    
    // 这一步就是重点，解析执行各个插件的钩子函数，在 generate.js 文件中分析
    // run generator
    log(`🚀  Invoking generators...`)
    this.emit('creation', { event: 'invoking-generators' })
    const plugins = await this.resolvePlugins(preset.plugins, pkg)
    const generator = new Generator(context, {
      pkg,
      plugins,
      afterInvokeCbs,
      afterAnyInvokeCbs
    })
    await generator.generate({
      extractConfigFiles: preset.useConfigFiles
    })
   
    // install additional deps (injected by generators) 安装由 generators 运行后注入的额外依赖
    // 解析执行完各个插件的钩子函数后，会修改 package.json 文件依赖，所以需要重新执行安装
    log(`📦  Installing additional dependencies...`)
    this.emit('creation', { event: 'deps-install' })
    log()
    if (!isTestOrDebug || process.env.VUE_CLI_TEST_DO_INSTALL_PLUGIN) {
      await pm.install()
    }

    // run complete cbs if any (injected by generators)
    // 执行由 generators 执行后注入的回调函数
    log(`⚓  Running completion hooks...`)
    this.emit('creation', { event: 'completion-hooks' })
    for (const cb of afterInvokeCbs) {
      await cb()
    }
    for (const cb of afterAnyInvokeCbs) {
      await cb()
    }

    // 如果还没有生成 README.md 文件，则创建 generateReadme 函数会生成其中内容
    if (!generator.files['README.md']) {
      // generate README.md
      log()
      log('📄  Generating README.md...')
      await writeFileTree(context, {
        'README.md': generateReadme(generator.pkg, packageManager)
      })
    }

    // 将初始变更提交仓库
    // git add -A
    // git commit --no-verify -m 'init'

    // commit initial state
    let gitCommitFailed = false
    if (shouldInitGit) {
      await run('git add -A')
      if (isTestOrDebug) {
        await run('git', ['config', 'user.name', 'test'])
        await run('git', ['config', 'user.email', 'test@test.com'])
        await run('git', ['config', 'commit.gpgSign', 'false'])
      }
      const msg = typeof cliOptions.git === 'string' ? cliOptions.git : 'init'
      try {
        await run('git', ['commit', '-m', msg, '--no-verify'])
      } catch (e) {
        gitCommitFailed = true
      }
    }

    // 安装完成后，打印说明，即
    // cd project_name
    // npm run serve
    
    // log instructions
    log()
    log(`🎉  Successfully created project ${chalk.yellow(name)}.`)
    if (!cliOptions.skipGetStarted) {
      log(
        `👉  Get started with the following commands:\n\n` +
        (this.context === process.cwd() ? `` : chalk.cyan(` ${chalk.gray('$')} cd ${name}\n`)) +
        chalk.cyan(` ${chalk.gray('$')} ${packageManager === 'yarn' ? 'yarn serve' : packageManager === 'pnpm' ? 'pnpm run serve' : 'npm run serve'}`)
      )
    }
    log()
    this.emit('creation', { event: 'done' })

    if (gitCommitFailed) {
      warn(
        `Skipped git commit due to missing username and email in git config, or failed to sign commit.\n` +
        `You will need to perform the initial commit yourself.\n`
      )
    }

    generator.printExitLogs()

  }
}