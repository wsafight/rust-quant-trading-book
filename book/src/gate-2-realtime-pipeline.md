# 阶段检查点二：有界实时行情链路

这个检查点把第 9 至 12 章连接起来：从脚本化输入得到 sequence 连续的 L2 book，在过载、断线和陈旧数据下停止发布可交易状态，并用测量证明性能边界。

## 前置条件

- 已通过检查点一，领域值不再以无单位 primitive 穿过模块边界。
- 能解释 snapshot/delta、single writer、bounded channel、取消安全和尾延迟。
- 能运行 `book/code` 中的订单簿和 Tokio 测试。

## 必做任务

1. 构建 `scripted source -> decoder -> bounded channel -> L2 reducer -> consumer`。
2. 明确 snapshot 与 buffered delta 的衔接条件；gap、crossed book 或非法数量会使 book invalid。
3. 同时记录 sequence、last-valid-event、queue depth、queue residence time 和 book age。
4. 实现正常关闭、输入陈旧、队列满、producer panic 和重连后的状态转换。
5. 为固定的百万事件 fixture 建 benchmark，并输出最终 checksum 防止“优化”改变结果。

## 自动验收

测试至少注入：重复 delta、缺失一条 delta、跨范围 delta、两倍 burst、channel 关闭、ping 正常但业务事件停止。gap 后 `best_bid`、mid 或策略输入必须不可用，直到新 snapshot 完成同步。

```bash
cargo test --all-targets
cargo bench --bench parse_level
```

benchmark 报告必须注明 release 模式、CPU/OS/Rust 版本、输入、样本数、p50/p99/p99.9 或 Criterion 分布以及正确性 checksum。

## 人工演示

先正常回放 30 秒，再删除一条 delta。演示系统如何检测 gap、停止发布、获取新 snapshot、应用缓冲区并恢复。随后把 producer 提速到 consumer 的两倍，说明队列满之前由哪个 age 阈值触发降级。

## 通过证据

- 一份同步状态图和一份过载策略表。
- 正常/gap/burst 三组测试日志与稳定 checksum。
- 一页性能实验，包含未改善的指标和测量局限。

若队列容量只是随手写的常数，回到第 10 章；若只报告平均耗时，回到第 12 章；若 gap 后仍能取 mid，回到第 9 章。

