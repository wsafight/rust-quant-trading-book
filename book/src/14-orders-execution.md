# 第 14 章 订单、撮合与执行成本

第 13 章解释了市场微观结构，本章站在自己的订单视角：订单怎样进入队列、什么价格会成交、主动执行如何穿透深度、执行算法在优化什么。

> **学习导航**
>
> - 开始前：理解订单簿、价差和价格优先/时间优先。
> - 这一章学会：选择订单方式，并计算为了完成交易实际付出的成本。
> - 大约需要：10–12 小时。
> - 做完留下：逐档成交计算、执行成本和大单拆分模型。

> **开章场景：要买 100 个，但 101 元只卖 10 个**
>
> 你接到“买入 100 个”的任务。订单簿上 101 元只有 10 个，102 元有 30 个，103 元才有足够数量。直接下市价单可以很快完成，却会把后面的高价也买走；只在 101 元挂限价单，价格更好，却可能只成交一小部分，甚至完全错过。
>
> 交易目标必须变成具体的订单类型、价格、数量和时间安排。实际代价还包括价差、费用、市场冲击、等待和未完成风险。**本章要解决的是：怎样在成交速度、成交价格与完成概率之间做可解释的选择。**

> **第一次阅读建议**
>
> 先读 14.1 至 14.5，再直接看 14.12 的完整执行例子，理解“发出订单、确认成交、仍可能成交、剩余任务”是不同状态。第一次不必记住所有执行算法；先会解释大订单为什么会吃掉多档价格，以及撤单尚未确认时为什么不能把数量立即重新下出去。

## 14.1 限价单与市价意图

限价买单指定最高可接受价格，限价卖单指定最低可接受价格。它控制价格但不保证成交。

很多加密 venue 的“市价单”在实现上可能是带保护价格的 IOC、按 quote quantity 下单，或有最大滑点限制。不要只看 API 名；确认最终最差价格、数量语义和拒绝条件。

## 14.2 订单可以等待多久

交易接口用 Time in Force（TIF）说明订单可以等待多久：

- GTC：一直保留，直到成交或主动取消。
- IOC：立即成交当时可得的部分，其余自动取消。
- FOK：必须立即全部成交，否则全部取消。
- Post-only：只允许作为 maker 挂单；若会立即成交，则拒绝或调整，具体规则因交易所而异。

订单 type 与 TIF 的合法组合由 venue capability 决定。adapter 在发送前验证，而不是依赖 reject 发现配置错误。

## 14.3 交易所怎样决定谁先成交

简化规则是：价格更优的订单先成交；价格相同时，先到先得（FIFO）。主动买单从最低卖价开始，主动卖单从最高买价开始。

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

## 14.4 大订单会吃掉几档价格

主动订单数量超过最优档时，会继续与后面的价格成交，这常称为扫过多档（sweep）。成交量加权平均价（VWAP）把每一档成交价按成交数量加权：

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

## 14.5 滑点必须说明和谁比较

滑点（slippage）表示实际成交价相对某个参考价格的差异，因此必须说明参考点：

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

## 14.6 挂单能否成交取决于什么

Maker fill 取决于：

- 价格相对 best/fair 的位置。
- queue ahead 和同价 depth 变化。
- 主动对手方成交量。
- quote age、cancel latency 和 market regime。
- 自己订单大小与 venue 优先级。

提高报价激进程度通常增加 fill，也可能让 adverse selection 更差。目标不是最大 fill ratio，而是风险和成本后的条件收益。

## 14.7 撤单再挂会付出什么代价

频繁刷新会：

- 丢失 queue priority。
- 增加 cancel/fill race。
- 消耗 rate-limit/order count。
- 让远端出现多个短生命周期订单。

刷新太慢则 quote stale。研究 quote refresh 时联合比较 fill probability、markout、queue age、cancel RTT、reject 和 message budget。

## 14.8 怎样把大任务拆成小订单

- 时间加权（TWAP）：按时间均匀切分，简单但忽略市场成交量变化。
- 成交量加权（VWAP）：跟随预计的市场成交量曲线。
- 参与率（POV）：让自己的成交保持在市场成交量的一定比例。
- 执行缺口（Implementation Shortfall）：在等待导致的价格风险和立即交易的冲击成本之间调整速度。
- 寻找流动性（Liquidity seeking）：在多个交易所或时点寻找可用报价。

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

## 14.10 怎样在多个交易所之间选择

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

## 14.13 大任务与实际订单必须分开记录

parent order 表示必须完成的业务任务，child order 才是发往 venue 的具体订单。两者不能共用一个 `remaining_qty`：child cancel 在途时，已经确认的成交、仍可能成交的数量和尚未分配的数量同时存在。

对目标数量 `Q`，至少持续维护：

```text
confirmed_fill + active_child_remaining + uncertain_child_remaining
  + unallocated_capacity = Q
```

这里的 `active_child_remaining` 包含 `PendingCancel`。只有 OMS 吸收 venue 的最终累计成交并确认 cancel 生效后，未成交余量才能回到 `unallocated_capacity`。请求已经发送、响应 timeout 的 child 则进入 uncertain，不能提前释放容量。

配套 `execution` 模块实现了最小 parent/child 边界。下面示例来自 Cargo 编译的 example：

```rust,ignore
{{#include ../code/examples/parent_execution.rs}}
```

例子中目标买入 10 lots，maker child 原始数量 4、已确认成交 1、剩余 3 正在撤单，因此新 taker child 最多是 `10 - 1 - 3 = 6`。直接发送 9 会让两个 child 最坏同时把 parent 推到 13。

这个教学 API 假设 `apply_confirmed_fill` 只消费经过 OMS execution 去重的事实；它不自行维护第二套 execution index。`confirm_cancel` 也只接受 OMS 已吸收最终 cumulative fill 后的权威结果。边界分工比在两个模块各做一半去重更容易审计。

## 14.14 在同一场景比较执行算法

不能用不同日期、不同目标和不同基准分别证明每种算法。先固定一个简化买入任务：目标 12 lots，decision mid 为 `100.00`，四个时点的可执行 ask 分别为 `100.05 / 100.02 / 100.08 / 100.20`，假设每个时点深度足够，taker fee 为 2 bps，暂不建模自身冲击。

| Policy | Child 数量 | Fill VWAP | Price shortfall | Fee | 显式成本 |
| --- | --- | ---: | ---: | ---: | ---: |
| Immediate | `12,0,0,0` | 100.0500 | 0.60 | 0.2401 | 0.8401 |
| TWAP | `3,3,3,3` | 100.0875 | 1.05 | 0.2402 | 1.2902 |
| 示例 POV | `1,3,5,3` | 100.0925 | 1.11 | 0.2402 | 1.3502 |

表中：

```text
price_shortfall = sum(child_qty * (fill_price - decision_price))
fee             = sum(child_qty * fill_price * 2 / 10,000)
```

这个价格路径上 immediate 恰好更便宜，但结论不能外推。表格没有计入 12-lot 立即执行可能产生的额外 depth walk 和 market impact；若后续价格下降，TWAP/POV 又可能更有利。Implementation Shortfall policy 不是固定切片名称，而是随剩余时间、未完成数量、短期价格风险和冲击估计动态改变 urgency。

公平实验应对每条历史 parent task 同时运行所有 policy，使用相同 point-in-time book、latency、fee、最大参与率和结束规则，并联合报告：

- executed shortfall 与 opportunity cost，防止“不成交所以成本低”。
- 最大 child、参与率和 depth walk，防止忽略容量。
- completion distribution 和末段被迫执行数量。
- cancel-in-flight/uncertain 暴露和 overfill 次数。
- 不同趋势、波动、spread、depth regime 下的条件结果。

## 14.15 本章练习

1. 扩展 `sweep`，加入买卖方向、限价保护和 checked arithmetic，并分别测试空深度与部分可成交。
2. 用 side sign 计算买卖 implementation shortfall。
3. 模拟 maker order 的 queue ahead，比较频繁/延迟刷新。
4. 扩展配套 `ParentExecution`，增加 uncertain child，并证明它与 pending-cancel 一样占用容量。
5. 用相同的 parent fixtures 比较 TWAP、POV 和立即执行，加入 opportunity cost 与 depth walk 后重新解释结果。

本章完成标准：能从 order type、queue、latency、fee 和剩余任务解释执行结果，而不是只比较成交均价。

## 14.16 回顾与下一章

订单类型和 TIF 是失败语义，不是普通参数。market intent 需要价格保护，post-only 可能拒绝而不是等待，IOC 的未成交部分立即终止，cancel-replace 则可能失去 queue priority 并产生在途暴露。执行模型必须保留这些差异。

评价执行不能只看成交均价。decision、arrival、mid、最终 benchmark 会回答不同问题；implementation shortfall 还需合并 fee、spread、depth walk、opportunity cost 和未完成任务。对 maker 策略，fill rate 与 markout 必须共同解释，否则提高成交率可能只是在吸收更多坏流量。

下一章为订单加上产品合同。相同的 price 与 qty 在现货、线性合约和反向合约中会形成不同 notional、PnL、费用与保证金，因此执行结果必须绑定 instrument metadata 才能入账。
