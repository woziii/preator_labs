# 04 — Guide d'interprétation

> Comment lire un rapport preatorlabs et en tirer des décisions d'édition de prompt.

## Le tableau de lecture en 30 secondes

| Tu vois… | Le segment est… | Que faire |
|---|---|---|
| Impact haut + variance basse | **critique** | ne pas toucher |
| Impact moyen-haut + variance basse | **fort impact** | modifier avec prudence |
| Impact moyen + variance haute | **contextuel** (filet) | garder, ne pas paniquer si l'impact moyen est moyen |
| Impact modéré + variance basse | **modéré** | candidat à l'affinage |
| Impact bas + variance basse | **faible** | vérifier les redondances, peut-être supprimer |
| Impact quasi nul | **placebo** | suppression sans risque, sauf décor volontaire |

## Le piège classique : le segment ponctuel

Le piège le plus fréquent est de **supprimer un segment apparemment inutile** alors qu'il ne sert que sur un scénario sur six.

Exemple : un prompt narratif contient "Évite les clichés du genre : pas de vampires, pas de zombies." Sur 4 thèmes testés (bibliothèque, station-service, enfant, horloge), retirer ce segment :
- ne change rien sur 3 thèmes
- fait apparaître un fantôme classique sur le 4ème

Le **score d'impact moyen** est faible. Mais la **variance** est très haute. Le verdict est **contextuel**, et la lecture correcte est : "ce segment est un filet de sécurité ponctuel — il ne sert pas souvent, mais quand il sert, il évite une catastrophe."

C'est exactement ce que la barre d'erreur dans le graphique de variance révèle. **La variance est l'information la plus précieuse de l'outil.**

## Lire la décomposition 3-axes

Quand un segment a un impact total de 50 %, la question n'est pas seulement "combien il compte" mais "**où** il compte". La décomposition par axe donne la réponse.

### Profils types

**Profil purement structurel** (struct = 80 %, behav = 0 %, sem = 10 %)
→ C'est une règle de format (longueur, syntaxe, JSON). Sa modification a un effet immédiat sur la parsabilité.

**Profil purement comportemental** (struct = 0 %, behav = 60 %, sem = 20 %)
→ C'est une règle métier (liste de termes interdits, conditions de déclenchement). Sa modification affecte la conformité aux règles.

**Profil purement sémantique** (struct = 0 %, behav = 0 %, sem = 55 %)
→ C'est une règle de style ou de persona. Sa modification affecte le ton sans toucher la conformité de fond.

**Profil hybride** (struct = 30 %, behav = 40 %, sem = 30 %)
→ Segment polyvalent qui porte plusieurs intentions. Sa réécriture demande de préserver les trois rôles.

### La règle de redistribution

Si tu supprimes un segment à profil sémantique pur, les autres segments à profil sémantique vont **probablement reprendre une partie de son rôle** (les LLMs sont robustes). C'est l'inverse pour les profils structurels purs : leur suppression casse souvent immédiatement le format.

## Lire le verdict "placebo"

Le verdict "placebo" est le plus inattendu et le plus révélateur. Il signifie : ce segment **n'est pas pris en compte** par le LLM, alors qu'il est formulé explicitement.

Causes typiques :
- **Phrase d'introspection** ("Avant chaque réponse, fais cette procédure mentale en 4 étapes") — un LLM ne fait pas de procédure interne, il génère token par token. Ces phrases rassurent le rédacteur mais sont du décor.
- **Réécriture de quelque chose déjà couvert** — la règle est déjà portée par d'autres segments plus saillants.
- **Phrase trop abstraite** — "sois authentique", "sois empathique" sans définition opérationnelle.

Action recommandée sur un placebo : **soit le supprimer**, **soit le reformuler** en règle opérationnelle vérifiable.

## Lire le verdict "contre-productif" (V2+)

En V1, la métrique principale est `|delta|` (valeur absolue). En V2, on conservera le signe : un segment dont la suppression *améliore* le score est contre-productif. C'est rare mais existant — typiquement une phrase qui produit l'effet inverse de l'intention (par exemple, demander explicitement "ne mentionne pas X" peut faire apparaître X dans certains contextes — effet de "pink elephant").

## Lecture comparée entre LLMs (V3)

Quand l'outil supportera plusieurs LLMs, un même prompt produira des rapports différents selon le modèle cible. C'est attendu et utile :
- segments **universels** : critiques sur tous les LLMs
- segments **modèle-spécifiques** : critiques sur Claude, placebo sur GPT-4 (ou inversement)

La comparaison permet de réécrire un prompt plus portable, en convertissant les segments modèle-spécifiques en formulations universelles.

## Anti-patterns d'interprétation

À éviter :

❌ **"Le segment X a un score de 0.18 donc il est inutile."** → vérifier d'abord la variance. Un 0.18 avec variance 0.40 est contextuel, pas inutile.

❌ **"Le segment X est critique sur Claude donc il est critique partout."** → V1 ne mesure qu'un seul LLM. La généralisation est une hypothèse, pas un fait.

❌ **"Le segment X et le segment Y ont chacun un impact bas, donc on peut supprimer les deux."** → l'ablation simple ne détecte pas les coalitions. Deux segments redondants ont chacun un impact bas, mais les supprimer ensemble peut casser le prompt. À vérifier par une ablation combinée manuelle.

❌ **"Le rapport dit que ce segment est placebo, donc je le supprime."** → vérifier que les scénarios choisis couvrent bien les cas où ce segment était censé agir. Un placebo apparent peut être un segment vital sur un scénario absent du jeu de test.
