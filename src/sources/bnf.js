/*
 * sources/bnf.js — catalogue de la Bibliothèque nationale de France (dépôt légal). SEUL fichier qui lui parle.
 * Rôle : lister les ÉDITIONS FRANÇAISES d'un livre (éditeur, année, ISBN). Ni couverture, ni résumé.
 *
 * Mesuré les 2026-08 (Vault Read) et 2026-10-05 (nous) :
 *  - sans clé ni quota, mais la BnF COUPE la connexion (ECONNRESET) quand on l'enchaîne vite : ~400 requêtes en quelques
 *    minutes l'ont rendue injoignable plusieurs minutes. D'où la file d'attente ci-dessous (1 requête à la fois, ≥ 1,1 s d'écart) ;
 *  - filtre `bib.doctype any "a"` obligatoire (sinon cassettes et disques) ;
 *  - format dublincore : « Titre : sous-titre / mention de responsabilité », auteur « Nom, Prénom (dates). Rôle »,
 *    éditeur « Nom (Ville) » ; l'ISBN est du texte libre qui peut contenir le prix.
 */
import { extraireIsbn13, isbn13Vers10 } from '../isbn.js';

const BASE = 'https://catalogue.bnf.fr/api/SRU';
const DELAI_MAX_MS = 6000;
const ECART_MIN_MS = 1100;
const PAUSE_REESSAI_MS = 2500;

function decoder(texte) {
  return String(texte || '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&').trim();
}

const champs = (bloc, nom) =>
  [...bloc.matchAll(new RegExp(`<dc:${nom}[^>]*>([\\s\\S]*?)</dc:${nom}>`, 'g'))].map((m) => decoder(m[1])).filter(Boolean);

/** « Goscinny, René (1926-1977). Scénariste » → « René Goscinny » */
function nomPropre(brut) {
  const sansDates = String(brut || '').replace(/\([^)]*\)?/g, ' ').split('.')[0].replace(/\s+/g, ' ').trim();
  const m = sansDates.match(/^([^,]+),\s*(.+)$/);
  return m ? `${m[2].trim()} ${m[1].trim()}` : sansDates;
}

/** « Régie cassette vidéo [éd., distrib.] (Paris) » → « Régie cassette vidéo » */
function editeurPropre(brut) {
  return String(brut || '').split('[')[0].replace(/\([^)]*\)?/g, ' ').replace(/[()]/g, ' ')
    .replace(/\s+/g, ' ').replace(/[,;:\s]+$/, '').trim() || null;
}

export function lireNotices(xml) {
  return [...String(xml).matchAll(/<oai_dc:dc[\s\S]*?<\/oai_dc:dc>/g)].map((m) => {
    const b = m[0];
    const ident = champs(b, 'identifier');
    const titreBrut = champs(b, 'title')[0] || '';
    const annee = (champs(b, 'date')[0] || '').match(/\d{4}/)?.[0] || null;
    return {
      ark: (ident.find((i) => i.includes('ark:')) || '').match(/ark:\/12148\/[a-z0-9]+/)?.[0] || null,
      titre: titreBrut.split(' / ')[0].trim(),
      auteurs: [...new Set([...champs(b, 'creator'), ...champs(b, 'contributor')].map(nomPropre).filter(Boolean))],
      editeur: editeurPropre(champs(b, 'publisher')[0]),
      annee,
      isbn13: extraireIsbn13(ident.find((i) => /^ISBN/i.test(i))),
      collection: (champs(b, 'description').find((d) => d.startsWith('Collection :')) || '').replace('Collection :', '').trim() || null,
      langue: (champs(b, 'language')[0] || '').slice(0, 3) || null,
    };
  });
}

const sansGuillemets = (t) => String(t || '').replace(/"/g, ' ').trim();

export function creerBnf({ fetchImpl = fetch, ecartMs = ECART_MIN_MS, pauseReessaiMs = PAUSE_REESSAI_MS } = {}) {
  // File d'attente : une requête à la fois, avec un écart minimal. Une promesse chaînée suffit.
  let file = Promise.resolve();
  let dernier = 0;

  function sequencer(tache) {
    const suite = file.then(async () => {
      const attente = dernier + ecartMs - Date.now();
      if (attente > 0) await new Promise((ok) => setTimeout(ok, attente));
      try { return await tache(); } finally { dernier = Date.now(); }
    });
    file = suite.catch(() => {});
    return suite;
  }

  async function appeler(requete, max = 20) {
    const url = new URL(BASE);
    url.searchParams.set('version', '1.2');
    url.searchParams.set('operation', 'searchRetrieve');
    url.searchParams.set('recordSchema', 'dublincore');
    url.searchParams.set('maximumRecords', String(max));
    url.searchParams.set('query', requete);

    for (let essai = 0; ; essai += 1) {
      const arret = new AbortController();
      const minuteur = setTimeout(() => arret.abort(), DELAI_MAX_MS);
      try {
        const r = await fetchImpl(url.toString(), { signal: arret.signal, headers: { 'user-agent': 'VaultBooksAPI/0.1' } });
        if (!r.ok) throw new Error(`BnF a répondu ${r.status}`);
        return await r.text();
      } catch (e) {
        // Une coupure de connexion se rattrape UNE fois, après une vraie pause : insister tout de suite l'aggrave.
        if (essai === 0) { await new Promise((ok) => setTimeout(ok, pauseReessaiMs)); continue; }
        throw new Error(e.name === 'AbortError' ? 'La BnF ne répond pas.' : `BnF injoignable (${e.cause?.code || e.message})`);
      } finally {
        clearTimeout(minuteur);
      }
    }
  }

  return {
    /**
     * La notice d'un ISBN. Tente l'ISBN-13, PUIS sa forme ISBN-10 : la BnF indexe les livres antérieurs à 2007 en ISBN-10 seulement
     * (mesuré : « 9782226052575 » ne rend rien, « 2226052577 » rend Les Fourmis). Rend null si aucune des deux formes ne répond.
     */
    parIsbn(isbn13) {
      const formes = [isbn13, isbn13Vers10(isbn13)].filter(Boolean);
      return sequencer(async () => {
        for (const forme of formes) {
          const [notice] = lireNotices(await appeler(`bib.isbn all "${forme}"`, 3));
          if (notice) return { ...notice, isbn13 };   // on rend l'ISBN demandé : c'est celui du code-barres scanné
        }
        return null;
      });
    },

    /** Les éditions d'un texte : même titre, même auteur, texte imprimé. */
    editionsDe(titre, auteur, max = 40) {
      const morceaux = [`bib.title all "${sansGuillemets(titre)}"`];
      if (auteur) morceaux.push(`bib.author all "${sansGuillemets(auteur)}"`);
      morceaux.push('bib.doctype any "a"');
      return sequencer(async () => lireNotices(await appeler(morceaux.join(' and '), max)));
    },
  };
}
