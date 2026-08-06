# MacWin v1.0.1 公开版（未签名）

这是一个帮助 Windows 用户把习惯与环境迁移到 Apple 芯片 Mac 的本地工具。它不搬运个人文件。

## 先看安全提示

本版没有 Windows Authenticode、Apple Developer ID 签名或公证。Windows SmartScreen、macOS Gatekeeper 或企业安全策略可能阻止安装或启动。遇到阻止请停止并阅读系统提示；不要关闭或绕过 SmartScreen、Gatekeeper、SIP、TCC，也不要运行网上的绕过命令。

## 三步使用

1. Windows 10/11 x64：扫描、勾选项目并导出 `.habitpack`。
2. Apple 芯片 Mac：从 [GitHub Releases](https://github.com/aswansong/macwin/releases/latest) 下载对应 DMG，导入迁移包并预览计划。
3. 确认计划后应用；报告会说明变更，恢复使用这次迁移前快照。

安装包只应从 GitHub Release 下载。下载后用同页 `SHA256SUMS.txt` 校验；`BUILD-INFO.json` 可确认版本、平台、源码提交和 `unsigned=true`。

本版完全本地运行，不上传扫描结果。不会迁移个人文件、浏览器历史/密码/Cookie、账号会话或项目代码；Wi‑Fi 密码安全链路、软件自动安装、第三方工具自动配置和自动更新尚未启用。需要新版本时请手动回到 GitHub Releases 下载，本版不会启动联网或自动替换应用。

问题请提交到 [GitHub Issues](https://github.com/aswansong/macwin/issues)，不要上传迁移包、密码、设备序列号、账号或个人路径。
