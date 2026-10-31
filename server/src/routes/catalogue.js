import { Router } from 'express'
import { getSupabaseAdmin } from '../config/supabase.js'
import { ApiError } from '../utils/errors.js'

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
    const supabase = getSupabaseAdmin()

    let query = supabase
      .from('products')
      .select('id, store_id, category_id, name, pack, price, mrp, stock, is_available, image_url')
      .eq('is_available', true)

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

// Categories endpoints
catalogueRouter.get('/api/v1/catalogue/categories', handleCategories)
catalogueRouter.post('/catalogue/categories', handleCategories)
