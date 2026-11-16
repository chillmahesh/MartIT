const fs = require('fs');
const path = require('path');

const items = [
  { id: 'p_milk_500', url: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTrmwW2kEjdOkp3AZ3PoG7wvlotU833m-fJyXd9b1eIhg&s' },
  { id: 'p_eggs', url: 'https://m.media-amazon.com/images/I/613BcgUE6cL.jpg' },
  { id: 'p_bread', url: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTnGLVNzwXUS1zr_Gz_MXiqWD5l7S05mTnqsglfGFht_c7nVsfvbR5_wNE&s=10' },
  { id: 'p_maggi', url: 'https://m.media-amazon.com/images/I/818+KxkfbyL._AC_UF894,1000_QL80_.jpg' },
  { id: 'p_banana', url: 'https://cdn2.clevup.in/508930/SKU-0238_0-1778442363252.jpg?format=webp' },
  { id: 'p_apple', url: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQxWi7IPz76F3X3tD2412cOBSeTPgY9Yp8f-eA6cl3eaYwmyhk6_TXalkUO&s=10' },
  { id: 'p_soda', url: 'https://gandhifood.com/cdn/shop/products/46b798_abba4908981c4f3087559147758981e0_mv2.jpg?v=1609651577' },
  { id: 'p_soap', url: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRCRvGQz6TRygDXXCyNISxxF0U0cLvu0ZPVZvYVYlUYLarwwXmcMkmxcpJD&s=10' },
  { id: 'p_spray', url: 'https://images.meesho.com/images/products/1008729287/leczb_512.webp?width=512' },
  { id: 'p_notebook', url: 'https://instamart-media-assets.swiggy.com/swiggy/image/upload/fl_lossy,f_auto,q_auto/NI_CATALOG/IMAGES/ciw/2026/2/24/f1010a70-1a7b-4303-940a-a3d3f7229352_W0IFURPANL_MN_23022026.png' },
  { id: 'p_cup_noodles_veg', url: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTjk_w6jHX7IASqUxrA-f14LOVg_Ehwh7zFfm_8EJ--n_nnj5xIdk4cPYY&s=10' },
  { id: 'p_potato_chips', url: 'https://m.media-amazon.com/images/I/61FXwBMClcL.jpg' },
  { id: 'p_mango_juice', url: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRoZZTFDhXpnl7bz8i1d0WCZ4Q4vT1fHbTtxQtG_-hR5agK-fgyXBaRMH4m&s=10' },
  // Items 14-18
  { id: 'p_butter_cookies', url: 'https://www.quickpantry.in/cdn/shop/products/britannia-good-day-butter-cookies-150-g-quick-pantry.jpg?v=1710538215' },
  { id: 'p_ballpen_pack', url: 'https://www.starquik.com/cdn/shop/files/SQ154799_1_358990e7-4172-42a4-bdc4-abe38d3dd1e7.jpg?v=1785496002&width=533' },
  { id: 'p_sticky_notes', url: 'https://images-na.ssl-images-amazon.com/images/I/71YvRgrX2HL._SL1500_.jpg' },
  { id: 'p_toothpaste', url: 'https://m.media-amazon.com/images/I/51d-qewW7HL.jpg' },
  { id: 'p_pocket_tissues', url: 'https://m.media-amazon.com/images/I/71v4oofzPhL.jpg' },
  // Night Canteen
  { id: 'p_cold_coffee', url: 'https://rukminim2.flixcart.com/image/480/640/xif0q/milk/t/4/g/-original-imahrzjffgyb4zzk.jpeg?q=90' }
];

async function downloadAll() {
  const targetDir = path.resolve(__dirname, '../public/products');
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  for (const item of items) {
    try {
      console.log(`Downloading ${item.id}...`);
      const res = await fetch(item.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
        }
      });
      if (!res.ok) {
        console.error(`Failed ${item.id}: status ${res.status}`);
        continue;
      }
      const buffer = Buffer.from(await res.arrayBuffer());
      const contentType = res.headers.get('content-type') || '';
      let ext = '.jpg';
      if (contentType.includes('webp') || item.url.includes('format=webp') || item.url.endsWith('.webp')) ext = '.webp';
      else if (contentType.includes('png') || item.url.endsWith('.png')) ext = '.png';
      else if (contentType.includes('jpeg') || contentType.includes('jpg')) ext = '.jpg';

      const filePath = path.join(targetDir, `${item.id}${ext}`);
      fs.writeFileSync(filePath, buffer);
      console.log(`Saved ${item.id}${ext} (${buffer.length} bytes)`);
    } catch (err) {
      console.error(`Error downloading ${item.id}:`, err.message);
    }
  }
}

downloadAll();
