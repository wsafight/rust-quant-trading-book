# 附录 B 工程检查清单

检查清单不能替代设计，但可以阻止在高压操作中遗漏已知步骤。阈值和规则应由具体产品与系统配置提供。

第一次阅读不需要逐条掌握本附录。做到某个阶段检查点、准备接入交易所或排查事故时，再打开对应清单逐项确认；看不懂某一项时，先回到正文查清它保护的风险，再决定是否适用于当前项目。

## B.1 代码提交

- `cargo fmt --check`、`cargo clippy -- -D warnings`、`cargo test` 通过。
- 新领域数值有单位、范围、舍入和溢出测试。
- 新错误能映射到重试、拒绝、对账、risk-off 或人工动作。
- 新状态有合法/非法转换和 replay 测试。
- 没有把密钥、账户数据和受限 payload 写入仓库/日志。
- 性能改动附正确性 checksum 和相同 workload 对照。
- `unsafe` 有最小封装、safety invariant 和专项验证。

## B.2 交易所接入

- instrument/product/settlement/multiplier 已核验。
- tick、lot、min qty/notional 与方向舍入有 fixture。
- snapshot/delta/sequence/checksum 同步按官方规则测试。
- order type、TIF、post-only、reduce-only、STP 已核验。
- amend 原子性、quantity 语义和 queue priority 已核验。
- client/order/execution ID 作用域已核验。
- batch 的逐项成功/失败已处理。
- rate-limit 维度、server hint 和撤单预算已建模。
- fee、funding、mark/index、margin tier 有版本和访问日期。
- testnet 与 production 差异已记录。

## B.3 启动与交易就绪

- 配置/schema/version/环境通过校验。
- API key 权限、IP 和账户范围正确。
- event log/snapshot 加载成功且 checksum 有效。
- metadata、余额、持仓、open orders、recent fills 已拉取。
- 私有流缺口已处理，OMS/ledger 完成对账。
- 公开 book 已同步、校验且 freshness 稳定。
- hard limits、margin buffer、rate budget 已初始化。
- 无未处置 unknown/uncertain order，或已计入限制。
- 先 shadow/risk-off，显式审批后 enable。

## B.4 下单前硬风控

- trading enable 与 kill state。
- venue/instrument/strategy/account 状态。
- market/private data freshness 与 book validity。
- price/qty/tick/lot/min notional。
- price collar 与 fat-finger 限制。
- max order、position、gross/net exposure。
- active 与 uncertain order 的 worst-case exposure。
- margin buffer、loss/drawdown 和 collateral stress。
- rate-limit 与紧急风险动作预算。
- config/version 和 decision reason 已审计。

## B.5 回测评审

- 假设与支付收益的一方已说明。
- raw/normalized/feature lineage 完整。
- 只使用 point-in-time 可见数据。
- 缺口、invalid/stale 没有静默填充。
- Live/replay 共用 reducer、strategy、risk、ledger。
- touch/trade-through/queue 模型有敏感性。
- send/cancel/report latency 有分布和压力情景。
- fee/funding/borrow/slippage/impact 逐事件计算。
- position/cash/equity 账本闭合，residual 可见。
- train/validation/test/holdout 按时间隔离。
- 参数邻域、多重检验、regime 与容量已报告。
- 明确哪些结果不能外推到实盘。

## B.6 性能报告

- release build 和完整编译参数。
- 硬件、OS、CPU/NUMA/电源配置。
- fixture、消息大小、事件分布与并发。
- warm-up、运行时长和样本数。
- p50/p90/p99/p99.9/max 与吞吐。
- allocation、CPU、context switch、queue age。
- microbenchmark 与端到端结果分开。
- 优化前后使用同一输入和正确性 checksum。
- 网络/venue/模拟边界明确。

## B.7 发布与小规模灰度

- offline replay、fixture contract 和故障测试通过。
- shadow 决策与旧版本/预期差异已解释。
- testnet 只用于协议和操作验证。
- production 使用单 symbol、最小 size 和独立限额。
- dashboard、告警、owner、runbook 已就绪。
- venue/symbol/strategy/new/amend/hedge 可独立开关。
- 回滚同时处理已有订单和仓位。
- 扩量 gate、观察期和退出条件已定义。
- kill switch 与人工接管路径已演练。

## B.8 故障响应

- 当前仓位、margin、活动/不确定订单已确认。
- 已禁止新增风险，撤单/降仓结果持续确认。
- 原始报文、日志、配置、部署版本已保留。
- 建立事实/推断/未知分开的时间线。
- 订单、成交、仓位、余额、fee、funding 已对账。
- 恢复到已知安全状态，未急于满服务。
- 根因包含系统性促成因素，不只写人为错误。
- 行动项有 owner、期限和验证方式。
- 恢复 trading 前全部 gate 重新检查并审批。

## B.9 作品集发布

- 一条命令可用固定数据离线运行。
- 架构图显示状态所有权和失败边界。
- happy path 与 gap/timeout/乱序/restart 均可演示。
- 测试、性能和研究数字可复现。
- README 说明 L2/L3、queue、latency 和成本假设。
- 明确 testnet、production、真实资金使用范围。
- 不宣称回测收益等于实盘，不宣称个人项目是生产经验。
- 不包含 API key、账户信息和受限数据。

## B.10 投递前

- 能手写定点 price/qty 与严格转换。
- 能推演 gap、fill-before-ack、cancel/fill race 和 timeout。
- 能解释 linear/inverse、funding、margin 与 basis 风险。
- 能指出 maker fill 回测为何乐观。
- 能展示一次 profile 驱动的 p99.9 改进。
- 能展示一次带对账的故障演练。
- 能解释策略与独立硬风控的边界。
- 能用 3/10/20 分钟三个版本介绍项目。
- 能准确说明亲自完成、团队参与、仿真、测试网和未知部分。
