# 第 2 章 Rust 基础语法：从数值到交易判断

这一章不追求一次覆盖整门语言，而是建立后续章节需要的最小语法基础：变量、类型、函数、表达式、控制流和切片。所有例子都围绕价格、数量和交易成本展开。

> **学习导航**
>
> - 开始前：完成第 1 章；接触过任一种编程语言会更轻松。
> - 这一章学会：使用变量、函数、条件、循环和一段连续数据。
> - 大约需要：6–8 小时。
> - 做完留下：中间价、价差、仓位和简单风险判断函数。

> **开章场景：把一句交易规则交给程序**
>
> 第一个程序会算中间价后，你又收到一条规则：“买卖价差不超过 2 元、订单数量不超过 5 个时才允许继续。”人读一句话就能大致理解，程序却必须知道每个数字叫什么、先算什么、条件不满足时走哪条路，以及有十笔订单时怎样逐笔处理。
>
> 变量给数据命名，函数保存计算步骤，`if` 和 `match` 表达选择，循环重复处理多条数据。**本章要解决的是：怎样把一条口头规则，拆成计算机可以明确执行的 Rust 语句。**

> **第一次阅读建议**
>
> 按 2.1 至 2.5 顺序边读边运行代码，每次只改一个数字观察结果。然后完成 2.7，把变量、函数、判断和循环连成一次交易判断。元组、数组与切片的细微区别不必一次记牢，先知道“单个值”和“一组值”需要不同表达方式。

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

下面把风险分成三档：`normal` 表示正常，`reduce-size` 表示缩小订单，`risk-off` 表示停止增加风险。这里使用英文字符串只是为了让代码简短；第 4 章会改成不容易拼错的枚举。

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

## 2.6 临时组合、定长数组与切片

元组（tuple）可以临时组合不同类型：

```rust
fn main() {
    let top = (60_000_i64, 3_i64, 60_001_i64, 2_i64);
    let (bid, bid_qty, ask, ask_qty) = top;
    assert!(bid < ask);
    assert_eq!(bid_qty + ask_qty, 5);
}
```

字段一多，tuple 很快失去语义，下一章会改成 struct。

数组（array）长度固定，类型中包含长度；切片（slice）`&[T]` 是对一段连续数据的借用：

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

## 2.10 回顾与下一章

本章的重点不是记住多少语法，而是让控制流直接表达业务含义：不可变绑定说明值不应被覆盖，`Option` 区分缺失结果与普通数值，`match` 覆盖离散分支，slice 让函数读取一段数据而不接管它。

把这些工具放回 `may_quote_bid`，可以看出它仍有明确边界：五个 `i64` 没有单位，返回 `bool` 也没有解释拒绝原因；它没有行情新鲜度、活动订单和配置版本。这些不是本章遗漏，而是后续重构清单。学习时保留这份清单，会比一开始堆出复杂结构更容易判断每个抽象解决了什么问题。

下一章要回答 slice 已经暗示的问题：函数借用的数据由谁拥有，状态由谁修改，事件进入更长生命周期的队列时为何需要拥有自己的数据。所有权不仅决定一行代码能否编译，也将决定实时系统的任务边界。
