# Alpha 0.1 验证记录

状态：`alpha/v0.1-vertical-slice` 本地纵向切片；未签名、未公证、不是公开 Release。[D-030、E-019]

## 已验证

- Windows → Mac 的两端流程：白名单扫描、用户选择、`.habitpack` 导出、Mac 导入、强制计划确认、应用、报告、指南和恢复。
- `.habitpack` 1.0.0：手写严格 ZIP 读取器、路径/大小/哈希/JSON/规则白名单拒绝，生成包可被 Rust parser 和仓库 M1 Python validator 读取。
- Windows 适配器：Windows 10/11 x64 版本、默认浏览器白名单、卸载项白名单、键盘布局与重复速率读取；普通扫描不主动提权。
- macOS 适配器：固定系统工具读取版本和固定 `defaults` 键；Finder 扩展名、键盘重复速率在写入后重新读取验证。
- 快照与恢复：应用前保存一份快照；快照有完整性校验，支持按模块恢复；模拟适配器覆盖单模块失败隔离。
- UI：强制计划门禁、明亮中文优先布局、虚构浏览器预览、自动化状态守卫和本地流程走查。

## 未验证或明确未实现

- 尚未在真实 Windows 设备运行扫描，也尚未在 Apple 芯片 macOS 15/26 真实设备执行设置写入；当前本机只完成 macOS 构建和跨目标代码路径准备。
- 不包含 Wi‑Fi/密码、Ctrl/Command 兼容层、第三方工具或 Homebrew 安装、软件自动安装、UAC/TCC、真实秘密、个人文件、更新、签名/公证或 Release。
- 浏览器/软件只做白名单检测和官方入口提示，不读取历史、书签、密码、Cookie、登录状态或应用数据。
- 未验证 Apple 未来版本、Intel Mac、Windows ARM、企业策略、复杂权限拒绝或硬件外设差异。

## 可重复检查

```bash
npm test
npm run build
cargo test --manifest-path src-tauri/Cargo.toml --locked
cargo clippy --manifest-path src-tauri/Cargo.toml --locked --all-targets -- -D warnings
npm run tauri build -- --no-bundle
./scripts/validate-m1
```

Alpha 只供明确知情的测试者使用。它不会常驻、自启动、上传扫描数据，也不会执行迁移包中的命令或脚本。
