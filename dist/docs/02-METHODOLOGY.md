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
[2] Configuration des scénarios + critères 3 axes
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
[6] Agrégation : impact moyen + variance
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

### Critères des 3 axes

**Structurel** — formules de parsing booléennes :
- longueur ≤ N mots
- absence de caractère/pattern (ex. `*`, listes Markdown)
- présence de structure attendue (JSON valide, clés requises)

**Comportemental** — détection lexicale :
- termes interdits (liste de strings)
- termes attendus (liste de strings)
- patterns regex métier

**Sémantique** — distance cosinus :
- mode B (V1) : comparaison directe output-complet vs output-ablé
- mode A (V2) : comparaison à un corpus de référence fourni par l'utilisateur

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
delta(i, j, a) = score_a(O(complet, Tj)) - score_a(O(¬Si, Tj))
```

Un delta positif signifie que le segment **contribuait** au score sur cet axe. Un delta nul signifie qu'il n'avait pas d'effet. Un delta négatif (rare) signifie que le segment **dégradait** le score — c'est un parasite.

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
impact_total(i) = mean over j and a of |delta(i, j, a)|
                  weighted by axis_weights
variance(i) = std over j of impact_total(i, j)
```

Les `axis_weights` sont par défaut `[1/3, 1/3, 1/3]` mais peuvent être ajustés (V2) si l'utilisateur veut sur-pondérer un axe.

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
