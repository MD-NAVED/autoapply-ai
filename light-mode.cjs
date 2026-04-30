const fs = require('fs');

const replaceMap = {
  // Dark to Light mapping
  '#020617': '#f8fafc', // 950 -> 50
  '#0f172a': '#ffffff', // 900 -> white
  '#1e293b': '#f1f5f9', // 800 -> 100
  '#334155': '#e2e8f0', // 700 -> 200
  '#475569': '#cbd5e1', // 600 -> 300
  '#64748b': '#94a3b8', // 500 -> 400
  '#94a3b8': '#64748b', // 400 -> 500
  '#cbd5e1': '#475569', // 300 -> 600
  '#e2e8f0': '#334155', // 200 -> 700
  '#f1f5f9': '#1e293b', // 100 -> 800
  '#f8fafc': '#0f172a', // 50 -> 900

  // Accents
  '#39ff14': '#2563eb', // green -> blue-600
  '#22c55e': '#3b82f6', // green -> blue-500
  '#15803d': '#1d4ed8', // dark green -> blue-700
};

function processFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  let content = fs.readFileSync(filePath, 'utf8');

  // 1. Text-white cleanup
  // Replace standalone text-white with text-[#0f172a] on inputs/hover
  // Except for specific selection / primary buttons
  content = content.replace(/hover:text-white/g, 'hover:text-[#0f172a]');
  
  // Specific regex mapping for standard text-white classes
  content = content.replace(/ text-white/g, ' text-[#0f172a]');
  
  // Actually, primary buttons will now map to bg-[#2563eb] text-[#ffffff] because their text was #0f172a.
  // Wait, let's map the colors first!
  const tokens = {};
  let i = 0;
  for (const [dark, light] of Object.entries(replaceMap)) {
    const token = `__TOKEN_${i}__`;
    tokens[token] = light;
    content = content.replace(new RegExp(dark, 'ig'), token);
    i++;
  }

  // 3. Update RGBA
  content = content.replace(/rgba\(57,\s*255,\s*20/g, '__TOKEN_RGBA__');
  tokens['__TOKEN_RGBA__'] = 'rgba(59, 130, 246';

  content = content.replace(/rgba\(34,\s*197,\s*94/g, '__TOKEN_RGBA_2__');
  tokens['__TOKEN_RGBA_2__'] = 'rgba(59, 130, 246';

  for (const [token, light] of Object.entries(tokens)) {
    content = content.replace(new RegExp(token, 'g'), light);
  }
  
  // Re-fix selection text to be white
  content = content.replace(/selection:text-\[#0f172a\]/g, 'selection:text-white');

  fs.writeFileSync(filePath, content);
  console.log(`Updated ${filePath}`);
}

processFile('src/App.tsx');
processFile('src/index.css');
