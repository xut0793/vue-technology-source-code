/**
 * 上一节是 Vue.use(VueRouter) 语句调用 VueRouter.install 函数实例路由插件注册的过程。
 * 这一节通过 new VueRouter 语句实例路由实例化的过程
 */

/**
 * 先看 VueRouter 构造函数，主要是初始化一系列路由实例属性。这里要注意的两点：
 * 1. this.matcher = createMatcher(options.routes || [], this); 中 createMactcher 函数：创建路由映射表 pathList pathMap nameMap
 * 2. this.history 实际的路由实例。依模式调用不同的路由构造器
 */

class VueRouter {
  constructor (options = {}) {
    this.app = null;  // Vue 根实例，即 new Vue 实例, 在 init 函数中 this.app = app
    this.apps = []; // 存入各组件实例
    this.options = options; // 路由配置对象，即 new VueRouter({ routes: routes })
    this.beforeHooks = [];
    this.resolveHooks = [];
    this.afterHooks = [];
    this.matcher = createMatcher(options.routes || [], this);
    // 返回两个工具函数 match / addRoutes，路由映射关系 pathList / pathMap / nameMap 存在 createMatcher 函数的闭包属性中

    let mode = options.mode || 'hash';
    // 在浏览器不支持 history.pushState 的情况下，根据传入的 fallback 配置参数，决定是否回退到hash模式
    this.fallback =
      mode === 'history' && !supportsPushState && options.fallback !== false;
    if (this.fallback) {
      mode = 'hash';
    }
    if (!inBrowser) {
      mode = 'abstract';
    }
    this.mode = mode;

    /**
     * this.history 表示路由历史的具体的实现实例，它是根据 this.mode 的不同实现不同，
     * HTML5History / HashHistory / AbsractHistory 都继承自 History 基类，然后不同的 mode 定义不同的类。
     */
    switch (mode) {
      case 'history':
        this.history = new HTML5History(this, options.base);
        break
      case 'hash':
        this.history = new HashHistory(this, options.base, this.fallback);
        break
      case 'abstract':
        this.history = new AbstractHistory(this, options.base);
        break
      default:
        {
          assert(false, `invalid mode: ${mode}`);
        }
    }
  }
 
  /**
   * 省略原型方法
   * init
   * match
   * push
   * replace
   * go
   * back
   * forward
   * addRoutes
   * resolve
   * onReady
   * onError
   * beforeResolve
   * beforeEach
   */
}

//#region 路由映射
// 先看 createMactcher 函数，主要作用是解析我们传入的路由配置 routes ，生成路径或名称与组件的映射关系。
function createMatcher (
  routes,
  router
) {
  var ref = createRouteMap(routes);
  var pathList = ref.pathList;
  var pathMap = ref.pathMap;
  var nameMap = ref.nameMap;

  function addRoutes (routes) {
    createRouteMap(routes, pathList, pathMap, nameMap);
  }

  /**
   * 序列化 location 拿到 path / query / params 等参数，通过 createRoute 生成 route 对象
   * var route = {
      name: location.name || (record && record.name),
      meta: (record && record.meta) || {},
      path: location.path || '/',
      hash: location.hash || '',
      query: query,
      params: location.params || {},
      fullPath: getFullPath(location, stringifyQuery),
      matched: record ? formatMatch(record) : []
    };
   * 
   */
  function match (
    raw,
    currentRoute,
    redirectedFrom
  ) {
    /**
     * /info/13?q=test
     * location = {
     *  _normalized: true,
     *  path: '/info/13',
     *  query: {q:test},
     *  hash: ''
     * }
     */
    var location = normalizeLocation(raw, currentRoute, false, router); 
    var name = location.name;
    // 优先匹配路由名称
    if (name) {
      var record = nameMap[name];
      {
        warn(record, ("Route with name '" + name + "' does not exist"));
      }
      if (!record) { return _createRoute(null, location) } 

      var paramNames = record.regex.keys
        .filter(function (key) { return !key.optional; })
        .map(function (key) { return key.name; });

      if (typeof location.params !== 'object') {
        location.params = {};
      }

      if (currentRoute && typeof currentRoute.params === 'object') {
        for (var key in currentRoute.params) {
          if (!(key in location.params) && paramNames.indexOf(key) > -1) {
            location.params[key] = currentRoute.params[key];
          }
        }
      }

      location.path = fillParams(record.path, location.params, ("named route \"" + name + "\""));
      return _createRoute(record, location, redirectedFrom)
    } else if (location.path) {
      location.params = {};
      for (var i = 0; i < pathList.length; i++) {
        var path = pathList[i];
        var record$1 = pathMap[path];
        // matchRoute 解析出 params 参数
        if (matchRoute(record$1.regex, location.path, location.params)) {
          return _createRoute(record$1, location, redirectedFrom)
        }
      }
    }
    // no match
    return _createRoute(null, location)
  }

  function redirect (
    record,
    location
  ) {
    var originalRedirect = record.redirect;
    var redirect = typeof originalRedirect === 'function'
      ? originalRedirect(createRoute(record, location, null, router))
      : originalRedirect;

    if (typeof redirect === 'string') {
      redirect = { path: redirect };
    }

    if (!redirect || typeof redirect !== 'object') {
      {
        warn(
          false, ("invalid redirect option: " + (JSON.stringify(redirect)))
        );
      }
      return _createRoute(null, location)
    }

    var re = redirect;
    var name = re.name;
    var path = re.path;
    var query = location.query;
    var hash = location.hash;
    var params = location.params;
    query = re.hasOwnProperty('query') ? re.query : query;
    hash = re.hasOwnProperty('hash') ? re.hash : hash;
    params = re.hasOwnProperty('params') ? re.params : params;

    if (name) {
      // resolved named direct
      var targetRecord = nameMap[name];
      {
        assert(targetRecord, ("redirect failed: named route \"" + name + "\" not found."));
      }
      return match({
        _normalized: true,
        name: name,
        query: query,
        hash: hash,
        params: params
      }, undefined, location)
    } else if (path) {
      // 1. resolve relative redirect
      var rawPath = resolveRecordPath(path, record);
      // 2. resolve params
      var resolvedPath = fillParams(rawPath, params, ("redirect route with path \"" + rawPath + "\""));
      // 3. rematch with existing query and hash
      return match({
        _normalized: true,
        path: resolvedPath,
        query: query,
        hash: hash
      }, undefined, location)
    } else {
      {
        warn(false, ("invalid redirect option: " + (JSON.stringify(redirect))));
      }
      return _createRoute(null, location)
    }
  }

  function alias (
    record,
    location,
    matchAs
  ) {
    var aliasedPath = fillParams(matchAs, location.params, ("aliased route with path \"" + matchAs + "\""));
    var aliasedMatch = match({
      _normalized: true,
      path: aliasedPath
    });
    if (aliasedMatch) {
      var matched = aliasedMatch.matched;
      var aliasedRecord = matched[matched.length - 1];
      location.params = aliasedMatch.params;
      return _createRoute(aliasedRecord, location)
    }
    return _createRoute(null, location)
  }

  function _createRoute (
    record,
    location,
    redirectedFrom
  ) {
    if (record && record.redirect) {
      return redirect(record, redirectedFrom || location)
    }
    if (record && record.matchAs) {
      return alias(record, location, record.matchAs)
    }
    return createRoute(record, location, redirectedFrom, router)
  }

  return {
    match: match,
    addRoutes: addRoutes
  }
}

// 关注 createRouteMap(route)
function createRouteMap (
  routes,
  oldPathList,
  oldPathMap,
  oldNameMap
) {
  // the path list is used to control path matching priority
  var pathList = oldPathList || [];
  // $flow-disable-line
  var pathMap = oldPathMap || Object.create(null);
  // $flow-disable-line
  var nameMap = oldNameMap || Object.create(null);

  routes.forEach(function (route) {
    addRouteRecord(pathList, pathMap, nameMap, route);
  });

  // ensure wildcard routes are always at the end
  // 确保通配符 * 路由在配置 routes 中的最后一项
  for (var i = 0, l = pathList.length; i < l; i++) {
    if (pathList[i] === '*') {
      pathList.push(pathList.splice(i, 1)[0]); // 删除通配符项，并取出插入到最后。 splice 返回数组包含删除的数组元素
      l--;
      i--;
    }
  }

  {
    // warn if routes do not include leading slashes
    // 遍历每一项的路由路径，除了 * 通配符路由外，其它路径如果不以 / 开头，则警告
    var found = pathList
    // check for missing leading slash
      .filter(function (path) { return path && path.charAt(0) !== '*' && path.charAt(0) !== '/'; });

    if (found.length > 0) {
      var pathNames = found.map(function (path) { return ("- " + path); }).join('\n');
      warn(false, ("Non-nested routes must include a leading slash character. Fix the following routes: \n" + pathNames));
    }
  }

  return {
    pathList: pathList,
    pathMap: pathMap,
    nameMap: nameMap
  }
}

// 关注 addRouteRecord
// 例：{path:'/hello',name:'user',component:hello}
function addRouteRecord (
  pathList,
  pathMap,
  nameMap,
  route,
  parent,
  matchAs
) {
  var path = route.path; // '/hello'
  var name = route.name; // 'user'

  // path 不能为空，component 不能为字符串
  {
    assert(path != null, "\"path\" is required in a route configuration.");
    assert(
      typeof route.component !== 'string',
      "route config \"component\" for path: " + (String(
        path || name
      )) + " cannot be a " + "string id. Use an actual component instead."
    );
  }

  var pathToRegexpOptions = route.pathToRegexpOptions || {};
  var normalizedPath = normalizePath(path, parent, pathToRegexpOptions.strict); // path 去掉结尾的 / ，或者如果有 parent 接上 parent.path/path

  if (typeof route.caseSensitive === 'boolean') {
    pathToRegexpOptions.sensitive = route.caseSensitive;
  }

  var record = {
    path: normalizedPath,
    regex: compileRouteRegex(normalizedPath, pathToRegexpOptions),
    components: route.components || { default: route.component },
    instances: {},
    name: name,
    parent: parent,
    matchAs: matchAs,
    redirect: route.redirect,
    beforeEnter: route.beforeEnter, // 路由导航卫士
    meta: route.meta || {},
    props:
      route.props == null
        ? {}
        : route.components
          ? route.props
          : { default: route.props }
  };

  // 递归处理子嵌套路由
  if (route.children) {
    // Warn if route is named, does not redirect and has a default child route.
    // If users navigate to this route by name, the default child will
    // not be rendered (GH Issue #629)
    {
      if (
        route.name &&
        !route.redirect &&
        route.children.some(function (child) { return /^\/?$/.test(child.path); })
      ) {
        warn(
          false,
          "Named Route '" + (route.name) + "' has a default child route. " +
            "When navigating to this named route (:to=\"{name: '" + (route.name) + "'\"), " +
            "the default child route will not be rendered. Remove the name from " +
            "this route and use the name of the default child route for named " +
            "links instead."
        );
      }
    }
    route.children.forEach(function (child) {
      var childMatchAs = matchAs
        ? cleanPath((matchAs + "/" + (child.path)))
        : undefined;
      addRouteRecord(pathList, pathMap, nameMap, child, record, childMatchAs);
    });
  }

  // 将处理后的路由添加到 pathList 和 pathMap
  if (!pathMap[record.path]) {
    pathList.push(record.path);
    pathMap[record.path] = record;
  }

  // 如果路由配置有别名，则为别名也生成一个路由记录
  if (route.alias !== undefined) {
    var aliases = Array.isArray(route.alias) ? route.alias : [route.alias];
    for (var i = 0; i < aliases.length; ++i) {
      var alias = aliases[i];
      if ( alias === path) {
        warn(
          false,
          ("Found an alias with the same value as the path: \"" + path + "\". You have to remove that alias. It will be ignored in development.")
        );
        // skip in dev to make it work
        continue
      }

      var aliasRoute = {
        path: alias,
        children: route.children
      };
      addRouteRecord(
        pathList,
        pathMap,
        nameMap,
        aliasRoute,
        parent,
        record.path || '/' // matchAs
      );
    }
  }

  // 如果命名路由，则也建立名称和路由记录的映射关系
  if (name) {
    if (!nameMap[name]) {
      nameMap[name] = record;
    } else if ( !matchAs) {
      warn(
        false,
        "Duplicate named routes definition: " +
          "{ name: \"" + name + "\", path: \"" + (record.path) + "\" }"
      );
    }
  }
}

function compileRouteRegex (
  path,
  pathToRegexpOptions
) {
  var regex = pathToRegexp_1(path, [], pathToRegexpOptions);
  {
    var keys = Object.create(null);
    regex.keys.forEach(function (key) {
      warn(
        !keys[key.name],
        ("Duplicate param keys in route with path: \"" + path + "\"")
      );
      keys[key.name] = true;
    });
  }
  return regex
}

function normalizePath (
  path,
  parent,
  strict
) {
  if (!strict) { path = path.replace(/\/$/, ''); }
  if (path[0] === '/') { return path }
  if (parent == null) { return path }
  return cleanPath(((parent.path) + "/" + path))
}

function createRoute (
  record,
  location,
  redirectedFrom,
  router
) {
  const stringifyQuery = router && router.options.stringifyQuery;

  let query = location.query || {};
  try {
    query = clone(query);
  } catch (e) {}

  const route = {
    name: location.name || (record && record.name),
    meta: (record && record.meta) || {},
    path: location.path || '/',
    hash: location.hash || '',
    query,
    params: location.params || {},
    fullPath: getFullPath(location, stringifyQuery),
    matched: record ? formatMatch(record) : []
  };
  if (redirectedFrom) {
    route.redirectedFrom = getFullPath(redirectedFrom, stringifyQuery);
  }
  return Object.freeze(route)
}

/**
 * 例子：
 */
const routes = [                                                         //定义路由指向
  {path:'/login',component:login},
  {path:'/hello',name:'user',component:hello},
  {path:'/info/:id',component:info},
]
// 经过 createRouteMap => addRouteRecord 处理后，createMatcher 函数内的闭包变量
pathList = ['/login', '/hello', '/info/:id']
pathMap = {
  '/login': {path: '/login', regex: /^\/login(?:\/(?=$))?$/i, components: {default: login}},
  '/hello': {path: '/hello', regex: /^\/hello(?:\/(?=$))?$/i, name: 'user',  components: {default: hello}},
  '/info/:id': {path: '/info/:id', regex: /^\/info\/((?:[^\/]+?))(?:\/(?=$))?$/i, components: {default: login}}
}
nameMap = {
  'user': {path: '/hello', regex: /^\/hello(?:\/(?=$))?$/i, name: 'user',  components: {default: hello}}
}

//#endregion 路由映射

//#region 路由实例 History
/**
 * 基类 History
 * 不管是 HTML5History / HashHistory / AbstractHistory 构造函数，都基于一个基类 History，定义了公共属性和方法
 */
class History {

  // implemented by sub-classes
  constructor (router, base) {
    this.router = router;
    this.base = normalizeBase(base);
    // start with a route object that stands for "nowhere"
    this.current = START;
    this.pending = null;
    this.ready = false;
    this.readyCbs = [];
    this.readyErrorCbs = [];
    this.errorCbs = [];
    this.listeners = [];
  }
  
  /**
   * 省略原型方法
   * onReady
   * onError
   * listen
   * teardownListeners
   * updateRoute
   * transitionTo
   * confirmTransition
   */
}

function normalizeBase (base) {
  if (!base) {
    if (inBrowser) {
      // respect <base> tag
      const baseEl = document.querySelector('base');
      base = (baseEl && baseEl.getAttribute('href')) || '/';
      // strip full URL origin
      base = base.replace(/^https?:\/\/[^\/]+/, '');
    } else {
      base = '/';
    }
  }
  // make sure there's the starting slash
  if (base.charAt(0) !== '/') {
    base = '/' + base;
  }
  // remove trailing slash
  return base.replace(/\/$/, '')
}

/**
 * 子类 HashHistory
 */
class HashHistory extends History {
  constructor (router, base, fallback) {
    super(router, base);
    // check history fallback deeplinking
    if (fallback && checkFallback(this.base)) {
      return
    }
    ensureSlash();
  }

  /**
   * 原型方法
   * push
   * replace
   * go
   * getCurrentLocation
   * setupListeners
   * ensureURL
   */
}

function ensureSlash () {
  const path = getHash();
  if (path.charAt(0) === '/') {
    return true
  }
  replaceHash('/' + path);
  return false
}

function getHash () {
  // We can't use window.location.hash here because it's not
  // consistent across browsers - Firefox will pre-decode it!
  let href = window.location.href;
  const index = href.indexOf('#');
  // empty path
  if (index < 0) return ''

  href = href.slice(index + 1);
  // decode the hash but not the search or hash
  // as search(query) is already decoded
  // https://github.com/vuejs/vue-router/issues/2708
  const searchIndex = href.indexOf('?');
  if (searchIndex < 0) {
    const hashIndex = href.indexOf('#');
    if (hashIndex > -1) {
      href = decodeURI(href.slice(0, hashIndex)) + href.slice(hashIndex);
    } else href = decodeURI(href);
  } else {
    href = decodeURI(href.slice(0, searchIndex)) + href.slice(searchIndex);
  }

  return href
}

function replaceHash (path) {
  if (supportsPushState) {
    replaceState(getUrl(path));
  } else {
    window.location.replace(getUrl(path));
  }
}

function getUrl (path) {
  const href = window.location.href;
  const i = href.indexOf('#');
  const base = i >= 0 ? href.slice(0, i) : href;
  return `${base}#${path}`
}

/**
 * 子类 HTML5History
 */
class HTML5History extends History {
  constructor (router, base) {
    super(router, base);

    this._startLocation = getLocation(this.base);
  }

  /**
   * 原型方法
   * push
   * replace
   * go
   * getCurrentLocation
   * setupListeners
   * ensureURL
   */
}

function getLocation (base) {
  let path = decodeURI(window.location.pathname);
  if (base && path.toLowerCase().indexOf(base.toLowerCase()) === 0) {
    path = path.slice(base.length);
  }
  return (path || '/') + window.location.search + window.location.hash
}
//#endregion 路由实例 History