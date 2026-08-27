# 第 11 章 Tokio 与网络编程：连接实时市场

上一章建立并发、异步和背压原则，本章把它们放进网络连接：TCP、HTTP、WebSocket、Tokio task、timeout、heartbeat、重连和测试。示例不连接真实账户。

> **学习导航**　前置：第 10 章的 Future、channel、timeout 与取消语义｜目标：构建有监督、可重连、分层超时的离线网络任务｜预计：10–14 小时｜产出：scripted source、freshness 监控、重连 policy 和签名向量

> **章节边界：** 本章假定第 10 章的 owner、背压、取消和 shutdown policy 已经确定，只负责 transport 生命周期和 wire I/O。连接任务产生带证据的事件与退出原因，不拥有订单簿、策略或 OMS 权威状态。

## 11.1 从 TCP 到 WebSocket

常见交易所接口：

- REST/HTTP：metadata、snapshot、查询、部分交易命令。
- WebSocket：持续公开行情、私有订单/账户事件，也可能支持下单。
- FIX/专有 TCP：机构或低延迟接口，语义依 venue。

WebSocket 建立在 TCP 之上。TCP 保证字节有序可靠传输，但不保证应用消息新鲜、不保证服务端业务正常，也不会替你恢复订阅状态。TLS 提供传输加密与身份验证，仍需正确校验证书和主机名。

## 11.2 Tokio Runtime

Tokio runtime 调度 Future 并驱动非阻塞 I/O：

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

## 11.4 `select!` 管理多个事件源

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

`biased` 改变分支轮询优先级，要说明饥饿风险。被选中分支完成后，其他分支 Future 会被取消/drop，所以每个操作必须检查 cancel safety。

不要把完整“写订单 + 等 ack”作为一个随时可丢弃的 Future 而没有 durable 状态。timeout 后远端事实未知。

## 11.5 Timeout 分层

至少区分：

- DNS/connect timeout。
- TLS/WebSocket handshake timeout。
- subscribe/auth confirmation timeout。
- read idle/valid-event freshness timeout。
- HTTP request/response timeout。
- 订单业务确认期限。

单一 `request_timeout=5s` 无法表达这些风险。transport timeout 是本地等待边界，业务状态由协议事件和对账决定。

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

公开 metadata GET 通常可安全重试；增险订单不能只按 HTTP method 或网络错误机械重试。

## 11.6 Heartbeat 的三个层次

1. TCP/socket 仍连接。
2. WebSocket ping/pong 或 venue heartbeat 正常。
3. 目标 channel 持续收到可解码、sequence 连续的有效业务事件。

前两项正常，第三项仍可能 stale。例如代理保持连接，但 subscription 已丢；或者只收到系统消息，目标 instrument 没更新。

分别记录 last-byte、last-frame、last-valid-event 和 last-book-update。风险使用与策略输入对应的 freshness。

## 11.7 重连与退避

指数退避带 jitter：

```text
delay = min(max_delay, base * 2^attempt) * random_jitter
```

目的不是让单连接更快，而是避免同一进程/集群同步重试形成风暴。需要上限、失败升级和稳定运行后的 attempt reset。

重连成功只恢复 transport。之后还要重新认证、订阅、snapshot/delta 同步、私有状态对账和 trading approval。旧 book 默认 invalid。

## 11.8 HTTP Client 复用

HTTP client/TLS connection pool 应复用，避免每请求握手。配置：

- connect/request timeout。
- pool idle 生命周期。
- proxy/DNS 与证书策略。
- response body 大小上限。
- 并发 semaphore 和 rate-limit scheduler。
- request correlation 与 server rate-limit headers。

不要在 event loop 中无限并发 query。一次故障可能同时触发成百上千个 reconciliation 请求，必须按 venue budget 调度并保留紧急动作容量。

## 11.9 WebSocket 写路径

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

## 11.11 网络错误分类

- connect/DNS/TLS：通常可退避重连。
- protocol/schema：保留 payload，可能需要 adapter 升级。
- auth/permission：立即停止相关交易并告警。
- 429/ban warning：遵守 server hint，降低请求。
- disconnect：公开流 resync，私有流对账。
- write succeeded + response timeout：业务状态不确定。

错误分类映射行动，而不是所有错误统一 `retry()`。

## 11.12 网络测试

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
