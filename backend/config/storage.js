const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

const UPLOAD_DIR = process.env.VERCEL === '1'
  ? path.join(os.tmpdir(), 'order-attachments')
  : path.join(__dirname, '../public/uploads/order-attachments');

/**
 * Upload image payload (base64 data URL or buffer) to storage
 * @param {string|Buffer} imageInput - Base64 string or file buffer
 * @param {string} filename - Target filename
 * @returns {Promise<string>} Public image URL or Data URL
 */
async function uploadToStorage(imageInput, filename) {
  try {
    let buffer;
    let ext = '.jpg';
    let mimeType = 'image/jpeg';

    if (typeof imageInput === 'string') {
      if (imageInput.startsWith('data:image/png;base64,')) {
        ext = '.png';
        mimeType = 'image/png';
        buffer = Buffer.from(imageInput.replace(/^data:image\/png;base64,/, ''), 'base64');
      } else if (imageInput.startsWith('data:image/webp;base64,')) {
        ext = '.webp';
        mimeType = 'image/webp';
        buffer = Buffer.from(imageInput.replace(/^data:image\/webp;base64,/, ''), 'base64');
      } else if (imageInput.startsWith('data:image/jpeg;base64,') || imageInput.startsWith('data:image/jpg;base64,')) {
        ext = '.jpg';
        mimeType = 'image/jpeg';
        buffer = Buffer.from(imageInput.replace(/^data:image\/jpe?g;base64,/, ''), 'base64');
      } else if (imageInput.startsWith('data:audio/webm;base64,')) {
        ext = '.webm';
        mimeType = 'audio/webm';
        buffer = Buffer.from(imageInput.replace(/^data:audio\/webm;base64,/, ''), 'base64');
      } else if (imageInput.startsWith('data:audio/mp3;base64,') || imageInput.startsWith('data:audio/mpeg;base64,')) {
        ext = '.mp3';
        mimeType = 'audio/mp3';
        buffer = Buffer.from(imageInput.replace(/^data:audio\/(mp3|mpeg);base64,/, ''), 'base64');
      } else if (imageInput.startsWith('data:audio/wav;base64,')) {
        ext = '.wav';
        mimeType = 'audio/wav';
        buffer = Buffer.from(imageInput.replace(/^data:audio\/wav;base64,/, ''), 'base64');
      } else if (imageInput.startsWith('data:audio/m4a;base64,') || imageInput.startsWith('data:audio/mp4;base64,')) {
        ext = '.m4a';
        mimeType = 'audio/m4a';
        buffer = Buffer.from(imageInput.replace(/^data:audio\/(m4a|mp4);base64,/, ''), 'base64');
      } else if (imageInput.startsWith('http://') || imageInput.startsWith('https://')) {
        // Already a remote URL
        return imageInput;
      } else {
        // Plain base64
        buffer = Buffer.from(imageInput, 'base64');
      }
    } else {
      buffer = imageInput;
    }

    // On Vercel (read-only filesystem), return self-contained Data URL so attachments persist in PostgreSQL DB seamlessly
    if (process.env.VERCEL === '1') {
      if (typeof imageInput === 'string' && imageInput.startsWith('data:')) {
        return imageInput;
      }
      return `data:${mimeType};base64,${buffer.toString('base64')}`;
    }

    // Otherwise attempt to write to local disk, with automatic fallback to Data URL if filesystem is read-only
    try {
      if (!fs.existsSync(UPLOAD_DIR)) {
        fs.mkdirSync(UPLOAD_DIR, { recursive: true });
      }
      const safeFilename = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
      const filePath = path.join(UPLOAD_DIR, safeFilename);
      await fs.promises.writeFile(filePath, buffer);
      return `/uploads/order-attachments/${safeFilename}`;
    } catch (fsErr) {
      console.warn('⚠️ Local filesystem write failed (falling back to Data URL):', fsErr.message);
      if (typeof imageInput === 'string' && imageInput.startsWith('data:')) {
        return imageInput;
      }
      return `data:${mimeType};base64,${buffer.toString('base64')}`;
    }
  } catch (err) {
    console.error('Storage upload error:', err);
    throw new Error('Failed to save image attachment: ' + err.message);
  }
}

module.exports = {
  uploadToStorage,
  UPLOAD_DIR
};
