# 阶段检查点三：成本、衍生品与账务

这个检查点验证第 13 至 16 章的市场知识能否落到带方向、单位和现金流的计算器。目标不是预测收益，而是先让每个数字可解释、可复算、可对账。

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

## 自动验收

测试矩阵至少包含：买/卖、long/short、开仓/部分平仓/反手、正负 funding、深度不足、零方差、极端价格和 checked arithmetic。使用手算小样本作为 golden case，再增加 property test 检查数量守恒和 equity 恒等式。

```text
ending_equity - starting_equity - external_cash_flow
= realized_pnl + unrealized_change + funding - fees - other_costs
```

上式两边必须在明确的舍入容差内相等；容差来自币种精度，不能由结果反推。

## 人工演示

输入一组五档 book、两笔成交、一次 funding 和一次部分平仓，逐项解释现金与持仓变化。然后修改 fee tier 和 multiplier，指出哪些结果必须重算以及旧规则为什么不能继续用于新日期。

## 通过证据

- 固定输入、手算说明、自动测试和机器输出四者一致。
- 一张 PnL 方向与现金流对照表。
- 一份 1 至 2 页的执行成本敏感性报告，包含不能识别的 queue/impact 假设。

若只能给出最终 PnL 而不能复原现金流，回到第 15、16 章；若 touch 即成交，回到第 13、14 章。

