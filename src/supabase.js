/*
 * supabase.js — en-têtes d'accès à l'API REST de Supabase.
 * Deux formes de clé existent : l'ancienne `service_role` (un jeton JWT « eyJ… ») et la nouvelle clé secrète « sb_secret_… ».
 * La nouvelle n'est PAS un JWT : elle va dans `apikey` seulement ; l'ancienne va dans `apikey` ET `Authorization`.
 */
export function entetesSupabase(cle, extra = {}) {
  const base = /^sb_/.test(cle) ? { apikey: cle } : { apikey: cle, authorization: `Bearer ${cle}` };
  return { ...base, ...extra };
}
