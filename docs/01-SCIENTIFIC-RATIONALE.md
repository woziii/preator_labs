# 01 — Rationale scientifique

> Pourquoi preatorlabs existe, et pourquoi la méthode choisie est celle-là et pas une autre.

## 1. Le problème

L'ingénierie de prompt est aujourd'hui un travail empirique. Le cycle standard est :

1. Rédiger un prompt
2. L'injecter dans le LLM
3. Tester sur quelques inputs
4. Ajuster à l'aveugle

Le point 4 est le problème. Quand un prompt fonctionne mal, **on ignore quelle partie du prompt en est responsable**. Quand il fonctionne bien, on ignore quelle partie porte réellement le résultat. Modifier un prompt revient donc à toucher au hasard à des éléments dont on ne connaît pas la contribution.

Ce flou a trois conséquences mesurables :
- **Régression** : on supprime ou modifie un segment apparemment décoratif qui était en fait critique.
- **Inflation** : on accumule des phrases "au cas où" sans savoir qu'elles sont ignorées par le modèle.
- **Faux positifs** : on attribue à une phrase un effet qui vient en réalité d'une autre.

## 2. La contrainte boîte noire

Les LLMs commerciaux (Claude, GPT-4, Gemini…) ne sont pas inspectables. On n'a pas accès aux poids, aux couches d'attention, ni à la propagation interne. La seule chose qu'on peut observer est **l'output textuel** pour un input donné.

Toute méthode d'analyse doit donc se déduire de ce qu'on peut mesurer en surface, sans hypothèse sur la mécanique interne.

## 3. Méthodes envisagées et écartées

Quatre méthodes ont été analysées. Trois ont été rejetées.

### Méthode A — Demander à un LLM de juger le prompt

**Principe :** soumettre le prompt à un LLM tiers et lui demander de classer ses parties.

**Raison du rejet :** non-objectif par construction. Un LLM "juge" produit une réponse plausible, pas une mesure. La sortie dépend du LLM, du wording de la consigne, et n'est pas reproductible. Cette méthode est éliminée d'emblée.

### Méthode B — Analyse des logprobs

**Principe :** certaines APIs (OpenAI partiellement) exposent la probabilité associée à chaque token généré. Mesurer comment cette distribution change selon la présence ou l'absence d'un segment.

**Raison du rejet :**
- Claude ne l'expose pas.
- Gemini ne l'expose pas.
- OpenAI ne l'expose que partiellement (top-K seulement).

Une méthode qui exclut deux LLMs majeurs sur trois n'est pas universelle. Écartée du chemin principal. Pourra revenir en V3 comme **signal complémentaire** quand disponible.

### Méthode C — Shapley values (analyse de jeu coopératif)

**Principe :** rigoureux théoriquement. La contribution marginale d'un segment est la moyenne de son apport sur **toutes les combinaisons possibles** de segments présents/absents.

**Raison du rejet :** complexité combinatoire. Avec N segments, il faut 2^N appels API. N=10 → 1024 appels par scénario. N=15 → 32 768 appels. Intenable économiquement, et le surcoût ne se traduit pas par un gain de qualité proportionnel sur les prompts typiques (où les interactions inter-segments sont rares et faibles).

### Méthode D — Ablation simple + similarité cosinus

**Principe :** retirer un segment, comparer l'embedding de l'output avec/sans le segment, mesurer la distance.

**Raison du rejet partiel :** la similarité cosinus mesure le **changement**, pas la **qualité**. Un segment peut changer fortement l'output tout en étant contre-productif. Inversement, retirer un mauvais segment peut rapprocher l'output d'un bon résultat — la métrique dirait alors qu'il "comptait".

Cette méthode est insuffisante seule mais conservée comme **un des trois axes** dans la méthode retenue.

## 4. Méthode retenue : ablation multi-axes multi-scénarios

C'est la combinaison qui réunit le maximum d'avantages :

- **Objective** : mesures parsables/calculables, jamais interprétatives.
- **Universelle** : ne dépend que de l'output texte. Marche sur tout LLM accessible par API.
- **Frugale** : N×M+M appels (N segments, M scénarios). Linéaire en N, pas exponentielle.
- **Décomposable** : trois axes orthogonaux qui répondent à des questions différentes.
- **Discriminante** : la variance entre scénarios sépare les segments fondamentaux des segments contextuels.

### Les trois axes

| Axe | Question répondue | Méthode de mesure | Coût |
|---|---|---|---|
| **Structurel** | L'output respecte-t-il le format ? | parsing / regex / comptage | nul |
| **Comportemental** | L'output suit-il les règles métier ? | détection lexicale, exact match | nul |
| **Sémantique** | Le sens et le style sont-ils préservés ? | distance cosinus sur embeddings | très faible |

### Le multi-scénarios

Un segment peut être :
- **vital partout** (ex. : règle de format) → impact haut, variance basse
- **vital sur un seul cas** (ex. : règle anti-clichés ne servant que sur un thème) → impact moyen, variance haute
- **ignoré** (ex. : phrase décorative) → impact bas, variance basse
- **contre-productif** (rare) → impact négatif si on utilise une métrique signée

Sans plusieurs scénarios, on confond *segment ignoré* et *segment ponctuel*. C'est précisément le multi-scénarios qui transforme l'outil d'un détecteur grossier en un débogueur fin.

### Température = 0

Tous les appels sont passés à `temperature = 0`. Justification : sans ça, la variance observée entre scénarios mélange deux signaux :

1. la variance due à l'ablation (le signal qu'on veut isoler)
2. la variance stochastique du LLM (le bruit)

Fixer la température à zéro isole le signal. Pour les LLMs où T=0 reste légèrement stochastique (Claude notamment), on peut moyenner sur 2-3 runs par ablation en V2 si nécessaire.

## 5. Ce qui change entre V0.2 et V0.3

La V0.3 ne change pas la philosophie du projet (ablation mesurable), mais corrige des biais observés en pratique.

### 5.1 Biais observés en V0.2

1. **Axes dormants** : l'axe structurel/comportemental restait souvent neutre faute de critères activés.
2. **Dilution artificielle** : moyenne fixe sur 3 axes, même quand certains axes n'étaient pas applicables.
3. **Sous-détection des règles ponctuelles** : ex. "Termine toujours par ...", peu visible en sémantique seul.
4. **Comportement abstrait non opérationnalisé** : ex. "public jeune" non mesurable sans marqueurs explicites.

### 5.2 Correctifs V0.3

1. **Auto-extraction déterministe des règles**
   - Structurel : fin imposée, phrase requise, contraintes longueur, JSON, seuils numériques simples.
   - Comportemental : termes attendus/interdits explicites, tutoiement/vouvoiement explicitement demandés.
   - Les règles extraites sont traçables (`source: auto`), pas inférées par jugement.

2. **État `non applicable` par axe**
   - Un axe sans règle ou sans signal exploitable n'est plus artificiellement scoré.
   - Il est exclu de l'agrégation de ce scénario.

3. **Agrégation sur axes actifs**
   - Impact scénario = moyenne des deltas sur axes applicables uniquement.
   - Ajout d'un `activationRate` (global + par axe) pour distinguer signal stable vs contextuel.

4. **Sémantique switchable**
   - `TF-IDF local` (gratuit) ou `Voyage API` (payant).
   - Même mécanique de mesure (cosinus), seule la qualité de l'embedding change.
   - Fallback explicite vers TF-IDF si l'API externe échoue.

### 5.3 Pourquoi c'est scientifiquement plus solide

- **Même observables, meilleure instrumentation** : on n'ajoute pas de jugement subjectif, on améliore ce qui est mesuré.
- **Moins de faux "impact faible"** : disparition de la division automatique par 3 quand 1-2 axes sont inactifs.
- **Meilleure falsifiabilité locale** : une règle "fin imposée" est vérifiable par inspection directe de l'output.

## 6. Limites assumées (V0.3)

Toute méthode a un domaine de validité. Voici les limites explicites de preatorlabs :

**Limite 1 — critères abstraits non opérationnalisés.** Une consigne comme "adapte-toi à un public jeune" reste partiellement abstraite tant qu'elle n'est pas traduite en marqueurs (`attendus/interdits`). V0.3 permet cette traduction mais ne l'invente pas automatiquement sans risque de subjectivité.

**Limite 2 — interactions entre segments.** L'ablation simple ne capture pas les effets de coalition (deux segments inutiles isolément mais critiques ensemble). Pour les capturer, il faudrait Shapley. Le compromis assumé : on couvre 95 % des cas avec une fraction négligeable du coût.

**Limite 3 — scénarios mono-tour.** Pour la V1, les scénarios de test sont des inputs uniques. Les prompts incluant des règles sur la **mémoire conversationnelle** (ex. : "si on t'a blessé il y a 3 messages…") ne pourront être pleinement testés qu'en V2 avec scénarios à historique.

**Limite 4 — stochasticité résiduelle.** Même à T=0, certains modèles conservent une variabilité (sampling top-K, race conditions). Sur Claude, c'est marginal. Pour des résultats publication-grade, prévoir n=3 répétitions par ablation (V2+).

**Limite 5 — extraction regex canoniques.** L'auto-extraction V0.3 couvre des formulations explicites. Une formulation implicite ou ambiguë peut ne pas être détectée. Le mode manuel reste nécessaire pour les cas non canoniques.

**Limite 6 — coût/latence du provider sémantique externe.** Voyage améliore la précision sémantique, mais introduit coût API et dépendance réseau. Le mode local reste le baseline frugal.

## 7. Ce qui rend la méthode défendable scientifiquement

Trois propriétés en font une méthode de mesure et pas une heuristique :

1. **Reproductibilité** : à prompt, scénarios et modèle fixés, le résultat est déterministe (T=0).
2. **Falsifiabilité** : un verdict produit par preatorlabs peut être contredit par un test indépendant (manuel ou via un autre outil).
3. **Décomposabilité** : un score d'impact n'est jamais opaque. Il se décompose en axes, scénarios, règles actives et provenance (`manual`/`auto`).

C'est ce qui distingue preatorlabs d'un "score de qualité de prompt" produit par un LLM tiers.
