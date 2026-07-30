# MacWin

把 Windows 使用习惯带到 Mac。

MacWin 是一个面向 Windows 迁移用户的本地桌面工具。它计划读取经过用户允许的 Windows 使用习惯，生成 `.habitpack` 迁移包，并在 Apple 芯片 Mac 上把这些习惯转换为安全、可解释、可回滚的配置。

> 当前状态：**M1 原型与格式规范阶段**。此分支包含可丢弃的浏览器交互原型；它不含任何真实系统配置代码，请不要把演示流程理解为已经实现的迁移能力。

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

当前里程碑交付完整可点击流程原型和闭合的 `.habitpack` 格式规范。原型位于独立的 `prototype/ui-flow-v1` 分支，只使用虚构数据，不扫描、不提权、不联网、不修改系统，也不会直接合入正式实现。生产应用、真实平台适配和安装包仍未开始。

## M1 可点击交互原型（仅此分支）

入口为 [index.html](index.html)，代码位于 [prototype-ui-flow](prototype-ui-flow)。这是可丢弃的纯前端演示：状态只存在浏览器内存中，刷新会回到该场景默认虚构状态；没有后端、账号、遥测、外部 API、原生桥接、Shell/PowerShell 或真实系统读写。

从干净检出开始：

```bash
npm ci
npm run dev
```

打开终端显示的 `http://127.0.0.1:5173`。底部工具栏可切换完整场景、问卷密度、计划展开方式和减少动态效果；也可使用 `?scenario=offline` 等 URL 参数。场景包括正常完成、UAC 被拒绝、Mac 权限被拒绝、无网待重试、单模块失败、第三方工具被拒绝、需要手动完成、恢复演示，以及损坏/不兼容包阻断。

验证命令：

```bash
npm test
npm run build
```

自动化测试验证强制计划确认、损坏包阻断、权限拒绝隔离及异常状态不能被报告为全成功。浏览器原型没有生成真实 `.habitpack`、读取真实设备，或安装任何软件。原型结论见 [docs/product/prototype-conclusions.md](docs/product/prototype-conclusions.md)。

## 名称

MacWin 的灵感来自 “I have a Mac, I have a Win … MacWin!”。幽默只用于品牌传播；涉及权限、密码、恢复和错误的界面必须保持严肃、明确。

## 非官方声明

MacWin 不是 Apple Inc. 或 Microsoft Corporation 的官方产品，也不受其赞助或认可。Windows、macOS 及其他产品名称归各自权利人所有。

## License

[MIT](LICENSE)
