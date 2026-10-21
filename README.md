# MartIT

Smart ordering and student-powered delivery for closed communities: campuses, hostels and residential societies. Customers order essentials, pay by UPI, track the order and receive it from a student runner with an OTP-verified handover.

## Setup

Requires Node 20+.

```bash
npm install
cp .env.example .env.local   # optional — leave VITE_API_BASE_URL empty to use the mock backend
npm run dev                  # http://localhost:5173
npm test                     # unit tests (fees, state machines, mock server)
npm run build                # production build in dist/
```

Useful routes while building:
- `/` — the landing page. In Phase 1 this is a shell; the full page comes in Phase 2.
- `/styleguide` — design tokens, components, the delivery-fee lab and an access-rules tester. It is internal and not linked from the site.
- `/login` — sign in with a sample customer, a sample approved runner or a sample super admin (mock backend only).
- `/admin` — admin console (people & roles), for admins and super admins.

## Tech stack

| Area | Choice |
|---|---|
| App | React 19 + Vite, React Router (data router, code-split routes) |
| Styling | Tailwind CSS v4 with CSS-variable tokens (light + dark) in `src/styles/tokens.css` |
| Data | TanStack Query (server state), Zustand (cart, session, theme) |
| UI primitives | Radix (`radix-ui`): Dialog, DropdownMenu, Switch, Slot. Patterns adapted from shadcn/ui, with credits in comments |
| Motion | Motion (`motion/react`, using `LazyMotion` + `m` so the animation engine is code-split), Lenis smooth scroll. GSAP + ScrollTrigger are installed for the scroll storytelling in Phase 2 |
| Icons / fonts | Lucide; self-hosted Bricolage Grotesque (display) + Geist (UI) |
| Tests | Vitest |

## Project structure

```
src/
  app/          router, providers, layouts, route guards
  components/   ui/ (primitives) · layout/ · products/ · cart/ · orders/ · runner/ · marketing/
  pages/        landing/ · auth/ · customer/ · runner/ · dev/ (styleguide)
  services/     domain services (auth, delivery, orders, locations) → api.js → backend or mockServer/
  config/       fees.js (pricing source of truth), env.js
  utils/        deliveryFee, orderTotals, order/payment state machines, distance, currency
  hooks/  stores/  mocks/  styles/
docs/           design research, fee policy, brand assets
```

Components never call the backend directly. They call `services/*`, which go through `services/api.js`. When `VITE_API_BASE_URL` is empty, `api.js` routes calls to the in-browser mock server. When it's set, it POSTs to `${VITE_API_BASE_URL}/<service>/<action>` with a bearer token.

## What's mocked vs real

| Capability | Status | Notes |
|---|---|---|
| Delivery-fee rules | **Real logic** | `utils/deliveryFee.js`, fully unit-tested. The backend must mirror `config/fees.js` |
| Order totals (items + delivery) | **Real logic** | Taxes, platform fees and discounts are excluded until defined |
| Order & payment state machines | **Real logic** | Separate machines. Only a `server_verified` source can mark a payment PAID |
| Backend / database | Mock | `services/mockServer/` keeps in-memory data that resets on reload |
| Authentication | Mock | Sample accounts only. The real login form comes in Phase 3 |
| Server re-pricing at order creation | Mock (behaviour real) | The mock ignores browser prices and fees, re-checks stock, re-quotes delivery and snapshots the pricing |
| Distance | Mock: straight-line | No routing service yet. The UI says "straight-line distance". A routing provider plugs into `mockServer/routing.js` |
| Store, product and location data | Sample data | `src/mocks/`, labelled as sample in the UI |
| UPI payment verification | Not built | Phase 4. The status will only come from a verified server source |
| Runner assignment (atomic accept) | Not built | Phase 5. It will be a single server call that fails if the order is already taken |
| Delivery OTP | UI only | Phase 5. Codes will be short-lived, attempt-limited and verified on the backend |
| Realtime tracking | Not built | Phase 4. It will be a clearly labelled simulation until realtime is wired |

## Business rules baked into the code

- **Delivery fee** (confirmed 2026-10-09; see [docs/fee-policy.md](docs/fee-policy.md)):
  - ₹10 for every started delivery.
  - Checkout is blocked beyond 5 km, and there is no free delivery.
  - The fee is calculated from the unrounded distance, and the server is authoritative.
- **Snapshots:** each order stores its fee, distance, distance method and pricing version.
- **Fee split:** the runner payout is separate from the customer fee. Only the ₹10 → ₹8 example exists so far; the other payouts are undecided (`null`).
- **Roles and permissions** are defined in `src/utils/permissions.js` and shared by the UI and the server. The server enforces them; route guards are UX only.

  | Role | Can |
  |---|---|
  | Customer | Shop and see their own orders. Every sign-up gets this role |
  | Runner | Deliver orders, but only once `runnerStatus` is `approved` |
  | Admin | Open the admin console, view users, approve or suspend runners, view all orders |
  | Super admin | Everything, including assigning or removing any role (admin and super admin too) and managing pricing |

  Nobody can choose a role at sign-up. A super admin can't remove their own super admin role, and the last super admin can't be removed.
- **Secrets:** none are in client code. Only `VITE_*` public values are read (see `.env.example`).

## Open decisions

- Runner payouts for the ₹15–₹35 fee bands.
- Tax and platform-fee values, if any.
- A vector (SVG) version of the logo. The current mark is extracted from the supplied raster image (`public/brand/`).
- A routing provider for walking or road distance.
