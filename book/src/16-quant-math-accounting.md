# 第 16 章 量化数学与交易账务基础

量化交易工程师不一定每天推导随机控制，但必须熟练处理收益率、基点、复利、波动、相关性、对冲比例和 PnL 账务。数学定义必须带单位、时间和符号。

> **学习导航**　前置：第 2、6、15 章的数值、精度和产品现金流｜目标：实现基础统计、对冲量与可闭合交易账务｜预计：12–16 小时｜产出：return/beta 工具、average-cost ledger 和 equity 对账

## 16.1 基点与相对变化

1 basis point（bp）是 `0.01% = 0.0001`。价格从 100 到 100.05，上涨约 5 bps：

```text
return_bps = 10,000 * (new / old - 1)
```

```rust
fn return_bps(old: f64, new: f64) -> Option<f64> {
    if !old.is_finite() || !new.is_finite() || old <= 0.0 || new <= 0.0 {
        return None;
    }
    Some(10_000.0 * (new / old - 1.0))
}

fn main() {
    let value = return_bps(100.0, 100.05).unwrap();
    assert!((value - 5.0).abs() < 1e-9);
}
```

fee、spread 和 markout 常用 bps，数量 PnL 用货币。比较前先统一单位。

## 16.2 简单收益与对数收益

简单收益：

```text
r_t = P_t / P_(t-1) - 1
```

多期财富用乘法复合：`(1+r1)(1+r2)... - 1`。对数收益 `ln(P_t/P_(t-1))` 可以相加，但从 log return 转回财富需要指数。

微小变化时两者接近，极端行情差异明显。不要混用简单收益平均和对数收益累积。

## 16.3 年化不能脱离采样

日收益波动年化常乘 `sqrt(365)` 或 `sqrt(252)`，取决于市场与定义。加密市场连续交易，但样本并不独立同分布；微秒/事件级波动更不能机械按一年秒数外推。

任何年化数字说明：采样频率、日历、窗口、缺失处理和是否去均值。对 funding/basis 年化还要考虑实际结算周期和资本占用。

## 16.4 均值、方差与波动

样本波动估计：

```rust
fn sample_std(values: &[f64]) -> Option<f64> {
    if values.len() < 2 || values.iter().any(|v| !v.is_finite()) {
        return None;
    }
    let mean = values.iter().sum::<f64>() / values.len() as f64;
    let sum_sq = values.iter().map(|v| (v - mean).powi(2)).sum::<f64>();
    Some((sum_sq / (values.len() - 1) as f64).sqrt())
}

fn main() {
    let std = sample_std(&[1.0, 2.0, 3.0]).unwrap();
    assert!((std - 1.0).abs() < 1e-12);
}
```

金融收益非平稳、有厚尾和波动聚集，单个标准差不能描述极端风险。按 regime、滚动窗口和压力情景联合观察。

## 16.5 Covariance、Correlation 与 Beta

Covariance 有单位，correlation 标准化到 `[-1,1]`。对冲比例常用：

```text
beta = cov(asset, hedge) / var(hedge)
```

若 beta 不稳定、基差扩大或 venue 失联，历史最优 hedge ratio 可能失效。对冲报告同时给 residual exposure、gross notional 和相关性压力，不能因为历史 correlation 高就认为风险消失。

## 16.6 PnL 的三个层次

1. **交易事件层**：每个 fill、fee、funding 和 transfer。
2. **账务层**：cash、position、cost basis、realized/unrealized 与 equity。
3. **分析归因层**：spread capture、markout、inventory、hedge slippage。

分析层解释原因，不能修改账务事实。任何归因最终加 residual 对齐 equity change。

## 16.7 Average Cost 示例

线性现货式简化账本：先买 2 @ 100，再买 3 @ 110：

```text
position = 5
cost     = 2*100 + 3*110 = 530
average  = 106
```

随后卖 2 @ 120：

```text
realized PnL = 2 * (120 - 106) = 28
remaining position = 3
remaining cost = 3 * 106 = 318
```

fee 单独记账。反向合约、不同 cost-basis policy 和 venue settlement 需要不同实现，不能用同一公式硬套。

## 16.8 可运行账本：事实、精度与幂等

配套工程的 `book/code/src/ledger.rs` 实现了上述 average-cost 规则。它刻意保持一个简化但闭合的单位系统：`price_ticks * qty_lots` 得到 quote unit，fee 也使用 quote unit。读者扩展真实产品时必须再加入 tick value、lot value、contract multiplier 和 fee currency，不能把教学单位直接当成交易所余额。

账本处理一笔 fill 的顺序是：

```text
execution key 去重/冲突检查
-> checked notional 与 cash movement
-> 关闭反向仓位并确认 realized price PnL
-> 必要时以剩余数量反手建仓
-> 提交 execution 与新状态
-> 用 mark 验证 equity identity
```

平均成本可能产生分数。例如先买 `1 @ 100`、再买 `2 @ 101`，平均成本是 `302/3`。实现不能为了方便默默截断；配套基线用约分后的有理数保存 cost basis 与 realized PnL，同时用整数保存现金。真实系统也可以使用 decimal，但必须明确 scale、舍入时点、余数归属并用交易所账单校准。

execution key 重复时有两种情况：完全相同的事实是幂等重放，不改变状态；相同 key 对应不同 price、qty、side 或 fee 是数据冲突，必须报错，不能当普通 duplicate 丢弃。可以直接运行对应测试：

```bash
cargo test --locked --manifest-path book/code/Cargo.toml ledger
```

`Ledger::apply_fill` 先在克隆状态上完成所有 checked arithmetic，再整体提交，因此溢出或冲突不会留下“现金已变、仓位未变”的半次入账。这是教学版事务边界；接入持久化后，还需用 append-only event、原子 snapshot 和重放 checksum 保护进程崩溃边界。

下面的示例不是正文副本，而是由 Cargo 直接编译的 `examples/ledger_round_trip.rs`：

```rust,ignore
{{#include ../code/examples/ledger_round_trip.rs}}
```

## 16.9 Equity 对账

固定账户范围：

```text
ending equity - starting equity
= external net cash flow
 + realized price PnL
 + unrealized PnL change
 + funding income
 - trading fees
 - borrow/transfer costs
```

如果不闭合，建立 suspense/residual，不要把差异强塞给“其他 PnL”。优先检查：重复/缺失 execution、fee currency、funding、transfer、mark source、FX conversion 和核算边界。

## 16.10 Sharpe 的局限

```text
Sharpe = mean(excess_return) / std(return)
```

它对采样、年化、非平稳、序列相关、厚尾和少量极端收益很敏感。高频策略还会因零收益间隔、重叠持仓和成本估计产生误导。

同时报告：总/年化收益、波动、最大回撤、turnover、hit/fill、skew/tail、容量、regime 和置信区间。

## 16.11 Drawdown

Drawdown 是权益相对历史峰值的下降：

```rust
fn max_drawdown(equity: &[f64]) -> Option<f64> {
    let first = *equity.first()?;
    if !first.is_finite() || first <= 0.0 {
        return None;
    }
    let mut peak = first;
    let mut max_dd = 0.0_f64;
    for &value in equity {
        if !value.is_finite() || value <= 0.0 {
            return None;
        }
        peak = peak.max(value);
        max_dd = max_dd.max((peak - value) / peak);
    }
    Some(max_dd)
}

fn main() {
    let dd = max_drawdown(&[100.0, 110.0, 99.0, 105.0]).unwrap();
    assert!((dd - 0.1).abs() < 1e-12);
}
```

历史 max drawdown 不是未来上界。结合仓位 limit、stress loss 和故障情景。

## 16.12 置信区间与经济误差

策略净优势 2 bps、统计区间 `[1,3]` bps 看似为正，但 queue/fee/latency 模型误差可能 ±5 bps。研究需要同时呈现统计不确定性和实施模型不确定性。

后者通常不能靠更多同类历史样本完全消除，需要 shadow/canary、保守参数包和硬风险限制。

## 16.13 数值实现原则

- 订单/账务使用 tick/lot/decimal 和 checked arithmetic。
- 统计使用浮点时显式处理 NaN/inf。
- 时间单位使用 `Duration` 或命名 newtype。
- 公式字段命名包含 cash-flow 方向。
- 任何年化、归因和比例记录定义版本。
- 手算样例、官方账单 fixture 和 property test 共同验证。

## 16.14 本章练习

1. 计算一组 simple/log returns，并比较累积结果。
2. 实现 covariance 和 beta，处理长度、NaN 和零方差。
3. 扩展配套 average-cost ledger，加入外部现金流和 funding，并保持现有幂等与反手测试通过。
4. 用完整现金流验证一天 equity 恒等式，再修改一个 execution 的 fee，确认对账能够发现差异。
5. 对同一收益序列按不同采样频率计算 Sharpe，解释差异。

本章完成标准：任何收益、风险或 PnL 数字都能说明方向、单位、时间、采样、成本和账务边界。
