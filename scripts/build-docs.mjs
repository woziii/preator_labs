// Build static HTML doc pages from the markdown sources.
// FR sources: docs/<NN-NAME>.md  -> web/docs/<fr-slug>.html
// EN sources: docs/en/<NN-NAME>.md -> web/en/docs/<en-slug>.html
// Content is baked server-side (no client-side fetch) for SEO.
//
// Usage: node scripts/build-docs.mjs

import { marked } from 'marked';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const SITE = 'https://preatorlabs.dev';

const DOCS = [
  {
    src: '01-SCIENTIFIC-RATIONALE.md',
    fr: { slug: 'rationale-scientifique', label: 'Rationale scientifique',
      desc: "Pourquoi preatorlabs existe et pourquoi la méthode d'ablation multi-axes a été retenue : problème, contrainte boîte noire, méthodes écartées et limites assumées." },
    en: { slug: 'scientific-rationale', label: 'Scientific rationale',
      desc: 'Why preatorlabs exists and why the multi-axis ablation method was chosen: the problem, the black-box constraint, rejected methods and assumed limits.' },
  },
  {
    src: '02-METHODOLOGY.md',
    fr: { slug: 'methodologie', label: 'Méthodologie',
      desc: 'Le workflow scientifique de preatorlabs, étape par étape : segmentation, scénarios, boucle d\'ablation, deltas par axe, agrégation et verdicts.' },
    en: { slug: 'methodology', label: 'Methodology',
      desc: "preatorlabs' scientific workflow step by step: segmentation, scenarios, ablation loop, per-axis deltas, aggregation and verdicts." },
  },
  {
    src: '03-ARCHITECTURE.md',
    fr: { slug: 'architecture', label: 'Architecture',
      desc: 'Architecture technique de preatorlabs : modules navigateur (Segmenter, Scorer, AblationEngine, Renderer), contrats de données, stockage local et sécurité.' },
    en: { slug: 'architecture', label: 'Architecture',
      desc: 'preatorlabs technical architecture: browser modules (Segmenter, Scorer, AblationEngine, Renderer), data contracts, local storage and security.' },
  },
  {
    src: '04-INTERPRETATION-GUIDE.md',
    fr: { slug: 'guide-interpretation', label: "Guide d'interprétation",
      desc: 'Comment lire un rapport preatorlabs et en tirer des décisions : tableau de lecture, pièges, décomposition 3-axes, verdicts placebo et contextuel.' },
    en: { slug: 'interpretation-guide', label: 'Interpretation guide',
      desc: 'How to read a preatorlabs report and turn it into prompt-editing decisions: quick reading table, pitfalls, 3-axis breakdown, placebo and contextual verdicts.' },
  },
  {
    src: '05-ROADMAP.md',
    fr: { slug: 'roadmap', label: 'Roadmap',
      desc: 'État actuel et étapes à venir de preatorlabs : de la V0.1 à la V4, et ce qui est explicitement hors-scope.' },
    en: { slug: 'roadmap', label: 'Roadmap',
      desc: 'Current status and upcoming milestones for preatorlabs: from V0.1 to V4, and what is explicitly out of scope.' },
  },
];

const T = {
  fr: {
    htmlLang: 'fr', ogLocale: 'fr_FR',
    docsLabel: 'documentation',
    back: '\u2190 accueil', demo: 'démo', source: 'source .md',
    titleSuffix: 'Documentation preatorlabs',
    home: '/', demoHref: '/#demo',
    docPath: (slug) => `/docs/${slug}`,
    rawPath: (src) => `/docs/${src}`,
  },
  en: {
    htmlLang: 'en', ogLocale: 'en_US',
    docsLabel: 'documentation',
    back: '\u2190 home', demo: 'demo', source: 'source .md',
    titleSuffix: 'preatorlabs documentation',
    home: '/en/', demoHref: '/en/#demo',
    docPath: (slug) => `/en/docs/${slug}`,
    rawPath: (src) => `/en/docs/${src}`,
  },
};

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Rewrite links to *.md sources towards the clean slug of the current language.
function makeRenderer(lang) {
  const bySrc = new Map(DOCS.map((d) => [d.src, d]));
  const renderer = new marked.Renderer();
  renderer.link = function ({ href, title, text }) {
    let resolved = href;
    if (href && !/^https?:|^#|^mailto:/.test(href)) {
      const name = href.split('/').pop();
      if (bySrc.has(name)) resolved = T[lang].docPath(bySrc.get(name)[lang].slug);
    }
    const t = title ? ` title="${esc(title)}"` : '';
    return `<a href="${resolved}"${t}>${text}</a>`;
  };
  return renderer;
}

const STYLE = `* { margin: 0; padding: 0; box-sizing: border-box; }
:root {
  --bg: #f5f3ee;
  --bg-2: #ebe7dd;
  --ink: #1a1a18;
  --ink-soft: #4a4842;
  --ink-mute: #6e6c64;
  --rule: rgba(26, 26, 24, 0.12);
  --rule-strong: rgba(26, 26, 24, 0.25);
  --accent: #c44322;
  --accent-soft: #f4d9cf;
}
html { scroll-behavior: smooth; }
body {
  background: var(--bg);
  color: var(--ink);
  font-family: 'Inter Tight', system-ui, sans-serif;
  line-height: 1.65;
  font-size: 16px;
}
.shell { max-width: 1180px; margin: 0 auto; padding: 0 32px; }
@media (max-width: 720px) { .shell { padding: 0 20px; } }
.topbar {
  border-bottom: 1px solid var(--rule);
  padding: 18px 0;
  position: sticky;
  top: 0;
  background: rgba(245, 243, 238, 0.92);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  z-index: 100;
}
.topbar-inner { display: flex; justify-content: space-between; align-items: center; gap: 16px; flex-wrap: wrap; }
.brand {
  font-family: 'Fraunces', serif;
  font-weight: 500;
  font-size: 22px;
  letter-spacing: -0.02em;
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--ink);
  text-decoration: none;
}
.brand-mark {
  width: 26px; height: 26px;
  border-radius: 50%;
  border: 1.5px solid var(--ink);
  position: relative;
  flex-shrink: 0;
}
.brand-mark::after {
  content: '';
  position: absolute;
  inset: 6px;
  background: var(--accent);
  border-radius: 50%;
}
.topbar-actions { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.topbar-actions a {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  text-decoration: none;
  color: var(--ink-soft);
  background: transparent;
  border: 1px solid var(--rule-strong);
  padding: 6px 12px;
  transition: color 0.2s, border-color 0.2s;
}
.topbar-actions a:hover { color: var(--ink); border-color: var(--ink); }
.lang-toggle { display: inline-flex; align-items: center; border: 1px solid var(--rule-strong); border-radius: 999px; overflow: hidden; font-family: 'JetBrains Mono', monospace; font-size: 11px; letter-spacing: 0.06em; line-height: 1; }
.lang-toggle a, .lang-toggle span { display: inline-flex; align-items: center; padding: 5px 9px; color: var(--ink-mute); text-decoration: none; transition: background 0.18s, color 0.18s; }
.lang-toggle a:hover { color: var(--ink); }
.lang-toggle .is-active { background: var(--accent); color: #fff; font-weight: 600; }
.i18n-note { background: var(--accent-soft); border: 1px solid var(--rule); border-radius: 8px; font-size: 13px; line-height: 1.55; color: var(--ink-soft); padding: 10px 14px; margin-bottom: 24px; }
.i18n-note a { color: var(--accent); text-decoration: underline; text-underline-offset: 2px; }
.doc-layout {
  display: grid;
  grid-template-columns: 240px 1fr;
  gap: 48px;
  padding: 48px 0 96px;
  align-items: start;
}
@media (max-width: 900px) {
  .doc-layout { grid-template-columns: 1fr; gap: 28px; }
  .doc-nav { position: static !important; }
}
.doc-nav { position: sticky; top: 88px; }
.doc-nav-label {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--accent);
  margin-bottom: 14px;
}
.doc-nav a {
  display: block;
  font-size: 14px;
  color: var(--ink-soft);
  text-decoration: none;
  padding: 8px 0;
  border-bottom: 1px solid var(--rule);
  transition: color 0.2s;
}
.doc-nav a:hover { color: var(--ink); }
.doc-nav a.is-active { color: var(--ink); font-weight: 500; }
.doc-main { min-width: 0; }
.md-prose { max-width: 720px; }
.md-prose h1 {
  font-family: 'Fraunces', serif;
  font-weight: 500;
  font-size: clamp(28px, 4vw, 36px);
  letter-spacing: -0.02em;
  line-height: 1.2;
  margin-bottom: 20px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--rule);
}
.md-prose h2 {
  font-family: 'Fraunces', serif;
  font-weight: 500;
  font-size: 22px;
  letter-spacing: -0.01em;
  margin: 40px 0 14px;
  padding-top: 8px;
}
.md-prose h3 { font-family: 'Fraunces', serif; font-weight: 500; font-size: 18px; margin: 28px 0 10px; }
.md-prose h4 { font-size: 15px; font-weight: 600; margin: 20px 0 8px; color: var(--ink-soft); }
.md-prose p { margin-bottom: 14px; color: var(--ink-soft); }
.md-prose blockquote {
  border-left: 2px solid var(--accent);
  padding: 4px 0 4px 18px;
  margin: 20px 0;
  color: var(--ink-soft);
  font-style: italic;
}
.md-prose ul, .md-prose ol { margin: 0 0 16px 22px; color: var(--ink-soft); }
.md-prose li { margin-bottom: 6px; }
.md-prose li > ul, .md-prose li > ol { margin-top: 6px; margin-bottom: 0; }
.md-prose a { color: var(--accent); text-decoration: underline; text-underline-offset: 3px; }
.md-prose a:hover { color: var(--ink); }
.md-prose strong { color: var(--ink); font-weight: 600; }
.md-prose hr { border: none; border-top: 1px solid var(--rule); margin: 32px 0; }
.md-prose code {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.88em;
  background: var(--bg-2);
  padding: 2px 6px;
  border-radius: 2px;
  color: var(--ink);
}
.md-prose pre {
  background: var(--bg-2);
  border: 1px solid var(--rule);
  padding: 16px 18px;
  overflow-x: auto;
  margin: 16px 0 20px;
  font-size: 13px;
  line-height: 1.55;
}
.md-prose pre code { background: none; padding: 0; font-size: inherit; }
.md-prose table { width: 100%; border-collapse: collapse; margin: 20px 0 24px; font-size: 14px; }
.md-prose th, .md-prose td { border: 1px solid var(--rule-strong); padding: 10px 14px; text-align: left; vertical-align: top; }
.md-prose th { background: var(--bg-2); font-weight: 600; color: var(--ink); }
.md-prose td { color: var(--ink-soft); }
.md-prose img { max-width: 100%; height: auto; }`;

function langSwitch(lang, doc) {
  const frUrl = T.fr.docPath(doc.fr.slug);
  const enUrl = T.en.docPath(doc.en.slug);
  if (lang === 'fr') {
    return `<span class="lang-toggle" role="group" aria-label="Langue">
        <span class="is-active" aria-current="true">FR</span>
        <a href="${enUrl}" hreflang="en" lang="en">EN</a>
      </span>`;
  }
  return `<span class="lang-toggle" role="group" aria-label="Language">
        <a href="${frUrl}" hreflang="fr" lang="fr">FR</a>
        <span class="is-active" aria-current="true">EN</span>
      </span>`;
}

function navLinks(lang, activeSrc) {
  return DOCS.map((d) => {
    const href = T[lang].docPath(d[lang].slug);
    const cls = d.src === activeSrc ? ' class="is-active"' : '';
    return `      <a href="${href}"${cls}>${esc(d[lang].label)}</a>`;
  }).join('\n');
}

function renderPage(lang, doc, contentHtml) {
  const t = T[lang];
  const meta = doc[lang];
  const canonical = `${SITE}${t.docPath(meta.slug)}`;
  const frUrl = `${SITE}${T.fr.docPath(doc.fr.slug)}`;
  const enUrl = `${SITE}${T.en.docPath(doc.en.slug)}`;
  const title = `${meta.label} · ${t.titleSuffix}`;
  const i18nNote = lang === 'en'
    ? `<div class="i18n-note" role="note">Originally written in French. This English version is a translation and may contain minor imperfections. <a href="${T.fr.docPath(doc.fr.slug)}" hreflang="fr" lang="fr">View the original (FR)</a>.</div>\n`
    : '';
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    headline: meta.label,
    description: meta.desc,
    inLanguage: lang,
    url: canonical,
    author: { '@type': 'Organization', name: 'preatorlabs' },
    publisher: { '@type': 'Organization', name: 'preatorlabs', logo: { '@type': 'ImageObject', url: `${SITE}/og-image.png` } },
    isPartOf: { '@type': 'WebSite', url: `${SITE}/` },
  };

  return `<!DOCTYPE html>
<html lang="${t.htmlLang}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(meta.desc)}">
<meta name="theme-color" content="#1a1a18">
<meta name="color-scheme" content="light">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="canonical" href="${canonical}">
<link rel="alternate" hreflang="fr" href="${frUrl}">
<link rel="alternate" hreflang="en" href="${enUrl}">
<link rel="alternate" hreflang="x-default" href="${frUrl}">

<meta property="og:type" content="article">
<meta property="og:site_name" content="preatorlabs">
<meta property="og:title" content="${esc(meta.label)} \u00b7 preatorlabs">
<meta property="og:description" content="${esc(meta.desc)}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${SITE}/og-image.png">
<meta property="og:locale" content="${t.ogLocale}">

<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(meta.label)} \u00b7 preatorlabs">
<meta name="twitter:description" content="${esc(meta.desc)}">
<meta name="twitter:image" content="${SITE}/og-image.png">

<script type="application/ld+json">
${JSON.stringify(ld, null, 2)}
</script>

<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500&family=JetBrains+Mono:wght@400;500&family=Inter+Tight:wght@400;500&display=swap" rel="stylesheet">
<style>
${STYLE}
</style>
</head>
<body>

<header class="topbar">
  <div class="shell topbar-inner">
    <a class="brand" href="${t.home}">
      <span class="brand-mark" aria-hidden="true"></span>
      preatorlabs
    </a>
    <div class="topbar-actions">
      <a href="${t.home}">${esc(t.back)}</a>
      <a href="${t.demoHref}">${esc(t.demo)}</a>
      <a href="${t.rawPath(doc.src)}" download>${esc(t.source)}</a>
      ${langSwitch(lang, doc)}
    </div>
  </div>
</header>

<div class="shell doc-layout">
  <nav class="doc-nav" aria-label="${lang === 'fr' ? 'Documentation' : 'Documentation'}">
    <div class="doc-nav-label">${esc(t.docsLabel)}</div>
${navLinks(lang, doc.src)}
  </nav>

  <main class="doc-main">
    ${i18nNote}<article class="md-prose">
${contentHtml}
    </article>
  </main>
</div>

</body>
</html>
`;
}

function build(lang) {
  marked.setOptions({ gfm: true, breaks: false });
  const renderer = makeRenderer(lang);
  const srcDir = lang === 'fr' ? path.join(ROOT, 'docs') : path.join(ROOT, 'docs', 'en');
  const outDir = lang === 'fr'
    ? path.join(ROOT, 'web', 'docs')
    : path.join(ROOT, 'web', 'en', 'docs');
  fs.mkdirSync(outDir, { recursive: true });

  let count = 0;
  for (const doc of DOCS) {
    const mdPath = path.join(srcDir, doc.src);
    if (!fs.existsSync(mdPath)) {
      console.warn(`[skip ${lang}] missing source: ${mdPath}`);
      continue;
    }
    const md = fs.readFileSync(mdPath, 'utf8');
    const contentHtml = marked.parse(md, { renderer });
    const html = renderPage(lang, doc, contentHtml);
    const outPath = path.join(outDir, `${doc[lang].slug}.html`);
    fs.writeFileSync(outPath, html, 'utf8');
    console.log(`[${lang}] ${doc.src} -> ${path.relative(ROOT, outPath)}`);
    count++;
  }
  return count;
}

const langs = process.argv.slice(2).length ? process.argv.slice(2) : ['fr', 'en'];
let total = 0;
for (const lang of langs) {
  if (!T[lang]) { console.error(`unknown lang: ${lang}`); continue; }
  total += build(lang);
}
console.log(`\nDone: ${total} page(s) generated.`);
