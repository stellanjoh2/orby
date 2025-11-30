#!/usr/bin/env node

/**
 * Updates the version tag in index.html with semantic versioning
 * Increments patch version (0.5.0 -> 0.5.1 -> 0.5.2, etc.) on each run
 */

import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';

try {
  const versionPath = './VERSION';
  
  // Read current version
  let currentVersion = readFileSync(versionPath, 'utf-8').trim();
  
  // Parse version (e.g., "0.5.0")
  const versionParts = currentVersion.split('.');
  if (versionParts.length !== 3) {
    throw new Error(`Invalid version format: ${currentVersion}. Expected format: X.Y.Z`);
  }
  
  // Increment patch version (0.5.0 -> 0.5.1)
  const major = parseInt(versionParts[0], 10);
  const minor = parseInt(versionParts[1], 10);
  const patch = parseInt(versionParts[2], 10) + 1;
  const newVersion = `${major}.${minor}.${patch}`;
  
  // Write updated version back to file
  writeFileSync(versionPath, newVersion + '\n', 'utf-8');
  
  // Get current UTC timestamp
  const now = new Date();
  const utcDate = now.toISOString().split('T')[0]; // YYYY-MM-DD
  const utcTime = now.toISOString().split('T')[1].split('.')[0] + ' UTC'; // HH:MM:SS UTC
  
  // Format: v0.5.1 · 2025-01-15 14:30:00 UTC
  const versionString = `v${newVersion} · ${utcDate} ${utcTime}`;
  
  // Get latest commit message for changelog
  let changelogText = 'No changes recorded';
  try {
    const commitMessage = execSync('git log -1 --pretty=%B', { encoding: 'utf-8' }).trim();
    if (commitMessage) {
      // Clean up and format commit message for human readability
      const lines = commitMessage
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0 && !line.startsWith('#'))
        .slice(0, 5); // Take first 5 lines max
      
      if (lines.length > 0) {
        // Process main message - keep technical terms but make them readable
        let mainMessage = lines[0]
          .replace(/^(\w+):\s*/i, '') // Remove "type: " prefixes like "feat:", "fix:"
          .replace(/^(Add|Added|Fix|Fixed|Update|Updated|Remove|Removed|Change|Changed|Improve|Improved|Refactor|Refactored|Create|Created|Implement|Implemented)\s+/i, '')
          .trim();
        
        // Capitalize first letter
        if (mainMessage.length > 0) {
          mainMessage = mainMessage.charAt(0).toUpperCase() + mainMessage.slice(1);
        }
        
        // Process bullet points - keep technical details but format them naturally
        const bullets = [];
        if (lines.length > 1) {
          lines.slice(1).forEach(line => {
            let bullet = line.replace(/^[-•*]\s*/, '').trim();
            bullet = bullet.replace(/^(Add|Added|Fix|Fixed|Update|Updated|Remove|Removed|Change|Changed|Improve|Improved|Refactor|Refactored|Create|Created|Implement|Implemented)\s+/i, '');
            if (bullet.length > 10 && bullet.length < 120) {
              // Make it flow naturally - lowercase first letter for continuation
              bullet = bullet.charAt(0).toLowerCase() + bullet.slice(1);
              // Ensure proper punctuation
              if (!bullet.match(/[.!?]$/)) {
                bullet = bullet + '.';
              }
              bullets.push(bullet);
            }
          });
        }
        
        // Combine into readable format with technical details preserved
        if (bullets.length > 0) {
          // Format as: "Main message. First bullet. Second bullet."
          changelogText = mainMessage;
          bullets.slice(0, 2).forEach(bullet => {
            changelogText += ' ' + bullet;
          });
        } else {
          changelogText = mainMessage;
        }
        
        // Final cleanup - ensure proper spacing and punctuation
        changelogText = changelogText
          .replace(/\s+/g, ' ')
          .replace(/\s+\./g, '.')
          .replace(/\.\s*\./g, '.')
          .replace(/^\.+\s*/, '')
          .trim();
        
        // Ensure it ends with punctuation
        if (changelogText.length > 0 && !changelogText.match(/[.!?]$/)) {
          changelogText = changelogText + '.';
        }
        
        // Limit length for readability (but keep technical details)
        if (changelogText.length > 300) {
          const lastPeriod = changelogText.substring(0, 297).lastIndexOf('.');
          if (lastPeriod > 150) {
            changelogText = changelogText.substring(0, lastPeriod + 1);
          } else {
            changelogText = changelogText.substring(0, 297) + '...';
          }
        }
      }
    }
  } catch (error) {
    console.warn('⚠ Could not get commit message for changelog:', error.message);
  }
  
  // Read index.html
  const htmlPath = './index.html';
  let html = readFileSync(htmlPath, 'utf-8');
  
  // Replace version tags (both info page and dropzone)
  const infoVersionRegex = /<div class="info-version-tag">[^<]+<\/div>/;
  const dropzoneVersionRegex = /<div class="dropzone-version-tag">[^<]+<\/div>/;
  const newInfoVersionTag = `<div class="info-version-tag">${versionString}</div>`;
  const newDropzoneVersionTag = `<div class="dropzone-version-tag">${versionString}</div>`;
  
  let foundInfo = false;
  let foundDropzone = false;
  
  if (infoVersionRegex.test(html)) {
    html = html.replace(infoVersionRegex, newInfoVersionTag);
    foundInfo = true;
  }
  
  if (dropzoneVersionRegex.test(html)) {
    html = html.replace(dropzoneVersionRegex, newDropzoneVersionTag);
    foundDropzone = true;
  }
  
  if (!foundInfo && !foundDropzone) {
    console.error('✗ Could not find version tags in index.html');
    process.exit(1);
  }
  
  if (!foundInfo) {
    console.warn('⚠ Could not find info version tag');
  }
  
  if (!foundDropzone) {
    console.warn('⚠ Could not find dropzone version tag');
  }
  
  // Update changelog in its own "Latest Changes" section
  // Find and replace the content inside the existing "Latest Changes" panel-block
  const changelogRegex = /(<div class="panel-block">\s*<div class="block-title"><i class="fa-solid fa-code"[^>]*><\/i>Latest Changes<\/div>\s*<div class="about-content">\s*<div style="color: var\(--text-dim\); font-size: 0\.9rem; line-height: 1\.5;">)[^<]*(<\/div>\s*<\/div>\s*<\/div>)/;
  
  if (changelogRegex.test(html)) {
    html = html.replace(changelogRegex, `$1${changelogText}$2`);
  } else {
    // If the section doesn't exist, try to add it after Credits
    const creditsEndRegex = /(<\/ul>\s*<\/div>\s*<\/div>\s*<\/div>)(\s*<div class="info-version-tag">)/;
    if (creditsEndRegex.test(html)) {
      html = html.replace(creditsEndRegex, `$1

              <div class="panel-block">
                <div class="block-title"><i class="fa-solid fa-code" style="display: inline-block; vertical-align: -0.125em; margin-right: 0.5rem; color: var(--accent);"></i>Latest Changes</div>
                <div class="about-content">
                  <div style="color: var(--text-dim); font-size: 0.9rem; line-height: 1.5;">${changelogText}</div>
                </div>
              </div>

              $2`);
    } else {
      console.warn('⚠ Could not find location to add changelog section');
    }
  }
  
  writeFileSync(htmlPath, html, 'utf-8');
  console.log(`✓ Updated version to: ${versionString}`);
  console.log(`✓ Updated changelog: ${changelogText.substring(0, 50)}...`);
} catch (error) {
  console.error('✗ Error updating version:', error.message);
  process.exit(1);
}


