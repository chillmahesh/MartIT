import { useMemo, useState } from 'react'
import { m } from 'motion/react'
import { Minus, Plus, ShoppingBasket, AlertTriangle } from 'lucide-react'
import { Price } from '@/components/ui/Price'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Dialog, DialogContent } from '@/components/ui/Dialog'
import { useCartStore, selectCartStoreId } from '@/stores/cartStore'
import { useStores } from '@/hooks/useCatalogue'
import { ITEM_ILLUSTRATIONS } from '@/components/marketing/Illustrations'
import { SAMPLE_CATEGORIES } from '@/mocks/categories'
import { SAMPLE_STORES } from '@/mocks/campus'
import { cn } from '@/utils/cn'
import { spring } from '@/utils/motion'
import { resolveProductImageUrl } from '@/utils/productImages'

/**
 * ProductCard with illustration, pack details, stock badges, price with MRP strikethrough,
 * non-blocking store metadata, and integrated add-to-cart quantity stepper connected to useCartStore.
 */
export function ProductCard({ product, className }) {
  const { id, name, pack, price, mrp, stock, art, categoryId, storeId } = product
  const displayImageUrl = resolveProductImageUrl(product)
  const [imageError, setImageError] = useState(false)
  const quantity = useCartStore((s) => s.lines.find((l) => l.productId === id)?.quantity ?? 0)
  const setQuantity = useCartStore((s) => s.setQuantity)
  const replaceCart = useCartStore((s) => s.replaceCart)
  const cartStoreId = useCartStore(selectCartStoreId)
  const cartLines = useCartStore((s) => s.lines)

  const { data: stores = [] } = useStores()
  const productStore = stores.find((s) => s.id === storeId) || SAMPLE_STORES.find((s) => s.id === storeId)
  const storeName = productStore?.name?.replace(/\s*\(sample store\)/i, '') || ''
  const isStoreClosed = productStore ? !productStore.isOpen : false

  const [showSwitchStoreDialog, setShowSwitchStoreDialog] = useState(false)

  const isOutOfStock = typeof stock === 'number' && stock <= 0
  const isLowStock = typeof stock === 'number' && stock > 0 && stock <= 5
  const isMaxQuantity = typeof stock === 'number' && quantity >= stock

  const category = useMemo(() => {
    return SAMPLE_CATEGORIES.find((c) => c.id === categoryId)
  }, [categoryId])

  const currentStoreName =
    stores.find((s) => s.id === cartStoreId)?.name ||
    SAMPLE_STORES.find((s) => s.id === cartStoreId)?.name ||
    'another store'
  const newStoreName = productStore?.name || 'this store'

  const Art = (art && ITEM_ILLUSTRATIONS[art]) || (category?.art && ITEM_ILLUSTRATIONS[category.art]) || null
  const tint = category?.tint || '#dbeafe'

  const handleAdd = (e) => {
    e.stopPropagation()
    if (isOutOfStock || isStoreClosed) return
    if (cartStoreId && storeId && cartStoreId !== storeId && cartLines.length > 0) {
      setShowSwitchStoreDialog(true)
      return
    }
    setQuantity(id, 1, storeId)
  }

  const handleIncrement = (e) => {
    e.stopPropagation()
    if (isMaxQuantity || isStoreClosed) return
    if (cartStoreId && storeId && cartStoreId !== storeId && cartLines.length > 0) {
      setShowSwitchStoreDialog(true)
      return
    }
    setQuantity(id, quantity + 1, storeId)
  }

  const handleDecrement = (e) => {
    e.stopPropagation()
    setQuantity(id, Math.max(0, quantity - 1), storeId)
  }

  const handleConfirmStoreSwitch = () => {
    replaceCart(id, 1, storeId)
    setShowSwitchStoreDialog(false)
  }

  return (
    <div
      data-cursor="hover"
      className={cn(
        'group relative flex flex-col justify-between rounded-card border border-line bg-surface p-3 sm:p-4 shadow-1',
        'transition-[transform,box-shadow,border-color] duration-300 ease-out-soft hover:-translate-y-1 hover:shadow-2 hover:border-line-strong',
        (isOutOfStock || isStoreClosed) && 'opacity-85',
        className,
      )}
    >
      {/* Top Media / Illustration */}
      <div
        style={{ '--tint': tint }}
        className="relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-[14px] bg-[color-mix(in_oklab,var(--tint)_55%,var(--surface))] dark:bg-[color-mix(in_oklab,var(--tint)_12%,var(--surface))] p-3"
      >
        {displayImageUrl && !imageError ? (
          <img
            src={displayImageUrl}
            alt={name}
            onError={() => setImageError(true)}
            className="size-full object-contain drop-shadow-sm transition-transform duration-500 ease-spring group-hover:scale-105"
            loading="lazy"
          />
        ) : Art ? (
          <Art className="size-20 sm:size-24 transition-transform duration-500 ease-spring group-hover:scale-110 group-hover:-rotate-3" />
        ) : (
          <ShoppingBasket className="size-14 text-ink-subtle/50 transition-transform duration-300 group-hover:scale-105" aria-hidden="true" />
        )}

        {/* Stock / Discount Badges */}
        <div className="absolute left-2 top-2 flex flex-col gap-1 items-start">
          {isOutOfStock && (
            <Badge tone="danger" size="sm" className="shadow-1">
              Out of stock
            </Badge>
          )}
          {!isOutOfStock && isStoreClosed && (
            <Badge tone="warning" size="sm" className="shadow-1">
              Store closed
            </Badge>
          )}
          {!isOutOfStock && !isStoreClosed && isLowStock && (
            <Badge tone="warning" size="sm" className="shadow-1">
              Only {stock} left
            </Badge>
          )}
          {!isOutOfStock && typeof mrp === 'number' && mrp > price && (
            <span className="rounded-full bg-fresh-ink px-2 py-0.5 text-[11px] font-bold text-white shadow-1">
              ₹{mrp - price} OFF
            </span>
          )}
        </div>
      </div>

      {/* Product Information */}
      <div className="mt-3 flex flex-1 flex-col">
        <div className="flex items-baseline justify-between gap-1">
          <p className="text-xs font-medium text-ink-subtle">{pack}</p>
          {storeName ? (
            <span className="text-[11px] font-medium text-ink-subtle/80 truncate max-w-[120px]" title={storeName}>
              {storeName}
            </span>
          ) : category ? (
            <span className="text-[11px] font-medium text-ink-subtle/80 hidden xs:inline-block">
              {category.name.split('&')[0].trim()}
            </span>
          ) : null}
        </div>
        <h3 className="mt-0.5 line-clamp-2 text-sm sm:text-[15px] font-semibold text-ink leading-snug">
          {name}
        </h3>

        {/* Price & Action Row */}
        <div className="mt-4 flex items-center justify-between gap-2 pt-1 border-t border-line/60">
          <Price amount={price} mrp={mrp} size="md" />

          {isOutOfStock ? (
            <button
              type="button"
              disabled
              className="h-8 rounded-tile border border-line bg-surface-2 px-3 text-xs font-medium text-ink-subtle cursor-not-allowed opacity-70"
            >
              Unavailable
            </button>
          ) : isStoreClosed ? (
            <button
              type="button"
              disabled
              className="h-8 rounded-tile border border-line bg-surface-2 px-3 text-xs font-medium text-ink-subtle cursor-not-allowed opacity-70"
              title="This store is currently closed"
            >
              Store closed
            </button>
          ) : quantity === 0 ? (
            <button
              type="button"
              onClick={handleAdd}
              aria-label={`Add ${name} to cart`}
              className={cn(
                'h-8.5 rounded-tile border-2 border-brand/80 bg-surface px-3.5 text-xs font-bold text-brand',
                'transition-[background-color,border-color,color,transform] duration-200 ease-out-soft',
                'hover:bg-brand hover:text-white active:scale-95 shadow-1',
              )}
            >
              + Add
            </button>
          ) : (
            <m.div
              layout
              transition={spring.snappy}
              className="flex h-8.5 items-center rounded-tile border-2 border-brand bg-brand px-1 text-white shadow-1"
            >
              <button
                type="button"
                onClick={handleDecrement}
                aria-label={`Decrease ${name} quantity`}
                className="grid size-6 place-items-center rounded-[6px] hover:bg-white/20 active:scale-90 transition-transform"
              >
                <Minus className="size-3.5" aria-hidden="true" />
              </button>
              <span className="tabular min-w-5 text-center text-xs font-bold px-1" aria-live="polite">
                {quantity}
              </span>
              <button
                type="button"
                onClick={handleIncrement}
                disabled={isMaxQuantity}
                aria-label={`Increase ${name} quantity`}
                className={cn(
                  'grid size-6 place-items-center rounded-[6px] transition-transform',
                  isMaxQuantity ? 'opacity-40 cursor-not-allowed' : 'hover:bg-white/20 active:scale-90',
                )}
              >
                <Plus className="size-3.5" aria-hidden="true" />
              </button>
            </m.div>
          )}
        </div>
      </div>

      {/* Switch Store Confirmation Dialog */}
      <Dialog open={showSwitchStoreDialog} onOpenChange={setShowSwitchStoreDialog}>
        <DialogContent
          title="Start a new cart?"
          description="Your cart can only contain items from one store at a time."
        >
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-card bg-amber-500/10 border border-amber-500/30 p-3 text-sm text-ink">
              <AlertTriangle className="size-5 shrink-0 text-amber-500 mt-0.5" aria-hidden="true" />
              <p>
                Your cart currently contains items from <strong>{currentStoreName}</strong>. Adding items from <strong>{newStoreName}</strong> will clear your current cart.
              </p>
            </div>

            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowSwitchStoreDialog(false)}
              >
                Keep current cart
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleConfirmStoreSwitch}
              >
                Clear cart & add item
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
