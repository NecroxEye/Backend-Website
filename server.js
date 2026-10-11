const express = require('express');
const session = require('express-session');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function loadJSON(file, fallback) {
  const filePath = path.join(DATA_DIR, file);
  try {
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, JSON.stringify(fallback, null, 2));
      return structuredClone(fallback);
    }
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return structuredClone(fallback);
  }
}

function saveJSON(file, data) {
  const filePath = path.join(DATA_DIR, file);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

const defaultUsers = [
  {
    id: 1,
    username: 'Fr05tedF4ng5',
    password: 'Frosting',
    isAdmin: true,
    canPull: true,
    allFolders: true,
    allowedFolders: []
  },
  {
    id: 2,
    username: 'Frosted',
    password: 'Genius',
    isAdmin: false,
    canPull: true,
    allFolders: true,
    allowedFolders: []
  },
  {
    id: 3,
    username: 'LakIo',
    password: 'RedEye',
    isAdmin: false,
    canPull: true,
    allFolders: false,
    allowedFolders: ['LakIo']
  }
];

const defaultPlayers = [
  {
    id: 1,
    name: 'Example Player',
    computer_name: 'LakIo',
    folder_name: 'LakIo',
    channel_name: '',
    direction: 'back',
    signal_strength: 15
  }
];

const defaultTriggers = [];

let users = loadJSON('users.json', defaultUsers);
let players = loadJSON('players.json', defaultPlayers);
let triggers = loadJSON('triggers.json', defaultTriggers);

app.set('trust proxy', 1);

app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use(session({
  secret: process.env.SESSION_SECRET || 'change_this_secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    // For local http testing, set secure: false and sameSite: 'lax'
    // For HTTPS deployments, keep secure: true and sameSite: 'none'
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
  }
}));

app.use(passport.initialize());
app.use(passport.session());

passport.use(new LocalStrategy((username, password, done) => {
  const user = users.find(u => u.username === username);
  if (!user) return done(null, false, { message: 'Invalid username' });
  if (user.password !== password) return done(null, false, { message: 'Invalid password' });
  return done(null, user);
}));

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser((id, done) => {
  const user = users.find(u => Number(u.id) === Number(id));
  done(null, user || false);
});

function ensureAuth(req, res, next) {
  if (req.isAuthenticated && req.isAuthenticated()) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}

function ensureAdmin(req, res, next) {
  if (req.isAuthenticated && req.isAuthenticated() && req.user && req.user.isAdmin) return next();
  return res.status(403).json({ error: 'Admin Only' });
}

function canSeeFolder(user, folder) {
  if (!user) return false;
  if (user.isAdmin || user.allFolders) return true;
  return Array.isArray(user.allowedFolders) && user.allowedFolders.includes(folder);
}

function visiblePlayersFor(user) {
  if (!user) return [];
  if (user.isAdmin || user.allFolders) return players;
  return players.filter(p => canSeeFolder(user, p.folder_name));
}

function cleanExpiredTriggers() {
  const now = Date.now();
  triggers = triggers.filter(t => !t.expiresAt || t.expiresAt > now);
}

function persistAll() {
  saveJSON('users.json', users);
  saveJSON('players.json', players);
  saveJSON('triggers.json', triggers);
}

app.get('/health', (req, res) => {
  res.json({ status: 'ON' });
});

app.post('/auth/local/login', passport.authenticate('local'), (req, res) => {
  res.json({
    ok: true,
    user: {
      username: req.user.username,
      isAdmin: !!req.user.isAdmin,
      canPull: !!req.user.canPull,
      allFolders: !!req.user.allFolders,
      allowedFolders: req.user.allowedFolders || []
    }
  });
});

app.get('/auth/me', (req, res) => {
  if (!req.user) return res.json({ user: null });

  res.json({
    user: {
      username: req.user.username,
      isAdmin: !!req.user.isAdmin,
      canPull: !!req.user.canPull,
      allFolders: !!req.user.allFolders,
      allowedFolders: req.user.allowedFolders || []
    }
  });
});

app.post('/auth/logout', (req, res) => {
  req.logout(() => {
    req.session.destroy(() => {
      res.clearCookie('connect.sid');
      res.json({ ok: true });
    });
  });
});

/*
  ComputerCraft compatibility:
  - CC Lua does GET /trigger?computer_name=LakIo
  - Server returns { trigger: null } or { trigger: { computer_name, direction } }
  - POST /trigger queues a trigger for the website
*/
app.get('/trigger', (req, res) => {
  const computerName = String(req.query.computer_name || '').trim();
  if (!computerName) return res.status(400).json({ error: 'Missing computer_name' });

  cleanExpiredTriggers();

  const idx = triggers.findIndex(t => String(t.computer_name) === computerName);
  if (idx === -1) return res.json({ trigger: null });

  const trigger = triggers.splice(idx, 1)[0];
  saveJSON('triggers.json', triggers);

  return res.json({
    trigger: {
      computer_name: trigger.computer_name,
      direction: trigger.direction
    }
  });
});

app.post('/trigger', ensureAuth, (req, res) => {
  const { computer_name, direction } = req.body || {};
  if (!computer_name || !direction) {
    return res.status(400).json({ error: 'Missing computer_name or direction' });
  }

  if (!req.user.canPull && !req.user.isAdmin) {
    return res.status(403).json({ error: 'Pull permission denied' });
  }

  const targetFolder = String(req.body.folder_name || computer_name).trim();
  if (!req.user.isAdmin && !canSeeFolder(req.user, targetFolder)) {
    return res.status(403).json({ error: 'No permission for this folder' });
  }

  const ttl = 1500; // trigger lives long enough for 1s CC polling
  triggers.push({
    computer_name: String(computer_name).trim(),
    direction: String(direction).trim(),
    createdAt: Date.now(),
    expiresAt: Date.now() + ttl
  });

  saveJSON('triggers.json', triggers);
  res.json({ ok: true });
});

app.get('/status', ensureAuth, (req, res) => {
  res.json({ players: visiblePlayersFor(req.user) });
});

app.get('/players', ensureAuth, (req, res) => {
  res.json({ players: visiblePlayersFor(req.user) });
});

app.post('/players', ensureAdmin, (req, res) => {
  const { name, computer_name, folder_name, channel_name, direction, signal_strength } = req.body || {};
  if (!name || !computer_name || !folder_name) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const newPlayer = {
    id: Date.now(),
    name: String(name),
    computer_name: String(computer_name),
    folder_name: String(folder_name),
    channel_name: String(channel_name || ''),
    direction: String(direction || 'left'),
    signal_strength: Number(signal_strength || 15)
  };

  players.push(newPlayer);
  saveJSON('players.json', players);
  res.json({ ok: true, player: newPlayer });
});

app.put('/players/:id', ensureAdmin, (req, res) => {
  const id = Number(req.params.id);
  const idx = players.findIndex(p => Number(p.id) === id);
  if (idx === -1) return res.status(404).json({ error: 'Player not found' });

  const { name, computer_name, folder_name, channel_name, direction, signal_strength } = req.body || {};

  players[idx] = {
    ...players[idx],
    name: name !== undefined ? String(name) : players[idx].name,
    computer_name: computer_name !== undefined ? String(computer_name) : players[idx].computer_name,
    folder_name: folder_name !== undefined ? String(folder_name) : players[idx].folder_name,
    channel_name: channel_name !== undefined ? String(channel_name) : players[idx].channel_name,
    direction: direction !== undefined ? String(direction) : players[idx].direction,
    signal_strength: signal_strength !== undefined ? Number(signal_strength) : players[idx].signal_strength
  };

  saveJSON('players.json', players);
  res.json({ ok: true, player: players[idx] });
});

app.delete('/players/:id', ensureAdmin, (req, res) => {
  const id = Number(req.params.id);
  const before = players.length;
  players = players.filter(p => Number(p.id) !== id);
  if (players.length === before) return res.status(404).json({ error: 'Player not found' });

  saveJSON('players.json', players);
  res.json({ ok: true });
});

app.get('/admin/users', ensureAdmin, (req, res) => {
  res.json({
    users: users.map(({ password, ...u }) => u)
  });
});

app.post('/admin/users', ensureAdmin, (req, res) => {
  const { username, password, isAdmin, canPull, allFolders, allowedFolders } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Missing username or password' });
  }
  if (users.some(u => u.username === username)) {
    return res.status(409).json({ error: 'Username already exists' });
  }

  const newUser = {
    id: Date.now(),
    username: String(username),
    password: String(password),
    isAdmin: !!isAdmin,
    canPull: canPull !== undefined ? !!canPull : true,
    allFolders: !!allFolders,
    allowedFolders: Array.isArray(allowedFolders) ? allowedFolders.map(String) : []
  };

  users.push(newUser);
  saveJSON('users.json', users);

  const { password: _, ...safeUser } = newUser;
  res.json({ ok: true, user: safeUser });
});

app.put('/admin/users/:id', ensureAdmin, (req, res) => {
  const id = Number(req.params.id);
  const idx = users.findIndex(u => Number(u.id) === id);
  if (idx === -1) return res.status(404).json({ error: 'User not found' });

  const { username, password, isAdmin, canPull, allFolders, allowedFolders } = req.body || {};

  if (username && users.some(u => u.username === username && Number(u.id) !== id)) {
    return res.status(409).json({ error: 'Username already exists' });
  }

  users[idx] = {
    ...users[idx],
    username: username !== undefined ? String(username) : users[idx].username,
    password: password !== undefined && password !== '' ? String(password) : users[idx].password,
    isAdmin: isAdmin !== undefined ? !!isAdmin : users[idx].isAdmin,
    canPull: canPull !== undefined ? !!canPull : users[idx].canPull,
    allFolders: allFolders !== undefined ? !!allFolders : users[idx].allFolders,
    allowedFolders: Array.isArray(allowedFolders) ? allowedFolders.map(String) : users[idx].allowedFolders
  };

  saveJSON('users.json', users);

  const { password: _, ...safeUser } = users[idx];
  res.json({ ok: true, user: safeUser });
});

app.delete('/admin/users/:id', ensureAdmin, (req, res) => {
  const id = Number(req.params.id);

  if (users.some(u => Number(u.id) === id && u.username === req.user.username)) {
    return res.status(400).json({ error: 'You cannot delete your own active account' });
  }

  const before = users.length;
  users = users.filter(u => Number(u.id) !== id);
  if (users.length === before) return res.status(404).json({ error: 'User not found' });

  saveJSON('users.json', users);
  res.json({ ok: true });
});

app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
