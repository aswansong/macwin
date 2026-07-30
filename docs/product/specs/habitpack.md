# `.habitpack` M1 格式规格

状态：M1 格式验证档案；不是公开兼容性承诺、生产解析器或真实 Wi‑Fi 能力。[D-009、D-019、D-027]

## 1. M1 验证档案

M1 只接受精确的 `schema_version: "1.0.0"`。其他 major、minor、patch 和非 `major.minor.patch` 字符串全部拒绝。这个严格档案用于消除当前样例的歧义，不决定未来兼容窗口；OD-011 仍未解决。

固定上限如下：

| 对象 | M1 上限 |
|---|---:|
| 压缩包 | 8 MiB |
| 总解压字节 | 16 MiB |
| ZIP 条目 | 128 |
| `manifest.json` | 64 KiB |
| 其他 JSON | 1 MiB/文件 |
| Wi‑Fi 秘密 | 64 KiB/文件 |
| UTF-8 路径 | 240 字节 |
| 单条目压缩比 | 100:1 |
| 每模块候选 | 64 |
| Wi‑Fi 候选 | 64 |

这些值只属于 M1 验证档案，不是发布后的永久承诺。

## 2. 唯一允许的文件

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
└── secrets/
    └── wifi/
        └── <opaque-id>.bin
```

除 `manifest.json` 与 `selections.json` 外，模块文件按需出现；秘密文件只在 Wi‑Fi 候选明确引用时出现。除此之外的文件和目录全部拒绝：

- 不存在 `raw/`，也不接受通用 `system.json`；
- 不允许新增尚未决定的数据类别；
- 不允许目录条目、符号链接、硬链接、设备/特殊文件、嵌套压缩包、ZIP64 或加密 ZIP；
- ZIP 必须是严格单卷、零 archive comment、无 SFX/任意前缀、无 EOCD 尾随数据、无条目间隙或其他未声明区域；首个 local header 位于偏移 0，连续的 local entries 后紧接中央目录和最终 22 字节 EOCD；
- M1 构建器不使用 data descriptor，对应 flag 一律拒绝；这是 M1 验证档案限制，不是未来公开 ZIP 兼容承诺；
- local header 与中央条目的 `extra_length` 都必须为 0；任何 extra 都拒绝，结构化 ZIP64 extra 仍优先按 ZIP64 拒绝；
- general-purpose flags 必须精确为 0；加密与 data descriptor 保留更具体的安全错误，其余保留位或未知位按 `HP_ZIP_FLAGS` 拒绝；
- 压缩方法只允许 Stored（0）与 Deflate（8）；BZIP2、LZMA 和未知方法按 `HP_ZIP_COMPRESSION` 拒绝；
- Stored 的 `version_needed` 固定为 10，Deflate 固定为 20；两侧必须一致。`version_made_by` 固定为 `0x0314`（Unix host、2.0）；
- DOS time/date 固定为 `0x0000/0x0021`（1980-01-01 00:00:00）；`internal_attr=0`，`external_attr=(Unix regular file | 0600) << 16` 且低 16 位为 0；
- local entries 固定以 `manifest.json` 为第一项，其余按 UTF-8 路径字节升序；中央目录必须使用完全相同的顺序并指向对应 local header；
- 上述无 extra、flags 0 和两种压缩方法都是 M1 构建器验证档案，不是未来公开兼容承诺；
- 不允许 POSIX/Windows 绝对路径、反斜杠、`..`、重复条目、大小写折叠碰撞或 Unicode NFC 碰撞；
- 不允许可执行扩展、MZ、ELF、Mach-O、shebang、脚本、`command` 或 `shell` 字段。[D-027]

## 3. 单一事实源

`manifest.files` 是除 manifest 自身外唯一的文件、媒体类型、解压后字节数和 SHA-256 索引；manifest 不再包含 `modules` 数组。ZIP 中每个非 manifest 文件必须被恰好声明一次，每个声明也必须对应一个实际条目。

`selections.json` 是 Windows 选择的唯一事实源：

- `selected_candidate_ids` 只引用模块文件中存在的候选；
- `candidate_id` 在整个包中全局唯一；
- 模块只表达候选及检测事实，不含 `selected`；
- 是否生成个性化指南只由 `guide_requested` 表达；
- 常用软件候选可标为 `proposed_on_mac`，最终只在 Mac 强制计划中确认一次。[D-028]

扫描可以发现未选择的 Wi‑Fi 网络候选，但只有出现在 `selected_candidate_ids` 中的候选才能携带 `credential_ref` 或对应秘密文件。未选择候选必须保持 `not_selected`/`unavailable` 且不含秘密引用；校验器以 `HP_SECRET_UNSELECTED` 拒绝任何绕过选择边界的凭据。

后端候选仍保留规则 ID、规则版本、来源、状态和排除原因；首层 UI 是否展示这些字段由 UI 规格决定。

## 4. Schema 与跨文件校验

逐文件 Draft 2020-12 JSON Schema 位于 [`schemas/habitpack/1.0.0/`](../../../schemas/habitpack/1.0.0/)。所有结构对象关闭未知属性；重复 JSON 键在 schema 之前直接拒绝。

Schema 负责单文件形状和允许值。Python 3.11+ 开发校验器负责 schema 无法单独保证的容器与跨文件关系：路径、ZIP 元数据、资源上限、媒体类型、声明/实际文件、原始字节大小和哈希、全局候选唯一性、选择引用、规则目录及秘密一一对应。

`rule-catalog.m1.json` 只包含 `fixture.` 前缀的虚构规则。未知规则、版本或参数都会拒绝；它不是 OD-003 所需的生产白名单，也不能驱动系统动作。

## 5. Wi‑Fi 虚构秘密

Wi‑Fi 候选的 `credential_status` 只有：

- `not_selected`：禁止 `credential_ref`；
- `unavailable`：禁止 `credential_ref`；
- `available`：必须有且只有一个 `credential_ref`。

引用必须落在 `secrets/wifi/<opaque-id>.bin`，引用候选必须已由用户选择，每个秘密只能被一个候选引用；未选携密、缺失、孤立、共享、错误目录或错误媒体类型全部拒绝。`manifest.contains_secrets` 必须与实际秘密文件存在性一致。

M1 只验证虚构不透明字节、引用、大小和哈希，不定义编码、解码器或平台接口。OD-005 继续阻断任何真实 Wi‑Fi 凭据生产实现。[D-019、OD-005]

## 6. 完整性而非真实性

`manifest.files[].sha256` 只发现传输损坏和内容不一致。攻击者可以同时替换 manifest 与内容，所以 SHA-256 不证明来源、发布者或规则可信。OD-006 仍阻断生产更新、离线规则包与来源真实性方案。

SHA-256、size 和 schema 都针对解压后的原始文件字节；Deflate 可使用不同压缩级别，压缩流与整个 ZIP 不要求字节级完全一致。只有上述 header、布局和顺序字段需要规范化。

校验器在读取或解压内容前从文件末尾的固定 EOCD 验证单卷字段、中央目录范围、每个中央条目和 local header/压缩数据的连续边界，并按 ZIP64 locator 与 extra 的结构位置拒绝 ZIP64。它不在不透明内容中裸搜 ZIP 签名字节，因此合法秘密即使包含 EOCD、ZIP64 EOCD 或 locator 签名片段也不会被误判。随后再检查路径、类型、加密、条目数、大小、压缩比和可执行魔数，并进行严格 JSON、schema、媒体、声明、哈希、规则、选择与秘密关系校验。任何一步失败都不把内容交给执行层。

稳定错误格式为 `ERROR [HP_ERROR_CODE] fixture:path`。秘密内容永远不进入错误或日志。

## 7. 虚构夹具与统一命令

[`fixtures/m1/fixture-matrix.json`](../../../fixtures/m1/fixture-matrix.json) 保存 8 个有效包来源描述和覆盖容器、JSON、版本、规则、选择、秘密及可执行内容的无效变体。构建器只在临时目录生成实际 `.habitpack`，并通过同一个校验入口读取；仓库不保存迁移包。

运行：

```bash
./scripts/validate-m1
```

首次运行会创建被忽略的开发验证虚拟环境，并按 `requirements.lock` 安装固定版本的 `jsonschema` 及其直接/传递依赖。该依赖只服务仓库验证，不是产品运行时依赖。统一命令还会检查 schema 自身、所有夹具、单元测试、严格 JSON、Markdown 相对链接与片段、D/OD/E 引用、P0 验收 ID 和依赖图、当前里程碑一致性以及等价的 `git diff --check`。

格式资产只证明 schema、容器和虚构夹具的验证行为，不证明 Windows 导出、Mac 导入、真实秘密处理或任何系统修改能力。
