# 第 17 章 交易账本：避免重复记账并完成对账

策略可以算错，行情可以中断，订单响应可以丢失，但已经发生的资金事实不能因为消息重放、进程重启或到达顺序不同而再次改变账户。相同事件处理多次仍得到同一结果，这个性质称为幂等。本章把第 15、16 章的产品公式落实为一个可运行账本，并明确它与订单系统、交易所账单及分析报告的边界。

> **学习导航**
>
> - 开始前：理解产品现金流、平均成本和账户权益恒等式。
> - 这一章学会：让成交只记一次，并用交易所记录核对本地账本。
> - 大约需要：12–16 小时。
> - 做完留下：平均成本账本、标准现金流样本、对账报告和重放校验值。

> **开章场景：断线重连后，同一笔成交又来了一次**
>
> 程序已经记录“以 101 元买入 2 个”，仓位从 0 变成 2。短暂断线后，交易所重新发送了同一个成交编号；如果程序见到消息就再加一次，仓位会错误地变成 4。第二天本地显示 4，交易所显示 2，直接把本地数字改成 2 又会掩盖重复记账的原因。
>
> 账本应保留每笔经济事件，并用稳定编号保证同一事实只入账一次；对账则比较本地与交易所记录并解释差异。**本章要解决的是：怎样从可追溯事件计算仓位和现金，并在重复、缺失或重放后仍得到同一结果。**

> **第一次阅读建议**
>
> 先顺着 17.1、17.3、17.4 和 17.6 手算一遍：成交发生后，现金、仓位、持仓成本和费用必须一起变化。然后读 17.9 至 17.11，理解为什么程序重启后不能直接相信本地数字。校验算法和冲突恢复流程可以第二次阅读，但“同一成交绝不能记两次”必须第一次就掌握。

## 17.1 账本不等于仓位变量

下面的写法无法回答资金系统最基本的问题：

~~~text
position += signed_fill_qty
pnl += guessed_profit
~~~

它没有记录哪笔成交改变了状态、费用从哪个币种扣除、使用什么成本法、估值价格来自哪里，也无法判断重放后是否重复入账。可信账本至少分开：

- 不可变输入事实：成交、交易费用、资金费用、转账和结算。
- 根据事实计算出的账务状态：现金、持仓、未平仓成本和已实现盈亏。
- 带时间的估值：标记价、汇率、未实现盈亏和账户权益。
- 分析视图：价差收益、成交后价格变化、库存损益和对冲归因。

分析视图可以重算，不能反向修改资金事实。

![交易账本与对账数据流](assets/ledger-reconciliation.svg)

## 17.2 先固定核算范围与单位

在写状态更新函数前回答：

1. 账户范围是单 venue 子账户，还是跨 venue 组合？
2. 每个 cash balance 的币种是什么？
3. price ticks 乘 qty lots 如何通过 tick value、lot value 和 multiplier 变成结算金额？
4. fee、funding 和 collateral haircut 使用什么精度与舍入？
5. equity 使用哪个 mark 与 FX source，在什么时刻取值？

配套实现采用教学单位：

~~~text
notional_quote = price_ticks * qty_lots
fee_quote      = 非负整数 quote unit
~~~

这足以证明状态算法，不足以直接接真实产品。扩展时应让 instrument metadata 提供转换规则，而不是在账本里按 symbol 猜测。

## 17.3 每笔成交必须有稳定编号

同一个交易所数字 ID 未必在所有账户和产品中唯一。一笔成交的身份键（execution key）通常至少包含：

~~~text
(venue, account, instrument, execution_id)
~~~

处理重复 key 时要比较完整事实：

- key 和 side/price/qty/fee 都相同：幂等重放，返回 Duplicate。
- key 相同但任一事实不同：数据冲突，停止投影并对账。

第二种情况不能安静地“以第一条为准”，因为它可能来自 adapter 作用域错误、venue correction、日志损坏或账户串线。

## 17.4 现金与持仓必须同时更新

在线性教学口径中，买卖现金流为：

~~~text
Buy:  cash -= price * qty + fee; position += qty
Sell: cash += price * qty - fee; position -= qty
~~~

一笔成交对应的现金、持仓、持仓成本和成交索引必须属于同一个提交边界。如果现金已经扣除，而持仓更新失败，状态不能停在中间。配套的 `Ledger::apply_fill` 会先在候选状态上完成全部溢出检查，成功后才整体替换当前状态。

内存 clone 只是教学事务。持久化版本通常先追加带 checksum 的不可变事件，再更新可重建投影；不能把四张数据库表的“尽量同时写”当成精确一次。

## 17.5 平均成本怎样随买卖变化

同方向增加仓位时，把新 notional 加入 open cost。反方向成交时，先关闭已有仓位：

~~~text
average_cost = open_cost / abs(position)
closed_cost  = average_cost * close_qty

long realized  = exit_notional - closed_cost
short realized = closed_cost - exit_notional
~~~

若 fill 大于已有仓位，先把旧仓位全部关闭，再以剩余数量和本次 fill price 建立反向仓位。不要对完整 fill 先算一个平均价后再猜反手成本。

平均成本可能是分数。先买 1 @ 100，再买 2 @ 101，平均成本是 302/3。过早截断会把舍入差异藏进 realized PnL。配套实现用约分有理数保存 cost basis 和价格 PnL；生产可以选择 decimal，但必须固定 scale、舍入时点与 remainder policy。

## 17.6 一条完整现金流

从 10,000 quote cash 开始：

| 事件 | 现金 | 持仓 | 未平仓成本 | 已实现价格盈亏 | 累计费用 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Buy 2 @ 100, fee 1 | 9,799 | 2 | 200 | 0 | 1 |
| Buy 3 @ 110, fee 1 | 9,468 | 5 | 530 | 0 | 2 |
| Sell 2 @ 120, fee 1 | 9,707 | 3 | 318 | 28 | 3 |

用 mark 115 估值：

~~~text
unrealized price PnL = 3 * 115 - 318 = 27
equity                = 9,707 + 3 * 115 = 10,052
equity change         = 28 + 27 - 3 = 52
~~~

如果再卖 5 @ 90、fee 1，先以平均成本 106 关闭 long 3，新增 realized 为 3*(90-106)=-48；剩余 2 建立 short，open cost 为 180。累计 realized 是 28-48=-20。mark 为 80 时 short unrealized 为 20，累计 fee 为 4，equity change 为 -20+20-4=-4。

## 17.7 可运行实现

完整账本实现位于 `book/code/src/ledger.rs`。下面的代码来自 Cargo example，不是与实现分离的正文副本：

~~~rust,ignore
{{#include ../code/examples/ledger_round_trip.rs}}
~~~

运行账本单元测试与完整离线闭环：

~~~bash
cargo test --locked --manifest-path book/code/Cargo.toml ledger
cargo test --locked --manifest-path book/code/Cargo.toml --test offline_trading_loop
~~~

offline_trading_loop 会让 simulator 产生 fill-before-ack，再把同一 fill 交给账本两次；最终 execution count 仍为 1，并且两次完整运行得到相同 checksum。

## 17.8 交易费用、资金费用与转账

不要把所有现金变化压进 PnL：

| 事实 | 建议字段 | 符号约定 |
| --- | --- | --- |
| 成交费用 | trading_fee_cost | 正数输入，扣减 cash/equity |
| Funding | funding_income | 收入为正，支出为负 |
| 借贷利息 | borrow_interest_cost | 正数输入，扣减 equity |
| 外部转入 | external_cash_flow | 流入为正 |
| 内部子账转移 | 两侧配对 entry | 组合范围内净额为零 |

fee 可能使用 base、quote、平台 token 或返佣币种。先按原币种入账，再用带 source/time 的 FX 做估值；不要在 decoder 中用当前价格永久覆盖原始金额。

## 17.9 每次核算都要检查账户权益

固定账户范围与区间后：

~~~text
ending equity - starting equity
  = external net cash flow
  + realized price PnL
  + unrealized PnL change
  + funding income
  - trading fees
  - borrow/transfer costs
  + reconciliation residual
~~~

正常情况下，待查差额（residual）应在事先定义的舍入容差内。超限时必须保留差异，不得把它自动改名为“其他盈亏”。常见原因包括成交重复、费用遗漏、费用币种错误、标记价或汇率时间错位、结算事件缺失和账户范围变化。

## 17.10 三种对账

**启动对账**决定重启后能否继续增加风险。读取本地事件日志和状态快照后，与交易所的活动订单、最近成交、持仓和余额比较。

**周期对账**在系统运行时发现私有消息漏报、费用延迟和人工操作。

**异常对账**由等待超时、未知订单、持仓差异、校验值损坏或规则变更触发；完成前通常禁止增加风险。

报告至少包含：

~~~text
scope + as_of time + source versions
local/remote order diff
missing/conflicting executions
position and balance diff by currency
equity residual and valuation source
automatic actions + unresolved owner
readiness decision
~~~

## 17.11 重启不是重新开始

恢复顺序：

1. 校验状态快照的结构版本、数据版本和校验值。
2. 从快照记录的位置之后重放事件日志。
3. 拒绝不完整记录、重复编号和无法识别的数据结构。
4. 将本地结果与交易所查询结果逐项比较。
5. 补入已经确认但本地缺失的成交，重新计算账本与最坏情况风险暴露。
6. 只有差异解释、行情同步和风险状态有效后，进入 ReadyForApproval。

进程启动成功只证明软件能运行，不证明本地事实与交易所一致。

## 17.12 校验值能证明什么

校验值（checksum）用于快速比较：相同输入是否得到相同的最终状态。用于计算校验值的标准状态必须固定字段顺序、字节顺序、币种/ID 编码和集合排序。Rust `HashMap` 的遍历顺序不是跨版本的持久协议。

配套 ledger 使用显式字段顺序、little-endian 数值、按 key 排序的 execution 和固定 FNV-1a 过程。它适合教学回放比较，不承担密码学防篡改；审计存储还需要访问控制、不可变留存和更强的完整性方案。

## 17.13 故障案例：重复与冲突同时出现

假设私有消息先收到“成交编号 7，以 100 买入 2 个，费用 1”，重连后查询接口又返回同一事实，这是正常的重复消息。若查询结果变成“成交编号 7，以 100 买入 3 个”，系统不能因为新持仓看起来“更接近交易所”就覆盖原记录：

~~~text
detect conflict -> freeze affected projection -> preserve both payloads
-> query authoritative order/fill history -> verify ID scope/schema version
-> append correction fact or rebuild -> re-run equity reconciliation
~~~

覆盖原事件会消灭事故证据，也让之后的 replay 无法解释状态为什么变化。

## 17.14 本章练习

1. 给配套 ledger 增加 funding 与 external cash flow，分别测试收入/支出方向。
2. 为 fee currency 增加类型边界，证明 BTC fee 不能直接与 USDT cash 相加。
3. 构造平均成本为分数的部分平仓和反手 golden cases。
4. 保存一份 snapshot，重放后比较 canonical state 与 checksum。
5. 生成包含 duplicate、conflicting execution 和 balance drift 的 reconciliation report。

本章完成标准：任意 equity 数字都能追到不可变现金流、估值来源和执行身份；重复重放不改变状态，冲突不会静默覆盖，对账未完成时不能开放增险。

## 17.15 回顾与进入检查点

账本的输入是具有稳定身份的经济事实，不是“最新仓位”赋值。每条 execution、fee、funding 和 transfer 以明确币种与方向追加，canonical state 由 reducer 计算；重复事件不改变结果，相同身份但内容冲突则隔离并告警，绝不能覆盖原记录。

equity identity 是持续检查，不是期末美化。event reconciliation 检查事实是否缺失或冲突，state reconciliation 比较派生仓位与余额，cash/equity reconciliation 检查经济闭合。snapshot 加速启动，但必须带 event offset、schema/config 版本和 checksum，随后继续重放并与远端事实对齐。

现在进入[阶段检查点三](gate-3-products-accounting.md)。你将用一条固定现金流把盘口、执行、合约、费用、funding、平均成本和对账连起来；任何最终 PnL 都必须能够逐项复算。
