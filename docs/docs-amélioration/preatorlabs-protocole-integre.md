# PreatorLabs — Protocole de test intégré (v3)

Ce document consolide et remplace `protocole-tests-preatorlabs.md` et `preatorlabs-axe-recherche.md`. Il ajoute la couche qui manquait : **comment rendre les statistiques discriminantes** et **comment les lire avec les outputs**.

Rappel des deux causes mécaniques du manque de discrimination (mesurées sur le corpus) :
1. **Tassement** : quand seul l'axe sémantique parle (pas de critères configurés), tout s'écrase dans une bande étroite (étendue 0,027 sur le prompt « expert mondial »).
2. **Dilution** : `impact` = moyenne des axes actifs, ce qui abaisse l'axe dominant de 50-61 %. Les seuils `high`/`critical` (0,40/0,50) deviennent inatteignables.

---

## Partie 0 — Couche de lecture (à appliquer à CHAQUE run)

### 0.1 Prérequis non négociable : allumer les axes
Configurer des critères **structurels** et **comportementaux** sur chaque run. Une règle binaire (respectée/pas → 0↔1) discrimine proprement ; le cosinus seul vit dans un milieu mou et tasse tout. Sans critères, l'analyse retombe en « Méthode D » (sémantique seule), que ta propre rationale §3 qualifie d'insuffisante.

### 0.2 Quatre indicateurs à lire (code : `preatorlabs-metrics.js`)
Pour chaque segment, ne plus lire le label de couleur seul, mais :

| Indicateur | Définition | Ce qu'il révèle |
|---|---|---|
| `zImpact` | écart à la moyenne du run, en σ | position **relative dans CE prompt** (z ≥ +1 = nettement au-dessus) |
| `snr` | impact / (variance + 0,05) | signal **réel et stable** vs bruit ponctuel |
| `carrierAxis` / `carrierImpact` | l'axe max, **non dilué** | contourne le moyennage ; dit *où* le segment agit |
| `calibratedImpact` | (impact − plancher) / (plafond − plancher) via témoins | échelle **absolue**, comparable entre modèles |

Règle de décision (fonction `discriminationRead`) : `porteur-net` (axe ≥ 0,40 **et** snr ≥ 1,8) → garder ; `contextuel` (z ≥ 1 **et** variance ≥ 0,25) → filet ; `inerte` (sous plancher/minmax ≤ 0,10) → candidat suppression, **à confirmer par outputs**.

### 0.3 Fiabilité du chiffre
n=3 répétitions par ablation (déjà roadmap V2), médiane retenue. Sinon les petits écarts ne sont pas dignes de confiance même à T=0.

### 0.4 Direction (delta signé)
Sur struct/behav uniquement (`directionOf`) : `porte` (retirer abaisse la conformité), `nuit` (retirer l'améliore → signal direct pour H3), `neutre`. L'axe sémantique reste non signé.

---

## Partie 1 — Le protocole en deux temps (stats + outputs)

Tes outputs sont visualisables : c'est la **couche de confirmation**, et c'est elle qui remplace tout besoin de LLM-juge (tu es le juge, en lisant les paires).

1. **LOCALISER (stats)** : la couche 0 classe les segments. Tu ne retiens que les extrêmes — les 2-3 `porteur-net`/`contextuel` en haut, et les `inerte` en bas.
2. **CONFIRMER (outputs)** : tu n'ouvres les paires baseline/ablé QUE pour cette poignée. Un `inerte` se confirme si baseline ≈ ablé sur tous les scénarios ; un `contextuel` se confirme si le segment change nettement l'output du seul scénario qui le déclenche. C'est exactement ta procédure de falsifiabilité (Méthodologie § Falsifiabilité).

Les stats répondent à *quels segments regarder* ; les outputs répondent à *avais-je raison*. Tu ne lis jamais 73 outputs, seulement ~10.

---

## Partie 2 — Familles de tests à ajouter

### 2.1 Témoins d'échelle (à faire EN PREMIER, une fois)
- **Témoin négatif** : segment hors-sujet inerte → mesure le plancher de bruit du modèle.
- **Témoin positif** : « réponds en MAJUSCULES » → mesure le plafond.
- Usage : `calibrateWithControls()` + recalage des seuils. Règle ton chantier de calibration cross-modèle par la mesure.

### 2.2 Opérateur de substitution (iso-contenu)
Ton outil retire ; il ne remplace pas. Deux variantes d'un segment, même contenu, formulation différente → compare les deux outputs (pas complet vs ablé). Indispensable pour H1, H4, H7 (comparaisons de formulation).

### 2.3 Gradient dose-réponse
Faire varier une dimension par paliers, reste constant. Distance au défaut (H5 : aligné→absurde) ; répétition (H3 : 1×/2×/3×). Une courbe monotone est une preuve, un point isolé non.

### 2.4 Ablation combinatoire ciblée (pas Shapley)
Quelques coalitions choisies à la main : rôle+tâche ensemble (H2), toutes les copies d'une contrainte répétée ensemble (H3). Lève la confusion « ignoré vs redondant » (ta Limite 2).

### 2.5 Scénarios adverses
Tes scénarios sont coopératifs : ils ne déclenchent jamais les garde-fous → faux `placebo`. Ajoute des cas qui *tentent* la faute. Un `inerte` n'est supprimable que s'il le reste sur scénarios adverses.

---

## Partie 3 — Mapping : confirmer / infirmer chaque hypothèse

| Hyp. | Opérateur | Indicateur décisif | VRAIE si | RÉFUTÉE si |
|---|---|---|---|---|
| **H1** métaphore inerte | substitution | méta-narration (regex struct) + Δsigné sém | méta-narration > 0 et aucun gain | version métaphore meilleure |
| **H2** rôle = placebo | coalition rôle+tâche, avec/sans few-shot | Δsigné conformité (coop + adverses) | Δ≈0 partout | Δ>0 sans rôle (corpus : « expert mondial » S1 = plancher → appuie H2) |
| **H3** répétition fragilise | gradient 1×/2×/3× + coalition | `directionOf` = `nuit` ou variance ↑ | conformité ↓ ou variance ↑ | plate / ↑ |
| **H4** adjectif > description | substitution + paraphrase | décalage par token + variance | adjectif ≥ description en effet/token | description ≥ |
| **H5** distance au défaut | gradient aligné→absurde + témoins | `calibratedImpact` = f(distance) | courbe monotone ; aligné ≈ plancher | non-monotone |
| **H6** partir du résultat | méta-expérience (hors instrument) | conformité agrégée 2 prompts | outcome-first domine /token | pas d'écart |
| **H7** négatif=fond / positif=forme | substitution 2×2 + adverses | violations (behav) / conformité format (struct) | interdits ↓ fond ; chiffré ↑ forme | inversé |

H6 reste hors instrument : c'est une hypothèse sur ta méthode d'écriture, pas sur le modèle.

---

## Partie 4 — Branchement sur tes deux workflows

**Workflow A — plusieurs prompts, mêmes scénarios** (comparaison entre prompts). Unité = score de conformité de chaque prompt, scénario par scénario. Compare les distributions. Le dashboard (vue « familles de versions », Jaccard ≥ 0,5) est fait pour ça. Lis le `calibratedImpact` agrégé, pas le label.

**Workflow B — retirer des segments et relancer** (ablation combinatoire manuelle). La normalisation par run + le delta signé rendent les itérations comparables. Surveille la **redistribution** : tes deux variantes Reachy ont montré qu'un même contenu reformulé change les verdicts (un verdict mono-ablation n'est pas intrinsèque).

---

## Partie 5 — Valider le gain en tokens (ton objectif central)

Identifier les placebo et les segments porteurs n'est qu'une moitié du but. L'autre moitié — « un prompt réduit donne-t-il un output équivalent ou meilleur ? » — est une comparaison **entre deux prompts**, pas une ablation. Procédure :

1. **Localiser** les candidats à la suppression : segments classés `inerte` par `discriminationRead` (sous le témoin négatif, ou minmax ≤ 0,10), sur scénarios coopératifs **et** adverses.
2. **Confirmer par outputs** que chacun est bien inerte (baseline ≈ ablé partout). Ne retenir que ceux-là.
3. **Construire le prompt réduit** en retirant uniquement ces segments confirmés. Mesurer le gain : `tokens(complet) − tokens(réduit)`.
4. **Comparer complet vs réduit** sur le même jeu de scénarios (coopératifs + adverses), n=3, sur :
   - conformité struct/behav (delta **signé** : le réduit est-il ≥ au complet ?),
   - et lecture des outputs sur les scénarios où la conformité bouge.
5. **Conclure** :
   - réduit ≥ complet en conformité → **équivalent ou meilleur** : gain de tokens validé.
   - réduit < complet sur ≥ 1 scénario (souvent adverse) → un « inerte » était un filet ; le remettre.

Critère d'acceptation : tokens ↓ significativement **et** aucune conformité signée du réduit inférieure au complet sur l'ensemble des scénarios. C'est la démonstration rigoureuse de « −X % de tokens à qualité égale ».

Garde l'œil sur la **redistribution** : une fois des segments retirés, relance une ablation sur le prompt réduit — les impacts des segments restants changent (cf. variantes Reachy). Un second tour peut révéler de nouveaux placebo (ou de nouveaux porteurs).

## Ordre d'exécution

1. Brancher `enrichResults()` (lecture par axe + z + snr) — change le sens de tes résultats existants, zéro nouveau run.
2. Faire le run de **témoins** une fois par modèle → calibrer.
3. Configurer des critères struct/behav par défaut sur chaque run (prérequis 0.1).
4. H5 en gradient (preuve la plus rapide), puis H2 en coalition avec/sans few-shot.
5. Delta signé + H3 en gradient.
6. H1/H4/H7 via substitution.
7. n=3 pour tout ce que tu veux publier.
