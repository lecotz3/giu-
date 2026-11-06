// Leva o Leo pra tela do Spotify pra autorizar o site a mexer na playlist (só precisa uma vez).
const crypto = require('crypto');
const { CLIENT_ID, REDIRECT, ESCOPOS } = require('./_spotify');

module.exports = (req, res) => {
  if (!CLIENT_ID) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.status(503).send('Falta a variável SPOTIFY_CLIENT_ID na Vercel (e um Redeploy depois de colocar).');
  }
  const state = crypto.randomBytes(16).toString('hex');
  res.setHeader('Set-Cookie', 'sp_state=' + state + '; Path=/api; Max-Age=600; HttpOnly; Secure; SameSite=Lax');
  const url = 'https://accounts.spotify.com/authorize?' + new URLSearchParams({
    response_type: 'code', client_id: CLIENT_ID, scope: ESCOPOS, redirect_uri: REDIRECT, state, show_dialog: 'true'
  });
  res.setHeader('Location', url);
  res.status(302).end();
};
