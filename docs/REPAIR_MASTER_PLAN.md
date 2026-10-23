# MartIT Repair Master Plan

**Purpose:** Fix runner approval/status, customer post-payment tracking, runner dashboard availability, demo runner setup, and payment-confirmation latency. This plan must be followed as the source of truth.

## 0. Non-negotiable constraints
- Preserve the existing **Make.com + Gmail payment-verification workflow**; the user confirmed Make.com worked correctly.
- Do not integrate another payment gateway or SMS OTP provider.
- Preserve pricing, dynamic platform fee range and allocation/release timing, delivery-fee rules, night surcharge, order-state semantics, inventory reservation/expiry, authentication roles, and runner exclusivity unless evidence proves a change is necessary and the user explicitly authorizes it.
- HTTP success alone does not prove payment. Interpret the existing Make.com response contract. Timeout, malformed, unknown, or inconclusive outcomes must fail closed.
- Never expose secrets or Supabase service-role credentials in frontend code, logs, screenshots, or reports.
- Do not weaken RLS, grants, or role checks just to make a failing action pass.
- Preserve user changes. Do not reset, discard, or overwrite unrelated work.
- Do not push, open a PR, merge, deploy, or apply unreviewed production database changes without explicit authorization.
- Commit each completed and verified milestone separately. Do not commit a failed or unverified milestone.

## 1. Goal A — Fix admin runner approval/status failure
The admin People & Roles screen reports “Failed to update runner status,” while runner applicants exist and active runners are zero.

Trace the entire path: UI handler → API/RPC → authentication → profile/role records → Postgres policy/function/constraint → response handling → UI refresh.

Investigate with evidence:
- Endpoint, method, request body, response status, and sanitized error.
- Session expiry and admin authorization.
- Mapping among applicant, approved runner, runner role, online status, and availability.
- RLS policies, function EXECUTE grants, SECURITY DEFINER functions and `search_path`.
- Missing columns, enum values, constraints, foreign keys, migration drift.
- RPC return shapes, zero-row updates, duplicate role creation, stale frontend cache.
- Relevant backend/database logs if available.

Acceptance:
- Record the exact root cause before fixing.
- Only authorized admins can approve/reject applicants.
- Approval updates the correct persisted role/status idempotently.
- Approved is not assumed to mean online/available.
- UI refreshes from authoritative persisted state.
- Errors are diagnostically useful but sanitized for customers.
- Tests cover success, unauthorized action, missing/rejected applicant, repeated approval, database failure, and stale UI.

Never grant broad privileges, disable RLS globally, expose service-role keys, or let users grant themselves roles.

## 2. Goal B — Correct customer post-payment screen
The observed page contradicts itself: “Awaiting Payment” / “Payment: Pending” appears alongside “Payment Verified & Confirmed.”

Inspect existing confirmation/order-history/detail screens, routes, hooks, and reusable components before changing design.

After the backend commits the authoritative paid/confirmed state, show a clear waiting-for-runner/order-tracking experience using existing UI:
1. Payment confirmed
2. Waiting for a student runner
3. Runner assigned
4. Preparing/pickup progress, where supported by real states
5. Out for delivery
6. Delivered

Display order ID, store, items, destination, and authoritative total. Show runner details only when safely available. Reveal the in-app delivery OTP only through the existing authorized customer endpoint and at the appropriate stage.

Acceptance:
- Every label/badge derives from authoritative order state.
- No premature success message.
- Pending, inconclusive, cancelled, expired, no-runner, and network-error states are explicit.
- Refresh/revisit does not create another order.
- Polling/subscriptions use supported mechanisms, clean up correctly, and stop at terminal states.
- Mobile UI reuses existing components and styles.

## 3. Goal C — Verify and repair runner dashboard
Determine whether it already exists by inspecting routes, guards, navigation, components, APIs, order queries/subscriptions, and tests.

If it exists, repair its integration without duplication. If missing/incomplete, implement only missing capabilities using the existing design system.

Acceptance:
- Record the exact route and how an approved runner accesses it.
- Only approved runners can access runner actions.
- Eligible paid orders appear according to existing lifecycle rules.
- Online/offline status is meaningful and persisted if supported.
- Runner acceptance is atomic and exclusive.
- Accepted orders expose correct pickup/delivery progression and OTP-entry UI.
- Customer and runner views refresh after authoritative changes.

## 4. Goal D — Provide one safe demo runner
Prefer an existing, explicitly identifiable test/demo account. Do not infer account identity from a screenshot alone.

Use the normal admin approval workflow and normal online/availability control. Fix the underlying approval/availability defect where possible.

Acceptance:
- Provide exact UI steps to approve and activate one runner.
- Verify persisted approval/availability and dashboard visibility if the environment permits.
- Do not auto-approve all applicants, hardcode privileged IDs, bypass authorization, fabricate paid orders, or insert arbitrary runner IDs.
- If account selection or production mutation requires a human, finish code/tests and provide manual steps instead.

## 5. Goal E — Reduce payment-confirmation delay and prevent duplicates
Trace: customer click → frontend → backend → intentional wait → Make.com → Gmail matching → response parsing → DB transition → UI update.

Inspect artificial sleeps, duplicate waits, redundant queries, polling delays, retry loops, and repeated webhook calls.

The existing five-second backend wait before Make.com may be needed for Gmail matching. Do not remove/shorten it blindly. Measure and preserve any delay needed for reliable matching.

Acceptance:
- Immediately lock the confirm button for the entire in-flight cycle and show “Checking payment…” or equivalent.
- Prevent duplicate frontend requests and concurrent server-side verification/transitions.
- After a valid positive Make.com response and committed DB transition, return/update UI without extra artificial delay or redundant blocking queries.
- Negative responses never mark payment successful.
- Timeout/malformed/inconclusive responses never mark payment successful and do not cause concurrent verification races.
- Retry only after the prior cycle is safely resolved or idempotent retry is supported.
- Test rapid clicks, slow response, positive/negative/inconclusive outcomes, and stale responses racing terminal state.
- Report measured timing only from actual tests/staging; never invent timings.

## 6. Supabase security/performance review
A prior advisor inspection reported the project as active/healthy while also surfacing warnings. Leads included:
- `public.rls_auto_enable()` callable by `anon` and `authenticated` as SECURITY DEFINER.
- Some SECURITY DEFINER functions callable by authenticated users, including role/helper functions and `apply_for_runner()`.
- Leaked-password protection disabled.
- `citext` installed in public schema.
- Missing foreign-key indexes on some columns in `inventory_reservations`, `order_items`, `orders`, `platform_fee_reservations`, and `stores`.
- RLS initialization-plan warnings, multiple permissive policies, and unused-index advisories.

These are leads, not proven causes. Re-inspect current state and local migrations. For each finding decide whether it is exploitable, relevant, inefficient, intentional, or stale.

For SECURITY DEFINER functions inspect `search_path`, ownership, minimum EXECUTE grants, and internal authorization. Do not indiscriminately revoke needed access or drop unused indexes. Do not experiment directly on production. Prefer reviewed, idempotent migrations and tests; identify anything requiring controlled staging application.

Previously supplied Supabase project reference: `uuuqaeptpripmvavihza`. Verify current configuration before changes.

## 7. Ordered milestones
- **M0 — Baseline:** verify branch/tree, app/preview commit, routes, relevant code and baseline tests/build/migration validator. Map the failing path before edits.
- **M1 — Runner approval:** prove root cause, make minimal secure fix, add focused regression tests.
- **M2 — Customer tracking:** consistent state mapping and tracking UI; tests for pending, confirmed, assigned, delivered, and failure states.
- **M3 — Runner dashboard:** verify route; fix/complete dashboard; test authorization, eligible orders, availability, atomic acceptance.
- **M4 — Demo runner:** safe reversible UI steps; verify only if an appropriate test account/environment exists.
- **M5 — Latency/idempotency:** trace timing, preserve necessary Gmail matching wait, remove only proven unnecessary delays, test duplicate prevention.
- **M6 — Supabase review:** correlate advisor findings with actual paths; make only justified, tested changes.
- **M7 — Regression/final audit:** full tests, build, lint/type checks, migration validation, existing E2E tests where configured, complete diff review, live-vs-mocked distinction. No push/PR/merge/deploy.

## 8. Final report
Report exact runner-approval root cause/evidence; files changed; dashboard existence and route; safe demo-runner steps; customer tracking behavior; delays found and rationale; duplicate prevention; Supabase findings fixed/left alone; exact test results; live vs mocked checks; milestone commit SHAs; remaining blockers and staging steps.

Code written or mocked tests passing alone do not establish completion. Goal: a coherent order journey from verified payment through runner assignment and delivery, secure administration, and a demo-ready runner.
