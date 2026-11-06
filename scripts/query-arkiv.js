import { ARKIV_WRITER, listTracks } from '../arkivClient.js';

const tracks = await listTracks();
console.log(JSON.stringify({ writer: ARKIV_WRITER, count: tracks.length, tracks }, null, 2));
