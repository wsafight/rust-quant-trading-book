# 第 5 章 集合、字符串与迭代器：处理一组市场事件

单个价格只是一个值，交易系统处理的是价格档、订单、成交和时间窗口。本章学习 `Vec`、`VecDeque`、`HashMap`、`BTreeMap`、字符串和迭代器，并关注它们的所有权与分配成本。

> **学习导航**　前置：第 3–4 章的借用与领域类型｜目标：按访问模式选择集合并正确处理字符串、iterator 与分配｜预计：7–9 小时｜产出：滚动窗口、有序价格档和零中间集合统计

## 5.1 `Vec<T>`：连续、可增长的序列

```rust
fn main() {
    let mut trades = Vec::with_capacity(4);
    trades.push((100_i64, 2_i64));
    trades.push((101, 3));
    assert_eq!(trades.len(), 2);
    assert_eq!(trades[0], (100, 2));
}
```

`with_capacity` 在数量可估计时减少扩容，但 `len` 仍是 0。索引 `trades[10]` 会 panic；外部或动态索引使用 `get`：

```rust
fn main() {
    let levels = vec![(100_i64, 2_i64)];
    assert_eq!(levels.get(0), Some(&(100, 2)));
    assert_eq!(levels.get(1), None);
}
```

中间插入/删除会移动后续元素。价格档更新频繁时，要结合档位数和访问模式选择结构。

## 5.2 `VecDeque<T>`：两端队列

滚动时间窗经常从尾部追加、从头部淘汰：

```rust
use std::collections::VecDeque;

fn push_bounded(window: &mut VecDeque<i64>, value: i64, capacity: usize) {
    if capacity == 0 {
        return;
    }
    if window.len() == capacity {
        window.pop_front();
    }
    window.push_back(value);
}

fn main() {
    let mut window = VecDeque::new();
    for value in [1, 2, 3, 4] {
        push_bounded(&mut window, value, 3);
    }
    assert_eq!(window.into_iter().collect::<Vec<_>>(), vec![2, 3, 4]);
}
```

按条数限制不等于按时间限制。市场消息率变化时，1000 条事件可能代表 10 ms 或 10 s；研究窗口要明确按 event count 还是 clock duration。

## 5.3 `HashMap` 与 `BTreeMap`

`HashMap` 适合按 key 快速查找，不保证价格顺序；`BTreeMap` 保持有序，适合价格档：

```rust
use std::collections::BTreeMap;

fn main() {
    let mut bids = BTreeMap::new();
    bids.insert(99_i64, 5_i64);
    bids.insert(100, 3);
    assert_eq!(bids.last_key_value(), Some((&100, &3)));
}
```

`entry` API 可以一次查找后更新：

```rust
use std::collections::HashMap;

fn main() {
    let mut volume_by_price = HashMap::new();
    for price in [100_i64, 101, 100] {
        *volume_by_price.entry(price).or_insert(0_i64) += 1;
    }
    assert_eq!(volume_by_price.get(&100), Some(&2));
}
```

迭代 `HashMap` 的顺序不稳定，不能把它直接用于 deterministic checksum。需要先按稳定 key 排序，或使用有序结构。

## 5.4 `String` 与 `&str`

`String` 拥有 UTF-8 buffer，`&str` 借用一段有效 UTF-8：

```rust
fn venue_prefix(symbol: &str) -> Option<&str> {
    symbol.split_once(':').map(|(venue, _)| venue)
}

fn main() {
    let symbol = String::from("demo:BTC-PERP");
    assert_eq!(venue_prefix(&symbol), Some("demo"));
}
```

不能用整数索引字符串，因为一个 Unicode 字符可能多个 byte。交易协议字段通常是 ASCII，但 parser 仍要明确字符集合和长度限制。

热路径反复 `format!`、`to_string()` 或拼接会分配。先使用清晰 owned 类型，profile 证明显著后再借用 buffer 或使用预分配。

## 5.5 迭代器所有权

- `iter()` 产生 `&T`，只读借用。
- `iter_mut()` 产生 `&mut T`，可修改。
- `into_iter()` 消费集合，产生 owned `T`。

```rust
fn main() {
    let mut quantities = vec![1_i64, 2, 3];
    for qty in quantities.iter_mut() {
        *qty *= 2;
    }
    let total: i64 = quantities.iter().sum();
    assert_eq!(total, 12);
}
```

遇到 move 错误时先问后续是否还需要集合，再决定 `iter` 还是 `into_iter`，不要先 clone。

## 5.6 `map`、`filter`、`fold`

```rust
fn positive_notional(fills: &[(i64, i64)]) -> i128 {
    fills
        .iter()
        .filter(|(_, qty)| *qty > 0)
        .map(|(price, qty)| i128::from(*price) * i128::from(*qty))
        .sum()
}

fn main() {
    let fills = [(100_i64, 2_i64), (101, -1), (102, 3)];
    assert_eq!(positive_notional(&fills), 506);
}
```

迭代器是惰性的，直到 `sum/collect/for_each` 等 consumer 才执行。连续 iterator adapter 通常可被优化成循环，但中间 `collect` 会真实分配。

## 5.7 计算成交 VWAP

```rust
fn vwap(fills: &[(i64, i64)]) -> Option<f64> {
    let mut notional = 0_i128;
    let mut quantity = 0_i128;
    for &(price, qty) in fills {
        if price <= 0 || qty <= 0 {
            return None;
        }
        notional += i128::from(price) * i128::from(qty);
        quantity += i128::from(qty);
    }
    (quantity > 0).then(|| notional as f64 / quantity as f64)
}

fn main() {
    assert_eq!(vwap(&[(100, 2), (101, 3)]), Some(100.6));
    assert_eq!(vwap(&[]), None);
}
```

权威 average fill price 通常保留精确分子/分母或按 venue 规则使用 decimal，示例的 `f64` 只用于展示结果。

## 5.8 排序与浮点

整数可以 `sort_unstable`。`f64` 含 NaN，只有 partial order；统计数据先定义 NaN policy：拒绝、缺失还是单独计数。现代 Rust 可用 `total_cmp` 获得全序，但这不代表 NaN 变成有效市场值。

```rust
fn main() {
    let mut values = vec![3.0_f64, 1.0, 2.0];
    values.sort_by(|a, b| a.total_cmp(b));
    assert_eq!(values, vec![1.0, 2.0, 3.0]);
}
```

## 5.9 集合的内存与确定性

集合选择同时影响：

- 查找、插入、删除和有序遍历复杂度。
- 节点分配、连续内存和 cache locality。
- snapshot 复制成本。
- deterministic replay 的稳定顺序。
- 满载时的内存上界。

先实现最简单正确结构并记录 workload。不要仅凭 Big-O 选择；常数、档位数和访问分布同样重要。

## 5.10 本章练习

1. 用 `VecDeque` 实现按时间戳淘汰的 rolling window。
2. 用 `BTreeMap` 保存 bids，并返回 top 3 与累计数量。
3. 解析 `venue:symbol`，拒绝缺字段和过长字符串。
4. 用 iterator 计算正/负方向成交量，但不创建中间 `Vec`。
5. 对同一订单簿 fixture 比较 `Vec` 和 `BTreeMap` 的接口复杂度，暂时不猜性能。

本章完成标准：能根据顺序、访问和所有权选择集合，并理解迭代器是否借用、修改或消费数据。
