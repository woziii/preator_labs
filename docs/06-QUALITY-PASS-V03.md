# 06 — Passe qualité guidée V0.3

> Objectif : fournir une grille avant/après exploitable pour décider du déploiement, sur les cas médical et sommelier.

## 1) Protocole de test (objectif et reproductible)

### Périmètre
- Cas médical (disclaimer, public jeune)
- Cas sommelier (plafond de prix)

### Méthode
1. Prendre un segment cible `Si`.
2. Comparer `output_baseline` (prompt complet) vs `output_ablé` (sans `Si`).
3. Calculer les deltas par axe.
4. Comparer le comportement V0.2 (moyenne fixe 3 axes) vs V0.3 (axes applicables uniquement + activation).

### Règles d'interprétation
- V0.3 doit augmenter le signal sur les segments réellement contraignants (structure/comportement).
- V0.3 ne doit pas ajouter de jugement opaque : uniquement des règles déterministes traçables.

## 2) Grille avant/après (exploitable déploiement)

| Cas | Segment testé | Observation terrain | V0.2 (avant) | V0.3 (après) | Verdict |
|---|---|---|---|---|---|
| Médical S6 | `Termine toujours par "Cet avis..."` | La phrase disparaît si segment retiré | Sous-noté (souvent sémantique faible, structurel ≈ 0) | Détecté structurellement (`must_end_with`, delta struct = 1 quand retiré) | Corrigé |
| Sommelier prix | `Jamais recommander > 20€` | Les recommandations >20€ doivent être pénalisées | Souvent invisible sans critère manuel dédié | Règle auto `max_eur` (applicable si prix détectés), violation explicite | Corrigé |
| Médical S3 | `Public jeune` + marqueurs configurés | Baseline plus pédagogique, ablé plus clinique | Axe comportemental peu actif sans marqueurs | Mesurable via `required_term`/`forbidden_term` + tutoiement explicite | Corrigé (conditionnel à la config marqueurs) |
| Segments contextuels | Segment utile sur 1 scénario / N | Doit apparaître contextuel, pas placebo | Dilution par moyenne fixe /3 | `activationRate` + axes applicables => signal contextuel conservé | Corrigé |
| Sémantique | Variation de sens globale | Doit rester mesurée même sans règles manuelles | Actif mais parfois sur-dominant | Actif via provider switchable (`tfidf_local`/`voyage_api`) + fallback | Amélioré |

## 3) Mini-jeu de calcul démonstratif

### Cas A — Disclaimer médical (S6)

- Baseline : la phrase finale est présente.
- Ablé : la phrase finale est absente.
- Règle V0.3 auto : `must_end_with("Cet avis ne remplace pas une consultation médicale.")`

Calcul :
- `score_struct_baseline = 1`
- `score_struct_ablé = 0`
- `delta_struct = 1`

Conséquence :
- **V0.2** : pouvait rester faible (pas de critère structurel dédié).
- **V0.3** : signal fort et explicable sans ambiguïté.

### Cas B — Sommelier plafond 20€

- Baseline : recommandations à `12€`, `18€`.
- Ablé : recommandation à `24€`.
- Règle V0.3 auto : `max_eur <= 20`.

Calcul (si montants présents) :
- `score_struct_baseline = 1`
- `score_struct_ablé = 0`
- `delta_struct = 1`

Conséquence :
- La contrainte prix devient mesurable objectivement.

### Cas C — Public jeune (avec marqueurs utilisateur)

Exemple de marqueurs configurés :
- `required`: `adulte de confiance`
- `forbidden`: `rapport sexuel`, `vagin`, `testicules`

Si baseline contient le marqueur attendu et évite les interdits, mais ablé fait l'inverse :
- `delta_behav` tend vers `1`

Conséquence :
- La consigne abstraite devient falsifiable parce qu'opérationnalisée.

## 4) Analyse objective de l'évolution

### Gains démontrables
- Réduction des faux négatifs sur les contraintes structurelles explicites.
- Activation réelle de l'axe comportemental sur des règles mesurables.
- Agrégation plus fidèle (plus de dilution systématique).
- Distinction claire entre "axe non mesurable" et "axe satisfaisant".

### Ce qui reste inchangé (volontairement)
- Pas de LLM-juge.
- Pas d'inférence subjective des intentions.
- Toujours ablation mono-segment (pas de Shapley exhaustif).

## 5) Limites V0.3 à expliciter avant déploiement

1. Les formulations implicites peuvent échapper à l'auto-extraction regex.
2. Les contraintes abstraites exigent une configuration utilisateur des marqueurs.
3. Le mode Voyage améliore la mesure sémantique mais ajoute coût/latence.
4. Les interactions fortes entre segments (coalitions) restent partiellement hors périmètre.

## 6) Critères go/no-go déploiement

Déployer V0.3 si les points suivants sont validés sur tes prompts cibles :
- S6 disclaimer passe de "faible/mid" à "signal structurel fort".
- Règle prix sommelier est correctement sanctionnée en cas de dépassement.
- Segment "public jeune" devient stablement mesurable après configuration des marqueurs.
- Les segments contextuels gardent une variance/activation cohérentes (pas transformés en placebo).

Si un point échoue, conserver V0.3 en branche de test et ajuster les patterns auto/règles manuelles avant production.

## 7) Checklist opérationnelle (15 min)

### Préparation
- Charger la branche `PreatorlabsV0.3`.
- Ouvrir l'app et vérifier :
  - provider sémantique `TF-IDF local` (run 1)
  - puis `Voyage API` (run 2, si clé disponible)
- Température = `0`.

### Test 1 — Médical disclaimer (S6)
1. Prompt contenant la règle : `Termine toujours par "Cet avis ne remplace pas une consultation médicale."`
2. 3 scénarios : symptôme léger, modéré, grave.
3. Lancer analyse.
4. Vérifier :
   - `S6` montre un delta structurel élevé.
   - Le drilldown montre disparition nette de la phrase quand segment retiré.

**Pass si**: `S6` ressort au minimum `high`, idéalement `critical`.

### Test 2 — Sommelier plafond prix
1. Prompt avec règle : `Jamais recommander un vin à plus de 20€`.
2. Scénarios contenant explicitement des demandes à 8€, 20€, 35€.
3. Lancer analyse.
4. Vérifier :
   - Activation de la règle structurelle `max_eur`.
   - Le segment prix pénalise les sorties >20€ quand retiré.

**Pass si**: segment prix classé `high` ou `critical` avec signal structurel.

### Test 3 — Public jeune (comportemental)
1. Ajouter marqueurs manuels :
   - `required`: `adulte de confiance`
   - `forbidden`: `rapport sexuel, vagin, testicules`
2. Scénario clé : `Comment fait-on des bébés ?`
3. Lancer analyse.
4. Vérifier :
   - Delta comportemental non nul et lisible.
   - Cohérence avec changement de ton observé baseline vs ablé.

**Pass si**: segment concerné n'est plus `placebo/low` et devient mesurable (`mid+`).

### Test 4 — Robustesse provider sémantique
1. Refaire un run avec `Voyage API`.
2. Vérifier qu'en cas d'erreur API, fallback TF-IDF est effectif (run ne casse pas).

**Pass si**: analyse aboutit dans les deux modes (TF-IDF et Voyage/fallback).

## 8) Feuille de décision déploiement

| Critère | Résultat | Statut |
|---|---|---|
| Disclaimer médical détecté structurellement |  | ⬜ |
| Seuil prix sommelier correctement sanctionné |  | ⬜ |
| Segment public jeune mesuré via marqueurs |  | ⬜ |
| Segments contextuels restent contextuels |  | ⬜ |
| Run TF-IDF stable |  | ⬜ |
| Run Voyage (ou fallback) stable |  | ⬜ |

Règle de décision :
- **GO déploiement** si toutes les cases critiques sont validées (4 premières lignes au minimum).
- **NO-GO** sinon, avec itération ciblée sur règle/regex/markers concernés.

## 9) Résultat du test objectif exécuté (session actuelle)

Un test automatisé offline a été exécuté sur les fonctions réelles du moteur V0.3 (chargées depuis `web/index.html`) via le script :
- `scripts/quality_eval_v03.mjs`

Résultat :
- `6/6` tests passés, `0` échec

Tests validés :
1. Auto-extraction structurelle (`must_end_with`, `max_eur`).
2. Auto-extraction comportementale (`tutoiement`, `forbidden_term`).
3. Cas médical disclaimer : delta structurel attendu (`1 -> 0`).
4. Gestion correcte de l'état `non applicable` (règle prix sans montant).
5. Agrégation sur axes actifs (pas de division artificielle par 3).
6. Provider sémantique : fallback TF-IDF si Voyage indisponible.

Conclusion scientifique locale :
- Les mécanismes ajoutés en V0.3 se comportent conformément au design méthodologique.
- Les résultats sont compatibles avec une logique de mesure objective et falsifiable.
