/**
 * 插槽里的过滤器源码
 * 例如：{{ message | capitalize }}
 * 函数路径：`$mount => compileToFunctions => createCompiler => baseCompile => parse => parseHTML => options.chars`
 */
function parse (template, options) {
  // 省略代码
  parseHTML(template, {
    // 省略代码
    start,
    end,
    comment,
    chars: function chars (text, start, end) {
      // currentParent 是在解析开始标签时压入堆栈的栈顶元素 
      // 在 start 中 if (!unary) { currentParent = element; stack.push(element); }
      // 在 end 中  stack.length -= 1; currentParent = stack[stack.length - 1];
      if (!currentParent) {
        {
          if (text === template) {
            warnOnce(
              'Component template requires a root element, rather than just text.',
              { start: start }
            );
          } else if ((text = text.trim())) {
            warnOnce(
              ("text \"" + text + "\" outside root element will be ignored."),
              { start: start }
            );
          }
        }
        return
      }
      // IE textarea placeholder bug
      /* istanbul ignore if */
      if (isIE &&
        currentParent.tag === 'textarea' &&
        currentParent.attrsMap.placeholder === text
      ) {
        return
      }

      var children = currentParent.children;

      // 主要是对 text 为空的处理逻辑
      if (inPre || text.trim()) { // 当 text 非空时返回 text
        // function isTextTag (el) { return el.tag === 'script' || el.tag === 'style'}
        text = isTextTag(currentParent) ? text : decodeHTMLCached(text);
      } else if (!children.length) { // 如果 text 是空格，且元素没有子节点,则删除开始标记之后仅限空白的节点
        // remove the whitespace-only node right after an opening tag  
        text = '';
      } else if (whitespaceOption) { // 空白处理策略 whitespace?: 'preserve' | 'condense'; 保留还是浓缩
        if (whitespaceOption === 'condense') {
          // in condense mode, remove the whitespace node if it contains
          // line break, otherwise condense to a single space
          text = lineBreakRE.test(text) ? '' : ' ';
        } else { // preserve 保留空格
          text = ' ';
        }
      } else {
        text = preserveWhitespace ? ' ' : '';
      }

      // text 有值处理
      if (text) {
        if (!inPre && whitespaceOption === 'condense') { 
          // condense consecutive whitespaces into single space
          text = text.replace(whitespaceRE$1, ' '); // 将多个空格压缩成单个空格
        }
        var res;
        var child;
        if (!inVPre && text !== ' ' && (res = parseText(text, delimiters))) {
          // 如果非v-pre内容，且 text 不为空，且存在插槽动态绑定内容
          child = {
            type: 2,
            expression: res.expression, // _f("capitalize")("message")
            tokens: res.tokens, // [{@binding: _f("capitalize")("message")}]
            text: text
          };
        } else if (text !== ' ' || !children.length || children[children.length - 1].text !== ' ') {
          // test 不为空，或者 不存在 children时，或者有子元素且最后一个子元素是文本元素且文本不为空
          child = {
            type: 3,
            text: text
          };
        }
        if (child) {
          if (options.outputSourceRange) {
            child.start = start;
            child.end = end;
          }
          // 作为子元素插入
          children.push(child);
        }
      }
    }
  })
}

var defaultTagRE = /\{\{((?:.|\r?\n)+?)\}\}/g;
var regexEscapeRE = /[-.*+?^${}()|[\]\/\\]/g;

var buildRegex = cached(function (delimiters) {
  var open = delimiters[0].replace(regexEscapeRE, '\\$&');
  var close = delimiters[1].replace(regexEscapeRE, '\\$&');
  return new RegExp(open + '((?:.|\\n)+?)' + close, 'g')
});
/**
 * 例子：
 * text: "{{ message | capitalize }}"
 */
function parseText (
  text,
  delimiters // 可以自定义插槽的符号，默认是 {{ 和 }}
) {
  // 因为可以自定义插槽符号，所以需要根据 delimiters 动态创建匹配正则
  var tagRE = delimiters ? buildRegex(delimiters) : defaultTagRE;
  if (!tagRE.test(text)) { // 纯文本返回 undefined
    return
  }
  var tokens = [];
  var rawTokens = [];
  var lastIndex = tagRE.lastIndex = 0;
  var match, index, tokenValue;
  while ((match = tagRE.exec(text))) {
    index = match.index;
    // push text token
    if (index > lastIndex) {
      rawTokens.push(tokenValue = text.slice(lastIndex, index));
      tokens.push(JSON.stringify(tokenValue));
    }
    // tag token
    var exp = parseFilters(match[1].trim()); // _f("capitalize")("message")
    tokens.push(("_s(" + exp + ")")); // _s => toString
    rawTokens.push({ '@binding': exp }); // {@binding: _f("capitalize")("message")}
    lastIndex = index + match[0].length;
  }
  if (lastIndex < text.length) {
    rawTokens.push(tokenValue = text.slice(lastIndex));
    tokens.push(JSON.stringify(tokenValue));
  }
  return {
    expression: tokens.join('+'),
    tokens: rawTokens
  }
}

var validDivisionCharRE = /[\w).+\-_$\]]/;

/**
 * parseFilters 对 exp 表达式逐个字符解析，处理多种边界情况，最终结果是
 * "message | capitalize" => _f("capitalize")("message")
 * "message | capitalize('arg1','arg2')" => _f("capitalize")("message",'arg1','arg2')
 * "message | filterA | filterB" => _f("filterB")(_f("filterA")("message"))
 */
function parseFilters (exp) {
  var inSingle = false;
  var inDouble = false;
  var inTemplateString = false;
  var inRegex = false;
  var curly = 0;
  var square = 0;
  var paren = 0;
  var lastFilterIndex = 0;
  var c, prev, i, expression, filters;

  for (i = 0; i < exp.length; i++) {
    prev = c;
    c = exp.charCodeAt(i);
    if (inSingle) {
      if (c === 0x27 && prev !== 0x5C) { inSingle = false; }
    } else if (inDouble) {
      if (c === 0x22 && prev !== 0x5C) { inDouble = false; }
    } else if (inTemplateString) {
      if (c === 0x60 && prev !== 0x5C) { inTemplateString = false; }
    } else if (inRegex) {
      if (c === 0x2f && prev !== 0x5C) { inRegex = false; }
    } else if (
      c === 0x7C && // pipe
      exp.charCodeAt(i + 1) !== 0x7C &&
      exp.charCodeAt(i - 1) !== 0x7C &&
      !curly && !square && !paren
    ) {
      if (expression === undefined) {
        // first filter, end of expression
        lastFilterIndex = i + 1;
        expression = exp.slice(0, i).trim();
      } else {
        pushFilter();
      }
    } else {
      switch (c) {
        case 0x22: inDouble = true; break         // "
        case 0x27: inSingle = true; break         // '
        case 0x60: inTemplateString = true; break // `
        case 0x28: paren++; break                 // (
        case 0x29: paren--; break                 // )
        case 0x5B: square++; break                // [
        case 0x5D: square--; break                // ]
        case 0x7B: curly++; break                 // {
        case 0x7D: curly--; break                 // }
      }
      if (c === 0x2f) { // /
        var j = i - 1;
        var p = (void 0);
        // find first non-whitespace prev char
        for (; j >= 0; j--) {
          p = exp.charAt(j);
          if (p !== ' ') { break }
        }
        if (!p || !validDivisionCharRE.test(p)) {
          inRegex = true;
        }
      }
    }
  }

  if (expression === undefined) {
    expression = exp.slice(0, i).trim();
  } else if (lastFilterIndex !== 0) {
    pushFilter();
  }

  function pushFilter () {
    (filters || (filters = [])).push(exp.slice(lastFilterIndex, i).trim());
    lastFilterIndex = i + 1;
  }

  if (filters) {
    for (i = 0; i < filters.length; i++) {
      expression = wrapFilter(expression, filters[i]);
    }
  }

  return expression
}

function wrapFilter (exp, filter) { // exp: message filter: capitalize
  var i = filter.indexOf('(');
  if (i < 0) { // 说明过滤器没有带参数
    // _f: resolveFilter
    return ("_f(\"" + filter + "\")(" + exp + ")")  // _f("capitalize")("message")
  } else { // 过滤器有带参数 capitalize('arg1','arg2')"
    var name = filter.slice(0, i); // capitalize
    var args = filter.slice(i + 1); // 'arg1','arg2') 注意这里结尾有 )，所以下面拼接时最后的不添加 ）
    return ("_f(\"" + name + "\")(" + exp + (args !== ')' ? ',' + args : args))
  }
}

// _f("capitalize")("message") 过滤器执行 id = "capitalize"
// _f 函数是在 Vue 构造函数初始化时 renderMinixs(Vue) 中调用 installRenderHelpers(Vue.prototype) 传入的。
// 会在 vm._render 函数中调用 render.call(vm._renderProxy, vm.$createElement);
function resolveFilter (id) {
  return resolveAsset(this.$options, 'filters', id, true) || identity
}

/**
   * Resolve an asset.
   * This function is used because child instances need access
   * to assets defined in its ancestor chain.
   */
  function resolveAsset (
    options, // vm.$options 在 _init 函数 mergeOptions 时合并了选项
    type, // type = filter
    id,
    warnMissing
  ) {
    /* istanbul ignore if */
    if (typeof id !== 'string') {
      return
    }
    var assets = options[type]; // vm.$options[filters] 取出声明的所有过滤器
    // check local registration variations first
    // 在 filters 中检查是否有 type 的过滤器，有则返回
    // 如果没有，将 type 变成小驼峰形式再试，有则返回
    // 如果还没有，将 type 变成大驼峰形式再试，有则返回
    // 如果仍没有，打印警告
    if (hasOwn(assets, id)) { return assets[id] }
    var camelizedId = camelize(id);
    if (hasOwn(assets, camelizedId)) { return assets[camelizedId] }
    var PascalCaseId = capitalize(camelizedId);
    if (hasOwn(assets, PascalCaseId)) { return assets[PascalCaseId] }
    // fallback to prototype chain
    var res = assets[id] || assets[camelizedId] || assets[PascalCaseId];
    if (warnMissing && !res) {
      warn(
        'Failed to resolve ' + type.slice(0, -1) + ': ' + id,
        options
      );
    }
    return res
  }

  /**
   * Camelize a hyphen-delimited string.
   * custom-child => customChild
   */
  var camelizeRE = /-(\w)/g;
  var camelize = cached(function (str) {
    return str.replace(camelizeRE, function (_, c) { return c ? c.toUpperCase() : ''; })
  });

  /**
   * Hyphenate a camelCase string.
   * customChild => custom-child
   */
  var hyphenateRE = /\B([A-Z])/g;
  var hyphenate = cached(function (str) {
    return str.replace(hyphenateRE, '-$1').toLowerCase()
  });

  /**
   * Capitalize a string. 首字母大写
   */
  var capitalize = cached(function (str) {
    return str.charAt(0).toUpperCase() + str.slice(1)
  });

  /**
   * 过滤器在 v-bind 中使用
   * 例子： v-bind:attr = "value | filterV"
   * 函数路径： $mount => compileToFunctions => createCompiler => baseCompile => parse => parseHTML => parseStartTag => handlerStartTag => options.start => closeElement => processElement => processAttrs => processFilters
   */
// var onRE = /^@|^v-on:/;
// var dirRE = /^v-|^@|^:|^#/;
// var argRE = /:(.*)$/;
// var bindRE = /^:|^\.|^v-bind:/;
// var modifierRE = /\.[^.\]]+(?=[^\]]*$)/g;
// var dynamicArgRE = /^\[.*\]$/;
// 这个函数处理了修饰符、事件过滤器、事件绑定
function processAttrs (el) {
  // attrsList: [ {name: 'v-bind:atrr', value: 'value | filterV',start,end}]
  var list = el.attrsList;
  var i, l, name, rawName, value, modifiers, syncGen, isDynamic;
  for (i = 0, l = list.length; i < l; i++) {
    name = rawName = list[i].name;
    value = list[i].value;
    if (dirRE.test(name)) { // dirRE = /^v-|^@|^:|^#/; 即匹配 v-on / @ / v-bind / : / v-slot / #
      // mark element as dynamic
      el.hasBindings = true;
      // modifiers 解析动态属性修饰符，比如 @click.stop, v-bind:show.sync
      // modifiers = {sync: true, stop: true}
      modifiers = parseModifiers(name.replace(dirRE, ''));
      // support .foo shorthand syntax for the .prop modifier
      if (modifiers) {
        name = name.replace(modifierRE, '');
      }
      if (bindRE.test(name)) { // v-bind:attr or :attr
        name = name.replace(bindRE, ''); // name = attr
        // 解析过滤器
        value = parseFilters(value); // value = '_f("filterV")("value")' 关于 parseFilter 具体见上面分析
        isDynamic = dynamicArgRE.test(name); // 比如： v-bind:[eventName]
        if (isDynamic) { // v-bind:[attr]，则去掉前后的 [ ]
          name = name.slice(1, -1); 
        }
        if ( value.trim().length === 0 ) {
          warn$2(
            ("The value for a v-bind expression cannot be empty. Found in \"v-bind:" + name + "\"")
          );
        }
        if (modifiers) {
          // 将name驼峰化
          if (modifiers.prop && !isDynamic) {
            name = camelize(name);
            if (name === 'innerHtml') { name = 'innerHTML'; }
          }
          if (modifiers.camel && !isDynamic) {
            name = camelize(name);
          }
          // 如果 v-bind:show.sync=value，则需要添加 update:show 的事件
          if (modifiers.sync) {
            syncGen = genAssignmentCode(value, "$event");
            if (!isDynamic) {
              addHandler(
                el,
                ("update:" + (camelize(name))),
                syncGen,
                null,
                false,
                warn$2,
                list[i]
              );
              if (hyphenate(name) !== camelize(name)) {
                addHandler(
                  el,
                  ("update:" + (hyphenate(name))),
                  syncGen,
                  null,
                  false,
                  warn$2,
                  list[i]
                );
              }
            } else {
              // handler w/ dynamic event name
              addHandler(
                el,
                ("\"update:\"+(" + name + ")"),
                syncGen,
                null,
                false,
                warn$2,
                list[i],
                true // dynamic
              );
            }
          }
        }
        if ((modifiers && modifiers.prop) || (
          !el.component && platformMustUseProp(el.tag, el.attrsMap.type, name)
        )) {
          addProp(el, name, value, list[i], isDynamic);
        } else {
          addAttr(el, name, value, list[i], isDynamic);
        }
      } else if (onRE.test(name)) { // v-on @
        name = name.replace(onRE, '');
        isDynamic = dynamicArgRE.test(name);
        if (isDynamic) {
          name = name.slice(1, -1);
        }
        // 解析事件各种修饰符，最后添加 el.events 或 el.nativeEvents 数组中储存着 handler
        addHandler(el, name, value, modifiers, false, warn$2, list[i], isDynamic);
      } else { // normal directives v-show v-text v-html v-model 和 自定义指令
        name = name.replace(dirRE, '');
        // parse arg
        var argMatch = name.match(argRE);
        var arg = argMatch && argMatch[1];
        isDynamic = false;
        if (arg) {
          name = name.slice(0, -(arg.length + 1));
          if (dynamicArgRE.test(arg)) {
            arg = arg.slice(1, -1);
            isDynamic = true;
          }
        }
        // el.directives
        addDirective(el, name, rawName, value, arg, isDynamic, modifiers, list[i]);
        if (name === 'model') {
          checkForAliasModel(el, value);
        }
      }
    } else {
      // literal attribute 文字属性 title href src
      {
        var res = parseText(value, delimiters);
        if (res) {
          warn$2(
            name + "=\"" + value + "\": " +
            'Interpolation inside attributes has been removed. ' +
            'Use v-bind or the colon shorthand instead. For example, ' +
            'instead of <div id="{{ val }}">, use <div :id="val">.',
            list[i]
          );
        }
      }
      // el.attrs 或 el.dynamicAttrs
      addAttr(el, name, JSON.stringify(value), list[i]);
      // #6887 firefox doesn't update muted state if set via attribute
      // even immediately after element creation
      if (!el.component &&
          name === 'muted' &&
          platformMustUseProp(el.tag, el.attrsMap.type, name)) {
        addProp(el, name, 'true', list[i]);
      }
    }
  }
}