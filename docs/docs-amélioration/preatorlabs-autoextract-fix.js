/* ============================================================
   preatorlabs — correctif d'auto-extraction (CHANGE LA MESURE)
   ------------------------------------------------------------
   ⚠ Contrairement à preatorlabs-metrics.js (purement additif), CE fichier
   MODIFIE les scores struct/behav : il fait enfin déclencher des règles que
   l'auto-extraction actuelle rate. C'est l'effet voulu (réduire la domination
   sémantique), mais c'est un changement de mesure -> à documenter dans
   02-METHODOLOGY.md, et les règles détectées DOIVENT rester visibles/éditables
   dans renderCriteriaPreview() (contrat utilisateur : auto = proposé, pas imposé).

   Cause corrigée (vérifiée) : la regex de longueur exigeait le mot-clé AVANT le
   nombre (" max 6 mots ") et les interdits exigeaient des guillemets. Résultat :
   "200 mots", "6 mots max", "15 mots maximum", "pas d'astérisques" -> tous ratés.

   Reste une LIMITE INHÉRENTE (ne pas la masquer) : une prohibition ABSTRAITE
   ("pas de superlatifs creux", "pas culpabilisant") n'est pas mesurable par
   matching lexical -> elle restera portée par l'axe sémantique. Seules les
   prohibitions CONCRÈTES (astérisques, listes, emojis, phrases exactes) et les
   contraintes de longueur deviennent structurelles.
   ============================================================ */

/* ---------- helpers (réutilise les tiens s'ils existent déjà) ---------- */
function _dedupe(a){ return [...new Set((a||[]).map(s=>String(s).trim()).filter(Boolean))]; }
function _extractQuoted(t){ const o=[]; const re=/["“](.*?)["”]/g; let m; while((m=re.exec(t))!==null){ if(m[1].trim()) o.push(m[1].trim()); } return o; }
function _concreteProhibitions(lowerLine){
  const out=[];
  const prohibitive=/(interdit|jamais|évite|evite|pas d|sans |aucun|proscri|bannir|ne pas)/i.test(lowerLine);
  if(!prohibitive) return out;                 // garde-fou : "utilise des listes" ne déclenche rien
  if(/ast[ée]risque/i.test(lowerLine)) out.push('no_asterisk');
  if(/(liste|puce)/i.test(lowerLine))  out.push('no_list');
  if(/emoji/i.test(lowerLine))         out.push('no_emoji');
  return out;
}

/* ============================================================
   1) REMPLACER intégralement detectAutoStructuralRules(segments)
   ============================================================ */
function detectAutoStructuralRules(segments){
  const rules=[];
  const joined=(segments||[]).join('\n');
  const lines=joined.split('\n').map(s=>s.trim()).filter(Boolean);
  const endings=[], contains=[];

  for(const line of lines){
    const lower=line.toLowerCase();
    const q=_extractQuoted(line);
    if(q.length && /(termine|conclus|fini|finish|end)/i.test(lower)) endings.push(...q);
    if(q.length && /(inclus|contient|include|mentionne|ajoute)/i.test(lower)) contains.push(...q);

    // LONGUEUR — nombre + unité avec un mot limitant N'IMPORTE OÙ dans la ligne (ordre libre)
    const hasLimit=/(max\b|maximum|sous |pas plus de|au plus|n['’]exc[eè]de|moins de|≤|<=)/i.test(lower);
    if(hasLimit){
      const w=lower.match(/(\d+)\s*mots?/);
      if(w) rules.push({axis:'struct',source:'auto',type:'max_words',value:parseInt(w[1],10),label:`Longueur max ${w[1]} mots`,enabled:true});
      const l=lower.match(/(\d+)\s*lignes?/);
      if(l) rules.push({axis:'struct',source:'auto',type:'max_lines',value:parseInt(l[1],10),label:`Longueur max ${l[1]} lignes`,enabled:true});
    }

    // PROHIBITIONS CONCRÈTES -> règles structurelles checkables
    for(const t of _concreteProhibitions(lower)){
      const label = t==='no_asterisk' ? "Pas d'astérisques" : t==='no_list' ? 'Pas de listes' : "Pas d'emoji";
      rules.push({axis:'struct',source:'auto',type:t,label,enabled:true});
    }
  }

  for(const p of _dedupe(endings))  rules.push({axis:'struct',source:'auto',type:'must_end_with',phrase:p,label:`Fin imposée: "${p}"`,enabled:true});
  for(const p of _dedupe(contains)) rules.push({axis:'struct',source:'auto',type:'must_contain',phrase:p,label:`Contenu imposé: "${p}"`,enabled:true});
  if(/(json|format json|réponse json)/i.test(joined)) rules.push({axis:'struct',source:'auto',type:'json_valid',label:'JSON valide attendu',enabled:true});

  // seuil prix (inchangé)
  const eurCap=joined.match(/(?:jamais|ne\s+.*pas).*?(?:plus de|sup[ée]rieur [àa])\s*(\d+(?:[.,]\d+)?)\s*(?:€|euros?)/i);
  if(eurCap) rules.push({axis:'struct',source:'auto',type:'max_eur',value:parseFloat(eurCap[1].replace(',','.')),label:`Seuil prix <= ${eurCap[1]}€`,enabled:true});

  // dédoublonnage (type + phrase/valeur)
  const seen=new Set();
  return rules.filter(r=>{ const k=r.type+'|'+(r.phrase||r.value||''); if(seen.has(k)) return false; seen.add(k); return true; });
}

/* ============================================================
   2) AJOUTER deux branches dans evalStructural(output, criteria)
      (à insérer DANS la boucle `for (const rule of rules)`, à côté des autres `if`)
   ============================================================ */
/*
    if (rule.type === 'no_emoji') {
      total++;
      const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{1F1E6}-\u{1F1FF}]/u;
      if (!EMOJI.test(output)) matched++;
      continue;
    }
    if (rule.type === 'max_lines') {
      total++;
      const lineCount = output.split('\n').map(s => s.trim()).filter(Boolean).length;
      if (lineCount <= rule.value) matched++;
      continue;
    }
*/

/* ============================================================
   3) (NE PAS toucher detectAutoBehavioralRules)
   Les prohibitions ABSTRAITES ne sont pas mesurables lexicalement. Pour les
   "tells" concrets fréquents ("en tant qu'IA", "je me permets", "super question"),
   recommander à l'utilisateur de les saisir dans le champ "Termes interdits"
   (manuel) plutôt que de les deviner (resterait subjectif -> viole le principe).
   ============================================================ */

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { detectAutoStructuralRules };
}
