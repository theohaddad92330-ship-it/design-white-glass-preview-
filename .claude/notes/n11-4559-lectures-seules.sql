-- #4559.7 / #4559.8 — LECTURES SEULES (aucun UPDATE, aucun DELETE) à jouer par un humain sur la base de production.
-- Écrit le 28/10/2026 depuis une VM sans accès à la base : rien n'a été exécuté, aucun comptage n'est annoncé.

-- #4559.7 (1/3) — consultants dont le manager appartient à un AUTRE espace.
SELECT c.id, c.workspace_id AS consultant_ws, m.id AS manager_id, m.workspace_id AS manager_ws
  FROM consultants c
  JOIN consultants m ON m.id = c.manager_id
 WHERE c.manager_id IS NOT NULL
   AND m.workspace_id IS DISTINCT FROM c.workspace_id;

-- #4559.7 (2/3) — missions dont l'affaire (opportunity_id) est un projet d'un AUTRE espace.
SELECT ms.id, ms.workspace_id AS mission_ws, p.id AS project_id, p.workspace_id AS project_ws
  FROM missions ms
  JOIN projects p ON p.id = ms.opportunity_id
 WHERE ms.opportunity_id IS NOT NULL
   AND p.workspace_id IS DISTINCT FROM ms.workspace_id;

-- #4559.7 (3/3) — missions dont le besoin (need_id) est un besoin d'un AUTRE espace.
SELECT ms.id, ms.workspace_id AS mission_ws, n.id AS need_id, n.workspace_id AS need_ws
  FROM missions ms
  JOIN project_needs n ON n.id = ms.need_id
 WHERE ms.need_id IS NOT NULL
   AND n.workspace_id IS DISTINCT FROM ms.workspace_id;

-- #4559.8 — une clé étrangère COMPOSITE existe-t-elle sur consultants.manager_id ? (si oui, le cas 1 tombe)
SELECT conname, pg_get_constraintdef(oid) AS definition
  FROM pg_constraint
 WHERE conrelid = 'consultants'::regclass
   AND contype = 'f'
   AND pg_get_constraintdef(oid) ILIKE '%manager_id%';
