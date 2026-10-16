const express = require('express');
const session = require('express-session');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const PORT = process.env.PORT || 3000;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SESSION_SECRET = process.env.SESSION_SECRET;

const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'https://necroxeye.github.io';
const ALLOWED_ORIGINS = new Set([
  'https://necroxeye.github.io',
  FRONTEND_ORIGIN,
  'http://localhost:3000',
  'http://127.0.0.1:3000'
]);

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SESSION_SECRET) {
  console.error('Missing required env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SESSION_SECRET');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const app = express();

app.set('trust proxy', 1);

app.use(cors({
  origin(origin, callback) {
    if (!origin || ALLOWED_ORIGINS.has(origin)) return callback(null, true);
    return callback(new Error(`Not allowed by CORS: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type']
}));

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use(session({
  name: 'connect.sid',
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  proxy: true,
  rolling: true,
  cookie: {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    maxAge: 1000 * 60 * 60 * 24 * 7
  }
}));

function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    isAdmin: !!row.is_admin,
    canPull: !!row.can_pull,
    allFolders: !!row.all_folders,
    allowedFolders: Array.isArray(row.allowed_folders) ? row.allowed_folders : []
  };
}

function ensureAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}

function ensureAdmin(req, res, next) {
  if (req.session && req.session.user && req.session.user.isAdmin) return next();
  return res.status(403).json({ error: 'Admin only' });
}

function canSeeFolder(user, folderName) {
  if (!user) return false;
  if (user.isAdmin || user.allFolders) return true;
  return Array.isArray(user.allowedFolders) && user.allowedFolders.includes(folderName);
}

function normalizeFolderName(player) {
  return String(player.folder_name || player.computer_name || 'Unassigned').trim() || 'Unassigned';
}

async function lookupUser(username, password) {
  const usernameClean = String(username || '').trim();
  const passwordClean = String(password || '').trim();

  return await supabase
    .from('users')
    .select('*')
    .eq('username', usernameClean)
    .eq('password', passwordClean)
    .maybeSingle();
}

async function getAllPlayers() {
  return await supabase.from('players').select('*').order('id', { ascending: true });
}

async function getAllUsersPublic() {
  return await supabase
    .from('users')
    .select('id, username, is_admin, can_pull, all_folders, allowed_folders')
    .order('id', { ascending: true });
}

app.get('/health', (req, res) => {
  res.json({ status: 'ON' });
});

app.get('/debug/session', (req, res) => {
  res.json({
    hasSession: !!req.session,
    sessionID: req.sessionID || null,
    sessionUser: req.session?.user || null,
    cookieHeader: req.headers.cookie || null,
    origin: req.headers.origin || null
  });
});

app.get('/debug/users', async (req, res) => {
  const { data, error } = await supabase.from('users').select('*');
  res.json({ data, error });
});

app.post('/debug/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    const { data, error } = await lookupUser(username, password);
    res.json({ found: !!data, data, error });
  } catch (err) {
    res.status(500).json({ error: err.message || 'debug login failed' });
  }
});

app.post('/auth/local/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    console.log('[LOGIN] attempt:', username, 'origin:', req.headers.origin);

    if (!username || !password) {
      return res.status(400).json({ error: 'Missing username or password' });
    }

    const { data, error } = await lookupUser(username, password);

    if (error) {
      console.error('[LOGIN] lookup error:', error);
      return res.status(500).json({ error: error.message || 'Login lookup failed' });
    }

    if (!data) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    req.session.user = publicUser(data);

    req.session.save((sessionErr) => {
      if (sessionErr) {
        console.error('[LOGIN] session save error:', sessionErr);
        return res.status(500).json({ error: 'Session save failed' });
      }

      console.log('[LOGIN] success:', req.session.user.username, 'sessionID:', req.sessionID);
      return res.json({ user: req.session.user });
    });
  } catch (err) {
    console.error('[LOGIN] fatal error:', err);
    return res.status(500).json({ error: err.message || 'Login failed' });
  }
});

app.get('/auth/me', (req, res) => {
  res.json({ user: req.session.user || null });
});

app.post('/auth/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid', {
      httpOnly: true,
      secure: true,
      sameSite: 'none'
    });
    res.json({ ok: true });
  });
});

app.get('/status', ensureAuth, async (req, res) => {
  try {
    const { data, error } = await getAllPlayers();
    if (error) return res.status(500).json({ error: 'Failed to load status' });

    const players = (data || []).filter(p => canSeeFolder(req.session.user, normalizeFolderName(p)));
    res.json({ user: req.session.user, players });
  } catch {
    res.status(500).json({ error: 'Failed to load status' });
  }
});

let triggerQueue = [];

function cleanExpiredTriggers() {
  const now = Date.now();
  triggerQueue = triggerQueue.filter(t => t.expiresAt > now);
}

app.get('/trigger', async (req, res) => {
  try {
    const computerName = String(req.query.computer_name || '').trim();
    if (!computerName) {
      return res.status(400).json({ error: 'Missing computer_name' });
    }

    cleanExpiredTriggers();

    const index = triggerQueue.findIndex(t => String(t.computer_name) === computerName);
    if (index === -1) {
      return res.json({ trigger: null });
    }

    const trigger = triggerQueue.splice(index, 1)[0];
    return res.json({
      trigger: {
        computer_name: trigger.computer_name,
        direction: trigger.direction
      }
    });
  } catch {
    return res.status(500).json({ error: 'Trigger lookup failed' });
  }
});

app.post('/trigger', ensureAuth, async (req, res) => {
  try {
    const { computer_name, direction, folder_name } = req.body || {};

    if (!computer_name || !direction) {
      return res.status(400).json({ error: 'Missing computer_name or direction' });
    }

    const user = req.session.user;

    if (!user.isAdmin && !user.canPull) {
      return res.status(403).json({ error: 'Pull permission denied' });
    }

    const folder = String(folder_name || computer_name).trim();
    if (!user.isAdmin && !canSeeFolder(user, folder)) {
      return res.status(403).json({ error: 'No access to that folder' });
    }

    const now = Date.now();
    triggerQueue.push({
      computer_name: String(computer_name).trim(),
      direction: String(direction).trim(),
      createdAt: now,
      expiresAt: now + 1500
    });

    return res.json({ ok: true });
  } catch {
    return res.status(500).json({ error: 'Failed to queue trigger' });
  }
});

app.get('/players', ensureAuth, async (req, res) => {
  try {
    const { data, error } = await getAllPlayers();
    if (error) return res.status(500).json({ error: 'Failed to load players' });

    const user = req.session.user;
    const players = (data || []).filter(p => user.isAdmin || user.allFolders || canSeeFolder(user, normalizeFolderName(p)));
    res.json({ players });
  } catch (err) {
    console.error('[PLAYERS GET] error:', err);
    res.status(500).json({ error: 'Failed to load players' });
  }
});

app.post('/players', ensureAdmin, async (req, res) => {
  try {
    const { name, computer_name, channel_name, folder_name, direction, signal_strength } = req.body || {};

    if (!name || !computer_name || !folder_name) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const payload = {
      name: String(name),
      computer_name: String(computer_name),
      channel_name: String(channel_name || ''),
      folder_name: String(folder_name),
      direction: String(direction || 'left'),
      signal_strength: Number(signal_strength || 15)
    };

    const { data, error } = await supabase
      .from('players')
      .insert([payload])
      .select()
      .single();

    if (error) {
      console.error('[PLAYERS POST] error:', error);
      return res.status(500).json({ error: error.message || 'Failed to create player' });
    }

    res.json({ player: data });
  } catch (err) {
    console.error('[PLAYERS POST] exception:', err);
    res.status(500).json({ error: err.message || 'Failed to create player' });
  }
});

app.put('/players/:id', ensureAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: 'Invalid player id' });
    }

    const { data: existing, error: findError } = await supabase
      .from('players')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (findError) {
      console.error('[PLAYERS PUT] load error:', findError);
      return res.status(500).json({ error: findError.message || 'Failed to load player' });
    }

    if (!existing) {
      return res.status(404).json({ error: 'Player not found' });
    }

    const { name, computer_name, channel_name, folder_name, direction, signal_strength } = req.body || {};

    const payload = {
      name: name !== undefined ? String(name) : existing.name,
      computer_name: computer_name !== undefined ? String(computer_name) : existing.computer_name,
      channel_name: channel_name !== undefined ? String(channel_name) : existing.channel_name,
      folder_name: folder_name !== undefined ? String(folder_name) : existing.folder_name,
      direction: direction !== undefined ? String(direction) : existing.direction,
      signal_strength: signal_strength !== undefined ? Number(signal_strength) : existing.signal_strength
    };

    const { data, error } = await supabase
      .from('players')
      .update(payload)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[PLAYERS PUT] update error:', error);
      return res.status(500).json({ error: error.message || 'Failed to update player' });
    }

    res.json({ player: data });
  } catch (err) {
    console.error('[PLAYERS PUT] exception:', err);
    res.status(500).json({ error: err.message || 'Failed to update player' });
  }
});

app.delete('/players/:id', ensureAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: 'Invalid player id' });
    }

    const { error } = await supabase.from('players').delete().eq('id', id);

    if (error) {
      console.error('[PLAYERS DELETE] error:', error);
      return res.status(500).json({ error: error.message || 'Failed to delete player' });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('[PLAYERS DELETE] exception:', err);
    res.status(500).json({ error: err.message || 'Failed to delete player' });
  }
});

app.get('/admin/users', ensureAdmin, async (req, res) => {
  try {
    const { data, error } = await getAllUsersPublic();
    if (error) return res.status(500).json({ error: 'Failed to load users' });

    res.json({
      users: (data || []).map(u => ({
        id: u.id,
        username: u.username,
        isAdmin: !!u.is_admin,
        canPull: !!u.can_pull,
        allFolders: !!u.all_folders,
        allowedFolders: Array.isArray(u.allowed_folders) ? u.allowed_folders : []
      }))
    });
  } catch {
    res.status(500).json({ error: 'Failed to load users' });
  }
});

app.post('/admin/users', ensureAdmin, async (req, res) => {
  try {
    const { username, password, isAdmin, canPull, allFolders, allowedFolders } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: 'Missing username or password' });
    }

    const payload = {
      username: String(username),
      password: String(password),
      is_admin: !!isAdmin,
      can_pull: canPull !== undefined ? !!canPull : true,
      all_folders: !!allFolders,
      allowed_folders: Array.isArray(allowedFolders) ? allowedFolders.map(String) : []
    };

    const { data, error } = await supabase
      .from('users')
      .insert([payload])
      .select('id, username, is_admin, can_pull, all_folders, allowed_folders')
      .single();

    if (error) return res.status(500).json({ error: 'Failed to create user' });

    res.json({
      user: {
        id: data.id,
        username: data.username,
        isAdmin: !!data.is_admin,
        canPull: !!data.can_pull,
        allFolders: !!data.all_folders,
        allowedFolders: Array.isArray(data.allowed_folders) ? data.allowed_folders : []
      }
    });
  } catch {
    res.status(500).json({ error: 'Failed to create user' });
  }
});

app.put('/admin/users/:id', ensureAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { username, password, isAdmin, canPull, allFolders, allowedFolders } = req.body || {};

    const payload = {};
    if (username !== undefined) payload.username = String(username);
    if (password !== undefined && password !== '') payload.password = String(password);
    if (isAdmin !== undefined) payload.is_admin = !!isAdmin;
    if (canPull !== undefined) payload.can_pull = !!canPull;
    if (allFolders !== undefined) payload.all_folders = !!allFolders;
    if (allowedFolders !== undefined) payload.allowed_folders = Array.isArray(allowedFolders) ? allowedFolders.map(String) : [];

    const { data, error } = await supabase
      .from('users')
      .update(payload)
      .eq('id', id)
      .select('id, username, is_admin, can_pull, all_folders, allowed_folders')
      .single();

    if (error) return res.status(500).json({ error: 'Failed to update user' });

    res.json({
      user: {
        id: data.id,
        username: data.username,
        isAdmin: !!data.is_admin,
        canPull: !!data.can_pull,
        allFolders: !!data.all_folders,
        allowedFolders: Array.isArray(data.allowed_folders) ? data.allowed_folders : []
      }
    });
  } catch {
    res.status(500).json({ error: 'Failed to update user' });
  }
});

app.delete('/admin/users/:id', ensureAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (req.session.user && Number(req.session.user.id) === id) {
      return res.status(400).json({ error: 'You cannot delete your own active account' });
    }

    const { error } = await supabase.from('users').delete().eq('id', id);
    if (error) return res.status(500).json({ error: 'Failed to delete user' });

    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

async function ensureSeedUser(username, password, extra = {}) {
  const { data } = await supabase.from('users').select('id').eq('username', username).maybeSingle();
  if (data) return;

  const payload = {
    username,
    password,
    is_admin: !!extra.is_admin,
    can_pull: extra.can_pull !== undefined ? !!extra.can_pull : true,
    all_folders: !!extra.all_folders,
    allowed_folders: Array.isArray(extra.allowed_folders) ? extra.allowed_folders : []
  };

  const { error } = await supabase.from('users').insert([payload]);
  if (error) console.error('Seed user insert failed:', username, error.message || error);
}

(async () => {
  await ensureSeedUser('Necrox', 'Rauln', {
    is_admin: true,
    can_pull: true,
    all_folders: true,
    allowed_folders: []
  });

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log('Allowed origins:', [...ALLOWED_ORIGINS]);
  });
})();
