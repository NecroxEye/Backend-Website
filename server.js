require('dotenv').config();

const express = require('express');
const session = require('express-session');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DISCORD_API = 'https://discord.com/api';

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(session({
  secret: process.env.SESSION_SECRET || 'fallback_secret_change_me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    maxAge: 1000 * 60 * 60 * 24 * 7
  }
}));

app.use(express.static(__dirname));

app.get('/', (req, res) => {
  const filePath = path.join(__dirname, 'index.html');
  res.sendFile(filePath, (err) => {
    if (err) {
      console.error('Error sending index.html:', err);
      res.status(err.statusCode || 500).send('index.html not found');
    }
  });
});

app.get('/api/me', (req, res) => {
  try {
    if (!req.session || !req.session.discordUser) {
      return res.json({ loggedIn: false });
    }

    return res.json({
      loggedIn: true,
      user: req.session.discordUser
    });
  } catch (err) {
    console.error('Error in /api/me:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/auth/discord', (req, res) => {
  if (
    !process.env.DISCORD_CLIENT_ID ||
    !process.env.DISCORD_REDIRECT_URI
  ) {
    return res.status(500).send('Missing Discord config');
  }

  const params = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID,
    redirect_uri: process.env.DISCORD_REDIRECT_URI,
    response_type: 'code',
    scope: 'identify guilds'
  });

  res.redirect(`${DISCORD_API}/oauth2/authorize?${params.toString()}`);
});

app.get('/auth/discord/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).send('No code returned from Discord');

  try {
    const tokenResponse = await axios.post(
      `${DISCORD_API}/oauth2/token`,
      new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID,
        client_secret: process.env.DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: process.env.DISCORD_REDIRECT_URI,
        scope: 'identify guilds'
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    const accessToken = tokenResponse.data.access_token;

    const userResponse = await axios.get(`${DISCORD_API}/users/@me`, {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    const user = userResponse.data;

    if (!process.env.DISCORD_GUILD_ID || !process.env.DISCORD_BOT_TOKEN) {
      return res.status(500).send('Missing guild or bot token config');
    }

    const memberResponse = await axios.get(
      `${DISCORD_API}/guilds/${process.env.DISCORD_GUILD_ID}/members/${user.id}`,
      {
        headers: {
          Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`
        }
      }
    );

    const member = memberResponse.data;
    const targetRoleId = process.env.DISCORD_ROLE_ID;
    const hasRole = Array.isArray(member.roles) && member.roles.includes(targetRoleId);

    if (!hasRole) {
      return res.status(403).send('You do not have the required Discord role.');
    }

    req.session.discordUser = {
      id: user.id,
      username: user.username,
      global_name: user.global_name || null
    };

    req.session.save((err) => {
      if (err) {
        console.error('Session save error:', err);
        return res.status(500).send('Failed to save session');
      }

      res.redirect(process.env.FRONTEND_URL || 'http://localhost:3000/');
    });
  } catch (error) {
    console.error('Discord callback error:', error.response?.data || error.message);

    if (error.response && error.response.status === 404) {
      return res.status(403).send('You are not in the required Discord server or the bot cannot see you.');
    }

    res.status(500).send('Discord login failed');
  }
});

app.post('/api/pull-pearl', (req, res) => {
  try {
    const { player } = req.body;

    if (!req.session || !req.session.discordUser) {
      return res.status(401).json({ message: 'Not logged in' });
    }

    if (!player) {
      return res.status(400).json({ message: 'Missing player' });
    }

    console.log(`Pearl action requested for: ${player} by ${req.session.discordUser.username}`);
    return res.json({ message: `Pearl action sent for ${player}` });
  } catch (err) {
    console.error('Error in /api/pull-pearl:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
