# Lot 10 — Laura · reste (#4705.2)

Branche `claude/lot10-laura-reste`. #4705.1 est déjà livré (vague O, b37bd354) ; reste #4705.2.

Périmètre : apps/ia/app/services/compare_card_tool.py, apps/ia/app/services/known_shape_gate.py, apps/ia/app/services/chat_orchestrator.py, apps/ia/tests/test_4705_carte_comparaison.py, docs/briefs/claude-lot10-laura-reste-4705.md, CHANGELOG.md

## Diagnostic

« Compare Servier, Sanofi et Thales » : `compare_accounts` rend bien les six questions par compte, mais AUCUN code ne bâtit la carte `comparison`
(hors de `_SHAPE_TOOLS`) ; elle dépendait du modèle, et `Cell` plafonne à 200 caractères (« preuve » datée et sourcée les dépasse) :
le contrat refuse la carte, `route_known_shapes` la retire (`dropped_refused`) et pose « Carte non construite ».

## Correctif

`comparison_block_from_output` bâtit la carte du SEUL résultat de l'outil (colonnes = comptes, 4 max ; lignes = relation, six questions,
recommandation). Absent → case vide (jamais comblé, jamais « 0 »). Aucune probabilité ni % d'allocation ni score affiché.
Posée par la porte quand la réponse ne porte pas déjà une `comparison` valide. Garde #4611.3 (progress_block) : inchangée.

## Droits

Aucune surface d'accès touchée (ni page, ni route, ni garde, ni rôle).

## Démo (règle 9)

Aucune donnée nouvelle affichée côté démo : la comparaison lit les analyses déjà seedées.
