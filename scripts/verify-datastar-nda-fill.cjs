#!/usr/bin/env node
/**
 * Check the filled Datastar NDA before it is sent.
 *
 * Asserts that Datastar's own party block survived the fill, that Elena's
 * identifiers are present, that no xxxxx blank is left, and that the readable
 * renderings are not older than the document they claim to show.
 *
 * The expected values are NOT in this file. They live in
 * docs/selling/datastar/expected-fields.json, because docs/selling/ is dropped
 * by scripts/build-license-bundle.cjs while scripts/ ships — a cédula written
 * into this script would have travelled into the DataVendor bundle.
 */
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DIR = path.join(ROOT, "docs/selling/datastar");

const docx = path.join(DIR, "NDA_Datastar_Elena_Revicheva_DRAFT.docx");
const template = path.join(DIR, "NDA_Datastar_modelo_recibido.docx");
const pdf = path.join(DIR, "NDA_Datastar_Elena_Revicheva_DRAFT.pdf");
const txt = path.join(DIR, "NDA_Datastar_Elena_Revicheva_DRAFT.txt");
const reply = path.join(DIR, "REPLY_cquiroga_NDA.txt");
const fields = path.join(DIR, "expected-fields.json");
const previews = [1, 2, 3, 4].map((n) => path.join(DIR, "preview", `page${n}.png`));

const failures = [];
const must = (cond, msg) => {
  if (!cond) failures.push(msg);
};

function bail(msg) {
  console.error("FAIL");
  console.error(" -", msg);
  process.exit(1);
}

if (!fs.existsSync(fields)) {
  bail(`missing ${path.relative(ROOT, fields)} — cannot verify without the expected values`);
}
const expect = JSON.parse(fs.readFileSync(fields, "utf8"));

/** Full visible text of a .docx, including text boxes. */
function docxText(file) {
  const py = `
import sys, xml.etree.ElementTree as ET
from zipfile import ZipFile
W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
root = ET.fromstring(ZipFile(sys.argv[1]).read("word/document.xml"))
print("".join(t.text or "" for t in root.iter(W + "t")))
`;
  return execFileSync("python3", ["-c", py, file], { encoding: "utf8" });
}

/** Paragraph text of every text box, in document order. */
function docxTextBoxes(file) {
  const py = `
import sys, json, xml.etree.ElementTree as ET
from zipfile import ZipFile
W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
root = ET.fromstring(ZipFile(sys.argv[1]).read("word/document.xml"))
out = []
for tb in root.iter(W + "txbxContent"):
    out.append(["".join(t.text or "" for t in p.iter(W + "t")) for p in tb.findall(W + "p")])
print(json.dumps(out))
`;
  return JSON.parse(execFileSync("python3", ["-c", py, file], { encoding: "utf8" }));
}

for (const [file, label] of [
  [docx, "filled docx"],
  [template, "received template"],
  [txt, "txt extract"],
  [reply, "reply draft"],
  [pdf, "readable pdf"],
]) {
  must(fs.existsSync(file), `${label} missing: ${path.relative(ROOT, file)}`);
}
for (const p of previews) {
  must(fs.existsSync(p), `preview missing: ${path.basename(p)} — run scripts/datastar-nda-render.cjs`);
}
if (failures.length) {
  console.error("FAIL");
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}

const text = docxText(docx);

must(!/\bx{4,}\b/.test(text), "leftover xxxx placeholder in the docx");
must(text.includes(expect.cedula), `cédula ${expect.cedula} missing`);
must(text.includes(expect.ruc), `RUC ${expect.ruc} missing`);
must(text.includes(expect.signatureDate), "signature date missing");
for (const s of expect.mustContain) {
  must(text.includes(s), `missing required string: ${s}`);
}
for (const s of expect.mustNotContain) {
  must(!text.includes(s), `must not appear in the NDA: ${s}`);
}

// Both parties need blank space above their name, or there is nowhere to sign.
// Word serialises each text box twice (mc:Choice + mc:Fallback); a fix applied
// to only one copy renders differently depending on the reader.
const boxes = docxTextBoxes(docx);
must(boxes.length === 4, `expected 4 text-box serialisations, found ${boxes.length}`);
const elenaBoxes = boxes.filter((b) => b.some((l) => l.includes("ELENA REVICHEVA")));
const datastarBoxes = boxes.filter((b) => b.some((l) => l.includes("Datastar")));
must(elenaBoxes.length === 2, `expected 2 copies of Elena's box, found ${elenaBoxes.length}`);
must(datastarBoxes.length === 2, `expected 2 copies of Datastar's box, found ${datastarBoxes.length}`);
for (const b of elenaBoxes) {
  must(b[0] === "", "Elena's signature box has no blank line for a signature");
}
for (const b of datastarBoxes) {
  must(b[0] === "", "Datastar's signature box lost its blank signing line");
}

// Their template must come through untouched — it is the evidence for what we changed.
const templateText = docxText(template);
must(/\bx{4,}/.test(templateText), "received template no longer has its blanks — was it edited?");
must(!templateText.includes(expect.cedula), "received template must stay unmodified");

// A rendering older than the document is a rendering that lies.
const docxTime = fs.statSync(docx).mtimeMs;
must(
  fs.statSync(pdf).mtimeMs >= docxTime,
  "pdf is older than the docx — run scripts/datastar-nda-render.cjs"
);
for (const p of previews) {
  must(
    fs.statSync(p).mtimeMs >= docxTime,
    `${path.basename(p)} is older than the docx — run scripts/datastar-nda-render.cjs`
  );
}

const replyText = fs.readFileSync(reply, "utf8");
for (const addr of expect.replyRecipients) {
  must(replyText.includes(addr), `reply is missing recipient ${addr}`);
}
must(replyText.includes(expect.cedula), "reply should state the cédula");
must(replyText.includes(expect.ruc), "reply should state the RUC");
must(
  /Do not attach the cédula/i.test(replyText),
  "reply must carry the do-not-attach-the-cédula warning"
);
must(replyText.includes("https://aideazz.xyz/portfolio"), "reply must link the portfolio");

// A signature image is reusable forever by whoever holds it. The signed output
// and any signature scan must be untrackable, and the unsigned draft must NOT
// be caught by those same rules — it is the deliverable.
const ignored = (p) => {
  try {
    execFileSync("git", ["check-ignore", "-q", p], { cwd: ROOT, stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
};
for (const p of [
  "docs/selling/datastar/NDA_Datastar_Elena_Revicheva_SIGNED.docx",
  "docs/selling/datastar/firma-elena.png",
  "docs/selling/datastar/signature.png",
]) {
  must(ignored(p), `${p} is NOT gitignored — a real signature could reach git history`);
}
must(
  !ignored("docs/selling/datastar/NDA_Datastar_Elena_Revicheva_DRAFT.docx"),
  "the unsigned deliverable is gitignored — it must stay tracked"
);
const tracked = execFileSync("git", ["ls-files", "docs/selling/datastar"], {
  cwd: ROOT,
  encoding: "utf8",
})
  .split("\n")
  .filter(Boolean);
// Match the ignore patterns, not the word "signature" anywhere in a path: the
// before/after page renders are legitimate evidence and their filenames happen
// to contain it. What must never be tracked here is a signed document or a
// signature SOURCE image.
for (const f of tracked) {
  const base = path.basename(f);
  must(
    !/SIGNED.*\.docx$/i.test(base) && !/^(firma|signature)[^/]*\.(png|jpe?g)$/i.test(base),
    `signature material is tracked in git: ${f}`,
  );
}

// The cédula must not leak into anything the licensing bundle ships.
const bundleSrc = fs.readFileSync(path.join(ROOT, "scripts/build-license-bundle.cjs"), "utf8");
const dropDirs = eval(bundleSrc.match(/const DROP_DIRS = (\[[\s\S]*?\]);/)[1]);
must(
  dropDirs.some((d) => "docs/selling/datastar/".startsWith(d)),
  "docs/selling/datastar/ is NOT dropped from the licensing bundle — the cédula would ship"
);
for (const f of ["scripts/verify-datastar-nda-fill.cjs", "scripts/datastar-nda-render.cjs"]) {
  const src = fs.readFileSync(path.join(ROOT, f), "utf8");
  must(!src.includes(expect.cedula), `${f} hard-codes the cédula and scripts/ ships in the bundle`);
  must(!src.includes(expect.ruc), `${f} hard-codes the RUC and scripts/ ships in the bundle`);
}

if (failures.length) {
  console.error("FAIL");
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}

console.log("PASS: Datastar NDA is ready to sign and send");
console.log("  placeholders remaining ..... 0");
console.log("  signing space .............. both parties, both serialisations");
console.log("  card serial not used ....... confirmed");
console.log("  renderings current ......... pdf + 4 page previews");
console.log("  cédula in licensed bundle .. no (docs/selling/ dropped, scripts/ clean)");
console.log("  signature can reach git .... no (signed output + scans gitignored)");
