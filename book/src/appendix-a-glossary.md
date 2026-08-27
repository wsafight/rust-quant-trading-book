# 附录 A 术语与公式速查

本附录固定全书的默认阅读口径。真实交易所规则、乘数、费率、结算、ID 作用域和保证金必须由版本化 metadata、官方文档与 fixture 覆盖。

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

## A.4 Signed markout

```text
signed_markout_bps(h)
  = 10,000 * fill_side * (mid(t+h) - fill_price) / fill_price
```

正值对策略有利，负值表示逆向选择。horizon 默认按本地可见时间；若 `t+h` 的 book invalid/stale，样本缺失并报告缺失率。

## A.5 线性合约 PnL

```text
unrealized_pnl_quote
  = signed_contracts * contract_multiplier
    * (mark_price - entry_price)
```

结算于 quote currency，实际 multiplier、精度和 average entry 按 metadata。

## A.6 反向合约 PnL

```text
unrealized_pnl_base
  = signed_contracts * contract_value
    * (1 / entry_price - 1 / mark_price)
```

通常结算于 base currency，价格变化对 base PnL 非线性。

## A.7 Funding

默认阅读约定：正 funding 时 long 支付 short。

```text
funding_charge = signed_position_notional * funding_rate
funding_income = -funding_charge
```

`funding_income > 0` 表示账户收入。notional price、settlement、cap/floor 与字段符号必须按 venue 验证。

## A.8 Basis

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

## A.12 Execution key

典型形式：

```text
execution_key
  = (venue, account, instrument, execution_id)
```

必须先核验 execution ID 在 venue/account/instrument/order/session 中的唯一性。相同 key 只入账一次。

## A.13 Correlation ID 链

```text
strategy_decision_id
  -> risk_decision_id
  -> client_order_id
  -> venue_order_id
  -> execution_key
```

ID 进入日志/trace，避免作为高基数 metrics label。

## A.14 时间

- exchange event time：venue 定义的事件时间。
- local receive time：本地收到事件的时间。
- local process time：关键阶段处理时间。
- monotonic clock：进程内 duration。
- sequence：venue 或本地因果序列。

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
| maker / taker | 提供 / 消耗流动性 |
| adverse selection | 被更有信息的交易选择，成交后价格不利 |
| markout | 成交后一段时间的方向化价格变化 |
| inventory skew | 按库存偏移报价中枢或大小 |
| reservation price | 报价中枢 |
| queue position | 同价格优先级中的估计位置 |
| worst-case exposure | 当前仓位加活动/不确定订单的最坏暴露 |
| risk-off | 禁止增险，撤单、对账并只允许受控降险 |
| kill switch | 独立停止新单、撤单并人工接管的控制 |
| point-in-time | 只使用决策时点已可见的数据 |
| deterministic replay | 同输入、配置和 seed 得到相同状态 |
| RTO / RPO | 恢复时间目标 / 最大数据丢失目标 |
| trading readiness | 完成行情、私有状态、风险和对账后的交易许可 |
