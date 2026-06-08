# 批量功能

本文档说明当前批量能力和后续边界。Gallery 批量与 Agent 批量是两条路径，不共用同一个任务入口。

## 当前能力

Gallery 模式新增批量变量：

- 输入框中的主提示词作为通用提示词。
- 每个变量项会追加到通用提示词后，形成一个独立 Gallery 任务。
- 空变量项会被忽略。
- 每个任务继承当前 API 配置、参考图和生成参数。
- 每个任务仍走现有 `TaskRecord -> executeTask` 链路。

示例：

```text
通用提示词：
极简产品摄影，白色背景

变量 1：
红色背包

变量 2：
蓝色水杯
```

提交后会创建两个任务：

```text
极简产品摄影，白色背景

红色背包
```

```text
极简产品摄影，白色背景

蓝色水杯
```

## 并发设置

设置项：

```text
AppSettings.galleryBatchConcurrency
```

规则：

- 默认值：`3`
- 范围：`1-8`
- 只控制 Gallery 批量任务同时启动的数量。
- 不改变 `TaskParams.n`，`n` 仍表示单个 API 请求返回几张图。

## 不支持的场景

当前 Gallery 批量不支持遮罩编辑。原因是遮罩提交存在目标图排序、遮罩覆盖确认、遮罩图片入库和提交后清理逻辑，批量第一版先避免把这些交互叠在一起。

如果启用遮罩时提交 Gallery 批量，应用会阻止提交并提示：

```text
批量模式暂不支持遮罩编辑
```

## 与 Agent 批量的区别

Agent 模式已有 `generate_image_batch` 工具，由模型在对话轮次中生成批量请求。Gallery 批量是用户手动填写变量后提交多个普通 Gallery 任务。

区别：

- Gallery 批量：用户控制变量列表。
- Agent 批量：模型根据对话和工具调用生成任务。
- Gallery 批量不调用 Agent 的 `callBatchImageSingle`。
- Agent 批量不读取 Gallery 的 `galleryBatchDraft`。

## 数据边界

新增状态：

```text
galleryBatchDraft
```

包含：

- `enabled`
- `variableCollapsed`
- `variableItems`

新增设置：

```text
galleryBatchConcurrency
```

没有新增服务端 API，没有改变 `profiles`、`customProviders`、`apiProxy` 的结构。

## 后续建议

后续如果继续增强批量能力，建议按顺序做：

1. 批次视图：显示总数、运行中、成功、失败。
2. 失败项重试：只重试失败任务。
3. 批量导入：从 TXT 或 JSON 导入变量项。
4. 批次导出：导出提示词、参数、结果和错误摘要。
5. 遮罩批量：单独设计确认流程后再支持。

不建议在下一步直接加入复杂矩阵参数。先把变量列表、失败重试和批次状态做稳定。
