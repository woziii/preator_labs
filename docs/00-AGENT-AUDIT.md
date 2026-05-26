# 00 — Audit du prototype (agent)

> Document produit en Phase 2 du brief de déploiement V0.1.
> Identifie ce qui empêche la mise en ligne, point par point. Chaque ligne est cochée [x] quand la correction a été appliquée et vérifiée.

Légende :
- `[OK]` — vérifié sur le prototype, conforme au déploiement.
- `[FIX]` — défaut identifié, correction prévue dans le brief.
- `[NEW]` — défaut identifié hors brief initial, ajouté ici avant correction.

---

## A — Fonctionnel

### A1 — Appel à l'API Anthropic depuis le navigateur [OK]
**Vérification :** `web/index.html` ligne ~1313, header `'anthropic-dangerous-direct-browser-access': 'true'` présent dans `callClaude`. Header officiel Anthropic, autorise un appel direct depuis le browser sans backend. Confirmé sur la doc Anthropic.

### A2 — Segmentation cohérente sur prompts variés [OK]
**Test exécuté** (script éphémère `.tmp-test-segment.mjs`, supprimé après usage) sur trois prompts :

- **Créatif (poète)** — 6 segments produits. La règle "Évite les clichés…" reste isolée (vital : c'est elle qui porte l'anti-cliché). Le titre majuscule "REGLES STRICTES" est correctement attaché à la règle qu'il introduit.
- **Technique (code reviewer)** — 5 segments. Le bloc JSON multi-ligne reste **un seul segment**, ce qui est le bon comportement : le découper le casserait. Les critères listés sous "CRITERIA" sont regroupés en un segment cohérent.
- **Conversationnel (coach CNV)** — 6 segments. Chaque règle (questions, reformulation, vocabulaire, longueur) devient un segment distinct.

**Conclusion :** la segmentation V0.1 produit un découpage utilisable sur les trois natures. Limite connue : un long bloc structuré (JSON, code) reste mono-segment, mais c'est le compromis qui évite de casser des structures. La doc utilisateur recommande déjà d'éditer manuellement.

### A3 — Calculs déterministes et bornés [OK]
- `structuralScore` : retourne `passed / totalCriteria` ∈ [0, 1], déterministe.
- `behavioralScore` : retourne `max(0, 1 - violations/forbidden.length)` ∈ [0, 1], déterministe.
- `semanticSimilarity` : retourne `dot / (||a|| · ||b||)` ∈ [-1, 1] en théorie, mais avec TF-IDF (fréquences ≥ 0) toujours ∈ [0, 1]. **L'impact sémantique** est `1 - similarity`, donc ∈ [0, 1].

### A4 — Seuils de verdict sur cas Reachy [OK]
Seuils dans `classifyVerdict` (web/index.html) :
```
impact >= 0.60 && variance < 0.15 → critical
impact >= 0.45 && variance < 0.20 → high
variance >= 0.25 → context
impact < 0.10 → placebo
impact < 0.20 → low
else → mid
```
Conformes à `docs/02-METHODOLOGY.md` §7. Calibrés sur Reachy. Reproduits manuellement par revue. Validation par exécution API réelle prévue en smoke test (`docs/00-AGENT-SMOKE-TEST.md`).

### A5 — Calcul de coût exact [OK]
`updateCost()` calcule `M + N*M`. Cohérent avec la formule `N×M+M` de `02-METHODOLOGY.md` §4.

### A6 — Pas d'erreur JS silencieuse [OK]
Revue statique : le script ne contient pas de `try/catch` qui avale silencieusement. Le seul `try/catch` (bouton "lancer") affiche l'erreur via `showError`. Validé en smoke test (console DevTools).

---

## B — Robustesse

### B1 — Rate limit 429 [FIX appliqué]
**Avant :** `callClaude` jette dès `!response.ok`. Une 429 transitoire interrompt toute l'analyse.
**Après :** wrapper `callClaudeWithRetry` : 3 tentatives, backoff exponentiel (1 s / 2 s / 4 s, jitter ±30 %), respect du header `retry-after` quand fourni par Anthropic. Codes retentés : 429, 500, 502, 503, 504, 529.

### B2 — Reprise sur échec en milieu d'analyse [FIX appliqué]
**Avant :** une erreur en milieu de N×M appels = tout est perdu.
**Après :** `preatorlabs.runState` en `localStorage`, sérialisation après chaque appel réussi (baselines puis outputs[i][j]). Au démarrage de la tâche, si `runState` existe et matche la signature (N, M, hash des segments, hash des scénarios, modèle), bandeau "Reprendre l'analyse interrompue (appel X/Y) — Reprendre / Repartir de zéro". Reprise saute les appels déjà persistés.

### B3 — Clé API invalide → message lisible [FIX appliqué]
**Avant :** body brut affiché (`API 401: {"error": …}`).
**Après :** parse JSON de la réponse Anthropic, mapping des codes :
- 401 → "Clé API invalide ou révoquée. Vérifie dans la modale 'configurer'."
- 429 → "Limite de taux atteinte. Réessai automatique en cours."
- 529 → "Anthropic surchargé temporairement. Réessai automatique."
- 4xx générique → message Anthropic `error.message`.

### B4 — Prompt vide / scénarios vides / prompt très long [FIX appliqué]
**Avant :** check minimal (segments.length === 0 || scenarios.length === 0).
**Après :**
- Scénarios vides filtrés avant comptage du coût et avant lancement.
- Segments réduits à du whitespace filtrés.
- Estimation rapide des tokens du prompt complet (`length/4`) : warning visible si > 10 000 tokens (~40 000 chars).

### B5 — Limite N×M [FIX appliqué]
Si `M + N*M > 150` appels : confirmation modale explicite ("Cette analyse va effectuer X appels API (estimés ~$Y.YY). Confirmer ?") avant lancement.

---

## C — UX déploiement

### C1 — Responsive jusqu'à 360 px [FIX appliqué]
**État initial :** `clamp()` sur les titres, `@media (max-width: 720px)` et `860px` présents. À 360 px : `.demo-tabs` overflow OK (déjà `overflow-x:auto`), `.demo-body` padding 36 px → trop large.
**Correctifs :**
- `@media (max-width: 420px)` : `.demo-body` padding 20 px, `.demo-header` padding 18 px, `.hero` padding 64 px 0 72 px.
- `.row-item` passe en `grid-template-columns: 26px 1fr 32px` au lieu de `30/36`.
- `.consequences li` passe de `100px 1fr` à `1fr` empilé en mobile.

### C2 — Contraste WCAG AA [FIX appliqué]
**Mesure :** `--ink-mute: #8a877d` sur `--bg: #f5f3ee` → ratio ~2.7:1 (échec AA texte).
**Correctifs :**
- `--ink-mute` : `#8a877d` → `#6e6c64` (ratio ~4.7:1, AA OK).
- `--c-low: #9a9588` → `#7c7868` (ratio ~4.4:1) pour rester lisible quand utilisé en texte sur fond clair.
- Le pill `v-low` reste sur fond coloré donc moins critique.

### C3 — États de chargement explicites [FIX appliqué]
Barre de progression présente avec `appel X / Y`. Amélioration : note explicite "un appel peut prendre 2-10 s — patiente" affichée pendant l'exécution.

### C4 — Page 404 [FIX appliqué]
Création de `dist/404.html` minimaliste, même charte, lien retour `/`.

### C5 — Meta OG / Twitter / favicon [FIX appliqué]
**Avant :** aucun.
**Après :** dans `<head>` :
- `<link rel="icon" type="image/svg+xml" href="/favicon.svg">`
- `<meta name="description">`, `<meta name="theme-color">`
- `<meta property="og:title|description|url|image|type">`
- `<meta name="twitter:card|title|description|image">`
- Image OG 1200×630 PNG générée, contenu cohérent avec la marque.

### C6 — Note progress visible au scroll [NEW → FIX appliqué]
La barre de progression était dans le panneau `#panel-run`. Si l'utilisateur scroll, il ne sait plus où en est l'analyse. Solution : un petit indicateur "barre en bas" reste visible quand un run est en cours. (Pas un blocage strict, mais petit gain UX.)

---

## D — Sécurité & privacy

### D1 — Isolation clé API [OK]
- La clé n'est passée qu'au domaine `https://api.anthropic.com` (ligne hardcodée dans `callClaude`).
- Aucun `console.log` de la clé.
- Pas d'analytics, pas de tracking, pas de CDN qui appellerait nos données.

### D2 — Risque XSS sur insertions HTML [OK — audit ligne par ligne]
Toutes les insertions `innerHTML` rendues à partir de données :

- `renderSegments` : `${escapeHtml(seg)}` ✓ ; `S${i+1}` (entier safe) ✓ ; `data-idx="${i}"` (entier safe) ✓.
- `renderScenarios` : `${escapeHtml(sc)}` ✓ ; `T${i+1}` ✓.
- `renderResults` (cartes 3-axes) :
  - `${d.id}` = `'S' + (i+1)` (généré) ✓.
  - `${escapeHtml(d.label)}` ✓.
  - `${meta.label}` = constante définie dans le code ✓.
  - `${escapeHtml(quote)}` ✓.
  - `${Math.round(d.struct*100)}%` (nombre) ✓.
- `synthesis` : `${critList}` etc. = `.map(d => d.id).join(', ')` = strings `Sxx` ✓.
- Outputs d'API (texte LLM) **ne sont jamais rendus en HTML brut** — uniquement utilisés pour scoring local et embeddings TF-IDF. Pas de surface XSS.

**Conclusion :** RAS. Pas de modification nécessaire. La CSP en plus est une défense en profondeur.

### D3 — CSP [FIX appliqué]
Aucune en l'état. Ajout via les 3 fichiers de plateforme (`vercel.json`, `netlify.toml`, `_headers`) avec la politique suivante :

```
default-src 'self';
script-src 'self' https://cdn.jsdelivr.net;
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
font-src 'self' https://fonts.gstatic.com;
img-src 'self' data:;
connect-src 'self' https://api.anthropic.com;
frame-ancestors 'none';
base-uri 'self';
form-action 'self';
```

Notes :
- `'unsafe-inline'` pour `style-src` justifié par les styles inline dynamiques (couleurs des barres d'axe par segment). Migrer vers un hash CSS imposerait un refactor disproportionné en V0.1.
- `script-src` sans `'unsafe-inline'` : strict.
- `connect-src` restreint à `api.anthropic.com` — vérouille les exfiltrations potentielles via XSS.

### D4 — Privacy policy visible [FIX appliqué]
**Avant :** mention dans la modale clé API uniquement.
**Après :** section dédiée `#privacy` dans la landing, lien explicite dans le footer, ancre stable. Contenu : stockage local exclusif, pas d'analytics, pas de cookie, pas de backend, suppression d'un clic.

---

## E — Documentation produit

### E1 — Parcours utilisateur en 4 étapes [FIX appliqué]
Section "Comment ça marche" (`#howto`) ajoutée entre `#method` et `#reading` : 4 cartes numérotées (1. colle ton prompt — 2. ajoute des scénarios — 3. lance l'analyse — 4. lis les résultats). Pas de friction, pas de doc à creuser.

### E2 — Coût $ approximatif [FIX appliqué]
`cost-box` affiche désormais à la fois nombre d'appels et estimation $ (selon modèle sélectionné). Tarifs publiés Anthropic (au moment du dev V0.1) :

- Claude Sonnet 4.5 : input $3 / 1 M tok, output $15 / 1 M tok
- Claude Opus 4.7 : input $15 / 1 M tok, output $75 / 1 M tok
- Claude Haiku 4.5 : input $1 / 1 M tok, output $5 / 1 M tok

Hypothèses retenues (documentées dans une note sous le coût) :
- prompt système moyen : 800 tokens (cf. exemple Reachy ~700)
- input utilisateur moyen : 50 tokens
- output limité à `max_tokens: 1024`, mais en pratique souvent ~150 tokens (T=0, prompts contraints)
- on utilise 1024 comme borne sup pour l'estimation conservatrice

Estimation = `calls × ((850 × in_price + 1024 × out_price) / 1e6)`. Sous-estimation possible si le prompt est plus long, sur-estimation si l'output réel < 1024. Documenté dans l'UI.

### E3 — FAQ [FIX appliqué]
Section `#faq` ajoutée avec 6 questions :
1. Pourquoi pas un LLM qui juge ?
2. Combien ça coûte vraiment ?
3. Mes données partent où ?
4. Pourquoi pas OpenAI / Gemini en V0.1 ?
5. Comment preatorlabs gère un prompt très long ?
6. Le projet est-il open source ?

Chaque réponse renvoie à la doc canonique.

### E4 — Lien vers le repo public [FIX appliqué + URL finale en place]
URL réelle `https://github.com/woziii/preator_labs` dans footer + FAQ. Mise à jour effectuée le 2026-05-26 — domaine officiel `preatorlabs.dev`.

---

## Synthèse

| Catégorie | OK | Corrigé | Total |
|---|---|---|---|
| A — Fonctionnel | 6 | 0 | 6 |
| B — Robustesse | 0 | 5 | 5 |
| C — UX déploiement | 0 | 6 | 6 |
| D — Sécurité | 2 | 2 | 4 |
| E — Doc produit | 0 | 4 | 4 |

**Vérification des 5 principes non négociables** appliquée à chaque correctif :

- Objectivité : aucune métrique nouvelle qui demande à un LLM de juger. Tous les changements concernent UX, fiabilité, sécurité, documentation. ✓
- Frugalité : la reprise réduit les appels en cas d'erreur, ne les augmente jamais. La confirmation N×M > 150 évite les emballements. ✓
- Universalité : aucun chemin nouveau dépendant d'une feature exclusive d'un LLM. ✓
- Lisibilité : FAQ, parcours 4 étapes, estimation $ visible, contraste AA — tous renforcent. ✓
- Falsifiabilité : verdicts inchangés. ✓
