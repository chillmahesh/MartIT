/**
 * Canonical mapping of product IDs to local static image paths in `/products/`.
 * Serves as a reliable, zero-latency fallback when backend database records have NULL `image_url`
 * or while database backfill migrations are pending application.
 */
export const STATIC_PRODUCT_IMAGE_MAP = {
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

/**
 * Resolves the image URL for a product item.
 * Prioritizes `product.imageUrl` if supplied by the backend;
 * falls back to the static repository asset in `/products/` if `imageUrl` is null or empty.
 *
 * @param {object|null|undefined} product
 * @returns {string|null}
 */
export function resolveProductImageUrl(product) {
  if (!product) return null
  return product.imageUrl || STATIC_PRODUCT_IMAGE_MAP[product.id] || null
}
