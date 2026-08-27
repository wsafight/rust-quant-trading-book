# Rust 从入门到量化交易工程师

这是独立书稿[《Rust 从入门到量化交易工程师》](book/src/README.md)的源码仓库。书稿从 Rust 基础讲到行情、OMS、做市、回测与生产可靠性，以“能构建、验证和解释一条量化交易链路”为目标。

## 适合谁

- 会其他语言、准备系统学习 Rust，并希望进入量化交易工程方向的开发者。
- 已会 Rust，但缺少市场微观结构、衍生品、交易系统或回测经验的工程师。
- 已做量化研究，希望补齐 OMS、风控、对账、低延迟和生产运维能力的研究员。

如果完全没有编程经验，先补齐变量、函数、数据结构、命令行和 Git 基础。本书解释 Rust 的核心概念，但不是通用计算机基础教材。

## 推荐路径

1. 阅读书稿的序言与第 1 章，完成环境检查和能力基线。
2. 按顺序完成第 2 至 23 章，每章都运行代码、做练习并保留证据。
3. 用第 24 章的贯穿项目连接行情、策略、风控、OMS、账本和回放。
4. 使用第 25 章的能力地图复评，并按书内 24 周路线补缺口。
5. 最后按第 24、25 章整理作品集、研究报告、事故复盘和面试材料。

默认投入为每周 15 至 20 小时、持续 24 周。每周只有 8 至 10 小时时，把周期延长到约 40 周，不要删掉测试、回测偏差和故障恢复部分。

## 本地阅读

仓库使用 [mdBook](https://rust-lang.github.io/mdBook/) 组织书稿：

```bash
cargo install mdbook --version 0.5.2 --locked
mdbook serve --open
```

默认地址为 `http://localhost:3000`。只构建静态页面：

```bash
mdbook build
```

运行书稿、配套工程、benchmark 编译、目录和本地链接的完整检查：

```bash
bash scripts/check-book.sh
```

离线配套工程位于 `book/code`，可直接运行 book、risk、OMS 与 replay 的教学基线串联示例：

```bash
cargo run --locked --manifest-path book/code/Cargo.toml --bin demo
```

该命令不包含模拟交易所、position/cash/PnL 账本或持久化恢复；这些是第 24 章贯穿项目的目标，不应把当前示例描述为已经完成的全链路系统。

## Web 发布

[Book workflow](.github/workflows/book.yml) 会在 pull request 中运行完整检查；推送到 `main` 或在 `main` 上手动运行 workflow 时，检查通过后会把 `book/html` 部署到 GitHub Pages。

仓库首次发布前，在 GitHub 的 **Settings -> Pages -> Build and deployment** 中把 Source 设为 **GitHub Actions**。部署完成后的公开地址会显示在 workflow 的 `deploy` job 和仓库 Deployments 页面。

## 完成标准

“读完”不是完成。最终应至少具备以下证据：

- 一套可测试的 Rust 领域类型、L2 订单簿、订单状态机和硬风控模块。
- 一个可确定性回放的做市/对冲仿真，包含费用、延迟、保守成交模型和 PnL 对账。
- 一份延迟剖析报告、一份策略研究报告和一次故障演练复盘。
- 能解释 sequence gap、fill-before-ack、cancel/fill race、请求超时、重启对账和 kill switch。
- 能明确区分离线回测、shadow、测试网和真实生产证据，不把仿真收益包装成实盘业绩。

## 安全边界

本仓库用于教育、研究和模拟，不构成投资建议。示例默认不连接真实账户。接入外部 API 时先使用公开行情、只读权限或测试网；任何真实资金实验都应使用独立子账户、最小权限、最小资金、硬性限额和独立人工 kill switch。
