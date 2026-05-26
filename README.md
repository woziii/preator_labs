# preatorlabs

> Prompt debugger — analyse rigoureuse, segment par segment, du rôle effectif de chaque partie d'un prompt système sur le comportement d'un LLM.

preatorlabs résout un problème concret de l'ingénierie de prompt : aujourd'hui, on rédige un prompt, on le teste, on l'ajuste, sans jamais savoir avec précision **quelle phrase a quel impact**. Modifier un prompt revient souvent à toucher au hasard à des éléments dont on ignore le rôle réel.

preatorlabs apporte une réponse expérimentale et objective : une étude d'ablation segment par segment, mesurée sur trois axes orthogonaux (structurel, comportemental, sémantique), restituée sous forme d'un graphique de variance lisible.

---

## En une phrase

> *Donne ton prompt. Donne quelques scénarios. preatorlabs te dit, segment par segment, lesquels portent vraiment ton intention et lesquels sont du décor.*

---

## Structure du repo

```
preatorlabs/
├── README.md                      ← tu es ici
├── DEPLOY.md                      ← guide de déploiement (Vercel/Netlify/Cloudflare)
├── docs/
│   ├── 00-AGENT-UNDERSTANDING.md  ← preuve de compréhension agent
│   ├── 00-AGENT-AUDIT.md          ← matrice d'audit fonctionnel/UX/sécurité
│   ├── 00-AGENT-SMOKE-TEST.md     ← résultat du smoke test pré-déploiement
│   ├── 01-SCIENTIFIC-RATIONALE.md ← le pourquoi, méthodes comparées
│   ├── 02-METHODOLOGY.md          ← le workflow scientifique détaillé
│   ├── 03-ARCHITECTURE.md         ← architecture technique
│   ├── 04-INTERPRETATION-GUIDE.md ← lecture des résultats
│   └── 05-ROADMAP.md              ← état actuel, V0.2, V1, V2, V3
├── web/
│   ├── index.html                 ← landing + démo branchée API Claude (source)
│   ├── favicon.svg
│   └── og-image.png
├── dist/                          ← dossier prêt à déployer (autonome)
│   ├── index.html · 404.html
│   ├── favicon.svg · og-image.png
│   ├── robots.txt · sitemap.xml
│   ├── vercel.json · netlify.toml · _headers
│   └── docs/                      ← copie des fichiers .md
└── engine/
    └── README.md                  ← placeholder V1 (moteur Python)
```

## Pour démarrer

- **Tu veux juste essayer** → ouvre `web/index.html` ou `dist/index.html` dans un navigateur (ou lance `python -m http.server` dans `dist/`)
- **Tu veux déployer publiquement** → `DEPLOY.md`
- **Tu veux comprendre l'idée scientifique** → `docs/01-SCIENTIFIC-RATIONALE.md`
- **Tu veux comprendre comment ça marche concrètement** → `docs/02-METHODOLOGY.md`
- **Tu veux reprendre ou poursuivre le projet** → `docs/00-AGENT-UNDERSTANDING.md` puis `docs/03-ARCHITECTURE.md` puis `docs/05-ROADMAP.md`

## État du projet

V0.1 — MVP web déployable.

- Segmentation automatique ✓
- Configuration des 3 axes (structurel / comportemental / sémantique) ✓
- Moteur d'ablation branché sur l'API Claude ✓
- Backoff 429 + reprise par appel + messages d'erreur lisibles ✓
- Estimation $ par modèle, alerte si N×M > 150 ✓
- CSP, OG, favicon, page 404, FAQ, privacy, parcours 4 étapes ✓
- Responsive 360px, contraste WCAG AA ✓
- Moteur Python de référence ✗ (V1)
- Support multi-LLM (OpenAI, Gemini) ✗ (V3)

Voir `docs/05-ROADMAP.md` pour le détail.

## Pour les LLMs qui reprendraient ce projet

Si tu es un LLM (Claude, GPT, Gemini…) chargé de poursuivre, modifier ou compléter ce projet :

1. **Lis d'abord `docs/01-SCIENTIFIC-RATIONALE.md`** — il contient l'analyse comparative des méthodes envisagées et les raisons précises du choix de l'ablation multi-axes. Ne reviens pas en arrière sur ces choix sans raison documentée.
2. **Puis `docs/02-METHODOLOGY.md`** — c'est la spec scientifique. Toute modification du moteur doit y être conforme ou justifier explicitement un écart.
3. **Puis `docs/03-ARCHITECTURE.md`** — c'est la spec technique. Elle décrit les contrats entre composants.
4. **Enfin `docs/05-ROADMAP.md`** — il indique ce qui est en cours, ce qui est planifié, et ce qui est volontairement hors-scope.

Principes de contribution :
- **Préserver la rigueur scientifique** : toute mesure ajoutée doit être objective (parsable, calculable), pas interprétative (jamais "demander à un LLM de juger").
- **Préserver la lisibilité du résultat** : la restitution doit pouvoir être lue par un non-expert en 30 secondes.
- **Préserver la frugalité** : nombre d'appels API maîtrisé (N×M+M et pas 2^N).
- **Préserver l'universalité** : pas de dépendance à des features spécifiques à un LLM (logprobs, etc.) dans le chemin principal.

## Licence

MIT (à confirmer par le propriétaire du projet).
