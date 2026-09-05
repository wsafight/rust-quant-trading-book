# 第 7 章 共同接口、泛型与生命周期：让实现可以替换

交易系统需要替换时钟、行情来源、交易所适配器和事件输出，但不能把不同交易所的危险差异抹平。特征接口（`trait`）描述共同能力；泛型和运行时接口对象（trait object）决定怎样选择具体实现；生命周期描述引用可以使用多久。

> **学习导航**
>
> - 开始前：熟悉借用、枚举和 `Result` 的基本写法。
> - 这一章学会：为不同实现规定一套共同、精简的使用方式。
> - 大约需要：8–10 小时。
> - 做完留下：可替换时钟、解码器、费用模型和能力接口。

> **开章场景：同一套逻辑需要两种时钟**
>
> 实时运行时，程序要读取电脑当前时间；测试“订单等待 3 秒后超时”时，如果真的等 3 秒，几百个测试会非常慢，而且结果不稳定。你希望测试能够手动把时间从第 1 秒推进到第 4 秒，但不想为此重写订单逻辑。
>
> 特征接口（`trait`）可以规定“任何时钟都必须提供当前时间”，真实时钟和测试时钟各自实现它。泛型、特征对象和生命周期进一步决定具体实现何时选定、引用能保留多久。**本章要解决的是：怎样给不同实现规定共同边界，让核心逻辑可替换、可测试。**

> **第一次阅读建议**
>
> 先读 7.1 和 7.2，只解决“怎样让真实时钟和测试时钟使用同一个接口”。再读 7.3 和 7.4，理解具体实现是在编译时还是运行时选定。7.6 的生命周期先抓住“返回的引用不能比原数据活得更久”；7.7 至 7.9 涉及少复制和跨线程约束，可以第二次阅读。

## 7.1 特征接口规定一组共同能力

`trait` 先列出调用方可以依赖的方法，具体类型再分别实现。下面的调用方只需要“读取当前时间”，不需要知道时间来自系统、历史回放还是测试：

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

把系统时钟放在共同接口后，历史回放可以注入结果固定的时钟，测试也不必真的等待。未来的 `received_at` 不能被解释成负年龄，而应视为无效输入，由调用者转入“数据过旧或无效”的分支。接口应只表达调用者真正需要的最小能力；一个拥有几十个方法的 `TradingSystem` 接口往往说明组件依赖过多。

## 7.2 泛型怎样限制可用能力

`impl Trait` 表示参数可以是任何实现了该接口的类型。显式泛型适合多个参数共享同一组能力限制：

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

泛型通常在编译时确定具体实现，这叫静态分发。编译器可以内联并为具体类型生成代码，代价是编译时间、代码体积和更复杂的签名。它是否更快，仍要根据程序实际怎样调用这段代码来测量。

## 7.3 一个实现对应什么输出类型

当一个实现只对应一种输出类型时，可以把这种对应关系写成关联类型（associated type），比再增加一个泛型参数更清楚：

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

真实解码器的错误应使用结构化枚举；示例使用字符串只是为了缩短代码。

## 7.4 在程序运行时选择具体实现

如果程序启动后才根据配置选择实现，可以使用特征对象（`dyn Trait`）：

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

特征对象会在程序运行时通过一张方法表找到具体实现，这种方式称为动态分发。它比泛型多一次间接调用，并且只有满足特定规则的接口才能这样使用；编译器会指出不满足规则的方法。

配置加载、研究模型和低频插件通常无需担心这点成本。只有在每条行情都会调用的高频路径上，才值得通过基准测试比较泛型与动态分发，而不是预先假定其中一种一定更快。

## 7.5 默认方法不能掩盖交易所差异

默认方法适合真正通用、不会隐藏语义的行为。不要在通用交易所接口中，给“只减仓”（`reduce_only`）或“改单”（`amend`）提供一个“差不多”的默认实现，因为不同交易所的规则和资金风险并不相同。

扩展接口可以给外部类型增加局部能力，但团队需要控制数量，避免方法来源难追踪。

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

## 7.7 什么时候值得少做一次数据复制（进阶）

网络解析器可以不复制字符串，而是返回一个借用输入缓冲区的消息视图。这通常称为零拷贝解析：

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

如果事件要进入异步消息通道，原始缓冲区可能很快被复用或释放，通常要在这个边界转换成拥有自己数据的标准事件。让借用跨任务和 `.await` 会明显提高复杂度；只有性能分析证明复制是主要开销时，才值得扩大零拷贝范围。

## 7.8 数据能不能安全跨线程（进阶）

`Send` 表示一个值可以交给另一个线程，`Sync` 表示多个线程可以安全共享它的只读引用。编译器通常会根据字段自动判断；除非能严格证明内部同步，不要手写 `unsafe impl` 绕过检查。

trait 边界可以要求：

```text
trait EventSink: Send + Sync { ... }
```

但加约束前先问组件是否真的需要多线程共享。由单一任务更新的状态，无需为了“以后可能”而提前变成 `Sync`。

## 7.9 交易所适配接口应该统一什么

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

共同接口提供稳定边界，能力说明和交易所专用类型保留差异。接口看起来整齐，不能以隐藏资金风险为代价。

## 7.10 用可控实现代替外部依赖

对时钟、事件输出、持久化和网络传输定义小接口，就可以在测试中换成行为可控的测试实现（fake）：

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

## 7.12 回顾与下一章

特征接口应描述调用方真正依赖的能力，而不是复制某个具体实现的所有方法。泛型适合在编译时已经知道类型组合的场景；特征对象适合程序运行时才选择实现。先看边界是否清楚、是否方便测试，再讨论纳秒级差异。

生命周期只说明引用之间的有效范围。decoder 可以在当前调用内借用 buffer，但事件进入 channel 或持久化层时通常应转换为 owned value。`Send` 与 `Sync` 说明类型能否跨线程传递或共享，不说明业务状态允许多个任务共同修改。

下一章会把领域类型、实现和测试放入 package、crate 与 workspace。抽象边界将从语言接口上升为依赖方向、feature 组合和 CI 质量门槛。
