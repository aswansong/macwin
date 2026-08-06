# MacWin M1 visual fidelity v6

这份记录对应 `prototype/visual-fidelity-v6-reference-lock`。本轮只重构展示层，保留现有状态机、场景参数、计划确认、详情说明、失败隔离和恢复逻辑；原型仍使用虚构数据，不读取或写入真实系统。

## 1584 × 1024 视觉自检

逐页在本地 Vite 页面截取实现图，并与五张参考图生成左右并排图和 50% 透明叠加图。分数是对宏观构图、票据材质、层级、留白、主色和操作位置的人工复核，不是像素级相似度。

| 页面 | 宏观匹配 | 关键复核 |
| --- | ---: | --- |
| Mac 首页 / B | 92/100 | Mac 窗口顶栏、左文案右横向通行证、皮带与金属环、四模块色块、Windows → Mac 路线和导入按钮 |
| Mac 计划 / C | 91/100 | 左侧 24% 进度 rail、珊瑚色当前步骤、右侧双分组计划、风险标记、底部取消/确认栏；分组数量遵循已确认产品决定 |
| Windows 检测 / W1 | 93/100 | Windows 标题栏、Windows 四窗格标记、四行检测清单、右侧竖向空票、底部开始检测 |
| Windows 选择 / W2 | 92/100 | 44/56 分栏、复选清单、横向票据即时同步、票据下方提示、固定底部生成操作 |
| Windows 导出 / W3 | 92/100 | 左侧三步 rail、中间竖票、右侧结果摘要与导出按钮，列宽和对齐关系接近参考构图 |

所有页面均达到 90 分阈值后才进入测试与提交。对照素材在本目录中：

- `ref-mac-home.png`、`ref-mac-plan.png`
- `ref-windows-detect.png`、`ref-windows-select.png`、`ref-windows-export.png`
- 对应实现截图：`mac-home.png`、`mac-plan.png`、`windows-detect.png`、`windows-select.png`、`windows-export.png`
- 对应复核图：每个页面的 `*-side-by-side.png` 与 `*-overlay-50.png`

整合分支最新五张实际走查截图：`integration-final-mac-home.png`、`integration-final-mac-plan.png`、`integration-final-windows-detect.png`、`integration-final-windows-select.png`、`integration-final-windows-export.png`。

## 交互与响应式复核

- Windows 检测 → 选择 → 导出可完整点击；选择页的操作习惯和 Wi‑Fi 复选状态会同步到票据模块。
- Mac 导入 → 强制计划确认可完整点击；计划只有“系统与习惯”和“软件与开发”两个分组，分组可展开，项目名称可打开详情弹窗。
- 正常场景应用后仍进入结果页，报告、指南和按模块恢复入口保留。
- `uac-denied`、`permission-denied`、`offline`、`third-party-declined`、`module-failed`、`corrupt-package` 场景均可加载且没有 `undefined` 文案；既有场景测试继续覆盖具体状态转换。
- 390 × 844 下 Mac 首页、Windows 检测、Windows 选择和 Mac 计划均无横向溢出（`scrollWidth === clientWidth`）。
- 默认页面不显示预览工具栏；仅 `?preview=1` 才显示原型控制，避免影响正常视觉检查。

## 验证边界

本轮没有实现真实扫描、`.habitpack` 生成/解析、UAC/TCC 授权、Wi‑Fi 凭据处理、软件下载、Homebrew 或第三方工具安装、系统设置写入、真实快照/恢复、签名安装包或 Release。图片中的票据只是 DOM 组件与虚构数据，不是截图背景，也不会触碰用户机器设置。

## v1 整合边界

在 `integration/v1.0.0-visual-fidelity-v6` 中，本文件的五个页面和视觉组件被接入 v1 的真实 Tauri 状态机。浏览器开发预览仍只使用虚构数据；进入 Tauri 后，扫描、`.habitpack` 导出/导入、计划确认、应用、恢复、报告和更新检查继续通过 Rust 命令执行。Wi‑Fi 密码、第三方自动安装、签名、公证和真实设备验收仍保持 v1 的未完成边界，不能由视觉走查替代。
