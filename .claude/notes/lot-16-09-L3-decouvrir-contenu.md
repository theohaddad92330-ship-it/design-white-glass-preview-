# Lot — L3-decouvrir-contenu

**29 points.** Extraits de leur registre, à l'état `retenu`.
L'état se change dans le REGISTRE d'origine (édition de SA ligne), jamais ici.

| Point | La demande, en huit mots | Sujet | Existant (preuve fichier:ligne + APPELANT) | État | Preuve en recette |
| ----- | ------------------------ | ----- | ----------------------------------------- | ---- | ----------------- |
| 2151.42 | Afficher les relations workspace | contenu | non trouvé dans TabPartners/TabAccess | retenu | ÉCRAN: la relation de MON espace est nommée |
| 2166.1 | Résultat compte : logo | contenu | absent de `CandidateCard.tsx:74-89` | retenu | ÉCRAN: le logo est rendu |
| 2166.3 | Résultat compte : groupe / filiale | contenu | absent de la carte | retenu | ÉCRAN: le rattachement est rendu |
| 2166.11 | Résultat compte : référence comparable | contenu | `SimilarPanel` est un panneau, jamais une colonne de résultat | retenu | ÉCRAN: la référence est sur la ligne |
| 2166.15 | Résultat contact : personne | contenu | dépend de 2165.7 | retenu | ÉCRAN: rendu |
| 2166.16 | Résultat contact : entreprise | contenu | dépend de 2165.7 | retenu | ÉCRAN: rendu |
| 2166.17 | Résultat contact : fonction | contenu | dépend de 2165.7 | retenu | ÉCRAN: rendu |
| 2166.18 | Résultat contact : entité | contenu | dépend de 2165.7 | retenu | ÉCRAN: rendu |
| 2166.19 | Résultat contact : localisation | contenu | dépend de 2165.7 ; ville/pays = exception nommée `doctrine-registry.ts:1624` | retenu | CODE: `protected-criteria.spec.ts` + `test_protected_criteria_scoring.py` verts |
| 2166.20 | Résultat contact : rôle commercial | contenu | dépend de 2165.7 | retenu | ÉCRAN: rendu |
| 2166.22 | Résultat contact : coordonnées disponibles | contenu | dépend de 2165.7 | retenu | ÉCRAN: « disponible » ≠ la coordonnée elle-même |
| 2166.23 | Résultat contact : raison | contenu | dépend de 2165.7 | retenu | ÉCRAN: rendu |
| 2166.24 | Résultat contact : confiance | contenu | dépend de 2165.7 | retenu | ÉCRAN: rendu |
| 2166.25 | Résultat contact : limite | contenu | dépend de 2165.7 | retenu | ÉCRAN: ce qui manque est NOMMÉ |
| 2166.26 | Résultat besoin : entreprise | contenu | dépend de 2165.8 | retenu | ÉCRAN: rendu |
| 2166.27 | Résultat besoin : nature | contenu | `discoverSignalTypeSchema` (`discover.ts:30`) existe comme attribut de compte | retenu | ÉCRAN: rendu comme LIGNE |
| 2166.28 | Résultat besoin : expertise | contenu | dépend de 2165.8 | retenu | ÉCRAN: rendu |
| 2166.31 | Résultat besoin : niveau | contenu | absent (cf. 2165.46) | retenu | ÉCRAN: rendu |
| 2166.32 | Résultat besoin : action de qualification | contenu | absente | retenu | ÉCRAN: le bouton existe |
| 2166.33 | Résultat besoin : information manquante | contenu | absente | retenu | ÉCRAN: ce qui manque est NOMMÉ |
| 2166.34 | Résultat partenaire : ESN | contenu | dépend de 2165.9 | retenu | ÉCRAN: rendu |
| 2166.35 | Résultat partenaire : expertise | contenu | dépend de 2165.9 | retenu | ÉCRAN: rendu |
| 2166.36 | Résultat partenaire : territoire | contenu | dépend de 2165.9 | retenu | ÉCRAN: rendu |
| 2166.37 | Résultat partenaire : relations observées | contenu | existe dans le dossier (`fr/partners.json observed.*`), pas dans Découvrir | retenu | ÉCRAN: rendu sur /discover |
| 2166.38 | Résultat partenaire : relation workspace | contenu | doublon de 2151.42 | retenu | ÉCRAN: rendu |
| 2166.39 | Résultat partenaire : complémentarité | contenu | notion non définie (cf. 2151.36) | retenu | DÉCISION Louis 15/09 : score DÉCOMPOSÉ à axes nommés (recouvrement d'expertises · de secteurs · de comptes · taille), ce qui n'a pas pu être évalué est NOMMÉ. Sous 3 axes il n'y a pas de score. CODE: le contrat porte les axes ; ÉCRAN: le score n'est jamais nu. |
| 2166.40 | Résultat partenaire : limites | contenu | `scoreUnknown` existe côté dossier (`fr/partners.json`) | retenu | ÉCRAN: ce qui manque est NOMMÉ |
| 2166.41 | Résultat partenaire : action de qualification | contenu | absente | retenu | ÉCRAN: le bouton existe |
| 2151.48 | Distinguer : relation actuelle sourcée | provenance | certitude forte/moyenne/faible existe (`market-memory.ts:109-121`) mais « actuelle sourcée » n'est pas une valeur | retenu | CODE: enum de nature de relation à 5 valeurs |
