# Visual polish v5：平台标识

## 本次调整

- Mac 目标端在流程眉标、顶部平台标签和 Mac 流程终点显示 Apple 标志。
- Windows 来源端在流程眉标、顶部平台标签和 Windows 流程终点显示四窗格标志。
- 标志使用本地内联字符与 SVG，不加载外部图片或字体资源。

## 验证

- Mac 与 Windows 正常场景均可渲染对应标志。
- 390×844 窄屏下两端 `scrollWidth` 与 `clientWidth` 均为 390，无横向溢出。
- `npm test`、`npm run build` 与 `git diff --check` 通过。

