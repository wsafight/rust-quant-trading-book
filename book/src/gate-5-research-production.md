# 阶段检查点五：可信研究与故障恢复

这个检查点覆盖第 23 至 26 章。它要求同一套领域逻辑既能确定性回放，也能在生产式故障下给出有界风险动作。通过后再做第 27 章综合项目。

## 前置条件

- 已通过交易闭环检查点，订单、成交和账务都走同一个 reducer。
- 已把研究假设、决策时可见数据、成本和失效条件写在代码之前。
- 能区分 offline、shadow、testnet 和 production canary 的证据强度。

## 必做任务

1. 使用输入日志提供的 `(scheduled_time, priority, local_sequence)` 调度 market、timer、send、ack、fill、cancel 和 funding 事件；同一调度键重复时拒绝输入，不能退回插入顺序。
2. 相同数据、配置、seed 和版本得到相同 intents、fills、position、PnL 与 checksum。
3. 比较 touch、trade-through、三组 L2 queue 假设，以及 1x/2x/5x/10x 延迟。
4. 按时间切分 train/validation/holdout，记录包括失败实验在内的 manifest。
5. 完成一次 market-data gap、磁盘变慢或私有流断线演练，包含发现、risk-off、对账、恢复审批和复盘。

## 自动验收

- 将输入文件顺序打乱后按调度键仍得到相同结果。
- 删除一条 market delta 后不再产生新增风险意图。
- 同一 execution 重放两次，position/cash 只变化一次。
- 模拟时钟之外的 wall clock 不能进入核心决策。
- PnL residual 超过明确容差时进程失败，而不是只告警。
- kill switch、恢复 gate 和审计事件有故障注入测试。

## 人工演示

先运行基准回测，再把 cancel latency 放大 10 倍并启用悲观 queue 模型，解释 fill、markout、仓位尾部和 PnL 如何变化。接着触发一次故障，展示进程健康与 trading readiness 的区别，以及恢复为何需要人工或策略外审批。

## 通过证据

- 一份可复现研究报告：机制、point-in-time 数据、模型、样本外结果、不确定性、容量和决策。
- 一份模拟/实盘差异表，即使尚无 canary 数据也要列出待校准项。
- 一份带分钟级时间线、指标截图、账务对账和永久行动项的演练复盘。

若随机切分相邻事件，回到第 25 章；若回测直接修改仓位，回到第 23 章；若成交模型未经敏感性和校准，回到第 24 章；若进程存活就视为可交易，回到第 26 章。
