# 第 9 章 订单簿数据结构与不变量

本章实现第一个有真实交易语义的数据结构：L2 订单簿。目标不是追求最快，而是先得到边界清楚、可测试、可替换的正确基线。

> **学习导航**　前置：通过检查点一，掌握有序集合、newtype 与测试｜目标：从 snapshot/连续 delta 构造具有明确有效性的 L2 book｜预计：10–12 小时｜产出：订单簿 reducer、gap fixture、top-N/sweep 与 checksum

## 9.1 L1、L2 与 L3

- L1 只有 best bid、best ask 及对应数量。
- L2 按价格聚合数量，常见行情是 snapshot 加增量。
- L3 包含逐订单事件，更接近真实队列，但并非所有交易所提供。

只有 L2 时，无法精确知道自己的 queue position。后续回测必须把排队当作模型，不可把它伪装成已知事实。

## 9.2 为什么从 `BTreeMap` 开始

订单簿需要按价格有序、更新单档、获取最优价。`BTreeMap` 提供确定的顺序和对数复杂度，适合正确性基线：

```rust
use std::collections::BTreeMap;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Side {
    Buy,
    Sell,
}

#[derive(Debug, Default)]
struct OrderBook {
    bids: BTreeMap<i64, i64>,
    asks: BTreeMap<i64, i64>,
}

impl OrderBook {
    fn update(&mut self, side: Side, price: i64, qty: i64) {
        let levels = match side {
            Side::Buy => &mut self.bids,
            Side::Sell => &mut self.asks,
        };

        if qty == 0 {
            levels.remove(&price);
        } else {
            levels.insert(price, qty);
        }
    }

    fn best_bid(&self) -> Option<(i64, i64)> {
        self.bids.last_key_value().map(|(p, q)| (*p, *q))
    }

    fn best_ask(&self) -> Option<(i64, i64)> {
        self.asks.first_key_value().map(|(p, q)| (*p, *q))
    }

    fn is_valid(&self) -> bool {
        matches!((self.best_bid(), self.best_ask()),
            (Some((bid, _)), Some((ask, _))) if bid < ask)
    }
}

fn main() {
    let mut book = OrderBook::default();
    book.update(Side::Buy, 100, 3);
    book.update(Side::Buy, 99, 5);
    book.update(Side::Sell, 101, 2);
    assert_eq!(book.best_bid(), Some((100, 3)));
    assert_eq!(book.best_ask(), Some((101, 2)));
    assert!(book.is_valid());
}
```

当前代码仍需校验 `price > 0`、`qty >= 0`，并将 primitive 换成领域类型。先让行为清楚，再做精化。

`is_valid()` 只表示 snapshot/delta 链通过了结构校验；空侧或单边 book 仍可能结构有效，但不能作为可交易报价。实现中应另外提供 `is_tradable()`，要求 bid 和 ask 都存在。行情新鲜度还要根据 receive/process 时间和年龄阈值单独判断，不能从结构状态推断。

## 9.3 Snapshot 不是一串普通更新

snapshot 表示某个序列点的完整状态。应用它时应先构造临时 book，完整校验后原子替换，而不是边解析边暴露半个 snapshot：

```rust
use std::collections::BTreeMap;

#[derive(Debug, PartialEq, Eq)]
enum SnapshotError {
    InvalidLevel,
    Crossed,
}

fn build_side(levels: &[(i64, i64)]) -> Result<BTreeMap<i64, i64>, SnapshotError> {
    let mut side = BTreeMap::new();
    for &(price, qty) in levels {
        if price <= 0 || qty <= 0 {
            return Err(SnapshotError::InvalidLevel);
        }
        side.insert(price, qty);
    }
    Ok(side)
}

fn validate_snapshot(
    bids: &[(i64, i64)],
    asks: &[(i64, i64)],
) -> Result<(), SnapshotError> {
    let bids = build_side(bids)?;
    let asks = build_side(asks)?;
    let best_bid = bids.last_key_value().map(|(p, _)| *p);
    let best_ask = asks.first_key_value().map(|(p, _)| *p);
    if matches!((best_bid, best_ask), (Some(b), Some(a)) if b >= a) {
        return Err(SnapshotError::Crossed);
    }
    Ok(())
}

fn main() {
    assert_eq!(validate_snapshot(&[(100, 2)], &[(101, 4)]), Ok(()));
    assert_eq!(
        validate_snapshot(&[(102, 2)], &[(101, 4)]),
        Err(SnapshotError::Crossed)
    );
}
```

空侧是否允许取决于产品和协议。不要把教学假设默认为交易所规则。

## 9.4 序列号是数据的一部分

一个合理数值不一定来自完整事件链。book 必须带同步状态：

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum SyncState {
    Empty,
    Synchronizing,
    Healthy { last_sequence: u64 },
    Invalid,
}

#[derive(Debug, PartialEq, Eq)]
enum SequenceDecision {
    Apply,
    Duplicate,
    Gap,
}

fn sequence_decision(last: u64, next: u64) -> SequenceDecision {
    if next == last + 1 {
        SequenceDecision::Apply
    } else if next <= last {
        SequenceDecision::Duplicate
    } else {
        SequenceDecision::Gap
    }
}

fn main() {
    assert_eq!(sequence_decision(10, 11), SequenceDecision::Apply);
    assert_eq!(sequence_decision(10, 10), SequenceDecision::Duplicate);
    assert_eq!(sequence_decision(10, 13), SequenceDecision::Gap);
}
```

这只是通用演示。真实 venue 可能提供区间 update ID、前序 ID、channel sequence 或 checksum。adapter 必须实现官方同步算法。遇到 gap 后应标记 `Invalid`，停止向策略发布可信 book，重新获取 snapshot 并对齐。

## 9.5 Trait 定义能力，不抹平语义

trait 适合抽象稳定的领域能力：

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct NormalizedLevel {
    price_ticks: i64,
    qty_lots: i64,
}

#[derive(Debug, PartialEq, Eq)]
enum DecodeError {
    Malformed,
}

trait MarketDataDecoder {
    fn decode_level(&self, wire: &str) -> Result<NormalizedLevel, DecodeError>;
}

struct CsvFixtureDecoder;

impl MarketDataDecoder for CsvFixtureDecoder {
    fn decode_level(&self, wire: &str) -> Result<NormalizedLevel, DecodeError> {
        let (price, qty) = wire.split_once(',').ok_or(DecodeError::Malformed)?;
        Ok(NormalizedLevel {
            price_ticks: price.parse().map_err(|_| DecodeError::Malformed)?,
            qty_lots: qty.parse().map_err(|_| DecodeError::Malformed)?,
        })
    }
}

fn main() {
    let decoder = CsvFixtureDecoder;
    assert_eq!(
        decoder.decode_level("100,7"),
        Ok(NormalizedLevel { price_ticks: 100, qty_lots: 7 })
    );
}
```

不要为了统一接口隐藏这些差异：sequence/checksum、post-only、reduce-only、position mode、amend 原子性、client ID 作用域、funding 和保证金。adapter 应显式发布 capability，策略在启动时校验依赖。

## 9.6 泛型还是 `dyn Trait`

泛型使用静态分发，编译器可以内联，但会为不同类型生成代码。`dyn Trait` 使用动态分发，适合运行时选择插件或低频边界。选择依据包括：

- 是否位于已测得的热路径。
- 是否需要运行时切换实现。
- 编译时间和代码体积是否重要。
- 测试替身是否容易注入。

“泛型一定更快”不是完整结论。用真实 workload 测量。

## 9.7 迭代器与分配

迭代器可以清楚表达数据变换，通常不会天然比手写循环慢：

```rust
fn visible_depth(levels: &[(i64, i64)], max_levels: usize) -> i64 {
    levels
        .iter()
        .take(max_levels)
        .map(|(_, qty)| *qty)
        .sum()
}

fn main() {
    let levels = [(100, 3), (99, 5), (98, 7)];
    assert_eq!(visible_depth(&levels, 2), 8);
}
```

真正需要警惕的是热路径上反复 `collect::<Vec<_>>()`、字符串格式化、通用 JSON value 和无意义 clone。是否构成瓶颈仍需 profile。

## 9.8 订单簿不变量

至少持续验证：

- price 与 qty 符合 tick/lot 和非负规则。
- best bid 小于 best ask；异常时 book 不可用于增险。
- 当前 sequence 与协议连续。
- 删除不存在档位的语义符合 venue 规则。
- checksum（若有）与官方算法一致。
- snapshot/delta 对齐完成前不发布 `Healthy`。

## 9.9 一次完整的同步序列

假设某 venue 的规则是：snapshot 带 `last_sequence`，每个 delta 带单一递增 sequence。连接后发生以下事件：

```text
t0  开始订阅，缓存 delta 101、102、103
t1  REST snapshot 返回 last_sequence=100
t2  丢弃 <=100 的缓存事件（这里没有）
t3  依次应用 101、102、103，校验 book
t4  进入 Healthy(last_sequence=103)
t5  收到 104，正常应用
t6  收到 106，发现期望 105，立即 Invalid
t7  继续收到 107、108，但不得在旧 book 上继续发布
t8  重新获取 snapshot=107，按协议衔接 108
t9  校验后恢复 Healthy(108)
```

这段流程里最容易犯的错误，是在 `t6` 后继续使用看似合理的 top-of-book，或用 `106` 直接跳过缺口。缺少的 `105` 可能删除了某个大档位，后来所有计算都建立在错误深度上。

还有两个工程细节：

第一，snapshot 请求和增量缓存存在竞争。如果 REST 太慢，缓存可能达到容量。正确动作是放弃本轮同步、重新建立边界，而不是丢掉最旧 delta 后继续。第二，切换新 book 应是原子的。策略只能看到旧的完整 `Invalid` 状态，或新的完整 `Healthy` 状态，不能看到快照加载到一半。

真实 venue 经常比这个例子复杂：delta 可能携带 `[first_update_id, final_update_id]`、`previous_sequence` 或多个 channel sequence。实现前先把官方算法转换成事件表，再录制 fixture 验证边界值。

## 9.10 数据结构的 workload 推导

订单簿结构不能脱离数据分布讨论：

| 结构 | 优点 | 代价 | 适合场景 |
| --- | --- | --- | --- |
| `BTreeMap` | 有序、更新稳定、基线清楚 | 节点分配、局部性一般 | 档位稀疏、先保证正确 |
| 排序 `Vec` | 紧凑、遍历/top-N 快 | 中间插删搬移 | 档位少、读多写少 |
| 稠密 price ladder | O(1) 索引、cache 友好 | 价格范围大时浪费内存 | tick 范围有限且密集 |
| hash + best cache | 单档更新快 | 顺序查询复杂、cache 失效 | 只需少量 top 信息 |
| 混合结构 | 可按访问模式优化 | invariant 和维护复杂 | profile 证明单结构不足 |

选择前采集：每个 snapshot 档位数、增量更新分布、价格跳跃范围、top-N 查询频率、全量遍历频率和 resync 次数。随后用同一 fixture 比较端到端 book update、top query、allocation 和 p99.9，并校验最终 checksum。

不要把 matching engine 的逐订单结构直接套到 L2 market-data book。两者的事实层级和操作模式不同：L2 是聚合投影，matching engine 还要维护价格档内部 FIFO 与订单索引。

## 9.11 Adapter 契约测试

trait 只规定通用输出，adapter 的危险语义要通过契约测试固定。每家 venue 至少保存：

- 正常 snapshot 与连续 delta。
- 边界衔接、重复、乱序和 gap。
- 删除档位的 wire 表达。
- price/qty 精度与极大字段。
- checksum 官方样例。
- 未知字段、schema 新增和错误消息。

契约测试应同时断言 normalized event 和同步状态。例如 decoder 正确解析 `sequence=106` 并不表示 synchronizer 可以应用它。解析契约与状态契约分开，定位失败更直接。

当官方规则改变时，先增加新 fixture 和 metadata version，再更新 adapter。不要覆盖旧 fixture；历史回放需要用当时版本解析，或者显式迁移并记录结果变化。

## 9.12 本章练习

1. 把订单簿实现换成 `PriceTicks` 和 `QtyLots`，禁止负数量进入 map。
2. 增加 top-N、mid、spread 和 sweep-to-quantity 计算，并覆盖空侧和深度不足。
3. 注入重复事件与 sequence gap，验证 gap 后无法获得可交易 mid。
4. 保留固定 fixture，使同一事件流每次得到相同 book checksum。

本章完成标准：能从 snapshot 与连续 delta 得到确定状态，能在 gap 后拒绝发布行情，并能解释数据结构选择的 workload 假设。
