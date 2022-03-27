/**
 * Generator 即 vue-cli 插件结构的核心所在。
 * 并通过 GeneratorAPi.js 作为适配层暴露给插件使用
 * 
 * 先看看定义一个 vue-cli 插件的结构，根据需求，基本包含以下三类文件：
 * 
 * ├── README.md
 * ├── generator.js  # generator（可选）也可以定义 generator/index.js 文件中，提供了可以向项目注入模板文件或者修改项目中已有文件的 generatorAPI
 * ├── index.js      # @vue/ service 插件调用，提供了可以修改 webpack 配置，或者创建新的 vue-cli service 命令，或者修改已经存在的命令 pluginAPI
 * ├── package.json
 * ├── prompts.js    # prompt 文件（可选），自定义插件额外的交互选项，在下面 resolvePlugins 函数中会被加载执行
 * └── ui.js         # Vue UI 集成（可选），@vue/ui 插件调用，如果需要在 @vue/ui 可视化界面中添加功能，可以在此利用 uiAPI
 */

const { Generator } = require("webpack")


// 在 creator.create 函数中执行完插件依赖安装后，即执行 generate 函数
// run generator
log(`🚀  Invoking generators...`)
this.emit('creation', { event: 'invoking-generators' })
//第一步：加载插件自定义的 generator.js 和 prompt.js
//  { id: options } => [{ id, apply, options }]，其中 apply 就是插件 generator.js
const plugins = await this.resolvePlugins(preset.plugins, pkg) 

//第二步： 初始化 Generator 类
const generator = new Generator(context, {
  pkg,
  plugins,
  afterInvokeCbs,
  afterAnyInvokeCbs
})

// 第三步：生成各插件文件
await generator.generate({
  extractConfigFiles: preset.useConfigFiles
})


/**
 * 第一步：
 * 把预设中解析到插件：{ id: options } 转换成 [{ id, apply, options }]
 * 1. 加载并执行插件自身定义的 prompt.js，获取命令行输入 options
 * 2. 加载插件自身定义的 generator.js，函数赋值给 apply
 */
// { id: options } => [{ id, apply, options }]
Creator.prototype.resolvePlugins = async function (rawPlugins, pkg) {
  // ensure cli-service is invoked first
  rawPlugins = sortObject(rawPlugins, ['@vue/cli-service'], true)
  const plugins = []
  for (const id of Object.keys(rawPlugins)) {
    const apply = loadModule(`${id}/generator`, this.context) || (() => {})
    let options = rawPlugins[id] || {}

    if (options.prompts) {
      let pluginPrompts = loadModule(`${id}/prompts`, this.context)

      if (pluginPrompts) {
        const prompt = inquirer.createPromptModule() // 生成一个独立的 prompt 实例，同 inquirer.prompt 一样作用

        if (typeof pluginPrompts === 'function') {
          pluginPrompts = pluginPrompts(pkg, prompt)
        }
        if (typeof pluginPrompts.getPrompts === 'function') {
          pluginPrompts = pluginPrompts.getPrompts(pkg, prompt)
        }

        log()
        log(`${chalk.cyan(options._isPreset ? `Preset options:` : id)}`)
        options = await prompt(pluginPrompts)
      }
    }

    plugins.push({ id, apply, options })
  }
  return plugins
}


/**
 * 第二步：看下 Generator 构造函数初始化
 */
const generator = new Generator(context, {
  pkg,
  plugins,
  afterInvokeCbs,
  afterAnyInvokeCbs
})

module.exports = class Generator {
  constructor (context, {
    pkg = {}, // 当前 package.json 内容
    plugins = [], // 所有插件数组 [{ id, apply, options }]，其中 apply 即插件自定义的 generator.js
    afterInvokeCbs = [], // 保存执行完的回调函数
    afterAnyInvokeCbs = [], // 回调函数
    files = {},
    invoking = false
  } = {}) {
    this.context = context // 当前项目路径
    this.plugins = plugins
    this.originalPkg = pkg
    this.pkg = Object.assign({}, pkg)
    this.pm = new PackageManager({ context }) // 默认 npm
    this.imports = {}
    this.rootOptions = {}
    this.afterInvokeCbs = afterInvokeCbs
    this.afterAnyInvokeCbs = afterAnyInvokeCbs
    this.configTransforms = {}
    this.defaultConfigTransforms = defaultConfigTransforms
    this.reservedConfigTransforms = reservedConfigTransforms
    this.invoking = invoking
    // for conflict resolution
    this.depSources = {}
    // virtual file tree
    this.files = Object.keys(files).length
      // when execute `vue add/invoke`, only created/modified files are written to disk
      ? watchFiles(files, this.filesModifyRecord = new Set())
      // all files need to be written to disk
      : files
    this.fileMiddlewares = []
    this.postProcessFilesCbs = []
    // exit messages
    this.exitLogs = []

    // load all the other plugins
    /**
     * 解析 package.json 文件中开发依赖和生产依赖中的所有 vue-cli-plugin-xx 插件
     * isPlugin = id => /^(@vue\/|vue-|@[\w-]+(\.)?[\w-]+\/vue-)cli-plugin-/.test(id)
     */
    this.allPluginIds = Object.keys(this.pkg.dependencies || {})
      .concat(Object.keys(this.pkg.devDependencies || {}))
      .filter(isPlugin)

    /**
     * 在 Creator.create 中：
     * preset.plugins['@vue/cli-service'] = Object.assign({
     *   projectName: name
     * }, preset)
     * 
     * 结果 rootOptions 就是
     * rootOptions = {
     *       vueVersion: '2', // 或者 3
     *       cssPreprocessor: undefined, // scss / less / stylus
     *       router: Boolean,
     *       vuex: Boolean,
     *       projectName: name,
     *       useConfigFiles: answers.useConfigFiles === 'files',
     *       plugins: {
     *          '@vue/cli-plugin-eslint': {},
     *          '@vue/cli-plugin-babel': {},
     *          省略...
     *        }
     *     }
     */
    const cliService = plugins.find(p => p.id === '@vue/cli-service')
    const rootOptions = cliService
      ? cliService.options
      : inferRootOptions(pkg) // 从 package.json 中根据dependencies 和 devDependencies 的依赖推断出上述结构

    this.rootOptions = rootOptions
  }

/**
 * 第三步：生成各插件文件
 */
await generator.generate({
  extractConfigFiles: preset.useConfigFiles
})


/**
 * Generator 基本逻辑：
 * 1. this.initPlugins() 调用各个插件通过 generator.js 提供的 generatorAPI.extendPackage 将各自的配置写入 package.json 对应的字段上，包含使用其它 API 写入模板文件等，但这里现在只关注配置文件的生成
 * 2. this.extractConfigFiles() 通过一份可以提取独立配置文件的映射，将各个插件写在 package.json 文件中的配置提取到统一的 this.files 中，这里保存在内存中的一份配置。
 * 3. this.resolveFiles() 对需要写入的文件进行解析，如 yaml-front-matter 和 ejs 渲染
 * 4. this.sortPkg() 因为 this.extractConfigFiles 提取后会删除对应插件的字段，也包括之前插件 generator.js 中写入都是未尾插件，所以这里对完成抽离后的 package.json 文件中各个字段进行下排序整理
 * 5. writeFileTree() 将抽离到 this.files 中的需要独立创建配置文件的插件按 generator.js 中生成的配置写入到硬盘生成对应的真正的物理配置文件。
 * 
 */
Generator.prototype.generate = async function({
  extractConfigFiles = false,
  checkExisting = false
} = {}) {
  // 3.1 执行插件自定义的 generator.js，向项目注入模板文件或修改现有文件
  await this.initPlugins()
  // save the file system before applying plugin for comparison
  const initialFiles = Object.assign({}, this.files)
  // extract configs from package.json into dedicated files.
  // 3.2 如果命令行交互中选择了独立生成插件的配置文件，则在此步进行，
  // 将 package.json 中对应插件的配置提取到 this.files 中，等 writeFileTree 函数统一写入，如 babel.config.js
  this.extractConfigFiles(extractConfigFiles, checkExisting)
  // wait for file resolve
  // 3.3 运行各插件通过 api.render 注册的模板文件解析到 this.files 中等待下一步写入硬盘
  await this.resolveFiles()
  // set package.json
  // 3.4 对 package.json 中字段进行排序整理，并添加到 this.files 中等待写入硬盘
  this.sortPkg()
  this.files['package.json'] = JSON.stringify(this.pkg, null, 2) + '\n'
  // write/update file tree to disk
  // 3.5 将 filtes 中文件定入硬盘
  await writeFileTree(this.context, this.files, initialFiles, this.filesModifyRecord)
}

/**
 * 3.1 初始化插件
 * await this.initPlugins()
 */
Generator.prototype.initPlugins = async function() {
  const { rootOptions, invoking } = this
  const pluginIds = this.plugins.map(p => p.id)

  // 省略代码...

  // reset hooks
  this.afterInvokeCbs = passedAfterInvokeCbs
  this.afterAnyInvokeCbs = []
  this.postProcessFilesCbs = []

  // apply generators from plugins
  // 这一步就是重点核心：对之前 this.resolvePlugins() 函数解析出来的插件数组
  // this.plugins = [{ id, apply, options }]，其中 apply 即插件自定义的 generator.js
  for (const plugin of this.plugins) {
    const { id, apply, options } = plugin
    const api = new GeneratorAPI(id, this, options, rootOptions)
    await apply(api, options, rootOptions, invoking)
    // 这步即执行插件定义的 generator.js 导出的函数，入参 api 即 generatorAPI 实例，提供了可以向项目注入模板文件或者修改项目中已有文件的 generatorAPI

    // 省略代码...
  }
}

/**
 * 3.2 如果命令行交互中选择了独立生成插件的配置文件，则在此步进行，将 package.json 中对应插件的配置提取到根目录下对应的独立的配置文件，如 babel.config.js
 * this.extractConfigFiles(extractConfigFiles, checkExisting)
 * 其中extractConfigFiles =  preset.useConfigFiles
 * checkExisting 默认 false
 */
Generator.prototype.extractConfigFiles = function (extractAll, checkExisting) {
  const configTransforms = Object.assign({},
    defaultConfigTransforms,
    this.configTransforms,
    reservedConfigTransforms
  )
  /**
   * configTransforms 是一份哪些插件可以创建独立配置文件的映射表
   * 上面合并对象属性后，最终 configTransforms 的值为
   */
  // const defaultConfigTransforms = {
  //   babel: new ConfigTransform({
  //     file: {
  //       js: ['babel.config.js']
  //     }
  //   }),
  //   postcss: new ConfigTransform({
  //     file: {
  //       js: ['postcss.config.js'],
  //       json: ['.postcssrc.json', '.postcssrc'],
  //       yaml: ['.postcssrc.yaml', '.postcssrc.yml']
  //     }
  //   }),
  //   eslintConfig: new ConfigTransform({
  //     file: {
  //       js: ['.eslintrc.js'],
  //       json: ['.eslintrc', '.eslintrc.json'],
  //       yaml: ['.eslintrc.yaml', '.eslintrc.yml']
  //     }
  //   }),
  //   jest: new ConfigTransform({
  //     file: {
  //       js: ['jest.config.js']
  //     }
  //   }),
  //   browserslist: new ConfigTransform({
  //     file: {
  //       lines: ['.browserslistrc']
  //     }
  //   })
  // }
  
  // const reservedConfigTransforms = {
  //   vue: new ConfigTransform({
  //     file: {
  //       js: ['vue.config.js']
  //     }
  //   })
  // }


  const extract = key => {
    if (
      configTransforms[key] &&
      this.pkg[key] &&
      // do not extract if the field exists in original package.json
      // 如果字段在原始的 pckage.json 有定义则不提取
      !this.originalPkg[key]
    ) {
      const value = this.pkg[key]
      const configTransform = configTransforms[key]
      const res = configTransform.transform(
        value,
        checkExisting,
        this.files,
        this.context
      )
      const { content, filename } = res
      this.files[filename] = ensureEOL(content)
      delete this.pkg[key]
    }
  }
  if (extractAll) { // true
    for (const key in this.pkg) {
      extract(key)
    }
  } else {
    if (!process.env.VUE_CLI_TEST) {
      // by default, always extract vue.config.js
      extract('vue')
    }
    // always extract babel.config.js as this is the only way to apply
    // project-wide configuration even to dependencies.
    // TODO: this can be removed when Babel supports root: true in package.json
    extract('babel')
  }
}

/**
 * 3.3 执行插件中注册的处理模板文件的中间件
 * await this.resolveFiles()
 */
Generator.prototype.resolveFiles = async function() {
  const files = this.files

  /**
   * this.fileMiddlewares 中存入了插件中调用 generatorAPI.render 执行中注册的处理解析模板文件转换的函数
   */
  for (const middleware of this.fileMiddlewares) {
    await middleware(files, ejs.render)
  }

  // normalize file paths on windows
  // all paths are converted to use / instead of \
  normalizeFilePaths(files)

  // handle imports and root option injections
  Object.keys(files).forEach(file => {
    let imports = this.imports[file]
    imports = imports instanceof Set ? Array.from(imports) : imports
    if (imports && imports.length > 0) {
      files[file] = runTransformation(
        { path: file, source: files[file] },
        require('./util/codemods/injectImports'),
        { imports }
      )
    }

    let injections = this.rootOptions[file]
    injections = injections instanceof Set ? Array.from(injections) : injections
    if (injections && injections.length > 0) {
      files[file] = runTransformation(
        { path: file, source: files[file] },
        require('./util/codemods/injectOptions'),
        { injections }
      )
    }
  })

  for (const postProcess of this.postProcessFilesCbs) {
    await postProcess(files)
  }
  debug('vue:cli-files')(this.files)
}

/**
 * 3.4 对 package.json 中字段进行排序整理，并添加到 this.files 中等待写入硬盘
 *   this.sortPkg()
 *   this.files['package.json'] = JSON.stringify(this.pkg, null, 2) + '\n'
 */
Generator.prototype.sortPkg = function() {
  // ensure package.json keys has readable order
  this.pkg.dependencies = sortObject(this.pkg.dependencies)
  this.pkg.devDependencies = sortObject(this.pkg.devDependencies)
  this.pkg.scripts = sortObject(this.pkg.scripts, [
    'serve',
    'build',
    'test:unit',
    'test:e2e',
    'lint',
    'deploy'
  ])
  this.pkg = sortObject(this.pkg, [
    'name',
    'version',
    'private',
    'description',
    'author',
    'scripts',
    'main',
    'module',
    'browser',
    'jsDelivr',
    'unpkg',
    'files',
    'dependencies',
    'devDependencies',
    'peerDependencies',
    'vue',
    'babel',
    'eslintConfig',
    'prettier',
    'postcss',
    'browserslist',
    'jest'
  ])

  debug('vue:cli-pkg')(this.pkg)
}

/**
 * const sortObject = require('./util/sortObject')
 */
module.exports = function sortObject (obj, keyOrder, dontSortByUnicode) {
  if (!obj) return
  const res = {}

  /**
   * 按给定的顺序复制到 res 对应中，并在原对象中删除该属性
   */
  if (keyOrder) {
    keyOrder.forEach(key => {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        res[key] = obj[key]
        delete obj[key]
      }
    })
  }

  /**
   * 经过上面 delete obj[key] 删除后剩余的属性，进行排序后，再插入 res
   */
  const keys = Object.keys(obj)

  !dontSortByUnicode && keys.sort()
  keys.forEach(key => {
    res[key] = obj[key]
  })

  return res
}

/**
 * 3.5 将 filtes 中文件定入硬盘
 *   await writeFileTree(this.context, this.files, initialFiles, this.filesModifyRecord)
 * 
 * const writeFileTree = require('./util/writeFileTree')
 * 
 * 核心是：
 * fs.ensureDirSync(path.dirname(filePath)) // 创建目录或文件
 * fs.writeFileSync(filePath, files[name]) // 向上一步生成的文件写入内容
 */

/**
 * @param {string} dir
 * @param {Record<string,string|Buffer>} files
 * @param {Record<string,string|Buffer>} [previousFiles]
 * @param {Set<string>} [include]
 */
module.exports = async function writeFileTree (dir, files, previousFiles, include) {
  if (process.env.VUE_CLI_SKIP_WRITE) {
    return
  }
  if (previousFiles) {
    await deleteRemovedFiles(dir, files, previousFiles)
  }
  Object.keys(files).forEach((name) => {
    if (include && !include.has(name)) return
    const filePath = path.join(dir, name)
    fs.ensureDirSync(path.dirname(filePath)) // 创建目录或文件
    fs.writeFileSync(filePath, files[name]) // 向上一步生成的文件写入内容
  })
}
const fs = require('fs-extra')
const path = require('path')
const { template } = require("babel-core")

function deleteRemovedFiles (directory, newFiles, previousFiles) {
  // get all files that are not in the new filesystem and are still existing
  const filesToDelete = Object.keys(previousFiles)
    .filter(filename => !newFiles[filename])

  // delete each of these files
  return Promise.all(filesToDelete.map(filename => {
    return fs.unlink(path.join(directory, filename))
  }))
}

