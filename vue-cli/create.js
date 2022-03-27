const fs = require('fs-extra')
const path = require('path')
const inquirer = require('inquirer')
const Creator = require('./Creator')
const { clearConsole } = require('./util/clearConsole')
const { getPromptModules } = require('./util/createTools')
const { chalk, error, stopSpinner, exit } = require('@vue/cli-shared-utils')
const validateProjectName = require('validate-npm-package-name')

/**
 * 这个文件代码主要就两件事：
 * 1. 校验传入的项目名称是否规范
 * 2. 解析确定项目路径 targetDir 
 */

/**
 * 
 * @param {*} projectName 项目名称，program.command('create <app-name>') 中 app-name 的值
 * @param {*} options create 命令实例，program.option 定义的命令选项都作为其的属性
 * 
 * options = {
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
async function create (projectName, options) {
  if (options.proxy) {
    process.env.HTTP_PROXY = options.proxy
  }

  const cwd = options.cwd || process.cwd()
  const inCurrent = projectName === '.'
  /**
   * path.relative() 方法根据当前工作目录返回 from 到 to 的相对路径。
   * 此处即返回 . 上一级目录，即文件夹名称。
   * 比如在 /usr/local/dirname/ 目录下使用 .  
   * 则 path.relative(/usr/local/dirname/, '.') 返回结果是 dirname
   */
  const name = inCurrent ? path.relative('../', cwd) : projectName
  const targetDir = path.resolve(cwd, projectName || '.') // 解析出绝对路径

  /**
   * validate-npm-package-name` 包来校验npm 包名称的规范性
   * 返回结果是一个对象，包含以下属性
   * {
   *    validForNewPackages: false, // 符合规范返回 true, 不符合规范返回 false，并且返回 errors 显示不符合的规则
   *    validForOldPackages: false, // 兼容 旧版本 Npm 包的名称，现在一般不用判断此属性
   *    errors: [ // error 属性只有校验不成功时返回，返回包名称不符合哪些规则，具体规则见 validate-npm-package-name 仓库的 README.md
   *      'name cannot contain leading or trailing spaces', // 名称不能包含前导或尾随空格
   *      'name can only contain URL-friendly characters'   //  名称不得包含任何非URL安全字符
   *   ]
   * }
   */
  const result = validateProjectName(name)
  if (!result.validForNewPackages) {
    console.error(chalk.red(`Invalid project name: "${name}"`))
    result.errors && result.errors.forEach(err => {
      console.error(chalk.red.dim('Error: ' + err))
    })
    result.warnings && result.warnings.forEach(warn => {
      console.error(chalk.red.dim('Warning: ' + warn))
    })
    exit(1)
  }

  /**
   * fs.existsSync(path) 同步判断路径是否存在，则返回 true，否则返回 false。
   */
  if (fs.existsSync(targetDir) && !options.merge) {
    if (options.force) {
      await fs.remove(targetDir) // 注意这里引入的是 fs-extra，而不是 node 原生的 fs 模块，原生的fs 模块没有 fs.remove 方法，原生删除目录可以使用 fs.rm(path[,options], callback)
    } else {
      await clearConsole()
      if (inCurrent) {
        const { ok } = await inquirer.prompt([
          {
            name: 'ok',
            type: 'confirm',
            message: `Generate project in current directory?`
          }
        ])
        if (!ok) {
          return
        }
      } else {
        const { action } = await inquirer.prompt([
          {
            name: 'action',
            type: 'list',
            message: `Target directory ${chalk.cyan(targetDir)} already exists. Pick an action:`,
            choices: [
              { name: 'Overwrite', value: 'overwrite' },
              { name: 'Merge', value: 'merge' },
              { name: 'Cancel', value: false }
            ]
          }
        ])
        if (!action) {
          return
        } else if (action === 'overwrite') {
          console.log(`\nRemoving ${chalk.cyan(targetDir)}...`)
          await fs.remove(targetDir)
        }
      }
    }
  }

  /**
   * 1. 上面主要代码逻辑是解析创建项目的目录
   * 2. 关注 getPromptModules()
   * 3. 真正项目创建 creator.create(options)
   */
  const creator = new Creator(name, targetDir, getPromptModules())
  await creator.create(options)
}

/**
 * getPromptModules() 执行以下代码：
 * 
 * exports.getPromptModules = () => {
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
 * 
 * 所以再进入 ../promptModules/${file}
 * 
 * 所以 getPromptModules() 函数返回的是各种类型 propmpt 调用的函数数据
 * [vueVersionFn, babelFn,...]
 */

module.exports = (...args) => {
  return create(...args).catch(err => {
    stopSpinner(false) // do not persist
    error(err)
    if (!process.env.VUE_CLI_TEST) {
      process.exit(1)
    }
  })
}
