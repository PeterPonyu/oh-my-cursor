<!-- source-sha256: AGENTS.md 0b4e1f3bc657ea883f714de8ccb4a65d2fb9511e83e4bfe8a2d4faa4efd89b53 -->
# oh-my-cursor 仓库指令与策略

本仓库是一个 Cursor 原生的工作流主干骨架——一个向 Cursor 工作区交付规则（rules）、技能（skills）、智能体（agents）和生命周期钩子（hooks）的本地插件。请保持文档先行、以证据为支撑，并明确区分哪些是仓库检入的产物，哪些是 Cursor 本身的产品功能。

## 核心规则

- 保持仓库文档先行（docs-first）和证据支撑（evidence-backed）。
- 优先维护根目录的 `AGENTS.md`、`.cursor/rules/`、`hooks/hooks.json` 和 `agents/`，而不是推测性的运行时或打包层。
- 当修改 `AGENTS.md`、`README.md`、`docs/**` 或 `.cursor/rules/**` 中的功能声明时，必须在同一个变更中更新 `docs/references.md`，写明官方引用链接和访问日期。
- 将推论（inference）明确标记为推论。

## 编辑准则

- 推荐小巧、易于审查的文档和规则变更。
- 措辞要贴合 Cursor 原生和特定产品特性。
- 如果某个界面或功能存在歧义，请退回到基本的仓库指南和限定范围的规则，避免使用推测性的自动化手段。

## 智能体模型策略

- `agents/` 下所有检入的智能体均使用 `model: auto`，由 Cursor 宿主环境为该角色自动选择最佳可用模型。
- 切勿将智能体修改为固定模型，除非有可复现的基准测试（benchmark）能证明必须使用该特定模型。

## 推广与功能边界

- **不要**声明已检入的 Cursor 插件/包加载机制，除非有当前的 Cursor 官方文档直接证明。
- **不要**假定自定义模式（custom modes）具有检入的项目文件格式，除非该格式有官方文档的正式记录。
- **不要**假定后台智能体（background agents）是从仓库文件中自动配置并运行的，除非有明文文档记录。
- 生命周期钩子、智能体和工作流状态助手仅在以下范围内属于“仓库所有（repo-owned）”：`hooks/hooks.json`、`hooks/`、`agents/`（14个角色：`orchestrator`、`architect`、`researcher`、`planner`、`implementer`、`qa-tester`、`verifier`、`critic`、`code-reviewer`、`debugger`、`tracer`、`security-reviewer`、`explore`、`test-engineer`）、`.cursor/state/` 及其关联验证器。
- 位于 `mcp/cursor-state-bridge/` 的 MCP 服务是仓库所有（repo-owned）的**可选（opt-in）**组件：默认插件安装会将其排除；用户可以通过 `node --experimental-strip-types scripts/install-local-plugin.ts --with-mcp`（使用 `mcp.json` 作为模板）来手动添加它。

## 功能声明与证明规范

在修改功能声明时，请明确所有权和证明级别：

- **所有权分类 (ownership class)**: `repo-owned` (仓库所有), `host-product-only` (仅宿主产品), 或 `unsupported-or-out-of-scope` (不支持或超出范围)
- **证明分类 (proof class)**: `official-doc` (官方文档), `checked-in-artifact` (已检入产物), 或 `runtime-smoke` (运行时冒烟测试)
- **公开措辞规则**: 绝不能将 `host-product-only` 重写为 `repo-owned`；绝不能将 `unsupported-or-out-of-scope` 的否定性结论软化为含糊的默认支持；绝不能声明超出当前检入产物所能提供的证明。

有关当前所有权分布图，请参阅 `docs/confirmed-surfaces.md`。
有关官方引用链接，请参阅 `docs/references.md`。


## 记忆层

该插件交付一个基于文件的记忆层（notepad、project memory、decisions、wiki），它与 workflow-state 分离。智能体需要显式调用对应 owner skill；hooks 不会写入记忆文件。

| 表面 | 消费路径 | Owner skill |
|------|----------|-------------|
| Notepad | `./notepad.md` | `skills/notepad/SKILL.md` |
| Project memory | `./project-memory.json` | `skills/remember/SKILL.md` (router) |
| Decisions | `./docs/decisions/` | `skills/decisions/SKILL.md` |
| Wiki | `./docs/wiki/` | `skills/wiki/SKILL.md` |

跨领域策略见 [`docs/memory-layer.md`](../memory-layer.md)。
