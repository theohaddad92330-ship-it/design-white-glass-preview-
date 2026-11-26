/** Libellé d'un fournisseur pour les messages de retour OAuth. Sans table de
 *  traduction : ce sont des noms propres, et une table oubliée afficherait une
 *  clé i18n brute au moment le moins opportun — juste après une connexion. */
export function providerLabel(provider: string): string {
  const known: Record<string, string> = {
    google: 'Google Workspace',
    hubspot: 'HubSpot',
    salesforce: 'Salesforce',
    pipedrive: 'Pipedrive',
    attio: 'Attio',
    zoho: 'Zoho CRM',
    notion: 'Notion',
    microsoft: 'Microsoft 365',
  }
  return known[provider] ?? provider
}
