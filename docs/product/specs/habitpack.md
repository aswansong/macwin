# `.habitpack` 格式规格（草案）

状态：产品级格式规范，尚未实现；字段和版本在首个技术样例前仍可兼容性调整。容器、安全边界和数据最小化原则已经决定。[D-009、D-019、D-027]

## 1. 目标与非目标

格式用于把已确认的 Windows 习惯描述交给 Mac 端生成计划。它不是备份格式、脚本包、应用安装器、个人文件容器或通用注册表/plist 传输工具。[D-002、D-009、D-027]

第一版使用 ZIP 容器和 `.habitpack` 扩展名，不加密。ZIP 可读性只为调试和互操作，不代表导入方可以信任内容。[D-009]

## 2. 建议的目录结构

```text
example.habitpack
├── manifest.json
├── selections.json
├── modules/
│   ├── keyboard.json
│   ├── pointer.json
│   ├── software.json
│   ├── developer.json
│   └── wifi.json
├── raw/
│   └── <rule-id>/<declared-fragment>.json
└── integrity.json
```

约束：

- 所有路径使用 UTF-8、正斜杠和相对路径。
- 禁止绝对路径、`..`、符号链接、硬链接、设备文件、嵌套压缩包和重复规范化路径。
- 包内不得出现 `.exe`、`.dll`、`.msi`、`.ps1`、`.bat`、`.cmd`、`.sh`、Mach-O、脚本解释器入口或任意可执行内容。
- `raw/` 只能包含白名单规则声明需要的最小 JSON/文本片段；具体允许的媒体类型由 schema 固定，不接受任意文件。[D-009、D-027]

## 3. `manifest.json`

首版候选字段：

```json
{
  "format": "macwin-habitpack",
  "schema_version": "1.0.0",
  "created_at": "2026-07-30T12:00:00Z",
  "created_by": {
    "app_version": "0.0.0-alpha",
    "ruleset_version": "2026.07.0"
  },
  "source": {
    "os_family": "windows",
    "os_release": "11",
    "architecture": "x86_64"
  },
  "target": {
    "os_family": "macos",
    "architecture": "arm64"
  },
  "contains_secrets": false,
  "modules": ["keyboard", "pointer"],
  "files": [
    {
      "path": "modules/keyboard.json",
      "media_type": "application/json",
      "size": 100,
      "sha256": "<64 lowercase hex characters>"
    }
  ]
}
```

说明：

- 示例值不表示版本号已经发布。
- `contains_secrets` 只要存在任何 Wi‑Fi 密码就必须为 `true`；为 `false` 不能替代内容扫描。
- 不需要且默认不允许设备序列号、Windows 产品密钥、Microsoft/Apple 账号、完整用户名或完整本地绝对路径。[D-009、D-019]
- 时间只用于向用户识别包，不作为信任判断。

## 4. 模块数据

模块文件必须以规则 ID 表达意图，不得直接携带目标端命令。例如：

```json
{
  "module": "keyboard",
  "rules": [
    {
      "rule_id": "keyboard.ctrl_copy_compat",
      "rule_version": 1,
      "selected": true,
      "source_evidence": {
        "detected": true,
        "kind": "known_shortcut_profile"
      },
      "parameters": {
        "scope": "standard_apps",
        "exclude_real_ctrl_contexts": true
      }
    }
  ]
}
```

导入器根据自己内置且受信任的 `rule_id + rule_version` 查找实现。未知规则只能显示为不支持，不得解释为命令、路径或系统键。[D-027]

## 5. Wi‑Fi 数据

Wi‑Fi 模块只允许用户逐项选中的个人 WPA/WPA2/WPA3 网络。企业 802.1X、证书、受管网络和未知安全类型不得进入包。[D-019]

候选表达：

```json
{
  "module": "wifi",
  "networks": [
    {
      "network_id": "local-opaque-id",
      "ssid": "<network name>",
      "security": "wpa2-personal",
      "credential_ref": "secrets/wifi/local-opaque-id.bin"
    }
  ]
}
```

这里的 `credential_ref` 仅说明引用方式，**秘密文件的最终编码仍未决定**，受 OD-005 技术验证阻塞。实现必须保证：

- 密码不进入 manifest、计划、报告、日志、错误和快照；
- 读取后只传给受信任的目标系统接口，不进入通用模板或 Shell 参数；
- 临时明文缓冲区和文件按平台可实现的最强方式及时释放/删除；
- 包级 `contains_secrets` 与实际内容一致；
- 导入完成后提醒用户删除包，但不替用户删除其唯一副本。[D-019、OD-005]

## 6. 完整性与真实性

第一版至少需要逐文件 SHA-256 完整性清单，用于发现损坏或未声明内容；哈希不能证明发布者身份。应用与离线规则包的真实性签名由 OD-006 决定。

导入时必须拒绝：

- manifest 未声明的文件；
- 大小或哈希不匹配；
- schema 主版本不支持；
- 重复文件、大小写碰撞或 Unicode 规范化碰撞；
- 超过实现固定上限的总大小、文件数、路径长度、单文件大小或压缩比；
- 非法 JSON、重复键或超出数值范围的字段；
- 内容类型与路径/声明不符；
- 任何可执行内容或未知原始片段。[D-027]

具体数值上限属于执行 agent 可提出的技术细节，但必须通过安全测试并记录；改变能接收的数据类别仍需负责人拍板。

## 7. 兼容性

- `schema_version` 使用语义化的 `major.minor.patch`。
- 不支持的 major：阻断导入并提示使用兼容版本。
- 新增可忽略字段可提升 minor；现有字段含义不得静默改变。
- 修正文案或不改变解析的约束可提升 patch。
- 每个规则另有整数 `rule_version`；应用只能执行已知组合。
- 降级读取不得丢掉安全语义，例如把 `contains_secrets` 当成未知可忽略字段。[D-027]

最终向后/向前兼容窗口由 OD-011 决定；当前不承诺具体跨度。

## 8. 隐私导出检查

Windows 端生成后必须用与 Mac 端独立的校验路径重新读取包，并验证：

- 没有非白名单文件和字段；
- 未选择 Wi‑Fi 密码时，不存在 credential 内容且 `contains_secrets=false`；
- 用户名、绝对路径、设备序列号和账号标识不在禁止字段或原始片段中；
- 所有选项与最终确认页一致。[D-009、D-019]

任何检查失败都删除未完成输出并展示不含秘密的错误，不得生成“勉强可用”的包。[D-026]
