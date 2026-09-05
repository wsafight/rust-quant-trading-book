# 第 13 章 市场微观结构：价格和成交怎样形成

交易系统处理的不是一条脱离背景的价格曲线，而是一组有排队规则、有费用并且由不同参与者共同产生的订单。研究这些具体交易规则如何影响价格和成交，称为市场微观结构。

> **学习导航**
>
> - 开始前：通过检查点二，能维护一份有效的多档订单簿。
> - 这一章学会：解释价差、排队、成交后价格变化和不同市场状态。
> - 大约需要：10–12 小时。
> - 做完留下：买卖力量与成交后价格变化研究，以及极端行情回放。

> **开章场景：挂在最优买价，为什么偏偏这时成交**
>
> 当前最高买价是 100，最低卖价是 101。你在 100 挂了一张买单，等了很久都没有成交；随后卖单突然大量涌入，你的订单成交了，但市场很快变成 98 / 99。你确实以当时的“好价格”买到了，却立刻面对账面亏损。
>
> 这不是简单的运气问题。价差、排队位置、主动买卖力量和其他参与者掌握的信息，共同决定订单何时成交以及成交后价格怎样变化。**本章要解决的是：怎样从市场参与者的行为理解价格与成交，而不只盯着一条价格曲线。**

> **第一次阅读建议**
>
> 先读 13.1、13.3 至 13.5，再看 13.11 的完整盘口例子。第一次只回答三个问题：为什么有买卖价差、为什么挂单要排队、为什么成交后反而可能亏损。微价格公式、执行成本拆分和研究设计可以第二次阅读，不要把某一个指标当成买卖信号直接使用。

正文给出工程上可检验的定义；Harris、Gould 等微观结构资料列于[附录 E](appendix-e-references.md)，用于继续核对机制、术语和模型假设。

## 13.1 限价订单簿

买方愿意支付的最高价格是 best bid，卖方愿意接受的最低价格是 best ask：

```text
mid             = (best_bid + best_ask) / 2
spread          = best_ask - best_bid
relative_spread = spread / mid
```

只看最优价会遗漏深度。一个 1 tick spread 的市场可能只有很少数量，稍大的市价单就会穿透多档。因此需要同时观察：

- 每档 price 与 aggregated quantity。
- 多档累计 depth。
- 扫到目标数量的 VWAP 和成本。
- 更新、撤单和成交的到达速度。
- book 是否连续、新鲜且通过校验。

## 13.2 中间价、微价格与买卖不平衡

中间价（mid）只平均买卖价格，没有考虑两边各有多少数量。买卖不平衡（imbalance）衡量买方数量相对卖方数量的强弱；微价格（microprice）再用两侧数量调整中间价：

```text
imbalance = (bid_qty - ask_qty) / (bid_qty + ask_qty)

microprice = (best_ask * bid_qty + best_bid * ask_qty)
             / (bid_qty + ask_qty)
```

买方深度更大时，microprice 向 ask 偏移，表达短期上行压力的直觉。但它不是无条件预测器：

- 大量挂单可能快速撤销。
- 同一特征在不同 spread、波动和消息率下含义不同。
- 预测 horizon 必须覆盖你的观察、决策、发送和成交延迟。
- 跨 venue 特征要用当时本地可见状态，不能事后完美排序。

Rust 中可以显式拒绝空深度：

```rust
fn microprice(bid: f64, bid_qty: f64, ask: f64, ask_qty: f64) -> Option<f64> {
    let total = bid_qty + ask_qty;
    if !bid.is_finite()
        || !ask.is_finite()
        || !bid_qty.is_finite()
        || !ask_qty.is_finite()
        || bid <= 0.0
        || ask <= bid
        || bid_qty < 0.0
        || ask_qty < 0.0
        || total == 0.0
    {
        return None;
    }
    Some((ask * bid_qty + bid * ask_qty) / total)
}

fn main() {
    let value = microprice(100.0, 9.0, 101.0, 1.0).unwrap();
    assert!((value - 100.9).abs() < 1e-12);
}
```

这里使用 `f64` 计算研究特征是合理的；将结果变成订单价格时仍要按 tick、方向和 post-only 规则量化。

## 13.3 价差从哪里来

做市商的 spread 不是免费利润。报价至少补偿：

- maker/taker fee 或 rebate。
- 库存持有和价格波动风险。
- 信息不对称与逆向选择。
- 报价、撤单和对冲延迟。
- 对冲市场的 spread、冲击与 basis risk。
- 资本、故障和模型不确定性。

市场剧烈波动时，depth 减少、撤单增加、spread 扩大往往同时发生。把正常时期的固定 spread 外推到极端行情，会低估尾部库存。

## 13.4 挂单方与主动成交方

挂单等待的一方提供了流动性，常称为 maker；主动使用现有报价立即成交的一方消耗了流动性，常称为 taker。maker 可能获得更低费率，但更容易只在行情将要变坏时成交：

```text
你挂 bid -> 有信息的卖单击中你 -> 撤单仍在途
        -> 公允价下移 -> 你持有亏损库存 -> 对冲又支付 spread/fee
```

因此高 fill ratio 不一定是好事。需要看成交后的 signed markout。约定策略买入 `fill_side = +1`，卖出 `-1`：

```text
signed_markout_bps(h)
  = 10,000 * fill_side * (mid(t + h) - fill_price) / fill_price
```

正值对策略有利，负值表示逆向选择。若 `t + h` 时 book 无效或陈旧，该样本应缺失并报告缺失率，不能用旧 mid 填充。

## 13.5 同一价格怎样排队

许多订单簿采用价格优先、时间优先（price-time priority）：价格更优的先成交，同一价格下更早进入的订单在前。真实交易所还可能按比例分配、支持隐藏数量或设置特殊优先级，必须按具体规则核验。

只有 L2 聚合数据时无法知道：

- 自己前面精确有多少真实可成交订单。
- 同价深度减少来自成交还是撤单。
- 隐藏流动性与内部撮合。
- 自己订单在网络/网关中的确切入队时刻。

所以 L2 回测只能给 queue 模型的条件结果。至少报告乐观、中性、悲观假设。

## 13.6 订单类型是风险语义

- Limit：限定最差价格，但不保证成交。
- Market：优先成交，不保证价格；很多 venue 实际使用带保护的 IOC。
- Post-only：目标是只做 maker，若会立即成交则拒绝或调整，具体规则不同。
- IOC：立即成交可得部分，其余取消。
- FOK：要求全部立即成交，否则取消。
- Reduce-only：只允许减少指定方向的仓位，但 position mode 与竞态语义需按 venue 核验。
- Stop/trigger：由 last、mark、index 或其他价格触发，触发后生成的订单类型也需明确。

名称相同不代表语义相同。adapter 必须保留 venue capability 和逐项结果，尤其是 batch、amend、self-trade prevention 与 position side。

## 13.7 成交价比决策价格差了多少

对于已成交数量，使用 `side_sign` 统一买卖方向；买入为 `+1`，卖出为 `-1`。决策价格为 `decision_price`，实际成交价为 `fill_price`：

```text
executed_shortfall
  = side_sign * filled_qty * (fill_price - decision_price)
    + trading_fee
```

`fill_price - decision_price` 已经包含从决策到成交期间实际发生的价格变化、spread 和 impact，不能再把估计的 delay/impact 直接加一次。若要解释来源，应把同一差额拆开，而不是重复计入：

```text
price_shortfall
  = side_sign * filled_qty * (arrival_price - decision_price)  # delay
  + side_sign * filled_qty * (fill_price - arrival_price)     # spread/impact
```

未成交数量再相对结束价格计算 opportunity cost。报告 bps 时，还要明确使用的 notional 分母。常见执行指标包括：

- arrival price：决定开始执行时的参考价。
- VWAP/TWAP：市场或时间基准，但未必可交易。
- slippage：成交相对参考价格的差异。
- market impact：自己的行为引起的价格变化。
- opportunity cost：未成交部分错过的价格变化。

任何指标都必须写明 side、时间、参考价格和 fee 是否包含。

## 13.8 市场状态与流动性

策略不应只按一个全样本平均参数运行。常见 regime 维度：

- spread：1 tick 或多 tick。
- 短期 realized volatility。
- top-N depth 与 sweep cost。
- trade/order-flow imbalance。
- 消息率与撤单率。
- funding、basis、到期或重大事件窗口。
- venue 状态与跨所分歧。

每个信号需要 timestamp、版本和 freshness。风险系统不能仅因为策略“还算得出一个数字”就允许交易。

## 13.9 跨交易所价差不等于套利

看到 A 价格低于 B，不代表能锁定收益。需要同时考虑：

- 两边行情的本地到达时间与时钟不确定性。
- 可成交深度、send latency 和 queue position。
- taker fee、maker fill 不确定性和滑点。
- 资金是否已预置，跨链/转账能否及时完成。
- 合约乘数、结算币种、funding 和 mark 规则。
- 一边成交、另一边失败时的裸露风险。
- venue、稳定币、托管和停机风险。

真正的交易机会是成本和失败情景后的可执行现金流，不是两个屏幕数字之差。

## 13.10 极端行情

极端窗口应研究：

- spread/depth/消息率如何共同变化。
- mark、index、last 与外部 spot 是否分歧。
- cancel RTT、reject、429 和私有流延迟是否恶化。
- 强平流、ADL 与保险基金机制如何反馈到市场。
- maker venue 或 hedge venue 部分失败时最大暴露。

策略动作通常按风险分级：resize、widen、降低 refresh、禁用异常输入、只减仓、全停。具体门槛由产品、正常延迟、波动 horizon、仓位和备用价格源共同决定，不应从一本书复制固定毫秒数。

## 13.11 从盘口到判断的完整例子

考虑一个以 1 为 tick 的简化盘口：

```text
asks: 102 x 20
      101 x  8  <- best ask
----------------
      100 x 10  <- best bid
bids:  99 x 25
```

此时 mid 是 `100.5`，spread 是 `1`。L1 imbalance：

```text
(10 - 8) / (10 + 8) = 0.1111
```

microprice：

```text
(101 * 10 + 100 * 8) / 18 = 100.5556
```

microprice 略高于 mid，表示当前最优档数量对短期上行有轻微倾向。但下一条事件决定如何解释它：

场景 A：best ask 的 8 lots 被主动买单成交，ask 上移到 102。之前的 imbalance 可能捕捉到真实买方压力。

场景 B：best bid 的 10 lots 在成交前全部撤走，bid 下移到 99。此前的“大买量”没有提供真实支撑，甚至可能是短暂展示流动性。

场景 C：双方数量不变，但外部领先 venue 已经下跌，本 venue 的 bid 还没撤。只看本地 imbalance 会在最危险的时刻给出错误方向。

所以特征研究必须使用事件类型、跨所本地到达时间、quote age 和未来 markout 联合验证。一个横截面数值没有独立于事件过程的固定意义。

## 13.12 排队假设怎样影响成交结果

你在 `100` 买入挂 2 lots。下单前 L2 显示该档 10 lots，订单确认后显示 12 lots，于是粗略估计前方有 10 lots。随后发生：

```text
trade sell 4 lots at 100
visible depth 12 -> 7（总共减少 5）
trade sell 3 lots at 100
visible depth 7 -> 4
```

第一次变化中明确 trade 只解释 4 lots，剩下 1 lot 可能是你前方撤单，也可能是后方订单或数据聚合差异。第二次 trade 之后，累计明确成交是 7 lots，仍不足以证明轮到你的 2 lots。

乐观模型可能把不明撤单全部放在你前方，认为 queue ahead 从 10 降到 5，再降到 2；悲观模型只让明确 trade 消耗前方，queue ahead 从 10 降到 6，再降到 3。两者对下一笔 2-lot trade 是否让你成交，会给出完全不同结论。

研究报告不能只选择最有利模型。应该展示不同 queue policy 下 fill、position、markout 和 PnL 的区间，并说明真实 canary 如何校准。

## 13.13 为什么越容易成交有时越容易亏

策略在 `100.00` 买入成交，100 ms 后可信 mid 为 `99.50`：

```text
signed_markout_bps
  = 10,000 * (+1) * (99.50 - 100.00) / 100.00
  = -50 bps
```

如果 maker rebate 是 1 bp，表面上“赚了 rebate”，但短期价格损失约 50 bps。之后在 `99.45` 主动卖出对冲，还会支付 taker fee 和半个 spread。成交并不是收益已经实现，而是风险从挂单变成库存和对冲任务。

相反，一笔 bid fill 后 mid 上涨并不自动表示策略判断正确。需要检查：上涨发生在多长 horizon、能否真实退出、持仓是否因为未成交的 ask 累积、结果是否被少数极端样本主导。

成交质量 dashboard 至少联合展示 fill rate、signed markout 分布、quote age、maker/taker、position 和 hedge cost。单一指标很容易被优化到错误方向。

## 13.14 从机制到可检验假设

一个好的微观结构研究问题应包含机制、条件和可交易门槛。例如：

> 当 spread 为 1 tick、top depth 处于过去 30 天中位数以上时，L1 imbalance 是否能预测本地可见 100 ms mid 变化，并在 5 bps 总执行成本和实际 20 ms send latency 后仍提供正的条件期望？

这个问题比“imbalance 能不能预测价格”更有用，因为它固定了 regime、label time、成本和执行延迟。研究步骤：

1. 用原始事件重建 point-in-time valid book。
2. 在本地 receive time 上采样 feature 和未来 mid。
3. 过滤/标记 invalid、stale 与 locked/crossed 窗口。
4. 按日期切分 train/validation/test，不随机打散事件。
5. 报告预测统计，也报告经过下单阈值后的触发率和容量。
6. 在不同 latency、fee 和 queue 参数下重复。

负结果同样重要。它可能告诉你 horizon 太短、线路太慢、signal 只在不可成交极端窗口出现，或预测优势不足以覆盖 adverse selection。

## 13.15 本章研究任务

1. 按 spread、volatility 和 depth 分组，研究 L1 imbalance 对 10 ms、100 ms、1 s markout 的预测性。
2. 以 maker fill 为样本，计算 signed markout 并按 side、quote age、trade flow 和 venue 分组。
3. 比较 mid、microprice 和多档 imbalance，报告 out-of-sample 结果与可交易延迟阈值。
4. 选一个历史极端窗口，重放 book validity、数据 age、spread、depth 和消息率。

本章完成标准：能从事件序列解释一次 maker 亏损，能说明 L2 queue 的不可识别部分，并能把市场术语转成带方向、时间和数据条件的指标。

## 13.16 回顾与下一章

订单簿是参与者意图的可见投影，不是全部流动性，也不是未来成交承诺。mid、microprice、imbalance 和 spread 都只有在明确时间、深度、venue 与有效 book 条件下才有意义；queue ahead、隐藏单和其他参与者撤单则构成 L2 数据无法完全识别的部分。

对 maker 而言，获得 spread 与承受 adverse selection 是同一事件的两面。研究信号时既要观察未来 mid，也要以真实或模拟 fill 为条件观察 signed markout，并按 spread、volatility、depth 和 latency 分组。能预测价格不等于能在排队、费用和延迟之后获得收益。

下一章从市场机制转向具体订单选择：TIF、price-time priority、主动扫单、被动排队和 parent/child 调度。目标是把“市场看起来怎样”变成“这笔执行实际付出了什么成本”。
