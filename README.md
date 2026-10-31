# dfy-抖音陪看

**把桌宠拖到抖音视频上，松手，它就开始陪你看。**

Windows 上的本地 AI 桌宠原型。复用 [PC2005-cloud/dsh-pet](https://github.com/PC2005-cloud/dsh-pet) 的桌宠、动画和气泡能力，用 Electron 采集选定窗口，再交给本机 Ollama 视觉模型生成简短回应。

> 早期原型，已在一台 Windows 11 / RTX 5070 电脑上跑通真实拖放、画面理解和气泡更新。尚无语音理解或连续视频推理；已有本机文本长期记忆（v1，不存截图）。模型可能误认画面和人物，回应不代表视频事实。

## 怎么用

1. 双击桌面 **dfy-抖音陪看**，桌宠出现，控制面板默认隐藏。
2. 在 Chrome 或 Edge 打开抖音、播放视频。
3. 把桌宠拖到视频画面中间，松手开始陪看。

- 头上的 **Ⅱ**：暂停 / 继续分析。
- 拖到抖音窗口以外：停止采集。
- 头上的 **×**：通知陪看停止，然后关闭桌宠。
- 系统托盘：暂停、结束陪看、备用控制面板、退出。

普通 Chrome 独立配置也可以使用，无需复制 Cookie、安装浏览器扩展或开启浏览器调试端口。当前按可见窗口标题识别 Chrome/Edge 中的抖音；手机、抖音原生客户端和其他平台尚未适配。

## 安装

需要 **Windows 10/11 x64、Node.js ≥22.12、PowerShell 7、Chrome/Edge、Ollama**。建议使用 Node.js 24。先从官方安装 [Node.js](https://nodejs.org/)、[PowerShell](https://learn.microsoft.com/powershell/scripting/install/installing-powershell-on-windows) 和 [Ollama](https://ollama.com/download/windows)，安装后重新打开终端。

```powershell
git clone https://github.com/sellzzz/dfy-douyin-companion.git
cd dfy-douyin-companion
pwsh -NoProfile -File .\scripts\setup.ps1
```

安装脚本会安装锁定的项目依赖、`dsh-pet@0.3.8`，准备其 Electron 运行时，并拉取 `qwen3-vl:2b-instruct-q4_K_M` 本地视觉模型（约 2 GB 下载）。模型已存在时复用。脚本随后创建桌面快捷方式。安装过程中不需要抖音密码或账号令牌；抖音登录和验证码由你在自己的浏览器中完成。

也可以手动启动：

```powershell
pwsh -NoProfile -File .\scripts\start-doupet.ps1
```

首次使用模型的加载时间比热启动长。实测过的约 0.4 秒是单次模型处理时间，采样周期目前为 5 秒，不等于完整响应延迟，也不保证其他机器相同速度。

## 工作原理

```text
拖动桌宠并松手
  → 判断鼠标下最上层的窗口是否是抖音浏览器窗口
  → 仅采集这个窗口
  → 本地模型识别视频区域；失败时围绕拖放点取景
  → 约每 5 秒读取一帧
  → Ollama / Qwen3-VL 生成一句感想
  → dsh-pet 气泡显示
```

松手后不会把桌宠甩飞；拖到别处可结束陪看。自动边框定位尚不稳定，后备取景可能只包含部分视频，建议把桌宠拖到播放器中间。备用面板仍保留手动选窗、框选方式。

## 数据与权限

- **视觉定位（locate）**默认始终走本机 Ollama VL（`qwen3-vl`）。
- **气泡回复（infer）**可通过 `work/llm.json` 自选提供商（见仓库根目录 `llm.example.json`）：`ollama`（默认）或 `openai-compatible`（DeepSeek / OpenAI 等）。密钥只读环境变量名 `apiKeyEnv`，从不写入仓库。未配置时行为与今天一致（本机 Ollama VL）。
- 不自动点赞、评论、发私信、发布视频或操作抖音账号；不读取 Cookie 或浏览器密码数据库。
- 原始截图只在内存中处理，不写入磁盘；本机 `work/` 保存依赖、配置、运行日志和最近一次文字回应。
- **长期记忆（v1）**只在本机 `work/memory/` 保存短文本（偏好 / 实体 / 瞬间 / 会话摘要），**从不保存截图或 base64 帧**。陪看时把压缩后的记忆片段注入本机模型的系统提示；备用面板可开关或一键清空。
- **短期记忆**只存在于当前陪看会话内存中（近几轮气泡 / 场景要点 / 一条滚动概要），以 `【短期记忆】` 注入下一轮系统提示，结束陪看即清空，不落盘、不整段升格为长期记忆。
- 暂停会停止模型分析，但备用面板中的本地预览仍可继续；“结束采集”停止视频流。
- 本机桌宠服务使用端口 3081，拖放控制通道使用 3082，均限回环地址；3082 的随机进程凭据只保存在本机运行目录。
- 窗口标题检查和模型的登录界面识别并非完整隐私防护。输入账号、验证码或其他敏感内容前，请结束采集。

`work/`、模型、浏览器数据、运行凭据、截图、个人配置、记忆数据和日志均不进入 Git。项目没有设置开机自启。

## 回复模型自选（LLM）

把 `llm.example.json` 复制为 `work/llm.json` 后按需修改。`work/` 已在 `.gitignore` 中。

**继续用本机 Ollama（默认，可不建配置文件）：**

```json
{
  "provider": "ollama",
  "host": "http://127.0.0.1:11434",
  "model": "qwen3-vl:2b-instruct-q4_K_M"
}
```

**改用 DeepSeek（OpenAI 兼容接口）做气泡回复：**

```json
{
  "provider": "openai-compatible",
  "baseUrl": "https://api.deepseek.com/v1",
  "model": "deepseek-chat",
  "apiKeyEnv": "DEEPSEEK_API_KEY",
  "supportsVision": false
}
```

然后在启动前设置环境变量，例如 PowerShell：`$env:DEEPSEEK_API_KEY="sk-..."`。

- `supportsVision: false`（文本模型常见）：先用本机 Ollama VL 生成一句画面摘要，再把摘要 + 记忆上下文发给云端文本模型。
- `supportsVision: true`：直接把当前帧以多模态消息发给兼容接口（需该模型支持视觉）。
- 也可把同一段配置写进 `work/memory/config.json` 的 `llm`（或 `reply`）字段；优先读 `work/llm.json`。
- 记忆抽取（`memory.cjs` 的 extract）仍只用其自身的 `ollamaHost` / `extractModel`，不受回复提供商切换影响。

## 开发与验证

```powershell
npm ci
npm test
npm run check
```

`tests/` 检查区域坐标、后备取景边界以及安装补丁的可重复应用。运行时采用 npm 锁定的 `dsh-pet@0.3.8`；上游升级后必须重新检查补丁锚点和兼容性，不应直接替换为 latest。

本仓库发布的是当前“原生窗口采集 + 本地视觉模型”链路。早期 DSH 插件和抖音元数据读取实验不包含在运行依赖中。

## 感谢与来源

这份原型站在开源社区的成果上。特别感谢 **PC2005-cloud/dsh-pet** 提供完整桌宠基础，让我们可以把精力放在陪看交互上；也感谢以下项目的作者和维护者：

| 项目 | 本项目采用或参考的内容 |
| --- | --- |
| [PC2005-cloud/dsh-pet](https://github.com/PC2005-cloud/dsh-pet) | 核心桌宠运行时、透明动画、拖拽交互、气泡接口。我们以安装补丁加入拖放启动、暂停和关闭联动。 |
| [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) | 早期插件集成与模块组合的生态基础；当前实时陪看可使用 dsh-pet 独立模式，不要求 DSH 宿主运行。 |
| [kdcadmin/dsh_douyin_tools](https://github.com/kdcadmin/dsh_douyin_tools) | 早期只读视频详情和 MCP 链路验证的参考及复用来源；当前发布版本不启用其账号操作或自动互动功能。 |
| [Electron](https://github.com/electron/electron) | 桌面窗口、选定窗口采集、托盘及主进程/渲染进程通信。 |
| [Ollama](https://github.com/ollama/ollama) | 本地模型管理、GPU 推理和 HTTP 接口。 |
| [Qwen3-VL](https://github.com/QwenLM/Qwen3-VL) | 本地视觉理解模型。 |
| [Koffi](https://koffi.dev/) | 调用 Windows 窗口层级、鼠标位置和窗口边界接口。 |

也感谢上游说明中列出的形象创作者：原型“溟月”来自 B 站 [@上善无形](https://space.bilibili.com/4456176)，DeepSeek 女仆鲸鱼娘设计来自 [@ZipZipPipe](https://space.bilibili.com/4168597)。这不是 DeepSeek 官方产品，也不代表上述项目或平台的背书。

## 许可

本仓库原创代码以 [MIT](LICENSE) 发布；上游代码及组件保留各自许可，见 [第三方说明](THIRD_PARTY_NOTICES.md)。**MIT 不覆盖桌宠角色和动画素材。** 本仓库不重新打包这些素材，安装时从上游 npm 包获取。

[dsh-pet 上游说明](https://github.com/PC2005-cloud/dsh-pet#许可)将动画、提示词和源视频标为非商业使用，角色形象采用 **CC BY-NC-SA 4.0**。使用该角色和素材时请遵守上游的署名、非商业和相同方式共享等要求；不得因为本仓库原创代码使用 MIT，就把整套角色素材视为可商用。
