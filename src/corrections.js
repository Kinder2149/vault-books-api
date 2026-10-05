/*
 * corrections.js — corriger une saga ou une couverture EN UNE COMMANDE (voir scripts/corriger.mjs), sans toucher à du code.
 *
 * Deux choses à ne pas oublier, et c'est tout l'intérêt de ce module :
 *  1. une couverture n'est acceptée que si l'image EXISTE vraiment (téléchargée, ≥ 200 px de large, pas un pixel fantôme) ;
 *  2. une correction doit être VISIBLE : les réponses déjà calculées sont dans le cache (jusqu'à 7 jours), donc on invalide ce qu'elle
 *     touche — sinon la correction n'apparaîtrait qu'au bout d'un jour ou d'une semaine.
 */
import { entetesSupabase } from './supabase.js';
import { dimensionsImage, LARGEUR_MIN } from './images.js';
import { normaliser } from './text.js';

// ---------------------------------------------------------------- lecture de la ligne de commande

/** `corriger serie 1130 --nom-fr "x" --exclure 1.5` → { positionnels: ['serie','1130'], options: { 'nom-fr': 'x', exclure: '1.5' } } */
export function analyser(argv) {
  const positionnels = [];
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const suivant = argv[i + 1];
      if (suivant === undefined || suivant.startsWith('--')) throw new Error(`L'option ${a} attend une valeur.`);
      options[a.slice(2)] = suivant;
      i += 1;
    } else {
      positionnels.push(a);
    }
  }
  return { positionnels, options };
}

/** « 87481, 87482 » → [87481, 87482] ; « 1.5,2.5 » → [1.5, 2.5] ; vide → []. Une valeur qui n'est pas un nombre est une erreur. */
export function listeDeNombres(texte) {
  if (texte === undefined || texte === '') return [];
  return String(texte).split(',').map((t) => t.trim()).filter(Boolean).map((t) => {
    const n = Number(t);
    if (!Number.isFinite(n)) throw new Error(`« ${t} » n'est pas un nombre.`);
    return n;
  });
}

/** La ligne à écrire dans series_overrides : ce qui n'est pas donné en option est CONSERVÉ depuis la ligne existante. */
export function ligneSerie(id, options, existante = null) {
  const numero = Number(id);
  if (!Number.isInteger(numero) || numero <= 0) throw new Error(`« ${id} » n'est pas un identifiant de série.`);
  const garde = (cleOption, colonne, defaut) => (options[cleOption] !== undefined ? options[cleOption] : (existante ? existante[colonne] : defaut));
  const ligne = {
    series_id: numero,
    name_fr: garde('nom-fr', 'name_fr', null) || null,
    name_en: garde('nom-en', 'name_en', null) || null,
    merge_ids: options.fusionner !== undefined ? listeDeNombres(options.fusionner) : (existante?.merge_ids ?? []),
    exclude_positions: options.exclure !== undefined ? listeDeNombres(options.exclure) : (existante?.exclude_positions ?? []),
    note: garde('note', 'note', null) || null,
    updated_at: new Date().toISOString(),
  };
  if (!ligne.name_fr && !ligne.name_en && !ligne.merge_ids.length && !ligne.exclude_positions.length) {
    throw new Error('Rien à corriger : donnez au moins --nom-fr, --nom-en, --fusionner ou --exclure.');
  }
  return ligne;
}

/** Clés de couverture admises : `isbn:<13 chiffres>` (une édition) ou `serie:<id>:<position>` (un tome d'une saga). */
export function cleCouvertureValide(cle) {
  return /^isbn:\d{13}$/.test(cle) || /^serie:\d+:\d+(\.\d+)?$/.test(cle);
}

// ---------------------------------------------------------------- vérification d'une image

/** L'image existe-t-elle vraiment ? Téléchargée, lue, ≥ 200 px de large, et plus de 4 000 octets (un pixel fantôme fait 43 octets). */
export async function verifierImage(url, fetchImpl = fetch) {
  if (!/^https:\/\//i.test(url)) return { ok: false, raison: "l'adresse doit commencer par https://" };
  let r;
  try { r = await fetchImpl(url, { redirect: 'follow' }); } catch (e) { return { ok: false, raison: `adresse injoignable (${e.message})` }; }
  if (!r.ok) return { ok: false, raison: `l'adresse répond ${r.status}` };
  const corps = Buffer.from(await r.arrayBuffer());
  const dim = dimensionsImage(corps);
  if (!dim) return { ok: false, raison: "ce n'est pas une image JPEG, PNG ou GIF lisible" };
  if (dim.l < LARGEUR_MIN) return { ok: false, raison: `image trop petite (${dim.l}×${dim.h}, ${LARGEUR_MIN} px de large minimum)`, dim };
  if (corps.length < 4000) return { ok: false, raison: `image suspecte (${corps.length} octets)`, dim };
  return { ok: true, dim, octets: corps.length };
}

// ---------------------------------------------------------------- écriture dans Supabase

/** Ce qu'une correction rend périmé dans le cache (motifs PostgREST `like`). */
export function aInvalider({ type, id, isbn }) {
  if (type === 'serie') return [`serie:*:${id}`, 'search:*', 'livre:*', 'isbn:*'];       // le nom d'une saga apparaît partout
  if (type === 'couverture-isbn') return [`isbn:*:${isbn}`, 'serie:*', 'livre:*'];
  if (type === 'couverture-serie') return [`serie:*:${id}`];
  if (type === 'alias') return [`search:*:${normaliser(id)}`];                                  // la recherche concernée, dans les deux langues
  return [];
}

export function creerCorrections({ url, cle, fetchImpl = fetch }) {
  const base = `${url}/rest/v1`;
  const json = entetesSupabase(cle, { 'content-type': 'application/json' });

  async function appeler(chemin, options = {}) {
    const r = await fetchImpl(`${base}/${chemin}`, options);
    if (!r.ok) throw new Error(`Supabase a répondu ${r.status} sur ${chemin.split('?')[0]}`);
    return r;
  }

  async function invalider(motifs) {
    let total = 0;
    for (const m of motifs) {
      const r = await appeler(`cache_entries?key=like.${m}`, { method: 'DELETE', headers: entetesSupabase(cle, { prefer: 'count=exact,return=minimal' }) });
      total += Number((r.headers.get('content-range') || '').split('/')[1]) || 0;
    }
    return total;
  }

  return {
    async lister() {
      const [series, couvertures, alias] = await Promise.all([
        appeler('series_overrides?select=*&order=series_id', { headers: entetesSupabase(cle) }).then((r) => r.json()),
        appeler('cover_overrides?select=*&order=key', { headers: entetesSupabase(cle) }).then((r) => r.json()),
        appeler('search_aliases?select=*&order=query_norm', { headers: entetesSupabase(cle) }).then((r) => r.json()),
      ]);
      return { series, couvertures, alias };
    },

    async enregistrerSerie(id, options) {
      const existante = (await appeler(`series_overrides?series_id=eq.${Number(id)}&select=*`, { headers: entetesSupabase(cle) }).then((r) => r.json()))[0] || null;
      const ligne = ligneSerie(id, options, existante);
      await appeler('series_overrides?on_conflict=series_id', { method: 'POST', headers: { ...json, prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(ligne) });
      return { ligne, invalidees: await invalider(aInvalider({ type: 'serie', id: ligne.series_id })) };
    },

    async supprimerSerie(id) {
      await appeler(`series_overrides?series_id=eq.${Number(id)}`, { method: 'DELETE', headers: entetesSupabase(cle, { prefer: 'return=minimal' }) });
      return { invalidees: await invalider(aInvalider({ type: 'serie', id: Number(id) })) };
    },

    async enregistrerCouverture(clef, urlImage, note = null) {
      if (!cleCouvertureValide(clef)) throw new Error('Clé invalide : isbn:<13 chiffres> ou serie:<id>:<position> (ex. serie:25608:3).');
      const verif = await verifierImage(urlImage, fetchImpl);
      if (!verif.ok) throw new Error(`Image refusée : ${verif.raison}.`);
      await appeler('cover_overrides?on_conflict=key', { method: 'POST', headers: { ...json, prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ key: clef, url: urlImage, note, updated_at: new Date().toISOString() }) });
      const [type, a, b] = clef.split(':');
      const motifs = type === 'isbn' ? aInvalider({ type: 'couverture-isbn', isbn: a }) : aInvalider({ type: 'couverture-serie', id: a, position: b });
      return { image: verif, invalidees: await invalider(motifs) };
    },

    /** Un alias de recherche : « journal d'un dégonflé » → « diary of a wimpy kid ». La requête est enregistrée NORMALISÉE. */
    async enregistrerAlias(requete, cible, note = null) {
      const norm = normaliser(requete);
      if (norm.length < 2) throw new Error('Requête trop courte.');
      if (!String(cible || '').trim()) throw new Error('Il faut une cible : ce qu\'on cherche vraiment chez Hardcover.');
      if (normaliser(cible) === norm) throw new Error('La cible est identique à la requête : inutile.');
      await appeler('search_aliases?on_conflict=query_norm', { method: 'POST', headers: { ...json, prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ query_norm: norm, target: String(cible).trim(), note, updated_at: new Date().toISOString() }) });
      return { requete: norm, invalidees: await invalider(aInvalider({ type: 'alias', id: requete })) };
    },

    async supprimerAlias(requete) {
      const norm = normaliser(requete);
      await appeler(`search_aliases?query_norm=eq.${encodeURIComponent(norm)}`, { method: 'DELETE', headers: entetesSupabase(cle, { prefer: 'return=minimal' }) });
      return { requete: norm, invalidees: await invalider(aInvalider({ type: 'alias', id: requete })) };
    },
    async supprimerCouverture(clef) {
      if (!cleCouvertureValide(clef)) throw new Error('Clé invalide : isbn:<13 chiffres> ou serie:<id>:<position>.');
      await appeler(`cover_overrides?key=eq.${encodeURIComponent(clef)}`, { method: 'DELETE', headers: entetesSupabase(cle, { prefer: 'return=minimal' }) });
      const [type, a] = clef.split(':');
      return { invalidees: await invalider(type === 'isbn' ? aInvalider({ type: 'couverture-isbn', isbn: a }) : aInvalider({ type: 'couverture-serie', id: a })) };
    },
  };
}
