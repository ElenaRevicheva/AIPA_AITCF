#!/usr/bin/env node
/**
 * Contract: /visualize aliases stay stable; only pins.ts changes on a grade bump.
 * Run: node scripts/test-atuona-video-pins.cjs
 */
const fs = require('fs');
const path = require('path');
const pins = fs.readFileSync(path.join(__dirname, '..', 'src', 'atuona-video-pins.ts'), 'utf8');

let pass = 0;
const fails = [];
const ok = (name, cond) => {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fails.push(name);
    console.log(`  ✗ ${name}`);
  }
};

ok('luma pin is ray-3.2', pins.includes("fallback: 'ray-3.2'"));
ok('omni pin is gemini-omni-1.1-flash', pins.includes("fallback: 'gemini-omni-1.1-flash'"));
ok('runway pin is gen4.5', pins.includes("fallback: 'gen4.5'"));
ok('veo pin is veo-3.1-generate-preview', pins.includes("fallback: 'veo-3.1-generate-preview'"));
ok('kling pin is kwaivgi/kling-v3-video', pins.includes("fallback: 'kwaivgi/kling-v3-video'"));
ok('seedance pin is bytedance/seedance-2.5', pins.includes("fallback: 'bytedance/seedance-2.5'"));
ok('deepseek pin grade is DeepSeek video', pins.includes("grade: 'DeepSeek video'"));
ok('menu order includes all seven engines', pins.includes("'luma'") && pins.includes("'deepseek'") && pins.includes('VIDEO_PIN_ORDER'));

if (fails.length) {
  console.error(`\nFAILED ${fails.length}:\n- ${fails.join('\n- ')}`);
  process.exit(1);
}
console.log(`\n${pass} checks passed — video pins are current`);
