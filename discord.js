require('dotenv').config();

const fs = require('fs');
const path = require('path');
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder
} = require('discord.js');

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;
const BACKEND_URL = process.env.BACKEND_URL;
const WEBSITE_URL = 'https://necroxeye.github.io/Backend-Website/';
const STATUS_MESSAGE_FILE = process.env.STATUS_MESSAGE_FILE || './status_message_id.json';
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS || 10000);

if (!DISCORD_BOT_TOKEN || !CHANNEL_ID || !BACKEND_URL) {
  console.error('Missing DISCORD_BOT_TOKEN, CHANNEL_ID, or BACKEND_URL in .env');
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

let cachedMessageId = null;
let lastSnapshot = null;
let updateRunning = false;

function loadSavedMessageId() {
  try {
    if (!fs.existsSync(STATUS_MESSAGE_FILE)) return null;
    const raw = fs.readFileSync(STATUS_MESSAGE_FILE, 'utf8');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed.messageId || null;
  } catch {
    return null;
  }
}

function saveMessageId(messageId) {
  try {
    fs.writeFileSync(STATUS_MESSAGE_FILE, JSON.stringify({ messageId }, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to save message ID:', err.message);
  }
}

async function fetchStatus() {
  const res = await fetch(BACKEND_URL, {
    headers: { Accept: 'application/json' }
  });

  const text = await res.text();
  let data = {};

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Backend did not return JSON: ${text.slice(0, 120)}`);
  }

  if (!res.ok) {
    throw new Error(data.error || `Backend error ${res.status}`);
  }

  return data;
}

function normalizeState(data) {
  const playersRaw = Array.isArray(data.players)
    ? data.players
    : Array.isArray(data.players_added)
      ? data.players_added
      : [];

  const players = playersRaw.map(p => {
    if (typeof p === 'string') {
      return {
        name: p,
        computer_name: 'Oil Rig'
      };
    }

    return {
      name: String(p.name || p.username || 'Unknown'),
      computer_name: String(p.computer_name || p.computer || 'Oil Rig')
    };
  });

  const websiteStatus = String(data.website_status || data.website || 'ON').toUpperCase() === 'ON' ? 'ON' : 'OFF';
  const backendStatus = String(data.backend_status || data.backend || data.status || 'ON').toUpperCase() === 'ON' ? 'ON' : 'OFF';

  return {
    websiteStatus,
    backendStatus,
    players
  };
}

function buildComputerLines(players) {
  const computers = new Map();

  for (const player of players) {
    const computer = String(player.computer_name || 'Oil Rig').trim() || 'Oil Rig';
    if (!computers.has(computer)) computers.set(computer, []);
    computers.get(computer).push(player.name);
  }

  if (computers.size === 0) {
    computers.set('Oil Rig', []);
  }

  const lines = [];
  for (const [computer, names] of computers.entries()) {
    const state = names.length > 0 ? 'ON' : 'OFF';
    lines.push(`${computer} - ${state}`);
  }

  return lines.join('\n');
}

function buildPlayersLines(players) {
  if (!players.length) return 'None';
  return players.map(p => `• ${p.name}`).join('\n');
}

function buildEmbed(state) {
  const computerLines = buildComputerLines(state.players);
  const playersLines = buildPlayersLines(state.players);

  const backendEmoji = state.backendStatus === 'ON' ? '🟢' : '🔴';
  const websiteEmoji = state.websiteStatus === 'ON' ? '🟢' : '🔴';

  const embed = new EmbedBuilder()
    .setTitle('System Status Panel')
    .setColor(state.backendStatus === 'ON' ? 0x2ecc71 : 0xe74c3c)
    .addFields(
      { name: 'Computers', value: computerLines || 'Oil Rig - OFF', inline: false },
      { name: 'Players', value: playersLines, inline: false },
      { name: 'Website Status', value: `${websiteEmoji} ${state.websiteStatus}`, inline: true },
      { name: 'Backend Status', value: `${backendEmoji} ${state.backendStatus}`, inline: true },
      { name: 'Link', value: `[Frosted Fang](${WEBSITE_URL})`, inline: false }
    )
    .setFooter({ text: 'Auto-updating status panel' })
    .setTimestamp();

  return embed;
}

async function getExistingMessage(channel) {
  if (!cachedMessageId) cachedMessageId = loadSavedMessageId();
  if (!cachedMessageId) return null;

  try {
    return await channel.messages.fetch(cachedMessageId);
  } catch {
    cachedMessageId = null;
    return null;
  }
}

async function updatePanel() {
  if (updateRunning) return;
  updateRunning = true;

  try {
    const raw = await fetchStatus();
    const state = normalizeState(raw);
    const snapshot = JSON.stringify(state);

    if (snapshot === lastSnapshot) return;
    lastSnapshot = snapshot;

    const channel = await client.channels.fetch(CHANNEL_ID);
    if (!channel) {
      console.error('Channel not found');
      return;
    }

    const embed = buildEmbed(state);
    const existing = await getExistingMessage(channel);

    if (existing) {
      await existing.edit({ embeds: [embed] });
    } else {
      const sent = await channel.send({ embeds: [embed] });
      cachedMessageId = sent.id;
      saveMessageId(sent.id);
    }
  } catch (err) {
    console.error('Status panel update error:', err.message);
  } finally {
    updateRunning = false;
  }
}

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);
  await updatePanel();
  setInterval(updatePanel, POLL_INTERVAL_MS);
});

client.login(DISCORD_BOT_TOKEN);
