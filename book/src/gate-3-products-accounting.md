# 阶段检查点三：成本、衍生品与账务

这个检查点验证第 13 至 17 章的市场知识能否落到带方向、单位和现金流的账本。目标不是预测收益，而是先让每个数字可解释、可复算、可对账。

> **第一次使用建议**
>
> 先在纸上或表格中完成一条只有几笔成交的现金流，再把同一组数字写进代码测试。若最终账户权益无法逐项对上，先停在手算阶段查方向、币种和费用，不要用更多公式或更长历史数据掩盖差额。

## 为什么在这里暂停

市场术语、执行指标和衍生品公式分开学习时都不难，错误往往出现在连接处：用 mid 代替真实执行价、qty 忘记 multiplier、fee currency 直接并入结算现金、funding 的支付方向反转，或重复 execution 让仓位和 PnL 同时翻倍。

本检查点只使用手算得出的短事件序列。短序列不会掩盖错误，也便于评审者逐行复算。先证明基础现金流闭合，再进入 adapter 与 OMS 的乱序世界。

## 统一验收场景

为一个版本化线性永续产品准备以下事件：

```text
五档 L2 book
-> maker 买入并部分成交
-> mark 下跌
-> taker 卖出部分对冲
-> funding 结算
-> mark 回升并结束估值
```

事件应包含 decision/arrival/fill/mark 时间、side、price、qty、maker/taker、execution ID、fee 和 funding rate。用一个较小整数样本手算，同时保留一个更接近真实精度的 fixture 测试舍入。

## 前置条件

- 已通过检查点二，研究输入只来自 point-in-time valid book。
- 能区分 bid/ask、maker/taker、mark/index/last、线性/反向合约和 realized/unrealized PnL。
- 对 instrument metadata 的来源、时间和版本有记录。

## 必做任务

1. 实现多档 sweep，输出每档成交、VWAP、未成交数量、fee 和 implementation shortfall。
2. 实现线性合约的 long/short PnL、funding 和 average-cost ledger；所有金额明确结算币种。
3. 以现金、持仓、费用和外部现金流验证 equity 恒等式，不允许用归因项强行填平 residual。
4. 对同一订单运行 maker/taker、延迟扩大和深度减少情景。
5. 保存一份版本化 instrument fixture，附官方文档标题、规则生效时间和复核日期。

## 推荐实施顺序

先独立验证产品函数：notional、linear PnL、fee 与 funding。然后实现 sweep 和 execution cost，再将 execution 送入 average-cost ledger。最后加入重复事件、估值和 reconciliation report。

每一步同时写方向相反的镜像测试。若 long 盈利样例通过，增加 short；若买单 shortfall 通过，增加卖单；若正 funding rate 下 long 支付通过，增加负费率与 short。镜像测试很容易发现符号约定不一致。

在报告开头固定一个“方向词典”，例如所有 `*_income` 正数表示账户收到、fee 正数表示成本还是账本流出。命名约定一旦确定，公式、字段和显示层必须一致。

## 自动验收

测试矩阵至少包含：买/卖、long/short、开仓/部分平仓/反手、正负 funding、深度不足、零方差、极端价格和 checked arithmetic。使用手算小样本作为 golden case，再增加 property test 检查数量守恒和 equity 恒等式。

```text
ending_equity - starting_equity - external_cash_flow
= realized_pnl + unrealized_change + funding - fees - other_costs
```

上式两边必须在明确的舍入容差内相等；容差来自币种精度，不能由结果反推。

## 人工演示

输入一组五档 book、两笔成交、一次 funding 和一次部分平仓，逐项解释现金与持仓变化。然后修改 fee tier 和 multiplier，指出哪些结果必须重算以及旧规则为什么不能继续用于新日期。

再重复发送第一笔 execution。演示账本状态和 equity 不变，并说明系统怎样区分合法重复与相同 ID、不同内容的冲突。如果冲突只打印一行日志后继续覆盖，检查点失败。

## 评分量表

每项 0–2 分，满分 10 分；“产品与方向”或“账本闭合”为 0 时不能通过。

| 维度 | 0 分 | 1 分 | 2 分 |
| --- | --- | --- | --- |
| 产品与方向 | 产品/乘数/币种含糊 | 主要公式正确但 metadata 不全 | 合同、方向、单位、精度和版本齐全 |
| 执行成本 | 只看最终成交价 | 有 fee/VWAP 但参考点或未成交缺失 | shortfall、depth、fee 与 opportunity cost 完整 |
| 账本闭合 | 直接改仓位或 residual 被填平 | 基本闭合但边界/币种不足 | 不可变现金流与 equity identity 可复算 |
| 幂等与冲突 | 重复入账或静默覆盖 | 能去重但冲突证据不足 | identity 作用域明确且冲突隔离 |
| 敏感性证据 | 只跑单一假设 | 修改过 fee 或 depth | maker/taker、latency、depth 与规则版本均比较 |

建议达到 8 分以上，并确保手算、自动测试与机器报告三方一致。

## 通过证据

- 固定输入、手算说明、自动测试和机器输出四者一致。
- 一张 PnL 方向与现金流对照表。
- 一份 1 至 2 页的执行成本敏感性报告，包含不能识别的 queue/impact 假设。

报告还要列出估值时间与价格源、舍入发生的位置、ledger reducer 版本和最终 event checksum。这样以后规则或代码变化时，能够解释结果为何改变。

## 未通过时怎样回补

| 观察到的问题 | 回到章节 | 回补动作 |
| --- | --- | --- |
| 把价格预测直接当作收益 | 第 13 章 | 加入 fill 条件与 signed markout |
| 执行只比较 VWAP | 第 14 章 | 加入参考点、未成交与机会成本 |
| multiplier/settlement/fee 方向含糊 | 第 15 章 | 重建产品档案和镜像算例 |
| 年化或 PnL 无采样/估值定义 | 第 16 章 | 固定时间、方向与 equity identity |
| duplicate 改变状态或冲突被覆盖 | 第 17 章 | 重做 execution identity 和幂等 reducer |

若只能给出最终 PnL 而不能复原现金流，回到第 15–17 章；若 touch 即成交，回到第 13、14 章。

通过后冻结这条 golden cash-flow fixture。第四部分的 adapter、OMS 和 hard risk 都必须复用它的产品与账务定义，确保协议乱序不会改变经济事实的含义。
