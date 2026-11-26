// ── Le lien d'un signal (#3922) ──────────────────────────────────────────────
// UNE seule lecture pour tous les écrans (#3928 : veille, Mes cibles, Découvrir,
// cloche, Laura). L'URL est posée par le pipeline depuis le jeton de la source
// (apps/ia `stamp_signal_urls`) — jamais devinée, jamais une recherche. Sans URL
// http(s) vérifiable, le résultat est `none` et l'écran dit « Sans lien
// vérifiable » ; il n'invente pas de lien de repli.

export const SIGNAL_SOURCE_KINDS = ['press', 'bodacc', 'job', 'tender', 'official', 'other'] as const
export type SignalSourceKind = (typeof SIGNAL_SOURCE_KINDS)[number]

export type SignalSourceLink = { kind: 'link'; url: string; sourceKind: SignalSourceKind } | { kind: 'none' }

/**
 * #3922 (lot Q02) — « page officielle » est une QUALITÉ de la source, pas une étiquette libre :
 * un article de presse (frenchweb) marqué `official` se lisait « Voir la page officielle ».
 * Elle ne se garde que sur un domaine officiel connu (suffixe de nom d'hôte exact, jamais une
 * simple inclusion : `gouv.fr.evil.example` n'en est pas un) ; ailleurs, le libellé neutre.
 */
const OFFICIAL_HOST_SUFFIXES = [
  'gouv.fr',
  'bodacc.fr',
  'boamp.fr',
  'insee.fr',
  'inpi.fr',
  'infogreffe.fr',
  'urssaf.fr',
  'banque-france.fr',
  'amf-france.org',
  'europa.eu',
] as const

function isOfficialHost(url: string): boolean {
  let host = ''
  try {
    host = new URL(url).hostname.toLowerCase()
  } catch {
    return false
  }
  // `example.org` (RFC 2606) est l'hôte RÉSERVÉ des liens de la salle de démo : il ne mène à aucun
  // site réel, son genre déclaré (`demoSourceUrl`) est cru tel quel.
  if (host === 'example.org') return true
  return OFFICIAL_HOST_SUFFIXES.some(suffix => host === suffix || host.endsWith(`.${suffix}`))
}

export function resolveSignalSourceLink(input: { url?: string | null; source_kind?: string | null }): SignalSourceLink {
  const url = input.url?.trim() ?? ''
  if (!/^https?:\/\/\S+$/i.test(url)) return { kind: 'none' }
  const claimed = SIGNAL_SOURCE_KINDS.find(kind => kind === input.source_kind) ?? 'other'
  const sourceKind: SignalSourceKind = claimed === 'official' && !isOfficialHost(url) ? 'other' : claimed
  return { kind: 'link', url, sourceKind }
}
