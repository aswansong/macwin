# MacWin

把 Windows 使用习惯带到 Mac。

MacWin 是一个面向 Windows 迁移用户的本地桌面工具。它计划读取经过用户允许的 Windows 使用习惯，生成 `.habitpack` 迁移包，并在 Apple 芯片 Mac 上把这些习惯转换为安全、可解释、可回滚的配置。

> 当前状态：**产品文档阶段**。仓库尚未包含可运行应用、交互原型或系统配置代码，请不要把文档中的流程理解为已经实现。

## 第一版范围

- 来源：Windows 10/11 x64
- 目标：Apple 芯片 Mac，macOS 15/26
- 迁移：键盘与输入法、鼠标与触控板、软件环境、可选轻量 AI 开发环境、Wi‑Fi 配置、个性化使用指南
- 不迁移：个人文件、浏览器历史/密码/Cookie、账号会话、完整系统、企业受管理配置
- 运行原则：核心能力本地、离线、无账号、无大模型

## 文档入口

- [产品简报](docs/product/brief.md)
- [证据目录](docs/product/evidence.md)
- [决策记录](docs/product/decisions.md)
- [产品规格索引](docs/product/specs/README.md)
- [可验证功能清单](docs/execution/feature-list.json)
- [当前执行计划](docs/execution/active-plan.md)
- [仓库协作规则](AGENTS.md)
- [安全政策](SECURITY.md)

## 当前里程碑

当前里程碑只建立可追溯的产品规格和执行边界，不开始应用开发。后续若经负责人明确授权，将在独立的 `prototype/ui-flow-v1` 分支制作不修改真实系统的可丢弃交互原型。

## 名称

MacWin 的灵感来自 “I have a Mac, I have a Win … MacWin!”。幽默只用于品牌传播；涉及权限、密码、恢复和错误的界面必须保持严肃、明确。

## 非官方声明

MacWin 不是 Apple Inc. 或 Microsoft Corporation 的官方产品，也不受其赞助或认可。Windows、macOS 及其他产品名称归各自权利人所有。

## License

[MIT](LICENSE)
