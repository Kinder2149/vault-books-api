/*
 * Prototype JETABLE de mesure — pas du code de l'API.
 * Question : pour nos sagas test, que contiennent réellement BnF, Open Library et
 * Wikidata (séries, ordre des tomes, ISBN, éditeurs, langues) ?
 *
 *   node prototype/mesure.mjs
 *
 * Lecture seule. Écrit les réponses brutes dans prototype/out/ (ignoré par git).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { numeroDeTome } from '../../vault-read/client/src/tomes.js'; // fonction pure, lue seulement

const UA = 'VaultBooksAPI-prototype/0.1 (vcoutry@gmail.com)';
const OUT = new URL('./out/', import.meta.url);
mkdirSync(OUT, { recursive: true });
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

const SAGAS = [
  {
    id: 'got', nom: 'Le Trône de fer / A Song of Ice and Fire',
    bnf: { titre: 'trône de fer', auteur: 'martin' },
    ol: { titre: 'A Game of Thrones', auteur: 'martin' },
    wd: ['A Song of Ice and Fire', 'Le Trône de fer'],
  },
  {
    id: 'lotr', nom: 'Le Seigneur des anneaux',
    bnf: { titre: 'seigneur des anneaux', auteur: 'tolkien' },
    ol: { titre: 'The Lord of the Rings', auteur: 'tolkien' },
    wd: ['The Lord of the Rings', 'Le Seigneur des anneaux'],
  },
  {
    id: 'emeraude', nom: "Les Chevaliers d'Émeraude",
    bnf: { titre: "chevaliers d'émeraude", auteur: 'robillard' },
    ol: { titre: "Les Chevaliers d'Emeraude", auteur: 'robillard' },
    wd: ["Les Chevaliers d'Émeraude", "Chevaliers d'Émeraude"],
  },
];

async function get(url, opts = {}) {
  const t0 = Date.now();
  const r = await fetch(url, { headers: { 'User-Agent': UA, ...(opts.headers || {}) } });
  const ms = Date.now() - t0;
  if (!r.ok) throw new Error(`HTTP ${r.status} (${ms} ms) ${String(url).slice(0, 120)}`);
  return { texte: await r.text(), ms };
}

// ------------------------------------------------------------------ BnF
const decoder = (t) => String(t || '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&amp;/g, '&').trim();
const champs = (b, n) => [...b.matchAll(new RegExp(`<dc:${n}[^>]*>([\\s\\S]*?)</dc:${n}>`, 'g'))].map((m) => decoder(m[1])).filter(Boolean);

async function bnf({ titre, auteur }) {
  const notices = [];
  let total = null;
  for (let debut = 1; debut <= 201; debut += 50) {
    const url = new URL('https://catalogue.bnf.fr/api/SRU');
    url.searchParams.set('version', '1.2');
    url.searchParams.set('operation', 'searchRetrieve');
    url.searchParams.set('recordSchema', 'dublincore');
    url.searchParams.set('maximumRecords', '50');
    url.searchParams.set('startRecord', String(debut));
    url.searchParams.set('query', `bib.title all "${titre}" and bib.author all "${auteur}" and bib.doctype any "a"`);
    const { texte } = await get(url);
    total ??= Number((texte.match(/<srw:numberOfRecords>(\d+)/) || [])[1] || 0);
    const bloc = [...texte.matchAll(/<oai_dc:dc[\s\S]*?<\/oai_dc:dc>/g)].map((m) => m[0]);
    for (const b of bloc) {
      const isbn = (champs(b, 'identifier').find((i) => /^ISBN/i.test(i)) || '').replace(/[^0-9Xx]/g, '');
      notices.push({
        titre: champs(b, 'title')[0] || '',
        auteurs: champs(b, 'creator'),
        editeur: champs(b, 'publisher')[0] || null,
        date: champs(b, 'date')[0] || null,
        langue: champs(b, 'language')[0] || null,
        isbn: isbn || null,
        collection: (champs(b, 'description').find((d) => d.startsWith('Collection :')) || '').replace('Collection :', '').trim() || null,
        tome: numeroDeTome(champs(b, 'title')[0] || ''),
      });
    }
    if (bloc.length < 50 || notices.length >= total) break;
    await pause(400);
  }
  return { total, notices };
}

// ------------------------------------------------------------------ Open Library
async function openLibrary({ titre, auteur }) {
  const p = new URLSearchParams({
    title: titre, author: auteur, limit: '20',
    fields: 'key,title,author_name,first_publish_year,edition_count,cover_i,readinglog_count,language,editions,editions.key,editions.title,editions.language,editions.publisher,editions.isbn,editions.series,editions.cover_i',
  });
  const { texte, ms } = await get(`https://openlibrary.org/search.json?${p}`);
  return { ms, ...JSON.parse(texte) };
}

// ------------------------------------------------------------------ Wikidata
async function wdTrouver(nom) {
  const p = new URLSearchParams({ action: 'wbsearchentities', search: nom, language: 'fr', uselang: 'fr', type: 'item', limit: '6', format: 'json' });
  const { texte } = await get(`https://www.wikidata.org/w/api.php?${p}`);
  return JSON.parse(texte).search.map((s) => ({ id: s.id, label: s.label, description: s.description }));
}

async function wdSparql(requete) {
  const { texte } = await get(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(requete)}`,
    { headers: { Accept: 'application/sparql-results+json' } });
  return JSON.parse(texte).results.bindings;
}

async function wdSerie(qid) {
  // Œuvres membres de la série, avec leur numéro et leurs éditions (ISBN) connues.
  const parties = await wdSparql(`
    SELECT ?part ?partLabel ?ordre WHERE {
      ?part p:P179 ?st . ?st ps:P179 wd:${qid} .
      OPTIONAL { ?st pq:P1545 ?ordre . }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "fr,en". }
    } ORDER BY xsd:integer(?ordre) LIMIT 100`);
  const editions = await wdSparql(`
    SELECT ?work ?workLabel ?ed ?edLabel ?isbn13 ?langLabel ?pubLabel WHERE {
      ?work wdt:P179 wd:${qid} .
      ?ed wdt:P629 ?work .
      OPTIONAL { ?ed wdt:P212 ?isbn13 . }
      OPTIONAL { ?ed wdt:P407 ?lang . }
      OPTIONAL { ?ed wdt:P123 ?pub . }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "fr,en". }
    } LIMIT 500`);
  return { parties, editions };
}

// ------------------------------------------------------------------ main
const resume = [];
for (const s of SAGAS) {
  console.log(`\n=== ${s.nom} ===`);
  const sortie = { id: s.id };

  try {
    const b = await bnf(s.bnf);
    sortie.bnf = b;
    const n = b.notices;
    const avecIsbn = n.filter((x) => x.isbn);
    const tomes = new Set(n.map((x) => x.tome).filter(Boolean));
    const collections = {};
    n.forEach((x) => { if (x.collection) collections[x.collection] = (collections[x.collection] || 0) + 1; });
    console.log(`BnF : ${b.total} notices annoncées, ${n.length} lues, ${avecIsbn.length} avec ISBN, tomes lus : [${[...tomes].sort((a, c) => a - c)}]`);
    console.log('  éditeurs :', [...new Set(n.map((x) => x.editeur).filter(Boolean))].slice(0, 8).join(' | '));
    console.log('  collections :', Object.entries(collections).sort((a, c) => c[1] - a[1]).slice(0, 5).map(([k, v]) => `${k} (${v})`).join(' | ') || 'aucune');
    sortie.bnfStats = { total: b.total, lues: n.length, isbn: avecIsbn.length, tomes: [...tomes] };
  } catch (e) { console.log('BnF : ÉCHEC', e.message); }
  await pause(500);

  try {
    const o = await openLibrary(s.ol);
    sortie.ol = o;
    console.log(`Open Library : ${o.numFound} œuvres trouvées en ${o.ms} ms`);
    (o.docs || []).slice(0, 6).forEach((d) => {
      const ed = (d.editions?.docs || []);
      console.log(`  - ${d.title} | ${(d.author_name || []).slice(0, 2).join(', ')} | ${d.edition_count} éd. | lecteurs ${d.readinglog_count ?? '?'} | series: ${ed.map((e) => e.series).flat().filter(Boolean)[0] || '—'}`);
    });
  } catch (e) { console.log('Open Library : ÉCHEC', e.message); }
  await pause(500);

  sortie.wd = [];
  for (const nom of s.wd) {
    try {
      const cand = await wdTrouver(nom);
      console.log(`Wikidata « ${nom} » :`, cand.map((c) => `${c.id} ${c.label} (${c.description || '—'})`).join(' ; ') || 'rien');
      sortie.wd.push({ nom, cand });
      const serie = cand.find((c) => /series|série|saga|cycle|trilogy|trilogie/i.test(c.description || ''));
      if (serie) {
        const { parties, editions } = await wdSerie(serie.id);
        console.log(`  série retenue ${serie.id} : ${parties.length} œuvres membres, ${editions.length} éditions (${editions.filter((e) => e.isbn13).length} avec ISBN)`);
        parties.slice(0, 12).forEach((p) => console.log(`    ${p.ordre?.value ?? '?'} — ${p.partLabel.value}`));
        sortie.wd.at(-1).serie = { id: serie.id, parties, editions };
        break;
      }
    } catch (e) { console.log(`Wikidata « ${nom} » : ÉCHEC`, e.message); }
    await pause(800);
  }

  writeFileSync(new URL(`${s.id}.json`, OUT), JSON.stringify(sortie, null, 2));
  resume.push(sortie);
}
console.log('\nRéponses brutes dans prototype/out/');
