# 00 — Preuve de compréhension (agent)

> Document produit en Phase 1 du brief de déploiement V0.1.
> Sert de garantie que l'agent qui reprend le projet a lu intégralement le repo et n'inventera pas.

Source primaire de chaque réponse : `01-SCIENTIFIC-RATIONALE.md`, `02-METHODOLOGY.md`, `03-ARCHITECTURE.md`, `04-INTERPRETATION-GUIDE.md`, `05-ROADMAP.md`, et `web/index.html`.

---

## 1. Quel problème preatorlabs résout-il ? (3 lignes)

L'ingénierie de prompt repose aujourd'hui sur des ajustements à l'aveugle : on modifie une phrase sans savoir si elle contribue réellement au comportement du LLM. preatorlabs mesure objectivement, segment par segment, l'impact réel de chaque partie d'un prompt système. Le résultat est un graphique de variance qui distingue les segments critiques, contextuels, faibles et placebo — pour décider quoi conserver, modifier ou supprimer avec fondement, plutôt que par intuition.

## 2. Pourquoi "ablation multi-axes multi-scénarios" plutôt que Shapley, logprobs ou LLM-as-judge ?

Les trois méthodes alternatives ont été explicitement comparées dans `01-SCIENTIFIC-RATIONALE.md` §3 et écartées pour des raisons précises :

- **LLM-as-judge** (méthode A) — Rejetée : un LLM-juge produit une réponse plausible, pas une mesure. La sortie dépend du LLM utilisé, du wording de la consigne, et n'est pas reproductible. Cette méthode viole le principe d'objectivité par construction.
- **Logprobs** (méthode B) — Rejetée du chemin principal : Claude ne les expose pas, Gemini non plus, OpenAI seulement partiellement (top-K). Une méthode qui exclut deux LLMs majeurs sur trois n'est pas universelle. Conservée comme signal complémentaire potentiel en V3.
- **Shapley values complètes** (méthode C) — Rejetée pour intenabilité combinatoire : 2^N appels par scénario. Avec N=15, c'est 32 768 appels par scénario. Le surcoût ne se traduit pas par un gain proportionnel sur les prompts réels (où les coalitions inter-segments sont rares et faibles).
- **Cosinus seul** (méthode D) — Insuffisante isolément : la similarité cosinus mesure le *changement*, pas la *qualité* (un segment peut changer fortement l'output tout en étant contre-productif). Conservée comme un des trois axes, jamais seule.

La méthode retenue combine les avantages : **objective** (mesures parsables ou calculables, jamais interprétatives), **universelle** (ne dépend que de l'output texte, marche sur tout LLM accessible par API), **frugale** (N×M+M appels, linéaire en N), **décomposable** (trois axes orthogonaux), **discriminante** (le multi-scénarios sépare segments fondamentaux des segments ponctuels — distinction impossible avec un seul scénario).

## 3. Les 3 axes de mesure et leur calcul

Pour chaque segment Si et chaque scénario Tj, on génère deux outputs : `O_complet(Tj)` (prompt entier, T=0) et `O_¬Si(Tj)` (prompt avec Si retiré, T=0). Les axes mesurent la différence selon trois angles orthogonaux.

### Axe 1 — Structurel
**Question** : l'output respecte-t-il le format attendu ?
**Calcul** : parsing booléen local en JavaScript. Coût computationnel nul, déterministe.

```
score_struct(output) = nb_critères_passés / nb_critères_actifs
```

Critères V1 (cf. `web/index.html`, fonction `structuralScore`) :
- `maxWords` : nombre de mots ≤ seuil (par défaut 15)
- `noAsterisk` : aucun `*` (interdit les actions narrées style RP)
- `noList` : pas de liste Markdown (`-`, `*`, `•`, `\d+.`)

L'impact structurel d'un segment est `|score_struct(O_complet) − score_struct(O_¬Si)|`.

### Axe 2 — Comportemental
**Question** : l'output suit-il les règles métier ?
**Calcul** : matching de chaînes (insensible à la casse), liste de termes interdits.

```
score_behav(output) = max(0, 1 − violations / |forbidden|)
```

L'impact comportemental d'un segment est `|score_behav(O_complet) − score_behav(O_¬Si)|`.

> Note (`02-METHODOLOGY.md` §5) : la formule canonique est `(1 − presence_forbidden) * presence_required`. L'implémentation V0.1 n'expose que la liste d'interdits via l'UI (`crit-forbidden`). Les termes attendus (`required`) sont prévus pour V0.2.

### Axe 3 — Sémantique
**Question** : le sens et le style sont-ils préservés ?
**Calcul** : distance cosinus entre les embeddings des deux outputs.

```
impact_sem(Si, Tj) = 1 − cosinus(embed(O_complet), embed(O_¬Si))
```

V0.1 utilise un proxy local (TF-IDF + cosinus sur bag-of-words, fonction `semanticSimilarity`) pour rester gratuit. **Limite assumée** : moins précis qu'un embedding contextuel ; sera remplacé en V1 (moteur Python Voyage AI ou sentence-transformers).

### Agrégation finale
```
impact_total(Si) = moyenne sur (j, axes) de |delta(Si, Tj, axe)|
variance(Si)    = écart-type sur j de impact_total(Si, j)
```

Poids des axes : `[1/3, 1/3, 1/3]` en V0.1 (configurable en V2).

## 4. Les 5 verdicts et leurs seuils (V0.3)

Source de vérité : `web/index.html`, fonction `classifyVerdict`. L'ordre de test détermine la priorité.

| # | Verdict | Condition (résumé) | Interprétation | Action |
|---|---|---|---|---|
| 1 | **placebo** | `impact < 0.10` | Ignoré par le LLM. | Supprimer ou reformuler. |
| 2 | **critical** | impact/activation forts + variance faible | Fondamental. | Ne pas toucher. |
| 3 | **high** | impact solide + activation suffisante | Important et stable. | Modifier avec prudence. |
| 4 | **context** | `impact ≥ 0.15` ET (`variance ≥ 0.25` OU `activation < 0.50`) | Filet ou activation partielle. | Garder. |
| 5 | **low** | impact faible, stable | Redondance possible. | Tester ablation combinée. |

Le verdict **modéré** (`mid`) a été fusionné vers **contextuel**. Voir `02-METHODOLOGY.md` §7 pour le protocole d'interprétation.

## 5. Limites explicitement assumées (hors-scope documenté)

Tirées de `01-SCIENTIFIC-RATIONALE.md` §5 et `05-ROADMAP.md`.

- **Limite 1 — Prompts sans critère définissable.** Si l'utilisateur ne peut formuler aucun critère structurel, comportemental ni stylistique, on retombe sur "le segment change-t-il l'output ?" — la méthode D seule, insuffisante. Inhérente, pas un défaut.
- **Limite 2 — Interactions entre segments.** L'ablation simple ne capture pas les coalitions (deux segments inutiles isolément mais critiques ensemble). Compromis assumé : 95 % des cas pour une fraction négligeable du coût Shapley.
- **Limite 3 — Mono-tour.** Les scénarios sont des inputs uniques en V0.1/V1. Règles sur la mémoire conversationnelle non pleinement testables avant V2.
- **Limite 4 — Stochasticité résiduelle.** Même à T=0, certains modèles gardent une variabilité marginale (négligeable sur Claude). V2 prévoit n=3 répétitions par ablation pour la résorber.
- **Hors-scope définitif** (`05-ROADMAP.md`) : LLM-as-judge, Shapley complet (sauf option Monte-Carlo V4+), fine-tuning automatique, génération automatique de prompts.

## 6. `state.rawPrompt` vs `state.segments` vs prompt envoyé à l'API

Trois représentations distinctes, à ne pas confondre.

- **`state.rawPrompt`** : `string` brut. Le contenu du `<textarea id="raw-prompt">`. Stocké tel quel, non normalisé. Sert uniquement de source à `autoSegment()` et de cache pour persistance/restauration.
- **`state.segments`** : `string[]`. Produit par `autoSegment(rawPrompt)` (split paragraphes + détection de titres MAJUSCULES + fusion des fragments < 20 chars). **Éditable individuellement par l'utilisateur** dans l'UI (textareas par segment, suppression, ajout). C'est l'unité d'ablation : `N = state.segments.length`.
- **Prompt envoyé à l'API (pseudo-prompt)** : reconstruit dynamiquement à chaque appel, jamais stocké tel quel. Deux formes :
  - Baseline : `state.segments.join('\n\n')` — exactement les segments actuels, séparés par double saut de ligne (préserve la structure de paragraphes).
  - Ablation de Si : `state.segments.filter((_, idx) => idx !== i).join('\n\n')` — tous sauf Si.

**Implication importante** : si l'utilisateur édite les segments après la segmentation auto, le baseline n'est plus identique au `rawPrompt` original. C'est voulu : la segmentation est une *proposition*, l'utilisateur garde la maîtrise du découpage final.

Le séparateur `\n\n` est crucial : il reproduit la structure typique des prompts système (paragraphes). Une concaténation espace simple changerait le comportement du LLM indépendamment de l'ablation.

## 7. Stockage de la clé API et justification

**Où** : `localStorage` du navigateur, clé `preatorlabs.apiKey`.
**Quand** : enregistrée à la saisie dans la modale "Clé API Anthropic", supprimable d'un clic.
**Comment elle est utilisée** : passée en header `x-api-key` à chaque `fetch` vers `https://api.anthropic.com/v1/messages` (et nulle part ailleurs).

**Pourquoi de cette manière** — trois raisons cumulatives (cf. `03-ARCHITECTURE.md` §"Stockage local" et §"Sécurité") :

1. **Privacy-by-design** : pas de backend = pas d'endroit où une clé pourrait transiter ou être journalisée par preatorlabs. La clé reste sur la machine de l'utilisateur. Le prompt et les résultats ne quittent jamais le navigateur, sauf vers le LLM cible.
2. **Pas d'inscription, pas de friction** : un utilisateur peut tester l'outil en 30 secondes avec sa propre clé. Aucun compte à créer.
3. **`localStorage` est isolé par origine** : pas d'exfiltration cross-site. Une autre origine ne peut pas lire la clé.

**Limite assumée et documentée** : un script malveillant injecté dans la page (XSS) pourrait lire `localStorage`. Mitigations en place dans la V0.1 :
- Aucun contenu user-généré rendu en HTML brut (`escapeHtml` systématique).
- CSP restrictive ajoutée au niveau des headers de déploiement (`default-src 'self'`, `connect-src` limité à `api.anthropic.com`).
- Bouton "supprimer la clé" toujours visible dans la modale.

L'appel direct depuis le navigateur est autorisé par Anthropic via le header `anthropic-dangerous-direct-browser-access: true` — Anthropic signale ainsi qu'on accepte le risque d'exposition côté client, en échange de l'absence de backend.

---

## Vérification de cohérence

À ce stade, l'agent peut :

- Citer pour chaque verdict la condition exacte (cf. §4).
- Reconstruire mentalement le coût d'une analyse (M baseline + N×M ablation = M(N+1) appels).
- Expliquer pourquoi un segment peut avoir un impact moyen faible et être pourtant utile (verdict `context`).
- Distinguer une métrique parsable (struct, behav) d'une métrique calculée (sem) et savoir laquelle dépend d'un proxy en V0.1.

Si l'un de ces points est flou, relire avant de coder.
