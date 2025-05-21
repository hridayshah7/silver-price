#!/usr/bin/env bash
# Exit on error
set -o errexit

npm install
# Install Chromium via puppeteer
echo "Installing Chrome using puppeteer..."
npx puppeteer browsers install chrome
# Make sure the binary is executable
if [ -d "/opt/render/.cache/puppeteer" ]; then
  echo "Found puppeteer cache directory"
  find /opt/render/.cache/puppeteer -name chrome -type f -exec ls -la {} \;
  find /opt/render/.cache/puppeteer -name chrome -type f -exec chmod +x {} \;
fi