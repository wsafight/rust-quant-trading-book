# QuantLab · Rust 量化引擎配套工程

这里是《Rust 量化代码实战书》（QuantLab 双书平台伴生工程）的离线可运行教学引擎。它聚焦核心状态机、零浮点账本、确定性撮合与风控边界验证，默认不连接真实交易所、不读取任何账户凭据。

## 快速命令

```bash
# 运行全部单元、边界、异步与离线闭环测试
cargo test --locked --manifest-path code/Cargo.toml --all-features

# 运行端到端离线交易演练 Demo
cargo run --locked --manifest-path code/Cargo.toml --bin demo

# 运行 Criterion 性能基准测试
cargo bench --locked --manifest-path code/Cargo.toml --bench parse_level
```

## 模块与 Rust 实战书章节对应关系

| 模块 | 对应章节 | 工程重点 |
| --- | --- | --- |
| `domain` | R01 | 强类型新类型（`PriceTicks`/`QtyLots`/`ClientOrderId`）、零浮点刻度与稳定 `ExecutionKey` |
| `order_book` | R02 | L2 深度不变量、增量序列号连续性检查、交叉盘口与自动作废 |
| `ledger` | R03 | `ExecutionKey` 幂等去重、有理数均价成本、反手开平与权益恒等式 |
| `execution` | R04 | 父单拆单、在途撤单容量守恒与 overfill 防护 |
| `simulator` | R05 | 发送/撤单/回报延迟、`Touch`/`TradeThrough`/`L2Queue` 撮合与乱序回报 |
| `oms` | R06 | 纯函数状态机 reducer、乱序成交吸收与 `Uncertain` 风险锁 |
| `risk` | R07 | 独立硬风控、最坏敞口（`worst_long`/`worst_short`）与 Kill Switch |
| `venue_fixture` | R08 | 交易所 JSON 解码、零浮点小数标准化与离线固定样本回归 |
| `replay` | R09 | 单调虚拟时钟、`(at_ns, priority, local_sequence)` 全序回放与重复键拒绝 |
| `tests/tokio_examples.rs` | R10 | Tokio 有界背压队列、超时边界与所有权任务汇总 |
| `research` | R11 | 多重检验输入校验与 Benjamini-Hochberg FDR 控制 |
| `ofi`, `pairs` | R12 | 微观结构 OFI 订单流不平衡、配对 Z-Score 与单腿超时强平状态机 |
| `portfolio`, `options` | R13 | Const Generics 逆波动率风险平价、相关性崩塌与 Black-Scholes 希腊字母 |
| `bin/demo.rs`, `tests/` | R14 | 端到端离线闭环与极端故障边界回归 |

## 边界说明

- `demo` 将 order book、hard risk、模拟 venue、OMS、ledger 和 replay 串联，依次注入 fill-before-ack、duplicate fill、sequence gap 与 cancel timeout，仅验证离线状态边界，不代表实盘盈利策略。
- 当前 crate 刻意保持最小离线核，不包含实盘连接器、事件日志持久化或生产风控告警平台；任何实盘接入都应另建独立 adapter，并默认从公开数据、只读权限或测试网起步。
- 回放事件的 `local_sequence` 必须来自输入事件日志并在同一 `(at_ns, priority)` 下唯一，不可用读取器插入顺序替代。
