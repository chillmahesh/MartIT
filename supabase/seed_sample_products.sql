-- ==============================================================================
-- MartIT: Sample Product Catalogue Seed Script
-- ==============================================================================
-- Description: Inserts sample products for campus stores (Campus Mart, Night Canteen, Stationery Hub)
-- Schema target: public.categories, public.stores, public.products
-- Execution: Run in Supabase SQL Editor to seed the remote production/staging database.
-- Idempotent: Uses ON CONFLICT (id) DO UPDATE/NOTHING to prevent duplicate record errors.
-- ==============================================================================

-- 1. Ensure Categories Exist
INSERT INTO categories (id, name, icon, sort_order)
VALUES
  ('fruits', 'Fruits & vegetables', 'Apple', 1),
  ('dairy', 'Milk, eggs & bread', 'MilkCarton', 2),
  ('bakery', 'Bakery & breakfast', 'BreadLoaf', 3),
  ('instant', 'Instant meals', 'NoodleCup', 4),
  ('drinks', 'Cold drinks & juices', 'SodaCan', 5),
  ('personal', 'Personal care', 'SoapBottle', 6),
  ('household', 'Cleaning & household', 'SprayBottle', 7),
  ('stationery', 'Stationery', 'Notebook', 8)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order;

-- 2. Ensure Sample Stores Exist
INSERT INTO stores (id, name, description, latitude, longitude, is_open)
VALUES
  ('store_campus_mart', 'Campus Mart', 'Main campus grocery and daily needs store', 12.970000, 77.590000, TRUE),
  ('store_night_canteen', 'Night Canteen & Snacks', 'Late-night snacks, instant food, and beverages', 12.972000, 77.591000, TRUE),
  ('store_stationery_hub', 'Campus Stationery Hub', 'Academic stationery and supplies', 12.981000, 77.590000, FALSE)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  latitude = EXCLUDED.latitude,
  longitude = EXCLUDED.longitude,
  is_open = EXCLUDED.is_open;

-- 3. Insert / Update Sample Products
INSERT INTO products (id, store_id, category_id, name, pack, price, mrp, stock, is_available)
VALUES
  -- Existing Initial Products
  ('p_milk_500', 'store_campus_mart', 'dairy', 'Toned Milk', '500 ml', 28.00, 28.00, 40, TRUE),
  ('p_eggs', 'store_campus_mart', 'dairy', 'Farm Fresh Eggs', '6 pcs', 52.00, 58.00, 20, TRUE),
  ('p_bread', 'store_campus_mart', 'bakery', 'Whole Wheat Bread', '400 g', 45.00, 50.00, 12, TRUE),
  ('p_maggi', 'store_campus_mart', 'instant', 'Instant Noodles', '4 × 70 g', 56.00, 60.00, 0, TRUE),
  ('p_banana', 'store_campus_mart', 'fruits', 'Bananas', '6 pcs', 42.00, 48.00, 25, TRUE),
  ('p_apple', 'store_campus_mart', 'fruits', 'Royal Gala Apples', '4 pcs', 95.00, 110.00, 15, TRUE),
  ('p_soda', 'store_campus_mart', 'drinks', 'Lime Sparkling Soda', '330 ml', 35.00, 40.00, 30, TRUE),
  ('p_soap', 'store_campus_mart', 'personal', 'Gentle Handwash', '250 ml', 85.00, 99.00, 18, TRUE),
  ('p_spray', 'store_campus_mart', 'household', 'Surface Cleaner Spray', '500 ml', 115.00, 130.00, 8, TRUE),
  ('p_notebook', 'store_campus_mart', 'stationery', 'Ruled Spiral Notebook', '160 pgs', 60.00, 65.00, 35, TRUE),

  -- 10 New Sample Products: Snacks, Beverages, Instant, Stationery, Daily Essentials
  ('p_cup_noodles_veg', 'store_campus_mart', 'instant', 'Veg Masala Cup Noodles', '70 g', 45.00, 50.00, 30, TRUE),
  ('p_potato_chips', 'store_campus_mart', 'instant', 'Classic Salted Potato Chips', '52 g', 20.00, 20.00, 50, TRUE),
  ('p_mango_juice', 'store_campus_mart', 'drinks', 'Mango Fruit Drink', '250 ml', 20.00, 20.00, 35, TRUE),
  ('p_butter_cookies', 'store_campus_mart', 'bakery', 'Butter Cashew Cookies', '150 g', 35.00, 40.00, 20, TRUE),
  ('p_ballpen_pack', 'store_campus_mart', 'stationery', 'Blue Gel Pen Set', '5 pcs', 50.00, 60.00, 40, TRUE),
  ('p_sticky_notes', 'store_campus_mart', 'stationery', 'Neon Sticky Notes Cube', '300 sheets', 55.00, 65.00, 22, TRUE),
  ('p_toothpaste', 'store_campus_mart', 'personal', 'Fresh Mint Toothpaste', '150 g', 75.00, 85.00, 25, TRUE),
  ('p_pocket_tissues', 'store_campus_mart', 'household', 'Pocket Tissues 3-Ply', '4 × 10 pulls', 30.00, 35.00, 30, TRUE),

  -- Night Canteen & Stationery Hub
  ('p_nc_maggi', 'store_night_canteen', 'instant', 'Cheese Masala Noodles', '2 × 70 g', 65.00, 70.00, 24, TRUE),
  ('p_nc_soda', 'store_night_canteen', 'drinks', 'Chilled Soda Can', '330 ml', 40.00, 40.00, 40, TRUE),
  ('p_nc_bread', 'store_night_canteen', 'bakery', 'Garlic Toast Slices', '250 g', 55.00, 60.00, 10, TRUE),
  ('p_cold_coffee', 'store_night_canteen', 'drinks', 'Classic Cold Coffee Can', '240 ml', 45.00, 50.00, 25, TRUE),
  ('p_nc_paneer_roll', 'store_night_canteen', 'instant', 'Hot Paneer Kathi Roll', '1 pc', 80.00, 80.00, 15, TRUE),
  ('p_stat_notebook', 'store_stationery_hub', 'stationery', 'Hardcover Lab Notebook', '200 pgs', 85.00, 95.00, 20, TRUE)
ON CONFLICT (id) DO UPDATE SET
  store_id = EXCLUDED.store_id,
  category_id = EXCLUDED.category_id,
  name = EXCLUDED.name,
  pack = EXCLUDED.pack,
  price = EXCLUDED.price,
  mrp = EXCLUDED.mrp,
  stock = EXCLUDED.stock,
  is_available = EXCLUDED.is_available,
  updated_at = NOW();
