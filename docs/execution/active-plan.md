# 当前执行计划

计划 ID：`v1.0.1-public-release`

状态：**release/v1.0.1-public 公开版准备中**

最后更新：2026-08-06

负责人角色：产品负责人、技术负责人、反方评审（Codex）；最终拍板人：仓库负责人

## 当前授权

负责人已授权在 `release/v1.0.1-public` 将已验证 rc.2 通过新 PR 以 merge commit 收入 `main`，把应用版本冻结为 `1.0.1`，在精确 main HEAD 创建不可移动的 annotated tag `v1.0.1`，并发布非草稿、非 Pre-release、Latest 的 `MacWin v1.0.1 公开版（未签名）`。本阶段不做 Windows 签名、Apple Developer ID、公证、stapling 或自动更新签名；不绕过 SmartScreen/Gatekeeper。[D-043、E-057]

负责人同时再次确认 M2 Wave 0 研究授权，但该研究授权不扩大本分支的发布边界：新增研究代码、虚构夹具和研究报告必须放在 `codex/m2-*` 独立分支，不创建 PR、不合并 `main`、不创建 Release。[D-033、E-023]

本阶段继续使用既有真实 Apple 芯片 Mac 与回归包证据做核心烟测；允许执行已实现且可验证的 Finder、键盘重复速度、内置键盘 Control ↔ Command 和原生滚动方向设置。不安装或写入第三方键位工具，不修改原始迁移包或 rc.2 历史资产。[D-043、E-053]

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
6. 启用 Tauri bundle，完善 Windows x64/macOS arm64 安装包、dry-run 和公开 tag workflow；公开 workflow 精确检出 tag、运行双平台测试/Clippy/M1/release 测试，生成 `SHA256SUMS.txt`、`BUILD-INFO.json`、`README-FIRST.md`，不生成 `latest.json` 或未签名 updater。签名 workflow 保留凭据门但仅手动触发。
7. RC 阶段的一次完整代码审查、安全/隐私审查和端到端 UX 审查已完成；报告双格式入口、快照完整性错误态、开发工具白名单和取消模块/恢复边界已修复。完整本地测试矩阵与双平台 CI 均已通过，P2 留在 backlog。
8. 在本分支完成版本/文档/CI 对齐，先运行公开 workflow dry-run 并下载核验两平台资产；通过新 PR 合并 main 后再创建不可移动 `v1.0.1` 标签和公开 Release。真实设备烟测需记录，可信签名、公证和自动更新继续留在后续版本门槛。
9. 本分支修复 Tauri v2 命令参数合约（`confirm_plan` 外层 DTO、`apply_plan`/`rollback_module` 顶层 camelCase）、统一原生桥接和稳定错误码；真实 `.habitpack` 已完成导入、计划确认、应用、报告、单模块恢复和全部恢复走查。rc.2 还要求 native modifier mapping 的读写验证和旧快照兼容，不改变正式发布门槛。

## 当前下一动作

下一动作：冻结 `1.0.1` 版本与公开说明，新增不误触签名门的公开 workflow；随后 dry-run、建 PR、merge main、固定 tag、发布并从 Release 重新下载审计。OD-005/OD-007 未关闭前不新增真实 Wi‑Fi 密码或自动安装实现。

## 阻塞项与门槛

- 当前没有代码阻塞；OD-002、OD-005、OD-006、OD-007 仍需在对应生产行为定稿前关闭；OD-001/OD-009/OD-010/OD-011 已分别由 D-037/D-035/D-036/D-038 关闭，首批软件目录 OD-003 已由 D-034 关闭，后续扩展需另行决策。
- Apple/Windows 签名凭据、公证、真实四平台完整矩阵和自动更新签名仍未完成；本阶段公开版必须把这些差距写进说明，不得伪造或绕过。
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
