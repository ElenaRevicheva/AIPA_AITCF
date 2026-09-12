#!/usr/bin/env node
/**
 * Contract: `/visualize deepseek` is a video command.
 *
 * DeepSeek's public API has no pixel renderer. Atuona still owes Elena a clip
 * when she picks DeepSeek on visualize — Seedance (then the chain) shoots,
 * Telegram labels it DeepSeek, and the bot must not refuse for a missing
 * Flash key or lecture that DeepSeek "only writes text".
 *
 * Run: node scripts/test-visualize-deepseek.cjs
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src', 'atuona-creative-ai.ts');
const PINS = path.join(__dirname, '..', 'src', 'atuona-video-pins.ts');
const src = fs.readFileSync(SRC, 'utf8');
const pins = fs.readFileSync(PINS, 'utf8');

let pass = 0;
const fails = [];
const ok = (name, cond, detail) => {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fails.push(`${name}${detail ? ' — ' + detail : ''}`);
    console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`);
  }
};

ok(
  'pins map deepseek / ds / dsflash',
  pins.includes("id: 'deepseek'") &&
    pins.includes("'ds'") &&
    pins.includes("'dsflash'"),
);

ok(
  'VideoProvider union includes deepseek',
  /export type VideoProvider = [^;]*'deepseek'/.test(pins),
);

ok(
  'studio imports parseVideoProvider from pins (no rewire on grade bump)',
  src.includes("from './atuona-video-pins'") && src.includes('visualizeMenuLines'),
);

const dsBranch = src.slice(
  src.indexOf("preferredProvider === 'deepseek'"),
  src.indexOf("preferredProvider === 'runway'"),
);
ok(
  'deepseek visualize path exists',
  dsBranch.includes("preferredProvider === 'deepseek'") && dsBranch.includes('trySeedance'),
);
ok(
  'deepseek visualize shoots — does not require DEEPSEEK_API_KEY',
  !dsBranch.includes('DEEPSEEK_API_KEY missing') && !dsBranch.includes('deepseekConfigured()'),
);
ok(
  'deepseek visualize announces a video, not a writer',
  dsBranch.includes('Generating video with DeepSeek'),
);
ok(
  'deepseek visualize does not lecture that Flash cannot render',
  !dsBranch.includes('no video renderer') &&
    !dsBranch.includes('does not render pixels') &&
    !dsBranch.includes('writes the motion'),
);

ok(
  'trySeedance accepts a custom announce (DeepSeek label)',
  /async function trySeedance\(\s*imageUrl: string,\s*prompt: string,\s*ctx: Context,\s*announce\?: string,/.test(src),
);

ok(
  'ready-clip label is DeepSeek when she picked deepseek',
  /if \(selected === 'deepseek'\) return 'DeepSeek';/.test(src) &&
    src.includes('visualizeEngineLabel(videoResult.provider, selectedProvider)'),
);

ok(
  '/visualize help lists DeepSeek as video',
  pins.includes("grade: 'DeepSeek video'") &&
    src.includes('visualizeMenuLines') &&
    src.includes('visualizeHelpLines'),
);

ok(
  'menu slash command points at DeepSeek video',
  src.includes('visualizeCommandDescription()') &&
    pins.includes("'deepseek'") &&
    pins.includes('DeepSeek video'),
);

ok(
  'createContent prefer-deepseek falls through when unkeyed (visualize still shoots)',
  src.includes('DeepSeek preferred but not keyed — using Claude/Groq') &&
    !src.includes("throw new Error('DEEPSEEK_NOT_CONFIGURED')"),
);

ok(
  'no leftover “Seedance shoots” lecture in Telegram copy',
  !src.includes('Seedance shoots') &&
    !src.includes('Seedance still shoots') &&
    !src.includes('Flash directs'),
);

if (fails.length) {
  console.error(`\nFAILED ${fails.length}:\n- ${fails.join('\n- ')}`);
  process.exit(1);
}
console.log(`\n${pass} checks passed — /visualize deepseek is a video command`);
