const puppeteer = require('puppeteer');
const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();

const URL = 'http://nakodabullion.com/';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

let targets = [];
let currentAskPrice = null;
const CHECK_INTERVAL = 1000;

function sendTelegramMessage(text) {
    const isAlert = text.startsWith('[ALERT]');
    bot.sendMessage(TELEGRAM_CHAT_ID, text, {
        disable_notification: !isAlert  // 🔔 Sound only for [ALERT] messages
    }).catch(console.error);
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
    const browser = await puppeteer.launch({
        headless: 'new',
        ignoreHTTPSErrors: true,
        userDataDir: './puppeteer_data',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-blink-features=AutomationControlled'
        ]
    });

    const page = await browser.newPage();
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

    try {
        await page.waitForSelector('#proceed-button', { timeout: 5000 });
        await page.click('#proceed-button');
        await page.waitForNavigation({ waitUntil: 'networkidle2' });
    } catch {
        console.log('[INFO] Proceed button not found or already passed.');
    }

    sendTelegramMessage('[INFO] Bot started and monitoring prices.');

    while (true) {
        try {
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
                    targets = targets.filter(t => t !== target);  // ✅ Remove the hit target
                }
            }
            
        } catch (err) {
            console.error('[ERROR]', err.message);
            sendTelegramMessage(`[ERROR] ${err.message}`);
        }
        await new Promise(r => setTimeout(r, CHECK_INTERVAL));
    }
})();

