import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { cn } from '@/utils/cn'

export const inputClass = cn(
  'h-12 w-full rounded-tile border border-line-strong bg-surface px-4 text-[15px] text-ink min-w-0',
  'placeholder:text-ink-subtle transition-[border-color,box-shadow] duration-200',
  'hover:border-ink-subtle focus:border-brand focus:outline-none focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--brand)_22%,transparent)]',
  'aria-invalid:border-danger aria-invalid:focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--danger)_22%,transparent)]',
  'disabled:cursor-not-allowed disabled:opacity-60',
)

/** Text input with an optional leading icon. */
export function Input({ className, icon: Icon, ...props }) {
  if (!Icon) return <input className={cn(inputClass, className)} {...props} />
  return (
    <div className="relative">
      <Icon className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-ink-subtle" aria-hidden="true" />
      <input className={cn(inputClass, 'pl-10', className)} {...props} />
    </div>
  )
}

/** Password input with an accessible show/hide toggle. */
export function PasswordInput({ className, ...props }) {
  const [visible, setVisible] = useState(false)
  const Icon = visible ? EyeOff : Eye
  return (
    <div className="relative">
      <input
        type={visible ? 'text' : 'password'}
        autoComplete="current-password"
        className={cn(inputClass, 'pr-12', className)}
        {...props}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        className="absolute right-1.5 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-[10px] text-ink-subtle transition-colors hover:bg-surface-2 hover:text-ink"
      >
        <Icon className="size-[18px]" aria-hidden="true" />
      </button>
    </div>
  )
}
