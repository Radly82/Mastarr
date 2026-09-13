const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const { DatabaseSync } = require('node:sqlite');
const scrypt = promisify(crypto.scrypt);
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const token = () => crypto.randomBytes(32).toString('base64url');

class Store {
  constructor(directory) {
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    this.directory = directory;
    const keyPath = path.join(directory, 'encryption.key');
    const databasePath = path.join(directory, 'mastarr.db');
    if (!fs.existsSync(keyPath)) {
      if (fs.existsSync(databasePath))
        throw new Error('Encryption key missing. Restore the complete configuration backup.');
      fs.writeFileSync(keyPath, crypto.randomBytes(32), { mode: 0o600, flag: 'wx' });
    }
    this.key = fs.readFileSync(keyPath);
    if (this.key.length !== 32) throw new Error('Invalid configuration encryption key.');
    this.db = new DatabaseSync(databasePath);
    fs.chmodSync(databasePath, 0o600);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS settings (id TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, password TEXT NOT NULL, role TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, csrf TEXT NOT NULL, expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY, time TEXT NOT NULL, action TEXT NOT NULL, title TEXT NOT NULL, user TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS operations (id TEXT PRIMARY KEY, digest TEXT NOT NULL, result TEXT, created INTEGER NOT NULL);
      PRAGMA user_version=1;`);
    this.setupPath = path.join(directory, 'setup-token');
    if (!this.hasUsers() && !fs.existsSync(this.setupPath))
      fs.writeFileSync(this.setupPath, token(), { mode: 0o600, flag: 'wx' });
  }
  hasUsers() {
    return this.db.prepare('SELECT COUNT(*) AS count FROM users').get().count > 0;
  }
  encrypt(value) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.key, iv);
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
    return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString('base64')).join('.');
  }
  decrypt(value) {
    const [iv, tag, encrypted] = value.split('.').map((part) => Buffer.from(part, 'base64'));
    const cipher = crypto.createDecipheriv('aes-256-gcm', this.key, iv);
    cipher.setAuthTag(tag);
    return JSON.parse(Buffer.concat([cipher.update(encrypted), cipher.final()]).toString());
  }
  get(id, fallback) {
    const row = this.db.prepare('SELECT value FROM settings WHERE id = ?').get(id);
    return row ? this.decrypt(row.value) : fallback;
  }
  set(id, value) {
    this.db
      .prepare(
        'INSERT INTO settings VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET value = excluded.value',
      )
      .run(id, this.encrypt(value));
  }
  services() {
    return this.get('services', {});
  }
  publicSettings() {
    const services = this.services();
    return {
      services: Object.fromEntries(
        ['sonarr', 'radarr', 'sabnzbd'].map((name) => {
          const { apiKey, ...rest } = services[name] || {};
          return [
            name,
            {
              enabled: false,
              url: '',
              fallbackUrl: '',
              defaultRootFolder: '',
              defaultQualityProfileId: 0,
              ...rest,
              hasApiKey: !!apiKey,
            },
          ];
        }),
      ),
      preferences: this.get('preferences', { name: 'Mastarr', refreshSeconds: 15 }),
      legacyAvailable: fs.existsSync(path.join(this.directory, 'settings.json')),
    };
  }
  async passwordHash(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const derived = await scrypt(password, salt, 64);
    return `${salt}:${derived.toString('hex')}`;
  }
  async verifyPassword(password, encoded) {
    const [salt, expected] = (encoded || `${'0'.repeat(32)}:${'0'.repeat(128)}`).split(':');
    const derived = await scrypt(password, salt, 64);
    return crypto.timingSafeEqual(derived, Buffer.from(expected, 'hex'));
  }
  async addUser(username, password, role = 'admin', first = false) {
    const encoded = await this.passwordHash(password);
    if (first && this.hasUsers())
      throw Object.assign(new Error('Setup is already complete.'), { status: 409 });
    const id = crypto.randomUUID();
    try {
      this.db.prepare('INSERT INTO users VALUES (?, ?, ?, ?)').run(id, username, encoded, role);
    } catch {
      throw Object.assign(new Error('That username is already in use.'), { status: 409 });
    }
    if (first && fs.existsSync(this.setupPath)) fs.unlinkSync(this.setupPath);
    return { id, username, role };
  }
  userByName(username) {
    return this.db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  }
  users() {
    return this.db.prepare('SELECT id, username, role FROM users ORDER BY username').all();
  }
  newSession(user) {
    const raw = token();
    const csrf = token();
    this.db.prepare('DELETE FROM sessions WHERE expires < ?').run(Date.now());
    this.db
      .prepare('INSERT INTO sessions VALUES (?, ?, ?, ?)')
      .run(hash(raw), user.id, csrf, Date.now() + 7 * 86400000);
    return { raw, csrf, user: { id: user.id, username: user.username, role: user.role } };
  }
  session(raw) {
    if (!raw || raw.length > 128) return null;
    return this.db
      .prepare(
        'SELECT u.id, u.username, u.role, s.csrf FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires > ?',
      )
      .get(hash(raw), Date.now());
  }
  logout(raw) {
    this.db.prepare('DELETE FROM sessions WHERE token = ?').run(hash(raw || ''));
  }
  event(action, title, username) {
    this.db
      .prepare('INSERT INTO events (time, action, title, user) VALUES (?, ?, ?, ?)')
      .run(new Date().toISOString(), action, String(title).slice(0, 200), username);
    this.db.exec(
      'DELETE FROM events WHERE id NOT IN (SELECT id FROM events ORDER BY id DESC LIMIT 500)',
    );
  }
  events() {
    return this.db.prepare('SELECT * FROM events ORDER BY id DESC LIMIT 30').all();
  }
  reserve(id, digest) {
    this.db.prepare('DELETE FROM operations WHERE created < ?').run(Date.now() - 86400000);
    const old = this.db.prepare('SELECT * FROM operations WHERE id = ?').get(id);
    if (old) {
      if (old.digest !== digest)
        throw Object.assign(
          new Error('Request identifier was already used for a different action.'),
          { status: 409 },
        );
      if (!old.result)
        throw Object.assign(
          new Error(
            'This action is already running or its outcome is unknown. Check Activity before retrying.',
          ),
          { status: 409 },
        );
      return JSON.parse(old.result);
    }
    this.db.prepare('INSERT INTO operations VALUES (?, ?, NULL, ?)').run(id, digest, Date.now());
    return null;
  }
  complete(id, result) {
    this.db
      .prepare('UPDATE operations SET result = ? WHERE id = ?')
      .run(JSON.stringify(result), id);
  }
  close() {
    this.db.close();
  }
}
module.exports = { Store, hash, token };
