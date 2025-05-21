// Import puppeteer with browser fetcher capabilities
const puppeteer = require('puppeteer');
const TelegramBot = require('node-telegram-bot-api');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// Find Chrome in the Puppeteer cache
const findChromePath = () => {
    // Look for Chrome path in our saved file
    const chromePathFile = '/opt/render/project/.render/chrome-path.txt';
    if (fs.existsSync(chromePathFile)) {
        try {
            const chromePath = fs.readFileSync(chromePathFile, 'utf8').trim();
            console.log("Found Chrome path in file:", chromePath);
            if (fs.existsSync(chromePath)) {
                return chromePath;
            } else {
                console.log("Chrome path from file doesn't exist on disk");
            }
        } catch (error) {
            console.error("Error reading Chrome path file:", error);
        }
    }
    
    // Look for the symlink we created during build
    const renderSymlink = '/opt/render/project/.render/chrome';
    if (fs.existsSync(renderSymlink)) {
        console.log("Found Chrome symlink at", renderSymlink);
        return renderSymlink;
    }
    
    const PUPPETEER_CACHE = '/opt/render/.cache/puppeteer';
    // Look for Chrome in the Puppeteer cache
    if (fs.existsSync(PUPPETEER_CACHE)) {
        console.log("Puppeteer cache directory exists");
        // Find chrome executable in the cache
        try {
            // Use glob pattern to find chrome executable
            const chromePaths = [];
            const searchDir = (dir) => {
                const files = fs.readdirSync(dir);
                for (const file of files) {
                    const fullPath = path.join(dir, file);
                    if (fs.statSync(fullPath).isDirectory()) {
                        searchDir(fullPath);
                    } else if (file === 'chrome' || file === 'chrome.exe') {
                        chromePaths.push(fullPath);
                    }
                }
            };
            searchDir(PUPPETEER_CACHE);
            
            if (chromePaths.length > 0) {
                console.log("Found Chrome paths:", chromePaths);
                return chromePaths[0]; // Return the first Chrome path found
            }
        } catch (error) {
            console.error("Error searching for Chrome:", error);
        }
    }
    
    // Try puppeteer's package installation
    try {
        const puppeteerPath = require.resolve('puppeteer');
        const packagePath = path.join(path.dirname(puppeteerPath), '.local-chrome', 'chrome-linux', 'chrome');
        if (fs.existsSync(packagePath)) {
            console.log("Found Chrome in puppeteer package:", packagePath);
            return packagePath;
        }
    } catch (error) {
        console.error("Error checking puppeteer package:", error);
    }
    
    return null;
};

const URL = 'http://nakodabullion.com/';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

let targets = [];
let currentAskPrice = null;
const CHECK_INTERVAL = 10000;

function sendTelegramMessage(text) {
    bot.sendMessage(TELEGRAM_CHAT_ID, text).catch(console.error);
}

bot.on('message', (msg) => {
    if (msg.chat.id.toString() !== TELEGRAM_CHAT_ID) return;
    const text = msg.text.trim();

    if (text.startsWith('/add')) {
        const parts = text.split(' ');
        if (parts.length < 2) {
            return bot.sendMessage(TELEGRAM_CHAT_ID, 'Usage: /add <price>');
        }
        const price = parseFloat(parts[1]);
        if (isNaN(price)) {
            return bot.sendMessage(TELEGRAM_CHAT_ID, 'Invalid price.');
        }
        if (targets.includes(price)) {
            return bot.sendMessage(TELEGRAM_CHAT_ID, `₹${price} already exists.`);
        }
        targets.push(price);
        targets.sort((a, b) => a - b);
        bot.sendMessage(TELEGRAM_CHAT_ID, `Added target: ₹${price}`);
    } else if (text.startsWith('/remove')) {
        const parts = text.split(' ');
        if (parts.length < 2) {
            return bot.sendMessage(TELEGRAM_CHAT_ID, 'Usage: /remove <price>');
        }
        const price = parseFloat(parts[1]);
        if (isNaN(price)) {
            return bot.sendMessage(TELEGRAM_CHAT_ID, 'Invalid price.');
        }
        if (!targets.includes(price)) {
            return bot.sendMessage(TELEGRAM_CHAT_ID, `Target ₹${price} not found.`);
        }
        targets = targets.filter(p => p !== price);
        bot.sendMessage(TELEGRAM_CHAT_ID, `Removed target: ₹${price}`);
    } else if (text === '/listtargets') {
        bot.sendMessage(TELEGRAM_CHAT_ID, `Current targets:\n${targets.join(', ')}`);
    } else if (text === '/current') {
        if (currentAskPrice !== null) {
            bot.sendMessage(TELEGRAM_CHAT_ID, `Current ASK price: ₹${currentAskPrice}`);
        } else {
            bot.sendMessage(TELEGRAM_CHAT_ID, `Price not available yet. Please wait...`);
        }
    } else if (text === '/help') {
        bot.sendMessage(TELEGRAM_CHAT_ID,
`Commands:
/add <price> - Add a target
/remove <price> - Remove a target
/listtargets - List targets
/current - Show current ASK price
/help - Show help`);
    } else {
        bot.sendMessage(TELEGRAM_CHAT_ID, 'Unknown command. Type /help');
    }
});

(async () => {
    console.log("[INFO] Starting the price monitoring bot...");
    
    // Find Chrome path
    const chromePath = findChromePath();
    console.log("Chrome path:", chromePath);
    
    // Puppeteer launch configuration
    const launchOptions = {
        headless: "new",
        ignoreHTTPSErrors: true,
        userDataDir: '/tmp/puppeteer_user_data',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-blink-features=AutomationControlled'
        ]
    };
    
    // Set executable path if found
    if (chromePath) {
        console.log("Using Chrome at:", chromePath);
        launchOptions.executablePath = chromePath;
    } else {
        console.log("No Chrome path found, using default");
    }
    
    // Launch browser
    const browser = await puppeteer.launch(launchOptions);

    console.log("[INFO] Browser launched successfully");
    
    const page = await browser.newPage();
    
    // Set a user agent to avoid detection
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36');
    
    console.log("[INFO] Navigating to website...");
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    console.log("[INFO] Website loaded");

    try {
        await page.waitForSelector('#proceed-button', { timeout: 5000 });
        await page.click('#proceed-button');
        await page.waitForNavigation({ waitUntil: 'networkidle2' });
        console.log("[INFO] Clicked proceed button");
    } catch (err) {
        console.log('[INFO] Proceed button not found or already passed.');
    }

    sendTelegramMessage('[INFO] Bot started and monitoring prices.');
    console.log("[INFO] Bot initialized and ready to monitor prices");

    while (true) {
        try {
            console.log("[INFO] Reloading page to get fresh prices...");
            await page.reload({ waitUntil: 'domcontentloaded' });
            await page.waitForSelector('.m_prodct', { timeout: 30000 });

            const silverCorshaData = await page.evaluate(() => {
                const productRows = document.querySelectorAll('.m_prodct');
                for (const row of productRows) {
                    const nameElement = row.querySelector('.m_width1');
                    if (nameElement && nameElement.textContent.includes('Silver CORSHA 5 Kgs')) {
                        const bidElement = row.querySelector('.m_width2:nth-of-type(2) .redgreen');
                        const askElement = row.querySelector('.m_width2:nth-of-type(3) .redgreen');
                        return {
                            type: nameElement.textContent.trim(),
                            bid: bidElement ? parseFloat(bidElement.textContent.trim()) : null,
                            ask: askElement ? parseFloat(askElement.textContent.trim()) : null
                        };
                    }
                }
                return null;
            });

            if (!silverCorshaData) {
                throw new Error('Silver CORSHA 5 Kgs data not found');
            }

            const { type, bid, ask } = silverCorshaData;
            currentAskPrice = ask;
            console.log(`[INFO] ${type} => BID: ₹${bid}, ASK: ₹${ask}`);

            for (const target of [...targets]) {
                if (ask !== null && ask <= target) {
                    const message = `[ALERT] ${type} ASK price dropped to ₹${ask} (target was ₹${target})!`;
                    console.log(message);
                    sendTelegramMessage(message);
                    targets = targets.filter(t => t !== target);  // Remove the hit target
                }
            }
            
        } catch (err) {
            console.error('[ERROR]', err.message);
            sendTelegramMessage(`[ERROR] ${err.message}`);
        }
        await new Promise(r => setTimeout(r, CHECK_INTERVAL));
    }
})();