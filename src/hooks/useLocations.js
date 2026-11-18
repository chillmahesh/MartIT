import { useQuery } from '@tanstack/react-query'
import { locationService } from '@/services/locationService'
import { useCartStore } from '@/stores/cartStore'
import { useAuthStore } from '@/stores/authStore'
import { SAMPLE_DELIVERY_LOCATIONS } from '@/mocks/campus'
import {
  PRESET_CAMPUS_LOCATIONS,
  OTHER_LOCATION_VALUE,
  OTHER_LOCATION_LABEL,
  mapCampusLocationToDestinationId,
} from '@/utils/checkoutValidation'

export const useLocations = () =>
  useQuery({ queryKey: ['locations'], queryFn: locationService.list, staleTime: 10 * 60_000 })

export function useLocationName(id) {
  const { data: rawLocations = [] } = useLocations()
  const locations = rawLocations.length > 0 ? rawLocations : SAMPLE_DELIVERY_LOCATIONS
  return locations.find((l) => l.id === id)?.name ?? null
}

/**
 * Formats a concise, meaningful destination label from the active delivery details.
 * Preserves the distinction between registered campus spots and supplementary room/landmark directions.
 */
export function formatDestinationLabel({
  presetLocation,
  customLocation,
  deliveryInstructions,
  locationId,
  locations = [],
} = {}) {
  const instructions = (deliveryInstructions || '').trim()

  const isOther =
    presetLocation === OTHER_LOCATION_VALUE ||
    presetLocation === 'other' ||
    presetLocation === OTHER_LOCATION_LABEL

  // 1. Custom / other address flow
  if (isOther) {
    const custom = (customLocation || '').trim()
    if (!custom) return null
    return instructions ? `${custom}, ${instructions}` : custom
  }

  // 2. Preset campus locations (e.g. 'A Block', 'Food Court', 'MBA Block')
  if (presetLocation && PRESET_CAMPUS_LOCATIONS.includes(presetLocation)) {
    return instructions ? `${presetLocation}, ${instructions}` : presetLocation
  }

  // 3. Preset matches a registered location name directly
  if (presetLocation && typeof presetLocation === 'string') {
    const locByName = locations?.find(
      (l) => l.name && l.name.toLowerCase() === presetLocation.toLowerCase(),
    )
    if (locByName) {
      return instructions ? `${locByName.name}, ${instructions}` : locByName.name
    }
  }

  // 4. Location ID resolution (e.g. 'loc_hostel_b')
  const targetId =
    locationId ||
    (presetLocation && locations?.some((l) => l.id === presetLocation) ? presetLocation : null)

  if (targetId) {
    const matchedLoc = locations?.find((l) => l.id === targetId)
    if (matchedLoc) {
      return instructions ? `${matchedLoc.name}, ${instructions}` : matchedLoc.name
    }
    // Target ID provided but not found in registered locations
    return null
  }

  // 5. Arbitrary custom string if presetLocation is non-empty and unmapped
  if (presetLocation && typeof presetLocation === 'string' && presetLocation.trim()) {
    const trimmed = presetLocation.trim()
    return instructions ? `${trimmed}, ${instructions}` : trimmed
  }

  return null
}

/**
 * Reactive hook providing the customer's authoritative active delivery destination.
 * Reactively synchronizes across AppHeader, CartPage, and checkout flow.
 */
export function useActiveDestination() {
  const userFromHook = useAuthStore((s) => s.user)
  const user =
    typeof window === 'undefined'
      ? (useAuthStore.getState().user ?? userFromHook)
      : (userFromHook ?? useAuthStore.getState().user)

  const checkoutDetailsFromHook = useCartStore((s) => s.checkoutDetails)
  const checkoutDetails =
    typeof window === 'undefined'
      ? (useCartStore.getState().checkoutDetails ?? checkoutDetailsFromHook)
      : (checkoutDetailsFromHook ?? useCartStore.getState().checkoutDetails)

  const { data: rawLocations = [], isLoading } = useLocations()
  const locations = rawLocations.length > 0 ? rawLocations : SAMPLE_DELIVERY_LOCATIONS

  const presetLocation = checkoutDetails?.presetLocation
  const customLocation = checkoutDetails?.customLocation
  const deliveryInstructions = checkoutDetails?.deliveryInstructions
  const isCleared = checkoutDetails?.isCleared

  const hasExplicitPreset = Boolean(presetLocation && presetLocation.trim())
  const hasExplicitCustom = Boolean(
    (presetLocation === OTHER_LOCATION_VALUE || presetLocation === 'other') &&
      customLocation &&
      customLocation.trim(),
  )
  const hasExplicitSelection = !isCleared && (hasExplicitPreset || hasExplicitCustom)

  let resolvedLocationId = null
  let isDefaultFallback = false

  if (hasExplicitSelection) {
    resolvedLocationId = mapCampusLocationToDestinationId(
      presetLocation,
      locations,
      user?.defaultLocationId || 'loc_hostel_b',
    )
  } else if (!isCleared && user?.defaultLocationId) {
    const exists = locations.some((l) => l.id === user.defaultLocationId)
    if (exists) {
      resolvedLocationId = user.defaultLocationId
      isDefaultFallback = true
    }
  }

  const displayLabel = !isCleared
    ? formatDestinationLabel({
        presetLocation: hasExplicitSelection ? presetLocation : null,
        customLocation: hasExplicitSelection ? customLocation : null,
        deliveryInstructions,
        locationId: hasExplicitSelection
          ? resolvedLocationId
          : isDefaultFallback
            ? resolvedLocationId
            : null,
        locations,
      })
    : null

  const isOther =
    presetLocation === OTHER_LOCATION_VALUE ||
    presetLocation === 'other' ||
    presetLocation === OTHER_LOCATION_LABEL

  const isValid = hasExplicitSelection
    ? isOther
      ? Boolean(customLocation?.trim()) && Boolean(resolvedLocationId)
      : PRESET_CAMPUS_LOCATIONS.includes(presetLocation) && Boolean(resolvedLocationId)
    : Boolean(isDefaultFallback && resolvedLocationId)

  return {
    displayLabel,
    hasActiveDestination: Boolean(displayLabel),
    resolvedLocationId,
    isValid,
    isLoading,
    isDefaultFallback,
    presetLocation: hasExplicitSelection ? presetLocation : null,
    customLocation: hasExplicitSelection ? customLocation : null,
    deliveryInstructions: deliveryInstructions || '',
  }
}
