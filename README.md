# MacWin

把 Windows 使用习惯带到 Mac。

MacWin 是一个面向 Windows 迁移用户的本地桌面工具。它计划读取经过用户允许的 Windows 使用习惯，生成 `.habitpack` 迁移包，并在 Apple 芯片 Mac 上把这些习惯转换为安全、可解释、可回滚的配置。

> 当前状态：**v1.0.0 release 分支开发中**。本分支正在把 Alpha 0.2 的真实 Mac 闭环推进为可签名、可验证的 Windows → Mac 产品；当前构建仍不是面向普通用户的正式发布，签名、公证和真实四设备矩阵尚未完成。[D-032、E-021]

## 第一版范围

- 来源：Windows 10/11 x64
- 目标：Apple 芯片 Mac，macOS 15/26
- 迁移：白名单键盘重复习惯、选择性 Ctrl、鼠标/触控板滚动方向、浏览器与开发软件白名单检测、Finder 扩展名偏好、个性化使用指南
- 不迁移：个人文件、浏览器历史/密码/Cookie、账号会话、完整系统、企业受管理配置
- 尚在验证或需要发布门槛：Wi‑Fi 密码安全链路、可信软件自动安装、第三方工具授权、签名更新、公证和正式 Release
- 明确不做：全局 Ctrl/Command 交换、个人文件、浏览器历史/密码/Cookie、账号会话、项目代码和任何迁移包内命令
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

本设计分支的浏览器视觉走查入口：

```text
http://127.0.0.1:4173/?platform=windows&scenario=normal
http://127.0.0.1:4173/?platform=macos&scenario=normal
```

开发预览还可用 `scenario=uac-denied`、`permission-denied`、`offline`、`third-party-declined`、`module-failed` 和 `corrupt-package` 复现异常路径。它们只使用虚构数据，不读取或修改真实系统；本分支的视觉结论记录在 [`docs/product/visual-system-v2.md`](docs/product/visual-system-v2.md)。

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

Windows 端在扫描页使用普通权限读取白名单注册表、键盘布局、重复速率和滚动习惯；导出包后将 `.habitpack` 以用户自选方式带到 Mac。Mac 端导入后必须先确认计划，后端令牌会锁定用户勾选的模块，才会按固定规则写入 Finder 扩展名、键盘重复速率、选择性 Ctrl 和可安全支持的滚动方向。Karabiner-Elements 与 LinearMouse 不由 MacWin 静默安装；缺失或授权未就绪时降级为官方入口。任何模块失败都单独记录，恢复使用迁移前的一份快照。

MacWin 明确不会执行迁移包中的命令、脚本或路径；不会上传扫描数据。软件条目只接受固定白名单和官方入口，无法在当前版本完成签名/哈希验证的安装会明确降级为手动入口。报告可在本地导出 HTML 或脱敏 JSON。

## 普通用户使用（正式 Release 后）

正式版本发布后，唯一下载入口是 [GitHub Releases](https://github.com/aswansong/macwin/releases/latest)。请只下载标记为 Windows x64 的签名安装包，或 Apple Silicon 的已签名、公证 DMG；当前 `release/v1.0.0` 仍未达到正式发布门槛，因此这里暂不提供可供新手使用的安装包。

1. 在 Windows 上安装 MacWin，点击“开始检测”，确认要带走的项目后保存 `.habitpack`。迁移包只用 U 盘或你信任的本地方式带到 Mac，不会自动上传。
2. 在 Apple 芯片 Mac 上安装 MacWin，点击“导入迁移包”。逐项查看迁移计划；在确认之前不会修改系统。确认后，MacWin 保存一份迁移前快照并逐项验证结果。
3. 在完成页查看变更报告和个性化指南。软件只提供官方入口时，请按页面提示手动安装；这类项目会标为“需要手动完成”，不会伪报成功。
4. 若要恢复，在结果页选择“恢复一个设置”或“全部恢复”。恢复针对迁移前快照，不是恢复出厂设置。
5. 卸载 MacWin 不会删除应用包外的迁移前快照。确认以后不再需要恢复时，可在“设备自检”中明确删除快照；删除前会再次确认，删除后无法自动恢复。

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

交互原型已冻结在独立分支 `prototype/ui-flow-v2-hardening`；当前生产推进分支为 `release/v1.0.0`，起点为 Alpha 0.2 提交 `26bd7fbc4a74ecfc8999e638c7e179068de00f59`。在签名、公证、真实设备矩阵和负责人最终确认完成前，不得把本分支构建称为正式 Release。[D-032、E-021]

M1 格式资产使用精确的 `1.0.0` 验证档案。开发者可运行 `./scripts/validate-m1` 校验 schema、虚构夹具、仓库 JSON、文档引用、依赖图和当前 v1 授权边界；首次运行需要联网安装锁定的开发验证依赖。这不是产品运行命令或公开兼容性承诺。

## 名称

MacWin 的灵感来自 “I have a Mac, I have a Win … MacWin!”。幽默只用于品牌传播；涉及权限、密码、恢复和错误的界面必须保持严肃、明确。

## 非官方声明

MacWin 不是 Apple Inc. 或 Microsoft Corporation 的官方产品，也不受其赞助或认可。Windows、macOS 及其他产品名称归各自权利人所有。

## License

[MIT](LICENSE)
