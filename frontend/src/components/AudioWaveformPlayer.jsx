import { useState, useRef, useEffect } from 'react';

export default function AudioWaveformPlayer({ audioUrl, duration = 0, title = 'Customer Voice Feedback' }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [speed, setSpeed] = useState(1);
  const audioRef = useRef(null);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = speed;
    }
  }, [speed]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
  };

  const handleTimeUpdate = () => {
    if (!audioRef.current) return;
    const current = audioRef.current.currentTime;
    const total = audioRef.current.duration || duration || 1;
    setProgress((current / total) * 100);
  };

  const handleEnded = () => {
    setIsPlaying(false);
    setProgress(0);
  };

  const speeds = [1, 1.25, 1.5, 2];

  // Dummy visual waveform bar heights
  const bars = [40, 75, 30, 90, 60, 100, 45, 80, 55, 95, 35, 70, 85, 50, 65, 40, 90, 60, 30, 80];

  return (
    <div className="audio-player-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
        <span style={{ fontWeight: 600, color: 'var(--clr-text)' }}>🎙️ {title}</span>
        <span style={{ color: 'var(--clr-text-muted)' }}>{duration ? `${duration}s` : 'Audio'}</span>
      </div>

      <audio
        ref={audioRef}
        src={audioUrl}
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleEnded}
      />

      <div className="audio-controls-row">
        <button className="waveform-btn" onClick={togglePlay} title={isPlaying ? 'Pause' : 'Play'}>
          {isPlaying ? '⏸' : '▶'}
        </button>

        <div className="waveform-bars-wrap">
          {bars.map((h, i) => {
            const barProgress = (i / bars.length) * 100;
            const isActive = barProgress <= progress;
            return (
              <div
                key={i}
                className={`waveform-bar ${isActive ? 'active' : ''}`}
                style={{ height: `${h}%` }}
              />
            );
          })}
        </div>

        <div className="speed-pills">
          {speeds.map(s => (
            <button
              key={s}
              className={`speed-pill ${speed === s ? 'active' : ''}`}
              onClick={() => setSpeed(s)}
            >
              {s}x
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
