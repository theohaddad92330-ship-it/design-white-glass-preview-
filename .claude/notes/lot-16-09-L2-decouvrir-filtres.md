# Lot — L2-decouvrir-filtres

**38 points.** Extraits de leur registre, à l'état `retenu`.
L'état se change dans le REGISTRE d'origine (édition de SA ligne), jamais ici.

| Point | La demande, en huit mots | Sujet | Existant (preuve fichier:ligne + APPELANT) | État | Preuve en recette |
| ----- | ------------------------ | ----- | ----------------------------------------- | ---- | ----------------- |
| 2151.30 | Filtre partenaire : territoire | filtre | zone existe pour les comptes (`discover-zone.ts`) pas pour les ESN | retenu | ÉCRAN: le filtre resserre la liste ESN |
| 2151.31 | Filtre partenaire : expertise | filtre | absent | retenu | ÉCRAN: idem |
| 2151.32 | Filtre partenaire : clients observés | filtre | données présentes (`fr/partners.json observed.persons_other`) sans filtre | retenu | API: le filtre est honoré ou dit qu'il ne l'est pas |
| 2151.33 | Filtre partenaire : relation existante | filtre | `relationship.partner/competitor/unknown` affiché, non filtrable | retenu | ÉCRAN: idem |
| 2151.34 | Filtre partenaire : ouverture au rang 2 | filtre | `rank.rank1/rank2/unknown` affiché, non filtrable | retenu | ÉCRAN: « inconnu » n'est jamais rangé en « non » |
| 2151.35 | Filtre partenaire : taille | filtre | absent | retenu | ÉCRAN: idem |
| 2151.36 | Filtre partenaire : complémentarité | filtre | absent — notion non définie dans le dépôt | retenu | DÉCISION Louis 15/09 : score DÉCOMPOSÉ à axes nommés (recouvrement d'expertises · de secteurs · de comptes · taille), ce qui n'a pas pu être évalué est NOMMÉ. Sous 3 axes il n'y a pas de score. CODE: le contrat porte les axes ; ÉCRAN: le score n'est jamais nu. |
| 2151.37 | Filtre partenaire : historique | filtre | absent | retenu | ÉCRAN: idem |
| 2165.23 | Filtre commun : Type d'organisation | filtre | `legalCategory` (`discover.ts:443`) + `entityType` — partiel, pas un « type d'organisation » produit | retenu | ÉCRAN: le filtre existe sous ce nom |
| 2165.24 | Filtre commun : Groupe / filiale | filtre | absent du rail | retenu | ÉCRAN: idem |
| 2165.26 | Filtre commun : Déjà travaillé | filtre | `portfolioState` `customer`/`analyzed` affiché (`discover.ts:222`) mais non filtrable séparément | retenu | ÉCRAN: idem |
| 2165.27 | Filtre commun : Exclusions | filtre | absent — aucun critère négatif dans `discoverRegistryFiltersSchema` | retenu | API: une exclusion retire des lignes |
| 2165.28 | Filtre comptes : Technologies observées | filtre | `keywords` ne s'applique QU'aux offres (`fr/discover.json rail.keywordsIdle`) ; `observedStack` vit en mémoire marché | retenu | API: le filtre lit `observed_stack` |
| 2165.29 | Filtre comptes : Familles de rôles | filtre | `suggestedRoles` est une SORTIE (`discover.ts:295`), pas une entrée | retenu | API: idem |
| 2165.30 | Filtre comptes : Recours externe observé | filtre | absent ; ⚠ le sens « recours externe » est bordé par `c65` | retenu | « Recours externe OBSERVÉ » s'expose SUR LA CARTE **et EN FILTRE** (Louis 15/09, contre la recommandation). ⚠️ Condition qui vient avec : le libellé porte la nuance en toutes lettres — « recours externe observé dans nos sources », jamais « recours externe » nu — parce qu'un libellé de filtre se lit hors contexte et redevient un fait de marché (GA-259). Risque résiduel assumé : un commercial répète le libellé court en rendez-vous. |
| 2165.33 | Filtre comptes : Référence comparable | filtre | `SimilarPanel` est un panneau séparé (`Discover.tsx:478`), jamais un filtre | retenu | ÉCRAN: le filtre existe dans le rail |
| 2165.34 | Filtre contacts : Fonction | filtre | dépend de 2165.7 | retenu | ÉCRAN: idem |
| 2165.35 | Filtre contacts : Niveau | filtre | dépend de 2165.7 | retenu | ÉCRAN: idem |
| 2165.36 | Filtre contacts : Entité | filtre | dépend de 2165.7 | retenu | ÉCRAN: idem |
| 2165.37 | Filtre contacts : Expertise | filtre | dépend de 2165.7 | retenu | ÉCRAN: idem |
| 2165.38 | Filtre contacts : Localisation | filtre | dépend de 2165.7 ; ⚠ ville/pays sont les deux SEULES exceptions nommées (`doctrine-registry.ts:1624`) | retenu | CODE: `protected-criteria.spec.ts` reste vert (ville/pays seulement) |
| 2165.39 | Filtre contacts : Coordonnées | filtre | cascade d'enrichissement existe côté API, aucune recherche | retenu | ÉCRAN: idem |
| 2165.41 | Filtre contacts : Relation workspace | filtre | dépend de 2165.7 | retenu | ÉCRAN: idem |
| 2165.42 | Filtre besoins : Expertise | filtre | dépend de 2165.8 | retenu | ÉCRAN: idem |
| 2165.43 | Filtre besoins : Rôle | filtre | dépend de 2165.8 | retenu | ÉCRAN: idem |
| 2165.45 | Filtre besoins : Nature | filtre | `discoverSignalTypeSchema` (`discover.ts:30`) rendu, non filtrable par type | retenu | ÉCRAN: idem |
| 2165.46 | Filtre besoins : Niveau de preuve | filtre | `intermediated` existe (`discover.ts:50`) mais n'est pas un niveau | recetté | ÉCRAN: idem ‖ VÉRIFIÉ 21/09/2026 sur `origin/main` = `8b3fe6657`, chaque commit confronté à `git merge-base --is-ancestor` contre main ET contre la révision SERVIE (`1782d157f`) — **déjà en production.** `discover-result-rows.ts:115` pose `evidenceLevel` à `null` pour les lignes non-`hiring` — c'est ce qui CORRIGE le défaut : sans ça, le filtre ne partitionnait rien. Lecteur `ProjectionResults.tsx:125` (`ToggleChip`), monté par `Discover.tsx:1262`. |
| 2165.47 | Filtre besoins : Compte | filtre | dépend de 2165.8 | retenu | ÉCRAN: idem |
| 2165.49 | Filtre besoins : Urgence | filtre | absent | retenu | ÉCRAN: idem |
| 2165.50 | Filtre besoins : Type de contrat | filtre | absent | retenu | ÉCRAN: idem |
| 2165.51 | Filtre partenaires : Expertise | filtre | doublon de 2151.31 | retenu | ÉCRAN: idem |
| 2165.52 | Filtre partenaires : Territoire | filtre | doublon de 2151.30 | retenu | ÉCRAN: idem |
| 2165.53 | Filtre partenaires : Comptes observés | filtre | doublon de 2151.32 | retenu | ÉCRAN: idem |
| 2165.54 | Filtre partenaires : Relation workspace | filtre | doublon de 2151.33 | retenu | ÉCRAN: idem |
| 2165.55 | Filtre partenaires : Complémentarité | filtre | doublon de 2151.36 (notion non définie) | retenu | DÉCISION Louis 15/09 : score DÉCOMPOSÉ à axes nommés (recouvrement d'expertises · de secteurs · de comptes · taille), ce qui n'a pas pu être évalué est NOMMÉ. Sous 3 axes il n'y a pas de score. CODE: le contrat porte les axes ; ÉCRAN: le score n'est jamais nu. |
| 2165.56 | Filtre partenaires : Rang 2 déclaré ou inconnu | filtre | `rank.unknown` existe et dit « inconnu » — TabPartners ← `AccountDetailTabContent.tsx:195` | retenu | ÉCRAN: « inconnu » est une valeur du filtre, jamais un « non » |
| 2151.15 | Market Memory seule ne déclenche jamais d'urgence | contrainte | aligné sur `doctrine-registry.ts:1792` (`c65_couverture_nest_pas_un_fait_de_marche`) | retenu | CODE: garde refusant la mémoire marché comme déclencheur |
| 2151.25 | Éviter les doublons Laura/Aujourd'hui/notif/email/Veille | contrainte | aucun registre de déduplication inter-canaux trouvé | retenu | Écran/parcours — tranché par Claude sur la doctrine déjà écrite (Louis 15/09 : « prends-les tous, ne me redemande rien »). Se prouve en recette. |
