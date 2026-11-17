import { LegalPageShell } from '@/components/legal/LegalPageShell'
import { AlertCircle, CheckCircle2, Shield, Info, MapPin, QrCode, KeyRound, Clock, Building } from 'lucide-react'

const SECTIONS = [
  { id: 'section-1', title: '1. Introduction & Acceptance of Terms' },
  { id: 'section-2', title: '2. Eligibility & Account Registration' },
  { id: 'section-3', title: '3. Account Security & User Information' },
  { id: 'section-4', title: '4. Customer Responsibilities' },
  { id: 'section-5', title: '5. Product Listings, Pricing & Availability' },
  { id: 'section-6', title: '6. Cart, Single-Store Rule & Order Placement' },
  { id: 'section-7', title: '7. UPI Payments, Paise Allocation & Refunds' },
  { id: 'section-8', title: '8. Student Runners: Eligibility & Delivery Model' },
  { id: 'section-9', title: '9. Order Fulfillment, Tracking & OTP Verification' },
  { id: 'section-10', title: '10. Delays, Damaged Goods & Missing Items' },
  { id: 'section-11', title: '11. Prohibited Conduct, Fraud & Platform Abuse' },
  { id: 'section-12', title: '12. Account Suspension, Disciplinary Referral & Termination' },
  { id: 'section-13', title: '13. Platform Uptime, Maintenance & Technical Limitations' },
  { id: 'section-14', title: '14. Intellectual Property & Brand Rights' },
  { id: 'section-15', title: '15. Third-Party Integrations & Payment Apps' },
  { id: 'section-16', title: '16. Limitation of Liability & Consumer Rights' },
  { id: 'section-17', title: '17. Governing Law, Jurisdiction & Dispute Resolution' },
  { id: 'section-18', title: '18. Modifications to Terms' },
  { id: 'section-19', title: '19. Grievance Redressal & Contact Information' },
]

export default function TermsPage() {
  return (
    <LegalPageShell
      title="Terms & Conditions"
      subtitle="Comprehensive terms governing access to MartIT, customer grocery orders, peer student runner deliveries, and digital payment reconciliation across participating campus stores."
      documentType="terms"
      effectiveDate="[TO BE CONFIRMED — e.g., November 1, 2026]"
      lastUpdated="October 27, 2026"
      version="1.0-draft"
      sections={SECTIONS}
    >
      <div className="space-y-12">
        {/* Section 1 */}
        <section id="section-1" className="scroll-mt-24 space-y-4">
          <div className="border-b border-line pb-2">
            <h2 className="font-display text-xl sm:text-2xl font-bold text-ink">
              1. Introduction &amp; Acceptance of Terms
            </h2>
          </div>
          <p className="text-sm text-ink-muted leading-relaxed">
            Welcome to <strong>MartIT</strong> (&quot;Platform&quot;, &quot;we&quot;, &quot;us&quot;, or &quot;our&quot;). MartIT is a specialized campus quick-commerce technology service operated by{' '}
            <span className="font-semibold text-ink">[TO BE CONFIRMED: Legal Entity Name, e.g., MartIT Campus Technologies Private Limited]</span>, having its principal place of business at{' '}
            <span className="font-semibold text-ink">[TO BE CONFIRMED: Registered Office Address, City, State, PIN]</span>.
          </p>
          <p className="text-sm text-ink-muted leading-relaxed">
            These Terms and Conditions (&quot;Terms&quot;) constitute a legally binding electronic agreement between you (&quot;User&quot;, &quot;Customer&quot;, &quot;Runner&quot;, or &quot;Visitor&quot;) and MartIT under the provisions of the <strong>Information Technology Act, 2000</strong> and the rules notified thereunder (including the <strong>Information Technology (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021</strong>) and the <strong>Consumer Protection (E-Commerce) Rules, 2020</strong>.
          </p>
          <p className="text-sm text-ink-muted leading-relaxed">
            By browsing, downloading, registering for, or transacting on MartIT, you expressly acknowledge that you have read, understood, and agreed to be bound by these Terms and our companion <a href="/privacy-policy" className="text-brand font-semibold underline">Privacy Policy</a>. If you do not agree with any provision of these Terms, you must immediately cease accessing or using the Platform.
          </p>
        </section>

        {/* Section 2 */}
        <section id="section-2" className="scroll-mt-24 space-y-4">
          <div className="border-b border-line pb-2">
            <h2 className="font-display text-xl sm:text-2xl font-bold text-ink">
              2. Eligibility &amp; Account Registration
            </h2>
          </div>
          <p className="text-sm text-ink-muted leading-relaxed">
            Use of MartIT is primarily intended for enrolled university students, faculty members, institutional staff, and authorized residents of registered campus societies or educational institutions (&quot;Partner Campuses&quot;).
          </p>
          <ul className="list-disc pl-5 space-y-2 text-sm text-ink-muted leading-relaxed">
            <li>
              <strong>Age of Competence:</strong> You must be at least 18 years of age and competent to enter into a contract under the Indian Contract Act, 1872. If you are under 18 years of age, you may use MartIT only under the supervision of a parent or legal guardian who agrees to be bound by these Terms.
            </li>
            <li>
              <strong>Institutional Verification:</strong> You may be requested to authenticate your account using an official university email address (<span className="font-mono text-xs text-ink">@campus.edu</span> or equivalent), phone number, or student identification.
            </li>
            <li>
              <strong>One Account per Individual:</strong> Users are prohibited from operating duplicate, fictitious, or surrogate accounts designed to circumvent delivery caps, promotional parameters, or administrative suspensions.
            </li>
          </ul>
        </section>

        {/* Section 3 */}
        <section id="section-3" className="scroll-mt-24 space-y-4">
          <div className="border-b border-line pb-2">
            <h2 className="font-display text-xl sm:text-2xl font-bold text-ink">
              3. Account Security &amp; User Information
            </h2>
          </div>
          <p className="text-sm text-ink-muted leading-relaxed">
            You are exclusively responsible for preserving the confidentiality of your login credentials, including passwords, active browser sessions, and one-time passwords (&quot;OTPs&quot;) delivered via SMS or email.
          </p>
          <div className="rounded-card border border-brand/20 bg-brand-soft/20 p-4 text-xs text-ink-muted space-y-2">
            <div className="flex items-center gap-2 font-bold text-brand">
              <Shield className="size-4" aria-hidden="true" />
              <span>Security Rule: Never share your Delivery OTP</span>
            </div>
            <p>
              MartIT delivery OTPs are intended exclusively for physical in-person handover verification with an assigned Student Runner. MartIT staff, store administrators, or runners will <strong>never</strong> contact you by phone, chat, or email asking you to disclose your handover OTP prior to delivery.
            </p>
          </div>
          <p className="text-sm text-ink-muted leading-relaxed">
            You agree to notify MartIT immediately at <span className="font-semibold text-ink">[TO BE CONFIRMED: support email, e.g. support@martit.campus]</span> upon suspecting any unauthorized access to your account or any security breach.
          </p>
        </section>

        {/* Section 4 */}
        <section id="section-4" className="scroll-mt-24 space-y-4">
          <div className="border-b border-line pb-2">
            <h2 className="font-display text-xl sm:text-2xl font-bold text-ink">
              4. Customer Responsibilities
            </h2>
          </div>
          <p className="text-sm text-ink-muted leading-relaxed">
            As a Customer on the Platform, you acknowledge and agree that:
          </p>
          <ul className="list-disc pl-5 space-y-2 text-sm text-ink-muted leading-relaxed">
            <li>
              <strong>Accurate Delivery Spot:</strong> You must select an authorized, accessible campus delivery location (e.g., designated hostel block entrance, academic foyer, central library gate, or residential quarter) from the active campus locations menu.
            </li>
            <li>
              <strong>Physical Presence at Handover:</strong> You agree to be present at the chosen delivery point or send an authorized peer upon receiving the runner transit notification. Student runners operate on tight study schedules and cannot wait at delivery points indefinitely.
            </li>
            <li>
              <strong>Institutional Regulations:</strong> Deliveries must strictly adhere to campus security guidelines, warden rules, hostel curfews, gender-restricted dorm gate policies, and campus entry passes.
            </li>
          </ul>
        </section>

        {/* Section 5 */}
        <section id="section-5" className="scroll-mt-24 space-y-4">
          <div className="border-b border-line pb-2">
            <h2 className="font-display text-xl sm:text-2xl font-bold text-ink">
              5. Product Listings, Pricing &amp; Availability
            </h2>
          </div>
          <p className="text-sm text-ink-muted leading-relaxed">
            MartIT functions as a technology intermediary platform connecting users to participating campus stores (such as Campus Mart, Night Canteen, and Campus Stationery Hub).
          </p>
          <ul className="list-disc pl-5 space-y-2 text-sm text-ink-muted leading-relaxed">
            <li>
              <strong>Inventory &amp; Out-of-Stock:</strong> Product availability, pack sizes, and inventory counts are maintained based on real-time feeds from participating stores. However, inadvertent stockouts may occur during high-demand campus rush hours. Items marked out of stock cannot be ordered.
            </li>
            <li>
              <strong>Pricing &amp; Maximum Retail Price (MRP):</strong> Prices listed on the platform reflect retail store prices and applicable discounts. In compliance with the <em>Legal Metrology (Packaged Commodities) Rules, 2011</em>, no packaged product will be sold at a price exceeding the Maximum Retail Price (MRP) printed on the physical package.
            </li>
            <li>
              <strong>No Unsolicited Substitutions:</strong> If a selected item becomes unavailable before runner dispatch, MartIT does not substitute alternative brands or variants without explicit customer consent. Unavailable items are either removed or refunded in accordance with Section 7.
            </li>
          </ul>
        </section>

        {/* Section 6 */}
        <section id="section-6" className="scroll-mt-24 space-y-4">
          <div className="border-b border-line pb-2">
            <h2 className="font-display text-xl sm:text-2xl font-bold text-ink">
              6. Cart, Single-Store Rule &amp; Order Placement
            </h2>
          </div>
          <p className="text-sm text-ink-muted leading-relaxed">
            To ensure rapid fulfillment and realistic peer delivery transit times across campus, MartIT enforces a <strong>Single-Store Cart Policy</strong>:
          </p>
          <ul className="list-disc pl-5 space-y-2 text-sm text-ink-muted leading-relaxed">
            <li>
              <strong>One Store per Cart:</strong> All items in a single checkout session must originate from the same participating campus store. If you attempt to add items from a second store (e.g., adding Night Canteen snacks while your cart contains Campus Mart groceries), the Platform will prompt you to confirm switching stores, which resets the active cart.
            </li>
            <li>
              <strong>Authoritative Order Snapshot:</strong> Upon clicking &quot;Continue to Payment&quot;, the Platform creates an authoritative order record calculating the verified base amount, delivery fee (if applicable), and an assigned unique platform fee in paise.
            </li>
            <li>
              <strong>Cancellation Window:</strong> You may cancel an order directly from the order tracking screen while the status remains <span className="font-mono text-xs font-bold text-ink">PLACED</span>. Once a runner has been assigned or the store marks the order as <span className="font-mono text-xs font-bold text-ink">PREPARING</span>, cancellation is restricted to prevent food wastage and uncompensated runner trips.
            </li>
          </ul>
        </section>

        {/* Section 7 */}
        <section id="section-7" className="scroll-mt-24 space-y-4">
          <div className="border-b border-line pb-2">
            <h2 className="font-display text-xl sm:text-2xl font-bold text-ink">
              7. UPI Payments, Paise Allocation &amp; Refunds
            </h2>
          </div>
          <p className="text-sm text-ink-muted leading-relaxed">
            MartIT utilizes a transparent, non-custodial dynamic UPI reconciliation mechanism designed to eliminate payment gateway overheads for campus micro-transactions:
          </p>
          <div className="grid gap-4 sm:grid-cols-2 my-4">
            <div className="rounded-card border border-line bg-surface p-4 shadow-1 space-y-2">
              <div className="flex items-center gap-2 font-bold text-xs text-brand">
                <QrCode className="size-4" aria-hidden="true" />
                <span>Dynamic Paise Fee Allocation</span>
              </div>
              <p className="text-xs text-ink-muted leading-relaxed">
                Each order awaiting payment is assigned a distinct platform fee in fractional paise (e.g., ₹2.14) valid for a strictly timed payment window (typically 5 minutes). This unique amount maps your UPI transfer directly to your specific order.
              </p>
            </div>
            <div className="rounded-card border border-line bg-surface p-4 shadow-1 space-y-2">
              <div className="flex items-center gap-2 font-bold text-xs text-fresh-ink">
                <Shield className="size-4" aria-hidden="true" />
                <span>Zero Financial Credential Storage</span>
              </div>
              <p className="text-xs text-ink-muted leading-relaxed">
                MartIT does <strong>not</strong> collect, process, or store credit/debit card numbers, CVVs, net-banking passwords, or UPI MPINs. Transactions take place securely within your third-party UPI client app (e.g., BHIM, Google Pay, PhonePe, Paytm).
              </p>
            </div>
          </div>
          <ul className="list-disc pl-5 space-y-2 text-sm text-ink-muted leading-relaxed">
            <li>
              <strong>Window Expiry:</strong> If payment is not completed and verified within the designated countdown window, the paise reservation expires, and the order is marked <span className="font-mono text-xs text-danger font-bold">EXPIRED</span> to release locked inventory.
            </li>
            <li>
              <strong>Inconclusive Payments:</strong> If your bank account is debited but the transaction is not confirmed within the window, the order enters <span className="font-mono text-xs text-amber-600 font-bold">INCONCLUSIVE</span> state. You can submit your 12-digit UPI Transaction Reference (UTR) for automated or administrative reconciliation.
            </li>
            <li>
              <strong>Refund Timelines:</strong> Where a customer is entitled to a refund (e.g., store cancellation, unfulfilled item, or confirmed double-debit), refunds are initiated to the original source UPI handle/bank account within <span className="font-semibold text-ink">[TO BE CONFIRMED: e.g., 3 to 7 working days]</span> in compliance with Reserve Bank of India (RBI) turnaround guidelines.
            </li>
          </ul>
        </section>

        {/* Section 8 */}
        <section id="section-8" className="scroll-mt-24 space-y-4">
          <div className="border-b border-line pb-2">
            <h2 className="font-display text-xl sm:text-2xl font-bold text-ink">
              8. Student Runners: Eligibility &amp; Delivery Model
            </h2>
          </div>
          <p className="text-sm text-ink-muted leading-relaxed">
            Deliveries on MartIT are carried out by verified, active students enrolled at the Partner Campus (&quot;Runners&quot;).
          </p>
          <ul className="list-disc pl-5 space-y-2 text-sm text-ink-muted leading-relaxed">
            <li>
              <strong>Independent Peer Fulfillment:</strong> Runners are independent peer contractors who choose delivery tasks on a voluntary, flexible basis between classes. Runners are not regular commercial employees or agents of MartIT.
            </li>
            <li>
              <strong>Verification Requirements:</strong> Runners must verify their student status, provide valid contact credentials, and complete platform onboarding before accepting delivery orders.
            </li>
            <li>
              <strong>Campus Code of Conduct:</strong> Runners must abide by high standards of peer courtesy, campus security regulations, traffic safety (for bicycles/scooters), and hygiene during grocery transport.
            </li>
          </ul>
        </section>

        {/* Section 9 */}
        <section id="section-9" className="scroll-mt-24 space-y-4">
          <div className="border-b border-line pb-2">
            <h2 className="font-display text-xl sm:text-2xl font-bold text-ink">
              9. Order Fulfillment, Tracking &amp; OTP Verification
            </h2>
          </div>
          <p className="text-sm text-ink-muted leading-relaxed">
            MartIT provides end-to-end transparent order tracking through sequential status milestones:
          </p>
          <div className="flex flex-wrap items-center gap-2 text-xs font-mono my-3 p-3 rounded-card bg-surface-2 border border-line">
            <span className="px-2 py-1 rounded bg-surface border border-line font-bold">PLACED</span>
            <span>&rarr;</span>
            <span className="px-2 py-1 rounded bg-surface border border-line font-bold">ASSIGNED</span>
            <span>&rarr;</span>
            <span className="px-2 py-1 rounded bg-surface border border-line font-bold">PREPARING</span>
            <span>&rarr;</span>
            <span className="px-2 py-1 rounded bg-surface border border-line font-bold">PICKED_UP</span>
            <span>&rarr;</span>
            <span className="px-2 py-1 rounded bg-surface border border-line font-bold">ON_THE_WAY</span>
            <span>&rarr;</span>
            <span className="px-2 py-1 rounded bg-fresh-soft text-fresh-ink border border-fresh/30 font-bold">DELIVERED</span>
          </div>
          <p className="text-sm text-ink-muted leading-relaxed">
            <strong>Handover Protocol:</strong> When the runner arrives at your designated delivery spot, you must physically inspect the items and share your 6-digit delivery verification OTP. Once the runner enters the verified OTP into their console, the order is formally closed and deemed successfully delivered.
          </p>
        </section>

        {/* Section 10 */}
        <section id="section-10" className="scroll-mt-24 space-y-4">
          <div className="border-b border-line pb-2">
            <h2 className="font-display text-xl sm:text-2xl font-bold text-ink">
              10. Delays, Damaged Goods &amp; Missing Items
            </h2>
          </div>
          <p className="text-sm text-ink-muted leading-relaxed">
            While student runners strive for swift campus transit, delivery times can be affected by peak store checkout queues, academic class hours, adverse weather, or campus gate checks.
          </p>
          <ul className="list-disc pl-5 space-y-2 text-sm text-ink-muted leading-relaxed">
            <li>
              <strong>No Guaranteed Delivery Timers:</strong> Unless explicitly advertised for a specific campaign, delivery estimates provided in the interface are non-binding operational approximations.
            </li>
            <li>
              <strong>Inspection at Handover:</strong> Customers are urged to examine packaged items, seals, and perishable goods upon physical handover before releasing the delivery OTP.
            </li>
            <li>
              <strong>Reporting Grievances:</strong> In the event of a missing item, damaged goods, or incorrect product delivered, you must notify the support desk via the order details screen or contact support within <span className="font-semibold text-ink">[TO BE CONFIRMED: e.g. 24 hours]</span> with photographic proof. Valid claims will be rectified via store replacement or credit refund.
            </li>
          </ul>
        </section>

        {/* Section 11 */}
        <section id="section-11" className="scroll-mt-24 space-y-4">
          <div className="border-b border-line pb-2">
            <h2 className="font-display text-xl sm:text-2xl font-bold text-ink">
              11. Prohibited Conduct, Fraud &amp; Platform Abuse
            </h2>
          </div>
          <p className="text-sm text-ink-muted leading-relaxed">
            Users agree not to engage in any unlawful, fraudulent, or harmful conduct, including but not limited to:
          </p>
          <ul className="list-disc pl-5 space-y-2 text-sm text-ink-muted leading-relaxed">
            <li>
              Harassing, abusing, threatening, or endangering student runners or store employees;
            </li>
            <li>
              Attempting to order contraband, alcoholic beverages, tobacco products, restricted narcotics, weapons, or items barred under university campus statutes;
            </li>
            <li>
              Submitting fraudulent UPI Transaction References (UTRs) or manipulating client-side payment verification scripts;
            </li>
            <li>
              Repeatedly placing orders and intentionally failing to appear at the delivery point;
            </li>
            <li>
              Reverse-engineering, scraping, automated bot indexing, or deploying denial-of-service attacks against MartIT servers or APIs.
            </li>
          </ul>
        </section>

        {/* Section 12 */}
        <section id="section-12" className="scroll-mt-24 space-y-4">
          <div className="border-b border-line pb-2">
            <h2 className="font-display text-xl sm:text-2xl font-bold text-ink">
              12. Account Suspension, Disciplinary Referral &amp; Termination
            </h2>
          </div>
          <p className="text-sm text-ink-muted leading-relaxed">
            MartIT reserves the right to immediately suspend or permanently terminate user accounts found in material violation of these Terms, non-payment, or abusive behavior toward student peers.
          </p>
          <p className="text-sm text-ink-muted leading-relaxed">
            In instances of severe harassment, payment fraud, or introduction of prohibited substances onto campus, MartIT reserves the right, in accordance with applicable law and campus partnership agreements, to report the incident to institutional campus proctorial boards or local law enforcement authorities.
          </p>
        </section>

        {/* Section 13 */}
        <section id="section-13" className="scroll-mt-24 space-y-4">
          <div className="border-b border-line pb-2">
            <h2 className="font-display text-xl sm:text-2xl font-bold text-ink">
              13. Platform Uptime, Maintenance &amp; Technical Limitations
            </h2>
          </div>
          <p className="text-sm text-ink-muted leading-relaxed">
            MartIT is provided on an &quot;AS IS&quot; and &quot;AS AVAILABLE&quot; basis. While we strive to maintain high availability, access may occasionally be suspended, restricted, or interrupted due to routine scheduled maintenance, server upgrades, or campus local network outages.
          </p>
          <p className="text-sm text-ink-muted leading-relaxed">
            We make no warranties, express or implied, that the Platform will be completely error-free or that service interruptions will never occur during peak exam or campus event periods.
          </p>
        </section>

        {/* Section 14 */}
        <section id="section-14" className="scroll-mt-24 space-y-4">
          <div className="border-b border-line pb-2">
            <h2 className="font-display text-xl sm:text-2xl font-bold text-ink">
              14. Intellectual Property &amp; Brand Rights
            </h2>
          </div>
          <p className="text-sm text-ink-muted leading-relaxed">
            All proprietary rights in the Platform, including the MartIT name, logo, iconography, visual design system, UI components, codebase, and compilation of product catalogues, are the exclusive property of{' '}
            <span className="font-semibold text-ink">[TO BE CONFIRMED: Legal Entity Name]</span>.
          </p>
          <p className="text-sm text-ink-muted leading-relaxed">
            Third-party brand names, logos, and product trademarks appearing in the grocery catalogue (e.g., Amul, Maggi, Britannia, Lay&apos;s) remain the property of their respective trademark owners and are displayed purely for accurate identification purposes under fair use doctrine.
          </p>
        </section>

        {/* Section 15 */}
        <section id="section-15" className="scroll-mt-24 space-y-4">
          <div className="border-b border-line pb-2">
            <h2 className="font-display text-xl sm:text-2xl font-bold text-ink">
              15. Third-Party Integrations &amp; Payment Providers
            </h2>
          </div>
          <p className="text-sm text-ink-muted leading-relaxed">
            MartIT relies on external third-party infrastructure and banking systems to facilitate services:
          </p>
          <ul className="list-disc pl-5 space-y-2 text-sm text-ink-muted leading-relaxed">
            <li>
              <strong>UPI Ecosystem:</strong> Payments are executed via the Unified Payments Interface (UPI) managed by the National Payments Corporation of India (NPCI) and your bank or chosen UPI third-party app provider. We are not liable for bank server downtime or external UPI network failures.
            </li>
            <li>
              <strong>Hosting &amp; Cloud Infrastructure:</strong> Platform databases and APIs are hosted on reliable cloud service providers complying with standard data security practices.
            </li>
          </ul>
        </section>

        {/* Section 16 */}
        <section id="section-16" className="scroll-mt-24 space-y-4">
          <div className="border-b border-line pb-2">
            <h2 className="font-display text-xl sm:text-2xl font-bold text-ink">
              16. Limitation of Liability &amp; Consumer Rights
            </h2>
          </div>
          <p className="text-sm text-ink-muted leading-relaxed">
            As a technology intermediary under Section 79 of the Information Technology Act, 2000, MartIT facilitates connections between campus stores, customers, and student runners.
          </p>
          <ul className="list-disc pl-5 space-y-2 text-sm text-ink-muted leading-relaxed">
            <li>
              To the maximum extent permitted by applicable Indian law, MartIT shall not be liable for indirect, incidental, punitive, or consequential damages arising out of the use or inability to use the Platform.
            </li>
            <li>
              In all cases, MartIT&apos;s total aggregate liability for any direct claim arising under a transaction shall not exceed the total price paid by you for the specific order giving rise to the claim.
            </li>
            <li>
              <strong>Statutory Consumer Rights Preserved:</strong> Nothing in these Terms shall limit, restrict, or purport to waive any non-excludable statutory rights or consumer remedies guaranteed to you under the <em>Consumer Protection Act, 2019</em>.
            </li>
          </ul>
        </section>

        {/* Section 17 */}
        <section id="section-17" className="scroll-mt-24 space-y-4">
          <div className="border-b border-line pb-2">
            <h2 className="font-display text-xl sm:text-2xl font-bold text-ink">
              17. Governing Law, Jurisdiction &amp; Dispute Resolution
            </h2>
          </div>
          <p className="text-sm text-ink-muted leading-relaxed">
            These Terms shall be governed by, construed, and interpreted in accordance with the substantive laws of the <strong>Republic of India</strong>.
          </p>
          <p className="text-sm text-ink-muted leading-relaxed">
            In the event of any dispute, controversy, or claim arising out of or relating to these Terms, the parties shall first attempt to resolve the matter amicably through good-faith mutual negotiations. If unresolved within 30 days, the dispute shall be subject to the exclusive jurisdiction of the competent civil courts situated at{' '}
            <span className="font-semibold text-ink">[TO BE CONFIRMED: e.g., Bengaluru, Karnataka, India]</span>.
          </p>
        </section>

        {/* Section 18 */}
        <section id="section-18" className="scroll-mt-24 space-y-4">
          <div className="border-b border-line pb-2">
            <h2 className="font-display text-xl sm:text-2xl font-bold text-ink">
              18. Modifications to Terms
            </h2>
          </div>
          <p className="text-sm text-ink-muted leading-relaxed">
            We reserve the right to revise, update, or modify these Terms from time to time to reflect operational changes, product enhancements, or statutory requirements. When changes are made, we will update the &quot;Last Updated&quot; date at the top of this document.
          </p>
          <p className="text-sm text-ink-muted leading-relaxed">
            For material amendments, we will provide reasonable advance notice via platform banners, email notification, or an in-app prompt. Your continued use of MartIT following the effective date of modified Terms constitutes deemed acceptance of the revised provisions.
          </p>
        </section>

        {/* Section 19 */}
        <section id="section-19" className="scroll-mt-24 space-y-4">
          <div className="border-b border-line pb-2">
            <h2 className="font-display text-xl sm:text-2xl font-bold text-ink">
              19. Grievance Redressal &amp; Contact Information
            </h2>
          </div>
          <p className="text-sm text-ink-muted leading-relaxed">
            In accordance with Rule 5(9) of the <em>Information Technology (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021</em> and Rule 4 of the <em>Consumer Protection (E-Commerce) Rules, 2020</em>, the details of the designated <strong>Grievance Officer</strong> are provided below:
          </p>

          <div id="contact-grievance" className="rounded-card border border-line bg-surface p-5 shadow-1 space-y-3">
            <div className="flex items-center gap-2 text-sm font-bold text-brand">
              <Building className="size-4" aria-hidden="true" />
              <span>Grievance Redressal Officer (India)</span>
            </div>
            <div className="grid gap-2 text-xs sm:text-sm text-ink-muted">
              <div>
                <strong className="text-ink">Designation:</strong>{' '}
                <span className="font-semibold text-ink">[TO BE CONFIRMED: e.g., Grievance Officer, MartIT]</span>
              </div>
              <div>
                <strong className="text-ink">Name:</strong>{' '}
                <span className="font-semibold text-ink">[TO BE CONFIRMED: Grievance Officer Full Name]</span>
              </div>
              <div>
                <strong className="text-ink">Entity:</strong>{' '}
                <span className="font-semibold text-ink">[TO BE CONFIRMED: Legal Entity Name]</span>
              </div>
              <div>
                <strong className="text-ink">Postal Address:</strong>{' '}
                <span className="font-semibold text-ink">[TO BE CONFIRMED: Physical Office Address, City, State, PIN]</span>
              </div>
              <div>
                <strong className="text-ink">Official Email:</strong>{' '}
                <a href="mailto:grievance@martit.campus" className="text-brand font-semibold underline">
                  [TO BE CONFIRMED: grievance@martit.campus]
                </a>
              </div>
              <div>
                <strong className="text-ink">Response Timeline:</strong>{' '}
                <span>Acknowledgment within 24 hours; Redressal within 15 working days from receipt.</span>
              </div>
            </div>
          </div>
        </section>
      </div>
    </LegalPageShell>
  )
}
