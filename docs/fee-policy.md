# MartIT — Delivery Fee Policy

**Status: confirmed by the product owner for MVP, 2026-10-16.** Code: `src/config/fees.js`, `src/utils/deliveryFee.js`, `server/src/routes/delivery.js`. Tests: `src/utils/__tests__/deliveryFee.test.js`, `src/pages/customer/__tests__/flatDeliveryFeePolicy.test.jsx`.

## MVP Customer delivery fee: Flat ₹10
- **Flat ₹10 delivery is the MVP policy:** MartIT charges a single flat ₹10 delivery fee per eligible parent order across all valid supported campus delivery destinations.
- **Distance-based delivery pricing and route optimization are deferred:** Checkout eliminates the dependency on route-distance quotes or walking routing services for delivery-fee calculation. For any valid, supported campus destination, checkout displays a flat ₹10 delivery fee directly.
- **Supported delivery-area restrictions still apply:** Removing distance-based pricing does not allow unsupported destinations. The maximum delivery radius remains 5 km (`MAX_SERVICE_KM = 5`). Both store and destination must have valid, finite geographic coordinates; missing or invalid coordinates are rejected with HTTP 422 `INVALID_COORDINATES` without fabricating default distances. Outside the service radius or for unsupported/inactive destinations, checkout is blocked with an explicit error.
- **No free delivery:** There is no free delivery threshold, regardless of cart value.

## Multi-store parent orders
- Exactly **one delivery fee applies per parent order:** When a customer orders items across multiple stores in a single checkout, exactly one flat ₹10 delivery fee is charged at the parent-order level.
- Store fulfillment groups do not each add a delivery fee.
- Item subtotals and fulfillment-group records remain consistent with existing data contracts.
- **Current MVP status:** Multi-store checkout remains **unsupported and not enabled** in the current release. The cart enforces single-store shopping, and multi-store quote requests fail-closed with HTTP 422 `MULTI_STORE_ROUTING_UNAVAILABLE`. The single-parent-fee invariant defines the contract for future multi-store releases.

## Customer total calculation
The authoritative total calculation follows the established rule:
1. Calculate item subtotal across all ordered items.
2. Add ₹10 flat delivery fee.
3. Round that combined amount (`item_subtotal + combined_delivery_fee`) to the nearest whole rupee (`base_amount`).
4. Add the unrounded dynamically allocated platform fee (`total_payable = base_amount + platform_fee`).

## Dynamic platform fee
- The dynamically allocated ₹0.01–₹0.99 platform fee identifier is preserved.
- Platform fee reservation, verification window (2 minutes), cooldown (5 minutes), and UPI payment correlation semantics remain completely unchanged.

## Fee split & Runner payout (Internal ledger)
- The customer delivery fee and the runner's payout are separate values in the internal ledger (never shown to customers).
- **Existing runner payout rule is unchanged:** For the ₹10 delivery-fee band, the runner payout is **₹8** and MartIT retains **₹2** as platform delivery share.
- Legacy or unsupported payout bands (for historical orders carrying ₹15–₹35 fees) remain unchanged (`null` in config; the UI displays "payout confirmed at assignment" rather than inventing a figure).
- Store commission goes into a separate ledger and is not derived from the delivery fee.

## Historical order retention
- Each order saves its delivery fee, distance, distance method, and pricing version (`fee_policy_version` / `pricingVersion`).
- Pricing policy changes apply only to new eligible orders; historical orders retain their recorded delivery fee, total, platform fee, and payout data.
