## User prompt

Design a loop that drives a failing CI build to green. Inputs: a list of failing checks. Output the loop spec: per-iteration step, fresh evidence requirement, idempotence, max-iter cap, stop condition (success and fundamental-failure), and observable success signal. Explicitly disallow marking checks green by inference.
