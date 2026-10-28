require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require('discord.js');

const PORT = process.env.PORT || 3000;
const DATA = path.join(__dirname, 'data');
const SITES = path.join(DATA, 'sites');
const DB = path.join(DATA, 'db.json');
const MAX_BOTS = 20, MAX_SITES = 50;

if (!process.env.SECRET_KEY || process.env.SECRET_KEY.length < 16) {
  console.error('Fehler: In der Datei .env fehlt SECRET_KEY (mindestens 16 Zeichen).');
  process.exit(1);
}
const KEY = crypto.createHash('sha256').update(process.env.SECRET_KEY).digest();
fs.mkdirSync(SITES, { recursive: true });

// Tokens werden verschlüsselt gespeichert (AES-256-GCM)
const enc = t => {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const e = Buffer.concat([c.update(t, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), e].map(b => b.toString('base64')).join('.');
};
const dec = s => {
  const [iv, tag, e] = s.split('.').map(x => Buffer.from(x, 'base64'));
  const d = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(e), d.final()]).toString('utf8');
};
const hash = k => crypto.createHash('sha256').update(k).digest('hex');
const rnd = n => crypto.randomBytes(n).toString('hex');

let db = { bots: {}, sites: {} };
try { db = JSON.parse(fs.readFileSync(DB, 'utf8')); } catch {}
const save = () => fs.writeFileSync(DB, JSON.stringify(db, null, 2));
const clients = {};

async function startBot(id) {
  const b = db.bots[id];
  const token = dec(b.token);
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  client.once('ready', async () => {
    try {
      const body = b.commands.map(c => new SlashCommandBuilder().setName(c.name).setDescription('Antwortet mit einem festen Text').toJSON());
      await new REST({ version: '10' }).setToken(token).put(Routes.applicationCommands(client.user.id), { body });
      console.log('Bot online:', client.user.tag);
    } catch (e) { console.error('Befehle konnten nicht registriert werden:', e.message); }
  });
  client.on('interactionCreate', async i => {
    if (!i.isChatInputCommand()) return;
    const c = b.commands.find(x => x.name === i.commandName);
    if (c) await i.reply(c.reply).catch(() => {});
  });
  try { await client.login(token); } catch (e) { await client.destroy(); throw e; }
  clients[id] = client;
}

const app = express();
// Erlaubt der Seite auf GitHub Pages, diesen Server anzusprechen (ALLOWED_ORIGIN in .env)
app.use((req, res, next) => {
  const origin = process.env.ALLOWED_ORIGIN;
  if (origin) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Access-Control-Allow-Headers', 'Content-Type, X-Key');
    res.set('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.set('Access-Control-Allow-Private-Network', 'true');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
  }
  next();
});
app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use(express.json({ limit: '20kb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/sites', (req, res, next) => {
  // Fremde Seiten laufen isoliert, ohne Zugriff auf diese Seite
  res.set('Content-Security-Policy', 'sandbox allow-scripts allow-forms allow-popups');
  res.set('X-Content-Type-Options', 'nosniff');
  next();
}, express.static(SITES, { dotfiles: 'ignore', index: 'index.html' }));

app.post('/api/bots', async (req, res) => {
  const { token, commands } = req.body || {};
  if (typeof token !== 'string' || token.length < 30 || token.length > 200)
    return res.status(400).json({ error: 'Der Token sieht nicht richtig aus.' });
  const list = [], seen = new Set();
  for (const c of Array.isArray(commands) ? commands.slice(0, 5) : []) {
    const name = String((c && c.name) || '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 32);
    const reply = String((c && c.reply) || '').slice(0, 2000);
    if (name && reply && !seen.has(name)) { seen.add(name); list.push({ name, reply }); }
  }
  if (!list.length) return res.status(400).json({ error: 'Mindestens ein Befehl mit Antwort ist nötig.' });
  if (Object.keys(db.bots).length >= MAX_BOTS) return res.status(503).json({ error: 'Alle Bot-Plätze sind belegt.' });
  const id = rnd(6), key = rnd(16);
  db.bots[id] = { token: enc(token.trim()), commands: list, keyHash: hash(key) };
  try { await startBot(id); save(); res.json({ id, key }); }
  catch { delete db.bots[id]; res.status(400).json({ error: 'Der Bot konnte sich nicht anmelden. Prüfe den Token.' }); }
});

app.post('/api/sites', async (req, res) => {
  const m = /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/.exec(String((req.body || {}).url || '').trim());
  if (!m) return res.status(400).json({ error: 'Bitte einen Link wie https://github.com/name/repo angeben.' });
  if (Object.keys(db.sites).length >= MAX_SITES) return res.status(503).json({ error: 'Alle Website-Plätze sind belegt.' });
  const id = rnd(6), key = rnd(16), dir = path.join(SITES, id);
  try {
    const r = await fetch('https://github.com/' + m[1] + '/' + m[2] + '/archive/HEAD.zip');
    if (!r.ok) return res.status(400).json({ error: 'Das Repository wurde nicht gefunden. Es muss öffentlich sein.' });
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > 20 * 1024 * 1024) return res.status(400).json({ error: 'Das Repository ist größer als 20 MB.' });
    const zip = new AdmZip(buf);
    const entries = zip.getEntries();
    if (entries.reduce((s, e) => s + e.header.size, 0) > 50 * 1024 * 1024)
      return res.status(400).json({ error: 'Das Repository ist entpackt zu groß.' });
    let hasIndex = false;
    for (const e of entries) {
      if (e.isDirectory) continue;
      const rel = e.entryName.split('/').slice(1).join('/');
      if (!rel) continue;
      const target = path.resolve(dir, rel);
      if (!target.startsWith(dir + path.sep)) continue;
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, e.getData());
      if (rel === 'index.html') hasIndex = true;
    }
    if (!hasIndex) {
      fs.rmSync(dir, { recursive: true, force: true });
      return res.status(400).json({ error: 'Im obersten Ordner des Repositorys fehlt eine index.html.' });
    }
    db.sites[id] = { keyHash: hash(key) };
    save();
    res.json({ id, key, url: '/sites/' + id + '/' });
  } catch {
    fs.rmSync(dir, { recursive: true, force: true });
    res.status(400).json({ error: 'Die Website konnte nicht geladen werden.' });
  }
});

for (const kind of ['bots', 'sites']) {
  app.delete('/api/' + kind + '/:id', async (req, res) => {
    const id = req.params.id, item = db[kind][id];
    const given = hash(String(req.get('x-key') || ''));
    if (!item || !crypto.timingSafeEqual(Buffer.from(given), Buffer.from(item.keyHash)))
      return res.status(403).json({ error: 'Falsche ID oder falscher Schlüssel.' });
    if (kind === 'bots') { if (clients[id]) await clients[id].destroy(); delete clients[id]; }
    else fs.rmSync(path.join(SITES, id), { recursive: true, force: true });
    delete db[kind][id];
    save();
    res.json({ ok: true });
  });
}

for (const id of Object.keys(db.bots))
  startBot(id).catch(e => console.error('Bot', id, 'startet nicht:', e.message));
app.listen(PORT, () => console.log('Läuft auf http://localhost:' + PORT));
