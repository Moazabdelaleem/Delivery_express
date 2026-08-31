const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const db = require('../config/db');

async function cleanupExtraDrivers() {
  console.log('🧹 Cleaning up extra delivery driver accounts...');
  try {
    // 1. Get original Sami Driver
    const samiRes = await db.query("SELECT id, username, name FROM users WHERE role = 'delivery_guy' AND username = 'sami_delivery' LIMIT 1");
    let samiId;
    if (!samiRes.rows.length) {
      console.log('⚠️ Original sami_delivery account not found. Creating it...');
      const bcrypt = require('bcryptjs');
      const hash = await bcrypt.hash('Admin123!', 10);
      const newSami = await db.query(
        `INSERT INTO users (username, name, password_hash, role, is_approved)
         VALUES ('sami_delivery', 'Sami Driver', $1, 'delivery_guy', true)
         RETURNING *`,
        [hash]
      );
      samiId = newSami.rows[0].id;
    } else {
      samiId = samiRes.rows[0].id;
      console.log(`  ✓ Found original driver: ${samiRes.rows[0].name} (@${samiRes.rows[0].username}) [ID: ${samiId}]`);
    }

    // 2. Re-assign any existing orders from extra drivers to Sami
    await db.query(`UPDATE orders SET delivery_guy_id = $1 WHERE delivery_guy_id != $1;`, [samiId]);

    // 3. Get list of extra driver IDs to remove
    const extraDrivers = await db.query(
      `SELECT id, username, name FROM users WHERE role = 'delivery_guy' AND id != $1;`,
      [samiId]
    );

    if (extraDrivers.rows.length === 0) {
      console.log('  ✓ No extra drivers found. Only sami_delivery exists.');
    } else {
      console.log(`  ✓ Removing ${extraDrivers.rows.length} extra driver account(s):`);
      extraDrivers.rows.forEach(d => console.log(`     • Removing @${d.username} (${d.name})`));

      const extraIds = extraDrivers.rows.map(d => d.id);

      // Delete associated wallet & shift logs for extra drivers
      await db.query(`DELETE FROM wallet_transactions WHERE delivery_guy_id = ANY($1);`, [extraIds]);
      await db.query(`DELETE FROM collection_wallets WHERE delivery_guy_id = ANY($1);`, [extraIds]);
      await db.query(`DELETE FROM pocket_wallets WHERE delivery_guy_id = ANY($1);`, [extraIds]);
      await db.query(`DELETE FROM driver_shifts WHERE delivery_guy_id = ANY($1);`, [extraIds]);

      // Delete extra driver users
      await db.query(`DELETE FROM users WHERE id = ANY($1);`, [extraIds]);
      console.log('  ✓ Successfully deleted extra driver accounts and associated wallet records.');
    }

    // 4. Ensure Sami has clean collection and pocket wallets initialized
    await db.query(
      `INSERT INTO collection_wallets (delivery_guy_id, current_balance)
       VALUES ($1, 0.00)
       ON CONFLICT (delivery_guy_id) DO UPDATE SET current_balance = 0.00;`,
      [samiId]
    );
    await db.query(
      `INSERT INTO pocket_wallets (delivery_guy_id, current_balance, total_topped_up, total_spent)
       VALUES ($1, 50.00, 50.00, 0.00)
       ON CONFLICT (delivery_guy_id) DO UPDATE SET current_balance = 50.00, total_topped_up = 50.00, total_spent = 0.00;`,
      [samiId]
    );

    // Verify remaining drivers
    const remainingRes = await db.query("SELECT username, name, role FROM users WHERE role = 'delivery_guy';");
    console.log('\n======================================================================');
    console.log(`✨ DRIVER CLEANUP COMPLETE: Only ${remainingRes.rows.length} driver remains:`);
    remainingRes.rows.forEach(u => console.log(`   • ${u.name} (@${u.username})`));
    console.log('======================================================================');
  } catch (err) {
    console.error('❌ Error during driver cleanup:', err);
  } finally {
    process.exit(0);
  }
}

cleanupExtraDrivers();
