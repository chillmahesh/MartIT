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
| MARTIT-AUD-005 | Medium | Documentation accuracy | The original README inaccurately described backend/database and authentication as mock and omitted the implemented webhook-ingestion and backend/database work. The audit branch now replaces that section with a qualified status table distinguishing implemented integrations from incomplete authoritative payment verification and unverified tracking/fulfilment claims. | Review the revised README during PR review; merge only after the audit findings are reviewed. | FIXED ON AUDIT BRANCH — not merged to main |
| MARTIT-AUD-006 | Medium | Migration validation | `scripts/validate-migrations.mjs` is explicitly a static structural validator; it checks parentheses counts, floating point types, and SECURITY DEFINER search paths, but does not execute SQL against PostgreSQL. Its output must not be treated as live migration validation. | Keep static validation, add/verify a real migration execution check in a disposable PostgreSQL/Supabase test environment, and verify applied migration state in the target project. | OPEN — test coverage |
| MARTIT-AUD-007 | Medium | Branch hygiene | GitHub currently lists 15 branches. `fix/live-checkout-spot-and-order-hardening` is two commits behind `main` and has no unique commits. Twelve branches are behind `main` with zero unique commits; two branches are diverged and contain unique work: `bhosaleshivendra-patch-1` (1 ahead / 10 behind, README.md changed) and `feat/flat-10-delivery-fee` (2 ahead / 23 behind, README.md changed). Preserve those two until their unique commits are reviewed. | Check every branch's ahead/behind state and associated open PRs. Delete only branches proven merged/obsolete; preserve any unique work. | OPEN — branch review |
| MARTIT-AUD-008 | Medium | Code cleanup | No full-repository dead-code analysis has been completed yet. The presence of dependencies or files alone is not proof they are unnecessary. | Run project tests/build and static searches; remove only code proven unreachable/unused, one coherent batch at a time, then rerun tests/build and review the diff. | OPEN — code audit |
| MARTIT-AUD-010 | High | Supabase exposed SECURITY DEFINER routines | Supabase Security Advisor (observed 2026-10-22) reports `public.rls_auto_enable()` executable by `anon` and `authenticated`, and six additional SECURITY DEFINER routines executable by `authenticated`: `apply_for_runner`, `auth_is_admin`, `auth_is_approved_runner`, `auth_is_super_admin`, `auth_owns_store`, and `auth_user_has_role`. This is a confirmed exposed-surface finding, not proof each routine is exploitable: some functions may intentionally be callable as RLS helpers or RPCs. `rls_auto_enable()` is especially suspicious because its name suggests schema/security mutation and it is callable by anon. | Inspect definitions, grants, search_path, and behavior. Revoke public/anon/authenticated EXECUTE from `rls_auto_enable()` unless explicitly required; keep only the minimum intended role grants on the other routines. Test RLS policies and RPC call sites after changes. Do not blindly revoke helper functions needed by policies. | FIX PROPOSED on audit branch — not applied to production; validate in staging and confirm event trigger still fires |
| MARTIT-AUD-011 | Medium | Supabase Auth configuration | Supabase Security Advisor reports leaked-password protection is disabled (observed 2026-10-22). | Enable leaked-password protection in Supabase Auth settings after confirming the setting and expected signup/reset behavior. | OPEN — dashboard setting |
| MARTIT-AUD-012 | Low | Supabase schema hygiene | Supabase Security Advisor reports the `citext` extension is installed in `public`. This is a schema hygiene warning; impact depends on extension usage and migration dependencies. | Inventory use of `citext`; if safe, move extension to a dedicated extensions schema through a tested migration. Avoid moving it without dependency review. | OPEN — schema hygiene |
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


## Verification update — 2026-10-22

- **Latest Render deploy:** commit `0ac83ac27dafc5e2aba3ad782f9ae718943b6d57` is live. Render logs show the service became live and bound port 10000. The `GET /` 404 is consistent with an API-only service and is not by itself evidence of an outage. Recent logs include `POST /auth/me` returning both 401 and 200; the 401 requires request context before classifying as a defect.
- **Render root directory:** metadata reports `src/`, but the deployed service is live. Do not change this configuration based on metadata alone; verify build logs and actual working directory first.
- **Open pull requests:** GitHub search returned no open PRs at the time of this check.
- **Diverged branches reviewed:** `bhosaleshivendra-patch-1` contains one unique commit changing README.md (392 additions / 76 deletions); `feat/flat-10-delivery-fee` contains two unique commits, with the reported net diff touching README.md by one line. Neither is safe to delete without reviewing the unique commit messages and contents. They remain preserved.
- **Audit branch diff:** contains the issue register, proposed RLS grant migration, database regression test, README correction, and payment-verification hardening. Historical migrations are preserved; payment hardening is delivered as a forward migration.
- **RLS regression test:** assertion added to `supabase/tests/database_integrity_test.sql` for both `anon` and `authenticated` execution privileges on `public.rls_auto_enable()`. Not run against PostgreSQL yet.
- **Production safety:** the proposed migration remains unapplied. Live SQL inspection calls were blocked by the tool safety layer; do not infer that the production grant was fixed.
- **Known limitations:** repository clone/build could not run in this environment due DNS/network failure to GitHub. No dead-code deletion is claimed; safe dead-code analysis needs a complete repository-wide reference scan and build/test validation.


## Additional code-path finding — 2026-10-22

### MARTIT-AUD-013 — Medium/High — Payment verification evidence predicate is too permissive

**Evidence reviewed:** `server/src/routes/orders.js` (`handleCheckPayment`), `server/src/routes/webhooks.js`, and `mark_platform_fee_paid` in the payment-function migration.

- At the original audited revision, the customer payment-check endpoint and database function did not require an explicit authoritative-verification marker. The audit branch now requires `status = 'PAID'`, `evidence = 'Payment received'`, and `verification_source = 'AUTHORITATIVE_GATEWAY'` in both code paths.
- The webhook writes that marker only after the injected authoritative gateway verifier returns verified, and it now stops if the evidence update reports an error. The SQL change is packaged as a forward migration, not a rewrite of the historical migration.
- Current webhook code is designed to set evidence only after `verifyWithAuthoritativePaymentGateway` returns verified. Without a configured verifier, it stores `PROCESSING` and `evidence = NULL`, so the normal webhook path fails closed. This is therefore a **defense-in-depth gap / dangerous trust contract**, not evidence that an unauthenticated caller can currently mark an order paid. Actual exploitability depends on database grants, server-only write paths, and the deployed function definition.

**Changes on audit branch:** Forward migration `20261022150000_require_authoritative_payment_verification.sql`; API query filters on paid status, evidence, and verification source; webhook sets the authoritative marker only after verifier success and checks persistence errors; three static contract tests added.

**Remaining validation:** Tests have not been executed, the forward migration has not been run against PostgreSQL, and the webhook evidence update plus order transition are still separate database requests rather than one transaction. Add negative runtime tests for `PROCESSING`, arbitrary evidence, mismatched amount/order, duplicate notifications, and failed evidence updates. Do not apply to production until migration execution and all call sites are validated.

**Status:** FIX PROPOSED ON AUDIT BRANCH — static tests added but not run; runtime exploitability not established.
