"""Film #9 shots 15, 30, 31 (7 Oct 2026, Elena: "adult scenes very hot and sexy with surrealistic stuff in underground
aesthetic Atuona style"). Final prompts from the design workflow wf_2060fb0a-224 (2 designers + 1 judge per shot), kept in
film9_hot_shots_design_2026-10-07.json. Each shot is rendered on both engines Elena approved today: qwen-edit-uncensored
(adult lane) and seedream-v5-pro-edit. Run on Oracle from ~/atuona-film9 with the json next to it."""
import json

p = json.load(open('plan.json'))
D = json.load(open('film9_hot_shots_design_2026-10-07.json', encoding='utf-8'))
look = ('Unretouched photograph on 35mm film, real skin with pores and sweat, natural asymmetry, practical light only, '
        'film grain; not CGI, not a painting, no airbrushing.')
for d in D:
    num = d['shot'][1:]
    assert len(d['final_prompt']) + len(look) + 1 <= 1500, (d['shot'], len(d['final_prompt']))
    for suffix, model in (('q', 'qwen-edit-uncensored'), ('s', 'seedream-v5-pro-edit')):
        p['images'][f'k{num}{suffix}'] = {
            'engine': 'venice', 'vmodel': model, 'refs': d['refs'], 'aspect': '16:9',
            'prompt': d['final_prompt'], 'look': look,
            'note': f"7 Oct Elena: adult hot surreal underground shot {num}; design wf_2060fb0a-224 (winner {d['winner']}); "
                    f"surreal: {d['surreal_detail'][:160]}"}
json.dump(p, open('plan.json', 'w'), indent=1, ensure_ascii=False)
print('plan ok:', [f"k{d['shot'][1:]}{s}" for d in D for s in 'qs'])
