export interface RustChapterMeta {
  chapterNumber: number;
  chapterCode: string;
  slug: string;
  part: number;
  partName: string;
  title: string;
  subtitle: string;
  engineeringGoal: string;
  rustConcepts: string[];
  readMinutes: number;
  quantLessonSlug?: string;
  quantLessonTitle?: string;
}

export interface RustPartMeta {
  part: number;
  name: string;
  tagline: string;
}

export const RUST_PARTS: RustPartMeta[] = [
  {
    part: 1,
    name: '零误差数据底座',
    tagline: '用 Newtype、BTreeMap 与 i128 整数刻度彻底消灭浮点误差、单位混用与脏盘口。',
  },
  {
    part: 2,
    name: '撮合、执行与风控核心',
    tagline: '用带数据枚举和穷尽 match 把拆单容量、撮合队列、OMS 乱序状态机与最坏风控焊死在编译期。',
  },
  {
    part: 3,
    name: '协议、并发与高可靠系统',
    tagline: '通过零浮点 serde 解析、单写者全序堆与 Tokio 有界背压守住极端行情下的确定性。',
  },
  {
    part: 4,
    name: '量化算法库与端到端边界',
    tagline: '用 Const Generics、零分配快照与 NaN/Inf 严格拒收实现策略算法与全链路防线。',
  },
];

export const RUST_CURRICULUM: RustChapterMeta[] = [
  // Part 1
  {
    chapterNumber: 1,
    chapterCode: 'R01',
    slug: 'r01-domain-modeling',
    part: 1,
    partName: '零误差数据底座',
    title: '强类型领域建模与零浮点刻度',
    subtitle: '用 Newtype 与私有字段在编译期拦住“把价格当数量传进去”的致命事故',
    engineeringGoal: '构造 PriceTicks / QtyLots / MoneyTicks 整数领域类型，杜绝浮点舍入与单位混用',
    rustConcepts: ['Newtype 包装', '私有字段不变式', 'Option 防非法输入', 'checked_mul'],
    readMinutes: 12,
    quantLessonSlug: '00b-trading-language-basics',
    quantLessonTitle: '00B：看懂交易账单的 5 个基本词',
  },
  {
    chapterNumber: 2,
    chapterCode: 'R02',
    slug: 'r02-order-book-sync',
    part: 1,
    partName: '零误差数据底座',
    title: 'L2 订单簿深度与增量同步作废',
    subtitle: '用 BTreeMap 维护买卖盘口，并在序列号断档或价差倒挂时立刻作废整本盘口',
    engineeringGoal: '实现有序买卖盘查询、增量更新校验与 fail-closed 状态作废',
    rustConcepts: ['BTreeMap 有序集合', 'Result 与 ? 传播', '自定义 Error 枚举', '&mut self 借用'],
    readMinutes: 14,
    quantLessonSlug: '01-order-book-impact',
    quantLessonTitle: '01：屏幕上写着 100 块，为什么买到手变成 100.42？',
  },
  {
    chapterNumber: 3,
    chapterCode: 'R03',
    slug: 'r03-double-entry-ledger',
    part: 1,
    partName: '零误差数据底座',
    title: '双式记账、均价反手与幂等对账',
    subtitle: '用 i128 算清多空反手盈亏，用 HashSet 幂等键拦住重复成交回报',
    engineeringGoal: '实现零误差已实现盈亏、持仓均价更新、部分平仓反手与幂等去重',
    rustConcepts: ['i128 防溢出', 'HashMap 幂等记录', 'checked_add / checked_sub', '不可变账本流'],
    readMinutes: 14,
    quantLessonSlug: '07-double-entry-ledger-pnl',
    quantLessonTitle: '07：赚了还是亏了？交易账户到底怎么算账才不出错',
  },

  // Part 2
  {
    chapterNumber: 4,
    chapterCode: 'R04',
    slug: 'r04-execution-split',
    part: 2,
    partName: '撮合、执行与风控核心',
    title: '父单拆单执行与在途容量守恒',
    subtitle: '拆单撤单重发时，为什么 PendingCancel 也必须占住父单剩余额度？',
    engineeringGoal: '用枚举表达 TWAP/VWAP 拆单计划并确保在途容量守恒不超买',
    rustConcepts: ['enum 策略分支', '切片窗口迭代', '整数拆单防余数丢失', '容量不变量'],
    readMinutes: 13,
    quantLessonSlug: '03-order-types-twap-vwap',
    quantLessonTitle: '03：大单拆成小单慢慢买，真的省钱吗？',
  },
  {
    chapterNumber: 5,
    chapterCode: 'R05',
    slug: 'r05-matching-simulator',
    part: 2,
    partName: '撮合、执行与风控核心',
    title: '确定性撮合模拟器与 L2 排队模型',
    subtitle: '用 Rust 枚举把 Touch、TradeThrough 与 L2Queue 三种成交假设写在同一引擎里',
    engineeringGoal: '构建支持延迟建模、排队消耗与原子序号分配的离线撮合器',
    rustConcepts: ['enum 撮合模型', 'saturating_sub 队列消耗', '单调时钟校验', '原子序号分配'],
    readMinutes: 14,
    quantLessonSlug: '08-event-driven-backtest-models',
    quantLessonTitle: '08：为什么“历史回测年化 200%”，一买真钱就亏？',
  },
  {
    chapterNumber: 6,
    chapterCode: 'R06',
    slug: 'r06-oms-state-machine',
    part: 2,
    partName: '撮合、执行与风控核心',
    title: 'OMS 乱序状态机与 Uncertain 风险锁',
    subtitle: '当“成交”比“确认”先到、超时紧随其后，如何让编译器逼你穷尽每一种状态转移？',
    engineeringGoal: '用带数据枚举吸收乱序回报、禁止终态回退并锁定超时未知单',
    rustConcepts: ['带数据 enum', 'match 穷尽检查', '所有权 Move 防误用', '单调终态不变量'],
    readMinutes: 15,
    quantLessonSlug: '11-oms-state-machine',
    quantLessonTitle: '11：点了下单转圈圈，千万别连点两次！',
  },
  {
    chapterNumber: 7,
    chapterCode: 'R07',
    slug: 'r07-hard-risk-engine',
    part: 2,
    partName: '撮合、执行与风控核心',
    title: '独立硬风控、最坏敞口与 Kill Switch',
    subtitle: '用纯函数和 Copy 只读快照算出 worst_long / worst_short，任何异常默认拒单',
    engineeringGoal: '实现与策略解耦的前置风控闸门，覆盖在途单、未知单与过期行情',
    rustConcepts: ['Copy 只读快照', '纯函数风控判定', 'RiskDecision 枚举', 'fail-closed 默认拒绝'],
    readMinutes: 13,
    quantLessonSlug: '12-hard-risk-kill-switch',
    quantLessonTitle: '12：为什么专业团队都要装一个“红色急停按钮”？',
  },

  // Part 3
  {
    chapterNumber: 8,
    chapterCode: 'R08',
    slug: 'r08-venue-fixtures',
    part: 3,
    partName: '协议、并发与高可靠系统',
    title: '交易所协议解码与离线固定样本回归',
    subtitle: '不经 f64 直接把 JSON 价格字符串解析为整数刻度，拒收超精度脏字段',
    engineeringGoal: '实现 serde 协议适配层与零浮点定点字符串解析器',
    rustConcepts: ['#[serde(rename)]', '定长数组约束', '字符级定点解析', '拒绝非零多余小数'],
    readMinutes: 13,
    quantLessonSlug: '13-venue-protocols-fixtures',
    quantLessonTitle: '13：不同交易所规则五花八门，新手最容易在哪踩坑？',
  },
  {
    chapterNumber: 9,
    chapterCode: 'R09',
    slug: 'r09-single-writer-replay',
    part: 3,
    partName: '协议、并发与高可靠系统',
    title: '单写者事件循环与全序确定性回放',
    subtitle: '为什么放弃共享读写锁，改用所有权独占 + BinaryHeap<Reverse> 保证 100% 可复现？',
    engineeringGoal: '设计按全序键排序的事件回放器，拒绝时钟倒退与重复事件键',
    rustConcepts: ['BinaryHeap<Reverse>', '元组 Ord 全序', '所有权独占无锁', '时钟单调校验'],
    readMinutes: 14,
    quantLessonSlug: '14-single-writer-replay',
    quantLessonTitle: '14：两个记账员同时改一本账，为什么一定会算错？',
  },
  {
    chapterNumber: 10,
    chapterCode: 'R10',
    slug: 'r10-tokio-backpressure',
    part: 3,
    partName: '协议、并发与高可靠系统',
    title: 'Tokio 异步管线、有界背压与超时边界',
    subtitle: '用有界通道挡住行情洪峰，并把网络超时做成显式本地等待边界',
    engineeringGoal: '掌握 tokio::sync::mpsc 背压、timeout 本地语义与 owned 任务返回值',
    rustConcepts: ['tokio::sync::mpsc', '有界容量背压', 'tokio::time::timeout', 'Send + static 所有权'],
    readMinutes: 13,
    quantLessonSlug: '15-backpressure-p99-latency',
    quantLessonTitle: '15：平时网速很快，为什么暴跌那天软件直接卡死？',
  },

  // Part 4
  {
    chapterNumber: 11,
    chapterCode: 'R11',
    slug: 'r11-research-fdr',
    part: 4,
    partName: '量化算法库与端到端边界',
    title: '多重检验 FDR 与数值稳定性边界',
    subtitle: '用 f64::total_cmp 解决浮点排序陷阱，实现 Benjamini-Hochberg 假发现率控制',
    engineeringGoal: '对 NaN / Infinity / 越界概率返回 Err，保证统计过滤函数绝不静默失真',
    rustConcepts: ['f64::total_cmp', 'is_finite 入口守卫', '闭区间边界校验', 'Result 统计语义'],
    readMinutes: 12,
    quantLessonSlug: '09-multiple-testing-overfitting',
    quantLessonTitle: '09：挑了 100 套参数选出最赚的，是真规律还是碰运气？',
  },
  {
    chapterNumber: 12,
    chapterCode: 'R12',
    slug: 'r12-ofi-and-pairs',
    part: 4,
    partName: '量化算法库与端到端边界',
    title: '微观结构 OFI 特征与配对单腿状态机',
    subtitle: '用 Ordering 三路匹配实现零分配 OFI，用状态枚举管住配对套利单腿超时强平',
    engineeringGoal: '构建栈上 Copy 特征提取器与带协整破裂止损的配对状态机',
    rustConcepts: ['Ordering 三路匹配', '栈上 Copy 零分配', '双腿状态枚举', '除零守卫'],
    readMinutes: 14,
    quantLessonSlug: '17-order-flow-imbalance-alpha',
    quantLessonTitle: '17：怎么从排队人群的变化，猜出未来几秒涨还是跌？',
  },
  {
    chapterNumber: 13,
    chapterCode: 'R13',
    slug: 'r13-portfolio-and-options',
    part: 4,
    partName: '量化算法库与端到端边界',
    title: '风险平价组合权重与 Black-Scholes Greeks',
    subtitle: '用 Const Generics 编译期锁死资产维度，用 bool::then_some 拦截非正到期时间',
    engineeringGoal: '实现定长数组波动率倒数归一化权重与具名期权 Greeks 定价器',
    rustConcepts: ['Const Generics <const N>', '定长数组零堆分配', 'bool::then_some', '具名 Greeks 结构体'],
    readMinutes: 14,
    quantLessonSlug: '20-options-greeks-delta-gamma',
    quantLessonTitle: '20：期权入门：为什么卖期权像开保险公司？',
  },
  {
    chapterNumber: 14,
    chapterCode: 'R14',
    slug: 'r14-e2e-boundaries',
    part: 4,
    partName: '量化算法库与端到端边界',
    title: '全链路离线闭环与极端故障边界设计',
    subtitle: '把盘口、策略、风控、OMS、撮合与账本串成零误差闭环，复盘 17 类必测实盘边界',
    engineeringGoal: '建立不依赖实盘网络的全链路确定性架构与重启对账防线',
    rustConcepts: ['模块边界解耦', '数据流单向编排', '不变量边界清单', '端到端确定性闭环'],
    readMinutes: 15,
    quantLessonSlug: '16-e2e-fault-recovery',
    quantLessonTitle: '16：断网、停电、软件闪退后，重启前必须做的 3 件事',
  },
];
