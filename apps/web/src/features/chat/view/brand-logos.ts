/**
 * #3973 / #3708.logos (décision Louis 05/10/2026, mise en œuvre 15/10/2026) — LES LOGOS de marque du
 * sélecteur « Outils et sources » de Laura.
 *
 * Portée STRICTE, celle de la doctrine : CE sélecteur, pour l'outil que l'espace a lui-même branché
 * (`connectedClientTools`). Les fichiers vivent dans `brand-logos/` — SVG commités, JAMAIS chargés à
 * distance (aucune favicon, aucun `/logo?domain=…`) — et chacun a sa ligne dans `brand-logos/LICENSES.md`
 * (source, licence, date de relevé) : un logo sans licence écrite n'entre pas, la garde
 * `brand-logos.test.ts` le refuse. Nos fournisseurs (enrichissement, collecte, modèles, hébergement) ne
 * se dessinent jamais : seul un identifiant d'outil CLIENT de cette table a un logo.
 *
 * Un outil sans fichier (pas de source légale, licence incompatible) garde l'icône de Réglages ›
 * Intégrations (`connectedToolIcon`) — jamais un logo approximatif ni tiré d'ailleurs.
 */
const FILES = import.meta.glob('./brand-logos/*.svg', {
  eager: true,
  query: '?url&no-inline',
  import: 'default',
}) as Record<string, string>

/** Identifiant d'outil du registre client → nom du fichier (sans extension). */
const PROVIDER_TO_LOGO: Readonly<Record<string, string>> = {
  gmail: 'gmail',
  'google-calendar': 'google-calendar',
  'google-drive': 'google-drive',
  microsoft: 'microsoft',
  hubspot: 'hubspot',
  salesforce: 'salesforce',
  pipedrive: 'pipedrive',
  // #3973.7 — Attio attend le fichier sous licence de Louis : `brand-logos/attio.svg` + sa ligne LICENSES.md,
  // rien d'autre à toucher. Sans fichier, `byName` ne le trouve pas et l'icône générique reste.
  attio: 'attio',
  odoo: 'odoo',
  zoho: 'zoho',
  linkedin: 'linkedin',
  notion: 'notion',
  slack: 'slack',
  discord: 'discord',
  teams: 'teams',
  googlechat: 'googlechat',
  mattermost: 'mattermost',
}

const byName = new Map(
  Object.entries(FILES).map(([path, url]) => [path.replace(/^.*\//, '').replace(/\.svg$/, ''), url] as const),
)

/** L'URL du logo d'un outil branché, ou `null` : l'appelant garde alors l'icône de capacité. */
export function connectedToolLogo(provider: string, family?: string): string | null {
  // « microsoft » couvre Outlook (e-mail) et le groupe : en famille e-mail, c'est le logo Outlook.
  const name = provider === 'microsoft' && family === 'email' ? 'outlook' : PROVIDER_TO_LOGO[provider]
  return (name ? byName.get(name) : undefined) ?? null
}
