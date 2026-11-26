/**
 * #4526.2 — « MON CRM » : les comptes que le commercial CONNAÎT déjà, parce qu'ils viennent de son CRM.
 *
 * Un compte en fait partie si son `origin` est `crm`, OU — quand `origin IS NULL` (tout compte
 * antérieur au 22/08) — s'il porte un lien CRM : une affaire ou une activité miroir, ou un contact venu du CRM.
 *
 * ⚠️ Calculé à la LECTURE, jamais écrit : on ne pose pas `origin` sur les anciens comptes (garde
 * `account.entity.ts` : « lui attribuer une origine rétroactivement inventerait son histoire »). Un compte
 * `origin = 'discover'` n'entre jamais, lien ou pas : l'origine posée gagne sur l'indice.
 *
 * Écrit sur l'alias `account` de la liste. Les tables miroir sont bornées par `workspace_id` : aucun lien d'un
 * autre espace ne fait entrer un compte. Les contacts le sont par `account_id` — le compte est déjà de l'espace.
 * Le MÊME prédicat sert le filtre `crm` et le compteur de la puce : ils ne peuvent pas diverger.
 *
 * ⚠️ RENVERSEMENT de #4526.4 (livré le 24/10, « sources crm + import »), décidé dans #4597.2 : un fichier
 * importé n'est PAS un CRM. Mesuré en production, la puce « Mon CRM » donnait 1 080 contacts, tous « Import de
 * masse » (= les 1 080 créés de contacts.csv). L'import a désormais sa puce, `IMPORTED_ACCOUNT_PREDICATE`.
 */
/**
 * UNE seule lecture brute de `contacts` pour les deux prédicats (cliquet GA-405 : pas de site de plus) — le contact
 * est borné par `account_id`, le compte étant déjà de l'espace.
 */
const contactOfAccount = (alias: string, condition: string): string =>
  `EXISTS (SELECT 1 FROM contacts ${alias} WHERE ${alias}.account_id = account.id AND (${condition}))`

// #4526.1 — l'origine CRM est une facette distincte du statut d'analyse : le dernier OR est le lien de synchro d'un
// CONNECTEUR (le lien d'un fichier, `csv`, n'en est jamais une preuve). Pas de commentaire SQL ici : le texte peut être aplati.
export const CRM_LINKED_ACCOUNT_PREDICATE = `(
  account.origin = 'crm'
  OR (account.origin IS NULL AND (
    EXISTS (SELECT 1 FROM crm_deals cd WHERE cd.account_id = account.id AND cd.workspace_id = account.workspace_id)
    OR EXISTS (SELECT 1 FROM crm_activities ca WHERE ca.account_id = account.id AND ca.workspace_id = account.workspace_id)
    OR ${contactOfAccount('cc', "cc.crm_record_id IS NOT NULL OR cc.source = 'crm'")}
    OR EXISTS (SELECT 1 FROM sync_links sl WHERE sl.workspace_id = account.workspace_id AND sl.entity_type = 'account' AND sl.internal_id = account.id AND sl.provider <> 'csv')
  ))
)`

/**
 * #4597.1 — « IMPORTÉS » : les comptes venus d'un FICHIER, jamais d'un CRM. Même discipline que le prédicat
 * CRM : calculé à la lecture, `origin` jamais réécrit. Un compte `origin = 'import'` en fait partie ; sans
 * origine (tout compte versé par l'import universel), il en fait partie s'il porte un contact `source = 'import'`.
 * Un compte `discover` n'entre jamais. Filtre ET compteur de la puce lisent ce MÊME texte (GA-26).
 */
export const IMPORTED_ACCOUNT_PREDICATE = `(
  account.origin = 'import'
  OR (account.origin IS NULL AND (
    account.import_job_id IS NOT NULL
    OR ${contactOfAccount('ic', "ic.source = 'import'")}
  ))
)`
