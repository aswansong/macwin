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

仓库当前包含 `alpha/v0.1-vertical-slice` 的未签名本地 Alpha。它只处理白名单习惯与环境，明确不处理 Wi‑Fi/密码、真实秘密、个人文件、第三方安装或更新；请勿把 Alpha 用于生产设备或公开分发。安全承诺、威胁模型和验收要求记录在 [隐私与安全规格](docs/product/specs/privacy-security.md) 中。[D-030、E-019]
