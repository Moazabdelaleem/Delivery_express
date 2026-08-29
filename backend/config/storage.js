const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const UPLOAD_DIR = path.join(__dirname, '../public/uploads/order-attachments');

// Ensure upload directory exists locally
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

/**
 * Upload image payload (base64 data URL or buffer) to Supabase Storage / public uploads
 * @param {string|Buffer} imageInput - Base64 string or file buffer
 * @param {string} filename - Target filename
 * @returns {Promise<string>} Public image URL
 */
async function uploadToStorage(imageInput, filename) {
  try {
    let buffer;
    let ext = '.jpg';

    if (typeof imageInput === 'string') {
      if (imageInput.startsWith('data:image/png;base64,')) {
        ext = '.png';
        buffer = Buffer.from(imageInput.replace(/^data:image\/png;base64,/, ''), 'base64');
      } else if (imageInput.startsWith('data:image/webp;base64,')) {
        ext = '.webp';
        buffer = Buffer.from(imageInput.replace(/^data:image\/webp;base64,/, ''), 'base64');
      } else if (imageInput.startsWith('data:image/jpeg;base64,') || imageInput.startsWith('data:image/jpg;base64,')) {
        ext = '.jpg';
        buffer = Buffer.from(imageInput.replace(/^data:image\/jpe?g;base64,/, ''), 'base64');
      } else if (imageInput.startsWith('data:audio/webm;base64,')) {
        ext = '.webm';
        buffer = Buffer.from(imageInput.replace(/^data:audio\/webm;base64,/, ''), 'base64');
      } else if (imageInput.startsWith('data:audio/mp3;base64,') || imageInput.startsWith('data:audio/mpeg;base64,')) {
        ext = '.mp3';
        buffer = Buffer.from(imageInput.replace(/^data:audio\/(mp3|mpeg);base64,/, ''), 'base64');
      } else if (imageInput.startsWith('data:audio/wav;base64,')) {
        ext = '.wav';
        buffer = Buffer.from(imageInput.replace(/^data:audio\/wav;base64,/, ''), 'base64');
      } else if (imageInput.startsWith('data:audio/m4a;base64,') || imageInput.startsWith('data:audio/mp4;base64,')) {
        ext = '.m4a';
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

    const safeFilename = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
    const filePath = path.join(UPLOAD_DIR, safeFilename);

    await fs.promises.writeFile(filePath, buffer);

    // Return relative public path or absolute storage URL
    const publicUrl = `/uploads/order-attachments/${safeFilename}`;
    return publicUrl;
  } catch (err) {
    console.error('Storage upload error:', err);
    throw new Error('Failed to save image attachment: ' + err.message);
  }
}

module.exports = {
  uploadToStorage,
  UPLOAD_DIR
};
