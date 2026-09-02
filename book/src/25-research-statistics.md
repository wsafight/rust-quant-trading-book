# 第 25 章 量化研究与统计验证

第 23 章已经建立事件驱动回测，本章关注怎样提出问题、构造样本、估计不确定性和避免过拟合。统计工具服务于可交易机制，不替代成交、成本与风险模型。

> **学习导航**　前置：第 13、16、23、24 章的机制、统计、回测与仿真校准｜目标：进行 point-in-time 研究、估计不确定性并限制多重尝试偏差｜预计：14–20 小时｜产出：实验 manifest、时间切分结果、区间估计和阶段决策

统计和回测偏差的延伸资料集中在[附录 E](appendix-e-references.md)。具体检验仍需从样本依赖结构推导，不能按文献名称机械套用。

## 25.1 从机制开始

先回答：谁在什么条件下支付收益？

例如 imbalance 假设：短时买方深度和主动订单流不平衡，可能在其他参与者撤/改报价前预测 mid 上移。但你的 maker bid 可能只在预测失败时成交，因此“预测 mid”与“maker PnL”是两个问题。

把机制写成可证伪形式，包含 feature、label、horizon、regime、execution 和成本门槛。

## 25.2 观察单位

可按：

- 固定时间采样。
- 每次 book/trade event。
- 每个策略 decision。
- 每个 submitted order 或 fill。
- 独立交易 episode。

不同采样产生不同权重。事件采样会让高消息率极端窗口占更多样本；固定时间可能遗漏短暂状态。报告必须说明观察单位和重复/重叠程度。

## 25.3 Feature 与 Label 时间线

```text
t_receive: feature 使用截至本地已到达的数据
t_decide:  策略完成计算
t_arrive:  订单到 venue
t_fill:    成交（条件事件）
t+h:       label/markout
```

任何 feature 使用 `t_receive` 之后数据就是泄漏。Maker 研究以 fill 为条件时，还要处理 selection bias：成交样本不是所有报价的随机子集。

## 25.4 时间切分

随机 train/test 打散会让相邻事件和同一 regime 同时出现两边。优先：

```text
train -> validation -> test -> final untouched holdout
```

Walk-forward 在每个窗口只用过去拟合，再评估未来。若 label/持仓跨越边界，使用 purge；多个实验共享相近事件时考虑 embargo。具体长度由 horizon 和依赖结构决定，不机械套公式。

### Purge 的具体时间线

假设 feature 每 20 ms 生成一次，label 是未来 100 ms mid markout。训练区间名义上在 `10:00:00.000` 结束，但 `09:59:59.920` 的样本需要读到 `10:00:00.020` 才知道 label。若测试从 `10:00:00.000` 开始，这条训练样本已经使用测试期价格。

```text
09:59:59.900  最后一个可保留训练 feature，其 label 到 10:00:00.000
09:59:59.920  purge：label 穿过边界
09:59:59.940  purge：label 穿过边界
09:59:59.960  purge：label 穿过边界
09:59:59.980  purge：label 穿过边界
10:00:00.000  test 开始
```

若持仓生命周期可能长于固定 label horizon，purge 应依据每个样本的实际 information interval，而不是只删固定行数。Embargo 处理相邻 fold 或共享事件造成的残余依赖，也不能拿来修复 feature 本身的未来数据泄漏。

## 25.5 描述分布，而非只报均值

对 markout、slippage、PnL 报告：

- count、missing rate。
- mean、median、quantiles。
- standard deviation、tail/worst windows。
- 按 side/venue/regime/date 分组。
- 置信区间或 bootstrap 分布。

均值可能由少数大正值驱动，median 负；或者正常期盈利、极端期一次亏完。交易决策关心完整路径和尾部。

## 25.6 Bootstrap 与时间相关

普通 iid bootstrap 随机抽单条样本，会破坏时间相关和 volatility regime。Block bootstrap 抽连续块，较好保留局部依赖，但 block length 仍是模型选择。

不要把 bootstrap 区间当成全部不确定性。它只反映样本重抽，不能包含未来 regime shift、queue 错模或 venue 规则变化。

### Block length 不是美化区间的参数

一个可审计流程是：

1. 先按策略 decision、fill 或独立 episode 定义观察单位。
2. 查看 markout/PnL 的自相关衰减、持仓重叠长度和 regime 持续时间。
3. 预先选择若干有机制依据的 block length，而不是挑出最窄区间。
4. 以连续块重抽日期内数据；跨停机、规则版本或缺失区间时不要拼成一个连续块。
5. 同时报告 iid 与 block 结果、block length 敏感性和有效日期数。

例如 10,000 个逐事件 markout 并不等于 10,000 个独立机会。如果它们来自 40 个活跃窗口，iid bootstrap 主要重复计算窗口内相似状态；block bootstrap 的区间通常更宽。即便如此，40 个窗口也不能代表未见过的崩盘、规则变更或容量反馈。

## 25.7 多重检验

尝试 1000 个无效特征，也可能偶然出现漂亮结果。控制方法：

- 研究前登记主要假设与 metric。
- 保存所有实验和失败，不只保留 winner。
- validation 用于选择，final holdout 只打开少数次。
- 报告尝试数、参数搜索空间和选择过程。
- 使用适合的多重检验/false discovery 控制。
- 更重视机制、跨期稳定和真实校准。

一个 p-value 不能抵消自由度。

### Benjamini-Hochberg 数值例子

假设预先声明同一 family 的四个主要假设，p-value 排序后为：

```text
rank i             1       2       3       4
p(i)            0.001   0.010   0.030   0.200
(i/m) * q       0.0125  0.0250  0.0375  0.0500   (q = 5%)
```

Benjamini-Hochberg step-up 找到最大的 `k`，使 `p(k) <= (k/m)q`。这里 `k=3`，因此拒绝前三个假设。配套实现保留原始索引、拒绝 NaN/越界 p-value，并由 Cargo 编译下面的 example：

```rust,ignore
{{#include ../code/examples/multiple_testing.rs}}
```

FDR 控制不证明前三个策略可以交易，也不补偿错误的 family 定义、反复打开 holdout 或事后删除失败实验。经典 BH 对独立或某些正相关结构有保证；依赖结构不满足时需要选择有依据的修正或重采样方法，并报告 power 损失。原始论文入口见[附录 E](appendix-e-references.md)。

## 25.8 参数稳定性

不要只展示最优 `inventory_skew=0.37`。画参数邻域：

- 若 0.36 和 0.38 立即亏损，最优点可能是噪音。
- 若 0.2-0.6 广泛稳定，更容易形成保守配置。
- 最优参数随月份剧烈漂移，需要 regime 模型或承认失效。

参数选择同时考虑 PnL、drawdown、turnover、position tail 和容量，避免单目标过拟合。

## 25.9 Regime 分析

常见切分：spread、volatility、depth、trade flow、趋势、funding/basis、消息率和 venue health。Regime 定义必须 point-in-time；用未来整天波动给当时事件分类会泄漏。

分组太多会减少样本并制造选择空间。先从机制决定少数主要维度，其他作为探索并明确标注。

## 25.10 预测指标与交易指标

预测研究可能用 correlation、AUC、MSE；交易决策最终需要：

- 触发率和可成交数量。
- fill probability 与 adverse selection。
- fee、slippage、latency 和 impact。
- position path、drawdown 与 margin。
- capacity 和故障敏感性。

高方向准确率可能来自大量微小变化，成本后无价值；低准确率也可能由少数大收益产生。连接两者需要执行模型。

## 25.11 实验 Manifest

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

## 25.12 失败实验日志

记录：假设、为什么值得测、结果、失败原因、还能否在新条件重试。失败可能来自：

- 无预测效果。
- 预测存在但不足以覆盖成本。
- 只在不可成交窗口有效。
- queue/latency 敏感到无法信任。
- 数据质量不足。
- 容量或风险不可接受。

这份日志避免团队每隔几个月重复同一挖掘，也让研究能力不只表现为幸存者结果。

## 25.13 从研究到决策

研究结束给明确建议：

- Reject：机制/证据不足，停止投入。
- Revise：特定数据或模型问题需新实验。
- Shadow：逻辑值得实时观察但不发单。
- Canary：在硬限额和校准计划下小额验证。
- Scale：只有 canary 与风险 gate 长期满足才逐步扩大。

每个状态有 owner、所需新证据和退出条件。

## 25.14 从显著结果到阶段决策

考虑一个完整的简化结论：团队预注册 8 个 imbalance 变体，在 30 个交易日上按时间切分。BH 后只有一个主要假设保留；最终 holdout 的 100 ms 条件 markout 是 1.8 bps，block bootstrap 区间为 `[0.4, 3.1]` bps。但可执行 fee 与 spread 合计 2.4 bps，queue/latency 敏感性还带来约 1.5 bps 向下误差。

这不是 Canary 结论。预测效果可能存在，但当前执行优势没有覆盖成本与模型误差，合理决策是 `Revise`：缩小到成本更低的 regime、改善执行，或停止 maker 形式。只有当未见数据上的净效果、尾部仓位和容量都通过门槛，才进入 Shadow；Shadow 解决实时数据与软件行为证据，也不自动升级成真实资金 Canary。

一份决策记录应把证据拆开：

| 层次 | 当前证据 | 未解决问题 | 决策影响 |
| --- | --- | --- | --- |
| 机制 | imbalance 与短期订单流一致 | maker selection bias | 保留研究 |
| 统计 | holdout 区间多数为正 | 仅 30 个日期块 | 不声称稳定 alpha |
| 执行 | gross 1.8 bps | cost 2.4 bps、queue 误差 | 不进入 canary |
| 风险 | 尚无真实 position tail | hedge/cancel 压力未知 | 先 shadow 校准 |

## 25.15 研究答辩问题

- 为什么收益存在，谁支付？
- 决策时数据真的可见吗？
- 样本如何选择，缺失如何处理？
- 尝试了多少 feature/参数？
- queue、fee、latency 改变时还成立吗？
- 哪个 regime 贡献收益和尾部亏损？
- 规模扩大后谁先失效？
- 模拟与 canary 怎样校准？
- 什么结果会让你停止策略？

## 25.16 本章练习

1. 把“imbalance 预测价格”改写成包含机制、horizon、regime 和成本的假设。
2. 比较随机切分和时间切分的结果，解释泄漏。
3. 对相关 markout 数据做 iid/block bootstrap，比较三个 block length，并说明选择依据。
4. 使用配套 BH 实现处理一个预先声明的假设 family，再改变 family 范围观察结论。
5. 保存包含失败结果的实验 manifest，并为研究结论写 Reject/Revise/Shadow/Canary 决策。

本章完成标准：结论同时包含经济机制、point-in-time 样本、统计与实施不确定性、全部尝试范围和下一阶段 gate。
