import { m } from 'motion/react'
import { BadgeCheck, Building2, KeyRound, MapPin, QrCode, Radio } from 'lucide-react'
import { FLAT_DELIVERY_FEE, MAX_SERVICE_KM } from '@/config/fees'
import { ORDER_STATUS_LABEL, ORDER_TIMELINE } from '@/utils/orderMachine'
import { cn } from '@/utils/cn'
import { ease } from '@/utils/motion'
import { SectionHeading } from './SectionHeading'
import { FauxQr } from '@/components/ui/FauxQr'

/** Sets --mx/--my for the CSS spotlight. Pattern adapted from Magic UI "Magic Card" (magicui.design). */
function trackSpotlight(e) {
  const r = e.currentTarget.getBoundingClientRect()
  e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`)
  e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`)
}

function Tile({ className, children, index, beam = false, accent = false }) {
  return (
    <m.li
      onPointerMove={trackSpotlight}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.55, delay: index * 0.06, ease: ease.outSoft }}
      className={cn(
        'spotlight overflow-hidden rounded-card p-6',
        accent ? 'bg-accent text-accent-ink' : beam ? 'border-beam' : 'border border-line bg-surface',
        className,
      )}
    >
      {children}
    </m.li>
  )
}

function TileTitle({ icon: Icon, children, accent }) {
  return (
    <h3 className="flex items-center gap-2.5 font-display text-xl font-semibold tracking-tight">
      <span className={cn('grid size-9 place-items-center rounded-[10px]', accent ? 'bg-accent-ink/10' : 'bg-brand-soft text-fresh-ink')}>
        <Icon className="size-[18px]" aria-hidden="true" />
      </span>
      {children}
    </h3>
  )
}

const feeRows = [
  [`Campus delivery (up to ${MAX_SERVICE_KM} km)`, `₹${FLAT_DELIVERY_FEE} flat fee`],
  [`Beyond ${MAX_SERVICE_KM} km`, 'Checkout blocked'],
]

export function FeatureBento() {
  return (
    <section aria-labelledby="features-title" className="mx-auto max-w-6xl px-4 py-20 md:px-6 md:py-28">
      <SectionHeading
        id="features-title"
        eyebrow="What you get"
        title="Built for the way campuses actually run."
        lede="Every part of an order — payment, handover, tracking — has a check behind it."
      />

      <ul className="mt-12 grid gap-4 md:grid-cols-6">
        {/* UPI */}
        <Tile index={0} className="md:col-span-3 md:row-span-2">
          <TileTitle icon={QrCode}>Pay by UPI</TileTitle>
          <p className="mt-2 max-w-sm text-ink-muted">
            Scan and pay with any UPI app. Your order is confirmed only when the payment system confirms it — not when someone taps “I’ve paid”.
          </p>
          <FauxQr scanning seed={11} className="mx-auto mt-8 size-44 border border-line" />
          <p className="mt-3 text-center text-xs text-ink-subtle">Illustration — not a real QR code</p>
        </Tile>

        {/* OTP — the one border-beam tile */}
        <Tile index={1} beam className="md:col-span-3">
          <TileTitle icon={KeyRound}>OTP handover</TileTitle>
          <p className="mt-2 text-ink-muted">Your runner needs the one-time code from you to complete delivery. Codes expire and allow limited attempts.</p>
          <div className="mt-5 flex gap-2" aria-hidden="true">
            {['•', '•', '•', '•'].map((d, i) => (
              <span key={i} className="grid size-11 place-items-center rounded-tile border-2 border-line-strong bg-surface-2 font-display text-xl text-ink-muted">{d}</span>
            ))}
          </div>
        </Tile>

        {/* Status */}
        <Tile index={2} className="md:col-span-3">
          <TileTitle icon={Radio}>Live order status</TileTitle>
          <ol className="mt-5 flex flex-wrap gap-2 text-xs font-medium">
            {ORDER_TIMELINE.map((s, i) => (
              <li key={s} className={cn('rounded-full px-2.5 py-1', i < 3 ? 'bg-brand-soft text-fresh-ink' : 'bg-surface-2 text-ink-subtle')}>
                {ORDER_STATUS_LABEL[s]}
              </li>
            ))}
          </ol>
        </Tile>

        {/* Fee — the one accent tile */}
        <Tile index={3} accent className="md:col-span-2">
          <TileTitle icon={MapPin} accent>Fee shown upfront</TileTitle>
          <dl className="tabular mt-4 grid gap-1.5 text-sm">
            {feeRows.map(([range, fee]) => (
              <div key={range} className="flex justify-between border-b border-accent-ink/10 pb-1.5">
                <dt>{range}</dt>
                <dd className="font-semibold">{fee}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-xs">Measured from the store to your saved spot. No delivery beyond {MAX_SERVICE_KM} km.</p>
        </Tile>

        <Tile index={4} className="md:col-span-2">
          <TileTitle icon={BadgeCheck}>Approved runners</TileTitle>
          <p className="mt-2 text-ink-muted">Runners are students verified and approved by the MartIT team. Nobody becomes a runner just by signing up.</p>
        </Tile>

        <Tile index={5} className="md:col-span-2">
          <TileTitle icon={Building2}>Closed communities</TileTitle>
          <p className="mt-2 text-ink-muted">Made for campuses, hostels and residential societies — deliveries to blocks and gates you already know.</p>
        </Tile>
      </ul>
    </section>
  )
}
