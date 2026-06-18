# 桌面端路线

桌面端目标是让当前 Web 应用进入桌面壳，同时把原生能力限制在宿主层，避免污染 Web 主线。

## 路线选择

推荐未来优先评估 Wails。

原因：

- 当前应用已经是 React Web 前端。
- Wails 可以保留 Web UI，把桌面能力放到宿主层。
- 适合需要本地文件、系统通知、外链打开和凭据存储的工具型应用。

Wails 代码只保留在独立桌面分支中。Web 主线继续保持纯 Web 运行方式。

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

## 当前 PoC

当前桌面 PoC 位于 `poc/wails-desktop` 分支，使用 Wails 承载同一套 Vite 构建产物。

已验证能力：

- Gallery、Agent 和自定义服务商的外部 API 请求可通过 Wails native API proxy 转发。
- 打包 exe 不依赖 `dev-proxy.config.json`；该文件仍只用于 Vite dev server。
- 桌面代理只允许 `http/https`，不会把 API key 写入日志或文件。
- 桌面代理支持 Wails 事件桥流式转发；启用流式图片时，Go 侧读取上游 SSE，前端通过 `ReadableStream` 继续复用现有流式解析逻辑。
- 桌面流式代理支持取消：用户停止请求、读取取消或超时后，会调用宿主层取消对应上游请求。

仍不做事项：

- 不把 Wails 依赖合入 Web 主线。
- 不加入 Electron 或 Tauri。
- 不做系统 keyring 凭据存储。
- 不改变当前 Web 部署路径。

## 下一阶段

桌面能力稳定后，再把宿主能力收敛成正式 `runtimeHost` 类型。

建议验证：

- API Key 优先进入系统安全凭据存储。
- 文件保存、选择图片、打开外链都走宿主能力。
- 保留纯 Web 运行模式。
- 把当前 Wails 事件桥代理收敛进正式 `runtimeHost`，并补充更细的桌面错误诊断。

## 风险

- 太早引入桌面壳会扩大维护面。
- 桌面代理请求可能改变错误来源，需要清晰诊断。
- 系统凭据存储要处理迁移和导出边界。
- 原生文件保存要避免默认写入不透明目录。
- Wails native proxy 会改变网络错误来源，错误提示需要区分服务商错误和宿主转发错误。

## 验收标准

进入桌面打包前至少满足：

- Web 版本的生成、批量、历史、提示词图库和设置稳定。
- `runtimeHost` 能力边界有类型定义或文档约束。
- 没有私有 API 地址、模型或凭据写入代码。
- 桌面分支能回退到纯 Web 行为。
