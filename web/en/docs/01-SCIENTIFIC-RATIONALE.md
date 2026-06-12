# 01 — Scientific rationale

> Why preatorlabs exists, and why the chosen method is this one and not another.

## 1. The problem

Prompt engineering is, today, empirical work. The standard cycle is:

1. Write a prompt
2. Inject it into the LLM
3. Test it on a few inputs
4. Adjust blindly

Step 4 is the problem. When a prompt performs poorly, **we have no idea which part of the prompt is responsible**. When it performs well, we have no idea which part actually carries the result. Modifying a prompt therefore amounts to randomly touching elements whose contribution is unknown.

This blur has three measurable consequences:
- **Regression**: you remove or change a seemingly decorative segment that was in fact critical.
- **Inflation**: you accumulate "just in case" sentences without knowing they are ignored by the model.
- **False positives**: you attribute to one sentence an effect that actually comes from another.

## 2. The black-box constraint

Commercial LLMs (Claude, GPT-4, Gemini…) are not inspectable. We have no access to the weights, the attention layers, or the internal propagation. The only thing we can observe is the **textual output** for a given input.

Any analysis method must therefore be derived from what can be measured at the surface, with no assumption about the internal mechanics.

## 3. Methods considered and discarded

Four methods were analysed. Three were rejected.

### Method A — Ask an LLM to judge the prompt

**Principle:** submit the prompt to a third-party LLM and ask it to rank its parts.

**Reason for rejection:** non-objective by construction. A "judge" LLM produces a plausible answer, not a measurement. The output depends on the LLM, on the wording of the instruction, and is not reproducible. This method is eliminated outright.

### Method B — Logprob analysis

**Principle:** some APIs (OpenAI partially) expose the probability associated with each generated token. Measure how this distribution changes depending on the presence or absence of a segment.

**Reason for rejection:**
- Claude does not expose it.
- Gemini does not expose it.
- OpenAI only exposes it partially (top-K only).

A method that excludes two of the three major LLMs is not universal. Set aside from the main path. It may return in V3 as a **complementary signal** when available.

### Method C — Shapley values (cooperative game analysis)

**Principle:** theoretically rigorous. A segment's marginal contribution is the average of its added value over **all possible combinations** of present/absent segments.

**Reason for rejection:** combinatorial complexity. With N segments, you need 2^N API calls. N=10 → 1024 calls per scenario. N=15 → 32,768 calls. Economically untenable, and the extra cost does not translate into a proportional quality gain on typical prompts (where inter-segment interactions are rare and weak).

### Method D — Simple ablation + cosine similarity

**Principle:** remove a segment, compare the embedding of the output with/without the segment, measure the distance.

**Reason for partial rejection:** cosine similarity measures **change**, not **quality**. A segment can strongly change the output while being counterproductive. Conversely, removing a bad segment can bring the output closer to a good result — the metric would then say it "counted".

This method is insufficient on its own but kept as **one of the three axes** in the retained method.

## 4. Retained method: multi-axis multi-scenario ablation

It is the combination that brings together the most advantages:

- **Objective**: parsable/computable measurements, never interpretive.
- **Universal**: depends only on the text output. Works on any LLM accessible by API.
- **Frugal**: N×M+M calls (N segments, M scenarios). Linear in N, not exponential.
- **Decomposable**: three orthogonal axes that answer different questions.
- **Discriminating**: the variance across scenarios separates fundamental segments from contextual ones.

### The three axes

| Axis | Question answered | Measurement method | Cost |
|---|---|---|---|
| **Structural** | Does the output respect the format? | parsing / regex / counting | none |
| **Behavioural** | Does the output follow the business rules? | lexical detection, exact match | none |
| **Semantic** | Are meaning and style preserved? | cosine distance on embeddings | very low |

### The multi-scenario design

A segment can be:
- **vital everywhere** (e.g. a format rule) → high impact, low variance
- **vital in a single case** (e.g. an anti-cliché rule that only helps on one theme) → medium impact, high variance
- **ignored** (e.g. a decorative sentence) → low impact, low variance
- **counterproductive** (rare) → negative impact if a signed metric is used

Without several scenarios, you confuse an *ignored segment* with a *one-off segment*. It is precisely the multi-scenario design that turns the tool from a coarse detector into a fine-grained debugger.

### Temperature = 0

All calls are made with `temperature = 0`. Justification: without it, the variance observed across scenarios mixes two signals:

1. variance due to ablation (the signal we want to isolate)
2. the stochastic variance of the LLM (the noise)

Setting the temperature to zero isolates the signal. For LLMs where T=0 remains slightly stochastic (Claude in particular), one can average over 2-3 runs per ablation in V2 if necessary.

## 5. What changes between V0.2 and V0.3

V0.3 does not change the project's philosophy (measurable ablation), but corrects biases observed in practice.

### 5.1 Biases observed in V0.2

1. **Dormant axes**: the structural/behavioural axis often stayed neutral for lack of activated criteria.
2. **Artificial dilution**: a fixed average over 3 axes, even when some axes were not applicable.
3. **Under-detection of one-off rules**: e.g. "Always end with …", barely visible through semantics alone.
4. **Abstract behaviour not operationalised**: e.g. "young audience" not measurable without explicit markers.

### 5.2 V0.3 fixes

1. **Deterministic auto-extraction of rules**
   - Structural: imposed ending, required sentence, length constraints, JSON, simple numeric thresholds.
   - Behavioural: explicit expected/forbidden terms, explicitly requested informal/formal address.
   - Extracted rules are traceable (`source: auto`), not inferred by judgement.

2. **`not applicable` state per axis**
   - An axis with no rule or no exploitable signal is no longer artificially scored.
   - It is excluded from that scenario's aggregation.

3. **Aggregation over active axes**
   - Scenario impact = average of deltas over applicable axes only.
   - Addition of an `activationRate` (global + per axis) to distinguish stable vs contextual signal.

4. **Switchable semantics**
   - `local TF-IDF` (free) or `Voyage API` (paid).
   - Same measurement mechanics (cosine), only the quality of the embedding changes.
   - Explicit fallback to TF-IDF if the external API fails.

### 5.3 Why it is scientifically more solid

- **Same observables, better instrumentation**: we do not add subjective judgement, we improve what is measured.
- **Fewer false "low impacts"**: the automatic division by 3 when 1-2 axes are inactive disappears.
- **Better local falsifiability**: an "imposed ending" rule is verifiable by direct inspection of the output.

### 5.4 Where to find the calculation details

| Need | Where to read |
|---|---|
| Principle + aggregation formula (overview) | Site `#method` |
| User journey (4 steps) | Site `#howto` + doc links |
| Reading results and verdicts | Site `#reading` |
| Workflow, scores, deltas, verdicts (complete) | `02-METHODOLOGY.md` |
| Interpretation and pitfalls | `04-INTERPRETATION-GUIDE.md` |

**V0.2 → V0.3 evolution (summary)**: auto/manual rules + not-applicable state; aggregation over active axes; activation in the verdict; five levels (merge `moderate` → `contextual`); preview of rules before a run.

## 6. Assumed limits (V0.3)

Every method has a domain of validity. Here are preatorlabs' explicit limits:

**Limit 1 — abstract criteria not operationalised.** An instruction like "adapt to a young audience" remains partly abstract until it is translated into markers (`expected/forbidden`). V0.3 allows this translation but does not invent it automatically without a risk of subjectivity.

**Limit 2 — interactions between segments.** Simple ablation does not capture coalition effects (two segments useless in isolation but critical together). To capture them, Shapley would be needed. The assumed trade-off: we cover 95% of cases at a negligible fraction of the cost.

**Limit 3 — single-turn scenarios.** For V1, the test scenarios are single inputs. Prompts that include rules about **conversational memory** (e.g. "if you were hurt 3 messages ago…") can only be fully tested in V2 with history-based scenarios.

**Limit 4 — residual stochasticity.** Even at T=0, some models retain variability (top-K sampling, race conditions). On Claude, it is marginal. For publication-grade results, plan for n=3 repetitions per ablation (V2+).

**Limit 5 — canonical regex extraction.** V0.3 auto-extraction covers explicit phrasings. An implicit or ambiguous phrasing may go undetected. Manual mode remains necessary for non-canonical cases.

**Limit 6 — cost/latency of the external semantic provider.** Voyage improves semantic precision, but introduces API cost and a network dependency. Local mode remains the frugal baseline.

## 7. What makes the method scientifically defensible

Three properties make it a measurement method and not a heuristic:

1. **Reproducibility**: with prompt, scenarios and model fixed, the result is deterministic (T=0).
2. **Falsifiability**: a verdict produced by preatorlabs can be contradicted by an independent test (manual or via another tool).
3. **Decomposability**: an impact score is never opaque. It breaks down into axes, scenarios, active rules and provenance (`manual`/`auto`).

This is what distinguishes preatorlabs from a "prompt quality score" produced by a third-party LLM.
