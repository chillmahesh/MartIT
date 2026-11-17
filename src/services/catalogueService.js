import { request } from './api'

export const catalogueService = {
  /**
   * List all products, optionally filtered by store.
   * In-browser mock filters in memory; real backend delegates to GET/POST /catalogue/products.
   */
  listProducts: (storeId) => request('catalogue.products', { storeId }),

  /**
   * List available campus stores and their open/closed statuses.
   */
  listStores: () => request('stores.list'),

  /**
   * List available product categories.
   */
  listCategories: () => request('catalogue.categories'),

  /**
   * Update product stock or availability.
   */
  updateProduct: (productId, updates) => request('catalogue.products.update', { productId, ...updates }),
}
