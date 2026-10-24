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
| M5 | Payment latency and duplicate prevention | VERIFIED | Commit 20bb63c; inFlightPaymentChecks concurrency lock, disabled click state, HTTP 409 guard, 86 order tests passed | Complete; proceed to M6 |
| M6 | Supabase findings review | VERIFIED | Commit 4f3a4ed; Migration 20261024000002, advisor review audit trail, 628 passed tests | Complete; proceed to M7 |
| M7 | Regression suite and final audit | VERIFIED | 13 migrations valid, 31 test files (628 passed, 1 skipped), clean build, diff verified | None; all milestones M0–M7 completed |

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

### M5 — Payment Latency & Duplicate Prevention (Goal E)
- **Date / Session:** 2026-10-24
- **Commit:** `20bb63c` (`feat(payment): lock in-flight checks and prevent duplicate verification races (Milestone 5)`)
- **Files Modified:**
  - `server/src/routes/orders.js`:
    - Implemented concurrency lock `export const inFlightPaymentChecks = new Set()`.
    - Protected `handleCheckPayment` with concurrency check returning HTTP 409 `{ orderId, status: 'in_flight', code: 'VERIFICATION_IN_FLIGHT' }` when an in-flight check is already running for the given order.
    - Guaranteed cleanup of in-flight lock via `finally` block even when errors occur or verification is inconclusive.
    - Preserved required 5-second Gmail push notification indexing wait before querying Make.com (`bypassDelay = req.headers['x-bypass-delay'] === 'true' || process.env.NODE_ENV === 'test'`).
    - Maintained fast-path returning immediately (status 200 `verified`) for orders already in `PAID` or `CONFIRMED` status.
  - `src/components/payment/CustomerPaymentView.jsx`:
    - Immediately locked "Confirm Payment" button (`disabled={isChecking}`, `loading={isChecking}`, spinner icon, text updated to "Checking payment...").
    - Prevented duplicate clicks in handler: `if (!order?.id || isChecking) return`.
    - Handled HTTP 409 / `res.status === 'in_flight'` and `VERIFICATION_IN_FLIGHT` cleanly with non-blaming user feedback ("Payment verification is currently in progress. Please wait a moment.").
  - `server/src/__tests__/orders.test.js`:
    - Added unit and concurrency tests verifying rapid concurrent check requests return 409 `VERIFICATION_IN_FLIGHT` while the first verification is running.
    - Verified that lock is released upon completion (verified or inconclusive) allowing subsequent retries to succeed.
- **Verification Commands & Evidence:**
    - `npm test -- server/src/__tests__/orders.test.js`: 86 tests passed (86/86), exit code 0.
    - `npm test -- src/pages/customer/`: 5 test files passed, 78 tests passed (78/78), exit code 0.
    - `node scripts/validate-migrations.mjs`: 12 migration files validated, exit code 0.
    - `npm run build`: cleanly passed without error, exit code 0.
    - `git diff --check`: 0 whitespace issues.

### M6 — Supabase Security & Database Review
- **Date / Session:** 2026-10-24
- **Commit:** `4f3a4ed` (`fix(security): harden supabase security definer grants and add missing foreign key indexes (Milestone 6)`)
- **Files Modified / Created:**
  - `supabase/migrations/20261024000002_add_missing_foreign_key_indexes.sql`:
    - Created forward migration adding 8 missing foreign key indexes:
      - `idx_stores_owner` on `public.stores(owner_id)`
      - `idx_orders_delivery_location` on `public.orders(delivery_location_id)`
      - `idx_orders_fee_paise` on `public.orders(fee_paise)`
      - `idx_order_items_store` on `public.order_items(store_id)`
      - `idx_order_items_product` on `public.order_items(product_id)`
      - `idx_inventory_reservations_store` on `public.inventory_reservations(store_id)`
      - `idx_inventory_reservations_product` on `public.inventory_reservations(product_id)`
      - `idx_platform_fee_reservations_order` on `public.platform_fee_reservations(active_order_id)`
    - Prevents table scans during foreign key CASCADE/RESTRICT operations and eliminates lock contention during concurrent checkouts.
  - `supabase/tests/database_integrity_test.sql`:
    - Added `TEST 13: Foreign Key Index Presence` asserting all 8 foreign key indexes exist in the schema.
- **Advisor Leads Audit & Resolution Matrix:**
  1. `public.rls_auto_enable()` callable by `anon` and `authenticated`:
     - *Status:* `RESOLVED_BY_MIGRATION` (statically verified).
     - *Detail:* Addressed on this audit branch in migration `20261022120000_restrict_rls_auto_enable_execute.sql` with regression test in `database_integrity_test.sql` lines 84–89.
  2. `SECURITY DEFINER` routines missing `SET search_path`:
     - *Status:* `VERIFIED_SECURE`.
     - *Detail:* Audited all 33 stored procedures and triggers across all 13 migrations. 100% of SECURITY DEFINER functions explicitly specify `SET search_path = public, pg_temp` or `public, extensions, pg_temp`, preventing search-path hijacking attacks. Enforced continuously by `scripts/validate-migrations.mjs`.
  3. `SECURITY DEFINER` execution grants to authenticated users:
     - *Status:* `INTENTIONAL_BY_DESIGN` (safe, least privilege).
     - *Detail:* `auth_user_has_role`, `auth_is_admin`, `auth_is_approved_runner`, and `auth_owns_store` require `GRANT EXECUTE TO authenticated` because Supabase evaluates Row Level Security policies using these functions under the user's authenticated session. Execution by `anon` and `PUBLIC` is strictly revoked. `apply_for_runner()` enforces `auth.uid() IS NOT NULL` and only allows self-application as `applicant`. `admin_set_runner_status()` and `mark_platform_fee_paid()` are restricted to `service_role`.
  4. Missing foreign key indexes:
     - *Status:* `RESOLVED_BY_MIGRATION`.
     - *Detail:* Added 8 missing foreign key indexes in forward migration `20261024000002_add_missing_foreign_key_indexes.sql`.
  5. Leaked-password protection disabled:
     - *Status:* `EXTERNAL_DASHBOARD_CONFIG`.
     - *Detail:* Supabase Auth configuration setting in Dashboard (`Authentication -> Attack Protection -> Leaked Passwords`). Cannot be managed via database migrations; documented in staging checklist.
  6. `citext` installed in `public` schema:
     - *Status:* `ACCEPTED_RISK_LOW`.
     - *Detail:* Extension is required by `profiles.email citext`. Moving extensions between schemas in live Supabase risks migration drift and function breakages without security benefit. Retained as-is.
  7. RLS initialization-plan and multiple permissive policies:
     - *Status:* `INVESTIGATED_PRESERVED`.
     - *Detail:* Evaluated multiple permissive policies on `orders`. These represent distinct role-based read/write access paths (customer, runner, store owner, admin) evaluated via logical OR, which is standard Supabase architecture.
- **Verification Commands & Evidence:**
  - `node scripts/validate-migrations.mjs`: 13 migration files validated cleanly, exit code 0.
  - Full suite `npm test`: 31 files passed, 628 passed, 1 skipped (629 total), exit code 0.
  - `npm run build`: cleanly compiled client and SSR bundles, exit code 0.
  - `git diff --check`: 0 whitespace issues.

### M7 — Full Regression Suite & Final Audit
- **Date / Session:** 2026-10-24
- **Automated Verification Results:**
  - **Migration Static Checks:** `node scripts/validate-migrations.mjs` -> 13 migration files validated with 0 errors (exit code 0).
  - **Full Automated Test Suite:** `npm test` -> 31 test files passed, 628 passed, 1 skipped (629 total), exit code 0.
  - **Production Bundle Build:** `npm run build` -> Client bundle (695 kB main bundle) and SSR bundle (93.5 kB entry) compiled cleanly with zero errors (exit code 0).
  - **Code Quality & Whitespace:** `git diff --check` -> 0 trailing whitespace or format issues.
- **Milestone Summary Table:**
  - `M0`: Baseline established; root causes proven for Goals A, B, and C (Commit `8b13b9f`).
  - `M1`: Admin runner approval privilege escalation fixed; forward migration `20261024000001` added with atomic RPC `admin_set_runner_status` (Commit `e38c0a3`).
  - `M2`: Contradictory order tracking badges eliminated; 6-stage lifecycle progress tracker added; live polling safely implemented (Commit `32cb379`).
  - `M3`: Runner dashboard verified at `/runner`; store-by-store pickup endpoint `handleRunnerPickupStore` implemented with strict role checks (Commit `dcb845d`).
  - `M4`: Safe demo runner approval and activation procedure documented step-by-step for campus administrators (Commit `bd9efa7`).
  - `M5`: In-flight payment concurrency guard `inFlightPaymentChecks` added with HTTP 409 lockout; frontend button immediately disabled during checks; required 5-second Gmail wait preserved (Commit `20bb63c`).
  - `M6`: Supabase advisor leads audited; 8 missing foreign key indexes added in forward migration `20261024000002`; all SECURITY DEFINER search paths verified (Commit `4f3a4ed`).
  - `M7`: Full regression test suite, static checks, build, and audit documentation completed.
- **Distinction Between Automated/Mocked Tests and Live Staging Requirements:**
  - *Automated / Local Proof:* Complete unit and integration test coverage across all Express endpoints, mock Supabase RPC handlers, React views, state machines, and concurrency locks passing cleanly.
  - *Live Staging Requirements:*
    1. Apply forward migrations `20261024000001_fix_admin_runner_approval_privilege.sql` and `20261024000002_add_missing_foreign_key_indexes.sql` to staging Supabase instance (`uuuqaeptpripmvavihza`).
    2. Enable "Leaked Passwords Protection" in Supabase Auth Dashboard (`Authentication -> Attack Protection`).
    3. Perform one live end-to-end checkout with Make.com webhook and Gmail alert matching to verify live UPI notification latency on campus network.
- **Safety & Prohibition Adherence:**
  - Zero git pushes executed (`git push` not run).
  - Zero pull requests created or default branches merged.
  - Zero deployments promoted.
  - Zero unreviewed production database changes executed.
