# 阶段检查点四：交易闭环与硬风控

这个检查点覆盖第 18 至 22 章。你需要让行情、adapter、OMS、策略和硬风控形成离线闭环，并证明乱序、重复、超时和重启不会绕过风险限制。

> **第一次使用建议**
>
> 先只演示一张订单从意图、风险检查、发送到成交入账的正常路径。确认每一步由哪个组件负责后，再一次只加入一种异常：先重复，再乱序，再超时，最后重启。这样出现错误时，可以知道是哪条状态规则被破坏。

## 为什么在这里暂停

单独正确的组件连接起来仍可能产生危险行为：book 失效后策略继续使用旧 snapshot，adapter timeout 被 OMS 当作 reject，重复 fill 被账本再次应用，或风险只看 position 而遗漏正在发送与撤销中的订单。

本检查点用离线 scripted venue 同时控制公开流、私有流和请求响应。这样可以确定性制造真实系统最关键的顺序，而不让公网、账户权限和交易所状态影响验收。

## 统一验收场景

从一笔正常双边报价开始，然后在同一事件日志中依次注入：

```text
valid book -> strategy intent -> hard risk allow -> send
-> fill before new ack -> duplicate fill
-> cancel request -> final fill -> late cancel ack
-> next send times out -> private stream disconnects
-> process restarts -> REST/recent fills reconcile -> approval gate
```

每条事件带 event ID、correlation/client ID、venue/instrument、event/receive time 和 schema/config version。最终输出订单、execution、position、cash、risk state 与 readiness checksum。

## 前置条件

- 已通过前三个检查点，book、产品计算与账务都有固定 fixture。
- 能区分 transport 结果、本地证据和远端业务事实。
- 真实账户不是验收条件；测试必须先在 scripted transport 或模拟交易所完成。

## 必做任务

1. 定义 venue capability 和版本化规则，不用一个“万能接口”隐藏 amend、reduce-only 或 ID 语义。
2. 使用稳定 client order ID，按 `persist intent -> send -> persist result` 执行增险操作。
3. OMS 采用纯 reducer，execution key 去重，吸收 fill-before-ack、cancel/fill race 和迟到终态事件。
4. 策略只能提交 intent；独立 hard risk 根据 fresh book、仓位、active/uncertain orders 和限额决定 allow/resize/reject。
5. 启动与重连先对账，只有 trading-readiness gate 通过后才允许增险。

## 推荐实施顺序

先固定领域事件与 OMS 转换表，只用纯 reducer 跑所有时序。第二步加入 execution ledger 和 hard risk，使每个中间状态都能计算 worst-case exposure。第三步连接 scripted adapter/action executor，最后加入 durable log、snapshot 与重启回放。

不要一开始实现真实 API。若纯事件序列尚不能稳定收敛，网络只会增加更多不可控变量。等离线检查点通过后，在线 contract test 也应作为额外证据，而不是替代 fixture。

建议为每个副作用保存崩溃矩阵：落盘前、落盘后发送前、写 socket 后结果前、收到结果后状态落盘前。每个位置都写清重启后可观察证据、允许的自动动作和需要对账的范围。

## 自动验收

至少覆盖以下序列：

```text
pending_new -> fill -> new_ack
open -> cancel_requested -> partial_fill -> cancel_ack
send -> timeout -> query finds open
send -> timeout -> unknown fill
duplicate execution
private disconnect -> fill -> restart -> reconcile
```

再注入 sequence gap、陈旧行情、429、writer queue 满和 hedge venue 断线。任何一项都必须得到确定的状态、审计事件和保守风险动作。重复整段事件流后，订单、持仓、现金和 PnL checksum 不变。

## 人工演示

用一条命令启动离线 demo：正常报价与成交后，依次注入 response timeout、duplicate fill 和重启。演示 uncertain order 如何进入 worst-case exposure、对账如何收敛、策略为何无法直接调用 gateway。

演示者应在任意暂停点回答：远端可能有哪些活动订单、已经确认哪些 execution、最坏 long/short 暴露是多少、当前是否允许增险，以及答案来自哪条事实。若只能等流程结束后看最终状态，说明中间风险仍不可观察。

## 评分量表

每项 0–2 分，满分 10 分；“订单收敛”或“风险独立性”为 0 时不能通过。

| 维度 | 0 分 | 1 分 | 2 分 |
| --- | --- | --- | --- |
| 协议证据 | 规则散落或无 fixture | 有 adapter 测试但版本/来源不全 | capability、metadata、raw fixture 可追溯 |
| 订单收敛 | 依赖理想响应顺序 | 处理部分乱序但重启不完整 | timeout、乱序、重复与重启均确定 |
| 风险独立性 | 策略可绕过限制 | 有 risk 模块但遗漏在途状态 | active/uncertain 与 freshness 全部计入 |
| 账务幂等 | 重复 fill 改变 PnL | 能去重但冲突/审计不足 | execution、订单、现金和仓位完整关联 |
| 恢复与证据 | 启动自动开放交易 | 能对账但 gate 含糊 | 分层 readiness 与显式审批可审计 |

建议达到 9 分以上，因为这一检查点已经涉及完整资金状态链；任何单一故障序列不确定都应先修复。

## 通过证据

- OMS 转换表、capability matrix 和风险决策表。
- 六类核心故障测试与重启前后 checksum。
- 审计记录能从 client ID 追到 intent、send attempt、venue event、position 和 PnL。

再保存一份重启对账报告：本地 snapshot/event offset、远端 open orders、recent fills、position/balance 差异、采取的修复 action、完成时间与审批人。离线演示可使用虚构审批身份，但字段不能省略。

## 未通过时怎样回补

| 观察到的问题 | 回到章节 | 回补动作 |
| --- | --- | --- |
| gap/stale 后仍产生 intent | 第 18 章 | 将 book validity/freshness 接入风险 gate |
| adapter 抹平 amend/ID/错误语义 | 第 19、20 章 | 重建 capability 与契约 fixture |
| timeout 直接变 reject 或自动重试 | 第 21 章 | 引入 uncertain 和查询对账 |
| fill-before-ack/迟到终态报非法 | 第 21 章 | 以事实单调增加重画转换表 |
| 风险只计算当前 position | 第 22 章 | 加入 active、pending、uncertain 最坏暴露 |
| kill 后由策略自动恢复 | 第 22、26 章 | 分离停止动作和恢复审批 |

若 timeout 被写成 `Rejected`，回到第 10、19、21 章；若 fixture 无法证明 adapter 规则，回到第 20 章；若策略配置能修改 hard limit，回到第 22 章。

通过后冻结完整事件日志与 checksum。第五部分会用同一套 book、OMS、risk 和 ledger reducer 做历史回放，确保研究路径不绕过刚刚验证的生产边界。
