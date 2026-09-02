# 阶段检查点四：交易闭环与硬风控

这个检查点覆盖第 18 至 22 章。你需要让行情、adapter、OMS、策略和硬风控形成离线闭环，并证明乱序、重复、超时和重启不会绕过风险限制。

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

## 通过证据

- OMS 转换表、capability matrix 和风险决策表。
- 六类核心故障测试与重启前后 checksum。
- 审计记录能从 client ID 追到 intent、send attempt、venue event、position 和 PnL。

若 timeout 被写成 `Rejected`，回到第 10、19、21 章；若 fixture 无法证明 adapter 规则，回到第 20 章；若策略配置能修改 hard limit，回到第 22 章。
