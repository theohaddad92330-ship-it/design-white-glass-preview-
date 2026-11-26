import type { ContactCrmExport } from '@bellum/contracts'

/** Ce qu'il faut de la connexion CRM pour composer un lien — jamais le jeton. */
export type CrmConnectionForLink = {
  /** Portail HubSpot (hub id). `null` pour les autres fournisseurs. */
  external_account_id: string | null
  /** Domaine de l'espace : Salesforce `instance_url`, Pipedrive `api_domain`. */
  instance_url: string | null
}

/**
 * #3719.5 — « ouvrir la fiche du contact dans le CRM de l'utilisateur ».
 *
 * Trois fournisseurs ont une URL de fiche VÉRIFIABLE depuis ce qu'on a déjà en
 * base (pas de nouvel appel réseau, pas de nouvelle portée) :
 *
 *   - HubSpot  : l'API est sur un hôte fixe, mais l'écran web est par PORTAIL —
 *     `external_account_id` (hub id, posé à la connexion, `salesforce` l.224 /
 *     `attio` l.190 portent le même champ sous d'autres noms).
 *   - Salesforce : `instance_url` est l'hôte même de l'espace — composer le
 *     lien n'est qu'y accoler l'identifiant d'enregistrement.
 *   - Pipedrive  : même mécanisme, `instance_url` porte l'`api_domain`.
 *
 * Attio n'a PAS de base par-espace exposée (`attio.service.ts` l.191 : « API
 * host is fixed — no per-org base like Salesforce ») : son écran web vit sous
 * un slug d'espace que la connexion ne stocke pas. Deviner ce slug serait
 * exactement ce que la doctrine refuse — « un contrat d'API non vérifiable ne
 * se devine pas » — donc `attio` ne compose JAMAIS de lien ici tant que ce
 * slug n'est pas une donnée qu'on possède.
 *
 * Une connexion absente, ou dont la pièce nécessaire manque, rend `null` : un
 * lien qui mène à une page d'erreur serait pire que l'absence de lien.
 */
export function crmRecordUrl(
  provider: ContactCrmExport['provider'],
  crmRecordId: string,
  connection: CrmConnectionForLink | null,
): string | null {
  if (!connection) return null
  const id = encodeURIComponent(crmRecordId)

  if (provider === 'hubspot') {
    if (!connection.external_account_id) return null
    return `https://app.hubspot.com/contacts/${encodeURIComponent(connection.external_account_id)}/record/0-1/${id}`
  }

  if (provider === 'salesforce' || provider === 'pipedrive') {
    const base = httpsBase(connection.instance_url)
    if (!base) return null
    return provider === 'salesforce' ? `${base}/${id}` : `${base}/person/${id}`
  }

  // `attio` (et tout futur fournisseur sans base vérifiée) : pas de lien devinée.
  return null
}

/**
 * #4188 — « ouvrir la fiche SOCIÉTÉ dans le CRM de l'utilisateur ». Mêmes
 * pièces vérifiables que pour un contact (aucun appel réseau) ; seul l'objet
 * change : HubSpot `0-2` (company), Salesforce l'Account sous la même base,
 * Pipedrive `/organization/`. Attio et Odoo : aucune URL vérifiable depuis ce
 * qu'on possède (slug d'espace inconnu, routes web qui varient selon la
 * version d'Odoo) — `null`, jamais un lien deviné.
 */
export function crmCompanyRecordUrl(
  provider: ContactCrmExport['provider'],
  crmRecordId: string,
  connection: CrmConnectionForLink | null,
): string | null {
  if (!connection) return null
  const id = encodeURIComponent(crmRecordId)
  if (provider === 'hubspot') {
    if (!connection.external_account_id) return null
    return `https://app.hubspot.com/contacts/${encodeURIComponent(connection.external_account_id)}/record/0-2/${id}`
  }
  if (provider === 'salesforce' || provider === 'pipedrive') {
    const base = httpsBase(connection.instance_url)
    if (!base) return null
    return provider === 'salesforce' ? `${base}/${id}` : `${base}/organization/${id}`
  }
  return null
}

/** `instance_url` validée et sans slash final — jamais composée telle quelle. */
function httpsBase(instanceUrl: string | null): string | null {
  if (!instanceUrl || !/^https:\/\//i.test(instanceUrl)) return null
  return instanceUrl.replace(/\/+$/, '')
}
