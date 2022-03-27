// 在上一步 create.js 中，最后执行了：

const creator = new Creator(name, targetDir, getPromptModules())
await creator.create(options)

  /**
   * 这里我们关注 getPromptModules() 和 Creator 构造函数的初始化过程
   * 
   * 这个过程就是在命令行进行预设 preset 选项选择的过程
   */
  const { getPromptModules } = require('./util/createTools')
  // 进到这个文件里找到 getPromptModules 函数定义
  exports.getPromptModules = () => {
    return [
      'vueVersion',
      'babel',
      'typescript',
      'pwa',
      'router',
      'vuex',
      'cssPreprocessors',
      'linter',
      'unit',
      'e2e'
    ].map(file => require(`../promptModules/${file}`))
  }

/**
 * 这里把每一个命令行交互项对应问题、子选项、和回答后的回调都按项目写在单独文件
 * 
 * 这里关于 prompt 需要了解 Inquirer.js 用法
 * 一个最基本的例子：
 */
var inquirer = require('inquirer')
inquirer.prompt([
  { 
    type: 'confirm', 
    name: 'test', 
    message: '你觉得自己是帅哥嘛?', 
    default: true 
  }
]).then((answers) => { console.log('结果为:'); console.log(answers)})

// 其中 prompt 接收的数组项对象的详细属性：
var promptItemOptions = { 
  type: String,                             // 表示提问的类型，可选的值: input, number, confirm, list, rawlist, expand, checkbox, password, editor
  name: String,                             // 在最后获取到的 answers 回答对象中，作为当前这个问题的键
  message: String|Function,                 // 打印出来的问题标题，如果为函数的话 
  default: String|Number|Array|Function,    // 用户不输入回答时，问题的默认值。或者使用函数来return一个默认值。假如为函数时，函数第一个参数为当前问题的输入答案。 
  choices: Array|Function,                  // 给出一个选择的列表，假如是一个函数的话，第一个参数为当前问题的输入答案。为数组时，数组的每个元素可以为基本类型中的值。 
  validate: Function,                       // 接受用户输入，并且当值合法时，函数返回true。当函数返回false时，一个默认的错误信息会被提供给用户。 
  filter: Function,                         // 接受用户输入并且将值转化后返回填充入最后的 answers 对象内。
  transformer: Function,                    // 接受用户输入并返回一个转换后的值显示给用户。与 filter 不同，转换只影响显示内容，不会修改 answers 对象的值。
  when: Function|Boolean,                   // 接受当前用户输入的 answers 对象，并且通过返回true或者false来决定是否当前的问题应该去问。也可以是简单类型的值。 
  pageSize: Number,                         // 改变渲染list,rawlist,expand或者checkbox时的行数的长度。
  prefix: (String),                         // 更改默认 message 输出的前缀。
  suffix: (String),                         // 更改默认 message 输出的后缀。
  loop: (Boolean),                          // 是否开启列表循环. 默认值: true。
}

/**
 * 了解了 inquirer 的基本使用，inpuirer 的结构包含问题和回答两部分，
 * 所以上述 promptModules 目录下的文件中代码结构也基本对应问题对象和回答回调
 * 
 * 看下 babel 配置
 */

// promptModules/babel
module.exports = cli => {
  cli.injectFeature({
    // 这个对象的配置将作为 inquirer.prompt 的问题
    name: 'Babel',
    value: 'babel',
    short: 'Babel',
    description: 'Transpile modern JavaScript to older versions (for compatibility)',
    link: 'https://babeljs.io/',
    checked: true
  })

  cli.onPromptComplete((answers, options) => {
    // 这个函数将作为 inquirer 中 then 回答的执行回调
    if (answers.features.includes('ts')) {
      if (!answers.useTsWithBabel) {
        return
      }
    } else if (!answers.features.includes('babel')) {
      return
    }
    options.plugins['@vue/cli-plugin-babel'] = {}
  })
}

/**
 * babel 是单选项，再看一个关联二级回答选项的例子
 * 
 * promptModules/linter
 */
module.exports = cli => {
  const { chalk, hasGit } = require('@vue/cli-shared-utils')

  cli.injectFeature({
    name: 'Linter / Formatter',
    value: 'linter',
    short: 'Linter',
    description: 'Check and enforce code quality with ESLint or Prettier',
    link: 'https://github.com/vuejs/vue-cli/tree/dev/packages/%40vue/cli-plugin-eslint',
    plugins: ['eslint'],
    checked: true
  })

  cli.injectPrompt({
    name: 'eslintConfig',
    when: answers => answers.features.includes('linter'),
    type: 'list',
    message: 'Pick a linter / formatter config:',
    description: 'Checking code errors and enforcing an homogeoneous code style is recommended.',
    choices: answers => [
      {
        name: 'ESLint with error prevention only',
        value: 'base',
        short: 'Basic'
      },
      {
        name: 'ESLint + Airbnb config',
        value: 'airbnb',
        short: 'Airbnb'
      },
      {
        name: 'ESLint + Standard config',
        value: 'standard',
        short: 'Standard'
      },
      {
        name: 'ESLint + Prettier',
        value: 'prettier',
        short: 'Prettier'
      }
    ]
  })

  cli.injectPrompt({
    name: 'lintOn',
    message: 'Pick additional lint features:',
    when: answers => answers.features.includes('linter'),
    type: 'checkbox',
    choices: [
      {
        name: 'Lint on save',
        value: 'save',
        checked: true
      },
      {
        name: 'Lint and fix on commit' + (hasGit() ? '' : chalk.red(' (requires Git)')),
        value: 'commit'
      }
    ]
  })

  cli.onPromptComplete((answers, options) => {
    if (answers.features.includes('linter')) {
      options.plugins['@vue/cli-plugin-eslint'] = {
        config: answers.eslintConfig,
        lintOn: answers.lintOn
      }
    }
  })
}

/**
 * 所以 getPromptModules() 函数返回的是各种 feature 类型的 propmpt 调用的函数数组
 * [vueVersionFn, babelFn,...]
 * 被传入 Creator 构造函数的第三个参数
 */
const creator = new Creator(name, targetDir, getPromptModules())

// 所以现在看下 Creator 构造函数的初始化过程 constructor 函数
module.exports = class Creator extends EventEmitter {
  /**
   * 
   * @param {string} name 项目名称，vue create project_name 或 vue craete . 解析出来的上级目录名
   * @param {string} context 项目绝对路径 targetDir
   * @param {array} promptModules 各类 feature 的 prompt 选项调用函数数组 [vueVersionFn, babelFn,...]
   */
  constructor (name, context, promptModules) {
    // 可以看到 constructor 函数中全是 prompt 相关函数 resolveIntroPrompts / resolveOutroPrompts / PromptModuleAPI
    super()

    this.name = name
    this.context = process.env.VUE_CLI_CONTEXT = context
    const { presetPrompt, featurePrompt } = this.resolveIntroPrompts() // intro  开场的交互选项，即获取默认配置还是手动配置的交互 prompt 对象，以及手动配置时供选择的列表 prompt

    this.presetPrompt = presetPrompt
    this.featurePrompt = featurePrompt // 注意此时 featurePrompt 作为 type: 'checkbox' 的交互中可供选择的列表 choices: [] 还是空数组
    this.outroPrompts = this.resolveOutroPrompts() // outro 结束时的交互选项：即让用户确定插件的配置文件是单独还是写进 package.json 中；是否将当前选择保持为预设；安装依赖选择哪种包管理器 npm yarn pnpm

    /**
     * featurePrompt 是作为 presetPrompt 中选择手动 __manual__ 配置时的下级交互选项，即第二级交互选项
     * 而 injectedPrompts 是对应各 feature 选中时的下级交互选项，即第三级交互选项
     */
    this.injectedPrompts = []
    this.promptCompleteCbs = [] // 保存对应 injectedPrompts 下交互选项后，答案回调函数。即 inquirer.then(cb) 的 cb 函数集合

    this.afterInvokeCbs = []
    this.afterAnyInvokeCbs = []

    this.run = this.run.bind(this)

    const promptAPI = new PromptModuleAPI(this)
    promptModules.forEach(m => m(promptAPI))
  }

  /**
   * 解析初始 prompts
   * 这里调用 this.getPresets() 引出了一个新概念 presets 预设
   */
  resolveIntroPrompts () {
    const presets = this.getPresets()

    /**
     * 这里就建立了调用 vue create project_name 后弹出的第一个交互：
     * 
     * ? Please pick a preset: (Use arrow keys)
     * > default
     *   Default (Vue 3 Preview)
     *   Manually select features
     */
    const presetChoices = Object.entries(presets).map(([name, preset]) => {
      let displayName = name
      if (name === 'default') {
        displayName = 'Default'
      } else if (name === '__default_vue_3__') {
        displayName = 'Default (Vue 3 Preview)'
      }

      return {
        /**
         * formatFeatures(preset) 函数的作用：从预设中拿到插件名称拼接显示在命令行中，
         * 比如：
         * default ([Vue 2] babel, eslint)
         */
        name: `${displayName} (${formatFeatures(preset)})`,
        value: name
      }
    })
    const presetPrompt = {
      name: 'preset',
      type: 'list',
      message: `Please pick a preset:`,
      choices: [
        ...presetChoices,
        {
          name: 'Manually select features',
          value: '__manual__'
        }
      ]
    }

    // presetPrompt 最终对象是：
    // const presetPrompt = {
    //   name: 'preset',
    //   type: 'list',
    //   message: `Please pick a preset:`,
    //   choices: [
    //     {
    //       name: 'default （[Vue 2] babel, eslint)',
    //       value: 'default',
    //     },
    //     {
    //       name: 'Default (Vue 3 Preview) ([Vue 3] babel, eslint)',
    //       value: '__default_vue_3__',
    //     },
    //     {
    //       name: 'Manually select features',
    //       value: '__manual__'
    //     }
    //   ]
    // }

    /**
     * feature（babel / vue-router / vuex 等等） 相关的交互都是建立在用户选择手动 __manual__ 配置时出现
     * 所以 when: 
     * const isManualMode = answers => answers.preset === '__manual__'
     */
    const featurePrompt = {
      name: 'features',
      when: isManualMode,
      type: 'checkbox',
      message: 'Check the features needed for your project:',
      choices: [], // 这里 features 即交互中让我们选择 babel / linter 等选项，此时这里是空数组，后面留意是如何将 babel / linter 等 feature 添加却进去的。
      pageSize: 10
    }
    return {
      presetPrompt,
      featurePrompt
    }
  }

  /**
   * Preset 是什么呢？
   * 官方解释是一个创建新项目所需的预先定义包含选项和插件的 JSON 对象
   * 让用户无需在命令提示中选择它们
   */
  getPresets () {
    const savedOptions = loadOptions() // 获取 .vuerc 文件内的选项
    return Object.assign({}, savedOptions.presets, defaults.presets)
  }
  /**
   * return 的结果：
   * {
   *  'default': {
   *      vueVersion: '2',
   *      useConfigFiles: false,
   *      cssPreprocessor: undefined,
   *      plugins: {
   *        '@vue/cli-plugin-babel': {},
   *        '@vue/cli-plugin-eslint': {
   *        config: 'base',
   *        lintOn: ['save']
   *      }
   *   },
   *  '__default_vue_3__': {
   *      vueVersion: '3',
   *      useConfigFiles: false,
   *      cssPreprocessor: undefined,
   *      plugins: {
   *        '@vue/cli-plugin-babel': {},
   *        '@vue/cli-plugin-eslint': {
   *        config: 'base',
   *        lintOn: ['save']
   *      }
   *  }
   * }
   */

  /**
   * 当在命令行手动交互选择插件都完成后，会再次询问：
   * 1. 选择的插件是单独生成各自的配置文件，还是写入 package.json 中对应的字段
   * 2. 是否将当前手动选择的这些插件保存为预设，供下次使用。文件会保存到用户根目录的 .vuerc 中
   * 3. 确定包管理器的prompt： npm yarn pnpm
   */
  resolveOutroPrompts () {
    const outroPrompts = [
      {
        name: 'useConfigFiles',
        when: isManualMode,
        type: 'list',
        message: 'Where do you prefer placing config for Babel, ESLint, etc.?',
        choices: [
          {
            name: 'In dedicated config files',
            value: 'files'
          },
          {
            name: 'In package.json',
            value: 'pkg'
          }
        ]
      },
      {
        name: 'save',
        when: isManualMode,
        type: 'confirm',
        message: 'Save this as a preset for future projects?',
        default: false
      },
      {
        name: 'saveName',
        when: answers => answers.save,
        type: 'input',
        message: 'Save preset as:'
      }
    ]

    // ask for packageManager once
    const savedOptions = loadOptions()
    if (!savedOptions.packageManager && (hasYarn() || hasPnpm3OrLater())) {
      const packageManagerChoices = []

      if (hasYarn()) {
        packageManagerChoices.push({
          name: 'Use Yarn',
          value: 'yarn',
          short: 'Yarn'
        })
      }

      if (hasPnpm3OrLater()) {
        packageManagerChoices.push({
          name: 'Use PNPM',
          value: 'pnpm',
          short: 'PNPM'
        })
      }

      packageManagerChoices.push({
        name: 'Use NPM',
        value: 'npm',
        short: 'NPM'
      })

      outroPrompts.push({
        name: 'packageManager',
        type: 'list',
        message: 'Pick the package manager to use when installing dependencies:',
        choices: packageManagerChoices
      })
    }

    return outroPrompts
  }

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
}


/**
 * 前面初始化 featurePrompt 时，留了一个问题， feature 相关的交互类型是type: 'checkbox' ，但其中的供选择的列表 choices: [] 还是空数组
 * 即 featurePrompt.choices 数组是在哪里赋值呢？
 * 包括现在构造函数中声明的 
 *  this.injectedPrompts = []
 *  this.promptCompleteCbs = []
 * 也还没有被初始化
 * 
 * 他们操作赋值填充都是在最后两行代码
 */
const promptAPI = new PromptModuleAPI(this) // 
promptModules.forEach(m => m(promptAPI))

// 先看 PromptModuleAPI(this)
// 这里的 this 即指向 Creator 的实例
// PromptModuleAPI 类提供了用来初始化 featurePrompt.choices / injectedPrompts / promptCompleteCbs 的一系列方法供外部调用
module.exports = class PromptModuleAPI {
  constructor (creator) {
    this.creator = creator
  }

  injectFeature (feature) {
    this.creator.featurePrompt.choices.push(feature)
  }

  injectPrompt (prompt) {
    this.creator.injectedPrompts.push(prompt)
  }

  injectOptionForPrompt (name, option) {
    this.creator.injectedPrompts.find(f => {
      return f.name === name
    }).choices.push(option)
  }

  onPromptComplete (cb) {
    this.creator.promptCompleteCbs.push(cb)
  }
}

/**
 * promptModules 是 getPromptModules() 函数返回的各类 feature 的 prompt 选项调用函数数组 [vueVersionFn, babelFn,...]
 * 传入的 promptAPI 是 PromptModuleAPI 实例，刚好使用 vueVersionFn 这类函数执行，向 featurePrompt.choices / injectedPrompts / promptCompleteCbs 中赋值
 */
promptModules.forEach(m => m(promptAPI))

// 所以最终 creator 中相关 prompt 的属性值是：

var presetPrompt = {
  name: 'preset',
  type: 'list',
  message: `Please pick a preset:`,
  choices: [
    {
      name: 'default （[Vue 2] babel, eslint)',
      value: 'default',
    },
    {
      name: 'Default (Vue 3 Preview) ([Vue 3] babel, eslint)',
      value: '__default_vue_3__',
    },
    {
      name: 'Manually select features',
      value: '__manual__'
    }
  ]
}
var featurePrompt = {
  name: 'features',
  when: isManualMode,
  type: 'checkbox',
  message: 'Check the features needed for your project:',
  pageSize: 10,
  choices: [
    {
      name: 'Babel',
      value: 'babel',
      short: 'Babel',
      description: 'Transpile modern JavaScript to older versions (for compatibility)',
      link: 'https://babeljs.io/',
      checked: true
    },
    {
      name: 'Linter / Formatter',
      value: 'linter',
      short: 'Linter',
      description: 'Check and enforce code quality with ESLint or Prettier',
      link: 'https://github.com/vuejs/vue-cli/tree/dev/packages/%40vue/cli-plugin-eslint',
      plugins: ['eslint'],
      checked: true
    },
    {
      name: 'Unit Testing',
      value: 'unit',
      short: 'Unit',
      description: 'Add a Unit Testing solution like Jest or Mocha',
      link: 'https://cli.vuejs.org/config/#unit-testing',
      plugins: ['unit-jest', 'unit-mocha']
    },
    // 省略 vueVersiion, typescript, pwa, router, vuex, cssPreprocessors, e2e
  ],
}
var outroPrompts = [
  {
    name: 'useConfigFiles',
    when: isManualMode,
    type: 'list',
    message: 'Where do you prefer placing config for Babel, ESLint, etc.?',
    choices: [
      {
        name: 'In dedicated config files',
        value: 'files'
      },
      {
        name: 'In package.json',
        value: 'pkg'
      }
    ]
  },
  {
    name: 'save',
    when: isManualMode,
    type: 'confirm',
    message: 'Save this as a preset for future projects?',
    default: false
  },
  {
    name: 'saveName',
    when: answers => answers.save,
    type: 'input',
    message: 'Save preset as:'
  },
  {
    name: 'packageManager',
    type: 'list',
    message: 'Pick the package manager to use when installing dependencies:',
    choices: [
      {
        name: 'Use NPM',
        value: 'npm',
        short: 'NPM'
      },
      // 如果 hasYarn 为真
      {
        name: 'Use Yarn',
        value: 'yarn',
        short: 'Yarn'
      },
    ]
  }
]

// 一堆的 prompt 初始化，肯定是需要调用 inquirer.prompt 函数传入才能在命令行显示交互
// 这就到了creator.create 函数的调用
// 这里的 options 就是 vue create -f project_name 命令中解析出来的命令行参数对象，具体见下面
await creator.create(options)

/**
 * 
 * @param {object} cliOptions 
 * 
 * cliOptions = {
 *  preset: <presetName>, 忽略提示符并使用已保存的或远程的预设选项
 *  clone: Boolean, 使用 git clone 获取远程预设选项
 *  default: Boolean, 忽略提示符并使用默认预设选项
 *  inlinePreset: <json>, 忽略提示符并使用内联的 JSON 字符串预设选项
 *  packageManager: <command>, 在安装依赖时使用指定的 npm 客户端: npm yarn
 *  registry: <url>, 在安装依赖时使用指定的 npm registry
 *  git: [message], 强制 / 跳过 git 初始化，并可选的指定初始化提交信息
 *  force: Boolean, 跳过 git 初始化
 *  merge: Boolean, 覆写目标目录可能存在的配置
 *  proxy: <proxyUrl>, 使用指定的代理创建项目
 *  bare:  Boolean, 创建项目时省略默认组件中的新手指导信息
 *  skipGetStarted:  Boolean, 跳过显示“Get started”说明
 * }
 */
Creator.prototype.create = async function(cliOptions = {}, preset = null) {
  if (!preset) {
    /**
     * 可以看到预设的几中来源：
     * 1. preset: <presetName>, 忽略提示符并使用已保存的或远程的预设选项
     * 2. clone: Boolean, 使用 git clone 获取远程预设选项，配合 preset 使用
     * 3. default: Boolean, 忽略提示符并使用vue cli 内部默认预设选项
     * 4. inlinePreset: <json>, 忽略提示符并使用内联的 JSON 字符串预设选项，使用 josn 字符串传入
     * 5. 选择手动 __manual__ 模式手动配置预设
     */
    if (cliOptions.preset) {
      // vue create foo --preset bar
      // 或者使用远程 vue create foo --preset bar --clone
      preset = await this.resolvePreset(cliOptions.preset, cliOptions.clone)
    } else if (cliOptions.default) {
      // vue create foo --default
      preset = defaults.presets.default
    } else if (cliOptions.inlinePreset) {
      // vue create foo --inlinePreset {...}
      try {
        preset = JSON.parse(cliOptions.inlinePreset)
      } catch (e) {
        error(`CLI inline preset is not valid JSON: ${cliOptions.inlinePreset}`)
        exit(1)
      }
    } else {
      // 5. 选择手动 __manual__ 模式手动配置预设
      preset = await this.promptAndResolvePreset()

      /**
       * preset = {
       *       useConfigFiles: answers.useConfigFiles === 'files',
       *       plugins: {
       *          '@vue/cli-plugin-eslint': {},
       *          '@vue/cli-plugin-babel': {},
       *          省略...
       *        }
       *     }
       */
    }
  }

  // clone before mutating
  preset = cloneDeep(preset)
  // inject core service
  // 插入核心的本地服务插件
  preset.plugins['@vue/cli-service'] = Object.assign({
    projectName: name
  }, preset)

  // vue create --bare 中传入的 bare:  Boolean, 创建项目时省略默认组件中的新手指导信息
  if (cliOptions.bare) {
    preset.plugins['@vue/cli-service'].bare = true
  }

  /**
   * legacy 遗留，旧的
   * 下面这些 router vuex 插件的注册，其时在 feature 中选择了就会自动添加
   * promptAndResolvePreset()函数中 this.promptCompleteCbs.forEach(cb => cb(answers, preset))
   */
  // legacy support for router
  if (preset.router) {
    preset.plugins['@vue/cli-plugin-router'] = {}

    if (preset.routerHistoryMode) {
      preset.plugins['@vue/cli-plugin-router'].historyMode = true
    }
  }

  // Introducing this hack because typescript plugin must be invoked after router.
  // Currently we rely on the `plugins` object enumeration order,
  // which depends on the order of the field initialization.
  // FIXME: Remove this ugly hack after the plugin ordering API settled down
  if (preset.plugins['@vue/cli-plugin-router'] && preset.plugins['@vue/cli-plugin-typescript']) {
    const tmp = preset.plugins['@vue/cli-plugin-typescript']
    delete preset.plugins['@vue/cli-plugin-typescript']
    preset.plugins['@vue/cli-plugin-typescript'] = tmp
  }

  // legacy support for vuex
  if (preset.vuex) {
    preset.plugins['@vue/cli-plugin-vuex'] = {}
  }
  // 省略代码...
}

// 解析手动配置的预设
Creator.prototype.promptAndResolvePreset = async function(answers = null) {
  // prompt
  if (!answers) {
    await clearConsole(true)
    // 关键的 inquirer.prompt 调用执行命令行交互
    /**
     * resolveFinalPrompts() 函数将 crator 中各种 prompt 全在一起返回最终的传给 inquirer.prompt() 的实参
     * 注意：数组项顺序决定了交互项的前后。
     * prompts = [
     *       this.presetPrompt, // 一级交互项：default vue2 / default vue3 / 手动 __manual__ 
     *       this.featurePrompt, // 二级交互项： 选项手动配置时出现
     *       ...this.injectedPrompts, // 三级交互：对应 featurePrompt 的选项
     *       ...this.outroPrompts, // 最后交互选项，询问是否单独生成配置文件；另存为预设；选项包管理器
     *     ]
     */
    answers = await inquirer.prompt(this.resolveFinalPrompts())
  }
  debug('vue-cli:answers')(answers)

  // 将当前选项的包管理器保存本地预设中，下次可以直接获取包管理器，不用每次询问了
  // 在 this.resolveOutroPrompts 函数中有这个判断：
  // if (!savedOptions.packageManager && (hasYarn() || hasPnpm3OrLater())) {...}
  if (answers.packageManager) {
    saveOptions({
      packageManager: answers.packageManager
    })
  }

  let preset
  if (answers.preset && answers.preset !== '__manual__') { // 不是选项手动配置时，获取对应的默认预设配置
    preset = await this.resolvePreset(answers.preset)
  } else {
    // manual
    preset = {
      useConfigFiles: answers.useConfigFiles === 'files',
      plugins: {}
    }
    answers.features = answers.features || []
    // run cb registered by prompt modules to finalize the preset
    // 预设交互全部完成后，执行各个交互注册的 回答的回调。
    // 主要功能是向 preset.plugins 中注册对应的插件名
    this.promptCompleteCbs.forEach(cb => cb(answers, preset))

    // 举例 linter 的回答处理：
    // cli.onPromptComplete((answers, options) => {
    //   if (answers.features.includes('linter')) {
    //     options.plugins['@vue/cli-plugin-eslint'] = {
    //       config: answers.eslintConfig,
    //       lintOn: answers.lintOn
    //     }
    //   }
    // })
  }

  // validate
  validatePreset(preset)

  // save preset
  // 如果选择了保存当前手动选择的预设
  if (answers.save && answers.saveName && savePreset(answers.saveName, preset)) {
    log()
    log(`🎉  Preset ${chalk.yellow(answers.saveName)} saved in ${chalk.yellow(rcPath)}`) // rcPatch 即 ~/.vuerc 文件
  }

  debug('vue-cli:preset')(preset)
  return preset
}

/**
 * 将 crator 中各种 prompt 全在一起返回最终的传给 inquirer.prompt() 的实参
 */
Creator.prototype.resolveFinalPrompts = function() {
  resolveFinalPrompts () {
    // patch generator-injected prompts to only show in manual mode
    this.injectedPrompts.forEach(prompt => {
      const originalWhen = prompt.when || (() => true)
      prompt.when = answers => {
        return isManualMode(answers) && originalWhen(answers)
      }
    })

    const prompts = [
      this.presetPrompt,
      this.featurePrompt,
      ...this.injectedPrompts,
      ...this.outroPrompts
    ]
    debug('vue-cli:prompts')(prompts)
    return prompts
  }
}

