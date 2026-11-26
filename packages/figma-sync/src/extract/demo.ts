import { resolve } from 'node:path'

import { z } from 'zod'

import { REPO_ROOT } from './tokens'

/**
 * Le JEU DE DÉMONSTRATION des maquettes (défaut B, 25/09/2026 : « Compte exemple 1 » et « — »
 * partout). Lu au BUILD dans `apps/api/src/modules/demo/demo-dataset.ts` — le jeu que voit un
 * prospect sur le lien de démonstration — et photographié dans `generated/demo.json`, comme les
 * tokens : le plugin n'a aucun accès réseau ni disque.
 *
 * Six sociétés RÉELLES (Société Générale, Thales, leboncoin, BlaBlaCar, SNCF, Decathlon), leurs
 * interlocuteurs, le vivier de consultants, les missions et factures du client d'exemple. Une
 * valeur absente du jeu reste absente (`null`) : le rendu écrit « — », jamais une valeur devinée.
 * Aucune probabilité : un score et ses axes, jamais une chance de closing.
 */

export const DEMO_SOURCE = 'apps/api/src/modules/demo/demo-dataset.ts'
/** La date de la photographie : les échéances et retards du jeu sont relatifs à « maintenant ». */
export const DEMO_NOW = Date.UTC(2026, 8, 25)

const account = z.object({
  name: z.string(),
  sector: z.string(),
  city: z.string().nullable(),
  employees: z.string().nullable(),
  /** Score de priorité /10 (`priority_score`). */
  score: z.number().nullable(),
  /** Les axes du score, nommés (jamais un score nu). */
  axes: z.array(z.object({ label: z.string(), weight: z.number() })),
  verdict: z.string().nullable(),
  status: z.string(),
  lastAnalysis: z.string().nullable(),
  signal: z.string().nullable(),
  contacts: z.number(),
  nextAction: z.string().nullable(),
})
const contact = z.object({
  name: z.string(),
  title: z.string(),
  company: z.string(),
  entity: z.string().nullable(),
  role: z.string().nullable(),
  seniority: z.string().nullable(),
  score: z.number().nullable(),
  state: z.string().nullable(),
})
const consultant = z.object({
  name: z.string(),
  title: z.string(),
  seniority: z.string().nullable(),
  city: z.string().nullable(),
  availability: z.string().nullable(),
  tjm: z.number().nullable(),
  remote: z.string().nullable(),
  contract: z.string().nullable(),
  stack: z.array(z.string()),
})
const mission = z.object({
  label: z.string(),
  client: z.string(),
  consultant: z.string().nullable(),
  status: z.string(),
  endsInDays: z.number().nullable(),
  dailyRate: z.number().nullable(),
})
const invoice = z.object({
  reference: z.string(),
  mission: z.string(),
  client: z.string(),
  period: z.string(),
  amountCents: z.number(),
  dueOn: z.string().nullable(),
  status: z.enum(['paid', 'pending', 'overdue', 'disputed']),
})
const task = z.object({
  title: z.string(),
  company: z.string().nullable(),
  contact: z.string().nullable(),
  priority: z.string(),
  dueInDays: z.number().nullable(),
})
const activity = z.object({
  company: z.string().nullable(),
  contact: z.string().nullable(),
  kind: z.string(),
  subject: z.string().nullable(),
  daysAgo: z.number(),
})

export const DemoSetSchema = z.object({
  source: z.string(),
  owner: z.string(),
  accounts: z.array(account),
  contacts: z.array(contact),
  consultants: z.array(consultant),
  missions: z.array(mission),
  invoices: z.array(invoice),
  tasks: z.array(task),
  activities: z.array(activity),
})
export type DemoSet = z.infer<typeof DemoSetSchema>

type Rec = Record<string, unknown>
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const arr = (v: unknown): Rec[] => (Array.isArray(v) ? (v as Rec[]) : [])

/** « Banque — autres intermédiations monétaires (NAF 64.19Z) » → « Banque ». */
const shortSector = (s: string): string => s.split(/ — | \(/)[0]?.trim() ?? s
/** « 29 boulevard Haussmann, 75009 Paris » → « Paris ». */
const cityOf = (hq: string | null): string | null => {
  if (!hq) return null
  const m = /\d{5}\s+(.+)$/.exec(hq)
  return m?.[1]?.trim() ?? (hq.includes(',') ? null : hq)
}
/** « 10 000 salariés et plus (tranche INSEE 2023) » → « 10 000 salariés et plus ». */
const shortEmployees = (s: string | null): string | null => s?.split(/ \(|\. /)[0]?.trim() ?? null
const shortText = (s: string | null, max = 72): string | null =>
  s && s.length > max ? `${s.slice(0, max - 1).replace(/\s+\S*$/, '')}…` : s

/** Le jeu de démonstration, lu dans le module du dépôt (importé par l'appelant) et réduit à ce que les maquettes montrent. */
/**
 * Les maquettes montrent la VITRINE : les six premiers dossiers de la salle (SG, BPCE, SNCF, ENGIE,
 * TotalEnergies, Alstom). Les briefs clients ajoutés le 04/10/2026 portent la salle à quatorze
 * dossiers ; les rendre tous alourdit chaque page de maquette sans rien montrer de plus.
 */
const MAQUETTE_DOSSIERS = 6

export function extractDemo(mod: Rec, now = DEMO_NOW): DemoSet {
  const dossiers = arr(mod.DEMO_DOSSIERS).slice(0, MAQUETTE_DOSSIERS)
  const tasks = arr(mod.DEMO_TASKS)
  const openTasks = tasks.filter(t => !t.closed)
  const accounts = dossiers.map(d => {
    const a = (d.account ?? {}) as Rec
    const raw = (a.raw_analysis ?? {}) as Rec
    const name = str(a.company_name) ?? ''
    const signal = str(arr(a.recent_signals)[0]?.signal)
    return {
      name,
      sector: shortSector(str(a.sector) ?? ''),
      city: cityOf(str(a.headquarters)),
      employees: shortEmployees(str(a.employees)),
      score: num(a.priority_score),
      axes: arr(raw.score_factors).map(f => ({
        label: (str(f.label) ?? '').split(' — ')[0] ?? '',
        weight: num(f.weight) ?? 0,
      })),
      verdict: str(raw.go_no_go),
      status: str(a.commercial_status) ?? 'inbox',
      lastAnalysis: str(raw.last_refresh)?.slice(0, 10) ?? str(a.previous_analysis_at),
      signal: shortText(signal),
      contacts: arr(d.contacts).length,
      nextAction: str(openTasks.find(t => t.company === name)?.title),
    }
  })
  // Les interlocuteurs les mieux notés de chaque compte (trois par compte) : ce qu'une liste montre en premier.
  const contacts = dossiers.flatMap(d =>
    arr(d.contacts)
      .slice()
      .sort((x, y) => (num(y.contact_score) ?? 0) - (num(x.contact_score) ?? 0))
      .slice(0, 3)
      .map(c => ({
        name: str(c.full_name) ?? '',
        title: str(c.title) ?? '',
        company: str(((d.account ?? {}) as Rec).company_name) ?? '',
        entity: str(c.entity),
        role: str(c.decision_role),
        seniority: str(c.seniority),
        score: num(c.contact_score),
        state: str(c.lifecycle_state),
      })),
  )
  const consultants = arr(mod.DEMO_CONSULTANTS).map(c => ({
    name: str(c.full_name) ?? '',
    title: str(c.title) ?? '',
    seniority: str(c.seniority),
    city: str(c.city),
    availability: str(c.availability),
    tjm: num(c.tjm),
    remote: str(c.remote_preference),
    contract: str(c.contract_type),
    stack: (Array.isArray(c.stack) ? (c.stack as unknown[]) : []).filter((x): x is string => typeof x === 'string'),
  }))
  const delivery = (mod.DEMO_DELIVERY_CLIENT ?? {}) as Rec
  const client = str(((delivery.account ?? {}) as Rec).company_name) ?? ''
  const missions = arr(delivery.missions).map(m => ({
    label: str(m.label) ?? '',
    client,
    consultant: str(m.consultant),
    status: str(m.status) ?? 'active',
    endsInDays: num(m.ends_in_days),
    dailyRate: num(m.daily_rate),
  }))
  const history =
    typeof mod.demoInvoiceHistory === 'function' ? arr((mod.demoInvoiceHistory as (n: number) => unknown)(now)) : []
  const today = new Date(now).toISOString().slice(0, 10)
  const invoices = history.map(i => {
    const dueOn = str(i.dueOn)
    const status: 'paid' | 'pending' | 'overdue' | 'disputed' =
      i.disputedAt && !i.disputeResolvedAt
        ? 'disputed'
        : i.paidAt
          ? 'paid'
          : dueOn && dueOn < today
            ? 'overdue'
            : 'pending'
    return {
      reference: str(i.reference) ?? '',
      mission: str(i.missionLabel) ?? '',
      client,
      period: (str(i.periodMonth) ?? '').slice(0, 7),
      amountCents: num(i.invoicedAmountCents) ?? 0,
      dueOn,
      status,
    }
  })
  const owner = (mod.DEMO_OWNER ?? {}) as Rec
  return DemoSetSchema.parse({
    source: DEMO_SOURCE,
    owner: [str(owner.first_name), str(owner.last_name)].filter(Boolean).join(' '),
    accounts,
    contacts,
    consultants,
    missions,
    invoices,
    tasks: openTasks.map(t => ({
      title: str(t.title) ?? '',
      company: str(t.company),
      contact: str(t.contact),
      priority: str(t.priority) ?? 'normal',
      dueInDays: num(t.dueInDays),
    })),
    activities: arr(mod.DEMO_ACTIVITIES).map(a => ({
      company: str(a.company),
      contact: str(a.contact),
      kind: str(a.kind) ?? '',
      subject: shortText(str(a.subject)),
      daysAgo: num(a.daysAgo) ?? 0,
    })),
  })
}

/** Le module du jeu de démonstration (les paquets `@bellum/*` résolus sur leurs sources : `tsconfig.extract.json`). */
export async function loadDemoModule(): Promise<Rec> {
  const path = resolve(REPO_ROOT, DEMO_SOURCE)
  return (await import(path)) as Rec
}
