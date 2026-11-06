// "Play in SoundBeats": turns a generated track + beatmap into a link that opens the game.
//
// Flow: web app / AI agent -> /play/{id}?difficulty=N (landing page with button + QR)
//       -> soundbeats://play?pkg=<package URL> (opens the iOS TestFlight build)
//       -> game fetches the play package (a normal v2 beatmap whose source.mubertS3url points
//          to the track audio and imageUrl to the user's photo) and starts the level.
//
//   PUBLIC_BASE_URL   public origin the phone can reach, e.g. https://ethglobal.soundbeats.io
//                     including any sub-path, e.g. https://ethglobal.soundbeats.io/game
//                     (defaults to the request's host + BASE_PATH; localhost links only work on this machine)
//   GAME_URL_SCHEME   app URL scheme, default "soundbeats"
//   TESTFLIGHT_URL    public TestFlight invite link shown when the game isn't installed
import QRCode from 'qrcode';
import { toFunctionSelector } from 'viem';

export function publicBase(req) {
  const configured = process.env.PUBLIC_BASE_URL;
  if (configured) return configured.replace(/\/+$/, '');
  const proto = String(req.headers['x-forwarded-proto'] || 'http').split(',')[0].trim();
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost';
  return `${proto}://${host}${(process.env.BASE_PATH || '').replace(/\/+$/, '')}`;
}

export const isLocalBase = base => /^https?:\/\/(localhost|127\.|\[::1\])/i.test(base);

// Picks the requested difficulty, or the most recently generated one.
export function pickDifficulty(record, requested) {
  const available = Object.entries(record.beatmaps || {});
  if (!available.length) return null;
  if (requested != null) return record.beatmaps[requested] ? Number(requested) : null;
  available.sort((a, b) => String(b[1].createdAt).localeCompare(String(a[1].createdAt)));
  return Number(available[0][0]);
}

// `access` = { wallet, sig } for levels sold on Arc (issued after the on-chain payment check).
export function playLinks(base, record, difficulty, access = null) {
  const scheme = process.env.GAME_URL_SCHEME || 'soundbeats';
  const q = access ? `w=${access.wallet}&s=${encodeURIComponent(access.sig)}` : '';
  const packageUrl = `${base}/api/play/${record.id}/${difficulty}.json${q ? `?${q}` : ''}`;
  const playPageUrl = `${base}/play/${record.id}?difficulty=${difficulty}${q ? `&${q}` : ''}`;
  return {
    trackId: record.id,
    difficulty,
    playPageUrl,
    packageUrl,
    deepLink: `${scheme}://play?pkg=${encodeURIComponent(packageUrl)}`,
    qrSvgUrl: `${base}/api/tracks/${record.id}/play-qr.svg?difficulty=${difficulty}`,
    testflightUrl: process.env.TESTFLIGHT_URL || null,
    reachableFromPhone: !isLocalBase(base),
  };
}

export function playPackage(base, record, beatmap) {
  return {
    ...beatmap,
    version: 2,
    title: beatmap.title && beatmap.title !== 'Soundbeats Photo Track' ? beatmap.title : (record.title || 'My Photo Track'),
    artist: beatmap.artist || 'SoundBeats AI',
    imageUrl: record.imageFormat ? `${base}/api/tracks/${record.id}/image` : (beatmap.imageUrl || ''),
    source: {
      audiusId: '',
      mubertS3url: `${base}/api/tracks/${record.id}/audio`, // game plays audio from this URL
      guid: record.id,
    },
  };
}

export const qrSvg = text => QRCode.toString(text, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#111111', light: '#ffffff' } });

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const SEL = {
  approve: toFunctionSelector('approve(address,uint256)'),
  allowance: toFunctionSelector('allowance(address,address)'),
  balanceOf: toFunctionSelector('balanceOf(address)'),
  buyAccess: toFunctionSelector('buyAccess(uint256)'),
};

// `paywall` (Arc info + unlockUrl) is set when the level is for sale and the visitor hasn't unlocked it.
export async function playPage(links, pkg, paywall = null) {
  const qr = await qrSvg(links.playPageUrl);
  const notes = pkg.beats?.length || 0;
  const image = pkg.imageUrl ? `<img class="cover" src="${esc(pkg.imageUrl)}" alt="Track cover">` : '<div class="cover blank">♫</div>';
  const warn = links.reachableFromPhone ? '' : '<p class="warn">This link uses a local address, so a phone can\'t open it yet. Set PUBLIC_BASE_URL to the public HTTPS address.</p>';
  const testflight = links.testflightUrl
    ? `<a class="btn ghost" href="${esc(links.testflightUrl)}">Don't have the game? Get it on TestFlight</a>`
    : '<p class="muted">Don\'t have the game? Ask the team for the TestFlight invite.</p>';
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Play "${esc(pkg.title)}" in SoundBeats</title>
<meta property="og:title" content="Play &quot;${esc(pkg.title)}&quot; in SoundBeats">
<style>
:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0d0d10;color:#f4f1ea;font:16px/1.45 system-ui,-apple-system,Segoe UI,sans-serif;padding:24px}
main{width:100%;max-width:420px;text-align:center}.logo{letter-spacing:.18em;font-size:12px;opacity:.7;margin-bottom:20px}
.cover{width:100%;aspect-ratio:1;object-fit:cover;border-radius:18px;display:block;background:#1d1d24}.blank{display:grid;place-items:center;font-size:64px;color:#c6ff3d}
h1{font-size:24px;margin:18px 0 4px}.sub{opacity:.7;margin:0 0 18px;font-size:14px}
.btn{display:block;padding:15px 18px;border-radius:999px;background:#c6ff3d;color:#0d0d10;font-weight:700;text-decoration:none;margin:10px 0}
.btn.ghost{background:transparent;color:#f4f1ea;border:1px solid #3a3a44;font-weight:500}
.qr{display:none;margin:18px auto 6px;width:200px;padding:10px;background:#fff;border-radius:14px}.qr svg{display:block;width:100%;height:auto}
.desktop .qr{display:block}.desktop .cover{width:220px;margin:0 auto}.desktop .open{display:none}.hint{display:none;font-size:14px;opacity:.75}.desktop .hint{display:block}
.muted{opacity:.6;font-size:14px}.warn{background:#3a2a10;color:#ffd58a;padding:10px 12px;border-radius:10px;font-size:13px}
.small{font-size:12px;opacity:.55;margin-top:18px}.small a{color:inherit}
.pay{border:1px solid #2c2c35;border-radius:18px;padding:16px;margin:14px 0;text-align:left}.price{font-size:28px;font-weight:800;color:#c6ff3d}.price small{display:block;font-size:13px;color:#f4f1ea;opacity:.7;font-weight:500}
.pay .btn{text-align:center;border:0;width:100%;}.pay .btn.ghost{border:1px solid #3a3a44}.pay .btn{font:inherit;font-weight:700;cursor:pointer}.pay .btn[disabled]{opacity:.5}.steps{margin:10px 0 0;padding-left:18px;font-size:13px;opacity:.75}
#st{font-size:13px;margin:10px 0 0;min-height:1em}#st.err{color:#ff8a8a}#st a{color:#c6ff3d}.ok{display:none}.paid .ok{display:block}.paid .buy{display:none}.mono{font-family:ui-monospace,monospace;font-size:12px;opacity:.6;word-break:break-all}
#uqr{margin:12px auto 0;width:180px;background:#fff;padding:8px;border-radius:12px;display:none}#uqr svg{width:100%;height:auto;display:block}.desktop #uqr{display:block}
</style></head>
<body><main id="m">
<div class="logo">SOUNDBEATS</div>
${image}
<h1>${esc(pkg.title)}</h1>
<p class="sub">${esc(pkg.artist)} · difficulty ${links.difficulty}/10 · ${notes} notes</p>
${warn}
${paywall ? paywallHtml(paywall) : `<a class="btn open" href="${esc(links.deepLink)}">Play in SoundBeats ▶</a>
<div class="qr" aria-label="QR code to open on your phone">${qr}</div>
<p class="hint">Scan with your iPhone camera to play.</p>`}
${testflight}
${paywall ? '' : `<p class="small"><a href="${esc(links.packageUrl)}">Beatmap JSON</a></p>`}
</main>
<script>if(!/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)&&!(navigator.maxTouchPoints>1&&/Mac/.test(navigator.platform)))document.getElementById('m').classList.add('desktop');</script>
</body></html>`;
}

function paywallHtml(p) {
  const cfg = JSON.stringify({ ...p, sel: SEL }).replace(/</g, '\\u003c');
  return `<div class="pay" id="pay">
<div class="buy"><div class="price">${esc(p.priceUsdc)} USDC <small>Arc Testnet · one-time unlock</small></div>
<ol class="steps"><li>Connect MetaMask on Arc Testnet</li><li>Approve ${esc(p.priceUsdc)} USDC</li><li>Pay, then play in SoundBeats</li></ol>
<button class="btn" id="go" type="button">Unlock with MetaMask</button>
<a class="btn ghost" id="mm" style="display:none" href="#">Open in MetaMask app</a>
<p class="mono">Paid straight to the SoundBeats wallet ${esc(p.payoutWallet)} · release #${esc(p.releaseId)} · <a href="${esc(p.explorer)}/address/${esc(p.contract)}" style="color:inherit">contract</a></p></div>
<div class="ok"><div class="price">Unlocked ✓</div><a class="btn" id="play" href="#">Play in SoundBeats ▶</a><a class="btn ghost" id="safari" style="display:none" href="#">Open in Safari to play</a><button class="btn ghost" id="copy" type="button">Copy my play link</button><div id="uqr"></div></div>
<p id="st" role="status" aria-live="polite"></p></div>
<script id="arc" type="application/json">${cfg}</script>
<script>
(()=>{const P=JSON.parse(document.getElementById('arc').textContent),eth=window.ethereum,$=id=>document.getElementById(id);
const ios=/iPhone|iPad|iPod/i.test(navigator.userAgent)||(navigator.maxTouchPoints>1&&/Mac/.test(navigator.platform)),mobile=ios||/Android/i.test(navigator.userAgent);
const st=(m,err)=>{$('st').innerHTML=m;$('st').className=err?'err':''};
const pad=v=>BigInt(v).toString(16).padStart(64,'0'),addr=a=>a.toLowerCase().replace(/^0x/,'').padStart(64,'0');
const call=async(to,data)=>BigInt(await eth.request({method:'eth_call',params:[{to,data},'latest']}));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function receipt(h){for(let i=0;i<120;i++){const r=await eth.request({method:'eth_getTransactionReceipt',params:[h]}).catch(()=>null);if(r){if(r.status!=='0x1')throw new Error('Transaction failed on Arc.');return r}await sleep(1500)}throw new Error('Still waiting for Arc. Check MetaMask, then tap Unlock again.')}
async function chain(){const id=await eth.request({method:'eth_chainId'});if(id.toLowerCase()===P.chainIdHex)return;
try{await eth.request({method:'wallet_switchEthereumChain',params:[{chainId:P.chainIdHex}]})}catch(e){if(e.code!==4902&&e?.data?.originalError?.code!==4902)throw e;
await eth.request({method:'wallet_addEthereumChain',params:[{chainId:P.chainIdHex,chainName:'Arc Testnet',nativeCurrency:{name:'USDC',symbol:'USDC',decimals:18},rpcUrls:[P.rpcUrl],blockExplorerUrls:[P.explorer]}]})}}
async function unlock(wallet){const r=await fetch(P.unlockUrl,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({wallet})});const b=await r.json().catch(()=>({}));if(r.status===402)return null;if(!r.ok)throw new Error(b.error||'Could not check payment.');return b}
function done(b){$('pay').classList.add('paid');$('play').href=b.deepLink;if(ios&&eth){$('safari').style.display='block';$('safari').href='x-safari-'+b.playPageUrl}
$('copy').onclick=async()=>{try{await navigator.clipboard.writeText(b.playPageUrl);st('Link copied. Open it on your iPhone to play.')}catch{st(b.playPageUrl)}};$('uqr').innerHTML=b.qrSvg||'';
st(mobile?'Paid. Tap Play in SoundBeats. If nothing happens inside MetaMask, use “Open in Safari to play”.':'Paid. Scan the QR code with your iPhone to play.');
try{localStorage.setItem('sb-unlock-'+location.pathname,b.playPageUrl)}catch{}}
if(!eth){$('go').style.display='none';if(mobile){$('mm').style.display='block';$('mm').href='https://metamask.app.link/dapp/'+location.host+location.pathname+location.search;st('Open this page in the MetaMask app to pay.')}else st('Install the <a href="https://metamask.io/download/">MetaMask extension</a> to pay, or open this page on your phone.')}
$('go').onclick=async()=>{const go=$('go');go.disabled=true;try{
st('Connecting MetaMask…');const [w]=await eth.request({method:'eth_requestAccounts'});await chain();
st('Checking for an earlier payment…');let b=await unlock(w);if(b)return done(b);
const price=BigInt(P.price),bal=await call(P.usdc,P.sel.balanceOf+addr(w));
if(bal<price)throw new Error('This wallet has '+(Number(bal)/1e6)+' USDC on Arc Testnet. Get test USDC at <a href="https://faucet.circle.com" target="_blank" rel="noreferrer">faucet.circle.com</a>, then try again.');
const allowed=await call(P.usdc,P.sel.allowance+addr(w)+addr(P.contract));
if(allowed<price){st('Step 1 of 2: approve '+P.priceUsdc+' USDC in MetaMask…');const h=await eth.request({method:'eth_sendTransaction',params:[{from:w,to:P.usdc,data:P.sel.approve+addr(P.contract)+pad(price)}]});st('Waiting for the approval on Arc…');await receipt(h)}
st('Step 2 of 2: confirm the '+P.priceUsdc+' USDC payment in MetaMask…');const h2=await eth.request({method:'eth_sendTransaction',params:[{from:w,to:P.contract,data:P.sel.buyAccess+pad(P.releaseId)}]});
st('Waiting for the payment on Arc…');await receipt(h2);
for(let i=0;i<10&&!b;i++){b=await unlock(w);if(!b)await sleep(2000)}if(!b)throw new Error('Payment sent, but the server can’t see it yet. Tap Unlock again in a moment.');done(b);
}catch(e){st(e.code===4001?'Cancelled in MetaMask.':(e.message||'Something went wrong.'),true)}finally{go.disabled=false}};
try{const saved=localStorage.getItem('sb-unlock-'+location.pathname);if(saved){st('You unlocked this before. <a href="'+saved+'">Open my play link</a>')}}catch{}
})();
</script>`;
}
