import { Search, X } from 'lucide-react'
import { cn } from '@/utils/cn'

export function CatalogueSearch({
  value,
  onChange,
  onClear,
  placeholder = 'Search milk, bread, instant noodles, stationery...',
  className,
}) {
  return (
    <div className={cn('relative w-full', className)}>
      <Search
        className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-ink-subtle"
        aria-hidden="true"
      />
      <input
        type="search"
        value={value}
        maxLength={100}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClear()
        }}
        placeholder={placeholder}
        aria-label="Search catalogue products"
        className={cn(
          'h-11 w-full rounded-tile border border-line-strong bg-surface pl-10 pr-10 text-[15px] text-ink shadow-1 min-w-0',
          'placeholder:text-ink-subtle/80 transition-[border-color,box-shadow] duration-200',
          'hover:border-ink-subtle focus:border-brand focus:outline-none focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--brand)_22%,transparent)]',
        )}
      />
      {value && (
        <button
          type="button"
          onClick={onClear}
          aria-label="Clear search"
          className="absolute right-2.5 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-full text-ink-subtle hover:bg-surface-2 hover:text-ink transition-colors"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      )}
    </div>
  )
}
