const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

// The button has: bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-[var(--color-text-darkest)] hover:text-[var(--color-text-darkest)]
content = content.replace(/text-\[var\(--color-text-darkest\)\] hover:text-\[var\(--color-text-darkest\)\]/g, 'text-[var(--color-on-accent)] hover:text-[var(--color-on-accent)]');

fs.writeFileSync('src/App.tsx', content);
console.log('Fixed on-accent texts');
