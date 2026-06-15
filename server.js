const express = require('express');
const { TelegramClient, Api } = require('telegram');
const { StringSession } = require('telegram/sessions');
const fs = require('fs');

const app = express();
const PORT = 8080;

app.use(express.json());
app.use(express.static('public')); 

// 👇 YAHAN APNI GEMINI KEY DAALEIN 👇
const GEMINI_API_KEY = 'AQ.Ab8RN6KZJ1Go4Q16QJ47LC12hG46rioCy0fiDcwqzdkA1IWWaw';

const apiId = 39942557;
const apiHash = '77a67551c7f83be89c33da3a95eefea0';

let sessionString = fs.existsSync('session.txt') ? fs.readFileSync('session.txt', 'utf8') : '';
let stringSession = new StringSession(sessionString);
let client = new TelegramClient(stringSession, apiId, apiHash, { connectionRetries: 5 });
client.setLogLevel("none");

// ==========================================
// TELEGRAM WEB AUTHENTICATION SYSTEM
// ==========================================
let authState = 'idle'; 
let resolveAuthCode = null;
let resolveAuthPassword = null;
let authError = null;

app.get('/api/auth/status', async (req, res) => {
    try {
        if (client.connected) {
            const me = await client.getMe();
            // Phone number bhi send kar rahe hain UI ko dikhane ke liye
            if (me) return res.json({ loggedIn: true, user: me.firstName, phone: me.phone });
        }
        res.json({ loggedIn: false, state: authState, error: authError });
    } catch (e) {
        res.json({ loggedIn: false, state: authState, error: authError });
    }
});

app.post('/api/auth/phone', async (req, res) => {
    const { phone } = req.body;
    authState = 'processing';
    authError = null;

    client.start({
        phoneNumber: phone,
        password: async () => {
            authState = 'waiting_password';
            return new Promise(resolve => resolveAuthPassword = resolve);
        },
        phoneCode: async () => {
            authState = 'waiting_code';
            return new Promise(resolve => resolveAuthCode = resolve);
        },
        onError: (err) => {
            console.error("Auth Error:", err);
            authError = err.message;
            authState = 'error';
        },
    }).then(() => {
        authState = 'logged_in';
        fs.writeFileSync('session.txt', client.session.save());
        console.log("✅ Logged in successfully via Web UI!");
    }).catch(err => {
        authError = err.message;
        authState = 'error';
    });

    await new Promise(r => setTimeout(r, 2000));
    res.json({ success: true, state: authState, error: authError });
});

app.post('/api/auth/code', async (req, res) => {
    const { code } = req.body;
    if (resolveAuthCode) {
        resolveAuthCode(code);
        resolveAuthCode = null;
        authState = 'processing';
        await new Promise(r => setTimeout(r, 2000)); 
        res.json({ success: true, state: authState, error: authError });
    } else {
        res.status(400).json({ error: "Session expired or not waiting for OTP" });
    }
});

app.post('/api/auth/password', async (req, res) => {
    const { password } = req.body;
    if (resolveAuthPassword) {
        resolveAuthPassword(password);
        resolveAuthPassword = null;
        authState = 'processing';
        await new Promise(r => setTimeout(r, 2000)); 
        res.json({ success: true, state: authState, error: authError });
    } else {
        res.status(400).json({ error: "Not waiting for password" });
    }
});

app.post('/api/auth/logout', async (req, res) => {
    try {
        await client.disconnect();
        fs.writeFileSync('session.txt', '');
        stringSession = new StringSession('');
        client = new TelegramClient(stringSession, apiId, apiHash, { connectionRetries: 5 });
        authState = 'idle';
        res.json({ success: true });
    } catch(e) {
        res.json({ success: false });
    }
});


// ==========================================
// API 1: LIVE AI-POWERED SEARCH (HR PERSONA)
// ==========================================
app.post('/api/auto-search', async (req, res) => {
    const { niche } = req.body;
    const targetNiche = niche || "affiliate marketing agents";
    let smartKeywordsToSearch = [];

    console.log(`\n🧠 AI Brain Working: Generating keywords for "${targetNiche}"...`);

    try {
        const prompt = `Act as an HR recruiter looking to hire ${targetNiche} on Telegram. You need to join open discussion groups where job seekers, students, and related people hang out. Generate exactly 15 short Telegram search queries (strictly 2 to 3 words maximum per query, e.g. "affiliate chat", "part time adda"). Output ONLY a comma-separated list, nothing else.`;

        const aiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });

        const aiData = await aiResponse.json();
        if (aiData.error) throw new Error(aiData.error.message);

        const rawKeywords = aiData.candidates[0].content.parts[0].text;
        smartKeywordsToSearch = rawKeywords.split(',').map(kw => kw.trim().replace(/"/g, ''));
        console.log(`💡 AI Generated Keywords: `, smartKeywordsToSearch);

    } catch (err) {
        console.log(`⚠️ AI Request Failed! Error: ${err.message}`);
        smartKeywordsToSearch = [`${targetNiche} chat`, "earning group", "promoter network", "part time adda", "freelance hiring"];
    }

    let allGroups = [];
    let uniqueUsernames = new Set();

    try {
        for (const word of smartKeywordsToSearch) {
            if(!word) continue;
            const result = await client.invoke(new Api.contacts.Search({ q: word, limit: 100 }));

            for (const chat of result.chats) {
                if (!chat.broadcast && chat.username) {
                    if (!uniqueUsernames.has(chat.username)) {
                        uniqueUsernames.add(chat.username);
                        allGroups.push({ title: chat.title, username: `@${chat.username}`, members: chat.participantsCount || 0 });
                    }
                }
            }
            await new Promise(resolve => setTimeout(resolve, 2500));
        }
        res.json({ success: true, groups: allGroups });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==========================================
// API 2: ONLY AUTO-JOIN
// ==========================================
app.post('/api/join-groups', async (req, res) => {
    const { groups } = req.body;
    if (!groups || groups.length === 0) return res.status(400).json({ error: "Missing groups list" });

    let successCount = 0, failCount = 0;

    for (const group of groups) {
        try {
            const preJoinDelay = Math.floor(Math.random() * 8000) + 12000;
            await new Promise(resolve => setTimeout(resolve, preJoinDelay));
            await client.invoke(new Api.channels.JoinChannel({ channel: group }));
            successCount++;
        } catch (error) {
            failCount++;
            if (error.errorMessage && error.errorMessage.includes('A wait of')) {
                const waitSeconds = error.seconds || parseInt(error.errorMessage.match(/\d+/)[0]);
                await new Promise(resolve => setTimeout(resolve, (waitSeconds + 2) * 1000));
            }
        }
    }
    res.json({ success: true, successCount, failCount });
});

(async () => {
    if (sessionString) {
        try {
            await client.connect();
            await client.getMe();
            console.log("✅ Telegram Connected with existing session!");
        } catch (e) {
            console.log("⚠️ Existing session invalid. Please login from the web UI.");
        }
    } else {
        console.log("⚠️ No session found. Please login from the web UI.");
    }
    app.listen(PORT, () => { console.log(`\n🌐 Server running at http://127.0.0.1:${PORT}`); });
})();
