# 第 18 章 交易所协议与 Adapter 设计

第 17 章构建公开行情，本章扩展到完整 venue adapter：instrument metadata、请求/响应、订单能力、错误、限频、时钟与 schema evolution。目标是统一领域语言，同时保留交易所差异。

> **学习导航**　前置：第 11、15、17 章的网络、metadata 与行情同步｜目标：设计保留 venue 差异的 adapter、限频和稳定身份｜预计：12–16 小时｜产出：capability matrix、契约 fixture、client ID 与调度器

> **章节边界：** 本章止于“把 wire 事实可靠地翻译成版本化领域事件和请求结果”：schema、精度、capability、签名、错误与限频都属于 adapter。跨 REST/WS 事件决定订单权威状态、持久化投影和重启对账属于第 19 章。

真实 adapter 的规则必须从[附录 E](appendix-e-references.md)列出的官方入口继续定位，并按[附录 D](appendix-d-versioning.md)保存具体页面、访问日期和 fixture。

## 18.1 三层模型

```text
Wire model
  venue JSON/binary field, exact string, optionality
      |
      v
Adapter model
  venue-specific validation, capability, sequence, error mapping
      |
      v
Domain model
  PriceTicks, QtyLots, OrderIntent, Execution, Position
```

wire struct 应贴近协议，领域 struct 应贴近业务。不要让 serde field name、venue symbol 或含糊状态字符串穿过整个系统。

## 18.2 Metadata 是运行时依赖

下单前需要：

- instrument 是否 active。
- product/settlement/multiplier。
- tick、lot、min/max qty/notional。
- order type/TIF/post-only/reduce-only capability。
- position mode 和 margin mode。

metadata 带 version/effective time。策略配置引用内部 `InstrumentId + metadata_version`，避免 symbol 被复用或规则改变后继续使用旧精度。

## 18.3 严格转换

adapter 负责 decimal/string 与 ticks/lots 转换。方向舍入示例：

```text
passive bid:  向下到 tick，避免意外跨价
passive ask:  向上到 tick
aggressive buy limit: 可能向上以保证覆盖，但受 price collar
aggressive sell limit: 可能向下
```

实际 policy 由订单意图明确携带，不能让一个通用 `round()` 猜方向。转换后再次检查 min notional、limit 和 post-only。

## 18.4 Capability 而不是假统一

```rust
#[derive(Debug, Clone, Copy)]
struct Capabilities {
    atomic_amend: bool,
    query_by_client_id: bool,
    cancel_on_disconnect: bool,
    reduce_only: bool,
}

fn supports_required(cap: Capabilities) -> bool {
    cap.query_by_client_id && cap.reduce_only
}

fn main() {
    let cap = Capabilities {
        atomic_amend: false,
        query_by_client_id: true,
        cancel_on_disconnect: false,
        reduce_only: true,
    };
    assert!(supports_required(cap));
    assert!(!cap.atomic_amend);
    assert!(!cap.cancel_on_disconnect);
}
```

启动时策略声明 required capabilities，adapter 不满足就拒绝启用。不要等第一笔生产订单 reject 才发现。

即使 capability 为 true，也要记录语义。例如 `atomic_amend` 是否保留 order ID/queue、quantity 是 total 还是 remaining。

## 18.5 请求生命周期

```text
Domain intent
-> adapter validation/rounding
-> durable client ID/request representation
-> signing/encoding
-> transport write
-> request ack / order event / query result
-> normalized domain event
```

request ack 可能只表示网关收到，不表示订单已进入 book；REST response 和私有 WS event 可能乱序。adapter 保留 venue timestamp、status、raw code 和 original ID，OMS 决定状态。

## 18.6 Client Order ID

一个好 client ID：

- 在 venue 限制长度和字符集内。
- 在规定作用域内稳定唯一。
- 崩溃重启后不会重用。
- 同一 intent 重发时保持不变。
- 不泄露敏感策略信息。

可以由环境/账户 namespace、持久 sequence 和 checksum 编码。不要只用当前毫秒时间，多进程/时钟回退会碰撞。

## 18.7 Execution ID 作用域

官方字段 `tradeId` 可能只在 instrument、order、account 或 session 内唯一。构造 execution key 前用文档和 fixture 验证：

```text
(venue, account, instrument, execution_id)
```

若无稳定 execution ID，需要结合 order cumulative fill、event sequence 和 reconciliation snapshot 设计替代，但应承认幂等能力更弱。

## 18.8 错误映射

wire code 保留原值，同时映射到可行动类别：

| 类别 | 动作 |
| --- | --- |
| InvalidRequest | 修复代码/配置，不重试同请求 |
| ExchangeReject | 记录业务 reason，更新策略/风控 |
| RateLimited | 按 server hint 调度和降载 |
| Auth/Permission | 停止相关交易并 page |
| RetryableTransport | 幂等前提下退避 |
| StateUncertain | 查询/对账，计最坏暴露 |
| ProtocolInvariant | feed/venue risk-off，保留证据 |

未知 error code 不映射成“可重试”。默认保守并告警 schema/capability 变化。

## 18.9 Rate Limit 模型

venue 可能同时限制：

- IP request weight。
- API key/order count。
- endpoint 权重和滑动窗口。
- WebSocket connection/subscription/message。
- account 或 subaccount 下单率。

本地 scheduler 维护估计 budget，响应 header/event 校正。队列按风险优先级调度，为 cancel/query 保留容量。服务端才是最终事实，收到 429 后不能通过并行重试放大。

## 18.10 时钟同步

认证常要求 timestamp 在 receive window 内。实现：

- 定期测 venue server time 与本地 wall clock offset。
- 使用 monotonic clock 跟踪 offset 样本年龄。
- offset/uncertainty 超阈停止发送增险请求。
- 区分 wall clock 用于协议，monotonic 用于 duration。

自动扩大 receive window 可能掩盖时钟故障并降低重放保护，不能作为唯一修复。

## 18.11 Schema Evolution

JSON 新增未知字段通常应兼容；必需字段缺失、类型改变或 enum 出现新值则要显式处理。不要把未知 order status 静默映射为 open/cancelled。

保留：

- raw payload。
- wire schema/adapter version。
- unknown enum/error counter。
- 新旧 fixture 和 migration 结果。

协议公告触发 metadata/adapter review，但实际 payload 仍是最终测试证据。

## 18.12 Contract Test

每项 capability 至少有：

- encode request golden test，包括签名输入而非真实 secret。
- decode success/error/unknown fixture。
- price/qty 边界与 rounding。
- batch partial success。
- ack/private event 乱序。
- rate-limit header 和 429。
- query pagination 与时间范围。
- reconnect/session/client ID 作用域。

离线 fixture 稳定运行；最小在线 test 定期验证当前 venue，但输出和权限受控。

## 18.13 Adapter 版本发布

先 replay 历史 raw payload，比较 normalized event diff；再 shadow 新旧 adapter，观察 unknown/error/metadata 差异；测试网验证认证与命令格式；生产 canary 使用最小范围。

回滚 adapter 时注意新版本已经发出的订单仍在 venue。旧版本必须能识别这些 client/order ID 和状态，或先完成撤单/对账。

## 18.14 本章练习

1. 为两个假 venue 建 capability matrix，找出不能统一的语义。
2. 设计稳定 client ID，模拟重启和多进程碰撞。
3. 用 fixture 测 price/qty 方向舍入和 min notional。
4. 建一个多维 rate-limit scheduler，预留 cancel budget。
5. 模拟未知 order status，验证系统保守降级而非猜测。

本章完成标准：adapter 的每个危险规则都能追到版本化文档、payload 和测试；领域接口统一但不隐藏 venue 语义。
