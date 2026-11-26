# Rapport SECU-IDOR-4559 — branche `claude/secu-idor-4559-2510` (3 commits, pas de PR)

Numéros de ligne de l'issue périmés (code déplacé) : localisé par symbole.

1. `manager_id` — test de refus : `consultants/consultant-manager.spec.ts` (« refuse à la MISE À JOUR / CRÉATION… », « la relecture… filtre d'espace »). Validation : `ConsultantsService.assertManagerInWorkspace` (create + update, 400). Filtre : `managerNamesOf` (workspace_id / user_id hérité dans le `where`).
2. `opportunity_id` — tests : `delivery/delivery.service.spec.ts` (« refuse une affaire… d'un autre espace »). Validation : `DeliveryService.create` (`projects.count` espace, 404, avant toute écriture). Filtre : `opportunitiesOf(workspaceId, …)`.
   3-4. `need_id` (×2 sites capitalisation) — test : `capitalisation.service.spec.ts` (« le besoin d'un AUTRE espace… »). Validation : `DeliveryService.create` (`needs.count` espace, 404). Filtre : `proofProposalForMission` + `proposalFor` (`workspace_id` dans `findOne`).
   5-6. `cv-studio` `needSkills` / `assertOpportunityReachable` — tests : `cv-studio.service.spec.ts` « espace non résolu (fail-closed) ». `workspaceId` nul : besoin ⇒ aucune lecture (`[]`), opportunité ⇒ 422 sans requête.
   Tests rouge→vert vérifiés (service remis à l'état d'avant : 2 + 1 + 2 rouges). Lancés : les 4 specs ci-dessus + 9 specs voisines (delivery/consultants), verts.
   Lignes existantes douteuses : NON comptées (pas d'accès base dans cette VM). Rien effacé. Rattrapage proposé, NON lancé : lister les `consultants` dont `manager_id` pointe vers un `workspace_id` différent, les `missions` dont `opportunity_id`/`need_id` pointent vers `projects`/`project_needs` d'un autre `workspace_id`.
   Arbitrages pris seul : (a) erreur 400 pour manager, 404 pour affaire/besoin (patron voisin du fichier) ; (b) harnais de test : `count` par défaut à 1 dans `delivery` specs ; (c) `cv-studio` : `assertRfpReachable` et `assertMissionComparable` ont le MÊME défaut conditionnel (`workspaceId` nul) — NON touchés (hors des 6) ; à traiter dans un lot suivant ; (d) `inheritProjectContext` laisse passer un projet `workspace_id` nul (hors périmètre).
   Non lancé : suite complète, `check-types` racine. `tsc --noEmit -p apps/api` : 3 erreurs, toutes `@bellum/email` introuvable (paquet non construit dans la VM), aucune dans les fichiers touchés.
