// Coisas em comum das funções do Spotify. O "_" no nome faz a Vercel não publicar este arquivo como rota.
const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REFRESH = process.env.SPOTIFY_REFRESH_TOKEN;
const PLAYLIST = process.env.SPOTIFY_PLAYLIST_ID || '7vNHWDAHDk8kgsJvIHQhhH';
const REDIRECT = 'https://giu-nu.vercel.app/api/spotify-callback';
const ESCOPOS = 'playlist-modify-public playlist-modify-private playlist-read-private';

const basic = () => 'Basic ' + Buffer.from(CLIENT_ID + ':' + CLIENT_SECRET).toString('base64');

async function pedirToken(params) {
  const r = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { Authorization: basic(), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString()
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('token: ' + (j.error_description || j.error || r.status));
  return j;
}

// o token de acesso dura 1 hora: guarda na memória da função enquanto ela estiver quente
let cache = { token: null, ate: 0 };
async function tokenAcesso() {
  if (cache.token && Date.now() < cache.ate) return cache.token;
  const j = await pedirToken({ grant_type: 'refresh_token', refresh_token: REFRESH });
  cache = { token: j.access_token, ate: Date.now() + (j.expires_in - 60) * 1000 };
  return cache.token;
}

async function spotify(caminho, opcoes = {}, token) {
  const r = await fetch('https://api.spotify.com/v1' + caminho, {
    ...opcoes,
    headers: { Authorization: 'Bearer ' + (token || await tokenAcesso()), 'Content-Type': 'application/json', ...(opcoes.headers || {}) }
  });
  const j = r.status === 204 ? {} : await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error((j.error && j.error.message) || ('spotify ' + r.status)); e.status = r.status; throw e; }
  return j;
}

module.exports = { CLIENT_ID, CLIENT_SECRET, REFRESH, PLAYLIST, REDIRECT, ESCOPOS, pedirToken, spotify };
