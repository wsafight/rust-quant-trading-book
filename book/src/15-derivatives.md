# 第 15 章 加密衍生品、保证金与 PnL

衍生品代码最危险的错误通常不是复杂数学，而是产品类型、乘数、结算币种和符号混淆。同一个 symbol 风格不能证明它是线性还是反向合约；所有规则都应来自版本化 instrument metadata。

> **学习导航**　前置：第 6、14 章的单位类型、成交与费用｜目标：掌握合约 metadata、保证金、funding 和带方向 PnL｜预计：10–14 小时｜产出：版本化 instrument fixture、PnL/fee 账本和压力情景

本章公式是带前提的教学模型，不代表任何 venue 的现行保证金规则。官方规则入口与版本留存要求分别见[附录 E](appendix-e-references.md)和[附录 D](appendix-d-versioning.md)。

## 15.1 现货、交割与永续

- 现货交易立即交换基础资产与报价资产。
- 交割合约约定未来结算，价格与现货的差称为 basis。
- 永续合约没有到期日，通过 funding 等机制使合约价格靠近指数。

“持有 BTC 永续多头”并不一定意味着账户持有 BTC。线性永续通常用稳定币/法币报价资产结算；反向合约可能以 BTC 等基础资产结算。

## 15.2 线性合约

简化的线性合约未实现 PnL：

```text
unrealized_pnl_quote
  = signed_qty * contract_multiplier * (mark_price - entry_price)
```

`signed_qty > 0` 表示 long，`< 0` 表示 short。Rust 中先用整数教学单位：

```rust
fn linear_pnl(
    signed_contracts: i64,
    multiplier: i64,
    entry_ticks: i64,
    mark_ticks: i64,
) -> Option<i128> {
    let price_change = i128::from(mark_ticks).checked_sub(i128::from(entry_ticks))?;
    i128::from(signed_contracts)
        .checked_mul(i128::from(multiplier))?
        .checked_mul(price_change)
}

fn main() {
    assert_eq!(linear_pnl(10, 1, 100, 105), Some(50));
    assert_eq!(linear_pnl(-10, 1, 100, 105), Some(-50));
}
```

真实结果还要乘 tick 的货币价值，并按结算币种的精度和舍入规则处理。

## 15.3 反向合约

USD 面值、base currency 结算的简化反向合约：

```text
unrealized_pnl_base
  = signed_contracts * contract_value
    * (1 / entry_price - 1 / mark_price)
```

价格上涨时括号为正，long 盈利、short 亏损。PnL 用 base currency 表示，对相同美元价格变动并非线性。

```rust
fn inverse_pnl(
    signed_contracts: f64,
    contract_value: f64,
    entry: f64,
    mark: f64,
) -> Option<f64> {
    if !signed_contracts.is_finite()
        || !contract_value.is_finite()
        || !entry.is_finite()
        || !mark.is_finite()
        || entry <= 0.0
        || mark <= 0.0
    {
        return None;
    }
    Some(signed_contracts * contract_value * (1.0 / entry - 1.0 / mark))
}

fn main() {
    let pnl = inverse_pnl(100.0, 1.0, 50_000.0, 55_000.0).unwrap();
    assert!(pnl > 0.0);
}
```

示例用浮点展示公式。生产账务应使用足够精度的 decimal/rational 或交易所一致的定点实现，并用官方样例对齐。

## 15.4 Index、mark 与 last

- last price：最近一笔成交价，可能被小额异常成交影响。
- index price：由若干成分现货市场构造的参考价格。
- mark price：交易所定义的风险估值价格，常用于未实现 PnL、保证金与强平。

不要默认用 last price 计算强平风险，也不要默认 mark 就是简单 index。需要核验成分市场、权重、异常剔除、溢价、更新频率、保护带和降级规则。

系统中每一种价格都应有不同类型或明确标签：

```rust
#[derive(Debug, Clone, Copy)]
enum PriceSource {
    Last,
    Index,
    Mark,
    LocalFair,
}

#[derive(Debug, Clone, Copy)]
struct ObservedPrice {
    source: PriceSource,
    ticks: i64,
    received_at_ns: u64,
}

fn main() {
    let mark = ObservedPrice {
        source: PriceSource::Mark,
        ticks: 6_000_000,
        received_at_ns: 42,
    };
    assert_eq!(mark.ticks, 6_000_000);
    assert_eq!(mark.received_at_ns, 42);
    assert!(matches!(mark.source, PriceSource::Mark));
}
```

## 15.5 Funding 的现金流方向

常见阅读约定：正 funding 时多头支付空头。可先写成：

```text
funding_charge = signed_position_notional * funding_rate
```

若 `funding_charge > 0` 定义为账户支出，则 long 在正费率下支出，short 收入。代码中不要使用含糊的 `payment` 正负；直接命名 `charge`、`income` 或使用带方向的现金流类型。

```rust
fn funding_income(signed_notional: f64, funding_rate: f64) -> f64 {
    // 正 fee 下 long 支付，所以收入取负。
    -(signed_notional * funding_rate)
}

fn main() {
    assert_eq!(funding_income(100_000.0, 0.0001), -10.0);
    assert_eq!(funding_income(-100_000.0, 0.0001), 10.0);
}
```

真实交易所的 notional price source、结算时点、cap/floor、预测窗口和 cash-flow 字段符号可能不同。必须用官方结算记录做 fixture。

## 15.6 Basis 与期限结构

```text
basis = futures_price - spot_price

annualized_basis ≈ (futures / spot - 1) / time_to_expiry_years
```

cash-and-carry 的完整收益还要扣除：

- 双腿交易费用与滑点。
- 借币/借款利息。
- funding 路径。
- 保证金和资本机会成本。
- 转账、托管、稳定币与 venue 风险。
- 极端行情下的强平和提前平仓成本。

因此 basis trade 不是无风险套利。

## 15.7 Cross、isolated 与 portfolio margin

- Isolated margin：单仓位使用隔离保证金，损失传播相对局部。
- Cross margin：同一账户权益支持多个仓位，盈利和损失相互影响。
- Portfolio margin：用组合情景、相关性和风险因子计算要求，不能用简单 notional 比例替代。

简化 cross 口径：

```text
equity                  = wallet_balance + unrealized_pnl
maintenance_requirement = sum(tier_maintenance(position_i))
margin_ratio            = maintenance_requirement / equity
```

在此约定下，ratio 趋近 1 表示接近强平。但部分 venue 的 UI 使用相反或不同定义，代码必须命名并测试公式，不要只叫 `margin_ratio`。

## 15.8 分层保证金与强平

维持保证金通常随仓位 notional 分层增加。单一“杠杆倍数公式”会遗漏：

- tier 跳变。
- 未实现 PnL 和其他 cross 仓位。
- 强平费用缓冲。
- 抵押品 haircut 与币种折算。
- mark price 规则。
- 订单占用保证金。
- 部分强平、保险基金和 ADL。

工程上比一个静态强平价更有用的是压力函数：对 mark price、波动、basis、抵押品价格和仓位同时施加情景，观察权益、maintenance requirement 与可用余额。

## 15.9 PnL 的会计恒等式

在固定账户范围和估值区间内，定义收入为正、成本字段输入为正：

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

`external_net_cash_flow` 只包括核算范围外的净流入/流出，不含已经单列的 funding、fee 或内部转账。

spread capture、inventory revaluation、hedge slippage 和 markout 是分析视图，不能和 realized/unrealized PnL 重复相加。归因项应互斥，并显式报告 `attribution_residual`。策略曲线盈利但权益恒等式不闭合时，先修账本。

## 15.10 元数据驱动设计

每个 instrument 至少记录：

- venue、symbol、产品类型与状态。
- base、quote、settlement currency。
- tick size、lot size、最小数量与最小 notional。
- contract multiplier/value，线性或反向。
- fee schedule/version。
- index、mark、funding 与结算规则引用。
- initial/maintenance margin tier 版本。
- 生效时间与抓取时间。

metadata 变化要触发配置校验与回归测试。不能只从 symbol 字符串猜产品。

## 15.11 必做测试矩阵

每种目标合约至少覆盖：

| 维度 | 样例 |
| --- | --- |
| 持仓方向 | long / short |
| 价格变化 | up / down / unchanged |
| funding | positive / negative / zero |
| 产品 | linear / inverse |
| 结算 | quote / base |
| margin | tier boundary / cross stress |
| 舍入 | 最小单位、半格、上限 |

期望值来自手工推导和 venue 官方样例，两者不一致时先停止接入并查明口径。

## 15.12 线性合约完整交易例子

假设交易 0.5 BTC 数量的线性永续：在 `60,000` 买入，在 `60,120` 卖出。忽略 multiplier 差异，gross price PnL：

```text
0.5 * (60,120 - 60,000) = 60 USDT
```

若开仓是 maker fee 2 bps，平仓是 taker fee 5 bps：

```text
entry fee = 0.5 * 60,000 * 0.0002 = 6.00
exit fee  = 0.5 * 60,120 * 0.0005 = 15.03
net PnL   = 60.00 - 6.00 - 15.03 = 38.97 USDT
```

若持仓跨过一次 funding，正费率为 1 bp，按 `60,050` notional 结算，多头支出：

```text
funding income = -(0.5 * 60,050 * 0.0001) = -3.0025 USDT
final net      = 38.97 - 3.0025 = 35.9675 USDT
```

真实账本每一项使用 venue 返回的成交 notional、fee currency、funding record 和舍入结果。不要用最终平均价格乘一个平均费率重建所有现金流。

## 15.13 反向合约完整例子

持有 1,000 张、每张 USD 面值 1 的反向合约多头，entry 为 `50,000 USD/BTC`，mark 为 `55,000`：

```text
PnL_BTC = 1,000 * (1/50,000 - 1/55,000)
        ≈ 0.00181818 BTC
```

按当前 mark 折算约 `100 USD`。如果价格从 `50,000` 下跌到 `45,000`：

```text
PnL_BTC = 1,000 * (1/50,000 - 1/45,000)
        ≈ -0.00222222 BTC
```

按 `45,000` 折算也约 `-100 USD`，但 BTC 数量的盈亏绝对值不同。这种非线性影响 base-currency collateral 和组合风险。若账户权益也以 BTC 为主，BTC 下跌时不仅仓位亏损，抵押品美元价值也同时下降。

## 15.14 保证金压力推导

考虑一个简化 cross 账户：wallet balance 为 `5,000 USDT`，持有 0.5 BTC 线性永续多头，entry `60,000`。假设维持保证金为当前 notional 的 1%，忽略其他仓位、费用和 tier deduction。

mark 跌到 `54,000`：

```text
unrealized PnL = 0.5 * (54,000 - 60,000) = -3,000
equity         = 5,000 - 3,000 = 2,000
maintenance    = 0.5 * 54,000 * 1% = 270
maintenance/equity = 13.5%
```

mark 跌到 `50,500`：

```text
unrealized PnL = -4,750
equity         = 250
maintenance    = 252.5
maintenance/equity > 100%
```

这个简化模型表明强平边界在两者之间，但真实强平可能更早：交易所会考虑平仓费用、分层维持保证金、订单占用、其他抵押品 haircut 和部分强平规则。生产风险不应自己猜一个精确 liquidation price；应使用 venue 提供字段和独立压力计算互相校验。

## 15.15 风险如何跨产品传播

Cross margin 让多个看似独立策略共享权益。一个 basis 策略的亏损可能降低做市策略的可用保证金；稳定币折价会同时降低 collateral value 并扩大合约价格分歧；venue 停机可能让盈利腿无法平仓，却仍需要在另一 venue 补保证金。

组合风险至少做以下情景：

- underlying 上下跳 5%、10%、20%。
- basis/funding 与历史关系脱钩。
- collateral/stablecoin 相对 USD 折价。
- maker 腿成交、hedge 腿拒绝或停机。
- mark 与外部 spot 短时分歧。
- 维持保证金 tier 因 notional 增长跳变。
- funding cap/floor 或结算规则变化。

风险报告同时给净 delta 和毛暴露。净 delta 接近零并不代表安全：两条腿在不同 venue、不同结算币种和不同强平规则下，毛头寸仍消耗资本并产生关闭风险。

## 15.16 建立 Venue 产品档案

接入一个产品时，为它建立可审计档案：

```text
Identity: venue / symbol / instrument ID / status
Contract: linear or inverse / multiplier / settlement
Trading: tick / lot / min qty / min notional / order capabilities
Pricing: index components / mark formula / update frequency
Cash flow: fee currency / funding direction / schedule / cap-floor
Margin: initial + maintenance tiers / collateral haircut
Failure: outage behavior / ADL / insurance / position mode
Evidence: doc title + access date + raw fixture + test name
```

档案不是一次性文档。metadata 和公告监控发现变更后，先停止不兼容配置，更新 fixture/test，再决定是否重新 enable。产品知识必须落实为版本化规则和代码证据。

## 15.17 本章练习

1. 实现线性合约 PnL 与 fee 账本，测试 long/short 和两腿成交。
2. 为 funding 定义明确的 `Income` 方向，并用正负费率覆盖 long/short。
3. 实现简化 tier maintenance 函数，测试刚好跨 tier 的连续性或规则跳变。
4. 建立一份真实 instrument metadata fixture，记录官方文档标题、访问日期和样例响应。
5. 对 mark 上下波动 5%、10%、20% 运行保证金压力情景。

本章完成标准：看到任何 PnL 或保证金数字，都能立即追问产品、方向、乘数、价格源、结算币种、精度、费用和规则版本。
