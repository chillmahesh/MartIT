import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { zustandSafeStorage } from '@/utils/storage'
import { SAMPLE_PRODUCTS } from '@/mocks/catalogue'

/**
 * Returns the storeId for a given product ID from known catalogue/mocks.
 */
export function getProductStoreId(productId) {
  const p = SAMPLE_PRODUCTS.find((item) => item.id === productId)
  return p?.storeId || null
}

/**
 * Extracts unique, valid store IDs from cart lines.
 */
export function extractDistinctStoreIds(lines = [], fallbackStoreId = null) {
  const storeIds = new Set()
  for (const line of lines) {
    const sid = line?.storeId || getProductStoreId(line?.productId) || fallbackStoreId
    if (sid) storeIds.add(sid)
  }
  if (storeIds.size === 0 && fallbackStoreId) {
    storeIds.add(fallbackStoreId)
  }
  return Array.from(storeIds)
}

/**
 * Cart holds product IDs, quantities, and their associated storeId.
 * Supports multi-store shopping where items from different campus stores
 * can coexist in a single cart session.
 * Prices shown in the cart come from the catalogue query and are re-validated
 * authoritatively by the server when the order is created.
 */
export const useCartStore = create(
  persist(
    (set, get) => ({
      storeId: null, // primary store ID for backwards compatibility
      lines: [],     // [{ productId, quantity, storeId }]
      showMultiStoreWarning: false, // triggers multi-store modal when cart becomes multi-store
      warningDismissed: false,      // persists warning acknowledgment for the current multi-store session
      checkoutDetails: {
        fullName: '',
        mobileNumber: '',
        presetLocation: 'A Block',
        customLocation: '',
        deliveryInstructions: '',
      },

      setQuantity(productId, quantity, storeId) {
        const itemStoreId = storeId || getProductStoreId(productId) || get().storeId || null
        set((s) => {
          const prevDistinctStores = extractDistinctStoreIds(s.lines, s.storeId)
          const rest = s.lines.filter((l) => l.productId !== productId)
          const nextLines =
            quantity > 0
              ? [...rest, { productId, quantity, storeId: itemStoreId }]
              : rest

          const nextDistinctStores = extractDistinctStoreIds(nextLines)
          const nextStoreId =
            nextDistinctStores.length > 0
              ? (s.storeId && nextDistinctStores.includes(s.storeId) ? s.storeId : nextDistinctStores[0])
              : null

          // Customer warning transition logic:
          // 1. Transitioning from single-store (or empty) to multi-store (>1 stores):
          //    trigger warning modal.
          let nextShowWarning = s.showMultiStoreWarning
          let nextWarningDismissed = s.warningDismissed

          if (prevDistinctStores.length <= 1 && nextDistinctStores.length > 1) {
            nextShowWarning = true
            nextWarningDismissed = false
          } else if (nextDistinctStores.length <= 1) {
            // Cart dropped back to <= 1 store: reset dismissal state so if
            // customer adds another store again later, the warning will re-trigger.
            nextShowWarning = false
            nextWarningDismissed = false
          }

          return {
            storeId: nextStoreId,
            lines: nextLines,
            showMultiStoreWarning: nextShowWarning,
            warningDismissed: nextWarningDismissed,
          }
        })
      },

      dismissMultiStoreWarning() {
        set({
          showMultiStoreWarning: false,
          warningDismissed: true,
        })
      },

      replaceCart(productId, quantity, storeId) {
        const itemStoreId = storeId || getProductStoreId(productId) || null
        set({
          storeId: quantity > 0 ? itemStoreId : null,
          lines: quantity > 0 ? [{ productId, quantity, storeId: itemStoreId }] : [],
          showMultiStoreWarning: false,
          warningDismissed: false,
        })
      },

      setCheckoutDetails(details) {
        set((s) => ({
          checkoutDetails: {
            ...s.checkoutDetails,
            ...details,
          },
        }))
      },

      resetCheckoutDetails() {
        set({
          checkoutDetails: {
            fullName: '',
            mobileNumber: '',
            presetLocation: 'A Block',
            customLocation: '',
            deliveryInstructions: '',
          },
        })
      },

      clear: () =>
        set({
          storeId: null,
          lines: [],
          showMultiStoreWarning: false,
          warningDismissed: false,
        }),
    }),
    {
      name: 'martit-cart',
      partialize: (s) => ({
        storeId: s.storeId,
        lines: s.lines,
        warningDismissed: s.warningDismissed,
      }),
      storage: createJSONStorage(() => zustandSafeStorage),
    },
  ),
)

export const selectCartCount = (s) => s.lines.reduce((n, l) => n + l.quantity, 0)

export const selectDistinctStoreIds = (s) => extractDistinctStoreIds(s.lines, s.storeId)

export const selectIsMultiStore = (s) => extractDistinctStoreIds(s.lines, s.storeId).length > 1

export const selectMultiStoreCount = (s) => extractDistinctStoreIds(s.lines, s.storeId).length

export const selectCartStoreId = (s) => {
  if (s.storeId) return s.storeId
  const distinct = extractDistinctStoreIds(s.lines)
  return distinct[0] || null
}

export const selectCartLinesByStore = (s) => {
  const map = new Map()
  for (const line of s.lines) {
    const sid = line.storeId || getProductStoreId(line.productId) || s.storeId || 'unknown'
    if (!map.has(sid)) {
      map.set(sid, [])
    }
    map.get(sid).push(line)
  }
  return Array.from(map.entries()).map(([storeId, lines]) => ({ storeId, lines }))
}
