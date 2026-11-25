# QuantLab · 双书量化交易交互式深度学习平台（Rust 实战版）

一个采用**双书分离架构**的交互式量化交易学习平台与可运行 Rust 量化引擎参考仓库：

1. **《零基础量化交易主书》**（6 阶段 · **23 篇**零代码交互课程）：从 00A/00B/00C 交易所、账单与资产全景（红利/国债/基金/杠杆）入门一路走到 OFI 订单流 Alpha、配对/跨所套利、多策略风险平价与期权 Delta-Gamma 对冲；每篇配备专属浏览器交互沙盒与 38 个可点选白话术语词条。
2. **《Rust 量化代码实战书》**（4 大篇 · **14 章**硬核工程实战）：面向程序员，用自包含教学示例讲解量化交易工程设计，并提供 `code/` 下可编译测试的伴生引擎。章节不直接导入引擎源码，简化示例单独说明省略的边界；内容涵盖强类型刻度、L2 订单簿同步、双式记账、撮合仿真、OMS 乱序状态机、独立硬风控、单写者确定性回放、Tokio 背压与策略算法库。

全站支持 **`⌘K / Ctrl+K` 双书与术语检索**、深浅色主题切换、专注阅读模式与本地学习进度追踪。

---

## 一、零基础量化交易主书（6 阶段 · 23 篇）

| 阶段 | 篇目 | 交互沙盒 |
| --- | --- | --- |
| **Stage 0：零基础交易启蒙** | 00A. 交易所、行情与买卖基础 | 市场基础互动台 |
| | 00B. 看懂交易账单的 5 个基本词 | 交易语言与账单模拟台 |
| | 00C. 市面上都能买什么？红利、国债、基金与杠杆全景 | 资产全景与股债搭配模拟器 |
| **Stage 1：市场微观结构与交易执行** | 01. 订单簿深度、价差与冲击成本 | L2 订单簿与盘口冲击沙盒 |
| | 02. 做市商困境与逆向选择 | 做市商 Markout 实验室 |
| | 03. 订单类型、撮合规则与父单拆单执行 | 父单拆单执行模拟器 |
| | 04. 实时行情增量同步、时钟漂移与盘口作废 | 行情增量同步故障注入器 |
| **Stage 2：交易品种、量化数学与资金账本** | 05. 永续合约、资金费率与保证金强平 | 永续合约 PnL 与强平滑块 |
| | 06. 收益风险指标、最大回撤与仓位数学 | 策略净值与仓位 Sizing 模拟器 |
| | 07. 双式记账、PnL 归因与幂等对账 | 成交账本与资金对账演练器 |
| **Stage 3：策略研究、回测校准与统计检验** | 08. 事件驱动回测与成交假设 | 三模型同场回放对比器 |
| | 09. 统计陷阱与多重检验 | 参数过拟合与样本外衰减模拟器 |
| | 10. 从公允价到动态做市报价 | 做市报价引擎参数台 |
| **Stage 4：实盘交易系统、风控与高可靠工程** | 11. OMS 乱序状态机与实盘容错 | OMS 乱序事件时间线沙盒 |
| | 12. 独立硬风控、最坏敞口与 Kill Switch | 最坏敞口风控计算器 |
| | 13. 交易所协议坑点与固定样本验证 | 交易所 JSON → 标准化事件映射器 |
| | 14. 单写者事件循环与确定性回放 | 共享大锁撕裂快照 vs 单写者步进器 |
| | 15. 实时行情管线、背压限流与 P99 延迟 | 有界队列背压与 P50/P99 模拟器 |
| | 16. 全链路交易演练与极端故障恢复 | 端到端故障注入面板 |
| **Stage 5：策略进阶：Alpha 信号、组合风控与期权** | 17. 微观结构 Alpha：OFI 订单流不平衡 | OFI 订单流不平衡与信号衰减台 |
| | 18. 统计套利、配对交易与跨所单腿风险 | 配对价差 Z-Score 与单腿风险演练台 |
| | 19. 多策略组合、相关性崩塌与风险平价 | 相关性崩塌与风险平价对比台 |
| | 20. 期权定价、隐含波动率与 Delta-Gamma 对冲 | Black-Scholes 希腊字母与对冲台 |

---

## 二、Rust 量化代码实战书（4 篇 · 14 章）

| 篇章 | 章节 | 锚定 Rust 模块 |
| --- | --- | --- |
| **第 1 篇：零误差数据底座** | R01. 强类型领域建模与零浮点刻度 | `code/src/domain.rs` |
| | R02. L2 订单簿深度与增量同步作废 | `code/src/order_book.rs` |
| | R03. 双式记账、均价反手与幂等对账 | `code/src/ledger.rs` |
| **第 2 篇：撮合、执行与风控核心** | R04. 父单拆单执行与在途容量守恒 | `code/src/execution.rs` |
| | R05. 确定性撮合模拟器与 L2 排队模型 | `code/src/simulator.rs` |
| | R06. OMS 乱序状态机与 Uncertain 风险锁 | `code/src/oms.rs` |
| | R07. 独立硬风控、最坏敞口与 Kill Switch | `code/src/risk.rs` |
| **第 3 篇：协议、并发与高可靠系统** | R08. 交易所协议解码与离线固定样本回归 | `code/src/venue_fixture.rs` |
| | R09. 单写者事件循环与全序确定性回放 | `code/src/replay.rs` |
| | R10. Tokio 异步管线、有界背压与超时边界 | `code/tests/tokio_examples.rs` |
| **第 4 篇：量化算法库与端到端边界** | R11. 多重检验统计与 BH-FDR 控制 | `code/src/research.rs` |
| | R12. 微观结构 OFI 与配对单腿风控状态机 | `code/src/ofi.rs`, `code/src/pairs.rs` |
| | R13. Const Generics 风险平价与 Black-Scholes 定价 | `code/src/portfolio.rs`, `code/src/options.rs` |
| | R14. 端到端离线闭环与极端边界测试 | `code/src/bin/demo.rs`, `code/tests/` |

---

## 快速开始

### 1. 启动交互式学习站点（Astro 7 + React 19 + MDX + Tailwind CSS v4）

```bash
pnpm install
pnpm dev
```

打开浏览器访问 `http://localhost:4321` 即可体验全部 23 篇交易主书课程与 `/rust` 下的 14 篇 Rust 实战章节。

Astro / TypeScript 类型检查、内容一致性校验、前端回归与生产构建：

```bash
pnpm run check
pnpm build
```

也可用 `pnpm test` 单独运行子路径路由与弹窗键盘回归。`@astrojs/check` 当前使用 TypeScript 6，避免不兼容的 TypeScript 7 编译器 API。章节元数据保留在 MDX 中便于独立阅读，校验脚本使用 TypeScript 和 YAML 解析器核对目录中的全部共享字段及重复 ID，不从 Rust 源码生成章节。

### 2. 运行 Rust 伴随交易引擎与全量边界测试

```bash
# 运行全部单元、边界、异步与离线闭环测试
cargo test --manifest-path code/Cargo.toml --all-features

# 运行端到端离线交易演练 Demo
cargo run --manifest-path code/Cargo.toml --bin demo

# 校验 Criterion 性能基准测试可编译
cargo bench --manifest-path code/Cargo.toml --no-run
```

---

## 目录结构

```text
.
├── src/
│   ├── components/
│   │   ├── labs/           # 23 个专属量化交互实验室（React Islands）
│   │   └── ui/             # 通用学习组件（AnnotatedCode / PredictQuiz / Term / CommandPalette / BrandIcon）
│   ├── content/
│   │   ├── lessons/        # 23 篇零基础量化交互课程（MDX）
│   │   └── rust-chapters/  # 14 篇 Rust 量化代码实战章节（MDX）
│   ├── data/               # 双书课程路线图与术语词典元数据
│   ├── layouts/            # 站点与双书阅读布局
│   ├── lib/                # 学习进度、阅读器交互控制与子路径 URL 工具
│   └── pages/              # 首页、Rust 书首页、动态章节路由与 404 页
├── scripts/
│   └── verify-content.mjs  # 双书元数据、术语 ID、代码引用与相对路径一致性校验
├── code/                   # 可编译、可测试的 Rust 量化交易核心引擎
│   ├── src/                # domain / order_book / execution / ledger / simulator / research / oms / risk / venue_fixture / replay / ofi / pairs / portfolio / options
│   ├── tests/              # trading_boundaries / offline_trading_loop / tokio_examples
│   ├── examples/           # 7 个独立可运行示例程序
│   └── benches/            # Criterion 性能基准
└── .github/workflows/      # CI 校验（TS + 内容一致性 + Astro 构建 + Rust fmt/clippy/test/MSRV）与 GitHub Pages 部署
```
