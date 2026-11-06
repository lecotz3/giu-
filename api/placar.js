// Placar do Campeonato Oguru compartilhado entre os dois celulares.
// Guarda tudo num Upstash Redis ligado ao projeto na Vercel (Storage → Upstash Redis).
// Sem o banco ligado, responde 503 e o site continua salvando só no celular.

const URL_REDIS = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const K_RODADA = 'oguru:rodada';
const K_HALL = 'oguru:hall';
const LIMITE = 500;

async function redis(cmds) {
  const r = await fetch(URL_REDIS.replace(/\/$/, '') + '/pipeline', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmds)
  });
  if (!r.ok) throw new Error('redis ' + r.status);
  const out = await r.json();
  return out.map(o => { if (o.error) throw new Error(o.error); return o.result; });
}

const lerLista = l => (l || []).map(s => { try { return JSON.parse(s); } catch (e) { return null; } }).filter(Boolean);

async function estado() {
  const [rodada, hall] = await redis([['LRANGE', K_RODADA, '0', '-1'], ['LRANGE', K_HALL, '0', '-1']]);
  return { configured: true, rodada: lerLista(rodada), hall: lerLista(hall) };
}

const txt = (v, n) => typeof v === 'string' ? v.slice(0, n) : undefined;
const num = (v, min, max) => typeof v === 'number' && isFinite(v) && v >= min && v <= max;

function limparItem(l) {
  if (!l || (l.p !== 'giu' && l.p !== 'leo') || !num(l.pts, -20, 20) || !txt(l.id, 40) || !txt(l.g, 40)) return null;
  const x = { id: txt(l.id, 40), g: txt(l.g, 40), p: l.p, pts: l.pts };
  if (l.item) x.item = txt(l.item, 60);
  if (num(l.frac, 0, 2)) x.frac = l.frac;
  if (l.grupo) x.grupo = txt(l.grupo, 60);
  return x;
}

async function lerCorpo(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
  let raw = '';
  for await (const c of req) { raw += c; if (raw.length > 20000) throw new Error('grande demais'); }
  return JSON.parse(raw || '{}');
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!URL_REDIS || !TOKEN) return res.status(503).json({ configured: false });

  try {
    if (req.method === 'GET') return res.status(200).json(await estado());
    if (req.method !== 'POST') return res.status(405).json({ erro: 'método' });

    const b = await lerCorpo(req);

    if (b.op === 'add') {
      // cada toque tem um id: se o celular reenviar (internet caiu no meio), não conta duas vezes
      const novos = (Array.isArray(b.itens) ? b.itens : []).slice(0, 4).map(limparItem).filter(Boolean);
      if (novos.length) {
        const ids = new Set(lerLista((await redis([['LRANGE', K_RODADA, '0', '-1']]))[0]).map(l => l.id));
        const faltam = novos.filter(l => !ids.has(l.id));
        if (faltam.length && ids.size < LIMITE) await redis([['RPUSH', K_RODADA, ...faltam.map(l => JSON.stringify(l))]]);
      }
    } else if (b.op === 'undo') {
      // desfaz um toque inteiro (no "dividido" são duas metades com o mesmo g)
      const g = txt(b.g, 40);
      if (g) {
        const crus = (await redis([['LRANGE', K_RODADA, '0', '-1']]))[0] || [];
        const tirar = crus.filter(s => { try { return JSON.parse(s).g === g; } catch (e) { return false; } });
        if (tirar.length) await redis(tirar.map(s => ['LREM', K_RODADA, '0', s]));
      }
    } else if (b.op === 'reset') {
      await redis([['DEL', K_RODADA]]);
    } else if (b.op === 'encerrar') {
      const r = b.resultado || {};
      if (txt(r.id, 40) && txt(r.dt, 20) && num(r.giu, -999, 9999) && num(r.leo, -999, 9999)) {
        const hall = lerLista((await redis([['LRANGE', K_HALL, '0', '-1']]))[0]);
        const cmds = [['DEL', K_RODADA]];
        if (!hall.some(h => h.id === r.id)) cmds.unshift(['RPUSH', K_HALL, JSON.stringify({ id: r.id, dt: r.dt, giu: r.giu, leo: r.leo })]);
        await redis(cmds);
      }
    } else {
      return res.status(400).json({ erro: 'op' });
    }
    return res.status(200).json(await estado());
  } catch (e) {
    return res.status(500).json({ erro: String(e.message || e) });
  }
};
