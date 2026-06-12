# 03 — Technical architecture

> How preatorlabs is built, and how the components talk to each other.

## V1 overview

```
┌──────────────────────────────────────────────────────┐
│                     Browser                          │
│                                                      │
│  ┌────────────────┐   ┌──────────────────────────┐   │
│  │   Landing      │   │        Demo              │   │
│  │   (HTML/CSS)   │   │   (HTML + vanilla JS)    │   │
│  │                │   │                          │   │
│  │   Scientific   │   │   • Segmentation         │   │
│  │   presentation │──▶│   • Scenario config      │   │
│  │   + anchors    │   │   • 3-axis config        │   │
│  │                │   │   • Ablation engine      │   │
│  └────────────────┘   │   • Visualisation        │   │
│                       └────────────┬─────────────┘   │
│                                    │                 │
│                       API key stored                 │
│                       in localStorage                │
└────────────────────────────────────┼─────────────────┘
                                     │
                                     ▼
                       ┌───────────────────────────────┐
                       │    Anthropic API              │
                       │    /v1/messages               │
                       │                               │
                       │    Direct CORS-enabled call   │
                       │    Model: claude-sonnet-4-5   │
                       │    Temperature: 0             │
                       └───────────────────────────────┘
```

## V1 components

### 1. Landing (`web/index.html`, sections at the top)

Pure HTML/CSS. No framework. No build.

Content:
- **Hero**: one-sentence pitch + CTA to the demo
- **The problem**: why preatorlabs exists
- **The method**: explanation of the 3 axes + ablation
- **How to read the results**: a reading guide
- **Demo**: anchor to the live section

### 2. Demo (`web/index.html`, section #demo)

Vanilla JS. Three sub-components:

#### 2a. `Segmenter` module

```javascript
const Segmenter = {
  segment(rawText) -> string[]
}
```

Implementation: algorithm described in `02-METHODOLOGY.md` §1.

#### 2a-bis. Criteria preview (`renderCriteriaPreview`)

Before launch, the configuration panel displays the rules that will be applied:

```javascript
function renderCriteriaPreview() {
  const criteria = compileCriteria(getCriteriaRaw(), nonEmpty(state.segments));
  // List structuralRules / behavioralRules with an auto | manual badge
}
```

Triggers: segmentation, segment editing, auto-struct/auto-behav toggles, manual fields (length, terms, etc.). Goal: traceability of the active rules without launching the analysis.

#### 2b. `Scorer` module

```javascript
const Scorer = {
  structural(output, criteria) -> { score: number|null, applicable: boolean },
  behavioral(output, criteria) -> { score: number|null, applicable: boolean },
  semantic(outputA, outputB, provider) -> { delta: number|null, applicable: boolean, provider: string }
}
```

Notes:
- `structural`: local parsing in JS, zero cost.
- `behavioral`: string / regex matching, zero cost.
- `semantic`: switchable provider. V0.3 keeps local TF-IDF (free) and adds Voyage AI (optional) with an explicit fallback to TF-IDF if the call fails.

#### 2c. `AblationEngine` module

```javascript
const AblationEngine = {
  async run({ segments, scenarios, criteria, apiKey, model }) -> Results
}
```

Pseudo-code:

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
      struct: abs(Scorer.structural(baselines[j], criteria).score - Scorer.structural(outputs[j], criteria).score),
      behav: abs(Scorer.behavioral(baselines[j], criteria).score - Scorer.behavioral(outputs[j], criteria).score),
      sem: Scorer.semantic(baselines[j], outputs[j], provider).delta
    }));
    
    results.push(aggregateSegment(i, deltas));
  }
  
  return results;
}
```

Concurrency: API calls in parallel per scenario. Anthropic supports 5 req/s on Tier 1 — beyond that, sequential batching.

#### 2d. `Renderer` module

```javascript
const Renderer = {
  drawVarianceChart(results, canvas),
  drawAxesBreakdown(results, container),
  drawSynthesis(results, container)
}
```

External dependency: Chart.js (UMD via CDN).

## Data contracts

### `Segment`
```typescript
type Segment = {
  id: string;           // "S1", "S2", ...
  text: string;         // the segment text
  label?: string;       // generated label
}
```

### `Scenario`
```typescript
type Scenario = {
  id: string;           // "T1", "T2", ...
  input: string;        // the user input
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
  // semantic: no config in mode B
}
```

### `SegmentResult`
```typescript
type SegmentResult = {
  id: string;
  label: string;
  impact: number;       // [0, 1]
  variance: number;     // [0, 1]
  activation?: {
    overall: number | null;
    struct: number | null;
    behav: number | null;
    sem: number | null;
  };
  struct: number;       // [0, 1]
  behav: number;        // [0, 1]
  sem: number;          // [0, 1]
  verdict: 'critical' | 'high' | 'context' | 'low' | 'placebo';
  perScenario: {
    scenarioId: string;       // "T1", "T2", ...
    input: string;            // user scenario
    baselineOutput: string;   // full-prompt output
    ablatedOutput: string;    // output without the current segment
    axisDelta: {              // absolute deltas for this scenario
      struct: number;
      behav: number;
      sem: number;
    };
  }[];
}
```

## Local storage

`localStorage` is used for:
- `preatorlabs.apiKey` — the user's Anthropic key (never sent to a third-party server)
- `preatorlabs.voyageApiKey` — Voyage key (if the Voyage provider is enabled)
- `preatorlabs.lastPrompt` — last analysed prompt (for resuming)
- `preatorlabs.lastResults` — last results

**The project has no backend.** All the logic runs in the browser. This is a privacy-by-design choice: the prompt and the results never leave the user's machine, except towards the target LLM's API.

## Security

- The user's API key is never logged, never sent anywhere but to Anthropic.
- `localStorage` is isolated by origin — no cross-site exfiltration.
- The user can erase the key with one click via the UI.

Assumed limit: a malicious script injected into the page (XSS) could read `localStorage`. Mitigation: no user-generated content rendered as raw HTML, strict CSP recommended for deployment.

## V2 (planned)

Addition of an optional Python engine for large batches:

```
engine/
├── preatorlabs.py        # reference engine
├── scorers/
│   ├── structural.py
│   ├── behavioral.py
│   └── semantic.py       # embeddings via Voyage AI or local sentence-transformers
└── cli.py                # CLI entrypoint
```

Normalised JSON output, importable into the web app.

## V3 (considered)

Multi-LLM support: adapters for OpenAI, Gemini, Mistral. Common `LLMAdapter` interface. Allows comparing the conformance of the same prompt across several models.
