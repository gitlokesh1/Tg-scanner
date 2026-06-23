# TG Scanner

TG Scanner is an AI-powered Telegram lead finder built with GramJS. It helps you log in with multiple Telegram accounts, discover relevant groups, scan members with AI keyword logic, and prepare personalized outreach DMs.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy environment template and update credentials:
   ```bash
   cp .env.example .env
   ```
3. Fill values in `.env`:
   - `GEMINI_API_KEY`
   - `TELEGRAM_API_ID`
   - `TELEGRAM_API_HASH`
4. Start the server:
   ```bash
   node server.js
   ```

## Features

- Multi-account Telegram login
- AI keyword generation and search
- Telegram group scanning
- Personalized DM drafting and outreach

## Browser-only mode

The HTML app in `public/index.html` can also run in browser-only mode for local session usage, without starting the Node server.
