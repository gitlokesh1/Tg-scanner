const express = require('express');
const { addExtra } = require('puppeteer-extra');
const puppeteerCore = require('puppeteer-core');
const puppeteer = addExtra(puppeteerCore);
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');

puppeteer.use(StealthPlugin());
const app = express();
const PORT = 8081;

app.use(express.json());
app.use(express.static('public'));

const interestedWords = ["how", "interested", "details", "bhai batao", "dm", "link", "kese", "kaise", "kya", "batao", "yes"];

app.post('/api/scrape-insta', async (req, res) => {
    const { targetUrl } = req.body;
    console.log(`\n Starting Scraper for URL: ${targetUrl}`);
    let browser;

    try {
        const possiblePaths = [
            '/data/data/com.termux/files/usr/bin/chromium',
            '/data/data/com.termux/files/usr/bin/chromium-browser'
        ];
        const chromePath = possiblePaths.find(p => fs.existsSync(p));
        
        if (!chromePath) throw new Error("Chromium browser nahi mila");

        browser = await puppeteer.launch({
            executablePath: chromePath,
            headless: true, 
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--window-size=1080,1920']
        });

        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Linux; Android 10; SM-G975F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.120 Mobile Safari/537.36');

        if (fs.existsSync('insta-cookies.json')) {
            const cookies = JSON.parse(fs.readFileSync('insta-cookies.json'));
            await page.setCookie(...cookies);
            console.log(" Session loaded successfully");
        }

        console.log(` Navigating to Target Reel...`);
        await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 60000 });
        
        await new Promise(r => setTimeout(r, 4000));

        //  POPUP KILLER: "Not Now" ya "Save Info" ko automatically hatana
        console.log(" Checking and removing annoying popups...");
        await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button, div[role="button"]'));
            const notNowBtn = buttons.find(b => b.innerText.toLowerCase().includes('not now') || b.innerText.toLowerCase().includes('cancel'));
            if (notNowBtn) {
                notNowBtn.click();
            }
        });
        
        // Wait for popup to disappear and scroll
        await new Promise(r => setTimeout(r, 3000));
        console.log(" Loading comments and scrolling...");
        await page.evaluate(() => window.scrollBy(0, 500));
        await new Promise(r => setTimeout(r, 4000));

        await page.screenshot({ path: 'public/debug.png' });

        const rawComments = await page.evaluate(() => {
            let blocks = Array.from(document.querySelectorAll('div, ul > li'));
            return blocks.map(el => el.innerText).filter(text => text && text.includes('\n'));
        });

        const leads = [];
        for (let block of rawComments) {
            let lines = block.split('\n').map(l => l.trim()).filter(l => l);
            if (lines.length >= 2) {
                let username = lines[0].toLowerCase();
                let text = lines.slice(1).join(' ').toLowerCase();
                
                const isInterested = interestedWords.some(w => text.includes(w));
                const isValidUser = !username.includes(' ') && username.length > 2 && username.length < 30;
                
                if (isInterested && isValidUser && !leads.some(l => l.username === username)) {
                    leads.push({ username, commentText: text });
                    console.log(` Hot Lead Found: @${username}`);
                }
            }
        }

        console.log(` Total ${leads.length} Leads Extracted`);
        res.json({ success: true, leads: leads });

        await browser.close();
    } catch (error) {
        console.error(" Scraper Error:", error.message);
        if (browser) await browser.close();
        res.status(500).json({ success: false, error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`\n Dashboard running at: http://127.0.0.1:${PORT}/insta.html`);
});
