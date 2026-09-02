# 第 28 章 24 周成长与求职路径

成为量化交易工程师不是读完一本书，而是形成一组可审查证据。默认计划为每周 15 至 20 小时：40% 编码与测试，25% 市场/策略研究，20% 数据和性能实验，15% 阅读、复盘与表达。

> **学习导航**　前置：完成第 1 章基线；最好已有前五个检查点证据｜目标：把能力缺口转成 24 周计划、作品集和可核验岗位叙述｜预计：规划 3–5 小时，执行 24 周｜产出：周计划、能力复评、作品集索引和系统设计演示

每四周设置一次关卡。关卡未通过就延长，不带着基础缺口继续堆功能。

## 28.1 第 1 至 4 周：Rust 与行情数据面

### 第 1 周：类型与产品语义

学习所有权、struct、enum、`Option/Result`、现货/线性/反向/交割合约、tick/lot/notional。实现 `PriceTicks`、`QtyLots`、ID、instrument metadata 与严格 decimal 转换。

交付：类型设计、舍入规格和表驱动测试。禁止用裸 `f64` 作为订单/余额权威值。

### 第 2 周：记录与时间

学习文件/网络 I/O、serde、WebSocket 生命周期、heartbeat 和四种时间语义。实现公开行情 recorder，保留 raw payload、sequence 和 receive time。

交付：6 小时连接报告，含消息率、数据 age、断线和缺口。

### 第 3 周：L2 订单簿

实现 snapshot/delta、gap detection、resync、top-N、mid、microprice 与不变量。

交付：固定 fixture、确定性回放、重复/乱序/删包测试。

### 第 4 周：性能基线

给 `wire -> normalized event -> book` 分段计时，建立 release benchmark。

关卡一：100 万事件结果稳定；gap 后不发布；有 p50/p99/p99.9、环境和 checksum。

## 28.2 第 5 至 8 周：订单与恢复

### 第 5 周：Adapter

研究目标 venue 的产品、签名、order capability、client ID 和 rate limit。实现领域命令到单一 venue fixture 的映射。

### 第 6 周：OMS reducer

实现 ack/fill/cancel/reject/timeout、execution 去重、非法转移和审计事件。

### 第 7 周：账本与对账

实现 position、cash、fee ledger，启动/周期/异常 reconciliation diff。

### 第 8 周：持久化与故障

实现 intent write-ahead、event log/snapshot，注入 timeout、private stale、重复 fill 和进程重启。

关卡二：fill-before-ack 和 cancel/fill race 正确；unknown 状态计入暴露；重启后不重复订单；对账后才 trading ready。

## 28.3 第 9 至 12 周：策略、执行与风险

### 第 9 周：Fair value

研究 mid、microprice、imbalance、短期 markout。所有 signal 带 horizon、timestamp、freshness 和版本。

### 第 10 周：Quote 与 inventory

实现 reservation price、half-spread、price/size skew、quote lifecycle。

### 第 11 周：Hedge 与 execution

比较立即、批量和被动对冲，建模 fee、depth walk、delay 与 basis risk。

### 第 12 周：Hard risk

实现 max order/position/open-order exposure、stale gate、margin/loss、kill 与分级降级。

关卡三：策略无法绕过 risk；双边与 uncertain order 进入 worst case；hedge venue 断线有自动动作和 runbook。

## 28.4 第 13 至 16 周：回测与研究

### 第 13 周：事件回放

Live/replay 共用领域事件、reducer、strategy、risk 与 ledger。引入 deterministic clock 和 seed。

### 第 14 周：成交与延迟

实现 touch、trade-through、L2 queue，加入 send/cancel/report latency 与 partial fill。

### 第 15 周：成本与 PnL

逐事件计算 fee、funding、hedge slippage；验证权益恒等式和 attribution residual。

### 第 16 周：研究关卡

完成一份 out-of-sample 报告，包含 point-in-time、参数邻域、regime、容量、queue/latency/fee 敏感性与失效条件。

关卡四：收益不能只依赖 touch fill；账本闭合；最终 holdout 未参与选参；明确不可外推部分。

## 28.5 第 18 至 20 周：性能与生产化

### 第 18 周：延迟预算

定义 wire-to-book、book-to-decision、decision-to-write、send-to-ack、fill-to-risk 的目标与测量。

### 第 19 周：Profile 后优化

用 CPU/allocation/system profile 找热点，只做有证据的改动并重复正确性回放。

### 第 21 周：可观测性

实现 metrics、structured logs、trace、alerts、dashboard，控制 label 基数。

### 第 22 周：运行演练

完成 gap、private disconnect、timeout、429、CPU overload、disk slow、position drift、bad config 演练。

关卡五：目标负载下尾延迟达标；告警能行动；process ready 与 trading ready 分开；事故复盘包含账务对账。

## 28.6 第 23 至 24 周：作品集与面试

### 第 23 周：项目收口

提供一键离线 demo、架构图、状态图、fixture、测试命令和已知限制。

### 第 25 周：研究答辩

把策略报告压缩成 5 分钟结论和 20 分钟深挖，准备解释 queue、cost、latency 和 overfitting。

### 第 26 周：系统设计与编码

练习订单簿、定点转换、OMS reducer、token bucket、reconciliation diff 和完整交易系统设计。

### 第 27 周：事故与投递

完成一轮 Rust coding、trading/quant、system design、incident/behavioral 模拟，按失败项补证据。

最终关卡：能在 10 分钟内讲清系统、关键权衡、一次故障和项目不能证明的事情。

## 28.7 每周复盘

```markdown
# Week N Review

## 本周交付
- 可运行、可阅读、可复现的产物：

## 证据
- 测试、profile、数据、图表、评审：

## 失败与未知
- 哪个假设被推翻，哪项仍不可识别：

## 风险与技术债
- 哪个简化不能带入下一阶段：

## 下周决策
- 继续、修正、删除或延长：
```

## 28.8 作品集怎样建立可信度

README 必须给出：

- 问题、范围、架构与状态所有权。
- 一键运行和固定输入。
- 不变量、故障序列与测试。
- 性能环境、分位数与 checksum。
- 回测数据、成本、偏差、敏感性和限制。
- testnet/production 使用范围的诚实声明。

简历表达使用“动作 + 约束 + 证据 + 边界”：

> 用 Rust 实现可确定性回放的 L2/OMS/risk 闭环，覆盖 sequence gap、fill-before-ack、请求超时和重启对账；在固定 fixture 与目标负载上报告 p99.9 和账本 checksum。结果来自离线 L2 仿真，不代表实盘收益。

不要写无法复现的吞吐，不要把个人测试网说成生产做市，也不要把团队成果全部说成个人成果。

## 28.9 面试官在判断什么

- 深度：至少一个方向能追到实现、证据和边界。
- 广度：能从市场/策略走到订单、风险、账务与事故。
- 判断力：能权衡 correctness、latency、complexity 和 capital risk。
- 可信度：区分亲自做过、参与过、仿真、测试网和阅读理解。

回答结构：背景/约束 -> 设计或行动 -> 为什么 -> 证据 -> 局限/后续。不要只列 API 或口号。

## 28.10 Rust 与系统问题

需要能深入回答：

1. 如何用类型防止 price/qty/币种错误？
2. generic 与 `dyn Trait` 如何选，证据是什么？
3. single-writer 相对共享 `RwLock` 的取舍？
4. 行情、成交和日志的 channel 满载答案为何不同？
5. Tokio task 取消时，下单会怎样？
6. HTTP timeout 后能否重发，如何对账？
7. Acquire/Release 建立什么同步关系？
8. 如何定位 p99.9 尖峰？
9. `BTreeMap` 是否适合目标订单簿 workload？
10. 何时允许 `unsafe`，怎样验证 invariant？

合格回答先问 workload、状态所有权和失败模型，再谈 API 与优化。

## 28.11 市场、策略与研究问题

需要能用事件和公式回答：

- maker 为什么会亏，高 fill ratio 为什么可能更差？
- L2 能否知道 queue position，回测如何给边界？
- positive funding 谁付谁，代码如何固定现金流方向？
- linear/inverse PnL 和结算币种有何不同？
- mark/index/last 如何影响保证金与强平？
- long inventory 增大时 price/size 如何调整？
- worst-case exposure 为什么含活动和不确定订单？
- basis trade 为什么不是无风险？
- 如何防止 point-in-time、过拟合和多重检验问题？
- 如何证明策略不是只赚 inventory beta 或 maker rebate？

回答固定阈值前先明确产品、horizon、正常延迟、波动、仓位、价格源和撤单能力。

## 28.12 系统设计主线

题目“设计双交易所做市与对冲系统”应主动覆盖：

```text
public/private gateways + venue adapters
-> synchronized books + fair value
-> quote/hedge policy
-> independent hard risk
-> OMS + persistence + reconciliation
-> position/cash/PnL ledger
-> latency/backpressure/overload
-> metrics/alerts/security/deploy/kill
```

不要只画 Kafka、Redis 或数据库方框。说明它们为什么满足延迟、一致性、恢复和运维要求。

## 28.13 事故与行为证据

准备六个能追问十分钟的真实故事：

- 最严重的生产故障。
- 发现状态/数据不可信时如何限制影响。
- 用 profile 而不是直觉完成的优化。
- 一次设计分歧及权衡。
- 一次错误判断、发现与永久修复。
- PnL 风险和服务故障同时出现时如何排序。

结构：`Context/scale -> ownership -> evidence -> decision -> immediate risk control -> fix -> metrics -> permanent change`。

不能泄露前雇主策略、客户、密钥或受限数据。承认未知并说明如何获得可靠事实，比猜 venue 规则更专业。

## 28.14 缺少实盘经验时

可以准确说明：

> 我没有把离线回测或测试网包装成生产做市经验。现有证据是可回放的 L2、OMS、hard risk 和账本闭环，专门覆盖 timeout、乱序、对账和尾延迟；研究对 queue、fee 和 latency 使用保守敏感性。尚缺的是真实资金下的执行校准和生产 on-call，我会从 shadow、小限额 canary 和团队 runbook 开始补齐。

个人项目无法完全替代真实资金和生产值班，但能证明你知道差距在哪里，并具备进入团队后承担工作的基础。

## 28.15 按背景调整路线

### 已有后端经验，缺少交易知识

Rust 语法可能不是最大障碍，真正缺口是产品语义、订单不确定性和研究偏差。第 1 至 12 章练习仍要用证据通过，但可快速完成熟悉部分；把额外时间放在真实 venue 文档、L2 fixture、funding/margin 手算和 maker markout。不要把普通 CRUD 服务的“数据库是真相”直觉直接带入交易接入；venue 与本地只能通过协议和对账逐步收敛。

### 已有量化研究经验，缺少生产系统

重点是 OMS reducer、幂等执行、write-ahead、背压、trading readiness、告警和故障演练。把 notebook 中已经验证的 signal 封装为纯函数，live/replay 共用领域逻辑。主动研究“回测知道但实盘当时不知道什么”。

### 已会 Rust，缺少性能经验

不要先写 unsafe/lock-free。选一条真实录制路径，建立正确性 checksum、分段 histogram、CPU/allocation profile 和负载模型。做三次小而可证伪的优化，每次报告 p99.9 与复杂度代价。

### 已有交易系统经验

直接从第 27 章项目做差距测试。用两周实现最小闭环，哪项证据做不出来就回到对应章节。重点检查是否真正理解 Rust ownership/async cancellation，以及以前由团队其他组件承担的账务、保证金或运维边界。

## 28.16 如何回答一道深问题

题目：“下单 HTTP timeout 后怎么办？”

较弱回答：“重试三次，使用指数退避。”这忽略了订单可能已经成功。

完整回答可以这样组织：

> 先确认 venue 是否支持稳定 client order ID 和 query-by-client-ID。发送前我会持久化增险 intent 与 client ID；timeout 只说明响应未知，所以本地进入 Uncertain，不用新 ID 盲目重发，并把潜在订单计入 worst-case exposure。随后融合 client-ID query、open orders、recent fills 和私有流事件。若发现 fill，用按 venue 作用域构造的 execution key 幂等入账；超过不确定状态时限则对相关范围 risk-off。恢复交易前完成订单、仓位和余额对账。对应证据是 timeout/fill-before-ack fixture、restart replay 和 reconciliation report。

这个答案包含约束、状态、风险、恢复和证据。若面试官追问“如果 venue 不支持 client ID 查询”，应承认幂等能力变弱，说明需要更保守的账户隔离、查询范围和人工处置，而不是假装仍能精确证明。

题目：“Rust 为什么适合低延迟交易？”也不要只答零成本抽象。应谈可预测内存、无 GC pause、类型/所有权对状态正确性的帮助，同时承认网络和 venue 延迟可能支配端到端结果，性能仍需按 workload profile。

## 28.17 把项目写进简历

每条项目经历最多表达一个主结果，数字必须可复现：

```text
实现：Rust L2 snapshot/delta reconstructor 与 single-writer engine
边界：固定录制数据、单 venue、离线回放
证据：100 万事件 checksum 一致；gap 后停止发布并自动 resync
性能：在注明硬件/负载下报告 p50/p99/p99.9
```

另一条可以写 OMS/risk：

```text
设计纯订单 reducer、execution 幂等账本和独立 hard risk，
覆盖 fill-before-ack、cancel/fill race、send timeout 与重启对账；
结果来自模拟 venue，不代表生产实盘经验。
```

避免堆满 crate 和技术名。面试官更关心为什么采用 single-writer、怎么证明 fill 不重复、哪些回测假设最危险、优化是否改变业务结果。

## 28.18 面试练习方法

单纯阅读答案会产生熟悉感，不等于能在压力下组织推理。使用定时训练：

1. 2 分钟澄清产品、负载、延迟、资金和故障约束。
2. 8 分钟画正常数据流与状态所有者。
3. 8 分钟加入 gap、timeout、restart、overload。
4. 5 分钟讲 metrics、SLO、deploy、security。
5. 5 分钟接受反例并修改设计。

录音后检查是否只说名词，还是给出了事件、状态和证据。让同伴连续追问：“你怎么知道？”“如果响应丢了呢？”“这个数字从哪来？”“回滚后旧订单怎么办？”

编码训练也遵循同一风格：先复述输入和不变量，定义领域类型与错误，写最小正确实现和边界测试，最后讨论数据结构与性能。不要在没有基线时提前展示复杂优化。

## 28.19 入行路径的现实选择

高级做市岗位通常重视真实资金、执行校准和 on-call 经历，个人项目无法完全替代。更现实的入口包括：

- 交易所 connectivity、行情平台、OMS/EMS 或账户基础设施。
- 数字资产托管、风险、数据和低延迟后端岗位。
- 中级 Rust 交易工程岗位，在团队中积累 venue 与生产经验。
- 量化研究工程岗位，重点展示 point-in-time、回测和生产化能力。

选择岗位时问清：团队如何分工、是否有 code review/on-call、策略与 hard risk 是否分离、测试网/canary 流程、数据和事故文化。一个能接触完整链路并获得严谨反馈的中级岗位，往往比职责模糊的“高级”头衔更有成长价值。

## 28.20 入职后的前 90 天

前 30 天先建立事实：读产品/venue 语义、状态机、runbook 和近期事故；在不改行为的前提下重放 fixture、跟一次发布与对账，明确各组件 owner。

第 31-60 天承担小而可验证的改进，例如补一个 adapter 契约测试、减少一个告警噪音、修一处 replay 差异或完成一次 profile。避免在不了解资金边界时重写核心架构。

第 61-90 天开始拥有一个完整小范围：单 venue/symbol 的接入质量、一个 OMS 不变量、某类 latency SLO 或一项研究到 canary 的校准。交付代码、指标、runbook 和复盘，而不只是功能。

优秀入职表现不是最快提交最多代码，而是快速形成可靠判断、知道何时暂停、并让团队更容易获得事实。

## 28.21 毕业复评

再次按 0 至 4 分评估第 1 章的十项能力。每个 2 分以上必须附代码、测试、报告、演练或真实案例。核心 Rust、市场、OMS/风险任一域仍低于 2 时，先补证据再投高级岗位。

高级标准最终是判断力：知道何时追求速度，何时优先正确性；知道何时继续报价，何时必须停止交易；知道一个结果能证明什么，也知道它不能证明什么。
