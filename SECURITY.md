# 安全政策

MacWin 计划处理系统偏好，并可在用户明确选择时迁移 Wi‑Fi 密码。安全问题应谨慎披露。

## 报告安全问题

请使用 GitHub 仓库已经启用的 **Security → Report a vulnerability** 私密报告入口。不要在公开 Issue 中粘贴：

- `.habitpack` 文件；
- Wi‑Fi 名称或密码；
- Token、Cookie、私钥或账号凭据；
- 未脱敏的用户名、设备标识或本地路径；
- 能直接利用漏洞的敏感细节。

如果 GitHub 临时无法显示私密入口，请只提交不含敏感细节的公开 Issue，说明需要私密安全联系方式；在获得私密渠道前不要发送漏洞细节。

## 当前状态

仓库当前准备发布 `v1.0.1` 未签名公开版。Windows 安装器没有 Authenticode，macOS DMG 没有 Apple Developer ID/公证；SmartScreen 或 Gatekeeper 可能阻止运行。若系统阻止，请停止并查看官方系统提示，不要关闭或绕过 SmartScreen、Gatekeeper、SIP 或 TCC。该版本不启用自动更新签名链；可信签名与公证仍是后续版本门槛。安全承诺、威胁模型和验收要求记录在 [隐私与安全规格](docs/product/specs/privacy-security.md) 与 [v1 验证矩阵](docs/product/v1-validation.md) 中。[D-043、E-057]
