/* ============================================================
   preatorlabs — couche de lecture statistique (additive, v0.4-draft)
   ------------------------------------------------------------
   Ce module N'AJOUTE AUCUNE mesure interprétative. Il ne fait que
   RE-PRÉSENTER les deltas déjà calculés par le moteur d'ablation,
   pour rendre la discrimination lisible. Il respecte les 5 principes :
     - objectif    : arithmétique pure sur des nombres déjà mesurés
     - frugal      : zéro appel API supplémentaire
     - universel   : ne dépend que de results[]
     - lisible     : produit des rangs/z-scores faciles à trier
     - falsifiable : chaque chiffre est recalculable à la main

   Intégration dans web/index.html :
   - appeler enrichResults(results) JUSTE APRÈS runAblation(), avant renderResults()
   - (optionnel) calibrateWithControls(results, {...}) si le run contient des témoins
   - pour le delta signé : appliquer le patch minimal décrit en bas (aggregateSegment)
   ============================================================ */

/* ---------- 1. Normalisation PAR RUN + signal/bruit + axe porteur ---------- */
/* Règle la cause n°1 (tassement) et n°2 (dilution par moyennage) du tour précédent.
   - z / minmax / rank : discrimination RELATIVE au sein d'un même prompt
   - snr               : impact rapporté à sa propre instabilité (séparer signal du bruit)
   - carrier*          : l'axe NON dilué (max des 3 axes) — contourne le moyennage     */

const SNR_FLOOR = 0.05; // empêche un segment à variance ~0 d'avoir un SNR explosif

function enrichResults(results) {
  if (!Array.isArray(results) || results.length === 0) return results;
  const imps = results.map(r => r.impact);
  const mean = imps.reduce((s, v) => s + v, 0) / imps.length;
  const variancePop = imps.reduce((s, v) => s + (v - mean) ** 2, 0) / imps.length;
  const sd = Math.sqrt(variancePop) || 1e-9;
  const mn = Math.min(...imps);
  const rng = (Math.max(...imps) - mn) || 1e-9;

  // rang (1 = impact le plus fort)
  const order = [...results].sort((a, b) => b.impact - a.impact);
  const rankOf = new Map(order.map((r, i) => [r.id, i + 1]));

  results.forEach(r => {
    const axes = [['struct', r.struct], ['behav', r.behav], ['sem', r.sem]];
    const carrier = axes.reduce((m, x) => (x[1] > m[1] ? x : m), ['struct', -1]);
    r.stats = {
      zImpact: (r.impact - mean) / sd,               // > +1 : nettement au-dessus du run
      minmaxImpact: (r.impact - mn) / rng,            // 0 = plancher du run, 1 = sommet
      rankImpact: rankOf.get(r.id),
      snr: r.impact / (r.variance + SNR_FLOOR),       // grand = effet réel et stable
      carrierAxis: carrier[0],                        // axe qui PORTE l'effet
      carrierImpact: carrier[1],                      // impact NON dilué par le moyennage
      runMeanImpact: mean,
      runSdImpact: sd
    };
  });
  return results;
}

/* ---------- 2. Calibration par témoins (échelle absolue) ---------- */
/* Règle le plafond cross-modèle (chantier V0.4). On injecte dans le prompt :
     - un témoin NÉGATIF : segment volontairement inerte (phrase hors-sujet)  -> plancher
     - un témoin POSITIF : instruction massive (« réponds en MAJUSCULES »)      -> plafond
   calibratedImpact ∈ [0,1] situe chaque segment ENTRE le bruit du modèle et sa saturation.
   Sans témoins, ne pas appeler : la normalisation relative (§1) suffit pour comparer
   les segments d'un même prompt. */

function calibrateWithControls(results, { negId, posId } = {}) {
  const neg = results.find(r => r.id === negId);
  const pos = results.find(r => r.id === posId);
  if (!neg || !pos) return results; // pas de témoins : on ne calibre pas
  const floor = neg.impact;
  const ceil = pos.impact;
  const span = (ceil - floor) || 1e-9;
  results.forEach(r => {
    const c = (r.impact - floor) / span;
    r.stats = r.stats || {};
    r.stats.calibratedImpact = c;                    // < 0 ≈ sous le bruit ; ~1 ≈ sature
    r.stats.belowNoiseFloor = r.impact <= floor + 1e-9;
  });
  return results;
}

/* ---------- 3. Lecture de discrimination (remplace la lecture du label brut) ---------- */
/* Sur Haiku, le verdict de couleur ment par compression (cf. note corpus).
   On lit plutôt : axe porteur + position normalisée + stabilité.
   Renvoie une étiquette de DÉCISION, pas un score. */

function discriminationRead(r) {
  const s = r.stats || {};
  const strongAxis = s.carrierImpact >= 0.40;        // un axe sature -> effet franc
  const aboveRun = s.zImpact >= 1.0;                 // nettement au-dessus du prompt
  const stable = s.snr >= 1.8;                       // peu de bruit relatif
  const nearFloor = s.calibratedImpact != null
    ? s.belowNoiseFloor
    : s.minmaxImpact <= 0.10;

  if (strongAxis && stable) return 'porteur-net';            // garder, segment-clé
  if (aboveRun && r.variance >= 0.25) return 'contextuel';   // filet : agit sur certains scénarios
  if (aboveRun) return 'porteur-modéré';                     // compte, mais sans saturer
  if (nearFloor) return 'inerte-candidat-suppression';       // à confirmer par OUTPUTS
  return 'faible-redondance-probable';                       // tester en ablation combinée
}

/* ---------- 4. Delta SIGNÉ — patch minimal de aggregateSegment ---------- */
/* But : savoir si retirer un segment ABAISSE (segment porte) ou AUGMENTE (segment nuit)
   la conformité. Ne marche QUE sur struct/behav (axes de conformité, bornés et orientés).
   L'axe sémantique reste NON signé (distance sans « bon sens »).

   Dans aggregateSegment(), à côté des lignes existantes :
       const structDelta = ...Math.abs(base - abl)...
       const behavDelta  = ...Math.abs(base - abl)...
   AJOUTER (sans rien supprimer) :

       const structSigned = (bScore == null || aScore == null) ? null : (bScore - aScore);
       const behavSigned  = (bBeh   == null || aBeh   == null) ? null : (bBeh   - aBeh);
       // perScenario[j].structSigned = structSigned; behavSigned = behavSigned;

   puis agréger la moyenne signée par segment :
       structSignedMean = meanOrNull(perScenario.map(p => p.structSigned))
       behavSignedMean  = meanOrNull(perScenario.map(p => p.behavSigned))
   et exposer directionOf(...) ci-dessous.

   Convention : signe > 0  => retirer le segment fait CHUTER la conformité => il PORTE.
                signe < 0  => retirer le segment AMÉLIORE la conformité     => il NUIT.   */

function directionOf(structSignedMean, behavSignedMean) {
  const vals = [structSignedMean, behavSignedMean].filter(v => typeof v === 'number');
  if (!vals.length) return 'non-mesurable';           // pas de critère struct/behav configuré
  const net = vals.reduce((s, v) => s + v, 0) / vals.length;
  if (net > 0.10) return 'porte';
  if (net < -0.10) return 'nuit';                      // signal direct pour H3
  return 'neutre';
}

/* Exposition (si modules) */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { enrichResults, calibrateWithControls, discriminationRead, directionOf, SNR_FLOOR };
}
