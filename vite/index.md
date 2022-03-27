# vite@2.5.0 源码解析

- `vite build` 生产构建
- `vite` 开发服务
  - CLI 命令
  - 环境变量
  - 开发服务器：创建、启动、关闭
  - NPM 依赖预构建：1. 预构建时 cmomonjs=>esm；2. 请求时，裸模块处理和依赖强缓存实现及更新
  - 插件体系：生命周期钩子
  - 静态资源处理：HTML/CSS/JS/TS/其它（图片、json)
  - HMR 热重载

待深入：
- esbuild 的 build 函数
- connect.js 源码