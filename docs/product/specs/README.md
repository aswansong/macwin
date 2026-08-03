# 产品规格索引

这些规格描述第一版 Windows → Mac 习惯与环境迁移的预期行为。它们不是实现说明，也不代表功能已经完成。[D-002、D-024]

## 阅读顺序

1. [`core-flow.md`](core-flow.md)：端到端流程、状态和异常分支。
2. [`habitpack.md`](habitpack.md)：迁移包结构、兼容性与验证边界。
3. [`platform-modules.md`](platform-modules.md)：键盘、指针、软件、开发环境和 Wi‑Fi 模块。
4. [`privacy-security.md`](privacy-security.md)：隐私、权限、威胁模型和秘密处理。
5. [`ui-content.md`](ui-content.md)：向导、计划、报告、指南和视觉约束。
6. [`testing-release.md`](testing-release.md)：验证矩阵、Alpha 与正式发布门槛。

机器可读的 P0 状态、依赖和验收标准位于 [`feature-list.json`](../../execution/feature-list.json)。已拍板和未决问题分别以 `D-xxx`、`OD-xxx` 记录在 [`decisions.md`](../decisions.md)，设计依据以 `E-xxx` 记录在 [`evidence.md`](../evidence.md)。

## 规范词义

- **必须**：P0 阻断条件；不满足不能称为完成。
- **应该**：强烈推荐；偏离时要记录理由并由负责人确认。
- **可以**：不改变边界时可选。
- **不得**：安全、范围或产品边界的硬限制。
- **待验证**：当前没有足够证据；不能在 README 或 Release 中宣称已支持。

## 当前实现状态

截至 2026-08-03，M1 第二版可点击原型、`.habitpack` `1.0.0` 严格验证档案和 v1.0.0 RC 已归档；当前在 `release/v1.0.1` 收口 `1.0.1-rc.1` 未签名测试包。部分 P0 已标为 `implemented`，但仍需真实设备发布验证；Wi‑Fi 凭据、可信软件自动安装、签名更新、公证和正式 Release 继续受各自决策门约束。[D-039、D-040、E-047]
