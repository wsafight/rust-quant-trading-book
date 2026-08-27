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
| `order_book` | 第 9、17 章 | L2 不变量、sequence gap |
| `oms` | 第 19 章 | 纯 reducer、乱序和成交去重 |
| `risk` | 第 20 章 | hard limit、worst-case exposure |
| `replay` | 第 21 章 | 单调虚拟时钟、`(time, priority, local_sequence)` 确定性顺序与重复键拒绝 |

当前 package 只实现上表中的教学基线；recorder/serde adapter、模拟交易所、position/cash/PnL ledger 和持久化恢复仍是第 24 章里程碑，不应把目录现状描述成已经完成的全链路系统。

回放事件的 `local_sequence` 必须来自输入日志，在同一时间/优先级范围内唯一；不要用 reader 的插入顺序代替它。先运行测试并阅读失败条件，再按阶段检查点扩展模块。任何真实接入都应另建 adapter，并默认使用公开数据、只读权限或测试网。
