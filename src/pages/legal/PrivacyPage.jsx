import { LegalPageShell } from '@/components/legal/LegalPageShell'
import { Shield, Lock, Eye, MapPin, Database, RefreshCw, Smartphone, AlertCircle, Building, CheckCircle2 } from 'lucide-react'

const SECTIONS = [
  { id: 'section-1', title: '1. Introduction & Scope' },
  { id: 'section-2', title: '2. Information We Collect: Role-Based Overview' },
  { id: 'section-3', title: '3. Account & Authentication Data' },
  { id: 'section-4', title: '4. Order, Cart & Delivery Information' },
  { id: 'section-5', title: '5. Contact Details & Communications' },
  { id: 'section-6', title: '6. Technical, Browser & Device Information' },
  { id: 'section-7', title: '7. Campus Location Data & Tracking Policy' },
  { id: 'section-8', title: '8. How & Why We Process Your Data' },
  { id: 'section-9', title: '9. Information Sharing & Disclosure' },
  { id: 'section-10', title: '10. Payment Data & UPI Verification Safeguards' },
  { id: 'section-11', title: '11. Cookies, Local Storage & Session State' },
  { id: 'section-12', title: '12. Data Retention & Deletion Schedule' },
  { id: 'section-13', title: '13. Information Security Measures & Limitations' },
  { id: 'section-14', title: '14. User Rights Under Indian Data Protection Law' },
  { id: 'section-15', title: '15. Consent Management & Withdrawal Mechanisms' },
  { id: 'section-16', title: '16. Children’s Privacy & Minors on Campus' },
  { id: 'section-17', title: '17. Data Breach Protocols & Incident Notification' },
  { id: 'section-18', title: '18. External Links & Third-Party Platforms' },
  { id: 'section-19', title: '19. Policy Amendments & Version History' },
  { id: 'section-20', title: '20. Privacy Grievance Officer & Contact Desk' },
]

export default function PrivacyPage() {
  return (
    <LegalPageShell
      title="Privacy Policy"
      subtitle="Transparent disclosure regarding how MartIT collects, processes, stores, and safeguards personal data for campus grocery ordering, student peer deliveries, and UPI payment reconciliation."
      documentType="privacy"
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
              1. Introduction &amp; Scope
            </h2>
          </div>
          <p className="text-sm text-ink-muted leading-relaxed">
            This Privacy Policy (&quot;Policy&quot;) describes how <strong>MartIT</strong> (&quot;we&quot;, &quot;us&quot;, or &quot;our&quot;), operated by{' '}
            <span className="font-semibold text-ink">[TO BE CONFIRMED: Legal Entity Name]</span>, collects, uses, shares, and protects your personal data when you interact with our campus quick-commerce web application, customer shopping portal, student runner console, and administrative services (collectively, the &quot;Platform&quot;).
          </p>
          <p className="text-sm text-ink-muted leading-relaxed">
            This Policy is prepared pursuant to the <strong>Digital Personal Data Protection Act, 2023 (&quot;DPDP Act&quot;)</strong> (subject to rules and provisions in force), the <strong>Information Technology Act, 2000</strong>, and the <em>Information Technology (Reasonable Security Practices and Procedures and Sensitive Personal Data or Information) Rules, 2011</em>.
          </p>
          <p className="text-sm text-ink-muted leading-relaxed">
            This Policy applies to all individuals accessing MartIT, including enrolled students, faculty, staff, campus residents (&quot;Customers&quot;), peer student delivery partners (&quot;Runners&quot;), and participating campus merchants.
          </p>
        </section>

        {/* Section 2 */}
        <section id="section-2" className="scroll-mt-24 space-y-4">
          <div className="border-b border-line pb-2">
            <h2 className="font-display text-xl sm:text-2xl font-bold text-ink">
              2. Information We Collect: Role-Based Overview
            </h2>
          </div>
          <p className="text-sm text-ink-muted leading-relaxed">
            We collect only the minimum personal data necessary to provide seamless grocery ordering and peer delivery services on campus:
          </p>
          <div className="grid gap-4 sm:grid-cols-2 my-4">
            <div className="rounded-card border border-line bg-surface p-4 shadow-1 space-y-2">
              <span className="inline-block px-2 py-0.5 rounded bg-brand-soft text-[11px] font-bold text-brand">
                Customer Data
              </span>
              <ul className="text-xs text-ink-muted space-y-1.5 list-disc pl-4">
                <li>Full Name &amp; Contact Email (campus or personal)</li>
                <li>Phone Number (for runner delivery coordination)</li>
                <li>Chosen Delivery Spot (e.g. Hostel Block, Library foyer)</li>
                <li>Cart contents, item quantities &amp; order history</li>
                <li>Unique UPI paise reference for payment verification</li>
              </ul>
            </div>
            <div className="rounded-card border border-line bg-surface p-4 shadow-1 space-y-2">
              <span className="inline-block px-2 py-0.5 rounded bg-fresh-soft text-[11px] font-bold text-fresh-ink">
                Student Runner Data
              </span>
              <ul className="text-xs text-ink-muted space-y-1.5 list-disc pl-4">
                <li>Full Name, Campus Email &amp; Phone Number</li>
                <li>Student Verification / Identification Credentials</li>
                <li>Active task acceptance, order delivery milestones</li>
                <li>Runner payout / UPI VPA for settlement credits</li>
                <li>Delivery performance &amp; completion records</li>
              </ul>
            </div>
          </div>
        </section>

        {/* Section 3 */}
        <section id="section-3" className="scroll-mt-24 space-y-4">
          <div className="border-b border-line pb-2">
            <h2 className="font-display text-xl sm:text-2xl font-bold text-ink">
              3. Account &amp; Authentication Data
            </h2>
          </div>
          <p className="text-sm text-ink-muted leading-relaxed">
            When you create an account on MartIT:
          </p>
          <ul className="list-disc pl-5 space-y-2 text-sm text-ink-muted leading-relaxed">
            <li>
              <strong>Credentials:</strong> We store your email address and a securely hashed representation of your password (using industry-standard cryptographic algorithms such as bcrypt). We <strong>never</strong> store your password in plaintext.
            </li>
            <li>
              <strong>Tokens &amp; Sessions:</strong> Upon signing in, our authentication provider issues short-lived JWT session tokens to verify your authenticated state on subsequent API requests.
            </li>
            <li>
              <strong>Password Reset Data:</strong> If you request a password recovery link, we generate a cryptographically random, time-limited token delivered to your verified email address.
            </li>
          </ul>
        </section>

        {/* Section 4 */}
        <section id="section-4" className="scroll-mt-24 space-y-4">
          <div className="border-b border-line pb-2">
            <h2 className="font-display text-xl sm:text-2xl font-bold text-ink">
              4. Order, Cart &amp; Delivery Information
            </h2>
          </div>
          <p className="text-sm text-ink-muted leading-relaxed">
            When an order is prepared and placed:
          </p>
          <ul className="list-disc pl-5 space-y-2 text-sm text-ink-muted leading-relaxed">
            <li>
              <strong>Order Manifest:</strong> We record the product identifiers, pack sizes, item unit prices, quantities, and participating campus store identifier.
            </li>
            <li>
              <strong>Delivery Milestone Log:</strong> For dispute resolution and platform integrity, we log the chronological status transitions (<span className="font-mono text-xs text-ink">PLACED &rarr; ASSIGNED &rarr; PREPARING &rarr; PICKED_UP &rarr; ON_THE_WAY &rarr; DELIVERED</span>) along with timestamps.
            </li>
            <li>
              <strong>Handover Verification:</strong> A randomly generated 6-digit OTP is assigned to the order and stored in hashed or transient format until confirmed during physical handover.
            </li>
          </ul>
        </section>

        {/* Section 5 */}
        <section id="section-5" className="scroll-mt-24 space-y-4">
          <div className="border-b border-line pb-2">
            <h2 className="font-display text-xl sm:text-2xl font-bold text-ink">
              5. Contact Details &amp; Communications
            </h2>
          </div>
          <p className="text-sm text-ink-muted leading-relaxed">
            Your phone number is utilized strictly for transactional delivery coordination:
          </p>
          <ul className="list-disc pl-5 space-y-2 text-sm text-ink-muted leading-relaxed">
            <li>
              <strong>Transactional Communication Only:</strong> We use your contact details to provide order updates, delivery notifications, payment expiration alerts, and customer support responses.
            </li>
            <li>
              <strong>No Unsolicited Marketing / Spam:</strong> MartIT does <strong>not</strong> sell your telephone number or email address to third-party marketing brokers or send unsolicited advertising spam.
            </li>
          </ul>
        </section>

        {/* Section 6 */}
        <section id="section-6" className="scroll-mt-24 space-y-4">
          <div className="border-b border-line pb-2">
            <h2 className="font-display text-xl sm:text-2xl font-bold text-ink">
              6. Technical, Browser &amp; Device Information
            </h2>
          </div>
          <p className="text-sm text-ink-muted leading-relaxed">
            When you browse or interact with our web application, standard diagnostic telemetry may be captured by our hosting infrastructure:
          </p>
          <ul className="list-disc pl-5 space-y-2 text-sm text-ink-muted leading-relaxed">
            <li>
              <strong>Standard Server Logs:</strong> IP address, browser type and version, operating system, HTTP referrers, and request response codes.
            </li>
            <li>
              <strong>Error Telemetry:</strong> Unhandled frontend runtime exceptions may record device context (screen resolution, browser engine) solely to diagnose rendering bugs and crash events.
            </li>
          </ul>
        </section>

        {/* Section 7 */}
        <section id="section-7" className="scroll-mt-24 space-y-4">
          <div className="border-b border-line pb-2">
            <h2 className="font-display text-xl sm:text-2xl font-bold text-ink">
              7. Campus Location Data &amp; Tracking Policy
            </h2>
          </div>
          <div className="rounded-card border border-line bg-surface p-4 shadow-1 space-y-2">
            <div className="flex items-center gap-2 font-bold text-xs text-brand">
              <MapPin className="size-4" aria-hidden="true" />
              <span>Campus Landmark Selection vs. Real-Time GPS</span>
            </div>
            <p className="text-xs text-ink-muted leading-relaxed">
              <strong>Customer Location:</strong> MartIT collects your chosen delivery spot through user selection from a predefined campus locations list (e.g., Hostel A Block 1, Central Library, Faculty Quarters). We do <strong>not</strong> execute continuous background GPS tracking on customers.
            </p>
            <p className="text-xs text-ink-muted leading-relaxed">
              <strong>Runner Route Optimization:</strong> When an active runner is in transit with an order, foreground location services may be requested to confirm transit proximity and estimate delivery arrival for the waiting customer.
            </p>
          </div>
        </section>

        {/* Section 8 */}
        <section id="section-8" className="scroll-mt-24 space-y-4">
          <div className="border-b border-line pb-2">
            <h2 className="font-display text-xl sm:text-2xl font-bold text-ink">
              8. How &amp; Why We Process Your Data
            </h2>
          </div>
          <p className="text-sm text-ink-muted leading-relaxed">
            We process your data strictly under lawful bases recognized under the Digital Personal Data Protection Act, 2023:
          </p>
          <ul className="list-disc pl-5 space-y-2 text-sm text-ink-muted leading-relaxed">
            <li>
              <strong>Contractual Necessity:</strong> To process grocery orders, dispatch student runners, execute UPI payment reconciliation, and fulfill deliveries.
            </li>
            <li>
              <strong>Legal &amp; Regulatory Compliance:</strong> To maintain transaction records in accordance with Indian taxation rules and consumer protection mandates.
            </li>
            <li>
              <strong>Platform Security &amp; Fraud Prevention:</strong> To prevent duplicate paise fee conflicts, unauthorized account intrusions, and delivery handover abuse.
            </li>
          </ul>
        </section>

        {/* Section 9 */}
        <section id="section-9" className="scroll-mt-24 space-y-4">
          <div className="border-b border-line pb-2">
            <h2 className="font-display text-xl sm:text-2xl font-bold text-ink">
              9. Information Sharing &amp; Disclosure
            </h2>
          </div>
          <p className="text-sm text-ink-muted leading-relaxed">
            We share personal data strictly on a need-to-know basis:
          </p>
          <ul className="list-disc pl-5 space-y-2 text-sm text-ink-muted leading-relaxed">
            <li>
              <strong>With Assigned Student Runners:</strong> Once an order is assigned, the designated runner receives the customer&apos;s first name, chosen delivery spot, and contact phone number solely for physical coordination.
            </li>
            <li>
              <strong>With Participating Campus Stores:</strong> Stores receive the item manifest, quantities, and order reference to pack the goods.
            </li>
            <li>
              <strong>With Cloud &amp; Infrastructure Providers:</strong> Managed database hosts (e.g., Supabase / PostgreSQL) and hosting providers operating under strict confidentiality and security commitments.
            </li>
            <li>
              <strong>Legal Authorities:</strong> Where compelled by valid legal process, court orders, or statutory obligations under Indian law.
            </li>
          </ul>
        </section>

        {/* Section 10 */}
        <section id="section-10" className="scroll-mt-24 space-y-4">
          <div className="border-b border-line pb-2">
            <h2 className="font-display text-xl sm:text-2xl font-bold text-ink">
              10. Payment Data &amp; UPI Verification Safeguards
            </h2>
          </div>
          <div className="rounded-card border border-fresh/30 bg-fresh-soft/20 p-4 text-xs text-ink-muted space-y-2">
            <div className="flex items-center gap-2 font-bold text-fresh-ink">
              <Shield className="size-4" aria-hidden="true" />
              <span>Zero Financial Account Credential Storage</span>
            </div>
            <p>
              MartIT does <strong>not</strong> collect or store sensitive financial credentials. We never store credit or debit card numbers, expiration dates, CVVs, net-banking credentials, or your UPI MPIN.
            </p>
            <p>
              Payments are executed in your own third-party UPI client app. Our system records only the public UPI Transaction Reference (UTR), transaction timestamp, and allocated paise amount for reconciliation against store settlements.
            </p>
          </div>
        </section>

        {/* Section 11 */}
        <section id="section-11" className="scroll-mt-24 space-y-4">
          <div className="border-b border-line pb-2">
            <h2 className="font-display text-xl sm:text-2xl font-bold text-ink">
              11. Cookies, Local Storage &amp; Session State
            </h2>
          </div>
          <p className="text-sm text-ink-muted leading-relaxed">
            MartIT uses client-side Web Storage APIs (<span className="font-mono text-xs text-ink">localStorage</span>) strictly for functional operational purposes:
          </p>
          <ul className="list-disc pl-5 space-y-2 text-sm text-ink-muted leading-relaxed">
            <li>
              <span className="font-mono text-xs font-bold text-ink">martit-theme</span>: Remembers your dark/light appearance preference across page reloads.
            </li>
            <li>
              <span className="font-mono text-xs font-bold text-ink">martit-mock-sessions</span> &amp; Auth Tokens: Maintains secure signed-in state so you do not have to re-enter credentials on every screen.
            </li>
            <li>
              <span className="font-mono text-xs font-bold text-ink">martit-cart-storage</span>: Preserves your active grocery items in your browser prior to checkout.
            </li>
          </ul>
          <p className="text-sm text-ink-muted leading-relaxed">
            We do <strong>not</strong> deploy third-party cross-site advertising cookies or behavioral tracking pixels.
          </p>
        </section>

        {/* Section 12 */}
        <section id="section-12" className="scroll-mt-24 space-y-4">
          <div className="border-b border-line pb-2">
            <h2 className="font-display text-xl sm:text-2xl font-bold text-ink">
              12. Data Retention &amp; Deletion Schedule
            </h2>
          </div>
          <p className="text-sm text-ink-muted leading-relaxed">
            We retain personal data only for as long as necessary to fulfill the purposes set out in this Policy:
          </p>
          <ul className="list-disc pl-5 space-y-2 text-sm text-ink-muted leading-relaxed">
            <li>
              <strong>Active Account Data:</strong> Retained while your account remains active and in good standing.
            </li>
            <li>
              <strong>Order &amp; Billing Records:</strong> Retained for <span className="font-semibold text-ink">[TO BE CONFIRMED: e.g., 7 years]</span> to comply with Indian statutory requirements under the Companies Act, GST rules, and consumer protection regulations.
            </li>
            <li>
              <strong>Inactive Sessions &amp; Ephemeral Logs:</strong> Transient payment reservation logs and fee allocations are cleared within 30 days of window completion.
            </li>
          </ul>
        </section>

        {/* Section 13 */}
        <section id="section-13" className="scroll-mt-24 space-y-4">
          <div className="border-b border-line pb-2">
            <h2 className="font-display text-xl sm:text-2xl font-bold text-ink">
              13. Information Security Measures &amp; Limitations
            </h2>
          </div>
          <p className="text-sm text-ink-muted leading-relaxed">
            We implement comprehensive technical and organizational security controls:
          </p>
          <ul className="list-disc pl-5 space-y-2 text-sm text-ink-muted leading-relaxed">
            <li>
              <strong>Encryption in Transit:</strong> All HTTP communications are strictly protected using Transport Layer Security (TLS 1.2 / 1.3).
            </li>
            <li>
              <strong>Database Security:</strong> Data at rest is encrypted, and database access is restricted via Row Level Security (RLS) policies ensuring users access only their own records.
            </li>
            <li>
              <strong>Honest Limitation Notice:</strong> While we employ industry-standard security safeguards, no method of transmission over the internet or electronic storage is 100% impenetrable. We cannot guarantee absolute, infallible security.
            </li>
          </ul>
        </section>

        {/* Section 14 */}
        <section id="section-14" className="scroll-mt-24 space-y-4">
          <div className="border-b border-line pb-2">
            <h2 className="font-display text-xl sm:text-2xl font-bold text-ink">
              14. User Rights Under Indian Data Protection Law
            </h2>
          </div>
          <p className="text-sm text-ink-muted leading-relaxed">
            Under the Digital Personal Data Protection Act, 2023, you enjoy statutory rights as a Data Principal:
          </p>
          <ul className="list-disc pl-5 space-y-2 text-sm text-ink-muted leading-relaxed">
            <li>
              <strong>Right to Access &amp; Summary:</strong> Request a summary of your personal data processed by MartIT and the identities of third parties with whom it has been shared.
            </li>
            <li>
              <strong>Right to Correction &amp; Erasure:</strong> Request rectification of inaccurate or outdated information, or deletion of personal data no longer necessary for the purpose collected.
            </li>
            <li>
              <strong>Right of Grievance Redressal:</strong> Avail transparent grievance redressal mechanisms through our designated Grievance Officer.
            </li>
            <li>
              <strong>Right to Nominate:</strong> Nominate an individual who shall, in the event of death or incapacity, exercise your data rights.
            </li>
          </ul>
        </section>

        {/* Section 15 */}
        <section id="section-15" className="scroll-mt-24 space-y-4">
          <div className="border-b border-line pb-2">
            <h2 className="font-display text-xl sm:text-2xl font-bold text-ink">
              15. Consent Management &amp; Withdrawal Mechanisms
            </h2>
          </div>
          <p className="text-sm text-ink-muted leading-relaxed">
            You may withdraw your consent for future non-essential data processing at any time by writing to our Grievance Desk at{' '}
            <span className="font-semibold text-ink">[TO BE CONFIRMED: privacy@martit.campus]</span>.
          </p>
          <p className="text-sm text-ink-muted leading-relaxed">
            Upon receipt of a valid consent withdrawal, we will cease processing your personal data within a reasonable timeframe, unless continued processing is required by applicable law or necessary to conclude active, paid-for orders.
          </p>
        </section>

        {/* Section 16 */}
        <section id="section-16" className="scroll-mt-24 space-y-4">
          <div className="border-b border-line pb-2">
            <h2 className="font-display text-xl sm:text-2xl font-bold text-ink">
              16. Children’s Privacy &amp; Minors on Campus
            </h2>
          </div>
          <p className="text-sm text-ink-muted leading-relaxed">
            MartIT is intended for university students and adult campus residents. We do not knowingly solicit or collect personal data from children under the age of 18 without verifiable parental or guardian consent in accordance with Section 9 of the DPDP Act, 2023.
          </p>
          <p className="text-sm text-ink-muted leading-relaxed">
            If we learn that we have inadvertently collected personal data from a child under 18 without verified parental oversight, we will delete such information promptly.
          </p>
        </section>

        {/* Section 17 */}
        <section id="section-17" className="scroll-mt-24 space-y-4">
          <div className="border-b border-line pb-2">
            <h2 className="font-display text-xl sm:text-2xl font-bold text-ink">
              17. Data Breach Protocols &amp; Incident Notification
            </h2>
          </div>
          <p className="text-sm text-ink-muted leading-relaxed">
            In the unlikely event of a personal data breach affecting your information, MartIT maintains an incident response procedure compliant with CERT-In directives and the DPDP Act:
          </p>
          <ul className="list-disc pl-5 space-y-2 text-sm text-ink-muted leading-relaxed">
            <li>We will investigate, contain, and remediate the breach without undue delay.</li>
            <li>We will inform the Data Protection Board of India and affected users in the form and manner prescribed under applicable notified rules.</li>
          </ul>
        </section>

        {/* Section 18 */}
        <section id="section-18" className="scroll-mt-24 space-y-4">
          <div className="border-b border-line pb-2">
            <h2 className="font-display text-xl sm:text-2xl font-bold text-ink">
              18. External Links &amp; Third-Party Platforms
            </h2>
          </div>
          <p className="text-sm text-ink-muted leading-relaxed">
            Our Platform may contain links to external sites (such as bank payment applications, campus portals, or store websites). We are not responsible for the privacy practices, content, or security of those external sites. We encourage you to review their respective privacy policies.
          </p>
        </section>

        {/* Section 19 */}
        <section id="section-19" className="scroll-mt-24 space-y-4">
          <div className="border-b border-line pb-2">
            <h2 className="font-display text-xl sm:text-2xl font-bold text-ink">
              19. Policy Amendments &amp; Version History
            </h2>
          </div>
          <p className="text-sm text-ink-muted leading-relaxed">
            We may periodically revise this Privacy Policy to reflect changes in our operational procedures, campus partnerships, or regulatory requirements. Any modifications will be posted here with an updated &quot;Last Updated&quot; date.
          </p>
          <p className="text-sm text-ink-muted leading-relaxed">
            For material changes that impact how we handle your data, we will provide prominent notice through an in-app banner or email notification.
          </p>
        </section>

        {/* Section 20 */}
        <section id="section-20" className="scroll-mt-24 space-y-4">
          <div className="border-b border-line pb-2">
            <h2 className="font-display text-xl sm:text-2xl font-bold text-ink">
              20. Privacy Grievance Officer &amp; Contact Desk
            </h2>
          </div>
          <p className="text-sm text-ink-muted leading-relaxed">
            If you have questions, feedback, or wish to exercise your data rights or report a privacy grievance, you may reach our designated <strong>Grievance Officer / Data Protection Lead</strong>:
          </p>

          <div id="contact-grievance" className="rounded-card border border-line bg-surface p-5 shadow-1 space-y-3">
            <div className="flex items-center gap-2 text-sm font-bold text-brand">
              <Building className="size-4" aria-hidden="true" />
              <span>Privacy &amp; Data Grievance Desk</span>
            </div>
            <div className="grid gap-2 text-xs sm:text-sm text-ink-muted">
              <div>
                <strong className="text-ink">Designation:</strong>{' '}
                <span className="font-semibold text-ink">[TO BE CONFIRMED: e.g., Data Protection &amp; Grievance Officer]</span>
              </div>
              <div>
                <strong className="text-ink">Name:</strong>{' '}
                <span className="font-semibold text-ink">[TO BE CONFIRMED: Official Full Name]</span>
              </div>
              <div>
                <strong className="text-ink">Company Entity:</strong>{' '}
                <span className="font-semibold text-ink">[TO BE CONFIRMED: Legal Entity Name]</span>
              </div>
              <div>
                <strong className="text-ink">Postal Address:</strong>{' '}
                <span className="font-semibold text-ink">[TO BE CONFIRMED: Physical Office Address, City, State, PIN]</span>
              </div>
              <div>
                <strong className="text-ink">Direct Privacy Email:</strong>{' '}
                <a href="mailto:privacy@martit.campus" className="text-brand font-semibold underline">
                  [TO BE CONFIRMED: privacy@martit.campus]
                </a>
              </div>
              <div>
                <strong className="text-ink">Response Commitment:</strong>{' '}
                <span>Prompt acknowledgment within 24 hours; Substantive redressal within 15 working days.</span>
              </div>
            </div>
          </div>
        </section>
      </div>
    </LegalPageShell>
  )
}
