import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { zustandSafeStorage } from '@/utils/storage'
import { SAMPLE_PRODUCTS } from '@/mocks/catalogue'

/**
 * Cart holds product IDs, quantities and the store they belong to.
 * Prices shown in the cart come from the catalogue query and are re-validated
 * by the server when the order is created.
 *
 * All items in the cart must belong to the same store.
 */
export const useCartStore = create(
  persist(
    (set, get) => ({
      storeId: null, // which store the current items belong to
      lines: [],     // [{ productId, quantity }]
      checkoutDetails: {
        fullName: '',
        mobileNumber: '',
        presetLocation: 'A Block',
        customLocation: '',
        deliveryInstructions: '',
      },

      setQuantity(productId, quantity, storeId) {
        const productStoreId = storeId || SAMPLE_PRODUCTS.find((p) => p.id === productId)?.storeId || null
        set((s) => {
          const rest = s.lines.filter((l) => l.productId !== productId)
          const nextLines = quantity > 0 ? [...rest, { productId, quantity }] : rest
          const nextStoreId = nextLines.length > 0 ? (s.storeId || productStoreId) : null
          return {
            storeId: nextStoreId,
            lines: nextLines,
          }
        })
      },

      replaceCart(productId, quantity, storeId) {
        const productStoreId = storeId || SAMPLE_PRODUCTS.find((p) => p.id === productId)?.storeId || null
        set({
          storeId: quantity > 0 ? productStoreId : null,
          lines: quantity > 0 ? [{ productId, quantity }] : [],
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

      clear: () => set({ storeId: null, lines: [] }),
    }),
    {
      name: 'martit-cart',
      partialize: (s) => ({
        storeId: s.storeId,
        lines: s.lines,
      }),
      storage: createJSONStorage(() => zustandSafeStorage),
    },
  ),
)

export const selectCartCount = (s) => s.lines.reduce((n, l) => n + l.quantity, 0)

export const selectCartStoreId = (s) => {
  if (s.storeId) return s.storeId
  if (s.lines.length === 0) return null
  const first = SAMPLE_PRODUCTS.find((p) => p.id === s.lines[0]?.productId)
  return first?.storeId || null
}
