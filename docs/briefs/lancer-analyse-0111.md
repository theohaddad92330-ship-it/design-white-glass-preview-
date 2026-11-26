# Brief — /search : lancer une analyse échoue, et l'autocomplétion prend la mauvaise entité (01/11/2026)

Branche : `claude/lancer-analyse-0111`. Plafond 300 tours. Livrable : commits + PR prête, puis STOP.

## Constats (recette prod 01/11, compte réel)

1. Premier clic sur « Lancer l'analyse » : erreur `Validation failed — user_context.prioritizationReason : Too small`. Il a fallu saisir un angle puis « Réessayer ». Un champ OPTIONNEL côté produit est validé avec un minimum côté contrat/DTO (chercher `prioritizationReason` dans packages/contracts et apps/api : un `.min(...)` ou `MinLength` sur une chaîne qui peut être vide). Historique : #3910 (raison proposée par l'outil, pas saisie), #4655 (clé technique préremplie).
2. Autocomplétion de /search : en tapant « Boulanger » puis en cliquant, l'entité sélectionnée a été « BOULANGERIES PAUL » au lieu de « BOULANGER » : la liste se RÉORDONNE pendant la frappe (réponses asynchrones qui arrivent dans le désordre) et le clic tombe sur l'élément qui a pris la place.

## À faire (TDD)

1. Une raison de priorisation vide/absente ne bloque JAMAIS le lancement : soit elle est omise du payload quand vide, soit le schéma accepte vide/absent. La règle « proposée par l'outil, pas saisie » (#3910) tient. Test : contrat + DTO + appel web sans angle ⇒ 2xx.
2. Autocomplétion : ignorer les réponses périmées (ne garder que celle de la DERNIÈRE frappe — compteur de requête ou AbortController), et ne pas réordonner la liste sous le pointeur ; la sélection se fait sur l'identifiant (SIREN/id), jamais sur un index. Test RTL : réponses dans le désordre ⇒ la liste affichée correspond à la dernière saisie ; clic ⇒ l'entité cliquée.

## Règles communes

- Étape 0 antériorité (`git grep`) ; déjà fait ⇒ « DÉJÀ LÀ fichier:ligne ».
- Tests CIBLÉS (≤ 5 specs + `tsc -p` paquets touchés). JAMAIS suite complète, build global, check-types racine.
- Garde doc↔code : `node scripts/garde-derive-doc.mjs origin/main...HEAD`. Commitlint scopes web|api|contracts|…
- PR prête vers main, corps finissant par :

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01RZu8c5wyRFXed6whEKHsXj
