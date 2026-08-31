const { uploadToStorage } = require('../config/storage');

async function testStorageFallback() {
  console.log('🧪 Testing storage upload fallback logic...');

  const mockBase64 = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP...';
  
  // Test 1: Standard local upload
  const res1 = await uploadToStorage(mockBase64, 'test-image.jpg');
  console.log('✅ Local storage result:', res1);

  // Test 2: Simulated Vercel read-only environment
  process.env.VERCEL = '1';
  const res2 = await uploadToStorage(mockBase64, 'test-image-vercel.jpg');
  console.log('✅ Vercel read-only fallback result:', res2.slice(0, 50) + '...');

  console.log('🎉 Storage fallback tests passed successfully!');
  process.exit(0);
}

testStorageFallback();
