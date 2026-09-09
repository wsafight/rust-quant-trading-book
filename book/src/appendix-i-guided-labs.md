# 附录 I 六个带反馈实验

本附录为六个部分各提供一个完整实验。它们与阶段检查点不同：检查点判断能否通过，带反馈实验则帮助读者在卡住时逐层获得提示。

建议按下面顺序使用：

1. 只看背景、给定条件和任务；
2. 运行自己的方案并记录失败；
3. 查看“预期观察”，判断是规格、实现还是验证问题；
4. 仍无法推进时看一级提示；
5. 再失败时看二级提示；
6. 最后阅读参考设计并比较差异，不复制后直接宣称完成。

## I.1 第一部分：从裸数值到报价资格

### 背景

给定产品 tick size、最高买价、最低卖价、当前仓位和候选买单，判断订单应允许、缩量还是拒绝。

### 给定条件

- 输入价格来自十进制字符串；
- 数量必须为正；
- locked/crossed book 不允许增险；
- 买单成交后的 long position 不能超过限制；
- 任何算术溢出都应返回错误。

### 起始接口或伪代码

```text
parse_price(text, tick_size) -> PriceTicks or InputError
check_quote(top, position, active_orders, intent, limits)
    -> Allow / Resize / Reject
```

### 分步任务

1. 先写输入表和预期决定，不写实现。
2. 定义价格、数量、仓位和决定类型。
3. 实现严格 decimal-to-ticks。
4. 实现 spread 与最坏仓位计算。
5. 让 binary 只能通过 library API 得到决定。

### 预期观察

- `100.10` 在 tick size `0.05` 下是整数 ticks；
- 超出精度的输入不能静默舍入；
- ask 小于 bid 时拒绝增险；
- 到达仓位上限可以缩量，超过可表示范围必须失败。

### 常见失败

- 用 `0` 表示缺失盘口；
- 所有值都是 `i64`，价格和数量可交换；
- `abs()` 或加法在极值溢出；
- binary 直接修改公开字段绕过校验。

### 一级提示

先把“解析失败”“盘口无效”“风险拒绝”分成不同结果。风险拒绝是有效业务决定，不一定是程序错误。

### 二级提示

让单位类型字段私有；构造时建立局部不变量；跨字段关系在纯函数中检查；所有加减乘使用 checked arithmetic。

### 参考设计

```text
raw decimal --parser--> PriceTicks / QtyLots
top of book --validate--> TradableTop
position + active exposure + intent --risk check--> Allow / Resize / Reject
```

解析器不决定风险，风险函数不读取文件，binary 不直接构造非法领域值。

### 设计复盘

这套分层让格式错误、市场状态和风险决定分别由最了解该规则的边界处理。把所有失败压成 `false` 会让调用方无法决定是修输入、停止报价还是缩量。

### 扩展变体

加入卖单、short limit 和两个 venue 的同名订单 ID，验证方向与身份作用域。

## I.2 第二部分：有界、会失效的行情管线

### 背景

一个 producer 按顺序产生 snapshot 和 delta，consumer 维护订单簿。正常速率为每秒 20,000 条，短时 burst 为每秒 80,000 条。

### 给定条件

- delta 不能任意丢弃；
- gap 后旧 book 不再 tradable；
- heartbeat 可以正常而业务数据 stale；
- 关闭必须等待关键状态落盘或明确报告未完成项。

### 起始接口或伪代码

```text
source -> bounded raw queue -> decode -> bounded event queue -> book owner
supervisor -> start / observe / cancel / join
```

### 分步任务

1. 画出 task、channel 和状态 owner。
2. 为每条 channel 写容量依据与满载动作。
3. 使用可控 source 产生正常、burst、gap 和 stale。
4. 分别记录 queue depth、residence time 和 book age。
5. 在等待消息、处理消息和重同步时触发关闭。

### 预期观察

- 有限 burst 可以被容量吸收，持续超载最终必须降级；
- 删除 delta 后无法继续得到 tradable book；
- last-frame 更新不代表 last-valid-event 更新；
- 关闭结果列出已完成和未完成职责。

### 常见失败

- 使用无界 channel；
- 队列满时 drop oldest delta；
- 只测吞吐，不测消息年龄；
- task 被取消就假设远端副作用也取消。

### 一级提示

先把消息分成可替代 snapshot、不可丢 delta、不可丢 execution 和可降级日志，不能共享一个满载策略。

### 二级提示

让订单簿由单一任务拥有；对外只发布完整快照；gap 将同步状态转成 Invalid；supervisor 负责启动、取消、join 和退出原因。

### 参考设计

```text
scripted source -> bounded raw queue -> decoder -> bounded event queue
-> single book owner -> immutable snapshot consumers
                         ^
                    supervisor/readiness
```

### 设计复盘

容量、消息语义和状态有效性必须一起设计。队列本身不会解决持续过载；当连续性或新鲜度无法保证时，安全结果是撤销可交易资格。

### 扩展变体

保持 ping 正常但停止业务消息，比较 connection health、protocol health 和 trading readiness。

## I.3 第三部分：一笔交易的经济闭环

### 背景

系统挂出买单，部分成交后价格下跌，随后主动卖出对冲，并经历一次 funding。需要解释每一步如何改变仓位、现金、费用和权益。

### 给定条件

- 产品类型和 multiplier 固定；
- 每个 execution 有稳定身份；
- fee 与 funding 的现金流方向明确；
- 同一 execution 重放不得再次入账。

### 起始接口或伪代码

```text
apply_execution(ledger, execution) -> Applied / Duplicate / Conflict / Error
mark_to_market(ledger, mark, valuation_time) -> EquityReport
```

### 分步任务

1. 先用表格手算每个事件。
2. 分别列 position、cash、cost basis、realized 和 fee。
3. 再实现状态更新。
4. 重复其中一笔 execution。
5. 修改一笔 fee，确认 residual 被发现。

### 预期观察

- long/short 方向互换后现金流符号相应变化；
- 重复事实不改变状态，冲突复用身份则报错；
- 分析归因与账务事实分层；
- 最终 equity 可以由现金与持仓估值解释。

### 常见失败

- 只验证 long；
- fee 永远按 quote currency 假设；
- 平均成本默默截断；
- 使用“其他盈亏”把 residual 填平。

### 一级提示

将订单状态与账本分开。订单接受不改变仓位，execution 才是账务输入。

### 二级提示

先校验 execution identity，再在临时状态完成全部 checked arithmetic，所有计算成功后一次提交。

### 参考设计

```text
execution fact -> identity check -> cash/position/cost transition
-> atomic commit -> mark-to-market -> equity identity
```

### 设计复盘

订单状态回答“订单走到哪里”，账本回答“哪些经济事实已经发生”。二者通过 execution identity 连接，但不能共用一个可被任意覆盖的状态对象。

### 扩展变体

改变 settlement currency 或加入反手，说明哪些字段与公式必须版本化。

## I.4 第四部分：五秒钟的部分失败

### 背景

公开流出现 gap；策略刚提交增险意图；网络写出后请求 timeout；私有流断开；随后进程重启。

### 给定条件

- 本地订单 ID 稳定；
- intent 在发送前可靠记录；
- timeout 不等于远端拒绝；
- unknown order 进入 worst-case exposure；
- 对账前不能恢复增险。

### 起始接口或伪代码

```text
reduce(order_state, observed_event) -> new_state + actions
execute(action) -> observed_event
reconcile(local_scope, remote_snapshot) -> differences + safe_actions
```

### 分步任务

1. 为每个事件写本地已知、远端可能和允许动作。
2. 设计订单 reducer 和待执行动作。
3. 加入 fill-before-ack 与 duplicate fill。
4. 在每个持久化边界模拟进程退出。
5. 写恢复审批所需证据。

### 预期观察

- gap 立即使行情不可用于新增风险；
- timeout 后订单进入 Uncertain；
- fill 可以解决部分未知并且只入账一次；
- 重启后先重放本地事实，再查询远端并对账。

### 常见失败

- timeout 后用新 ID 重发；
- 收到晚 ack 后把 Filled 倒退为 Active；
- cancel ack 后忽略晚到 fill；
- 风控只计算本地 Active 订单。

### 一级提示

在每一步暂停，问“远端最多可能已经发生什么”。风险使用可能集合的上界，不使用最乐观解释。

### 二级提示

把 reducer 与 executor 分开：reducer 只产生状态和动作；executor 做 I/O 并把结果重新变成事件。发送前持久化 intent 和稳定 ID。

### 参考设计

```text
durable intent -> risk decision -> send attempt -> uncertain/venue event
-> pure order reducer -> execution ledger -> reconciliation -> approval
```

### 设计复盘

关键不是为每一种乱序再加一个特殊分支，而是让所有状态变化来自可保存事实，并让未知状态始终进入风险上界。

### 扩展变体

假设 venue 不支持按 client ID 查询，重新写出能力下降后的保守恢复方案。

## I.5 第五部分：推翻一份漂亮回测

### 背景

某 imbalance 信号在历史数据中表现很好。你的任务不是证明它盈利，而是寻找什么条件会让结论失效。

### 给定条件

- 输入包含事件、接收和处理时间；
- 策略尝试过多组 horizon 和 threshold；
- 可选择 touch、trade-through 和 L2 queue 成交；
- 延迟可以按 1x、2x、5x、10x 放大。

### 起始接口或伪代码

```text
manifest -> point-in-time replay -> strategy intents -> hard risk decisions
-> simulator reports -> OMS/ledger -> metrics + decision
```

### 分步任务

1. 写出机制、决策时可见输入和 label interval。
2. 按时间切分 train、validation 和 holdout。
3. 保存包括失败项在内的尝试清单。
4. 运行成交与延迟敏感性矩阵。
5. 检查 PnL residual、容量和 regime 集中度。
6. 给出 Reject、Revise、Shadow 或 Canary 决策。

### 预期观察

- touch 通常是乐观上界，不是默认事实；
- 随机切分相邻事件可能泄漏；
- 成本前显著不等于成本后可交易；
- 小幅假设变化就翻转的结论不应升级阶段。

### 常见失败

- 使用未来才收到的数据；
- 回测直接修改仓位；
- 只保存最佳参数；
- holdout 被反复查看并继续调参；
- 只报均值和 Sharpe。

### 一级提示

先画一条事件时间线：feature 观察窗口、decision、send、eligible fill 和 label 结束时点。任何重叠都必须说明。

### 二级提示

让所有订单意图先经过独立 hard risk，再进入 simulator；所有 venue report 经过 OMS 和 ledger。用固定 manifest 记录 data/config/model/code/seed；先定义模型拒绝条件再看结果。

### 参考设计

```text
versioned raw data -> point-in-time events -> strategy intent
-> hard risk -> simulator -> OMS/ledger -> report
                  |                    |
           model sensitivity      equity identity
```

### 设计复盘

研究系统的职责不是尽量保存盈利结论，而是让时点、尝试范围和实施假设足够透明，使一个结果可以被拒绝。

### 扩展变体

把最好市场环境完全排除，观察结论是否仍有经济意义。

## I.6 第六部分：让陌生人审查项目

### 背景

项目作者往往知道许多没有写下的步骤。本实验要求一个未参与实现的人，仅依靠项目说明完成演示和一次故障注入。

### 给定条件

- 只能提供 README、证据索引和项目内容；
- 第一次运行期间作者不能口头指导；
- 评审者可以改变输入或配置；
- 至少复核一项账务、性能或研究结论。

### 起始接口或伪代码

```text
README -> one-command demo -> evidence index -> reproducible claim
reviewer change -> failure observation -> review record -> revision -> rerun
```

### 分步任务

1. 作者声明项目范围与不能证明的内容。
2. 评审者独立找到输入、配置和运行入口。
3. 评审者完成正常演示。
4. 评审者注入一个故障。
5. 双方复核一个关键数字。
6. 作者把所有隐藏步骤补回文档，再重复演示。

### 预期观察

- 第一次评审通常会发现文档缺口；
- 一键运行不等于结果自动可信；
- checksum、状态事件和报告应能互相定位；
- 限制声明应与实际证据一致。

### 常见失败

- README 只列命令，不写输入和成功标准；
- 演示依赖作者电脑上的隐藏文件；
- 只展示最终 PnL，不展示状态与账本；
- 把离线或测试网结果描述成生产经验。

### 一级提示

从评审者第一次提问开始记录。每个必须口头解释的操作，都是潜在文档、默认值或自动化缺口。

### 二级提示

建立证据索引，把输入 checksum、配置、事件日志、最终状态、报告和限制连接起来。演示至少包含正常、边界和故障三个场景。

### 参考设计

```text
README -> manifest -> one-command demo -> event evidence
          |                              |
          +-> report/checksum <- review record
```

### 设计复盘

可复现不是“在作者电脑上再运行一次”。真正的边界是陌生人能否从文档找到输入和成功标准，并在改变条件后仍定位到可检查证据。

### 扩展变体

让第二位评审者从不同操作系统或干净环境运行，区分项目问题与环境假设。

## I.7 怎样判断实验完成

每个实验使用相同五级状态：

```text
未开始
-> 能按说明运行
-> 能独立实现并覆盖边界
-> 能解释权衡和失败模式
-> 能由他人复现并通过评审
```

看过参考设计最多说明获得了新输入，不会自动提高完成等级。只有重新实现、通过反例并由他人复核，才能形成作品集证据。

完成独立尝试后，使用[附录 O：带反馈实验参考解答](appendix-o-lab-solutions.md)逐项核对不变量、状态、预期输出和验证矩阵。参考解答不是唯一实现，也不能替代自己的运行证据。
