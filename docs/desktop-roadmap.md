# 桌面端路线

桌面端目标是让当前 Web 应用未来可以进入桌面壳，同时不提前引入原生依赖。本阶段只确定边界，不打包安装包。

## 路线选择

推荐未来优先评估 Wails。

原因：

- 当前应用已经是 React Web 前端。
- Wails 可以保留 Web UI，把桌面能力放到宿主层。
- 适合需要本地文件、系统通知、外链打开和凭据存储的工具型应用。

第一阶段不引入 Electron、Tauri 或 Wails 依赖。先把 Web 代码中的平台能力边界写清楚，避免后续桌面化时到处改业务逻辑。

## runtimeHost 边界

未来可抽象一个 `runtimeHost`，Web、桌面、移动分别提供实现。业务层只调用能力接口，不直接判断宿主。

建议能力：

```ts
interface RuntimeHost {
  kind: 'web' | 'desktop' | 'mobile'
  capabilities: RuntimeCapabilities
  saveBlob(input: SaveBlobInput): Promise<void>
  openExternal(url: string): Promise<void>
  showNotification(input: NotificationInput): Promise<void>
  pickImages(options?: PickImagesOptions): Promise<File[]>
  secureCredentialStore?: SecureCredentialStore
  apiProxyFetch?: typeof fetch
}
```

能力边界：

- 保存文件：Web 使用浏览器下载，桌面可保存到用户选择路径。
- 打开外链：Web 使用浏览器默认行为，桌面由宿主安全打开。
- 通知：Web 使用 Notification API，桌面可接系统通知。
- 选择图片：Web 使用 `<input type="file">`，桌面可接原生文件选择器。
- 安全凭据：Web 继续使用当前配置存储，桌面后续可接系统 keyring。
- 代理请求：Web 使用当前 API 代理配置，桌面可由宿主代理请求以减少 CORS 问题。

## 第一阶段

只做文档和边界，不新增原生包。

可做事项：

- 保持配置、生成、历史、收藏夹仍以 Web 代码为主。
- 把未来宿主能力写入文档。
- 避免新增只在桌面可用的业务分支。
- 保持本地启动、测试、构建流程不依赖桌面工具链。

不做事项：

- 不加入 Wails 依赖。
- 不加入 Go 后端。
- 不加入 Electron 或 Tauri。
- 不生成安装包。
- 不改变当前 Web 部署路径。

## 第二阶段

当 Web 端批量、配置和存储流程稳定后，再开独立桌面分支验证 Wails。

建议验证：

- 使用同一套前端构建产物。
- 宿主只实现 `runtimeHost` 能力。
- API Key 优先进入系统安全凭据存储。
- 文件保存、选择图片、打开外链都走宿主能力。
- 保留纯 Web 运行模式。

## 风险

- 太早引入桌面壳会扩大维护面。
- 桌面代理请求可能改变错误来源，需要清晰诊断。
- 系统凭据存储要处理迁移和导出边界。
- 原生文件保存要避免默认写入不透明目录。

## 验收标准

进入桌面打包前至少满足：

- Web 版本的生成、批量、历史和设置稳定。
- `runtimeHost` 能力边界有类型定义或文档约束。
- 没有私有 API 地址、模型或凭据写入代码。
- 桌面分支能回退到纯 Web 行为。
