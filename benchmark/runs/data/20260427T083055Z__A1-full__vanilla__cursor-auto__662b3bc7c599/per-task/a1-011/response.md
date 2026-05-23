“Add AI to my CRM” is highly underspecified, and the right implementation could range from a simple productivity helper to regulated decision automation.

**Key ambiguities I need to surface**
- **Business objective:** Is the goal lead scoring, sales assistant, support automation, churn prediction, data enrichment, forecasting, call/email summarization, or something else?
- **Primary users:** Sales reps, managers, support, marketing, or admins may need different AI behaviors and UX.
- **Decision criticality:** Should AI only **assist** humans (recommend/draft), or can it **act autonomously** (send emails, update records, trigger workflows)?
- **Data scope and quality:** What CRM entities are in scope (contacts, deals, activities, tickets), and are historical labels/outcomes available for learning?
- **Risk/compliance constraints:** Any requirements around PII handling, auditability, explainability, consent, regional data residency, or industry regulation?
- **Success criteria:** What measurable KPI defines success (conversion rate, response time, rep productivity, win rate, forecast accuracy, etc.) and by when?

**Assumptions I cannot resolve from your prompt**
- Whether you want AI for **revenue growth**, **cost reduction**, or **user experience** first.
- Which CRM platform/stack you use and what integration boundaries exist.
- Whether you have permission to use third-party LLM APIs or must stay on-prem/private.
- Your acceptable error tolerance and required human oversight level.
- Budget, timeline, and team capacity for rollout and maintenance.
- Whether existing data is sufficient for predictive models versus needing rule-based/LLM-first features.

**One targeted question (highest ambiguity reduction)**
What is the single highest-value workflow in your CRM that you want AI to improve first, and what metric would prove it worked?