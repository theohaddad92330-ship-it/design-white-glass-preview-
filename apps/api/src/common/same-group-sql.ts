/**
 * #3895 — « même groupe » = la MÊME tête capitalistique déclarée, dans le même
 * espace : deux comptes qui portent le même `group_head_siren`, ou l'un qui est
 * la tête de l'autre. Jamais un rapprochement de noms.
 */
export const SAME_GROUP_SQL = `
  s.workspace_id = o.workspace_id AND s.id <> o.id AND s.merged_into_id IS NULL
  AND (
    (o.group_head_siren IS NOT NULL AND s.group_head_siren = o.group_head_siren)
    OR (o.group_head_siren IS NOT NULL AND s.siren = o.group_head_siren)
    OR (s.group_head_siren IS NOT NULL AND s.group_head_siren = o.siren)
  )`
