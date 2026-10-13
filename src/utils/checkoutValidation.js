/**
 * Checkout Customer Details & Campus Address Validation Utilities
 *
 * Implements authoritative validation for customer checkout:
 * - Full name (required, trimmed non-empty)
 * - Indian mobile number (normalization, E.164 and 10-digit national format)
 * - Campus location selection (8 exact presets + custom hostel/landmark details)
 * - Safe delivery-distance mapping to registered campus destinations
 */

export const PRESET_CAMPUS_LOCATIONS = [
  'A Block',
  'B Block',
  'C Block',
  'D Block',
  'E Block',
  'MBA Block',
  'Food Court',
  'Management Building',
]

export const OTHER_LOCATION_VALUE = 'other'
export const OTHER_LOCATION_LABEL = 'Other location / Hostel details'

/**
 * Authoritative mapping from preset campus locations to registered delivery destination IDs.
 * Preserves existing distance-based fee tiers without fabricating coordinates.
 *
 * - A Block / Food Court / C Block: Nearby student central zone (loc_hostel_a ~0.37 km, ₹10 tier)
 * - B Block / D Block / E Block: Hostel cluster zone (loc_hostel_b ~0.80 km, ₹15 tier)
 * - MBA Block / Management Building: Academic & management zone (loc_library ~1.67 km, ₹20 tier)
 */
export const CAMPUS_LOCATION_DESTINATION_MAP = {
  'A Block': 'loc_hostel_a',
  'B Block': 'loc_hostel_b',
  'C Block': 'loc_hostel_a',
  'D Block': 'loc_hostel_b',
  'E Block': 'loc_hostel_b',
  'MBA Block': 'loc_library',
  'Food Court': 'loc_hostel_a',
  'Management Building': 'loc_library',
}

/**
 * Validates full name.
 * - Must not be empty after trimming leading/trailing whitespace.
 * - Must contain at least 2 characters.
 */
export function validateFullName(raw) {
  const trimmed = (raw || '').trim()
  if (!trimmed) {
    return {
      isValid: false,
      error: 'Please enter your full name.',
      value: '',
    }
  }
  if (trimmed.length < 2) {
    return {
      isValid: false,
      error: 'Full name must be at least 2 characters.',
      value: trimmed,
    }
  }
  return {
    isValid: true,
    error: null,
    value: trimmed,
  }
}

/**
 * Validates and normalizes Indian mobile numbers.
 *
 * Requirements:
 * - Supports Indian mobile numbers with optional +91, 91, or 0 country code.
 * - Validates normalized 10 digits starting with 6, 7, 8, or 9.
 * - Rejects non-digits, incorrect lengths, and non-Indian starting digits with helpful inline messages.
 *
 * Returns:
 * {
 *   isValid: boolean,
 *   error: string | null,
 *   national: string,   // e.g. "9876543210"
 *   normalized: string, // e.g. "+919876543210"
 *   raw: string
 * }
 */
export function normalizeIndianMobile(raw) {
  const input = (raw || '').trim()

  if (!input) {
    return {
      isValid: false,
      error: 'Please enter your mobile number.',
      national: '',
      normalized: '',
      raw: input,
    }
  }

  // Remove common separators (spaces, dashes, parens, dots)
  const clean = input.replace(/[\s\-\(\)\.]/g, '')

  // Check if contains letters or forbidden symbols
  if (/[^\d+]/.test(clean) || (clean.includes('+') && !clean.startsWith('+'))) {
    return {
      isValid: false,
      error: 'Mobile number should only contain digits and optional +91 country code.',
      national: '',
      normalized: '',
      raw: input,
    }
  }

  // Match optional +91, 91, or leading 0 prefix followed by 10 digits
  const indianRegex = /^(?:\+91|91|0)?([6-9]\d{9})$/
  const match = clean.match(indianRegex)

  if (match) {
    const national = match[1]
    return {
      isValid: true,
      error: null,
      national,
      normalized: `+91${national}`,
      raw: input,
    }
  }

  // Detailed, helpful inline error reporting
  const digitsOnly = clean.replace(/\D/g, '')
  let coreDigits = digitsOnly
  if (digitsOnly.startsWith('91') && digitsOnly.length > 10) {
    coreDigits = digitsOnly.slice(2)
  } else if (digitsOnly.startsWith('0') && digitsOnly.length > 10) {
    coreDigits = digitsOnly.slice(1)
  }

  if (coreDigits.length === 10 && !/^[6-9]/.test(coreDigits)) {
    return {
      isValid: false,
      error: 'Indian mobile numbers must start with 6, 7, 8, or 9.',
      national: '',
      normalized: '',
      raw: input,
    }
  }

  if (coreDigits.length < 10) {
    return {
      isValid: false,
      error: 'Mobile number is too short. Please enter a 10-digit Indian mobile number.',
      national: '',
      normalized: '',
      raw: input,
    }
  }

  if (coreDigits.length > 10) {
    return {
      isValid: false,
      error: 'Mobile number is too long. Please enter a 10-digit mobile number.',
      national: '',
      normalized: '',
      raw: input,
    }
  }

  return {
    isValid: false,
    error: 'Please enter a valid 10-digit Indian mobile number (e.g. 9876543210 or +91 98765 43210).',
    national: '',
    normalized: '',
    raw: input,
  }
}

/**
 * Validates campus location and hostel / custom details.
 */
export function validateCampusLocation({
  presetLocation,
  customLocation,
  deliveryInstructions,
}) {
  const isOther = presetLocation === OTHER_LOCATION_VALUE || presetLocation === OTHER_LOCATION_LABEL
  const isPreset = PRESET_CAMPUS_LOCATIONS.includes(presetLocation)

  if (!isPreset && !isOther) {
    return {
      isValid: false,
      error: 'Please select a delivery location from the campus list.',
      customError: null,
      data: null,
    }
  }

  if (isOther) {
    const trimmedCustom = (customLocation || '').trim()
    if (!trimmedCustom) {
      return {
        isValid: false,
        error: null,
        customError: 'Please enter your hostel name, room number, or campus landmark.',
        data: null,
      }
    }

    const instructionsTrimmed = (deliveryInstructions || '').trim()
    const formattedAddress = instructionsTrimmed
      ? `${trimmedCustom}, ${instructionsTrimmed}`
      : trimmedCustom

    return {
      isValid: true,
      error: null,
      customError: null,
      data: {
        preset: OTHER_LOCATION_VALUE,
        isCustom: true,
        customLocation: trimmedCustom,
        instructions: instructionsTrimmed,
        formattedAddress,
      },
    }
  }

  // Valid preset location
  const instructionsTrimmed = (deliveryInstructions || '').trim()
  const formattedAddress = instructionsTrimmed
    ? `${presetLocation}, ${instructionsTrimmed}`
    : presetLocation

  return {
    isValid: true,
    error: null,
    customError: null,
    data: {
      preset: presetLocation,
      isCustom: false,
      customLocation: '',
      instructions: instructionsTrimmed,
      formattedAddress,
    },
  }
}

/**
 * Maps selected campus location to an authoritative registered delivery destination ID.
 * Ensures the delivery quote and routing system are not bypassed or given invented coordinates.
 */
export function mapCampusLocationToDestinationId(
  presetLocation,
  availableLocations = [],
  fallbackId = 'loc_hostel_b',
) {
  // If custom 'other', use the fallback registered campus location
  if (presetLocation === OTHER_LOCATION_VALUE || presetLocation === OTHER_LOCATION_LABEL) {
    const fallbackMatch = availableLocations.find((l) => l.id === fallbackId)
    return fallbackMatch ? fallbackMatch.id : availableLocations[0]?.id || fallbackId
  }

  // Check destination map
  const mappedId = CAMPUS_LOCATION_DESTINATION_MAP[presetLocation]
  if (mappedId) {
    const exists = availableLocations.some((l) => l.id === mappedId)
    if (exists || availableLocations.length === 0) {
      return mappedId
    }
  }

  // Check if available locations list has a matching location by name
  const nameMatch = availableLocations.find(
    (l) => l.name && l.name.toLowerCase().includes(presetLocation.toLowerCase()),
  )
  if (nameMatch) {
    return nameMatch.id
  }

  // Fallback to safe registered destination if available
  const fallbackMatch = availableLocations.find((l) => l.id === fallbackId)
  if (fallbackMatch) {
    return fallbackMatch.id
  }

  return availableLocations[0]?.id || null
}

/**
 * Comprehensive validation for all checkout delivery details.
 */
export function validateCheckoutDetails({
  fullName,
  mobileNumber,
  presetLocation,
  customLocation,
  deliveryInstructions,
  availableLocations = [],
  fallbackLocationId = 'loc_hostel_b',
}) {
  const nameResult = validateFullName(fullName)
  const mobileResult = normalizeIndianMobile(mobileNumber)
  const locationResult = validateCampusLocation({
    presetLocation,
    customLocation,
    deliveryInstructions,
  })

  const errors = {}
  if (!nameResult.isValid) errors.fullName = nameResult.error
  if (!mobileResult.isValid) errors.mobileNumber = mobileResult.error
  if (!locationResult.isValid) {
    if (locationResult.error) errors.location = locationResult.error
    if (locationResult.customError) errors.customLocation = locationResult.customError
  }

  const destinationLocationId = mapCampusLocationToDestinationId(
    presetLocation,
    availableLocations,
    fallbackLocationId,
  )

  if (!destinationLocationId) {
    errors.location = 'Selected campus location cannot be mapped to an authorized delivery destination.'
  }

  const isValid = Object.keys(errors).length === 0

  return {
    isValid,
    errors,
    data: isValid
      ? {
          fullName: nameResult.value,
          mobileNumber: mobileResult.national,
          phone: mobileResult.normalized,
          destinationLocationId,
          deliveryLocation: locationResult.data,
        }
      : null,
  }
}
