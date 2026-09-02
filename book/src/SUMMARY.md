# 目录

[封面](README.md)
[序言：先成为可信赖的工程师](preface.md)

# 第一部分：Rust 语言与工程基础

- [第 1 章 路线、环境与第一个交易程序](01-roadmap-and-setup.md)
- [第 2 章 Rust 基础语法：从数值到交易判断](02-rust-basics.md)
- [第 3 章 所有权：让状态只有一个可信主人](03-ownership.md)
- [第 4 章 Struct、Enum 与模式匹配](04-domain-modeling.md)
- [第 5 章 集合、字符串与迭代器](05-collections-iterators.md)
- [第 6 章 类型、错误与测试](06-types-errors-tests.md)
- [第 7 章 Trait、泛型与生命周期](07-traits-generics-lifetimes.md)
- [第 8 章 Cargo、模块与工程质量](08-cargo-engineering.md)
- [阶段检查点一：类型安全的 Rust 工程](gate-1-rust-foundation.md)

# 第二部分：实时系统基础

- [第 9 章 订单簿数据结构与不变量](09-book-and-traits.md)
- [第 10 章 并发、异步与背压](10-concurrency-async.md)
- [第 11 章 Tokio 与网络编程](11-tokio-networking.md)
- [第 12 章 性能不是猜出来的](12-performance.md)
- [阶段检查点二：有界实时行情链路](gate-2-realtime-pipeline.md)

# 第三部分：市场、产品与执行

- [第 13 章 市场微观结构](13-market-microstructure.md)
- [第 14 章 订单、撮合与执行成本](14-orders-execution.md)
- [第 15 章 加密衍生品、保证金与 PnL](15-derivatives.md)
- [第 16 章 量化数学与交易账务基础](16-quant-math-accounting.md)
- [第 17 章 交易账本、幂等与对账](17-ledger-reconciliation.md)
- [阶段检查点三：成本、衍生品与账务](gate-3-products-accounting.md)

# 第四部分：构建交易系统

- [第 18 章 行情、时钟与本地订单簿](18-market-data.md)
- [第 19 章 交易所协议与 Adapter 设计](19-venue-protocols.md)
- [第 20 章 Venue 契约 Fixture 实战](20-venue-fixture-case.md)
- [第 21 章 订单状态机、接入与对账](21-oms-and-exchange.md)
- [第 22 章 做市、执行、仓位与硬风控](22-strategy-and-risk.md)
- [阶段检查点四：交易闭环与硬风控](gate-4-trading-loop.md)

# 第五部分：研究与生产

- [第 23 章 数据、回测与仿真](23-backtesting.md)
- [第 24 章 模拟交易所与成交模型校准](24-simulator-calibration.md)
- [第 25 章 量化研究与统计验证](25-research-statistics.md)
- [第 26 章 低延迟与生产可靠性](26-production.md)
- [阶段检查点五：可信研究与故障恢复](gate-5-research-production.md)

# 第六部分：项目与职业路径

- [第 27 章 贯穿项目：从行情到可审计 PnL](27-capstone.md)
- [第 28 章 24 周成长与求职路径](28-career.md)

# 附录

- [附录 A 术语与公式速查](appendix-a-glossary.md)
- [附录 B 工程检查清单](appendix-b-checklists.md)
- [附录 C 全章练习提示与验收指南](appendix-c-exercise-guidance.md)
- [附录 D 版本、兼容性与变更记录](appendix-d-versioning.md)
- [附录 E 参考资料与规则来源](appendix-e-references.md)
