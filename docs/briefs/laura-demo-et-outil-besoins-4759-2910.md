# Lot 138 — outil d'historique des besoins déclaré côté IA (#4759) ; salle de démo : déjà tranché

Périmètre : apps/ia/app/services/chat_tools.py, apps/ia/app/services/bellum_api.py, apps/ia/app/access/rights_matrix.py, apps/ia/app/services/chat_read_tool_card_coverage.py

## Ce que le lot FAIT

- Déclare `get_account_needs_history` (lecture seule) dans `apps/ia` : le pont NestJS
  `internal/copilot/account/needs-history` existait, le contexte annonçait l'agrégat (« 45 besoins »), aucun outil
  ne le lisait → Laura disait « aucun résultat d'outil » et se repliait sur le web. Relais tel quel d'une page
  (filtres tech/zone/since/until/limit/offset), `account_not_found` ≠ « aucun besoin ».
- Enregistré partout où un outil de lecture l'est : rights_matrix, couverture de carte (`file_export`), plafond de
  sortie (exempt : 25 lignes clampées au pont), scénarios de la scope eval (+2, compteurs 267/288).

## Ce que le lot NE FAIT PAS (et défait)

- Ne défait rien. Ne touche ni `ia-proxy.controller.ts` ni `demo-turn.ts` : « Laura reste scriptée en démo, le cas
  hors script ne fabrique rien » est une décision de Louis du 12/10 (`demo-turn.ts`, `DEMO_LAURA_SCRIPTED_COVERAGE`) ;
  le refus HTTP du contrôleur (#1942.2 / #1942.12) est la barrière contre l'appel facturé sur un client contourné.
  Autoriser la question libre en démo renverserait cette décision → QUESTION pour Louis.
- Ne touche pas `laura-probe.service.ts:882` : `accountHiringSignals` lit les signaux « encore d'actualité »
  (même colonne que l'onglet Signaux, `freshness !== 'archive'` voulu) ; les archives sont servies par le nouvel
  outil (`stillListed`). Garde #4044 (stages) inchangée.
- Pas de limite d'appels par tour côté IA (`maxCallsPerTurn` est relayé au modèle, pas imposé) : à décider.
- Garde #4611 : seuls les compteurs de la scope eval (265→267) sont modifiés ; la ligne touchée portait celui de `get_work_progress`.

## Droits

- Qui voit : tout rôle qui lit déjà le dossier d'un compte — l'outil est inscrit dans `rights_matrix` à côté de
  `get_account_notes` (lecture). Cloisonnement par l'espace côté pont (`InternalSecretGuard`, `workspaceId`).
- Qui modifie : personne, aucune écriture.
- Refusé : un compte hors espace (`account_not_found`), tout appel sans pont configuré (`bridge_not_configured`).
  Test ajouté : `apps/ia/tests/test_4759_account_needs_history_tool.py` (compte introuvable, pont éteint, lecture seule).
