import { useState, useRef } from 'react';
import { submitOrderFeedback } from '../api.js';

export default function VoiceFeedbackRecorder({ orderId, token, onFeedbackSubmitted }) {
  const [recording, setRecording]         = useState(false);
  const [audioBlob, setAudioBlob]         = useState(null);
  const [audioUrl, setAudioUrl]           = useState(null);
  const [base64Audio, setBase64Audio]     = useState(null);
  const [durationSec, setDurationSec]     = useState(0);
  const [submitting, setSubmitting]       = useState(false);
  const [submittedFeedback, setSubmitted] = useState(null);
  const [error, setError]                 = useState('');

  const mediaRecorderRef = useRef(null);
  const audioChunksRef   = useRef([]);
  const timerRef         = useRef(null);

  const startRecording = async () => {
    try {
      setError('');
      setAudioBlob(null);
      setAudioUrl(null);
      setBase64Audio(null);
      setDurationSec(0);
      audioChunksRef.current = [];

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        setAudioBlob(blob);
        setAudioUrl(url);

        // Convert blob to base64 data string
        const reader = new FileReader();
        reader.onloadend = () => {
          setBase64Audio(reader.result);
        };
        reader.readAsDataURL(blob);

        // Stop media tracks
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setRecording(true);

      // Duration counter
      const startTime = Date.now();
      timerRef.current = setInterval(() => {
        setDurationSec(Math.floor((Date.now() - startTime) / 1000));
      }, 1000);

    } catch (err) {
      console.error('Microphone error:', err);
      setError('Microphone access denied or not available on this device.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
      setRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  const handleSubmit = async () => {
    if (!base64Audio || !orderId || !token) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await submitOrderFeedback(
        orderId,
        { audio: base64Audio, duration_seconds: durationSec },
        token
      );
      setSubmitted(res.feedback);
      if (onFeedbackSubmitted) {
        onFeedbackSubmitted(res.feedback);
      }
    } catch (err) {
      setError(err.message || 'Failed to submit voice feedback.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setAudioBlob(null);
    setAudioUrl(null);
    setBase64Audio(null);
    setSubmitted(null);
    setDurationSec(0);
    setError('');
  };

  return (
    <div style={{
      border: `1.5px dashed ${submittedFeedback ? 'var(--clr-success)' : 'var(--clr-accent)'}`,
      borderRadius: 'var(--r-md)',
      padding: 14,
      background: 'var(--clr-bg-subtle)',
      margin: '12px 0'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--clr-text-main)' }}>
          🎙️ Customer Voice Feedback <span style={{ color: 'var(--clr-text-muted)', fontWeight: 400 }}>(Optional)</span>
        </span>
        {submittedFeedback && (
          <span style={{ fontSize: 11, color: 'var(--clr-success)', fontWeight: 700 }}>
            ✅ Voice Feedback Submitted
          </span>
        )}
      </div>

      <p style={{ fontSize: 11, color: 'var(--clr-text-muted)', marginBottom: 12 }}>
        Hand phone to customer at point of delivery to speak their feedback, then stop and submit.
      </p>

      {submittedFeedback ? (
        <div>
          <audio controls src={submittedFeedback.audio_storage_url} style={{ width: '100%', height: 38, marginBottom: 8 }} />
          <button type="button" className="btn btn-ghost btn-sm" onClick={handleReset}>
            🔄 Re-record New Feedback
          </button>
        </div>
      ) : (
        <div>
          {!audioUrl && !recording && (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={startRecording}
              style={{ width: '100%', justifyContent: 'center', padding: '10px 14px' }}
            >
              🎤 Hand Phone to Customer & Tap to Record
            </button>
          )}

          {recording && (
            <div style={{ textAlign: 'center', padding: '10px 0' }}>
              <div style={{ color: 'var(--clr-danger)', fontWeight: 700, fontSize: 14, marginBottom: 8 }}>
                🔴 Recording in progress... ({durationSec}s)
              </div>
              <button
                type="button"
                className="btn btn-danger btn-sm"
                onClick={stopRecording}
                style={{ padding: '8px 16px' }}
              >
                ⏹️ Stop Recording
              </button>
            </div>
          )}

          {audioUrl && !recording && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
                🔊 Recorded Audio Preview ({durationSec} seconds):
              </div>
              <audio controls src={audioUrl} style={{ width: '100%', height: 38, marginBottom: 10 }} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={handleReset}
                  disabled={submitting}
                >
                  🔄 Re-record
                </button>
                <button
                  type="button"
                  className="btn btn-success btn-sm"
                  onClick={handleSubmit}
                  disabled={submitting}
                  style={{ flex: 1, justifyContent: 'center' }}
                >
                  {submitting ? 'Submitting...' : '🚀 Submit Customer Feedback'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {error && (
        <div style={{ color: 'var(--clr-danger)', fontSize: 12, marginTop: 8 }}>
          ⚠️ {error}
        </div>
      )}
    </div>
  );
}
