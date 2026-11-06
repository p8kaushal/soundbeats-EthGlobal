import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';
import './player.css';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const clock = seconds => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
function AudioPlayer({ track }) {
  const audio = useRef(null);
  const [duration, setDuration] = useState(track.durationSeconds || 0);
  const [position, setPosition] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => { setDuration(track.durationSeconds || 0); setPosition(0); setPlaying(false); setReady(false); }, [track.id]);
  const seek = seconds => { if (!audio.current || !Number.isFinite(duration) || duration <= 0) return; const next = Math.max(0, Math.min(duration, seconds)); audio.current.currentTime = next; setPosition(next); };
  const toggle = async () => { if (!audio.current) return; if (audio.current.paused) { try { await audio.current.play(); } catch { /* browser reports playback errors through the media element */ } } else audio.current.pause(); };
  return <div className="player"><audio ref={audio} src={track.audioUrl} preload="metadata" onLoadedMetadata={e => { const value = e.currentTarget.duration; if (Number.isFinite(value)) setDuration(value); setReady(true); }} onDurationChange={e => { const value = e.currentTarget.duration; if (Number.isFinite(value)) setDuration(value); }} onTimeUpdate={e => setPosition(e.currentTarget.currentTime)} onSeeked={e => setPosition(e.currentTarget.currentTime)} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} onError={() => setReady(false)}/><div className="transport"><button type="button" onClick={() => seek(position - 10)} disabled={!ready} aria-label="Go back 10 seconds"><span aria-hidden="true">↶</span><span>10 sec</span></button><button type="button" className="play" onClick={toggle} disabled={!ready} aria-label={playing ? 'Pause' : 'Play'}>{playing ? 'Ⅱ' : '▶'}</button><button type="button" onClick={() => seek(position + 10)} disabled={!ready} aria-label="Go forward 10 seconds"><span>10 sec</span><span aria-hidden="true">↷</span></button></div><div className="timeline"><span>{clock(position)}</span><input aria-label="Seek through track" type="range" min="0" max={duration || 1} step="0.1" value={Math.min(position, duration || 1)} disabled={!ready || !duration} onChange={e => seek(Number(e.target.value))} style={{'--progress': `${duration ? position / duration * 100 : 0}%`}}/><span>{duration ? clock(duration) : '--:--'}</span></div></div>;
}
function App() {
  const [file, setFile] = useState(null), [preview, setPreview] = useState('');
  const [prompt, setPrompt] = useState(''), [demo, setDemo] = useState(false);
  const [track, setTrack] = useState(null), [status, setStatus] = useState('');
  const [error, setError] = useState(false), [busy, setBusy] = useState(false), [dragging, setDragging] = useState(false);
  const input = useRef(null);
  useEffect(() => { if (!file) { setPreview(''); return; } const url = URL.createObjectURL(file); setPreview(url); return () => URL.revokeObjectURL(url); }, [file]);
  async function submit(event) {
    event.preventDefault(); if (!file || busy) return;
    setError(false); setTrack(null); setBusy(true);
    try {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Please choose a JPEG, PNG, or WebP image.');
      if (file.size > 5 * 1024 * 1024) throw new Error('Image exceeds the 5 MB limit.');
      setStatus(demo ? 'Preparing the demo track…' : 'Creating your track. This can take a few minutes…');
      const imageBase64 = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(',')[1]); reader.onerror = () => reject(new Error('Could not read the image.')); reader.readAsDataURL(file); });
      const response = await fetch('/api/tracks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ imageBase64, prompt, demo }) });
      let result = await response.json(); if (!response.ok) throw new Error(result.error);
      while (result.status === 'processing') { await sleep(1500); const poll = await fetch(`/api/tracks/${result.id}`); result = await poll.json(); if (!poll.ok) throw new Error(result.error); }
      if (result.status !== 'completed') throw new Error(result.error || 'Generation failed.');
      setTrack({ ...result, artwork: preview }); setStatus(result.source === 'demo' ? 'Demo sample ready. This track was not generated from your image.' : 'Your track is ready.');
    } catch (err) { setError(true); setStatus(err.message || 'Something went wrong. Please try again.'); }
    finally { setBusy(false); }
  }
  return <main className="shell"><header><a className="logo" href="/"><span className="logo-icon">♫</span> SOUNDBEATS <span className="studio">/ STUDIO</span></a><span className="badge"><span>●</span> IMAGE TO SOUND</span></header>
    <section className="intro"><div className="eyebrow"><span>✳</span> YOUR NEXT LEVEL STARTS HERE</div><h1>See a picture.<br/><em>Hear a world.</em></h1><p>Turn a moment into music for your next Soundbeats level. Upload an image, set the mood, and let the sound take shape.</p></section>
    <section className="workspace"><div className="panel create"><div className="panel-heading"><div><span className="step">01 / CREATE</span><h2>Make your track</h2></div><span className="corner">✳</span></div>
    <form onSubmit={submit}><label className="field-label" htmlFor="image">YOUR IMAGE <span>REQUIRED</span></label><label className={`drop${dragging ? ' dragging' : ''}`} htmlFor="image" onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={e => { e.preventDefault(); setDragging(false); if (e.dataTransfer.files[0]) { setFile(e.dataTransfer.files[0]); input.current.value = ''; } }}><input ref={input} id="image" type="file" accept="image/jpeg,image/png,image/webp" onChange={e => setFile(e.target.files[0] || null)}/>{preview ? <img src={preview} alt="Selected image preview"/> : <div><div className="upload-icon">↗</div><strong>Drop an image here</strong><p>or <u>browse your files</u></p><small>JPG, PNG or WEBP · UP TO 5 MB</small></div>}</label>
    <label className="field-label" htmlFor="prompt">SET THE MOOD <span>OPTIONAL</span></label><textarea id="prompt" maxLength="500" placeholder="Dreamy synths, a driving beat, late-night energy..." value={prompt} onChange={e => setPrompt(e.target.value)}/><div className="mode"><label><input type="checkbox" checked={demo} onChange={e => setDemo(e.target.checked)}/> Use demo track</label><p>A pre-made sample, not generated from your image.</p></div><button disabled={busy || !file} type="submit">Generate my track <span>↗</span></button><p className="fineprint">Live generation uses Google Lyria and may incur API charges.</p></form></div>
    <div className="panel output"><div className="panel-heading"><div><span className="step">02 / LISTEN</span><h2>Your sound</h2></div><span className="live-dot">●</span></div>{!track && !busy && <div className="empty"><div className="record"><div className="record-inner">♫</div></div><h3>It's quiet in here.</h3><p>Your track will appear here when it's ready. Every image has a sound waiting to be found.</p><div className="empty-label">READY WHEN YOU ARE <span>✳</span></div></div>}{busy && <div className="empty generating"><div className="record"><div className="record-inner">♫</div></div><h3>Making your sound…</h3><p>Music generation can take a few minutes. Keep this tab open while your track is created.</p></div>}{track && <div><div className="art"><img src={track.artwork} alt="Your uploaded artwork"/><div className="art-overlay"><span>YOUR CREATION</span><strong>Made from<br/>your moment.</strong></div></div><div className="track-head"><div><span className="step">{track.source === 'demo' ? 'DEMO SAMPLE · NOT AI GENERATED' : 'GENERATED WITH LYRIA'}</span><h3>Your Soundbeats track</h3></div><span className="music-note">♫</span></div><AudioPlayer key={track.id} track={track}/><div className="meta"><span>{track.format}</span><span>Ready for download</span></div><a href={track.audioUrl} className="download" download={`soundbeats-${track.id}.${track.format}`}>Download audio <span>↓</span></a><p className="fineprint">Audio only · Game integration and beatmaps come next.</p></div>}<div id="status" className={error ? 'error' : ''} role="status" aria-live="polite">{status}</div></div></section><footer><span>MADE FOR THE MOMENTS THAT MOVE YOU.</span><span>SOUNDBEATS © 2026</span></footer></main>;
}

createRoot(document.getElementById('root')).render(<App/>);
