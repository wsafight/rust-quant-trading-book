# 第 22 章 量化研究与统计验证

第 21 章已经建立事件驱动回测，本章关注怎样提出问题、构造样本、估计不确定性和避免过拟合。统计工具服务于可交易机制，不替代成交、成本与风险模型。

> **学习导航**　前置：第 13、16、21 章的机制、统计与仿真｜目标：进行 point-in-time 研究、估计不确定性并限制多重尝试偏差｜预计：14–20 小时｜产出：实验 manifest、时间切分结果、区间估计和阶段决策

统计和回测偏差的延伸资料集中在[附录 E](appendix-e-references.md)。具体检验仍需从样本依赖结构推导，不能按文献名称机械套用。

## 22.1 从机制开始

先回答：谁在什么条件下支付收益？

例如 imbalance 假设：短时买方深度和主动订单流不平衡，可能在其他参与者撤/改报价前预测 mid 上移。但你的 maker bid 可能只在预测失败时成交，因此“预测 mid”与“maker PnL”是两个问题。

把机制写成可证伪形式，包含 feature、label、horizon、regime、execution 和成本门槛。

## 22.2 观察单位

可按：

- 固定时间采样。
- 每次 book/trade event。
- 每个策略 decision。
- 每个 submitted order 或 fill。
- 独立交易 episode。

不同采样产生不同权重。事件采样会让高消息率极端窗口占更多样本；固定时间可能遗漏短暂状态。报告必须说明观察单位和重复/重叠程度。

## 22.3 Feature 与 Label 时间线

```text
t_receive: feature 使用截至本地已到达的数据
t_decide:  策略完成计算
t_arrive:  订单到 venue
t_fill:    成交（条件事件）
t+h:       label/markout
```

任何 feature 使用 `t_receive` 之后数据就是泄漏。Maker 研究以 fill 为条件时，还要处理 selection bias：成交样本不是所有报价的随机子集。

## 22.4 时间切分

随机 train/test 打散会让相邻事件和同一 regime 同时出现两边。优先：

```text
train -> validation -> test -> final untouched holdout
```

Walk-forward 在每个窗口只用过去拟合，再评估未来。若 label/持仓跨越边界，使用 purge；多个实验共享相近事件时考虑 embargo。具体长度由 horizon 和依赖结构决定，不机械套公式。

## 22.5 描述分布，而非只报均值

对 markout、slippage、PnL 报告：

- count、missing rate。
- mean、median、quantiles。
- standard deviation、tail/worst windows。
- 按 side/venue/regime/date 分组。
- 置信区间或 bootstrap 分布。

均值可能由少数大正值驱动，median 负；或者正常期盈利、极端期一次亏完。交易决策关心完整路径和尾部。

## 22.6 Bootstrap 与时间相关

普通 iid bootstrap 随机抽单条样本，会破坏时间相关和 volatility regime。Block bootstrap 抽连续块，较好保留局部依赖，但 block length 仍是模型选择。

不要把 bootstrap 区间当成全部不确定性。它只反映样本重抽，不能包含未来 regime shift、queue 错模或 venue 规则变化。

## 22.7 多重检验

尝试 1000 个无效特征，也可能偶然出现漂亮结果。控制方法：

- 研究前登记主要假设与 metric。
- 保存所有实验和失败，不只保留 winner。
- validation 用于选择，final holdout 只打开少数次。
- 报告尝试数、参数搜索空间和选择过程。
- 使用适合的多重检验/false discovery 控制。
- 更重视机制、跨期稳定和真实校准。

一个 p-value 不能抵消自由度。

## 22.8 参数稳定性

不要只展示最优 `inventory_skew=0.37`。画参数邻域：

- 若 0.36 和 0.38 立即亏损，最优点可能是噪音。
- 若 0.2-0.6 广泛稳定，更容易形成保守配置。
- 最优参数随月份剧烈漂移，需要 regime 模型或承认失效。

参数选择同时考虑 PnL、drawdown、turnover、position tail 和容量，避免单目标过拟合。

## 22.9 Regime 分析

常见切分：spread、volatility、depth、trade flow、趋势、funding/basis、消息率和 venue health。Regime 定义必须 point-in-time；用未来整天波动给当时事件分类会泄漏。

分组太多会减少样本并制造选择空间。先从机制决定少数主要维度，其他作为探索并明确标注。

## 22.10 预测指标与交易指标

预测研究可能用 correlation、AUC、MSE；交易决策最终需要：

- 触发率和可成交数量。
- fill probability 与 adverse selection。
- fee、slippage、latency 和 impact。
- position path、drawdown 与 margin。
- capacity 和故障敏感性。

高方向准确率可能来自大量微小变化，成本后无价值；低准确率也可能由少数大收益产生。连接两者需要执行模型。

## 22.11 实验 Manifest

每次运行保存：

```text
experiment_id
code commit / dependency lock checksum
raw data files + checksums
schema/adapter/metadata versions
feature/label definitions
train/validation/test ranges
strategy/risk/simulator config
random seed and algorithm version
outputs + report checksum
```

Notebook 用于探索，最终核心 feature、ledger 和 evaluator 进入测试过的 library。图表必须能从 manifest 一键重建。

## 22.12 失败实验日志

记录：假设、为什么值得测、结果、失败原因、还能否在新条件重试。失败可能来自：

- 无预测效果。
- 预测存在但不足以覆盖成本。
- 只在不可成交窗口有效。
- queue/latency 敏感到无法信任。
- 数据质量不足。
- 容量或风险不可接受。

这份日志避免团队每隔几个月重复同一挖掘，也让研究能力不只表现为幸存者结果。

## 22.13 从研究到决策

研究结束给明确建议：

- Reject：机制/证据不足，停止投入。
- Revise：特定数据或模型问题需新实验。
- Shadow：逻辑值得实时观察但不发单。
- Canary：在硬限额和校准计划下小额验证。
- Scale：只有 canary 与风险 gate 长期满足才逐步扩大。

每个状态有 owner、所需新证据和退出条件。

## 22.14 研究答辩问题

- 为什么收益存在，谁支付？
- 决策时数据真的可见吗？
- 样本如何选择，缺失如何处理？
- 尝试了多少 feature/参数？
- queue、fee、latency 改变时还成立吗？
- 哪个 regime 贡献收益和尾部亏损？
- 规模扩大后谁先失效？
- 模拟与 canary 怎样校准？
- 什么结果会让你停止策略？

## 22.15 本章练习

1. 把“imbalance 预测价格”改写成包含机制、horizon、regime 和成本的假设。
2. 比较随机切分和时间切分的结果，解释泄漏。
3. 对相关 markout 数据做 iid/block bootstrap，比较区间。
4. 保存包含失败结果的实验 manifest。
5. 为研究结论写 Reject/Revise/Shadow/Canary 决策。

本章完成标准：结论同时包含经济机制、point-in-time 样本、统计与实施不确定性、全部尝试范围和下一阶段 gate。
