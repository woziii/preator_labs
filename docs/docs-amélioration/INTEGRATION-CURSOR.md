# Intégration Cursor — preatorlabs (instructions rigoureuses)

Cible : `web/index.html` (script inline unique, **sans module/bundler**). Toute fonction ci-dessous doit être **collée dans le `<script>` existant**, pas importée. Ignorer les `module.exports` en bas des fichiers `.js` (no-op en navigateur).

Deux lots, à traiter séparément. **Lot A = additif, zéro risque** (n'altère aucun chiffre existant). **Lot B = modifie la mesure** (fait enfin déclencher des règles ratées) → à documenter.

Ne rien supprimer d'autre. Conserver les 5 verdicts, la signature de run, la reprise localStorage, la CSP.

---

## LOT A — Couche de lecture (additif, sans risque)

Source : `preatorlabs-metrics.js`. Coller les fonctions `enrichResults`, `calibrateWithControls`, `discriminationRead`, `directionOf`, et la constante `SNR_FLOOR` dans le `<script>`.

### A.1 — Appeler `enrichResults` après l'agrégation
Dans `runAblation(...)`, juste avant `clearRunState(); return results;` :
```js
  enrichResults(results);              // ajoute results[i].stats { zImpact, snr, carrierAxis, carrierImpact, minmaxImpact, rankImpact }
  // si le run contient des témoins (cf. Lot C/protocole) :
  // calibrateWithControls(results, { negId: 'S?', posId: 'S?' });
  clearRunState();
  return results;
```
Aucune autre fonction ne dépend de `stats` : si on n'affiche rien, le comportement est identique à aujourd'hui.

### A.2 — Persister `stats` dans l'export
Dans `buildExportPayload()`, le `.map(d => ({...}))` sur `results` : ajouter une clé `stats`.
```js
    results: data.map(d => ({
      id: d.id, label: d.label, text: d.text,
      impact: d.impact, variance: d.variance,
      struct: d.struct, behav: d.behav, sem: d.sem,
      activation: d.activation, verdict: d.verdict,
      stats: d.stats || null,                 // <-- AJOUT (Lot A)
      direction: d.direction || null,         // <-- AJOUT (Lot B.2, sinon null)
      perScenario: (Array.isArray(d.perScenario) ? d.perScenario : []).map(s => ({
        scenarioId: s.scenarioId, input: s.input,
        baselineOutput: s.baselineOutput, ablatedOutput: s.ablatedOutput,
        axisDelta: s.axisDelta, semanticProvider: s.semanticProvider
      }))
    }))
```
Le dashboard reste compatible (il ignore les clés inconnues).

### A.3 — (Optionnel) Afficher z + axe porteur dans chaque carte segment
Dans `renderResults()`, bloc `seg-card-meta`, ajouter après l'activation :
```js
  // dans le template de carte, après "activation ${...}%"
  ` · z ${ (d.stats?.zImpact ?? 0).toFixed(2) } · porteur ${ d.stats?.carrierAxis ?? '—' } (${ Math.round((d.stats?.carrierImpact ?? 0)*100) }%) · S/N ${ (d.stats?.snr ?? 0).toFixed(1) }`
```
Lecture : **trier les cartes par `stats.rankImpact`** plutôt que par ordre de segment, pour faire remonter les porteurs.

---

## LOT B — Mesure (fait déclencher struct/behav, réduit la domination sémantique)

### B.1 — Remplacer l'auto-extraction structurelle
Source : `preatorlabs-autoextract-fix.js`.
- **Remplacer intégralement** la fonction `detectAutoStructuralRules` par la version du fichier (longueur robuste + prohibitions concrètes). Inclure les helpers `_dedupe`, `_extractQuoted`, `_concreteProhibitions` (ou réutiliser `dedupeStrings`/`extractQuotedStrings` déjà présents en renommant).
- **Ajouter** les deux branches `no_emoji` et `max_lines` dans `evalStructural`, dans la boucle `for (const rule of rules)` (code exact en commentaire §2 du fichier).
- **Ne pas** modifier `detectAutoBehavioralRules`.

Effet attendu : « 200 mots », « 6 mots max », « 15 mots maximum », « pas d'astérisques », « INTERDIT : … listes, emojis, astérisques » déclenchent désormais des règles structurelles. Garde-fou vérifié : « utilise des listes » ne déclenche **pas** `no_list`.

Limite à documenter (ne pas la masquer) : une prohibition abstraite (« pas de superlatifs creux ») reste non mesurable lexicalement → portée par l'axe sémantique. C'est attendu.

### B.2 — Delta signé dans `aggregateSegment`
Donne la direction (le segment porte / nuit), indispensable pour tester « répétition fragilise ».
Dans la boucle `for (let j = 0; j < scenarios.length; j++)`, **après** les lignes `structDelta`/`behavDelta` existantes, AJOUTER (ne rien supprimer) :
```js
    const structSigned = (baselineScores[j].struct.score == null || ablatedStruct.score == null)
      ? null : (baselineScores[j].struct.score - ablatedStruct.score);
    const behavSigned  = (baselineScores[j].behav.score  == null || ablatedBehav.score  == null)
      ? null : (baselineScores[j].behav.score  - ablatedBehav.score);
```
Dans le `perScenario.push({...})` de cette boucle, ajouter `structSigned, behavSigned`.
Après la boucle, à côté de `meanStruct`/`meanBehav` :
```js
    const structSignedMean = meanOrNull(perScenario.map(p => p.structSigned));
    const behavSignedMean  = meanOrNull(perScenario.map(p => p.behavSigned));
```
Dans l'objet `return {...}` du segment, ajouter :
```js
      structSigned: structSignedMean,
      behavSigned: behavSignedMean,
      direction: directionOf(structSignedMean, behavSignedMean),   // 'porte' | 'nuit' | 'neutre' | 'non-mesurable'
```
Convention : signe > 0 ⇒ retirer le segment **abaisse** la conformité ⇒ il **porte**. Signe < 0 ⇒ retirer **améliore** ⇒ il **nuit**.
`impact` reste la valeur absolue inchangée : le signé est une **information en plus**, il ne remplace rien.

---

## Tests d'acceptation (à faire passer avant merge)

Sans clé API (logique pure, exécutable en console ou test offline type `scripts/quality_eval_v03.mjs`) :

1. **Longueur robuste** — `detectAutoStructuralRules(['Garde tes réponses sous 200 mots'])` renvoie une règle `max_words` value=200. Idem pour `['Objet = 6 mots max']` (=6) et `['15 mots maximum']` (=15).
2. **Prohibition concrète** — `detectAutoStructuralRules(['INTERDIT : listes, emojis, astérisques'])` renvoie `no_list`, `no_emoji`, `no_asterisk`.
3. **Garde-fou** — `detectAutoStructuralRules(['Utilise des listes à puces'])` ne renvoie **pas** `no_list`.
4. **Abstrait ignoré** — `detectAutoStructuralRules(['Pas de superlatifs creux'])` renvoie `[]`.
5. **eval no_emoji** — `evalStructural('Salut 🙂', {structuralRules:[{type:'no_emoji',enabled:true}]})` → score 0 ; sur `'Salut'` → score 1.
6. **eval max_lines** — sur un output de 8 lignes avec règle `max_lines` value=6 → score 0 ; 4 lignes → 1.
7. **enrichResults non destructif** — après `enrichResults(results)`, `results[i].impact/variance/verdict` sont **inchangés** ; `results[i].stats.zImpact` existe et la somme des rangs = N(N+1)/2.
8. **directionOf** — `directionOf(0.4, null)` → `'porte'` ; `directionOf(-0.3, null)` → `'nuit'` ; `directionOf(null, null)` → `'non-mesurable'`.
9. **Non-régression export** — un export après Lot A se ré-importe sans erreur dans `dashboard.html`.

---

## Conformité aux 5 principes (à vérifier avant merge)

- **Objectivité** : aucune métrique interprétative ajoutée ; Lot A re-présente des deltas, Lot B applique des regex déterministes traçables (`source:auto`, visibles dans `renderCriteriaPreview`).
- **Frugalité** : zéro appel API supplémentaire dans les deux lots.
- **Universalité** : aucune dépendance modèle-spécifique.
- **Lisibilité** : z-score + axe porteur rendent le rapport plus lisible, pas moins.
- **Falsifiabilité** : le delta signé et les règles structurelles sont vérifiables par inspection directe des outputs.

Documenter le Lot B dans `02-METHODOLOGY.md` (§ auto-extraction) et la note `07-CORPUS-FINDINGS.md` comme justification.
