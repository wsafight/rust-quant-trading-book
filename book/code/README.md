# 配套工程

这里是《Rust 从入门到量化交易工程师》的离线可运行教学基线。它不是完整交易闭环或生产交易系统，也不会连接交易所或读取凭据。

```bash
cargo run --locked --manifest-path book/code/Cargo.toml --bin demo
cargo test --locked --manifest-path book/code/Cargo.toml
cargo bench --locked --manifest-path book/code/Cargo.toml --bench parse_level
```

模块与章节对应关系：

| 模块 | 对应章节 | 重点 |
| --- | --- | --- |
| `domain` | 第 4、6 章 | 单位、新类型、稳定 ID |
| `execution` | 第 14 章 | parent/child 数量、在途撤单与 overfill 边界 |
| `order_book` | 第 9、18、20 章 | L2 不变量、sequence gap、venue fixture |
| `oms` | 第 21 章 | 纯 reducer、乱序和成交去重 |
| `ledger` | 第 16、17、21、23 章 | execution 幂等、平均成本、现金/仓位与权益闭合 |
| `risk` | 第 22 章 | hard limit、worst-case exposure |
| `replay` | 第 23 章 | 单调虚拟时钟、`(time, priority, local_sequence)` 确定性顺序与重复键拒绝 |
| `research` | 第 25 章 | 多重检验输入校验与 Benjamini-Hochberg step-up |
| `simulator` | 第 14、23、24、27 章 | send/cancel/report latency、touch/trade-through/L2 queue fill |
| `venue_fixture` | 第 18–20 章 | JSON schema、decimal normalization 与 snapshot/delta contract |

`demo` 把 order book、hard risk、模拟 venue、OMS、ledger 和 replay 串在一起，依次注入 fill-before-ack、duplicate fill、sequence gap 与 cancel timeout。它验证的是离线状态边界，不生成盈利声明。

当前 package 仍未实现 recorder/serde adapter、完整策略、event-log 持久化恢复和研究报告生成；这些仍是第 27 章后续里程碑，不应把目录现状描述成生产交易系统。

回放事件的 `local_sequence` 必须来自输入日志，在同一时间/优先级范围内唯一；不要用 reader 的插入顺序代替它。先运行测试并阅读失败条件，再按阶段检查点扩展模块。任何真实接入都应另建 adapter，并默认使用公开数据、只读权限或测试网。
