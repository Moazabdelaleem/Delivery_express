import { useState, useRef } from 'react';
import { uploadOrderAttachment } from '../api.js';

export default function PhotoCapture({
  orderId,
  stage,
  required = false,
  token,
  onAttachmentUploaded,
  label = '📷 Attach Photo'
}) {
  const [imagePreview, setImagePreview] = useState(null);
  const [uploading, setUploading]       = useState(false);
  const [uploadedAttachment, setUploadedAttachment] = useState(null);
  const [error, setError]               = useState('');
  const fileInputRef                    = useRef(null);

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please select a valid image file (JPEG, PNG, WEBP).');
      return;
    }

    setError('');
    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64Data = event.target.result;
      setImagePreview(base64Data);

      if (orderId && token) {
        setUploading(true);
        try {
          const res = await uploadOrderAttachment(
            orderId,
            { stage, image: base64Data, is_required: required },
            token
          );
          setUploadedAttachment(res.attachment);
          if (onAttachmentUploaded) {
            onAttachmentUploaded(res.attachment);
          }
        } catch (err) {
          setError(err.message || 'Failed to upload photo.');
        } finally {
          setUploading(false);
        }
      }
    };
    reader.readAsDataURL(file);
  };

  const handleClear = () => {
    setImagePreview(null);
    setUploadedAttachment(null);
    setError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (onAttachmentUploaded) onAttachmentUploaded(null);
  };

  return (
    <div style={{
      border: `1.5px dashed ${uploadedAttachment ? 'var(--clr-success)' : (required && !uploadedAttachment ? 'var(--clr-warning)' : 'var(--clr-border)')}`,
      borderRadius: 'var(--r-md)',
      padding: 12,
      background: 'var(--clr-bg-subtle)',
      marginBottom: 14
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--clr-text-main)' }}>
          {label} {required && <span style={{ color: 'var(--clr-danger)' }}>* (Required)</span>}
        </span>
        {uploadedAttachment && (
          <span style={{ fontSize: 11, color: 'var(--clr-success)', fontWeight: 700 }}>
            ✅ Uploaded ({stage})
          </span>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />

      {imagePreview ? (
        <div style={{ position: 'relative', display: 'inline-block' }}>
          <img
            src={imagePreview}
            alt="Attachment preview"
            style={{ width: 120, height: 120, objectFit: 'cover', borderRadius: 'var(--r-sm)', border: '1px solid var(--clr-border)' }}
          />
          {uploading && (
            <div style={{
              position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
              background: 'rgba(0,0,0,0.5)', borderRadius: 'var(--r-sm)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 12
            }}>
              <span className="spinner" />
            </div>
          )}
          <button
            type="button"
            className="btn btn-danger btn-sm"
            onClick={handleClear}
            style={{ position: 'absolute', top: 4, right: 4, padding: '2px 6px', fontSize: 10 }}
          >
            ✕
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => fileInputRef.current?.click()}
          style={{ width: '100%', justifyContent: 'center', padding: '10px 14px' }}
        >
          📷 Take Photo / Select Image
        </button>
      )}

      {error && (
        <div style={{ color: 'var(--clr-danger)', fontSize: 12, marginTop: 6 }}>
          ⚠️ {error}
        </div>
      )}
    </div>
  );
}
