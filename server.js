const express = require('express');
const session = require('express-session');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const PORT = process.env.PORT || 3000;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SESSION_SECRET = process.env.SESSION_SECRET || 'change_this_secret';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.warn('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const app = express();

app.set('trust proxy', 1);

app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    // For localhost HTTP testing:
    // secure: false, sameSite: 'lax'
    //
    // For HTTPS deployment:
    // secure: true, sameSite: 'none'
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
  }
}));

app.use(passport.initialize());
app.use(passport.session());

function safeUser(user) {
  if (!user) return null;
  const { password, ...rest } = user;
  return {
    username: rest.username,
    isAdmin: !!rest.is_admin ?? !!rest.isAdmin,
    canPull: !!rest.can_pull ?? !!rest.canPull,
    allFolders: !!rest.all_folders ?? !!rest.allFolders,
    allowedFolders: rest.allowed_folders ?? rest.allowedFolders ?? []
  };
}

async function fetchUserByUsername(username) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('username', username)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function fetchUserById(id) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

function userCanSeeFolder(user, folder) {
  if (!user) return false;
  if (user.is_admin || user.isAdmin) return true;
  if (user.all_folders || user.allFolders) return true;
  const allowed = user.allowed_folders ?? user.allowedFolders ?? [];
  return Array.isArray(allowed) && allowed.includes(folder);
}

function normalizeUserRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    password: row.password,
    isAdmin: !!(row.is_admin ?? row.isAdmin),
    canPull: !!(row.can_pull ?? row.canPull),
    allFolders: !!(row.all_folders ?? row.allFolders),
    allowedFolders: row.allowed_folders ?? row.allowedFolders ?? []
  };
}

passport.use(new LocalStrategy(async (username, password, done) => {
  try {
    const user = normalizeUserRow(await fetchUserByUsername(username));
    if (!user) return done(null, false, { message: 'Invalid username' });
    if (String(user.password) !== String(password)) return done(null, false, { message: 'Invalid password' });
    return done(null, user);
  } catch (err) {
    return done(err);
  }
}));

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
  try {
    const row = normalizeUserRow(await fetchUserById(id));
    done(null, row || false);
  } catch (err) {
    done(err);
  }
});

function ensureAuth(req, res, next) {
  if (req.isAuthenticated && req.isAuthenticated()) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}

function ensureAdmin(req, res, next) {
  if (req.isAuthenticated && req.isAuthenticated() && req.user && req.user.isAdmin) return next();
  return res.status(403).json({ error: 'Admin Only' });
}

let triggerQueue = [];

function cleanExpiredTriggers() {
  const now = Date.now();
  triggerQueue = triggerQueue.filter(t => !t.expiresAt || t.expiresAt > now);
}

async function loadTriggersFromDb() {
  const { data, error } = await supabase
    .from('triggers')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) throw error;

  triggerQueue = (data || []).map(t => ({
    id: t.id,
    computer_name: t.computer_name,
    direction: t.direction,
    createdAt: t.created_at ? new Date(t.created_at).getTime() : Date.now(),
    expiresAt: t.expires_at ? new Date(t.expires_at).getTime() : null
  }));

  cleanExpiredTriggers();
}

async function persistTrigger(trigger) {
  const payload = {
    computer_name: trigger.computer_name,
    direction: trigger.direction,
    created_at: new Date(trigger.createdAt).toISOString(),
    expires_at: new Date(trigger.expiresAt).toISOString()
  };

  const { data, error } = await supabase
    .from('triggers')
    .insert([payload])
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function deleteTriggerById(id) {
  const { error } = await supabase.from('triggers').delete().eq('id', id);
  if (error) throw error;
}

async function getVisiblePlayersForUser(user) {
  const { data, error } = await supabase.from('players').select('*');
  if (error) throw error;

  const allPlayers = data || [];
  if (!user) return [];

  if (user.isAdmin || user.is_admin || user.allFolders || user.all_folders) {
    return allPlayers;
  }

  const allowed = user.allowedFolders || user.allowed_folders || [];
  return allPlayers.filter(p => allowed.includes(p.folder_name));
}

async function getPlayerById(id) {
  const { data, error } = await supabase
    .from('players')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

/* HEALTH */
app.get('/health', (req, res) => {
  res.json({ status: 'ON' });
});

/* AUTH */
app.post('/auth/local/login', passport.authenticate('local'), (req, res) => {
  res.json({
    ok: true,
    user: safeUser(req.user)
  });
});

app.get('/auth/me', (req, res) => {
  if (!req.user) return res.json({ user: null });
  res.json({ user: safeUser(req.user) });
});

app.post('/auth/logout', (req, res) => {
  req.logout(() => {
    req.session.destroy(() => {
      res.clearCookie('connect.sid');
      res.json({ ok: true });
    });
  });
});

/* STATUS */
app.get('/status', ensureAuth, async (req, res) => {
  try {
    const players = await getVisiblePlayersForUser(req.user);
    res.json({
      username: req.user.username,
      isAdmin: !!req.user.isAdmin,
      canPull: !!req.user.canPull,
      allFolders: !!req.user.allFolders,
      allowedFolders: req.user.allowedFolders || [],
      players
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load status' });
  }
});

/* COMPUTERCRAFT TRIGGER QUEUE */
app.get('/trigger', async (req, res) => {
  try {
    const computerName = String(req.query.computer_name || '').trim();
    if (!computerName) return res.status(400).json({ error: 'Missing computer_name' });

    await loadTriggersFromDb();
    cleanExpiredTriggers();

    const index = triggerQueue.findIndex(t => String(t.computer_name) === computerName);
    if (index === -1) return res.json({ trigger: null });

    const trigger = triggerQueue.splice(index, 1)[0];
    if (trigger.id) {
      await deleteTriggerById(trigger.id);
    }

    return res.json({
      trigger: {
        computer_name: trigger.computer_name,
        direction: trigger.direction
      }
    });
  } catch (err) {
    return res.status(500).json({ error: 'Trigger lookup failed' });
  }
});

app.post('/trigger', ensureAuth, async (req, res) => {
  try {
    const { computer_name, direction } = req.body || {};
    if (!computer_name || !direction) {
      return res.status(400).json({ error: 'Missing computer_name or direction' });
    }

    if (!req.user.isAdmin && !req.user.canPull) {
      return res.status(403).json({ error: 'Pull permission denied' });
    }

    const targetFolder = String(req.body.folder_name || computer_name).trim();
    if (!req.user.isAdmin && !userCanSeeFolder(req.user, targetFolder)) {
      return res.status(403).json({ error: 'No permission for this folder' });
    }

    const now = Date.now();
    const trigger = {
      computer_name: String(computer_name).trim(),
      direction: String(direction).trim(),
      createdAt: now,
      expiresAt: now + 1500
    };

    const dbRow = await persistTrigger(trigger);
    triggerQueue.push({
      id: dbRow.id,
      computer_name: dbRow.computer_name,
      direction: dbRow.direction,
      createdAt: trigger.createdAt,
      expiresAt: trigger.expiresAt
    });

    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to queue trigger' });
  }
});

/* PLAYERS */
app.get('/players', ensureAuth, async (req, res) => {
  try {
    const players = await getVisiblePlayersForUser(req.user);
    res.json({ players });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load players' });
  }
});

app.post('/players', ensureAdmin, async (req, res) => {
  try {
    const { name, computer_name, folder_name, channel_name, direction, signal_strength } = req.body || {};
    if (!name || !computer_name || !folder_name) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const payload = {
      name: String(name),
      computer_name: String(computer_name),
      folder_name: String(folder_name),
      channel_name: String(channel_name || ''),
      direction: String(direction || 'left'),
      signal_strength: Number(signal_strength || 15)
    };

    const { data, error } = await supabase.from('players').insert([payload]).select().single();
    if (error) return res.status(500).json({ error: 'Failed to create player' });

    res.json({ ok: true, player: data });
  } catch {
    res.status(500).json({ error: 'Failed to create player' });
  }
});

app.put('/players/:id', ensureAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = await getPlayerById(id);
    if (!existing) return res.status(404).json({ error: 'Player not found' });

    const { name, computer_name, folder_name, channel_name, direction, signal_strength } = req.body || {};
    const payload = {
      name: name !== undefined ? String(name) : existing.name,
      computer_name: computer_name !== undefined ? String(computer_name) : existing.computer_name,
      folder_name: folder_name !== undefined ? String(folder_name) : existing.folder_name,
      channel_name: channel_name !== undefined ? String(channel_name) : existing.channel_name,
      direction: direction !== undefined ? String(direction) : existing.direction,
      signal_strength: signal_strength !== undefined ? Number(signal_strength) : existing.signal_strength
    };

    const { data, error } = await supabase
      .from('players')
      .update(payload)
      .eq('id', id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: 'Failed to update player' });
    res.json({ ok: true, player: data });
  } catch {
    res.status(500).json({ error: 'Failed to update player' });
  }
});

app.delete('/players/:id', ensureAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { error } = await supabase.from('players').delete().eq('id', id);
    if (error) return res.status(500).json({ error: 'Failed to delete player' });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Failed to delete player' });
  }
});

/* ADMIN USERS */
app.get('/admin/users', ensureAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, username, is_admin, can_pull, all_folders, allowed_folders')
      .order('id', { ascending: true });

    if (error) return res.status(500).json({ error: 'Failed to load users' });

    res.json({
      users: (data || []).map(u => ({
        id: u.id,
        username: u.username,
        isAdmin: !!u.is_admin,
        canPull: !!u.can_pull,
        allFolders: !!u.all_folders,
        allowedFolders: u.allowed_folders || []
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
      ok: true,
      user: {
        id: data.id,
        username: data.username,
        isAdmin: !!data.is_admin,
        canPull: !!data.can_pull,
        allFolders: !!data.all_folders,
        allowedFolders: data.allowed_folders || []
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
      ok: true,
      user: {
        id: data.id,
        username: data.username,
        isAdmin: !!data.is_admin,
        canPull: !!data.can_pull,
        allFolders: !!data.all_folders,
        allowedFolders: data.allowed_folders || []
      }
    });
  } catch {
    res.status(500).json({ error: 'Failed to update user' });
  }
});

app.delete('/admin/users/:id', ensureAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (req.user && Number(req.user.id) === id) {
      return res.status(400).json({ error: 'You cannot delete your own active account' });
    }

    const { error } = await supabase.from('users').delete().eq('id', id);
    if (error) return res.status(500).json({ error: 'Failed to delete user' });

    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
