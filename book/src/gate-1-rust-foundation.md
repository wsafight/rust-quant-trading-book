# 阶段检查点一：类型安全的 Rust 工程

这个检查点验证第 1 至 8 章的知识是否已经变成可维护代码。通过之后再进入实时系统；如果所有业务值仍是裸 `i64`、错误靠 panic 处理，异步只会放大问题。

## 前置条件

- 能解释所有权、借用、`Option`、`Result`、enum、trait 和 module 的用途。
- 已运行过仓库中的 `book/code` 配套工程，并能指出 `domain` 模块保护了哪些不变量。
- 开发环境可运行 `cargo fmt`、`cargo clippy` 和 `cargo test`。

## 必做任务

1. 建立一个 library crate 和一个离线 binary；binary 只能通过 library 的公开 API 修改状态。
2. 定义 `PriceTicks`、`QtyLots`、`ClientOrderId`、`Side` 和至少一个有上下文的错误类型。
3. 实现严格的 decimal-to-ticks、spread 和 position 更新；拒绝非法精度、非正数量及算术溢出。
4. 为订单命令或连接状态使用 enum，删除互相矛盾的 bool 组合。
5. 写一页依赖决策记录：为什么需要该依赖、feature、license、维护状态和替代方案。

## 自动验收

```bash
cargo fmt --all -- --check
cargo clippy --all-targets --all-features -- -D warnings
cargo test --all-targets
```

测试至少覆盖：locked/crossed spread、`i64::MIN/MAX` 附近输入、非法 decimal 精度、long/short/反向持仓和错误类型匹配。不能用“测试里不会出现”回避边界。

## 人工演示

在 5 分钟内从空目录完成 `cargo new`、加入 library 模块、运行 binary 和一条失败后修复的测试。随后解释一个借用错误的根因，不能只说“编译器不允许”。

## 通过证据

- 代码提交、完整测试输出和工具链版本。
- 一张 crate/module 依赖图，依赖方向无环。
- 一段 200 至 400 字说明：哪些非法状态已无法构造，哪些仍需运行时检查。

如果 API 允许任意整数直接成为价格或数量，回到第 4、6 章；如果通过大量 `clone` 或全局锁绕开所有权，回到第 3、7 章。
