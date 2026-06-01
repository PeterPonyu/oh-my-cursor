# oh-my-cursor 增强计划

**基于 oh-my-claudecode v4.13.5 与同类 Codex 端插件 v0.14.1 对比分析**

> 产出方式：hyperplan 5 人对抗团队（unspecified-low, unspecified-high, ultrabrain, artistry, deep）
> 3 轮独立分析 → 交叉攻击 → 辩护/修正/让步 → Plan Agent 结构化
> 产出日期：2026-05-21

---

## 一、当前状态：治理最好的工作流骨架——但还不会走路

oh-my-cursor 在**治理、文档完整性和 Hook 覆盖**方面表现卓越：

| 资产 | 数量 | 质量评价 |
|------|------|---------|
| Agents | 14 个（全 `model: auto`） | 严格的 frontmatter，基准驱动的模型锁定 |
| Skills | 14 个（仅手动触发） | 按阶段对齐，无关键词自动检测 |
| Hooks | 19 个 Python 脚本 | 完整 Cursor 生命周期覆盖，fail-open |
| 验证脚本 | 18+ 个 | ruff/mypy/schema/artifact 验证器 |
| MCP bridge | 6 工具（仅 state CRUD） | jail + auth + trace，opt-in 安装 |
| 文档 | 22 个文件 | claim/proof 纪律严格，仅英文 |
| 测试 | 4 个 pytest 文件 | 仅 import 健全性，无行为测试 |
| CI | 1 workflow (PR→main) | MCP bridge 测试未纳入 CI |

**核心问题**：无执行模式、无团队编排、无持久化记忆、无自动触发、无可取消机制。
14 个 agents、14 个 skills、19 个 hooks 组成了一副精美的骨架——但没有肌肉。

### 当前已知的内部问题

| 问题 | 严重程度 |
|------|---------|
| `docs/PRD.yaml` 路径过时（引用 `.cursor/hooks.json` 应为 `hooks/hooks.json`） | 中 |
| `docs/PRD.yaml` agent 数量错误（写 12，实际 14） | 中 |
| `docs/specs/` 为空（仅 `.gitkeep` + README） | 低 |
| `benchmark/case-studies/` 为空（仅 `__pycache__/`） | 低 |
| `.cursor/hooks/` 几乎为空（仅 `state/` 子目录）——所有真实脚本在根 `hooks/` | 中 |
| 测试覆盖仅骨架（`tests/hooks/` 中 4 个文件） | 高 |
| `rules/` 仅 1 个规则文件 | 低 |

---

## 二、三项目对比分析

| 维度 | oh-my-claudecode (v4.13.5) | 同类 Codex 端插件 (v0.14.1) | oh-my-cursor (当前) | 策略 |
|------|:---:|:---:|:---:|---|
| Hook 覆盖 | 部分 | 部分 | **完整 (14 事件)** | 保持领先 |
| 执行模式 | Ralph, Ultrawork, Autopilot, Team... | 基础 | **无** | 构建有界自主 |
| 团队编排 | task board, 消息, 依赖 DAG | 基础 | **无** | 轻量级协调 |
| 记忆/持久化 | project-memory, notepad, wiki | 少量 | **无** | 添加 notepad + project-memory |
| 打包/分发 | npm 包, CI/CD, 多语言文档 | npm 包, 网站 | **bash 脚本安装** | 添加版本发布 |
| Skill 触发 | 关键词自动检测 | CLI 触发 | **仅手动调用** | 添加关键词路由 |
| 治理/文档 | 基础 | 基础 | **业界最佳** | 核心差异化优势 |
| Agent 数量 | 19 | 33 prompts | **14** | 选择性增加 5-7 个 |
| Skill 数量 | 39 | 38 | **14** | 增加到 20-25 个 |
| 语言 | TypeScript + Node.js | Rust + TypeScript | Python（stdlib-only） | Phase 0.5 决策 |

### 9 个 MAJOR 差距（经 3 轮对抗修正，无 CRITICAL）

1. **状态扩展** — 当前为单任务模型，需要 multi-task、session 持久化、project memory
2. **Hook 架构天花板** — subprocess 延迟、硬编码注册表、只读契约限制了自主能力
3. **MCP bridge 功能面窄** — 仅 state CRUD，无 browser/docs/API 集成
4. **打包成熟度** — 无版本发布、无更新机制、无完整性校验
5. **CI/测试** — MCP bridge 测试排除在 CI 之外，行为测试缺失
6. **团队编排** — 无 inter-agent messaging，无 task dependency——仅需轻量级协调
7. **Skill 手动触发** — 无关键词检测、无自动加载、无 workflow chaining
8. **社区/生态** — 无网站、无 community channel、无 marketplace
9. **配置系统** — 散落的 env vars，无结构化配置

---

## 三、分阶段增强路线图

### Phase 0.5 — 运行时架构决策（1-2 周）

**目标**：决定架构天花板——"增强的 docs+hooks 指导层"还是"Cursor 自主引擎"？

| # | 任务 | 说明 |
|---|------|------|
| 0.1 | 评估 legacy Python-only 上限 | 当前 docs+hooks 架构能否支撑有界自主？如果不能，需要什么？ |
| 0.2 | 运行时层决策 | legacy Python runtime？引入 TypeScript hybrid？不需复制 OMC 的 src/ 树 |
| 0.3 | 确定产品边界 | 核心竞争力是什么？与其他 OMC 变体的差异化定位？ |
| 0.4 | 产出架构决策文档 | 记录在 docs/architecture-decision.md |

### Phase 1 — 可信基础（2-3 周）

**目标**：使仓库可被信任、可验证、可安装。

**P0（必须完成）：**

| # | 任务 | 说明 |
|---|------|------|
| 1.1 | 修复 `docs/PRD.yaml` 过时路径 + agent 数量错误 | `.cursor/hooks.json` → `hooks/hooks.json`，12 → 14 |
| 1.2 | 完善 CI：增加 MCP bridge 测试、markdown lint、链接检查 | 修改 `.github/workflows/python-ci.yml` path filter |
| 1.3 | 扩展 pytest：agent/skill frontmatter 验证、state schema 行为测试 | 新增 `tests/agents/`、`tests/state/` 测试目录 |
| 1.4 | 安装 smoke test | 干净 Cursor 工作区验证：`scripts/smoke-install.sh` |
| 1.5 | 修正 docs 中 hook 数量（14 不是 15） | 涉及 AGENTS.md、README.md |

**P1（高优先级）：**

| # | 任务 | 说明 |
|---|------|------|
| 1.6 | 将 agent 注册改为数据驱动 | 扫描 `agents/*.md` frontmatter，消除 `_active_role.ts` / `tool-guard.ts` / `subagent-bootstrap.ts` 中的硬编码 |
| 1.7 | 澄清 role map | 14 agent 去重、明确边界，避免 implementer/executor 重叠 |
| 1.8 | 增加 agents/: analyst, writer, document-specialist | 3 个最高杠杆角色，prompt-only |
| 1.9 | 增加 skills/: cancel, omc-reference | 安全 + 可发现性 |

**P2（中优先级）：**

| # | 任务 | 说明 |
|---|------|------|
| 1.10 | 填充 `docs/specs/` 示例 | 证明 deep-interview 流程可行 |
| 1.11 | 填充 `benchmark/case-studies/`（或标记 WIP） | 避免空目录混淆 |
| 1.12 | 增加 `rules/` 中 agent 生命周期 + skill 使用模式规则 | 更好的 guardrails |
| 1.13 | 增加 CONTRIBUTING.md + SECURITY.md | 社区基础 |

### Phase 1.5 — 状态架构扩展（2-3 周）

**目标**：为有界自主提供状态基础。

**必须项：**

| # | 任务 | 说明 |
|---|------|------|
| 1.14 | 扩展 state schema：multi-task 模型 | 定义 `tasks[]` 结构（当前为未 schema 的 stub） |
| 1.15 | 添加 session 持久化 | 跨会话状态保留，`.cursor/state/sessions/` |
| 1.16 | 添加 project-memory | 类似 OMC 的 `.omc/project-memory.json` |
| 1.17 | 添加 notepad | 类似 OMC 的 `.omc/notepad.md` |
| 1.18 | 添加取消标记 + 锁清理 | 为自主工作流提供安全出口 |

**建议项：**

| # | 任务 | 说明 |
|---|------|------|
| 1.19 | 跨平台锁支持 | 替代 `fcntl`-only 方案，Windows 兼容 |
| 1.20 | 结构化日志/可观察性 | 升级 `_trace.ts` 为默认按需启用 |

### Phase 2 — 生命周期工作流对标 + Cursor 原生展示（2-3 周）

**目标**：覆盖核心工作流 + 证明 Cursor 原生差异化。

| # | 任务 | 说明 |
|---|------|------|
| 2.1 | 增加 skills/: deepinit, external-context, ai-slop-cleaner, ultraqa | 选择性对标 OMC 经验证的流程 |
| 2.2 | 增加 skill 关键词自动检测 | 扩展 `prompt-router.ts`，自动加载匹配 skill |
| 2.3 | 构建 **Context Recipe Library** | `docs/cursor-workflows/*.md` — @Files/@Git/@Docs 配方模板 |
| 2.4 | 构建 **Rule Doctor 静态审计** | 验证 `.cursor/rules/` 与 docs 的 claim 一致性 |
| 2.5 | 构建 **Context Lens Cards** | 按领域生成的 context 建议卡片（hooks/agents/rules/MCP） |
| 2.6 | 构建 **@Git Review Recipe** | 基于 `@Git` 的变更文件审查工作流 |
| 2.7 | 增加 agents/: git-master, code-simplifier | 按需扩展 |
| 2.8 | 端到端生命周期工作流验证 | intake → research → plan → execute → verify → review |

### Phase 3 — 有界自主（2-3 周）

**目标**：在安全门控下引入自主能力。

**约束**：所有自主工作流必须有界步骤、强制取消、验证门、审查门。

| # | 任务 | 前置依赖 |
|---|------|---------|
| 3.1 | 构建 ralplan（共识规划门控） | Phase 1.5 状态扩展 |
| 3.2 | 构建受限 autopilot（单 session、有界步骤、强制验证） | ralplan + 取消机制 |
| 3.3 | ultraqa 强制验证通道（自主工作的必须验证） | autopilot |
| 3.4 | 轻量级团队协调（task queue + 依赖提示） | 状态扩展 |
| 3.5 | 添加 project-session-manager（worktree 管理） | 仅在安全时启用 |

### Phase 4 — 分发/社区/polish（2-3 周）

**目标**：可被发现、可被采用、可被贡献。

| # | 任务 | 说明 |
|---|------|------|
| 4.1 | 版本化发布 + changelog 纪律 | GitHub Releases，semver |
| 4.2 | npm 包（仅作为分发/安装器） | 不声称官方 Cursor 插件加载 |
| 4.3 | 多语言文档（中文优先） | README.zh.md, docs/zh/ |
| 4.4 | 社区模板 | issue forms, PR template, discussion categories |
| 4.5 | 基准测试 | 工作流完成率、安装成功率、文档新鲜度 |
| 4.6 | 可选 polish | HUD, notifications, visual-verdict（Phase 4 后期） |

---

## 四、快速修复清单（< 1 周，可并行）

| # | 修复 | 时间 |
|---|------|------|
| Q1 | 修复 `docs/PRD.yaml` 过时路径 + agent 数量 | 15 分钟 |
| Q2 | 增加 agent/skill frontmatter 验证测试 | 1 小时 |
| Q3 | 填充一个 sample spec 到 `docs/specs/` | 30 分钟 |
| Q4 | 增加 MCP bridge 测试到 CI（修改 path filter） | 15 分钟 |
| Q5 | 修正 docs 中 hook 数量 | 5 分钟 |
| Q6 | 填充 `benchmark/case-studies/`（或标记 WIP） | 30 分钟 |
| Q7 | 增加 CONTRIBUTING.md + SECURITY.md | 1 小时 |

---

## 五、硬性取舍

### ❌ 不做

| 决策 | 原因 |
|------|------|
| 将 autopilot/ralph/ultrawork 排为 P0 | 它们是输出不是输入——需要状态/取消/CI 先到位 |
| 声称 Cursor 后台 agent 编排 | repo 文件不预配此功能——违反 claim/proof 纪律 |
| 将 MCP 设为默认安装 | 保持最小化、opt-in |
| 早期发布 self-improve | 不可控变异风险，破坏证据驱动定位 |
| 优先 HUD/通知 | 信任和功能在前 |
| 盲目复制 OMC 命名 | 如不匹配 Cursor 语义，重命名或限定 |
| npm 在 truth 之前 | npm 是渠道不是产品 |

### ✅ 做

| 决策 | 原因 |
|------|------|
| 选择性对标经验证的工作流 | deepinit, external-context, ai-slop-cleaner 强化生命周期 |
| 嵌入一个早期 Cursor 原生差异化 | 证明身份，不只是"OMC 缩小版" |
| 信任优先于功能 | CI/验证/证明/安装 > agent 数量 > skill 数量 > 自主 |
| 保持 checked-in agent 使用 `model: auto` | 除非基准证明需要固定模型 |
| 严格 claim/proof 纪律 | 每 PR 验证 ownership class、proof class、references |

---

## 六、风险与成功指标

### 关键风险

| 风险 | 严重性 | 缓解措施 |
|------|--------|---------|
| 声称不受支持的 Cursor 能力 | 高 | 严格 claim/proof 纪律，每 PR 验证 |
| 自主伤害（无界循环、错误编辑） | 高 | 有界步骤、强制取消、验证门、审查 |
| Host 产品漂移（Cursor API 变更） | 中 | 不依赖推测性 API，仅使用已记录表面 |
| 维护膨胀 | 中 | 每 skill/agent 增加文档/示例/验证负担预算 |
| Python-hook-only 天花板 | 中 | Phase 0.5 运行时决策，明确架构边界 |
| 社区支持悬崖（分发过早） | 中 | npm 仅在 Phase 4，验证 + 安装就绪后 |

### 成功指标（每阶段）

**Phase 1：**
- CI 完全通过（ruff/mypy/pytest/MCP bridge）
- 安装 smoke test 干净
- 100% capability claims 映射到 proof class + reference
- 零已知不受支持的声明

**Phase 1.5：**
- Multi-task 状态 schema 验证通过
- Session 持久化测试通过
- 取消标记功能可用

**Phase 2：**
- 每个生命周期阶段有文档化的 agent/skill 路径
- Context Recipe Library 有 3+ 配方
- Rule Doctor 通过所有测试

**Phase 3：**
- 自主工作流有界步骤 + 取消 + 验证 + 审查门
- >80% 基准任务完成率（无人工修复）
- 0 严重安全/隐私事件

**Phase 4：**
- 跨 OS/shell 矩阵安装成功率
- 发布节奏稳定（changelog + migration notes）
- 社区贡献不降低 docs/proof 质量

---

## 七、总结

oh-my-cursor 不需要也不应该成为 oh-my-claudecode 的缩小版。

它的差异化优势是 **Cursor 原生 + 证据驱动 + 治理卓越**。增强路线从"可信基础"开始，经过"状态扩展"和"生命周期对标"，最终到达"有界自主"——每一步都在已有优势（hooks, governance, MCP bridge）上构建，而不是盲目追逐功能数量。

**核心竞争力**：不是"比 OMC 多一个 skill"，而是"在 Cursor 里比任何人都更可信、更安全、更可验证"。

---

> 本计划由 hyperplan 5 人对抗团队（unspecified-low: 差距编目, unspecified-high: 结构分析,
> ultrabrain: 战略路线图, artistry: Cursor 原生创新, deep: 详尽实现对比）
> 经过 3 轮独立分析 → 交叉攻击 → 辩护/修正/让步 → Plan Agent 结构化产出。
> 产出日期：2026-05-21
