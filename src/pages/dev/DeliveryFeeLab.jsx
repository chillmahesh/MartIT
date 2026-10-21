import { useState } from 'react'
import { CircleAlert, Info } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Skeleton } from '@/components/ui/Skeleton'
import { Price } from '@/components/ui/Price'
import { inputClass } from '@/components/ui/Input'
import { useLocations } from '@/hooks/useLocations'
import { useDeliveryQuote } from '@/hooks/useDeliveryQuote'
import { calculateDeliveryFee, DELIVERY_FEE_MESSAGES } from '@/utils/deliveryFee'
import { DISTANCE_METHOD_LABEL, formatDistance } from '@/utils/distance'
import { FLAT_DELIVERY_FEE, MAX_SERVICE_KM } from '@/config/fees'
import { cn } from '@/utils/cn'

const STORE_ID = 'store_campus_mart'

const TABLE = [
  [`0 < d ≤ ${MAX_SERVICE_KM} km (Campus)`, FLAT_DELIVERY_FEE],
]

export function DeliveryFeeLab() {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <ServerQuote />
      <EstimateSlider />
    </div>
  )
}

/** Calls the (mock) server exactly as checkout will: store + saved location → authoritative quote. */
function ServerQuote() {
  const { data: locations } = useLocations()
  const [locationId, setLocationId] = useState('loc_hostel_b')
  const { data: quote, error, isFetching } = useDeliveryQuote({ storeId: STORE_ID, locationId })

  return (
    <Card className="p-5">
      <p className="font-semibold">Server quote</p>
      <p className="mt-1 text-sm text-ink-muted">From Campus Mart (sample store). Changing the spot re-quotes automatically.</p>
      <label htmlFor="fee-loc" className="mt-4 block text-sm font-medium">Delivery spot</label>
      <select id="fee-loc" value={locationId} onChange={(e) => setLocationId(e.target.value)} className={cn(inputClass, 'mt-1.5 appearance-none')}>
        {locations?.map((l) => (
          <option key={l.id} value={l.id}>{l.name}</option>
        ))}
      </select>

      <div className="mt-5 min-h-[92px]" aria-live="polite">
        {isFetching ? (
          <div className="grid gap-2">
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-4 w-56" />
          </div>
        ) : error ? (
          <p className="flex gap-2 rounded-tile bg-danger-soft p-3 text-sm font-medium text-danger">
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {error.message}
          </p>
        ) : quote ? (
          <div>
            <Price amount={quote.deliveryFee} size="lg" />
            <p className="mt-1 text-sm text-ink-muted">
              {quote.feeLabel} · {formatDistance(quote.distanceKm)} {DISTANCE_METHOD_LABEL[quote.distanceMethod]}
            </p>
            {quote.distanceMethod === 'straight_line' && (
              <p className="mt-2 flex gap-1.5 text-[13px] text-ink-subtle">
                <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                Measured as a straight line, not walking or road distance. No routing service is connected yet.
              </p>
            )}
          </div>
        ) : null}
      </div>
    </Card>
  )
}

/** Pure client-side estimate across the whole range, highlighting the active band. */
function EstimateSlider() {
  const [km, setKm] = useState(1.2)
  const r = calculateDeliveryFee(km)
  const activeIndex = r.ok ? TABLE.findIndex(([, fee]) => fee === r.fee) : -1

  return (
    <Card className="p-5">
      <p className="font-semibold">Estimate by distance</p>
      <label htmlFor="fee-km" className="mt-4 flex items-baseline justify-between text-sm font-medium">
        Distance <span className="tabular text-ink-muted">{km.toFixed(3)} km</span>
      </label>
      <input
        id="fee-km"
        type="range"
        min={0.01}
        max={6}
        step={0.001}
        value={km}
        onChange={(e) => setKm(Number(e.target.value))}
        className="mt-2 w-full accent-[var(--brand)]"
      />
      <div className="mt-3 min-h-10">
        {r.ok ? (
          <p className="flex items-baseline gap-2">
            <Price amount={r.fee} size="lg" /> <span className="text-sm text-ink-muted">estimate</span>
          </p>
        ) : (
          <p className="text-sm font-medium text-danger">{DELIVERY_FEE_MESSAGES[r.reason]}</p>
        )}
      </div>
      <table className="tabular mt-4 w-full text-sm">
        <caption className="sr-only">Delivery fee bands</caption>
        <thead>
          <tr className="text-left text-ink-subtle">
            <th scope="col" className="pb-2 font-medium">Distance</th>
            <th scope="col" className="pb-2 text-right font-medium">Fee</th>
          </tr>
        </thead>
        <tbody>
          {TABLE.map(([range, fee], i) => (
            <tr key={range} className={cn('transition-colors', i === activeIndex && 'bg-brand-soft font-semibold text-fresh-ink')}>
              <td className="rounded-l-[8px] px-2 py-1.5">{range}</td>
              <td className="rounded-r-[8px] px-2 py-1.5 text-right">₹{fee}</td>
            </tr>
          ))}
          <tr className={cn(!r.ok && r.reason === 'OUT_OF_SERVICE_AREA' && 'bg-danger-soft font-semibold text-danger')}>
            <td className="rounded-l-[8px] px-2 py-1.5">d &gt; {MAX_SERVICE_KM} km</td>
            <td className="rounded-r-[8px] px-2 py-1.5 text-right">Blocked</td>
          </tr>
        </tbody>
      </table>
    </Card>
  )
}
