# 第 4 章 结构体、枚举与模式匹配：建立交易领域模型

基础类型只能表达“一个整数”，不能表达它是价格、数量还是序列。交易系统的正确性从领域模型开始：让合法状态容易构造，让危险组合难以出现。

> **学习导航**
>
> - 开始前：读过第 2–3 章，能大致解释一个所有权错误。
> - 这一章学会：用结构体和枚举给交易数据贴上不会混淆的标签。
> - 大约需要：6–8 小时。
> - 做完留下：盘口顶部、订单命令/事件和连接状态模型。

> **开章场景：数字都对，订单却下错了**
>
> 一个下单函数依次接收三个整数：`100`、`2`、`1`。调用者以为它们表示“价格 100、数量 2、买入”，函数却按“数量、价格、方向”读取。三个值本身都合法，编译也能通过，但订单含义已经完全变了。
>
> 结构体（`struct`）给每个字段明确命名，枚举（`enum`）把方向和订单状态限制在合法选项中。**本章要解决的是：怎样让代码区分价格、数量、方向和状态，使错误组合更难被创建。**

> **第一次阅读建议**
>
> 先读 4.1 和 4.3，把“几个有名字的字段”和“有限个合法选项”分清。再读 4.5 和 4.7，看类型怎样排除矛盾状态，以及为什么“请求撤单”不能直接等于“已经撤单”。`Option` 和构造函数是这两种表达方式的具体应用，可以结合代码练习巩固。

## 4.1 结构体把字段组成一个概念

结构体把几个相关字段放在一起，并给整体起一个名字。下面的 `TopOfBook` 表示订单簿最靠近成交位置的买卖报价：

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct TopOfBook {
    bid_ticks: i64,
    bid_lots: i64,
    ask_ticks: i64,
    ask_lots: i64,
}

impl TopOfBook {
    fn spread_ticks(&self) -> Option<i64> {
        (self.bid_ticks > 0 && self.ask_ticks > self.bid_ticks)
            .then(|| self.ask_ticks - self.bid_ticks)
    }
}

fn main() {
    let top = TopOfBook {
        bid_ticks: 100,
        bid_lots: 3,
        ask_ticks: 101,
        ask_lots: 2,
    };
    assert_eq!(top.spread_ticks(), Some(1));
}
```

`impl` 把行为放在概念旁边。`&self` 只读，`&mut self` 修改，`self` 消费值。派生的 `Debug/Clone/Copy/PartialEq/Eq` 让小型值可打印、复制和比较；不要对大型 buffer 随意派生 `Clone` 后到处复制。

## 4.2 用单字段结构体区分单位

只包装一个值的结构体常叫 tuple struct。若它的主要目的，是让相同底层类型代表不同业务含义，这种用法也称为 newtype（新类型包装）：

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
struct PriceTicks(i64);

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
struct QtyLots(i64);

fn value_units(price: PriceTicks, qty: QtyLots) -> i128 {
    i128::from(price.0) * i128::from(qty.0)
}

fn main() {
    assert_eq!(value_units(PriceTicks(100), QtyLots(3)), 300);
}
```

两种包装类型底层都是 `i64`，但函数签名阻止传反。字段暂时公开只是教学便利；生产类型可隐藏字段，通过构造函数保证正值、范围或与产品规则（metadata）关联。

## 4.3 枚举表达有限选择

枚举列出一个值所有允许的类别。买卖方向只能二选一，因此比 `true/false` 更适合写成 `Buy/Sell`：

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Side {
    Buy,
    Sell,
}

impl Side {
    fn sign(self) -> i64 {
        match self {
            Self::Buy => 1,
            Self::Sell => -1,
        }
    }
}

fn main() {
    assert_eq!(Side::Buy.sign() * 5, 5);
    assert_eq!(Side::Sell.sign() * 5, -5);
}
```

相比 `is_buy: bool`，`Side` 的调用处可读性更高，将来如果领域出现特殊语义，编译器会要求所有 `match` 重新处理。

Enum variant 可以携带不同数据：

```rust
#[derive(Debug, PartialEq, Eq)]
enum RiskDecision {
    Allow,
    Resize { allowed_lots: i64 },
    Reject { reason: &'static str },
}

fn decide(requested: i64, remaining: i64) -> RiskDecision {
    if requested <= 0 || remaining <= 0 {
        RiskDecision::Reject { reason: "no_capacity" }
    } else if requested > remaining {
        RiskDecision::Resize { allowed_lots: remaining }
    } else {
        RiskDecision::Allow
    }
}

fn main() {
    assert_eq!(decide(5, 2), RiskDecision::Resize { allowed_lots: 2 });
}
```

## 4.4 `Option` 是一种枚举

`Option<T>` 只有 `Some(T)` 和 `None`。用模式匹配取值：

```rust
fn executable_qty(requested: i64, available: Option<i64>) -> i64 {
    match available {
        Some(value) if value > 0 => requested.min(value),
        _ => 0,
    }
}

fn main() {
    assert_eq!(executable_qty(5, Some(3)), 3);
    assert_eq!(executable_qty(5, None), 0);
}
```

`if let` 适合只关心一个 pattern，`let else` 适合不匹配就提前返回。选择让主路径最清晰的形式。

## 4.5 用类型消除不可能状态

下面的布尔组合有很多非法状态：

```text
connected=true, subscribed=false, synchronized=true
connected=false, synchronized=true
```

改成 enum：

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum FeedState {
    Disconnected,
    Connecting,
    Subscribing,
    Synchronizing,
    Healthy { last_sequence: u64 },
    Stale { last_sequence: u64 },
}

impl FeedState {
    fn may_publish(self) -> bool {
        matches!(self, Self::Healthy { .. })
    }
}

fn main() {
    assert!(FeedState::Healthy { last_sequence: 9 }.may_publish());
    assert!(!FeedState::Synchronizing.may_publish());
}
```

状态本身携带它需要的数据，`Healthy` 不可能没有 sequence。

## 4.6 构造函数守住局部不变量

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct PositiveLots(i64);

#[derive(Debug, PartialEq, Eq)]
enum LotsError {
    NotPositive,
}

impl PositiveLots {
    fn new(value: i64) -> Result<Self, LotsError> {
        if value > 0 { Ok(Self(value)) } else { Err(LotsError::NotPositive) }
    }

    fn get(self) -> i64 {
        self.0
    }
}

fn main() {
    assert_eq!(PositiveLots::new(4).map(PositiveLots::get), Ok(4));
    assert_eq!(PositiveLots::new(0), Err(LotsError::NotPositive));
}
```

类型只保证稳定的局部规则。“当前最多能下 10 lots”随账户和市场变化，应由风险快照判断，不应永久编码进 `QtyLots`。

## 4.7 状态转移与命令分开

命令表达本地意图，事件表达已经观察到的事实：

```text
Command: SubmitOrder, RequestCancel
Event:   VenueAccepted, ExecutionReceived, CancelConfirmed
```

`RequestCancel` 不能直接把订单变成 `Cancelled`，因为远端仍可能成交。把命令和事件分开，是后续 OMS 能处理 timeout 和乱序的基础。

下面的状态归并函数（reducer）接收“旧状态 + 新事件”，返回新状态：

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum State { Down, Connecting, Ready }

#[derive(Debug, Clone, Copy)]
enum Event { Start, Connected, Disconnected }

fn reduce(state: State, event: Event) -> State {
    match (state, event) {
        (State::Down, Event::Start) => State::Connecting,
        (State::Connecting, Event::Connected) => State::Ready,
        (_, Event::Disconnected) => State::Down,
        (current, _) => current,
    }
}

fn main() {
    let state = reduce(State::Down, Event::Start);
    assert_eq!(reduce(state, Event::Connected), State::Ready);
}
```

生产 reducer 对非法转换不能总是静默保持原状；需要返回错误、审计并按严重度触发恢复。

## 4.8 命名与单位

字段名应包含方向和单位：

- `price_ticks` 优于 `price`。
- `qty_lots` 优于 `amount`。
- `timeout_ms` 或 `Duration` 优于裸 `timeout`。
- `funding_income` 优于正负含糊的 `funding_payment`。
- `local_receive_time` 优于 `timestamp`。

不要把 `symbol` 当全局 ID；同名产品在不同 venue 可能完全不同。使用 `(VenueId, InstrumentId)` 或内部稳定 ID。

## 4.9 领域模型评审问题

- 是否存在多个 bool 组合成的非法状态？
- 基础数值类型（primitive）是否丢失单位、币种或 ID 作用范围？
- 构造后哪些不变量永远成立？
- command、event、state 和 action 是否混淆？
- 缺失值是正常 `Option`，还是需要原因的 `Result`？
- 类型是否错误地固化了会动态变化的 risk policy？
- Debug 输出是否可能泄露密钥或账户数据？

## 4.10 本章练习

1. 用 struct 重写第 2 章的 top-of-book tuple，并增加构造校验。
2. 定义 `OrderType`、`TimeInForce`、`OrderCommand` 和 `OrderEvent`。
3. 把三个连接 bool 重构成 enum，列出合法状态转移。
4. 为 `PriceTicks/QtyLots/ClientOrderId` 设计公开 API，说明哪些字段应私有。

本章完成标准：能用 struct、enum 和 match 表达领域，而不是依赖 primitive、布尔组合和魔法字符串。

## 4.11 回顾与下一章

好的领域模型不是把 JSON 字段改成 Rust 字段，而是选择系统愿意承诺的不变量。私有字段与构造函数守住局部合法性，enum 枚举有限状态，command、event、state 与 action 的分离则让“希望发生”“已经发生”和“接下来要执行”不再混为一谈。

模型也不能过度承诺。会随账户、venue 或时间变化的 limit、fee 和产品规则属于版本化配置或 metadata，不应被写死在静态类型中。类型负责阻止单位和状态类别混淆，运行时验证负责处理动态规则；二者缺一不可。

下一章会处理一组事件和价格档。届时，选择 `Vec`、`VecDeque`、`HashMap` 或 `BTreeMap` 不只是语法偏好，而要从访问顺序、删除方式、确定性和内存布局推导。
