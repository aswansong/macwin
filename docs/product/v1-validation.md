# MacWin v1 验证矩阵（v1.0.1 公开版收口中）

状态：`release/v1.0.1-public`（基于已验证 `integration/v1.0.1-final-convergence@5763966`，合流 Mac `6553386` 与 Windows `0f4ec31`）。这份记录区分“代码已具备”“本地/CI 验证通过”和“仍需真实设备/凭据门槛”；当前目标是明确未签名的公开 `v1.0.1`，不是可信签名版本。[D-043、E-057]

## v1.0.1-rc.2 候选验证（历史 Actions 已通过）

候选版本目标为前端/Tauri `1.0.1-rc.2`、Cargo `1.0.1`；`.habitpack` schema、ruleset 与 snapshot 继续保持 `1.0.0`。最终集成提交 `122ac3c2e25d137fca2259981d78ddb6f2ea1afd` 的 v1 validation run `31064223858`、unsigned RC run `31064223856` 及 publish job `92499884883` 均成功；Pre-release、同一提交和双平台 SHA-256 已下载复核。[D-042、E-055、E-056]

## v1.0.1 公开版验证目标（当前）

公开版必须把 `origin/main`、annotated tag `v1.0.1`、workflow `GITHUB_SHA`、两端 `BUILD_COMMIT`、`BUILD-INFO.json` 和下载资产绑定到同一提交；workflow 必须以精确 tag checkout，版本精确为 `1.0.1`，只生成一个 Windows x64 NSIS 和一个 Apple Silicon DMG，不生成 `latest.json` 或未签名 updater。发布后从 GitHub Release 重新下载全部资产并执行哈希、版本、架构、风险说明和来源审计。[D-043]

## integration/v1.0.0-visual-fidelity-v6 视觉整合补充

| 能力 | 浏览器证据 | 边界 |
| --- | --- | --- |
| Windows W1 → W2 → W3 | v6 本地 Vite 预览实际点击、通行证模块联动、真实选择适配层、导出前复核和生成后交接 | 浏览器路径使用虚构数据；Windows Tauri 路径仍调用 `scan_windows` 与 `export_habitpack`，不以视觉预览证明真实扫描或写文件 |
| 软件单次确认 | Windows 扫描后自动带入白名单内已安装软件，W2 只显示“Mac 端确认”，Mac 计划页保留唯一勾选入口；新增 `defaultSoftwareIds` 测试 | 不自动安装软件；未知软件不会进入导出选择，最终结果仍按 `manual_action_required` 处理 |
| Mac B → C | v6 本地 Vite 预览实际点击导入、强制计划、双分组、执行、结果、报告、指南和恢复 | 浏览器路径使用虚构数据；Tauri 路径仍调用 `import_habitpack`、`confirm_plan`、`apply_plan`、`rollback_*`，不把预览结果当作真实系统结果 |
| 真实/预览隔离 | `isTauri` 优先，只有非 Tauri 开发浏览器启用 preview bridge；预览工具栏需要 `?preview=1` | Tauri 中 query 参数不能切换到虚构执行；真实应用不显示“演示数据”或虚构设备票据 |
| 异常与安全状态表达 | UAC 拒绝、Mac 权限拒绝、离线、第三方拒绝、单模块失败、损坏包均可复现 | 权限、Wi‑Fi 密码、第三方安装、签名和真实设备仍受原有门槛约束 |
| 响应式与可访问性 | v6 QA 记录的视觉对照、1584×1024、1440×900、1280×720、390×844；可见焦点、减少动态效果 CSS、窄窗无横向溢出 | 200% 系统文字缩放仍需负责人按真实桌面环境复核 |

本节只补充展示层和数据适配证据，不替代下方 v1 的 Rust/Tauri、格式、权限、快照、签名或真实设备证据。完整视觉对照和边界见 [`visual-fidelity-v6-qa.md`](visual-fidelity-v6-qa.md)。

## 已在当前分支验证

| 能力 | 当前证据 | 边界 |
| --- | --- | --- |
| `.habitpack` 1.0.0 严格解析与构建 | Rust 单元测试、`./scripts/validate-m1` | 只收固定白名单；不接受包内命令、脚本或秘密绕过 |
| `.habitpack` 同 major 版本门 | Rust 测试接受已知闭合结构的 `1.1.0`，拒绝 `2.0.0` 并返回 `HP_SCHEMA_VERSION`；M1 验证档案仍精确为 `1.0.0` | 不接受未知字段或未知规则语义；未来扩展必须补 schema、迁移策略和测试 |
| Windows → Mac 运行时守卫 | `platform::runtime_info` 与导入/扫描守卫 | 仅 Windows 10/11 x64 → Apple 芯片 macOS 15/26 |
| 计划确认 | 后端 `confirm_plan` + SHA-256 令牌 | 令牌不是来源签名；正式分发仍需签名更新链路 |
| 模块选择 | 计划页勾选后只执行已确认模块 | 未选模块会记录为 `skipped` |
| Finder 与键盘重复速率 | Alpha 0.1/0.2 真实 Mac 记录 | 需要重新跑 v1 版本的四设备矩阵 |
| 内置键盘 Control ↔ Command | macOS 原生逐设备 modifier mapping、四方向读取验证、单项/全部恢复 | 外接键盘不改变；真实内置键盘行为、睡眠/重连仍需验收 |
| 鼠标/触控板滚动 | 原生全局方向可写入并复核；独立方向明确降级 | LinearMouse 配置不猜测，需官方界面和回连验证 |
| 一份迁移前快照 | v1 版本、完整性哈希、`ensure` 不覆盖已有基线；设备自检显示是否存在及创建时间 | 仍需验证卸载/重装后的发现和按模块恢复 |
| 本地报告 | 报告页提供 HTML 与脱敏 JSON 两个保存入口；文件保存后显示本地位置 | 仍需真实安装/卸载后检查报告目录保留策略 |
| 前端与后端检查 | 本地 `npm test`、`npm run build`、`cargo test`、`cargo clippy`；CI `30764782994` 的 Windows latest 与 macOS 15 均通过 | 仍需真实安装包、权限和外设矩阵 |
| 正式版本号对齐 | `scripts/prepare-release.py` 单测与本地失败路径测试通过；正式标签构建前校验 `vMAJOR.MINOR.PATCH` 与 Cargo 版本并同步 Tauri/npm lockfile | 只校验版本一致性，不提供签名凭据或正式 Release |
| updater manifest 选择 | `scripts/build-release-manifest.py` 的 4 条离线夹具测试通过；macOS 只接受一个 `.app.tar.gz`，Windows 优先唯一 `.msi.zip`、否则唯一 `.nsis.zip`，签名为空或候选歧义即拒绝 | 只验证元数据选择，不证明真实签名、安装包内容或 GitHub Release |
| 发布资产整体审计 | `scripts/validate-release-assets.py` 的 4 条离线夹具测试；Release publish job 在发布前校验双平台 SHA-256、SBOM、安装包、updater 签名文本和 `latest.json` 一致性 | 只验证已下载产物的结构与元数据，不替代代码签名、公证、stapling 或真实设备安装验收 |
| 公开 Release 资产展平 | `scripts/build-release-checksums.py` 与 `scripts/stage-release-assets.py` 的离线测试；发布 job 生成唯一文件名、总 SHA-256 和中文变更说明 | 只验证发布资产编排，不证明签名、公证或 GitHub Release 已创建 |
| Windows 安装器与 updater 签名顺序 | Release workflow 将证书导入临时证书库，并通过 Tauri `bundle.windows.signCommand` 在生成 updater 压缩包前签名安装器；随后独立执行 `signtool verify /pa` | 只验证工作流静态路径；真实证书、SmartScreen 声誉和正式 Release 仍需人工门槛 |
| updater 回滚保护 | `tauri-plugin-updater` 保持默认版本比较，只有远端版本高于当前版本才进入安装路径；仓库未设置 `version_comparator` 或 `allow_downgrades`，并有静态回归断言 | 只证明代码未开启降级；正式更新仍需公钥、签名产物、真实升级/回滚验收 |
| 取消模块与恢复边界 | Rust `cancelled_keyboard_modules_are_reported_as_skipped`；恢复命令只接受本次实际应用或可恢复失败的模块，全部恢复不会触碰未选模块 | 仍需在真实设备验证恢复后的系统值和卸载/重装发现 |
| 手动 tag 的 Release 路径 | Release workflow 的 macOS DMG 生成与公证校验统一使用 `inputs.tag || github.ref_name`，避免 workflow_dispatch 时把分支名写入资产路径 | 只验证 workflow 表达式与静态路径，不替代真实签名、公证或发布 |
| 手动 tag 的源码一致性 | Release workflow 的 build/publish checkout 显式使用 `inputs.tag || github.ref`，再由 `prepare-release.py` 校验版本 | 只验证 workflow 配置，不证明真实签名构建已执行 |
| 真实设备验收准备 | [真实设备验收手册](../execution/real-device-acceptance.md) 固定 W10/W11/M15/M26、权限/外设/失败/恢复/升级卸载矩阵与脱敏证据字段 | 尚未执行；设备、签名凭据、系统弹窗和负责人最终确认仍是发布门槛 |
| 本地 macOS App bundle | Tauri `--bundles app` 完成前端、Rust release 编译和 `MacWin.app` 生成；临时关闭 updater 产物并 `--no-sign` 后可重复构建 | 仅未签名构建验证；updater 私钥、Developer ID、公证、stapling 和真实安装仍未完成 |
| 本地 macOS DMG | Tauri `--bundles dmg` 生成 Apple Silicon DMG，`hdiutil verify` 校验有效 | 产物仍为未签名 `1.0.1-rc.2` 开发包；不替代 Developer ID、公证、stapling 或真实安装验收 |
| GitHub 未签名 RC | 历史 Actions `31064223856` 与 publish job `92499884883` 成功；Pre-release 含 Windows x64 NSIS、Apple Silicon DMG、`README-TESTING.md` 和总 `SHA256SUMS.txt`，下载后两项均 `sha256sum -c ...: OK` | 历史知情测试包；不改写 rc.2 |
| v1.0.1 公开版来源一致性 | 待 `release/v1.0.1-public` dry-run、PR merge、tag workflow 与 Release 下载审计 | 未签名；必须醒目标注 SmartScreen/Gatekeeper 风险，不生成未签名 updater |

## v1.0.1 公开版仍明确未完成

- Wi‑Fi 密码：未实现真实凭据读写；在未证明平台安全不变量前不会把明文密码写入未加密包。
- 软件自动安装：当前固定白名单提供官方入口；Mac 计划和报告会把已选择但未自动安装的项目标为 `manual_action_required`，不伪报已安装。签名/哈希、架构、版本和安装后可执行验证仍需完成。
- 首批软件目录：仅 Chrome、Edge、Firefox、Microsoft 365、WPS Office、Visual Studio Code、Git、Node.js、Python、Codex CLI、Claude Code；历史候选不进入 v1 扫描或迁移包。[D-034、E-025]
- LinearMouse：缺失、拒绝授权、设备断开/重连和卸载后的恢复矩阵仍需实际设备验收；键位模块不再依赖第三方写入。
- 更新：Tauri updater 已加入代码和 GitHub Releases endpoint 草稿；手动安装路径要求用户确认，并由 updater 在下载后验证签名；`PENDING_RELEASE_KEY` 必须由发布凭据替换，不能用于正式更新。
- 安装包：公开版只承诺未签名 Windows x64 NSIS 与 Apple Silicon DMG；Windows 可信签名、Developer ID、公证、stapling 和可信自动更新仍未完成。
- 真实矩阵：至少需要 Windows 10 x64、Windows 11 x64、Apple 芯片 macOS 15、Apple 芯片 macOS 26，以及内置键盘、外接 Windows 键盘、鼠标和触控板。

## 第三方依赖说明

LinearMouse 是独立的 Mac 鼠标/触控板工具；MacWin 只检测其是否存在、提示官方入口和辅助功能授权，不静默安装或猜测其配置。参见[官方仓库](https://github.com/linearmouse/linearmouse)和[官方辅助功能说明](https://github.com/linearmouse/linearmouse/blob/main/ACCESSIBILITY.md)。

## 公开版后的后续人工门槛

1. 配置 Tauri updater 公钥和签名私钥，并在隔离环境完成可信更新验证；`v1.0.1` 不启用未签名自动更新。
2. 补齐真实 Windows 10/11 与 macOS 15/26 完整设备/外设矩阵，完成 UAC、TCC、LinearMouse 授权和拒绝路径，并验证内置键盘原生映射恢复。
3. 在安装、升级、回滚和卸载后检查快照、报告、日志及敏感信息探针。
4. 可信签名版本必须另行决定，不把本次未签名公开版描述为安全可信分发。
