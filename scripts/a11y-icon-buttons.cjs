// Finds buttons (TouchableOpacity, Pressable, TouchableHighlight) that show only an icon and have no accessibilityLabel: TalkBack
// reads such a button as just "button". Used by __tests__/unit/a11yIconButtons.test.ts to stop the list growing.
const fs = require('node:fs');
const path = require('node:path');

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else if (p.endsWith('.tsx')) out.push(p);
  }
  return out;
}

function unlabeledIconButtons(srcDir) {
  const found = [];
  const open = /<(TouchableOpacity|Pressable|TouchableHighlight)\b((?:[^>{]|\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\})*?)>/gs;
  for (const file of walk(srcDir)) {
    const s = fs.readFileSync(file, 'utf8');
    for (const m of s.matchAll(open)) {
      const attrs = m[2];
      if (/accessibilityLabel/.test(attrs) || attrs.includes('{...') || attrs.trimEnd().endsWith('/')) continue;
      const end = s.indexOf(`</${m[1]}>`, m.index + m[0].length);
      const body = end > 0 ? s.slice(m.index + m[0].length, end) : '';
      if (body.includes('<Text') || attrs.includes('title=') || !body.includes('Icon')) continue;
      found.push(`${path.relative(srcDir, file)}:${s.slice(0, m.index).split('\n').length}`);
    }
  }
  return found;
}

module.exports = { unlabeledIconButtons };
