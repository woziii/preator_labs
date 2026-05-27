# DEPLOY.md

> Comment publier la V0.1 de preatorlabs.

preatorlabs est une SPA statique. Le dossier [`dist/`](dist/) est **autonome** : copie-le tel quel sur n'importe quel hébergeur statique et ça marche. Pas de build, pas de variable d'environnement, pas de backend.

---

## Pré-requis (toutes plateformes)

URL repo et domaine sont déjà câblés dans `dist/` :

- Repo GitHub : `https://github.com/woziii/preator_labs` (footer + FAQ de `dist/index.html`)
- Domaine cible : `preatorlabs.dev` (canonical, `og:url`, `sitemap.xml`, `robots.txt`)

Si tu publies sur un autre domaine, une seule commande à exécuter :
```bash
sed -i '' 's|preatorlabs.dev|ton-domaine.tld|g' dist/index.html dist/sitemap.xml dist/robots.txt
```

Aucune variable d'environnement n'est requise : tout tourne côté client. L'utilisateur final fournit sa propre clé API Anthropic via l'UI.

---

## Plateforme primaire — Vercel (recommandée)

`dist/vercel.json` est déjà configuré (CSP, cache, types MIME).

### Via CLI

```bash
npm i -g vercel        # une fois
cd dist
vercel deploy --prod
```

Choisis le scope, accepte les paramètres par défaut. Vercel détecte `vercel.json` automatiquement.

### Via le dashboard

1. Importer un projet → "Other / Static".
2. **Root Directory** : `dist`.
3. **Framework Preset** : `Other`.
4. **Build Command** : laisser vide.
5. **Output Directory** : `.` (point — Vercel sert le contenu du root directory tel quel).
6. Deploy.

### Vérification

```bash
curl -sI https://<ton-projet>.vercel.app/ | grep -i 'content-security-policy'
curl -sI https://<ton-projet>.vercel.app/favicon.svg | grep -i 'cache-control'
```

Tu dois voir la CSP avec `connect-src 'self' https://api.anthropic.com` et un `Cache-Control: public, max-age=31536000` sur le favicon.

---

## Alternative 1 — Netlify

`dist/netlify.toml` est déjà configuré (mêmes headers + redirect 404).

### Via CLI

```bash
npm i -g netlify-cli   # une fois
cd dist
netlify deploy --dir . --prod
```

### Via drag-and-drop

1. Aller sur https://app.netlify.com/drop
2. Glisser le dossier `dist/` entier.
3. Done.

### Via Git

1. Connecter le repo à Netlify.
2. **Base directory** : laisser vide.
3. **Publish directory** : `dist`.
4. **Build command** : laisser vide.

### Vérification

```bash
curl -sI https://<ton-projet>.netlify.app/ | grep -i 'content-security-policy'
```

---

## Alternative 2 — Cloudflare Pages

`dist/_headers` est déjà configuré (syntaxe Cloudflare native, identique à Netlify legacy).

### Via CLI (wrangler)

```bash
npm i -g wrangler      # une fois
cd dist
wrangler pages deploy . --project-name=preatorlabs
```

### Via le dashboard

1. Cloudflare Pages → Create a project → Direct Upload.
2. Upload le contenu de `dist/` (pas le dossier, son contenu).
3. Deploy.

### Connecter Git plus tard

- **Build command** : laisser vide.
- **Build output directory** : `dist`.
- **Root directory** : (laisser vide ou `/`).

### Vérification

```bash
curl -sI https://preatorlabs.pages.dev/ | grep -i 'content-security-policy'
```

---

## Tester en local

Aucune dépendance. Python 3 suffit :

```bash
cd dist
python -m http.server 8000
```

Puis http://localhost:8000/ — tu dois voir la landing, pouvoir cliquer "Charger l'exemple Reachy", obtenir 12 segments + 6 scénarios, et le cost-box doit afficher `78 appels API estimés · ~$X.XX`.

Alternative Node :

```bash
npx --yes http-server dist -p 8000 -c-1
```

---

## Smoke test en production (à exécuter après mise en ligne)

Sur un poste avec accès Internet et une clé API Anthropic de test :

1. Ouvrir l'URL de prod.
2. Vérifier que le SSL est vert (cadenas).
3. Vérifier dans DevTools → Network qu'aucune requête ne part vers un domaine autre que :
   - `<ton-domaine>` (HTML, CSS, JS, images, docs)
   - `fonts.googleapis.com` et `fonts.gstatic.com` (Fraunces / Inter Tight / JetBrains Mono)
   - `cdn.jsdelivr.net` (Chart.js)
4. Cliquer "Charger l'exemple Reachy", configurer une clé API valide, lancer l'analyse.
5. Vérifier que les appels sortants vont **uniquement** vers `api.anthropic.com`.
6. Attendre la complétion (~1-3 minutes selon le modèle), vérifier le graphique de variance + cartes 3-axes.
7. Recharger la page : clé conservée, derniers résultats restaurables, bandeau "reprendre" absent (puisque tout est terminé).
8. Tester l'erreur : remplacer la clé par `sk-ant-FAKE`, relancer. Message attendu : "Clé API invalide ou révoquée. Vérifie ta clé dans la modale 'configurer'."
9. Tester une 404 : `<ton-domaine>/page-qui-existe-pas` → page 404 propre avec lien retour.
10. Vérifier les headers de prod :
    ```bash
    curl -sI https://<ton-domaine>/ | grep -iE 'csp|strict-transport|x-content|referrer|permissions-policy'
    ```

Si l'un des points échoue → ne pas annoncer publiquement, debugger d'abord (cf. `docs/00-AGENT-AUDIT.md`).

---

## Mise à jour ultérieure

Pour publier une nouvelle version :

1. Modifier `web/index.html` (source de vérité).
2. Régénérer `dist/` :
   ```bash
   cp web/index.html dist/index.html
   cp web/favicon.svg dist/favicon.svg
   cp web/og-image.png dist/og-image.png
   cp docs/*.md dist/docs/
   cp docs/view.html dist/docs/view.html
   ```
3. Re-déployer (commande de la plateforme).

Les fichiers de config (`vercel.json`, `netlify.toml`, `_headers`, `404.html`, `robots.txt`, `sitemap.xml`) ne sont pas régénérés depuis `web/` ; ils vivent uniquement dans `dist/`.

---

## Ce qu'il ne faut **pas** faire

- ❌ Servir le site sans HTTPS — la CSP est conçue pour HTTPS et la clé API utilisateur ne doit jamais transiter en clair.
- ❌ Désactiver la CSP pour "déboguer plus vite". Si tu débugges, mets `Content-Security-Policy-Report-Only` temporairement.
- ❌ Ajouter un analytics / pixel tracking. La promesse privacy-by-design (cf. section `#privacy` du site) en dépend.
- ❌ Embarquer la clé API d'un compte de service. Chaque utilisateur fournit la sienne — c'est ce qui rend l'outil gratuit pour l'opérateur et privé pour l'utilisateur.
