const fs = require('fs');
const path = require('path');

const VAULT_PATH = "C:\\Users\\CMLO\\OneDrive - ccckcss\\文件\\Obsidian Vault\\School\\Medvault Logs";

function saveNote(title, content) {
  if (!fs.existsSync(VAULT_PATH)) {
    fs.mkdirSync(VAULT_PATH, { recursive: true });
  }

  const fileName = `${new Date().toISOString().split('T')[0]}_${title.replace(/[^a-z0-9\u4e00-\u9fa5]/gi, '_')}.md`;
  const filePath = path.join(VAULT_PATH, fileName);

  const noteContent = `---
date: ${new Date().toLocaleString()}
tags: [medvault, ai-log]
---

# ${title}

${content}
`;

  fs.writeFileSync(filePath, noteContent, 'utf8');
  console.log(`Saved note to ${filePath}`);
}

const args = process.argv.slice(2);
if (args.length >= 2) {
  saveNote(args[0], args[1]);
} else {
  console.log("Usage: node scripts/save_to_obsidian.js <title> <content>");
}
