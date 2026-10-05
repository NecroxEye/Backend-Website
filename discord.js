require('dotenv').config();

const express = require('express');
const axios = require('axios');
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActivityType
} = require('discord.js');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3001;

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const STATUS_LOG_CHANNEL_ID = process.env.STATUS_LOG_CHANNEL_ID;
const SYSTEM_STATUS_CHANNEL_ID = process.env.SYSTEM_STATUS_CHANNEL_ID;
const BOT_WEBHOOK_SECRET = process.env.BOT_WEBHOOK_SECRET;

const GAME_OVER_IMAGE_URL =
  process.env.GAME_OVER_IMAGE_URL ||
  'https://wallpapers.com/images/hd/dark-game-over-1920-x-1080-wallpaper-i26t6zc4u8hj29ea.jpg';

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

let statusMessageId = null;

const systemState = {
  backend: 'Off',
  website: 'Off',
  minecraftComputer: 'Off',
  computers: {
    'Oil Rig': 'Off',
    'Name': 'Off'
  },
  lastUpdatedAt: null
};

function isAuthorized(req) {
  return req.headers['x-bot-secret'] === BOT_WEBHOOK_SECRET;
}

function buildStatusText() {
  return [
    `Backend: ${systemState.backend}`,
    `Website: ${systemState.website}`,
    `Minecraft Computer: ${systemState.minecraftComputer}`,
    `Oil Rig: ${systemState.computers['Oil Rig']}`,
    `Name: ${systemState.computers['Name']}`
  ].join('\n');
}

function buildStatusEmbed() {
  return new EmbedBuilder()
    .setTitle('System Status')
    .setDescription(buildStatusText())
    .setColor(0x8af7ff)
    .setFooter({ text: 'Live status monitor' })
    .setTimestamp(new Date());
}

async function getChannel(channelId) {
  if (!channelId) return null;
  try {
    return await client.channels.fetch(channelId);
  } catch (err) {
    console.error(`Failed to fetch channel ${channelId}:`, err.message);
    return null;
  }
}

async function logMessage(content) {
  const channel = await getChannel(STATUS_LOG_CHANNEL_ID);
  if (!channel) return;
  await channel.send({ content });
}

async function sendGameOverEmbed(playerName) {
  const channel = await getChannel(STATUS_LOG_CHANNEL_ID);
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setTitle('GAME OVER')
    .setDescription(`Player **${playerName}** was kicked from the pearl pull system.`)
    .setColor(0x111111)
    .setImage(GAME_OVER_IMAGE_URL)
    .setTimestamp(new Date());

  await channel.send({ embeds: [embed] });
}

async function ensureStatusMessage() {
  const channel = await getChannel(SYSTEM_STATUS_CHANNEL_ID);
  if (!channel) return null;

  if (statusMessageId) {
    const existing = await channel.messages.fetch(statusMessageId).catch(() => null);
    if (existing) return existing;
  }

  const msg = await channel.send({ embeds: [buildStatusEmbed()] });
  statusMessageId = msg.id;
  return msg;
}

async function updateStatusMessage() {
  const msg = await ensureStatusMessage();
  if (!msg) return;
  await msg.edit({ embeds: [buildStatusEmbed()] });
}

function recalcMinecraftComputerState() {
  const anyOn = Object.values(systemState.computers).some(value => value === 'On');
  systemState.minecraftComputer = anyOn ? 'On' : 'Off';
}

app.get('/', (req, res) => {
  res.json({ ok: true, bot: 'online' });
});

app.get('/health', (req, res) => {
  res.json({
    ok: true,
    systemState,
    statusMessageId
  });
});

app.post('/api/log', async (req, res) => {
  if (!isAuthorized(req)) {
    return res.status(403).json({ ok: false, message: 'Unauthorized' });
  }

  try {
    const { message } = req.body;
    if (!message) {
      return res.status(400).json({ ok: false, message: 'Missing message' });
    }

    await logMessage(String(message));
    return res.json({ ok: true });
  } catch (err) {
    console.error('/api/log error:', err);
    return res.status(500).json({ ok: false, message: 'Internal error' });
  }
});

app.post('/api/pearl-pulled', async (req, res) => {
  if (!isAuthorized(req)) {
    return res.status(403).json({ ok: false, message: 'Unauthorized' });
  }

  try {
    const { playerName } = req.body;
    if (!playerName) {
      return res.status(400).json({ ok: false, message: 'Missing playerName' });
    }

    await logMessage(`Pearl Pulled on: ${playerName}`);
    return res.json({ ok: true });
  } catch (err) {
    console.error('/api/pearl-pulled error:', err);
    return res.status(500).json({ ok: false, message: 'Internal error' });
  }
});

app.post('/api/player-added', async (req, res) => {
  if (!isAuthorized(req)) {
    return res.status(403).json({ ok: false, message: 'Unauthorized' });
  }

  try {
    const { playerName } = req.body;
    if (!playerName) {
      return res.status(400).json({ ok: false, message: 'Missing playerName' });
    }

    await logMessage(`Player ${playerName} was added`);
    return res.json({ ok: true });
  } catch (err) {
    console.error('/api/player-added error:', err);
    return res.status(500).json({ ok: false, message: 'Internal error' });
  }
});

app.post('/api/player-kicked', async (req, res) => {
  if (!isAuthorized(req)) {
    return res.status(403).json({ ok: false, message: 'Unauthorized' });
  }

  try {
    const { playerName } = req.body;
    if (!playerName) {
      return res.status(400).json({ ok: false, message: 'Missing playerName' });
    }

    await logMessage(`Player ${playerName} was kicked`);
    await sendGameOverEmbed(playerName);
    return res.json({ ok: true });
  } catch (err) {
    console.error('/api/player-kicked error:', err);
    return res.status(500).json({ ok: false, message: 'Internal error' });
  }
});

app.post('/api/status', async (req, res) => {
  if (!isAuthorized(req)) {
    return res.status(403).json({ ok: false, message: 'Unauthorized' });
  }

  try {
    const { backend, website, computers } = req.body;

    if (typeof backend !== 'undefined') {
      systemState.backend = backend ? 'On' : 'Off';
    }

    if (typeof website !== 'undefined') {
      systemState.website = website ? 'Working' : 'Off';
    }

    if (computers && typeof computers === 'object') {
      for (const [name, state] of Object.entries(computers)) {
        systemState.computers[name] = state ? 'On' : 'Off';
      }
    }

    recalcMinecraftComputerState();
    systemState.lastUpdatedAt = Date.now();

    await updateStatusMessage();
    return res.json({ ok: true, systemState });
  } catch (err) {
    console.error('/api/status error:', err);
    return res.status(500).json({ ok: false, message: 'Internal error' });
  }
});

app.post('/api/computer-heartbeat', async (req, res) => {
  if (!isAuthorized(req)) {
    return res.status(403).json({ ok: false, message: 'Unauthorized' });
  }

  try {
    const { computerName } = req.body;
    if (!computerName) {
      return res.status(400).json({ ok: false, message: 'Missing computerName' });
    }

    systemState.computers[computerName] = 'On';
    recalcMinecraftComputerState();
    systemState.lastUpdatedAt = Date.now();

    await updateStatusMessage();
    return res.json({ ok: true });
  } catch (err) {
    console.error('/api/computer-heartbeat error:', err);
    return res.status(500).json({ ok: false, message: 'Internal error' });
  }
});

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);

  client.user.setPresence({
    activities: [{ name: 'Frosted Fang System', type: ActivityType.Watching }],
    status: 'online'
  });

  systemState.backend = 'On';
  systemState.website = 'Working';
  systemState.lastUpdatedAt = Date.now();

  await updateStatusMessage();
  await logMessage('Discord bot is online.');
});

client.login(DISCORD_TOKEN);

app.listen(PORT, () => {
  console.log(`Bot API server running on port ${PORT}`);
});
