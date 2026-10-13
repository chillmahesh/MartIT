import { useState, useMemo } from 'react'
import {
  User,
  Phone,
  MapPin,
  Building,
  Compass,
  Search,
  Check,
  ChevronDown,
  Navigation,
} from 'lucide-react'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import {
  PRESET_CAMPUS_LOCATIONS,
  OTHER_LOCATION_VALUE,
  OTHER_LOCATION_LABEL,
} from '@/utils/checkoutValidation'
import { cn } from '@/utils/cn'

/**
 * DeliveryDetailsForm Component
 *
 * Renders the checkout Delivery Details section:
 * 1. Full Name (Required, trimmed non-empty, prefillable)
 * 2. Mobile Number (Required, Indian mobile format, inline validation)
 * 3. Campus Location (Searchable combobox & dropdown with exact 8 presets + Other option)
 * 4. Hostel / Landmark Details (Conditional free-text required if Other selected)
 * 5. Optional Delivery Instructions (Free-text runner directions)
 */
export function DeliveryDetailsForm({
  details,
  errors = {},
  onChange,
  disabled = false,
  className,
}) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const isOtherSelected =
    details.presetLocation === OTHER_LOCATION_VALUE ||
    details.presetLocation === OTHER_LOCATION_LABEL

  // Filter preset locations by search query
  const filteredPresets = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return PRESET_CAMPUS_LOCATIONS
    return PRESET_CAMPUS_LOCATIONS.filter((preset) =>
      preset.toLowerCase().includes(q),
    )
  }, [searchQuery])

  const handleSelectLocation = (locationValue) => {
    onChange('presetLocation', locationValue)
    setIsDropdownOpen(false)
    setSearchQuery('')
  }

  const selectedLocationDisplay = isOtherSelected
    ? OTHER_LOCATION_LABEL
    : details.presetLocation || 'Select campus location'

  return (
    <section
      aria-label="Delivery Details"
      className={cn(
        'rounded-card border border-line bg-surface p-4 sm:p-6 shadow-1 space-y-5',
        className,
      )}
    >
      {/* Section Header */}
      <div className="flex items-center gap-2.5 pb-2 border-b border-line/60 text-ink">
        <span className="grid size-8 place-items-center rounded-tile bg-fresh-soft text-fresh-ink">
          <Navigation className="size-4" aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-base font-bold text-ink leading-tight">Delivery Details</h2>
          <p className="text-xs text-ink-subtle">
            Where and who should our campus runner deliver your order to?
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* 1. Full Name */}
        <Field
          label="Full Name"
          error={errors.fullName}
          className="sm:col-span-1"
        >
          <Input
            id="checkout-full-name"
            name="fullName"
            type="text"
            icon={User}
            placeholder="e.g. Aarav Patel"
            autoComplete="name"
            value={details.fullName || ''}
            onChange={(e) => onChange('fullName', e.target.value)}
            disabled={disabled}
            aria-required="true"
          />
        </Field>

        {/* 2. Mobile Number */}
        <Field
          label="Mobile Number"
          hint="10-digit Indian number (e.g. 9876543210 or +91 98765 43210)"
          error={errors.mobileNumber}
          className="sm:col-span-1"
        >
          <Input
            id="checkout-mobile-number"
            name="mobileNumber"
            type="tel"
            icon={Phone}
            placeholder="e.g. 9876543210"
            autoComplete="tel"
            value={details.mobileNumber || ''}
            onChange={(e) => onChange('mobileNumber', e.target.value)}
            disabled={disabled}
            aria-required="true"
          />
        </Field>
      </div>

      {/* 3. Campus Location Selector */}
      <div className="space-y-1.5">
        <label
          htmlFor="campus-location-select"
          className="block text-sm font-medium text-ink"
        >
          Campus Location
        </label>

        {/* Accessible native select for keyboard/screen readers & programmatic tests */}
        <div className="relative">
          <select
            id="campus-location-select"
            data-testid="campus-location-select"
            aria-label="Campus Location"
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
          <div className="relative">
            <button
              type="button"
              id="campus-location-trigger"
              data-testid="campus-location-trigger"
              aria-haspopup="listbox"
              aria-expanded={isDropdownOpen}
              aria-label="Choose campus location"
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
                      ? 'Custom hostel / landmark'
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

            {/* Dropdown Menu Panel */}
            {isDropdownOpen && (
              <div
                role="listbox"
                aria-label="Campus locations list"
                data-testid="campus-locations-list"
                className="absolute z-40 left-0 right-0 mt-1.5 max-h-80 overflow-y-auto rounded-card border border-line bg-surface p-2 shadow-2 animate-fade-in"
              >
                {/* Search input for mobile filter */}
                <div className="relative mb-2 px-1">
                  <Search
                    className="pointer-events-none absolute left-3.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-subtle"
                    aria-hidden="true"
                  />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search campus spot..."
                    className="h-9 w-full rounded-tile border border-line bg-surface-2 pl-9 pr-3 text-xs text-ink placeholder:text-ink-subtle focus:border-brand focus:outline-none"
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>

                <div className="space-y-1">
                  {/* Preset Locations */}
                  {filteredPresets.map((preset) => {
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

                  {filteredPresets.length === 0 && (
                    <p className="px-3 py-2 text-xs text-ink-subtle italic">
                      No matching preset buildings found.
                    </p>
                  )}

                  {/* Divider */}
                  <div className="my-1.5 border-t border-line/60" />

                  {/* Other / Hostel Details Option */}
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

      {/* 4. Conditional Other location / Hostel details free text */}
      {isOtherSelected && (
        <Field
          label="Hostel or Landmark Details"
          hint="Enter your hostel name, hostel block, room number, or landmark"
          error={errors.customLocation}
        >
          <Input
            id="checkout-custom-location"
            data-testid="checkout-custom-location"
            name="customLocation"
            type="text"
            icon={Building}
            placeholder="e.g. Hostel 3, Room 204, Block B"
            value={details.customLocation || ''}
            onChange={(e) => onChange('customLocation', e.target.value)}
            disabled={disabled}
            aria-required="true"
          />
        </Field>
      )}

      {/* 5. Optional Delivery Instructions */}
      <Field
        label="Delivery Instructions"
        optional
        hint="Directions for the runner (e.g. Hostel 3, Room 204, near the entrance, call upon arrival)"
      >
        <Input
          id="checkout-delivery-instructions"
          name="deliveryInstructions"
          type="text"
          icon={Compass}
          placeholder="e.g. Near main gate, call when arriving"
          value={details.deliveryInstructions || ''}
          onChange={(e) => onChange('deliveryInstructions', e.target.value)}
          disabled={disabled}
        />
      </Field>
    </section>
  )
}
