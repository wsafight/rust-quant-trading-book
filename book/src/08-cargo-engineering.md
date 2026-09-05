# 第 8 章 Cargo、模块与工程质量：把练习变成项目

一个交易程序需要可构建、可测试、可审查和可重复运行。Cargo 不只下载依赖，它还组织 package、crate、feature、workspace、测试、文档与发布配置。

> **学习导航**
>
> - 开始前：已经有第 1–7 章写出的几个可测试模块。
> - 这一章学会：把零散练习组织成别人也能构建和检查的项目。
> - 大约需要：6–8 小时。
> - 做完留下：代码库、回放程序、依赖记录和离线自动检查。

> **开章场景：你的程序到了同事电脑上却跑不起来**
>
> 几章之后，行情、订单、错误和测试全挤在一个文件里。你把代码发给同事，对方使用了不同依赖版本，构建失败；修好版本后，又不清楚哪个模块可以直接修改仓位。程序在你电脑上运行过，已经不足以证明它是一个可协作的工程。
>
> Cargo 负责项目结构、依赖、构建和测试，模块负责划分代码边界。**本章要解决的是：怎样把零散练习组织成别人也能按相同方式构建、检查和理解的 Rust 项目。**

> **第一次阅读建议**
>
> 先读 8.1、8.2、8.8 和 8.9，把代码分成可复用逻辑与可运行程序，并建立固定检查命令。只有项目开始包含多个独立模块时再细读工作空间；编译功能开关、发布参数和持续集成分层知道用途即可，不必在练习项目里一次配齐。

## 8.1 项目、编译单元与模块

Rust 文档常用三个英文词描述代码层次：

- package 是由一个 `Cargo.toml` 管理的项目。
- crate 是一次编译的代码单元，可以生成代码库（library）或可执行程序（binary）。
- module 是 crate 内部的模块，用 `mod` 组织名称和访问范围。

第一次阅读先记住：package 管整个项目，crate 决定编译产物，module 整理一个产物内部的代码。

一个最小结构：

```text
trading-lab/
  Cargo.toml
  src/
    lib.rs
    domain.rs
    risk.rs
    bin/
      replay.rs
```

`lib.rs` 暴露可复用逻辑，`bin/replay.rs` 负责 CLI 装配。不要把所有领域代码写进 `main.rs`，否则集成测试和其他 binary 难以复用。

## 8.2 模块与可见性

默认项私有，`pub` 才对外可见。只公开稳定能力，隐藏字段和实现：

```rust
mod risk {
    #[derive(Debug, PartialEq, Eq)]
    pub struct Limit {
        max_lots: i64,
    }

    impl Limit {
        pub fn new(max_lots: i64) -> Option<Self> {
            (max_lots > 0).then_some(Self { max_lots })
        }

        pub fn allows(&self, qty: i64) -> bool {
            qty > 0 && qty <= self.max_lots
        }
    }
}

fn main() {
    let limit = risk::Limit::new(5).unwrap();
    assert!(limit.allows(3));
}
```

调用者不能绕过构造函数直接制造负 limit。`pub(crate)` 和 `pub(super)` 可以缩小共享范围。

## 8.3 用工作空间管理多个代码包

贯穿项目适合 Cargo workspace：

```toml
[workspace]
members = [
  "crates/domain",
  "crates/market-data",
  "crates/oms",
  "crates/risk",
  "crates/replay",
  "crates/app",
]
resolver = "3"
```

拆 crate 的依据是稳定依赖边界、编译隔离和所有权，不是每个 struct 一个 crate。避免循环依赖：`domain` 不应依赖具体 venue，adapter 依赖 domain 并完成转换。

## 8.4 依赖选择

加入 crate 前检查：

- 是否仍维护，最近 release 和 issue 响应如何？
- license 是否符合项目要求？
- unsafe 代码和 transitive dependencies 有多少？
- 错误、取消、timeout 和 backpressure 语义是否清楚？
- feature 是否能关闭不需要的 TLS/runtime/格式？
- benchmark 是否包含正确性和真实 workload？

`Cargo.lock` 对应用程序应提交，保证构建可重复。升级依赖要跑 fixture/replay，不只看编译通过。

## 8.5 在编译时选择可选功能

feature 可以在编译时决定是否包含某项可选能力，适合可选集成，不适合运行时风险开关：

```toml
[features]
default = []
venue-demo = []
```

生产是否允许交易必须由经过审计的运行配置和 hard gate 决定，不能靠编译时 feature 模糊环境。

过多 feature 组合会扩大测试矩阵。CI 至少覆盖 default、all-features 和生产实际组合。

## 8.6 配置加载

配置经过：

```text
raw file/env -> parse -> schema validation -> cross-field validation
-> immutable versioned config -> explicit activation
```

敏感 secret 不放普通配置文件。配置记录 checksum、版本、owner 和生效时间；高风险限额变更与策略参数分权。

不要让模块随时读取环境变量。进程启动时集中读取并转换成 typed config，测试即可直接构造配置而不污染全局环境。

## 8.7 代码库错误与应用程序错误

library 返回结构化领域错误，让调用者决定动作；binary 边界增加上下文、输出日志并决定退出码。

```text
decoder: InvalidPrice { raw }
adapter: MalformedMessage { channel, source }
application: count error, degrade feed, retain payload reference
```

不要在 library 随意 `process::exit`、打印日志或吞掉错误。panic 表示不可恢复的程序错误，不表示普通网络失败。

## 8.8 测试目录

```text
src/                 与实现相邻的 unit tests
tests/               public API integration tests
fixtures/            固定、脱敏原始数据
benches/             microbenchmarks
fuzz/                fuzz targets
examples/            可运行 API 示例
```

unit test 可以访问模块私有细节；integration test 只能使用公开 API，更接近外部调用者。不要让 CI 的核心正确性依赖实时交易所网络。

## 8.9 固定一组项目检查

```bash
cargo fmt --check
cargo clippy --workspace --all-targets --all-features -- -D warnings
cargo test --workspace --all-features
cargo doc --workspace --no-deps
cargo build --workspace --release
```

项目成熟后，可以按风险加入依赖安全、许可证、内存检查、模糊测试和性能基准。`-D warnings` 会把警告当成错误，有助于保持整洁；但升级编译器时应先理解新警告，不要为了让自动检查变绿而机械改坏语义。

## 8.10 发布构建的优化配置

性能测试要使用经过优化的发布构建，并记录具体配置：

```toml
[profile.release]
lto = "thin"
codegen-units = 1
panic = "abort"
```

这只是示例。`panic = abort` 会改变 unwinding/清理和故障诊断，不能不评估就用于所有服务。优化参数影响编译时间、二进制和性能，结果必须由目标 workload 支持。

## 8.11 CI（持续集成）分层

持续集成（CI）是在提交代码后自动运行的一组检查。快速层每次提交运行格式、静态检查和单元/集成测试；较慢层运行回放、基于性质的测试、短时模糊测试和性能回归；定时层再运行在线协议测试、长时间稳定性测试与安全扫描。

任何 benchmark gate 要容忍环境噪音并保留原始样本。共享 CI runner 不适合判定微小延迟回归，可以先标记趋势，再在固定机器复测。

## 8.12 架构决策记录

重要架构选择写成简短的架构决策记录（ADR）：说明背景、约束、最终选择、备选方案、代价和何时复查。例如“为什么先用 `BTreeMap` 而不是连续价格数组”“为什么订单状态使用单写者”“为什么先保存事件日志再更新数据库查询表”。

文档不是描述每行代码，而是保存代码本身无法表达的假设和权衡。

## 8.13 本章练习

1. 把前几章代码组织成 library + replay binary。
2. 用私有字段和公开构造函数限制 `Limit` 与 `PriceTicks`。
3. 建立 workspace，并画出 crate 依赖方向。
4. 为一个依赖写选择记录：维护、license、unsafe、feature 与替代方案。
5. 建立不访问网络的 CI 基线。

本章完成标准：项目能用一组稳定命令格式化、检查、测试和构建；领域边界由 crate/module API 体现，而不是文件名约定。

## 8.14 回顾与进入检查点

Cargo 把前七章的局部代码组织成可重复工程：library 保留领域逻辑，binary 负责装配与副作用，module/crate 可见性限制绕过不变量的路径，锁文件和工具链固定构建输入，CI 持续执行质量契约。

工程化不等于把代码拆得越细越好。一个值得独立成 crate 的边界通常有稳定职责、清楚依赖方向或独立测试需求；一个值得加入的依赖则应有可说明的维护、license、feature、unsafe 与替代方案。目录和工具越多，维护成本也越高。

现在应暂停增加功能，进入[阶段检查点一](gate-1-rust-foundation.md)。检查点会要求把纯计算、所有权、领域模型、错误、trait 和 Cargo 合并为一个从空目录可重建的最小工程。通过之后，第二部分才会把它放进异步实时管线。
