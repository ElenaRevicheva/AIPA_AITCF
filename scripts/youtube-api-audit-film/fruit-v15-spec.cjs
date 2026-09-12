/** v15 middle — same fruits as v14, /api hero language. Black void. Whole → cut → tech. */
module.exports = {
  BANNED_FRUIT: /grape|pomegranate|passionfruit|maracuya|vine/i,
  FRUIT: [
    {
      id: 'mango',
      still: 'fruit/v15-mango-cut.jpg',
      whole: 'fruit/v15-mango-whole.jpg',
      searchWhole: ['whole ripe mango fruit hanging', 'Mangifera indica whole fruit'],
      searchCut: ['mango fruit cut open cross section', 'sliced ripe mango golden flesh'],
      motion:
        'Black void. A whole ripe mango rotates slowly for two seconds — no knife, no blade, no hand, no tool. Then it is already cut: golden flesh glistens, juice beads slide, cyan then magenta circuit traces fire in the fibre around the pit. Slow prestige product film. Only THIS mango. No extra fruit, no text, no logo.',
    },
    {
      id: 'papaya',
      still: 'fruit/v15-papaya-cut.jpg',
      whole: 'fruit/v15-papaya-whole.jpg',
      searchWhole: ['whole papaya fruit Carica papaya', 'ripe papaya whole fruit'],
      searchCut: ['papaya fruit cut in half black seeds', 'papaya cross section coral flesh'],
      motion:
        'Black void. A whole papaya turns in place — no knife, no hand. Then two halves: coral flesh, black seeds still, cyan traces on the left half, magenta on the right. Slow push. No extra fruit. No text.',
    },
    {
      id: 'dragon',
      still: 'fruit/v15-dragon-cut.jpg',
      whole: 'fruit/v15-dragon-whole.jpg',
      searchWhole: ['whole dragon fruit pitaya magenta skin', 'Hylocereus undatus whole fruit'],
      searchCut: ['dragon fruit pitaya cut open white flesh', 'hylocereus undatus cross section'],
      motion:
        'Black void. A whole dragon fruit hangs and turns — no knife, no hand. Then it is cut: white pulp, black seeds. Three glass crawlers walk a few centimetres, cores pulse cyan amber magenta. Do not spawn a fourth. No extra fruit. No text.',
    },
    {
      id: 'pineapple',
      still: 'fruit/v15-pineapple-cut.jpg',
      whole: 'fruit/v15-pineapple-whole.jpg',
      searchWhole: ['whole pineapple fruit Ananas comosus', 'ripe pineapple standing whole'],
      searchCut: ['pineapple fruit cut cross section rings', 'ananas comosus sliced juicy'],
      motion:
        'Black void. A whole pineapple rotates — no knife, no hand. Then rings and a spear: juice droplets fall, a glass HUD stays locked to the fruit with no readable text. Slow prestige. No extra fruit.',
    },
    {
      id: 'starfruit',
      still: 'fruit/v15-starfruit-cut.jpg',
      whole: 'fruit/v15-starfruit-whole.jpg',
      searchWhole: ['whole starfruit carambola hanging', 'Averrhoa carambola whole fruit'],
      searchCut: ['starfruit carambola slices cut', 'averrhoa carambola fruit slices'],
      motion:
        'Black void. A whole starfruit turns — no knife, no hand. Then slices fan like a constellation. Juice falls. Neural traces along each star point pulse cyan then magenta. No numerals. No extra fruit. No text.',
    },
  ],
};
