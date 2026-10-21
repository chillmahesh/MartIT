import { Router } from 'express'
import { z } from 'zod'
import { getSupabaseAdmin } from '../config/supabase.js'
import { ApiError } from '../utils/errors.js'
import {
  FLAT_DELIVERY_FEE,
  FLAT_DELIVERY_FEE_LABEL,
  MAX_SERVICE_KM,
  PRICING_VERSION,
} from '../../../src/config/fees.js'
import { parseCoordinate, straightLineKm } from '../../../src/utils/distance.js'

export const deliveryRouter = Router()

const singleStoreQuoteSchema = z
  .object({
    storeId: z.string().min(1).optional(),
    storeIds: z.array(z.string()).optional(),
    locationId: z.string().min(1, 'Delivery location is required'),
  })
  .refine((data) => data.storeId || (data.storeIds && data.storeIds.length > 0), {
    message: 'Store ID is required',
  })


function calculateTierDeliveryFee(km) {
  if (km <= 0) return { ok: false, reason: 'INVALID_DISTANCE' }
  const eps = 1e-9
  if (km <= MAX_SERVICE_KM + eps) {
    return { ok: true, fee: FLAT_DELIVERY_FEE, label: FLAT_DELIVERY_FEE_LABEL }
  }
  return { ok: false, reason: 'MAX_DISTANCE_EXCEEDED' }
}

async function handleQuote(req, res, next) {
  try {
    const body = singleStoreQuoteSchema.parse(req.body)

    // Guard: multi-store quotes must not fabricate route distance without a real provider
    if (body.storeIds && body.storeIds.length > 1) {
      throw ApiError.unprocessable(
        'Multi-store route calculation requires an active walking routing service. Multi-store checkout is not yet enabled.',
        'MULTI_STORE_ROUTING_UNAVAILABLE',
        { requestedStores: body.storeIds },
      )
    }

    const storeId = body.storeId || body.storeIds?.[0]
    const { locationId } = body
    const supabase = getSupabaseAdmin()

    // Query store
    const { data: store, error: storeErr } = await supabase
      .from('stores')
      .select('id, name, is_open, latitude, longitude')
      .eq('id', storeId)
      .maybeSingle()

    if (storeErr || !store) {
      throw ApiError.notFound('That store is not available.', 'STORE_NOT_FOUND')
    }

    if (!store.is_open) {
      throw ApiError.conflict('This store is closed right now.', 'STORE_CLOSED')
    }

    // Query delivery location
    const { data: location, error: locErr } = await supabase
      .from('locations')
      .select('id, name, latitude, longitude, is_active')
      .eq('id', locationId)
      .maybeSingle()

    if (locErr || !location || !location.is_active) {
      throw ApiError.notFound('Choose a valid delivery spot first.', 'LOCATION_NOT_FOUND')
    }

    const storeCoords = parseCoordinate({
      latitude: store.latitude,
      longitude: store.longitude,
    })
    if (!storeCoords) {
      throw ApiError.unprocessable(
        'Store coordinates are missing or invalid.',
        'INVALID_COORDINATES',
        { entity: 'store', storeId },
      )
    }

    const locationCoords = parseCoordinate({
      latitude: location.latitude,
      longitude: location.longitude,
    })
    if (!locationCoords) {
      throw ApiError.unprocessable(
        'Delivery destination coordinates are missing or invalid.',
        'INVALID_COORDINATES',
        { entity: 'location', locationId },
      )
    }

    const distanceKm = straightLineKm(storeCoords, locationCoords)

    const feeResult = calculateTierDeliveryFee(distanceKm)
    if (!feeResult.ok) {
      if (feeResult.reason === 'INVALID_DISTANCE') {
        throw ApiError.unprocessable(
          "We couldn't work out the distance for that drop point. Please re-pick your location.",
          'INVALID_DISTANCE',
          { distanceKm },
        )
      }
      throw ApiError.unprocessable(
        'Delivery location is outside our 5 km service radius.',
        'MAX_DISTANCE_EXCEEDED',
        { distanceKm, maxKm: MAX_SERVICE_KM },
      )
    }

    // Return explicit straight-line estimate semantics
    res.status(200).json({
      storeId,
      locationId,
      distanceKm,
      distanceMethod: 'straight_line',
      routingProvider: 'straight_line_haversine',
      isEstimate: true,
      quoteType: 'single_store_straight_line_estimate',
      deliveryFee: feeResult.fee,
      feeLabel: feeResult.label,
      pricingVersion: PRICING_VERSION,
      disclaimer: 'Straight-line estimate only. Road/walking route distance will be calculated when routing service is enabled.',
    })
  } catch (err) {
    next(err)
  }
}

deliveryRouter.post('/api/v1/delivery/quote', handleQuote)
deliveryRouter.post('/delivery/quote', handleQuote)
