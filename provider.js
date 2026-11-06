export async function generateMusic({ image, mimeType, prompt, apiKey, timeoutMs = 180000 }) {
  if (!apiKey) throw new Error('No Gemini API key configured. Set GEMINI_API_KEY and restart the server.');
  let response;
  try {
    response = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({ model: 'lyria-3.5', input: [
        { type: 'text', text: `Create an energetic instrumental game soundtrack inspired by this image. No vocals. ${prompt}` },
        { type: 'image', mime_type: mimeType, data: image.toString('base64') }
      ] }), signal: AbortSignal.timeout(timeoutMs)
    });
  } catch (error) {
    throw new Error(error.name === 'TimeoutError' ? 'Music generation timed out. Please try again.' : 'Could not reach the music provider. Please try again.');
  }
  if (!response.ok) {
    if (response.status === 429) throw new Error('Provider quota or rate limit reached. Check billing and quota, then try again.');
    if (response.status === 401 || response.status === 403) throw new Error('Provider access denied. Check your API key, billing, and model access.');
    throw new Error(`Music provider could not complete the request (HTTP ${response.status}).`);
  }
  const result = await response.json();
  const blocks = (result.steps || []).filter(s => s.type === 'model_output').flatMap(s => Array.isArray(s.content) ? s.content : [s.content]);
  const audio = blocks.findLast(b => b?.type === 'audio' && b.data);
  if (!audio) throw new Error('The provider returned no audio. Try a different image or prompt.');
  return { bytes: Buffer.from(audio.data, 'base64'), format: 'mp3', mimeType: 'audio/mpeg', durationSeconds: null };
}
