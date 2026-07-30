# MacWin repository guidance

## Mission

MacWin 帮助 Windows 10/11 x64 用户把使用习惯迁移到运行 macOS 15/26 的 Apple 芯片 Mac。第一版迁移习惯与环境，不迁移个人文件或完整系统。

## Current phase

- M0 文档基线和 M1“完整可点击原型＋迁移格式规范”均已完成；当前状态为 `completed_waiting_for_next_authorization`，默认停止。
- 未获新授权前，`main` 不进入 M2、生产开发、真实设备测试、Alpha 或 Release，也不创建生产 Tauri 应用骨架、系统扫描器、特权组件、配置执行器或安装包。
- 冻结交互原型位于独立的 `prototype/ui-flow-v2-hardening` 分支与提交 `37edc4edd52f2d0fb5aa7d796faa5fd7437bbb75`，只使用虚构数据；原型代码不得合入 `main` 或被当作正式实现。[D-028]
- 从 M1 进入技术预研、生产开发、Alpha 或公开发布仍需 `docs/execution/active-plan.md` 明确进入对应阶段并由负责人授权。

## Sources of truth

按以下优先级工作：

1. `docs/product/decisions.md`：已拍板与未决事项。
2. `docs/execution/feature-list.json`：功能状态、依赖和可测试验收标准。
3. `docs/product/specs/`：行为与边界的详细规格。
4. `docs/product/brief.md`：产品目标和 MVP 范围。
5. `docs/execution/active-plan.md`：当前获准执行的阶段和步骤。

若文档冲突，停止扩展实现，记录冲突并请求负责人拍板。不得自行把未决事项写成确定事实。

## Traceability

- 产品结论必须引用 `D-xxx` 决策编号或 `E-xxx` 证据编号。
- 新增 P0 功能必须在 `feature-list.json` 中拥有唯一 ID、依赖、风险、验收标准和验证方法。
- 使用“推荐”“待验证”“未决定”区分建议与事实。
- 改变范围、默认勾选、敏感数据、支持平台、第三方依赖或发布门槛时，必须新增或更新决策记录。

## Human decision gates

以下事项必须由负责人拍板：

- 新增迁移数据类别，尤其是密码、账号、浏览器或个人内容；
- 改变 P0/P1、非目标或支持平台；
- 改变默认启用项、用户同意方式或回滚语义；
- 新增生产依赖、第三方系统工具或需要高权限的功能；
- 修改 `.habitpack` 的兼容性或安全边界；
- 创建公开 Release、签名策略、品牌与公开承诺；
- 从文档阶段进入原型或开发阶段。

执行 agent 可自主决定不改变行为的内部文件拆分、命名、格式化、测试夹具组织和重构方式，但必须满足既定验收标准。

## Product safety invariants

- 核心迁移能力必须能离线运行，不依赖账号或大模型。
- 除版本检查外，不发送用户扫描数据；版本检查不得携带配置或设备清单。
- `.habitpack` 不得包含可执行脚本或任意命令。
- 导入数据只能映射到声明式白名单操作，禁止拼接到 Shell 或 PowerShell。
- 第一版迁移包不加密；只有用户主动选择时才包含 Wi‑Fi 密码，并必须标记为含敏感信息。
- Wi‑Fi 密码不得进入日志、报告、界面预览、错误信息或回滚快照。
- 不绕过 UAC、TCC、SIP、Gatekeeper 或 SmartScreen。
- 应用任何设置前必须生成一份迁移前快照；回滚应恢复迁移前状态，而不是猜测出厂值。
- 未签名构建只用于明确知情的 Alpha 测试者。

## Documentation rules

- 用户文档默认使用简体中文；内部 ID、JSON 字段和代码标识使用英文。
- 使用用户能识别的词语，技术术语第一次出现时必须解释。
- 验收标准必须可观察、可重复测试，禁止使用“体验好”“足够快”“界面美观”等不可证伪描述。
- Markdown 相对链接必须有效；JSON 必须是严格 JSON，不能包含注释或尾随逗号。
- 不把私人经验库中的 plist、真实设备 ID、用户名、本地路径、账号或配置备份复制进仓库。

## Validation for documentation changes

在提交前至少运行：

```bash
./scripts/validate-m1
```

该命令会执行严格 JSON、schema、虚构夹具、链接、引用、P0 依赖与空白检查。首次运行会联网安装锁定的开发验证依赖；它不是产品依赖。当前没有应用代码，因此不要声称已运行产品测试。

## Code review rules

- 将未决问题伪装成决定事实属于阻断问题。
- 缺少可测试验收标准的 P0 功能属于阻断问题。
- 任何可能把 Wi‑Fi 密码写入日志、报告或回滚快照的设计属于阻断问题。
- 任何从迁移包执行任意命令、信任路径或解压未验证内容的设计属于阻断问题。
- 任何未经负责人授权开始应用开发或真实系统修改的变更属于阻断问题。
