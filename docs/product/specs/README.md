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

截至 2026-08-01，M1 第二版可点击原型和 `.habitpack` `1.0.0` 严格验证档案已经完成，M2 Wave 0 仅获隔离研究授权。本仓库没有生产应用代码、真实规则或安装器；所有 P0（包括 P0-004）仍为 `specified`，原型与虚构夹具结果不构成产品实现或真实设备测试，真实平台 R2 其余部分继续未授权。[D-024、D-028、D-029、E-018]
