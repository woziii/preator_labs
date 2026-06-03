# 02 — Méthodologie

> Le workflow scientifique de preatorlabs, étape par étape, des inputs au verdict.

## Vue d'ensemble

```
Prompt brut
    │
    ▼
[1] Segmentation automatique
    │
    ▼
[2] Configuration des scénarios + règles (manual + auto)
    │
    ▼
[3] Génération baseline (T=0)
    │
    ▼
[4] Boucle d'ablation (N × M appels)
    │
    ▼
[5] Calcul des deltas par axe
    │
    ▼
[6] Agrégation : axes actifs + impact + variance + activation
    │
    ▼
[7] Classification : verdict par segment
    │
    ▼
[8] Restitution visuelle
```

## [1] Segmentation

### Objectif

Découper le prompt brut en unités logiques cohérentes, suffisamment granulaires pour permettre l'attribution d'un effet, mais pas au point de produire du bruit (un segment d'un seul mot n'a pas d'effet mesurable).

### Algorithme V1 (heuristique)

```
def auto_segment(text):
    # Étape A : split sur double saut de ligne (paragraphes)
    blocks = split(text, /\n\s*\n+/)
    
    # Étape B : détection des titres MAJUSCULES en ligne seule
    # Un titre devient le début d'un nouveau segment
    refined = []
    for block in blocks:
        for line in block.split('\n'):
            if is_title(line):  # majuscules, 3-80 chars
                refined.append(current); current = [line]
            else:
                current.append(line)
        refined.append(current)
    
    # Étape C : fusion des fragments trop courts avec leur voisin
    return merge_short(refined, min_chars=20)
```

### Algorithme V2 (envisagé)

Segmentation par embedding-clustering : on découpe phrase par phrase, on embedde, et on regroupe les phrases sémantiquement adjacentes. Plus robuste sur des prompts mal formatés. Hors-scope V1.

### Contrôle utilisateur

La segmentation automatique est **proposée, pas imposée**. L'utilisateur voit le découpage et peut éditer chaque segment, en fusionner, en supprimer. Le contrat : preatorlabs propose un découpage raisonnable, l'utilisateur reste maître de la granularité finale.

## [2] Configuration

### Scénarios de test (M)

Inputs utilisateur typiques. Recommandation : **5 à 8 scénarios** couvrant les principaux cas d'usage du prompt. Trop peu → la variance est mal estimée. Trop → coût qui explose sans gain proportionnel.

### Règles des 3 axes

**Structurel** — règles vérifiables et traçables :
- longueur ≤ N mots **ou** ≤ N lignes
- absence de caractère/pattern (ex. `*`, listes Markdown, emoji)
- présence de structure attendue (JSON valide, clés requises)
- présence d'une phrase imposée (`termine par "..."`)
- seuil numérique extrait du prompt (`pas plus de 20€`)

#### Auto-extraction robuste (V0.4, Lot B)

L'auto-extraction structurelle a été durcie pour cesser de rater des contraintes pourtant explicites :

- **Longueur** : le nombre est désormais détecté quel que soit l'ordre des mots dans la ligne, dès qu'un mot limitant est présent (`max`, `maximum`, `sous`, `pas plus de`, `au plus`, `jusqu'à`, `n'excède`, `moins de`, `≤`, `<=`). Ainsi `« Garde tes réponses sous 200 mots »`, `« 6 mots max »` ou `« 15 mots maximum »` produisent une règle `max_words`. La même logique vaut pour les lignes (`max_lines`).
- **Prohibitions concrètes** : une formulation prohibitive (`interdit`, `jamais`, `évite`, `pas de`, `sans`, `aucun`, `ne pas`, …) portant sur un objet mesurable génère une règle checkable : `no_asterisk`, `no_list`, `no_emoji`. Garde-fou : une formulation **non** prohibitive ne déclenche rien (`« Utilise des listes à puces »` ne crée pas `no_list`).

**Changement de mesure assumé** : ce durcissement fait désormais déclencher des règles structurelles/comportementales qui passaient inaperçues. Conséquence directe : sur certains runs, les scores struct/behav (et donc l'impact agrégé et les verdicts) peuvent changer par rapport aux versions antérieures. C'est l'effet recherché — réduire la domination de l'axe sémantique — et non une régression.

**Limite assumée** : une prohibition **abstraite** (`« pas de superlatifs creux »`, `« reste non culpabilisant »`) n'est pas mesurable par matching lexical ; elle reste portée par l'axe sémantique. Seules les contraintes concrètes (astérisques, listes, emoji, phrases exactes, longueur) deviennent structurelles.

**Contrat utilisateur préservé** : les règles auto-extraites restent **proposées, pas imposées**. Elles sont visibles et éditables dans l'aperçu des critères (`renderCriteriaPreview`) avant le lancement.

**Comportemental** — détection lexicale :
- termes interdits (liste de strings)
- termes attendus (liste de strings)
- patterns regex métier
- tutoiement/vouvoiement explicitement demandé

**Sémantique** — distance cosinus :
- mode `tfidf_local` (gratuit) : comparaison directe output-complet vs output-ablé
- mode `voyage_api` (payant, optionnel) : embeddings Voyage + cosinus

## [3] Génération baseline

Pour chaque scénario `Tj` (1 ≤ j ≤ M), on génère l'output **avec le prompt complet** :

```
O(complet, Tj) = LLM(system=prompt_complet, user=Tj, temperature=0)
```

C'est l'output de référence. Sa conformité aux 3 axes définit le score baseline `B(Tj) ∈ [0, 1]^3`.

## [4] Boucle d'ablation

Pour chaque segment `Si` (1 ≤ i ≤ N) et chaque scénario `Tj` :

```
prompt_sans_Si = concatenate(segments \ {Si})
O(¬Si, Tj) = LLM(system=prompt_sans_Si, user=Tj, temperature=0)
```

Coût total : `N × M + M` appels API.

Exemple : 12 segments × 6 scénarios = 78 appels.

## [5] Calcul des deltas par axe

Pour chaque triplet (segment Si, scénario Tj, axe a ∈ {struct, behav, sem}) :

```
delta(i, j, a) = |score_a(O(complet, Tj)) - score_a(O(¬Si, Tj))|
```

Un delta nul signifie qu'il n'avait pas d'effet. Quand un axe n'est pas calculable sur un scénario, il est marqué **non applicable** (et exclu de l'agrégation de ce scénario).

### Détail par axe

**Axe structurel — boolean diff :**
```
score_struct(output) = sum(criterion(output) for criterion in struct_criteria) / num_criteria
```

**Axe comportemental — proportion de règles respectées :**
```
score_behav(output) = matched_behav(output) / total_behav(output)
# si total_behav = 0 → non applicable
```

**Axe sémantique — cosinus :**
```
score_sem(output, baseline) = cosine_similarity(embed(output), embed(baseline))
```
En mode B : `score_sem` est calculé sur la *différence* entre output complet et ablé. L'impact est donc `1 - cos(O_complet, O_¬Si)`.

## [6] Agrégation

Pour chaque segment Si :

```
impact(i, j) = moyenne des deltas sur axes applicables uniquement
impact_total(i) = mean_j(impact(i, j))
variance(i) = std_j(impact(i, j))
activation(i) = ratio_j(impact(i, j) >= seuil)
```

La V0.3 évite la dilution par axes dormants : pas de moyenne fixe sur 3 axes quand un axe est non applicable.

### Couche de lecture (z, S/N, axe porteur, direction) — V0.4, Lot A

Une couche **purement additive** re-présente les deltas déjà calculés pour rendre la discrimination lisible. Elle ne produit **aucune nouvelle mesure** : chaque chiffre est recalculable à la main (falsifiable), et n'altère ni `impact`, ni `variance`, ni le `verdict`. Elle est calculée par `enrichResults(results)` (champ `results[i].stats`) après l'agrégation.

| Indicateur | Définition | Lecture | Piège à éviter |
|---|---|---|---|
| `zImpact` (z) | écart à la moyenne du run, en σ | `z ≥ +1` = nettement au-dessus des autres segments **de ce prompt** | **relatif au run** : non comparable entre deux prompts différents |
| `carrierAxis` / `carrierImpact` (axe porteur) | l'axe (struct/behav/sém) le plus fort, **non dilué** par la moyenne | dit *où* le segment agit | un fort porteur sémantique peut n'être qu'une reformulation → confirmer par outputs |
| `snr` (S/N) | impact / (variance + 0,05) | grand = effet réel et **stable** | un S/N faible ≠ « inutile », mais « instable / dépend du scénario » |
| `rankImpact` | rang de l'impact (1 = le plus fort) | trier les segments à regarder en priorité | un rang n'est qu'un ordre relatif, pas une amplitude |

**Direction (delta signé)** — `directionOf(structSignedMean, behavSignedMean)` exploite que les axes structurel et comportemental sont **bornés et orientés** (l'axe sémantique, distance sans « bon sens », reste non signé). Convention :

- signe **> 0** ⇒ retirer le segment **abaisse** la conformité ⇒ il `porte` ;
- signe **< 0** ⇒ retirer le segment **améliore** la conformité ⇒ il `nuit` (signal direct) ;
- proche de 0 ⇒ `neutre` ;
- aucun critère struct/behav configuré ⇒ `non-mesurable` (à ne pas confondre avec `neutre`).

`impact` reste la **valeur absolue** inchangée : le signé est une information **en plus**, il ne remplace rien.

**Règle d'usage** : ces indicateurs servent à **localiser** quels segments inspecter ; toute décision (notamment une suppression) doit être **confirmée par la lecture des outputs** baseline vs ablé. L'affichage de cette couche dans l'interface est **optionnel et désactivé par défaut**, derrière un encart explicatif, pour éviter toute sur-interprétation.

## [7] Classification : verdict par segment (5 niveaux, V0.3)

Ordre d'évaluation dans `classifyVerdict(impact, variance, activationRate)` :

| Verdict | Condition (résumé) | Interprétation |
|---|---|---|
| **placebo** | impact &lt; 0.10 | Pas pris en compte par le LLM |
| **critical** | impact/activation forts + variance faible | Fondamental, actif partout |
| **high** | impact solide + activation suffisante + variance contenue | Important, modifier avec prudence |
| **context** | impact ≥ 0.15 **et** (variance ≥ 0.25 **ou** activation &lt; 0.50) | Filet ponctuel ou activation partielle |
| **low** | impact &lt; 0.20, stable | Faible impact, vérifier redondances |

Le verdict **modéré** (`mid`) a été retiré : les cas à impact modéré mais variance haute ou activation partielle sont classés **contextuel**.

Constante alignée code : `AXIS_ACTIVE_THRESHOLD = 0.30` pour le calcul d'activation.

### Protocole d'interprétation

1. **Impact moyen fiable** quand variance basse et activation ≥ 50 % → `critical` / `high` / `low` selon l'amplitude.
2. **Variance ou activation prioritaires** quand l'impact moyen est trompeur :
   - *Disclaimer médical* : fin imposée → axe structurel actif sur peu de scénarios → `context` malgré impact moyen modeste.
   - *Segment prix* : règle seuil € → activation partielle selon scénarios → `context`.
   - *Segment public jeune* : sans marqueurs manuels, axes souvent non applicables ; ajouter termes attendus/interdits pour mesurer.
3. **Ne pas supprimer** un segment `context` sur la seule base d'un impact moyen bas.

Ces seuils sont des **heuristiques par défaut**, calibrées empiriquement (prompt Reachy). Réévaluation cross-modèles prévue en V0.4.

## [8] Restitution visuelle

Trois éléments :

1. **Graphique de variance** : barres par segment, hauteur = impact moyen, trait vertical = ±variance, couleur = verdict.
2. **Cartes 3-axes** : pour chaque segment, décomposition impact structurel / comportemental / sémantique + verdict + phrase explicative.
3. **Synthèse globale** : trois listes — à conserver, à surveiller, candidats à la suppression.
4. **Drill-down outputs (V0.2)** : dans chaque carte segment, panneau repliable affichant, scénario par scénario, le comparatif `baseline` vs `output ablé` (segment retiré) avec rappel des deltas d'axes. Le panneau est masqué par défaut et rendu à la demande (lazy render) pour préserver les performances et la lisibilité mobile.

## Reproductibilité

Une analyse preatorlabs est **reproductible** si :
- même prompt (segmentation incluse)
- mêmes scénarios
- même LLM et même version
- T=0

Le déterminisme résiduel des LLMs à T=0 (négligeable sur Claude) peut être absorbé par n=3 répétitions en V2.

## Falsifiabilité

Un verdict preatorlabs est **falsifiable** par test indépendant. Pour falsifier un verdict "placebo" sur un segment S :
1. Construire deux prompts : `P_avec_S` et `P_sans_S`.
2. Comparer manuellement les outputs sur les M scénarios.
3. Si une différence systématique et conforme à l'intention de S est observée, le verdict est faux.

Cette propriété est non triviale : elle distingue preatorlabs d'un score opaque produit par un LLM-juge.
