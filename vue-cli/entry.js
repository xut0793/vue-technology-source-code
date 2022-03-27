/**
 * 入口
 * 
 * 使用命令：
 * vue create project_name
 * 
 * @vue/cli 项目的入口文件： package.json 中的 bin 字段：
 *
 * "bin": {
 *     "vue": "bin/vue.js"
 *  },
 */

 /**
  * bin/vue.js
  * 第一步：检查 node 版本是否是 package.json 中 engines 要求的：
  *  "engines": {
  *     "node": "^10.12.0 || ^12.0.0 || >= 14.0.0"
  *  }
  * 
  * process.version 获取当前 node 环境版本号
  * semver.js 是语义化版本 Semantic Versioning 操作的库，由 npm 的团队维护的，实现了版本和版本范围的解析、计算、比较.
  * satisfies(version, range) 目标版本满足指定范围，则返回 true， 否则 false
  */
 const requiredVersion = require('../package.json').engines.node

 function checkNodeVersion (wanted, id) {
  if (!semver.satisfies(process.version, wanted, { includePrerelease: true })) {
    console.log(chalk.red(
      'You are using Node ' + process.version + ', but this version of ' + id +
      ' requires Node ' + wanted + '.\nPlease upgrade your Node version.'
    ))
    process.exit(1)
  }
}

checkNodeVersion(requiredVersion, '@vue/cli')

/**
 * 之后就是使用 commander.js 这个库处理以下事情：
 * 1. 定义一系列命令：create / add / invoke / inspect / serve / ui / init / config / outdated / upgrade / migrate / info
 * 2. 捕获使用未定义的命令，suggestCommands(cmd) 函数调用 leven 包给出建议命令
 * 3. 各个命令帮助信息的处理 --help 
 * 4. 全局错误捕获
 */
// 重点看 create 命令定义
const program = require('commander')
const loadCommand = require('../lib/util/loadCommand')

program
  .version(`@vue/cli ${require('../package').version}`)
  .usage('<command> [options]')

program
  .command('create <app-name>')
  .description('create a new project powered by vue-cli-service')
  .option('-p, --preset <presetName>', 'Skip prompts and use saved or remote preset')
  .option('-d, --default', 'Skip prompts and use default preset')
  .option('-i, --inlinePreset <json>', 'Skip prompts and use inline JSON string as preset')
  .option('-m, --packageManager <command>', 'Use specified npm client when installing dependencies')
  .option('-r, --registry <url>', 'Use specified npm registry when installing dependencies (only for npm)')
  .option('-g, --git [message]', 'Force git initialization with initial commit message')
  .option('-n, --no-git', 'Skip git initialization')
  .option('-f, --force', 'Overwrite target directory if it exists')
  .option('--merge', 'Merge target directory if it exists')
  .option('-c, --clone', 'Use git clone when fetching remote preset')
  .option('-x, --proxy <proxyUrl>', 'Use specified proxy when creating project')
  .option('-b, --bare', 'Scaffold project without beginner instructions')
  .option('--skipGetStarted', 'Skip displaying "Get started" instructions')
  .action((name, options) => { // commander.js 中 action 回调函数的第二个参数，即 create 命令实例自身，所有的 option 属性作为该实例的属性获取。
    /**
     * minimist 是解析 process.argv 参数的库，它功能精简单一，也是 commander.js yargs 内部解析参数的依赖库
     * minimist 对 node 命令行参数的传入形式有约定，以单横杠 - 或 双横杠 -- 开头的参数作为 minimist()返回对象的属性，横杠后紧接的参数会作为属性值。
     * 除此之后，不以单横杠或双横杠开头的参数都是作为属性 _:[] 数组项元素。
     * 
     * node example/parse.js -x 3 -y 4 -n5 -abc --beep=boop foo bar baz
     * argv = minimist(process.argv.slice(2))
     * argv 是一个对象：
     * {
     *   x: 3,
     *   y: 4,
     *   n: 5,
     *   a: true,
     *   b: true,
     *   c: true,
     *   beep: 'boop',
     *   _: ['foo', 'bar', 'baz']
     * }
     */
    if (minimist(process.argv.slice(3))._.length > 1) { // 这里从3开始截取，是去掉 create 参数： vue create -d project_name
      console.log(chalk.yellow('\n Info: You provided more than one argument. The first one will be used as the app\'s name, the rest are ignored.'))
    }
    // --git makes commander to default git to true
    if (process.argv.includes('-g') || process.argv.includes('--git')) {
      options.forceGit = true
    }
    require('../lib/create')(name, options)
  })

  // 省略其它命令

// output help information on unknown commands
// 监听上述未定义的未知命令时，猜测用户是否输错命令，并猜测用户意图，给出建议命令
program.on('command:*', ([cmd]) => {
  program.outputHelp()
  console.log(`  ` + chalk.red(`Unknown command ${chalk.yellow(cmd)}.`))
  console.log()
  suggestCommands(cmd)
  process.exitCode = 1
})

/**
 * 输入命令有误，猜测用户意图
 * 
 * 使用了 leven 了这个包，这是用于计算字符串编辑距离算法的 JS 实现
 * Vue CLI 这里使用了这个包，来分别计算输入的命令和当前已挂载的所有命令的编辑举例，从而猜测用户实际想输入的命令是哪个。
 */
function suggestCommands (unknownCommand) {
  const availableCommands = program.commands.map(cmd => cmd._name)

  let suggestion

  availableCommands.forEach(cmd => {
    const isBestMatch = leven(cmd, unknownCommand) < leven(suggestion || '', unknownCommand)
    if (leven(cmd, unknownCommand) < 3 && isBestMatch) {
      suggestion = cmd
    }
  })

  if (suggestion) {
    console.log(`  ` + chalk.red(`Did you mean ${chalk.yellow(suggestion)}?`))
  }
}


// 监听 --help 事件，回调执行会自动退出进程
// 对于直接输入 vue --help 命令时，提示输入具体命令： vue create --help
program.on('--help', () => {
  console.log()
  console.log(`  Run ${chalk.cyan(`vue <command> --help`)} for detailed usage of given command.`)
  console.log()
})

// 为上述每条命令添加一个 --help 监听，commander.js 会为命令自动根据 option 设置生成 --help 输出信息的，所以这里只要打印间隔一行即可
program.commands.forEach(c => c.on('--help', () => console.log()))

// 捕获全局错误，调用封装的增强的错误信息提示
const enhanceErrorMessages = require('../lib/util/enhanceErrorMessages')

enhanceErrorMessages('missingArgument', argName => {
  return `Missing required argument ${chalk.yellow(`<${argName}>`)}.`
})

enhanceErrorMessages('unknownOption', optionName => {
  return `Unknown option ${chalk.yellow(optionName)}.`
})

enhanceErrorMessages('optionMissingArgument', (option, flag) => {
  return `Missing required argument for option ${chalk.yellow(option.flags)}` + (
    flag ? `, got ${chalk.yellow(flag)}` : ``
  )
})

// commander.js 最后必须要执行的一句代码，解析命令行参数
program.parse(process.argv)

if (!process.argv.slice(2).length) {
  program.outputHelp()
}