# 附录 E 参考资料与规则来源

本页提供继续核对定义和实现细节的入口，不替代正文中的推导、fixture 或测试。链接最近复核于 **2026-08-26**。外部页面可能更新；涉及资金的规则必须按附录 D 保存访问日期、版本和原始响应。

## Rust 与工程工具

- [The Rust Programming Language](https://doc.rust-lang.org/book/)：语言入门主教材。
- [The Rust Reference](https://doc.rust-lang.org/reference/)：表达式、类型、生命周期、并发 trait 等规范细节。
- [Rust Standard Library](https://doc.rust-lang.org/std/)：标准类型和 API 文档。
- [The Cargo Book](https://doc.rust-lang.org/cargo/)：package、workspace、feature、构建与测试。
- [Rust API Guidelines](https://rust-lang.github.io/api-guidelines/)：公开 Rust API 的命名、trait 与可预测性惯例。
- [The Rustonomicon](https://doc.rust-lang.org/nomicon/)：unsafe 与底层内存模型；只有确需 unsafe 时阅读并补证明。
- [Clippy Documentation](https://doc.rust-lang.org/clippy/) 与 [rustfmt](https://github.com/rust-lang/rustfmt)：静态检查和格式化。
- [mdBook Documentation](https://rust-lang.github.io/mdBook/)：本书构建、测试和主题配置。

## 异步、测试与性能

- [Tokio Tutorial](https://tokio.rs/tokio/tutorial) 与 [Tokio API](https://docs.rs/tokio/latest/tokio/)：runtime、task、channel、time 和 I/O。
- [Tokio Graceful Shutdown](https://tokio.rs/tokio/topics/shutdown)：取消、等待和 task 生命周期的基础模式。
- [Criterion.rs Book](https://bheisler.github.io/criterion.rs/book/)：统计 microbenchmark、配置与结果解释。
- [The rustc Book: Profile-guided Optimization](https://doc.rust-lang.org/rustc/profile-guided-optimization.html)：需要进入编译优化阶段时的官方入口。
- [proptest](https://docs.rs/proptest/latest/proptest/)：property-based testing；用于状态机、算术和序列不变量。
- [Loom](https://docs.rs/loom/latest/loom/)：小型 Rust 并发协议的交错模型测试。

## 市场微观结构与执行

- Maureen O'Hara, *Market Microstructure Theory*, Blackwell, 1995：信息、库存与价格形成的理论基础。
- Larry Harris, *Trading and Exchanges: Market Microstructure for Practitioners*, Oxford University Press, 2003：订单类型、市场参与者与交易机制。
- Álvaro Cartea, Sebastian Jaimungal, José Penalva, *Algorithmic and High-Frequency Trading*, Cambridge University Press, 2015：做市、最优执行与高频模型。
- Martin D. Gould et al., [Limit Order Books](https://doi.org/10.1080/14697688.2013.803148), *Quantitative Finance*, 2013：订单簿研究综述。
- Marco Avellaneda and Sasha Stoikov, [High-frequency trading in a limit order book](https://doi.org/10.1080/14697680701381228), *Quantitative Finance*, 2008：库存风险做市模型；用于理解假设，不应直接视为生产策略。
- Robert Almgren and Neil Chriss, [Optimal Execution of Portfolio Transactions](https://doi.org/10.21314/JOR.2001.041), *Journal of Risk*, 2001：冲击、风险与执行调度。

## 统计、回测与研究可信度

- Andrew W. Lo, [The Statistics of Sharpe Ratios](https://doi.org/10.2469/faj.v58.n4.2453), *Financial Analysts Journal*, 2002：相关性和非正态下 Sharpe 的统计解释。
- David H. Bailey et al., [The Probability of Backtest Overfitting](https://doi.org/10.2139/ssrn.2326253), 2013：多重尝试和回测选择偏差。
- Marcos López de Prado, *Advances in Financial Machine Learning*, Wiley, 2018：时间切分、purging/embargo 与研究工程；具体方法仍需结合数据生成过程验证。
- [NIST/SEMATECH e-Handbook of Statistical Methods](https://www.itl.nist.gov/div898/handbook/)：分布、置信区间、实验设计与诊断的通用参考。

## 交易所官方文档入口

这些链接用于获取当前协议和规则，**不是已经冻结的书稿依赖**。实现前应进一步定位到具体产品、endpoint 和规则页面，并保存 fixture。

- [Binance Spot API](https://developers.binance.com/docs/binance-spot-api-docs) 与 [Derivatives API](https://developers.binance.com/docs/derivatives)
- [Coinbase Exchange API](https://docs.cdp.coinbase.com/exchange/docs/welcome)
- [Kraken API Center](https://docs.kraken.com/api/)
- [OKX API v5](https://www.okx.com/docs-v5/en/)
- [Deribit API](https://docs.deribit.com/)
- [Bybit API v5](https://bybit-exchange.github.io/docs/v5/intro)

优先核对 instrument、price/quantity precision、snapshot/delta 同步、订单状态、execution ID 作用域、client ID 幂等、限频、时间戳、签名、position mode、reduce-only、fee/funding 与错误码。对文档与真实 fixture 不一致的情况，保持 risk-off 并由 adapter owner 处理，不能在领域层猜测。

## 阅读顺序

初学阶段以 Rust Book、Cargo Book 和 Tokio Tutorial 为主；做到第 13 章后并行阅读 Harris 与 Gould；进入执行和做市再读 Almgren–Chriss、Avellaneda–Stoikov 与 Cartea；开展研究前阅读 Lo 与 backtest-overfitting 资料。论文中的模型是推理起点，不是绕过数据、成交校准和硬风控的授权。
