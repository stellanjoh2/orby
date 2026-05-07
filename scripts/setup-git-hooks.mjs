#!/usr/bin/env node
/**
 * Points Git at tracked hooks (.githooks) and removes the legacy pre-push stub that only
 * ran update-version + git add without amending — that left VERSION/index.html staged after
 * every push (duplicate bumps when combined with .githooks/pre-push).
 */
import { execSync } from 'child_process';
import { existsSync, readFileSync, unlinkSync } from 'fs';
import { join } from 'path';

function main() {
  let root;
  try {
    root = execSync('git rev-parse --show-toplevel', {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    process.exit(0);
  }

  process.chdir(root);

  execSync('git config core.hooksPath .githooks', {
    stdio: 'inherit',
  });

  const legacy = join(root, '.git/hooks/pre-push');
  if (!existsSync(legacy)) {
    console.log('Git hooks: core.hooksPath=.githooks');
    return;
  }

  const body = readFileSync(legacy, 'utf-8');
  const isLegacyStub =
    body.includes('node scripts/update-version.js') &&
    body.includes('git add VERSION index.html') &&
    !body.includes('commit --amend');

  if (isLegacyStub) {
    unlinkSync(legacy);
    console.log(
      'Removed legacy .git/hooks/pre-push (fragmented version bump). Using .githooks/pre-push only.',
    );
  } else {
    console.log(
      'Git hooks: core.hooksPath=.githooks (left custom .git/hooks/pre-push in place)',
    );
  }
}

main();
