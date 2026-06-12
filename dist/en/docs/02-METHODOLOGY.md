# 02 — Methodology

> preatorlabs' scientific workflow, step by step, from inputs to verdict.

## Overview

```
Raw prompt
    │
    ▼
[1] Automatic segmentation
    │
    ▼
[2] Scenario + rule configuration (manual + auto)
    │
    ▼
[3] Baseline generation (T=0)
    │
    ▼
[4] Ablation loop (N × M calls)
    │
    ▼
[5] Per-axis delta computation
    │
    ▼
[6] Aggregation: active axes + impact + variance + activation
    │
    ▼
[7] Classification: per-segment verdict
    │
    ▼
[8] Visual rendering
```

## [1] Segmentation

### Goal

Split the raw prompt into coherent logical units, granular enough to allow attributing an effect, but not so granular as to produce noise (a single-word segment has no measurable effect).

### V1 algorithm (heuristic)

```
def auto_segment(text):
    # Step A: split on double line break (paragraphs)
    blocks = split(text, /\n\s*\n+/)
    
    # Step B: detect ALL-CAPS titles on their own line
    # A title becomes the start of a new segment
    refined = []
    for block in blocks:
        for line in block.split('\n'):
            if is_title(line):  # uppercase, 3-80 chars
                refined.append(current); current = [line]
            else:
                current.append(line)
        refined.append(current)
    
    # Step C: merge fragments that are too short with their neighbour
    return merge_short(refined, min_chars=20)
```

### V2 algorithm (considered)

Embedding-clustering segmentation: split sentence by sentence, embed, and group semantically adjacent sentences. More robust on poorly formatted prompts. Out of scope for V1.

### User control

Automatic segmentation is **proposed, not imposed**. The user sees the split and can edit each segment, merge some, delete some. The contract: preatorlabs proposes a reasonable split, the user remains in control of the final granularity.

## [2] Configuration

### Test scenarios (M)

Typical user inputs. Recommendation: **5 to 8 scenarios** covering the prompt's main use cases. Too few → variance is poorly estimated. Too many → cost explodes without proportional gain.

### Rules for the 3 axes

**Structural** — verifiable and traceable rules:
- length ≤ N words **or** ≤ N lines
- absence of a character/pattern (e.g. `*`, Markdown lists, emoji)
- presence of an expected structure (valid JSON, required keys)
- presence of an imposed sentence (`end with "..."`)
- numeric threshold extracted from the prompt (`no more than 20€`)

#### Robust auto-extraction (V0.4, Batch B)

Structural auto-extraction has been hardened to stop missing constraints that were nonetheless explicit:

- **Length**: the number is now detected regardless of word order in the line, as soon as a limiting word is present (`max`, `maximum`, `under`, `no more than`, `at most`, `up to`, `does not exceed`, `fewer than`, `≤`, `<=`). Thus `« Keep your answers under 200 words »`, `« 6 words max »` or `« 15 words maximum »` produce a `max_words` rule. The same logic applies to lines (`max_lines`).
- **Concrete prohibitions**: a prohibitive phrasing (`forbidden`, `never`, `avoid`, `no`, `without`, `none`, `do not`, …) bearing on a measurable object generates a checkable rule: `no_asterisk`, `no_list`, `no_emoji`. Safeguard: a **non**-prohibitive phrasing triggers nothing (`« Use bullet lists »` does not create `no_list`).

**Assumed measurement change**: this hardening now triggers structural/behavioural rules that went unnoticed before. Direct consequence: on some runs, the struct/behav scores (and therefore the aggregated impact and the verdicts) may change compared with earlier versions. This is the intended effect — reducing the dominance of the semantic axis — not a regression.

**Assumed limit**: an **abstract** prohibition (`« no hollow superlatives »`, `« stay non-judgemental »`) is not measurable by lexical matching; it remains carried by the semantic axis. Only concrete constraints (asterisks, lists, emoji, exact sentences, length) become structural.

**User contract preserved**: auto-extracted rules remain **proposed, not imposed**. They are visible and editable in the criteria preview (`renderCriteriaPreview`) before launching.

**Behavioural** — lexical detection:
- forbidden terms (list of strings)
- expected terms (list of strings)
- business regex patterns
- informal/formal address explicitly requested

**Semantic** — cosine distance:
- `tfidf_local` mode (free): direct comparison of full output vs ablated output
- `voyage_api` mode (paid, optional): Voyage embeddings + cosine

## [3] Baseline generation

For each scenario `Tj` (1 ≤ j ≤ M), the output is generated **with the full prompt**:

```
O(full, Tj) = LLM(system=full_prompt, user=Tj, temperature=0)
```

This is the reference output. Its conformance to the 3 axes defines the baseline score `B(Tj) ∈ [0, 1]^3`.

## [4] Ablation loop

For each segment `Si` (1 ≤ i ≤ N) and each scenario `Tj`:

```
prompt_without_Si = concatenate(segments \ {Si})
O(¬Si, Tj) = LLM(system=prompt_without_Si, user=Tj, temperature=0)
```

Total cost: `N × M + M` API calls.

Example: 12 segments × 6 scenarios = 78 calls.

## [5] Per-axis delta computation

For each triplet (segment Si, scenario Tj, axis a ∈ {struct, behav, sem}):

```
delta(i, j, a) = |score_a(O(full, Tj)) - score_a(O(¬Si, Tj))|
```

A null delta means it had no effect. When an axis is not computable on a scenario, it is marked **not applicable** (and excluded from that scenario's aggregation).

### Detail per axis

**Structural axis — boolean diff:**
```
score_struct(output) = sum(criterion(output) for criterion in struct_criteria) / num_criteria
```

**Behavioural axis — proportion of rules respected:**
```
score_behav(output) = matched_behav(output) / total_behav(output)
# if total_behav = 0 → not applicable
```

**Semantic axis — cosine:**
```
score_sem(output, baseline) = cosine_similarity(embed(output), embed(baseline))
```
In mode B: `score_sem` is computed on the *difference* between full and ablated output. The impact is therefore `1 - cos(O_full, O_¬Si)`.

## [6] Aggregation

For each segment Si:

```
impact(i, j) = average of deltas over applicable axes only
total_impact(i) = mean_j(impact(i, j))
variance(i) = std_j(impact(i, j))
activation(i) = ratio_j(impact(i, j) >= threshold)
```

V0.3 avoids dilution by dormant axes: no fixed average over 3 axes when an axis is not applicable.

### Reading layer (z, S/N, carrier axis, direction) — V0.4, Batch A

A **purely additive** layer re-presents the already-computed deltas to make the discrimination readable. It produces **no new measurement**: each figure is recomputable by hand (falsifiable), and alters neither `impact`, nor `variance`, nor the `verdict`. It is computed by `enrichResults(results)` (`results[i].stats` field) after aggregation.

| Indicator | Definition | Reading | Pitfall to avoid |
|---|---|---|---|
| `zImpact` (z) | deviation from the run mean, in σ | `z ≥ +1` = clearly above the other segments **of this prompt** | **relative to the run**: not comparable between two different prompts |
| `carrierAxis` / `carrierImpact` (carrier axis) | the strongest axis (struct/behav/sem), **undiluted** by the average | tells *where* the segment acts | a strong semantic carrier may be a mere rephrasing → confirm via outputs |
| `snr` (S/N) | impact / (variance + 0.05) | large = real and **stable** effect | a low S/N ≠ "useless", but "unstable / scenario-dependent" |
| `rankImpact` | impact rank (1 = the strongest) | sort the segments to look at first | a rank is only a relative order, not an amplitude |

**Direction (signed delta)** — `directionOf(structSignedMean, behavSignedMean)` exploits the fact that the structural and behavioural axes are **bounded and oriented** (the semantic axis, a distance without "common sense", stays unsigned). Convention:

- sign **> 0** ⇒ removing the segment **lowers** conformance ⇒ it `carries`;
- sign **< 0** ⇒ removing the segment **improves** conformance ⇒ it `harms` (direct signal);
- close to 0 ⇒ `neutral`;
- no struct/behav criterion configured ⇒ `non-measurable` (not to be confused with `neutral`).

`impact` remains the unchanged **absolute value**: the signed information is **additional**, it replaces nothing.

**Usage rule**: these indicators serve to **locate** which segments to inspect; any decision (especially a removal) must be **confirmed by reading the outputs** baseline vs ablated. Displaying this layer in the interface is **optional and off by default**, behind an explanatory note, to avoid over-interpretation.

## [7] Classification: per-segment verdict (5 levels, V0.3)

Order of evaluation in `classifyVerdict(impact, variance, activationRate)`:

| Verdict | Condition (summary) | Interpretation |
|---|---|---|
| **placebo** | impact &lt; 0.10 | Not taken into account by the LLM |
| **critical** | strong impact/activation + low variance | Fundamental, active everywhere |
| **high** | solid impact + sufficient activation + contained variance | Important, modify with caution |
| **context** | impact ≥ 0.15 **and** (variance ≥ 0.25 **or** activation &lt; 0.50) | One-off safety net or partial activation |
| **low** | impact &lt; 0.20, stable | Low impact, check for redundancies |

The **moderate** verdict (`mid`) was removed: cases with moderate impact but high variance or partial activation are classified **contextual**.

Code-aligned constant: `AXIS_ACTIVE_THRESHOLD = 0.30` for the activation calculation.

### Interpretation protocol

1. **Reliable mean impact** when variance is low and activation ≥ 50% → `critical` / `high` / `low` depending on amplitude.
2. **Variance or activation take priority** when the mean impact is misleading:
   - *Medical disclaimer*: imposed ending → structural axis active on few scenarios → `context` despite a modest mean impact.
   - *Price segment*: € threshold rule → partial activation depending on scenarios → `context`.
   - *Young-audience segment*: without manual markers, axes are often not applicable; add expected/forbidden terms to measure.
3. **Do not remove** a `context` segment based solely on a low mean impact.

These thresholds are **default heuristics**, empirically calibrated (Reachy prompt). Cross-model re-evaluation is planned in V0.4.

## [8] Visual rendering

Three elements:

1. **Variance chart**: bars per segment, height = mean impact, vertical bar = ±variance, colour = verdict.
2. **3-axis cards**: for each segment, breakdown of structural / behavioural / semantic impact + verdict + explanatory sentence.
3. **Global synthesis**: three lists — to keep, to watch, candidates for removal.
4. **Output drill-down (V0.2)**: in each segment card, a collapsible panel showing, scenario by scenario, the `baseline` vs `ablated output` (segment removed) comparison with a reminder of the axis deltas. The panel is hidden by default and rendered on demand (lazy render) to preserve performance and mobile readability.

## Reproducibility

A preatorlabs analysis is **reproducible** if:
- same prompt (segmentation included)
- same scenarios
- same LLM and same version
- T=0

The residual determinism of LLMs at T=0 (negligible on Claude) can be absorbed by n=3 repetitions in V2.

## Falsifiability

A preatorlabs verdict is **falsifiable** by independent test. To falsify a "placebo" verdict on a segment S:
1. Build two prompts: `P_with_S` and `P_without_S`.
2. Manually compare the outputs over the M scenarios.
3. If a systematic difference consistent with the intent of S is observed, the verdict is wrong.

This property is non-trivial: it distinguishes preatorlabs from an opaque score produced by a judge LLM.
