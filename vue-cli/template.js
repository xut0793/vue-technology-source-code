/**
 * vue 插件目录下的 generator 的作用，可以根据自身插件的功能需求向项目中创建新文件和修改现有文件功能：
 * 1. 向项目内添加插件实现功能需要的模板文件
 * 2. 修改项目中现有文件：包括
 *  2.1 替换现有文件的内容，比如 vue-cli-plugin-router 替换 APP.vue 中代码
 *  2.2 修改项目主文件（main.js)，比如 vue-cli-plugin-router 向 main.js 添加 import router from './router' 代码
 *  2.3 扩展 webpack.config.js 配置文件字段：扩展包含修改或新增配置字段
 * 
 * 下面通过源码看下这些功能是如何实现的
 */

const { Generator } = require('webpack')

/**
 * 第一功能：向项目内添加模板文件
 * 
 * 如果是需要向项目内添加文件，则需要在插件包的目录下创建模板文件，文件路径结构：
 * 
 * ├── generator
 *    ├── index.js
 *    ├── template
 * 
 * 在 generator/index.js 中调用 api.render('./template') ， 会读取 template 目录所有文件，并经过 yaml-front-matter 和 EJS 渲染后，存入 new Generator 实例的 this.files 中，并等待写入项目中。
 * 
 * 插件中的 template 目录下的模板文件到创建项目中对应目录结构的实际文件，大致包含以下几步：主要执行逻辑在 GeneratorAPI.render 和 renderFile 函数
 * 1. const paths = await globby(['**\/*'], { cwd: './template', dot: true }) 匹配到 template 目录下所有文件的路径
 * 2. 核心： const template = fs.readFileSync(rawPath, 'utf-8') 循环读取路径下的文件内容
 * 3. {targetPath: content} 键值对存入 new Generator 实例的 this.files 对象中
 * 4. 循环 this.files 对象，通过以下两步创建目录层级的文件，并写入文件内容
 *    4.1 核心： fs.ensureDirSync(path.dirname(targetPath)) // 创建目录或文件
 *    4.2 核心： fs.writeFileSync(targetPath, files[targetPath]) // 向上一步生成的文件写入内容
 * 
 * 所以模板文件的转移主要依赖于 node 内部核心模块 fs。当然中间还作了以下几件事：
 * 1. 替换 dot 文件，即将 _ 换成 . 开头命名的文件
 * 2. yaml 模板解析
 * 3. ejs 模板解析
 * 
 * 总结：模板文件转移核心代码：
 * 1. 就是用 globby 匹配并解析出路径
 * 2. 然后用 fs.readFileSync 读文件内容, 并经 yaml 和 ejs 处理内容
 * 3. 最后就是通过 fs.ensureDirSync 和 fs.writeFileSync 写入当前项目内（硬盘）
 */

//第一步：命令行执行命令： vue create project_name
//第二步： create 命令执行：
program.command('create <app-name>')
       .action((name, options) => {
         require('../lib/create')(name, options)
       })
//第三步：create.js
const creator = new Creator(name, targetDir, getPromptModules())
await creator.create(options)
// 第四步：Creator.js
Creator.prototype.create = function (cliOptions = {}, preset = null) {
  // 省略代码
  const generator = new Generator(context, {
    pkg,
    plugins,
    afterInvokeCbs,
    afterAnyInvokeCbs
  })
  await generator.generate({
    extractConfigFiles: preset.useConfigFiles
  })
}
// 第五步：Generator.js
Generator.prototype.generate = async function({
  extractConfigFiles = false,
  checkExisting = false
} = {}) {
  // 3.1 执行插件自定义的 generator.js，向项目注入模板文件或修改现有文件
  await this.initPlugins()
  // 省略代码
}

/**
 * 这里就进入了插件模板生成的核心逻辑
 * 
 * 第一步：在 this.initPlugins() 中执行插件包中的 generator/index.js 代码
 */
/**
 * 3.1 初始化插件
 * await this.initPlugins()
 */
Generator.prototype.initPlugins = async function() {

  // 省略代码...

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
 * 这里选择 vue-cli-plugin-router 插件中的 generator/index.js 中跟模板相关代码看下
 * 
 * generator.js 或者 generator/index.js 代码就是导出一个函数，函数接受入参包含：
 * 1. GeneratorAPI 实例，提供了一系列 api 调用
 * 2. options 当前插件自定义的交互输入的 Inquirer 的 answer
 * 3. rootOptions 当前vue-cli 或 vue-cli-service 基本配置项，包含所有解析出的插件列表 plugins
 */
module.exports = (api, options = {}, rootOptions = {}) => {
  // 省略其它代码...

  // api.entryFile 能获取到项目的入口文件，一般就是项目根目录下的 main.js
  // api.injectImports  向 main.js 中注入一行代码 improt router from './router'
  api.injectImports(api.entryFile, `import router from './router'`)

  // 向 main.js 文件中 new Vue{options} 根实例的 optons 中添加 router:router 代码，键值同的对象属性简写成 router
  api.injectRootOptions(api.entryFile, `router`)

  // 向 package.json 文件中添加生产依赖 vue-router: '^3.4.5'
  api.extendPackage({
    dependencies: {
      'vue-router': '^3.4.3'
    }
  })

  // 将 vue-cli-plugin-router 插件包项目中 generator/template 目录下的所有文件进行 yaml / ejs 解析后，复制到项目同等目录下。
  api.render('./template', {
    historyMode: options.historyMode,
    doesCompile: api.hasPlugin('babel') || api.hasPlugin('typescript'),
    hasTypeScript: api.hasPlugin('typescript')
  })
}

/**
 * 这里具体看下 api.render 函数的逻辑
 */
/**
   * Render template files into the virtual files tree object.
   *  渲染 template 模板文件到虚拟文件树对象中 this.files
   * @param {string | object | FileMiddleware} source - 模板文件的源目录
   *   Can be one of:
   *   - relative path to a directory; 可以是一个目录字符串
   *   - Object hash of { sourceTemplate: targetFile } mappings; 可以是对象 { sourceTemplate: targetFile }
   *   - a custom file middleware function. 可以是一个函数
   * @param {object} [additionalData] - additional data available to templates. 额外添加的数据，主要用于模板文件中 ejs 模板内容的渲染
   * @param {object} [ejsOptions] - options for ejs. 渲染文件 ejs 模板的选项，可选
   */
  GeneratorAPI.prototype.render = function (source, additionalData = {}, ejsOptions = {}) {
    // 获取当前执行的基础目录路径
    const baseDir = extractCallDir()

    if (isString(source)) { // 匹配传入的 './template'
      // 将 baseDir 与 './template' 结合解析成绝对路径
      source = path.resolve(baseDir, source)
      
      this._injectFileMiddleware(async (files) => {
        /**
         * 处理 template 文件的核心逻辑
         * 这里先不看注入的函数具体代码逻辑，我们接着看注入的中间件函数在哪里被执行。
         */
      })
    } else if (isObject(source)) {
      // 省略代码

    } else if (isFunction(source)) {
      this._injectFileMiddleware(source)
    }
  }

  /**
   * 将传入的函数插入到 Generator 实例的 fileMiddleware 数组中，等待统一处理
   */
  GeneratorAPI.prototype._injectFileMiddleware = function (middleware) {
    this.generator.fileMiddlewares.push(middleware)
  }

  /**
   * Generator.js
   */
  module.exports = class Generator {
    constructor (context, {/* 省略代码... */ } = {}) {
      // virtual file tree
      this.fileMiddlewares = []
    }

    async generate (/**省略代码 */) {
      // 执行插件的 generator/index.js 上面已分析
      await this.initPlugins()
  
      // 在 resolveFiles 执行循环执行了 this.fileMiddlewares
      await this.resolveFiles()

      // 省略代码...
    }

    /**
     * 
     */
    async resolveFiles () {
      const files = this.files
      for (const middleware of this.fileMiddlewares) {
        await middleware(files, ejs.render)
      }
      // 省略代码...
    }
  }

  /**
   * 现在我们再来看 api.render 函数中 
   * this._injectFileMiddleware(fn) 注入的 fn 的核心逻辑
   */
  GeneratorAPI.prototype.render = function (source, additionalData = {}, ejsOptions = {}) {
    // 获取当前执行的基础目录路径
    const baseDir = extractCallDir()

    if (isString(source)) { // 匹配传入的 './template'
      // 将 baseDir 与 './template' 结合解析成绝对路径
      source = path.resolve(baseDir, source)

      this._injectFileMiddleware(async (files) => {

        /**
         * 将 api.render(source, additionalData, ejsOptions) 中传入的 additionData 数据与内部默认的数据合并
         * 
         *   _resolveData (additionalData) {
         *     return Object.assign({
         *       options: this.options,
         *       rootOptions: this.rootOptions,
         *       plugins: this.pluginsData
         *     }, additionalData)
         *   }
         */
        const data = this._resolveData(additionalData)

        /**
         * source 是上面解析出来的绝对路径 /some-path/generator/template
         * 关键代码，使用 globby 库获取到 source 目录下的所有文件路径，返回路径数组
         * 
         * globby 依赖于 fast-glob ，而 fast-glob 又基于 glob 库，所以这里 { cwd: source, dot: true } 选项可以看 fast-glob 库
         * 
         * vue-cli-plugin-router 包中的 template 目录下，返回结果类似于：
         * ['App.vue', 'router/index.js', 'veiws/About.vue', 'views/Home.vue]
         */
        const globby = require('globby')
        const _files = await globby(['**/*'], { cwd: source, dot: true }) // 获取相当于 source 目录下的文件路径

        
        for (const rawPath of _files) {
          /**
           * 因为以点开头的文件会在插件发布到 npm 的时候被忽略，所以想要渲染一个以点开头的模板文件 (例如 .env)，则需要遵循一个特殊的命名约定：
           * 1. 以点开头的模板需要使用下划线取代那个点，然后在这里解析的时候又替换回点号表示
           * 2. 所以因为下划线在这里有特殊意义，所以也意味着当你想渲染以下划线开头的文件时，就需要遵循一个特殊的命名约定：
           *    使用两个下划线来取代单个下划线
           * 
           * 这里 targetPath 就是最终要写入项目中硬盘的文件路径
           */
          const targetPath = rawPath.split('/').map(filename => {
            // dotfiles are ignored when published to npm, therefore in templates
            // we need to use underscore instead (e.g. "_gitignore")
            if (filename.charAt(0) === '_' && filename.charAt(1) !== '_') {
              return `.${filename.slice(1)}`
            }
            if (filename.charAt(0) === '_' && filename.charAt(1) === '_') {
              return `${filename.slice(1)}`
            }
            return filename
          }).join('/')

          // 将源路径解析成绝对路径，以便renderFile 读取文件的内容
          // router/index.js => /baseDir/router/index.js
          const sourcePath = path.resolve(source, rawPath)
          const content = renderFile(sourcePath, data, ejsOptions)
          // only set file if it's not all whitespace, or is a Buffer (binary files)
          if (Buffer.isBuffer(content) || /[^\s]/.test(content)) {
            files[targetPath] = content
          }
        }
      })
    } else if (isObject(source)) {
      // 省略代码

    } else if (isFunction(source)) {
      this._injectFileMiddleware(source)
    }
  }

  /**
   * renderFile 作用就是读取文件内容
   * 因为 vue 插件的模板文件同时支持 yaml 模板和 ejs 模板来填充内容，
   * 所以在 renderFile 函数中需要渲染这些模板内容，生成完整可用的文件内容
   * 
   * 这块内容需要额外了解 yaml 和 ejs 相关知识。
   */

  // 
  // router 插件中模板文件 APP.vue 是准备替换项目中已生成的 APP.vue 文件的内容

  /**
   * 我们可以先看下 vue-cli-plugin-router 插件下 generator/template/App.vue 和 generator/template/router/index.js 的模板文件部分内容
   * 1. router 插件中模板文件 APP.vue 是准备替换项目中已生成的 APP.vue 文件的内容
   */
  //#region 
  // ---
  // extend: '@vue/cli-service/generator/template/src/App.vue'
  // replace:
  //   - !!js/regexp /<template>[^]*?<\/template>/
  //   - !!js/regexp /\n<script>[^]*?<\/script>\n/
  //   - !!js/regexp /  margin-top[^]*?<\/style>/
  // ---

  // <%# REPLACE %>
  // <template>
  //   <div id="app">
  //     <div id="nav">
  //       <router-link to="/">Home</router-link> |
  //       <router-link to="/about">About</router-link>
  //     </div>
  //     <router-view/>
  //   </div>
  // </template>
  // <%# END_REPLACE %></script>
  //#endregion

  // 2. generator/template/router/index.js 需要变量渲染内容，然后在项目中完全创建添加的内容
  //#region 
  // import Vue from 'vue'
  // <%_ if (hasTypeScript) { _%>
  // import VueRouter, { RouteConfig } from 'vue-router'
  // <%_ } else { _%>
  // import VueRouter from 'vue-router'
  // <%_ } _%>
  // import Home from '../views/Home.vue'

  // Vue.use(VueRouter)

  // <%_ if (hasTypeScript) { _%>
  // const routes: Array<RouteConfig> = [
  // <%_ } else { _%>
  // const routes = [
  // <%_ } _%>
  //   {
  //     path: '/',
  //     name: 'Home',
  //     component: Home
  //   },
  //   {
  //     path: '/about',
  //     name: 'About',
  //     <%_ if (doesCompile) { _%>
  //     component: () => import(/* webpackChunkName: "about" */ '../views/About.vue')
  //     <%_ } else { _%>
  //     component: function () {
  //       return import(/* webpackChunkName: "about" */ '../views/About.vue')
  //     }
  //     <%_ } _%>
  //   }
  // ]

  // const router = new VueRouter({
  //   <%_ if (historyMode) { _%>
  //   mode: 'history',
  //   base: process.env.BASE_URL,
  //   <%_ } _%>
  //   routes
  // })

  // export default router
  //#endregion

  const replaceBlockRE = /<%# REPLACE %>([^]*?)<%# END_REPLACE %>/g

  function renderFile (name, data, ejsOptions) {
    if (isBinaryFileSync(name)) {
      return fs.readFileSync(name) // return buffer
    }
    const template = fs.readFileSync(name, 'utf-8')

    // custom template inheritance via yaml front matter.
    // 使用 yaml front matter 格式自定义模板文件，要求在文件开头，并且使用三横线开始和结束
    // ---
    // extend: 'source-file'
    // replace: !!js/regexp /some-regex/
    // OR
    // replace:
    //   - !!js/regexp /foo/
    //   - !!js/regexp /bar/
    // ---
    // file content

    /**
     * yaml-front-matter 包会将以 --- 开头的内容按 yaml 规范解析成对象，文件真实内容作为属性 __content 的值
     * ---
     * extend: 'source-file'
     * replace: !!js/regexp /some-regex/
     * ---
     * file content
     * 
     * 经 yaml.loadFront(file) 加载处理后返回对象
     * parsed = {
     *  extend: 'source-file',
     *  replace: /some-regex/,
     *  __content: '\nfile content',
     * }
     */
    const yaml = require('yaml-front-matter')
    const parsed = yaml.loadFront(template)
    const content = parsed.__content
    let finalTemplate = content.trim() + `\n`

    if (parsed.when) {
      finalTemplate = (
        `<%_ if (${parsed.when}) { _%>` +
          finalTemplate +
        `<%_ } _%>`
      )

      // use ejs.render to test the conditional expression
      // if evaluated to falsy value, return early to avoid extra cost for extend expression
      const result = ejs.render(finalTemplate, data, ejsOptions)
      if (!result) {
        return ''
      }
    }

    /**
     * 在文件开头使用 yaml-front-matter 模式定义如下字段:
     * 1. extend: 表明当前文件内容需求替换的源文件路径
     * 2. replace: 表明需要在源文件匹配替换内容的正则表达式，并用当前文件中的 <%# REPLACE %>...<%# END_REPLACE %> 块解析出的内容替换
     */
    if (parsed.extend) {
      const extendPath = path.isAbsolute(parsed.extend)
        ? parsed.extend
        : resolve.sync(parsed.extend, { basedir: path.dirname(name) })
      /**
       * 这一部分可以对照 @vue/cli-plugin-router/generator/template/APP.vue 文件内容来理解
       * 主要是利用正则匹配替换文件内容
       */
      finalTemplate = fs.readFileSync(extendPath, 'utf-8')
      if (parsed.replace) {
        if (Array.isArray(parsed.replace)) {
          const replaceMatch = content.match(replaceBlockRE)
          if (replaceMatch) {
            const replaces = replaceMatch.map(m => {
              return m.replace(replaceBlockRE, '$1').trim()
            })
            parsed.replace.forEach((r, i) => {
              finalTemplate = finalTemplate.replace(r, replaces[i])
            })
          }
        } else {
          finalTemplate = finalTemplate.replace(parsed.replace, content.trim())
        }
      }
    }

    /**
     * 进一步传入数据，使用 ejs 渲染文件内容
     * 可以对照 @vue/cli-plugin-router/generator/template/router/index.js 内容来理解
     * 
     */
    return ejs.render(finalTemplate, data, ejsOptions)
  }

  // 最后返回最终的文件内容，传入 this.files 虚拟文件对象中，路径作为key,内容作为value: {path:content}
  const content = renderFile(sourcePath, data, ejsOptions)
  // only set file if it's not all whitespace, or is a Buffer (binary files)
  if (Buffer.isBuffer(content) || /[^\s]/.test(content)) {
    files[targetPath] = content
  }

  /**
   * 接着继续回 Generator.generator 函数，进行第3步：
   */
  Generator.prototype.generate = async function({
    extractConfigFiles = false,
    checkExisting = false
  } = {}) {
    // 1. 执行插件自定义的 generator.js，向项目注入模板文件或修改现有文件
    await this.initPlugins()

    // 2. 在 resolveFiles 执行循环执行了 this.fileMiddlewares，
    // 核心是执行了 renderFile 函数中的
    // const template = fs.readFileSync(filePath, 'utf-8')
    await this.resolveFiles()
    
    // 3. write/update file tree to disk 将 this.files 中所有虚拟文件写入项目中
    await writeFileTree(this.context, this.files, initialFiles, this.filesModifyRecord)
  }

  /**
   * const writeFileTree = require('./util/writeFileTree')
   * 
   * 核心是：
   * fs.ensureDirSync(path.dirname(filePath)) // 创建目录或文件
   * fs.writeFileSync(filePath, files[name]) // 向上一步生成的文件写入内容
   */

/**
 * @param {string} dir 项目目录
 * @param {Record<string,string|Buffer>} files this.files 虚拟文件对象
 * @param {Record<string,string|Buffer>} [previousFiles]
 * @param {Set<string>} [include]
 */
module.exports = async function writeFileTree (dir, files, previousFiles, include) {
  if (process.env.VUE_CLI_SKIP_WRITE) {
    return
  }
  // 将不在新文件虚拟对象中的旧文件删除
  if (previousFiles) {
    await deleteRemovedFiles(dir, files, previousFiles)
  }
  // 循环遍历 this.files 中虚拟文件对象，执行文件内容写入
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
  // 将不在新文件系统中的旧文件筛选 filter 出来执行删除操作 fs.unlink
  const filesToDelete = Object.keys(previousFiles)
    .filter(filename => !newFiles[filename])

  // delete each of these files
  return Promise.all(filesToDelete.map(filename => {
    return fs.unlink(path.join(directory, filename))
  }))
}

