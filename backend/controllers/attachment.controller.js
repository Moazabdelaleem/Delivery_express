const db = require('../config/db');
const { uploadToStorage } = require('../config/storage');

const VALID_STAGES = [
  'inventory_handoff',
  'customer_delivery',
  'third_party_order',
  'payment_confirmation',
  'return_verification'
];

// Generic Upload Attachment (POST /api/orders/:id/attachments)
exports.uploadAttachment = async (req, res) => {
  try {
    const { id: order_id } = req.params;
    const { stage, image, is_required } = req.body;

    if (!stage || !VALID_STAGES.includes(stage)) {
      return res.status(400).json({
        error: `Invalid attachment stage '${stage}'. Must be one of: ${VALID_STAGES.join(', ')}`
      });
    }

    if (!image) {
      return res.status(400).json({ error: 'Image data or URL is required.' });
    }

    const orderRes = await db.query('SELECT id FROM orders WHERE id = $1', [order_id]);
    if (orderRes.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found.' });
    }

    // Upload to Storage
    const storageUrl = await uploadToStorage(image, `order-${order_id}-${stage}`);

    // Insert row into order_attachments
    const insertRes = await db.query(
      `INSERT INTO order_attachments (order_id, stage, uploaded_by, is_required, storage_url)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        order_id,
        stage,
        req.user.id,
        Boolean(is_required),
        storageUrl
      ]
    );

    const attachment = insertRes.rows[0];

    // Log in order_status_history
    await db.query(
      `INSERT INTO order_status_history (order_id, old_status, new_status, changed_by, comment)
       VALUES ($1, (SELECT status FROM orders WHERE id = $1), (SELECT status FROM orders WHERE id = $1), $2, $3)`,
      [order_id, req.user.id, `Photo attachment uploaded for stage '${stage}'`]
    );

    res.status(201).json({
      message: 'Attachment uploaded successfully',
      attachment
    });
  } catch (err) {
    console.error('Error uploading attachment:', err);
    res.status(500).json({ error: err.message || 'Server error uploading attachment.' });
  }
};

// Generic Fetch Attachments for Order (GET /api/orders/:id/attachments)
exports.getOrderAttachments = async (req, res) => {
  try {
    const { id: order_id } = req.params;
    const { stage } = req.query;

    let queryStr = `
      SELECT a.*, u.name as uploaded_by_name, u.role as uploaded_by_role
      FROM order_attachments a
      JOIN users u ON a.uploaded_by = u.id
      WHERE a.order_id = $1
    `;

    const queryParams = [order_id];
    if (stage) {
      queryStr += ' AND a.stage = $2';
      queryParams.push(stage);
    }

    queryStr += ' ORDER BY a.created_at DESC';

    const result = await db.query(queryStr, queryParams);
    res.json({ attachments: result.rows });
  } catch (err) {
    console.error('Error fetching attachments:', err);
    res.status(500).json({ error: err.message || 'Server error fetching attachments.' });
  }
};
