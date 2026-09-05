# 第 9 章 订单簿数据结构与不变量

本章实现第一个有真实交易语义的数据结构：L2 订单簿。目标不是追求最快，而是先得到边界清楚、可测试、可替换的正确基线。

> **学习导航**
>
> - 开始前：通过检查点一，会使用有序集合、单位类型和测试。
> - 这一章学会：用完整快照和连续变化维护一份可信订单簿。
> - 大约需要：10–12 小时。
> - 做完留下：订单簿更新器、缺口样本、前几档查询和结果校验值。

> **开章场景：订单簿少了一条消息**
>
> 交易所先发来编号 100 的完整订单簿，随后依次发来 101、102 和 104 号更新。程序照常应用了 104，屏幕上的买卖价仍然很像真实行情。但 103 号消息可能删除了一档价格，也可能加入了一笔大订单；从漏掉它开始，本地订单簿就不能再被相信。
>
> 订单簿不只是价格列表，还必须满足序列连续、买卖不交叉、数量合法等规则，这些始终应成立的规则叫不变量。**本章要解决的是：怎样根据完整快照和连续更新维护订单簿，并在证据不足时立即停止发布。**

> **第一次阅读建议**
>
> 先读 9.1、9.3、9.4 和 9.9。把订单簿理解成“先取得一张完整底稿，再按编号连续修改”；一旦中间缺号，旧结果就暂时不能交易。第一次可以跳过 9.5 至 9.7 和 9.10 的接口、泛型与性能选择，先完成 9.12 的前四项练习。

## 9.1 先分清三种订单簿粒度

- 第一档行情（L1）只显示最高买价（best bid）、最低卖价（best ask）及对应数量。
- 聚合深度行情（L2）显示多个价格档，并把相同价格的数量加在一起。常见传输方式是一份完整快照加后续增量更新。
- 逐笔订单行情（L3）进一步显示每一张订单的变化，更接近真实排队情况，但并非所有交易所提供。

只有 L2 时，你只知道某个价格一共有多少数量，不知道前面具体有多少张订单。因此无法精确知道自己的排队位置（queue position）。后续回测必须把排队当作估计模型，不可把它伪装成已知事实。

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

当前代码仍需校验 `price > 0`、`qty >= 0`，并将裸整数换成带单位的领域类型。先让行为清楚，再做精化。

`is_valid()` 只表示 snapshot/delta 链通过了结构校验；空侧或单边 book 仍可能结构有效，但不能作为可交易报价。实现中应另外提供 `is_tradable()`，要求 bid 和 ask 都存在。行情新鲜度还要根据 receive/process 时间和年龄阈值单独判断，不能从结构状态推断。

## 9.3 快照不是一串普通更新

快照（snapshot）表示某个序列点的完整状态。应用它时应先构造一份临时订单簿，全部校验通过后一次替换，而不是一边解析、一边让其他组件看到只更新了一半的状态：

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

配套工程的完整实现位于 `book/code/src/order_book.rs`。其中 `apply_delta` 先 clone 两侧、在临时 book 上应用并校验，成功后才整体提交；失败时旧内容仍保留但 book 会被标记为不可交易。这是清晰的正确性基线，不代表热路径的唯一实现。只有 profile 证明整本复制是瓶颈后，才考虑原地更新、undo log 或 copy-on-write，并保持“失败不暴露半本 book”的提交语义。

## 9.4 序列号用来发现漏掉的更新

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

这只是通用演示。真实交易所可能提供一段编号范围、前一编号、通道序列号或内容校验值。适配器必须按官方同步规则实现。遇到编号缺口（gap）后应标记 `Invalid`，停止向策略提供订单簿，重新获取快照并对齐。

## 9.5 共同接口不能抹平交易所差异

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

## 9.6 何时在编译时或运行时选择实现（进阶）

泛型使用静态分发，编译器可以内联，但会为不同类型生成代码。`dyn Trait` 使用动态分发，适合运行时选择插件或低频边界。选择依据包括：

- 是否位于已测得的热路径。
- 是否需要运行时切换实现。
- 编译时间和代码体积是否重要。
- 测试替身是否容易注入。

“泛型一定更快”不是完整结论。用真实 workload 测量。

## 9.7 迭代器是否会拖慢程序（进阶）

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

## 9.10 根据实际读写方式选择数据结构（进阶）

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

## 9.11 用固定样本检验交易所适配器

共同接口只规定通用输出，交易所适配器的危险差异要通过契约测试固定。这里的契约测试，是用保存下来的原始消息反复验证“这种输入必须得到这种结果”。每家交易所至少保存：

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

## 9.13 回顾与下一章

订单簿不是一个永远可查询的 map，而是带同步状态、序列证据和不变量的投影。snapshot 建立基线，delta 只有满足 venue 的连接规则才能应用；一旦 gap 无法解释，正确动作是使可交易视图失效并重新同步，而不是继续计算一个看似平滑的 mid。

这里要区分三层结果：decoder 能解析字段、synchronizer 能接受序列、book 在应用后仍满足不变量。把它们拆开，错误才能分别指向 schema、时序或数据状态。相同 fixture 的最终 checksum 则为回放和后续优化提供正确性基线。

下一章把单线程 reducer 放进生产者和消费者速度不同的任务系统。届时不能只问“每条 delta 是否正确”，还要决定队列满时发生什么、状态由哪个 task 拥有，以及关闭或取消会不会留下未知副作用。
