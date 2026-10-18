/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * BET & BRAWL: Android Asset Sync Script
 * Copies the compiled Vite frontend production distribution into the Android assets directory.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const distDir = path.join(rootDir, 'dist');
const targetAssetsDir = path.join(rootDir, 'app', 'src', 'main', 'assets', 'web');

function copyRecursiveSync(src, dest) {
  const exists = fs.existsSync(src);
  const stats = exists && fs.statSync(src);
  const isDirectory = exists && stats.isDirectory();

  if (isDirectory) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    fs.readdirSync(src).forEach(childItemName => {
      copyRecursiveSync(path.join(src, childItemName), path.join(dest, childItemName));
    });
  } else {
    fs.copyFileSync(src, dest);
  }
}

if (!fs.existsSync(distDir)) {
  console.error('Error: dist/ directory does not exist. Run "npm run build" first.');
  process.exit(1);
}

// Clean target directory
if (fs.existsSync(targetAssetsDir)) {
  fs.rmSync(targetAssetsDir, { recursive: true, force: true });
}
fs.mkdirSync(targetAssetsDir, { recursive: true });

copyRecursiveSync(distDir, targetAssetsDir);

// Verify and rewrite index.html paths to ensure relative asset loading on Android
const indexHtmlPath = path.join(targetAssetsDir, 'index.html');
if (fs.existsSync(indexHtmlPath)) {
  let html = fs.readFileSync(indexHtmlPath, 'utf8');
  html = html.replace(/src="\/assets\//g, 'src="./assets/');
  html = html.replace(/href="\/assets\//g, 'href="./assets/');
  fs.writeFileSync(indexHtmlPath, html, 'utf8');
}

console.log(`[BET & BRAWL] Successfully synced bundled frontend assets to: ${targetAssetsDir}`);
