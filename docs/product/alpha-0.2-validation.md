# Alpha 0.2 验证记录

日期：2026-08-02

分支：`alpha/v0.2-keyboard-compatibility`
范围：真实 Apple 芯片 Mac 上的最小本地闭环；不是签名发行版，也不是全设备兼容性声明。

## 已实际验证

在一台 Apple 芯片 Mac（`aarch64`，macOS 26.5.2）上，用未打包 Alpha 二进制和本地生成的有效 `.habitpack` 完成了：

- 导入包 → 展示迁移计划 → 用户确认后才应用；
- Finder“显示文件扩展名”写入并重新读取验证；
- Windows 键盘重复速度 `24 / 1` 映射为 `KeyRepeat=3`、`InitialKeyRepeat=30`，写入并重新读取验证；
- 识别 MacBook 内置键盘，展示脱敏标识；没有安全识别的设备不会猜测；
- 检测到 Karabiner-Elements 16.1.0，生成固定 15 项快捷键规则；规则只包含 `device_if` 与固定的应用例外条件；
- 应用后在真实配置中观察到一条 MacWin 管理规则，用户原有规则保留；
- 通过报告和个性化指南说明实际变化、收益、例外与恢复方式；
- “全部恢复”后 Finder 回到原值、键盘重复偏好恢复为迁移前的系统默认、MacWin 管理规则被移除，且 Karabiner 中没有残留 MacWin 规则；
- Alpha 自检只展示应用/格式/系统架构、键盘脱敏标识、Karabiner 状态和最近模块状态；不展示用户名、完整路径、序列号、密码或原始配置。

真实运行期间没有读取或写入 Wi‑Fi、密码、个人文件、浏览器数据；没有安装第三方工具、提权、联网或启动常驻服务。

## 自动化验证

以下检查在本地通过：

- `npm test`：前端 3/3；
- `npm run build`：TypeScript 检查与 Vite 构建通过；
- `cargo test --manifest-path src-tauri/Cargo.toml --locked`：Rust 单元测试通过；
- `cargo clippy --manifest-path src-tauri/Cargo.toml --locked --all-targets -- -D warnings`：通过；
- `npm run tauri build -- --no-bundle`：Apple 芯片本地二进制构建通过；
- `./scripts/validate-m1`、JSON 检查和 `git diff --check`：提交前重新执行。

快照篡改、迁移包结构错误、未知 Karabiner 结构和用户规则保留均由自动化测试覆盖；真机运行没有使用损坏包或真实外接键盘作为输入。

## 尚未证明

- Windows 10/11 x64 真机扫描和导出尚未在本轮 Apple 芯片 Mac 上复测；当前真机闭环使用本地有效夹具包。
- 外接 Windows 键盘的真实硬件矩阵、多个键盘并存、热插拔和不同厂商 HID 标识尚未证明。
- Karabiner 权限拒绝、配置损坏、应用未安装和终端/远程桌面/虚拟机内的实际按键行为尚未在本轮真机走查；代码路径和固定规则测试已覆盖降级/结构拒绝。
- Windows CI 和 macOS CI 产物需在推送后由 GitHub Actions 运行；本地只验证了同等命令。

因此，Alpha 0.2 的结论仅是“这套固定规则和恢复语义在一台实际 Apple 芯片 Mac 上可运行”，不能外推为普通用户可直接安装的正式产品。
