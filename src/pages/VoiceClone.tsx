import { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, Play, Pause, Download, Loader2, AlertCircle, Volume2 } from 'lucide-react';

const API_BASE = 'http://localhost:8130';

interface Voice {
  id: string;
  name: string;
  transcript: string;
}

const LANGUAGES = [
  'English', 'Chinese', 'Japanese', 'Korean', 'German',
  'French', 'Russian', 'Portuguese', 'Spanish', 'Italian',
];

export function VoiceClone() {
  const [online, setOnline] = useState<boolean | null>(null);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState('');
  const [text, setText] = useState('');
  const [language, setLanguage] = useState('English');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [audioBlobUrl, setAudioBlobUrl] = useState<string | null>(null);
  const [outputFile, setOutputFile] = useState('');
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);
  const progressInterval = useRef<number>(0);

  // Check TTS server health
  useEffect(() => {
    fetch(`${API_BASE}/api/tts/health`)
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then(() => setOnline(true))
      .catch(() => setOnline(false));
  }, []);

  // Load voices when online
  useEffect(() => {
    if (!online) return;
    fetch(`${API_BASE}/api/tts/voices`)
      .then((r) => r.json())
      .then((data: Voice[]) => setVoices(data))
      .catch(() => {});
  }, [online]);

  // Clean up blob URL on unmount
  useEffect(() => {
    return () => {
      if (audioBlobUrl) URL.revokeObjectURL(audioBlobUrl);
    };
  }, [audioBlobUrl]);

  const selectedTranscript = voices.find((v) => v.id === selectedVoice)?.transcript || '';

  const handleGenerate = useCallback(async () => {
    if (!selectedVoice || !text.trim()) return;
    setGenerating(true);
    setError('');
    if (audioBlobUrl) {
      URL.revokeObjectURL(audioBlobUrl);
      setAudioBlobUrl(null);
    }
    setPlaying(false);
    setProgress(0);

    try {
      const res = await fetch(`${API_BASE}/api/tts/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          voice_id: selectedVoice,
          text: text.trim(),
          language,
        }),
      });

      if (res.status === 409) {
        setError('Another generation is already in progress. Please wait.');
        return;
      }
      if (!res.ok) {
        const msg = await res.text();
        setError(msg || `Server error: ${res.status}`);
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setAudioBlobUrl(url);
      setOutputFile(res.headers.get('X-Output-File') || '');
    } catch {
      setError('Failed to connect to TTS server.');
    } finally {
      setGenerating(false);
    }
  }, [selectedVoice, text, language, audioBlobUrl]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (playing) {
      audio.pause();
      setPlaying(false);
      clearInterval(progressInterval.current);
    } else {
      audio.play();
      setPlaying(true);
      progressInterval.current = window.setInterval(() => {
        if (audio.duration) {
          setProgress(audio.currentTime / audio.duration);
        }
      }, 50);
    }
  }, [playing]);

  const handleAudioLoaded = useCallback(() => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  }, []);

  const handleAudioEnded = useCallback(() => {
    setPlaying(false);
    setProgress(1);
    clearInterval(progressInterval.current);
  }, []);

  const handleProgressClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !audio.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    audio.currentTime = pct * audio.duration;
    setProgress(pct);
  }, []);

  const handleDownload = useCallback(() => {
    if (!audioBlobUrl) return;
    const a = document.createElement('a');
    a.href = audioBlobUrl;
    a.download = outputFile || 'generated.wav';
    a.click();
  }, [audioBlobUrl, outputFile]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  // --- Offline state ---
  if (online === false) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        height: '100%', gap: 16, color: 'var(--text-secondary)',
      }}>
        <AlertCircle size={48} style={{ opacity: 0.4 }} />
        <div style={{ fontSize: 18, fontWeight: 500, color: 'var(--text-primary)' }}>
          TTS Server Offline
        </div>
        <div style={{ fontSize: 13, maxWidth: 400, textAlign: 'center', lineHeight: 1.6 }}>
          Start the TTS server to use voice cloning:
          <pre style={{
            marginTop: 8, padding: '8px 12px', borderRadius: 6,
            backgroundColor: 'var(--bg-secondary)', fontSize: 12,
            textAlign: 'left',
          }}>
{`cd ~/projects/qwen-tts-test
source venv/bin/activate
python tts_server.py`}
          </pre>
        </div>
        <button
          onClick={() => {
            setOnline(null);
            fetch(`${API_BASE}/api/tts/health`)
              .then((r) => r.ok ? r.json() : Promise.reject())
              .then(() => setOnline(true))
              .catch(() => setOnline(false));
          }}
          style={{
            marginTop: 8, padding: '6px 16px', borderRadius: 6, cursor: 'pointer',
            border: '1px solid var(--border)', backgroundColor: 'var(--bg-secondary)',
            color: 'var(--text-primary)', fontSize: 13,
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  // --- Loading state ---
  if (online === null) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100%', color: 'var(--text-secondary)',
      }}>
        <Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }

  // --- Main UI ---
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      maxWidth: 640, margin: '0 auto', padding: '32px 24px', gap: 20,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Volume2 size={22} style={{ color: 'var(--accent)' }} />
        <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0, color: 'var(--text-primary)' }}>
          Voice Clone
        </h1>
      </div>

      {/* Voice selector */}
      <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Reference Voice
        </span>
        <select
          value={selectedVoice}
          onChange={(e) => setSelectedVoice(e.target.value)}
          style={{
            padding: '8px 12px', borderRadius: 6, fontSize: 14,
            border: '1px solid var(--border)', backgroundColor: 'var(--bg-secondary)',
            color: 'var(--text-primary)', cursor: 'pointer',
          }}
        >
          <option value="">Select a voice...</option>
          {voices.map((v) => (
            <option key={v.id} value={v.id}>{v.name}</option>
          ))}
        </select>
      </label>

      {/* Transcript display */}
      {selectedTranscript && (
        <div style={{
          padding: '8px 12px', borderRadius: 6, fontSize: 13,
          backgroundColor: 'color-mix(in srgb, var(--accent) 8%, transparent)',
          color: 'var(--text-secondary)', fontStyle: 'italic',
          borderLeft: '3px solid var(--accent)',
        }}>
          <span style={{ fontSize: 11, fontWeight: 500, fontStyle: 'normal', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Transcript:
          </span>
          {' '}&ldquo;{selectedTranscript}&rdquo;
        </div>
      )}

      {/* Language selector */}
      <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Language
        </span>
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          style={{
            padding: '8px 12px', borderRadius: 6, fontSize: 14,
            border: '1px solid var(--border)', backgroundColor: 'var(--bg-secondary)',
            color: 'var(--text-primary)', cursor: 'pointer', width: 180,
          }}
        >
          {LANGUAGES.map((l) => (
            <option key={l} value={l}>{l}</option>
          ))}
        </select>
      </label>

      {/* Text input */}
      <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Text to Speak
        </span>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Enter the text you want spoken in the cloned voice..."
          rows={5}
          style={{
            padding: '10px 12px', borderRadius: 6, fontSize: 14,
            border: '1px solid var(--border)', backgroundColor: 'var(--bg-secondary)',
            color: 'var(--text-primary)', resize: 'vertical', lineHeight: 1.5,
            fontFamily: 'inherit',
          }}
        />
      </label>

      {/* Generate button */}
      <button
        onClick={handleGenerate}
        disabled={generating || !selectedVoice || !text.trim()}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          padding: '10px 20px', borderRadius: 6, fontSize: 14, fontWeight: 500,
          border: 'none', cursor: generating || !selectedVoice || !text.trim() ? 'not-allowed' : 'pointer',
          backgroundColor: generating || !selectedVoice || !text.trim()
            ? 'var(--bg-secondary)' : 'var(--accent)',
          color: generating || !selectedVoice || !text.trim()
            ? 'var(--text-secondary)' : 'white',
          opacity: generating || !selectedVoice || !text.trim() ? 0.6 : 1,
          transition: 'opacity 0.15s',
        }}
      >
        {generating ? (
          <>
            <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
            Generating... (10-30 seconds)
          </>
        ) : (
          <>
            <Mic size={16} />
            Generate
          </>
        )}
      </button>

      {/* Error */}
      {error && (
        <div style={{
          padding: '8px 12px', borderRadius: 6, fontSize: 13,
          backgroundColor: 'color-mix(in srgb, #ef4444 12%, transparent)',
          color: '#ef4444', border: '1px solid color-mix(in srgb, #ef4444 25%, transparent)',
        }}>
          {error}
        </div>
      )}

      {/* Audio player */}
      {audioBlobUrl && (
        <div style={{
          padding: 16, borderRadius: 8,
          border: '1px solid var(--border)', backgroundColor: 'var(--bg-secondary)',
          display: 'flex', flexDirection: 'column', gap: 12,
        }}>
          <audio
            ref={audioRef}
            src={audioBlobUrl}
            onLoadedMetadata={handleAudioLoaded}
            onEnded={handleAudioEnded}
          />

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {/* Play/Pause */}
            <button
              onClick={togglePlay}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 36, height: 36, borderRadius: '50%',
                border: '1px solid var(--border)', backgroundColor: 'var(--bg-primary)',
                color: 'var(--accent)', cursor: 'pointer',
              }}
            >
              {playing ? <Pause size={16} /> : <Play size={16} style={{ marginLeft: 2 }} />}
            </button>

            {/* Progress bar */}
            <div
              onClick={handleProgressClick}
              style={{
                flex: 1, height: 6, borderRadius: 3,
                backgroundColor: 'var(--border)', cursor: 'pointer',
                position: 'relative',
              }}
            >
              <div style={{
                position: 'absolute', top: 0, left: 0, height: '100%',
                width: `${progress * 100}%`, borderRadius: 3,
                backgroundColor: 'var(--accent)',
                transition: 'width 0.05s linear',
              }} />
            </div>

            {/* Time */}
            <span style={{ fontSize: 12, color: 'var(--text-secondary)', minWidth: 36, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
              {duration ? formatTime(progress * duration) : '0:00'}
            </span>

            {/* Download */}
            <button
              onClick={handleDownload}
              title="Download WAV"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 32, height: 32, borderRadius: 6,
                border: '1px solid var(--border)', backgroundColor: 'transparent',
                color: 'var(--text-secondary)', cursor: 'pointer',
              }}
            >
              <Download size={14} />
            </button>
          </div>

          {outputFile && (
            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
              Saved: generated/{outputFile}
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
