# 附录使用指南：按问题查，不必顺序读

附录不是第 29 章以后的连续正文。它们承担速查、补课、练习反馈、评审和课程维护等不同职责。遇到具体问题时按本页选择，不建议从 A 连续读到 O。

## 学习过程中随时使用

| 需要 | 附录 | 什么时候打开 |
| --- | --- | --- |
| 查术语、方向或公式 | [A 术语与公式速查](appendix-a-glossary.md) | 同一个词在不同章节出现时 |
| 做工程自检 | [B 工程检查清单](appendix-b-checklists.md) | 提交、演示或进入 gate 前 |
| 查看练习提示和验收 | [C 全章练习指南](appendix-c-exercise-guidance.md) | 独立尝试后卡住，或准备检查点时 |
| 定位学习卡点 | [G 学习故障排查](appendix-g-learning-troubleshooting.md) | 不知道问题属于路径、编译、状态、账务还是研究时 |
| 训练识别坏设计 | [M 错误实现审查题](appendix-m-failure-reviews.md) | 能读正确示例，但不会独立审查时 |

## 进入特定主题前使用

| 需要 | 附录 | 建议时点 |
| --- | --- | --- |
| 补概率统计和时间序列直觉 | [F 量化数学预备](appendix-f-math-primer.md) | 第 13、16、25 章前按需使用 |
| 理解数据版本和 lineage | [L 数据工程与可追溯性](appendix-l-data-lineage.md) | 第 18、23、25、27 章 |
| 从 fixture 进入真实公开观察 | [K 公开行情实训](appendix-k-public-market-data-lab.md) | 第 20 章后 |
| 核对外部定义与规则来源 | [E 参考资料与规则来源](appendix-e-references.md) | 实现 venue/product 规则之前 |
| 检查版本与兼容边界 | [D 版本与变更记录](appendix-d-versioning.md) | 环境升级或规则变化时 |

## 完成一个部分时使用

| 需要 | 附录 | 使用方式 |
| --- | --- | --- |
| 从卡点走到完整实验 | [I 六个带反馈实验](appendix-i-guided-labs.md) | 每个主线部分完成一个 |
| 独立尝试后核对完整方案 | [O 实验参考解答](appendix-o-lab-solutions.md) | 已保存自己的失败与实现之后 |
| 请同伴做结构化评审 | [H 阶段评审脚本](appendix-h-review-scripts.md) | 自评通过后再使用 |
| 选择毕业项目深度 | [J 三条毕业方向](appendix-j-graduation-tracks.md) | 检查点五之后 |

## 教学与维护时使用

[N 课程试读与维护](appendix-n-course-feedback.md)用于记录真实读者的耗时、卡点、提示使用和独立复现结果。它面向作者、导师和学习小组组织者，不是普通读者的必读内容。

## 推荐的最小附录组合

### 第一次学 Rust

```text
A 术语速查 + C 练习提示 + G 学习排障
```

### 第一次做交易系统

```text
B 工程清单 + H 评审脚本 + I 带反馈实验 + M 错误审查
```

### 第一次做量化研究

```text
F 数学预备 + L 数据 lineage + I 第五部分实验
```

### 准备毕业项目

```text
J 方向选择 + H 最终评审 + B 工程清单
```

只打开当前任务真正需要的附录。附录用于减少查找成本，不应成为新的阅读负担。
