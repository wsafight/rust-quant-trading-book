# 第 6 章 类型、错误与测试

交易系统需要区分三种失败：输入不合法、外部操作不确定、内部不变量被破坏。把它们都变成字符串或 panic，会让调用者无法采取正确动作。本章用类型、枚举和测试建立领域边界。

> **学习导航**　前置：第 4–5 章的 enum、集合与模块 API｜目标：用 newtype、结构化错误和测试建立单位/身份边界｜预计：8–10 小时｜产出：ID/单位类型、decimal 转换、错误分类和算术测试

## 6.1 Newtype 消除单位歧义

如果价格和数量都是 `i64`，编译器无法阻止参数传反。newtype 让相同底层表示具有不同语义：

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
struct PriceTicks(i64);

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
struct QtyLots(i64);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct NotionalUnits(i128);

fn notional(price: PriceTicks, qty: QtyLots) -> Option<NotionalUnits> {
    i128::from(price.0)
        .checked_mul(i128::from(qty.0))
        .map(NotionalUnits)
}

fn main() {
    assert_eq!(
        notional(PriceTicks(10_000), QtyLots(3)),
        Some(NotionalUnits(30_000))
    );
}
```

金额通常需要比单个字段更宽的中间类型。还要明确 tick value、lot size、contract multiplier 和结算币种；示例中的 `NotionalUnits` 只是教学单位，不可直接替代真实产品元数据。

## 6.2 枚举表达有限状态

布尔字段容易制造不可能组合，例如 `is_open = true` 且 `is_cancelled = true`。订单状态应使用枚举：

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum OrderState {
    PendingNew,
    Open,
    PartiallyFilled,
    PendingCancel,
    Filled,
    Cancelled,
    Rejected,
    Uncertain,
}

impl OrderState {
    fn is_terminal(self) -> bool {
        matches!(self, Self::Filled | Self::Cancelled | Self::Rejected)
    }
}

fn main() {
    assert!(OrderState::Filled.is_terminal());
    assert!(!OrderState::PendingCancel.is_terminal());
}
```

`PendingCancel` 不是终态：撤单在途时仍可能成交。`Uncertain` 也不是普通错误；它表示远端事实未知，系统必须查询和对账，并把潜在订单计入最坏暴露。

## 6.3 用构造函数守住不变量

字段私有，构造时校验：

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct QtyLots(i64);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum QtyError {
    NotPositive,
    AboveLimit,
}

impl QtyLots {
    fn new(value: i64, max: i64) -> Result<Self, QtyError> {
        if value <= 0 {
            Err(QtyError::NotPositive)
        } else if value > max {
            Err(QtyError::AboveLimit)
        } else {
            Ok(Self(value))
        }
    }
}

fn main() {
    assert_eq!(QtyLots::new(0, 100), Err(QtyError::NotPositive));
    assert_eq!(QtyLots::new(10, 100), Ok(QtyLots(10)));
}
```

真实系统的最大数量不是值类型的永久属性，而是账户、策略和市场状态相关的风险配置。这里把它放进构造函数只为演示：不变量属于哪一层，必须明确区分。`qty > 0` 可由领域类型保证；“当前最多下多少”应由独立风控判断。

## 6.4 `Option` 与 `Result`

`Option<T>` 表示值可以合理缺失，例如空订单簿没有 best bid。`Result<T, E>` 表示操作失败并携带原因，例如 decimal 不符合 tick size。

```rust
use std::collections::BTreeMap;

fn best_bid(levels: &BTreeMap<i64, i64>) -> Option<(i64, i64)> {
    levels.last_key_value().map(|(price, qty)| (*price, *qty))
}

fn main() {
    let mut bids = BTreeMap::new();
    assert_eq!(best_bid(&bids), None);
    bids.insert(100, 2);
    assert_eq!(best_bid(&bids), Some((100, 2)));
}
```

不要为了减少返回类型而使用哨兵值 `0`，也不要在核心路径对外部输入调用 `unwrap()`。panic 适合表示程序员违反了无法恢复的内部前提，不适合表示网络报文、交易所拒绝或空 book。

## 6.5 错误按行动分类

好的错误类型告诉上层该做什么：

```rust
#[derive(Debug, PartialEq, Eq)]
enum GatewayError {
    Retryable,
    RateLimited { retry_after_ms: u64 },
    InvalidRequest,
    ExchangeReject { code: i32 },
    AuthOrPermission,
    StateUncertain,
}

#[derive(Debug, PartialEq, Eq)]
enum RecoveryAction {
    RetryWithBackoff,
    Wait(u64),
    FixRequest,
    RecordReject,
    DisableTrading,
    Reconcile,
}

fn recovery(error: GatewayError) -> RecoveryAction {
    match error {
        GatewayError::Retryable => RecoveryAction::RetryWithBackoff,
        GatewayError::RateLimited { retry_after_ms } => RecoveryAction::Wait(retry_after_ms),
        GatewayError::InvalidRequest => RecoveryAction::FixRequest,
        GatewayError::ExchangeReject { .. } => RecoveryAction::RecordReject,
        GatewayError::AuthOrPermission => RecoveryAction::DisableTrading,
        GatewayError::StateUncertain => RecoveryAction::Reconcile,
    }
}

fn main() {
    assert_eq!(
        recovery(GatewayError::StateUncertain),
        RecoveryAction::Reconcile
    );
}
```

下单超时通常属于 `StateUncertain`，而不是简单 `Retryable`。用新 client ID 立即重试可能创建重复订单。

## 6.6 让 `?` 保留上下文

`?` 在错误时提前返回，并通过 `From` 转换错误。库层应返回结构化错误，进程边界再补上下文和日志。不要把所有错误提前格式化成字符串，否则无法统计 reason、决定重试或触发 risk-off。

```rust
#[derive(Debug, PartialEq, Eq)]
enum ParseError {
    Empty,
    InvalidInteger,
    NonPositive,
}

fn parse_positive_lots(raw: &str) -> Result<i64, ParseError> {
    if raw.is_empty() {
        return Err(ParseError::Empty);
    }
    let value = raw.parse::<i64>().map_err(|_| ParseError::InvalidInteger)?;
    if value <= 0 {
        return Err(ParseError::NonPositive);
    }
    Ok(value)
}

fn main() {
    assert_eq!(parse_positive_lots("12"), Ok(12));
    assert_eq!(parse_positive_lots("-1"), Err(ParseError::NonPositive));
}
```

## 6.7 测试金字塔服务于风险

交易系统的测试不只是一组 unit test：

| 测试层 | 目标 | 示例 |
| --- | --- | --- |
| 单元/表驱动 | 纯函数和产品组合 | 舍入、fee、long/short PnL |
| Property test | 对大量输入验证不变量 | filled qty 单调、book 不 crossed |
| 集成/契约 | adapter 与外部协议 | snapshot/delta fixture、签名 |
| 确定性回放 | 相同输入得到相同状态 | intents、fills、position、PnL |
| Fuzz | 非法或极端输入 | decoder、decimal、状态机 |
| 并发模型 | 小状态空间中的竞态 | shutdown、publish/consume |
| 故障注入 | 验证恢复行为 | 丢包、429、断线、磁盘慢 |
| Load/soak | 峰值和长期稳定性 | queue age、p99.9、内存增长 |

离线 CI 使用固定且脱敏的 fixture，不依赖交易所此刻在线。在线契约测试可以定期运行，但不能成为每次提交的唯一正确性证据。

## 6.8 表驱动测试

```rust
fn linear_pnl(signed_qty: i64, entry: i64, mark: i64) -> Option<i128> {
    let price_change = i128::from(mark).checked_sub(i128::from(entry))?;
    i128::from(signed_qty).checked_mul(price_change)
}

fn main() {
    let cases = [
        (10, 100, 105, 50),
        (10, 100, 95, -50),
        (-10, 100, 105, -50),
        (-10, 100, 95, 50),
    ];

    for (qty, entry, mark, expected) in cases {
        assert_eq!(linear_pnl(qty, entry, mark), Some(expected));
    }

    // 先转 i128，避免 i64 的 mark - entry 在极值附近溢出。
    assert_eq!(linear_pnl(1, i64::MIN, i64::MAX), Some(i128::from(i64::MAX) - i128::from(i64::MIN)));
}
```

表驱动测试迫使我们覆盖方向组合。真实 PnL 还需要 multiplier、精度、结算币种和 venue 规则，第 15 章会完整讨论。

## 6.9 浮点数的合理边界

“核心账务不用裸 `f64`”不等于系统永远不能用浮点。统计特征、回归、波动估计和可视化可以使用浮点，但需要处理 NaN、无穷、可复现性和从信号到订单价格的明确量化过程。权威订单、持仓、余额和对账值应使用整数定点或经过审计的 decimal 类型。

## 6.10 Decimal 到 ticks 的完整思路

交易所常用字符串传价格，例如 `"100.10"`。直接解析成 `f64` 再除以 tick size，可能因二进制浮点误差得到 `2001.999999...`。严格转换应在十进制整数域完成。

假设 tick size 是 `0.05`，先把输入和 tick 都缩放到相同的小数位：

```text
"100.10" -> 10010 个 0.01 单位
"0.05"   ->     5 个 0.01 单位
ticks     -> 10010 / 5 = 2002
```

需要预先定义：

- 是否接受 `+100.10`、前导零、科学计数法和空白。
- 最多允许多少小数位。
- 超出精度时拒绝，还是按买卖方向舍入。
- 负值、零、极大整数和乘法溢出如何处理。
- metadata tick 变化后，旧配置如何失效。

一个只接受精确整 tick 的简化实现：

```rust
#[derive(Debug, PartialEq, Eq)]
enum DecimalError {
    Invalid,
    TooManyDecimals,
    NotOnTick,
    Overflow,
}

fn scaled_integer(raw: &str, decimals: u32) -> Result<i128, DecimalError> {
    let (whole, fraction) = raw.split_once('.').unwrap_or((raw, ""));
    if whole.is_empty()
        || !whole.bytes().all(|b| b.is_ascii_digit())
        || !fraction.bytes().all(|b| b.is_ascii_digit())
        || fraction.len() > decimals as usize
    {
        return Err(if fraction.len() > decimals as usize {
            DecimalError::TooManyDecimals
        } else {
            DecimalError::Invalid
        });
    }

    let scale = 10_i128.checked_pow(decimals).ok_or(DecimalError::Overflow)?;
    let whole = whole.parse::<i128>().map_err(|_| DecimalError::Overflow)?;
    let mut fraction_owned = fraction.to_owned();
    fraction_owned.extend(std::iter::repeat_n(
        '0',
        decimals as usize - fraction.len(),
    ));
    let fraction = if fraction_owned.is_empty() {
        0
    } else {
        fraction_owned.parse::<i128>().map_err(|_| DecimalError::Overflow)?
    };
    whole
        .checked_mul(scale)
        .and_then(|v| v.checked_add(fraction))
        .ok_or(DecimalError::Overflow)
}

fn exact_ticks(raw: &str, tick_units: i128, decimals: u32) -> Result<i128, DecimalError> {
    let units = scaled_integer(raw, decimals)?;
    if tick_units <= 0 || units % tick_units != 0 {
        return Err(DecimalError::NotOnTick);
    }
    Ok(units / tick_units)
}

fn main() {
    assert_eq!(exact_ticks("100.10", 5, 2), Ok(2002));
    assert_eq!(exact_ticks("100.11", 5, 2), Err(DecimalError::NotOnTick));
}
```

这是教学版本：只接受非负普通十进制，并有一次字符串分配。生产中可以用成熟 decimal crate 或零分配 parser，但先固定语义和测试，再根据 profile 优化。

## 6.11 Property test 从不变量出发

示例测试通常只覆盖我们想到的几个输入，property test 则让框架生成大量组合。关键不是“随机”，而是先写出必须始终成立的性质。

对 decimal/ticks：

- 任意合法 ticks 格式化后再解析，得到原 ticks。
- 非 tick 整倍数在 strict 模式必须失败。
- 买价向下舍入后不高于输入，卖价向上舍入后不低于输入。

对 OMS：

- `filled_qty` 单调不减且不超过 total。
- 重复 execution key 不改变 position/cash。
- terminal state 不因旧 ack 回退。

对 order book：

- 应用同一幂等更新两次，结果与一次相同（前提是协议允许）。
- gap 后 `is_tradable` 永远为 false，直到合法 snapshot 恢复。
- 删除全部档位后 best price 为 `None`，不使用哨兵价格。

Property 失败时框架会 shrink 输入，找到最小反例。把该反例保存成固定回归测试，避免只依赖下一次随机生成。

## 6.12 错误在哪一层转换

一个 wire 字段 `price="abc"` 会跨过多个层次：

```text
decimal parser: InvalidDigit
venue decoder: InvalidField { field: "price", source }
feed health: DecodeError counted; threshold may degrade connection
strategy: never receives malformed event
operations: alert includes venue/channel/schema, raw payload reference
```

底层错误保留精确原因，上层增加行动上下文。不要在 parser 内决定“停止交易”，因为 parser 不知道消息是否关键、错误是否持续；也不要在最外层只记录 `something failed`，因为那会丢掉诊断信息。

内部不变量失败与外部坏输入也要分开。前者说明实现或状态已经不可信，通常 risk-off 并保留证据；后者可能只是单条报文错误，需要根据协议和频率判断是否重连或降级。

## 6.13 本章练习

1. 定义 `VenueId`、`InstrumentId`、`ClientOrderId` 和 `ExecutionKey`，阻止跨 venue 混用裸字符串。
2. 实现严格 decimal-to-ticks 转换，拒绝超过允许精度的输入，并分别测试买卖舍入策略。
3. 为订单状态设计错误类型，区分非法本地命令、交易所明确拒绝和状态不确定。
4. 给线性 PnL 增加 multiplier 与 checked arithmetic，并覆盖边界。

本章完成标准：资金和标识不再以无单位 primitive 在模块间流动；每一种错误都能映射到明确行动；核心公式至少有方向和边界测试。
