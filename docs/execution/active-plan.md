# 当前执行计划

计划 ID：`v1.0.0-release`

状态：**release/v1.0.0 实现与发布准备中**

最后更新：2026-08-02

负责人角色：产品负责人、技术负责人、反方评审（Codex）；最终拍板人：仓库负责人

## 当前授权

负责人已授权从 Alpha 0.2 推进到可供普通 Windows 新手使用的 v1.0.0：允许在本分支实现剩余 P0、加入经过审查的生产依赖与 Tauri 插件、构建安装包、创建 PR、合并 `main`、打标签和创建 GitHub Release。未签名构建不得作为正式版本发布。[D-032、E-021]

负责人同时再次确认 M2 Wave 0 研究授权，但该研究授权不扩大本分支的发布边界：新增研究代码、虚构夹具和研究报告必须放在 `codex/m2-*` 独立分支，不创建 PR、不合并 `main`、不创建 Release。[D-033、E-023]

产品范围仍是 Windows 10/11 x64 → Apple 芯片 macOS 15/26 的“习惯与环境迁移”，不搬运个人文件、浏览器数据、账号、Token、SSH 私钥、项目代码或聊天记录。默认本地离线、无账号、无聊天、无常驻；版本检查只上传应用版本、平台和架构。

## 已收口的历史阶段

- M0 文档基线、M1 可点击原型与 `.habitpack` 1.0.0 规范已完成。
- Alpha 0.1/0.2 已在独立分支完成白名单扫描、包导入导出、强制计划、Finder 扩展名、键盘重复速度、选择性 Ctrl、Karabiner 非破坏合并、快照、报告、指南、恢复和本地自检。
- Alpha 0.2 历史执行计划已归档至 `docs/execution/history/alpha-0.2-active-plan.md`；该文件只作历史证据，不是当前授权。

## 本阶段顺序

1. 治理修复已完成：`AGENTS.md`、`feature-list.json`、决策/证据引用和执行恢复点已切到 v1。
2. P0-008 已实现原生全局路径、独立方向明示降级、恢复和指针包测试；仍需真实外设重连矩阵与 LinearMouse 官方界面验证。
3. P0-009/P0-010 已扩展 Windows 白名单、官方入口和声明式开发模块；可信自动安装、签名/哈希和 Homebrew 独立确认仍由 OD-007 决定，当前只提供可审查的官方入口。
4. P0-011 的官方接口边界已完成研究并记录在 E-022；真实 Wi‑Fi 密码链路继续停在 OD-005，不改用不安全接口。
5. P0-013 已加入本地 HTML/脱敏 JSON 报告；P0-014 已加入本地错误日志、GitHub 入口、updater 依赖和签名 Release 草稿，公钥注入仍只在正式发布工作流中进行。
6. 启用 Tauri bundle，完善 Windows x64/macOS arm64 安装、升级、卸载和 CI 草稿 Release；不把未签名包标为正式版。
7. RC 阶段只做一次完整代码审查、一次安全/隐私审查和一次端到端 UX 审查；修复 P0/P1 后运行一次完整测试矩阵，P2 记录 backlog。
8. 收集真实 Windows 10/11、macOS 15/26 设备证据，完成签名、公证、stapling、哈希、SBOM、发布说明后，走一次最终人类确认，再合并 `main`、打 `v1.0.0` 标签和发布。

## 当前下一动作

下一动作：做一次 RC 代码、隐私/安全和端到端 UX 审查，运行完整本地与双平台 CI 检查，并整理一次性人类门槛清单。OD-005/OD-007 未关闭前不新增真实 Wi‑Fi 密码或自动安装实现；需要真实设备、系统弹窗或签名凭据的事项集中等待负责人。

## 阻塞项与门槛

- 当前没有代码阻塞；OD-001、OD-002、OD-003、OD-005、OD-006、OD-007、OD-009、OD-010、OD-011 仍需在对应生产行为定稿前关闭。
- Apple/Windows 签名凭据、真实四平台设备、UAC/TCC/Karabiner 权限弹窗和公开 Release 最终确认只能由负责人完成；不得伪造或绕过。
- 主控可见可用额度低于 20% 时停止派发新任务并保留 Goal，不把暂停写成完成或阻塞。当前工具未提供剩余百分比，因此继续执行不受影响的已授权工作，不将其推断为已触发门禁。[D-030、D-033、E-019、E-023]

## 验证命令

```bash
./scripts/validate-m1
npm test
npm run build
cargo test --locked --manifest-path src-tauri/Cargo.toml
cargo clippy --locked --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
npm run tauri build
```
