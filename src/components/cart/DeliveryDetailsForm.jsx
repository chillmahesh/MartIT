import { useState, useRef, useEffect } from 'react'
import {
  User,
  Phone,
  MapPin,
  Building,
  Compass,
  Check,
  ChevronDown,
  Navigation,
  Bookmark,
  BookmarkCheck,
  X,
} from 'lucide-react'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { useAuthStore } from '@/stores/authStore'
import {
  PRESET_CAMPUS_LOCATIONS,
  OTHER_LOCATION_VALUE,
  OTHER_LOCATION_LABEL,
  LEGACY_OTHER_LABEL,
} from '@/utils/checkoutValidation'
import { cn } from '@/utils/cn'

/**
 * DeliveryDetailsForm Component
 *
 * Renders the checkout Customer Details and Delivery Destination sections:
 * 1. Customer Information:
 *    - Full Name (Required, trimmed non-empty, prefillable)
 *    - Phone Number (Required, Indian mobile format, inline validation)
 * 2. Delivery Destination:
 *    - Campus Destination (Searchable combobox & dropdown with exact 8 presets + Other / Enter address)
 *    - Destination Address (Revealed when Other / Enter address is selected, required free-text)
 *    - Detailed address / landmark (Optional text input for extra directions: hostel name, floor, room, landmark)
 */
export const SAVED_LOCATION_STORAGE_KEY = 'martit_saved_delivery_location'

export function DeliveryDetailsForm({
  details,
  errors = {},
  onChange,
  disabled = false,
  className,
  initialDropdownOpen = false,
}) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(initialDropdownOpen)
  const dropdownRef = useRef(null)
  const listboxRef = useRef(null)

  const user = useAuthStore((s) => s.user)

  const [savedLocation, setSavedLocation] = useState(() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const item = window.localStorage.getItem(SAVED_LOCATION_STORAGE_KEY)
        if (!item) return null
        const parsed = JSON.parse(item)
        const currentUser = useAuthStore.getState().user
        if (parsed.userId && currentUser?.id && parsed.userId !== currentUser.id) {
          return null
        }
        return parsed
      }
    } catch {
      // Ignore localStorage read error
    }
    return null
  })
  const [saveFeedback, setSaveFeedback] = useState('')

  useEffect(() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const item = window.localStorage.getItem(SAVED_LOCATION_STORAGE_KEY)
        if (!item) {
          setSavedLocation(null)
          return
        }
        const parsed = JSON.parse(item)
        if (parsed.userId && user?.id && parsed.userId !== user.id) {
          setSavedLocation(null)
          return
        }
        setSavedLocation(parsed)
      }
    } catch {
      setSavedLocation(null)
    }
  }, [user?.id])

  const handleApplySavedLocation = () => {
    if (!savedLocation) return
    if (savedLocation.presetLocation) {
      onChange('presetLocation', savedLocation.presetLocation)
    }
    if (savedLocation.customLocation) {
      onChange('customLocation', savedLocation.customLocation)
    }
    if (savedLocation.deliveryInstructions) {
      onChange('deliveryInstructions', savedLocation.deliveryInstructions)
    }
    if (savedLocation.fullName && !details.fullName) {
      onChange('fullName', savedLocation.fullName)
    }
    if (savedLocation.phoneNumber && !(details.phoneNumber || details.mobileNumber)) {
      onChange('phoneNumber', savedLocation.phoneNumber)
      onChange('mobileNumber', savedLocation.phoneNumber)
    }
  }

  const handleSaveLocation = () => {
    if (!details.presetLocation) return
    try {
      const payload = {
        userId: user?.id || null,
        presetLocation: details.presetLocation,
        customLocation: details.customLocation || '',
        deliveryInstructions: details.deliveryInstructions || '',
        fullName: details.fullName || '',
        phoneNumber: details.phoneNumber || details.mobileNumber || '',
        savedAt: new Date().toISOString(),
      }
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(SAVED_LOCATION_STORAGE_KEY, JSON.stringify(payload))
      }
      setSavedLocation(payload)
      setSaveFeedback('Address saved!')
      setTimeout(() => setSaveFeedback(''), 3000)
    } catch (err) {
      console.warn('Could not save location preference:', err)
    }
  }

  const handleClearSavedLocation = () => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(SAVED_LOCATION_STORAGE_KEY)
      }
      setSavedLocation(null)
      setSaveFeedback('')
    } catch (err) {
      console.warn('Could not clear location preference:', err)
    }
  }

  const isOtherSelected =
    details.presetLocation === OTHER_LOCATION_VALUE ||
    details.presetLocation === OTHER_LOCATION_LABEL ||
    details.presetLocation === LEGACY_OTHER_LABEL ||
    details.presetLocation === 'Other / Enter address'

  // Close dropdown on outside click or Escape key
  useEffect(() => {
    if (!isDropdownOpen) return

    const handlePointerDownOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsDropdownOpen(false)
      }
    }

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setIsDropdownOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDownOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDownOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isDropdownOpen])

  // Isolate wheel events on listbox so Lenis/window smooth-scroll doesn't hijack or block mouse wheel scrolling
  useEffect(() => {
    if (!isDropdownOpen) return

    const listbox = listboxRef.current
    if (!listbox) return

    const handleWheel = (e) => {
      // Stop event from bubbling to window so Lenis does not intercept and cancel it
      e.stopPropagation()
    }

    listbox.addEventListener('wheel', handleWheel, { passive: true })
    return () => {
      listbox.removeEventListener('wheel', handleWheel)
    }
  }, [isDropdownOpen])

  const handleSelectLocation = (locationValue) => {
    onChange('presetLocation', locationValue)
    setIsDropdownOpen(false)
  }

  const selectedLocationDisplay = isOtherSelected
    ? OTHER_LOCATION_LABEL
    : details.presetLocation || 'Select campus destination'

  return (
    <section
      aria-label="Customer and Delivery Details"
      className={cn(
        'rounded-card border border-line bg-surface p-4 sm:p-6 shadow-1 space-y-6',
        className,
      )}
    >
      {/* 1. Customer Information Sub-section */}
      <div className="space-y-4">
        <div className="flex items-center gap-2.5 pb-2 border-b border-line/60 text-ink">
          <span className="grid size-8 place-items-center rounded-tile bg-brand-soft text-brand-ink">
            <User className="size-4" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-base font-bold text-ink leading-tight">Customer Information</h2>
            <p className="text-xs text-ink-subtle">
              Your contact details for order updates and runner coordination.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Full Name */}
          <Field
            label="Full Name"
            error={errors.fullName}
            className="sm:col-span-1"
          >
            <Input
              id="checkout-full-name"
              data-testid="checkout-full-name"
              name="fullName"
              type="text"
              icon={User}
              placeholder="e.g. Aarav Patel"
              autoComplete="name"
              maxLength={120}
              value={details.fullName || ''}
              onChange={(e) => onChange('fullName', e.target.value)}
              disabled={disabled}
              aria-required="true"
            />
          </Field>

          {/* Phone Number */}
          <Field
            label="Phone Number"
            hint="10-digit Indian mobile number (e.g. 9876543210 or +91 98765 43210)"
            error={errors.mobileNumber || errors.phoneNumber}
            className="sm:col-span-1"
          >
            <Input
              id="checkout-mobile-number"
              data-testid="checkout-phone-number"
              name="mobileNumber"
              type="tel"
              inputMode="tel"
              maxLength={16}
              icon={Phone}
              placeholder="e.g. 9876543210"
              autoComplete="tel"
              value={details.mobileNumber || details.phoneNumber || ''}
              onChange={(e) => {
                onChange('mobileNumber', e.target.value)
                onChange('phoneNumber', e.target.value)
              }}
              disabled={disabled}
              aria-required="true"
            />
          </Field>
        </div>
      </div>

      {/* 2. Delivery Destination Sub-section */}
      <div className="space-y-4 pt-2 border-t border-line/60">
        <div className="flex items-center gap-2.5 pb-2 border-b border-line/60 text-ink">
          <span className="grid size-8 place-items-center rounded-tile bg-fresh-soft text-fresh-ink">
            <Navigation className="size-4" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-base font-bold text-ink leading-tight">Delivery Destination</h2>
            <p className="text-xs text-ink-subtle">
              Select your campus block or enter an address for our runner.
            </p>
          </div>
        </div>

        {/* Saved Campus Address Quick-Fill Banner */}
        {savedLocation && (
          <div
            className="flex items-center justify-between gap-2 rounded-tile border border-brand/30 bg-brand-soft/40 p-2.5 text-xs animate-fade-in"
            data-testid="saved-location-banner"
          >
            <div className="flex items-center gap-2 min-w-0">
              <BookmarkCheck className="size-4 text-brand shrink-0" aria-hidden="true" />
              <div className="min-w-0">
                <p className="font-semibold text-ink leading-tight">Saved Campus Address</p>
                <p className="text-[11px] text-ink-muted truncate">
                  {savedLocation.presetLocation === OTHER_LOCATION_VALUE ? savedLocation.customLocation : savedLocation.presetLocation}
                  {savedLocation.deliveryInstructions ? ` • ${savedLocation.deliveryInstructions}` : ''}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                data-testid="use-saved-location-btn"
                onClick={handleApplySavedLocation}
                className="rounded-full bg-brand px-2.5 py-1 text-[11px] font-bold text-white shadow-1 hover:bg-brand/90 transition-colors cursor-pointer"
              >
                Apply
              </button>
              <button
                type="button"
                data-testid="clear-saved-location-btn"
                onClick={handleClearSavedLocation}
                aria-label="Forget saved campus address"
                className="p-1 text-ink-subtle hover:text-danger rounded-full hover:bg-surface-2 transition-colors cursor-pointer"
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>
        )}

        {/* Campus Destination Selector */}
        <div className="space-y-1.5">
          <label
            htmlFor="campus-location-select"
            className="block text-sm font-medium text-ink"
          >
            Campus Destination
          </label>

          {/* Accessible native select for keyboard/screen readers & programmatic tests */}
          <div className="relative">
            <select
              id="campus-location-select"
              data-testid="campus-location-select"
              aria-label="Campus Destination"
              value={details.presetLocation || 'A Block'}
              onChange={(e) => handleSelectLocation(e.target.value)}
              disabled={disabled}
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
            >
              {PRESET_CAMPUS_LOCATIONS.map((preset) => (
                <option key={preset} value={preset}>
                  {preset}
                </option>
              ))}
              <option value={OTHER_LOCATION_VALUE}>{OTHER_LOCATION_LABEL}</option>
            </select>

            {/* Interactive Combobox / Dropdown Trigger */}
            <div ref={dropdownRef} className="relative">
              <button
                type="button"
                id="campus-location-trigger"
                data-testid="campus-location-trigger"
                aria-haspopup="listbox"
                aria-expanded={isDropdownOpen}
                aria-label="Choose campus destination"
                disabled={disabled}
                onClick={() => setIsDropdownOpen((open) => !open)}
                className={cn(
                  'group flex w-full items-center justify-between gap-3 rounded-tile border bg-surface px-3.5 py-3 text-left shadow-1 transition-all',
                  errors.location
                    ? 'border-danger focus:ring-danger'
                    : 'border-line-strong hover:border-ink-subtle focus:border-brand',
                  disabled && 'opacity-60 cursor-not-allowed',
                )}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="grid size-8 shrink-0 place-items-center rounded-[8px] bg-fresh-soft text-fresh-ink">
                    <MapPin className="size-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink leading-tight">
                      {selectedLocationDisplay}
                    </p>
                    <p className="truncate text-[11px] text-ink-subtle mt-0.5">
                      {isOtherSelected
                        ? 'Custom destination address'
                        : 'Campus building preset'}
                    </p>
                  </div>
                </div>

                <ChevronDown
                  className={cn(
                    'size-4 text-ink-subtle shrink-0 transition-transform duration-200',
                    isDropdownOpen && 'rotate-180',
                  )}
                  aria-hidden="true"
                />
              </button>

              {/* Dropdown Menu Panel (Max height set to show ~4 options at a time) */}
              {isDropdownOpen && (
                <div
                  ref={listboxRef}
                  role="listbox"
                  aria-label="Campus destinations list"
                  data-testid="campus-locations-list"
                  data-lenis-prevent
                  data-lenis-prevent-wheel
                  data-lenis-prevent-touch
                  tabIndex={-1}
                  onWheel={(e) => e.stopPropagation()}
                  className="absolute z-40 left-0 right-0 mt-1.5 max-h-48 overflow-y-auto overscroll-contain rounded-card border border-line bg-surface p-1.5 shadow-2 animate-fade-in focus:outline-none"
                >
                  <div className="space-y-1">
                    {/* Preset Locations */}
                    {PRESET_CAMPUS_LOCATIONS.map((preset) => {
                      const isSelected = details.presetLocation === preset
                      return (
                        <button
                          key={preset}
                          type="button"
                          role="option"
                          aria-selected={isSelected}
                          data-testid={`preset-option-${preset.toLowerCase().replace(/\s+/g, '-')}`}
                          onClick={() => handleSelectLocation(preset)}
                          className={cn(
                            'flex w-full items-center justify-between gap-2 rounded-tile px-3 py-2 text-sm text-left transition-colors',
                            isSelected
                              ? 'bg-brand-soft text-brand-ink font-semibold'
                              : 'hover:bg-surface-2 text-ink',
                          )}
                        >
                          <span className="truncate">{preset}</span>
                          {isSelected && (
                            <Check className="size-4 text-fresh-ink shrink-0" aria-hidden="true" />
                          )}
                        </button>
                      )
                    })}

                    {/* Divider */}
                    <div className="my-1.5 border-t border-line/60" />

                    {/* Other / Enter address Option */}
                    <button
                      type="button"
                      role="option"
                      aria-selected={isOtherSelected}
                      data-testid="preset-option-other"
                      onClick={() => handleSelectLocation(OTHER_LOCATION_VALUE)}
                      className={cn(
                        'flex w-full items-center justify-between gap-2 rounded-tile px-3 py-2 text-sm text-left transition-colors font-medium',
                        isOtherSelected
                          ? 'bg-brand-soft text-brand-ink font-semibold'
                          : 'hover:bg-surface-2 text-brand',
                      )}
                    >
                      <span className="flex items-center gap-2 truncate">
                        <Building className="size-3.5 shrink-0" aria-hidden="true" />
                        <span>{OTHER_LOCATION_LABEL}</span>
                      </span>
                      {isOtherSelected && (
                        <Check className="size-4 text-fresh-ink shrink-0" aria-hidden="true" />
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {errors.location && (
            <p role="alert" className="text-[13px] font-medium text-danger mt-1">
              {errors.location}
            </p>
          )}
        </div>

        {/* Destination Address Field (Revealed when Other / Enter address is selected) */}
        {isOtherSelected && (
          <Field
            label="Destination Address"
            hint="Enter your campus building or destination address"
            error={errors.customLocation}
          >
            <Input
              id="checkout-custom-location"
              data-testid="checkout-custom-location"
              name="customLocation"
              type="text"
              icon={Building}
              maxLength={200}
              placeholder="e.g. Science Block, Old Workshop, Mechanical Dept"
              value={details.customLocation || ''}
              onChange={(e) => onChange('customLocation', e.target.value)}
              disabled={disabled}
              aria-required="true"
            />
          </Field>
        )}

        {/* Detailed Address / Landmark (Optional extra directions) */}
        <Field
          label="Detailed address / landmark"
          optional
          hint="Extra directions, such as hostel name, floor, room number, or nearby landmark"
        >
          <Input
            id="checkout-delivery-instructions"
            data-testid="checkout-detailed-address"
            name="deliveryInstructions"
            type="text"
            icon={Compass}
            maxLength={500}
            placeholder="e.g. Hostel 3, 2nd floor, Room 204, near the entrance"
            value={details.deliveryInstructions || ''}
            onChange={(e) => onChange('deliveryInstructions', e.target.value)}
            disabled={disabled}
          />
        </Field>

        {/* Save Campus Address Preference */}
        <div className="flex items-center justify-between pt-1">
          <button
            type="button"
            data-testid="save-delivery-location-btn"
            onClick={handleSaveLocation}
            disabled={!details.presetLocation || disabled}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand hover:underline disabled:opacity-40 disabled:no-underline cursor-pointer"
          >
            <Bookmark className="size-3.5" aria-hidden="true" />
            <span>Save as my default campus address</span>
          </button>
          {saveFeedback && (
            <span className="text-[11px] font-medium text-fresh-ink flex items-center gap-1" role="status">
              <Check className="size-3 text-fresh" aria-hidden="true" />
              <span>{saveFeedback}</span>
            </span>
          )}
        </div>
      </div>
    </section>
  )
}
