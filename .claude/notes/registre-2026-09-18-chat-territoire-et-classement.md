# Deux arbitrages transversaux du 18/09/2026 — ils s'appliquent à TOUS les registres `chat-*`

base : 93f7a4044 — 18/09/2026 ‖ réconcilié contre 7d11787d9be5e0e7f17102e0ffcd5b39bfb5a379 — 22/09/2026 (R2, +1143 commits) : les trois constats ci-dessous tiennent toujours, aucun n'a bougé côté code

Ces deux décisions ne portent pas sur un point isolé : elles conditionnent la
façon dont plusieurs dizaines de points seront écrits. Elles vivent donc ici, et
chaque registre concerné y renvoie.

## 1. « Territoire » et « programme » — DEUX axes séparés, nommés différemment

**Décision Louis 18/09/2026 (QCM).** Le mot a deux définitions concurrentes dans
le code : un NIVEAU DE COMPTE d'un côté, un NŒUD DE GRAPHE D'ORGANISATION de
l'autre. Le cadrage les a croisées sur plusieurs specs, et chacune se lisait
comme un synonyme de l'autre.

Ce sont deux notions réellement différentes. **On en renomme une** pour que
personne ne les confonde, et **la distinction s'inscrit au registre de doctrine**
(`packages/contracts/src/schemas/doctrine-registry.ts`, garde GA-38). Le coût est
un renommage ; le bénéfice, qu'aucun agent ne les mélange plus — et ce mélange-là
s'est déjà produit.

⚠️ Rappel de la règle de nommage du dépôt : **jamais de suffixe de version**
(pas de `territory2`, `territoryV2`). Le nom dit ce que la chose EST.

## 2. Les axes de classement — ÉTENDRE le socle existant

**Décision Louis 18/09/2026 (QCM).** Les axes de classement demandés par #2299 et
#2303 **étendent `contact_fit_score_100` et `account_fit_score_25`** ; on ne crée
pas un modèle de score dédié au chat.

La raison : un seul modèle de score dans le produit, donc un seul endroit où tenir
la règle « **un score n'est jamais nu** — ses axes sont montrés, et ce qui n'a pas
pu être évalué est NOMMÉ » (GA-18/GA-19). Deux modèles voudraient dire deux
endroits où cette règle peut se perdre.

## 3. Le prochain grand chantier — les compilateurs de `/chat`

**Décision Louis 18/09/2026 (QCM).** Le constat transversal des 24 specs cadrées
est que **les ingrédients existent presque tous** (`projectNeedSchema`,
`PROJECT_STAGES`, `coverage.ts`, `org-views.ts`, `entityTypeSchema`,
`signalKindSchema`, `opportunityFreshnessSchema`) et que **le plat n'existe pas** :
aucun des soixante outils de `chat_tools.py` ne compile ni ne crée un Besoin ou
une Opportunité, aucun n'assemble une prélecture de compte.

C'est là que sont les ~665 points `retenu`, donc là qu'est la masse des clôtures.
Les lots à venir branchent les outils `/chat` sur les schémas existants.

## Réconciliation 22/09/2026 (R2)

Les trois constats restent vrais, retenu confirmé sur les trois :

- **Point 1 (renommage territoire/programme)** : `packages/contracts/src/schemas/doctrine-registry.ts`
  ne porte toujours aucune entrée nommant cette distinction (`git grep -i territoire`/`territory`
  sur ce fichier = 0 résultat) — le renommage décidé le 18/09 n'a pas été fait.
- **Point 2 (extension des scores existants)** : `contact_fit_score_100`/`account_fit_score_25`
  n'existent que comme identifiants de RÈGLES MÉTIER (`apps/ia/app/knowledge/business_rules.py:133,291`),
  pas comme modèle de score étendu avec des axes chat — aucune trace d'axe #2299/#2303 dessus.
- **Point 3 (le plat n'existe pas)** : confirmé — `apps/ia/app/services/chat_tools.py` (34 fonctions
  top-level à ce jour) ne contient toujours aucun `def compile*` ; recherche élargie
  `compileNeed|compileOpportunity|compile_need|compile_opportunity|def compile` sur `apps/` et
  `packages/` = 0 résultat hors specs. Le motif du chantier tient encore : calculé nulle part,
  donc rien à appeler.
