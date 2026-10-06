/*
 * Diagnostic d'une saga : combien de tomes rendus contre annoncés, positions manquantes, tomes indisponibles (x).
 *   node --env-file=<.env avec APP_KEY ou VITE_VAULT_API_KEY> scripts/diag-saga.mjs "dune" "naruto" "dune@en"   (@en = langue)
 * Lecture seule, appels espacés.
 */
const cle=(process.env.APP_KEY||process.env.VITE_VAULT_API_KEY||'').trim();
const base='https://vault-books-api.vercel.app';
const get=async(p)=>{const r=await fetch(base+p,{headers:{'x-app-key':cle}});await new Promise(s=>setTimeout(s,1800));return r.ok?r.json():{erreur:r.status}};
const lst=process.argv.slice(2);
for(const spec of lst){const [q,lang='fr']=spec.split('@');
 const s=await get(`/v1/search?q=${encodeURIComponent(q)}&lang=${lang}`);const c=s.resultats?.find(x=>x.type==='serie');
 if(!c){console.log('##',q,'aucune saga');continue}
 const d=await get(`/v1/series/${c.id}?lang=${lang}`);
 if(d.erreur){console.log('##',q,'ERREUR',d.erreur);continue}
 const pos=d.tomes.map(t=>t.position);const manque=[];for(let i=1;i<=Math.max(...pos,0);i++)if(!pos.includes(i))manque.push(i);
 console.log(`## ${q} → ${c.titre} (id ${c.id}) tomes ${d.tomes.length}/${d.totalPrincipal} dispo ${d.disponibles} horsSerie ${d.horsSerie?.length||0} manque:[${manque.slice(0,25)}]`);
 if(d.tomes.length<=20) console.log(d.tomes.map(t=>`${t.position}${t.disponible?'':'(x)'}:${t.titre}`).join(' | '));
 else console.log('  premiers:',d.tomes.slice(0,4).map(t=>`${t.position}:${t.titre}`).join(' | '),' dernier:',d.tomes.at(-1).position+':'+d.tomes.at(-1).titre);
 if(d.horsSerie?.length) console.log('  horsSerie:',d.horsSerie.slice(0,6).map(t=>`${t.position}:${t.titre}`).join(' | '));
}
