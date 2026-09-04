#!/usr/bin/env node
/**
 * Assert the filled Datastar NDA still contains Datastar's party,
 * Elena's verified identifiers, and zero leftover xxxxx blanks.
 */
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const docx = path.join(
  __dirname,
  "..",
  "docs/selling/datastar/NDA_Datastar_Elena_Revicheva_DRAFT.docx"
);
const txt = path.join(
  __dirname,
  "..",
  "docs/selling/datastar/NDA_Datastar_Elena_Revicheva_DRAFT.txt"
);
const reply = path.join(
  __dirname,
  "..",
  "docs/selling/datastar/REPLY_cquiroga_NDA.txt"
);

const py = `
import xml.etree.ElementTree as ET, re, sys
from zipfile import ZipFile
path = sys.argv[1]
with ZipFile(path) as z:
    root = ET.fromstring(z.read("word/document.xml"))
text = "".join(t.text or "" for t in root.iter("{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t"))
print(text)
`;

const text = execFileSync("python3", ["-c", py, docx], { encoding: "utf8" });
const failures = [];

function must(cond, msg) {
  if (!cond) failures.push(msg);
}

must(fs.existsSync(docx), "docx missing");
must(fs.existsSync(txt), "txt extract missing");
must(fs.existsSync(reply), "reply draft missing");

must(!/\bx{4,}\b/.test(text), "leftover xxxx placeholder in docx");
must(!text.includes("2025"), "boilerplate year 2025 still in docx");
must(text.includes("2026"), "year 2026 missing");
must(text.includes("a los 4 días del mes de septiembre"), "signature date missing");

must(text.includes("Datastar Panamá S.A"), "Datastar entity missing");
must(text.includes("Conrado José Quiroga Granillo"), "Conrad name missing");
must(text.includes("AAH248679"), "Conrad passport missing");
must(text.includes("Oceanía Business Plaza Torre 2000"), "Datastar address missing");

must(text.includes("Elena Revicheva"), "Elena name missing");
must(text.includes("E-8-245573"), "cédula E-8-245573 missing");
must(!text.includes("AE1074827"), "card serial AE1074827 must not be used as cédula");
must(text.includes("8-NT-2-781965 DV 90"), "RUC missing");
must(text.includes("Costa del Este"), "Costa del Este missing");
must(text.includes("Juan Díaz") || text.includes("Juan Diaz"), "Juan Díaz missing");
must(text.includes("portadora"), "portadora (feminine) missing");
must(text.includes("en representación de"), "en representación de missing");
must(text.includes("AIdeazz"), "commercial name missing");
must(text.includes("ELENA REVICHEVA"), "signature entity missing");
must(text.includes("persona natural extranjera"), "persona natural extranjera missing");
must(text.includes("ocupación 21320 - Programadores Informáticos"), "occupation missing");

const replyText = fs.readFileSync(reply, "utf8");
must(replyText.includes("cquiroga@datastar.pa"), "reply To missing");
must(replyText.includes("adriana.vargas@oracle.com"), "reply Cc Adriana missing");
must(replyText.includes("pedro.olivares@nexsysla.com"), "reply Cc Pedro missing");
must(replyText.includes("achavez@datastar.com.ar"), "reply Cc Alexander missing");
must(replyText.includes("E-8-245573"), "reply states cédula");
must(replyText.includes("8-NT-2-781965 DV 90"), "reply states RUC");
must(
  /cédula/i.test(replyText) && /Do not attach the cédula/i.test(replyText),
  "reply must warn not to attach the cédula scan"
);
must(replyText.includes("https://aideazz.xyz/portfolio"), "reply must link portfolio");

if (failures.length) {
  console.error("FAIL");
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}
console.log("PASS: Datastar NDA fill + reply draft");
console.log("cédula E-8-245573 (front of carné, not MRZ serial)");
console.log("RUC 8-NT-2-781965 DV 90");
console.log("date 4 septiembre 2026");
console.log("placeholders remaining: 0");
