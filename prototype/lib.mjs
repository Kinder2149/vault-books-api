// Outils partagés des tests du prototype.
// Charge vault-books-api/.env s'il existe (ignoré par git). Node >= 20.12.
try { process.loadEnvFile(new URL('../.env', import.meta.url)); } catch { /* pas de .env : on continue sans clé */ }

export const UA = 'VaultBooksAPI-prototype/0.1 (vcoutry@gmail.com)';
export const pause = (ms) => new Promise((r) => setTimeout(r, ms));

export async function appeler(url, { headers = {}, timeoutMs = 15000, binaire = false } = {}) {
  const arret = new AbortController();
  const minuteur = setTimeout(() => arret.abort(), timeoutMs);
  const t0 = Date.now();
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, ...headers }, signal: arret.signal });
    const corps = binaire ? Buffer.from(await r.arrayBuffer()) : await r.text();
    return { status: r.status, ms: Date.now() - t0, corps, type: r.headers.get('content-type') || '' };
  } catch (e) {
    return { status: 0, ms: Date.now() - t0, erreur: e.name === 'AbortError' ? 'délai dépassé' : e.message };
  } finally {
    clearTimeout(minuteur);
  }
}

export const mediane = (a) => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
};

/** Dimensions d'un JPEG / PNG / GIF lues dans l'en-tête, sans dépendance. */
export function dimensionsImage(buf) {
  try {
    if (buf[0] === 0xff && buf[1] === 0xd8) {
      let i = 2;
      while (i < buf.length) {
        if (buf[i] !== 0xff) { i += 1; continue; }
        const m = buf[i + 1];
        const len = buf.readUInt16BE(i + 2);
        if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
          return { h: buf.readUInt16BE(i + 5), l: buf.readUInt16BE(i + 7), format: 'jpeg' };
        }
        i += 2 + len;
      }
    }
    if (buf.slice(1, 4).toString() === 'PNG') return { l: buf.readUInt32BE(16), h: buf.readUInt32BE(20), format: 'png' };
    if (buf.slice(0, 3).toString() === 'GIF') return { l: buf.readUInt16LE(6), h: buf.readUInt16LE(8), format: 'gif' };
  } catch { /* image illisible */ }
  return null;
}

export function isbn10Vers13(isbn10) {
  const s = String(isbn10 || '').replace(/[^0-9Xx]/g, '');
  if (s.length !== 10) return null;
  const corps = `978${s.slice(0, 9)}`;
  let somme = 0;
  for (let i = 0; i < 12; i += 1) somme += Number(corps[i]) * (i % 2 === 0 ? 1 : 3);
  return corps + String((10 - (somme % 10)) % 10);
}

/** Normalise vers un ISBN-13, ou null. */
export function versIsbn13(brut) {
  const s = String(brut || '').replace(/[^0-9Xx]/g, '').toUpperCase();
  if (s.length === 13) return s;
  if (s.length === 10) return isbn10Vers13(s);
  return null;
}

export const vert = (t) => `\x1b[32m${t}\x1b[0m`;
export const rouge = (t) => `\x1b[31m${t}\x1b[0m`;
export const jaune = (t) => `\x1b[33m${t}\x1b[0m`;
