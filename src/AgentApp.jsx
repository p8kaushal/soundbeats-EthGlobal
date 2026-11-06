import React, { useEffect, useRef, useState } from 'react';
import './agent.css';

const relative = url => (url || '').replace(/^\/+/, '');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const readBase64 = file => new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = reject; reader.readAsDataURL(file); });

function PlayPublish({ track, beatmap, difficulty }) {
  const [link, setLink] = useState(null), [error, setError] = useState('');
  const [title, setTitle] = useState(''), [creator, setCreator] = useState('');
  const [published, setPublished] = useState(null), [publishing, setPublishing] = useState(false);
  useEffect(() => {
    let active = true;
    fetch(`api/tracks/${track.id}/play-link?difficulty=${difficulty}`).then(async response => {
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      if (active) setLink(data);
    }).catch(err => { if (active) setError(err.message || 'Could not load the play link.'); });
    return () => { active = false; };
  }, [track.id, difficulty]);
  async function publish(event) {
    event.preventDefault(); setPublishing(true); setError('');
    try {
      const response = await fetch(`api/tracks/${track.id}/publish`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, creator, difficulty }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      setPublished(data);
      const updated = await fetch(`api/tracks/${track.id}/play-link?difficulty=${difficulty}`);
      if (updated.ok) setLink(await updated.json());
    } catch (err) { setError(err.message || 'Publishing failed.'); } finally { setPublishing(false); }
  }
  return <section className="agent-map agent-play"><h3>Play in SoundBeats</h3>
    {link && <><p>Open the play page on your iPhone or scan the QR code.</p><img className="agent-qr" src={relative(`api/tracks/${track.id}/play-qr.svg?difficulty=${difficulty}`)} alt="QR code for the SoundBeats play page"/><p><a href={link.playPageUrl} target="_blank" rel="noreferrer">Open play page ↗</a>{link.ownerPlayPageUrl && <a href={link.ownerPlayPageUrl} target="_blank" rel="noreferrer">Play as creator ↗</a>}</p>{!link.reachableFromPhone && <p>This local address cannot be opened from your phone. Use the hosted HTTPS app to test the QR code.</p>}</>}
    {track.source === 'lyria' && beatmap.source === 'engine' && <form className="agent-publish" onSubmit={publish}><h3>Publish your level</h3><p>List the level on the configured Arc testnet deployment and save its metadata to Arkiv when configured. The shared play page handles payment and access.</p><label>Level title<input required maxLength={80} value={title} onChange={event => setTitle(event.target.value)}/></label><label>Creator name<input required maxLength={60} value={creator} onChange={event => setCreator(event.target.value)}/></label><button type="submit" disabled={publishing || Boolean(published)}>{published ? 'Published' : publishing ? 'Publishing…' : 'Publish level'}</button>{published && <p role="status">Published{published.arc ? ` on Arc · ${published.arc.priceUsdc} USDC` : ''}{published.entityKey ? ' · Arkiv record saved' : ''}. <a href={published.playPageUrl} target="_blank" rel="noreferrer">Open shared play page</a></p>}</form>}
    {error && <p role="alert">{error}</p>}
  </section>;
}

export default function AgentApp() {
  const [messages, setMessages] = useState([{ role: 'assistant', text: 'Hey! Upload a picture and tell me what kind of sound you want. I can turn it into music and a beatmap.' }]);
  const [text, setText] = useState(''), [file, setFile] = useState(null), [busy, setBusy] = useState(false), [recording, setRecording] = useState(false), [difficulty, setDifficulty] = useState(5), [demo, setDemo] = useState(false);
  const [worldRequired, setWorldRequired] = useState(false);
  const [track, setTrack] = useState(null), [beatmap, setBeatmap] = useState(null), [beatmapError, setBeatmapError] = useState(''), [voicePreview, setVoicePreview] = useState('');
  const recorder = useRef(null), chunks = useRef([]), input = useRef(null), resultRef = useRef(null), bottomRef = useRef(null), recognition = useRef(null);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages, busy]);
  useEffect(() => { if (track || beatmap || beatmapError) resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, [track, beatmap, beatmapError]);
  const add = (role, text) => setMessages(current => [...current, { role, text }]);
  async function send(event) {
    event.preventDefault(); const message = text.trim(); if (!message || busy) return;
    setText(''); add('user', message); setBusy(true);
    try { const response = await fetch('api/agent/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error); add('assistant', result.reply); } catch (error) { add('assistant', error.message || 'Chat is unavailable.'); } finally { setBusy(false); }
  }
  async function make() {
    if (!file || busy) return; setBusy(true); setTrack(null); setBeatmap(null); setBeatmapError(''); add('assistant', demo ? 'Preparing the demo sample…' : 'Creating your music. This may take a few minutes…');
    try {
      const prompt = text.trim() || [...messages].reverse().find(message => message.role === 'user')?.text || '';
      let response = await fetch('api/tracks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ imageBase64: await readBase64(file), prompt: prompt.slice(0, 500), demo }) });
      let result = await response.json(); if (!response.ok) { if (result.verificationRequired) setWorldRequired(true); throw new Error(result.error); }
      for (let attempt = 0; result.status === 'processing' && attempt < 180; attempt++) { await wait(2000); response = await fetch(`api/tracks/${result.id}`); result = await response.json(); if (!response.ok) throw new Error(result.error); }
      if (result.status !== 'completed') throw new Error(result.error || 'Generation is still processing. Please try again later.');
      setTrack(result); add('assistant', 'Your audio is ready. I’m creating the beatmap now…');
      try { response = await fetch(`api/tracks/${result.id}/beatmap?difficulty=${difficulty}`, { method: 'POST' }); const map = await response.json(); if (!response.ok) throw new Error(map.error); setBeatmap({ ...map, generatedDifficulty: difficulty }); add('assistant', map.source === 'mock' ? 'Your mock beatmap is ready. Its notes do not follow the music.' : 'Your beatmap is ready to preview and download.'); }
      catch (error) { const detail = error.message || 'Beatmap creation failed.'; setBeatmapError(detail); add('assistant', `Audio is ready, but the beatmap failed: ${detail}`); }
    } catch (error) { add('assistant', error.message || 'Something went wrong. Please try again.'); } finally { setBusy(false); }
  }
  async function voice() {
    if (recording) { recorder.current?.stop(); recognition.current?.stop(); return; }
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) throw new Error('Voice recording is unavailable in this browser. Please type instead.');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); const media = new MediaRecorder(stream); recorder.current = media; chunks.current = [];
      media.ondataavailable = event => { if (event.data.size) chunks.current.push(event.data); };
      media.onstop = async () => { stream.getTracks().forEach(item => item.stop()); setRecording(false); setBusy(true); setVoicePreview('Transcribing recording…'); try { const blob = new Blob(chunks.current, { type: media.mimeType }); const response = await fetch('api/agent/transcribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ audioBase64: await readBase64(blob), mimeType: media.mimeType.split(';')[0] }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error); setText(result.transcript); } catch (error) { add('assistant', error.message || 'Voice transcription failed. Please type instead.'); } finally { setBusy(false); setVoicePreview(''); } };
      media.start(); setRecording(true); setVoicePreview('Listening…');
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) { try { const speech = new SpeechRecognition(); recognition.current = speech; speech.continuous = true; speech.interimResults = true; speech.onresult = event => { const words = Array.from(event.results).map(result => result[0].transcript).join(' '); setVoicePreview(words || 'Listening…'); }; speech.onerror = () => { setVoicePreview('Listening… Live words unavailable in this browser.'); }; speech.start(); } catch { setVoicePreview('Listening… Live words unavailable in this browser.'); } }
    } catch (error) { add('assistant', error.message || 'Microphone unavailable. Please type instead.'); }
  }
  return <main className="agent-shell"><header className="agent-header"><strong>♫ SOUNDBEATS <small>STUDIO</small></strong><span>Your music companion</span></header><section className="agent-chat"><div className="agent-intro"><span>✳ CREATE YOUR SOUND</span><h1>What does your<br/><em>world sound like?</em></h1><p>Share a picture and an idea. We’ll make the music and map the beat.</p></div><div className="agent-messages">{messages.map((message, index) => <article key={index} className={`agent-message ${message.role}`}><span>{message.role === 'assistant' ? '✳' : 'YOU'}</span><p>{message.text}</p></article>)}{busy && <p className="agent-thinking">Working on it…</p>}</div>{track && <div className="agent-result" ref={resultRef}><h2>Your creation</h2><p>{track.source === 'demo' ? 'Demo sample · not AI generated' : 'Generated with Lyria'}</p><audio controls preload="metadata" src={relative(track.audioUrl)}/><a href={relative(track.audioUrl)} download>Download audio ↓</a>{beatmapError && <div className="agent-map-error" role="alert"><strong>Beatmap unavailable</strong><p>{beatmapError}</p><small>Check the engine tunnel or enable mock mode, then create again.</small></div>}{beatmap && <section className="agent-map"><h3>Beatmap · difficulty {beatmap.generatedDifficulty}/10</h3><p>{beatmap.source === 'mock' ? 'Mock beatmap · placeholder notes' : 'Generated by the SoundBeats engine'} · {beatmap.beatmap?.beats?.length || 0} notes {beatmap.info?.bpm ? `· ${Math.round(beatmap.info.bpm)} BPM` : ''}</p><div className="agent-chart" aria-label="Beatmap note preview">{(beatmap.beatmap?.beats || []).slice(0, 150).map((beat, i) => <i key={i} style={{ left: `${Math.min(98, beat.t / Math.max(1, beatmap.beatmap.beats.at(-1).t) * 100)}%`, bottom: `${(beat.x || 0.5) * 80}%` }}/>)}</div><a href={relative(beatmap.beatmapUrl)} download>Download beatmap JSON ↓</a></section>}{beatmap && <PlayPublish key={track.id} track={track} beatmap={beatmap} difficulty={beatmap.generatedDifficulty}/>}</div>}<div ref={bottomRef}/></section><div className="agent-compose">{worldRequired && <p><a href="api/auth/world/start">Verify with World to generate music ↗</a></p>}{file && <div className="agent-selected">▧ {file.name}<button type="button" onClick={() => setFile(null)}>×</button></div>}{voicePreview && <div className="agent-voice-preview" role="status">{voicePreview}</div>}<form onSubmit={send}><button type="button" className="icon" onClick={() => input.current?.click()} aria-label="Upload image">＋</button><input ref={input} hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={event => { const chosen = event.target.files?.[0]; if (chosen?.size > 5 * 1024 * 1024) add('assistant', 'Please choose an image under 5 MB.'); else if (chosen) { setFile(chosen); add('assistant', 'Picture added. Tell me the mood, then select Create music & beatmap.'); } event.target.value = ''; }}/><textarea placeholder="Describe your sound…" value={text} onChange={event => setText(event.target.value)} rows="1"/><button type="button" className="icon" onClick={voice} disabled={busy} aria-label={recording ? 'Stop recording' : 'Record voice'}>{recording ? '■' : '🎙'}</button><button type="submit" className="send" disabled={busy || !text.trim()} aria-label="Send message">↑</button></form><div className="agent-options"><label>Difficulty <select value={difficulty} onChange={event => setDifficulty(Number(event.target.value))} disabled={busy}>{Array.from({length: 10}, (_, i) => <option key={i+1}>{i+1}</option>)}</select></label><label><input type="checkbox" checked={demo} onChange={event => setDemo(event.target.checked)} disabled={busy}/> Demo audio</label><button type="button" onClick={make} disabled={!file || busy}>Create music & beatmap ↗</button></div><small>Live generation and voice transcription use Google APIs and may incur charges.</small></div></main>;
}
