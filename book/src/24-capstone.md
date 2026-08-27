# 第 24 章 贯穿项目：从行情到可审计 PnL

贯穿项目的目标是交付一个离线可演示的 Rust 交易系统：读取录制的 L2 数据，重建订单簿，生成做市意图，经硬风控后进入模拟交易所，用 OMS 处理成交，最终对账仓位与 PnL。它不连接真实资金，也不声称策略盈利。

> **学习导航**　前置：通过前五个阶段检查点｜目标：把行情、策略、hard risk、OMS、模拟交易所和账务连成可审计闭环｜预计：30–50 小时｜产出：一键离线 demo、完整测试、研究/性能报告和故障复盘

## 24.1 为什么做一个闭环

三个互不相连的小 demo 很难证明边界是否一致。贯穿项目可以暴露真正的接口问题：

- strategy 的价格单位能否被 adapter 正确量化？
- OMS 的 fill 是否只入账一次？
- replay clock 是否决定所有 freshness 与 latency？
- risk 是否计入 active/uncertain order？
- simulated exchange 是否经过真实订单状态机？
- PnL 是否与现金、仓位、fee 和 funding 闭合？

## 24.2 Workspace 结构

仓库中的 `book/code` 是已经可运行的单 package 起点，先用下面两条命令确认环境和核心边界：

```bash
cargo run --locked --manifest-path book/code/Cargo.toml --bin demo
cargo test --locked --manifest-path book/code/Cargo.toml
```

它提供领域类型、L2 book、OMS、hard risk、replay、Tokio 测试和 Criterion benchmark。下面的多 crate workspace 是完成本章后应逐步演化出的目标结构，不是仓库当前目录的虚假清单：

```text
quant-engine/
  Cargo.toml
  crates/
    domain/          领域类型、事件、时间与标识
    market-data/     raw/normalized fixture、同步、book
    strategy/        fair value、quote、hedge policy
    risk/            hard checks、limits、kill state
    oms/             order reducer、execution dedup、ledger
    simulator/       exchange、queue、latency、fee/funding
    replay/          deterministic clock 与 event scheduler
    observability/   metrics、structured events、reports
    app/             CLI 与组件装配
  fixtures/
  configs/
  reports/
  runbooks/
```

不要一开始拆成网络微服务。Cargo workspace 内的模块边界足以展示所有权和契约；完成正确基线后再根据部署与故障隔离需要拆进程。

## 24.3 领域契约

先写不可变约定：

- `PriceTicks`、`QtyLots`、`VenueId`、`InstrumentId`。
- signed position：正 long，负 short。
- signed markout：买 `+1`、卖 `-1`，正值有利。
- funding income：正数表示账户收入。
- execution key 唯一性作用域。
- 四种时间语义和 replay clock。
- 会计 PnL 恒等式。

所有 crate 依赖 `domain` 的类型，不各自发明单位和方向。

## 24.4 里程碑一：行情与订单簿

实现：

- 原始 fixture reader 和版本化 normalized event。
- snapshot/delta 同步、gap 与 checksum 接口。
- L2 book、top-N、mid、microprice、depth/sweep cost。
- `Empty/Synchronizing/Healthy/Invalid/Stale` 状态。
- deterministic replay 与 checksum。

验收：

- 连续回放 100 万事件，结果稳定。
- 删除一个 delta 后 book invalid，策略不再收到可交易 view。
- 重复/乱序/checksum failure 有明确处理。
- 记录 p50/p99/p99.9 wire-to-book 和 queue age。

演示命令应只使用仓库 fixture，不要求 API key。

## 24.5 里程碑二：OMS 与账本

实现：

- intent、client/venue order ID 与 execution key。
- 纯订单 reducer 和 action executor 接口。
- fill 去重、平均成本、position/cash/fee ledger。
- append-only event log 与 snapshot。
- open order、fills、position、balance reconciliation diff。

验收事件：

```text
pending_new -> fill -> new_ack
open -> cancel_requested -> partial_fill -> cancel_ack
open -> cancel_requested -> final_fill -> late_cancel_ack
send timeout -> uncertain -> query/open or fill
duplicate execution -> no duplicate cash/position
restart between persist and send
restart between send and ack persistence
```

每条事件从原始输入追到 ledger entry，replay 后结果相同。

## 24.6 里程碑三：独立硬风控

实现：

- trading enable/kill state。
- tick/lot/min notional 与 price collar。
- max order、position、gross/net/open-order exposure。
- book/private state freshness。
- margin buffer、loss/drawdown 与 rate-limit budget。
- `Allow/Resize/Reject(reason)` 决策审计。

验收：

- 策略不能直接访问 gateway send。
- active 与 uncertain order 计入 worst-case exposure。
- long 接近上限时买单不会增加越限风险。
- stale/gap/position drift 自动 risk-off。
- kill 后仍继续处理 fill 和对账。

## 24.7 里程碑四：策略与模拟交易所

策略基线保持简单：

```text
fair = mid 或 microprice
reservation = fair - inventory skew
half-spread = fee + volatility + latency + hedge + buffer
quotes = rounded reservation +/- half-spread
```

模拟交易所实现：

- send/cancel/response latency 分布。
- accept/reject、rate limit 与 post-only。
- touch、trade-through 和 L2 queue 三类成交模型。
- partial fill、cancel/fill race 与 execution report latency。
- maker/taker fee、funding 与简化 depth walk。

所有 simulated venue event 进入同一 OMS，不允许 simulator 直接改 position。

## 24.8 里程碑五：研究与 PnL

输出至少包含：

- gross/net PnL、fee、funding 与权益对账 residual。
- position distribution、gross/net exposure、time-at-limit。
- fill ratio、maker/taker、quote age。
- 10 ms/100 ms/1 s/10 s signed markout 和无效样本率。
- hedge delay/slippage、drawdown 与 turnover。
- 按 volatility/spread/depth regime 拆分。

敏感性矩阵：

- 三种成交模型与乐观/中性/悲观 queue。
- latency 1x/2x/5x/10x。
- fee tier、rebate 和对冲频率。
- inventory skew 与 hard limit。
- 断线/invalid 窗口。

报告要明确收益有多少依赖成交假设，哪项结果不能外推到实盘。

## 24.9 里程碑六：可观测与故障演练

至少提供：

- feed/book/OMS/risk/replay 状态指标。
- 分段 latency histogram 和 queue age。
- structured decision/order/execution 日志。
- gap、timeout、private stale、429、disk slow、position drift 告警。
- 一份 incident report 和对应 runbook。

一键 demo 顺序：

1. 正常回放，展示 book、quote、orders、fills 和 PnL。
2. 删除 delta，展示 book invalid 与 risk-off。
3. 注入 fill-before-ack，展示订单不回退且只入账一次。
4. 注入 cancel timeout，展示 uncertain、worst-case exposure 和对账。
5. 重启 replay，展示 checksum、position 和 equity 一致。

## 24.10 测试策略

| 层 | 重点 |
| --- | --- |
| Unit | decimal/tick、fee、PnL、risk predicate |
| Table | long/short、linear/inverse、事件序列 |
| Property | book、filled qty、exposure、ledger invariant |
| Fixture contract | venue payload、metadata、sequence/checksum |
| Replay | 全系统状态和输出 checksum |
| Fuzz | decoder、decimal、OMS event |
| Fault | gap、timeout、disconnect、429、disk |
| Load/soak | 2 倍峰值率、p99.9、age、内存 |

CI 默认只使用固定离线数据。在线 contract test 单独运行，避免外部网络让正确性测试不稳定。

## 24.11 性能报告

不要只写“每秒 X 万消息”。报告包含：

- 硬件、OS、Rust、release profile、依赖与 CPU 配置。
- fixture 消息数、大小和价格档分布。
- 单线程基线、优化假设和改动。
- p50/p99/p99.9/max、吞吐、allocation、queue age。
- 每次运行的最终 book/ledger checksum。
- 网络未包含、模拟 venue 等边界。

## 24.12 README 的诚实边界

必须说明：

- 使用 L2 还是 L3，queue 如何近似。
- 延迟来自实测、合成还是固定值。
- fee/funding/margin 规则版本。
- 是否连接过 testnet/生产，是否使用真实资金。
- 自身 market impact、隐藏流动性和 outage 如何处理。
- 哪些模块是教学实现，不适合直接生产。

可以说“在固定 L2 fixture 上通过 gap/replay/OMS 故障测试”，不能说“生产级盈利高频交易系统”。

## 24.13 先固定领域 API

项目开始时不要让 strategy、simulator 和 OMS 各自定义订单结构。先用一个小而严格的领域 crate 固定信息流：

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Side {
    Buy,
    Sell,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct QuoteIntent {
    decision_id: u64,
    book_version: u64,
    side: Side,
    price_ticks: i64,
    qty_lots: i64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum RiskDecision {
    Allow(QuoteIntent),
    Resize { original: QuoteIntent, allowed_lots: i64 },
    Reject { decision_id: u64, reason: &'static str },
}

fn main() {
    let intent = QuoteIntent {
        decision_id: 9,
        book_version: 42,
        side: Side::Buy,
        price_ticks: 600_000,
        qty_lots: 5,
    };
    let decision = RiskDecision::Resize { original: intent, allowed_lots: 2 };
    assert!(matches!(decision, RiskDecision::Resize { allowed_lots: 2, .. }));
}
```

`QuoteIntent` 不是 venue request：它还没做 symbol 映射、client ID、TIF 和 capability 校验。risk 也不直接发送；它产生经过审计的 decision，gateway/OMS 才创建 durable order intent。

接口设计评审时检查：

- 是否携带输入版本和 correlation ID？
- 是否把 venue wire 字段泄漏进通用领域？
- 哪些值可能缺失，是否用 `Option/Result/enum` 表达？
- action 重试是否幂等？
- replay 和 live 能否消费同一种 domain event？

## 24.14 一份可审计配置

配置不只包含策略参数，还包含环境、元数据版本和硬限额：

```toml
environment = "offline-replay"
venue = "fixture-venue"
instrument = "BTC-LINEAR-PERP"
metadata_version = 3

[strategy]
base_half_spread_ticks = 8
quote_lots = 2
inventory_target_lots = 0
inventory_skew_ticks_per_lot = 1

[risk]
max_order_lots = 3
max_abs_position_lots = 10
max_open_order_lots = 6
max_book_age_ms = 100
max_private_age_ms = 500

[simulator]
fill_model = "l2-neutral"
send_latency_ms = 8
cancel_latency_ms = 12
report_latency_ms = 5
maker_fee_bps = 2
taker_fee_bps = 5
seed = 42
```

加载时校验跨字段关系，例如 `quote_lots <= max_order_lots`、hard limit 非负、延迟和 fee 有合理范围、metadata version 与 fixture 匹配。运行开始后把完整解析结果和 checksum 写入 manifest；只记录文件名不足以复现实验，因为文件可能被改写。

生产硬风控配置与策略配置应分开权限。示例放在一起便于教学，真实部署不能让策略发布流程同时提高账户 hard limit。

## 24.15 一键演示应该讲一个故事

优秀 demo 不是启动后滚动大量日志，而是用固定时间线展示系统判断：

```text
00:00 load config/fixture; print manifest checksum
00:01 snapshot + deltas -> book Healthy(seq=...)
00:02 fair/quote -> risk Resize(reason=position budget)
00:03 order ack + partial fill -> ledger/equity update
00:04 missing delta -> book Invalid -> risk-off/cancel
00:05 cancel timeout -> order Uncertain -> worst exposure rises
00:06 reconciliation finds final fill -> idempotent ledger update
00:07 new snapshot + full reconciliation -> ReadyForApproval
00:08 replay ends; print state/PnL checksum and report path
```

CLI 输出聚焦状态转换、reason 和关键 ID；详细 payload 进入结构化文件。演示结束生成 Markdown/HTML 摘要，面试官不需要安装 dashboard 才能理解结果。

准备三种长度：3 分钟展示目标和异常，10 分钟讲架构与证据，20 分钟深入 queue、OMS、risk、replay 和性能取舍。

## 24.16 四次迭代，而不是一次大爆炸

**迭代一：可信行情。** 只做一 venue、一 instrument、离线 fixture。交付 book 状态、gap 测试和 checksum。

**迭代二：可信订单。** 加模拟 venue、OMS、execution ledger 和故障序列，不做复杂策略。用固定意图驱动状态机。

**迭代三：策略与研究。** 加 fair/quote/hard risk、三种 fill model、latency/fee/funding 和 PnL 对账。

**迭代四：生产证据。** 加 benchmark、metrics、structured logs、persistence/restart、runbook 和一键 demo。

每次迭代结束都能独立运行，不把测试和文档推迟到最后。若时间不够，完整的前两次迭代比五个半成品更有价值。

## 24.17 代码评审问题

邀请别人评审时不要只问“代码怎么样”，给出可以证伪设计的问题：

- 删除任意一个 market delta 后，是否存在继续报价的路径？
- 重复任意 execution event，cash/position 是否变化？
- 在每个 await/持久化边界 kill 进程，恢复结果是什么？
- 策略是否能构造绕过 hard risk 的 gateway request？
- 模拟 fill 是否使用了订单到达前的未来市场事件？
- PnL residual 非零时，系统是否仍报告策略成功？
- queue 满、磁盘慢和指标 sink 失败会影响哪条资金路径？
- README 的性能和收益数字是否能一条命令复现？

把评审发现转换成 failing test 或明确设计记录。口头提醒很快会丢失。

## 24.18 项目验收定义

完成不是所有模块都有代码，而是：

- 一条命令可离线运行，结果可复现。
- 领域类型、状态机、硬风控和账本有明确不变量。
- gap、乱序、重复、超时和重启有测试。
- PnL 会计闭合，研究假设与偏差可见。
- 性能数字带环境、负载、分位数和正确性。
- 演示能展示失败和恢复，不只展示 happy path。

这个项目可以证明你具备交易工程的基础判断力，但不能替代真实资金、执行校准和生产值班经验。
