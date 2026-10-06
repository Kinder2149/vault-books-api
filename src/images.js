/*
 * images.js — une image de couverture est-elle exploitable ? Fonction pure.
 * Mesuré le 2026-10-05 : Hardcover rend parfois une miniature de 98 px (illisible sur une grille de téléphone).
 * Sous 200 px de large, on préfère chercher mieux ailleurs (Open Library : ~300 px) et ne garder la miniature qu'en dernier recours.
 * Sans largeur connue, on fait confiance à l'image.
 */
export const LARGEUR_MIN = 200;

export const utilisable = (img) => Boolean(img?.url) && (!img.width || img.width >= LARGEUR_MIN);
export const petite = (img) => Boolean(img?.url) && !utilisable(img);

/** Dimensions d'un JPEG, PNG ou GIF lues dans l'en-tête, sans dépendance. Rend null si l'image est illisible. */
export function dimensionsImage(buf) {
  try {
    if (buf[0] === 0xff && buf[1] === 0xd8) {
      let i = 2;
      while (i < buf.length) {
        if (buf[i] !== 0xff) { i += 1; continue; }
        const marqueur = buf[i + 1];
        const longueur = buf.readUInt16BE(i + 2);
        if (marqueur >= 0xc0 && marqueur <= 0xcf && marqueur !== 0xc4 && marqueur !== 0xc8 && marqueur !== 0xcc) {
          return { h: buf.readUInt16BE(i + 5), l: buf.readUInt16BE(i + 7), format: 'jpeg' };
        }
        i += 2 + longueur;
      }
    }
    if (buf.slice(1, 4).toString() === 'PNG') return { l: buf.readUInt32BE(16), h: buf.readUInt32BE(20), format: 'png' };
    if (buf.slice(0, 3).toString() === 'GIF') return { l: buf.readUInt16LE(6), h: buf.readUInt16LE(8), format: 'gif' };
  } catch { /* image illisible */ }
  return null;
}

/**
 * La part de l'image (0 à 1) qui est du BLANC, d'après la luminosité de chaque bloc de 8×8 pixels. Sert à repérer une PAGE DE TITRE SCANNÉE
 * (mesuré le 2026-10-06 : Open Library rend, pour les « Chevaliers d'Émeraude » tome 2, la page de titre blanche d'un autre tome à la place de la couverture).
 * On ne décode que la composante continue (DC) de la luminance d'un JPEG de base : pas de dépendance, quelques millisecondes.
 * Rend null si l'image n'est pas un JPEG de base (progressif, PNG…) : on ne sait pas, donc on ne juge pas.
 */
export function partBlanche(buf) {
  try {
    if (buf[0] !== 0xff || buf[1] !== 0xd8) return null;
    const quant = {}; const dc = {}; const ac = {};
    let comps = null; let restart = 0; let i = 2;
    const table = (octets) => {   // table de Huffman : « code de longueur l » → symbole
      const comptes = octets.slice(0, 16); const symboles = octets.slice(16);
      const map = new Map(); let code = 0; let k = 0;
      for (let l = 1; l <= 16; l += 1) { for (let n = 0; n < comptes[l - 1]; n += 1) map.set((l << 16) | code++, symboles[k++]); code <<= 1; }
      return map;
    };
    while (i < buf.length) {
      if (buf[i] !== 0xff) { i += 1; continue; }
      const m = buf[i + 1];
      if (m === 0xd8 || (m >= 0xd0 && m <= 0xd7) || m === 0x01 || m === 0xff) { i += m === 0xff ? 1 : 2; continue; }
      const len = buf.readUInt16BE(i + 2);
      const seg = buf.subarray(i + 4, i + 2 + len);
      if (m === 0xc2) return null;   // progressif
      if (m === 0xdb) {
        for (let p = 0; p < seg.length;) { const pq = seg[p] >> 4; const id = seg[p] & 15; quant[id] = pq ? seg.readUInt16BE(p + 1) : seg[p + 1]; p += 1 + (pq ? 128 : 64); }
      } else if (m === 0xc4) {
        for (let p = 0; p < seg.length;) {
          const cl = seg[p] >> 4; const id = seg[p] & 15;
          const n = seg.subarray(p + 1, p + 17).reduce((a, b) => a + b, 0);
          (cl ? ac : dc)[id] = table(seg.subarray(p + 1, p + 17 + n)); p += 17 + n;
        }
      } else if (m === 0xdd) {
        restart = seg.readUInt16BE(0);
      } else if (m === 0xc0 || m === 0xc1) {
        const h = seg.readUInt16BE(1); const l = seg.readUInt16BE(3);
        comps = { h, l, liste: [] };
        for (let c = 0; c < seg[5]; c += 1) comps.liste.push({ id: seg[6 + 3 * c], hs: seg[7 + 3 * c] >> 4, vs: seg[7 + 3 * c] & 15, tq: seg[8 + 3 * c] });
      } else if (m === 0xda) {
        if (!comps) return null;
        for (let c = 0; c < seg[0]; c += 1) { const x = comps.liste.find((y) => y.id === seg[1 + 2 * c]); if (x) { x.td = seg[2 + 2 * c] >> 4; x.ta = seg[2 + 2 * c] & 15; } }
        return blocsBlancs(buf, i + 2 + len, comps, { quant, dc, ac, restart });
      }
      i += 2 + len;
    }
  } catch { /* image illisible : on ne juge pas */ }
  return null;
}

function blocsBlancs(buf, debut, comps, { quant, dc, ac, restart }) {
  let pos = debut; let bit = 0; let courant = 0;
  const lireBit = () => {
    if (bit === 0) {
      courant = buf[pos++];
      if (courant === 0xff) { const suite = buf[pos++]; if (suite !== 0) throw new Error('marqueur'); }
      bit = 8;
    }
    bit -= 1;
    return (courant >> bit) & 1;
  };
  const lireBits = (n) => { let v = 0; for (let k = 0; k < n; k += 1) v = (v << 1) | lireBit(); return v; };
  const symbole = (t) => { let code = 0; for (let l = 1; l <= 16; l += 1) { code = (code << 1) | lireBit(); const s = t.get((l << 16) | code); if (s !== undefined) return s; } throw new Error('huffman'); };
  const etendre = (v, n) => (n && v < (1 << (n - 1)) ? v - (1 << n) + 1 : v);

  const hmax = Math.max(...comps.liste.map((c) => c.hs)); const vmax = Math.max(...comps.liste.map((c) => c.vs));
  const mcuX = Math.ceil(comps.l / (8 * hmax)); const mcuY = Math.ceil(comps.h / (8 * vmax));
  const pred = comps.liste.map(() => 0);
  let blancs = 0; let total = 0; let n = 0;
  for (let my = 0; my < mcuY; my += 1) {
    for (let mx = 0; mx < mcuX; mx += 1) {
      if (restart && n > 0 && n % restart === 0) {   // marqueur de reprise : on réaligne et on remet les prédictions à zéro
        bit = 0;
        while (pos < buf.length && !(buf[pos] === 0xff && buf[pos + 1] >= 0xd0 && buf[pos + 1] <= 0xd7)) pos += 1;
        pos += 2; pred.fill(0);
      }
      n += 1;
      comps.liste.forEach((c, ci) => {
        for (let b = 0; b < c.hs * c.vs; b += 1) {
          const s = symbole(dc[c.td]);
          pred[ci] += etendre(lireBits(s), s);
          for (let k = 1; k < 64;) {
            const rs = symbole(ac[c.ta]); const r = rs >> 4; const t = rs & 15;
            if (t === 0) { if (r === 15) { k += 16; continue; } break; }
            k += r + 1; lireBits(t);
          }
          if (ci === 0) { total += 1; if (pred[ci] * quant[c.tq] / 8 + 128 > 235) blancs += 1; }
        }
      });
    }
  }
  return total ? blancs / total : null;
}
