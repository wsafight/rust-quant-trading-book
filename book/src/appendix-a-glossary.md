# 附录 A 术语与公式速查

本附录用于查词和核对公式，不建议第一次接触交易时连续背诵。每个中文概念后保留常见英文写法，便于对应代码和交易所文档。真实交易所规则、乘数、费率、结算、编号作用域和保证金，必须由带版本的产品说明、官方文档与固定测试样本覆盖。

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
