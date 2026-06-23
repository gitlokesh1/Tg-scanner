const express = require('express');
const { TelegramClient, Api } = require('telegram');
const { StringSession } = require('telegram/sessions');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json());
app.use(express.static('public')); 

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

const apiId = Number(process.env.TELEGRAM_API_ID) || 0;
const apiHash = process.env.TELEGRAM_API_HASH || '';

if (!GEMINI_API_KEY) console.warn('⚠️  GEMINI_API_KEY not set — AI search/scan features will not work');
if (!apiId || !apiHash) console.warn('⚠️  TELEGRAM_API_ID / TELEGRAM_API_HASH not set — Telegram client will fail');

// Multi-Account Storage
const SESSIONS_FILE = 'sessions.json';
let sessions = fs.existsSync(SESSIONS_FILE) ? JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8')) : {};
let clients = {}; // Active client instances
let pendingAuths = {}; // Pending logins

// Start all saved sessions
(async () => {
    for (let phone in sessions) {
        let stringSession = new StringSession(sessions[phone]);
        let client = new TelegramClient(stringSession, apiId, apiHash, { connectionRetries: 5 });
        client.setLogLevel("none");
        try {
            await client.connect();
            clients[phone] = client;
            console.log(`✅ Connected existing account: ${phone}`);
        } catch (e) {
            console.log(`⚠️ Session invalid for: ${phone}`);
            delete sessions[phone];
        }
    }
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessions, null, 2));
})();

function getClient(req) {
    const phone = req.body.activeAccount || req.query.activeAccount;
    if (phone && clients[phone]) return clients[phone];
    const availablePhones = Object.keys(clients);
    return availablePhones.length > 0 ? clients[availablePhones[0]] : null;
}

// ==========================================
// MULTI-ACCOUNT AUTHENTICATION
// ==========================================
app.get('/api/auth/status', async (req, res) => {
    let accounts = [];
    for (let phone in clients) {
        try {
            const me = await clients[phone].getMe();
            accounts.push({ phone: phone, name: me.firstName });
        } catch(e) {}
    }
    res.json({ loggedIn: accounts.length > 0, accounts });
});

app.post('/api/auth/phone', async (req, res) => {
    const { phone } = req.body;
    let stringSession = new StringSession('');
    let client = new TelegramClient(stringSession, apiId, apiHash, { connectionRetries: 5 });
    client.setLogLevel("none");

    pendingAuths[phone] = { client, state: 'processing', error: null };

    client.start({  
        phoneNumber: phone,  
        password: async () => new Promise(resolve => pendingAuths[phone].resolvePassword = resolve),  
        phoneCode: async () => new Promise(resolve => pendingAuths[phone].resolveCode = resolve),  
        onError: (err) => { pendingAuths[phone].error = err.message; pendingAuths[phone].state = 'error'; }  
    }).then(() => {  
        pendingAuths[phone].state = 'logged_in';  
        sessions[phone] = client.session.save();
        fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessions, null, 2));  
        clients[phone] = client;
        console.log(`✅ New account added: ${phone}`);  
    }).catch(err => {  
        pendingAuths[phone].error = err.message; pendingAuths[phone].state = 'error';  
    });  

    await new Promise(r => setTimeout(r, 2000));
    const currentState = pendingAuths[phone];
    const responseState = currentState.resolveCode
        ? 'waiting_code'
        : currentState.resolvePassword
            ? 'waiting_password'
            : currentState.state;
    res.json({ success: true, state: responseState, error: currentState.error });
});

app.post('/api/auth/code', async (req, res) => {
    const { phone, code } = req.body;
    if (pendingAuths[phone] && pendingAuths[phone].resolveCode) {
        pendingAuths[phone].resolveCode(code);
        pendingAuths[phone].resolveCode = null;
        pendingAuths[phone].state = 'processing';
        await new Promise(r => setTimeout(r, 2000));
        const currentState = pendingAuths[phone];
        const responseState = currentState.resolvePassword
            ? 'waiting_password'
            : currentState.state;
        res.json({ success: true, state: responseState, error: currentState.error });
    } else { res.status(400).json({ error: "Invalid auth state" }); }
});

app.post('/api/auth/password', async (req, res) => {
    const { phone, password } = req.body;
    if (pendingAuths[phone] && pendingAuths[phone].resolvePassword) {
        pendingAuths[phone].resolvePassword(password);
        pendingAuths[phone].resolvePassword = null;
        pendingAuths[phone].state = 'processing';
        await new Promise(r => setTimeout(r, 2000));
        res.json({ success: true, state: pendingAuths[phone].state, error: pendingAuths[phone].error });
    } else { res.status(400).json({ error: "Invalid auth state" }); }
});

app.post('/api/auth/logout', async (req, res) => {
    const { phone } = req.body;
    if (clients[phone]) {
        await clients[phone].disconnect();
        delete clients[phone];
        delete sessions[phone];
        fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessions, null, 2));
    }
    res.json({ success: true });
});

// ==========================================
// API 1: LIVE AI-POWERED SEARCH 
// ==========================================
app.post('/api/auto-search', async (req, res) => {
    const activeClient = getClient(req);
    if(!activeClient) return res.status(401).json({ error: "No active Telegram client" });
    
    const { niche } = req.body;
    const targetNiche = niche || "affiliate marketing agents";
    let smartKeywordsToSearch = [];

    console.log(`\n🧠 AI Brain Working: Generating Indian keywords for "${targetNiche}"...`);  

    try {  
        const prompt = `Act as an HR recruiter looking to hire ${targetNiche} in the iGaming industry specifically for the INDIAN market on Telegram. Generate exactly 5 short search keywords (comma-separated, no numbering, no quotes) that would find relevant public Telegram groups. Focus on Hindi/Hinglish terms Indians would use.`;
        const aiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {  
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })  
        });  
        const aiData = await aiResponse.json();  
        if (aiData.error) throw new Error(aiData.error.message);  
        const rawKeywords = aiData.candidates[0].content.parts[0].text;  
        smartKeywordsToSearch = rawKeywords.split(',').map(kw => kw.trim().replace(/"/g, ''));  
    } catch (err) {  
        smartKeywordsToSearch = [`${targetNiche} india`, "earning group hindi", "promoter adda", "part time india", "affiliate hindi"];  
    }  

    let allGroups = [];  
    let uniqueUsernames = new Set();  

    try {  
        for (const word of smartKeywordsToSearch) {  
            if(!word) continue;  
            const result = await activeClient.invoke(new Api.contacts.Search({ q: word, limit: 100 }));  
            for (const chat of result.chats) {  
                if (!chat.broadcast && chat.username && !uniqueUsernames.has(chat.username)) {  
                    uniqueUsernames.add(chat.username);  
                    allGroups.push({ title: chat.title, username: `@${chat.username}`, members: chat.participantsCount || 0 });  
                }  
            }  
            await new Promise(resolve => setTimeout(resolve, 2000));  
        }  
        res.json({ success: true, groups: allGroups });  
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// ==========================================
// API 2: AUTO-SCAN GROUPS (STRICTLY INDIANS)
// ==========================================
app.post('/api/scan-groups', async (req, res) => {
    const activeClient = getClient(req);
    if(!activeClient) return res.status(401).json({ error: "No active Telegram client" });
    const { groups } = req.body;

    let collectedMessages = [];
    console.log(`\n🔍 Scanning ${groups.length} public groups without joining...`);

    try {
        for (const group of groups) {
            try {
                const messages = await activeClient.getMessages(group, { limit: 40 }); 
                for (const msg of messages) {
                    if (msg.message && msg.sender && msg.sender.username) {
                        collectedMessages.push({ username: `@${msg.sender.username}`, text: msg.message.substring(0, 200) });
                    }
                }
                await new Promise(resolve => setTimeout(resolve, 1000)); 
            } catch (err) { console.log(`⚠️ Skipped ${group}: ${err.message}`); }
        }

        if (collectedMessages.length === 0) return res.json({ success: true, candidates: [] });

        let userChats = {};
        collectedMessages.forEach(m => {
            if(!userChats[m.username]) userChats[m.username] = [];
            userChats[m.username].push(m.text);
        });

        let aiInputData = Object.keys(userChats).map(username => `User: ${username}\nMessages: ${userChats[username].join(' | ')}`).join('\n\n');

        const prompt = `You are an expert HR recruiter in the iGaming and Affiliate marketing industry, strictly hiring for the INDIAN market. Analyze these Telegram messages and identify potential Indian candidates. Return ONLY a valid JSON array (no markdown, no explanation) with this format: [{"username":"@user","score":85,"category":"Affiliate Agent","reason":"Short reason"}]. Score 0-100. Only include users with score > 50.\n\n${aiInputData}`;

        const aiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });

        const aiData = await aiResponse.json();
        let candidates = [];
        
        try {
            let rawText = aiData.candidates[0].content.parts[0].text;
            // FIX: safely strip markdown code fences without broken regex
            rawText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
            candidates = JSON.parse(rawText).filter(c => c.score > 50).sort((a,b) => b.score - a.score);
        } catch(e) { console.error("AI Parse Error", e); }

        res.json({ success: true, candidates });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// ==========================================
// API 3: SEND DM
// ==========================================
app.post('/api/send-dm', async (req, res) => {
    const activeClient = getClient(req);
    if(!activeClient) return res.status(401).json({ error: "No active Telegram client" });

    const { username, message } = req.body;
    try {
        console.log(`\n✉️ Sending DM to ${username}...`);
        await activeClient.sendMessage(username, { message: message });
        res.json({ success: true });
    } catch (error) {
        console.error(`❌ DM Error for ${username}:`, error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.listen(PORT, () => { console.log(`\n🌐 Multi-Account Server running at http://127.0.0.1:${PORT}`); });
