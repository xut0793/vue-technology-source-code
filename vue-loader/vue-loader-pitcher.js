const qs = require('querystring')
const loaderUtils = require('loader-utils')
const hash = require('hash-sum')
const selfPath = require.resolve('../index')
const templateLoaderPath = require.resolve('./templateLoader')
const stylePostLoaderPath = require.resolve('./stylePostLoader')

const isESLintLoader = l => /(\/|\\|@)eslint-loader/.test(l.path)
const isNullLoader = l => /(\/|\\|@)null-loader/.test(l.path)
const isCSSLoader = l => /(\/|\\|@)css-loader/.test(l.path)
const isCacheLoader = l => /(\/|\\|@)cache-loader/.test(l.path)
const isPitcher = l => l.path !== __filename
const isPreLoader = l => !l.pitchExecuted
const isPostLoader = l => l.pitchExecuted

const dedupeESLintLoader = loaders => {
  const res = []
  let seen = false
  loaders.forEach(l => {
    if (!isESLintLoader(l)) {
      res.push(l)
    } else if (!seen) {
      seen = true
      res.push(l)
    }
  })
  return res
}

const shouldIgnoreCustomBlock = loaders => {
  const actualLoaders = loaders.filter(loader => {
    // vue-loader
    if (loader.path === selfPath) {
      return false
    }

    // cache-loader
    if (isCacheLoader(loader)) {
      return false
    }

    return true
  })
  return actualLoaders.length === 0
}

module.exports = code => code

// This pitching loader is responsible for intercepting all vue block requests
// and transform it into appropriate requests.
// 这里负责拦截所有通过 vue-loader 首次组装后的 inport 模块加载：
// 类似：import {render, staticRenderFns } from './source.vue?vue&type=template&id=7db4decc&'
module.exports.pitch = function (remainingRequest) {
  const options = loaderUtils.getOptions(this)
  const { cacheDirectory, cacheIdentifier } = options
  const query = qs.parse(this.resourceQuery.slice(1)) // this.resourceQuery 获取 from 后面资源的查询参数：?vue&type=template&id=7db4decc&'

  let loaders = this.loaders

  // if this is a language block request, eslint-loader may get matched multiple times
  if (query.type) {
    // if this is an inline block, since the whole file itself is being linted,
    // remove eslint-loader to avoid duplicate linting.
    if (/\.vue$/.test(this.resourcePath)) {
      loaders = loaders.filter(l => !isESLintLoader(l))
    } else {
      // This is a src import. Just make sure there's not more than 1 instance
      // of eslint present.
      loaders = dedupeESLintLoader(loaders)
    }
  }

  // remove self
  loaders = loaders.filter(isPitcher)

  // do not inject if user uses null-loader to void the type (#1239)
  if (loaders.some(isNullLoader)) {
    return
  }

  const genRequest = loaders => {
    // Important: dedupe since both the original rule
    // and the cloned rule would match a source import request.
    // also make sure to dedupe based on loader path.
    // assumes you'd probably never want to apply the same loader on the same
    // file twice.
    // Exception: in Vue CLI we do need two instances of postcss-loader
    // for user config and inline minification. So we need to dedupe baesd on
    // path AND query to be safe.
    const seen = new Map()
    const loaderStrings = []

    loaders.forEach(loader => {
      const identifier = typeof loader === 'string'
        ? loader
        : (loader.path + loader.query)
      const request = typeof loader === 'string' ? loader : loader.request
      // 使用 identifier 作唯一性 key，存入 seen 中，避免 loader 被重新添加
      if (!seen.has(identifier)) {
        seen.set(identifier, true)
        // loader.request contains both the resolved loader path and its options query (e.g. ??ref-0)
        loaderStrings.push(request)
      }
    })
    
    // 生成webpack 内联 loader 形式: 使用 ! 将资源中的 loader 分开。分开的每个部分都相对于当前目录解析。
    // import Styles from 'style-loader!css-loader?modules!./styles.css';
    // https://www.webpackjs.com/concepts/loaders/#%E5%86%85%E8%81%94
    return loaderUtils.stringifyRequest(this, '-!' + [
      ...loaderStrings,
      this.resourcePath + this.resourceQuery
    ].join('!'))
  }

  // Inject style-post-loader before css-loader for scoped CSS and trimming
  // 对于设置了 scoped 的css 样式，在CSS加载器之前注入style-post-loader
  // import style0 from './source.vue?vue&type=style&index=0&lang=scss&'
  if (query.type === `style`) {
    const cssLoaderIndex = loaders.findIndex(isCSSLoader)
    if (cssLoaderIndex > -1) {
      const afterLoaders = loaders.slice(0, cssLoaderIndex + 1)
      const beforeLoaders = loaders.slice(cssLoaderIndex + 1)
      const request = genRequest([
        ...afterLoaders,
        stylePostLoaderPath, // stylePostLoader 调用了  @vue/component-compiler-utils 中的 compileStyle ，在compileStyle 中利用 postcss 实现了 scoped 作用域注入，以及 ::v-deep >>> /deep/ 等修复符解析。
        ...beforeLoaders
      ])
      // console.log(request)
      return query.module
        ? `export { default } from  ${request}; export * from ${request}`
        : `export * from ${request}`
    }
  }

  // for templates: inject the template compiler & optional cache
  if (query.type === `template`) {
    const path = require('path')
    const cacheLoader = cacheDirectory && cacheIdentifier
      ? [`${require.resolve('cache-loader')}?${JSON.stringify({
        // For some reason, webpack fails to generate consistent hash if we
        // use absolute paths here, even though the path is only used in a
        // comment. For now we have to ensure cacheDirectory is a relative path.
        cacheDirectory: (path.isAbsolute(cacheDirectory)
          ? path.relative(process.cwd(), cacheDirectory)
          : cacheDirectory).replace(/\\/g, '/'),
        cacheIdentifier: hash(cacheIdentifier) + '-vue-loader-template'
      })}`]
      : []

    const preLoaders = loaders.filter(isPreLoader)
    const postLoaders = loaders.filter(isPostLoader)

    const request = genRequest([
      ...cacheLoader,
      ...postLoaders,
      templateLoaderPath + `??vue-loader-options`, // templateLoader 调用了 @vue/component-compiler-utils 中的 compileTemplate 方法解析模板，在 compileTemplate 中采用还是在 templateLoader 传入的 compiler =  options.compiler || require('vue-template-compiler')
      ...preLoaders
    ])
    // console.log(request)
    // the template compiler uses esm exports
    return `export * from ${request}`
  }

  // if a custom block has no other matching loader other than vue-loader itself
  // or cache-loader, we should ignore it
  if (query.type === `custom` && shouldIgnoreCustomBlock(loaders)) {
    return ``
  }

  // When the user defines a rule that has only resourceQuery but no test,
  // both that rule and the cloned rule will match, resulting in duplicated
  // loaders. Therefore it is necessary to perform a dedupe here.
  const request = genRequest(loaders)
  return `import mod from ${request}; export default mod; export * from ${request}`
}