async function testLargePhotoUpload() {
  console.log('Testing large photo upload to backend...');
  const API_URL = 'http://localhost:5000/api';

  // 1. Login as driver
  const loginRes = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'sami_delivery', password: 'Admin123!' })
  });
  const loginData = await loginRes.json();
  const token = loginData.token;

  // 2. Create order as supervisor
  const supLogin = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'kareem_supervisor', password: 'Admin123!' })
  });
  const supData = await supLogin.json();

  const orderRes = await fetch(`${API_URL}/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${supData.token}` },
    body: JSON.stringify({
      tracking_number: `LARGE-PHOTO-${Date.now()}`,
      client_address: '100 Main St, Cairo',
      order_amount: 150.00,
      payment_type: 'pay_after_delivery',
      delivery_guy_id: loginData.user.id
    })
  });
  const orderData = await orderRes.json();
  const orderId = orderData.order.id;

  // 3. Generate a 2MB dummy base64 string simulating high-res phone camera shot
  const largeBase64 = 'data:image/jpeg;base64,' + 'A'.repeat(2 * 1024 * 1024);

  console.log(`Sending ${largeBase64.length} bytes photo attachment to order ${orderId}...`);
  const photoRes = await fetch(`${API_URL}/orders/${orderId}/attachments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      stage: 'customer_delivery',
      image: largeBase64,
      is_required: true
    })
  });

  const photoData = await photoRes.json();
  if (photoRes.ok) {
    console.log('SUCCESS! Large photo uploaded and attached without payload limit errors:', photoData.attachment.id);
  } else {
    console.error('FAILED!', photoData);
    process.exit(1);
  }
}

testLargePhotoUpload();
