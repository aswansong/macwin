# M2 Wave 0：虚构软件供应链策略研究

本目录属于 `codex/m2-*` 研究分支，只用于验证 MacWin 的软件来源、签名、许可证和网络状态如何映射为用户可理解的结果。

本研究流完全离线：

- `fixtures.json` 只包含虚构元数据，不是可下载的软件清单；
- `policy.py` 只评估元数据，不访问网络、不读取系统、不安装软件；
- 测试只验证策略分支，不证明任何真实发布者、签名、哈希或许可证事实。

运行：

```bash
python3 -m unittest research/m2-wave0/test_policy.py
```

研究结果写在 [`report.md`](report.md)。它不会改变 v1 生产软件安装行为，也不能关闭 OD-007。
