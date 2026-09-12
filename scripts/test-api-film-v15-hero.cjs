#!/usr/bin/env node
/**
 * v15 /api film — /api hero language + DeepSeek Flash + no v13/v14 clobber.
 * No network. No keys.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const py = path.join(root, 'scripts/youtube-api-audit-film/fetch-pixabay-music.py');
const compile15 = path.join(root, 'scripts/youtube-api-audit-film/compile-v15.mjs');
const compile14 = path.join(root, 'scripts/youtube-api-audit-film/compile-v14.mjs');
const hero = path.join(root, 'scripts/youtube-api-audit-film/hero-clip-v15.mjs');
const voidStills = path.join(root, 'scripts/youtube-api-audit-film/void-stills-v15.py');
const specPath = path.join(root, 'scripts/youtube-api-audit-film/fruit-v15-spec.cjs');
const director = path.join(root, 'scripts/youtube-api-audit-film/direct-fruit-v15.mjs');
const runner = path.join(root, 'scripts/oracle-resilience/compile-api-film-v15-runner.sh');
const publish = path.join(root, 'scripts/oracle-resilience/publish-api-film-v15.sh');
const watch = path.join(root, 'scripts/oracle-resilience/api-film-watch-v15.html');
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

function juicy(name, tags, cut) {
  const env = { ...process.env };
  if (cut) env.API_FILM_CUT = cut;
  const r = spawnSync(
    'python3',
    [
      '-c',
      `import importlib.util,sys; p=sys.argv[1]; spec=importlib.util.spec_from_file_location('m',p); m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m); print('1' if m.is_juicy_fresh(sys.argv[2], sys.argv[3]) else '0')`,
      py,
      name,
      tags,
    ],
    { encoding: 'utf8', env },
  );
  if (r.status !== 0) {
    console.error(r.stderr || r.stdout);
    process.exit(1);
  }
  return r.stdout.trim() === '1';
}

ok('fetcher exists', fs.existsSync(py));
ok('compile-v15 exists', fs.existsSync(compile15));
ok('hero-clip exists', fs.existsSync(hero));
ok('void-stills exists', fs.existsSync(voidStills));
ok('v15 runner exists', fs.existsSync(runner));
ok('v15 publisher exists', fs.existsSync(publish));
ok('v15 watch page exists', fs.existsSync(watch));

ok('Beach Party is juicy on v15', juicy('Tropical House Beach Party (Energetic Summer Pop)', 'Summer Beach Upbeat', 'v15'));
ok('Mango Sky is burned on v15', !juicy('Under the Mango Sky', 'Latin house Afro house Uplifting', 'v15'));
ok('Mango Sky stays juicy on v14 (default)', juicy('Under the Mango Sky', 'Latin house Afro house Uplifting'));
ok('Tropical Cocktail is burned on v15', !juicy('Tropical Cocktail', 'tropical lounge upbeat', 'v15'));

const src15 = fs.readFileSync(compile15, 'utf8');
const src14 = fs.readFileSync(compile14, 'utf8');
const srcHero = fs.readFileSync(hero, 'utf8');
const srcVoid = fs.readFileSync(voidStills, 'utf8');
const spec = fs.readFileSync(specPath, 'utf8');
const dir = fs.readFileSync(director, 'utf8');
const run = fs.readFileSync(runner, 'utf8');
const pub = fs.readFileSync(publish, 'utf8');
const html = fs.readFileSync(watch, 'utf8');
const wf = fs.readFileSync(workflow, 'utf8');

ok('v15 middle is mango/papaya/pineapple not grapes', /mango/.test(spec) && /papaya/.test(spec) && /pineapple/.test(spec) && !/geo-grapes/.test(spec));
ok('v15 spec bans grapes', /BANNED_FRUIT/.test(spec) && /starfruit/.test(spec) && /dragon/.test(spec));
ok('v15 stills are v15-*-cut and v15-*-whole', /v15-mango-cut\.jpg/.test(spec) && /v15-mango-whole\.jpg/.test(spec));
ok('v15 compile dropped grape stills', !src15.includes('geo-grapes-citation.jpg'));
ok('v15 compile refuses a grape leak', src15.includes('v15 spec leaked grapes'));
ok('v15 writes only -v15.mp4', src15.includes('${SLUG}-v15.mp4') && !src15.includes('${SLUG}-v14.mp4') && !src15.includes('${SLUG}-v12.mp4'));
ok('v15 poster is -v15-poster', src15.includes('${SLUG}-v15-poster.jpg') && !src15.includes('${SLUG}-v14-poster.jpg'));
ok('v15 compile uses hero-clip not Ken Burns fallback', src15.includes('renderHeroClip') && src15.includes('hero-clip fallback'));
ok('v15 compile does not call neuronPulse', !/neuronPulse\(/.test(src15));
ok('v15 VO dir is vo-v15', src15.includes('vo-v15'));
ok('v15 compile requires DeepSeek', /will not skip DeepSeek|will not silently skip/.test(src15));
ok('v15 compile spends Flash', src15.includes('deepseek-flash') || src15.includes('DEEPSEEK_MODEL'));
ok('v15 compile talks Seedance', /seedance-2\.5|Seedance 2\.5/.test(src15));
ok('v15 never salvages v2/v5 picture', !/can-ai-find-and-cite-you-v2\.mp4/.test(src15));

ok('hero-clip is whole→cut + field', srcHero.includes('whole') && srcHero.includes('xfade') && srcHero.includes('geq'));
ok('hero-clip is not Ken Burns-only', !/Ken Burns/.test(srcHero) || srcHero.includes('Not Ken Burns'));
ok('void stills pad onto #08050e', srcVoid.includes('08050e'));
ok('void stills fetch whole+cut', srcVoid.includes('whole') && srcVoid.includes('cut') && srcVoid.includes('VOID READY'));
ok('void stills never name a grape dest', !/v15-grape|geo-grapes|passionfruit\.jpg|pomegranate\.jpg/.test(srcVoid));
ok('void stills pin Commons FilePath first', srcVoid.includes('Special:FilePath') && srcVoid.includes('whole_pins') && srcVoid.includes('cut_pins'));
ok('void stills pin mango whole and cut', srcVoid.includes('Mango.jpg') && srcVoid.includes('Ataulfo'));

ok('director refuses to skip DeepSeek', dir.includes('will not skip DeepSeek') || dir.includes('will not pretend DeepSeek'));
ok('director spends the Flash wallet', dir.includes('deepseek-flash'));
ok('director Seedance retries HTTP 429', dir.includes('seedance 429'));
ok('director falls back to HeroBackdrop not Ken Burns', dir.includes('HeroBackdrop') && dir.includes('renderHeroClip') && !dir.includes('juice-cut NEW still'));

ok('v14 compile is untouched (still writes -v14)', src14.includes('${SLUG}-v14.mp4'));

ok('runner work dir is aideazz-api-film-v15', run.includes('aideazz-api-film-v15'));
ok('runner compiles compile-v15.mjs', run.includes('compile-v15.mjs'));
ok('runner sets API_FILM_CUT=v15', run.includes('API_FILM_CUT=v15'));
ok('runner does not delete new fruit clips', /rm -f "\$DIR"\/clips\/\{grapes/.test(run) && !/rm -f "\$DIR"\/clips\/\{grapes,split,crawlers,hand,dashboard,mango/.test(run));
ok('runner does not restart cto-aipa', !/pm2 restart/.test(run));
ok('runner refuses a v14 clobber in out/', run.includes('can-ai-find-and-cite-you-v14.mp4') && run.includes('must not touch older cuts'));

ok('publisher copies only v15', pub.includes('can-ai-find-and-cite-you-v15.mp4') && !/cp -f "\$SRC\/"\*\.mp4/.test(pub));
ok('publisher does not overwrite v13', pub.includes('do not overwrite v13'));
ok('publisher does not overwrite v14', pub.includes('do not overwrite v14'));
ok('watch page plays v15', html.includes('can-ai-find-and-cite-you-v15.mp4') && !html.includes('can-ai-find-and-cite-you-v14.mp4?v='));

ok('workflow accepts api-film-v15', /api-film-v15/.test(wf));
ok('workflow runs void-stills-v15.py', wf.includes('void-stills-v15.py'));
ok('workflow leak-check is v15-* only', wf.includes('v15-*.jpg') && wf.includes('v15-${f}-cut.jpg'));
ok('workflow runs DeepSeek fruit on Oracle', wf.includes('direct-fruit-v15.mjs'));
ok('workflow stitches v15 on Oracle', wf.includes('compile-api-film-v15-runner.sh') && wf.includes('Oracle: stitch VO + void fruit'));
ok('workflow publishes v15 only', wf.includes('publish-api-film-v15.sh') && wf.includes('can-ai-find-and-cite-you-v15.mp4'));

const destCheck = spawnSync(
  'python3',
  [
    '-c',
    `import importlib.util,os; os.environ['API_FILM_CUT']='v15'; p=${JSON.stringify(py)}; spec=importlib.util.spec_from_file_location('m',p); m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m); dests=[c['dest'] for c in m.CANDIDATES]; assert all(d.startswith('v15-') for d in dests), dests; print('ok')`,
  ],
  { encoding: 'utf8' },
);
ok('v15 music dests are v15-*', destCheck.status === 0 && destCheck.stdout.includes('ok'));

console.log(`\n${n} checks passed`);
