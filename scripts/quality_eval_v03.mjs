import fs from 'fs';
import vm from 'vm';
import assert from 'assert';

function loadEngineContext() {
  const html = fs.readFileSync('/Users/lucasmaurici/Downloads/PreatorLabs/web/index.html', 'utf8');
  const match = html.match(/<script>([\s\S]*)<\/script>/);
  if (!match) throw new Error('Script principal introuvable dans web/index.html');
  const scriptContent = match[1];

  const noopEl = () => ({
    checked: false,
    value: '',
    style: {},
    classList: { add() {}, remove() {}, toggle() {} },
    addEventListener() {},
    querySelectorAll() { return []; },
    querySelector() { return noopEl(); },
    appendChild() {},
    removeChild() {},
    setAttribute() {},
    innerHTML: '',
    textContent: '',
    hidden: false
  });

  const context = {
    console,
    setTimeout,
    clearTimeout,
    Math,
    Date,
    JSON,
    Promise,
    confirm: () => true,
    fetch: async () => {
      throw new Error('fetch non autorisé dans ce test offline');
    },
    Chart: function () {},
    document: {
      addEventListener() {},
      querySelector() { return noopEl(); },
      querySelectorAll() { return []; },
      createElement() { return noopEl(); },
      body: noopEl()
    },
    localStorage: {
      _s: new Map(),
      getItem(k) { return this._s.has(k) ? this._s.get(k) : null; },
      setItem(k, v) { this._s.set(k, String(v)); },
      removeItem(k) { this._s.delete(k); }
    }
  };

  vm.createContext(context);
  vm.runInContext(scriptContent, context);
  return context;
}

function approxEqual(a, b, eps = 1e-9) {
  return Math.abs(a - b) <= eps;
}

async function run() {
  const ctx = loadEngineContext();
  const results = [];

  // Test 1: auto-extraction structurelle (fin imposée + seuil prix)
  {
    const segments = [
      'Termine toujours par : "Cet avis ne remplace pas une consultation médicale."',
      'RÈGLE CRITIQUE : jamais recommander un vin à plus de 20€.'
    ];
    const rules = ctx.detectAutoStructuralRules(segments);
    const hasEnding = rules.some(r => r.type === 'must_end_with');
    const hasPriceCap = rules.some(r => r.type === 'max_eur' && r.value === 20);
    assert.ok(hasEnding, 'must_end_with non détecté');
    assert.ok(hasPriceCap, 'max_eur non détecté');
    results.push(['Auto-structural extraction', 'PASS']);
  }

  // Test 2: auto-extraction comportementale (tutoiement + interdits)
  {
    const segments = [
      'Ton langage doit être adapté à un public jeune.',
      'INTERDIT : "en tant qu\'IA"'
    ];
    const rules = ctx.detectAutoBehavioralRules(segments);
    const hasTutoiement = rules.some(r => r.type === 'tutoiement');
    const hasForbidden = rules.some(r => r.type === 'forbidden_term' && r.term.toLowerCase().includes("en tant qu'ia"));
    assert.ok(hasTutoiement, 'tutoiement non détecté');
    assert.ok(hasForbidden, 'forbidden_term non détecté');
    results.push(['Auto-behavioral extraction', 'PASS']);
  }

  // Test 3: score structurel disclaimer (baseline=1, ablé=0)
  {
    const phrase = 'Cet avis ne remplace pas une consultation médicale.';
    const criteria = {
      structuralRules: [{ type: 'must_end_with', phrase, enabled: true }],
      behavioralRules: [],
      semanticProvider: 'tfidf_local'
    };
    const baseline = `Conseil médical.\n${phrase}`;
    const ablated = 'Conseil médical.';
    const sBase = ctx.evalStructural(baseline, criteria);
    const sAbl = ctx.evalStructural(ablated, criteria);
    assert.ok(approxEqual(sBase.score, 1), 'baseline structurel devrait être 1');
    assert.ok(approxEqual(sAbl.score, 0), 'ablé structurel devrait être 0');
    results.push(['Disclaimer structural delta', 'PASS']);
  }

  // Test 4: non-applicable sur max_eur sans prix
  {
    const criteria = {
      structuralRules: [{ type: 'max_eur', value: 20, enabled: true }],
      behavioralRules: [],
      semanticProvider: 'tfidf_local'
    };
    const out = ctx.evalStructural('Je recommande un vin élégant.', criteria);
    assert.strictEqual(out.applicable, false, 'max_eur sans prix devrait être non applicable');
    assert.strictEqual(out.score, null, 'score attendu à null en non applicable');
    results.push(['Non-applicable handling', 'PASS']);
  }

  // Test 5: agrégation axes actifs (pas de division par 3)
  {
    const criteria = { structuralRules: [], behavioralRules: [], semanticProvider: 'tfidf_local' };
    const baselines = ['bonjour monde'];
    const outputs = ['bonjour univers'];
    const baselineScores = [{ struct: { score: null }, behav: { score: null } }];
    const seg = await ctx.aggregateSegment(
      0,
      ['Segment test'],
      ['Scenario test'],
      baselines,
      baselineScores,
      outputs,
      criteria,
      null
    );
    const semOnly = 1 - ctx.semanticSimilarity(baselines[0], outputs[0]);
    assert.ok(approxEqual(seg.impact, semOnly), 'impact devrait égaler delta sémantique seul');
    results.push(['Active-axis aggregation', 'PASS']);
  }

  // Test 6: classification 5 verdicts (ex-ancien mid → context)
  {
    assert.strictEqual(ctx.classifyVerdict(0.05, 0.05, 0.9), 'placebo');
    assert.strictEqual(ctx.classifyVerdict(0.65, 0.10, 0.7), 'critical');
    assert.strictEqual(ctx.classifyVerdict(0.50, 0.15, 0.5), 'high');
    assert.strictEqual(ctx.classifyVerdict(0.30, 0.10, 0.8), 'context', 'ancien mid stable → context');
    assert.strictEqual(ctx.classifyVerdict(0.25, 0.30, 0.6), 'context', 'variance haute → context');
    assert.strictEqual(ctx.classifyVerdict(0.20, 0.05, 0.4), 'context', 'activation partielle → context');
    assert.strictEqual(ctx.classifyVerdict(0.15, 0.05, 0.8), 'low');
    results.push(['Verdict classification (5 levels)', 'PASS']);
  }

  // Test 7: provider sémantique en fallback local si Voyage indisponible
  {
    const criteria = { structuralRules: [], behavioralRules: [], semanticProvider: 'voyage_api' };
    const res = await ctx.semanticDelta('a b c', 'a b d', criteria, 'fake-key');
    assert.ok(['tfidf_fallback', 'voyage_api'].includes(res.provider), 'provider inattendu');
    // Dans ce test offline fetch échoue => fallback attendu.
    assert.strictEqual(res.provider, 'tfidf_fallback', 'fallback TF-IDF attendu hors ligne');
    assert.ok(typeof res.delta === 'number', 'delta numérique attendu en fallback');
    results.push(['Semantic provider fallback', 'PASS']);
  }

  console.log('=== QUALITY EVAL V0.3 ===');
  for (const [name, status] of results) {
    console.log(`${status} - ${name}`);
  }
  console.log(`TOTAL: ${results.length} tests, 0 échec`);
}

run().catch((err) => {
  console.error('TEST FAILURE:', err && err.stack ? err.stack : String(err));
  process.exit(1);
});

