# 第 2 章 Rust 基础语法：从数值到交易判断

这一章不追求一次覆盖整门语言，而是建立后续章节需要的最小语法基础：变量、类型、函数、表达式、控制流和切片。所有例子都围绕价格、数量和交易成本展开。

> **学习导航**　前置：第 1 章与任一语言的基础编程经验｜目标：用变量、函数、表达式、控制流和 slice 完成纯计算｜预计：6–8 小时｜产出：mid/spread、仓位与分级风险函数及边界测试

## 2.1 变量默认不可变

Rust 的绑定默认不可修改：

```rust
fn main() {
    let best_bid = 100_i64;
    let best_ask = 102_i64;
    let spread = best_ask - best_bid;
    assert_eq!(spread, 2);
}
```

这不是限制，而是在代码中表达意图。一个中间计算值如果不应变化，编译器就帮你阻止意外覆盖。确实需要更新时显式写 `mut`：

```rust
fn main() {
    let fills = [3_i64, -1, 5, -2];
    let mut position = 0_i64;
    for signed_qty in fills {
        position += signed_qty;
    }
    assert_eq!(position, 5);
}
```

变量遮蔽 `shadowing` 则用于把同一个概念转换到新表示：

```rust
fn main() {
    let raw_price = "60000";
    let raw_price = raw_price.parse::<i64>().expect("fixed fixture");
    assert_eq!(raw_price, 60_000);
}
```

生产解析不能随意 `expect`，第 6 章会建立结构化错误；这里的输入是代码内固定 fixture。

## 2.2 常用标量类型

交易领域最常见的基础类型：

- 有符号整数 `i32/i64/i128`：价格 tick、带方向数量和金额中间值。
- 无符号整数 `u32/u64/u128`：序列号、版本和时间戳。
- 浮点 `f32/f64`：统计特征、波动与研究计算。
- `bool`：局部判断，但有限业务状态更适合 enum。
- `char`：Unicode 标量，交易协议中较少直接使用。

类型转换必须显式：

```rust
fn main() {
    let qty_lots: i64 = 20;
    let price_ticks: i64 = 6_000_000;
    let notional_units = i128::from(qty_lots) * i128::from(price_ticks);
    assert_eq!(notional_units, 120_000_000);
}
```

先转成 `i128` 再乘，避免 `i64` 中间乘法先溢出。`as` 可以截断或改变符号，资金代码中不要在没证明范围时随意使用。

浮点比较不能简单依赖十进制直觉：

```rust
fn main() {
    let value = 0.1_f64 + 0.2_f64;
    assert!((value - 0.3).abs() < 1e-12);
}
```

订单价格和余额不会因此完全禁止浮点研究，但权威数值要在后续章节换成有单位的定点类型。

## 2.3 函数与表达式

函数参数和返回类型必须声明。Rust 中没有分号的最后一个表达式是返回值：

```rust
fn spread_ticks(bid: i64, ask: i64) -> Option<i64> {
    if bid <= 0 || ask <= bid {
        None
    } else {
        Some(ask - bid)
    }
}

fn main() {
    assert_eq!(spread_ticks(100, 102), Some(2));
    assert_eq!(spread_ticks(102, 100), None);
}
```

`Some(2)` 表示有一个有效结果，`None` 表示当前输入不能产生可信 spread。它比返回 `0` 更清楚，因为 locked book 的真实 spread 也可能是 0，而错误和业务值不能共用哨兵。

代码块本身也是表达式：

```rust
fn main() {
    let inventory = 8_i64;
    let max_inventory = 10_i64;
    let remaining = {
        let raw = max_inventory - inventory;
        raw.max(0)
    };
    assert_eq!(remaining, 2);
}
```

## 2.4 `if`、`match` 与区间

`if` 适合二元或少数判断，所有分支返回相同类型：

```rust
fn quote_size(position: i64, soft_limit: u64) -> i64 {
    if position.unsigned_abs() >= soft_limit { 1 } else { 5 }
}

fn main() {
    assert_eq!(quote_size(2, 8), 5);
    assert_eq!(quote_size(8, 8), 1);
}
```

`match` 强制覆盖所有分支，适合离散业务状态：

```rust
fn risk_band(position: i64) -> &'static str {
    match position.unsigned_abs() {
        0..=5 => "normal",
        6..=9 => "reduce-size",
        _ => "risk-off",
    }
}

fn main() {
    assert_eq!(risk_band(-7), "reduce-size");
}
```

`i64::MIN` 的绝对值无法用 `i64` 表示，因此这里用 `unsigned_abs()` 得到 `u64` 幅度。真实阈值来自配置与 instrument，不应散落成常数。这个例子只展示 pattern 与范围。

## 2.5 三种循环

`for` 遍历已知集合，最常用：

```rust
fn total_qty(levels: &[(i64, i64)]) -> i64 {
    let mut total = 0;
    for &(_price, qty) in levels {
        total += qty;
    }
    total
}

fn main() {
    assert_eq!(total_qty(&[(100, 2), (99, 3)]), 5);
}
```

`while` 适合条件驱动循环，`loop` 表示无限循环并用 `break` 退出。生产网络循环还必须处理 shutdown、错误退避和资源释放，不能只有裸 `loop`。

循环可以返回值：

```rust
fn first_positive(values: &[i64]) -> Option<i64> {
    let mut index = 0;
    loop {
        if index == values.len() {
            break None;
        }
        if values[index] > 0 {
            break Some(values[index]);
        }
        index += 1;
    }
}

fn main() {
    assert_eq!(first_positive(&[-2, 0, 4]), Some(4));
}
```

## 2.6 Tuple、Array 与 Slice

tuple 可以临时组合不同类型：

```rust
fn main() {
    let top = (60_000_i64, 3_i64, 60_001_i64, 2_i64);
    let (bid, bid_qty, ask, ask_qty) = top;
    assert!(bid < ask);
    assert_eq!(bid_qty + ask_qty, 5);
}
```

字段一多，tuple 很快失去语义，下一章会改成 struct。

array 长度固定，类型中包含长度；slice `&[T]` 是对一段连续数据的借用：

```rust
fn average(values: &[i64]) -> Option<f64> {
    if values.is_empty() {
        return None;
    }
    let sum: i128 = values.iter().map(|&v| i128::from(v)).sum();
    Some(sum as f64 / values.len() as f64)
}

fn main() {
    let prices = [100_i64, 101, 102, 103];
    assert_eq!(average(&prices[1..3]), Some(101.5));
}
```

slice 不拥有底层数组，这会自然引出下一章的所有权和借用。

## 2.7 一次最小交易判断

把语法组合成一个纯函数：只有 book 合法、spread 不超过上限、仓位仍有空间时才允许尝试挂 bid。

```rust
fn may_quote_bid(
    best_bid: i64,
    best_ask: i64,
    position: i64,
    max_long: i64,
    max_spread: i64,
) -> bool {
    let valid_book = best_bid > 0 && best_ask > best_bid;
    let spread_ok = valid_book && best_ask - best_bid <= max_spread;
    let inventory_ok = position < max_long;
    spread_ok && inventory_ok
}

fn main() {
    assert!(may_quote_bid(100, 101, 3, 10, 2));
    assert!(!may_quote_bid(100, 105, 3, 10, 2));
    assert!(!may_quote_bid(100, 101, 10, 10, 2));
}
```

这还不是生产风控：参数没有单位，book 没有 freshness，活动订单也未计入。但它展示了正确的学习方式：先写小而确定的纯逻辑，再逐章增加类型和状态。

## 2.8 编译器信息怎样读

Rust 编译器通常会指出：错误位置、违反的规则、相关值在哪里被定义或移动、可能修复。不要只读第一行，也不要盲目接受所有建议。

处理错误的顺序：

1. 找到最早的根错误，后面的可能是级联。
2. 用自己的话说明编译器守住了什么规则。
3. 检查数据应该被移动、借用还是复制。
4. 做最小修正并重新编译。
5. 不用 `clone`、`unwrap` 或扩大生命周期掩盖设计问题。

`cargo check` 只做检查，反馈比完整 build 快；`cargo test` 编译测试配置；`cargo clippy` 发现常见可读性、正确性和性能问题。

## 2.9 本章练习

1. 实现 `mid`、`spread` 和相对 spread，分别处理 locked/crossed/空输入。
2. 给一组带方向 fills 计算最终 position、最大 long 和最大 short。
3. 写一个函数按仓位分 normal/resize/risk-off 三档，不使用魔法哨兵。
4. 故意制造类型不匹配、越界借用和不可变变量赋值，完整阅读编译器信息。

本章完成标准：能独立使用函数、表达式、控制流和 slice 写纯计算，并开始区分“没有结果”和普通数值。
