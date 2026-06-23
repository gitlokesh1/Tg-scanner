const express = require('express');
const { TelegramClient, Api } = require('telegram');
const { StringSession } = require('telegram/sessions');
const fs = require('fs');

const app = express();
const PORT = 8080;

app.use(express.json());
app.use(express.static('public')); 

// 👇 YAHAN APNI GEMINI KEY DAALEIN 👇
const GEMINI_API_KEY = 'AQ.Ab8RN6LWTjRDIPDlGh0i00-hu29pdGRKR_4K5kBPKvox9E5ZOg';

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
// API 1: LIVE AI-POWERED SEARCH (INDIAN TARGETED)
// ==========================================
app.post('/api/auto-search', async (req, res) => {
    const { niche } = req.body;
    const targetNiche = niche || "affiliate marketing agents";
    let smartKeywordsToSearch = [];

    console.log(`\n🧠 AI Brain Working: Generating Indian keywords for "${targetNiche}"...`);  

    try {  
        const prompt = `Act as an HR recruiter looking to hire ${targetNiche} in the iGaming industry specifically for the INDIAN market on Telegram. Find public Telegram groups where Indian users actively discuss work, traffic, or affiliate opportunities. Generate exactly 15 Telegram search queries. Use Indian context words along with the niche (e.g., "india", "hindi", "promoters adda", "kamao", "desi"). Each query must be 2-3 words maximum. Output ONLY a comma-separated list, nothing else.`;  

        const aiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {  
            method: 'POST',  
            headers: { 'Content-Type': 'application/json' },  
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })  
        });  

        const aiData = await aiResponse.json();  
        if (aiData.error) throw new Error(aiData.error.message);  

        const rawKeywords = aiData.candidates[0].content.parts[0].text;  
        smartKeywordsToSearch = rawKeywords.split(',').map(kw => kw.trim().replace(/"/g, ''));  
        console.log(`💡 AI Generated Indian Keywords: `, smartKeywordsToSearch);  

    } catch (err) {  
        console.log(`⚠️ AI Request Failed! Error: ${err.message}`);  
        smartKeywordsToSearch = [`${targetNiche} india`, "earning group hindi", "promoter adda", "part time india", "affiliate hindi"];  
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
            await new Promise(resolve => setTimeout(resolve, 2000));  
        }  
        res.json({ success: true, groups: allGroups });  
    } catch (error) {  
        res.status(500).json({ success: false, error: error.message });  
    }
});

// ==========================================
// API 2: AUTO-SCAN GROUPS & AI SCORING (STRICTLY INDIANS)
// ==========================================
app.post('/api/scan-groups', async (req, res) => {
    const { groups } = req.body;
    if (!groups || groups.length === 0) return res.status(400).json({ error: "Missing groups list" });

    let collectedMessages = [];
    console.log(`\n🔍 Scanning ${groups.length} public groups without joining...`);

    try {
        for (const group of groups) {
            try {
                const messages = await client.getMessages(group, { limit: 40 }); 
                for (const msg of messages) {
                    if (msg.message && msg.sender && msg.sender.username) {
                        collectedMessages.push({
                            username: `@${msg.sender.username}`,
                            text: msg.message.substring(0, 200) 
                        });
                    }
                }
                await new Promise(resolve => setTimeout(resolve, 1000)); 
            } catch (err) {
                console.log(`⚠️ Skipped ${group}: ${err.message}`);
            }
        }

        if (collectedMessages.length === 0) {
            return res.json({ success: true, candidates: [] });
        }

        let userChats = {};
        collectedMessages.forEach(m => {
            if(!userChats[m.username]) userChats[m.username] = [];
            userChats[m.username].push(m.text);
        });

        let aiInputData = Object.keys(userChats).map(username => {
            return `User: ${username}\nMessages: ${userChats[username].join(' | ')}`;
        }).join('\n\n');

        console.log(`🧠 AI Brain Working: Filtering out non-Indians from ${Object.keys(userChats).length} active users...`);

        const prompt = `You are an expert HR recruiter in the iGaming and Affiliate marketing industry, strictly hiring for the INDIAN market. 
        Analyze the following Telegram user messages. 
        
        Data:
        ${aiInputData}

        CRITICAL INSTRUCTIONS:
        1. ONLY select candidates who appear to be from INDIA (Look for Hindi, Hinglish, mentions of INR, Paytm, UPI, or Indian locations/context).
        2. STRICTLY IGNORE and REJECT users speaking Russian, Turkish, Arabic, Spanish, or showing non-Indian context, no matter how good they are.
        3. Identify potential candidates like Affiliate Agents, Website Promoters, Media Buyers, or Traffic Providers.
        
        Return ONLY a JSON array of objects with these exact keys:
        - "username": (string, the user's handle)
        - "category": (string, e.g., Affiliate Agent, Media Buyer)
        - "score": (number, 0-100 based on relevance to iGaming traffic)
        - "reason": (string, 1 short sentence why they got this score AND mention their Indian context indicator like "Speaks Hinglish" or "Mentions INR")
        
        CRITICAL: Do not include any markdown formatting like \`\`\`json. Just output the raw JSON array. Return [] if no one is relevant or Indian.`;

        const aiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });

        const aiData = await aiResponse.json();
        let candidates = [];
        
        try {
            let rawText = aiData.candidates[0].content.parts[0].text;
            rawText = rawText.replace(/```json/g, '').replace(/```/g, '').trim(); 
            candidates = JSON.parse(rawText);
            
            candidates = candidates.filter(c => c.score > 50).sort((a,b) => b.score - a.score);
        } catch(e) {
            console.error("AI JSON Parse Error:", e);
        }

        console.log(`✅ AI found ${candidates.length} INDIAN candidates!`);
        res.json({ success: true, candidates });

    } catch (error) {
        console.error("Scan Error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==========================================
// API 3: SEND DIRECT MESSAGE (PHASE 3)
// ==========================================
app.post('/api/send-dm', async (req, res) => {
    const { username, message } = req.body;
    if (!username || !message) return res.status(400).json({ error: "Missing username or message" });

    try {
        console.log(`\n✉️ Sending personalized DM to ${username}...`);
        await client.sendMessage(username, { message: message });
        res.json({ success: true });
    } catch (error) {
        console.error(`❌ Failed to send DM to ${username}:`, error.message);
        res.status(500).json({ success: false, error: error.message });
    }
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
