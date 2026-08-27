# 第 7 章 Trait、泛型与生命周期：设计可替换边界

交易系统需要替换时钟、行情来源、venue adapter 和事件输出，但不能把不同交易所的危险差异抹平。trait 描述共同能力，泛型和 trait object 决定调用方式，生命周期描述借用关系。

> **学习导航**　前置：第 3、6 章，熟悉借用、enum 与 `Result`｜目标：设计小 trait，选择静态/动态分发并控制借用边界｜预计：8–10 小时｜产出：可替换时钟、decoder、fee model 和 capability 接口

## 7.1 Trait 是行为契约

```rust
trait Clock {
    fn now_ns(&self) -> u64;
}

struct FixedClock {
    now: u64,
}

impl Clock for FixedClock {
    fn now_ns(&self) -> u64 {
        self.now
    }
}

fn age_ns(clock: &impl Clock, received_at: u64) -> Option<u64> {
    let now = clock.now_ns();
    (received_at <= now).then(|| now - received_at)
}

fn main() {
    let clock = FixedClock { now: 1_500 };
    assert_eq!(age_ns(&clock, 1_200), Some(300));
    assert_eq!(age_ns(&clock, 1_600), None);
}
```

把系统时钟放在 trait 后，replay 可注入确定性时钟，测试不需要 sleep。未来的 `received_at` 不是负年龄，而是无效输入，必须由调用者转入 stale/invalid 分支。trait 应表达调用者真正需要的最小能力；一个拥有几十个方法的 `TradingSystem` trait 往往隐藏了过宽耦合。

## 7.2 泛型与 Trait Bound

`impl Trait` 参数是泛型语法的简写。显式泛型适合多个参数共享类型约束：

```rust
trait MidSource {
    fn mid_ticks(&self) -> Option<i64>;
}

fn choose_mid<A: MidSource, B: MidSource>(primary: &A, backup: &B) -> Option<i64> {
    primary.mid_ticks().or_else(|| backup.mid_ticks())
}

struct StaticMid(Option<i64>);

impl MidSource for StaticMid {
    fn mid_ticks(&self) -> Option<i64> {
        self.0
    }
}

fn main() {
    assert_eq!(choose_mid(&StaticMid(None), &StaticMid(Some(100))), Some(100));
}
```

泛型通常静态分发，编译器可内联并为具体类型生成代码。代价是编译时间、代码体积和复杂签名。是否更快仍由 workload 决定。

## 7.3 Associated Type

当一个实现只对应一种输出类型，关联类型比额外泛型参数更清楚：

```rust
trait Decoder {
    type Event;
    type Error;

    fn decode(&self, raw: &str) -> Result<Self::Event, Self::Error>;
}

#[derive(Debug, PartialEq, Eq)]
struct Level { price: i64, qty: i64 }

struct CsvDecoder;

impl Decoder for CsvDecoder {
    type Event = Level;
    type Error = &'static str;

    fn decode(&self, raw: &str) -> Result<Level, &'static str> {
        let (price, qty) = raw.split_once(',').ok_or("missing_comma")?;
        Ok(Level {
            price: price.parse().map_err(|_| "bad_price")?,
            qty: qty.parse().map_err(|_| "bad_qty")?,
        })
    }
}

fn main() {
    assert_eq!(CsvDecoder.decode("100,3"), Ok(Level { price: 100, qty: 3 }));
}
```

真实 decoder error 应是结构化 enum，示例用字符串缩短代码。

## 7.4 Trait Object 与动态分发

运行时需要从配置选择实现时，可使用 `dyn Trait`：

```rust
trait FeeModel {
    fn fee(&self, notional: f64) -> f64;
}

struct BpsFee(f64);

impl FeeModel for BpsFee {
    fn fee(&self, notional: f64) -> f64 {
        notional * self.0 / 10_000.0
    }
}

fn charge(model: &dyn FeeModel, notional: f64) -> f64 {
    model.fee(notional)
}

fn main() {
    assert_eq!(charge(&BpsFee(5.0), 10_000.0), 5.0);
}
```

trait object 使用 vtable 动态分发，并限制 object safety。配置加载、研究模型和低频插件边界通常可以接受；每消息热路径是否接受要测量。

## 7.5 默认方法与扩展 Trait

默认方法适合真正通用、不会隐藏语义的行为。不要在通用 venue trait 中给 `reduce_only` 或 `amend` 一个“差不多”的默认实现，因为不同 venue 的资金风险不同。

扩展 trait 可以给外部类型增加局部能力，但团队需要控制数量，避免方法来源难追踪。

## 7.6 生命周期描述引用关系

编译器多数时候能省略生命周期。返回借用时需要说明来源：

```rust
fn field_before<'a>(raw: &'a str, delimiter: &str) -> &'a str {
    raw.split_once(delimiter).map(|(head, _)| head).unwrap_or(raw)
}

fn main() {
    let payload = String::from("BTC-PERP,100,3");
    let symbol = field_before(&payload, ",");
    assert_eq!(symbol, "BTC-PERP");
}
```

返回值不能比 `payload` 活得更久。生命周期没有延长 buffer，只让关系被检查。

## 7.7 零拷贝 Decoder 的边界

网络 parser 可以返回借用输入 buffer 的 wire view：

```rust
#[derive(Debug)]
struct WireView<'a> {
    symbol: &'a str,
    price: &'a str,
}

fn decode_view(raw: &str) -> Option<WireView<'_>> {
    let (symbol, price) = raw.split_once(',')?;
    Some(WireView { symbol, price })
}

fn main() {
    let raw = String::from("BTC-PERP,60000");
    let view = decode_view(&raw).unwrap();
    assert_eq!(view.symbol, "BTC-PERP");
    assert_eq!(view.price, "60000");
}
```

如果 event 要进入异步 channel，输入 buffer 可能被复用或释放，通常要在明确边界转换为 owned normalized event。让借用跨 task 和 `.await` 会提高复杂度；只有 profile 证明复制显著时才扩展零拷贝范围。

## 7.8 `Send`、`Sync` 是 Auto Trait

`Send` 表示所有权可以跨线程移动，`Sync` 表示共享引用可以跨线程。多数类型由字段自动推导，不应手写 unsafe impl，除非能严格证明内部同步。

trait 边界可以要求：

```text
trait EventSink: Send + Sync { ... }
```

但加约束前先问组件是否真的需要多线程共享。单写者 reducer 的状态无需为了“以后可能”而变成 `Sync`。

## 7.9 Adapter Trait 的原则

适合统一：

- 领域命令输入。
- normalized event 输出。
- capability 查询。
- 结构化错误类别。

不适合隐藏：

- sequence/checksum 算法。
- post-only/reduce-only/amend 语义。
- position mode 与 execution ID 作用域。
- funding、margin 和 liquidation 规则。

trait 提供稳定边界，capability 和 venue-specific 类型保留差异。漂亮接口不能以资产安全为代价。

## 7.10 测试替身

对 clock、event sink、persistence 和 transport 定义小 trait，可以注入 fake：

- fixed/advancing clock 测 freshness 和 timeout。
- memory event log 测 reducer action 顺序。
- scripted transport 产生 timeout/429/乱序响应。
- captured sink 断言告警和 risk-off action。

fake 应模拟契约，不要复制完整生产实现。否则测试替身和真实组件可能以同样方式出错。

## 7.11 本章练习

1. 为 `Clock` 实现 `FixedClock` 和手动推进的 `ReplayClock`。
2. 定义 `MarketDataDecoder`，使用关联 `Event/Error` 类型。
3. 分别用泛型和 `dyn Trait` 调用两种 fee model，解释选择场景。
4. 写一个借用 wire buffer 的 view，再在 normalized 边界转 owned。
5. 设计 venue capability，不用默认实现隐藏危险订单语义。

本章完成标准：能用小 trait 建立可替换边界，解释静态/动态分发，并知道借用何时必须转成 owned 数据。
