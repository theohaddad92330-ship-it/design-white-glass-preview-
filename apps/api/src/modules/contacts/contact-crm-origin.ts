/**
 * #4526.1 — l'origine CRM d'un contact est une facette distincte du statut d'analyse, et ne retient que ce qu'un
 * CONNECTEUR prouve. Lue, jamais réécrite : aucune valeur de `contacts.source` n'est touchée.
 *
 * Deux preuves, et deux seulement :
 *  - `contacts.source = 'crm'` — la fiche a été CRÉÉE depuis une ligne du CRM branché ;
 *  - un lien de synchro (`sync_links`) d'un fournisseur autre que le fichier — la synchro a rattaché au CRM une
 *    fiche que Bellum avait déjà, qui GARDE sa source d'origine (#4459.2). `csv` est le lien d'un fichier : jamais
 *    une preuve de connecteur.
 *
 * ⚠️ Cause du filtre « Mon CRM » à 0 mesuré le 27/10 : #4597.2 l'avait ramené à `source IN ('crm')`, valeur écrite
 * à la seule création ; la preuve des fiches rattachées vit dans `sync_links`, que le filtre ne lisait pas.
 * Le filtre ET la puce lisent ce MÊME texte (GA-26). Sous-requête sur `sync_links`, pas une lecture de `contacts`.
 */
export const monCrmContactSql = (alias: string): string =>
  `(${alias}.source = 'crm' OR EXISTS (SELECT 1 FROM sync_links sl WHERE sl.workspace_id = ${alias}.workspace_id AND sl.entity_type = 'contact' AND sl.internal_id = ${alias}.id AND sl.provider <> 'csv'))`

/** « Importé par fichier » : `source = 'import'`, la même définition que le filtre `source=import` (#4597.1). */
export const importedContactSql = (alias: string): string => `${alias}.source = 'import'`
