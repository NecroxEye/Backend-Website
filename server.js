const express = require('express');
const cors = require('cors');
const http = require('http');
const { WebSocketServer } = require('ws');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PORT = process.env.PORT || 3000;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('FATAL: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

app.get('/health', (req, res) => {
  res.status(200).json({
    ok: true,
    status: 'running',
    time: new Date().toISOString()
  });
});

app.get('/players', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('players')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) return res.status(500).json({ error: error.message });
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/players', async (req, res) => {
  try {
    const body = req.body || {};

    const row = {
      name: String(body.name || '').trim(),
      signal_strength: Number.isFinite(Number(body.signal_strength)) ? Number(body.signal_strength) : 15,
      direction: String(body.direction || '').trim(),
      channel_name: String(body.channel_name || '').trim(),
      computer_name: String(body.computer_name || '').trim(),
      is_admin: !!body.is_admin
    };

    if (!row.name || !row.direction) {
      return res.status(400).json({ error: 'name and direction are required' });
    }

    const { data, error } = await supabase
      .from('players')
      .insert([row])
      .select('*')
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/players/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body || {};

    const updateData = {};
    if (body.name !== undefined) updateData.name = String(body.name).trim();
    if (body.signal_strength !== undefined) {
      updateData.signal_strength = Number.isFinite(Number(body.signal_strength)) ? Number(body.signal_strength) : 15;
    }
    if (body.direction !== undefined) updateData.direction = String(body.direction).trim();
    if (body.channel_name !== undefined) updateData.channel_name = String(body.channel_name).trim();
    if (body.computer_name !== undefined) updateData.computer_name = String(body.computer_name).trim();
    if (body.is_admin !== undefined) updateData.is_admin = !!body.is_admin;

    const { data, error } = await supabase
      .from('players')
      .update(updateData)
      .eq('id', id)
      .select('*')
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/players/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('players')
      .delete()
      .eq('id', id);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/trigger/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { data: player, error } = await supabase
      .from('players')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !player) {
      return res.status(404).json({ error: 'Player not found' });
    }

    const payload = {
      type: 'pearl',
      player: player.name,
      direction: player.direction,
      signal_strength: player.signal_strength,
      channel_name: player.channel_name,
      computer_name: player.computer_name
    };

    const message = JSON.stringify(payload);

    for (const client of wss.clients) {
      if (client.readyState === 1) {
        client.send(message);
      }
    }

    res.json({
      success: true,
      sent: payload,
      connected_clients: [...wss.clients].filter(c => c.readyState === 1).length
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

server.on('upgrade', (request, socket, head) => {
  const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;

  if (pathname === '/ws') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

wss.on('connection', (ws) => {
  console.log('WebSocket client connected');

  ws.send(JSON.stringify({
    type: 'welcome',
    message: 'Connected to backend'
  }));

  ws.on('message', (msg) => {
    console.log('WS message:', msg.toString());
  });

  ws.on('close', () => {
    console.log('WebSocket client disconnected');
  });

  ws.on('error', (err) => {
    console.log('WebSocket error:', err.message);
  });
});

setInterval(() => {
  const ping = JSON.stringify({ type: 'ping', time: Date.now() });

  for (const client of wss.clients) {
    if (client.readyState === 1) {
      client.send(ping);
    }
  }
}, 30000);

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
