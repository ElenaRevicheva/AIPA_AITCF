const dotenv = require('dotenv');

// Make PM2 explicitly load the server .env.
// Otherwise, PM2 may spawn with a limited/sanitized environment and Node won't see GITHUB_TOKEN.
dotenv.config({ path: '/home/ubuntu/cto-aipa/.env' });

module.exports = {
  apps: [{
    name: 'cto-aipa',
    script: 'dist/cto-aipa.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      TNS_ADMIN: '/home/ubuntu/cto-aipa/wallet',

      // GitHub write access (used by Octokit in telegram-bot / Atuona publishing)
      GITHUB_TOKEN: process.env.GITHUB_TOKEN,

      // LLM providers (used by CTO AIPA + Atuona flows)
      GROQ_API_KEY: process.env.GROQ_API_KEY,
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,

      // Telegram bots
      TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
      TELEGRAM_AUTHORIZED_USERS: process.env.TELEGRAM_AUTHORIZED_USERS,
      ATUONA_BOT_TOKEN: process.env.ATUONA_BOT_TOKEN,

      // Social publish keys (Atuona)
      REPLICATE_API_TOKEN: process.env.REPLICATE_API_TOKEN,
      RUNWAY_API_KEY: process.env.RUNWAY_API_KEY,
      LUMA_API_KEY: process.env.LUMA_API_KEY,
      INSTAGRAM_ACCESS_TOKEN: process.env.INSTAGRAM_ACCESS_TOKEN,
      INSTAGRAM_ACCOUNT_ID: process.env.INSTAGRAM_ACCOUNT_ID,

      // YouTube
      YOUTUBE_API_KEY: process.env.YOUTUBE_API_KEY,
      YOUTUBE_CLIENT_ID: process.env.YOUTUBE_CLIENT_ID,
      YOUTUBE_CLIENT_SECRET: process.env.YOUTUBE_CLIENT_SECRET,
      YOUTUBE_REFRESH_TOKEN: process.env.YOUTUBE_REFRESH_TOKEN
    }
  }]
};
