# Rapport — fix/4962-r2-laura-decouvrir (01/11/2026)

Branche `fix/4962-r2-laura-decouvrir`. Tests ciblés verts : useDiscoverSearch, home-resume, laura-home-grid,
discover-result-rows, ProjectionSearchFields, ProjectionResults (vitest) ; copilot-contacts-search.controller (jest) ;
test_5013, test_4982, test_4057 (pytest). Pas de `tsc -p` utilisable (contrats non buildés) ; pas de ci:local.

1. FAIT (partiel) : « Python/Java » = recherche par compétence ; le web empilait lot court + liste + second passage,
   chacun jusqu'à 60 s côté serveur, sans plafond → ~2 min d'« Interrogation du registre… ». Plafond de 125 s (registre) /
   135 s (signaux) dans `useDiscoverSearch`, puis erreur `discover_timeout` dite à l'écran. Cause du 1er échec « Python »
   NON prouvée (pas de logs IA/API ici) : à confirmer en prod.
2. FAIT : `search_workspace_contacts` accepte `sort_by: zone` (critère à lui seul), relayé à `findAllForUser` (même tri
   que l'écran), `city` + `department` rendus par ligne. Région en libellé : non exposée, département seulement.
3. FAIT : puce « Uniquement freelance » sur Besoins et signaux + message « Aucun signal freelance… » (fr/en).
4. NON FAIT : le total « trouvées » n'existe dans aucun flux IA (`offersTotal` absent) ; le web sait déjà afficher
   « N lues sur M trouvées » dès que M arrive, sinon il se tait. Brancher l'en-tête de plage de la source = lot IA.
5. FAIT (partiel) : `access_summary` / `access_line` calculés sur les comptes RENDUS (texte = cartes) ; le tri A→D
   existait mais dépend de `sort_by: access` passé par le modèle. Les puces brutes « Partielle / territory / sector »
   n'ont pas été localisées dans le code (probablement texte du modèle) : consigne ajoutée à l'outil, pas de garde.
6. FAIT : « Reprendre » ne propose qu'un fil dont le tour est `running` (`useBackgroundTurnsStore`).
   Non fait : aucune PR, aucune issue commentée. Question : tri par accès par défaut si la demande dit « faciles » ?
