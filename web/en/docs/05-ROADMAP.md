# 05 — Roadmap

> Current state, next steps, and what is explicitly out of scope.

## V0.1 — Web MVP (deployed)

**Status: deployable.** Self-contained `dist/` folder ready for Vercel / Netlify / Cloudflare Pages (see `DEPLOY.md`).

- [x] Scientific presentation landing page
- [x] Automatic prompt segmentation (heuristic algorithm)
- [x] Manual editing of detected segments
- [x] Entry of test scenarios
- [x] Configuration of the 3-axis criteria
- [x] Ablation engine wired to the Claude API (key provided by the user)
- [x] Per-axis delta computation (structural, behavioural, semantic)
- [x] Visualisation: variance chart + 3-axis cards + synthesis
- [x] Local storage of the API key + results
- [x] Exponential backoff on 429 / 5xx / 529 (3 attempts, respecting `retry-after`)
- [x] Incremental save per call → resume without replaying what succeeded
- [x] Anthropic error messages translated into readable text (401, 429, 529, …)
- [x] Input validation (empty prompt, empty scenarios, prompt > 10k tokens)
- [x] Explicit confirmation if the analysis exceeds 150 API calls
- [x] Per-model $ cost estimate in the UI
- [x] Restrictive CSP + HTTPS headers via `vercel.json` / `netlify.toml` / `_headers`
- [x] Open Graph + Twitter Card meta + SVG favicon
- [x] Explicit privacy section + FAQ + 4-step "how it works" journey
- [x] Responsive 360 px → 1920 px, WCAG AA contrast
- [x] Branded 404 page
- [x] Complete documentation (rationale, methodology, architecture, interpretation, roadmap + 3 agent documents)

Intentionally out of scope for V0.1 (moved to V0.2 below): JSON export, import of a past analysis, per-scenario drill-down, combined ablation mode, signed counterproductivity.

## V0.2 — Robustness (short term)

Incremental improvements with no architectural change.

- [ ] JSON export of results (for archiving and comparison)
- [ ] Import of a previous analysis
- [x] Inline per-scenario output drill-down in the segment cards (baseline vs ablation comparison, collapsible panel, mobile-first)
- [ ] Refined calibration of verdict thresholds on a corpus larger than Reachy (observation 2026-05-26: on Haiku 4.5, 11 of 12 Reachy segments are classified "low" because the outputs are already very convergent; per-model normalisation or normalisation by the run's global variance to be considered — see `00-AGENT-SMOKE-TEST.md` §B.2)
- [ ] "Combined ablation" mode: remove 2 segments at once to detect coalitions
- [ ] Counterproductivity detection (signed delta, not absolute)
- [ ] OG image optimisation (get below 200 KB)
- [ ] Call compaction (controlled concurrency at 3-5 req/s, respectful of Anthropic)
- [ ] **Extraction of the inline `<script>` to `dist/app.js`** to remove `'unsafe-inline'` from `script-src` and return to a strict CSP (V0.1 had to keep `'unsafe-inline'` after the 2026-05-26 regression on Vercel — see `00-AGENT-SMOKE-TEST.md` §B.6). The operation is risk-free as long as no `innerHTML` with user-content is introduced into the HTML.

## V1 — Python reference engine

The browser JS engine has two limits: performance on large batches, and the quality of the semantic embedding (local TF-IDF in V0).

- [ ] `engine/preatorlabs.py` — standalone Python engine
- [ ] Real embeddings via Voyage AI (recommended) or local sentence-transformers
- [ ] CLI `preatorlabs analyze --prompt prompt.txt --scenarios scn.json`
- [ ] Normalised JSON output, compatible with the web app format
- [ ] Unit tests + integration tests on the Reachy corpus
- [ ] PyPI distribution

## V2 — Multi-turn and advanced features

- [ ] Multi-turn history scenarios (testable on prompts with conversational memory)
- [ ] Mode A for the semantic axis: reference corpus provided by the user
- [ ] Configurable weighting of the 3 axes
- [ ] n=3 repetition per ablation to absorb residual stochasticity
- [ ] Comparative analysis between two versions of the same prompt (semantic diff)

## V3 — Multi-LLM

- [ ] OpenAI adapter (GPT-4, GPT-4o, o3)
- [ ] Gemini adapter
- [ ] Mistral / Llama adapter via providers
- [ ] Unified `LLMAdapter` interface
- [ ] Comparative view: same prompt, several LLMs, cross-report
- [ ] Complementary logprobs signal when the API exposes it (OpenAI partially)

## V4 — Community and ecosystem

- [ ] Library of reference prompts (benchmarked commons)
- [ ] VSCode / Cursor plugin to analyse a prompt from the editor
- [ ] Hosted REST API (optional, for CI/CD integration)
- [ ] Translated documentation (EN minimum)

## Deliberate out-of-scope

These directions were considered and **explicitly set aside**:

❌ **LLM-as-judge** — no interpretive evaluation by a third-party LLM. The rigour of the method depends on this exclusion. See `01-SCIENTIFIC-RATIONALE.md` §3.

❌ **Full Shapley values** — untenable combinatorial cost. Possible as an advanced V4+ option with approximate sampling (Monte-Carlo Shapley), not on the main path.

❌ **Fine-tuning or learning** — preatorlabs is an analysis tool, not an automatic-modification tool. It helps the human decide, it does not decide. This boundary is deliberate.

❌ **Automatic prompt generation** — out of scope. Many tools already exist for that. preatorlabs solves a downstream problem: *understanding* an existing prompt.

## For future contributors

If you take over the project, here are the questions to ask before each PR:

1. **Does it preserve objectivity?** No interpretive metric.
2. **Does it preserve frugality?** No combinatorial blow-up.
3. **Does it preserve readability?** A non-expert must be able to read the report.
4. **Is it documented?** Every added method has its section in `02-METHODOLOGY.md`.
5. **Is it falsifiable?** A verdict produced by preatorlabs must be contradictable by an independent test.

If any of these answers is no, the change must be explicitly justified, otherwise refused.
