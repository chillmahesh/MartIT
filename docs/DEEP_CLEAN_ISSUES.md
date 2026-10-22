# MartIT Deep-Clean Audit — Issue Register

**Audit status:** IN PROGRESS  
**Baseline branch:** `main`  
**Baseline commit at audit start:** `0ac83ac27dafc5e2aba3ad782f9ae718943b6d57`  
**Scope:** React/Vite frontend, Express backend, Supabase migrations/schema, payment/runner flows, configuration, tests, deployment wiring, branch hygiene, and unnecessary-code review.

This register contains confirmed observations from the initial remote review. It is not a claim that every file has been audited. Items remain open until a fix is tested and the result is verified.

## Confirmed findings

| ID | Severity | Area | Finding / evidence | Required action | Status |
|---|---|---|---|---|---|
| MARTIT-AUD-001 | Critical | Payment lifecycle | `server/src/routes/webhooks.js` explicitly returns `verified: false` when no authoritative gateway verifier is configured and does not call `executeAtomicPaymentVerification` on that path. Notifications are persisted as `PROCESSING` with `evidence = NULL`. This is fail-closed security behavior, but it means the documented Make/email-only flow cannot confirm a payment or proceed to runner assignment by itself. | Decide and implement an explicit trusted confirmation policy that matches the approved product flow. Never mark PAID solely from arbitrary client-supplied webhook claims. Add end-to-end tests for positive, negative, duplicate, mismatched, expired, and inconclusive notifications. | OPEN — product-flow blocker |
| MARTIT-AUD-002 | High | Make.com polling / checkout window | `docs/make-payment-webhook-integration.md` specifies webhook payloads and a payment window greater than 2 minutes but does not specify or implement a 15-second inbox polling cadence. The cadence is configured in the Make scenario, not by this repository's application code. | Verify Make plan/module supports 15-second polling; configure and test the actual scenario cadence. If not supported, document the supported alternative and design a retry/reconciliation flow that does not rely on the two-minute checkout timer. | OPEN — external configuration |
| MARTIT-AUD-003 | High | Production backend config | Render service is configured with auto-deploy disabled and follows `main`. The Make webhook requires `MAKE_WEBHOOK_SECRET`; prior live probe returned `WEBHOOK_UNCONFIGURED`. Current deployment must be checked after setting the secret without exposing its value. | Confirm required environment-variable presence in Render dashboard/configuration and run authenticated positive/negative webhook smoke tests. Do not store the secret in source control. | OPEN — production verification |
| MARTIT-AUD-004 | High | Deployment configuration | Render service metadata reports root directory `src/`, while repository `package.json`, `server/`, `supabase/`, `scripts/`, and `render.yaml` are rooted at repository top level. The service is currently live, so this may reflect service configuration details that need confirmation rather than an active outage. | Confirm effective Render root directory, build command, and start command against the deployed artifact; align configuration only after checking deploy logs. | OPEN — verify configuration |
| MARTIT-AUD-005 | Medium | Documentation accuracy | Root `README.md` describes the backend/database and authentication as mock, UPI verification as not built, and runner atomic assignment as not built. The repo now contains an Express backend, Supabase migrations, and payment webhook ingestion. Some capabilities are still partial, so the documentation is materially stale/ambiguous. | Reconcile README status table with current implementation and explicitly distinguish notification ingestion from verified settlement, production vs mock mode, and incomplete features. | OPEN — docs cleanup |
| MARTIT-AUD-006 | Medium | Migration validation | `scripts/validate-migrations.mjs` is explicitly a static structural validator; it checks parentheses counts, floating point types, and SECURITY DEFINER search paths, but does not execute SQL against PostgreSQL. Its output must not be treated as live migration validation. | Keep static validation, add/verify a real migration execution check in a disposable PostgreSQL/Supabase test environment, and verify applied migration state in the target project. | OPEN — test coverage |
| MARTIT-AUD-007 | Medium | Branch hygiene | GitHub currently lists 15 branches. `fix/live-checkout-spot-and-order-hardening` is two commits behind `main` and has no unique commits. Thirteen branches are behind `main` with zero unique commits; two branches are diverged and contain unique work: `bhosaleshivendra-patch-1` (1 ahead / 10 behind, README.md changed) and `feat/flat-10-delivery-fee` (2 ahead / 23 behind, README.md changed). Preserve those two until their unique commits are reviewed. | Check every branch's ahead/behind state and associated open PRs. Delete only branches proven merged/obsolete; preserve any unique work. | OPEN — branch review |
| MARTIT-AUD-008 | Medium | Code cleanup | No full-repository dead-code analysis has been completed yet. The presence of dependencies or files alone is not proof they are unnecessary. | Run project tests/build and static searches; remove only code proven unreachable/unused, one coherent batch at a time, then rerun tests/build and review the diff. | OPEN — code audit |
| MARTIT-AUD-009 | High | Supabase RLS / profile writes | Live Supabase reports RLS enabled on all 13 public tables. However, `profiles_update_own` permits a user to update their own profile row; safety of role/status fields therefore depends on the trigger/function guard being correct for every privilege-bearing column. Initial inspection confirms a runner-status guard exists, but a complete column-by-column privilege-escalation audit is still required. | Inspect profile columns, all triggers, and grants; test self-update attempts for role, runner status, identity, and other privileged fields using authenticated non-admin sessions. Do not alter live policies until tests demonstrate a gap. | OPEN — security review |

## Initial live checks

- Latest Vercel production deployment is READY at commit `0ac83ac27dafc5e2aba3ad782f9ae718943b6d57`; its Vercel status check reports success.
- Latest Render deployment is live at the same commit. Render auto-deploy is disabled.
- Supabase public schema currently lists 13 tables: `audit_logs`, `categories`, `inventory_reservations`, `locations`, `order_fulfillment_groups`, `order_items`, `orders`, `payment_records`, `platform_fee_reservations`, `products`, `profiles`, `stores`, `user_roles`.
- Supabase currently exposes routines `apply_for_runner`, `auth_is_admin`, and `prevent_profile_privilege_escalation`.
- No open pull requests were returned by the initial repository-scoped open-PR search; verify again while reviewing branches.

## Audit completion criteria

- [ ] Every tracked source/config/migration/test file reviewed or classified as generated/vendor/asset.
- [ ] Findings prioritized and linked to evidence.
- [ ] Fixes committed on an audit branch; no unrelated pricing/catalogue changes.
- [ ] Unit/integration tests, production build, and static migration validation pass.
- [ ] Database migrations and key constraints verified against PostgreSQL.
- [ ] All branches classified by unique commits and PR status; safe cleanup completed.
- [ ] Vercel and Render deployment SHAs and production smoke tests verified.
- [ ] No dead code removed without evidence and regression tests.
- [ ] Final issue summary distinguishes fixed, accepted risk, external action, and still-open work.
