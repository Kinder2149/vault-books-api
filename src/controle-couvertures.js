/*
 * controle-couvertures.js — les couvertures CORRIGÉES À LA MAIN sont des adresses externes : elles finissent par mourir (site fermé, fichier déplacé).
 * Une fois par semaine, on vérifie que chacune répond encore, et on garde le résultat pour /v1/status (clé `controle:couvertures`).
 * Une couverture corrigée dont l'adresse est morte masquerait la bonne image par une image cassée : c'est pire qu'aucune correction.
 */
import { entetesSupabase } from './supabase.js';

const DELAI_MS = 8000;
const TAILLE_MIN = 4000;
const CONCURRENCE = 4;

/** Une adresse d'image répond-elle encore par une vraie image ? HEAD d'abord, GET si le serveur refuse HEAD. */
export async function adresseVivante(adresse, fetchImpl = fetch) {
  for (const methode of ['HEAD', 'GET']) {
    const arret = new AbortController();
    const minuteur = setTimeout(() => arret.abort(), DELAI_MS);
    try {
      const r = await fetchImpl(adresse, { method: methode, redirect: 'follow', signal: arret.signal });
      if (methode === 'HEAD' && (r.status === 405 || r.status === 501)) continue;
      if (!r.ok) return { vivante: false, statut: r.status };
      const type = (r.headers.get('content-type') || '').toLowerCase();
      const taille = Number(r.headers.get('content-length'));
      if (type && !type.startsWith('image/')) return { vivante: false, statut: r.status, raison: `type ${type}` };
      if (taille && taille < TAILLE_MIN) return { vivante: false, statut: r.status, raison: `${taille} octets` };
      return { vivante: true, statut: r.status };
    } catch (e) {
      if (methode === 'GET') return { vivante: false, statut: 0, raison: e.name === 'AbortError' ? 'délai dépassé' : e.message };
    } finally {
      clearTimeout(minuteur);
    }
  }
  return { vivante: false, statut: 0 };
}

export function creerControleCouvertures({ url, cle, fetchImpl = fetch, maintenant = Date.now }) {
  return {
    async executer() {
      const r = await fetchImpl(`${url}/rest/v1/cover_overrides?select=key,url&order=key`, { headers: entetesSupabase(cle) });
      if (!r.ok) throw new Error(`Supabase (cover_overrides) a répondu ${r.status}`);
      const lignes = await r.json();

      const mortes = [];
      const file = [...lignes];
      await Promise.all(Array.from({ length: Math.min(CONCURRENCE, file.length) }, async () => {
        while (file.length) {
          const l = file.shift();
          const v = await adresseVivante(l.url, fetchImpl);
          if (!v.vivante) mortes.push({ cle: l.key, url: l.url, statut: v.statut, ...(v.raison ? { raison: v.raison } : {}) });
        }
      }));
      return { verifieLe: new Date(maintenant()).toISOString(), total: lignes.length, mortes: mortes.sort((a, b) => a.cle.localeCompare(b.cle)) };
    },
  };
}
