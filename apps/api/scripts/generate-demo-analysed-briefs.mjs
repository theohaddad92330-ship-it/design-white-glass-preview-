#!/usr/bin/env node
/**
 * Génère le BRIEF COMMERCIAL « Ce que je sais » des quatre comptes démo analysés (Airbus, EDF, Renault, Thales) —
 * décision Louis 13/10/2026 : leur fiche s'ouvre sur « Ce que je sais » comme Orange.
 *
 * Usage : node apps/api/scripts/generate-demo-analysed-briefs.mjs
 * Lit   : apps/api/src/modules/demo/data/analysed-accounts/<compte>.json (générés par generate-demo-analysed-accounts.mjs)
 * Écrit : apps/api/src/modules/demo/data/commercial-briefs/<compte>.json — fichiers GÉNÉRÉS, jamais édités à la main.
 *
 * ⚠️ AUCUNE donnée inventée : chaque ligne est recopiée du JSON analysé du même compte (fiche, `raw_analysis`, contacts).
 * Une section sans matière n'est pas écrite. Une personne citée est un contact semé du compte, sous son nom exact ;
 * les contacts à prénom seul ne sont pas cités (une personne qu'on ne sait pas nommer ne s'affiche pas dans le brief).
 * Les dirigeants légaux (`c_level`) ne sont pas cités : ils ne sont pas des contacts semés.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const DATA = join(HERE, '..', 'src', 'modules', 'demo', 'data')
const GENERATED_AT = '2026-10-13T08:00:00.000Z'
const MAX_PEOPLE = 25
const ACCOUNTS = [
  { file: 'airbus', name: 'Airbus' },
  { file: 'edf', name: 'EDF' },
  { file: 'renault', name: 'Renault' },
  { file: 'thales', name: 'Thales' },
]

const filled = value => typeof value === 'string' && value.trim() !== ''
const pick = (row, columns) =>
  Object.fromEntries(columns.map(([key, value]) => [key, filled(value) ? value.trim() : null]))
const cols = defs => defs.map(([key, label]) => ({ key, label }))
const title = text => text.toLowerCase().replace(/(^|[\s-])\p{L}/gu, match => match.toUpperCase())
const eur = amount => {
  if (amount >= 1e9) return `${(amount / 1e9).toFixed(1).replace('.', ',')} Md€`
  return `${Math.round(amount / 1e6).toLocaleString('fr-FR')} M€`
}
const ROLE = { economic: 'decision_maker', procurement: 'manager' }

function section(key, sectionTitle, columns, rows) {
  if (rows.length === 0) return []
  return [{ key, title: sectionTitle, columns: cols(columns), rows }]
}

function build({ name, file }) {
  const data = JSON.parse(readFileSync(join(DATA, 'analysed-accounts', `${file}.json`), 'utf8'))
  const { account, contacts } = data
  const ra = account.raw_analysis
  const hq = ra.headquarters_address ?? {}
  const sites = ra.sites_france ?? []
  const years = (ra.financials_history ?? []).filter(row => typeof row.revenue === 'number' && row.revenue > 0)
  const latest = years[0]

  // Personnes : contacts semés, nom complet, décideurs d'abord, puis meilleure priorité.
  const named = contacts.filter(c => filled(c.full_name) && c.full_name.trim().split(/\s+/).length >= 2)
  const rank = c => (c.decision_role === 'economic' ? 0 : c.decision_role === 'procurement' ? 1 : 2)
  const people = named
    .map((c, i) => ({ c, i }))
    .sort((a, b) => rank(a.c) - rank(b.c) || (a.c.priority ?? 99) - (b.c.priority ?? 99) || a.i - b.i)
    .slice(0, MAX_PEOPLE)
    .map(({ c }) => {
      const person = { name: c.full_name }
      if (filled(c.title)) person.function = c.title
      if (filled(c.entity)) person.entity = c.entity
      if (filled(c.email)) person.email = c.email
      if (filled(c.phone)) person.phone = c.phone
      if (filled(c.linkedin_url)) person.linkedin = c.linkedin_url
      if (filled(c.why_contact)) person.hook = c.why_contact
      if (ROLE[c.decision_role]) person.role = ROLE[c.decision_role]
      else person.role = 'contact'
      return person
    })

  const knows = []
  const legal = [
    ra.legal_form,
    account.siren && `SIREN ${account.siren}`,
    account.naf_code && `NAF ${account.naf_code}`,
  ]
    .filter(filled)
    .join(' · ')
  if (legal)
    knows.push({
      rubric: 'Identité légale',
      known: legal,
      meaning: 'Le périmètre juridique à viser est celui de l’entité française immatriculée.',
    })
  if (filled(ra.business_description))
    knows.push({
      rubric: 'Activité',
      known: ra.business_description,
      meaning: 'Le vocabulaire du compte sert à cadrer la première approche.',
    })
  if (latest)
    knows.push({
      rubric: 'Chiffre d’affaires',
      known: `${eur(latest.revenue)} en ${latest.year}`,
      meaning: 'L’ordre de grandeur du compte, tel que déposé au registre.',
    })
  if (filled(account.employees))
    knows.push({ rubric: 'Effectif', known: account.employees, meaning: 'La taille de l’entité légale analysée.' })
  if (sites.length)
    knows.push({
      rubric: 'Implantations en France',
      known: sites.map(s => title(s.city)).join(', '),
      meaning: 'Les villes où cibler les équipes.',
    })
  if (filled(ra.comment_ouvrir_compte))
    knows.push({
      rubric: 'Porte d’entrée',
      known: ra.comment_ouvrir_compte,
      meaning: 'La façon d’ouvrir le compte retenue par l’analyse.',
    })
  if (filled(account.priority_justification))
    knows.push({
      rubric: 'Priorité',
      known: account.priority_justification,
      meaning: 'Pourquoi ce compte mérite (ou non) l’effort, selon l’analyse.',
    })

  const kpis = []
  if (latest) kpis.push({ label: `CHIFFRE D’AFFAIRES ${latest.year}`, value: eur(latest.revenue) })
  if (filled(account.employees)) kpis.push({ label: 'EFFECTIF', value: account.employees })
  if ((ra.recent_signals ?? []).length) kpis.push({ label: 'SIGNAUX RÉCENTS', value: ra.recent_signals.length })
  if (sites.length) kpis.push({ label: 'IMPLANTATIONS FRANCE', value: sites.length })
  if (people.length) kpis.push({ label: 'PERSONNES CITÉES', value: people.length })

  // 13/10/2026 : une année sans CA (absent, 0, arrondi à 0 M€, non fini) est OMISE du graphique, jamais écrite « 0 ».
  const caItems = [...years]
    .reverse()
    .map(row => ({ label: String(row.year), value: Math.round(row.revenue / 1e6) }))
    .filter(item => Number.isFinite(item.value) && item.value > 0)
  const charts = caItems.length > 1 ? [{ title: 'Chiffre d’affaires (M€)', items: caItems }] : []

  const entities = []
  const seen = new Set()
  for (const e of ra.entities_exhaustive ?? []) {
    if (!filled(e.name) || seen.has(e.name)) continue
    seen.add(e.name)
    // Sortie du groupe : seulement quand l'analyse la dit (`is_active` faux) ; une clé absente n'est pas une sortie.
    const active = !(e.is_active === false || e.is_active === 'false')
    const entity = { name: e.name, status: active ? 'active' : 'exited' }
    if (filled(e.type)) entity.nature = e.type
    if (!active) entity.note = 'Entité marquée inactive dans l’analyse.'
    entities.push(entity)
  }

  let hqTaken = false
  const briefSites = sites
    .filter(s => filled(s.city))
    .map(s => {
      const isHq = s.type === 'siège' && !hqTaken
      hqTaken = hqTaken || isHq
      const site = {
        name: title(s.city),
        city: title(s.city),
        country: 'FR',
        kind: isHq ? 'headquarters' : 'secondary',
      }
      if (filled(s.notes)) site.why = s.notes
      return site
    })

  const esn = (ra.esn_presence ?? [])
    .filter(e => filled(e.name) && filled(e.scope))
    .map(e => ({ name: e.name, evidence_level: 'hint', proof: e.scope, perimeter: e.scope }))

  const sections = [
    ...section(
      'fiche-compte',
      'Fiche du compte',
      [
        ['champ', 'Champ'],
        ['valeur', 'Valeur'],
      ],
      [
        ['Forme juridique', ra.legal_form],
        ['SIREN', account.siren],
        [
          'Code NAF',
          account.naf_code ? `${account.naf_code}${filled(ra.naf_label) ? ` — ${ra.naf_label}` : ''}` : null,
        ],
        ['Date de création', ra.creation_date],
        ['Siège', account.headquarters],
        ['Site web', account.website],
      ]
        .filter(([, value]) => filled(value))
        .map(([champ, valeur]) => ({ champ, valeur })),
    ),
    ...section(
      'projets',
      'Programmes et projets',
      [
        ['programme', 'Programme'],
        ['entite', 'Entité'],
        ['objectif', 'Objectif'],
        ['perimetre', 'Périmètre'],
      ],
      (ra.program_names ?? [])
        .filter(p => filled(p.name))
        .map(p =>
          pick(p, [
            ['programme', p.name],
            ['entite', p.entity],
            ['objectif', p.objective],
            ['perimetre', p.scope],
          ]),
        ),
    ),
    ...section(
      'signaux',
      'Signaux récents',
      [
        ['date', 'Date'],
        ['signal', 'Signal'],
        ['source', 'Source'],
        ['implication', 'Ce que ça change pour nous'],
      ],
      (ra.recent_signals ?? [])
        .filter(s => filled(s.signal))
        .map(s =>
          pick(s, [
            ['date', s.date],
            ['signal', s.signal],
            ['source', s.source],
            ['implication', s.sales_implication],
          ]),
        ),
    ),
    ...section(
      'budgets',
      'Signaux budgétaires',
      [
        ['signal', 'Signal'],
        ['source', 'Source'],
        ['echeance', 'Échéance'],
        ['lecture', 'Lecture'],
      ],
      (ra.budget_signals ?? [])
        .filter(b => filled(b.signal))
        .map(b =>
          pick(b, [
            ['signal', b.signal],
            ['source', b.source],
            ['echeance', b.timeframe],
            ['lecture', b.relevance],
          ]),
        ),
    ),
    ...section(
      'enjeux',
      'Enjeux repérés',
      [
        ['enjeu', 'Enjeu'],
        ['urgence', 'Urgence'],
        ['impact', 'Impact'],
      ],
      (ra.pains ?? [])
        .filter(p => filled(p.pain))
        .map(p =>
          pick(p, [
            ['enjeu', p.pain],
            ['urgence', p.urgency],
            ['impact', p.business_impact],
          ]),
        ),
    ),
  ]

  const guardrails = (ra.regulations ?? []).filter(filled).map(detail => ({ point: 'Cadre réglementaire', detail }))
  guardrails.push({
    point: 'Origine de l’analyse',
    detail:
      'Analyse du 12/10/2026 sur sources publiques : ce qu’elle indique comme non identifié reste à confirmer avant toute prise de contact.',
  })

  return {
    account_name: name,
    generated_at: GENERATED_AT,
    scope: 'france',
    headquarters: {
      label: 'Siège social',
      city: title(hq.city ?? sites.find(s => s.type === 'siège')?.city ?? ''),
      ...(filled(hq.address_line_1)
        ? { address: [hq.address_line_1, hq.postal_code, hq.city].filter(filled).join(', ') }
        : {}),
    },
    kpis,
    what_i_know: knows,
    charts,
    entities,
    sites: briefSites,
    prices: [],
    esn,
    people,
    sections,
    guardrails,
  }
}

for (const account of ACCOUNTS) {
  const brief = build(account)
  writeFileSync(join(DATA, 'commercial-briefs', `${account.file}.json`), `${JSON.stringify(brief, null, 2)}\n`)
  process.stdout.write(
    `${account.file}: ${brief.people.length} personnes, ${brief.sections.length} sections, ${brief.sites.length} sites\n`,
  )
}
