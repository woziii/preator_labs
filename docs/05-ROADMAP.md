# 05 — Roadmap

> État actuel, prochaines étapes, et ce qui est explicitement hors-scope.

## V0.1 — MVP web (déployé)

**Statut : déployable.** Dossier `dist/` autonome prêt pour Vercel / Netlify / Cloudflare Pages (cf. `DEPLOY.md`).

- [x] Landing page de présentation scientifique
- [x] Segmentation automatique du prompt (algorithme heuristique)
- [x] Édition manuelle des segments détectés
- [x] Saisie des scénarios de test
- [x] Configuration des critères 3 axes
- [x] Moteur d'ablation branché sur l'API Claude (clé fournie par l'utilisateur)
- [x] Calcul des deltas par axe (structurel, comportemental, sémantique)
- [x] Visualisation : graphique de variance + cartes 3-axes + synthèse
- [x] Stockage local de la clé API + résultats
- [x] Backoff exponentiel sur 429 / 5xx / 529 (3 tentatives, respect du `retry-after`)
- [x] Sauvegarde incrémentale par appel → reprise sans re-jouer ce qui a réussi
- [x] Messages d'erreur Anthropic traduits en français lisible (401, 429, 529, …)
- [x] Validation des inputs (prompt vide, scénarios vides, prompt > 10k tokens)
- [x] Confirmation explicite si l'analyse dépasse 150 appels API
- [x] Estimation de coût $ par modèle dans l'UI
- [x] CSP restrictive + headers HTTPS via `vercel.json` / `netlify.toml` / `_headers`
- [x] Meta Open Graph + Twitter Card + favicon SVG
- [x] Section privacy explicite + FAQ + parcours "comment ça marche" en 4 étapes
- [x] Responsive 360 px → 1920 px, contraste WCAG AA
- [x] Page 404 brandée
- [x] Documentation complète (rationale, méthodologie, architecture, interprétation, roadmap + 3 documents d'agent)

Restent volontairement hors-scope V0.1 (déplacés en V0.2 ci-dessous) : export JSON, import d'analyse passée, drill-down par scénario, mode ablation combinée, contre-productivité signée.

## V0.2 — Robustesse (court terme)

Améliorations incrémentales sans changement d'architecture.

- [ ] Export JSON des résultats (pour archivage et comparaison)
- [ ] Import d'une analyse précédente
- [ ] Drill-down par scénario au survol d'un segment (montre l'impact scénario par scénario)
- [ ] Calibration affinée des seuils de verdict sur un corpus plus large que Reachy (observation 2026-05-26 : sur Haiku 4.5, 11 segments Reachy sur 12 sont classés "faible" car les outputs sont déjà très convergents ; normalisation par modèle ou par variance globale du run à envisager — cf. `00-AGENT-SMOKE-TEST.md` §B.2)
- [ ] Mode "ablation combinée" : retirer 2 segments à la fois pour détecter les coalitions
- [ ] Détection de contre-productivité (delta signé, pas absolu)
- [ ] Optimisation de l'image OG (passer < 200 KB)
- [ ] Compactage des appels (concurrence contrôlée à 3-5 req/s respectueuse d'Anthropic)

## V1 — Moteur Python de référence

Le moteur JS du navigateur a deux limites : performance sur de gros batches, et qualité de l'embedding sémantique (TF-IDF local en V0).

- [ ] `engine/preatorlabs.py` — moteur Python autonome
- [ ] Embeddings réels via Voyage AI (recommandé) ou sentence-transformers local
- [ ] CLI `preatorlabs analyze --prompt prompt.txt --scenarios scn.json`
- [ ] Sortie JSON normalisée, compatible avec le format de la web app
- [ ] Tests unitaires + tests d'intégration sur le corpus Reachy
- [ ] Distribution PyPI

## V2 — Multi-tours et fonctionnalités avancées

- [ ] Scénarios à historique multi-tours (testable sur des prompts avec mémoire conversationnelle)
- [ ] Mode A pour l'axe sémantique : corpus de référence fourni par l'utilisateur
- [ ] Pondération configurable des 3 axes
- [ ] Répétition n=3 par ablation pour absorber la stochasticité résiduelle
- [ ] Analyse comparative entre deux versions d'un même prompt (diff sémantique)

## V3 — Multi-LLM

- [ ] Adaptateur OpenAI (GPT-4, GPT-4o, o3)
- [ ] Adaptateur Gemini
- [ ] Adaptateur Mistral / Llama via providers
- [ ] Interface unifiée `LLMAdapter`
- [ ] Vue comparative : même prompt, plusieurs LLMs, rapport croisé
- [ ] Signal complémentaire logprobs quand l'API l'expose (OpenAI partiellement)

## V4 — Communauté et écosystème

- [ ] Bibliothèque de prompts de référence (commons benchmarkés)
- [ ] Plugin VSCode / Cursor pour analyser un prompt depuis l'éditeur
- [ ] API REST hébergée (optionnelle, pour intégration en CI/CD)
- [ ] Documentation traduite (EN minimum)

## Hors-scope volontaire

Ces directions ont été envisagées et **explicitement écartées** :

❌ **LLM-as-judge** — pas d'évaluation interprétative par un LLM tiers. La rigueur de la méthode dépend de cette exclusion. Voir `01-SCIENTIFIC-RATIONALE.md` §3.

❌ **Shapley values complètes** — coût combinatoire intenable. Possible en option avancée V4+ avec sampling approximé (Monte-Carlo Shapley), pas en chemin principal.

❌ **Fine-tuning ou apprentissage** — preatorlabs est un outil d'analyse, pas de modification automatique. Il aide l'humain à décider, il ne décide pas. Cette frontière est délibérée.

❌ **Génération automatique de prompts** — hors-scope. Beaucoup d'outils existent déjà pour ça. preatorlabs résout un problème en aval : *comprendre* un prompt existant.

## Pour les contributeurs futurs

Si tu reprends le projet, voici les questions à se poser avant chaque PR :

1. **Est-ce que ça préserve l'objectivité ?** Aucune métrique interprétative.
2. **Est-ce que ça préserve la frugalité ?** Pas de débordement combinatoire.
3. **Est-ce que ça préserve la lisibilité ?** Un non-expert doit pouvoir lire le rapport.
4. **Est-ce que c'est documenté ?** Toute méthode ajoutée a sa section dans `02-METHODOLOGY.md`.
5. **Est-ce que c'est falsifiable ?** Un verdict produit par preatorlabs doit pouvoir être contredit par un test indépendant.

Si l'une de ces réponses est non, la modification doit être justifiée explicitement, sinon refusée.
