#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const slug = process.env.REPO_SLUG || process.argv[2];
if (!slug) {
  console.error('Usage: REPO_SLUG=owner/repo node scripts/set-repo-badges.js');
  process.exit(1);
}

const readmePath = path.join(process.cwd(), 'README.md');
let content = fs.readFileSync(readmePath, 'utf8');
content = content.replace(/https:\/\/github\.com\/OWNER\/REPO\/actions\/workflows\/ci\.yml\/badge\.svg/g, `https://github.com/${slug}/actions/workflows/ci.yml/badge.svg`);
content = content.replace(/https:\/\/github\.com\/OWNER\/REPO\/actions\/workflows\/publish\.yml\/badge\.svg/g, `https://github.com/${slug}/actions/workflows/publish.yml/badge.svg`);
fs.writeFileSync(readmePath, content);
console.log('Updated badges in README.md for', slug);

