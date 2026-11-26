# Lot 24 — Laura · suite (#4788, #4563, #4432)

Périmètre : apps/web/src/routes/chat/index.tsx, apps/web/src/features/chat/view/Chat.tsx, apps/web/src/features/chat/view/chat-mise-en-page.test.ts, apps/ia/app/services/job_offers_search.py, apps/ia/tests/test_laura_offres_4563.py, docs/briefs/\*

## Points

- #4788 : enveloppe de `<Chat />` en colonne flex + section `flex-1` (la hauteur ne dépend plus d'un `h-full` seul). Garde source dans `chat-mise-en-page.test.ts`. Mesure navigateur (clientHeight vs innerHeight) : à faire en recette, non faite ici.
- #4563 : l'outil `search_job_offers` bâtit la carte `file_export` (une ligne par offre) et la greffe en fin de tour (mécanisme #4065) ; la recette du 27/10 montrait l'outil appelé et 0 offre rendue. Revient sur rien ; garde #4065 (record_listing) réutilisée.
  - ⚠️ 29/10, fusion de `origin/main` : la même capacité y est arrivée entre-temps sous #4563.1 (carte posée par le code, `remember_offers_outcome`, `searched` dans le `summary`). Le code de `job_offers_search.py` gardé est celui de main — il couvre ce point et va plus loin ; deux `_offers_card` auraient violé GA-26. La section 8 des tests du lot est remplacée par un renvoi : `test_laura_offres_4563_rendu.py` (main) tient le même chemin de bout en bout, et l'un des tests du lot attendait que la phrase « assez nombreuses » RESTE dans la réponse — #4563.1 la retire. Seule la garde que l'autre fichier ne porte pas est conservée (la description de l'outil nomme `card`).
- #4432 : seul .4 reste ; il est bloqué par #4556 (démo sans dossier cadré sur une zone) — hors périmètre, question à Louis.

## Ce qu'on ne fait pas

Aucun changement de cascade/cache/plafond ; pas de semis démo (#4556) ; pas de page ni de route nouvelle (pas de section Droits).

## Décisions touchées

garde #4537, garde #4544 (Chat.tsx : section du copilote, `flex-1` ajouté sans retirer ce qu'elles posent) ; garde #4565 (job_offers_search.py : description de l'outil, la cascade est intacte).
