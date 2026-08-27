# 第 8 章 Cargo、模块与工程质量：把练习变成项目

一个交易程序需要可构建、可测试、可审查和可重复运行。Cargo 不只下载依赖，它还组织 package、crate、feature、workspace、测试、文档与发布配置。

> **学习导航**　前置：第 1–7 章的可测试模块｜目标：组织 package/crate/workspace，固定质量命令与依赖边界｜预计：6–8 小时｜产出：library + replay binary、依赖记录和离线 CI 基线

## 8.1 Package、Crate 与 Module

- package 是一个 `Cargo.toml` 管理的项目。
- crate 是一次编译单元，可以是 library 或 binary。
- module 用 `mod` 组织 crate 内命名空间和可见性。

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

## 8.3 Workspace

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

## 8.5 Feature Flag

feature 适合可选集成，不适合运行时风险开关：

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

## 8.7 Library Error 与 Application Error

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

## 8.9 工具链基线

```bash
cargo fmt --check
cargo clippy --workspace --all-targets --all-features -- -D warnings
cargo test --workspace --all-features
cargo doc --workspace --no-deps
cargo build --workspace --release
```

需要根据项目加入 audit、deny、Miri、fuzz、benchmark 和 license 检查。`-D warnings` 能维持整洁，但升级 compiler 时应先评估新 lint，不要为了过 CI 机械改坏语义。

## 8.10 Release Profile

性能测试使用 release profile，并记录配置：

```toml
[profile.release]
lto = "thin"
codegen-units = 1
panic = "abort"
```

这只是示例。`panic = abort` 会改变 unwinding/清理和故障诊断，不能不评估就用于所有服务。优化参数影响编译时间、二进制和性能，结果必须由目标 workload 支持。

## 8.11 CI 分层

快速层每次提交运行 fmt、clippy、unit/integration；较慢层运行 replay、property、fuzz smoke 和 benchmark regression；定时层运行在线 contract、soak 与安全扫描。

任何 benchmark gate 要容忍环境噪音并保留原始样本。共享 CI runner 不适合判定微小延迟回归，可以先标记趋势，再在固定机器复测。

## 8.12 决策记录

重要架构选择写简短 ADR：背景、约束、选择、备选、代价和复查条件。例如“为什么先用 BTreeMap 而不是稠密 ladder”“为什么 OMS 使用 single-writer”“为什么 event log 先于数据库投影”。

文档不是描述每行代码，而是保存代码本身无法表达的假设和权衡。

## 8.13 本章练习

1. 把前几章代码组织成 library + replay binary。
2. 用私有字段和公开构造函数限制 `Limit` 与 `PriceTicks`。
3. 建立 workspace，并画出 crate 依赖方向。
4. 为一个依赖写选择记录：维护、license、unsafe、feature 与替代方案。
5. 建立不访问网络的 CI 基线。

本章完成标准：项目能用一组稳定命令格式化、检查、测试和构建；领域边界由 crate/module API 体现，而不是文件名约定。
