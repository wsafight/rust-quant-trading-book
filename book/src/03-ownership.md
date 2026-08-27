# 第 3 章 所有权：让状态只有一个可信主人

Rust 的所有权经常被当成语法门槛。对交易系统而言，它更像一套架构约束：谁拥有订单簿，谁可以修改订单状态，配置在什么时候切换，异步任务退出后资源由谁回收。

> **学习导航**　前置：第 2 章的函数、String 与集合基础｜目标：理解 move、borrow、生命周期范围和状态 owner｜预计：7–9 小时｜产出：封装的 `Position`、组件所有权图和共享方案比较

## 3.1 值为什么会移动

`String` 拥有堆内存。把它赋给另一个变量时，所有权移动，原变量不再可用：

```rust
fn consume_symbol(symbol: String) -> usize {
    symbol.len()
}

fn main() {
    let symbol = String::from("BTC-USDT-SWAP");
    let length = consume_symbol(symbol);
    assert_eq!(length, 13);
    // symbol 已移动，不能再次使用。
}
```

移动避免了隐式深拷贝和双重释放。交易事件每秒可能出现数万次，隐式复制不仅影响性能，也会模糊谁负责数据生命周期。

小型、纯值类型适合实现 `Copy`：

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct PriceTicks(i64);

fn main() {
    let bid = PriceTicks(100);
    let copied = bid;
    assert_eq!(bid, copied);
}
```

不要因为借用检查器报错就给所有大对象加 `clone()`。先决定正确的所有者，再判断复制是否合理。

## 3.2 借用：读状态但不接管状态

函数只读订单时，接收引用：

```rust
#[derive(Debug)]
struct Order {
    id: String,
    filled_lots: i64,
    total_lots: i64,
}

fn remaining(order: &Order) -> i64 {
    order.total_lots - order.filled_lots
}

fn main() {
    let order = Order {
        id: "client-42".to_owned(),
        filled_lots: 3,
        total_lots: 10,
    };
    assert_eq!(remaining(&order), 7);
    assert_eq!(order.id, "client-42");
}
```

`&Order` 是共享借用，可以同时存在多个；`&mut Order` 是独占借用，在它有效时不能再读写同一个值。这个规则在编译期阻止“一个任务更新累计成交量，同时另一个任务做不一致快照”。

```rust
#[derive(Debug)]
struct Position(i64);

fn apply_fill(position: &mut Position, signed_lots: i64) {
    position.0 += signed_lots;
}

fn main() {
    let mut position = Position(0);
    apply_fill(&mut position, 5);
    apply_fill(&mut position, -2);
    assert_eq!(position.0, 3);
}
```

## 3.3 切片和 `&str`

接口优先借用调用者已有的数据：

```rust
fn is_perpetual(symbol: &str) -> bool {
    symbol.ends_with("-SWAP") || symbol.ends_with("PERP")
}

fn main() {
    let owned = String::from("BTC-USDT-SWAP");
    assert!(is_perpetual(&owned));
    assert!(is_perpetual("BTC-PERP"));
}
```

参数使用 `&str` 后，调用者可以传 `String` 的切片或字符串字面量，不必分配新对象。是否要把借用跨过异步边界，则要谨慎评估生命周期和 buffer 复用。

## 3.4 生命周期不是延长对象寿命

生命周期描述引用之间的关系，不负责让对象活得更久：

```rust
fn newer<'a>(left: &'a str, right: &'a str, choose_left: bool) -> &'a str {
    if choose_left { left } else { right }
}

fn main() {
    let a = String::from("snapshot");
    let b = String::from("delta");
    assert_eq!(newer(&a, &b, false), "delta");
}
```

解码网络 buffer 时可以暂时借用字段，实现少复制；但如果事件要进入队列并活得比输入 buffer 更久，就应在明确边界转成 owned 数据。为了“零拷贝”让长生命周期贯穿整个异步系统，往往会增加复杂度，收益必须由 profile 证明。

## 3.5 状态所有权决定并发架构

考虑两种设计：

```text
设计 A：多个任务 -> Arc<RwLock<Book>> -> 共同读写

设计 B：多个输入任务 -> bounded channel -> 单一 engine 拥有 Book
```

设计 A 看似直接，但状态转换被分散到多个锁区间，容易出现复合操作不原子、锁竞争和 replay 不确定。设计 B 让一个执行上下文串行吸收事件，订单簿只有一个可变所有者；其他组件通过消息读取快照或提交命令。

交易系统通常按 `venue + instrument` 分片使用 single-writer：

```rust
use std::collections::BTreeMap;

#[derive(Debug)]
enum BookEvent {
    Upsert { price: i64, qty: i64 },
    Delete { price: i64 },
}

#[derive(Default)]
struct BookSide {
    levels: BTreeMap<i64, i64>,
}

impl BookSide {
    fn apply(&mut self, event: BookEvent) {
        match event {
            BookEvent::Upsert { price, qty } if qty > 0 => {
                self.levels.insert(price, qty);
            }
            BookEvent::Upsert { price, .. } | BookEvent::Delete { price } => {
                self.levels.remove(&price);
            }
        }
    }
}

fn main() {
    let mut book = BookSide::default();
    book.apply(BookEvent::Upsert { price: 100, qty: 4 });
    book.apply(BookEvent::Delete { price: 100 });
    assert!(book.levels.is_empty());
}
```

`apply(&mut self, event)` 明确表示：事件值被消费，状态需要独占访问。以后把它放进单线程事件循环，不需要改变核心状态转换。

## 3.6 `Arc` 不是“自动线程安全”

`Arc<T>` 只让所有权计数可以跨线程共享。它不会让 `T` 获得安全的内部可变性。`Arc<Mutex<T>>` 可以共享修改，但锁的粒度、持锁时间、阻塞和中毒处理仍是设计责任。

共享不可变配置是 `Arc` 的好用途：

```rust
use std::sync::Arc;

#[derive(Debug)]
struct Limits {
    max_order_lots: i64,
}

fn main() {
    let limits = Arc::new(Limits { max_order_lots: 10 });
    let risk_view = Arc::clone(&limits);
    assert_eq!(risk_view.max_order_lots, 10);
}
```

配置更新可以构造一个全新的不可变 snapshot，再在事件边界切换版本。不要让许多任务逐字段修改共享配置，否则同一次风险决策可能读到混合版本。

## 3.7 资源获取即初始化

Rust 值离开作用域时运行 `Drop`。文件、socket、锁守卫和订阅句柄可以利用这一点释放资源。要注意：释放本地资源不等于撤销远端副作用。一个发送订单的 Future 被丢弃，不能据此推断交易所没有收到请求。

这一区分非常重要：

- 内存和文件句柄由 Rust 生命周期管理。
- 远端订单、资金和会话需要显式协议、幂等 ID、查询与对账。

## 3.8 常见反模式

- 为绕过编译错误到处 `clone()`，却不测分配和语义。
- 把整个系统塞进一个 `Arc<Mutex<State>>`，每个任务都能改任何状态。
- 返回指向临时解析 buffer 的引用。
- 在持锁期间执行网络、磁盘或耗时计算。
- 误以为 task drop/timeout 可以撤回已经发出的外部请求。

## 3.9 从“共享大状态”到单一所有者

假设第一版系统把所有内容放进一个共享对象：

```text
Arc<RwLock<SystemState>>
  books, orders, positions, config, metrics
```

行情任务拿写锁更新 book，策略拿读锁计算报价，私有流拿写锁更新订单和仓位，监控任务拿读锁导出全部状态。功能很快能跑起来，但随着负载增加会出现几个问题：

- 策略为了计算一次决策连续获取多个读锁，读到的字段不一定来自同一版本。
- 指标导出或序列化持锁时间较长，阻塞行情和成交处理。
- 某个异步任务持锁跨过 `.await`，网络抖动把整个系统卡住。
- replay 中任务调度不同，最终决策序列也不同。
- 很难回答哪段代码有权修改 position 或 trading enable。

重构时先按不变量划分状态，而不是按技术组件划分线程：

```text
Market shard owner:
  book + sequence + freshness

Execution owner:
  orders + executions + position ledger

Risk owner/view:
  versioned limits + latest authoritative exposure snapshot

Observers:
  receive immutable snapshots/events, never mutate trading state
```

行情 owner 串行处理 delta，并发布带 book version 的紧凑快照。策略用一个快照完成计算，输出带输入版本的 intent。execution owner 串行处理订单事件。跨分片风控可能接受稍旧的 snapshot，但必须定义最大 age，并在超过时拒绝增险。

这种设计没有消灭并发，而是把并发放在状态边界之间。所有权帮助你证明单个 reducer 内的顺序，消息和版本则帮助你管理跨边界的一致性。

## 3.10 移动、借用、复制与共享的决策表

设计接口时可以按下面顺序判断：

| 场景 | 首选 | 原因 |
| --- | --- | --- |
| 函数只在调用期间读取 | `&T` / `&str` / slice | 无所有权转移和分配 |
| 函数要修改调用者状态 | `&mut T` | 独占修改权明确 |
| 事件进入队列并独立存活 | owned `T` | 生命周期越过当前调用 |
| 小型标量领域值 | `Copy` newtype | 复制便宜且语义清楚 |
| 大型不可变配置跨线程 | `Arc<T>` | 共享所有权而不共享修改 |
| 状态只有一个 reducer 修改 | move through channel | 顺序、回放和不变量简单 |
| 少量真正共享可变状态 | `Mutex<T>` 等 | 显式同步，限制临界区 |

`Cow<'a, T>` 可以让接口在大多数输入时借用、必要时才拥有，但不要为了展示技巧而引入。只有在 profile 表明复制显著、且生命周期仍易理解时才值得使用。

## 3.11 所有权与快照一致性

不可变 snapshot 是交易系统中非常实用的模式。配置加载器先解析和校验完整新版本，随后在事件边界一次替换：

```rust
use std::sync::Arc;

#[derive(Debug)]
struct Config {
    version: u64,
    max_order_lots: i64,
    max_position_lots: i64,
}

fn valid(config: &Config) -> bool {
    config.max_order_lots > 0
        && config.max_position_lots >= config.max_order_lots
}

fn main() {
    let current = Arc::new(Config {
        version: 1,
        max_order_lots: 5,
        max_position_lots: 20,
    });
    assert!(valid(&current));
    assert_eq!(current.version, 1);

    let candidate = Arc::new(Config {
        version: 2,
        max_order_lots: 10,
        max_position_lots: 30,
    });
    assert!(valid(&candidate));
    let current = candidate;
    assert_eq!(current.version, 2);
}
```

真实系统还需审计谁发起变更、旧新 diff、生效时间和回滚。关键点是永远不发布“只更新了一半”的配置。每个 risk decision 记录 config version，事后才能还原当时规则。

## 3.12 本章练习

1. 实现 `Position`，只允许通过 `apply_fill` 修改，并为 long、short、减仓和反向持仓写测试。
2. 把一个使用 `String` 参数的只读函数改成 `&str`，解释减少了哪次所有权转移。
3. 画出你的订单簿、OMS、持仓和配置分别由哪个组件拥有；任何“大家都能改”的状态都要重新设计。
4. 比较 `Arc<RwLock<Book>>` 与 single-writer 的错误面，不只比较吞吐。

本章完成标准：遇到借用错误时，能从数据所有权和生命周期解释原因，而不是依赖随机添加 `clone`、`Arc` 或生命周期标注。
