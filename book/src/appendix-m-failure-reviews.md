# 附录 M 错误实现审查题

正确示例容易产生熟悉感。真实工程中更常见的任务，是从一段能够运行、甚至已经通过 happy-path 测试的实现中识别错误假设。

每个案例先只阅读“实现”，回答下面五个问题，再查看诊断：

1. 哪个事实被错误假设？
2. 最坏资金或证据后果是什么？
3. 最小反例怎样构造？
4. 应在哪一层修复？
5. 修复后怎样证明没有回归？

## M.1 裸浮点数跨越所有模块

### 实现

```rust,ignore
fn send_order(symbol: String, price: f64, qty: f64) {
    // serialize and send
}
```

调用方把 `price=100.05`、`qty=0.003` 直接传给 adapter，adapter 根据当前 metadata 四舍五入。账本也保存相同 `f64`。

### 诊断

价格、数量、币种、产品和规则版本都不在类型中；浮点转换与方向舍入被推迟到最危险的外部边界；历史订单又可能被当前 metadata 重新解释。最小反例是 tick size 为 `0.05`、输入含二进制浮点误差，并分别构造买卖方向。

修复位置不是在 serializer 外面再调用一次 `round()`，而是建立带产品规则版本的严格 decimal 解析和 `PriceTicks`/`QtyLots`，在订单进入 risk 与 adapter 前完成校验。回归证据包括超精度、买卖方向、极值和历史规则 fixture。

## M.2 所有任务共享一个大锁

### 实现

```rust,ignore
struct SystemState {
    book: Book,
    orders: Vec<Order>,
    position: i64,
    config: Config,
}

type Shared = Arc<RwLock<SystemState>>;
```

行情、策略、风控、订单和监控任务都可以取得写锁。

### 诊断

Rust 内存安全不等于业务状态一致。不同任务可以按不同锁区间更新 book、orders 和 position，读者也可能看到多个时点拼成的状态。持锁期间的 I/O、锁竞争和任务取消还会放大故障。

最小反例是让策略读取旧 book 与新 position，或让订单任务更新 order 后在更新 position 前退出。修复从 owner 图开始：每类权威状态由单一 reducer 管理，跨 owner 传递事件或不可变版本快照。回归测试要固定事件顺序并验证每个发布快照内部版本一致。

## M.3 无界行情队列

### 实现

```text
WebSocket -> unbounded queue -> decoder -> order book
```

设计者认为“不丢行情”比内存限制重要，因此队列永不拒绝输入。

### 诊断

只要输入速率长期高于消费速率，积压必然无限增加。即使每条 delta 最终都处理，策略看到的也是越来越旧的市场；内存、allocator 和调度压力又会继续降低消费速率。

最小反例是 producer 持续两倍速率，并同时记录 queue depth 和 residence time。修复需要有界容量、按消息语义定义满载动作、age 阈值和 risk-off。delta 不能简单 drop oldest；无法保持连续性时应使 book 失效并重新同步。

## M.4 请求超时后直接重发

### 实现

```text
send order A
-> timeout after 2 s
-> generate new client ID B
-> send again
```

### 诊断

timeout 只证明本地没有及时收到响应，不证明订单 A 未到达。A、B 可能同时活动或成交，使仓位翻倍。

最小反例是“请求 A 已写出并被接受，响应丢失，随后 B 被接受”。修复要求发送前可靠保存 intent 和稳定 client ID；timeout 进入 Uncertain 并计入最坏暴露；再用私有流、按 ID 查询、活动订单和近期成交对账。若 venue 不支持可靠查询，应降低能力与风险，而不是假装仍能精确恢复。

## M.5 回测触价后直接改仓位

### 实现

```text
if market_low <= bid_price:
    position += order_qty
```

### 诊断

这同时省略了订单何时到达、是否具有成交资格、前方队列、部分成交、撤单生效、报告延迟、OMS 和账本。策略在回测中观察到的系统与生产路径不同。

最小反例是价格在订单到达前触及，或撤单请求发出后、真正生效前产生成交。修复是让 simulator 维护 venue truth 并生成 ack/fill/cancel report，所有结果经过 OMS、risk 与 ledger；使用 touch、trade-through 和 queue 多模型比较。

## M.6 随机切分并只报告最佳参数

### 实现

研究者把相邻事件随机分到 train/test，尝试 200 组参数，只保留 test Sharpe 最高的一组。

### 诊断

相邻事件及重叠 label 可能共享信息，随机切分会泄漏；反复查看 test 再选参数，使 test 也成为训练过程的一部分；删除失败结果隐藏了多重尝试。

最小反例是给高度自相关的数据随机切分，与按时间切分比较结果。修复要求预先声明假设 family，按时间安排 train/validation/holdout，删除跨边界样本，保留完整实验 manifest，并把 effect size、区间、成本和模型敏感性一起报告。

## M.7 进程恢复即自动交易

### 实现

```text
process restarted -> health endpoint returns 200 -> enabled = true
```

### 诊断

进程存活不代表行情已同步、私有消息连续、活动订单已知、成交已补齐、仓位与余额一致或风控配置有效。自动开放可能在未知暴露上继续增险。

最小反例是在断线期间让一张订单成交，再重启本地进程。修复需要分层 readiness：process、dependency、market data、private state、reconciliation、risk 和 trading approval。恢复前查询远端事实、重放本地事件、核对账务，并由策略外权限审批。

## M.8 策略可以绕过硬风控

### 实现

```rust,ignore
struct Strategy {
    gateway: TradingGateway,
    risk: RiskChecker,
}

impl Strategy {
    async fn quote(&self, order: Order) {
        if self.risk.check(&order).is_ok() {
            self.gateway.send(order).await;
        }
    }

    async fn emergency_hedge(&self, order: Order) {
        self.gateway.send(order).await; // [问题] 特殊路径绕过同一风险边界
    }
}
```

### 诊断

系统“存在 risk 模块”不等于所有订单都经过风控。只要 strategy 持有可发送订单的 gateway，新增的重试、对冲或紧急路径就可能绕过限制。事故时最容易执行的特殊分支，恰好也最需要独立边界。

最小反例是让普通报价达到仓位上限后，再通过 `emergency_hedge` 发送同方向增险订单；或者让行情 stale 后从恢复脚本直接调用 gateway。

修复不是在每个 strategy 方法前复制一次 `risk.check`，而是让 strategy 只能产生 `OrderIntent`。唯一能够调用交易 gateway 的执行边界必须接收带审计 ID 的 `RiskDecision::Allow/Resize`；降险订单也使用独立、明确且受限制的规则。架构测试应验证 strategy crate 无法依赖 gateway 的发送能力。

回归证据包括正常报价、对冲、重试、恢复和人工操作入口。任何入口都不能构造未经 risk decision 的发送动作；risk 配置变更也不能由 strategy 权限完成。

## M.9 怎样使用这些案例

不要只阅读诊断。为每个案例完成：

- 一张正常路径和失败路径时间线；
- 一个能稳定复现问题的最小测试；
- 一次只修复根因的变更；
- 修复前后状态或输出比较；
- 一段“新设计仍不能证明什么”。

评审时让同伴在案例基础上改变一个条件。如果只能回答书中原样事件，说明记住了答案，还没有掌握规则。

## M.10 带批注的未通过样例一：类型安全检查点

### 提交内容

```rust,ignore
pub struct Quote {
    pub price: f64,       // [问题 1] 公开字段可绕过任何精度和正值校验
    pub qty: f64,         // [问题 2] price/qty 同类型，调用位置可以交换
}

pub fn can_send(position: i64, order_qty: i64, max: i64) -> bool {
    position + order_qty <= max // [问题 3] 可能溢出；也没有 side 和活动订单
}
```

提交者只测试 `position=2, order_qty=3, max=10`，得到 `true`，并申请通过检查点一。

### 评审批注

| 编号 | 严重度 | 为什么不能通过 | 最小反例 | 修复证据 |
| --- | --- | --- | --- | --- |
| 1 | 必须修复 | 非法精度、NaN、负值都能直接进入领域对象 | `price = NaN` 或 `100.12` 对 tick `0.05` | 私有字段与严格构造测试 |
| 2 | 必须修复 | 编译器无法区分价格与数量 | 交换两个参数仍能编译 | `PriceTicks`、`QtyLots` 不同类型 |
| 3 | 必须修复 | debug/release 可能产生不同溢出行为，也低估最坏暴露 | `position=i64::MAX, order_qty=1` | checked arithmetic 与 active/uncertain 测试 |
| 4 | 建议改进 | `bool` 无法解释为什么拒绝或是否应缩量 | invalid book 与 no capacity 都返回 false | `Allow/Resize/Reject(reason)` |
| 5 | 仍然未知 | `max` 属于哪个产品和哪个配置版本 | 两个产品共用一个裸 limit | 配置作用域和版本说明 |

### 修复后的最小接口差异

```diff
- pub struct Quote { pub price: f64, pub qty: f64 }
- pub fn can_send(position: i64, order_qty: i64, max: i64) -> bool
+ pub struct Quote { price: PriceTicks, qty: QtyLots }
+ pub fn check(intent: OrderIntent, snapshot: RiskSnapshot)
+     -> Result<RiskDecision, RiskInputError>
```

这段 diff 只展示边界变化，不是完整实现。复验必须重新运行非法精度、参数误用、溢出、long/short 和活动/未知订单案例。

### 评审结论

初次得分：正确性与类型 0、错误与边界 0，因此即使 happy path 通过也不能进入下一阶段。修复后只有在公开 API 无法绕过不变量，且调用方能够区分业务拒绝与输入错误时再评分。

## M.11 带批注的未通过样例二：研究与生产检查点

### 提交内容

```text
data split      = random 80/20       # [问题 1] 相邻事件和重叠 label 泄漏
fill model      = touch              # [问题 2] 唯一模型且过于乐观
parameters tried= not recorded       # [问题 3] 无法评估选择偏差
best Sharpe     = 3.2                 # [问题 4] 只有胜出结果
on restart      = enabled=true       # [问题 5] 未对账即恢复交易
```

### 评审批注

| 编号 | 严重度 | 为什么不能通过 | 最小反例 | 修复证据 |
| --- | --- | --- | --- | --- |
| 1 | 必须修复 | 测试集可能含训练期相邻信息 | 用自相关序列比较随机/时间切分 | 时间线、purge 和固定 holdout |
| 2 | 必须修复 | 看见价格不代表订单可成交 | 订单到达前 touch，或前方 queue 未耗尽 | 多 fill model 与 eligible-time 测试 |
| 3 | 必须修复 | 无法判断偶然赢家 | 同一数据尝试 200 组参数 | 完整 experiment manifest |
| 4 | 建议改进 | 单一 Sharpe 隐藏成本、尾部和 regime | 加入费用后净收益为负 | effect、区间、drawdown、capacity 与 residual |
| 5 | 必须修复 | 远端订单和成交可能与本地不同 | 断线期间成交后重启 | readiness 分层、对账与审批 |

### 修复后的研究流程差异

```diff
- random split -> touch fill -> choose best Sharpe -> restart and enable
+ time split + purge -> multi-model simulator -> complete trial manifest
+ -> ledger reconciliation -> Reject/Revise/Shadow decision
+ -> restart risk-off -> remote reconciliation -> external approval
```

### 评审结论

初次得分：时间与确定性 0、成交与校准 0、研究有效性 0、账务和恢复 0。该结果不能描述为策略有效，也不能进入 shadow。修复后的最低通过证据是一项负结果、完整尝试范围、多模型敏感性、账务闭合和故障恢复记录。
