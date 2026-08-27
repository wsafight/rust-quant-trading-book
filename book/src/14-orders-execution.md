# 第 14 章 订单、撮合与执行成本

第 13 章解释了市场微观结构，本章站在自己的订单视角：订单怎样进入队列、什么价格会成交、主动执行如何穿透深度、执行算法在优化什么。

> **学习导航**　前置：第 9、13 章的订单簿与微观结构｜目标：建模订单生命周期、深度穿透、queue 与执行成本｜预计：10–12 小时｜产出：逐档 sweep、implementation shortfall 和 parent/child 执行模型

## 14.1 限价单与市价意图

限价买单指定最高可接受价格，限价卖单指定最低可接受价格。它控制价格但不保证成交。

很多加密 venue 的“市价单”在实现上可能是带保护价格的 IOC、按 quote quantity 下单，或有最大滑点限制。不要只看 API 名；确认最终最差价格、数量语义和拒绝条件。

## 14.2 Time in Force

- GTC：保持直到成交或取消。
- IOC：立即成交可得部分，其余取消。
- FOK：立即全部成交，否则取消。
- Post-only：只提供流动性；若会立即成交则拒绝或调整，规则不同。

订单 type 与 TIF 的合法组合由 venue capability 决定。adapter 在发送前验证，而不是依赖 reject 发现配置错误。

## 14.3 Price-Time 撮合

简化规则：价格更优优先；同价按进入顺序 FIFO。主动买单从最低 ask 开始，主动卖单从最高 bid 开始。

```text
asks:
102 x 5
101 x 3

marketable buy 6:
  3 @ 101
  3 @ 102
remaining ask at 102: 2
```

实际 venue 可能采用 pro-rata、隐藏/iceberg、特殊优先级、自成交保护和批量撮合。matching engine 教学实现不能自动代表真实交易所。

## 14.4 Sweep Cost 与 VWAP

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct Level {
    price_ticks: i64,
    qty_lots: i64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct Fill {
    price_ticks: i64,
    qty_lots: i64,
}

#[derive(Debug, PartialEq, Eq)]
struct SweepResult {
    fills: Vec<Fill>,
    filled_lots: i64,
    remaining_lots: i64,
    notional: i128,
}

#[derive(Debug, PartialEq, Eq)]
enum SweepError {
    InvalidTarget,
    InvalidLevel { index: usize },
    InsufficientDepth(SweepResult),
}

fn sweep(levels: &[Level], target_lots: i64) -> Result<SweepResult, SweepError> {
    if target_lots <= 0 {
        return Err(SweepError::InvalidTarget);
    }
    if let Some(index) = levels
        .iter()
        .position(|level| level.price_ticks <= 0 || level.qty_lots <= 0)
    {
        return Err(SweepError::InvalidLevel { index });
    }

    let mut remaining = target_lots;
    let mut notional = 0_i128;
    let mut fills = Vec::new();
    for level in levels {
        let take = remaining.min(level.qty_lots);
        notional += i128::from(level.price_ticks) * i128::from(take);
        fills.push(Fill {
            price_ticks: level.price_ticks,
            qty_lots: take,
        });
        remaining -= take;
        if remaining == 0 {
            break;
        }
    }

    let result = SweepResult {
        fills,
        filled_lots: target_lots - remaining,
        remaining_lots: remaining,
        notional,
    };
    if remaining == 0 {
        Ok(result)
    } else {
        Err(SweepError::InsufficientDepth(result))
    }
}

fn main() {
    let asks = [
        Level { price_ticks: 101, qty_lots: 3 },
        Level { price_ticks: 102, qty_lots: 5 },
    ];
    let result = sweep(&asks, 6).unwrap();
    assert_eq!(result.notional, 609);
    assert_eq!(result.filled_lots, 6);
    assert_eq!(result.remaining_lots, 0);
    assert_eq!(result.notional as f64 / result.filled_lots as f64, 101.5);
}
```

深度不足不是“没有任何信息”：调用者仍需要已填数量、剩余数量和逐档结果，才能决定缩量、换 venue 或拒绝执行。非法档位与深度不足也必须是不同错误。L2 sweep 只使用可见静态深度；真实下单期间 book 会变化，其他参与者竞争同一深度，venue 还可能有隐藏数量和保护规则。

## 14.5 Slippage 的参考点

Slippage 必须说明相对什么：

- decision/arrival mid。
- best quote at send time。
- model fair value。
- VWAP/TWAP benchmark。
- previous close 等非实时基准。

对买单，成交越高通常越差；卖单方向相反。统一使用 side sign：

```text
signed_cost = side_sign * (fill_price - reference_price)
buy sign = +1, sell sign = -1
```

正 signed cost 表示支付成本。不要和全书 signed markout 的“正值有利”约定混淆，字段名应明确 `cost` 或 `markout`。

## 14.6 Maker 成交概率

Maker fill 取决于：

- 价格相对 best/fair 的位置。
- queue ahead 和同价 depth 变化。
- 主动对手方成交量。
- quote age、cancel latency 和 market regime。
- 自己订单大小与 venue 优先级。

提高报价激进程度通常增加 fill，也可能让 adverse selection 更差。目标不是最大 fill ratio，而是风险和成本后的条件收益。

## 14.7 Cancel/Replace 的执行代价

频繁刷新会：

- 丢失 queue priority。
- 增加 cancel/fill race。
- 消耗 rate-limit/order count。
- 让远端出现多个短生命周期订单。

刷新太慢则 quote stale。研究 quote refresh 时联合比较 fill probability、markout、queue age、cancel RTT、reject 和 message budget。

## 14.8 主动执行算法

- TWAP：按时间均匀切分，简单但忽略成交量变化。
- VWAP：跟随预计市场成交量曲线。
- POV：保持市场成交量的一定参与率。
- Implementation Shortfall：在价格风险和冲击成本间动态权衡。
- Liquidity seeking：在多个 venue/时点寻找可用流动性。

算法不只决定切片大小，还要处理 urgency、limit price、venue selection、partial fill、cancel 和剩余任务风险。

## 14.9 被动与主动的选择

被动订单可能节省 spread/fee，但面临不成交和 adverse selection；主动订单确定性更高，但立即支付 spread、fee 和 impact。

决策变量：

- 剩余数量与完成期限。
- 短期 alpha/价格风险。
- 当前 spread/depth/volatility。
- queue estimate 与订单 age。
- fee tier/rebate。
- 仓位、margin 和失败 venue。

“永远 maker”或“立即全部 taker”都不是通用最优。

## 14.10 多 Venue 执行

Smart order routing 需要规范化：价格、fee、可见深度、最小订单、延迟、成功率和结算风险。表面最优价格可能因为更慢、fee 更高或资金不足而不是最佳目的地。

两边同时发送会有 overfill 风险；串行发送会增加延迟。每个 child order 进入统一 OMS，parent task 根据 confirmed fill 而不是 request ack 更新剩余量。

## 14.11 执行评估

至少报告：

- filled/remaining/cancelled quantity。
- arrival、decision、fill VWAP 与 final benchmark。
- spread paid/captured、fee、impact 和 opportunity cost。
- time-to-first-fill、completion time、cancel age。
- maker/taker、venue、order type 和 reject。
- post-fill signed markout。

按 side、size bucket、spread/depth/volatility 和策略版本拆分，避免总平均掩盖问题。

## 14.12 一个完整执行例子

目标买入 10 lots，期限 5 秒。当前 ask 深度：101 x 3、102 x 5、103 x 10。策略先在 100 挂 maker 4 lots；2 秒后只成交 1，fair value 上升且剩余期限短。系统取消剩余 maker，但 cancel 未确认，当前已确认剩余目标是 9，潜在 maker 仍有 3。

如果立即主动买 9，最坏情况下 maker 又成交 3，总量达到 13。执行器必须把 in-flight cancel 计入 worst case，主动 child order 最多先下 6，待 cancel/fill 明确后继续。

这说明执行任务不能只用 `target - confirmed_fill`；还要结合活动/不确定订单、订单类型和 overfill policy。

## 14.13 本章练习

1. 扩展 `sweep`，加入买卖方向、限价保护和 checked arithmetic，并分别测试空深度与部分可成交。
2. 用 side sign 计算买卖 implementation shortfall。
3. 模拟 maker order 的 queue ahead，比较频繁/延迟刷新。
4. 设计 parent/child 执行状态，防止 cancel in-flight 时 overfill。
5. 比较 TWAP、POV 和立即执行在趋势/震荡场景的风险。

本章完成标准：能从 order type、queue、latency、fee 和剩余任务解释执行结果，而不是只比较成交均价。
