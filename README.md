# MacWin

把 Windows 使用习惯带到 Mac。

MacWin 是一个面向 Windows 迁移用户的本地桌面工具。它计划读取经过用户允许的 Windows 使用习惯，生成 `.habitpack` 迁移包，并在 Apple 芯片 Mac 上把这些习惯转换为安全、可解释、可回滚的配置。

> 当前状态：**Alpha 0.1 纵向切片**。本分支用于明确知情的本地测试，验证真实 Windows 扫描、`.habitpack`、Mac 计划、两项声明式设置和恢复；不等于签名发布。[D-030、E-019]

## 第一版范围

- 来源：Windows 10/11 x64
- 目标：Apple 芯片 Mac，macOS 15/26
- 迁移：白名单键盘重复习惯、浏览器/软件白名单检测、Finder 扩展名偏好、个性化使用指南
- 不迁移：个人文件、浏览器历史/密码/Cookie、账号会话、完整系统、企业受管理配置
- Alpha 暂不实现：Wi‑Fi/密码、Ctrl/Command 兼容层、第三方工具或 Homebrew 安装、软件自动安装、UAC/TCC、真实秘密
- 运行原则：核心能力本地、离线、无账号、无大模型

## Alpha 运行

### 开发依赖

- Node.js 20 或更高版本
- Rust stable、Cargo
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

Windows 端在扫描页使用普通权限读取白名单注册表、键盘布局和重复速率；导出包后将 `.habitpack` 以用户自选方式带到 Mac。Mac 端导入后必须先确认计划，才会按固定规则写入 Finder 扩展名和键盘重复速率。任何模块失败都单独记录，恢复使用迁移前的一份快照。

Alpha 明确不会执行迁移包中的命令、脚本或路径；不会上传扫描数据。软件条目只提供匹配和官方入口提示，不自动下载或安装。

## 文档入口

- [产品简报](docs/product/brief.md)
- [证据目录](docs/product/evidence.md)
- [决策记录](docs/product/decisions.md)
- [产品规格索引](docs/product/specs/README.md)
- [可验证功能清单](docs/execution/feature-list.json)
- [当前执行计划](docs/execution/active-plan.md)
- [冻结原型结论](docs/product/prototype-conclusions.md)
- [Alpha 0.1 验证记录](docs/product/alpha-0.1-validation.md)
- [仓库协作规则](AGENTS.md)
- [安全政策](SECURITY.md)

## 当前里程碑

交互原型已冻结在独立分支 `prototype/ui-flow-v2-hardening` 的提交 `37edc4edd52f2d0fb5aa7d796faa5fd7437bbb75`；`.habitpack` 的 M1 `1.0.0` 严格验证档案已完成。当前 Alpha 实现在 `alpha/v0.1-vertical-slice`，不得合入 `main`、创建 Release 或被当作签名产品。[D-028、D-030、E-019]

M1 格式资产使用精确的 `1.0.0` 验证档案。开发者可运行 `./scripts/validate-m1` 校验 schema、虚构夹具、仓库 JSON、文档引用、依赖图和 Alpha 授权边界；首次运行需要联网安装锁定的开发验证依赖。这不是产品运行命令或公开兼容性承诺。

## 名称

MacWin 的灵感来自 “I have a Mac, I have a Win … MacWin!”。幽默只用于品牌传播；涉及权限、密码、恢复和错误的界面必须保持严肃、明确。

## 非官方声明

MacWin 不是 Apple Inc. 或 Microsoft Corporation 的官方产品，也不受其赞助或认可。Windows、macOS 及其他产品名称归各自权利人所有。

## License

[MIT](LICENSE)
