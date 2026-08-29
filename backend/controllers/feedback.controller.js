const db = require('../config/db');
const { uploadToStorage } = require('../config/storage');

// Submit Customer Voice Feedback (POST /api/orders/:id/feedback)
exports.submitOrderFeedback = async (req, res) => {
  try {
    const { id: order_id } = req.params;
    const { audio, duration_seconds } = req.body;

    if (!audio) {
      return res.status(400).json({ error: 'Audio recording payload is required.' });
    }

    const orderRes = await db.query('SELECT id FROM orders WHERE id = $1', [order_id]);
    if (orderRes.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found.' });
    }

    const duration = parseInt(duration_seconds, 10) || 0;

    // Upload audio recording to storage bucket
    const audioStorageUrl = await uploadToStorage(audio, `feedback-${order_id}`);

    // Insert row into order_feedback table
    const insertRes = await db.query(
      `INSERT INTO order_feedback (order_id, audio_storage_url, duration_seconds, recorded_by, transcription)
       VALUES ($1, $2, $3, $4, NULL)
       RETURNING *`,
      [
        order_id,
        audioStorageUrl,
        duration,
        req.user.id
      ]
    );

    const feedback = insertRes.rows[0];

    // Emit Socket.io event for real-time customer service / supervisor feedback playback
    const io = req.app.get('io');
    if (io) {
      io.emit('customer_feedback_submitted', {
        order_id,
        feedback_id: feedback.id,
        recorded_by: req.user.id,
        duration_seconds: duration,
        audio_storage_url: audioStorageUrl
      });
    }

    res.status(201).json({
      message: 'Customer voice feedback submitted successfully',
      feedback
    });
  } catch (err) {
    console.error('Error submitting customer feedback:', err);
    res.status(500).json({ error: err.message || 'Server error submitting customer voice feedback.' });
  }
};

// Get Customer Voice Feedback for Order (GET /api/orders/:id/feedback)
exports.getOrderFeedback = async (req, res) => {
  try {
    const { id: order_id } = req.params;

    const result = await db.query(
      `SELECT f.*, u.name as recorded_by_name, u.role as recorded_by_role
       FROM order_feedback f
       JOIN users u ON f.recorded_by = u.id
       WHERE f.order_id = $1
       ORDER BY f.created_at DESC`,
      [order_id]
    );

    res.json({ feedback: result.rows });
  } catch (err) {
    console.error('Error fetching customer feedback:', err);
    res.status(500).json({ error: err.message || 'Server error fetching customer voice feedback.' });
  }
};
