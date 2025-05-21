// chrome-installer.js
// This script will download and configure Chrome for Puppeteer
// It's used in the build process to ensure Chrome is available at runtime

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

(async () => {
  console.log('Installing Chrome for Puppeteer...');
  
  try {
    // Use Puppeteer's built-in browser downloader
    const browserFetcher = puppeteer.createBrowserFetcher();
    const revisionInfo = await browserFetcher.download(puppeteer.default.defaultBrowserRevision);
    
    console.log(`Chrome downloaded to: ${revisionInfo.folderPath}`);
    console.log(`Executable path: ${revisionInfo.executablePath}`);
    
    // Create a directory that will persist into the runtime environment
    const persistentDir = path.join(process.cwd(), '.render');
    if (!fs.existsSync(persistentDir)) {
      fs.mkdirSync(persistentDir, { recursive: true });
    }
    
    // Create a file with the path information
    fs.writeFileSync(
      path.join(persistentDir, 'chrome-path.json'),
      JSON.stringify({ executablePath: revisionInfo.executablePath })
    );
    
    console.log(`Chrome path information saved to: ${path.join(persistentDir, 'chrome-path.json')}`);
    console.log('Chrome installation complete!');
  } catch (error) {
    console.error('Failed to install Chrome:', error);
    process.exit(1);
  }
})();