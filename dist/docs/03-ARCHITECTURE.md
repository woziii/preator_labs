# 03 — Architecture technique

> Comment preatorlabs est construit, et comment les composants se parlent.

## Vue d'ensemble V1

```
┌──────────────────────────────────────────────────────┐
│                    Navigateur                        │
│                                                      │
│  ┌────────────────┐   ┌──────────────────────────┐   │
│  │   Landing      │   │       Démo               │   │
│  │   (HTML/CSS)   │   │   (HTML + JS vanilla)    │   │
│  │                │   │                          │   │
│  │   Présentation │   │   • Segmentation         │   │
│  │   scientifique │──▶│   • Config scénarios     │   │
│  │   + ancres     │   │   • Config 3 axes        │   │
│  │                │   │   • Moteur d'ablation    │   │
│  └────────────────┘   │   • Visualisation        │   │
│                       └────────────┬─────────────┘   │
│                                    │                 │
│                       Clé API stockée                │
│                       en localStorage                │
└────────────────────────────────────┼─────────────────┘
                                     │
                                     ▼
                       ┌───────────────────────────────┐
                       │    Anthropic API              │
                       │    /v1/messages               │
                       │                               │
                       │    Appel direct CORS-enabled  │
                       │    Modèle : claude-sonnet-4-5 │
                       │    Temperature : 0            │
                       └───────────────────────────────┘
```

## Composants V1

### 1. Landing (`web/index.html`, sections en haut)

Pure HTML/CSS. Pas de framework. Pas de build.

Contenu :
- **Hero** : pitch en une phrase + CTA vers la démo
- **Le problème** : pourquoi preatorlabs existe
- **La méthode** : explication des 3 axes + ablation
- **Comment lire les résultats** : guide de lecture
- **Démo** : ancre vers la section live

### 2. Démo (`web/index.html`, section #demo)

JS vanilla. Trois sous-composants :

#### 2a. Module `Segmenter`

```javascript
const Segmenter = {
  segment(rawText) -> string[]
}
```

Implémentation : algorithme décrit dans `02-METHODOLOGY.md` §1.

#### 2b. Module `Scorer`

```javascript
const Scorer = {
  structural(output, criteria) -> number ∈ [0,1],
  behavioral(output, criteria) -> number ∈ [0,1],
  semantic(outputA, outputB) -> number ∈ [0,1]  // cosinus
}
```

Notes :
- `structural` : parsing local en JS, zéro coût.
- `behavioral` : matching de chaînes / regex, zéro coût.
- `semantic` : nécessite une fonction d'embedding. V1 utilise une approximation locale (TF-IDF + cosinus sur le bag-of-words) pour rester *gratuite*. V2 passera sur Voyage AI ou OpenAI embeddings pour la précision.

#### 2c. Module `AblationEngine`

```javascript
const AblationEngine = {
  async run({ segments, scenarios, criteria, apiKey, model }) -> Results
}
```

Pseudo-code :

```javascript
async function run({ segments, scenarios, criteria, apiKey, model }) {
  const baselines = await Promise.all(
    scenarios.map(s => callClaude(joinSegments(segments), s, apiKey, model))
  );
  
  const results = [];
  for (let i = 0; i < segments.length; i++) {
    const ablated = segments.filter((_, idx) => idx !== i);
    const promptAblated = joinSegments(ablated);
    
    const outputs = await Promise.all(
      scenarios.map(s => callClaude(promptAblated, s, apiKey, model))
    );
    
    const deltas = scenarios.map((_, j) => ({
      struct: Scorer.structural(baselines[j], criteria) - Scorer.structural(outputs[j], criteria),
      behav: Scorer.behavioral(baselines[j], criteria) - Scorer.behavioral(outputs[j], criteria),
      sem: 1 - Scorer.semantic(baselines[j], outputs[j])
    }));
    
    results.push(aggregateSegment(i, deltas));
  }
  
  return results;
}
```

Concurrence : appels API en parallèle par scénario. Anthropic supporte 5 req/s sur Tier 1 — au-delà, batching séquentiel.

#### 2d. Module `Renderer`

```javascript
const Renderer = {
  drawVarianceChart(results, canvas),
  drawAxesBreakdown(results, container),
  drawSynthesis(results, container)
}
```

Dépendance externe : Chart.js (UMD via CDN).

## Contrats de données

### `Segment`
```typescript
type Segment = {
  id: string;           // "S1", "S2", ...
  text: string;         // le texte du segment
  label?: string;       // étiquette générée
}
```

### `Scenario`
```typescript
type Scenario = {
  id: string;           // "T1", "T2", ...
  input: string;        // l'input utilisateur
}
```

### `Criteria`
```typescript
type Criteria = {
  structural: {
    maxWords?: number;
    forbidPatterns?: RegExp[];
  };
  behavioral: {
    forbidden: string[];
    required?: string[];
  };
  // sémantique : pas de config en mode B
}
```

### `SegmentResult`
```typescript
type SegmentResult = {
  id: string;
  label: string;
  impact: number;       // [0, 1]
  variance: number;     // [0, 1]
  struct: number;       // [0, 1]
  behav: number;        // [0, 1]
  sem: number;          // [0, 1]
  verdict: 'critical' | 'high' | 'context' | 'mid' | 'low' | 'placebo';
  perScenario: {
    scenarioId: string;       // "T1", "T2", ...
    input: string;            // scénario utilisateur
    baselineOutput: string;   // output prompt complet
    ablatedOutput: string;    // output prompt sans segment courant
    axisDelta: {              // deltas absolus pour ce scénario
      struct: number;
      behav: number;
      sem: number;
    };
  }[];
}
```

## Stockage local

`localStorage` est utilisé pour :
- `preatorlabs.apiKey` — clé Anthropic de l'utilisateur (jamais envoyée à un serveur tiers)
- `preatorlabs.lastPrompt` — dernier prompt analysé (pour reprise)
- `preatorlabs.lastResults` — derniers résultats

**Le projet n'a pas de backend.** Toute la logique tourne dans le navigateur. C'est un choix de privacy-by-design : le prompt et les résultats ne quittent jamais la machine de l'utilisateur, sauf vers l'API du LLM cible.

## Sécurité

- La clé API utilisateur n'est jamais loggée, jamais envoyée ailleurs qu'à Anthropic.
- `localStorage` est isolé par origine — pas d'exfiltration cross-site.
- L'utilisateur peut effacer la clé d'un clic via l'UI.

Limite assumée : un script malveillant injecté dans la page (XSS) pourrait lire `localStorage`. Mitigation : pas de contenu user-généré rendu en HTML brut, CSP stricte recommandée pour le déploiement.

## V2 (planifiée)

Ajout d'un moteur Python optionnel pour les batches volumineux :

```
engine/
├── preatorlabs.py        # moteur de référence
├── scorers/
│   ├── structural.py
│   ├── behavioral.py
│   └── semantic.py       # embeddings via Voyage AI ou local sentence-transformers
└── cli.py                # entrypoint CLI
```

Sortie JSON normalisée, importable dans la web app.

## V3 (envisagée)

Support multi-LLM : adaptateurs pour OpenAI, Gemini, Mistral. Interface commune `LLMAdapter`. Permet de comparer la conformité d'un même prompt sur plusieurs modèles.
