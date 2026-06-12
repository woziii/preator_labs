# 04 — Interpretation guide

> How to read a preatorlabs report and draw prompt-editing decisions from it.

**Reminder:** this guide does not redefine the calculations. Protocol and formulas → `02-METHODOLOGY.md` §3–7; site presentation → sections `#method` (aggregation), `#howto` (operations), `#reading` (decision).

## The 30-second reading table

| You see… | The segment is… | What to do |
|---|---|---|
| High impact + low variance + strong activation | **critical** | do not touch |
| Medium-high impact + low variance + solid activation | **high impact** | modify with caution |
| High variance **or** activation &lt; 50% (impact ≥ 15%) | **contextual** (safety net) | keep — do not confuse low mean impact with uselessness |
| Low impact + low variance + stable activation | **low** | check for redundancies, maybe remove |
| Near-zero impact | **placebo** | safe to remove, unless intentional decoration |

**Rules and activation:** see the config preview (`auto` / `manual` rules) and the `activationRate` metric in `02-METHODOLOGY.md` §6–7. Do not interpret a low mean impact without looking at variance and activation.

## The classic pitfall: the one-off segment

The most frequent pitfall is to **remove a seemingly useless segment** when it only helps in one scenario out of six.

Example: a narrative prompt contains "Avoid genre clichés: no vampires, no zombies." Over 4 tested themes (library, gas station, child, clock), removing this segment:
- changes nothing on 3 themes
- makes a classic ghost appear on the 4th

The **mean impact score** is low. But the **variance** is very high. The verdict is **contextual**, and the correct reading is: "this segment is a one-off safety net — it does not help often, but when it does, it avoids a catastrophe."

This is exactly what the error bar in the variance chart reveals. **Variance is the most precious information the tool provides.**

## Reading the 3-axis breakdown

When a segment has a total impact of 50%, the question is not only "how much it counts" but "**where** it counts". The per-axis breakdown gives the answer.

### Typical profiles

**Purely structural profile** (struct = 80%, behav = 0%, sem = 10%)
→ It is a format rule (length, syntax, JSON). Modifying it has an immediate effect on parsability.

**Purely behavioural profile** (struct = 0%, behav = 60%, sem = 20%)
→ It is a business rule (list of forbidden terms, trigger conditions). Modifying it affects rule conformance.

**Purely semantic profile** (struct = 0%, behav = 0%, sem = 55%)
→ It is a style or persona rule. Modifying it affects the tone without touching substantive conformance.

**Hybrid profile** (struct = 30%, behav = 40%, sem = 30%)
→ A versatile segment carrying several intentions. Rewriting it requires preserving the three roles.

### The redistribution rule

If you remove a segment with a pure semantic profile, the other semantic-profile segments will **probably take over part of its role** (LLMs are robust). It is the opposite for pure structural profiles: removing them often breaks the format immediately.

## Reading the "placebo" verdict

The "placebo" verdict is the most unexpected and the most revealing. It means: this segment is **not taken into account** by the LLM, even though it is explicitly phrased.

Typical causes:
- **Introspection sentence** ("Before each answer, run this 4-step mental procedure") — an LLM does not run an internal procedure, it generates token by token. These sentences reassure the writer but are decoration.
- **Rewrite of something already covered** — the rule is already carried by other, more salient segments.
- **Too-abstract sentence** — "be authentic", "be empathetic" without an operational definition.

Recommended action on a placebo: **either remove it**, **or rephrase it** as a verifiable operational rule.

## Reading the "counterproductive" verdict (V2+)

In V1, the main metric is `|delta|` (absolute value). In V2, the sign will be kept: a segment whose removal *improves* the score is counterproductive. It is rare but real — typically a sentence that produces the opposite of the intended effect (for example, explicitly asking "do not mention X" can make X appear in some contexts — the "pink elephant" effect).

## Cross-LLM comparison (V3)

When the tool supports several LLMs, the same prompt will produce different reports depending on the target model. This is expected and useful:
- **universal** segments: critical on all LLMs
- **model-specific** segments: critical on Claude, placebo on GPT-4 (or vice versa)

The comparison makes it possible to rewrite a more portable prompt, by converting model-specific segments into universal phrasings.

## Interpretation anti-patterns

To avoid:

❌ **"Segment X has a score of 0.18 so it is useless."** → check the variance first. A 0.18 with variance 0.40 is contextual, not useless.

❌ **"Segment X is critical on Claude so it is critical everywhere."** → V1 only measures a single LLM. Generalisation is a hypothesis, not a fact.

❌ **"Segment X and segment Y each have a low impact, so we can remove both."** → simple ablation does not detect coalitions. Two redundant segments each have a low impact, but removing them together can break the prompt. To be checked by a manual combined ablation.

❌ **"The report says this segment is placebo, so I remove it."** → check that the chosen scenarios indeed cover the cases where this segment was supposed to act. An apparent placebo may be a vital segment on a scenario absent from the test set.
