“Add AI to my CRM” is too underspecified to choose a safe implementation path yet.

Ambiguities I can’t resolve from your prompt:
- **Primary outcome**: whether you want AI for lead scoring, email drafting, call summaries, forecasting, support triage, data enrichment, chatbot, or all of these.
- **User/workflow scope**: who uses it (sales reps, managers, support) and at which exact step in the CRM workflow.
- **Data boundaries**: what customer data the AI may access, and what must be excluded for compliance/privacy.
- **Success criteria**: what metric defines success (time saved, conversion lift, response quality, forecast accuracy, etc.).
- **Operational constraints**: acceptable latency, budget per user/request, and required reliability/SLA.
- **Risk controls**: approval gates, auditability, human-in-the-loop requirements, and fallback behavior on low confidence.
- **Technical context**: CRM platform, existing architecture, and whether external model providers are allowed.

Assumptions I cannot safely make:
- That “AI” means generative text rather than predictive analytics or automation.
- That you can send CRM data to third-party LLM APIs.
- That your team accepts non-deterministic outputs in customer-facing flows.
- That your existing CRM has extension points where AI can run in-line.
- That you want broad AI rollout instead of one constrained, high-ROI pilot.

What is the single highest-impact AI use case you want in the CRM first (e.g., lead scoring, email drafting, meeting/call summarization, next-best-action recommendations, or support reply generation)?