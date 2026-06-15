const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const input = require('input'); // OTP lene ke liye
const fs = require('fs');

// Aapke API details
const apiId = 39942557; 
const apiHash = '77a67551c7f83be89c33da3a95eefea0'; 
const stringSession = new StringSession(''); // Naya session banega

(async () => {
    console.log("🚀 Starting Login Setup for New Number...");
    const client = new TelegramClient(stringSession, apiId, apiHash, { connectionRetries: 5 });
    
    await client.start({
        phoneNumber: async () => await input.text('📱 Apna Naya Mobile Number daalein (Country code ke saath, jaise +91...): '),
        password: async () => await input.text('🔑 2-Step Password daalein (agar nahi hai toh bas Enter dabayein): '),
        phoneCode: async () => await input.text('✉️ Telegram OTP Code daalein: '),
        onError: (err) => console.log(err),
    });

    console.log("✅ Naye number se login SUCCESSFUL!");
    
    // Naya session file save karna
    fs.writeFileSync('session.txt', client.session.save()); 
    console.log("💾 Session save ho gaya! Ab aap apna main server chala sakte hain.");
    
    process.exit(0);
})();
