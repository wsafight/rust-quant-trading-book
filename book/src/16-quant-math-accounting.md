# 第 16 章 收益、风险指标与交易账务基础

本章不要求高等数学基础。目标是看懂和实现交易中最常见的几个计算：价格变化了多少、结果波动多大、两组变化是否相关，以及成交、费用和持仓能否解释账户总价值。每个定义都必须带单位、时间和正负方向。

> **学习导航**
>
> - 开始前：理解数值精度、合约盈亏和费用现金流。
> - 这一章学会：计算收益与风险指标，并检查账户总价值是否对得上。
> - 大约需要：12–16 小时。
> - 做完留下：收益/相关性工具、平均成本账本和权益核对结果。

> **开章场景：策略显示赚了 200 元，账户却只多 150 元**
>
> 交易报告按买卖价差算出毛收益 200 元，但账户总价值只增加了 150 元。检查后发现，交易费用用了 30 元，资金费用用了 20 元。若程序只展示最漂亮的收益数字，你无法判断策略真的有效，还是账务漏掉了成本。
>
> 分析指标回答“收益是否稳定、风险有多大”，账务恒等式回答“现金、持仓、费用和总权益能否互相对上”。**本章要解决的是：怎样计算基础收益与风险指标，同时用会计关系检查钱是否被完整记录。**

> **第一次阅读建议**
>
> 如果你对统计不熟，先读 16.1、16.6 至 16.9 和 16.11：先会换算价格变化，再看一笔买卖怎样改变现金、持仓和账户权益。均值、波动、相关性和夏普比率可以第二遍再读。第一次阅读的最低目标，是能解释“账户为什么多了或少了这笔钱”。

## 16.1 基点与相对变化

一个基点（basis point，bp）是 `0.01% = 0.0001`。价格从 100 到 100.05，上涨约 5 个基点：

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

价格从 100 涨到 110，简单收益是 `10%`。随后从 110 跌回 100，第二段收益约为 `-9.09%`，两段直接相加并不等于最终收益；最终财富要按先后顺序相乘。

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

三天收益分别是 `1%`、`1%`、`1%`，平均收益是 `1%`，而且每天结果相同，波动为零。若三天是 `-1%`、`1%`、`3%`，平均值仍是 `1%`，但过程显然更不稳定。标准差就是用来描述这种围绕平均值的分散程度。

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

## 16.5 两组价格变化有多大关系

协方差（covariance）衡量两组变化是否经常同向，数值仍带原始单位；相关系数（correlation）把它标准化到 `[-1,1]`。`1` 表示完全同向，`-1` 表示完全反向，接近 `0` 表示没有明显线性关系。

Beta 常用于估算：对冲资产每变化一个单位，目标资产通常变化多少。一个常见对冲比例是：

```text
beta = cov(asset, hedge) / var(hedge)
```

若贝塔不稳定、基差扩大或交易所失联，历史最优对冲比例可能失效。对冲报告应同时给出未被抵消的剩余暴露、总名义价值和相关性压力，不能因为历史相关性高就认为风险消失。

## 16.6 盈亏信息分为三个层次

1. **交易事件层**：每笔成交、交易费用、资金费用和转账。
2. **账务层**：现金、持仓、持仓成本、已实现盈亏、未实现盈亏和账户权益。
3. **分析归因层**：价差收益、成交后价格变化、库存损益和对冲滑点。

分析层用于解释钱为什么变化，不能反向修改账务事实。各项分析结果相加后若仍与账户权益变化不同，差额必须单独保留并继续调查。

## 16.7 平均持仓成本示例

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

## 16.8 让同一笔成交只能记一次

配套工程的 `book/code/src/ledger.rs` 实现了上述 average-cost 规则。它刻意保持一个简化但闭合的单位系统：`price_ticks * qty_lots` 得到 quote unit，fee 也使用 quote unit。读者扩展真实产品时必须再加入 tick value、lot value、contract multiplier 和 fee currency，不能把教学单位直接当成交易所余额。

账本处理一笔成交的顺序是：

```text
成交身份键去重/冲突检查
-> 检查名义价值和现金变化是否溢出
-> 关闭反向仓位并确认已实现价格盈亏
-> 必要时以剩余数量反手建仓
-> 提交成交记录与新状态
-> 用标记价验证账户权益恒等式
```

平均成本可能产生分数。例如先买 `1 @ 100`、再买 `2 @ 101`，平均成本是 `302/3`。实现不能为了方便默默截断；配套基线用约分后的有理数保存 cost basis 与 realized PnL，同时用整数保存现金。真实系统也可以使用 decimal，但必须明确 scale、舍入时点、余数归属并用交易所账单校准。

成交身份键重复时有两种情况：完全相同的事实是重复消息，不改变状态；同一身份键却对应不同价格、数量、方向或费用，则是数据冲突，必须报错，不能当作普通重复消息丢弃。可以直接运行对应测试：

```bash
cargo test --locked --manifest-path book/code/Cargo.toml ledger
```

`Ledger::apply_fill` 先在克隆状态上完成所有 checked arithmetic，再整体提交，因此溢出或冲突不会留下“现金已变、仓位未变”的半次入账。这是教学版事务边界；接入持久化后，还需用 append-only event、原子 snapshot 和重放 checksum 保护进程崩溃边界。

下面的示例不是正文副本，而是由 Cargo 直接编译的 `examples/ledger_round_trip.rs`：

```rust,ignore
{{#include ../code/examples/ledger_round_trip.rs}}
```

## 16.9 账户权益怎样对账

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

如果左右两边对不上，应保留“待查差额”（residual），不要把差异强塞给“其他盈亏”。优先检查：重复或缺失的成交、费用币种、资金费用、转账、标记价来源、汇率换算和核算范围。

## 16.10 夏普比率不能单独代表策略质量

夏普比率想回答的是：策略每承受一单位收益波动，平均获得多少超额收益。数值越高通常越好，但它把一整条收益路径压缩成了一个比值。

```text
Sharpe = mean(excess_return) / std(return)
```

它对采样、年化、非平稳、序列相关、厚尾和少量极端收益很敏感。高频策略还会因零收益间隔、重叠持仓和成本估计产生误导。

同时报告：总/年化收益、波动、最大回撤、turnover、hit/fill、skew/tail、容量、regime 和置信区间。

## 16.11 最大回撤：从历史高点跌了多少

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

后者通常不能靠增加同类历史样本完全消除，还需要小规模影子运行或灰度实盘、保守参数和不可绕过的风险限制。

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

## 16.15 回顾与下一章

量化指标必须带定义版本。简单收益和对数收益不能随意混合，年化必须说明采样与时间覆盖，covariance、beta 与 Sharpe 必须说明缺失值、相关性和零方差处理。统计量压缩了分布，不能替代样本路径、drawdown 和不确定区间。

账务提供另一类更坚硬的约束：position、cash、fee、funding、external flow 与 mark-to-market 应在明确币种和精度下闭合。归因可以帮助解释 residual，但不能为了让报表好看而制造一个调整项把差异填平。

下一章将把教学公式变成可重放账本。execution identity、不可变事件、snapshot/checksum 和三种对账会使“算对一次”升级为“重复、乱序和重启后仍能得到同一状态”。
