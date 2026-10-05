// Petits outils communs aux scripts de contrôle (scripts/*.mjs).
export const pause = (ms) => new Promise((r) => setTimeout(r, ms));

export async function appeler(url, { headers = {}, timeoutMs = 15000, binaire = false } = {}) {
  const arret = new AbortController();
  const minuteur = setTimeout(() => arret.abort(), timeoutMs);
  const t0 = Date.now();
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'VaultBooksAPI-controle/0.2', ...headers }, signal: arret.signal });
    const corps = binaire ? Buffer.from(await r.arrayBuffer()) : await r.text();
    return { status: r.status, ms: Date.now() - t0, corps, type: r.headers.get('content-type') || '' };
  } catch (e) {
    return { status: 0, ms: Date.now() - t0, erreur: e.name === 'AbortError' ? 'délai dépassé' : e.message };
  } finally {
    clearTimeout(minuteur);
  }
}
