import { Router } from 'express'
import { z } from 'zod'
import { getSupabaseAdmin } from '../config/supabase.js'
import { authenticate } from '../middleware/auth.js'
import { ApiError } from '../utils/errors.js'
import { ROLES } from '../utils/permissions.js'

export const storesRouter = Router()

async function handleStores(req, res, next) {
  try {
    const supabase = getSupabaseAdmin()
    const { data: stores, error } = await supabase
      .from('stores')
      .select('id, name, description, is_open, latitude, longitude')

    if (error) {
      throw ApiError.internal('Failed to load stores.')
    }

    const formatted = (stores || []).map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      isOpen: Boolean(s.is_open),
      coords: {
        lat: Number(s.latitude),
        lng: Number(s.longitude),
      },
    }))

    res.status(200).json(formatted)
  } catch (err) {
    next(err)
  }
}

async function handleLocations(req, res, next) {
  try {
    const supabase = getSupabaseAdmin()
    const { data: locations, error } = await supabase
      .from('locations')
      .select('id, name, group_name, latitude, longitude')
      .eq('is_active', true)

    if (error) {
      throw ApiError.internal('Failed to load campus locations.')
    }

    const formatted = (locations || []).map((l) => ({
      id: l.id,
      name: l.name,
      group: l.group_name,
      coords: {
        lat: Number(l.latitude),
        lng: Number(l.longitude),
      },
    }))

    res.status(200).json(formatted)
  } catch (err) {
    next(err)
  }
}

const updateStoreSchema = z.object({
  isOpen: z.boolean().optional(),
  description: z.string().max(500).optional(),
})

/**
 * Store update endpoint: strictly limited to the store owner or admin.
 */
async function handleUpdateStore(req, res, next) {
  try {
    const storeId = req.params?.id || req.body?.storeId
    if (!storeId) {
      throw ApiError.badRequest('Store ID is required.', 'INVALID_STORE_ID')
    }

    const updates = updateStoreSchema.parse(req.body)
    const supabase = getSupabaseAdmin()

    // 1. Fetch store to verify ownership
    const { data: store, error: fetchErr } = await supabase
      .from('stores')
      .select('id, name, description, is_open, owner_id')
      .eq('id', storeId)
      .maybeSingle()

    if (fetchErr || !store) {
      throw ApiError.notFound('Store not found.', 'STORE_NOT_FOUND')
    }

    // 2. Ownership verification: Must be the store's owner or an admin
    const isOwner = store.owner_id === req.user.id
    const hasStaffAccess =
      req.user.roles.includes(ROLES.ADMIN) ||
      req.user.roles.includes(ROLES.SUPER_ADMIN)

    if (!isOwner && !hasStaffAccess) {
      throw ApiError.forbidden("You don't have permission to update this store.")
    }

    const payload = {}
    if (updates.isOpen !== undefined) payload.is_open = updates.isOpen
    if (updates.description !== undefined) payload.description = updates.description
    payload.updated_at = new Date().toISOString()

    const { error: updateErr } = await supabase
      .from('stores')
      .update(payload)
      .eq('id', storeId)

    if (updateErr) {
      throw ApiError.internal('Failed to update store.')
    }

    res.status(200).json({
      id: storeId,
      name: store.name,
      description: updates.description !== undefined ? updates.description : store.description,
      isOpen: updates.isOpen !== undefined ? updates.isOpen : store.is_open,
      message: 'Store updated successfully.',
    })
  } catch (err) {
    next(err)
  }
}

// Stores endpoints
storesRouter.get('/api/v1/stores', handleStores)
storesRouter.post('/stores/list', handleStores)
storesRouter.patch('/api/v1/stores/:id', authenticate, handleUpdateStore)
storesRouter.post('/stores/update', authenticate, handleUpdateStore)

// Locations endpoints
storesRouter.get('/api/v1/locations', handleLocations)
storesRouter.post('/locations/list', handleLocations)
