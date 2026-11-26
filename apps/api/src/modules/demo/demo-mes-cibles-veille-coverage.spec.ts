import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { hiringDomain } from '@bellum/contracts'
import { rankAccountContacts, type RankableContactRow } from '../contacts/contact-ranking'
import { filterEligibleContacts } from '../contacts/contact-eligibility'
import { DEMO_MES_CIBLES_VEILLE_COVERAGE } from './demo-coverage'
import { DEMO_DOSSIERS, DEMO_ANALYSED_ACCOUNTS, DEMO_ESN_PROFILE } from './demo-dataset'

/**
 * #4088.9 (craft rule n°9, Louis 12/10/2026) — « /mes-cibles » (« Ce qui bouge sur
 * tes comptes ») se remplit EN DÉMONSTRATION : trois comptes RÉELS des briefs, avec
 * (1) un signal dont le TYPE porte un besoin d'ESN — la colonne « Pourquoi ça compte »,
 * (2) un décideur NOMMÉ en tête du classement des contacts — « Qui ça concerne » et
 * « Prochaine action » (« Appeler Marie D. »), (3) un score, donc une raison de rang.
 *
 * La garde LIT le modèle web réel pour la liste des types (`SIGNAL_NEED_NEEDLES`, un
 * seul endroit, GA-26) et rejoue le MÊME classement que l'API (`rankAccountContacts`,
 * précédé de la porte d'éligibilité) sur les contacts du jeu de données : une liste
 * recopiée à la main dériverait. Aucun compte fictif « exemple », aucun compte mince.
 */

const MODEL = join(__dirname, '..', '..', '..', '..', 'web', 'src', 'features', 'watchlist', 'model', 'watchlist.ts')

function needLexicon(): string[] {
  const source = readFileSync(MODEL, 'utf8')
  const block = source.slice(source.indexOf('const SIGNAL_NEED_NEEDLES'), source.indexOf('const WHY_TYPE_KEY'))
  return [...block.matchAll(/\['([^']+)', '(?:hiring|mna|exec|funding|tender)'\]/g)].map(match => match[1]!)
}

/** #4088.7 — le motif d'écartement « offre de stage », LU dans le modèle réel (GA-26), jamais recopié. */
function internshipRegex(): RegExp {
  const source = readFileSync(MODEL, 'utf8')
  const match = source.match(/const INTERNSHIP_RE = \/(.+)\/([a-z]*)/)
  if (!match) throw new Error('INTERNSHIP_RE introuvable dans le modèle réel')
  return new RegExp(match[1]!, match[2])
}

const carriesNeed = (type: string | null | undefined, lexicon: string[]) => {
  const lower = (type ?? '').toLowerCase()
  return lexicon.some(needle => lower.includes(needle))
}

/** Les lignes du jeu de données, dans la forme que le classement lit après la porte d'éligibilité. */
function rankedHead(contacts: (typeof DEMO_DOSSIERS)[number]['contacts'], rawAnalysis: Record<string, unknown>) {
  const rows = contacts.map((contact, index) => ({
    id: `demo-${index}`,
    full_name: contact.full_name,
    title: contact.title,
    entity: contact.entity,
    decision_role: contact.decision_role,
    email: contact.email,
    email_verified: false,
    phone: contact.phone ?? null,
    linkedin_url: contact.linkedin_url ?? null,
    source: 'demo',
    user_status: contact.user_status ?? 'new',
    email_sent_at: null,
    last_enrichment_at: null,
    priority: contact.priority,
    demo_seed_first_door: contact.demo_seed_first_door ?? null,
    hidden: false,
    excluded_at: null,
    lifecycle_state: contact.lifecycle_state,
    recommendation_authorized_reason: contact.recommendation_authorized_reason ?? null,
  }))
  const { eligible } = filterEligibleContacts(rows, rawAnalysis)
  const { ranked } = rankAccountContacts(eligible as unknown as RankableContactRow[], rawAnalysis, {})
  const head = ranked[0]
  return head ? rows.find(row => row.id === head.contact_id) : undefined
}

describe('couverture démo — « Ce qui bouge sur tes comptes » (#4088.9)', () => {
  const lexicon = needLexicon()

  it('LIT le modèle réel : le lexique des types est non vide', () => {
    expect(lexicon.length).toBeGreaterThanOrEqual(10)
    expect(lexicon).toContain('recrut')
    expect(lexicon).toContain('acquisition')
  })

  it('au moins trois comptes RÉELS portent un signal typé ET un décideur nommé en tête du classement', () => {
    const complete = DEMO_DOSSIERS.filter(dossier => {
      const signals = dossier.account.recent_signals ?? []
      const typed = signals.some(signal => carriesNeed(signal.type, lexicon))
      const head = rankedHead(dossier.contacts, dossier.account.raw_analysis as Record<string, unknown>)
      return typed && Boolean(head?.full_name.trim())
    })
    expect(complete.map(dossier => dossier.account.company_name).length).toBeGreaterThanOrEqual(3)
  })

  // #4088.10 — le filtre par TYPE n'a de sens en démo que si ≥ 2 types distincts y figurent.
  it('au moins deux TYPES de besoin distincts figurent dans les signaux démo (puces de type)', () => {
    const pairs = [...readFileSync(MODEL, 'utf8').matchAll(/\['([^']+)', '(hiring|mna|exec|funding|tender)'\]/g)].map(
      match => [match[1]!, match[2]!] as const,
    )
    const kinds = new Set<string>()
    for (const dossier of DEMO_DOSSIERS) {
      for (const signal of dossier.account.recent_signals ?? []) {
        const lower = (signal.type ?? '').toLowerCase()
        const hit = pairs.find(([needle]) => lower.includes(needle))
        if (hit) kinds.add(hit[1])
      }
    }
    expect(kinds.size).toBeGreaterThanOrEqual(2)
  })

  it('NON : la garde sait dire non — un lexique vide ne trouve aucun signal typé', () => {
    const first = DEMO_DOSSIERS[0]!
    expect((first.account.recent_signals ?? []).some(signal => carriesNeed(signal.type, []))).toBe(false)
  })

  it('aucun compte fictif « exemple » parmi ceux qui portent la preuve', () => {
    const names = DEMO_DOSSIERS.map(dossier => dossier.account.company_name)
    expect(names).toEqual(expect.arrayContaining(['Société Générale', 'SNCF']))
    expect(names.join(' ')).not.toMatch(/exemple|fictif/i)
  })

  it('classée « seedée » dans demo-coverage, avec sa raison écrite', () => {
    expect(DEMO_MES_CIBLES_VEILLE_COVERAGE.state).toBe('seede')
    expect(DEMO_MES_CIBLES_VEILLE_COVERAGE.reason).toMatch(/#4088/)
    expect(DEMO_MES_CIBLES_VEILLE_COVERAGE.reason).toMatch(/decision_maker|décideur/)
  })

  // D4088 (lot démo, 14/10) — « Écartés (N) » : EDF et Renault, dossiers ALIMENTÉS par de vraies
  // analyses (`DEMO_ANALYSED_ACCOUNTS`), portent chacun une VRAIE offre de stage parmi leurs
  // `recent_signals` (jamais une offre inventée pour la démonstration).
  it('EDF et Renault portent chacun une VRAIE offre de stage parmi leurs signaux (« Écartés » : offre de stage)', () => {
    const internship = internshipRegex()
    const hasRealInternshipOffer = (companyName: string) => {
      const account = DEMO_ANALYSED_ACCOUNTS.find(a => a.company_name === companyName)
      const signals = account?.recent_signals ?? []
      return signals.some(
        signal =>
          (signal.type ?? '').toLowerCase().includes('recrut') && internship.test(`${signal.type} ${signal.signal}`),
      )
    }
    expect(hasRealInternshipOffer('EDF')).toBe(true)
    expect(hasRealInternshipOffer('Renault')).toBe(true)
  })

  // D4088 — « Écartés (N) » : ABB Suisse, dont AUCUNE offre publiée ne tombe dans un métier placé
  // du profil démo (`DEMO_ESN_PROFILE.placed_roles`) — le cas « hors domaine ».
  it('ABB Suisse ne porte AUCUNE offre dans un métier placé du profil démo (« Écartés » : hors domaine)', () => {
    const profile = { placedRoles: [...DEMO_ESN_PROFILE.placed_roles], noGoSectors: [] }
    const abbSuisse = DEMO_DOSSIERS.find(dossier => dossier.account.company_name === 'ABB Suisse')
    const signals = abbSuisse?.account.recent_signals ?? []
    expect(signals.length).toBeGreaterThan(0)
    const allOffDomain = signals.every(
      signal =>
        (signal.type ?? '').toLowerCase().includes('recrut') &&
        hiringDomain({ type: 'hiring', label: signal.signal ?? '' }, profile) === null,
    )
    expect(allOffDomain).toBe(true)
  })

  // D4088 (lot démo, 14/10) — « presse seule » : Société Générale porte un VRAI signal de type
  // « budget » (donc sans besoin d'ESN reconnu) dont le libellé est un résultat trimestriel —
  // exactement ce que `GENERAL_RE` sait reconnaître comme presse générale, sans besoin d'en inventer.
  it('Société Générale porte un VRAI signal « résultats trimestriels » (« Écartés » : presse seule)', () => {
    const source = readFileSync(MODEL, 'utf8')
    const match = source.match(/const GENERAL_RE =\s*\n?\s*(\/.+\/i)/)
    if (!match) throw new Error('GENERAL_RE introuvable dans le modèle réel')

    const general = new Function(`return ${match[1]}`)() as RegExp
    const lexicon = needLexicon()
    const societeGenerale = DEMO_DOSSIERS.find(dossier => dossier.account.company_name === 'Société Générale')
    const signals = societeGenerale?.account.recent_signals ?? []
    const pressOnly = signals.some(
      signal => !carriesNeed(signal.type, lexicon) && general.test(`${signal.type ?? ''} ${signal.signal ?? ''}`),
    )
    expect(pressOnly).toBe(true)
  })
})
