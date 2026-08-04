# Windows v1.0.1 原生验证记录

状态：本机源码与 `.habitpack` 验证通过；主机 GUI 流程已完成但使用的是来源未能独立证明的现有桌面 EXE；正式发布门槛仍未通过。本文不把未签名构建当作可信发布物，也不代表所有 Windows 设备通过。

## 验证范围

- 产品版本：`1.0.1-rc.1`
- `.habitpack` schema：`1.0.0`
- 主机：Windows 11 x64，OS build `26200`
- 目标流程：Windows 白名单扫描、动态选择、取消/重新选择、导出确认、`.habitpack` 严格校验、关闭后重新打开
- 隐私边界：不读取真实 Wi-Fi 密码、个人文件、浏览器资料、账号、Token、SSH 密钥或项目秘密
- 安全边界：未关闭、修改或绕过 Smart App Control、Defender、防火墙或 Code Integrity；未伪造签名

## 仓库基线与来源

- 来源：`origin/release/v1.0.1`
- 源码基线提交：`2274a5c71b808d5863129c7e5dd39e064373ceea`
- 验证分支：`windows/v1.0.1-native-validation`（当前专用分支，不修改 `main` 或 `release/v1.0.1`）
- `26ec53f` 到 `2274a5c` 的差异仅涉及文档；应用源码没有变化
- 本次增加该验证分支的 CI 触发范围、Rust 既有格式漂移修复和本记录文档；不创建 tag、正式 Release 或签名资产

## Windows 文件盘点与信任判断

| 候选 | 大小 | SHA-256 | PE/版本 | 签名 | 来源判断 | 用途 |
| --- | ---: | --- | --- | --- | --- | --- |
| `%USERPROFILE%/Desktop/创业/自媒体/macwin/macwin.exe` | 13,196,800 | `DE6AB3865971243C3B66AB9BC46DEF208A1B037D9281574EA0AFE82C55819BAB` | x64 AMD64；`1.0.1-rc.1` | `NotSigned` | 未在 Release manifest 或可匿名下载的 CI artifact 中建立哈希证明 | 本机 GUI 基线 |
| `%USERPROFILE%/Desktop/创业/自媒体/macwin/uninstall.exe` | 79,167 | `FC9DB2CE384AE5C8EDFA73B76E2E6287DA263FAD3D76B5FDF9149BCB2A7D7127` | `1.0.1-rc.1` | `NotSigned` | 用户级安装登记引用的卸载入口；非 Release 资产 | 未执行 |
| `%USERPROFILE%/Downloads/MacWin_1.0.1-rc.1_x64-setup.exe` | 3,175,404 | `8AC208BABE263615011AD12457BED0B4D933CD966FEE15E00E750CA5178B50B0` | I386 installer；`1.0.1-rc.1` | `NotSigned` | 与 GitHub Pre-release `v1.0.1-rc.1` 的 `SHA256SUMS.txt` 完全匹配；资产构建提交为 `26ec53f` | 可信的未签名 Release 资产，未执行安装 |

系统卸载注册表中已有一个用户级 `MacWin 1.0.1-rc.1` 登记，安装目录为上述桌面目录，卸载入口为该目录内的 `uninstall.exe`。盘点范围还发现 Desktop 11 个、Downloads 15 个、Cargo target 144 个 `.exe/.msi`；其中与 MacWin 相关的只有表内文件和两个 Cargo 测试二进制，后者是本地构建中间物，不是交付候选。临时目录中的历史副本和其他软件安装器未纳入 MacWin 可信证据。纳入 MacWin 交付盘点的 PE 均无 Authenticode 签名；没有可用签名凭据，也没有尝试签名。

GitHub 公开的 `SHA256SUMS.txt` 证明了 Downloads 安装器；匿名 Actions artifact 下载返回 `401 Requires authentication`，所以桌面 EXE 不标为可信发布资产。现有 GUI 结果只作为同版本行为证据，不替代 Release binary 的来源证明。

## 主机 GUI 原生流程

实际操作对象是桌面目录中的现有 `macwin.exe`，其来源未独立证明，故以下结论标为“主机行为证据”。

1. **W1 扫描**：页面显示版本 `1.0.1-rc.1`；隐私说明明确不读取浏览器历史、密码、Cookie、账号/登录信息或个人文件；当前版本不读取或导出 Wi-Fi 密码。
2. **W1 → W2**：扫描完成后进入动态选择页。
3. **取消/重新选择**：操作习惯模块从“已选择”切为“未选择”，再切回“已选择”；页面状态随选择变化。
4. **W2 → W3**：进入导出确认页，页面明确显示只有点击导出后才会写入指定位置并再次验证结构和引用；包含操作习惯、6 个需 Mac 端确认的软件项、系统指南；Wi-Fi 不含密码，共 8 条规则。
5. **导出完成**：生成 `%USERPROFILE%/Documents/macwin-native-validation.habitpack`，UI 显示“生成和验证都完成了”。
6. **无陈旧状态**：返回首页后关闭窗口，再次打开应用回到干净 W1 首页，没有保留上次选择或导出进度。

## `.habitpack` 独立校验

- 文件大小：`5,008` bytes
- SHA-256：`1291837DDB999DDA69245421BD96A082EBFA079D5AD6B394B87EE3AEABDE20AD`
- M1 strict validator：通过（`STRICT_VALIDATION_OK`）
- ZIP 测试：通过（`python -m zipfile -t`）
- entries：`manifest.json`、`modules/developer.json`、`modules/keyboard.json`、`modules/pointer.json`、`modules/software.json`、`selections.json`
- manifest 哈希：全部匹配
- module whitelist：通过；禁止文件：空
- secret/leak markers：空；未发现密码、Token、SSH、Cookie、浏览器历史或用户绝对路径标记
- selected candidate count：9

## 自动化验证

| 检查 | 结果 |
| --- | --- |
| `npm test` | 通过；2 个测试文件、9 个测试 |
| `npm run build` | 通过 |
| `python -m unittest discover -s tests -p "test_*.py"`（仓库 venv） | 通过；55 个测试 |
| `python -m tools.m1.repo_checks`（仓库 venv） | 通过；14 schemas、8 个有效夹具、113 个无效夹具、34 个 JSON、37 个相对链接、15 个 P0、D=40/OD=11/E=48 |
| `cargo test --locked --manifest-path src-tauri/Cargo.toml` | 格式化前基线通过；20 个测试。格式化后重新编译生成的测试 PE 在启动阶段被 Smart App Control 阻止，未执行断言 |
| `cargo clippy --locked --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings` | 格式化前基线通过、无 warning；格式化后未重复触发本机受阻的编译/执行路线，交由 Windows CI 验证 |
| `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` | 通过；已用 Rust 1.97.1 格式化 4 个既有漂移文件 |
| `git diff --check` | 通过 |

此前 `npm ci`、前端构建、M1 测试和 Release 候选构建也有历史通过记录；本次没有修改 lockfile。Windows PowerShell 没有 `bash` 命令，因此本次 M1 检查使用同一仓库 venv 直接运行等价的 unittest/repo_checks 入口，并记录了精确结果。Rust 格式化后的本机测试不再重复启动，以遵守 Smart App Control 同一路线最多两次检查的约束。

## Smart App Control、Code Integrity 与替代路线

- 新生成的本地 Debug PE 直接启动被 Smart App Control 阻止；同一阻断最多做了一次路径/文件名替代检查，仍被同策略阻止，没有继续重复。
- Release `--no-bundle` 构建曾遇到 Code Integrity 事件 ID `3077`、OS error `4551`，阻断 Cargo 生成的 `serde` build script；没有关闭或绕过策略，也没有伪造签名。
- Windows 主机 `HypervisorPresent=True`；查询 `Containers-DisposableClientVM` 状态需要管理员权限。本次不提权、不启用 Windows Sandbox、不重启；因此 Sandbox 证据为未取得。
- GitHub Actions 可作为替代构建路线：
  - [v1 validation 成功运行 30824474914](https://github.com/aswansong/macwin/actions/runs/30824474914)，Windows/macOS 矩阵在 `26ec53f` 通过测试、Clippy、M1 和无 bundle 构建。
  - [unsigned RC package 成功运行 30824474842](https://github.com/aswansong/macwin/actions/runs/30824474842)，生成了与 Downloads 安装器哈希匹配的未签名 Windows Release 资产。
  - 后续指向 `2274a5c` 的两个运行被取消，不计为成功；本分支已加入 `v1-ci.yml` 的 push 触发范围，推送后以新的运行结果为准。

## 未通过的正式发布门槛

- Windows 安装器与 PE 均为 `NotSigned`，未通过正式签名/SmartScreen 门槛。
- 本机未执行 Downloads 安装器、卸载或重装；现有用户级登记只证明已有安装记录，不证明本次资产安装成功。
- 本机 GUI 使用的是来源未独立证明的现有桌面 EXE，不能升级为可信 Release binary 的启动验收。
- Windows Sandbox 因需管理员权限未启用；不在本次任务中改变系统设置。

## 隐私声明

本文使用 `%USERPROFILE%` 脱敏路径，不写入用户名、完整本地路径、设备序列号、Wi-Fi 名称或密码、Token、SSH 私钥、浏览器资料、个人文件、完整日志或迁移包内容。测试输出仅保留哈希、结构、计数和安全策略类别。
