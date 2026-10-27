import { describe, it, expect } from 'vitest'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { MemoryRouter, Routes, Route } from 'react-router'
import TermsPage from '../TermsPage'
import PrivacyPage from '../PrivacyPage'
import { Footer } from '@/components/layout/Footer'

describe('Legal Documentation Pages (/terms-and-conditions & /privacy-policy)', () => {
  it('renders the Terms & Conditions page with all required sections and TOC anchors', () => {
    const html = renderToString(
      React.createElement(
        MemoryRouter,
        { initialEntries: ['/terms-and-conditions'] },
        React.createElement(TermsPage, null),
      ),
    )

    // Heading and title
    expect(html).toContain('Terms &amp; Conditions')
    expect(html).toContain('India Legal Compliance Draft')

    // Key required sections
    expect(html).toContain('id="section-1"')
    expect(html).toContain('id="section-6"') // Cart, single-store rule
    expect(html).toContain('id="section-7"') // UPI Payments & paise allocation
    expect(html).toContain('id="section-8"') // Student runners
    expect(html).toContain('id="section-9"') // OTP verification
    expect(html).toContain('id="section-19"') // Grievance Redressal

    // TOC contains anchor links
    expect(html).toContain('href="#section-1"')
    expect(html).toContain('href="#section-19"')

    // Unconfirmed items are clearly flagged with [TO BE CONFIRMED]
    expect(html).toContain('[TO BE CONFIRMED')
  })

  it('renders the Privacy Policy page with all 20 required data protection sections', () => {
    const html = renderToString(
      React.createElement(
        MemoryRouter,
        { initialEntries: ['/privacy-policy'] },
        React.createElement(PrivacyPage, null),
      ),
    )

    // Heading and title
    expect(html).toContain('Privacy Policy')

    // 20 sections presence
    for (let i = 1; i <= 20; i++) {
      expect(html).toContain(`id="section-${i}"`)
      expect(html).toContain(`href="#section-${i}"`)
    }

    // Zero financial credential storage disclosure
    expect(html).toContain('Zero Financial Account Credential Storage')
    expect(html).toContain('Digital Personal Data Protection Act, 2023')
  })

  it('renders legal navigation links in the application Footer', () => {
    const html = renderToString(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(Footer, null),
      ),
    )

    expect(html).toContain('href="/terms-and-conditions"')
    expect(html).toContain('Terms &amp; Conditions')
    expect(html).toContain('href="/privacy-policy"')
    expect(html).toContain('Privacy Policy')
  })
})
