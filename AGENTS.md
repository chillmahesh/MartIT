# MartIT Repository Agent Instructions

Before modifying code, read `docs/REPAIR_MASTER_PLAN.md`, `docs/REPAIR_PROGRESS.md`, `docs/ORDER_LIFECYCLE_IMPLEMENTATION_PLAN.md`, and any existing repository instructions.

## Architecture and safety
- Preserve the existing Make.com + Gmail payment-verification workflow. Do not add another payment gateway or SMS OTP provider.
- Preserve pricing, platform-fee allocation/release, delivery fees, night surcharge, order-state semantics, inventory reservation/expiry, authentication roles, and atomic runner exclusivity unless evidence proves a defect and the approved plan authorizes a change.
- Never equate HTTP 200 with payment success. Unknown, timed-out, malformed, or inconclusive verification must fail closed.
- Never expose secrets, tokens, service-role credentials, or sensitive customer information.
- Never weaken RLS, grants, or authorization just to make a feature work.
- Treat database advisor warnings as leads; inspect the relevant function, policy, and call path before changing anything.
- Do not experiment on production data or apply unreviewed production migrations.
- Do not fabricate test accounts, payment evidence, or live integration results.

## Change management
- Preserve user changes; do not run destructive cleanup/reset commands.
- Inspect the full diff before each commit and exclude unrelated changes.
- Work in ordered milestones from `docs/REPAIR_MASTER_PLAN.md`.
- Run milestone-specific tests before committing.
- Commit each completed, verified milestone separately. Update `docs/REPAIR_PROGRESS.md` in that milestone commit.
- If verification fails, do not mark the milestone `VERIFIED` or create a completion commit. Fix it or record a `BLOCKED` state with evidence.
- Distinguish unit/mocked tests from local integration and live staging tests.
- Never claim a test, build, migration, API call, or deployment succeeded without evidence.

## Explicitly prohibited without user authorization
- `git push`
- Creating a pull request
- Merging into the default branch
- Deploying or promoting a deployment
- Applying unreviewed database migrations or exploratory production data changes
- Changing payment architecture, pricing, security boundaries, or order-state semantics beyond the approved plan

Before reporting completion, compare actual changes and test output with the plan and progress ledger. Report exact commit SHAs, test results, unverified live integrations, blockers, and manual staging steps.
