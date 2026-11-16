import { Router } from 'express'
import { z } from 'zod'
import { getSupabaseAdmin } from '../config/supabase.js'
import { authenticate } from '../middleware/auth.js'
import { ApiError } from '../utils/errors.js'
import { ROLES } from '../utils/permissions.js'

export const catalogueRouter = Router()

const STATIC_PRODUCT_IMAGE_MAP = {
  p_milk_500: '/products/p_milk_500.png',
  p_eggs: '/products/p_eggs.jpg',
  p_bread: '/products/p_bread.jpg',
  p_maggi: '/products/p_maggi.jpg',
  p_banana: '/products/p_banana.webp',
  p_apple: '/products/p_apple.jpg',
  p_soda: '/products/p_soda.webp',
  p_soap: '/products/p_soap.jpg',
  p_spray: '/products/p_spray.webp',
  p_notebook: '/products/p_notebook.png',
  p_cup_noodles_veg: '/products/p_cup_noodles_veg.jpg',
  p_potato_chips: '/products/p_potato_chips.jpg',
  p_mango_juice: '/products/p_mango_juice.jpg',
  p_butter_cookies: '/products/p_butter_cookies.webp',
  p_ballpen_pack: '/products/p_ballpen_pack.jpg',
  p_sticky_notes: '/products/p_sticky_notes.jpg',
  p_toothpaste: '/products/p_toothpaste.jpg',
  p_pocket_tissues: '/products/p_pocket_tissues.jpg',
  p_nc_maggi: '/products/p_nc_maggi.jpg',
  p_nc_soda: '/products/p_nc_soda.webp',
  p_nc_bread: '/products/p_nc_bread.jpg',
  p_cold_coffee: '/products/p_cold_coffee.webp',
  p_nc_paneer_roll: '/products/p_nc_paneer_roll.png',
  p_stat_notebook: '/products/p_stat_notebook.png',
}

async function handleProducts(req, res, next) {
  try {
    const storeId = req.query.storeId || req.body?.storeId
    const includeUnavailable =
      req.query.includeUnavailable === 'true' || req.body?.includeUnavailable === true
    const supabase = getSupabaseAdmin()

    let query = supabase
      .from('products')
      .select('id, store_id, category_id, name, pack, price, mrp, stock, is_available, image_url')

    if (!includeUnavailable) {
      query = query.eq('is_available', true)
    }

    if (storeId) {
      query = query.eq('store_id', storeId)
    }

    const { data: products, error } = await query

    if (error) {
      throw ApiError.internal('Failed to load catalogue products.')
    }

    // Map to camelCase compatible with frontend catalogue expectations
    const formatted = (products || []).map((p) => ({
      id: p.id,
      storeId: p.store_id,
      categoryId: p.category_id,
      name: p.name,
      pack: p.pack,
      price: Number(p.price),
      mrp: Number(p.mrp),
      stock: p.stock,
      isAvailable: p.is_available,
      imageUrl: p.image_url || STATIC_PRODUCT_IMAGE_MAP[p.id] || null,
    }))

    res.status(200).json(formatted)
  } catch (err) {
    next(err)
  }
}

const updateProductSchema = z.object({
  stock: z.number().int().min(0).optional(),
  isAvailable: z.boolean().optional(),
})

async function handleUpdateProduct(req, res, next) {
  try {
    const productId = req.params?.id || req.body?.productId
    if (!productId) {
      throw ApiError.badRequest('Product ID is required.', 'INVALID_PRODUCT_ID')
    }

    const updates = updateProductSchema.parse(req.body)
    const supabase = getSupabaseAdmin()

    // 1. Fetch product to verify store ownership
    const { data: product, error: fetchErr } = await supabase
      .from('products')
      .select('id, store_id, name, stock, is_available')
      .eq('id', productId)
      .maybeSingle()

    if (fetchErr || !product) {
      throw ApiError.notFound('Product not found.', 'PRODUCT_NOT_FOUND')
    }

    // 2. Ownership verification: Must be store owner or admin
    const { data: store } = await supabase
      .from('stores')
      .select('owner_id')
      .eq('id', product.store_id)
      .maybeSingle()

    const isOwner = store && store.owner_id === req.user.id
    const hasStaffAccess =
      req.user.roles.includes(ROLES.ADMIN) ||
      req.user.roles.includes(ROLES.SUPER_ADMIN)

    if (!isOwner && !hasStaffAccess) {
      throw ApiError.forbidden("You don't have permission to update this product.")
    }

    const payload = {}
    if (updates.stock !== undefined) payload.stock = updates.stock
    if (updates.isAvailable !== undefined) payload.is_available = updates.isAvailable
    payload.updated_at = new Date().toISOString()

    const { error: updateErr } = await supabase
      .from('products')
      .update(payload)
      .eq('id', productId)

    if (updateErr) {
      throw ApiError.internal('Failed to update product.')
    }

    res.status(200).json({
      id: productId,
      storeId: product.store_id,
      name: product.name,
      stock: updates.stock !== undefined ? updates.stock : product.stock,
      isAvailable: updates.isAvailable !== undefined ? updates.isAvailable : product.is_available,
      message: 'Product updated successfully.',
    })
  } catch (err) {
    next(err)
  }
}

async function handleCategories(req, res, next) {
  try {
    const supabase = getSupabaseAdmin()
    const { data: categories, error } = await supabase
      .from('categories')
      .select('id, name, icon, sort_order')
      .order('sort_order', { ascending: true })

    if (error) {
      throw ApiError.internal('Failed to load catalogue categories.')
    }

    res.status(200).json(categories || [])
  } catch (err) {
    next(err)
  }
}

// Products endpoints
catalogueRouter.get('/api/v1/catalogue/products', handleProducts)
catalogueRouter.post('/catalogue/products', handleProducts)
catalogueRouter.patch('/api/v1/catalogue/products/:id', authenticate, handleUpdateProduct)
catalogueRouter.post('/catalogue/products/update', authenticate, handleUpdateProduct)

// Categories endpoints
catalogueRouter.get('/api/v1/catalogue/categories', handleCategories)
catalogueRouter.post('/catalogue/categories', handleCategories)
