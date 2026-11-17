import { useId, cloneElement, isValidElement } from 'react'
import { CircleAlert } from 'lucide-react'
import { cn } from '@/utils/cn'

/**
 * Label + control + hint + error, wired for screen readers.
 * The child control receives id, aria-describedby and aria-invalid automatically.
 * The error sits directly beneath the field and reserves no space until present.
 */
export function Field({ label, hint, error, optional, className, children }) {
  const id = useId()
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined

  const control = isValidElement(children)
    ? cloneElement(children, { id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })
    : children

  return (
    <div className={cn('grid gap-1.5 min-w-0', className)}>
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
        {optional && <span className="ml-1 font-normal text-ink-subtle">(optional)</span>}
      </label>
      {control}
      {hint && !error && (
        <p id={hintId} className="text-[13px] text-ink-subtle">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="flex items-start gap-1.5 text-[13px] font-medium text-danger break-words">
          <CircleAlert className="size-3.5 shrink-0 mt-0.5" aria-hidden="true" />
          <span>{error}</span>
        </p>
      )}
    </div>
  )
}
