# 当前执行计划

计划 ID：`v1.0.1-final-convergence`

状态：**integration/v1.0.1-final-convergence rc.2 收口中**

最后更新：2026-08-06

负责人角色：产品负责人、技术负责人、反方评审（Codex）；最终拍板人：仓库负责人

## 当前授权

负责人已授权从 `origin/release/v1.0.1` 创建 `integration/v1.0.1-final-convergence`，按 Mac `6553386`、Windows `0f4ec31` 顺序合流，对齐 `1.0.1-rc.2` 应用版本，运行真实 Windows x64 NSIS 与 Apple Silicon macOS DMG 的 Actions 打包，并创建未签名 `v1.0.1-rc.2` Pre-release。未授权签名、公证、正式 `v1.0.1` Release、合并 `main` 或绕过系统安全提示。[D-040、D-042]

负责人同时再次确认 M2 Wave 0 研究授权，但该研究授权不扩大本分支的发布边界：新增研究代码、虚构夹具和研究报告必须放在 `codex/m2-*` 独立分支，不创建 PR、不合并 `main`、不创建 Release。[D-033、E-023]

本分支的额外授权来自负责人提供的真实 Apple 芯片 Mac 与 `/Users/makerzhu/Desktop/windows-habits.habitpack` 回归包：只验证并修复 v1.0.1 的本地 Tauri 导入、计划确认、声明式安全设置、原生内置键盘映射、报告与恢复闭环。允许在确认计划后执行已实现且可验证的 Finder、键盘重复速度、内置键盘 Control ↔ Command 和原生滚动方向设置；不安装或写入第三方键位工具。不得修改原始迁移包、正式 Release、`main` 或 `release/v1.0.1`。

产品范围仍是 Windows 10/11 x64 → Apple 芯片 macOS 15/26 的“习惯与环境迁移”，不搬运个人文件、浏览器数据、账号、Token、SSH 私钥、项目代码或聊天记录。默认本地离线、无账号、无聊天、无常驻；版本检查只上传应用版本、平台和架构。

## 已收口的历史阶段

- M0 文档基线、M1 可点击原型与 `.habitpack` 1.0.0 规范已完成。
- Alpha 0.1/0.2 是历史证据；当前 rc.2 不再依赖其第三方键位规则实现，改用 D-041 的 macOS 原生内置键盘映射。
- Alpha 0.2 历史执行计划已归档至 `docs/execution/history/alpha-0.2-active-plan.md`；该文件只作历史证据，不是当前授权。

## 本阶段顺序

1. 治理修复已完成：`AGENTS.md`、`feature-list.json`、决策/证据引用和执行恢复点已切到 v1。
2. P0-008 已实现原生全局路径、独立方向明示降级、恢复和指针包测试；仍需真实外设重连矩阵与 LinearMouse 官方界面验证。
3. P0-009/P0-010 已按 D-034 收窄并统一 Windows 首批白名单、官方入口和声明式开发模块；Mac 计划现在只在用户确认的软件项上生成 `manual_action_required` 结果，不伪报已安装。可信自动安装、签名/哈希和 Homebrew 独立确认仍由 OD-007 决定，当前只提供可审查的官方入口。
4. P0-011 的官方接口边界已完成研究并记录在 E-022；真实 Wi‑Fi 密码链路继续停在 OD-005，不改用不安全接口。
5. P0-013 已加入本地 HTML/脱敏 JSON 报告；P0-014 已加入本地错误日志、GitHub 入口、updater 依赖和签名 Release 草稿，公钥注入仍只在正式发布工作流中进行。
6. 启用 Tauri bundle，完善 Windows x64/macOS arm64 安装、升级、卸载和 CI 草稿 Release；Release workflow 的 build/publish job 会检出输入 tag，`scripts/prepare-release.py` 会在正式标签构建前校验并同步 Tauri/npm 版本，`scripts/build-release-manifest.py` 会对 updater 产物做确定性选择，`scripts/validate-release-assets.py` 会在发布前校验双平台安装包、哈希、SBOM、签名文本和 manifest 一致性，`scripts/stage-release-assets.py` 会展平公开资产并生成总 SHA-256，手动 tag 输入也会用于 macOS DMG 的生成和公证路径；不把未签名包标为正式版。
7. RC 阶段的一次完整代码审查、安全/隐私审查和端到端 UX 审查已完成；报告双格式入口、快照完整性错误态、开发工具白名单和取消模块/恢复边界已修复。完整本地测试矩阵与双平台 CI 均已通过，P2 留在 backlog。
8. 在本分支完成版本/文档/CI 对齐，推送后等待 `v1-ci` 与 `unsigned-rc`；仅在两个包、提交一致性、哈希和 Pre-release 资产核验通过后记录证据。真实设备、签名、公证和正式 v1.0.1 发布继续留给后续人类门槛。
9. 本分支修复 Tauri v2 命令参数合约（`confirm_plan` 外层 DTO、`apply_plan`/`rollback_module` 顶层 camelCase）、统一原生桥接和稳定错误码；真实 `.habitpack` 已完成导入、计划确认、应用、报告、单模块恢复和全部恢复走查。rc.2 还要求 native modifier mapping 的读写验证和旧快照兼容，不改变正式发布门槛。

## 当前下一动作

下一动作：提交并推送 `integration/v1.0.1-final-convergence`，等待双平台 CI 与 unsigned rc.2 workflow，核对同一提交、Windows x64 NSIS、Apple Silicon DMG、SHA-256 和 Pre-release 资产；不合并 `main`、不创建正式 `v1.0.1`。OD-005/OD-007 未关闭前不新增真实 Wi‑Fi 密码或自动安装实现。

## 阻塞项与门槛

- 当前没有代码阻塞；OD-002、OD-005、OD-006、OD-007 仍需在对应生产行为定稿前关闭；OD-001/OD-009/OD-010/OD-011 已分别由 D-037/D-035/D-036/D-038 关闭，首批软件目录 OD-003 已由 D-034 关闭，后续扩展需另行决策。
- Apple/Windows 签名凭据、真实四平台设备、UAC/TCC 系统授权弹窗和公开 Release 最终确认只能由负责人完成；不得伪造或绕过。
- 主控可见可用额度低于 20% 时停止派发新任务并保留 Goal，不把暂停写成完成或阻塞。当前工具未提供剩余百分比，因此继续执行不受影响的已授权工作，不将其推断为已触发门禁。[D-030、D-033、E-019、E-023]

## 验证命令

```bash
./scripts/validate-m1
npm test
npm run build
cargo test --locked --manifest-path src-tauri/Cargo.toml
cargo clippy --locked --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
MACWIN_REAL_HABITPACK=/Users/makerzhu/Desktop/windows-habits.habitpack cargo test --locked --manifest-path src-tauri/Cargo.toml user_provided_external -- --ignored
PATH="/Users/makerzhu/.cargo/bin:$PATH" npm run tauri build -- --bundles app,dmg --config src-tauri/tauri.unsigned.conf.json
```
