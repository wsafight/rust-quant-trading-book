# 附录 A 术语与公式速查

本附录用于查词和核对公式，不建议第一次接触交易时连续背诵。每个中文概念后保留常见英文写法，便于对应代码和交易所文档。真实交易所规则、乘数、费率、结算、编号作用域和保证金，必须由带版本的产品说明、官方文档与固定测试样本覆盖。

正文第一次引入专业术语时，按“中文直觉、英文原词、具体事件、易混反例、后续精确定义”理解。例如 `ack` 是某层确认而不是成交，`valid` 不等于 fresh 或 tradable，`timeout` 不等于远端失败。后文只保留英文缩写时，可以回到本附录复核，但最终仍要结合所在 venue 和系统边界解释。

## A.0 术语首次学习索引

这张表用于第一次建立概念，不替代具体 venue 或产品规则。

| 术语 | 中文直觉 | 第一次系统学习 | 易混反例 | 本书精确定义 |
| --- | --- | --- | --- | --- |
| tick / lot | 价格和数量允许变化的最小格 | [第 6 章](06-types-errors-tests.md) | 小数位数相同不代表 tick 相同 | 由 instrument metadata 定义的离散价格/数量单位 |
| L1 / L2 / L3 | 一档、聚合多档、逐订单深度 | [第 9 章](09-book-and-traits.md#91-先分清三种订单簿粒度) | L2 看不到准确个人排队位置 | 不同粒度的订单簿可见信息 |
| snapshot / delta | 完整底稿与随后修改 | [第 9 章](09-book-and-traits.md#93-快照不是一串普通更新) | 收到 snapshot 不代表已接上缓存 delta | 按 venue 规则共同形成连续状态 |
| sequence | 外部或本地定义的先后编号 | [第 9 章](09-book-and-traits.md#94-序列号用来发现漏掉的更新) | 不等于 event time，也不能跨频道比较 | 在明确作用域内检测缺失、重复和顺序 |
| fixture | 保存下来反复测试的小份输入 | [第 1 章](01-roadmap-and-setup.md#12-四条工程原则) | 示例 JSON 不一定来自真实市场 | 带来源、版本、checksum 和预期行为的冻结输入 |
| checksum | 内容或最终状态的稳定校验摘要 | [第 9 章](09-book-and-traits.md) | 相同 checksum 不证明所有语义正确 | 用于检测内容变化和确定性回放漂移 |
| maker / taker | 提供与消耗流动性的一方 | [零基础预备课](beginner-primer.md#2-立即成交还是排队等待) | 限价单不一定最终是 maker | 以 venue 实际成交角色为准 |
| TIF | 订单允许等待多久 | [第 14 章](14-orders-execution.md#142-订单可以等待多久) | IOC 未成交部分不会继续排队 | Time in Force 的具体 venue 语义 |
| ack / fill | 某层确认与真实成交 | [零基础预备课](beginner-primer.md#3-发出订单不等于已经成交) | ack 不等于成交 | ack 增加请求/订单证据，execution 才改变经济状态 |
| OMS | 严谨维护订单状态的组件 | [零基础预备课](beginner-primer.md#5-谁来记住订单走到哪一步) | 不是普通订单数据库 CRUD | Order Management System，吸收多来源事实并收敛状态 |
| reducer | 旧状态加事件得到新状态和动作 | [零基础预备课](beginner-primer.md#5-谁来记住订单走到哪一步) | 不应在重放时再次执行网络 I/O | 无外部副作用的确定性状态归并函数 |
| 幂等 / idempotency | 同一事实处理多次结果不变 | [第 17 章](17-ledger-reconciliation.md) | 相同 ID、不同内容不是普通重复 | 重复应用同一完整事实不改变最终状态 |
| adapter | 把外部协议翻译成内部语义 | [第 19 章](19-venue-protocols.md) | 统一接口不能抹平 venue 差异 | 保存版本与能力边界的协议适配层 |
| backpressure | 下游跟不上时限制上游或降级 | [第 10 章](10-concurrency-async.md) | 不等于把队列无限加大 | 用容量、阻塞、合并、失效或 risk-off 控制积压 |
| timeout | 本地等待期限已结束 | [零基础预备课](beginner-primer.md#4-超时只表示我现在不知道) | 不等于远端失败 | 产生未知状态，并依据操作语义查询或对账 |
| PnL | 一段范围内的盈亏 | [零基础预备课](beginner-primer.md#6-成交后才改变仓位和账本) | 策略归因不等于账户权益 | 绑定产品、币种、时间和账务边界的 profit and loss |
| markout | 成交后一段时间的方向化价格变化 | [第 13 章](13-market-microstructure.md#137-成交价比决策价格差了多少) | 不是已实现 PnL | 按 fill side 归一化的未来参考价格变化 |
| adverse selection | 成交后价格很快向不利方向移动 | [第 13 章](13-market-microstructure.md) | 高成交率不一定是好事 | 条件于成交后的不利信息选择效应 |
| replay / backtest | 重放事实 / 评估历史决策 | [第 23 章](23-backtesting.md) | 按文件读取不等于确定性回放 | 使用明确时钟、顺序、模型和版本重建可见行为 |
| point-in-time | 当时本地已经能够看到 | [第 23 章](23-backtesting.md#233-当时只能使用当时已经看到的数据) | event time 早不代表已被本地接收 | decision information set 的时间边界 |
| benchmark / profile | 重复测量 / 定位资源花在哪里 | [第 12 章](12-performance.md) | benchmark 快不说明生产路径快 | 绑定 workload 与环境的测量和热点证据 |
| risk-off | 停止新增风险 | [第 22 章](22-strategy-and-risk.md) | 不等于停止处理成交和撤单 | 禁止增险但继续收敛状态和受控降险 |
| kill switch | 独立触发停止与接管 | [第 22 章](22-strategy-and-risk.md#2210-紧急停止不是一个简单开关) | 不是一个可由策略自动重置的 bool | 带范围、原因、动作、owner 和恢复 gate 的控制 |
| shadow / testnet / canary | 不发单观察 / 测试环境 / 小范围真实验证 | [第 23 章](23-backtesting.md#2313-从离线到生产) | 三者证据强度不同 | 从软件观察逐步增加市场与资金真实性的阶段 |
| SLO | 对外或内部承诺的运行目标 | [第 26 章](26-production.md#263-服务目标必须对应资金风险) | 进程 uptime 不能代表交易安全 | 直接映射到风险动作、owner 和窗口的服务目标 |
| RTO / RPO | 恢复多快 / 最多丢多少事实 | [第 26 章](26-production.md#267-恢复要回答多快和最多丢多少) | 不是统一的数据库参数 | 按组件和资金风险定义的恢复约束 |

看到缩写时先回到“中文直觉”，遇到实现和评审再使用精确定义。具体交易所对同名字段可能采用不同含义，最终以带访问日期的官方规则和 fixture 为准。

## A.1 领域数值

- `PriceTicks(i64)`：价格，单位是 instrument tick。
- `QtyLots(i64)`：数量，单位是 instrument lot。
- `ClientOrderId`：本地创建、重启后稳定唯一的请求标识。
- `VenueOrderId`：交易所分配的订单标识。
- `VenueId`、`AccountId`、`InstrumentId`：限定事实作用域。

权威订单、余额和账务不用裸 `f64`。金额乘法检查溢出，买卖舍入分别测试。

## A.2 方向

```text
signed_qty > 0  long
signed_qty < 0  short

fill_side = +1  策略买入
fill_side = -1  策略卖出
```

## A.3 订单簿

```text
mid             = (best_bid + best_ask) / 2
spread          = best_ask - best_bid
relative_spread = spread / mid
```

若价格只能用整数 tick 表达，奇数 tick spread 的 mid 是半 tick（例如 `100.5`），不能静默向下取整。显示、报价和下单边界必须分别声明舍入或拒绝策略。

```text
L1 imbalance = (bid_qty - ask_qty) / (bid_qty + ask_qty)

microprice = (best_ask * bid_qty + best_bid * ask_qty)
             / (bid_qty + ask_qty)
```

## A.4 成交后的价格变化（signed markout）

这个指标观察“成交之后，价格向有利还是不利方向走了多少”。买入后上涨、卖出后下跌记为对策略有利：

```text
signed_markout_bps(h)
  = 10,000 * fill_side * (mid(t+h) - fill_price) / fill_price
```

正值对策略有利，负值表示逆向选择。horizon 默认按本地可见时间；若 `t+h` 的 book invalid/stale，样本缺失并报告缺失率。

## A.5 线性合约盈亏

```text
unrealized_pnl_quote
  = signed_contracts * contract_multiplier
    * (mark_price - entry_price)
```

结算于 quote currency，实际 multiplier、精度和 average entry 按 metadata。

## A.6 反向合约盈亏

```text
unrealized_pnl_base
  = signed_contracts * contract_value
    * (1 / entry_price - 1 / mark_price)
```

通常结算于 base currency，价格变化对 base PnL 非线性。

## A.7 资金费用（funding）

默认阅读约定：资金费率为正时，多头支付空头。

```text
funding_charge = signed_position_notional * funding_rate
funding_income = -funding_charge
```

`funding_income > 0` 表示账户收入。notional price、settlement、cap/floor 与字段符号必须按 venue 验证。

## A.8 基差（basis）

```text
basis = futures_price - spot_price

annualized_basis ≈ (futures / spot - 1) / time_to_expiry_years
```

年化不包含 fee、borrow、funding、capital、transfer、margin 和 venue 风险。

## A.9 保证金

简化 cross 口径：

```text
equity = wallet_balance + unrealized_pnl

maintenance_requirement
  = sum(tier_maintenance(position_i))

maintenance_to_equity
  = maintenance_requirement / equity
```

该比率趋近 1 表示接近强平。不要假设 venue UI 的 `margin ratio` 与此同名同方向。

## A.10 报价

```text
reservation_price = fair_value
                    - inventory_skew
                    - funding_or_basis_adjustment

half_spread = fee
              + volatility
              + adverse_selection
              + latency
              + hedge_cost
              + safety_buffer

bid = reservation_price - half_spread
ask = reservation_price + half_spread
```

## A.11 权益恒等式

收入为正，成本字段输入为正：

```text
ending_equity - starting_equity
  = external_net_cash_flow
  + realized_price_pnl
  + unrealized_pnl_change
  + funding_income
  - trading_fees
  - borrow_interest
  - transfer_and_network_fees
```

spread capture、inventory revaluation、hedge slippage 是分析视图，不与会计科目重复相加。归因显式包含 residual。

## A.12 成交身份键（execution key）

典型形式：

```text
execution_key
  = (venue, account, instrument, execution_id)
```

必须先核验 execution ID 在 venue/account/instrument/order/session 中的唯一性。相同 key 只入账一次。

## A.13 关联编号链

```text
strategy_decision_id
  -> risk_decision_id
  -> client_order_id
  -> venue_order_id
  -> execution_key
```

这些编号进入日志和调用链追踪，便于从策略判断一路找到最终成交。不要把大量不同编号直接作为监控指标标签，否则会制造过多时间序列。

## A.14 时间

- 交易所事件时间（exchange event time）：交易所定义的事件发生时间。
- 本地接收时间（local receive time）：本机收到事件的时间。
- 本地处理时间（local process time）：本机关键阶段处理事件的时间。
- 单调时钟（monotonic clock）：只向前推进，适合计算进程内持续时间。
- 消息编号（sequence）：交易所或本地用于表达先后关系的编号。

研究只用当时本地可见信息。跨 venue 比较记录时钟同步与不确定性。

## A.15 订单不变量

- cumulative fill 单调不减且不超订单量。
- execution key 只入账一次。
- terminal state 不被旧事件回退。
- cancel requested 不是 terminal，期间仍可 fill。
- fill-before-ack 合法。
- unknown/illegal event 进入审计和对账。

## A.16 常用术语

| 术语 | 含义 |
| --- | --- |
| 挂单方 / 主动成交方（maker / taker） | 提供 / 消耗流动性 |
| 逆向选择（adverse selection） | 成交后价格很快向不利方向变化 |
| 成交后价格变化（markout） | 成交后一段时间，价格向有利或不利方向变化多少 |
| 库存偏移（inventory skew） | 根据已有仓位调整报价中枢或数量 |
| 报价中枢（reservation price） | 策略围绕它安排买卖报价的参考价格 |
| 排队位置（queue position） | 自己的订单在同一价格中的估计优先顺序 |
| 最坏情况暴露（worst-case exposure） | 当前仓位加上活动订单和不确定订单可能形成的最大暴露 |
| 禁止增险（risk-off） | 不再增加风险，继续撤单、对账并只允许受控降险 |
| 紧急停止开关（kill switch） | 独立停止新单、发起撤单并转入人工接管的控制 |
| 当时可见（point-in-time） | 只使用决策时点已经可以看到的数据 |
| 确定性回放（deterministic replay） | 相同输入、配置和随机种子得到相同状态 |
| 恢复时间 / 数据丢失目标（RTO / RPO） | 最长可接受恢复时间 / 最大可接受数据丢失范围 |
| 交易就绪（trading readiness） | 行情、私有状态、风险和对账都满足要求后的交易许可 |
