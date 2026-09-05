# 阶段检查点五：可信研究与故障恢复

这个检查点覆盖第 23 至 26 章。它要求同一套领域逻辑既能确定性回放，也能在生产式故障下给出有界风险动作。通过后再做第 27 章综合项目。

> **第一次使用建议**
>
> 先让同一份数据连续运行三次并得到相同结果，再讨论策略是否盈利。随后依次加入保守成交、样本外验证和一种生产故障。这个检查点的目标是说明结论在什么条件下可信，不是把所有指标都做得漂亮。

## 为什么在这里暂停

研究代码和生产代码分开演化时，最常见的结果是两边都“正确”，却不在回答同一个问题：回测直接修改仓位，生产等待 execution；回测使用事件时间，生产按本地接收时间；研究假设固定延迟，生产尾延迟恰好决定了坏成交。

本检查点要求用同一套 reducer 贯穿两种环境，并把差异显式放进 manifest、simulator 参数和生产指标。目标不是证明回测等于实盘，而是建立可测的偏差列表和阶段限制。

## 统一验收场景

选择一段含正常、突发和断线窗口的固定行情，运行一个简单可解释策略：

```text
versioned raw data -> deterministic replay -> simulator
-> OMS/risk/ledger -> research report
                      |
                      v
          shadow-style metrics + injected incident
                      |
                      v
          reconciliation + recovery approval
```

固定 data checksum、schema、config、seed、clock 和代码版本。策略复杂度保持低，让评审重点落在 point-in-time、成交、统计与恢复证据。

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

## 推荐实施顺序

先证明确定性：同一 manifest 连续运行三次，比较 intent、action、fill、ledger 和最终 checksum。然后建立乐观/基准/悲观成交与延迟矩阵，再做时间切分研究。最后从敏感性中选择一个风险最高的假设，设计对应故障演练和 SLO。

研究报告与演练复盘共享 ID 和版本。例如某次回测的 latency model 指向生产观测窗口，某次演练发现的 cancel p99.9 回写到下一版 simulator manifest。没有这种关联，“校准循环”只是一张架构图。

若没有真实 shadow/canary 数据，可以使用明确标记的 synthetic observation 完成流程，但必须把待校准项和阶段上限写入结论，不能声称模型已经外部验证。

## 自动验收

- 将输入文件顺序打乱后按调度键仍得到相同结果。
- 删除一条 market delta 后不再产生新增风险意图。
- 同一 execution 重放两次，position/cash 只变化一次。
- 模拟时钟之外的 wall clock 不能进入核心决策。
- PnL residual 超过明确容差时进程失败，而不是只告警。
- kill switch、恢复 gate 和审计事件有故障注入测试。

## 人工演示

先运行基准回测，再把 cancel latency 放大 10 倍并启用悲观 queue 模型，解释 fill、markout、仓位尾部和 PnL 如何变化。接着触发一次故障，展示进程健康与 trading readiness 的区别，以及恢复为何需要人工或策略外审批。

演示最后展示一项负结果：某个参数或模型变化使结论不再通过。说明系统如何把它转成 Reject、Revise、限制规模或阻止恢复，而不是只展示仍然盈利的组合。

## 评分量表

每项 0–2 分，满分 10 分；“时间与确定性”或“账务和恢复”为 0 时不能通过。

| 维度 | 0 分 | 1 分 | 2 分 |
| --- | --- | --- | --- |
| 时间与确定性 | wall clock/文件顺序影响结果 | 基本可复现但 tie/version 不全 | 调度键、版本、seed 与 checksum 完整 |
| 成交与校准 | touch 单模型直接出结论 | 有敏感性但无条件验证 | 多模型、条件分布、holdout 与拒绝条件 |
| 研究有效性 | 泄漏或只报胜出结果 | 时间切分但尝试/不确定性不全 | 机制、全部尝试、区间、容量和决策齐全 |
| 账务和恢复 | 回测绕过 OMS/ledger 或残差忽略 | 账务闭合但故障恢复不完整 | 同一 reducer、幂等、对账与审批完整 |
| 生产证据 | 进程存活即交易健康 | 有指标/告警但风险动作含糊 | SLO、risk-off、runbook、复盘形成闭环 |

建议达到 9 分以上。综合项目会复用这里的全部证据，低分项不会因为增加 UI 或功能而自动改善。

## 通过证据

- 一份可复现研究报告：机制、point-in-time 数据、模型、样本外结果、不确定性、容量和决策。
- 一份模拟/实盘差异表，即使尚无 canary 数据也要列出待校准项。
- 一份带分钟级时间线、指标截图、账务对账和永久行动项的演练复盘。

再提供一份证据索引，把 data/config/model/code 版本、运行命令、研究报告、敏感性矩阵、演练事件 ID 和恢复审批连接起来。另一位工程师应能从索引开始复现，而不需要询问隐藏步骤。

## 未通过时怎样回补

| 观察到的问题 | 回到章节 | 回补动作 |
| --- | --- | --- |
| 文件顺序或 wall clock 改变结果 | 第 23 章 | 固定调度键、clock 与 manifest |
| simulator 直接改 position | 第 23、24 章 | 恢复 request/report/OMS/ledger 路径 |
| fill 总数接近但 markout/尾部偏差大 | 第 24 章 | 按条件分布校准并设置拒绝标准 |
| 随机切分或只保存成功实验 | 第 25 章 | 重做时间切分和完整尝试记录 |
| 进程恢复就自动开放交易 | 第 26 章 | 分层 readiness、对账与显式审批 |
| 告警没有自动/人工动作 | 第 26 章 | 从资金风险反推 SLO 和 runbook |

若随机切分相邻事件，回到第 25 章；若回测直接修改仓位，回到第 23 章；若成交模型未经敏感性和校准，回到第 24 章；若进程存活就视为可交易，回到第 26 章。

通过后不要立即扩展策略。先把证据索引、命令和已知限制带入第 27 章，完成一个范围清楚、可由他人独立运行的综合项目。
