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
- longueur ≤ N mots
- absence de caractère/pattern (ex. `*`, listes Markdown)
- présence de structure attendue (JSON valide, clés requises)
- présence d'une phrase imposée (`termine par "..."`)
- seuil numérique extrait du prompt (`pas plus de 20€`)

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

**Axe comportemental — lexical diff :**
```
score_behav(output) = (1 - presence_of_forbidden) * presence_of_required
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

## [7] Classification : verdict par segment

Le verdict est attribué selon les seuils suivants :

| Verdict | Condition | Interprétation |
|---|---|---|
| **critical** | impact ≥ 0.60 et variance < 0.15 | À conserver sans modification |
| **high** | impact ≥ 0.45 et variance < 0.20 | Important, modifier avec prudence |
| **context** | variance ≥ 0.25 | Filet de sécurité ponctuel |
| **mid** | 0.20 ≤ impact < 0.45 | Effet modéré, à affiner |
| **low** | 0.10 ≤ impact < 0.20 | Faible impact, vérifier redondances |
| **placebo** | impact < 0.10 | Pas pris en compte par le LLM |

Ces seuils sont les **valeurs par défaut V1**. Ils ont été calibrés empiriquement sur le prompt Reachy (12 segments, 6 scénarios). Ils devront être réévalués sur un corpus de prompts plus large en V2.

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
