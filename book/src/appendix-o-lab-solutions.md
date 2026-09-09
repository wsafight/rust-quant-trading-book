# 附录 O 带反馈实验参考解答

本附录对应[附录 I 的六个实验](appendix-i-guided-labs.md)。先独立完成实验并保存失败记录，再打开相应解答。这里给出的不是唯一代码结构，而是一套可以逐项核对的不变量、状态、步骤和证据。

如果自己的方案与参考解答不同，先比较它们能否处理相同反例，不要仅根据命名或代码行数判断优劣。

## O.1 第一部分：从裸数值到报价资格

### 必须先固定的规则

```text
输入字符串 --严格解析--> ticks/lots
盘口合法且双边存在 --验证--> TradableTop
当前仓位 + 未决暴露 + 新意图 --检查--> Allow / Resize / Reject
```

- 价格必须是 tick size 的整数倍；
- 数量必须为正且不超过数值范围；
- `best_bid < best_ask` 才能构造可交易盘口；
- 买单增加 long 暴露，卖单增加 short 暴露；
- 风险拒绝是业务决定，解析失败和算术溢出是错误；
- 任何公开入口都不能绕过构造规则。

### 参考接口

```rust,ignore
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub struct PriceTicks(i64);

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct QtyLots(i64);

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct PositionLots(i64);

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Side { Buy, Sell }

#[derive(Debug, PartialEq, Eq)]
pub enum InputError { Empty, InvalidDecimal, ExcessPrecision, NonPositive, Overflow }

#[derive(Debug, PartialEq, Eq)]
pub enum QuoteDecision { Allow(QtyLots), Resize(QtyLots), Reject(RejectReason) }

#[derive(Debug, PartialEq, Eq)]
pub enum RejectReason { InvalidBook, NoCapacity, Arithmetic }
```

字段保持私有。`PriceTicks::parse_decimal` 与 `QtyLots::new` 是进入领域层的入口；`TradableTop::new` 检查双边与 crossed；风险函数只接受已经验证的值。

### 严格小数转换

以 tick size `0.05` 为例，不先转 `f64`：

1. 拆分整数和小数部分；
2. 拒绝空字符串、符号位置错误和多余分隔符；
3. 把字符串按固定十进制 scale 转为整数，例如 `100.10 -> 10010`；
4. 把 tick size 同样转为 `5`；
5. 要求 `10010 % 5 == 0`；
6. 使用 checked arithmetic 得到 `2002 ticks`。

`100.12` 不能在未声明舍入规则时自动变成 `100.10`。如果业务允许买价向下、卖价向上舍入，应使用带 `Side` 的独立函数，并把原值与结果写入审计。

### 风险决定

```text
buy_capacity  = max_long - current_position - active_buy - uncertain_buy
sell_capacity = current_position - min_short - active_sell - uncertain_sell
```

所有运算使用 checked arithmetic。请求数量小于等于容量时 `Allow`；容量为正但小于请求时 `Resize`；容量非正时 `Reject(NoCapacity)`。行情不可交易时，增险订单直接拒绝；风险减少动作是否允许需要单独规则。

### 最小验证矩阵

| 输入 | 预期 |
| --- | --- |
| `100.10`, tick `0.05` | `2002 ticks` |
| `100.12`, tick `0.05` | `ExcessPrecision` 或不整除错误 |
| bid `100`, ask `100` | `InvalidBook` |
| position `8`, buy `5`, max `10` | `Resize(2)` |
| position `10`, buy `1`, max `10` | `Reject(NoCapacity)` |
| 计算越过整数上界 | `Arithmetic`，状态不变 |

### 为什么常见方案失败

- `f64.round()` 隐藏产品精度和方向舍入；
- `bool` 无法区分非法盘口与仓位超限；
- 构造器公开字段后，调用方可以绕过校验；
- 先修改仓位再检查溢出会留下半次状态；
- active/uncertain exposure 缺失会低估最坏风险。

### 完成证据

保存接口说明、解析表、风险表、测试输出和一段限制：本方案只证明离线单产品报价资格，不证明真实 metadata、网络发送或远端订单状态。

## O.2 第二部分：有界、会失效的行情管线

### 状态与 owner

```text
Connection task --RawFrame--> Decoder task --BookEvent--> Book owner
       |                           |                       |
       v                           v                       v
 transport health             schema errors        immutable snapshots
                                                           |
                                                           v
                                                     strategy/risk readers
```

只有 book owner 修改同步状态和价格档。连接任务不拥有 book，策略只读取带版本的不可变快照。supervisor 创建任务、接收退出原因、触发关闭并等待 join。

### 消息分类与满载动作

| 消息 | 是否可丢 | 满载动作 | 理由 |
| --- | --- | --- | --- |
| order-book delta | 否 | 使本轮同步失败并重连/resync | 删除一条会破坏连续性 |
| 完整替代 snapshot | 视协议而定 | 合并旧候选，仅保留明确更新版本 | 新状态可能完整替代旧状态 |
| execution | 否 | 阻止上游或持久化后重试 | 是经济事实 |
| dashboard snapshot | 可以 | 保留最新版本 | 旧展示可被新展示替代 |
| debug log | 可以降级 | 采样、限速并计数 | 不能拖垮资金关键路径 |

### 容量推导

正常输入 `20,000/s`，burst `80,000/s`，consumer `40,000/s`，持续 `0.5s`：

```text
net backlog = (80,000 - 40,000) * 0.5 = 20,000 messages
```

队列容量至少需要覆盖该窗口及安全余量，但还要受最大消息年龄限制。如果允许的 queue age 只有 `200 ms`，容量不能被用来让旧数据等待更久；应更早触发失效或降级。若输入长期为 `60,000/s` 而服务率为 `40,000/s`，任何有限容量最终都会满，正确动作不是继续扩容。

### book 状态转换

```text
Empty -> Synchronizing -> Healthy
             |              |
             v              v
           Invalid <----- gap / invariant failure
             |
             +-> new snapshot -> Synchronizing

Healthy -> Stale when valid-event age exceeds threshold
```

`Invalid` 或 `Stale` 都不能发布可交易 mid。恢复 transport 只允许重新开始同步，不直接进入 `Healthy`。

### 关闭顺序

1. trading readiness 变为 false；
2. 停止产生新增风险的上游输入；
3. 继续接收必须收敛的成交和撤单结果；
4. 排空或按已声明规则处理队列；
5. 发布最终状态并刷新必要记录；
6. supervisor 等待各任务结束；
7. 超过 deadline 时输出未完成 owner 和外部可能状态。

### 最小验证矩阵

- 正常 snapshot + 连续 delta 得到 `Healthy`；
- 删除中间 delta 后进入 `Invalid`，不再提供 tradable view；
- 输入两倍 burst 时记录 depth、residence time 和 book age；
- ping 持续但 valid event 停止时进入 `Stale`；
- 每个等待点关闭时都能得到明确退出原因；
- 重复运行得到相同最终 checksum。

### 为什么常见方案失败

无界队列把丢消息问题变成使用陈旧状态和内存耗尽问题；`drop oldest` 会破坏增量链；只测 consumer 函数耗时会漏掉排队；广播 cancellation 不会自动撤销已经写出的外部请求。

### 完成证据

保存 task/owner 图、容量推导、消息分类表、状态转换日志、正常/gap/burst/stale/close 测试和性能环境。它仍不能证明真实网络或某个 venue 协议正确。

## O.3 第三部分：一笔交易的经济闭环

### 固定产品与记账约定

使用简化线性产品：

```text
price unit       = 1 quote / base
quantity unit    = 1 base
multiplier       = 1
cash-flow income = positive
position long    = positive
fee expense      = negative cash flow
```

真实产品必须替换为带版本的 metadata；这里的目标是先证明方向和恒等式。

### Golden cash-flow

初始 cash `1,000`，position `0`：

| 事件 | Cash 变化 | Position | Cost basis | Realized PnL | Fee |
| --- | ---: | ---: | ---: | ---: | ---: |
| Buy 2 @ 100 | -200 | 2 | 200 | 0 | 0 |
| Buy 1 @ 106 | -106 | 3 | 306 | 0 | 0 |
| Sell 2 @ 110 | +220 | 1 | 102 | +16 | 0 |
| Fee 1 | -1 | 1 | 102 | +16 | -1 |
| Funding income 2 | +2 | 1 | 102 | +16 | -1 |

结束 cash 为 `915`。若 mark 为 `108`，持仓市值为 `108`，equity 为 `1,023`；相对初始权益增加 `23`，等于已实现价格收益 `16`、剩余未实现收益 `6`、fee `-1` 和 funding `+2`。

### reducer 顺序

1. 以明确作用域的 execution key 查询历史；
2. 完全相同则返回 Duplicate，不改变状态；
3. 相同 key、不同事实则返回 Conflict；
4. 在临时状态计算 cash、position、cost 和 realized；
5. 所有 checked arithmetic 成功后整体提交；
6. 估值时使用带 source/time 的 mark；
7. 计算 equity residual，超过币种精度允许的容差时失败。

### 镜像验证

把所有 buy/sell 互换并保持价格路径对称，现金流和 PnL 方向应相应镜像。只测试 long 会漏掉 short、减仓与反手的符号错误。

### 规则变化

修改 multiplier 或 fee currency 后，不能只重算最终 PnL。必须使旧结果指向旧 metadata version，并生成新版本结果。如果 fee 使用 BTC 而 cash 使用 USDT，先以原币种记账，再用带时间和来源的 FX 估值，不能直接相加。

### 最小验证矩阵

- long/short 开仓和平仓；
- 部分平仓和反手；
- 分数平均成本；
- duplicate 与 conflicting execution；
- 正负 funding；
- fee currency 不同；
- 算术溢出不留下半次入账；
- 重放后 checksum 和 equity identity 相同。

### 完成证据

保存手算表、机器输出、产品规则、舍入规则和 reconciliation report。该结果不证明真实交易所账单已经校准，也不证明保证金或强平实现完整。

## O.4 第四部分：五秒钟的部分失败

### 事实时间线

| 时刻 | 新事实 | 本地状态 | 远端可能状态 | 允许动作 |
| --- | --- | --- | --- | --- |
| t0 | intent 已持久化 | Prepared | 无订单 | 可尝试发送 |
| t1 | socket write 完成 | PendingAck | 可能收到或未收到 | 不得换 ID 重发 |
| t2 | HTTP timeout | Uncertain | 不存在、活动、部分/全部成交 | 计入最坏风险并查询 |
| t3 | public gap | book Invalid | 订单仍可能活动 | 停止新增风险 |
| t4 | private stream 断开 | private state stale | 仍可能成交 | 保持消费恢复/查询路径 |
| t5 | 本地进程重启 | Replaying | 远端状态未知 | 不开放交易 |
| t6 | recent fill 查询返回 | execution known | 可能仍有剩余订单 | 幂等入账并继续对账 |
| t7 | open-order/position/balance 闭合 | Reconciled | 范围内事实已对齐 | 进入审批，而非自动开放 |

### reducer 与 executor 边界

```text
command -> durable intent -> reducer -> action
                                  |
                                  v
                           executor performs I/O
                                  |
                                  v
                           observed event -> reducer
```

reducer 不直接访问网络或数据库，因此历史重放不会再次下单。executor 的结果不直接修改订单，而是产生 `SendAttempted`、`AckObserved`、`FillObserved`、`QueryObserved` 等事件。

### 单调状态原则

- `fill-before-ack` 可以把订单推进到 PartiallyFilled/Filled；迟到 ack 不得倒退；
- cancel requested 不等于 cancelled；等待期间仍可能 fill；
- cancel ack 后迟到的有效 execution 仍需入账；
- duplicate execution 不改变账本；冲突 execution 隔离；
- terminal order 的历史事实保留用于去重、审计和重放。

### 最坏暴露

```text
worst_long  = position + active_buy + pending_buy + uncertain_buy
worst_short = position - active_sell - pending_sell - uncertain_sell
```

具体数量还要考虑剩余可成交量和 parent/child 守恒。不能因为本地没有 ack 就把订单从暴露中删除。

### 恢复 gate

恢复至少需要：

1. 本地 event log 与 snapshot 校验；
2. 远端 open/recent orders；
3. 远端 recent executions；
4. position、balance 和 equity reconciliation；
5. 行情重新同步并持续新鲜；
6. hard-risk config 有效；
7. 策略外审批和低限额恢复计划。

### 最小验证矩阵

覆盖附录 I 的五秒序列，再增加 fill-before-ack、duplicate fill、late cancel ack、pending-cancel partial fill，以及 intent 保存前后和 send 后确认保存前的进程退出。每个中间点都能回答已知、未知、最坏暴露和允许动作。

### 完成证据

保存状态表、事件日志、订单/成交/账本关联、重启前后 checksum 和审批记录。它不能证明具体 venue 支持按 client ID 查询；不支持时必须在 capability 中降低恢复保证。

## O.5 第五部分：推翻一份漂亮回测

### 预先登记研究问题

```text
机制：订单簿买方失衡可能预测短时主动买入压力
feature：决策时已发布的 L1 imbalance
horizon：本地决策后 100 ms
condition：spread=1 tick 且 book fresh
action：在 bid 被动挂买单
cost gate：fee + adverse selection + hedge cost < expected edge
failure condition：悲观 queue 或 5x latency 下净效果不为正
```

### 时间线

```text
raw event time -> local receive -> validated book publish -> decision
-> send latency -> order eligible -> fill/cancel -> report latency
-> OMS/ledger -> label horizon end
```

feature 只能使用 decision 前本地已发布的状态。订单不能在 eligible time 前成交；label 与训练边界重叠的样本需要 purge 或隔离。

### 数据切分

- `train`：建立候选特征和初始参数；
- `validation`：比较有限候选和敏感性；
- `holdout`：只在决定固定后运行一次；
- 若看过 holdout 后继续改参数，创建新的未来 holdout，旧集合降级为 validation。

### 实验矩阵

| 维度 | 取值 |
| --- | --- |
| fill | touch / trade-through / optimistic-base-pessimistic queue |
| latency | 1x / 2x / 5x / 10x |
| fee | maker/taker 当前值及压力值 |
| regime | normal / high-volatility / thin-book / disconnect |
| scale | 1x / 2x / 5x notional |

每个单元保存订单数、fill、signed markout、position tail、turnover、fee、PnL、drawdown、residual 和 checksum，而不只保存 Sharpe。

### 决策示例

假设 holdout 上成本前 effect 为 `1.8 bps`，区间 `[0.4, 3.1]`，确定费用和价差为 `2.4 bps`，排队/延迟误差可能再降低 `0～1.5 bps`。统计效果可能存在，但当前证据不支持净收益。决定应为 `Revise`，而不是 `Canary`：缩小市场条件、改善执行或停止该下单方式。

### 必须保存的失败结果

- 随机切分显著、时间切分失效；
- touch 盈利、trade-through 或悲观 queue 亏损；
- 1x 延迟有效、5x 延迟失效；
- 效果只集中在一个 regime；
- PnL residual 超过容差。

这些不是应删除的坏结果，而是决定当前策略阶段的主要证据。

### 完成证据

保存 data/config/model/code/seed manifest、完整尝试清单、时间线、敏感性矩阵、账务核对和阶段决定。本实验不能证明实盘表现；进入 shadow 后仍需比较真实 latency、fill 和 markout。

## O.6 第六部分：让陌生人审查项目

### 评审包结构

```text
README
manifest
fixtures/
configs/
reports/
runbooks/
evidence-index.md
known-limitations.md
review-record.md
```

### README 最小顺序

1. 项目解决什么、不解决什么；
2. 安全边界和数据来源；
3. 环境与单一运行入口；
4. 正常演示及预期状态；
5. 故障演示及预期拒绝/恢复；
6. 如何复核一个关键数字；
7. 已知限制和证据等级。

### 证据索引

| 声明 | 输入 | 配置/版本 | 验证 | 限制 |
| --- | --- | --- | --- | --- |
| gap 后停止报价 | fixture A | schema v2 | event 103 missing test | 只覆盖该 venue 规则 |
| duplicate fill 不重复入账 | event log B | ledger v3 | before/after checksum | execution scope 来自 fixture |
| p99.9 小于预算 | workload C | release/env manifest | raw samples + percentile | 不代表其他硬件 |
| 回测结论为 Revise | dataset D | model/config E | holdout report | 无真实 fill 校准 |

### 第一次独立运行规则

- 作者只提供仓库入口，不口头解释；
- 评审者记录每个无法判断的步骤；
- 环境、输入或命令缺失算文档缺陷；
- 运行成功但无法知道是否正确，也算验收失败；
- 评审者选择一个未写死的输入变化和一个故障；
- 修订文档后由同一人或第二人复验。

### 可接受的最终结论

```text
已复现：固定输入下的状态、账务与 checksum
已观察：某环境和 workload 下的性能分布
已模拟：三类成交与若干延迟条件
尚未证明：真实排队、真实资金收益和生产值班能力
```

### 不可接受的结论

- “一键运行成功，所以系统生产可用”；
- “测试网成交，所以策略有实盘收益”；
- “某次 p99.9 很低，所以所有环境都低延迟”；
- “评审者没有提问，所以文档完整”。

### 完成证据

最终保存首次评审记录、隐藏步骤清单、修订 diff 和复验结果。只有真实的另一位评审者完成这些动作后，才能把“已独立复现”标记为完成。

## O.7 怎样使用参考解答评分

参考解答不是逐字符标准答案。评分顺序为：

1. 是否保持同样的不变量；
2. 是否覆盖同样的正常、边界和故障；
3. 是否在错误时保持状态原子性；
4. 是否留下可复现证据；
5. 是否诚实说明不能证明的内容。

自己的设计如果能用更小结构满足同一约束，可以优于参考解答；如果只在示例 happy path 下输出相同数字，则仍未完成。
