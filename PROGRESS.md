# v1.0.1 public release progress
- 目标：把已验证 rc.2 通过 PR merge commit 收入 main，发布源码、标签、构建与下载资产同源的未签名公开版。
- 开工基线：`MAIN_BEFORE=dc2b4000a5f9126b63dc4048d1a8197105a9204b`；rc.2 集成头 `5763966f69eb335b955668718ea9dc6df849331e`；rc.2 标签仍为 `51eaea95c61568c408a16d8c3954c87c99a94790`。
- 当前分支：`release/v1.0.1-evidence`（基于已合并 `main`），所有远端头已 fetch；旧 rc.2 标签、Release 和历史分支不改写。
- 让步顺序：数据与回滚安全 → 构建来源一致 → 双平台可用 → 发布整洁 → 速度。
- 硬边界：schema/迁移类别/白名单/键位/快照语义不变；不签名、不公证、不绕过 SmartScreen/Gatekeeper、不上传秘密。
- 当前阶段：公开内容、workflow 和 dry-run 已冻结，等待最终 annotated tag 与 Release。
- 证据要求：每个不可逆动作前重新 fetch/SHA；标签前 dry-run；记录 commit 错位红→绿；最多三轮完整验收。
- 已知门槛：真实 Windows 安装/卸载烟测、真实 Mac 核心烟测、分支保护 API 和正式 Release 均需逐项核验。
- 冻结完成：package/lock/Tauri/Cargo 均为 1.0.1；schema 仍为 1.0.0，rc.2 标签与资产未改写。
- 文档已加入 D-043/E-057 公开未签名边界；README、Release 说明和 README-FIRST.md 均明确 SmartScreen/Gatekeeper 风险与零绕过命令。
- 新增 `.github/workflows/public-release.yml`：dispatch 永不发布，只有精确 `v1.0.1` tag push 发布；双平台 NSIS/DMG、BUILD-INFO、BUILD_COMMIT、SHA256 和发布前 validator 已接入；signed workflow 已去掉 tag push。
- 新增 `scripts/validate-public-release-assets.py` 及 5 条成功/失败测试，覆盖 commit mismatch、asset count、hash mismatch、rc tag/version；静态 workflow 测试 3 条。
- 本地验证：`npm test` 14/14；`npm run build` 通过；Cargo fmt/test/clippy 通过（20 passed、1 个既有外部测试 ignored）；`./scripts/validate-m1` 61/61 通过。
- 更新入口已改为手动检查说明，移除启动时 `check_update(false)`，公开未签名构建不生成 updater/`latest.json`。
- 下一步：提交并推送分支，重新 fetch 后创建 PR；PR 头运行 dry-run，待检查通过后 merge commit main，再固定 annotated tag 和公开 Release。
- PR #2 已创建：<https://github.com/aswansong/macwin/pull/2>；head `f5c8b3b`，base `main@dc2b400`。PR 双平台检查已排队。
- 已尝试 PR 头 `gh workflow run public-release.yml --ref release/v1.0.1-public`；GitHub 返回 `HTTP 404 workflow not found on default branch`，因为新 workflow 尚未进入默认分支。此为 GitHub dispatch 平台门槛，不修改 main 绕过；合并后立刻 dispatch dry-run。
- PR #3（merge `37918ca`）修复版本守卫误判 `crc32fast`；PR #4（merge `b01cb7d`）修复 BUILD-INFO 字典排序；两次均经 Windows/macOS 必需检查通过。
- 红→绿：dry-run `31097879379` prepare 失败、`31098518195` verify 失败；修复后 `31100367976` prepare/Windows/macOS/verify 全部成功，publish skipped。
- 从 `31100367976` 下载验证资产后 `sha256sum -c SHA256SUMS.txt` 六项全部 `OK`；validator 输出 `PUBLIC_RELEASE_VALID: v1.0.1 b01cb7d0e96ffb53c2f9d318f7ab2aef59e97459 assets=7`。对应证据已写入 E-058。
- 当前 main 精确 HEAD：`b01cb7d0e96ffb53c2f9d318f7ab2aef59e97459`；下一步重新 fetch 后创建不可移动 annotated `v1.0.1`，不移动/删除 rc.2 标签。

## 发布后审计（仅 audit/v1.0.1-windows-smoke，未合入 main）

- 正式公开 Release 已完成：main、`v1.0.1` 剥离标签提交、workflow `GITHUB_SHA`、`BUILD-INFO` 与两份 `BUILD_COMMIT` 均为 `e7bd4fa5eae6295cdd81fd7829b47f48304ac3bf`；重新下载 7 个资产后 SHA-256 与 validator 均通过。
- Windows 发布资产安装→启动→卸载 smoke：GitHub Actions run `31104614928` 输出 `WINDOWS_INSTALL_LAUNCH_UNINSTALL_SMOKE: PASS`；验证分支提交 `e9fa97c` 只增加验证 workflow，未合入 main。
- 公开 Apple Silicon DMG 已只读挂载，内部主程序确认 `Mach-O 64-bit executable arm64`；公开包导入测试包、强制计划确认、应用和单模块恢复成功。
- 全量恢复第一次返回 `ROLLBACK_VERIFY`，随后停止重复该失败动作；只读检查显示键盘映射/重复速率回到未设置，Finder 扩展名和滚动方向与迁移前值一致，但结果页未报告全量恢复成功。该发布后缺陷不改变已发布标签或资产来源，不能宣称真实 Mac 全量恢复闭环已通过。
- 公开 Release、签名门、main 保护、rc.2 历史和 `BLOCKED.md`（“无”）均保持不变；后续应在新版本/新 PR 修复 `ROLLBACK_VERIFY` 后再做完整 Mac 回归。
- 根因核查确认：本机原有 `v1.0.0` 兼容快照缺少内置键盘映射字段；已用临时 0700 目录备份并恢复原文件（恢复 SHA-256 `a4bfd3da988b0ed66de572ad163206b66e8c53f7da3d5eea266500b798ed9ff6`）。尝试用全新快照重跑时 Mac 已锁定，未绕过锁屏，未生成或覆盖新快照；公开 DMG 已卸载。
