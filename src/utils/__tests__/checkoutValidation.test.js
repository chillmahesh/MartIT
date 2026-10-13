import { describe, expect, it } from 'vitest'
import {
  PRESET_CAMPUS_LOCATIONS,
  OTHER_LOCATION_VALUE,
  validateFullName,
  normalizeIndianMobile,
  validateCampusLocation,
  mapCampusLocationToDestinationId,
  validateCheckoutDetails,
} from '../checkoutValidation'

describe('checkoutValidation — PRESET_CAMPUS_LOCATIONS', () => {
  it('contains the exact 8 preset campus locations requested', () => {
    expect(PRESET_CAMPUS_LOCATIONS).toEqual([
      'A Block',
      'B Block',
      'C Block',
      'D Block',
      'E Block',
      'MBA Block',
      'Food Court',
      'Management Building',
    ])
  })
})

describe('checkoutValidation — validateFullName', () => {
  it('accepts valid non-empty names', () => {
    const res = validateFullName('Aarav Patel')
    expect(res.isValid).toBe(true)
    expect(res.error).toBeNull()
    expect(res.value).toBe('Aarav Patel')
  })

  it('trims leading and trailing whitespace', () => {
    const res = validateFullName('   Meera Sharma   ')
    expect(res.isValid).toBe(true)
    expect(res.value).toBe('Meera Sharma')
  })

  it('rejects empty or whitespace-only names', () => {
    expect(validateFullName('').isValid).toBe(false)
    expect(validateFullName('   ').isValid).toBe(false)
    expect(validateFullName(null).isValid).toBe(false)
    expect(validateFullName('').error).toBe('Please enter your full name.')
  })

  it('rejects single-character names', () => {
    const res = validateFullName('A')
    expect(res.isValid).toBe(false)
    expect(res.error).toBe('Full name must be at least 2 characters.')
  })
})

describe('checkoutValidation — normalizeIndianMobile', () => {
  it('accepts valid 10-digit Indian numbers starting with 6, 7, 8, or 9', () => {
    const res = normalizeIndianMobile('9876543210')
    expect(res.isValid).toBe(true)
    expect(res.error).toBeNull()
    expect(res.national).toBe('9876543210')
    expect(res.normalized).toBe('+919876543210')
  })

  it('handles optional +91 country code and spaces/dashes', () => {
    const res1 = normalizeIndianMobile('+91 98765 43210')
    expect(res1.isValid).toBe(true)
    expect(res1.national).toBe('9876543210')
    expect(res1.normalized).toBe('+919876543210')

    const res2 = normalizeIndianMobile('+91-9876543210')
    expect(res2.isValid).toBe(true)
    expect(res2.national).toBe('9876543210')

    const res3 = normalizeIndianMobile('919876543210')
    expect(res3.isValid).toBe(true)
    expect(res3.national).toBe('9876543210')

    const res4 = normalizeIndianMobile('09876543210')
    expect(res4.isValid).toBe(true)
    expect(res4.national).toBe('9876543210')
  })

  it('rejects empty mobile numbers', () => {
    const res = normalizeIndianMobile('')
    expect(res.isValid).toBe(false)
    expect(res.error).toBe('Please enter your mobile number.')
  })

  it('rejects non-numeric characters', () => {
    const res = normalizeIndianMobile('98765ABCD0')
    expect(res.isValid).toBe(false)
    expect(res.error).toBe('Mobile number should only contain digits and optional +91 country code.')
  })

  it('rejects numbers starting with invalid digits (0-5)', () => {
    const res = normalizeIndianMobile('5876543210')
    expect(res.isValid).toBe(false)
    expect(res.error).toBe('Indian mobile numbers must start with 6, 7, 8, or 9.')
  })

  it('rejects too short numbers', () => {
    const res = normalizeIndianMobile('9876543')
    expect(res.isValid).toBe(false)
    expect(res.error).toBe('Mobile number is too short. Please enter a 10-digit Indian mobile number.')
  })

  it('rejects too long numbers', () => {
    const res = normalizeIndianMobile('9876543210123')
    expect(res.isValid).toBe(false)
    expect(res.error).toBe('Mobile number is too long. Please enter a 10-digit mobile number.')
  })
})

describe('checkoutValidation — validateCampusLocation', () => {
  it('validates each of the 8 preset locations successfully', () => {
    for (const preset of PRESET_CAMPUS_LOCATIONS) {
      const res = validateCampusLocation({
        presetLocation: preset,
        customLocation: '',
        deliveryInstructions: '',
      })
      expect(res.isValid).toBe(true)
      expect(res.data.preset).toBe(preset)
      expect(res.data.isCustom).toBe(false)
      expect(res.data.formattedAddress).toBe(preset)
    }
  })

  it('includes optional instructions in formatted address for preset location', () => {
    const res = validateCampusLocation({
      presetLocation: 'B Block',
      customLocation: '',
      deliveryInstructions: 'Room 204',
    })
    expect(res.isValid).toBe(true)
    expect(res.data.instructions).toBe('Room 204')
    expect(res.data.formattedAddress).toBe('B Block, Room 204')
  })

  it('requires custom location when other is selected', () => {
    const missingCustom = validateCampusLocation({
      presetLocation: OTHER_LOCATION_VALUE,
      customLocation: '',
      deliveryInstructions: '',
    })
    expect(missingCustom.isValid).toBe(false)
    expect(missingCustom.customError).toBe(
      'Please enter your hostel name, room number, or campus landmark.',
    )

    const whitespaceCustom = validateCampusLocation({
      presetLocation: OTHER_LOCATION_VALUE,
      customLocation: '   ',
      deliveryInstructions: '',
    })
    expect(whitespaceCustom.isValid).toBe(false)

    const validCustom = validateCampusLocation({
      presetLocation: OTHER_LOCATION_VALUE,
      customLocation: 'Hostel 3, Room 204',
      deliveryInstructions: 'Near the entrance',
    })
    expect(validCustom.isValid).toBe(true)
    expect(validCustom.data.isCustom).toBe(true)
    expect(validCustom.data.customLocation).toBe('Hostel 3, Room 204')
    expect(validCustom.data.instructions).toBe('Near the entrance')
    expect(validCustom.data.formattedAddress).toBe('Hostel 3, Room 204, Near the entrance')
  })

  it('rejects unselected or unknown locations', () => {
    const res = validateCampusLocation({
      presetLocation: '',
      customLocation: '',
      deliveryInstructions: '',
    })
    expect(res.isValid).toBe(false)
    expect(res.error).toBe('Please select a delivery location from the campus list.')
  })
})

describe('checkoutValidation — mapCampusLocationToDestinationId', () => {
  const sampleLocations = [
    { id: 'loc_hostel_a', name: 'Hostel A, Block 1' },
    { id: 'loc_hostel_b', name: 'Hostel B, Block 3' },
    { id: 'loc_library', name: 'Central Library' },
  ]

  it('maps preset locations to valid registered destination IDs', () => {
    expect(mapCampusLocationToDestinationId('A Block', sampleLocations)).toBe('loc_hostel_a')
    expect(mapCampusLocationToDestinationId('B Block', sampleLocations)).toBe('loc_hostel_b')
    expect(mapCampusLocationToDestinationId('MBA Block', sampleLocations)).toBe('loc_library')
    expect(mapCampusLocationToDestinationId('Food Court', sampleLocations)).toBe('loc_hostel_a')
    expect(mapCampusLocationToDestinationId('Management Building', sampleLocations)).toBe('loc_library')
  })

  it('maps other to safe campus fallback location', () => {
    expect(mapCampusLocationToDestinationId(OTHER_LOCATION_VALUE, sampleLocations, 'loc_hostel_b')).toBe('loc_hostel_b')
  })
})

describe('checkoutValidation — validateCheckoutDetails (Full)', () => {
  const sampleLocations = [{ id: 'loc_hostel_a' }, { id: 'loc_hostel_b' }]

  it('returns valid object with structured data when all inputs are correct', () => {
    const result = validateCheckoutDetails({
      fullName: 'Aarav Patel',
      mobileNumber: '+91 98765 43210',
      presetLocation: 'A Block',
      customLocation: '',
      deliveryInstructions: 'Leave with guard',
      availableLocations: sampleLocations,
    })

    expect(result.isValid).toBe(true)
    expect(result.errors).toEqual({})
    expect(result.data).toEqual({
      fullName: 'Aarav Patel',
      mobileNumber: '9876543210',
      phone: '+919876543210',
      destinationLocationId: 'loc_hostel_a',
      deliveryLocation: {
        preset: 'A Block',
        isCustom: false,
        customLocation: '',
        instructions: 'Leave with guard',
        formattedAddress: 'A Block, Leave with guard',
      },
    })
  })

  it('aggregates all errors when fields are empty or invalid', () => {
    const result = validateCheckoutDetails({
      fullName: '',
      mobileNumber: '1234',
      presetLocation: OTHER_LOCATION_VALUE,
      customLocation: '',
      deliveryInstructions: '',
      availableLocations: sampleLocations,
    })

    expect(result.isValid).toBe(false)
    expect(result.errors.fullName).toBe('Please enter your full name.')
    expect(result.errors.mobileNumber).toBe(
      'Mobile number is too short. Please enter a 10-digit Indian mobile number.',
    )
    expect(result.errors.customLocation).toBe(
      'Please enter your hostel name, room number, or campus landmark.',
    )
  })
})
