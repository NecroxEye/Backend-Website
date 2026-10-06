require('dotenv').config();

const fs = require('fs');
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionsBitField,
  ChannelType
} = require('discord.js');

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID || '1554124753760034997';
const BACKEND_URL = process.env.BACKEND_URL || 'https://backend-website-syxe.onrender.com/status';
const STATUS_MESSAGE_FILE = process.env.STATUS_MESSAGE_FILE || './status_message_id.json';
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS || 10000);
const WEBSITE_URL = 'https://necroxeye.github.io/Backend-Website/';

if (!DISCORD_BOT_TOKEN) {
  console.error('Missing DISCORD_BOT_TOKEN in .env');
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
  } catch (err) {
    console.error('[panel] failed loading message id:', err.message);
    return null;
  }
}

function saveMessageId(messageId) {
  try {
    fs.writeFileSync(
      STATUS_MESSAGE_FILE,
      JSON.stringify({ messageId }, null, 2),
      'utf8'
    );
  } catch (err) {
    console.error('[panel] failed saving message id:', err.message);
  }
}

async function fetchStatus() {
  const res = await fetch(BACKEND_URL, {
    headers: { Accept: 'application/json' }
  });

  const text = await res.text();
  let data;

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Backend did not return JSON: ${text.slice(0, 200)}`);
  }

  if (!res.ok) {
    throw new Error(data.error || `Backend error ${res.status}`);
  }

  return data;
}

function normalizeState(data) {
  const playersRaw = Array.isArray(data.players) ? data.players : [];

  const players = playersRaw.map((p) => {
    if (typeof p === 'string') {
      return {
        name: p,
        computer_name: 'Oil Rig',
        direction: 'left'
      };
    }

    return {
      name: String(p.name || p.username || 'Unknown'),
      computer_name: String(p.computer_name || p.computer || 'Oil Rig'),
      direction: String(p.direction || 'left')
    };
  });

  return {
    status: String(data.status || 'OFF').toUpperCase() === 'ON' ? 'ON' : 'OFF',
    backendStatus: String(data.backend_status || 'OFF').toUpperCase() === 'ON' ? 'ON' : 'OFF',
    website: String(data.website || 'Offline'),
    oilRig: String(data.oilRig || 'Offline'),
    computer: String(data.computer || 'N/A'),
    players
  };
}

function buildComputerLines(state) {
  const players = state.players || [];
  const computers = new Map();

  for (const player of players) {
    const comp = String(player.computer_name || 'Oil Rig').trim() || 'Oil Rig';
    if (!computers.has(comp)) computers.set(comp, []);
    computers.get(comp).push(player.name);
  }

  if (computers.size === 0) {
    return `Oil Rig - ${String(state.oilRig).toLowerCase() === 'working' ? 'ON' : 'OFF'}`;
  }

  return [...computers.entries()]
    .map(([comp, names]) => `${comp} - ${names.length ? 'ON' : 'OFF'}`)
    .join('\n');
}

function buildPlayersLines(players) {
  if (!players.length) return 'None';
  return players.map((p) => `• ${p.name}`).join('\n');
}

function buildEmbed(state) {
  const websiteOk = String(state.website).toLowerCase() === 'working' || state.status === 'ON';
  const oilRigOk = String(state.oilRig).toLowerCase() === 'working';

  return new EmbedBuilder()
    .setTitle('System Status Panel')
    .setColor(state.backendStatus === 'ON' ? 0x74d4ff : 0xe74c3c)
    .addFields(
      { name: 'Computer', value: buildComputerLines(state), inline: false },
      { name: 'Players', value: buildPlayersLines(state.players), inline: false },
      { name: 'Website Status', value: websiteOk ? '🟢 ON' : '🔴 OFF', inline: true },
      { name: 'Backend', value: state.backendStatus === 'ON' ? '🟢 ON' : '🔴 OFF', inline: true },
      { name: 'Frosted Fang', value: `[Open Website](${WEBSITE_URL})`, inline: false }
    )
    .setFooter({ text: 'Auto-updating status panel' })
    .setTimestamp();
}

async function resolveChannel() {
  console.log('[panel] resolving channel:', CHANNEL_ID);

  const channel = await client.channels.fetch(CHANNEL_ID).catch((err) => {
    console.error('[panel] channel fetch failed:', err.message);
    return null;
  });

  if (!channel) return null;

  console.log('[panel] channel found:', {
    id: channel.id,
    type: channel.type,
    name: channel.name || 'unknown'
  });

  if (
    channel.type !== ChannelType.GuildText &&
    channel.type !== ChannelType.GuildAnnouncement
  ) {
    console.error('[panel] channel is not a text channel');
    return null;
  }

  return channel;
}

async function getExistingMessage(channel) {
  if (!cachedMessageId) cachedMessageId = loadSavedMessageId();
  if (!cachedMessageId) return null;

  try {
    const message = await channel.messages.fetch(cachedMessageId);
    console.log('[panel] existing panel message found:', message.id);
    return message;
  } catch (err) {
    console.warn('[panel] saved message missing, clearing cache:', err.message);
    cachedMessageId = null;
    return null;
  }
}

async function updatePanel() {
  if (updateRunning) {
    console.log('[panel] skipped, previous update still running');
    return;
  }

  updateRunning = true;

  try {
    console.log('[panel] fetching backend...');
    const raw = await fetchStatus();
    console.log('[panel] backend response:', JSON.stringify(raw));

    const state = normalizeState(raw);
    const snapshot = JSON.stringify(state);

    const channel = await resolveChannel();
    if (!channel) {
      console.error('[panel] no usable channel resolved');
      return;
    }

    const perms = channel.permissionsFor(client.user);
    if (!perms) {
      console.error('[panel] could not resolve bot permissions in channel');
      return;
    }

    const required = [
      PermissionsBitField.Flags.ViewChannel,
      PermissionsBitField.Flags.SendMessages,
      PermissionsBitField.Flags.EmbedLinks,
      PermissionsBitField.Flags.ReadMessageHistory
    ];

    const missing = required.filter((perm) => !perms.has(perm));
    if (missing.length) {
      console.error('[panel] missing permissions:', missing);
      return;
    }

    const embed = buildEmbed(state);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel('Frosted Fang')
        .setStyle(ButtonStyle.Link)
        .setURL(WEBSITE_URL)
    );

    const existing = await getExistingMessage(channel);

    if (existing) {
      if (snapshot !== lastSnapshot) {
        console.log('[panel] editing existing panel...');
        await existing.edit({
          embeds: [embed],
          components: [row],
          content: ''
        });
        console.log('[panel] panel edited');
      } else {
        console.log('[panel] no changes, skipping edit');
      }
    } else {
      console.log('[panel] sending new panel...');
      const sent = await channel.send({
        content: '',
        embeds: [embed],
        components: [row]
      });

      cachedMessageId = sent.id;
      saveMessageId(sent.id);
      console.log('[panel] panel created:', sent.id);
    }

    lastSnapshot = snapshot;
  } catch (err) {
    console.error('[panel] update failed:', err);
  } finally {
    updateRunning = false;
  }
}

client.once('ready', async () => {
  console.log(`[bot] logged in as ${client.user.tag}`);
  console.log('[bot] backend url:', BACKEND_URL);
  console.log('[bot] channel id:', CHANNEL_ID);

  cachedMessageId = loadSavedMessageId();

  await updatePanel();
  setInterval(updatePanel, POLL_INTERVAL_MS);
});

client.on('error', (err) => {
  console.error('[bot] client error:', err);
});

process.on('unhandledRejection', (err) => {
  console.error('[bot] unhandled rejection:', err);
});

process.on('uncaughtException', (err) => {
  console.error('[bot] uncaught exception:', err);
});

client.login(DISCORD_BOT_TOKEN).catch((err) => {
  console.error('[bot] login failed:', err);
});
