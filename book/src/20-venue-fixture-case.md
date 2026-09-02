# 第 20 章 Venue 契约 Fixture 实战

前两章定义了可靠行情和 adapter 原则，本章用一个冻结的 Binance Spot depth schema 教学 fixture 把原则连成可运行路径。数值是按公开字段格式构造的离线样本，不是真实市场记录，也不代表交易所当前规则。官方文档入口与规则复核要求见[附录 E](appendix-e-references.md)。

> **学习导航**　前置：第 6、9、18、19 章的领域类型、订单簿同步与 adapter 契约｜目标：把 raw JSON、decimal、sequence 和 schema 规则变成可重复 contract test｜预计：8–12 小时｜产出：fixture manifest、严格 decoder、snapshot/delta 回放和 schema 变更报告

## 20.1 为什么使用冻结 Fixture

直接在 CI 请求交易所有三个问题：网络和限频让测试不稳定；今天的响应无法复现历史规则；异常分支难以按需出现。冻结 fixture 则可以保存：

- 原始 payload 字节与 checksum。
- API/stream 名称、文档 URL、访问与生成日期。
- instrument scale 与 metadata 版本。
- 预期 normalized event、最终 book 和错误。
- 样本是实录、官方示例还是合成值。

配套文件明确标记为 synthetic contract fixture。它证明 decoder 与既定 schema 的契约，不证明当前线上连接、数据质量或交易收益。

![Venue fixture 从原始载荷到订单簿契约](assets/venue-fixture-contract.svg)

## 20.2 Snapshot 原始形状

snapshot fixture：

~~~json
{{#include ../code/fixtures/binance-spot-btcusdt-snapshot.json}}
~~~

lastUpdateId 是这个完整状态的序列基线。bids/asks 中的 price 与 quantity 是字符串，不能先转 f64 再恢复 tick/lot。示例 metadata 固定 price decimals 为 2、quantity decimals 为 2。

## 20.3 Delta 原始形状

三条 depthUpdate：

~~~json
{{#include ../code/fixtures/binance-spot-btcusdt-deltas.jsonl}}
~~~

本例只消费 E/s/U/u/b/a：event time、symbol、首尾 update ID 和两侧更新。quantity 0.00 表示删除价位。adapter 先保留 raw payload，再映射成领域 Delta；order book 不应依赖 JSON 字段名。

## 20.4 Decimal 转换必须由 Metadata 驱动

对 price scale 2：

~~~text
"100.01"   -> 10,001 ticks
"100.0100" -> 10,001 ticks  # 超出部分全为零，可规范化
"100.011"  -> reject        # 非零超精度，不能静默舍入
~~~

配套 parse_decimal 只接受非负普通十进制字符串，使用 checked integer arithmetic，并拒绝 exponent、NaN、负数和溢出。quantity 可以为零，因为 delta 用零删除；price 仍通过 PriceTicks::new 拒绝零值。

真实 adapter 是否允许方向舍入取决于业务动作。公开行情事实通常应严格转换；订单请求则按 buy/sell、limit/collar 和 venue 规则选择显式舍入，不能复用一个“差不多”函数。

## 20.5 Snapshot 与 Delta 的连接条件

本教学 fixture 的基线为 100，后续事件依次覆盖 101、102、103：

~~~text
snapshot lastUpdateId=100
delta U=101,u=101 -> apply
delta U=102,u=102 -> apply; delete ask 100.02
delta U=103,u=103 -> apply; delete bid 100.00, resize ask 100.03
~~~

最终 book：

~~~text
best bid = 100.01 x 0.50
best ask = 100.03 x 0.75
last sequence = 103
~~~

配套 OrderBook 允许一个 delta 覆盖 expected sequence，即 U <= expected <= u，随后推进到 u。这只是当前教学契约；接入实际 stream 时必须逐字实现对应 endpoint 的现行同步步骤、缓冲窗口和 checksum 规则。

## 20.6 从 Wire 到 Book 的可运行路径

下面的 example 读取仓库内 fixture，不访问网络：

~~~rust,ignore
{{#include ../code/examples/venue_fixture.rs}}
~~~

运行：

~~~bash
cargo run --locked --manifest-path book/code/Cargo.toml --example venue_fixture
cargo test --locked --manifest-path book/code/Cargo.toml venue_fixture
~~~

路径中的每一层只承担一种责任：

~~~text
include bytes -> serde raw schema -> strict decimal normalization
-> domain Snapshot/Delta -> OrderBook invariant -> expected final state
~~~

如果最终断言失败，可以定位是 schema、数值转换、sequence 还是 book reducer，而不是在一个通用 JSON 回调里猜测。

## 20.7 缺口、重复与乱序 Fixture

正常样本不足以验证接入。至少派生三组失败 fixture：

- 删除 102：应用 103 时得到 SequenceGap，expected 为 102、received 为 103，book invalid。
- 重复 101：根据 venue 规则丢弃已覆盖事件或进入明确 duplicate 分支，不能当新事实累计。
- 交换 102/103：不得因为最终价格“看起来合理”就接受乱序。

出现 gap 后继续收到 104、105 也不能恢复可信状态。必须重新获取 snapshot、对齐缓存增量并完成校验。连续收到消息只证明连接活着。

## 20.8 Schema Evolution 策略

Schema 变化分三类：

| 变化 | 示例 | 默认动作 |
| --- | --- | --- |
| 可兼容增加 | 新增未使用统计字段 | raw 保留，decoder 可暂时忽略并监控 |
| 危险语义变化 | quantity/ID 作用域或零值含义变化 | risk-off，更新契约与 fixture |
| 破坏性形状变化 | 必填字段缺失、字符串变对象 | decode error，不发布领域事件 |

Serde 默认容忍未知字段有助于应对无害增加，但这不是忽略公告的理由。对资金相关字段应维护显式 raw struct、版本 owner 和变化监控；是否使用 deny_unknown_fields 要根据兼容性策略决定，不能全局套用。

fixture 也不能只保留 happy-path 旧版本。每次 schema 迁移至少保留 old/current 两组，证明兼容窗口、拒绝条件和回放结果。

## 20.9 Metadata 与 Payload 必须配对

同样的字符串 100.01 在 tick size 0.01 下是 10,001 ticks，在 0.1 下不合法。fixture manifest 应绑定：

~~~text
venue + channel + symbol
schema version + metadata version
tick/lot/minimums + effective time
payload checksum + expected normalized checksum
decoder commit + test name
~~~

历史回测使用事件当时有效的 metadata；生产启动使用当前已批准版本。用最新 metadata 重写历史事件会制造不可见的数据修订。

## 20.10 从公开行情到私有协议

公开 depth fixture 不需要 API key，适合作为第一个真实 schema 边界。扩展私有协议时再增加：

- 请求 canonical string 与固定签名向量，secret 使用测试值。
- new/cancel/query 的 request、transport result 和 business result。
- fill-before-ack、重复 execution 和 client ID 查询。
- 429 headers、共享 rate-limit bucket 与 cancel 预留。
- 敏感字段脱敏测试，确保 fixture 不含真实凭据或账户信息。

不要一开始录制整个真实账户。最小、合成、可解释的私有 fixture 更适合代码审查和开源作品集。

## 20.11 一次 Fixture 评审

评审者应能回答：

1. 哪个字段决定事件顺序，是否可能是区间？
2. 零 quantity 是删除、无效还是业务上的零？
3. price/qty scale 来自哪里，何时生效？
4. raw payload 是否原样保留，normalized 是否可重建？
5. 删除任一事件后为何一定停止发布可交易 book？
6. 新增、缺失和改变类型的字段分别发生什么？
7. fixture 是真实、官方还是合成，能证明什么、不能证明什么？

这些答案应出现在 manifest、测试和 adapter 版本记录中，不只存在作者记忆里。

## 20.12 本章练习

1. 删除 delta 102，断言 book invalid 且 risk 拒绝新增订单。
2. 为 decimal parser 增加溢出、负数、空字符串、exponent 和超精度表驱动测试。
3. 给 raw delta 增加未知字段，再删除 U，比较兼容增加与破坏性变化。
4. 选择另一个公开 venue，建立同等规模的 synthetic contract fixture 和 capability 差异表。
5. 生成 fixture manifest，记录来源类型、文档访问日期、scale、checksum 和预期最终 book。

本章完成标准：一条公开 payload 能从原始字节稳定重放到领域订单簿；规则来源、精度、sequence、失败路径和证据边界都可由另一位工程师复核。
