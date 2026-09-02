# 第 24 章 模拟交易所与成交模型校准

回测框架能按时间调用策略，不代表成交可信。模拟交易所必须回答订单何时到达、是否有资格参与队列、撤单何时生效、成交报告何时可见，以及这些假设与真实观察相差多少。

> **学习导航**　前置：第 13、14、18、21、23 章的 queue、parent/child、行情时间、OMS 与事件回放｜目标：实现可替换成交模型并用未见数据校准偏差｜预计：14–20 小时｜产出：三层 fill model、latency 参数包、校准/验证报告和模型拒绝条件

## 24.1 模拟器的权限边界

模拟器可以维护虚拟 venue truth，但不能直接写策略仓位：

~~~text
strategy intent -> hard risk -> simulated request
-> venue accept/reject/fill/cancel report
-> OMS reducer -> execution ledger -> position/equity
~~~

若模拟器在命中价格时执行 position += qty，它绕过了 execution ID、乱序、duplicate、fee 和 OMS 状态机；这条回测路径无法验证生产路径。

## 24.2 四个不同时间

一笔订单至少有：

~~~text
t_decide   策略创建 intent
t_send     gateway 写请求
t_accept   venue 接受，订单开始有成交资格
t_report   ack 到达本地 OMS
~~~

fill 又有 t_match 和 t_fill_report。因此完全可能：

~~~text
t_accept < t_match < t_fill_report < t_report(new_ack)
~~~

这就是 fill-before-ack，不是异常数据。模拟器若按函数调用顺序先返回 ack 再允许 fill，会删除真实系统必须处理的路径。

## 24.3 三种最小成交模型

**Touch**：对手最优价触及 limit 就全部成交。它适合作为乐观上界或 marketable limit 的简化，不适合作为普通 maker 的中心估计。

**Trade-through**：只有对手成交价严格穿过 limit 才认为全部成交。它放弃同价成交，通常更保守，但仍没有部分 queue 信息。

**L2 queue**：订单到达时初始化 queue_ahead。正确 aggressor side 的同价 trade 先消耗前方数量，剩余 trade 才分配给自己；穿价则认为剩余订单成交。

配套实现固定了这些语义，可运行示例证明 fill report 早于 new ack：

~~~rust,ignore
{{#include ../code/examples/simulator_fill_before_ack.rs}}
~~~

## 24.4 订单资格不能使用未来事件

订单在 t_accept 前没有队列位置。考虑：

~~~text
00.000 market update arrives locally
00.002 strategy decides
00.007 order reaches venue
00.005 trade occurs at order price
~~~

即便回放程序在读取行情后立刻创建订单，5 ms 的 trade 也不能让 7 ms 才到达的订单成交。调度器应把 market、order-arrival、cancel-effective 和 report 都放入同一个 time/priority/local-sequence 序列。

同一 timestamp 的优先级也是模型输入。若无法知道 venue 内部先后，至少运行 market-first/order-first 两个边界并报告差异。

## 24.5 Queue Ahead 从哪里来

L2 只能看到同价总量。下单前看到 10 lots、ack 后看到 12 lots，不证明自己的前方恰好有 10；期间可能有新增、撤单、成交和聚合延迟。可使用：

- 乐观：不明 depletion 更多分配给前方。
- 悲观：只有明确 trade 消耗前方，不明撤单都在后方。
- 概率模型：按历史 fill/depletion 条件分布分配。

三种 policy 必须共享同一订单到达时间和原始事件。不能为盈利策略选乐观 queue、为基准策略选悲观 queue。

## 24.6 Partial Fill 与守恒

每次模拟成交持续满足：

~~~text
0 < fill_qty <= order_remaining
new_remaining = old_remaining - fill_qty
cumulative_fill 单调不减
~~~

同一 market trade 分配给多个自己的订单时，总模拟 fill 不能超过该 trade 能解释的数量，除非模型明确使用穿价或隐藏流动性假设。多策略共用账户时还要避免每个策略都独立消费完整市场成交量。

## 24.7 Cancel/Fill Race

cancel request 不是立即终态：

~~~text
t_cancel_send -> network/gateway -> t_cancel_effective -> t_cancel_report
~~~

t_cancel_effective 前的 market event 仍可能成交；之后不再新增成交，但旧 fill report 可能晚于 cancel ack 到达本地。测试至少覆盖：

1. partial fill 后请求 cancel，生效前再成交。
2. final fill 与 cancel effective 同时发生的两种 tie-breaker。
3. cancel ack 先到、旧 fill report 后到。
4. cancel response timeout，但 venue truth 最终为 working/filled/cancelled。

## 24.8 延迟不是一个平均常数

拆分经验分布：

- market wire-to-local 与 decoder/queue residence。
- decision compute 与 gateway queue。
- send-to-accept、accept-to-ack report。
- cancel-send-to-effective、effective-to-report。
- match-to-fill-report、fill-to-risk-update。

至少保留 p50/p90/p99/p99.9、时间段、消息率和 venue health。相关性也重要：极端行情中行情延迟、cancel 延迟、reject 和 spread 往往同时恶化。分别独立随机抽样会低估共同尾部。

第一版可以使用固定延迟以保证行为可解释；第二版再从版本化经验分布抽样，并记录 seed 与抽样算法版本。

## 24.9 校准数据集

小额 shadow/canary 记录每次订单的：

~~~text
decision/send/accept-estimate/ack/cancel/fill local times
book sequence + same-price depth at decision/ack
trade volume and depth depletion while working
fill qty/time + maker/taker + fee
quote age + spread/depth/volatility regime
post-fill markout + missing reason
~~~

无法直接观察的 t_accept 可以用 ack、服务器 timestamp 和测量区间界定，不能伪造成精确值。校准报告应区分观察值、推断值和模型参数。

## 24.10 比较条件分布，不只对齐总 Fill Count

模拟 1,200 次、真实 1,200 次成交并不表示模型正确。可能出现：平静期模拟过多、极端期模拟过少；bid 偏多、ask 偏少；首笔成交时间过快但完成时间过慢。

至少比较：

| 条件 | 指标 |
| --- | --- |
| side / venue / instrument | fill probability、qty、maker/taker |
| queue-ahead bucket | time-to-first-fill、completion |
| spread/depth/volatility | fill 与 negative markout |
| quote age / cancel age | stale fill、cancel-race fill |
| latency bucket | inventory tail、hedge lag |

校准目标不能只有 fill error。模型还要保持 position path、fee、markout 和极端损失的方向合理。

## 24.11 校准与最终验证分开

按时间执行：

~~~text
calibration period -> freeze model/version
-> validation period -> compare without retuning
-> shadow/canary decision -> next unseen period
~~~

每看到 validation 偏差就回头调参，再把同一段称为样本外，会把模拟器本身过拟合。保存旧模型、全部参数尝试和失败 regime；模型版本变化必须说明修复哪个偏差，以及是否恶化其他条件。

![模拟成交模型的校准与未见数据验证闭环](assets/simulator-calibration-loop.svg)

## 24.12 参数敏感性矩阵

基准结果至少重复：

- touch、trade-through、L2 optimistic/neutral/pessimistic。
- send/cancel/fill-report latency 为 1x/2x/5x/10x。
- fee/rebate、queue ahead、partial-fill allocation 改变。
- 正常、极端消息率、行情 gap、private stale、429。
- market-first 与 order-first 的同 timestamp tie-breaker。

报告 fill ratio、signed markout、position tail、drawdown、turnover、fee 和 equity residual。若收益只在 touch、最低延迟或 rebate 假设下存在，应判定证据不足。

## 24.13 模型何时应该被拒绝

以下情况不是“以后再优化”的小缺点：

- 使用订单到达前的 market event 成交。
- cancel 调用立即删除订单。
- fill 直接修改仓位而不经过 OMS/ledger。
- 多订单消费超过可解释市场数量。
- 相同输入和 seed 得到不同结果。
- invalid/stale book 期间继续新增风险。
- 账本 residual 超限仍输出成功收益曲线。
- 校准只对总 PnL，不比较可观察中间量。

这些问题会系统性制造无法获得的成交或隐藏风险，应阻止研究结论进入下一 gate。

## 24.14 一次校准决策示例

假设 neutral L2 模型在 validation 期得到：

| 指标 | 模拟 | Canary | 差异 |
| --- | ---: | ---: | ---: |
| Fill rate | 11.8% | 6.4% | 模拟过于乐观 |
| First-fill p50 | 42 ms | 91 ms | queue 消耗过快 |
| Cancel-race fills | 0.7% | 3.2% | cancel 尾延迟不足 |
| 100 ms markout | -1.8 bps | -5.9 bps | adverse selection 偏低 |

不能只把全局 fill probability 乘 0.54。差异同时指向 queue、cancel latency 和成交选择性。下一模型应按 queue/volatility bucket 调整 depletion，使用联合的压力延迟窗口，并在新时期验证 markout；在此之前策略规模不应扩大。

## 24.15 本章练习

1. 使用配套 simulator 分别运行 touch、trade-through 和 L2 queue，保存每个 report 时间线。
2. 注入 cancel 生效前 partial fill 和 cancel ack 后迟到 fill report，验证 OMS/ledger。
3. 给两个同价自有订单分配一笔 market trade，建立总量守恒测试。
4. 从一组 synthetic canary 记录生成 queue bucket 校准表，并保留未见验证段。
5. 完成 1x/2x/5x/10x 延迟与五种 fill policy 的敏感性矩阵。

本章完成标准：模拟成交都有订单资格、市场事件和模型版本依据；结果在未见数据上比较条件分布，并能明确指出哪些偏差会阻止进入 Shadow 或 Canary。
