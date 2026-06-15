const express = require('express');
const { TelegramClient, Api } = require('telegram');
const { StringSession } = require('telegram/sessions');
const fs = require('fs');

const app = express();
const PORT = 8080;

app.use(express.json());
app.use(express.static('public'));

// 👇 YAHAN APNI GEMINI KEY DAALEIN 👇
const GEMINI_API_KEY = 'AIzaSyDxlN8kok5dO5K55svVCF_cxWM0ytN5VRA';

const apiId = 39942557;
const apiHash = '77a67551c7f83be89c33da3a95eefea0';

const sessionString = fs.existsSync('session.txt') ? fs.readFileSync('session.txt', 'utf8') : '';
const stringSession = new StringSession(sessionString);

const client = new TelegramClient(stringSession, apiId, apiHash, { connectionRetries: 5 });
client.setLogLevel("none");

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
        console.log("Using Backup Keywords...");
        smartKeywordsToSearch = [`${targetNiche} chat`, "earning group", "promoter network", "part time adda", "freelance hiring"];
    }

    let allGroups = [];
    let uniqueUsernames = new Set();

    try {
        console.log(`\n🚀 Searching Telegram for ${targetNiche}...`);

        for (const word of smartKeywordsToSearch) {
            if(!word) continue;
            console.log(`🔍 AI searching for: "${word}"...`);

            const result = await client.invoke(new Api.contacts.Search({ q: word, limit: 100 }));

            for (const chat of result.chats) {
                // Size limit removed: Joining all valid groups
                if (!chat.broadcast && chat.username) {
                    if (!uniqueUsernames.has(chat.username)) {
                        uniqueUsernames.add(chat.username);
                        allGroups.push({
                            title: chat.title,
                            username: `@${chat.username}`,
                            members: chat.participantsCount || 0
                        });
                    }
                }
            }
            await new Promise(resolve => setTimeout(resolve, 2500));
        }

        console.log(`✅ Found Total ${allGroups.length} fresh groups!`);
        res.json({ success: true, groups: allGroups });

    } catch (error) {
        console.error("Error:", error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==========================================
// API 2: ONLY AUTO-JOIN
// ==========================================
app.post('/api/join-groups', async (req, res) => {
    const { groups } = req.body;

    if (!groups || groups.length === 0) return res.status(400).json({ error: "Missing groups list" });

    console.log(`\n🚀 Auto-Join Started: Processing ${groups.length} groups...`);
    let successCount = 0, failCount = 0;

    for (const group of groups) {
        try {
            // Anti-ban human delay
            const preJoinDelay = Math.floor(Math.random() * 8000) + 12000;
            console.log(`\n⏳ Human Delay: Waiting ${preJoinDelay/1000} seconds...`);
            await new Promise(resolve => setTimeout(resolve, preJoinDelay));

            console.log(`🔄 Attempting to Join: ${group}`);
            await client.invoke(new Api.channels.JoinChannel({ channel: group }));
            
            console.log(`✅ Joined ${group} successfully!`);
            successCount++;

        } catch (error) {
            console.log(`❌ Failed to join ${group}: ${error.message}`);
            failCount++;

            // Smart FloodWait Handler
            if (error.errorMessage && error.errorMessage.includes('A wait of')) {
                const waitSeconds = error.seconds || parseInt(error.errorMessage.match(/\d+/)[0]);
                console.log(`\n⚠️ Telegram Penalty! Pausing for ${waitSeconds} seconds...`);
                await new Promise(resolve => setTimeout(resolve, (waitSeconds + 2) * 1000));
                console.log(`🟢 Penalty over! Resuming...`);
            }
        }
    }
    console.log(`\n🎉 Auto-Join Complete! Joined: ${successCount}, Failed: ${failCount}`);
    res.json({ success: true, successCount, failCount });
});

(async () => {
    await client.connect();
    console.log("✅ Telegram Connected!");
    app.listen(PORT, () => { console.log(`\n🌐 Server running at http://127.0.0.1:${PORT}`); });
})();
