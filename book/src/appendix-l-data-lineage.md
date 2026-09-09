# 附录 L 数据工程与可追溯性

交易研究和生产运行都依赖同一条数据事实链。数据文件能被读取只是起点；真正需要证明的是某个图表、订单决定或 PnL 数字能够追溯到哪份原始事实、哪套规则和哪个处理版本。

## L.1 六层数据边界

```text
raw message
-> immutable segment
-> normalized event
-> validated market/account state
-> feature and label dataset
-> experiment/report
```

每层都有不同职责：

| 层 | 可以做 | 不应做 |
| --- | --- | --- |
| raw message | 保存原始 bytes 和接收上下文 | 用当前规则覆盖历史内容 |
| immutable segment | framing、checksum、压缩和索引 | 静默删除损坏记录 |
| normalized event | 解析字段、统一明确单位 | 猜测缺失业务语义 |
| validated state | 应用 sequence、不变量和 freshness | 把 Invalid 当作空市场 |
| feature/label | 按 point-in-time 生成研究样本 | 使用未来到达的数据 |
| report | 汇总结果、区间、敏感性和决策 | 脱离 manifest 保留孤立图表 |

## L.2 数据集 manifest

每个可复现数据集至少记录：

```text
dataset_id
source and license/usage boundary
venue / instrument / channel
event-time and receive-time range
raw segment paths and checksums
recorder/schema/adapter versions
product metadata versions
normalization configuration
known gaps and corrupt ranges
derived partitions and checksums
created_at and owner
```

路径不是稳定身份；文件移动后 checksum 和 dataset ID 仍应连接同一事实。

## L.3 缺失、重复、乱序与损坏

四者不能合并成一个 `bad_rows`：

- **缺失**：预期事实没有出现，可能需要失效或重新同步；
- **重复**：同一身份重复出现，可能幂等，也可能内容冲突；
- **乱序**：事实存在但观察顺序变化，需要协议规则决定能否缓冲；
- **损坏**：bytes、framing、checksum 或字段无法解释，原始证据仍需隔离保存。

质量报告同时给出计数、位置、动作和影响范围。修复数据时不覆盖原始层，而是生成新版本并记录转换。

## L.4 时间与 point-in-time

研究可见时间通常不是交易所 event time。一个字段只有在本地收到、解析并通过必要校验后，才可能进入 decision information set。

样本至少保留：

- source event time；
- local receive time；
- normalization/process time；
- state publication time；
- decision time；
- action eligibility time；
- label interval。

如果历史数据只保存 event time，就不能精确重建当时本地何时可见；报告必须声明这个限制，并用保守延迟敏感性处理。

## L.5 schema 与产品规则演进

同名字段可能随时间改变含义，产品 tick、lot、multiplier、fee 或 margin 规则也可能变化。历史回放应使用事件当时有效的 metadata，不能用当前规则重新解释后默默覆盖。

变更流程：

1. 保存新 raw fixture 和官方来源；
2. 判断向后兼容或语义不兼容；
3. 增加 schema/metadata 版本；
4. 对旧数据和新数据分别运行契约测试；
5. 生成受影响数据集与实验清单；
6. 使需要重跑的报告失效。

## L.6 分区、压缩和读取布局

文件格式与分区服务于实际访问方式。需要先回答：

- 最常按 venue、instrument、date 还是 channel 读取？
- 单次回放读取多大时间窗口？
- 是否需要只读取少数字段？
- schema 怎样演进？
- 小文件数量和对象存储请求成本如何控制？
- 压缩是否让故障恢复或随机读取不可接受？

可以根据规模选择行式日志、列式文件或数据库，但格式选择不能代替 manifest、checksum 和业务不变量。

## L.7 数据修订和实验失效

发现历史数据问题后，不能只修文件并保留旧报告。应建立影响关系：

```text
raw segment version
-> normalized dataset version
-> feature/label version
-> experiment IDs
-> reports and decisions
```

上游 checksum、schema 或规则版本变化时，下游产物标记为 stale。是否需要重跑取决于影响范围，但决定必须留下记录。

## L.8 数据质量 gate

进入研究前至少检查：

- 时间范围和交易时段覆盖；
- 文件完整性和 checksum；
- schema/metadata 版本；
- duplicate、gap、out-of-order 和 corrupt；
- event/receive time 分布；
- 极值、非正数量和 crossed/locked 状态；
- 缺失处理与排除范围；
- 数据许可与再分发边界。

任何异常都要对应 `accept / repair-as-new-version / exclude / reject` 之一，并说明原因。

## L.9 小型练习

1. 为一个含 100 条消息的 raw fixture 建立 manifest。
2. 删除一条、重复一条并损坏最后一条，分别报告影响。
3. 修改 tick size 生效时间，列出需要重建的 normalized data 和实验。
4. 画出一张研究图表从原始文件到报告的 lineage。
5. 让另一位读者只根据 manifest 重建相同摘要。

## L.10 完成标准

你应能从任意报告向上追到数据、规则和处理版本；能区分原始事实、修复版本和派生结果；能在上游变化时识别哪些结论失效；并能明确说明数据缺口对交易或研究结论的影响。
