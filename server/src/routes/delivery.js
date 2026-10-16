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

// Haversine straight-line distance in km (strictly labeled as straight-line estimate)
function calculateHaversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371 // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

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

    const distanceKm = calculateHaversineKm(
      Number(store.latitude),
      Number(store.longitude),
      Number(location.latitude),
      Number(location.longitude),
    )

    const feeResult = calculateTierDeliveryFee(distanceKm)
    if (!feeResult.ok) {
      throw ApiError.unprocessable(
        'Delivery location is outside our 5 km service radius.',
        'MAX_DISTANCE_EXCEEDED',
        { distanceKm, maxKm: 5 },
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
