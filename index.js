const { TelegramClient, Api } = require('telegram');
const { StringSession } = require('telegram/sessions');
const input = require('input'); 
const fs = require('fs');

const apiId = 39942557; 
const apiHash = '77a67551c7f83be89c33da3a95eefea0'; 
const GEMINI_KEY = 'AIzaSyDxlN8kok5dO5K55svVCF_cxWM0ytN5VRA'; // Agar AI nahi chahiye toh khali chhod dein

const sessionFile = 'session.txt';
let sessionString = '';
if (fs.existsSync(sessionFile)) {
    sessionString = fs.readFileSync(sessionFile, 'utf8');
}
const stringSession = new StringSession(sessionString);

(async () => {
    console.log("🚀 Starting Telegram Client...");
    
    const client = new TelegramClient(stringSession, apiId, apiHash, {
        connectionRetries: 5,
    });

    client.setLogLevel("none");

    await client.start({
        phoneNumber: async () => await input.text('📱 Enter your phone number (e.g. +91...): '),
        password: async () => await input.text('🔑 Enter your 2FA password: '),
        phoneCode: async () => await input.text('✉️ Enter verification code: '),
        onError: (err) => console.log(err),
    });

    fs.writeFileSync(sessionFile, client.session.save());

    const query = await input.text('\n🔍 Enter keyword to search groups (e.g., Casino): ');
    
    console.log(`\n⏳ Searching Telegram for "${query}" (Only Chat-Allowed Groups)...\n`);
    
    try {
        const result = await client.invoke(new Api.contacts.Search({
            q: query,
            limit: 20 // Thoda limit badha diya taaki filter hone ke baad bhi results bachein
        }));

        const groups = [];
        
        if (result.chats.length === 0) {
            console.log("❌ Koi result nahi mila.");
            process.exit(0);
        }

        for (const chat of result.chats) {
            // FILTER 1: Woh channel (broadcast) nahi hona chahiye
            if (!chat.broadcast) {
                
                // FILTER 2: Default users ke liye message bhejna BANNED nahi hona chahiye
                let canSendMessages = true;
                if (chat.defaultBannedRights && chat.defaultBannedRights.sendMessages) {
                    canSendMessages = false; // Admin ne public chat band ki hui hai
                }

                // Agar dono filter pass hote hain, tabhi list mein add karo
                if (canSendMessages) {
                    const groupData = {
                        title: chat.title,
                        username: chat.username ? `@${chat.username}` : 'Private',
                        members: chat.participantsCount || 'N/A'
                    };
                    groups.push(groupData);
                    
                    console.log(`✅ [CHAT OPEN] Group: ${groupData.title} (${groupData.username}) | 👥 ${groupData.members} Members`);
                    
                    // AI Check Logic
                    if (GEMINI_KEY && GEMINI_KEY.length > 10) {
                        try {
                            const prompt = `Analyze if this Telegram group title is legit or spam: "${chat.title}". Give a 1-line verdict.`;
                            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
                            });
                            const data = await response.json();
                            console.log(`   🤖 AI Verdict: ${data.candidates[0].content.parts[0].text.trim()}\n`);
                        } catch (e) {
                            // Ignored fetch error
                        }
                    }
                }
            }
        }
        
        if(groups.length === 0) {
            console.log("⚠️ Results mile, par sabhi mein 'Public Chat' band (Mute) thi.");
        } else {
            fs.writeFileSync('groups.json', JSON.stringify(groups, null, 2));
            console.log(`\n💾 Saved ${groups.length} Chat-Allowed groups to 'groups.json'`);
        }

    } catch (error) {
        console.error("Search Error:", error.message);
    }
    
    process.exit(0);
})();


