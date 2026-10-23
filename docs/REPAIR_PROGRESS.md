# MartIT Repair Progress

This is the durable execution ledger. Update it throughout implementation. Never claim verification without evidence.

## Status definitions
- `NOT_STARTED`: no implementation work completed.
- `IN_PROGRESS`: investigation or implementation underway.
- `BLOCKED`: dependency/safety issue prevents completion; record evidence and next action.
- `VERIFIED`: acceptance criteria passed, required tests run, diff reviewed, evidence recorded. Live-only checks must be separately identified if not run.

## Baseline to re-verify
- Branch at planning time: `audit/deep-clean-issue-register`.
- Baseline HEAD SHA: `1fd09c553f5bb0f306a0a654c2a771540720c43e`.
- Automated test suite: `npm test` -> 30 test files passed, 613 passed, 1 skipped (614 total), exit code 0.
- Migration static validation: `node scripts/validate-migrations.mjs` -> 11 migrations valid, exit code 0.
- Production build: `npm run build` -> client + SSR built cleanly, exit code 0.
- Live Make.com + Gmail + Supabase end-to-end flow is not established by mocked tests.
- OTP storage is currently held in Node.js process memory (`activeOtpStore`) with SHA-256 hash in Postgres; documented as single-instance safe, requires database ciphertext / Redis for horizontal scaling.

## Milestone ledger

| ID | Milestone | Status | Evidence / commit | Remaining work |
|---|---|---|---|---|
| M0 | Baseline, routes, and root-cause evidence | VERIFIED | Traced routes, baseline tests (613 passed), root causes for Goals A-D established | Proceed to M1 runner approval fix |
| M1 | Secure runner approval fix | NOT_STARTED | — | Trace UI/API/RPC/RLS; add regression tests |
| M2 | Customer order-tracking UI | NOT_STARTED | — | Ensure labels derive from authoritative order state |
| M3 | Runner dashboard and availability | NOT_STARTED | — | Confirm route, access guard, eligible orders, atomic acceptance |
| M4 | Demo runner procedure | NOT_STARTED | — | Identify safe test account or provide secure manual steps |
| M5 | Payment latency and duplicate prevention | NOT_STARTED | — | Measure path; preserve necessary Gmail matching wait |
| M6 | Supabase findings review | NOT_STARTED | — | Correlate advisor findings with code; only justified fixes |
| M7 | Regression suite and final audit | NOT_STARTED | — | Tests/build/lint/migrations; diff review; live-vs-mocked report |

## Milestone Evidence & Audit Trails

### M0 — Baseline & Root Cause Evidence
- **Date / Session:** 2026-10-24
- **Branch / Base Commit:** `audit/deep-clean-issue-register` @ `1fd09c553f5bb0f306a0a654c2a771540720c43e`
- **Baseline Test Evidence:**
  - `npm test`: 30 files passed, 613 passed, 1 skipped, exit code 0.
  - `node scripts/validate-migrations.mjs`: 11 migration files validated, exit code 0.
  - `npm run build`: successful production bundle, exit code 0.
- **Root Cause Analysis (Goal A - Admin Runner Approval Failure):**
  - **Failing Path:** `AdminConsolePage.jsx` -> `adminService.setRunnerStatus` -> `POST /admin/runners/setStatus` -> `server/src/routes/admin.js:handleSetRunnerStatus`.
  - **PostgreSQL Exception:** The profile update `supabase.from('profiles').update({ runner_status: status }).eq('id', userId)` triggers `trg_prevent_profile_escalation` -> `prevent_profile_privilege_escalation()`.
  - **Defect:** `prevent_profile_privilege_escalation()` enforces `IF NOT public.auth_is_admin() THEN ... RAISE EXCEPTION 'PERMISSION_DENIED_RUNNER_STATUS_MODIFICATION'`. Function `public.auth_is_admin()` checks `WHERE user_id = auth.uid()`. When backend Express calls Supabase with `service_role` key, `auth.uid()` is `NULL`. `auth_is_admin()` evaluates to `FALSE`, raising exception on the service role update. `admin.js:90` catches `updateErr` and throws `Failed to update runner status.`
- **Root Cause Analysis (Goal B - Contradictory Customer Tracking):**
  - **Failing Path:** `src/components/cart/OrderConfirmationView.jsx` lines 88–95 hardcode `<Badge tone="warning">Awaiting Payment</Badge>` and `<Badge tone="info">Payment: Pending</Badge>` directly in the header above the payment status banner. When an order transitions to `paymentStatus === 'PAID'`, lines 120–124 render `Payment Verified & Confirmed:`, displaying contradictory badges simultaneously.
  - **Defect:** Header badges do not derive dynamically from `order.paymentStatus` / `order.status`, and a post-payment tracking stepper is missing.
- **Root Cause Analysis (Goal C - Runner Dashboard):**
  - **Route Location:** `/runner`, mounted in `src/app/routes.jsx` with `<RequireRole role="runner" />`.
  - **Access Gate:** `RouteGuards.jsx` checks `hasPermission(user, PERMISSIONS.RUNNER_DELIVER)`. In `utils/permissions.js`, `RUNNER_DELIVER` requires both role `'runner'` and `user.runnerStatus === 'approved'`. Because Goal A failed to update runner status to `approved`, applicants were rejected by the route guard with `ForbiddenPage`.
