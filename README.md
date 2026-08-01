# MacWin

把 Windows 使用习惯带到 Mac。

MacWin 是一个面向 Windows 迁移用户的本地桌面工具。它计划读取经过用户允许的 Windows 使用习惯，生成 `.habitpack` 迁移包，并在 Apple 芯片 Mac 上把这些习惯转换为安全、可解释、可回滚的配置。

> 当前状态：**M2 Wave 0 研究已局部授权**。第二版原型只验证虚构浏览器交互，格式资产只验证 schema、容器和虚构夹具；Wave 0 仍只允许隔离研究，仓库没有可运行产品或系统配置代码。[D-029、E-018]

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

交互原型已冻结在独立分支 `prototype/ui-flow-v2-hardening` 的提交 `37edc4edd52f2d0fb5aa7d796faa5fd7437bbb75`，只使用虚构数据且不会合入 `main`。`.habitpack` 的 M1 `1.0.0` 严格验证档案也已完成。当前仅授权 M2 Wave 0 的隔离研究分支、虚构夹具、官方文档阅读和锁定开发验证依赖；生产应用、真实平台 R2、真实设备、Alpha 和 Release 均未获授权。[D-028、D-029、E-018]

M1 格式资产使用精确的 `1.0.0` 验证档案。开发者可运行 `./scripts/validate-m1` 校验 M1 schema、临时生成的虚构夹具、仓库 JSON、文档引用、依赖图和当前 Wave 0 治理边界；首次运行需要联网安装锁定的开发验证依赖。这不是产品运行命令或公开兼容性承诺。

## 名称

MacWin 的灵感来自 “I have a Mac, I have a Win … MacWin!”。幽默只用于品牌传播；涉及权限、密码、恢复和错误的界面必须保持严肃、明确。

## 非官方声明

MacWin 不是 Apple Inc. 或 Microsoft Corporation 的官方产品，也不受其赞助或认可。Windows、macOS 及其他产品名称归各自权利人所有。

## License

[MIT](LICENSE)
