/*
 * limite.js — une limite de débit PAR CLIENT, en mémoire du processus.
 *
 * POURQUOI. La clé d'application est dans l'APK : n'importe qui peut l'en extraire et envoyer des recherches au hasard. Chaque recherche
 * nouvelle coûte 2 requêtes Hardcover (sur 5 000 par jour) : quelques minutes d'abus suffiraient à mettre le service en mode économie
 * pour tout le monde. Cette limite coupe l'abus d'un seul client avant qu'il ne coûte quoi que ce soit.
 *
 * LIMITES ASSUMÉES. Elle est PAR INSTANCE : un client qui tomberait sur plusieurs instances serveur obtiendrait plus. Pour un usage de moins
 * de 100 utilisateurs par jour, un client sérieux reste sur la même instance chaude, et c'est suffisant comme première ligne ; la seconde
 * est la règle de débit du pare-feu de Vercel (voir docs/exploitation.md), qui s'applique avant le code.
 *
 * VIE PRIVÉE. L'adresse du client n'est gardée qu'en mémoire, pendant la fenêtre (1 minute), et n'est JAMAIS écrite nulle part.
 */

export function creerLimiteClient({ fenetreMs = 60_000, max = 90, maintenant = Date.now } = {}) {
  const compteurs = new Map();   // client → { debut, n }
  let dernierNettoyage = maintenant();

  function nettoyer(t) {
    if (t - dernierNettoyage < fenetreMs) return;
    for (const [k, v] of compteurs) if (t - v.debut >= fenetreMs) compteurs.delete(k);
    dernierNettoyage = t;
  }

  return {
    /** @returns {{autorise: boolean, restant: number, reessayerDansSecondes: number}} */
    verifier(client) {
      const t = maintenant();
      nettoyer(t);
      const cle = client || 'inconnu';
      let c = compteurs.get(cle);
      if (!c || t - c.debut >= fenetreMs) { c = { debut: t, n: 0 }; compteurs.set(cle, c); }
      c.n += 1;
      const autorise = c.n <= max;
      return { autorise, restant: Math.max(0, max - c.n), reessayerDansSecondes: Math.max(1, Math.ceil((c.debut + fenetreMs - t) / 1000)) };
    },
    taille: () => compteurs.size,
  };
}

/** Le client, d'après les en-têtes que pose l'hébergeur : la PREMIÈRE adresse de la chaîne (celle du client réel). */
export function clientDe(entetes = {}) {
  const brut = entetes['x-vercel-forwarded-for'] || entetes['x-forwarded-for'] || entetes['x-real-ip'] || '';
  return String(brut).split(',')[0].trim() || null;
}
