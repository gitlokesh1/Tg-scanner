const { TelegramClient } = require('telegram'); // 'c' small kar diya gaya hai
const { StringSession } = require('telegram/sessions');
const input = require('input'); 
const fs = require('fs');

const apiId = Number(process.env.TELEGRAM_API_ID) || 0;
const apiHash = process.env.TELEGRAM_API_HASH || '';

if (!apiId || !apiHash) {
    console.error('❌ TELEGRAM_API_ID and TELEGRAM_API_HASH env vars required. Copy .env.example to .env and fill them.');
    process.exit(1);
}
const stringSession = new StringSession(''); 

(async () => {
    console.log("🚀 Starting Login Setup for New Number...");
    const client = new TelegramClient(stringSession, apiId, apiHash, { connectionRetries: 5 });
    
    await client.start({
        phoneNumber: async () => await input.text('📱 Apna Naya Mobile Number daalein (Country code ke saath, jaise +91...): '),
        password: async () => await input.text('🔑 2-Step Password daalein (agar nahi hai toh bas Enter dabayein): '),
        phoneCode: async () => await input.text('✉️ Telegram OTP Code daalein: '),
        onError: (err) => console.log("⚠️ Auth Error:", err),
    });

    console.log("✅ Naye number se login SUCCESSFUL!");
    
    fs.writeFileSync('session.txt', client.session.save()); 
    console.log("💾 Session save ho gaya! Ab aap apna main server chala sakte hain.");
    
    process.exit(0);
})();
