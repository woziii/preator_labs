# engine/

> Placeholder pour le moteur Python de référence (V1+).

Ce dossier est volontairement vide pour la V0.1 (MVP web). La V1 prévoit un moteur Python autonome qui complète le moteur JS du navigateur sur deux dimensions :

- **performance** : exécuter de gros batches (N×M > 200) sans dépendre du navigateur,
- **qualité sémantique** : remplacer le TF-IDF local par des embeddings réels (Voyage AI ou `sentence-transformers`).

Spec et plan détaillés dans [`../docs/05-ROADMAP.md`](../docs/05-ROADMAP.md) et [`../docs/03-ARCHITECTURE.md`](../docs/03-ARCHITECTURE.md) (section V2).

Contrat de sortie attendu : JSON normalisé, importable tel quel dans la web app pour ré-affichage.
