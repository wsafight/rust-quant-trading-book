# 第 23 章 低延迟与生产可靠性

生产可靠性不是让进程尽量不退出，而是让资金风险在故障中保持可界定，让事实能够恢复和审计。低延迟也不是单独目标；它服务于更少的 stale quote、更好的排队位置和更快的风险收敛。

> **学习导航**　前置：第 10–22 章的实时系统、OMS、风控、回放与研究｜目标：定义 failure model、SLO、持久化、部署、安全和恢复 gate｜预计：16–22 小时｜产出：runbook、容量曲线、故障演练和恢复审批记录

## 23.1 先写 Failure Model

对每个组件回答：

- 它可能停止、变慢、重复、乱序还是返回错误数据？
- 系统如何检测，检测时间多长？
- 自动动作是什么，最大暴露是多少？
- 状态恢复需要哪些事实？
- 人工 owner、runbook 与升级路径是什么？

至少覆盖网络部分失败、交易所部分失败、时钟异常、CPU/内存/磁盘过载、配置错误、凭证问题和外部依赖异常。

## 23.2 健康状态应反映交易能力

```text
ProcessAlive
  -> DependenciesReady
  -> MarketDataSynchronized
  -> PrivateStateReconciled
  -> RiskStateValid
  -> TradingReady
```

每一级都可以独立观察。Kubernetes ready 或 HTTP 200 不应自动打开交易。交易 enable 是显式、受审计的状态转换。

建议为 venue/symbol/strategy 维护状态：

- `Healthy`：满足增险 gate。
- `Degraded`：限制 size/功能，仍有受控能力。
- `RiskOff`：禁止增险，处理撤单、成交与对账。
- `Halted`：自动操作能力不足，人工接管。

## 23.3 SLO 与风险指标

传统服务只看 availability 不够。交易系统的 SLO 包括：

行情：

- book valid/fresh 比例。
- sequence gap 恢复时间。
- wire-to-book 和 queue age 分位数。

订单：

- send/ack/cancel/fill RTT。
- reject、unknown、uncertain rate。
- cancel age 与活动订单数。

风险与账务：

- position、gross/net/open-order exposure。
- hedge lag、margin buffer、distance-to-limit。
- order/position/balance drift 和对账时长。
- realized/unrealized PnL、fees、funding、drawdown。

SLO 必须附带超限动作。只有 dashboard 没有风险响应，不是完整控制。

## 23.4 结构化日志与因果

日志记录：

- correlation ID 链、venue、account、instrument。
- config、strategy、adapter 与 schema version。
- book sequence、fair value、risk snapshot 和 reason code。
- 原始 payload 的受控引用，而非到处复制敏感内容。

不要只靠 wall-clock timestamp 排序并发事件。保留 venue sequence、组件单调序号和 causal ID。order ID 进入日志/trace，指标按有限枚举聚合，避免高基数摧毁监控系统。

## 23.5 告警要能行动

每条告警定义 owner、severity、用户/资金影响、自动动作、人工步骤与恢复验证。示例：

```text
条件：market_data_age > hard_limit AND strategy_enabled
自动：risk-off symbol，提交撤单，冻结新 intent
人工：核验另一价格源、连接、sequence 与活动订单
恢复：新 snapshot 对齐 + freshness 稳定 + OMS 对账 + 显式 enable
```

使用持续时间、比例和多信号组合减少噪音，但不能用静默掩盖风险。自动 risk-off 后仍需告警，因为撤单可能失败、库存仍然存在。

## 23.6 延迟与过载治理

实时路径持续监控：

- 每段 p50/p99/p99.9。
- event-loop lag 与 queue residence time。
- allocation、GC（若有跨语言组件）、context switch。
- CPU saturation、steal、NUMA 和磁盘 fsync。
- 网络 packet/error/retransmit 和 venue RTT。

过载优先动作：减少非必要日志和查询、coalesce 可替代状态、降低 quote churn、resize/widen、禁用部分 symbol，最后 risk-off。不能牺牲订单/成交可靠性来维持表面吞吐。

## 23.7 持久化与恢复目标

分别定义：

- RTO：多快恢复到风险可控服务。
- RPO：最多丢失多少本地审计数据。
- Trading readiness：什么时候允许重新增险。

Trading readiness 通常比进程 RTO 更严格。恢复使用最近有效 snapshot 加后续 event log，再与 venue open orders、recent fills、position 和 balance 对账。

event log/snapshot 需要 schema version、checksum、单调序号和原子 snapshot 写入。必须测试磁盘慢、磁盘满、半截记录、损坏 checksum 与旧 schema。

## 23.8 Secret 与资产隔离

- API key 最小权限，交易 key 禁止提现。
- production/testnet、venue、策略使用独立 key/subaccount。
- IP allowlist、key rotation、访问审计和撤销流程。
- secret 不进入代码、仓库、日志、core dump 和 shell history。
- 配置 schema 校验、版本、审批、canary 与回滚。
- 高风险限额变更使用双人复核。
- kill/管理端强认证、最小网络暴露与完整审计。
- 账户资金按策略风险隔离，避免单一错误使用全部抵押品。

启动日志和操作界面必须醒目显示环境，避免测试命令误发生产。

## 23.9 发布阶梯

```text
unit/property/fuzz
-> deterministic replay
-> adapter contract test
-> shadow
-> testnet
-> production canary
-> gradual rollout
```

每一级定义进入 gate、观察期、指标阈值、回退条件和 owner。需要可独立开关 venue、symbol、strategy、新单、amend 和主动对冲。回滚软件版本不一定能回滚已经存在的订单和仓位，必须同时处理外部状态。

## 23.10 Degraded mode

降级设计应在事故前完成：

| 故障 | 自动动作候选 | 恢复条件 |
| --- | --- | --- |
| 单一行情源 stale | widen/停该源，参考备用源 | 重新同步且稳定 |
| 私有流 stale | 禁止增险、REST 对账 | 缺口补齐、订单可确认 |
| hedge venue 失联 | maker resize/撤单/降仓 | 对冲能力和持仓恢复 |
| 429 增加 | 降 quote churn、保留撤单预算 | budget 与 reject 正常 |
| 磁盘持久化慢 | 停止新增 durable intent | fsync 与审计健康 |
| position drift | risk-off、对账 | 差异有解释且账本闭合 |

“继续服务”不是默认优先级。对资金系统，已知安全状态通常优于功能完整但事实未知。

## 23.11 事故响应

![事故响应与恢复门禁](assets/incident-recovery.svg)

*图 23-1：恢复软件服务不等于恢复交易权限；对账、根因隔离和 canary gate 缺一不可。*

顺序：

1. 确认当前仓位、活动/不确定订单、margin 与资产影响。
2. 限制新增风险，按能力撤单或降仓。
3. 保留原始证据，建立单一事实时间线。
4. 恢复到已知安全状态，不在未知状态中追求满服务。
5. 对账订单、成交、持仓、余额、fee、funding 与 PnL。
6. 查明直接原因与系统性促成因素。
7. 设置有 owner、期限和验证方式的永久行动。

“工程师操作失误”不是根因。还要问为什么一个操作能影响全部资金，为什么缺少校验、权限、canary、审批或回滚。

## 23.12 事故文档

```markdown
# Incident: 标题

## Impact
- 资金、仓位、交易与时间范围：

## Timeline
- 时间、事实、来源与不确定性：

## Detection and Response
- 如何发现、为何未更早发现：
- 自动/人工风险动作及结果：

## Root Cause
- 直接技术原因：
- 系统性促成因素：

## Reconciliation
- 订单、成交、持仓、现金和 PnL 是否闭合：

## Actions
- action、owner、期限、验证方法：
```

事实、推断和未知要分开写。事故时间线中的每个关键点尽量引用日志、原始报文或 venue 查询证据。

## 23.13 必做故障演练

- 丢失 L2 delta 后继续收到消息。
- TCP 活着但 5 秒无有效行情。
- 私有流断开，期间发生 fill。
- 下单到达 venue，但响应 timeout。
- cancel ack 丢失，同时发生 final fill。
- 429 导致紧急撤单预算不足。
- CPU 饱和导致 queue age 上升。
- 磁盘慢/满导致 intent 无法持久化。
- 进程在 send 与 ack 落盘之间被杀死。
- 配置把最大订单放大 1000 倍。
- maker venue 或 hedge venue 局部停机。
- 本地持仓少一笔成交。

每项记录检测指标、自动动作、人工 runbook、最坏暴露和恢复验证。

## 23.14 从风险推导 SLO

假设策略在正常市场下 cancel RTT p99 为 40 ms，book 更新间隔中位数 10 ms，预测优势约持续 150 ms。团队不能因此简单设置 `market_data_age < 150 ms`；还需为检测、决策、发送和撤单留预算。

例如：

```text
最大允许错误观察窗口      150 ms
stale 检测与调度            20 ms
risk/decision               10 ms
cancel send-to-effective    60 ms（压力预算）
safety margin               30 ms
可分配给 market data age    30 ms
```

如果现实中数据 age 经常超过 30 ms，这不是把告警改成 200 ms 的理由，而是说明策略 horizon、部署、数据源或报价方式不匹配。SLO 将市场假设转化为工程约束。

同样，position reconciliation 每 5 分钟运行一次是否足够，取决于私有流缺失的检测时间、最大订单速率和账户限额。所有 SLO 都应能追到风险情景。

## 23.15 指标、日志和 Trace 的分工

同一个未知订单事件，在三种可观测数据中表达不同：

**Metric** 用于发现趋势和告警：

```text
orders_uncertain{venue="A", strategy="mm", reason="send_timeout"} 1
```

label 枚举有限，不放 order ID。

**Structured log** 用于查询单个事实：

```json
{
  "event": "order_uncertain",
  "client_order_id": "...",
  "venue": "A",
  "instrument": "BTC-PERP",
  "reason": "send_timeout",
  "config_version": 42
}
```

**Trace** 把 strategy decision、risk check、persistence、send 和 query 串成因果链。原始请求/响应保存在受控存储，通过 checksum/reference 关联。

只靠日志做监控会昂贵且难以可靠聚合；只靠指标无法还原单个订单；trace 采样又不能替代资金审计 event log。

## 23.16 一次部分故障时间线

```text
12:00:00.000 private stream last valid event
12:00:00.600 heartbeat 仍正常，但业务 event age 超限
12:00:00.620 system risk-off，停止 new/amend-up，发出 cancel
12:00:00.670 REST open-orders 查询开始
12:00:00.710 maker order 在 venue 成交，私有流未报告
12:00:00.900 REST 查询看到订单已消失
12:00:01.050 recent-fills 查询发现 execution
12:00:01.060 execution 幂等入账，position/risk 更新
12:00:01.120 hedge policy 执行受控降险
12:00:02.000 private stream 重连，但保持 risk-off
12:00:02.400 对齐缺口、完成订单/仓位/余额对账
12:00:05.000 人工批准小规模恢复
```

这条时间线说明 heartbeat 不能代替业务新鲜度，open order 消失不能证明 cancelled，重连也不等于恢复交易。若系统在 12:00:00.620 只“重启连接”而继续报价，未知仓位会继续扩大。

## 23.17 Capacity 与 Soak

容量测试不是瞬间打到最大吞吐。至少包含：

- 正常率持续数小时，检查内存、句柄和状态漂移。
- 历史极端窗口按 1x/2x/5x 回放。
- snapshot、重连和日志 burst 与高消息率叠加。
- 私有 order/fill 高峰和 public market-data 同时发生。
- 磁盘 fsync、metrics sink 或 DNS 等依赖变慢。

记录性能退化曲线，而不只找一个“系统崩溃点”。例如从 1.5x 开始 queue age 非线性上升，2x 时风险动作仍及时，2.5x 时 cancel action 被普通查询阻塞。这会直接决定安全容量和优先级队列设计。

生产限额应低于实验极限并留故障余量。峰值刚好跑满 CPU 的系统没有空间处理 resync、对账和告警。

## 23.18 恢复审批

事故后恢复不是把 `enabled=true` 改回去。审批前确认：

1. 当前订单、执行、仓位、余额与权益已经对账。
2. 根因已隔离，临时缓解对目标范围有效。
3. 行情和私有状态在观察窗口内持续健康。
4. 限额降到 canary 水平，owner 和回退条件明确。
5. 告警、dashboard 和人工操作通道可用。
6. 恢复动作本身写入审计，记录批准人与配置版本。

恢复后重点观察导致事故的 leading indicators，不只看 PnL。逐步扩大，每一级重新确认。

## 23.19 本章完成标准

- 进程健康与交易 readiness 分开。
- 每个 SLO 超限都有资金风险动作。
- 关键状态可从 event log replay 并与 venue 对账。
- 发布可逐级扩大，软件回滚同时处理外部订单/仓位。
- 密钥、配置、kill switch 和资产具有最小权限边界。
- 至少完成一次有时间线和账务对账的故障演练。

生产工程的最终问题不是“系统会不会失败”，而是“失败时损失是否有上界，事实是否能恢复，下一次是否更难发生”。
