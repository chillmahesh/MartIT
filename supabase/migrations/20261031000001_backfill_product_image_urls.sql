-- Migration: 20261031000001_backfill_product_image_urls.sql
-- Description: Backfill product image_url column with real static asset paths for all catalogue products.
-- Target Database: Supabase PostgreSQL (15+)
-- Safety: Non-destructive, idempotent UPDATE ONLY (no deletions or schema alterations).

UPDATE public.products AS p
SET 
  image_url = v.image_url,
  updated_at = NOW()
FROM (
  VALUES
    ('p_milk_500', '/products/p_milk_500.png'),
    ('p_eggs', '/products/p_eggs.jpg'),
    ('p_bread', '/products/p_bread.jpg'),
    ('p_maggi', '/products/p_maggi.jpg'),
    ('p_banana', '/products/p_banana.webp'),
    ('p_apple', '/products/p_apple.jpg'),
    ('p_soda', '/products/p_soda.webp'),
    ('p_soap', '/products/p_soap.jpg'),
    ('p_spray', '/products/p_spray.webp'),
    ('p_notebook', '/products/p_notebook.png'),
    ('p_cup_noodles_veg', '/products/p_cup_noodles_veg.jpg'),
    ('p_potato_chips', '/products/p_potato_chips.jpg'),
    ('p_mango_juice', '/products/p_mango_juice.jpg'),
    ('p_butter_cookies', '/products/p_butter_cookies.webp'),
    ('p_ballpen_pack', '/products/p_ballpen_pack.jpg'),
    ('p_sticky_notes', '/products/p_sticky_notes.jpg'),
    ('p_toothpaste', '/products/p_toothpaste.jpg'),
    ('p_pocket_tissues', '/products/p_pocket_tissues.jpg'),
    ('p_nc_maggi', '/products/p_nc_maggi.jpg'),
    ('p_nc_soda', '/products/p_nc_soda.webp'),
    ('p_nc_bread', '/products/p_nc_bread.jpg'),
    ('p_cold_coffee', '/products/p_cold_coffee.webp'),
    ('p_nc_paneer_roll', '/products/p_nc_paneer_roll.png'),
    ('p_stat_notebook', '/products/p_stat_notebook.png')
) AS v(id, image_url)
WHERE p.id = v.id;
