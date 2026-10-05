require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;
const BACKEND_URL = process.env.BACKEND_URL;
const STATUS_MESSAGE_FILE = process.env.STATUS_MESSAGE_FILE || './status_message_id.json';
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS || 15000);

if (!DISCORD_TOKEN || !CHANNEL_ID || !BACKEND_URL) {
  console.error('Missing DISCORD_TOKEN, CHANNEL_ID, or BACKEND_URL in .env');
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

let lastSnapshot = null;
let cachedMessageId = null;
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

async function fetchBackendStatus() {
  const res = await fetch(BACKEND_URL, {
    headers: { 'Accept': 'application/json' }
  });

  const text = await res.text();

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Backend did not return JSON: ${text.slice(0, 120)}`);
  }

  if (!res.ok) {
    throw new Error(data.error || `Backend error ${res.status}`);
  }

  return data;
}

function normalizeStatus(data) {
  const players = Array.isArray(data.players)
    ? data.players
    : Array.isArray(data.players_added)
      ? data.players_added
      : [];

  return {
    status: String(data.status || data.backend_status || 'OFF').toUpperCase() === 'ON' ? 'ON' : 'OFF',
    backendStatus: String(data.backend_status || data.backend || 'OFF').toUpperCase() === 'ON' ? 'ON' : 'OFF',
    computer: String(data.computer || data.computer_name || 'N/A'),
    oilRig: String(data.oilRig || data.oil_rig || 'Offline'),
    website: String(data.website || 'Working'),
    players
  };
}

function buildEmbed(state) {
  const isOn = state.status === 'ON';
  const isBackendOn = state.backendStatus === 'ON';
  const oilRigOk = String(state.oilRig).toLowerCase() === 'working';

  const playersText = state.players.length
    ? state.players.map(p => `• ${p}`).join('\n')
    : 'None';

  return new EmbedBuilder()
    .setTitle('System Status Panel')
    .setColor(isOn ? 0x2ecc71 : 0xe74c3c)
    .addFields(
      { name: 'Status', value: isOn ? '🟢 ON' : '🔴 OFF', inline: true },
      { name: 'Backend Status', value: isBackendOn ? '🟢 ON' : '🔴 OFF', inline: true },
      { name: 'Computer', value: state.computer, inline: true },
      { name: 'Oil Rig', value: oilRigOk ? '🟢 Working' : '🔴 Offline', inline: true },
      { name: 'Website', value: '🟢 Working', inline: true },
      { name: 'Players Added', value: playersText, inline: false }
    )
    .setFooter({ text: 'Auto-updating status panel' })
    .setTimestamp();
}

async function getStatusMessage(channel) {
  if (!cachedMessageId) {
    cachedMessageId = loadSavedMessageId();
  }

  if (cachedMessageId) {
    try {
      return await channel.messages.fetch(cachedMessageId);
    } catch {
      cachedMessageId = null;
    }
  }

  return null;
}

async function updatePanel() {
  if (updateRunning) return;
  updateRunning = true;

  try {
    const rawData = await fetchBackendStatus();
    const state = normalizeStatus(rawData);
    const snapshot = JSON.stringify(state);

    // Do nothing if nothing changed
    if (snapshot === lastSnapshot) {
      return;
    }
    lastSnapshot = snapshot;

    const channel = await client.channels.fetch(CHANNEL_ID);
    if (!channel) {
      console.error('Channel not found');
      return;
    }

    const embed = buildEmbed(state);
    const existingMessage = await getStatusMessage(channel);

    if (existingMessage) {
      await existingMessage.edit({ embeds: [embed] });
    } else {
      const sent = await channel.send({ embeds: [embed] });
      cachedMessageId = sent.id;
      saveMessageId(sent.id);
    }
  } catch (err) {
    console.error('Panel update error:', err.message);
  } finally {
    updateRunning = false;
  }
}

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);

  // First update immediately
  await updatePanel();

  // Then poll for changes
  setInterval(updatePanel, POLL_INTERVAL_MS);
});

client.login(DISCORD_TOKEN);
