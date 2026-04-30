const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');
content = content.replace(/text-\[var\(--color-card\)\]/g, 'text-[var(--color-text-darkest)]');
fs.writeFileSync('src/App.tsx', content);
console.log('Fixed text colors');
