/*
 * Corriger une saga ou une couverture, en une commande. Les corrections gagnent TOUJOURS sur Hardcover et sont visibles dans les 5 minutes.
 *
 *   npm run corriger -- lister
 *   npm run corriger -- serie 1130 --nom-fr "Le Seigneur des anneaux" --nom-en "The Lord of the Rings" --fusionner 87481,87482 --exclure 1.5
 *   npm run corriger -- serie 981 --note "Hardcover y mélange coffrets et volumes coupés"       (ne change QUE ce qui est donné)
 *   npm run corriger -- serie-supprimer 981
 *   npm run corriger -- couverture isbn:9782749910147 https://exemple.org/image.jpg
 *   npm run corriger -- couverture serie:25608:3 https://exemple.org/image.jpg --note "tome 3, bonne édition"
 *   npm run corriger -- couverture-supprimer isbn:9782749910147
 *
 * Utilise SUPABASE_URL et SUPABASE_SERVICE_KEY de .env (jamais affichés).
 */
import { lireConfig } from '../src/config.js';
import { analyser, creerCorrections } from '../src/corrections.js';

const cfg = lireConfig();
if (!cfg.supabaseUrl || !cfg.supabaseKey) { console.error('SUPABASE_URL et SUPABASE_SERVICE_KEY doivent être dans .env'); process.exit(1); }
const c = creerCorrections({ url: cfg.supabaseUrl, cle: cfg.supabaseKey });

const AIDE = `Commandes : lister | serie <id> [--nom-fr ..] [--nom-en ..] [--fusionner a,b] [--exclure 1.5] [--note ..] | serie-supprimer <id>
            | couverture <isbn:978… | serie:id:position> <url https> [--note ..] | couverture-supprimer <clé>`;

try {
  const { positionnels: [commande, a, b], options } = analyser(process.argv.slice(2));

  if (commande === 'lister') {
    const { series, couvertures } = await c.lister();
    console.log(`\n${series.length} série(s) corrigée(s) :`);
    series.forEach((s) => console.log(`  #${s.series_id}  fr « ${s.name_fr || '—'} »  en « ${s.name_en || '—'} »  fusionner [${s.merge_ids}]  exclure [${s.exclude_positions}]${s.note ? `  — ${s.note}` : ''}`));
    console.log(`\n${couvertures.length} couverture(s) corrigée(s) :`);
    couvertures.forEach((x) => console.log(`  ${x.key}  →  ${x.url}${x.note ? `  — ${x.note}` : ''}`));
  } else if (commande === 'serie' && a) {
    const r = await c.enregistrerSerie(a, options);
    console.log(`Série #${r.ligne.series_id} enregistrée (fr « ${r.ligne.name_fr || '—'} », fusionner [${r.ligne.merge_ids}], exclure [${r.ligne.exclude_positions}]). ${r.invalidees} réponse(s) du cache invalidée(s).`);
  } else if (commande === 'serie-supprimer' && a) {
    const r = await c.supprimerSerie(a);
    console.log(`Correction de la série #${a} supprimée. ${r.invalidees} réponse(s) du cache invalidée(s).`);
  } else if (commande === 'couverture' && a && b) {
    const r = await c.enregistrerCouverture(a, b, options.note || null);
    console.log(`Couverture ${a} enregistrée (image ${r.image.dim.l}×${r.image.dim.h}, ${r.image.octets} octets). ${r.invalidees} réponse(s) du cache invalidée(s).`);
  } else if (commande === 'couverture-supprimer' && a) {
    const r = await c.supprimerCouverture(a);
    console.log(`Correction de couverture ${a} supprimée. ${r.invalidees} réponse(s) du cache invalidée(s).`);
  } else {
    console.log(AIDE);
    process.exit(commande ? 1 : 0);
  }
  if (commande !== 'lister') console.log('Visible en ligne dans les 5 minutes (le service relit ses corrections toutes les 5 minutes).');
} catch (e) {
  console.error(`Erreur : ${e.message}`);
  process.exit(1);
}
