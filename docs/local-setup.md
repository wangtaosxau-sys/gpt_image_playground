# 本地配置与启动流程

本文档只覆盖本机使用和本地开发流程。生产部署、自定义服务商协议和上游接口细节仍以 README 与设置页为准。

## 快速启动

Windows 用户优先使用：

```cmd
start-local.cmd
```

脚本会检查 Node.js、npm、依赖目录和本地代理配置提示，然后启动：

```cmd
npm.cmd run dev
```

如果不使用启动脚本，也可以手动执行：

```cmd
npm.cmd install
npm.cmd run dev
```

开发服务器地址以终端输出为准，通常是 `http://127.0.0.1:5173`。

## 本地环境变量

复制示例文件：

```cmd
copy .env.local.example .env.local
```

当前推荐只在本机使用这些变量：

- `VITE_DEFAULT_API_URL`：可选，本地默认 API Base URL。
- `VITE_STORAGE_NAMESPACE`：可选，本地存储命名空间。

`VITE_STORAGE_NAMESPACE` 未设置时，应用继续使用旧的 `gpt-image-playground` 存储名，避免历史数据丢失。设置后会隔离 localStorage 与 IndexedDB，适合测试分支、不同发行包或多套本地环境。

不要把凭据、私有上游地址或个人配置写入示例文件、README 或 docs。

## 本地开发代理

复制代理示例：

```cmd
copy dev-proxy.config.example.json dev-proxy.config.json
```

编辑 `dev-proxy.config.json`：

- `enabled`：本地是否启用代理。
- `target`：自己的 API Base URL。

代理路径为：

```text
/api-proxy
```

开发代理只在本地开发服务器中使用，不改变打包产物，也不改变 `profiles`、`customProviders`、`apiProxy` 的数据结构。

## 启动前检查

本地 smoke check：

```cmd
node scripts/local-smoke-check.mjs
```

检查内容：

- 必要本地文件是否存在。
- `dev-proxy.config.json` 是否是有效 JSON。
- 示例文件是否误写入明显敏感内容或私有硬编码。

这个脚本不会连接真实 API，也不会读取用户凭据。

## 推荐验证

代码改动后执行：

```cmd
npm.cmd run test
npm.cmd run build
node scripts/local-smoke-check.mjs
git diff --check
```

文档或配置样例改动后，至少执行：

```cmd
node scripts/local-smoke-check.mjs
git diff --check
```

提交前再检查 diff，不提交 `.env.local`、`dev-proxy.config.json`、下载目录或本地日志。
