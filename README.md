# dsh-task-toast

给 [DeepSeek Harness](https://github.com/deepseek-ai) 用的 Windows 右下角弹窗：**每轮任务结束时**弹出一个类似 Codex 的提示框，显示本轮状态、模型、token 用量和**花了多少钱**，同时播放提示音。

![preview](docs/preview.png)

## 功能

- 每轮对话结束弹出提示，标题随结束原因变化：任务完成 / 已停止 / 出错 / 已结束
- 显示本轮模型、token 用量、按 DeepSeek 官方价目估算的人民币花费
- 弹出时播放系统提示音（`Windows Notify System Generic.wav`，缺失时回落系统 Asterisk）
- 子智能体（subagent）的轮次不弹窗，只在主会话结束时提示
- 新的一轮结束时替换掉还在屏幕上的旧弹窗，不堆叠
- 5 秒自动关闭，点击任意位置立即关闭，滑入 + 淡出动画，置顶显示

## 计价方式

按 DeepSeek API 官方人民币价目（每百万 token）估算：

| 模型 | 缓存命中 输入 | 未命中 输入 | 输出 |
| --- | --- | --- | --- |
| deepseek-flash 系列（含 v4-flash） | ¥0.02 / ¥0.04 | ¥1 / ¥2 | ¥4 / ¥8 |
| deepseek-v4-pro | ¥0.15 / ¥0.30 | ¥4.5 / ¥9 | ¥13.5 / ¥27 |

- 斜杠前为**空闲时段**价，后为**高峰时段**价。高峰 = 北京时间工作日 9:00–12:00、14:00–18:00；周末与法定节假日全天按空闲价。
- 计费 token 取自 provider 返回的 usage：`cacheReadTokens` 按命中价，`inputTokens` 按未命中价，`outputTokens` 按输出价；`reasoningTokens` 已包含在 output 中，不重复计费。
- 自定义 provider 的模型名含 `pro` 的按 Pro 价，其余按 Flash 价。

这是**估算**，不是账单；准确扣费以 DeepSeek 账户余额为准。若官方调价，改 `lib/index.js` 顶部的价目表即可。2026 年法定节假日已内置，次年安排公布后需补进 `HOLIDAYS`。

## 安装

前提：Windows 10/11 + PowerShell 5.1（系统自带）。

```bash
# 官方桌面客户端
dsh plugin --profile desktop add dsh-task-toast

# Web 端（同一台机器上跑 `dsh web` 时）
dsh plugin --profile web add dsh-task-toast
```

本地开发用目录安装：

```bash
dsh plugin --profile desktop add link:C:\path\to\dsh-task-toast
```

装完**重启 DeepSeek Harness**（宿主启动时加载插件）。

## 卸载

```bash
dsh plugin --profile desktop remove dsh-task-toast
```

## 工作原理

```
session/event ── assistant/message ──▶ 按 (session, turn) 累计 usage，折成人民币
             └─ turn/end ───────────▶ 主会话且有花费时，spawn PowerShell 弹窗
```

- 只监听事件，不写任何文件、不改会话日志。
- 弹窗由 `assets/toast.ps1` 用 WinForms 绘制：无边框、圆角、深色、右下角贴边。
- 每个提示是一个短命的 PowerShell 进程，5 秒后自行退出；宿主退出时弹窗随之关闭。

## 已知限制

- **只支持 Windows**（弹窗依赖 PowerShell + WinForms）。其他平台插件会静默跳过。
- 只在**主屏**右下角弹出，多屏时不会跟随鼠标所在的屏幕。
- 同时只显示一个弹窗：两轮几乎同时结束，只看得到最后那个。
- 子智能体轮次不提示，说明里不带会话标题，也不支持点击跳回 DSH。
- 系统提示音固定，不可在设置里换。

## License

[MIT](LICENSE)
