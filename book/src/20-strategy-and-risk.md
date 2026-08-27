# 第 20 章 做市、执行、仓位与硬风控

做市器持续给出买卖报价，希望在控制库存和逆向选择的同时获取价差。系统必须区分两种权力：策略回答“想下什么单”，独立硬风控回答“最多允许什么单”。策略故障不能绕过仓位、金额、价格、新鲜度和 kill switch。

> **学习导航**　前置：第 13–19 章的微观结构、执行、账务、行情与 OMS｜目标：分离策略意图和独立硬风控，管理库存、对冲与 kill｜预计：14–20 小时｜产出：双边报价、worst-case risk、对冲实验与故障演练

## 20.1 控制环

```text
valid market state -> fair value -> quote proposal -> hard risk
       ^                                      |          |
       |                                      v          v
regime/health <- markout/PnL <- fills <- OMS/orders -> reject/resize
                                      |
                                      v
                             position -> hedge policy
```

输入、决策和结果都带 timestamp 与版本。策略看到的 book、signal、position 和 limits 需要是同一个可解释快照，不能把不同时间点的字段拼成一次决策。

## 20.2 公允价不是“真实价格”

可解释的 fair value pipeline 可以从 mid 开始，逐步加入：

- microprice 或多档 imbalance。
- 短期 trade/order-flow pressure。
- 跨 venue 可执行参考价。
- funding、basis 与对冲市场。
- stale/latency adjustment。

每个特征都要有方向、预测 horizon、更新频率、标准化和缺失规则。不要在没有可信 fill model 之前叠加复杂机器学习；更准确的 mid 预测不一定转化成 maker PnL。

## 20.3 报价中枢与 half-spread

一种清晰分解：

```text
reservation_price = fair_value
                    - inventory_skew
                    - funding_or_basis_adjustment

half_spread = fee_component
              + volatility_component
              + adverse_selection_component
              + latency_component
              + hedge_cost_component
              + safety_buffer

bid = reservation_price - half_spread
ask = reservation_price + half_spread
```

这些项未必能被精确识别，但分解迫使团队讨论收益来源。买卖价量化到 tick 时要分别指定 rounding，保证 post-only、不交叉并满足最小 spread。

## 20.4 Inventory skew

当策略已有 long inventory，通常降低报价中枢或减小 bid size，使新增买入不再激进，并鼓励 ask 成交。简单线性形式：

```text
inventory_skew = k * (position - target_position)
```

但线性 skew 不是永久答案。还要考虑：

- 接近限额时非线性加速。
- bid/ask size skew 与 price skew 的组合。
- 当前波动、depth 与对冲能力。
- 多 instrument 的 delta/beta 暴露。
- uncertain orders 与双边同时成交。

关键不变量：仓位越接近 long hard limit，策略不能让买侧更具增险性；若有例外，需要明确组合对冲证据并仍通过硬风控。

## 20.5 Quote 生命周期

一次报价经历：

```text
compute -> risk approve/resize -> send -> ack/open
-> keep/amend/cancel -> fill/cancel/reject/uncertain
```

refresh 太快会失去 queue priority、增加消息成本、cancel/fill race 和限频；太慢会留下 stale quote。刷新阈值应从以下指标校准：

- fair value 变化与 quote age。
- queue position/fill probability 近似。
- fill 后 markout。
- send/cancel RTT 与 reject。
- rate-limit budget。
- 仓位和对冲延迟。

## 20.6 独立 Pre-trade 风控

硬检查应使用策略无法修改的配置和权威状态：

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct OrderIntent {
    price_ticks: i64,
    qty_lots: i64,
    increases_long: bool,
}

#[derive(Debug, Clone, Copy)]
struct RiskSnapshot {
    enabled: bool,
    book_fresh: bool,
    book_tradable: bool,
    position_lots: i64,
    open_buy_lots: i64,
    max_long_lots: i64,
    max_order_lots: i64,
}

#[derive(Debug, PartialEq, Eq)]
enum RiskDecision {
    Allow,
    Resize { max_qty_lots: i64 },
    Reject(&'static str),
}

fn check(intent: OrderIntent, risk: RiskSnapshot) -> RiskDecision {
    if !risk.enabled {
        return RiskDecision::Reject("trading_disabled");
    }
    if !risk.book_fresh {
        return RiskDecision::Reject("stale_market_data");
    }
    if !risk.book_tradable {
        return RiskDecision::Reject("untradable_book");
    }
    if intent.price_ticks <= 0 || intent.qty_lots <= 0 {
        return RiskDecision::Reject("invalid_price_or_qty");
    }

    let mut allowed = intent.qty_lots.min(risk.max_order_lots);
    if intent.increases_long {
        let remaining = i128::from(risk.max_long_lots)
            - i128::from(risk.position_lots)
            - i128::from(risk.open_buy_lots);
        let remaining = remaining.clamp(0, i128::from(i64::MAX)) as i64;
        allowed = allowed.min(remaining);
    }

    if allowed <= 0 {
        RiskDecision::Reject("long_limit")
    } else if allowed < intent.qty_lots {
        RiskDecision::Resize { max_qty_lots: allowed }
    } else {
        RiskDecision::Allow
    }
}

fn main() {
    let decision = check(
        OrderIntent { price_ticks: 100, qty_lots: 5, increases_long: true },
        RiskSnapshot {
            enabled: true,
            book_fresh: true,
            book_tradable: true,
            position_lots: 8,
            open_buy_lots: 1,
            max_long_lots: 10,
            max_order_lots: 5,
        },
    );
    assert_eq!(decision, RiskDecision::Resize { max_qty_lots: 1 });
}
```

教学代码只展示一个方向。生产检查还包括 instrument 状态、tick/lot/min notional、price collar、gross/net exposure、open-order exposure、loss/drawdown、margin buffer、rate limit、venue health、config version 和 reduce-only 语义。

`book_fresh` 与 `book_tradable` 是两个独立门槛：前者来自时间戳，后者要求同步有效且 bid/ask 两侧都有可用顶档。空侧或单边 book 即使刚刚更新，也不能放行增加风险的订单。

## 20.7 Worst-case exposure

不能只看已确认仓位：

```text
worst_long = confirmed_position
             + active_buy_qty
             + uncertain_buy_qty
             - guaranteed_reduce_only_sell_qty
```

“guaranteed” 必须非常谨慎。普通 sell 可能开空、reduce-only 的 venue 语义也可能受 position mode 和竞态影响。通常将未确认订单按最坏方向计入更安全。

跨所做市还要考虑 maker 双边同时成交、hedge order 未成交、两个 venue 各自断线以及抵押品相关性。

## 20.8 对冲 policy

对冲可以：

- 每笔成交立即主动对冲：暴露短，fee/slippage 高。
- 累计到阈值批量对冲：成本低，暴露时间长。
- 被动对冲：可能赚 spread，但成交不确定且继续承担风险。
- 混合策略：正常被动，接近限额或波动上升时主动。

权威账务只根据 confirmed fills 更新。预测仓位可以帮助提前决策，但不能把“预计成交”记为真实持仓。

对冲参数用 Pareto frontier 评估 fee、slippage、暴露时间、尾部仓位和 drawdown，不要只优化平均交易成本。

## 20.9 分级风险响应

风险动作从轻到重通常包括：

1. resize、降低 refresh 或 widen。
2. 禁用异常信号/venue，保留可靠侧。
3. 停止新增风险，只允许受控 reduce-only。
4. 撤活动订单并对账。
5. 主动降仓或全局 kill。
6. 人工接管与恢复审批。

触发源包括行情 stale/gap、私有流 stale、position drift、margin buffer、loss/drawdown、reject/429、hedge lag、queue age、时钟异常和配置变更。

## 20.10 Kill switch 不是布尔变量

一个可信 kill switch 需要：

- 独立于策略主循环的高优先级触发路径。
- 权限控制、多级范围和完整审计。
- 停止新单、撤活动单、确认结果与失败升级。
- 撤单失败时持续查询风险，不能假装已经安全。
- 恢复前对账、根因确认和显式审批。

范围可以是 strategy、symbol、venue、account 和 global。全局 kill 失效时需要人工控制台和交易所侧措施。

## 20.11 成交质量与 PnL 归因

每次 fill 至少记录：

- decision/fair/quote/fill price 和时间。
- maker/taker、fee、quote age 与 queue 模型信息。
- 10 ms、100 ms、1 s、10 s signed markout。
- fill 前后 position、hedge delay 和 hedge slippage。
- strategy/config/book version。

会计 PnL 先由权益恒等式闭合，再做互斥分析归因：spread capture、inventory revaluation、fees、funding、hedge slippage 与 residual。若一项无法互斥定义，就不要强行让漂亮图表替代账本。

## 20.12 策略评审

每个策略回答：

- Hypothesis：谁为什么愿意支付这份收益？
- Data：决策时真正可见什么，缺口如何处理？
- Execution：订单类型、queue、latency、fee 和 impact 如何建模？
- Risk：库存、保证金、venue、模型和故障风险是什么？
- Evidence：out-of-sample、敏感性、容量与失败实验是什么？
- Live plan：shadow、testnet、canary 的 gate 和 kill 是什么？

## 20.13 一次报价的数值推导

假设 BTC 永续 best bid/ask 为 `60,000.0 / 60,001.0`，mid `60,000.5`。短期特征把 fair value 向上调整 `0.8`，得到 `60,001.3`。

策略当前 long 0.4 BTC，目标仓位为 0。库存模型给出 `2.0 USDT` 的向下 skew，funding/basis 暂无调整：

```text
reservation = 60,001.3 - 2.0 = 59,999.3
```

half-spread 分解：

```text
fee/rebate expected      0.4
volatility               0.9
adverse selection        0.8
latency                   0.3
hedge cost                0.5
safety buffer             0.3
total half-spread         3.2
```

原始 quote 为 `59,996.1 / 60,002.5`。若 tick 是 0.1，价格已经对齐。由于库存偏 long，bid 离市场较远、ask 相对更容易成交；size policy 还可以给 bid 0.05 BTC、ask 0.15 BTC。

这不是说上述参数合理，而是展示每个报价如何可解释。研究需要用历史 markout、fill 和 hedge cost 校准各项；hard risk 还要检查 price collar、min notional、position/open-order exposure 和 book age。若 best bid 已升至或超过 `60,002.5`，旧 ask `60,002.5` 会变成 marketable；若 fair value 或 book version 已变化，它也可能只是 stale。发送前必须用最新可交易 book 再次检查 post-only 规则。

## 20.14 Worst-case exposure 算例

当前 confirmed long 为 8 lots，还有 active buy 4、uncertain buy 3、active sell 5，long limit 为 12。不能简单计算净活动单：

```text
naive projected = 8 + 4 + 3 - 5 = 10
```

因为 sell 可能不成交，而买单可能同时成交：

```text
worst long = 8 + 4 + 3 = 15 > 12
```

系统应拒绝新增买单，并考虑撤掉一部分 active buy。若 sell 确实是 venue 保证的 reduce-only，是否可以抵扣仍要核验 position mode、订单大小和其他并发减仓单；保守风控通常不把未成交的减险意图当成已实现保护。

同理，worst short 单独计算。组合风险再把每个 instrument 映射到 delta/beta 和 stress loss，不能用单一净币数替代。

## 20.15 对冲阈值算例

策略每次 maker fill 平均 0.01 BTC。立即用 taker 对冲的单次固定/最小成本较高，于是考虑累计到 0.05 BTC 再对冲。

批量对冲节省了五次重复 crossing，但持仓暴露时间增加。若短期波动估计为每秒 20 bps，累计过程平均耗时 2 秒，0.05 BTC、价格 60,000 的 notional 为 3,000 USDT，粗略价格风险尺度：

```text
3,000 * 20 bps * sqrt(2) ≈ 8.49 USDT
```

这个量不是精确 VaR，只用于说明阈值必须同时比较交易成本和暴露风险。波动上升、depth 下降、inventory 接近限额或 hedge venue 变慢时，阈值应降低并转向更主动；正常流动性下可以扩大批量。

研究输出应画出不同阈值下的 fee、slippage、hedge lag、position tail 和 drawdown，而不是只选净 PnL 最大点。

## 20.16 一次成交的会计与分析视图

策略 maker 买入 1 单位，成交价 100，fee 0.02；随后在 99.80 主动卖出对冲，fee 0.05。忽略 funding：

```text
realized price PnL = 99.80 - 100.00 = -0.20
trading fees       = 0.02 + 0.05 = 0.07
net equity change  = -0.27
```

若 maker fill 时 fair value 为 100.10，看起来买价相对 fair 有 0.10 优势；但对冲时 reference fair 已跌到 99.85。分析可以解释为初始 spread capture、随后 adverse move、hedge slippage 和 fee，但这些项必须互斥并加回 `-0.27`。

如果 dashboard 同时把“spread capture +0.10”和 realized PnL `-0.20` 相加，就重复计算了价格差。会计视图先闭合资金，分析视图再回答为什么变化。两者服务不同问题。

## 20.17 本章练习

1. 实现双边 quote proposal，并对 long inventory 上升写价格/数量不变量测试。
2. 扩展 hard risk，计入 active 与 uncertain orders，覆盖双边同时成交。
3. 比较立即、批量、被动对冲在三种波动/depth regime 下的结果。
4. 演练 hedge venue 断线，写出自动动作、最大暴露和恢复 gate。

本章完成标准：策略无法直接下单，所有意图经过独立、可审计的硬风控；任何报价收益都能拆到费用、markout、库存和对冲成本。
