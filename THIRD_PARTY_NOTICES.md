# 第三方来源与许可

本仓库原创的陪看控制器、启动脚本和补丁逻辑采用根目录 MIT 许可。下列组件不是本仓库作者的原创成果，相关版权和许可继续有效。

## dsh-pet

- 作者 / 项目：https://github.com/PC2005-cloud/dsh-pet
- 已验证 npm 版本：0.3.8
- 开发时参考的源码快照：071af6a9ac59af0fe50a4931ae72fe4771d62dee
- 上游代码版权：Copyright (c) 2026 PC2005-cloud，MIT；完整文本见 [third-party/dsh-pet-MIT.txt](third-party/dsh-pet-MIT.txt)。
- `scripts/apply-close-button.mjs`、`scripts/apply-drag-start.mjs` 和 `scripts/apply-region-roaming.mjs` 会对安装后的上游文件作局部修改。补丁包含与原有坐标、拖拽、区域漫游和进程生命周期接口衔接的适配，不能视为重新取得整个上游项目的版权。
- 上游资产没有复制进本仓库。其动画、提示词及源视频有独立的非商业约定；角色来源和 CC BY-NC-SA 4.0 说明请参阅上游 README。

## dsh_douyin_tools 与 DeepSeek Harness

早期本机原型使用过 https://github.com/kdcadmin/dsh_douyin_tools 的只读视频详情和 MCP 客户端，以及 https://github.com/deepseek-ai/deepseek-harness 的插件宿主。这些阶段促成了本项目，不应遗漏其贡献。当前发布代码使用原生窗口采集，不包含它们的运行代码、账号工具或登录数据。

保留早期复用来源的 MIT 说明：[third-party/dsh_douyin_tools-MIT.txt](third-party/dsh_douyin_tools-MIT.txt)，Copyright (c) 2026 TiAmoSS。参考快照 aaf9f9a862afafd45a15acf32789da97688de695。

## 其他组件

- Electron：https://github.com/electron/electron，遵循其 MIT 许可及分发包附带的第三方声明；由 dsh-pet 的运行时准备工具下载。
- Ollama：https://github.com/ollama/ollama，独立安装的本地推理服务，许可见其官方仓库。
- Qwen3-VL：https://github.com/QwenLM/Qwen3-VL，使用模型 `qwen3-vl:2b-instruct-q4_K_M`；模型权重不在本仓库中，许可见官方模型说明。
- Koffi：https://koffi.dev/，npm 版本 3.3.6，MIT。完整文本见 [third-party/koffi-MIT.txt](third-party/koffi-MIT.txt)。

安装时获取的 npm 依赖仍保留各自的版权和许可；根目录 LICENSE 不替代这些文件。
