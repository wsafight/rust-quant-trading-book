# 第 10 章 并发、异步与背压

实时系统不是“把所有函数都加上 `async`”。它需要明确状态由谁负责、消息能否丢失、队列最多放多少、处理不过来时做什么，以及取消本地等待后远端操作是否仍可能发生。

> **学习导航**
>
> - 开始前：理解状态负责人、共同接口和订单簿有效性。
> - 这一章学会：让多个工作同时进行，并在处理不过来时有规则地减速或停止。
> - 大约需要：10–12 小时。
> - 做完留下：有容量上限的处理管线、满载规则和关闭时间线。

> **开章场景：行情来得比程序处理得快**
>
> 平时每秒到达 5,000 条行情，程序能够及时处理；剧烈波动时突然变成每秒 50,000 条，而订单簿每秒只能处理 30,000 条。若消息无限排队，几分钟后策略读到的虽然是完整数据，却已经是过时的市场。若直接丢消息，订单簿又会失去连续性。
>
> 并发让不同工作同时推进，异步让任务等待网络时不占住执行线程，背压则规定下游处理不过来时上游怎么办。**本章要解决的是：怎样分配状态和任务，并在系统满载时明确选择等待、拒绝、合并还是重新同步。**

> **第一次阅读建议**
>
> 先读 10.1、10.3、10.4 和 10.6，理解“谁处理状态、队列为什么不能无限长、超时为什么不等于失败”。再读 10.8 和 10.13，看系统怎样安全关闭以及过载如何变成交易事故。`Send`、`Sync`、原子操作和任务树属于实现细节，第一次阅读知道它们解决什么问题即可。

> **章节边界：** 本章先不讨论具体网络协议，只研究并发本身：状态归谁、消息能否丢、容量怎样估算、取消后怎样收尾。第 11 章再把这些规则用于 TCP、HTTP、WebSocket、心跳与重连。

## 10.1 线程、任务与并发

**并发**表示多个工作在同一段时间内交替向前推进，不一定真的在同一时刻运行。**并行**才强调多个 CPU 核心同时计算。

操作系统线程由内核安排运行，适合持续计算或需要明确隔离的工作。异步任务（task）更轻量，由异步运行时（runtime）安排，适合大量时间都在等待网络的连接。等待中的工作用 Future 表示，可以先把它理解成“一项尚未完成、以后还会继续推进的操作”。

Tokio task 不是独占线程。若一个任务长时间阻塞在普通文件读写、压缩或大计算上，同一工作线程上的其他异步任务也会被拖延。

常见分层：

```text
网络任务 -> 消息解析 -> 有界队列 -> 单写者处理器
                                -> 订单簿/信号/风控/OMS
私有消息 + 查询接口 ------------> OMS/对账
```

![有界行情数据流水线](assets/market-data-pipeline.svg)

*图 10-1：有界队列不仅限制内存，也让消息年龄和失效动作成为显式契约。*

## 10.2 数据怎样在线程间传递（进阶）

- `T: Send` 表示 `T` 的所有权可以安全地移动到另一线程。
- `T: Sync` 表示 `&T` 可以安全地在线程间共享。
- `Arc<T>` 提供线程安全引用计数，但 `T` 仍需满足相应并发约束。

优先通过消息传递把事件送给状态所有者。只有确实需要共享访问时，才选择 `Mutex`、`RwLock` 或 atomic，并写明同步不变量。

## 10.3 有界队列是风险控制

当下游处理速度跟不上上游时，上游必须减速、合并数据或停止，这种反馈叫**背压**（backpressure）。无界队列不会消除过载，只会把它变成不断增长的内存和越来越旧的数据。有容量上限的队列会迫使系统提前定义满载行为。

标准库的同步通道可以演示背压：

```rust
use std::sync::mpsc::sync_channel;
use std::thread;

fn main() {
    let (tx, rx) = sync_channel::<u64>(2);
    let producer = thread::spawn(move || {
        for sequence in 1..=3 {
            tx.send(sequence).expect("consumer is alive");
        }
    });

    let collected: Vec<_> = rx.iter().take(3).collect();
    producer.join().expect("producer panicked");
    assert_eq!(collected, vec![1, 2, 3]);
}
```

容量不应来自随手写的常数。粗略估计需要：峰值输入速率、处理速率、允许 burst 持续时间、每条消息大小和最大可接受 age。即使容量合理，持续过载仍必须降级。

## 10.4 不同消息有不同过载策略

| 对象 | 队列满时的候选动作 | 不能默认做什么 |
| --- | --- | --- |
| 订单簿增量 | 标记 book invalid，触发重同步 | 任意丢一个后继续发布 |
| 可替代特征 | 合并成最新版本，记录丢弃数 | 无限排队旧信号 |
| 订单/成交 | 可靠处理或 risk-off | 丢弃、覆盖、任意重排 |
| debug 日志 | 采样、异步写、统计丢弃 | 阻塞交易循环 |
| 风控告警 | 独立高优先级通道 | 静默丢失 |

“drop oldest”不是通用答案。行情 delta 与最终状态 snapshot 的可替代性完全不同。

## 10.5 异步操作可以先暂停、以后继续

调用 `async fn` 会先创建一个代表“尚未完成操作”的值，Rust 称它为 `Future`。异步运行时轮询它时，操作才向前执行；遇到 `.await` 尚未完成，任务会暂时让出执行机会。`Future` 会记住让出前的局部状态，等条件满足后继续。

初次阅读只需理解“创建、等待、继续、取消”这四步。`Pin` 用于保证某些 Future 创建后不再移动，属于更底层的实现约束，可以在编写自定义 Future 时再深入。

一个典型 Tokio 结构如下，代码需要项目依赖 `tokio`：

```rust,ignore
use tokio::sync::mpsc;

#[derive(Debug)]
struct MarketEvent {
    sequence: u64,
}

#[tokio::main]
async fn main() {
    let (tx, mut rx) = mpsc::channel::<MarketEvent>(1024);

    let producer = tokio::spawn(async move {
        tx.send(MarketEvent { sequence: 1 }).await?;
        Ok::<_, mpsc::error::SendError<MarketEvent>>(())
    });

    while let Some(event) = rx.recv().await {
        println!("{}", event.sequence);
    }

    producer.await.unwrap().unwrap();
}
```

生产代码不能用示例里的 `unwrap()` 处理 task panic、channel 关闭或连接失败，需要把关闭原因映射到健康状态和风险动作。

## 10.6 等待超时不等于远端失败

下单过程可能发生：

```text
本地发送 -> 交易所接受并挂单 -> 响应在网络中丢失 -> 本地 timeout
```

此时本地不能标记 `Rejected`，也不能用新 client ID 盲目重发。正确动作是：

1. 发送前持久化 intent 与稳定唯一的 client order ID。
2. timeout 后标记 `Uncertain`。
3. 将潜在订单计入 worst-case exposure。
4. 通过 client ID、open orders、recent fills 对账。
5. 超过不确定状态时限则停止增险并升级。

Rust 的取消安全只描述 Future 被停止时本地状态是否可安全重试，不会撤销远端副作用。

## 10.7 同时等待多个事件时怎样取消

在 `select!` 中，一个分支完成后，其他分支 Future 通常被 drop。对 socket read，重新调用可能安全；对“发送订单并等待响应”的组合操作，drop 可能留下未知远端状态。

设计时把外部副作用拆成可审计阶段：

```text
IntentCreated(durable)
  -> SendAttempted
  -> Acked | Rejected | Uncertain
```

状态转换和网络动作要分开。纯状态转换函数（reducer）只根据“旧状态 + 新事件”决定下一状态和待执行动作；执行器负责访问网络，再把结果变成新事件。这样，同一批事件可以重复回放，也更容易注入故障测试。

## 10.8 怎样按顺序安全关闭系统

关闭交易系统不是立刻退出进程：

1. 禁止产生新的增险意图。
2. 使策略进入 risk-off，并按能力尝试撤活动订单。
3. 继续处理私有事件和 fill，直到订单状态确认或进入人工处置。
4. 对账订单、持仓和余额。
5. 刷新关键审计记录，再关闭连接和进程。

撤单请求发出不代表订单已撤。shutdown 超时后也要留下明确的未知状态与接管步骤。

## 10.9 原子操作的边界（进阶）

原子操作（atomic）适合简单计数、标志和经过严格证明的无锁协议。初次阅读先记住：它只能保证某些单次读写的并发规则，不能自动让一组复杂订单字段保持一致。

`Acquire/Release`、线性化点、ABA 和无锁内存回收属于并发编程进阶内容。复杂订单状态通常先使用单写者或锁；只有测量证明它们成为瓶颈，而且团队能维护完整正确性证明时，再考虑无锁实现。

## 10.10 并发测试

至少做三类实验：

- producer 以 consumer 两倍速率运行，比较 unbounded、bounded block 和 coalesce 的内存、age 与正确性。
- 在发送、落盘和状态更新之间随机取消，验证不会出现无本地记录的潜在订单。
- 正常、日志暴增、CPU 干扰和队列积压下运行相同负载，观察 p99.9 与 risk-off 是否及时。

小型并发协议可以用模型测试穷举交错；外部系统则用确定性事件序列和故障注入验证。

## 10.11 队列容量怎样推导

假设正常行情速率是每秒 20,000 条，极端 burst 达到每秒 80,000 条并持续 250 ms；consumer 稳定处理能力是每秒 50,000 条。burst 期间净积压：

```text
(80,000 - 50,000) events/s * 0.25 s = 7,500 events
```

如果每个 owned event 连同分配平均占 160 bytes，仅净积压约 1.2 MB。考虑调度抖动和测量误差后，容量可能取 10,000 或 16,384，但这只是内存约束的一部分。

更关键的是 age。burst 结束时，7,500 条积压按每秒 50,000 条处理，需要约 150 ms 才能清空。如果策略 horizon 只有 100 ms，即使队列没有满，数据已经失去交易价值。系统应监控最老消息 age，并在硬阈值前 resize/risk-off，而不只是看 `len/capacity`。

如果输入长期为 60,000/s 而 consumer 只有 50,000/s，任何有限容量最终都会满。此时答案不是继续增大 channel，而是提高服务率、减少输入、对可替代数据 coalesce，或停止依赖该链路交易。

## 10.12 谁负责启动和关闭每个任务

随意 `spawn` 的后台任务很容易变成孤儿：父组件重连后旧 heartbeat 仍在运行，shutdown 时 recorder 尚未 flush，错误只打印日志而没有传回 supervisor。

把任务组织成生命周期树：

```text
Application supervisor
  Venue supervisor
    Public connection task
      read loop
      heartbeat loop
    Private connection task
    Reconciliation task
  Engine task
  Persistence task
  Metrics/export task
```

父节点负责：启动子任务、接收致命错误、发出 cancellation、等待 join、汇总未完成状态。任何 task 的退出都应该区分 expected shutdown、retryable disconnect、auth failure、invariant violation 和 panic。

取消信号之后仍要等待资源收敛。一个实用顺序是：关闭新 intent 输入，等待 engine 处理已接收事件，发出撤单/对账 action，刷新持久化，再关闭 recorder 和连接。为每个阶段设置期限；超时不等于成功，而是升级为显式未完成状态。

## 10.13 一次背压事故的因果链

考虑这样的事故：debug 日志临时提高到每条行情一条，异步日志 channel 无界。开始时服务正常，十分钟后内存上升，allocator 和内核回收消耗 CPU，market-data queue age 变大，策略使用旧 book，撤单决策也延迟，最终出现一批不利成交。

如果只看 CPU，可能误判为解析性能回退。完整因果证据应该包含：

```text
log producer rate > sink rate
-> log queue bytes/age 上升
-> allocation 与 RSS 上升
-> scheduler/allocator 抖动
-> engine queue residence p99.9 上升
-> quote age 与 negative markout 上升
```

永久修复不是“以后不要开 debug”，而是：日志 channel 有界、按 reason/venue 采样、记录 dropped log count、禁止高频路径同步格式化大 payload，并让 queue age 超限触发交易降级。演练时重新制造 sink 变慢，验证风险动作先于内存失控。

## 10.14 本章练习

1. 用 bounded channel 构建 producer/consumer，记录 queue depth 和 residence time。
2. 分别为 order book delta、signal snapshot、fill 和日志写出满载策略。
3. 画出一次下单 timeout 的事件时间线，标出每个时点的本地事实和远端未知。
4. 为服务定义 shutdown 超时后的人工接管信息。

本章完成标准：能解释每条 channel 的容量与满载行为，能区分 task 取消和远端操作撤销，并能在过载时优先限制资金风险。

## 10.15 回顾与下一章

并发设计首先是所有权和过载设计。single-writer 让 reducer 保持顺序，有界 channel 把最大积压显式化，消息分类决定满载时阻塞、合并、降级还是断开重同步。容量只是其中一个参数；queue age、处理速率和风险阈值共同决定系统何时已经不能安全继续。

Future 被 drop 只停止本地继续等待，不会撤回已经写入 socket 的请求。正常关闭也不是同时广播退出：应先禁止增险，再处理撤单与成交，刷新持久状态，最后停止观察能力。任务树必须说明谁监督、谁触发关闭、谁等待完成以及超时后交给谁处理。

下一章把这些规则放进 TCP、HTTP 与 WebSocket 生命周期。网络层会引入 heartbeat、认证、重连和分层 timeout，但仍必须服从本章已经确定的 owner、背压和取消语义。
