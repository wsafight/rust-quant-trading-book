# 阶段检查点二：有界实时行情链路

这个检查点把第 9 至 12 章连接起来：从脚本化输入得到 sequence 连续的 L2 book，在过载、断线和陈旧数据下停止发布可交易状态，并用测量证明性能边界。

> **第一次使用建议**
>
> 先用十几条手写消息完成正常更新、重复消息和编号缺口，不要一开始运行百万事件。状态变化能够逐条解释后，再加入有界队列、突发流量、关闭流程和性能测量。正确性不稳定时，吞吐数字没有验收意义。

## 为什么在这里暂停

正常流量下跑通几条 delta，无法证明实时系统的主要风险边界。多数问题发生在两个状态之间：snapshot 正在获取但 delta 已到达，队列尚未满但数据已经陈旧，socket 仍连接但订阅停止更新，shutdown 已开始但 producer 仍在发送。

本检查点要求把这些过渡状态变成可观察事件，并用同一个 scripted source 重复制造。目标不是做一个真正交易所客户端，而是证明核心 reducer 与任务拓扑在不确定输入下有确定行为。

## 统一验收场景

准备一组包含完整快照和连续增量更新的固定 L2 样本，并由可控时钟和速率的消息源发送：

```text
scripted source -> wire decoder -> bounded channel
                -> synchronizer/book owner -> snapshot consumer
                                      |
                                      v
                           metrics + state transitions
```

source 应支持暂停、加速、删除、重复和关闭消息。测试必须控制事件时间与本地接收时间，不能依赖真实睡眠碰运气。

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

## 推荐实施顺序

先在单线程中验证 snapshot、连续 delta、duplicate 和 gap，得到稳定 checksum；再把 reducer 放入 single-writer task，并通过有界 channel 输入。第三步加入 fake clock、freshness 和 metrics，最后才加入 burst、监督关闭与 benchmark。

每加一层都保留上一层测试。这样可以判断失败来自 book 规则、消息队列、时钟还是 task 生命周期，而不是只能观察整个进程偶发超时。

容量推导至少记录：正常/峰值生产速率、稳定消费速率、允许 burst 时长、单消息内存和最大可接受 queue age。例如峰值每秒 80,000、消费每秒 50,000、允许 200 ms burst，只按差额估算也需要约 6,000 条缓冲；但若 200 ms 已超过行情 freshness gate，再大的队列也没有业务价值。

## 自动验收

测试至少注入：重复 delta、缺失一条 delta、跨范围 delta、两倍 burst、channel 关闭、ping 正常但业务事件停止。gap 后 `best_bid`、mid 或策略输入必须不可用，直到新 snapshot 完成同步。

```bash
cargo test --all-targets
cargo bench --bench parse_level
```

benchmark 报告必须注明 release 模式、CPU/OS/Rust 版本、输入、样本数、p50/p99/p99.9 或 Criterion 分布以及正确性 checksum。

## 人工演示

先正常回放 30 秒，再删除一条 delta。演示系统如何检测 gap、停止发布、获取新 snapshot、应用缓冲区并恢复。随后把 producer 提速到 consumer 的两倍，说明队列满之前由哪个 age 阈值触发降级。

最后执行一次受控关闭：先停止产生新输入，让 reducer 排空或按策略丢弃剩余数据，发布最终状态并等待 task 结束。演示不能依赖强制终止进程；若设置 shutdown deadline，要展示超时后保留的诊断信息。

## 评分量表

每项 0–2 分，满分 10 分；“同步正确性”或“失效保护”为 0 时不能通过。

| 维度 | 0 分 | 1 分 | 2 分 |
| --- | --- | --- | --- |
| 同步正确性 | snapshot/delta 无明确连接规则 | 正常序列正确但异常覆盖不足 | duplicate、range、gap 与 resync 均确定 |
| 失效保护 | gap/stale 后仍发布派生值 | 能失效但恢复 gate 含糊 | invalid 到 resync 的全程不可交易 |
| 背压与生命周期 | 无界队列或 task 无监督 | 有界但容量/关闭依据不足 | 容量、满载、监督与关闭均可解释 |
| 可观测性 | 只看进程存活或总吞吐 | 有部分 sequence/age 指标 | sequence、queue、book age 与状态齐全 |
| 性能证据 | 只报一次平均耗时 | 有 benchmark 但环境或正确性不全 | 固定输入、分位数、环境与 checksum 齐全 |

建议达到 8 分以上，并且重复运行得到相同最终 book 与状态转换序列。

## 通过证据

- 一份同步状态图和一份过载策略表。
- 正常/gap/burst 三组测试日志与稳定 checksum。
- 一页性能实验，包含未改善的指标和测量局限。

还应保存事件时间线，至少标出 source send、channel enqueue/dequeue、book apply、snapshot publish 和 invalidation。时间线让“处理慢”和“数据本来就晚到”可以分开讨论。

## 未通过时怎样回补

| 观察到的问题 | 回到章节 | 回补动作 |
| --- | --- | --- |
| gap 后 book 仍可查询 | 第 9 章 | 把同步状态纳入公开 API |
| 重复 delta 改变最终状态 | 第 9 章 | 固定 sequence/range 规则和 fixture |
| 队列容量来自猜测 | 第 10 章 | 用速率差、burst 和 age 预算推导 |
| task 退出后进程仍假装健康 | 第 10、11 章 | 建立 supervisor 与退出原因 |
| ping 正常就认为行情正常 | 第 11 章 | 分开 transport 与 valid-event freshness |
| 只报告平均值或 debug 性能 | 第 12 章 | 固定 release workload 与尾分位数 |

若队列容量只是随手写的常数，回到第 10 章；若只报告平均耗时，回到第 12 章；若 gap 后仍能取 mid，回到第 9 章。

通过后冻结 fixture、同步规则和性能基线。第三部分将基于这个 valid book 讨论价格、队列与成交，不再把协议缺口误当成市场信号。
