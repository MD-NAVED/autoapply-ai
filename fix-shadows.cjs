const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

// Replace leftover blue colors to green tones
content = content.replace(/#2563eb/g, '#15803d');
content = content.replace(/rgba\(56,\s*189,\s*248/g, 'rgba(57, 255, 20');

// Wait, let's also make sure we didn't miss any others. Like #0ea5e9 rgb is 14,165,233.
content = content.replace(/rgba\(14,\s*165,\s*233/g, 'rgba(34, 197, 94'); // green-500

fs.writeFileSync('src/App.tsx', content);

console.log('Fixed leftover colors successfully!');
