# MacWin

把 Windows 使用习惯带到 Mac。

MacWin 是一个面向 Windows 迁移用户的本地桌面工具。它计划读取经过用户允许的 Windows 使用习惯，生成 `.habitpack` 迁移包，并在 Apple 芯片 Mac 上把这些习惯转换为安全、可解释、可回滚的配置。

> 当前状态：**MacWin v1.0.1 公开版（未签名）**。它允许公众下载，但不是 Windows Authenticode 签名、Apple Developer ID 签名或公证版本；Windows SmartScreen 或 macOS Gatekeeper 可能阻止启动。遇到阻止请停止并阅读提示，不要关闭或绕过系统安全策略。[D-043、E-057]

MacWin 的第一版只迁移习惯与环境，不搬运个人文件。公开版的唯一下载入口是 [GitHub Releases](https://github.com/aswansong/macwin/releases/latest)，发布页同时提供 SHA256 校验、构建来源和安装前说明。

**Windows → Mac 三步：**

1. 在 Windows 10/11 x64 扫描并勾选要迁移的项目，导出 `.habitpack`。
2. 把迁移包用 U 盘或你信任的本地方式带到 Apple 芯片 Mac，导入并预览计划。
3. 确认计划后执行；完成页会说明改了什么，并可按模块恢复迁移前快照。

## 第一版范围

- 来源：Windows 10/11 x64
- 目标：Apple 芯片 Mac，macOS 15/26
- 迁移：白名单键盘重复习惯、MacBook 内置键盘 Control ↔ Command、鼠标/触控板滚动方向、浏览器与开发软件白名单检测、Finder 扩展名偏好、个性化使用指南
- 不迁移：个人文件、浏览器历史/密码/Cookie、账号会话、完整系统、企业受管理配置
- 尚未完成：Wi‑Fi 密码安全链路、可信软件自动安装、第三方工具授权、签名更新、公证和四设备真实矩阵
- 明确不做：外接键盘全局改键或第三方重映射、个人文件、浏览器历史/密码/Cookie、账号会话、项目代码和任何迁移包内命令
- 运行原则：核心能力本地、离线、无账号、无大模型

## 开发运行

### 开发依赖

- Node.js 20 或更高版本
- Rust 1.97.1、Cargo（仓库通过 `rust-toolchain.toml` 固定）
- Windows：Windows 10/11 x64、MSVC 工具链和 WebView2
- macOS：Apple 芯片、macOS 15/26、Xcode Command Line Tools

### 启动与检查

```bash
npm install
npm run tauri dev
```

浏览器预览（只使用虚构数据，不调用系统桥）：

```bash
npm run dev -- --port 4173
```

本整合分支的浏览器视觉走查入口（仅 Vite 开发服务器；不调用系统桥）：

```text
http://127.0.0.1:4173/?platform=windows&scenario=normal
http://127.0.0.1:4173/?platform=macos&scenario=normal
```

开发预览还可用 `scenario=uac-denied`、`permission-denied`、`offline`、`third-party-declined`、`module-failed` 和 `corrupt-package` 复现异常路径；需要显示预览工具栏时再加 `preview=1`。它们只使用虚构数据，不读取或修改真实系统；v6 视觉结论记录在 [`docs/product/visual-fidelity-v6-qa.md`](docs/product/visual-fidelity-v6-qa.md)。进入真实 Tauri 应用后，所有扫描、导入、计划、应用、恢复和报告操作继续通过 Rust 命令执行。

自动化检查：

```bash
npm test
npm run build
cargo test --manifest-path src-tauri/Cargo.toml --locked
./scripts/validate-m1
```

本地非打包构建：

```bash
npm run tauri build -- --no-bundle
```

本地未签名 macOS App bundle（仅验证构建，不可作为正式分发）：

```bash
# 先确保 cargo 已在 PATH；此覆盖只关闭本地 updater 产物，不改变正式配置
npm run tauri build -- --bundles app --no-sign --config '{"bundle":{"createUpdaterArtifacts":false}}'
```

Windows 端在扫描页使用普通权限读取白名单注册表、键盘布局、重复速率和滚动习惯；导出包后将 `.habitpack` 以用户自选方式带到 Mac。Mac 端导入后必须先确认计划，后端令牌会锁定用户勾选的模块，才会按固定规则写入 Finder 扩展名、键盘重复速率、内置键盘原生 Control ↔ Command 映射和可安全支持的滚动方向。MacWin 不安装或写入第三方键位工具，只做只读冲突检查。任何模块失败都单独记录，恢复使用迁移前的一份快照。

MacWin 明确不会执行迁移包中的命令、脚本或路径；不会上传扫描数据。软件条目只接受固定白名单和官方入口，无法在当前版本完成签名/哈希验证的安装会明确降级为手动入口。报告可在本地导出 HTML 或脱敏 JSON。

## 普通用户使用（v1.0.1 公开版）

请从 [v1.0.1 GitHub Release](https://github.com/aswansong/macwin/releases/latest) 下载与电脑架构相符的安装包，并先阅读 `README-FIRST.md`。Windows 安装包和 Apple Silicon DMG 均为**未签名**；SmartScreen/Gatekeeper 可能阻止它们。系统阻止时请停止，不要按网上教程关闭 SmartScreen、Gatekeeper、SIP 或 TCC，MacWin 也不会提供这类绕过命令。

1. 在 Windows 上安装 MacWin，点击“开始检测”，确认要带走的项目后保存 `.habitpack`。迁移包只用 U 盘或你信任的本地方式带到 Mac，不会自动上传。
2. 在 Apple 芯片 Mac 上安装 MacWin，点击“导入迁移包”。逐项查看迁移计划；在确认之前不会修改系统。确认后，MacWin 保存一份迁移前快照并逐项验证结果。
3. 在完成页查看变更报告和个性化指南。软件只提供官方入口时，请按页面提示手动安装；这类项目会标为“需要手动完成”，不会伪报成功。
4. 若要恢复，在结果页选择“恢复一个设置”或“全部恢复”。恢复针对迁移前快照，不是恢复出厂设置。
5. 公开版未启用签名更新链，不会在启动时联网或自动替换应用；需要新版本时请回到 GitHub Releases 手动下载，并重新核对 `SHA256SUMS.txt`。
6. 卸载 MacWin 不会删除应用包外的迁移前快照。确认以后不再需要恢复时，可在“设备自检”中明确删除快照；删除前会再次确认，删除后无法自动恢复。

## 文档入口

- [产品简报](docs/product/brief.md)
- [证据目录](docs/product/evidence.md)
- [决策记录](docs/product/decisions.md)
- [产品规格索引](docs/product/specs/README.md)
- [可验证功能清单](docs/execution/feature-list.json)
- [当前执行计划](docs/execution/active-plan.md)
- [冻结原型结论](docs/product/prototype-conclusions.md)
- [Alpha 0.1 验证记录](docs/product/alpha-0.1-validation.md)
- [Alpha 0.2 验证记录](docs/product/alpha-0.2-validation.md)
- [v1 验证矩阵](docs/product/v1-validation.md)
- [真实设备验收手册](docs/execution/real-device-acceptance.md)
- [仓库协作规则](AGENTS.md)
- [安全政策](SECURITY.md)

## 当前里程碑

交互原型已冻结在独立分支 `prototype/ui-flow-v2-hardening`；v1.0.0 和 rc.2 的历史分支、标签与 Release 保留不改。当前公开版在 `release/v1.0.1-public` 收口，目标是通过 PR merge commit 合入 `main`，再由同一提交创建 `v1.0.1` 标签和公开 Release。[D-043、E-057]

公开版不代表可信签名正式版。Windows 签名、Apple Developer ID、公证、签名更新链和四设备真实验收属于后续阶段；在这些能力完成前，README、Release 和应用界面都必须保留未签名风险说明。

M1 格式资产使用精确的 `1.0.0` 验证档案。开发者可运行 `./scripts/validate-m1` 校验 schema、虚构夹具、仓库 JSON、文档引用、依赖图和当前 v1 授权边界；首次运行需要联网安装锁定的开发验证依赖。这不是产品运行命令或公开兼容性承诺。

## 名称

MacWin 的灵感来自 “I have a Mac, I have a Win … MacWin!”。幽默只用于品牌传播；涉及权限、密码、恢复和错误的界面必须保持严肃、明确。

## 非官方声明

MacWin 不是 Apple Inc. 或 Microsoft Corporation 的官方产品，也不受其赞助或认可。Windows、macOS 及其他产品名称归各自权利人所有。

问题反馈请提交到 [GitHub Issues](https://github.com/aswansong/macwin/issues)。请不要在 Issue、日志或截图中粘贴 Wi‑Fi 密码、迁移包、设备序列号、账号或个人路径。

## License

[MIT](LICENSE)
