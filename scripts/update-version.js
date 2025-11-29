#!/usr/bin/env node

/**
 * Updates the version tag in index.html with current git commit and timestamp
 */

import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';

try {
  // Get git commit hash (short version)
  const commitHash = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
  
  // Get current UTC timestamp
  const now = new Date();
  const utcDate = now.toISOString().split('T')[0]; // YYYY-MM-DD
  const utcTime = now.toISOString().split('T')[1].split('.')[0] + ' UTC'; // HH:MM:SS UTC
  
  // Format: v0.93.0 · 2025-01-15 14:30:00 UTC
  // Using commit hash as version identifier
  const versionString = `v${commitHash} · ${utcDate} ${utcTime}`;
  
  // Read index.html
  const htmlPath = './index.html';
  let html = readFileSync(htmlPath, 'utf-8');
  
  // Replace version tag (more flexible regex to match any version format)
  const versionRegex = /<div class="info-version-tag">[^<]+<\/div>/;
  const newVersionTag = `<div class="info-version-tag">${versionString}</div>`;
  
  if (versionRegex.test(html)) {
    html = html.replace(versionRegex, newVersionTag);
    writeFileSync(htmlPath, html, 'utf-8');
    console.log(`✓ Updated version to: ${versionString}`);
  } else {
    console.error('✗ Could not find version tag in index.html');
    process.exit(1);
  }
} catch (error) {
  console.error('✗ Error updating version:', error.message);
  process.exit(1);
}

