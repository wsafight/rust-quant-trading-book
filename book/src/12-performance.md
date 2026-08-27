# 第 12 章 性能不是猜出来的

Rust 提供低级控制，但语言本身不会自动给出低尾延迟。交易系统的延迟经常由网络、交易所网关、队列、日志、内存分配和调度共同决定。优化从定义路径开始。

> **学习导航**　前置：第 8–11 章的工程、订单簿与实时 pipeline｜目标：定义业务路径，正确测量分位数并用 profile 验证优化｜预计：8–12 小时｜产出：带环境/checksum 的 benchmark 与一次单变量优化报告

## 12.1 先定义业务路径

至少分开测量：

- market-data wire-to-book。
- book-to-decision。
- decision-to-socket-write。
- order send-to-ack。
- cancel send-to-ack。
- fill receive-to-risk-state。
- queue residence time 与 event-loop lag。

端到端延迟告诉你用户/策略体验，分段延迟帮助定位瓶颈。不要把纯解析 microbenchmark 宣称为订单端到端延迟。

## 12.2 为什么平均值不够

假设 99 次处理耗时 10 微秒，1 次耗时 10 毫秒，平均值约 110 微秒。平均值掩盖了那一次最可能产生 stale quote 的停顿。

报告至少包含 p50、p90、p99、p99.9、max、样本数和目标负载。还要同时记录：

- CPU、内存、操作系统与电源模式。
- Rust/依赖版本和编译参数。
- 输入数据、消息大小、并发和运行时长。
- allocation、context switch、queue depth 与错误数。
- 正确性 checksum 或 replay 结果。

## 12.3 正确使用时钟

进程内 duration 使用单调时钟：

```rust
use std::time::{Duration, Instant};

fn measured_work() -> (u64, Duration) {
    let started = Instant::now();
    let value = (0_u64..10_000).fold(0_u64, |acc, n| acc.wrapping_add(n));
    (value, started.elapsed())
}

fn main() {
    let (value, elapsed) = measured_work();
    assert_eq!(value, 49_995_000);
    assert!(elapsed >= Duration::ZERO);
}
```

wall clock 可能因 NTP 调整而跳变，不能直接计算本地耗时。跨机器和交易所比较必须记录时钟同步状态与不确定性。交易所 timestamp 到底代表采集、网关还是撮合时刻，需要查产品协议。

## 12.4 Benchmark 与 load test

可靠 benchmark 的基本规则：

1. 使用 release build，固定输入和环境。
2. warm-up 后采样，避免初始化污染稳定态。
3. 消费计算结果，防止编译器删除工作。
4. 运行足够久，报告分布而不是一次数字。
5. 在优化前后执行同一正确性测试。

Criterion 适合统计 microbenchmark：

完整 benchmark 位于 `book/code/benches/parse_level.rs`；Criterion 和编译优化的资料入口见[附录 E](appendix-e-references.md)。

```rust,ignore
use std::hint::black_box;

use criterion::{criterion_group, criterion_main, Criterion};

fn parse_level(raw: &str) -> (i64, i64) {
    let (p, q) = raw.split_once(',').unwrap();
    (p.parse().unwrap(), q.parse().unwrap())
}

fn bench_parse(c: &mut Criterion) {
    c.bench_function("parse level", |b| {
        b.iter(|| parse_level(black_box("6000000,42")))
    });
}

criterion_group!(benches, bench_parse);
criterion_main!(benches);
```

示例里的 `unwrap` 只用于固定可信 benchmark fixture；生产 decoder 仍需结构化错误。端到端 load test 则应包含网络任务、队列、状态更新、指标和目标 burst。

## 12.5 先 profile，再修改

常用调查顺序：

1. 复现目标负载和尾延迟问题。
2. 分段埋点确认时间花在哪条路径。
3. 用 CPU flame graph、allocation profiler、系统指标检查热点。
4. 提出单一可证伪假设。
5. 做最小改动，重复相同实验。
6. 检查正确性、p99.9、CPU、内存和复杂度副作用。

“我觉得 clone 慢”不是证据。“typed decoder 占 CPU 样本 38%，其中字符串分配占 61%”才是可以行动的描述。

## 12.6 常见优化顺序

优先级通常是：

1. 删除重复解析、格式转换和无意义跨线程跳转。
2. 把无界队列改成有界，并治理数据 age。
3. 用清晰的状态所有权减少大锁和竞争。
4. 预分配、复用稳定 buffer，减少显著 clone。
5. 改进数据布局、局部性和分支行为。
6. 控制日志同步 I/O、采样和指标标签基数。
7. 再评估 CPU affinity、NUMA、allocator 与系统参数。
8. 最后才考虑 `unsafe`、lock-free 或更底层网络技术。

公网加密交易的网络和 venue 延迟可能远高于本地代码。优化 5 微秒是否有价值，取决于它是否改变 stale fill、queue priority 或容量，而不是数字本身是否更小。

## 12.7 数据布局与 cache

Array of Structs 适合一次处理单个完整事件；Struct of Arrays 适合只扫描某几个字段。选择由访问模式决定。

```rust
#[derive(Clone, Copy)]
struct Level {
    price: i64,
    qty: i64,
}

fn total_qty(levels: &[Level]) -> i64 {
    levels.iter().map(|level| level.qty).sum()
}

fn main() {
    let levels = [Level { price: 100, qty: 3 }, Level { price: 99, qty: 4 }];
    assert_eq!(levels[0].price, 100);
    assert_eq!(total_qty(&levels), 7);
}
```

不要只为理论 cache 优势重写代码。用目标价格档数、更新分布和查询模式比较 `BTreeMap`、有序数组、稠密 price ladder 或混合结构。

## 12.8 False sharing 与跨核迁移

不同线程频繁写入同一 cache line 上的独立字段，会触发 cache line 来回失效。症状可能是 CPU 增加、吞吐抖动、p99 恶化。修复手段包括重新分区所有权、减少共享写、适当 padding；每一种都应测量内存和延迟代价。

## 12.9 `unsafe` 的门槛

使用 `unsafe` 前必须回答：

- profile 证明它解决哪个显著热点？
- safety invariant 是什么，谁负责维护？
- unsafe 是否封装在最小模块和安全 API 后？
- Miri、fuzz、模型测试和回归 benchmark 覆盖了什么？
- 依赖升级或结构变化如何防止 invariant 失效？

自写 lock-free queue、DPDK、kernel bypass、定制 allocator 和手写 SIMD 都不是初始架构默认项。

## 12.10 延迟预算示例

一个预算必须可测且可归因：

| 阶段 | p99 预算 | 超限动作 |
| --- | ---: | --- |
| decode + normalize | 40 µs | profile、减少解析/分配 |
| queue residence | 100 µs | 降载、coalesce 可替代数据 |
| book + decision | 60 µs | 检查状态分片与热点 |
| risk + encode | 40 µs | 减少同步 I/O、缓存 metadata |

这些数字只是格式示例，不是行业标准。预算必须由部署网络、策略 horizon、消息率和风险容忍度推导。

## 12.11 分位数怎样计算和解释

对小样本，可以排序后取 nearest-rank。下面的实现适合教学，不适合高吞吐在线直方图：

```rust
fn percentile(mut samples: Vec<u64>, percentile: f64) -> Option<u64> {
    if samples.is_empty() || !percentile.is_finite() || !(0.0..=100.0).contains(&percentile) {
        return None;
    }
    samples.sort_unstable();
    let rank = ((percentile / 100.0) * samples.len() as f64).ceil() as usize;
    Some(samples[rank.saturating_sub(1).min(samples.len() - 1)])
}

fn main() {
    let samples = vec![10, 11, 12, 13, 1_000];
    assert_eq!(percentile(samples.clone(), 50.0), Some(12));
    assert_eq!(percentile(samples, 100.0), Some(1_000));
}
```

在线系统通常使用 HDR Histogram 或可合并近似 sketch，避免存储每个样本。选择时检查：可表示范围、有效数字、是否出现 coordinated omission、跨线程记录成本和窗口聚合方式。

如果每秒只有 100 个样本，一分钟内 p99.9 的尾部信息非常有限。报告分位数必须同时报告样本数和时间范围；否则小样本的 p99.9 看似精确，实际只接近最大值。

## 12.12 常见 Benchmark 陷阱

- 输入恒定且太小，分支预测和 cache 命中远好于真实流量。
- 编译器发现结果未使用，删除了核心工作。
- benchmark 只测成功解析，忽略错误路径和 schema 变化。
- 每轮包含初始化或文件读取，测到的不是目标函数。
- 多线程 benchmark 没固定并发与 CPU 拓扑。
- 优化版跳过 checksum 或验证，实际上少做了工作。
- 只比较最好一次，不报告方差、回归和环境噪音。
- 用平均 throughput 掩盖周期性 pause。

一个稳健做法是固定多组 fixture：正常消息、小/大 snapshot、极端价格档、未知字段和错误报文。microbenchmark 测单个组件，端到端 replay 测整体影响，两者不能互相替代。

## 12.13 一次 Profile 驱动优化

假设基线 `wire-to-book` p99 为 180 微秒。CPU flame graph 显示 42% 时间在通用 JSON `Value` 解析和字段字符串查找，allocation profile 也显示每条消息产生多个短生命周期对象。

提出假设：改为 typed serde struct，并在 normalize 边界把 price/qty 直接解析到整数，可减少分配与重复查找。

实验必须保持：同一原始 fixture、相同 release profile、相同 CPU、相同事件数和最终 book checksum。结果可能是：

| 指标 | 基线 | typed decoder |
| --- | ---: | ---: |
| throughput | 420k/s | 610k/s |
| p50 | 54 µs | 35 µs |
| p99 | 180 µs | 102 µs |
| p99.9 | 740 µs | 390 µs |
| alloc/event | 7 | 2 |

还不能立即结束。需要检查错误信息是否变差、未知字段是否兼容、schema 变更怎样检测、极大 snapshot 是否仍安全。如果 typed 结构让 venue 特例泄漏到领域层，应把它留在 adapter，而不是为了性能破坏边界。

## 12.14 优化的经济价值

软件延迟只有在改变交易结果时才产生价值。把 book-to-decision 从 80 微秒降到 40 微秒，可能：

- 降低 stale fill 和 negative markout。
- 更早加入 queue，提高特定市场的成交概率。
- 允许在同样 age budget 下处理更多 symbol。
- 缩短风险状态吸收 fill 的时间。

也可能几乎没有价值：公网 RTT 是 20 ms，venue gateway 抖动占 10 ms，策略 horizon 是数秒。此时更重要的优化可能是减少 quote churn、部署到更近区域、改进对冲规则或修复数据 gap。

因此性能报告最后要写业务解释：改善了哪个决策窗口，预计怎样影响 fill/markout/risk，下一瓶颈在哪里。纳秒级 microbenchmark 本身不是量化交易能力。

## 12.15 本章练习

1. 对 `wire -> level -> book update` 建立固定 fixture benchmark，并附 checksum。
2. 分别运行 debug/release，解释为什么前者不能代表生产性能。
3. 注入日志暴增和 2 倍消息 burst，比较 p50 与 p99.9、queue age 和内存。
4. 找出一个真实热点，只修改一项，写下假设、结果和未改善的指标。

本章完成标准：任何“更快”的声明都能回答快在哪条路径、在什么负载、改善哪个分位数、如何确认结果仍然正确。
