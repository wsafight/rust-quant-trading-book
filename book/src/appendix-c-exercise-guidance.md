# 附录 C 全章练习提示与验收指南

本附录不直接给出完整答案，而是说明遇到卡点时应先抓住哪个不变量、最低要测什么、用什么证据证明完成。建议先独立尝试，再看对应提示；通过测试不等于设计已合理，仍要完成解释和演示。

## 第一部分：Rust 语言与工程基础

### 第 1 章

- **提示：** spread 应先定义输入域和 crossed 语义；decimal 转 ticks 最稳妥的入口是字符串拆分，不是先转 `f64`。
- **应测边界：** 负价、locked/crossed、缺失小数、超精度、`i64` 边界和不同平台结果一致。
- **验收证据：** 一个最小 crate、测试输出、工具链/CPU/OS 记录和带证据的能力自评。

### 第 2 章

- **提示：** 把计算写成纯函数；“没有报价”用 `Option`，“输入非法”用 `Result`，不要用 0 或极大值代替。
- **应测边界：** 空单边、奇偶 tick、跨价、仓位穿零及 `i64::MIN`，避免对最小负数直接调用 `abs()`。
- **验收证据：** mid/spread/position/risk 三组表驱动测试，并能逐行解释一次编译错误。

### 第 3 章

- **提示：** 先画状态 owner，再决定借用或转移；single writer 是所有权设计，不只是性能技巧。
- **应测边界：** long、short、减仓、反手，以及读者无法绕过 `apply_fill` 直接改仓位。
- **验收证据：** owner 图、两种并发方案的故障面比较和删除非必要 `clone` 前后的代码差异。

### 第 4 章

- **提示：** 用 enum 的 variant 表达互斥状态；构造函数建立不变量，字段保持私有。
- **应测边界：** 非法 price/qty、所有 enum 分支、禁止构造矛盾连接状态。
- **验收证据：** 从 tuple/bool 迁移前后的 API 对比和穷尽 `match` 测试。

### 第 5 章

- **提示：** 先写访问模式再选集合；top-N bids 需要反向遍历有序键，rolling window 从队首淘汰。
- **应测边界：** 空集合、重复价位、同 timestamp、无分隔符、Unicode/字节长度和 iterator 不消费源数据。
- **验收证据：** 固定 fixture 下 `Vec`/`BTreeMap` 的操作次数与接口比较，不把微基准猜测当结论。

### 第 6 章

- **提示：** 类型名同时携带单位和身份作用域；decimal 解析要先写精度与舍入规格。
- **应测边界：** ID 跨 venue 误用无法编译、正负方向舍入、overfill、溢出和每类错误对应动作。
- **验收证据：** newtype API、错误分类表、golden arithmetic cases 和至少一个编译失败示例。

### 第 7 章

- **提示：** trait 保持小而以调用者为中心；生产/replay 共用 `Clock` 接口，wire view 只活到 normalized 边界。
- **应测边界：** 固定/推进时钟、两种 decoder 错误、静态/动态分发等价结果和 borrowed buffer 生命周期。
- **验收证据：** 两个可替换实现、选择泛型或 trait object 的理由及 capability 的危险缺省清单。

### 第 8 章

- **提示：** 依赖箭头应从 binary/adapter 指向稳定领域层；CI 不依赖外部交易所。
- **应测边界：** private field 无法外部修改、feature 组合、library/binary 同时构建和离线测试。
- **验收证据：** workspace 图、固定检查命令、依赖评估记录和一次干净环境 CI 结果。

## 第二部分：实时系统基础

### 第 9 章

- **提示：** snapshot 建基线，delta 只在连续序列上推进；任何不变量失败都撤销“可交易”资格。
- **应测边界：** 空侧、删除档位、重复/范围 delta、gap、crossed book、深度不足和确定性 checksum。
- **验收证据：** 正常与 gap fixture、top-N/sweep 测试和 gap 后禁止读取 mid 的断言。

### 第 10 章

- **提示：** 容量由 burst 净积压与最大 age 共同约束；不同消息分别定义 block/coalesce/drop/risk-off。
- **应测边界：** producer 两倍速、receiver 关闭、task panic、取消发生在副作用各阶段以及 shutdown 超时。
- **验收证据：** residence-time 图、满载策略表、timeout 事实时间线和人工接管字段清单。

### 第 11 章

- **提示：** scripted source 代替真实网络；分别推进 last-frame 和 last-valid-event，重连由 fake clock 控制。
- **应测边界：** fragmented/invalid frame、stale business stream、429、jitter 上下界、优先队列饥饿和 secret `Debug`。
- **验收证据：** 离线集成测试、重连状态图、固定签名向量和不含凭据的日志样本。

### 第 12 章

- **提示：** 先固定被测路径、负载和 checksum；一次只改一个变量，release 结果才用于性能判断。
- **应测边界：** warm-up、不同消息尺寸、burst、日志 sink 变慢和优化前后完全相同的输出。
- **验收证据：** 环境 manifest、分位数、flamegraph 或 profile 证据，以及没有改善指标的诚实记录。

## 第三部分：市场、产品与执行

### 第 13 章

- **提示：** feature 必须带方向、horizon、regime 与可执行成本；markout 以成交方向归一化。
- **应测边界：** 多 horizon、spread/depth/volatility 分组、invalid book 排除和时间切分样本外结果。
- **验收证据：** 假设预注册、分组图表、极端窗口 replay 与不可识别 queue 假设。

### 第 14 章

- **提示：** sweep 返回逐档结果和 remainder，并区分非法输入与深度不足；从配套 `ParentExecution` 扩展 parent/child 状态，在途撤单仍占容量。
- **应测边界：** 买卖符号、深度不足、fee、部分成交、cancel/uncertain child、overfill 和趋势/震荡场景。
- **验收证据：** parent 容量测试、手算执行样本、queue-ahead 敏感性及同一 fixtures 上 TWAP/POV/立即执行的成本风险对照。

### 第 15 章

- **提示：** 先固定产品类型、contract multiplier、结算币和价格源，再写公式；funding 定义为账户现金流。
- **应测边界：** long/short、开平两腿、正负 funding、tier 边界、价格压力和 metadata 规则切换。
- **验收证据：** 官方 fixture 与复核日期、手算 PnL/fee 对账和 5%/10%/20% 压力表。

### 第 16 章

- **提示：** return、PnL 和现金流都注明时间区间与方向；从配套 `ledger` 的 execution 幂等、平均成本与 equity identity 开始扩展。
- **应测边界：** 长度不一、NaN、零方差、部分平仓/反手、重复/冲突 execution、fee、采样频率和 equity residual。
- **验收证据：** 小样本手算、`cargo test ... ledger`、完整日内账本、不同频率 Sharpe 对照与 residual 阈值。

### 第 17 章

- **提示：** execution key 先校验作用域与完整事实；cash、position、cost basis 和 execution index 在同一提交边界变化。
- **应测边界：** duplicate/conflict、分数平均成本、部分平仓、反手、fee currency、算术溢出、snapshot 损坏和重放。
- **验收证据：** golden cash-flow 表、equity identity、稳定 checksum 和包含未解决 owner 的 reconciliation report。

## 第四部分：构建交易系统

### 第 18 章

- **提示：** 原始 payload、normalized event 和 book state 分层保存；同步条件逐字来自 venue 文档。
- **应测边界：** snapshot 前/中/后 delta、gap、duplicate、重连、stale、checksum failure 和 metadata 变更。
- **验收证据：** recorder manifest、百万事件 checksum、同步状态图、尾延迟和一次 gap 演练。

### 第 19 章

- **提示：** capability matrix 只统一真正相同的语义；client ID 跨重启和进程仍唯一稳定。
- **应测边界：** tick/lot 方向舍入、min notional、ID 碰撞、组合限频、cancel 预留和 unknown status。
- **验收证据：** 两个假 venue 的契约 fixture、规则版本、rate-limit 调度轨迹及保守降级日志。

### 第 20 章

- **提示：** fixture 明确标注 synthetic/official/captured；raw JSON、metadata scale、normalized event 和最终 book 分层验证。
- **应测边界：** gap、duplicate、乱序、零数量删除、非零超精度、必填字段缺失和兼容字段增加。
- **验收证据：** fixture manifest、严格 decoder 测试、最终 book 断言和第二个 venue 的 capability 差异表。

### 第 21 章

- **提示：** reducer 保持纯函数，execution key 按真实作用域去重；timeout 产生 `Uncertain` 而非猜测终态。
- **应测边界：** 本章列出的十条故障序列、overfill、旧终态事件、半截日志和重启对账。
- **验收证据：** 转换表、表驱动/property 测试、reconciliation report 和重启前后账务 checksum。

### 第 22 章

- **提示：** quote proposal 与 hard-risk decision 是不同权限边界；worst case 包含 active 与 uncertain orders。
- **应测边界：** long 越接近上限买侧不得更激进、双边同时成交、stale book、hedge 断线和 kill 失败升级。
- **验收证据：** 风控决策表、三类对冲 Pareto 图、故障演练以及策略无法直连 gateway 的架构测试。

## 第五部分：研究与生产

### 第 23 章

- **提示：** 从配套 `simulator` 的 touch/trade-through/L2 queue 开始；模拟订单也经历 send/accept/queue/cancel/report，事件按时间、优先级和本地序号确定排序。
- **应测边界：** 三类 fill model、延迟倍增、断线禁用、相同 seed、重复回放和账本闭合。
- **验收证据：** 数据 lineage、模型敏感性、确定性 checksum、PnL 归因及模拟/实际偏差表。

### 第 24 章

- **提示：** order arrival、match、cancel effective 和 report 共用调度器；校准期与最终验证期严格分开。
- **应测边界：** order eligibility、同 timestamp tie-breaker、partial fill 守恒、cancel race、联合尾延迟和多订单市场量分配。
- **验收证据：** fill/latency 参数包、条件分布差异、未见验证结果、敏感性矩阵和明确模型拒绝条件。

### 第 25 章

- **提示：** 先写谁支付收益和为何持续；明确 label information interval，从配套 BH 实现开始验证 family/FDR 输入。
- **应测边界：** purge 前后、随机/时间切分差异、iid/多种 block length、参数邻域、family 范围、成本与最终 holdout。
- **验收证据：** 不删失败结果的 manifest、effect size/区间、BH 表和 Reject/Revise/Shadow/Canary 决策。

### 第 26 章

- **提示：** process health 与 trading readiness 分开；每个 SLO 直接映射资金风险动作和 owner。
- **应测边界：** queue age、磁盘/metrics/DNS 变慢、重启、回滚仍有活动订单、kill switch 和恢复审批。
- **验收证据：** SLO/runbook、负载退化曲线、分钟级事故时间线、对账和可验证的永久行动项。

## 第六部分：项目与职业路径

### 第 27 章

- **提示：** 按四次可独立运行的迭代交付；先让行情和 OMS 正确，再接策略、研究与生产证据。
- **应测边界：** 删除 delta、重复 fill、每个持久化边界 kill、风控绕过、未来数据、PnL residual 和过载。
- **验收证据：** 一键离线 demo、架构决策、测试/benchmark/研究报告、演练复盘和可证伪的 README 声明。

### 第 28 章

- **提示：** 能力评分只由可展示证据提高；岗位叙述采用“约束、行动、证据、局限”，不包装模拟收益。
- **应测边界：** 让同伴追问 timeout、重启、规则来源、性能环境和回滚外部状态，看是否能具体回答。
- **验收证据：** 24 周周志、毕业复评、20 分钟系统演示录像、两份技术写作和与目标岗位对齐的能力差距表。

## 如何使用验收结果

每项标记为 `未开始 / 能运行 / 有边界测试 / 能解释权衡 / 可由他人复现`。只有最后三级可作为作品集证据。某个检查点失败时，优先修复它，不要用后续章节数量补偿前置能力缺口。
