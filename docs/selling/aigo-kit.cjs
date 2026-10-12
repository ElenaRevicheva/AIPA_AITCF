/**
 * AI Growth Operator sales kit — ONE source for the deck, the promo films and the Cc.
 *
 * Used by prospect-meta.cjs (hand-staged [CLIENT-MANUAL] prospects, since 2 Oct 2026) and
 * by scripts/atlas-lead-machine.cjs (automatic [CLIENT-ATLAS] leads, since 12 Oct 2026 —
 * Elena: "wire into each automatic message my AI Growth Operator pdf, the link of the
 * appropriate youtube promo video, and put me in copy so I can be sure all is delivered
 * with attachments"). Before this file the links lived only in prospect-meta.cjs, so the
 * machine that stages most leads sent none of them.
 *
 * Every link below was checked public + playable on 12 Oct 2026 (watch page
 * playabilityStatus OK, isUnlisted false). The films are the 5 approved AIGO cuts in
 * docs/selling/video/2026-10-01_AIGO_YOUTUBE_UPLOAD_SHEET.md.
 */
'use strict';

const AIGO_DECK_ES_LINE =
  'Nuestra presentación (8 páginas): https://aideazz.xyz/AIdeazz_AI_Growth_Operator_2026_ES.pdf';

const AIGO_DECK_ES_ATTACHMENT = {
  path: 'docs/selling/attachments/AIdeazz_AI_Growth_Operator_2026_ES.pdf',
  filename: 'AIdeazz_AI_Growth_Operator_2026_ES.pdf',
};

const ELENA_COPY_CC = 'elena.revicheva2016@gmail.com';

/** Tourism: yacht film + island/villa/charter film (the pair Grand Tours got, 2 Oct). */
const AIGO_VIDEO_LINES_ES = [
  'Y dos videos cortos que hicimos con IA para negocios de turismo:',
  '▶️ Yates: https://youtu.be/kUrKw61Uo4Q',
  '▶️ Islas, villas y charters: https://youtu.be/Tg9N0PprsaI',
];

/** Film 1 alone, for yacht and sport-fishing businesses. */
const AIGO_VIDEO_LINES_YACHT_ES = [
  'Y un video corto que hicimos con IA para negocios de yates y charters:',
  '▶️ https://youtu.be/kUrKw61Uo4Q',
];

/** Elena, 2 Oct 2026: the real-estate + immigration-law film fits law firms (Quijano). */
const AIGO_VIDEO_LINES_LEGAL_ES = [
  'Y un video corto que hicimos con IA para firmas de inmigración y bienes raíces:',
  '▶️ https://youtu.be/y1ZhWyqJW0w',
];

/** Film 5, medical tourism — the FINAL v3 (3 Oct), not v1 b4Fg3omBaSk. */
const AIGO_VIDEO_LINES_CLINIC_ES = [
  'Y un video corto que hicimos con IA para clínicas dentales y de cirugía estética:',
  '▶️ https://youtu.be/e0rMKnH-noI',
];

/** Film 2, the /api film — for a niche none of the industry films speaks to. */
const AIGO_VIDEO_LINES_GENERIC_ES = [
  'Y un video corto que hicimos con IA sobre cómo ChatGPT decide a quién recomendar:',
  '▶️ https://youtu.be/Cz5F7IaXEXc',
];

/**
 * The film that speaks to this lead's industry. `text` is whatever names the business —
 * the search query plus the company name. Yacht words win over the general tourism set,
 * clinics and law firms get their own film, everything else gets the /api film.
 */
function aigoVideoLinesFor(text) {
  const q = String(text || '').toLowerCase();
  if (/yate|yacht|velero|sailing|catamar|sport ?fishing|pesca/.test(q)) {
    return AIGO_VIDEO_LINES_YACHT_ES;
  }
  if (/dental|odonto|dentist|clínica|clinica|clinic|cirug|plastic|estétic|estetic|medical|médic|medic/.test(q)) {
    return AIGO_VIDEO_LINES_CLINIC_ES;
  }
  if (/abogad|bufete|legal|law|inmigra|immigra|real estate|realty|inmobiliar|bienes raíces|bienes raices|relocat/.test(q)) {
    return AIGO_VIDEO_LINES_LEGAL_ES;
  }
  if (/villa|island|isla|charter|tour|hotel|resort|lodge|hostal|surf|yoga|retreat|wedding|boda|venue|eco|travel|viaje|excurs/.test(q)) {
    return AIGO_VIDEO_LINES_ES;
  }
  return AIGO_VIDEO_LINES_GENERIC_ES;
}

module.exports = {
  AIGO_DECK_ES_LINE,
  AIGO_DECK_ES_ATTACHMENT,
  ELENA_COPY_CC,
  AIGO_VIDEO_LINES_ES,
  AIGO_VIDEO_LINES_YACHT_ES,
  AIGO_VIDEO_LINES_LEGAL_ES,
  AIGO_VIDEO_LINES_CLINIC_ES,
  AIGO_VIDEO_LINES_GENERIC_ES,
  aigoVideoLinesFor,
};
