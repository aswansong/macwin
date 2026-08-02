# MacWin v1 验证矩阵（开发中）

状态：`release/v1.0.0`。这份记录区分“代码已具备”“本地验证通过”和“仍需真实设备/凭据门槛”，不把开发构建当作正式 Release。[D-032、E-021]

## 已在当前分支验证

| 能力 | 当前证据 | 边界 |
| --- | --- | --- |
| `.habitpack` 1.0.0 严格解析与构建 | Rust 单元测试、`./scripts/validate-m1` | 只收固定白名单；不接受包内命令、脚本或秘密绕过 |
| Windows → Mac 运行时守卫 | `platform::runtime_info` 与导入/扫描守卫 | 仅 Windows 10/11 x64 → Apple 芯片 macOS 15/26 |
| 计划确认 | 后端 `confirm_plan` + SHA-256 令牌 | 令牌不是来源签名；正式分发仍需签名更新链路 |
| 模块选择 | 计划页勾选后只执行已确认模块 | 未选模块会记录为 `skipped` |
| Finder 与键盘重复速率 | Alpha 0.1/0.2 真实 Mac 记录 | 需要重新跑 v1 版本的四设备矩阵 |
| 选择性 Ctrl | Karabiner 固定规则、例外和按模块恢复 | 不做全局交换；完整应用矩阵仍需真实验证 |
| 鼠标/触控板滚动 | 原生全局方向可写入并复核；独立方向明确降级 | LinearMouse 配置不猜测，需官方界面和回连验证 |
| 一份迁移前快照 | v1 版本、完整性哈希、`ensure` 不覆盖已有基线；设备自检显示是否存在及创建时间 | 仍需验证卸载/重装后的发现和按模块恢复 |
| 本地报告 | 报告页提供 HTML 与脱敏 JSON 两个保存入口；文件保存后显示本地位置 | 仍需真实安装/卸载后检查报告目录保留策略 |
| 前端与后端检查 | `npm test`、`npm run build`、`cargo test`、`cargo clippy` | CI 双平台运行仍需新 v1 workflow 验证 |

## 尚未达到正式发布门槛

- Wi‑Fi 密码：未实现真实凭据读写；在未证明平台安全不变量前不会把明文密码写入未加密包。
- 软件自动安装：当前固定白名单提供官方入口；签名/哈希、架构、版本和安装后可执行验证仍需完成。
- Karabiner/LinearMouse：缺失、拒绝授权、设备断开/重连和卸载后的恢复矩阵仍需实际设备验收。
- 更新：Tauri updater 已加入代码和 GitHub Releases endpoint 草稿；`PENDING_RELEASE_KEY` 必须由发布凭据替换，不能用于正式更新。
- 安装包：bundle 配置和签名 Release workflow 已草拟；Windows 可信签名、Developer ID、公证、stapling、真实安装/卸载尚未完成。
- 真实矩阵：至少需要 Windows 10 x64、Windows 11 x64、Apple 芯片 macOS 15、Apple 芯片 macOS 26，以及内置键盘、外接 Windows 键盘、鼠标和触控板。

## 第三方依赖说明

LinearMouse 是独立的 Mac 鼠标/触控板工具；MacWin 只检测其是否存在、提示官方入口和辅助功能授权，不静默安装或猜测其配置。参见[官方仓库](https://github.com/linearmouse/linearmouse)和[官方辅助功能说明](https://github.com/linearmouse/linearmouse/blob/main/ACCESSIBILITY.md)。

## 发布前一次性人工门槛

1. 配置 Tauri updater 公钥和签名私钥，并在隔离环境完成签名验证。
2. 提供真实 Windows 10/11 与 macOS 15/26 设备，完成 UAC、TCC、Karabiner/LinearMouse 授权和拒绝路径。
3. 在安装、升级、回滚和卸载后检查快照、报告、日志及敏感信息探针。
4. 负责人确认 Release 内容后，才允许合并 `main`、创建 `v1.0.0` 标签和 GitHub Release。
