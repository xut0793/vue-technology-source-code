/**
 * vue-loader 15.9.6 源码分析
 * 主要关注的问题是：SFC (Single File Component) 文件在 webpack 打包时是如何被 vue-loader 解析的。
 * 
 * 在使用 webapck 打包 .vue 文件时，通常需要如下配置。
 */

// 1. 安装依赖： npm install -D vue-loader vue-template-compiler
// 2. 添加配置 webpack.config.js
const VueLoaderPlugin = require('vue-loader/lib/plugin')
module.exports = {
  module: {
    rules: [
      // ... 其它规则
      {
        test: /\.vue$/,
        loader: 'vue-loader' // 单个 loader 写法，也可以使用 use 数组写法
      }
    ]
  },
  plugins: [
    /**
     * 这个插件是必须的！ 
     * 它的职责是将你定义过的其它规则复制并应用到 .vue 文件里相应语言的块。
     * 例如，如果你有一条匹配 /\.js$/ 的规则，那么它会应用到 .vue 文件里的 <script> 块。
     * 具体源码后面分析。
     */
    new VueLoaderPlugin()
  ]
}


/******************************************************************************
 * 看 vue-loader 做了什么？
 * 通过 vue-loader 也可以看看一个 webapck loader 是如何编写的
 *****************************************************************************/
const path = require('path')
const qs = require('querystring')
const hash = require('hash-sum') // 一个没有第三方依赖的快速生成 hash 串的包
const loaderUtils = require('loader-utils') // 编写 webpack loader 时推荐使用 webapck 官方提供的工具包
const { parse } = require('@vue/component-compiler-utils') // .vue 文件解析器适配器，可以通过配置外部的解析器 compiler，默认是 compiler = vue-template-compiler

// 下面这些为 vue-loader 内部模块代码
const plugin = require('./plugin')
const { NS } = require('./plugin')
const selectBlock = require('./select')
const componentNormalizerPath = require.resolve('./runtime/componentNormalizer')

const { attrsToQuery } = require('./codegen/utils')
const genStylesCode = require('./codegen/styleInjection')
const { genHotReloadCode } = require('./codegen/hotReload')
const genCustomBlocksCode = require('./codegen/customBlocks')

let errorEmitted = false
// 这里就要求 vue-loader 要配置一个 .vue 解析器，默认 vue-template-compiler
function loadTemplateCompiler (loaderContext) {
  try {
    return require('vue-template-compiler')
  } catch (e) {
    if (/version mismatch/.test(e.toString())) {
      loaderContext.emitError(e)
    } else {
      loaderContext.emitError(new Error(
        `[vue-loader] vue-template-compiler must be installed as a peer dependency, ` +
        `or a compatible compiler implementation must be passed via options.`
      ))
    }
  }
}

module.exports = function (source) {
  // webpack loader 提供的上下文对象，上面挂载了很多属性和方法
  // [loader 上下文](https://www.webpackjs.com/api/loaders/#loader-%E4%B8%8A%E4%B8%8B%E6%96%87)
  const loaderContext = this

  // 这里就要求 vue-loader 在 webpack 配置时要同步配置 new VueLoaderPlugin() 插件选项。
  if (!errorEmitted && !loaderContext['thread-loader'] && !loaderContext[NS]) {
    loaderContext.emitError(new Error(
      `vue-loader was used without the corresponding plugin. ` +
      `Make sure to include VueLoaderPlugin in your webpack config.`
    ))
    errorEmitted = true
  }

  // webapck loaderUtils 提供的方法，生成内联loader，即以 ! 分隔的字符串
  const stringifyRequest = r => loaderUtils.stringifyRequest(loaderContext, r)

  const {
    target,
    request,
    minimize,
    sourceMap,
    rootContext,
    resourcePath,
    resourceQuery = ''
  } = loaderContext

  const rawQuery = resourceQuery.slice(1) // 去除 ?
  const inheritQuery = `&${rawQuery}`
  const incomingQuery = qs.parse(rawQuery)
  const options = loaderUtils.getOptions(loaderContext) || {}

  const isServer = target === 'node'
  const isShadow = !!options.shadowMode
  const isProduction = options.productionMode || minimize || process.env.NODE_ENV === 'production'
  const filename = path.basename(resourcePath)
  const context = rootContext || process.cwd()
  const sourceRoot = path.dirname(path.relative(context, resourcePath))


  /******************************************************************************
   * 关键步骤一：解析 SFC 文件
   * source 就是 .vue　文件
   * compiler 如果没有传入第三方解析器，默认使用 vue-template-compiler
   * descriptor 返回的对象具体结构见下分析 component-compiler-utils
   *****************************************************************************/
  const descriptor = parse({
    source,
    compiler: options.compiler || loadTemplateCompiler(loaderContext), // vue-template-compiler
    filename,
    sourceRoot,
    needMap: sourceMap
  })


  /***************************************************************************
   * 关键步骤三：如果 vue-loader 传入的 source 已经是 vue-loader处理过后的带有 type 的由直接使用 selectBlock 导出。
   * 
   * 这里下面关键步骤二返回的代码
   * import {render, staticRenderFns } from './source.vue?vue&type=template&id=7db4decc&'
   * 因为 vue&type=xxx 同时会被 vueLoaderPlugin 插件作用，添加一系列对应的 loader 解析：
   *************************************************************************/
  // if the query has a type field, this is a language block request
  // e.g. foo.vue?type=template&id=xxxxx
  // and we will return early
  if (incomingQuery.type) {
    return selectBlock(
      descriptor,
      loaderContext,
      incomingQuery,
      !!options.appendExtension
    )
  }

  // module id for scoped CSS & hot-reload
  const rawShortFilePath = path
    .relative(context, resourcePath)
    .replace(/^(\.\.[\/\\])+/, '')

  const shortFilePath = rawShortFilePath.replace(/\\/g, '/') + resourceQuery

  const id = hash(
    isProduction
      ? (shortFilePath + '\n' + source.replace(/\r\n/g, '\n'))
      : shortFilePath
  )

  // feature information
  const hasScoped = descriptor.styles.some(s => s.scoped)
  const hasFunctional = descriptor.template && descriptor.template.attrs.functional
  const needsHotReload = (
    !isServer &&
    !isProduction &&
    (descriptor.script || descriptor.template) &&
    options.hotReload !== false
  )
  

  /*************************************************************
   * 关键步骤二： 组装 vue-loader 导出代码
   * 最终 code 可能是这样：
   * import { render, staticRenderFns } from './source.vue?vue&type=template&id=7db4decc&'
   * import script from './source.vue?vue&type=script&lang=js&'
   * export * from './source.vue?vue&type=script&lang=js&'
   * import style0 from './source.vue?vue&type=style&index=0&lang=scss&'
   * 
   * / normalize component /
   * import normalizer form '!../../../../node_modules/vue-loader/lib/runtime/componentNormalizer.js'
   * var component = normalizer(
   *  script,
   *  render,
   *  staticRenderFns,
   *  false,
   *  null,
   *  null,
   *  null,
   * )
   * 
   * export default component.exports
   * 
   ***************************************************************/
  // template
  let templateImport = `var render, staticRenderFns`
  let templateRequest
  if (descriptor.template) {
    const src = descriptor.template.src || resourcePath
    const idQuery = `&id=${id}`
    const scopedQuery = hasScoped ? `&scoped=true` : ``
    const attrsQuery = attrsToQuery(descriptor.template.attrs)
    const query = `?vue&type=template${idQuery}${scopedQuery}${attrsQuery}${inheritQuery}`
    const request = templateRequest = stringifyRequest(src + query)
    templateImport = `import { render, staticRenderFns } from ${request}`
  }

  // script
  let scriptImport = `var script = {}`
  if (descriptor.script) {
    const src = descriptor.script.src || resourcePath
    const attrsQuery = attrsToQuery(descriptor.script.attrs, 'js')
    const query = `?vue&type=script${attrsQuery}${inheritQuery}`
    const request = stringifyRequest(src + query)
    scriptImport = (
      `import script from ${request}\n` +
      `export * from ${request}` // support named exports
    )
  }

  // styles
  let stylesCode = ``
  if (descriptor.styles.length) {
    stylesCode = genStylesCode(
      loaderContext,
      descriptor.styles,
      id,
      resourcePath,
      stringifyRequest,
      needsHotReload,
      isServer || isShadow // needs explicit injection?
    )
  }

  let code = `
${templateImport}
${scriptImport}
${stylesCode}
/* normalize component */
import normalizer from ${stringifyRequest(`!${componentNormalizerPath}`)}
var component = normalizer(
  script,
  render,
  staticRenderFns,
  ${hasFunctional ? `true` : `false`},
  ${/injectStyles/.test(stylesCode) ? `injectStyles` : `null`},
  ${hasScoped ? JSON.stringify(id) : `null`},
  ${isServer ? JSON.stringify(hash(request)) : `null`}
  ${isShadow ? `,true` : ``}
)
  `.trim() + `\n`

  if (descriptor.customBlocks && descriptor.customBlocks.length) {
    code += genCustomBlocksCode(
      descriptor.customBlocks,
      resourcePath,
      resourceQuery,
      stringifyRequest
    )
  }

  if (needsHotReload) {
    code += `\n` + genHotReloadCode(id, hasFunctional, templateRequest)
  }

  // Expose filename. This is used by the devtools and Vue runtime warnings.
  if (!isProduction) {
    // Expose the file's full path in development, so that it can be opened
    // from the devtools.
    code += `\ncomponent.options.__file = ${JSON.stringify(rawShortFilePath.replace(/\\/g, '/'))}`
  } else if (options.exposeFilename) {
    // Libraries can opt-in to expose their components' filenames in production builds.
    // For security reasons, only expose the file's basename in production.
    code += `\ncomponent.options.__file = ${JSON.stringify(filename)}`
  }

  code += `\nexport default component.exports`
  return code
}

module.exports.VueLoaderPlugin = plugin

/**
 * 对于关键步骤一: parse 函数涉及 @vue/component-compiler-utils
 * 所以先看下关键步骤二和三中涉及 vue-loader 内部的方法：componentNormalizerPath / selectBlock
 */


/**
 * 关键步骤二：componentNormalizerPath
 * 1. 把 SFC 中 template 模板解析出来的 render 赋值到 options.render 属性上。
 * 2. 注入 scopeId 到模板数据中
 */
// https://github.com/vuejs/vue-loader/blob/master/lib/runtime/componentNormalizer.js
export default function normalizeComponent (
  scriptExports,
  render,
  staticRenderFns,
  functionalTemplate,
  injectStyles,
  scopeId,
  moduleIdentifier, /* server only */
  shadowMode /* vue-cli only */
) {
  // Vue.extend constructor export interop
  var options = typeof scriptExports === 'function'
    ? scriptExports.options
    : scriptExports

  /**
   * 关键是这里，把 SFC 中 template 模板解析出来的 render 赋值到 options.render 属性上。
   */
  // render functions
  if (render) {
    options.render = render
    options.staticRenderFns = staticRenderFns
    options._compiled = true
  }

  /**
   * <template functional></template>
   */
  // functional template
  if (functionalTemplate) {
    options.functional = true
  }

  // scopedId
  if (scopeId) {
    options._scopeId = 'data-v-' + scopeId
  }

  var hook
  if (moduleIdentifier) { // server build
    hook = function (context) {
      // 2.3 injection
      context =
        context || // cached call
        (this.$vnode && this.$vnode.ssrContext) || // stateful
        (this.parent && this.parent.$vnode && this.parent.$vnode.ssrContext) // functional
      // 2.2 with runInNewContext: true
      if (!context && typeof __VUE_SSR_CONTEXT__ !== 'undefined') {
        context = __VUE_SSR_CONTEXT__
      }
      // inject component styles
      if (injectStyles) {
        injectStyles.call(this, context)
      }
      // register component module identifier for async chunk inferrence
      if (context && context._registeredComponents) {
        context._registeredComponents.add(moduleIdentifier)
      }
    }
    // used by ssr in case component is cached and beforeCreate
    // never gets called
    options._ssrRegister = hook
  } else if (injectStyles) {
    hook = shadowMode
      ? function () {
        injectStyles.call(
          this,
          (options.functional ? this.parent : this).$root.$options.shadowRoot
        )
      }
      : injectStyles
  }

  if (hook) {
    if (options.functional) {
      // for template-only hot-reload because in that case the render fn doesn't
      // go through the normalizer
      options._injectStyles = hook
      // register for functional component in vue file
      var originalRender = options.render
      options.render = function renderWithStyleInjection (h, context) {
        hook.call(context)
        return originalRender(h, context)
      }
    } else {
      // inject component registration as beforeCreate hook
      var existing = options.beforeCreate
      options.beforeCreate = existing
        ? [].concat(existing, hook)
        : [hook]
    }
  }

  return {
    exports: scriptExports,
    options: options
  }
}

// https://github.com/vuejs/vue-loader/blob/master/lib/select.js
/**
 * 关键步骤三： selectBlock
 * 主要功能是
 * 一、根据 * import {render, staticRenderFns } from './source.vue?vue&type=template&id=7db4decc&'
 * 解析出来的 lang 类型将文件后缀改成对应的后缀名，以便该导入语句的文件能被对应后缀文件的 loader 处理。
 * 
 * 二、 调用 loaderContext.callback 回调通过 webapck 该loader 处理已结束。
 * loader API: 如果是单个处理结果，可以在同步模式中直接返回。如果有多个处理结果，则必须调用 this.callback()。
 * https://www.webpackjs.com/api/loaders/#loader-%E4%B8%8A%E4%B8%8B%E6%96%87
 */
module.exports = function selectBlock (
  descriptor,
  loaderContext,
  query,
  appendExtension
) {
  // template
  if (query.type === `template`) {
    if (appendExtension) {
      loaderContext.resourcePath += '.' + (descriptor.template.lang || 'html')
    }
    loaderContext.callback(
      null,
      descriptor.template.content,
      descriptor.template.map
    )
    return
  }

  // script
  if (query.type === `script`) {
    if (appendExtension) {
      loaderContext.resourcePath += '.' + (descriptor.script.lang || 'js')
    }
    loaderContext.callback(
      null,
      descriptor.script.content,
      descriptor.script.map
    )
    return
  }

  // styles
  if (query.type === `style` && query.index != null) {
    const style = descriptor.styles[query.index]
    if (appendExtension) {
      loaderContext.resourcePath += '.' + (style.lang || 'css')
    }
    loaderContext.callback(
      null,
      style.content,
      style.map
    )
    return
  }

  // custom
  if (query.type === 'custom' && query.index != null) {
    const block = descriptor.customBlocks[query.index]
    loaderContext.callback(
      null,
      block.content,
      block.map
    )
    return
  }
}

/*************************************************************************
 * 关键步骤一：parse 函数涉及 @vue/component-compiler-utils
 ************************************************************************/
import { SourceMapGenerator } from 'source-map'
import {
  RawSourceMap,
  VueTemplateCompiler,
  VueTemplateCompilerParseOptions
} from './types'

const hash = require('hash-sum')
const cache = new (require('lru-cache'))(100)

const splitRE = /\r?\n/g
const emptyRE = /^(?:\/\/)?\s*$/

/***
 * 看以下 interface 可以看出 parse 函数的入参类型和返回值的结构类型
 */
export interface ParseOptions {
  source: string
  filename?: string
  compiler: VueTemplateCompiler
  compilerParseOptions?: VueTemplateCompilerParseOptions
  sourceRoot?: string
  needMap?: boolean
}

export interface SFCCustomBlock {
  type: string
  content: string
  attrs: { [key: string]: string | true }
  start: number
  end: number
  map?: RawSourceMap
}

export interface SFCBlock extends SFCCustomBlock {
  lang?: string
  src?: string
  scoped?: boolean
  module?: string | boolean
}

export interface SFCDescriptor {
  template: SFCBlock | null
  script: SFCBlock | null
  styles: SFCBlock[]
  customBlocks: SFCCustomBlock[]
}

export function parse(options: ParseOptions): SFCDescriptor {
  const {
    source,
    filename = '',
    compiler,
    compilerParseOptions = { pad: 'line' } as VueTemplateCompilerParseOptions,
    sourceRoot = '',
    needMap = true
  } = options

  // 将文件名和内容和编译选项合并生成 hash 作为缓存的唯一 key
  const cacheKey = hash(
    filename + source + JSON.stringify(compilerParseOptions)
  )

  /**
   * vue 模板编译会被缓存，如果某个 SFC 文件未被更改，直接从缓存取出
   */
  let output: SFCDescriptor = cache.get(cacheKey)
  if (output) return output

  /*************************************************************
   * 关键步骤： 使用了 vue-template-compiler 的 parseComponent 方法
   **************************************************************/
  output = compiler.parseComponent(source, compilerParseOptions)

  /***
   * 生成 sourcemap 代码
   */
  if (needMap) {
    if (output.script && !output.script.src) {
      output.script.map = generateSourceMap(
        filename,
        source,
        output.script.content,
        sourceRoot,
        compilerParseOptions.pad
      )
    }
    if (output.styles) {
      output.styles.forEach(style => {
        if (!style.src) {
          style.map = generateSourceMap(
            filename,
            source,
            style.content,
            sourceRoot,
            compilerParseOptions.pad
          )
        }
      })
    }
  }
  cache.set(cacheKey, output)
  return output
}

function generateSourceMap(
  filename: string,
  source: string,
  generated: string,
  sourceRoot: string,
  pad?: 'line' | 'space'
): RawSourceMap {
  const map = new SourceMapGenerator({
    file: filename.replace(/\\/g, '/'),
    sourceRoot: sourceRoot.replace(/\\/g, '/')
  })
  let offset = 0
  if (!pad) {
    offset =
      source
        .split(generated)
        .shift()!
        .split(splitRE).length - 1
  }
  map.setSourceContent(filename, source)
  generated.split(splitRE).forEach((line, index) => {
    if (!emptyRE.test(line)) {
      map.addMapping({
        source: filename,
        original: {
          line: index + 1 + offset,
          column: 0
        },
        generated: {
          line: index + 1,
          column: 0
        }
      })
    }
  })
  return JSON.parse(map.toString())
}


/****
 * 所以可以看到 @vue/component-compiler-utils 包就是一个支持自定义模板编译的中介，以适合 web 或  weex 模板编译。
 * 另外还有编译缓存功能。
 * 
 * 所以这里关键是 vue-template-compiler 
 */

/**********************************************************************
 * vue-template-compiler 相关的关键循方法：parseComponent
 * 
 * 这个包在 vue.js 主项目内，同 vue-server-renderer 一样，版本随 vue 版本变更而同步变更。
 * 关于 vue-template-compiler 源码可以参考 vue_template_compile.js
 * https://github.com/vuejs/vue/blob/dev/packages/vue-template-compiler/build.js
 *********************************************************************/

 /**
 * Parse a single-file component (*.vue) file into an SFC Descriptor Object.
 */
function parseComponent (
  content,
  options
) {
  if ( options === void 0 ) options = {};

  var sfc = {
    template: null,
    script: null,
    styles: [],
    customBlocks: [],
    errors: []
  };
  var depth = 0;
  var currentBlock = null;

  var warn = function (msg) {
    sfc.errors.push(msg);
  };

  if (process.env.NODE_ENV !== 'production' && options.outputSourceRange) {
    warn = function (msg, range) {
      var data = { msg: msg };
      if (range.start != null) {
        data.start = range.start;
      }
      if (range.end != null) {
        data.end = range.end;
      }
      sfc.errors.push(data);
    };
  }

  function start (
    tag,
    attrs,
    unary,
    start,
    end
  ) {
    if (depth === 0) {
      currentBlock = {
        type: tag,
        content: '',
        start: end,
        attrs: attrs.reduce(function (cumulated, ref) {
          var name = ref.name;
          var value = ref.value;

          cumulated[name] = value || true;
          return cumulated
        }, {})
      };
      // var isSpecialTag = makeMap('script,style,template', true);
      if (isSpecialTag(tag)) {
        checkAttrs(currentBlock, attrs);
        if (tag === 'style') {
          sfc.styles.push(currentBlock);
        } else {
          sfc[tag] = currentBlock;
        }
      } else { // custom blocks
        sfc.customBlocks.push(currentBlock);
      }
    }
    if (!unary) {
      depth++;
    }
  }

  function checkAttrs (block, attrs) {
    for (var i = 0; i < attrs.length; i++) {
      var attr = attrs[i];
      if (attr.name === 'lang') {
        block.lang = attr.value;
      }
      if (attr.name === 'scoped') {
        block.scoped = true;
      }
      if (attr.name === 'module') {
        block.module = attr.value || true;
      }
      if (attr.name === 'src') {
        block.src = attr.value;
      }
    }
  }

  function end (tag, start) {
    if (depth === 1 && currentBlock) {
      currentBlock.end = start;
      var text = content.slice(currentBlock.start, currentBlock.end);
      if (options.deindent !== false) {
        text = deindent(text);
      }
      // pad content so that linters and pre-processors can output correct
      // line numbers in errors and warnings
      if (currentBlock.type !== 'template' && options.pad) {
        text = padContent(currentBlock, options.pad) + text;
      }
      currentBlock.content = text;
      currentBlock = null;
    }
    depth--;
  }

  function padContent (block, pad) {
    if (pad === 'space') {
      return content.slice(0, block.start).replace(replaceRE, ' ')
    } else {
      var offset = content.slice(0, block.start).split(splitRE).length;
      var padChar = block.type === 'script' && !block.lang
        ? '//\n'
        : '\n';
      return Array(offset).join(padChar)
    }
  }

  /**
   * parseHTML 函数就是通过一系列正则， while(html){...} 和 advance() 方法一段一段，步进式，从头对 html 代码进行匹配，识别出标签名，开始标签的属性，标签内容等。
   */
  parseHTML(content, {
    warn: warn,
    start: start,
    end: end,
    outputSourceRange: options.outputSourceRange
  });

  return sfc
}


// 举例：一段标准的 SFC 结构代码

/**
 * 
<template>
<div class="red">
  <span>Hello {{ msg }}</span>
</div>
</template>

<script>
export default {
  data () {
    return {
      msg: 'Vue Loader'
    }
  }
}
</script>

<style module>
.red {
  color: red;
}
</style>
 */

// 经过 parseComponent 处理后得到的 sfc 结构对象：
sfc = {
  template: null,
  script: null,
  styles: [],
  customBlocks: [],
  errors: []
};

/***************************************************************
 * VueLoaderPlugin： 可以看到 webpack plugin 插件的写法
 * const VueLoaderPlugin = require('vue-loader/lib/plugin')
 * 这里看 ./plugin-webpack4
 **************************************************************/
const qs = require('querystring')
const RuleSet = require('webpack/lib/RuleSet')

const id = 'vue-loader-plugin'
const NS = 'vue-loader'

class VueLoaderPlugin {
  apply (compiler) {
    // 添加NS标记，这样加载器就可以检测并报告缺失的插件，即在 vue-loader 源码中最先检测 VueLoaderPlugin 是否安装的判断
    // add NS marker so that the loader can detect and report missing plugin
    if (compiler.hooks) {
      // webpack 4
      compiler.hooks.compilation.tap(id, compilation => {
        const normalModuleLoader = compilation.hooks.normalModuleLoader
        normalModuleLoader.tap(id, loaderContext => {
          loaderContext[NS] = true
        })
      })
    } else {
      // webpack < 4
      compiler.plugin('compilation', compilation => {
        compilation.plugin('normal-module-loader', loaderContext => {
          loaderContext[NS] = true
        })
      })
    }

    // use webpack's RuleSet utility to normalize user rules
    // 使用webpack的规则集工具来标准化用户规则
    const rawRules = compiler.options.module.rules
    const { rules } = new RuleSet(rawRules)

    // find the rule that applies to vue files
    // 通过测试用例找到应用于vue文件的规则
    let vueRuleIndex = rawRules.findIndex(createMatcher(`foo.vue`))
    if (vueRuleIndex < 0) {
      vueRuleIndex = rawRules.findIndex(createMatcher(`foo.vue.html`))
    }
    const vueRule = rules[vueRuleIndex]

    if (!vueRule) {
      throw new Error(
        `[VueLoaderPlugin Error] No matching rule for .vue files found.\n` +
        `Make sure there is at least one root-level rule that matches .vue or .vue.html files.`
      )
    }

    if (vueRule.oneOf) {
      throw new Error(
        `[VueLoaderPlugin Error] vue-loader 15 currently does not support vue rules with oneOf.`
      )
    }

    // module.exports = {
    //   module: {
    //     rules: [
    //       // ... 其它规则
    //       {
    //         test: /\.vue$/,
    //         loader: 'vue-loader' // 单个 loader 写法，也可以使用 use 数组写法
    //         use: [
    //           'vue-loader',
    //           // 或者带 options 选项时，采用对象写法
    //           {
    //             loader: 'vue-loader',
    //             options: {/*....*/}
    //           }
    //         ]
    //       }
    //     ]
    //   },
    // }
    // get the normlized "use" for vue files
    // 获取应用于 .vue 文件的 loaders 数组
    const vueUse = vueRule.use
    // get vue-loader options
    const vueLoaderUseIndex = vueUse.findIndex(u => {
      return /^vue-loader|(\/|\\|@)vue-loader/.test(u.loader)
    })

    if (vueLoaderUseIndex < 0) {
      throw new Error(
        `[VueLoaderPlugin Error] No matching use for vue-loader is found.\n` +
        `Make sure the rule matching .vue files include vue-loader in its use.`
      )
    }

    // make sure vue-loader options has a known ident so that we can share
    // options by reference in the template-loader by using a ref query like
    // template-loader??vue-loader-options
    // 在 vueUse 数组找出 vue-loader 对象
    const vueLoaderUse = vueUse[vueLoaderUseIndex]
    vueLoaderUse.ident = 'vue-loader-options'
    vueLoaderUse.options = vueLoaderUse.options || {}

    // for each user rule (expect the vue rule), create a cloned rule
    // that targets the corresponding language blocks in *.vue files.
    // 遍历用户 webpack 配置中除了作用于.vue 文件外的所有 rules，克隆一份。
    const clonedRules = rules
      .filter(r => r !== vueRule)
      .map(cloneRule)

    // global pitcher (responsible for injecting template compiler loader & CSS post loader)
    // global pitcher 是一个针对 .vue 文件的 rule 对象，负责注入模板编译的 loader 和CSS 的 loader
    const pitcher = {
      loader: require.resolve('./loaders/pitcher'),
      resourceQuery: query => {
        const parsed = qs.parse(query.slice(1)) // query.slice(1) 去除查询参数的 ?
        return parsed.vue != null
      },
      options: {
        cacheDirectory: vueLoaderUse.options.cacheDirectory,
        cacheIdentifier: vueLoaderUse.options.cacheIdentifier
      }
    }
    
    // replace original rules
    // 替换原有的 rules
    compiler.options.module.rules = [
      pitcher,
      ...clonedRules,
      ...rules
    ]
  }
}

function createMatcher (fakeFile) {
  return (rule, i) => {
    // #1201 we need to skip the `include` check when locating the vue rule
    const clone = Object.assign({}, rule)
    delete clone.include
    const normalized = RuleSet.normalizeRule(clone, {}, '')
    return (
      !rule.enforce &&
      normalized.resource &&
      normalized.resource(fakeFile)
    )
  }
}

function cloneRule (rule) {
  const { resource, resourceQuery } = rule
  // Assuming `test` and `resourceQuery` tests are executed in series and
  // synchronously (which is true based on RuleSet's implementation), we can
  // save the current resource being matched from `test` so that we can access
  // it in `resourceQuery`. This ensures when we use the normalized rule's
  // resource check, include/exclude are matched correctly.
  let currentResource
  const res = Object.assign({}, rule, {
    resource: {
      test: resource => {
        currentResource = resource
        return true
      }
    },
    resourceQuery: query => {
      const parsed = qs.parse(query.slice(1))
      if (parsed.vue == null) {
        return false
      }
      if (resource && parsed.lang == null) {
        return false
      }
      const fakeResourcePath = `${currentResource}.${parsed.lang}`
      if (resource && !resource(fakeResourcePath)) {
        return false
      }
      if (resourceQuery && !resourceQuery(query)) {
        return false
      }
      return true
    }
  })

  if (rule.rules) {
    res.rules = rule.rules.map(cloneRule)
  }

  if (rule.oneOf) {
    res.oneOf = rule.oneOf.map(cloneRule)
  }

  return res
}

VueLoaderPlugin.NS = NS
module.exports = VueLoaderPlugin


/*****************************************************************
 * webpack: resouce resourceQuery
 * 
 * 一般对 wepack 限制哪些文件使用哪些 loader 的限制是在 test 属性的正则上，
 * 如果要排队文件范围添加 exclude，或指定文件范围添加 include 而已。
 * 匹配文件除 test 正则，其实还有 resourceQuery 字段的值
 *******************************************************************/
// 一般大众化配置格式
module: {
  rules: [
    {
      test: /\.js$/,
      use: ['babel-loader],
      exclude: [],
      include: []
    }
  ]
}

// 但其时 test、exclude、include是resource的简写，
// 如果使用了resource，不可以同级配置test、include、exclude属性
module: {
  rules: [{
    use: ['babel-loader],
    resource: {
      test: /\.js$/,
      exclude: [],
      include: []
    }
  }]
}

// 使用resource方式配置，还有or、and、not属性可以配置
module: {
  rules: [{
    use: ['babel-loader],
    resource: {
      test: /\.js$/,
      exclude: [],
      include: [],
      not: [],
      and: [],
      or: []
    }
  }]
}

// resource 对象中的属性值都是可以function、string(字符串开头判定)、regex、array(funciton string, regex组合)
// 此时，与 resource 属性并列的字段是 resoureceQuery 用来匹配 import / require引入的模块路径的查询参数是否符合
// 并且 resourceQuery 的值同 resource 属性值一样，可以是 function、string、regex、 array(function string regex)
{
  test: /.css$/,
  resourceQuery: /inline/,
  use: 'url-loader'
}
// 以上规则可以匹配到： import Foo from './foo.css?inline'
// 所以 VueLoaderPlugin 插件对 rlue 规则进行了重写，添加了 resourceQuery 
// 用来匹配首次 vue-loader 中导出的代码中添加 vue 查询字段
// import { render, staticRenderFns } from './source.vue?vue&type=template&id=7db4decc&'
// import script from './source.vue?vue&type=script&lang=js&'
// export * from './source.vue?vue&type=script&lang=js&'
// import style0 from './source.vue?vue&type=style&index=0&lang=scss&'

resourceQuery: query => {
  const parsed = qs.parse(query.slice(1)) // query.slice(1) 去除查询参数的 ?
  return parsed.vue != null // 即 ?vue
}




