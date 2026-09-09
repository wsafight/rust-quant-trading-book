# 附录 K 公开行情实训

本实训把固定样本扩展为一次真实公开数据观察，但不需要账户、不使用 API key，也不发送订单。目标是验证你能否把变化中的外部协议收窄为可保存、可重放、可失效的数据契约。

真实网络不是核心测试的替代品。如果所在地网络、服务条款或交易所限制不允许连接，应使用冻结样本完成相同流程，并把证据标记为 offline fixture。

## K.1 安全与合规边界

- 只使用无需认证的公开行情；
- 阅读并遵守服务条款和请求频率限制；
- 不绕过地区、账户或网络限制；
- 不记录 API key、账户消息或个人信息；
- 不把公开连接成功描述成交易接入或生产经验；
- 运行前设置磁盘、消息大小、连接时长和自动停止上限。

## K.2 选择范围

第一次实训只选择：

- 一家 venue；
- 一个现货或线性合约产品；
- 一个公开 L2 频道；
- 一种 snapshot/delta 同步算法；
- 30 分钟试运行和最长 6 小时观察。

不要同时做多交易所价差、真实下单、策略盈利或无限期数据采集。

## K.3 冻结协议事实

实现前保存 manifest：

```text
venue
product / instrument
REST snapshot endpoint
WebSocket channel
sequence fields and synchronization rule
price / quantity precision
checksum rule if any
message size and rate limits
official page URL
accessed_at
raw metadata checksum
adapter schema version
```

把官方规则改写成事件表，并明确哪些内容是文档事实、实际观察或本地假设。

## K.4 原始记录格式

每条记录至少保存：

```text
venue
connection_id
channel
instrument
receive_time_ns
local_sequence
payload_length
raw_payload
recorder_version
schema_version
```

原始文件采用 append-only 分段；每条消息有长度和 checksum；半条记录或损坏必须可检测。文件轮转、压缩和保留策略应写入 manifest。

禁止使用系统收到消息的先后位置，偷偷替代 venue sequence。`local_sequence` 只用于本地稳定排序和识别记录，不证明交易所事件顺序。

## K.5 观察但不交易

记录器至少暴露：

- connection lifecycle；
- last byte、last frame、last valid event；
- message count、bytes 和 rate；
- decode error；
- duplicate、out-of-order 和 sequence gap；
- snapshot 获取与同步耗时；
- 当前 book state 和 age；
- 磁盘写入失败和剩余容量。

即使 book 为 Healthy，本实训也不允许把结果用于真实订单。

## K.6 从 raw 到可用状态

明确分层：

```text
raw payload
-> schema decode
-> decimal normalization
-> normalized snapshot/delta
-> sequence synchronizer
-> order-book invariant
-> freshness
-> observed usable book
```

每层错误分别记录。未知字段可以兼容，不代表关键字段缺失也能继续；decoder 成功也不代表 synchronizer 接受；结构有效也不代表数据仍新鲜。

## K.7 必做故障

从真实记录复制出离线 fixture，再完成：

1. 删除一条 delta；
2. 重复一条 delta；
3. 打乱两条 delta；
4. 修改一个价格为非法精度；
5. 删除关键字段；
6. 截断最后一条原始记录；
7. 让 heartbeat 存在但业务事件停止；
8. 模拟 snapshot 请求期间缓存溢出。

预期不是让所有输入都“尽量解析”，而是让每种损坏产生明确、保守且可观察的状态。

## K.8 数据质量报告

报告至少包含：

```markdown
# 公开行情数据质量报告

## 范围与来源
- venue / instrument / channel：
- 文档 URL 与访问日期：
- recorder / schema / metadata version：

## 输入证据
- 起止时间与时区：
- 文件列表、大小与 checksum：
- 总消息数与字节数：

## 质量结果
- decode failure：
- duplicate / out-of-order / gap：
- event/receive time 异常：
- resync 次数与耗时：
- book age 分布：

## 故障注入
- 注入内容：
- 预期状态：
- 实际状态：
- 恢复证据：

## 限制
- 当前无法观测：
- 不能外推：
- 下一次需要校准：
```

## K.9 完成标准

- 同一原始数据重复回放得到相同规范事件和最终摘要；
- 删除一条 delta 后不再输出可用 book；
- schema、sequence、invariant 和 freshness 错误可以区分；
- 报告可追到原始文件、规则版本和代码版本；
- 另一位读者无需真实连接即可使用冻结 fixture 复现；
- 文档明确说明这不是私有接入、下单系统或生产证据。

本实训建议在第 20 章后完成，并把结果作为检查点四与第 27 章的输入。
