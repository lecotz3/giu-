// A Giu procura uma música no site e coloca na nossa playlist.
//   GET  /api/spotify          → se está ligado + dados da playlist
//   GET  /api/spotify?q=texto  → busca músicas
//   POST /api/spotify {id}     → adiciona a música na playlist
const { CLIENT_ID, CLIENT_SECRET, REFRESH, PLAYLIST, spotify } = require('./_spotify');

const ID_OK = /^[A-Za-z0-9]{22}$/;

async function idsNaPlaylist() {
  const ids = new Set();
  let url = '/playlists/' + PLAYLIST + '/tracks?fields=next,items(track(id))&limit=100';
  for (let pag = 0; url && pag < 10; pag++) {
    const j = await spotify(url);
    (j.items || []).forEach(i => i.track && i.track.id && ids.add(i.track.id));
    url = j.next ? j.next.replace('https://api.spotify.com/v1', '') : null;
  }
  return ids;
}

async function lerCorpo(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
  let raw = '';
  for await (const c of req) { raw += c; if (raw.length > 2000) throw new Error('grande demais'); }
  return JSON.parse(raw || '{}');
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH) {
    return res.status(503).json({ configured: false, falta: { app: !CLIENT_ID || !CLIENT_SECRET, login: !REFRESH } });
  }
  try {
    if (req.method === 'GET') {
      const q = String((req.query && req.query.q) || '').trim().slice(0, 80);
      if (!q) {
        const p = await spotify('/playlists/' + PLAYLIST + '?fields=name,public,tracks(total),external_urls');
        return res.status(200).json({ configured: true, id: PLAYLIST, nome: p.name, publica: p.public !== false, total: p.tracks && p.tracks.total, url: p.external_urls && p.external_urls.spotify });
      }
      const [busca, ja] = await Promise.all([
        spotify('/search?type=track&market=BR&limit=8&q=' + encodeURIComponent(q)),
        idsNaPlaylist()
      ]);
      const musicas = ((busca.tracks && busca.tracks.items) || []).filter(Boolean).map(t => ({
        id: t.id,
        nome: t.name,
        artistas: (t.artists || []).map(a => a.name).join(', '),
        capa: ((t.album && t.album.images) || []).slice(-1)[0]?.url || null,
        naPlaylist: ja.has(t.id)
      }));
      return res.status(200).json({ musicas });
    }

    if (req.method === 'POST') {
      const { id } = await lerCorpo(req);
      if (!ID_OK.test(String(id || ''))) return res.status(400).json({ erro: 'id' });
      if ((await idsNaPlaylist()).has(id)) return res.status(200).json({ ok: true, jaEstava: true });
      await spotify('/playlists/' + PLAYLIST + '/tracks', { method: 'POST', body: JSON.stringify({ uris: ['spotify:track:' + id] }) });
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ erro: 'método' });
  } catch (e) {
    return res.status(e.status === 403 || e.status === 401 ? 502 : 500).json({ erro: String(e.message || e) });
  }
};
