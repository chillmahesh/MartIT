-- Supabase Seed Data: MartIT Campus Data
-- Can be applied in development or staging environments:
-- psql $DATABASE_URL -f supabase/seed.sql

-- ============================================================================
-- 1. CATEGORIES
-- ============================================================================

INSERT INTO categories (id, name, icon, sort_order) VALUES
  ('fruits', 'Fruits & vegetables', 'Apple', 1),
  ('dairy', 'Milk, eggs & bread', 'MilkCarton', 2),
  ('bakery', 'Bakery & breakfast', 'BreadLoaf', 3),
  ('instant', 'Instant meals', 'NoodleCup', 4),
  ('drinks', 'Cold drinks & juices', 'SodaCan', 5),
  ('personal', 'Personal care', 'SoapBottle', 6),
  ('household', 'Cleaning & household', 'SprayBottle', 7),
  ('stationery', 'Stationery', 'Notebook', 8)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 2. CAMPUS DELIVERY LOCATIONS
-- ============================================================================

INSERT INTO locations (id, name, group_name, latitude, longitude, is_active) VALUES
  ('loc_hostel_a', 'Hostel A, Block 1', 'Hostels', 12.973300, 77.590000, true),
  ('loc_hostel_b', 'Hostel B, Block 3', 'Hostels', 12.977200, 77.590000, true),
  ('loc_library', 'Central Library', 'Academic', 12.985000, 77.590000, true),
  ('loc_faculty', 'Faculty Quarters', 'Residential', 12.995000, 77.590000, true),
  ('loc_far_gate', 'North Gate PG', 'Off-campus', 13.007000, 77.590000, true),
  ('loc_outside', 'City PG (outside area)', 'Off-campus', 13.020000, 77.590000, true)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 3. PARTICIPATING STORES
-- ============================================================================

INSERT INTO stores (id, name, description, latitude, longitude, is_open) VALUES
  ('store_campus_mart', 'Campus Mart (sample store)', 'Primary campus grocery and essentials store', 12.970000, 77.590000, true),
  ('store_night_canteen', 'Night Canteen & Snacks', 'Late night beverages, snacks and packaged food', 12.972000, 77.591000, true),
  ('store_stationery_hub', 'Campus Stationery Hub', 'Academic stationery, books and supplies', 12.981000, 77.590000, false)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 4. PRODUCTS & INVENTORY
-- ============================================================================

INSERT INTO products (id, store_id, category_id, name, pack, price, mrp, stock, is_available, image_url) VALUES
  ('p_milk_500', 'store_campus_mart', 'dairy', 'Toned Milk', '500 ml', 28.00, 28.00, 40, true, '/products/p_milk_500.png'),
  ('p_eggs', 'store_campus_mart', 'dairy', 'Farm Fresh Eggs', '6 pcs', 52.00, 58.00, 20, true, '/products/p_eggs.jpg'),
  ('p_bread', 'store_campus_mart', 'bakery', 'Whole Wheat Bread', '400 g', 45.00, 50.00, 12, true, '/products/p_bread.jpg'),
  ('p_maggi', 'store_campus_mart', 'instant', 'Instant Noodles', '4 × 70 g', 56.00, 60.00, 0, false, '/products/p_maggi.jpg'),
  ('p_banana', 'store_campus_mart', 'fruits', 'Bananas', '6 pcs', 42.00, 48.00, 25, true, '/products/p_banana.webp'),
  ('p_apple', 'store_campus_mart', 'fruits', 'Royal Gala Apples', '4 pcs', 95.00, 110.00, 15, true, '/products/p_apple.jpg'),
  ('p_soda', 'store_campus_mart', 'drinks', 'Lime Sparkling Soda', '330 ml', 35.00, 40.00, 30, true, '/products/p_soda.webp'),
  ('p_soap', 'store_campus_mart', 'personal', 'Gentle Handwash', '250 ml', 85.00, 99.00, 18, true, '/products/p_soap.jpg'),
  ('p_spray', 'store_campus_mart', 'household', 'Surface Cleaner Spray', '500 ml', 115.00, 130.00, 8, true, '/products/p_spray.webp'),
  ('p_notebook', 'store_campus_mart', 'stationery', 'Ruled Spiral Notebook', '160 pgs', 60.00, 65.00, 35, true, '/products/p_notebook.png'),
  ('p_nc_maggi', 'store_night_canteen', 'instant', 'Cheese Masala Noodles', '2 × 70 g', 65.00, 70.00, 24, true, '/products/p_nc_maggi.jpg'),
  ('p_nc_soda', 'store_night_canteen', 'drinks', 'Chilled Soda Can', '330 ml', 40.00, 40.00, 40, true, '/products/p_nc_soda.webp'),
  ('p_nc_bread', 'store_night_canteen', 'bakery', 'Garlic Toast Slices', '250 g', 55.00, 60.00, 10, true, '/products/p_nc_bread.jpg'),
  ('p_stat_notebook', 'store_stationery_hub', 'stationery', 'Hardcover Lab Notebook', '200 pgs', 85.00, 95.00, 20, true, '/products/p_stat_notebook.png')
ON CONFLICT (id) DO NOTHING;
