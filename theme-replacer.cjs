const fs = require('fs');

const colorMap = {
  '#f8fafc': 'var(--color-bg)', 
  '#ffffff': 'var(--color-card)', 
  '#f1f5f9': 'var(--color-border)', 
  '#e2e8f0': 'var(--color-border-hover)', 
  '#cbd5e1': 'var(--color-text-muted)', 
  '#94a3b8': 'var(--color-text-subtle)', 
  '#64748b': 'var(--color-text-secondary)', 
  '#475569': 'var(--color-text-primary)', 
  '#334155': 'var(--color-text-strong)', 
  '#1e293b': 'var(--color-text-dark)', 
  '#0f172a': 'var(--color-text-darkest)', 
  '#020617': 'var(--color-text-black)',
  '#2563eb': 'var(--color-accent)', 
  '#3b82f6': 'var(--color-accent-light)', 
  '#1d4ed8': 'var(--color-accent-hover)', 
  '#e0e7ff': 'var(--color-grad-start)', 
  '#c7d2fe': 'var(--color-grad-border)', 
};

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  for (const [hex, cssVar] of Object.entries(colorMap)) {
    content = content.replace(new RegExp(hex, 'ig'), cssVar);
  }
  
  content = content.replace(/rgba\(59,\s*130,\s*246/g, 'rgba(var(--color-accent-rgb)');
  
  fs.writeFileSync(filePath, content);
  console.log(`Processed ${filePath}`);
}

processFile('src/App.tsx');
processFile('src/index.css');
