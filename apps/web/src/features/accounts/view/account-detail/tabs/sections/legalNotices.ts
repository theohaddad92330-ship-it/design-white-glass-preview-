import { readRecentSignals, type LegalSignal, type RegistryAnnouncement } from '@bellum/contracts'

/**
 * #3916 — présentation des annonces légales BODACC de la fiche compte.
 *
 * Une procédure collective (sauvegarde, redressement, liquidation) est un
 * RISQUE pour l'ESN, jamais une opportunité commerciale. Le contrat peut porter
 * `severity` ; absent (cas courant — la source ne la fournit pas), on la
 * déduit du type d'avis. Une annonce sans type lisible n'a rien à dire : elle
 * ne fait AUCUNE ligne (on n'affiche pas ce qu'on n'a pas).
 */

const RISK_TERMS = ['sauvegarde', 'redressement', 'liquidation', 'procedure collective', 'procedures collectives']

function deaccent(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

export function classifyLegalSeverity(notice: Pick<LegalSignal, 'type' | 'severity'>): 'risk' | 'info' {
  if (notice.severity === 'risk') return 'risk'
  const kind = deaccent(notice.type ?? '').toLowerCase()
  return RISK_TERMS.some(term => kind.includes(term)) ? 'risk' : 'info'
}

type LegalNotice = {
  type: string
  date: string | null
  url: string | null
  tribunal: string | null
  severity: 'risk' | 'info'
  /** #3916.b / #3921.a — la source qui l'a publiée : décide du libellé du lien. */
  source: 'bodacc' | 'sirene' | 'rne'
}

export function readLegalNotices(signals: readonly LegalSignal[] | undefined): LegalNotice[] {
  const rows: LegalNotice[] = []
  for (const s of signals ?? []) {
    const family = s?.type?.trim()
    if (!family) continue
    // #3916 — « Modifications diverses » seul ne dit rien : le type précis suit quand l'annonce le porte.
    const precision = s.precision?.trim()
    const type = precision ? `${family} — ${precision}` : family
    rows.push({
      type,
      date: s.date?.trim() || null,
      url: s.url?.trim() || null,
      tribunal: s.tribunal?.trim() || null,
      severity: classifyLegalSeverity({ type, severity: s.severity }),
      source: 'bodacc',
    })
  }
  // Les plus récentes d'abord ; une annonce non datée passe après les datées.
  return rows.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
}

/** Libellé d'une annonce dont la source ne publie pas de famille lisible. */
const KIND_FALLBACK_LABEL: Partial<Record<RegistryAnnouncement['kind'], string>> = {
  new_establishment: 'Nouvel établissement',
  executive_change: 'Changement de dirigeant',
  collective_proceeding: 'Procédure collective',
  // #3921 (décision Louis 13/10/2026) — « observé », jamais « changé » : la
  // source ne porte aucune date de fait, seulement notre jour d'observation.
  headcount_change: 'Effectif observé',
  // #3921.11 — datée par le registre national (`dateEffetFermeture`).
  establishment_closure: "Fermeture d'établissement",
}

/**
 * #3916.b — TOUTES les annonces : celles que l'analyse a figées
 * (`legal_signals`, 8 au plus) ET celles que la veille relit chaque matin
 * (`/accounts/:id/registry-announcements`). Une même annonce lue des deux côtés
 * (même lien, ou même famille le même jour) n'est qu'UNE ligne. Le genre décidé
 * à la source suffit à classer une procédure collective en risque.
 *
 * #3916 (recette R25, EDF) — une annonce BODACC peut n'être portée QUE par
 * `recent_signals` (source_kind `bodacc`, lien vérifié par le lecteur unique) :
 * elle entre dans la même liste, sans second lecteur, et ne double jamais une
 * annonce déjà lue (même lien). Sans lien vérifiable, ce n'est pas une annonce.
 */
export function mergeLegalNotices(
  signals: readonly LegalSignal[] | undefined,
  registry: readonly RegistryAnnouncement[] | undefined,
  recentSignals?: unknown,
): LegalNotice[] {
  const rows = readLegalNotices(signals)
  const byKey = new Map<string, LegalNotice>()
  for (const row of rows) {
    byKey.set(`${row.type.toLowerCase()}|${row.date ?? ''}`, row)
  }
  const seenUrls = new Set(rows.map(row => row.url ?? '').filter(Boolean))
  for (const a of registry ?? []) {
    // #3915.decp — un marché public attribué va à la carte des marchés, jamais ici.
    if (a.source === 'decp') continue
    const type = a.type?.trim() || KIND_FALLBACK_LABEL[a.kind]
    if (!type) continue
    const sameDay = `${type.toLowerCase()}|${a.date}`
    const existing = byKey.get(sameDay)
    // #3916.1 — recette prod R4b, SNCF RESEAU : la MÊME annonce, figée sans lien par
    // une analyse plus ancienne, en avait un côté veille continue du registre. Le
    // doublon ne doit jamais ÉCARTER le lien que l'autre lecture a : il COMPLÈTE la
    // ligne déjà retenue plutôt que de la garder sans lien pour toujours.
    if (existing) {
      if (!existing.url && a.url) existing.url = a.url
      continue
    }
    if (a.url && seenUrls.has(a.url)) continue
    if (a.url) seenUrls.add(a.url)
    const row: LegalNotice = {
      type,
      date: a.date,
      url: a.url,
      tribunal: a.tribunal,
      severity: a.kind === 'collective_proceeding' ? 'risk' : classifyLegalSeverity({ type }),
      source: a.source,
    }
    byKey.set(sameDay, row)
    rows.push(row)
  }
  // #3916 — R25 : l'annonce portée par un signal (lien BODACC vérifié), jamais par le nom.
  for (const s of readRecentSignals(recentSignals)) {
    if (s.source_kind !== 'bodacc' || !s.source_url) continue
    if (seenUrls.has(s.source_url)) continue
    seenUrls.add(s.source_url)
    rows.push({
      type: s.label,
      date: s.date,
      url: s.source_url,
      tribunal: null,
      severity: classifyLegalSeverity({ type: s.label }),
      source: 'bodacc',
    })
  }
  return rows.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
}

/** #3921.11 — le genre « établissement fermé » sous ses deux écritures (Sirene : « établissement fermé » ; RNE : « Fermeture d'établissement »). */
function isClosureNotice(notice: Pick<LegalNotice, 'type'>): boolean {
  return /^(etablissement ferme|fermeture d'etablissement)/.test(deaccent(notice.type).toLowerCase())
}

/** Au-delà de ce nombre, des fermetures d'établissement se regroupent en UNE ligne dépliable. */
const CLOSURE_GROUP_MIN = 5

type LegalNoticeRow = LegalNotice & {
  /** #3921.11 — les fermetures regroupées sous cette ligne, la plus récente d'abord ; absent = une annonce seule. */
  members?: LegalNotice[]
}

/**
 * #3921.11 (recette R41) — « 80 lignes “établissement fermé” identiques » : au-delà de `CLOSURE_GROUP_MIN`, les
 * fermetures d'établissement forment UNE ligne (« 80 établissements fermés entre <date> et <date> », dépliable),
 * placée où se trouvait la plus récente. Rien n'est supprimé : chaque fermeture reste lisible, repliée. Les autres
 * annonces ne bougent pas ; sous le seuil, la liste est rendue telle quelle.
 */
export function groupClosureNotices(notices: readonly LegalNotice[]): LegalNoticeRow[] {
  const closures = notices.filter(isClosureNotice)
  if (closures.length < CLOSURE_GROUP_MIN) return [...notices]
  const dated = closures.map(notice => notice.date).filter((date): date is string => Boolean(date))
  const newest = dated.length > 0 ? dated.reduce((a, b) => (a > b ? a : b)) : null
  const group: LegalNoticeRow = {
    ...closures[0]!,
    date: newest,
    url: null,
    members: [...closures],
  }
  const out: LegalNoticeRow[] = []
  let placed = false
  for (const notice of notices) {
    if (!isClosureNotice(notice)) {
      out.push(notice)
    } else if (!placed) {
      out.push(group)
      placed = true
    }
  }
  return out
}
