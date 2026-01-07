// make-deck.js
// Usage: node make-deck.js words.txt deck.js
//
// Input line examples it supports:
// 27. car - coche - masculine / auto - masculine
// 29. friend - amigo - masculine / amiga - feminine
// 35. baby - bebé - masculine/feminine
// 362. congratulations - felicitaciones - plural, feminine
// 377. cat - gato/gata - masculine/feminine

const fs = require("fs");

const [,, inPath, outPath] = process.argv;
if (!inPath || !outPath) {
  console.error("Usage: node make-deck.js words.txt deck.js");
  process.exit(1);
}

const raw = fs.readFileSync(inPath, "utf8");

// Toggle this to false if you prefer the simpler behavior
// that generates both articles for both slash forms.
const SMART_GENDERED_SLASH_PAIRING = true;

const norm = (s) => (s ?? "").toString().trim();

function parseGenderNote(note) {
  const g = norm(note).toLowerCase();
  const plural = g.includes("plural");
  const hasMasc = g.includes("masculine");
  const hasFem = g.includes("feminine");
  return { plural, hasMasc, hasFem, raw: note };
}

function articleFor({ plural, hasMasc, hasFem }) {
  // If mixed gender, caller decides how to expand
  if (plural) {
    if (hasFem && !hasMasc) return "las";
    if (hasMasc && !hasFem) return "los";
    return ""; // ambiguous
  }
  if (hasFem && !hasMasc) return "la";
  if (hasMasc && !hasFem) return "el";
  return ""; // ambiguous / none
}

function alreadyHasArticle(es) {
  return /^(el|la|los|las|un|una|unos|unas)\s+/i.test(es);
}

function addArticle(es, article) {
  const s = norm(es);
  if (!article) return s;
  if (alreadyHasArticle(s)) return s;
  return `${article} ${s}`;
}

// Split "coche - masculine / auto - masculine" into option chunks.
function splitOptions(spanishPart) {
  return spanishPart.split(" / ").map(norm).filter(Boolean);
}

// Option chunk might be "auto - masculine" OR just "auto"
function splitSpanishAndGender(optionChunk) {
  // Find last " - " that looks like a gender label
  const m = optionChunk.match(/^(.*?)\s*-\s*(masculine|feminine|masculine\/feminine|feminine\/masculine|plural.*)$/i);
  if (!m) return { es: norm(optionChunk), gender: "" };
  return { es: norm(m[1]), gender: norm(m[2]) };
}

// Expand "gato/gata" only when it’s one token (no spaces)
function expandSlashForms(es) {
  const s = norm(es);
  if (!s.includes("/") || s.includes(" ")) return [s];
  const parts = s.split("/").map(norm).filter(Boolean);
  return parts.length ? parts : [s];
}

function isGenderedSlashPair(es) {
  // "gato/gata" and "profesor/profesora" are the cases we want.
  // Only treat as gendered pair if:
  // - single token with one slash
  // - both sides are different
  const parts = expandSlashForms(es);
  return parts.length === 2 && !es.includes(" ");
}

function makeCardsForOption(en, esRaw, genderNoteRaw) {
  const enClean = norm(en);
  const esClean = norm(esRaw);

  const gender = parseGenderNote(genderNoteRaw);
  const baseArticle = articleFor(gender);

  // Mixed gender case
  if (gender.hasMasc && gender.hasFem) {
    const isPlural = gender.plural;
    const mascArticle = isPlural ? "los" : "el";
    const femArticle  = isPlural ? "las" : "la";

    // Smart pairing: "gato/gata - masculine/feminine" => el gato, la gata
    if (SMART_GENDERED_SLASH_PAIRING && isGenderedSlashPair(esClean)) {
      const [a, b] = expandSlashForms(esClean);

      // Heuristic: assume first form is masculine, second is feminine (matches your list)
      return [
        { es: addArticle(a, mascArticle), en: enClean },
        { es: addArticle(b, femArticle), en: enClean }
      ];
    }

    // Default mixed behavior: generate both articles for each expanded form
    const forms = expandSlashForms(esClean);
    const out = [];
    for (const f of forms) {
      out.push({ es: addArticle(f, mascArticle), en: enClean });
      out.push({ es: addArticle(f, femArticle),  en: enClean });
    }
    return out;
  }

  // Non-mixed gender: apply the single article
  const article = baseArticle;
  const forms = expandSlashForms(esClean);
  return forms.map((f) => ({ es: addArticle(f, article), en: enClean }));
}

const lines = raw.split(/\r?\n/).map(norm).filter(Boolean);

const deck = [];
for (const line of lines) {
  const cleaned = line.replace(/^\d+\.\s*/, "");

  // Split into english / spanish / gender notes (rest)
  const parts = cleaned.split(" - ").map(norm);
  if (parts.length < 2) continue;

  const en = parts[0];
  const spanishField = parts[1];
  const genderField = parts.slice(2).join(" - "); // keep everything after

  // Spanish field can contain multiple options separated by " / "
  // Each option can optionally have its own gender (after a " - gender")
  const optionChunks = splitOptions(spanishField);

  for (const optChunk of optionChunks) {
    const { es, gender } = splitSpanishAndGender(optChunk);
    const effectiveGender = gender || genderField;
    deck.push(...makeCardsForOption(en, es, effectiveGender));
  }
}

// Deduplicate exact duplicates
const seen = new Set();
const deduped = [];
for (const item of deck) {
  const key = `${item.en}||${item.es}`;
  if (seen.has(key)) continue;
  seen.add(key);
  deduped.push(item);
}

const out = `// Generated from ${inPath}\nwindow.DECK = ${JSON.stringify(deduped, null, 2)};\n`;
fs.writeFileSync(outPath, out, "utf8");

console.log(`Wrote ${deduped.length} cards to ${outPath}`);
