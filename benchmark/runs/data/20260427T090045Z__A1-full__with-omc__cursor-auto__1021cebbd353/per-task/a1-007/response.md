You want a pre-build checklist for notifications, so I’ll first run a requirements discovery pass and turn it into concrete decisions you can make before implementation. I’m starting by loading the notification-planning skill guidance and then I’ll tailor it to this repo.I reviewed the notification setup playbook and will adapt it into a product-level decision checklist (not config changes). Next I’ll quickly inspect your repo docs to ground the questions in your actual app context.Great call to do this first. Before writing any notification code, lock down these decisions so you avoid rework.

## What You Need To Decide First

- **Goal:** what user behavior are notifications supposed to drive (e.g., return to app, complete task, avoid missing critical event)?
- **Notification types:** transactional (must-send), reminder, marketing, system/status; each has different rules.
- **Channels:** in-app, email, push (mobile/web), SMS, chat/webhook (Slack/Discord/Telegram), or combinations.
- **Urgency policy:** which events are real-time vs batched digest vs “never notify.”
- **Audience rules:** who gets what (role, plan tier, locale, timezone, opt-in state).
- **Success metrics:** open rate isn’t enough; define business outcome (activation, retention, conversion, SLA response time).

## Product + UX Requirements

- **Event inventory:** enumerate exact trigger events and payload fields needed for each.
- **User preferences center:** global on/off, channel-level toggles, category-level toggles, quiet hours, timezone.
- **Frequency controls:** rate limits, dedupe window, bundling/digests, cooldown rules.
- **Template strategy:** message templates, localization, variable substitution, fallbacks for missing data.
- **Deep links:** every notification should route to a meaningful destination/action.
- **Failure UX:** what users see if delivery fails or channel is unavailable.

## Compliance + Safety (Must-Have)

- **Consent model:** opt-in/opt-out by channel and region (especially email/SMS/push).
- **Regulatory scope:** GDPR/CCPA/CAN-SPAM/TCPA depending on where users are.
- **Data minimization:** never put sensitive/secret data in notification content.
- **Auditability:** log who was notified, what category, when, and why (without storing secrets).
- **Abuse prevention:** anti-spam limits and abuse monitoring.

## Technical Design Inputs (Still Pre-Code)

- **Source of truth:** where notification events originate (domain events, cron jobs, user actions).
- **Delivery architecture:** sync vs async queue, retries, DLQ/dead-letter behavior, idempotency key strategy.
- **Provider strategy:** single provider vs pluggable providers; failover expectations.
- **State model:** notification status lifecycle (`queued`, `sent`, `delivered`, `failed`, `read`, etc.).
- **Observability:** dashboards/alerts for latency, failure rate, provider errors, queue depth.
- **Testing plan:** contract tests for payloads, template rendering tests, end-to-end smoke path.

## Fast Scoping Worksheet (fill this before coding)

Use one row per notification:

| Event | User Value | Channel(s) | Trigger | Frequency Rule | Opt-in Required | Priority | Success Metric |
|---|---|---|---|---|---|---|---|

If you want, I can help you fill this worksheet for your app in 10–15 minutes by asking a small set of targeted questions and then produce a concrete “v1 notification spec” your team can implement directly.