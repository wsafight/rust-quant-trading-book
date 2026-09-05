# 第 11 章 Tokio 与网络编程：连接实时市场

上一章建立并发、异步和背压原则，本章把它们放进网络连接：怎样建立连接、交换消息、判断数据停止、超时、重连和测试。示例不连接真实账户。

> **学习导航**
>
> - 开始前：知道 Future、消息通道、超时和取消分别表示什么。
> - 这一章学会：管理连接、心跳、超时、重连和安全关闭。
> - 大约需要：10–14 小时。
> - 做完留下：可控消息源、新鲜度监控、重连规则和签名测试样本。

> **开章场景：连接还在，行情却停了**
>
> 凌晨 2 点，程序显示网络连接正常，心跳消息也在继续，但 BTC 行情已经 12 秒没有更新。此时策略若只看“连接未断”，就可能拿旧价格继续下单。重连也不等于恢复：程序还要重新订阅，并取得一份能与后续更新接上的完整状态。
>
> Tokio 是 Rust 中常用的异步运行环境，可以同时管理连接、读写、计时和关闭信号。**本章要解决的是：怎样区分连接存活、数据新鲜和业务状态可用，并把超时、重连与安全关闭写成明确流程。**

> **第一次阅读建议**
>
> 先读 11.1、11.3、11.5 至 11.7，把一次连接看成“建立连接、确认订阅、持续收消息、发现异常、重新同步”的完整过程。再读 11.9 和 11.11，理解为什么订单写入要有统一出口、错误要按行动分类。`select!`、签名细节和网络故障样本可在实际写代码时细读。

> **章节边界：** 本章假定第 10 章已经明确状态负责人、背压、取消和关闭规则，只负责网络连接与原始消息收发。连接任务报告事件和退出原因，不负责修改订单簿、策略或 OMS 的权威状态。

## 11.1 交易系统常见的三种网络接口

接口是两个系统约定的沟通方式。交易所常见三类：

- REST/HTTP：适合一次请求、一次响应，例如查询产品规则、快照和账户状态。
- WebSocket：建立长连接后持续收发消息，常用于公开行情和私有订单事件。
- FIX 或专有 TCP：面向机构或低延迟场景的协议，具体含义由交易所规定。

WebSocket 建立在 TCP 连接之上。TCP 会按顺序可靠传输字节，但不保证业务消息仍然新鲜，也不保证服务端功能正常。TLS 为传输加密并验证服务器身份，但程序仍需正确检查证书和主机名。

## 11.2 Tokio 怎样安排异步任务

Tokio 是 Rust 常用的异步运行库。它的 runtime（运行时）负责安排 Future，并在网络可以继续读写时唤醒相应任务：

Tokio 的 runtime、关闭和测试细节可从[附录 E](appendix-e-references.md)中的官方入口继续核对；书中 `rust,ignore` 异步片段在 `book/code/tests/tokio_examples.rs` 有可编译版本。

```rust,ignore
#[tokio::main]
async fn main() {
    let left = tokio::spawn(async { 20_u64 });
    let right = tokio::spawn(async { 22_u64 });
    let answer = left.await.unwrap() + right.await.unwrap();
    assert_eq!(answer, 42);
}
```

`spawn` 要求 Future 通常为 `'static + Send`，因为 task 可能比当前栈活得久并被调度到其他 worker。不要为了满足它就泄漏内存或全局化状态；把 task 需要的 owned handle 明确移动进去。

网络 I/O 适合 async；CPU 密集解析/压缩若持续占用 worker，应分批、优化或使用专门线程/`spawn_blocking`。`spawn_blocking` 也不是无限资源，要控制并发。

## 11.3 一个连接任务的职责

```text
connect with timeout
-> TLS/WebSocket handshake
-> authenticate if private
-> subscribe
-> wait for subscription confirmation
-> read messages + heartbeat + shutdown
-> report exit reason to supervisor
```

连接任务不应同时拥有 order book 和策略。它负责 transport 生命周期，把 wire message 送进有界 decoder/synchronizer 路径。

## 11.4 同时等待消息、心跳和关闭信号

```rust,ignore
loop {
    tokio::select! {
        biased;

        _ = shutdown.cancelled() => break,
        _ = heartbeat.tick() => send_ping().await?,
        message = socket.next() => {
            match message {
                Some(Ok(frame)) => handle_frame(frame).await?,
                Some(Err(error)) => return Err(error.into()),
                None => return Err(ConnectionError::Closed),
            }
        }
    }
}
```

`biased` 会改变分支轮询优先级，要说明低优先级分支是否可能长期得不到执行。一个分支完成后，其他尚未完成的操作通常会被取消，因此每个操作都要检查“中途停止后能否安全恢复”。

不要把完整的“写订单 + 等待确认”当成一个可以随时丢弃的异步操作，却不留下持久记录。等待超时后，交易所是否已经接受订单仍然未知。

## 11.5 不同等待需要不同超时

至少区分：

- DNS/connect timeout。
- TLS/WebSocket handshake timeout。
- subscribe/auth confirmation timeout。
- read idle/valid-event freshness timeout。
- HTTP request/response timeout。
- 订单业务确认期限。

单一 `request_timeout=5s` 无法表达这些风险。网络超时只说明本地等待结束，订单等业务状态仍要由后续消息和对账决定。

```rust,ignore
let response = tokio::time::timeout(
    std::time::Duration::from_secs(2),
    client.send(request),
).await;

match response {
    Ok(Ok(value)) => handle_response(value),
    Ok(Err(error)) => handle_transport_error(error),
    Err(_) => mark_request_uncertain_and_reconcile(),
}
```

查询公开产品说明的 GET 请求通常可以安全重试；可能增加仓位的订单，不能只根据 HTTP 方法或网络错误机械重发。

## 11.6 心跳正常不等于行情正常

1. TCP/socket 仍连接。
2. WebSocket ping/pong 或 venue heartbeat 正常。
3. 目标 channel 持续收到可解码、sequence 连续的有效业务事件。

前两项正常，第三项仍可能 stale。例如代理保持连接，但 subscription 已丢；或者只收到系统消息，目标 instrument 没更新。

分别记录 last-byte、last-frame、last-valid-event 和 last-book-update。风险使用与策略输入对应的 freshness。

## 11.7 重连不能立即恢复交易

指数退避带 jitter：

```text
delay = min(max_delay, base * 2^attempt) * random_jitter
```

目的不是让单连接更快，而是避免同一进程/集群同步重试形成风暴。需要上限、失败升级和稳定运行后的 attempt reset。

重连成功只恢复 transport。之后还要重新认证、订阅、snapshot/delta 同步、私有状态对账和 trading approval。旧 book 默认 invalid。

## 11.8 复用 HTTP 客户端

HTTP client/TLS connection pool 应复用，避免每请求握手。配置：

- connect/request timeout。
- pool idle 生命周期。
- proxy/DNS 与证书策略。
- response body 大小上限。
- 并发 semaphore 和 rate-limit scheduler。
- request correlation 与 server rate-limit headers。

不要在 event loop 中无限并发 query。一次故障可能同时触发成百上千个 reconciliation 请求，必须按 venue budget 调度并保留紧急动作容量。

## 11.9 所有网络写入经过同一出口

多个组件不应直接共享一个 socket writer。使用单一 writer task 和有界命令队列，定义优先级：

```text
highest: emergency cancel / session keepalive
high:    risk-reducing command
normal:  new/amend strategy command
low:     nonessential query/subscription refresh
```

优先级不能破坏 venue sequence 或协议要求。writer 在真正写 socket 前记录 send-attempt time，并把结果转换成 domain event。

## 11.10 认证和签名边界

签名输入通常包含 timestamp、method、path、query/body 和 secret。实现要：

- 使用原始 byte/规范化规则，不依赖 map 随机顺序。
- 明确 timestamp 单位与 receive window。
- secret 使用受控容器，避免 Debug/日志。
- 测试使用官方固定向量，不使用真实 key。
- 时钟偏移异常时停止交易，而不是无限重试 auth。

不要在 shell history 打印 secret，也不要把完整签名请求写普通日志。

## 11.11 错误分类决定下一步行动

- connect/DNS/TLS：通常可退避重连。
- protocol/schema：保留 payload，可能需要 adapter 升级。
- auth/permission：立即停止相关交易并告警。
- 429/ban warning：遵守 server hint，降低请求。
- disconnect：公开流 resync，私有流对账。
- write succeeded + response timeout：业务状态不确定。

错误分类映射行动，而不是所有错误统一 `retry()`。

## 11.12 用可控故障测试网络代码

离线 scripted server/transport 可以产生：

- fragmented frame、大/空消息、invalid UTF-8/binary。
- ping 正常但业务停止。
- 订阅 ack 丢失或延迟。
- 消息 burst 超过 consumer。
- disconnect/reconnect 和重复消息。
- HTTP 429、5xx、timeout、响应损坏。
- 写成功后不返回订单响应。

在线 contract test 单独运行，使用最小权限和明确环境，不作为核心 CI 唯一证据。

## 11.13 本章练习

1. 用 Tokio 构建本地 scripted message source，不访问交易所。
2. 分别监控 last-frame 和 last-valid-event，模拟前者正常后者 stale。
3. 实现带 jitter 的 reconnect policy，并使用 fake clock 测试。
4. 设计 writer priority 和满载行为，保证风险动作不会被普通 query 饿死。
5. 写一个固定签名 test vector，secret 不出现在 Debug 输出。

本章完成标准：能设计受监督、有界、可取消和可重连的网络任务，并明确 timeout 与远端业务状态的差别。

## 11.14 回顾与下一章

一个可靠连接任务有明确生命周期：连接、握手、认证、订阅确认、持续读取、报告退出原因，再由 supervisor 决定退避与重连。socket 活着、ping/pong 正常和业务事件新鲜是三种不同健康状态，不能用一个 `connected` 布尔值代替。

网络错误应按下一步行动分类。公开幂等查询也许可以退避重试，认证错误应停止相关能力，schema 错误应保留 raw payload，而订单写入后的 timeout 必须标记为未知并对账。重连只恢复 transport；行情仍需 resync，私有状态仍需 reconcile，交易恢复仍需 gate。

下一章开始测量这条路径。只有先固定消息语义、正确性 checksum、队列和 workload，p99 或吞吐才具有可比较含义；否则 benchmark 很可能只证明省略了必要工作。
