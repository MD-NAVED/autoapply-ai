const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

// Replace sky blue colors with neon green
content = content.replace(/#38bdf8/g, '#39ff14'); // Sky-400 -> Neon Green
content = content.replace(/#0ea5e9/g, '#22c55e'); // Sky-500 -> Green-500
content = content.replace(/#0369a1/g, '#15803d'); // Sky-700 -> Green-700

fs.writeFileSync('src/App.tsx', content);

// Also replace in src/index.css if any
let cssContent = fs.readFileSync('src/index.css', 'utf8');
cssContent = cssContent.replace(/#38bdf8/g, '#39ff14');
cssContent = cssContent.replace(/#0ea5e9/g, '#22c55e');
cssContent = cssContent.replace(/#0369a1/g, '#15803d');
fs.writeFileSync('src/index.css', cssContent);

console.log('Colors replaced successfully!');
