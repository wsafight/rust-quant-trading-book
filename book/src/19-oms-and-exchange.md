# 第 19 章 订单状态机、接入与对账

交易所接入最难的不是生成签名，而是在部分失败下保持订单、成交和仓位正确。请求可能已执行但响应丢失；fill 可能早于 new ack；cancel ack 与 final fill 可能乱序；重启时本地和远端都只提供部分事实。

> **学习导航**　前置：第 10、18 章的副作用边界与 adapter 语义｜目标：实现纯 OMS reducer、持久化顺序、去重与启动对账｜预计：16–22 小时｜产出：转换表、十类故障测试、event log 与 reconciliation report

> **章节边界：** adapter 负责忠实报告 venue 事实，OMS 负责把乱序、重复和部分失败的事实收敛成可审计状态。本章开头只复述 adapter 契约以固定输入边界，不再展开 schema、签名或通用限频实现。

## 19.1 Adapter 应保留危险差异

推荐边界：

```text
Domain command/event
  <-> Venue adapter
        symbol/product mapping
        price/qty conversion
        capability and order semantics
        REST/WS schema and signing
        error/rate-limit mapping
  <-> Transport
```

领域层可以统一 side、price、qty、intent、fill、position 与 risk decision，但不能隐藏：

- post-only、reduce-only、TIF 与 position mode。
- 原子 amend 还是 cancel + new。
- batch 的逐项结果。
- request ack、order ack 与撮合结果的区别。
- client/execution ID 唯一性作用域。
- rate-limit 维度和紧急撤单预算。

每个 adapter 发布 capability，启动时校验策略要求。

## 19.2 Intent 先于请求

策略产生的是订单意图，不是已经存在的订单：

```text
strategy decision -> risk decision -> durable intent
-> send attempt -> venue order -> executions
```

每个意图贯穿可追溯 ID：

```text
strategy_decision_id
  -> risk_decision_id
  -> client_order_id
  -> venue_order_id
  -> execution_key
```

高基数 ID 放日志与 trace，不要直接放 metrics label。

## 19.3 订单状态机

状态与事件分开：

![OMS 保守订单状态机](assets/oms-state-machine.svg)

*图 19-1：timeout 不证明订单失败；`Uncertain` 会限制新增风险，直到 query 或私有事件让事实收敛。*

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum OrderStatus {
    PendingNew,
    Open,
    PartiallyFilled,
    PendingCancel,
    Filled,
    Cancelled,
    Rejected,
    Uncertain,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum OrderEvent {
    NewAck,
    CancelRequested,
    CancelAck,
    Reject,
    Timeout,
    Fill { execution_id: u64, qty: i64 },
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct Order {
    total_qty: i64,
    filled_qty: i64,
    status: OrderStatus,
    executions: Vec<u64>,
}

#[derive(Debug, PartialEq, Eq)]
enum ReduceError {
    InvalidFillQty,
    Overfill,
    IllegalTransition,
}
```

用纯 reducer 处理事件，副作用由返回状态产生的 action 驱动：

```rust
# #[derive(Debug, Clone, Copy, PartialEq, Eq)]
# enum OrderStatus { PendingNew, Open, PartiallyFilled, PendingCancel, Filled, Cancelled, Rejected, Uncertain }
# #[derive(Debug, Clone, Copy, PartialEq, Eq)]
# enum OrderEvent { NewAck, CancelRequested, CancelAck, Reject, Timeout, Fill { execution_id: u64, qty: i64 } }
# #[derive(Debug, Clone, PartialEq, Eq)]
# struct Order { total_qty: i64, filled_qty: i64, status: OrderStatus, executions: Vec<u64> }
# #[derive(Debug, PartialEq, Eq)]
# enum ReduceError { InvalidFillQty, Overfill, IllegalTransition }
fn reduce(mut order: Order, event: OrderEvent) -> Result<Order, ReduceError> {
    match event {
        OrderEvent::Fill { execution_id, qty } => {
            if order.executions.contains(&execution_id) {
                return Ok(order);
            }
            if order.status == OrderStatus::Rejected {
                return Err(ReduceError::IllegalTransition);
            }
            if qty <= 0 {
                return Err(ReduceError::InvalidFillQty);
            }
            let filled = order.filled_qty.checked_add(qty).ok_or(ReduceError::Overfill)?;
            if filled > order.total_qty {
                return Err(ReduceError::Overfill);
            }
            let previous_status = order.status;
            order.filled_qty = filled;
            order.executions.push(execution_id);
            order.status = if filled == order.total_qty {
                OrderStatus::Filled
            } else if previous_status == OrderStatus::Cancelled {
                // 成交发生在撤单生效前，但报告较晚到达；保留已撤终态。
                OrderStatus::Cancelled
            } else {
                OrderStatus::PartiallyFilled
            };
        }
        OrderEvent::NewAck
            if matches!(order.status, OrderStatus::PendingNew | OrderStatus::Uncertain) =>
        {
            order.status = if order.filled_qty == 0 {
                OrderStatus::Open
            } else {
                OrderStatus::PartiallyFilled
            };
        }
        // fill 可以先到；之后的旧 ack 不得把状态从 Filled 回退。
        OrderEvent::NewAck
            if matches!(
                order.status,
                OrderStatus::PartiallyFilled | OrderStatus::Filled | OrderStatus::Cancelled
            ) => {}
        OrderEvent::Reject
            if matches!(order.status, OrderStatus::PendingNew | OrderStatus::Uncertain)
                && order.filled_qty == 0 =>
        {
            order.status = OrderStatus::Rejected;
        }
        OrderEvent::CancelRequested
            if matches!(order.status, OrderStatus::Open | OrderStatus::PartiallyFilled) =>
        {
            order.status = OrderStatus::PendingCancel;
        }
        OrderEvent::CancelAck
            if matches!(
                order.status,
                OrderStatus::Open
                    | OrderStatus::PartiallyFilled
                    | OrderStatus::PendingCancel
                    | OrderStatus::Uncertain
            ) =>
        {
            order.status = OrderStatus::Cancelled;
        }
        OrderEvent::CancelAck
            if matches!(order.status, OrderStatus::Filled | OrderStatus::Cancelled) => {}
        OrderEvent::Timeout
            if !matches!(
                order.status,
                OrderStatus::Filled | OrderStatus::Cancelled | OrderStatus::Rejected
            ) =>
        {
            order.status = OrderStatus::Uncertain;
        }
        OrderEvent::Timeout
            if matches!(
                order.status,
                OrderStatus::Filled | OrderStatus::Cancelled | OrderStatus::Rejected
            ) => {}
        _ => return Err(ReduceError::IllegalTransition),
    }
    Ok(order)
}

fn main() {
    let order = Order {
        total_qty: 10,
        filled_qty: 0,
        status: OrderStatus::PendingNew,
        executions: vec![],
    };
    let order = reduce(order, OrderEvent::Fill { execution_id: 7, qty: 10 }).unwrap();
    let order = reduce(order, OrderEvent::NewAck).unwrap();
    assert_eq!(order.status, OrderStatus::Filled);
    assert_eq!(order.filled_qty, 10);
}
```

教学实现用 `Vec` 查重，生产可换为集合或持久索引。更重要的是 execution key 的作用域：不能默认裸 `trade_id` 全局唯一。典型键是 `(venue, account, instrument, execution_id)`，最终以 venue 文档和 fixture 为准。

## 19.4 必须保持的不变量

- cumulative filled qty 单调不减，且不超过订单总量。
- 同一 execution key 只改变一次仓位和现金。
- terminal state 不被旧事件回退。
- cancel requested 不是 terminal，期间允许 fill。
- fill-before-ack 可以被吸收。
- 非法转移、未知订单和 overfill 不静默丢弃，进入审计和对账。
- reducer 对相同输入序列给出相同结果。

状态机应有转换表、表驱动测试、property test 与事件 replay。

## 19.5 Timeout 的未知状态

三条必须分开的事实：

1. 本地有没有发起 send。
2. 交易所有没有接受订单。
3. 本地有没有收到和持久化确认。

send/response timeout 后：

1. 标记 `Uncertain`，保留 client ID 和请求证据。
2. 不用新 ID 重发同一增险意图。
3. 查询 client ID、open orders、recent orders/fills。
4. 潜在订单计入 worst-case exposure。
5. 超过时限后 risk-off 并升级。

“请求失败”只有在得到明确、可信的拒绝时才能成为订单不存在的证据。

## 19.6 先落盘，后发送

增险操作的 write-ahead 顺序：

```text
persist(IntentCreated, stable_client_id) -> durability boundary
  -> send to venue
  -> persist(SendAttempted/Acked/Rejected/Uncertain)
```

如果先发送、后记录，进程可能在中间崩溃，形成“venue 有订单、本地无任何 ID”的最坏状态。先落盘后发送仍有一个正常恢复场景：intent 已落盘但尚未发送。重启时按稳定 client ID 查询后，可以安全重发或作废。

写入 page cache 不等于持久化。每单 fsync 最安全但可能过慢；group commit 需要明确延迟预算和最坏 RPO。具体存储可从 append-only framed log 起步，但必须测试半截尾部、checksum、schema version、snapshot 原子替换和 `kill -9` 恢复。

## 19.7 Amend 与 cancel-replace

需要明确：

- venue 是否提供原子 amend。
- amend 是否改变 order/client ID 或 queue priority。
- 部分成交后的 quantity 表示总量还是剩余量。
- cancel 未确认时 replacement 是否可以发送。
- 原订单和 replacement 同时活动的最坏暴露。

如果实际是 cancel + new，就不要在领域层伪装成原子 amend。风险系统必须看见中间阶段。

## 19.8 私有流与 REST 共同还原事实

私有流通常低延迟，REST query 适合启动、周期和异常对账；不能机械规定某一路永远权威。融合依据包括：

- 事件 ID/sequence 和唯一性作用域。
- 累计成交的单调性。
- open/terminal 状态的可回退规则。
- snapshot 的数据范围与分页。
- 私有流断线窗口和查询覆盖范围。

未知远端订单、未知本地订单和 position drift 都要有显式策略，不能为了让 dashboard 归零而无审计地覆盖。

## 19.9 启动恢复 Gate

推荐启动顺序：

1. 加载配置、event log、snapshot 和审计版本。
2. 启动网络、时钟、原始记录和指标。
3. 获取 metadata、账户、余额、仓位、open orders 与近期 fills。
4. 恢复私有流，按协议处理 snapshot/增量间隙。
5. 重建 OMS 和 position，解决或隔离未知状态。
6. 同步公开 order book。
7. 计算初始风险限额和 margin buffer。
8. 先 shadow/risk-off，全部 gate 通过后显式 enable。

进程 ready 与 trading ready 必须分开。服务能响应健康检查，不代表允许增加资金风险。

## 19.10 Rate limit 是资源预算

每个 venue 至少建模：

- request weight、order count、IP/key/subaccount 维度。
- WS connection、subscription 和消息/订单速率。
- server header/event 给出的剩余额度和 reset。
- 普通查询与紧急 cancel 是否共享预算。

本地 token bucket 只是预测。需要为风险动作预留额度，接近阈值时降低 quote churn 与非必要 query。收到 429 后遵守服务端提示和 jitter backoff，不能用更多重试扩大故障。

## 19.11 对账类型

- 启动对账：重启后重建可信世界。
- 周期对账：发现静默 drift。
- 事件触发对账：timeout、unknown order、私有流重连、非法转移。
- 结算对账：订单、成交、持仓、余额、fee、funding 与权益。

每次差异都应记录本地值、venue 值、证据时间、采取动作和是否需要人工确认。

## 19.12 Reducer 与 Action 为什么分开

如果 reducer 内直接发送网络请求、写数据库和更新指标，同一事件就无法纯粹 replay：重放 `CancelRequested` 会再次真的撤单，测试也需要复杂外部环境。

更清晰的模型：

```text
(previous state, domain event)
  -> reducer
  -> (next state, actions)

actions:
  Persist(record)
  SendNew(request)
  QueryByClientId(id)
  PublishRiskSnapshot
  RaiseAlert(reason)
```

Action executor 完成副作用，再把结果转换成新 domain event，例如 `Persisted`、`SendTimedOut`、`VenueAck`。这样 reducer 决定业务顺序，executor 负责 I/O、超时和重试。

关键是不能在 action 真正完成前假装状态已经完成。`CancelRequested` 可以产生 `SendCancel`，但订单仍可成交；只有可信 `CancelAck` 或对账事实才能进入 `Cancelled`。

## 19.13 Execution 幂等入账

一次 fill 通常同时影响：

- order cumulative filled 与 average fill price。
- instrument position 和 cost basis。
- cash/settlement balance。
- trading fee 与 fee currency。
- hedge trigger、risk exposure 和 PnL attribution。

这些更新必须围绕同一个 execution key 幂等。若 order reducer 去重了、position ledger 没去重，重复私有消息仍会制造仓位漂移。

可使用事务或单写者事件日志保证原子业务语义：

```text
if execution_key already_applied:
  verify payload consistent; no financial mutation
else:
  append ExecutionAccepted(key, normalized fill)
  update order projection
  update position/cash/fee projections
  publish new risk snapshot
```

相同 key 但 price/qty/fee 不同不是普通重复，说明 adapter、venue 修正事件或数据损坏，需要审计与对账。不能保留“最后一条”覆盖资金事实。

## 19.14 崩溃点矩阵

对一次 new order，从 intent 到 ack 列出每个可能崩溃点：

| 崩溃位置 | 本地 durable 事实 | venue 事实 | 恢复动作 |
| --- | --- | --- | --- |
| intent 落盘前 | 无 | 未发送 | 无外部风险，可重新生成意图 |
| intent 落盘后、send 前 | IntentCreated | 通常无 | 先 query client ID，再重发/作废 |
| send 后、SendAttempted 落盘前 | IntentCreated | 未知 | 按 client ID 查询，计最坏暴露 |
| ack 收到、Acked 落盘前 | IntentCreated/Attempted | 可能 open/fill | query open + recent fills |
| execution 落盘中 | 可能半截 record | 已成交 | checksum 丢弃坏尾，对账 execution |
| projection 更新中 | event log 有 execution | 已成交 | replay 重建 projections |

这张表决定 write-ahead 内容和 durability boundary。只说“我们有数据库事务”不够；需要明确网络副作用不在本地事务内，哪一步仍然可能产生未知订单。

## 19.15 Reconciliation 算法

对账不是直接用 venue snapshot 覆盖本地。一个可审计流程：

1. 固定查询范围和时间，获取 open orders、recent orders/fills、position、balance。
2. 记录原始响应、分页 cursor 和查询完成时间。
3. 按 client/venue order ID 和 execution key 关联本地 projections。
4. 分类差异，而不是只输出“不一致”。

常见分类：

```text
RemoteOnlyOrder      venue 有活动单，本地未知
LocalOnlyOpenOrder   本地认为 open，venue 查询不到
MissingExecution     venue 有 fill，本地未入账
ExecutionMismatch    同 key 的字段不同
PositionDrift        fill 修复后仍有仓位差
BalanceDrift         fee/funding/transfer/cash 未解释
```

5. 对确定且幂等的事实补事件，例如导入缺失 execution。
6. 对语义不确定的差异保持 risk-off，要求更长查询窗口或人工判断。
7. replay projections，再验证 position、balance 和 equity。
8. 输出 reconciliation report，记录每项修正来源。

REST snapshot 本身也可能分页、延迟或最终一致。查询结束时又可能产生新 fill，所以需要私有流 sequence/watermark 或按 venue 规则建立 snapshot 与增量衔接。

## 19.16 本章故障序列

必须用测试覆盖：

1. `pending_new -> fill -> new_ack`。
2. `open -> cancel_requested -> partial_fill -> cancel_ack`。
3. `open -> cancel_requested -> final_fill -> late_cancel_ack`。
4. 重复 execution event。
5. REST ack 与 WS fill 乱序。
6. send timeout，随后 query 找到 open order。
7. send timeout，随后收到未知 fill。
8. 私有流断线期间成交，重连后由 recent fills 恢复。
9. 进程在 intent 落盘后、发送前崩溃。
10. 进程在发送后、ack 落盘前崩溃。

本章完成标准：任意时刻能回答“交易所可能认为有哪些订单、本地为什么相信当前状态、未知状态如何限制风险并最终对账”。
