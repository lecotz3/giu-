// Volta do Spotify depois do login: troca o código pela chave que fica guardada na Vercel.
// A chave aparece só pra quem acabou de entrar com a própria conta, pra ser colada em SPOTIFY_REFRESH_TOKEN.
const { PLAYLIST, REDIRECT, pedirToken, spotify } = require('./_spotify');

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function pagina(res, status, corpo) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Set-Cookie', 'sp_state=; Path=/api; Max-Age=0; HttpOnly; Secure; SameSite=Lax');
  res.status(status).send(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Spotify do site da Giu</title>
<style>body{margin:0;min-height:100vh;background:#120A0B;color:#F3ECE2;font:16px/1.6 system-ui,sans-serif;display:grid;place-items:center;padding:1.5rem}main{max-width:560px}h1{font-family:Georgia,serif;font-weight:600}code,textarea{display:block;width:100%;box-sizing:border-box;background:#1E1416;color:#F3B4C3;border:1px solid #4a3a3d;border-radius:10px;padding:.8rem;font:13px/1.5 ui-monospace,monospace;word-break:break-all}button{margin-top:.7rem;min-height:44px;padding:0 1.2rem;border:0;border-radius:100px;background:#C33339;color:#fff;font-weight:700;cursor:pointer}ol{padding-left:1.2rem}.aviso{color:#F0876C}</style></head><body><main>${corpo}</main></body></html>`);
}

module.exports = async (req, res) => {
  const q = req.query || {};
  const cookie = String(req.headers.cookie || '').split(/;\s*/).find(c => c.startsWith('sp_state='));
  if (q.error) return pagina(res, 400, '<h1>O Spotify não autorizou</h1><p>' + esc(q.error) + '. Tenta de novo em <a style="color:#F0876C" href="/api/spotify-login">/api/spotify-login</a>.</p>');
  if (!q.code || !q.state || !cookie || cookie.slice(9) !== q.state) {
    return pagina(res, 400, '<h1>Link vencido</h1><p>Começa de novo por <a style="color:#F0876C" href="/api/spotify-login">/api/spotify-login</a>.</p>');
  }
  try {
    const t = await pedirToken({ grant_type: 'authorization_code', code: String(q.code), redirect_uri: REDIRECT });
    const eu = await spotify('/me', {}, t.access_token);
    let dono = null;
    try { dono = (await spotify('/playlists/' + PLAYLIST + '?fields=name,owner(id,display_name)', {}, t.access_token)); } catch (e) {}
    const aviso = !dono
      ? '<p class="aviso">Não achei a playlist com essa conta. Confere se entrou com a conta dona da playlist.</p>'
      : dono.owner && dono.owner.id !== eu.id
        ? '<p class="aviso">A playlist "' + esc(dono.name) + '" é de ' + esc(dono.owner.display_name || dono.owner.id) + ', não de ' + esc(eu.display_name || eu.id) + '. Entra com a conta dona dela.</p>'
        : '<p>Playlist encontrada: <b>' + esc(dono.name) + '</b>.</p>';
    return pagina(res, 200, `<h1>Quase lá, ${esc(eu.display_name || eu.id)}</h1>${aviso}
<ol><li>Copia a chave abaixo.</li><li>Na Vercel: projeto <b>giu</b>, Settings, Environment Variables. Cria <b>SPOTIFY_REFRESH_TOKEN</b> com essa chave (Production).</li><li>Deployments, Redeploy.</li></ol>
<textarea id="k" rows="5" readonly>${esc(t.refresh_token)}</textarea>
<button type="button" onclick="navigator.clipboard.writeText(document.getElementById('k').value).then(()=>this.textContent='copiado')">copiar chave</button>
<p style="opacity:.7;font-size:.9rem">Não manda essa chave pra ninguém: com ela dá pra mexer nas suas playlists.</p>`);
  } catch (e) {
    return pagina(res, 500, '<h1>Deu erro com o Spotify</h1><p>' + esc(e.message) + '</p><p>Confere se o Redirect URI no app do Spotify é exatamente <code>' + esc(REDIRECT) + '</code>.</p>');
  }
};
