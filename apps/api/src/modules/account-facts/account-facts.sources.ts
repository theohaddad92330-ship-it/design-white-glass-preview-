import { readRecentSignals, type AccountFact, type AccountFactKind } from '@bellum/contracts'

/**
 * #4069.1 — LES FAMILLES DE FAITS DU COMPTE, lignes lues → faits bruts.
 *
 * Fonctions PURES : la lecture SQL vit dans `account-facts.service.ts`, la
 * pondération dans `@bellum/contracts` (`weighAccountFacts`, #4069.2). Ici on
 * ne fait que dire chaque ligne par sa NATURE, sa DATE et son LIBELLÉ — jamais
 * par sa source (décision Louis 12/10 : « jamais nommé »). Une ligne sans
 * libellé ou sans date lisible ne fait AUCUN fait : on n'affiche pas ce qu'on
 * n'a pas, et on ne devine jamais une date.
 */
type RawFact = Omit<AccountFact, 'weight' | 'ageDays'>
type When = Date | string | null | undefined

const LABEL_MAX = 280
const ISO_DATE = /^\d{4}-\d{2}-\d{2}/

function isoDay(...candidates: When[]): string | null {
  for (const value of candidates) {
    if (value === null || value === undefined || value === '') continue
    // Une chaîne n'est lue que si elle est ISO : `Date.parse('mars 2023')` rend
    // le 1er mars sous V8 — une date devinée, exactement ce que le socle refuse.
    if (typeof value === 'string' && !ISO_DATE.test(value)) continue
    const t = value instanceof Date ? value.getTime() : Date.parse(value)
    if (Number.isFinite(t)) return new Date(t).toISOString().slice(0, 10)
  }
  return null
}

function oneLine(text: string | null | undefined): string {
  const flat = (text ?? '').replace(/\s+/g, ' ').trim()
  return flat.length > LABEL_MAX ? `${flat.slice(0, LABEL_MAX - 1)}…` : flat
}

function fact(kind: AccountFactKind, label: string | null | undefined, ...dates: When[]): RawFact[] {
  const text = oneLine(label)
  const date = isoDay(...dates)
  return text && date ? [{ date, kind, label: text }] : []
}

/** Le type d'un signal est du texte libre écrit par l'analyse : on n'en lit que ce qu'il DIT. */
export function signalKindOf(type: string | null | undefined): AccountFactKind {
  const t = (type ?? '').toLowerCase()
  if (/recrut|hiring|job|emploi|offre_d_emploi/.test(t)) return 'hiring'
  if (/besoin|need|appel|rfp|tender|consultation/.test(t)) return 'need'
  return 'signal'
}

/** A — `signal_history`, TOUT âge, actifs comme résolus (lecture de `SignalHistoryService.queryForWorkspace`, ici bornée au compte). */
export function signalHistoryFacts(
  rows: ReadonlyArray<{
    label: string | null
    signal_type: string | null
    signal_date: string | null
    first_detected_at: When
  }>,
): RawFact[] {
  return rows.flatMap(r => fact(signalKindOf(r.signal_type), r.label, r.signal_date, r.first_detected_at))
}

/**
 * A — signaux COURANTS du dossier (`accounts.recent_signals`, lu par
 * `readRecentSignals` comme partout). `signal_history` en est l'histoire,
 * matérialisée après chaque analyse ; le blob reste la seule trace sur un
 * compte jamais historisé (la salle de démonstration, un compte importé). Le
 * même fait lu des deux côtés le même jour n'est pas une récurrence
 * (`weighAccountFacts`). Le lien public de l'article est gardé, jamais un
 * autre.
 */
export function currentSignalFacts(raw: unknown): RawFact[] {
  return readRecentSignals(raw).flatMap(s => {
    const [base] = fact(signalKindOf(s.type), s.label, s.date && ISO_DATE.test(s.date) ? s.date : null)
    if (!base) return []
    // `ReadRecentSignal` ne porte que `source_url` (#3922) : l'ancien repli `s.url` ne compilait pas.
    const url = s.source_url
    return [url && /^https:\/\//.test(url) ? { ...base, url } : base]
  })
}

/** B — affaires CLOSES (`crm_deal_facts`) : gagnée / perdue. Une issue inconnue ne fait aucune ligne. */
export function crmDealFacts(
  rows: ReadonlyArray<{ name: string | null; is_won: boolean | null; closed_at: When; last_activity_at: When }>,
): RawFact[] {
  return rows.flatMap(r =>
    r.is_won === null ? [] : fact(r.is_won ? 'deal_won' : 'deal_lost', r.name, r.closed_at, r.last_activity_at),
  )
}

/**
 * B — affaires NATIVES (`opportunities`, #4069 W-G) : l'issue posée par le
 * commercial dans Bellum (`outcome` won | lost). Avant, seules les affaires du
 * CRM (`crm_deal_facts`) étaient lues : une affaire perdue saisie dans Bellum
 * n'arrivait jamais à Laura. `abandoned` et « en jeu » ne font AUCUNE ligne
 * (aucune nature de fait ne les dit) ; la date est la clôture, à défaut l'entrée
 * dans l'étape — jamais une date devinée.
 */
export function projectDealFacts(
  rows: ReadonlyArray<{
    label: string | null
    outcome: string | null
    closed_at: When
    stage_entered_at: When
  }>,
): RawFact[] {
  return rows.flatMap(r =>
    r.outcome === 'won' || r.outcome === 'lost'
      ? fact(r.outcome === 'won' ? 'deal_won' : 'deal_lost', r.label, r.closed_at, r.stage_entered_at)
      : [],
  )
}

/** B — affaires en SOMMEIL (`canonical_trigger_events`, même lecture que `CrmAccountSignalsService`). */
export function dormantDealFacts(rows: ReadonlyArray<{ evidence: string | null; occurred_at: When }>): RawFact[] {
  return rows.flatMap(r => fact('deal_dormant', r.evidence, r.occurred_at))
}

/**
 * D — ce que le marché a observé chez ce compte (`MarketMemoryService.coverageFor`).
 * Daté par la FIN de la période couverte : sans elle, aucun fait (jamais la date d'import).
 */
export function marketObservationFacts(read: {
  status: 'ok' | 'unavailable'
  coverage?: {
    covered: boolean
    esnObserved?: ReadonlyArray<{ esnName: string }>
    roleFamilies?: ReadonlyArray<{ family: string }>
    periodEnd?: string | null
  }
}): RawFact[] {
  const coverage = read.status === 'ok' ? read.coverage : undefined
  if (!coverage?.covered) return []
  const parts: string[] = []
  const esn = (coverage.esnObserved ?? []).slice(0, 5).map(e => e.esnName)
  if (esn.length > 0) parts.push(`prestataires observés : ${esn.join(', ')}`)
  const roles = (coverage.roleFamilies ?? []).slice(0, 5).map(r => r.family)
  if (roles.length > 0) parts.push(`familles de rôles observées : ${roles.join(', ')}`)
  if (parts.length === 0) return []
  return fact('market_observation', parts.join(' · '), coverage.periodEnd)
}

/** E — documents de l'espace : le TITRE et la date, jamais le contenu. */
export function documentFacts(rows: ReadonlyArray<{ title: string | null; created_at: When }>): RawFact[] {
  return rows.flatMap(r => fact('document', r.title, r.created_at))
}

/** F — missions menées chez ce compte. */
export function missionFacts(
  rows: ReadonlyArray<{ label: string | null; started_on: string | null; created_at: When }>,
): RawFact[] {
  return rows.flatMap(r => fact('mission', r.label, r.started_on, r.created_at))
}

const RENEWAL_LEAD_DAYS = 90
const DAY_MS = 86_400_000

/**
 * B — renouvellement à examiner (#3918.6, décision Louis 15/10/2026) : une ligne
 * DATÉE de `fin connue − 90 jours`, sur une mission vivante dont la fin est
 * connue. Sans date de fin ISO (ou fin dépassée, ou fenêtre pas encore ouverte)
 * : AUCUNE ligne — on n'affiche pas ce qu'on n'a pas, on ne devine pas une fin.
 */
export function renewalDueFacts(
  rows: ReadonlyArray<{ label: string | null; status: string | null; ends_on: When }>,
  asOf: Date,
): RawFact[] {
  return rows.flatMap(r => {
    if (r.status === 'ended' || r.status === 'terminated' || r.status === 'renewed') return []
    const end = isoDay(r.ends_on)
    if (!end) return []
    const endMs = Date.parse(end)
    const dueMs = endMs - RENEWAL_LEAD_DAYS * DAY_MS
    if (asOf.getTime() < dueMs || asOf.getTime() > endMs + DAY_MS - 1) return []
    return fact('deal_renewal', r.label, new Date(dueMs))
  })
}

/** G — besoins ENREGISTRÉS (ouverts comme fermés : un besoin récurrent est un signal fort). */
export function needFacts(rows: ReadonlyArray<{ title: string | null; created_at: When }>): RawFact[] {
  return rows.flatMap(r => fact('need', r.title, r.created_at))
}

/** G — notes et comptes rendus de RDV (une note née d'un RDV porte son récapitulatif). */
export function noteFacts(
  rows: ReadonlyArray<{ body: string | null; created_at: When; is_meeting: boolean }>,
): RawFact[] {
  return rows.flatMap(r => fact(r.is_meeting ? 'meeting' : 'note', r.body, r.created_at))
}

/** G — corrections apportées par l'équipe au dossier (le retour PRODUIT, jamais son auteur). */
export function feedbackFacts(
  rows: ReadonlyArray<{ target_ref: string | null; verdict: string | null; note: string | null; created_at: When }>,
): RawFact[] {
  return rows.flatMap(r => {
    const parts = [oneLine(r.target_ref), oneLine(r.note)].filter(Boolean)
    return fact('correction', parts.join(' — '), r.created_at)
  })
}

const EXCHANGE_KIND_LABEL: Record<string, { sent: string; received: string }> = {
  email: { sent: 'E-mail envoyé', received: 'E-mail reçu' },
  call: { sent: 'Appel passé', received: 'Appel reçu' },
  meeting: { sent: 'Rendez-vous', received: 'Rendez-vous' },
  linkedin: { sent: 'Message LinkedIn envoyé', received: 'Message LinkedIn reçu' },
}

/**
 * H — échanges (#4072.2/.3) en MÉTADONNÉES : le geste, la personne, le sujet,
 * daté par l'événement. Le corps n'est jamais sélectionné (doctrine c96) : cette
 * fonction n'a pas de champ où le recevoir. Une ligne interne, d'une autre
 * nature, ou sans date ne fait aucune ligne.
 */
export function exchangeFacts(
  rows: ReadonlyArray<{
    kind: string | null
    direction: string | null
    subject: string | null
    occurred_at: When
    contact_name: string | null
  }>,
): RawFact[] {
  return rows.flatMap(r => {
    const labels = r.kind ? EXCHANGE_KIND_LABEL[r.kind] : undefined
    if (!labels || (r.direction !== 'outbound' && r.direction !== 'inbound')) return []
    const outbound = r.direction === 'outbound'
    const who = oneLine(r.contact_name)
    const subject = oneLine(r.subject)
    const head = outbound ? labels.sent : labels.received
    const withWho = who ? `${head} ${outbound ? 'à' : 'de'} ${who}` : head
    return fact('exchange', subject ? `${withWho} — « ${subject} »` : withWho, r.occurred_at)
  })
}

/**
 * #4284.19 — LES PARCOURS : les rôles d'une personne CHEZ ce compte (passés ou en cours), lus dans le parcours
 * enregistré de ses contacts. Daté par le fait lui-même (fin d'un rôle passé, début d'un rôle en cours) et
 * seulement quand cette date est ISO — jamais devinée. Sans provenance : « Marie Durand — DSI chez Renault
 * (2018 – 2023) ». Seul l'employeur = ce compte (mot entier) fait une ligne : un autre employeur n'est pas un
 * fait de CE compte.
 */
export function careerFacts(
  people: ReadonlyArray<{
    full_name: string | null
    employment_history: ReadonlyArray<{
      organization_name?: string | null
      title?: string | null
      start_date?: string | null
      end_date?: string | null
      current?: boolean
    }> | null
  }>,
  companyName: string | null | undefined,
): RawFact[] {
  const company = (companyName ?? '').trim().toLowerCase()
  if (!company) return []
  const escaped = company.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const sameCompany = new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`, 'u')
  return people.flatMap(person => {
    const name = (person.full_name ?? '').trim()
    if (!name) return []
    return (person.employment_history ?? []).flatMap(role => {
      const organization = (role.organization_name ?? '').trim()
      if (!organization || !sameCompany.test(organization.toLowerCase())) return []
      const title = (role.title ?? '').trim()
      const startYear = isoDay(role.start_date)?.slice(0, 4)
      const endYear = isoDay(role.end_date)?.slice(0, 4)
      const past = role.current !== true
      const when = past ? isoDay(role.end_date) : isoDay(role.start_date)
      if (!when) return []
      const period = past
        ? startYear && endYear
          ? ` (${startYear} – ${endYear})`
          : endYear
            ? ` (jusqu'en ${endYear})`
            : ''
        : startYear
          ? ` (depuis ${startYear})`
          : ''
      return fact('career', `${name} — ${title ? `${title} chez ` : 'chez '}${organization}${period}`, when)
    })
  })
}
