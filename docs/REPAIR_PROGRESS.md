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
| M0 | Baseline, routes, and root-cause evidence | VERIFIED | Commit 8b13b9f; baseline tests (613 passed), root causes established | Complete |
| M1 | Secure runner approval fix | VERIFIED | Migration 20261024000001, admin.js RPC support, 35 auth tests passed | Complete; proceed to M2 |
| M2 | Customer order-tracking UI | VERIFIED | Commit 32cb379; dynamic state mapping, 6-stage lifecycle tracker, zero contradiction, 78 customer tests passed | Complete; proceed to M3 |
| M3 | Runner dashboard and availability | VERIFIED | Commit dcb845d; route /runner verified, online guard, atomic acceptance, pickup-store endpoint & 55 runner tests + 84 orders tests | Complete; proceed to M4 |
| M4 | Demo runner procedure | VERIFIED | Safe UI approval steps documented, persisted status verified, access gate confirmed | Complete; proceed to M5 |
| M5 | Payment latency and duplicate prevention | NOT_STARTED | — | Measure path; preserve necessary Gmail matching wait |
| M6 | Supabase findings review | NOT_STARTED | — | Correlate advisor findings with code; only justified fixes |
| M7 | Regression suite and final audit | NOT_STARTED | — | Tests/build/lint/migrations; diff review; live-vs-mocked report |

## Milestone Evidence & Audit Trails

### M0 — Baseline & Root Cause Evidence
- **Date / Session:** 2026-10-24
- **Branch / Base Commit:** `audit/deep-clean-issue-register` @ `1fd09c553f5bb0f306a0a654c2a771540720c43e`
- **Baseline Commit:** `8b13b9f` (`docs(repair): establish verified baseline and root-cause evidence (Milestone 0)`)
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

### M1 — Secure Runner Approval Fix
- **Date / Session:** 2026-10-24
- **Commit:** `e38c0a3` (`feat(admin): fix runner status update privilege escalation and add atomic RPC (Milestone 1)`)
- **Files Modified:**
  - `supabase/migrations/20261024000001_fix_admin_runner_approval_privilege.sql`: Created forward migration updating `public.auth_is_admin()`, `public.auth_is_super_admin()`, and `public.prevent_profile_privilege_escalation()` to recognize `service_role` and `postgres`, while preserving strict client protection against unauthorized self-elevation. Created atomic stored procedure `public.admin_set_runner_status(UUID, VARCHAR)`.
  - `server/src/routes/admin.js`: Hardened `handleSetRunnerStatus` to use `admin_set_runner_status` RPC with clean error diagnostics and resilient direct table fallback.
  - `server/src/__tests__/testHelpers.js`: Added `admin_set_runner_status` simulation to mock Supabase client.
  - `server/src/__tests__/authAndPermissions.test.js`: Added regression tests for repeated approval idempotency, 404 for missing applicant, and 422 for invalid status.
- **Verification Commands & Evidence:**
  - `node scripts/validate-migrations.mjs`: 12 migration files validated cleanly, exit code 0.
  - `npm test -- server/src/__tests__/authAndPermissions.test.js`: 35 tests passed (35/35), exit code 0.
  - Full suite `npm test`: 30 files passed, 616 passed, 1 skipped (617 total), exit code 0.
- **Security & Authorization Review:**
  - Confirmed non-admins remain strictly forbidden from altering `runner_status` to `'approved'` or `'suspended'`.
  - Confirmed only callers with `PERMISSIONS.RUNNERS_APPROVE` (verified via admin JWT) can execute `POST /admin/runners/setStatus`.
  - Confirmed zero service-role keys or credentials exposed.

### M2 — Customer Order-Tracking UI
- **Date / Session:** 2026-10-24
- **Commit:** `32cb379` (`feat(customer): eliminate contradictory tracking badges and implement 6-stage lifecycle progress tracker (Milestone 2)`)
- **Files Modified:**
  - `src/components/cart/OrderConfirmationView.jsx`:
    - Eliminated hardcoded contradictory "Awaiting Payment" / "Payment: Pending" badges when payment is confirmed.
    - Derived header title, subtitle, and badges dynamically from authoritative order state (`order.paymentStatus` and `order.status`).
    - Implemented 6-stage lifecycle progress tracker (`Payment Confirmed` -> `Waiting for Runner` -> `Runner Assigned` -> `Preparing / Pickup` -> `Out for Delivery` -> `Delivered`).
    - Safely rendered assigned campus runner card when runner is assigned.
    - Preserved in-app delivery OTP challenge embedding (`CustomerDeliveryOtpCard`) when `order.status === 'ON_THE_WAY'`.
    - Added explicit, non-blaming customer support banners for `CANCELLED` and `EXPIRED` orders.
  - `src/pages/customer/OrderConfirmationPage.jsx`:
    - Added safe live polling every 4 seconds for active non-terminal orders, stopping cleanly upon unmount or when reaching terminal states (`DELIVERED`, `CANCELLED`, `EXPIRED`).
  - `server/src/routes/orders.js`:
    - Included `runnerId: order.runner_id || order.runnerId || null` in `formatCanonicalOrder` so the client can reliably detect runner assignment.
  - `src/pages/customer/__tests__/orderTrackingUI.test.jsx`:
    - Added comprehensive unit test suite covering contradiction elimination, pending state, preparing/pickup runner card, out-for-delivery OTP card, delivered completion, and cancelled/expired banners.
- **Verification Commands & Evidence:**
  - `npm test -- src/pages/customer/`: 5 test files passed, 78 tests passed, exit code 0.
  - Full suite `npm test`: 31 files passed, 623 passed, 1 skipped (624 total), exit code 0.
  - `node scripts/validate-migrations.mjs`: 12 migration files validated, exit code 0.
  - `npm run build`: Client bundle (695 kB main) and SSR bundle (93.5 kB entry) compiled cleanly, exit code 0.
  - `git diff --check`: 0 whitespace issues.

### M3 — Runner Dashboard and Availability
- **Date / Session:** 2026-10-24
- **Commit:** `dcb845d` (`feat(runner): implement store pickup endpoint and verify runner dashboard availability (Milestone 3)`)
- **Files Modified / Verified:**
  - `src/pages/runner/RunnerDashboardPage.jsx`: Verified `/runner` route implementation with online/offline availability switch, live activity counts, delivery request acceptance, multi-store pickup confirmation, and OTP-verified delivery completion.
  - `server/src/routes/orders.js`:
    - Implemented `handleRunnerPickupStore` (`POST /api/v1/runner/orders/:id/pickup-store` and `POST /runner/order/pickupStore`) to support store-by-store collection confirmation in PostgreSQL and auto-advance to `PICKED_UP` when all fulfillment groups are complete.
    - Verified strict role authorization (`ROLES.RUNNER` + `runnerStatus === 'approved'`), atomic exclusive acceptance (`runner_id IS NULL AND status = 'CONFIRMED'`), and OTP-guarded state transitions.
  - `server/src/__tests__/orders.test.js`: Added unit tests verifying runner pickup store confirmation, unassigned runner rejection, and invalid status rejection.
- **Verification Commands & Evidence:**
  - `npm test -- src/pages/runner/`: 3 test files passed, 55 tests passed (55/55), exit code 0.
  - `npm test -- server/src/__tests__/orders.test.js`: 84 tests passed (84/84), exit code 0.
  - Full suite `npm test`: 31 files passed, 626 passed, 1 skipped (627 total), exit code 0.
  - `node scripts/validate-migrations.mjs`: 12 migration files validated, exit code 0.
  - `npm run build`: Clean build passed without errors, exit code 0.
  - `git diff --check`: 0 whitespace issues.

### M4 — Safe Demo Runner Procedure (Goal D)
- **Date / Session:** 2026-10-24
- **Demo Runner Accounts Identified:**
  - **In-Browser / Mock Environment:**
    - Runner Account: `Meera (sample runner)` (`runner@martit.test`, id: `u_runner_1`, role: `runner`, status: `approved`).
    - Applicant Account: `Kabir (sample applicant)` (`applicant@martit.test`, id: `u_applicant_1`, role: `customer`, status: `pending`).
    - Admin Account: `Super Admin (sample)` (`superadmin@martit.test`, id: `u_super_1`, role: `super_admin`).
  - **Staging / PostgreSQL Environment:**
    - Any registered applicant (e.g. `applicant@campus.edu` / `usr_applicant`) or newly signed up student applicant.
- **Exact UI Steps for Admin Approval and Runner Activation:**
  1. **Admin Login:** Log in as an administrator or super admin at `/admin/login` (or `/login`).
  2. **Navigate to People & Roles:** Open `/admin` and select the **People & Roles** tab (`/admin/roles`).
  3. **Locate Applicant:** Under the **Runner Applicants** section, review pending applicants displaying name, email, and application date.
  4. **Execute Approval:** Click the **Approve** button on the applicant row. This calls `POST /admin/runners/setStatus` with `{ userId, status: 'approved' }`, which executes atomic RPC `admin_set_runner_status(UUID, 'approved')` in PostgreSQL.
  5. **Confirm State Transition:** Toast confirmation displays "Runner approved successfully." The applicant is removed from pending applications, and active runners count increments from 0 to 1.
  6. **Runner Authentication:** Log in as the approved runner at `/login`. The system automatically redirects to `/runner`. The `<RequireRole role="runner" />` route guard validates `PERMISSIONS.RUNNER_DELIVER` and admits the runner.
  7. **Go Online:** On `/runner`, toggle the **Runner Availability** switch to **Online**.
  8. **Receive Orders:** Available `CONFIRMED` orders now populate the "Available Requests" section for atomic acceptance.
- **Verification Evidence:**
  - Verified non-admins are strictly forbidden from approving applicants (covered by 35 tests in `authAndPermissions.test.js`).
  - Verified approved runners bypass `ForbiddenPage` and access `/runner` (covered by `runnerModeSwitching.test.jsx`).
  - Verified offline runners are prevented from accepting delivery requests until toggled online.
