import { Accordion } from 'radix-ui'
import { Plus } from 'lucide-react'
import { FLAT_DELIVERY_FEE, MAX_SERVICE_KM } from '@/config/fees'
import { SectionHeading } from './SectionHeading'

const FAQS = [
  {
    q: 'What is MartIT?',
    a: 'MartIT is an ordering and delivery platform for closed communities like college campuses, hostels and residential societies. You order essentials from a store that serves your community, and an approved student runner brings them to you.',
  },
  {
    q: 'How much does delivery cost?',
    a: `Delivery is a flat ₹${FLAT_DELIVERY_FEE} for all eligible orders across our campus delivery area. We don’t deliver beyond ${MAX_SERVICE_KM} km. You’ll always see the exact fee before you pay.`,
  },
  {
    q: 'How do I pay?',
    a: 'With any UPI app, by scanning the QR code at checkout. Your order is confirmed once the payment is verified by the payment system — tapping “I’ve paid” on its own doesn’t confirm an order.',
  },
  {
    q: 'What is the delivery code (OTP)?',
    a: 'Each order gets a one-time code. Share it with your runner only when you have your items in hand — the delivery is completed when they enter it. Codes expire and allow a limited number of attempts.',
  },
  {
    q: 'Who are the runners?',
    a: 'Students from the community who have been approved by the MartIT team. You can’t pick the runner role when you sign up; runner access is granted after approval.',
  },
  {
    q: 'Can I track my order?',
    a: 'Yes. You’ll see each stage as it happens: Confirmed, Preparing, Picked up, On the way and Delivered.',
  },
  {
    q: 'Who can see my orders?',
    a: 'Only you. The runner assigned to your order sees the details needed to deliver it.',
  },
]

export function Faq() {
  return (
    <section id="faq" aria-labelledby="faq-title" className="mx-auto grid max-w-6xl scroll-mt-20 gap-10 px-4 py-20 md:grid-cols-[1fr_1.5fr] md:px-6 md:py-28">
      <SectionHeading id="faq-title" eyebrow="FAQ" title="Questions, answered." className="md:sticky md:top-28 md:self-start" />

      <Accordion.Root type="single" collapsible className="divide-y divide-line border-y border-line">
        {FAQS.map(({ q, a }, i) => (
          <Accordion.Item key={q} value={`q${i}`}>
            <Accordion.Header>
              <Accordion.Trigger className="group flex w-full items-center justify-between gap-6 py-5 text-left font-display text-lg font-semibold tracking-tight transition-colors hover:text-fresh-ink md:text-xl">
                {q}
                <span className="grid size-9 shrink-0 place-items-center rounded-full border border-line-strong transition-[transform,background-color] duration-300 ease-out-soft group-data-[state=open]:rotate-45 group-data-[state=open]:bg-accent group-data-[state=open]:text-accent-ink group-data-[state=open]:border-transparent">
                  <Plus className="size-4" aria-hidden="true" />
                </span>
              </Accordion.Trigger>
            </Accordion.Header>
            <Accordion.Content className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
              <p className="max-w-prose pb-6 text-ink-muted">{a}</p>
            </Accordion.Content>
          </Accordion.Item>
        ))}
      </Accordion.Root>
    </section>
  )
}
