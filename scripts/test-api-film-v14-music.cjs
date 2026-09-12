#!/usr/bin/env node
/**
 * v14 /api film — juicy unused Pixabay gate + compile must not clobber v13.
 * No network. No keys.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const py = path.join(root, 'scripts/youtube-api-audit-film/fetch-pixabay-music.py');
const compile14 = path.join(root, 'scripts/youtube-api-audit-film/compile-v14.mjs');
const compile12 = path.join(root, 'scripts/youtube-api-audit-film/compile.mjs');
const runner = path.join(root, 'scripts/oracle-resilience/compile-api-film-v14-runner.sh');
const publish = path.join(root, 'scripts/oracle-resilience/publish-api-film-v14.sh');
const workflow = path.join(root, '.github/workflows/influencer-diag-on-trigger.yml');

let n = 0;
function ok(name, cond) {
  n += 1;
  if (!cond) {
    console.error(`FAIL ${n} ${name}`);
    process.exit(1);
  }
  console.log(`ok ${n} ${name}`);
}

function juicy(name, tags) {
  const r = spawnSync(
    'python3',
    ['-c', `import importlib.util,sys; p=sys.argv[1]; spec=importlib.util.spec_from_file_location('m',p); m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m); print('1' if m.is_juicy_fresh(sys.argv[2], sys.argv[3]) else '0')`, py, name, tags],
    { encoding: 'utf8' },
  );
  if (r.status !== 0) {
    console.error(r.stderr || r.stdout);
    process.exit(1);
  }
  return r.stdout.trim() === '1';
}

ok('fetcher exists', fs.existsSync(py));
ok('compile-v14 exists', fs.existsSync(compile14));
ok('v14 runner exists', fs.existsSync(runner));
ok('v14 publisher exists', fs.existsSync(publish));

ok('Mango Sky is juicy fresh', juicy('Under the Mango Sky', 'Latin house Afro house Uplifting'));
ok('Beach Party is juicy fresh', juicy('Tropical House Beach Party (Energetic Summer Pop)', 'Summer Beach Upbeat'));
ok('Brazilian tropical is juicy', juicy('Upbeat Brazilian Tropical Background Music', 'Brazil Tropical Upbeat'));

ok('Kulakovka Chill House is burned', !juicy('Chill House', 'Kulakovka chill house lounge'));
ok('Oleg-Mazur enigmatic is burned', !juicy('Chillout Lounge - Chillout Enigmatic Music', 'Oleg-Mazur Uplifting'));
ok('Tropical Cocktail is burned', !juicy('Tropical Cocktail', 'tropical lounge upbeat'));
ok('Distant Horizon dreamy is burned', !juicy('Distant Horizon', 'chill house Dreamy'));
ok('Morning Light is burned', !juicy('Morning Light Fresh Corporate', 'uplifting corporate'));
ok('Kuta Beach dreamy rejected', !juicy('Riyhsal - Kuta Beach', 'Tropical house Calm Dreamy'));
ok('Fatal Error poetry bed burned', !juicy('Fatal Error', 'dark cinematic'));
ok('Light In The Void burned', !juicy('Light In The Void', 'Dark Cinematic Ambient'));

const src14 = fs.readFileSync(compile14, 'utf8');
const src12 = fs.readFileSync(compile12, 'utf8');
const run = fs.readFileSync(runner, 'utf8');
const pub = fs.readFileSync(publish, 'utf8');
const wf = fs.readFileSync(workflow, 'utf8');

const { extractDeepseekLine } = require(path.join(root, 'scripts/youtube-api-audit-film/deepseek-motion-parse.cjs'));
ok(
  'Flash empty content uses reasoning_content',
  extractDeepseekLine({
    choices: [{ message: { content: '', reasoning_content: 'thinking\nThe mango flesh glistens; juice beads slide.' }, finish_reason: 'stop' }],
  }).line.includes('mango flesh glistens'),
);
ok(
  'Flash API error is not a silent skip',
  (() => {
    try {
      extractDeepseekLine({ error: { message: 'Model Not Exist' } });
      return false;
    } catch (e) {
      return /Model Not Exist/.test(e.message);
    }
  })(),
);

const director = path.join(root, 'scripts/youtube-api-audit-film/direct-fruit-v14.mjs');
ok('DeepSeek fruit director exists', fs.existsSync(director));
ok('director refuses to skip DeepSeek', fs.readFileSync(director, 'utf8').includes('will not skip DeepSeek'));
ok('director spends the Flash wallet', fs.readFileSync(director, 'utf8').includes("deepseek-flash"));
ok('Seedance retries HTTP 429', fs.readFileSync(director, 'utf8').includes('seedance 429'));
const spec = fs.readFileSync(path.join(root, 'scripts/youtube-api-audit-film/fruit-v14-spec.cjs'), 'utf8');
ok('v14 middle is mango/papaya/pineapple not grapes', /mango/.test(spec) && /papaya/.test(spec) && /pineapple/.test(spec) && !/geo-grapes/.test(spec));
ok('v14 spec bans grapes', /BANNED_FRUIT/.test(spec) && /starfruit/.test(spec) && /dragon/.test(spec));
ok('v14 compile dropped the grape still', !src14.includes('geo-grapes-citation.jpg') && src14.includes('V14_FRUIT'));
ok('v14 compile refuses a grape leak', src14.includes('v14 spec leaked grapes'));
ok('workflow paints new fruit stills', wf.includes('paint-v14-fruits.mjs'));
ok('workflow fetches cut fruit not grapes', wf.includes('v14-mango.jpg') && wf.includes('v14-starfruit.jpg') && wf.includes('v14-*.jpg'));
const fetchPy = path.join(root, 'scripts/youtube-api-audit-film/fetch-v14-fruit-stills.py');
ok('cut-fruit fetcher exists', fs.existsSync(fetchPy));
const fetchSrc = fs.readFileSync(fetchPy, 'utf8');
ok('fetcher dests are v14 tropical cuts', /v14-mango\.jpg/.test(fetchSrc) && /v14-papaya\.jpg/.test(fetchSrc) && /v14-dragonfruit\.jpg/.test(fetchSrc) && /v14-pineapple\.jpg/.test(fetchSrc) && /v14-starfruit\.jpg/.test(fetchSrc));
ok('fetcher never names a grape file', !/v14-grape|geo-grapes|passionfruit\.jpg|pomegranate\.jpg/.test(fetchSrc));
ok('fetcher searches mango papaya pineapple', /mango/.test(fetchSrc) && /papaya/.test(fetchSrc) && /pineapple/.test(fetchSrc));
ok('painter falls back when Flux 402', fs.readFileSync(path.join(root, 'scripts/youtube-api-audit-film/paint-v14-fruits.mjs'), 'utf8').includes('fetch-v14-fruit-stills.py'));
ok('director juice-cuts NEW stills if Seedance 402', fs.readFileSync(director, 'utf8').includes('juice-cut NEW still'));
ok('v14 compile talks Seedance', /seedance-2\.5|Seedance 2\.5/.test(src14));
ok('v14 compile requires DeepSeek', /will not skip DeepSeek|will not silently skip/.test(src14));
ok('v14 compile does not call Runway I2V', !/async function runwayI2V/.test(src14));
ok('v14 writes only -v14.mp4', src14.includes('${SLUG}-v14.mp4') && !src14.includes('${SLUG}-v12.mp4') && !src14.includes('${SLUG}.mp4'));
ok('v14 refuses brown-noise drone as the bed', src14.includes('juicy unused Pixabay') && !/async function makeDrone/.test(src14));
ok('v14 VO dir is vo-v14', src14.includes('vo-v14'));
ok('v14 never salvages v2/v5 picture', !/can-ai-find-and-cite-you-v2\.mp4/.test(src14));

ok('legacy compile still writes v12 (untouched salvage path)', src12.includes('${SLUG}-v12.mp4'));
ok('legacy BURNED lists Kulakovka', /kulakovka/i.test(src12));

ok('runner fetches Pixabay before compile', run.includes('fetch-pixabay-music.py'));
ok('runner work dir is aideazz-api-film-v14', run.includes('aideazz-api-film-v14'));
ok('runner does not delete new fruit clips', /rm -f "\$DIR"\/clips\/\{grapes/.test(run) && !/rm -f "\$DIR"\/clips\/\{grapes,split,crawlers,hand,dashboard,mango/.test(run));
ok('runner does not restart cto-aipa', !/pm2 restart/.test(run));
ok('workflow stitches v14 on Oracle', wf.includes('Oracle: stitch VO + NEW fruit') && wf.includes('compile-api-film-v14-runner.sh'));
ok('publisher copies only v14', pub.includes('can-ai-find-and-cite-you-v14.mp4') && !/cp -f "\$SRC\/"\*\.mp4/.test(pub));
ok('publisher does not overwrite v13', !/v13\.mp4/.test(pub) || pub.includes('do not overwrite v13'));
ok('workflow accepts api-film-v14', /api-film-v14/.test(wf));
ok('workflow runs DeepSeek fruit on Oracle', wf.includes('direct-fruit-v14.mjs'));

console.log(`\n${n} checks passed`);
