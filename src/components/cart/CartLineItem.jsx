import { Minus, Plus, Trash2, AlertCircle, ShoppingBasket } from 'lucide-react'
import { Price } from '@/components/ui/Price'
import { Badge } from '@/components/ui/Badge'
import { ITEM_ILLUSTRATIONS } from '@/components/marketing/Illustrations'
import { SAMPLE_CATEGORIES } from '@/mocks/categories'
import { formatINR } from '@/utils/currency'
import { cn } from '@/utils/cn'
import { resolveProductImageUrl } from '@/utils/productImages'

/**
 * CartLineItem represents a single product line in the customer's cart.
 */
export function CartLineItem({
  line,
  product,
  onUpdateQuantity,
  onRemove,
  disabled = false,
}) {
  const { productId, quantity } = line

  // If catalogue product could not be loaded or was removed
  if (!product) {
    return (
      <div className="flex items-center justify-between gap-4 rounded-card border border-red-200/60 bg-red-50/50 p-3.5 sm:p-4 text-ink dark:border-red-900/40 dark:bg-red-950/20">
        <div className="flex items-center gap-3 min-w-0">
          <div className="grid size-12 shrink-0 place-items-center rounded-tile bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400">
            <AlertCircle className="size-6" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-danger">Item Unavailable</p>
            <p className="text-xs text-ink-subtle mt-0.5">
              Product ID ({productId}) is no longer in this store&apos;s catalogue.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => onRemove(productId)}
          className="inline-flex items-center gap-1.5 rounded-tile border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-danger hover:bg-surface-2 transition-colors shrink-0"
          aria-label={`Remove unavailable item ${productId}`}
        >
          <Trash2 className="size-3.5" aria-hidden="true" />
          <span>Remove</span>
        </button>
      </div>
    )
  }

  const { id, name, pack, price, mrp, stock, art, categoryId } = product
  const displayImageUrl = resolveProductImageUrl(product)
  const category = SAMPLE_CATEGORIES.find((c) => c.id === categoryId)
  const Art = (art && ITEM_ILLUSTRATIONS[art]) || (category?.art && ITEM_ILLUSTRATIONS[category.art]) || null
  const tint = category?.tint || '#dbeafe'

  const isOutOfStock = typeof stock === 'number' && stock <= 0
  const isMaxStock = typeof stock === 'number' && quantity >= stock
  const isExceedingStock = typeof stock === 'number' && quantity > stock
  const lineSubtotal = price * quantity

  return (
    <div
      className={cn(
        'group flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 rounded-card border border-line bg-surface p-3 sm:p-4 shadow-1 transition-all',
        (isOutOfStock || isExceedingStock) && 'border-amber-500/40 bg-amber-500/5',
      )}
    >
      {/* Product Image & Info */}
      <div className="flex items-center gap-3.5 min-w-0 flex-1">
        <div
          style={{ '--tint': tint }}
          className="relative grid size-14 sm:size-16 shrink-0 place-items-center overflow-hidden rounded-[12px] bg-[color-mix(in_oklab,var(--tint)_55%,var(--surface))] dark:bg-[color-mix(in_oklab,var(--tint)_12%,var(--surface))] p-2"
        >
          {displayImageUrl ? (
            <img
              src={displayImageUrl}
              alt={name}
              className="size-full object-contain"
              loading="lazy"
              onError={(e) => {
                e.currentTarget.style.display = 'none'
              }}
            />
          ) : Art ? (
            <Art className="size-10 sm:size-12 object-contain" />
          ) : (
            <ShoppingBasket className="size-7 text-ink-subtle/50" aria-hidden="true" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <h3 className="truncate text-sm sm:text-base font-semibold text-ink leading-snug">
              {name}
            </h3>
            {pack && <span className="text-xs text-ink-subtle shrink-0">({pack})</span>}
          </div>

          <div className="flex items-center gap-2 mt-1">
            <Price amount={price} mrp={mrp} size="sm" />
            <span className="text-xs text-ink-subtle">each</span>
          </div>

          {/* Stock Badges / Warnings */}
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {isOutOfStock ? (
              <Badge tone="danger" size="sm">
                Out of stock
              </Badge>
            ) : isExceedingStock ? (
              <Badge tone="warning" size="sm">
                Only {stock} available in store
              </Badge>
            ) : isMaxStock ? (
              <span className="text-[11px] font-medium text-ink-subtle">
                Max stock reached ({stock})
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {/* Stepper, Subtotal, and Remove Action */}
      <div className="flex items-center justify-between sm:justify-end gap-3 sm:gap-4 pt-2 sm:pt-0 border-t sm:border-t-0 border-line/60">
        {/* Quantity Stepper */}
        <div className="flex items-center rounded-tile border border-line-strong bg-surface-2 px-1 py-0.5 shadow-1">
          <button
            type="button"
            disabled={disabled || quantity <= 1}
            onClick={() => onUpdateQuantity(id, Math.max(1, quantity - 1))}
            className="grid size-7 place-items-center rounded-[6px] text-ink hover:bg-surface active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label={`Decrease ${name} quantity`}
          >
            <Minus className="size-3.5" aria-hidden="true" />
          </button>

          <span
            className="tabular min-w-7 text-center text-xs font-bold text-ink px-1"
            aria-live="polite"
          >
            {quantity}
          </span>

          <button
            type="button"
            disabled={disabled || isMaxStock || isOutOfStock}
            onClick={() => onUpdateQuantity(id, quantity + 1)}
            className="grid size-7 place-items-center rounded-[6px] text-ink hover:bg-surface active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label={`Increase ${name} quantity`}
          >
            <Plus className="size-3.5" aria-hidden="true" />
          </button>
        </div>

        {/* Line Subtotal */}
        <div className="text-right min-w-16">
          <p className="text-xs text-ink-subtle font-medium sm:hidden">Total</p>
          <span className="tabular font-bold text-sm sm:text-base text-ink">
            {formatINR(lineSubtotal)}
          </span>
        </div>

        {/* Delete button */}
        <button
          type="button"
          disabled={disabled}
          onClick={() => onRemove(id)}
          className="grid size-8 place-items-center rounded-tile text-ink-subtle hover:bg-danger-soft hover:text-danger active:scale-95 transition-colors"
          aria-label={`Remove ${name} from cart`}
        >
          <Trash2 className="size-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
