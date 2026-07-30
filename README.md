# MacWin

把 Windows 使用习惯带到 Mac。

MacWin 是一个面向 Windows 迁移用户的本地桌面工具。它计划读取经过用户允许的 Windows 使用习惯，生成 `.habitpack` 迁移包，并在 Apple 芯片 Mac 上把这些习惯转换为安全、可解释、可回滚的配置。

> 当前状态：**M1 格式规范收口中**。第二版可点击原型已经冻结并获接受，但它只验证虚构浏览器交互；仓库仍没有可运行产品或系统配置代码。

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
- [冻结原型结论](docs/product/prototype-conclusions.md)
- [仓库协作规则](AGENTS.md)
- [安全政策](SECURITY.md)

## 当前里程碑

交互原型已冻结在独立分支 `prototype/ui-flow-v2-hardening` 的提交 `37edc4edd52f2d0fb5aa7d796faa5fd7437bbb75`，只使用虚构数据且不会合入 `main`。当前正在闭合 `.habitpack` 格式规范；M2、生产应用、真实平台适配和安装包均未获授权。[D-028]

## 名称

MacWin 的灵感来自 “I have a Mac, I have a Win … MacWin!”。幽默只用于品牌传播；涉及权限、密码、恢复和错误的界面必须保持严肃、明确。

## 非官方声明

MacWin 不是 Apple Inc. 或 Microsoft Corporation 的官方产品，也不受其赞助或认可。Windows、macOS 及其他产品名称归各自权利人所有。

## License

[MIT](LICENSE)
