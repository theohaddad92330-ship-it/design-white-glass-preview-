import { beforeAll, describe, expect, it } from 'vitest'
import { orgGraphSchema, type Account, type AccountFactsBrief, type OrgGraph } from '@bellum/contracts'
import { pdf } from '@react-pdf/renderer'
import { useStandardPdfFonts } from '@/test/pdf-standard-fonts'
import { AccountPdfDocument } from '../AccountPdfDocument'
import { buildAccountPdfData, pdfContactsCap, PDF_CONTACTS_LIMIT } from '../normalize'
import { i18n } from '@/i18n'
import { resolveBrand } from '@bellum/contracts'

const PRODUCT_BRAND = resolveBrand(null)

/** Counts real `/Type /Page` objects — not `/Type /Pages`, the parent node. */
function countPdfPages(raw: string): number {
  return (raw.match(/\/Type\s*\/Page(?!s)/g) ?? []).length
}

const SOURCE = { id: 's-off', kind: 'official_site' as const, grounding: 'A' as const, date: '2026-08-01' }

function orgGraphFixture(): OrgGraph {
  return orgGraphSchema.parse({
    graphVersion: 3,
    entities: [{ id: 'e-ds', name: 'AIRBUS DS', type: 'filiale', parentId: null, confidence: 90, sources: [SOURCE] }],
    people: [
      {
        id: 'p-schoellhorn',
        fullName: 'M. Schoellhorn',
        title: 'CEO Defence & Space',
        entityId: 'e-ds',
        hierarchyLevel: 'L1',
        decisionRoles: ['economic_buyer'],
        identityStatus: 'actionable',
        confidence: 92,
        sources: [SOURCE],
      },
      {
        // Rattachement VÉRIFIÉ → trait plein dans la page organigramme.
        id: 'p-werner',
        fullName: 'Claudia Werner',
        title: 'Engineering Director',
        entityId: 'e-ds',
        hierarchyLevel: 'L2',
        decisionRoles: ['champion'],
        identityStatus: 'classified',
        confidence: 78,
        sources: [],
      },
      {
        // Rattachement NON vérifié → trait pointillé, jamais dessiné comme un fait.
        id: 'p-dupont',
        fullName: 'Jean Dupont',
        title: 'Head of Engineering',
        entityId: 'e-ds',
        hierarchyLevel: 'L3',
        decisionRoles: [],
        identityStatus: 'seed',
        confidence: 40,
        sources: [],
      },
    ],
    hierarchyEdges: [
      {
        fromId: 'p-werner',
        toId: 'p-schoellhorn',
        type: 'reports_to',
        sourceIds: [SOURCE.id],
        confidence: 95,
        verified: true,
      },
      { fromId: 'p-dupont', toId: 'p-werner', type: 'reports_to', sourceIds: [], confidence: 60, verified: false },
    ],
    influenceEdges: [],
    buyingCommittee: [{ personId: 'p-schoellhorn', role: 'economic_buyer', entityId: 'e-ds' }],
    uncoveredZones: [],
    recommendedPath: [{ step: 1, personId: 'p-schoellhorn', objective: 'ouvrir le périmètre' }],
    rejectedItems: [],
  })
}

// `AccountPdfDocument` imports `styles.ts`, which registers Geist from a CDN.
// Swap those registrations for the built-in standard fonts so rendering stays
// hermetic (no network) while still exercising the real renderer.
beforeAll(() => {
  useStandardPdfFonts()
})

const account: Account = {
  id: '00000000-0000-0000-0000-000000000001',
  user_id: '00000000-0000-0000-0000-000000000002',
  company_name: 'ACME',
  siren: null,
  sector: 'Tech',
  employees: '1000',
  revenue: '100M',
  headquarters: 'Paris',
  website: 'https://acme.test',
  subsidiaries: ['ACME Labs'],
  it_challenges: [
    { title: 'Modernisation SI', severity: 'critical', description: 'Legacy systems', timeframe: 'immédiat' },
  ],
  recent_signals: [{ date: '2025-03-01', type: 'projet', signal: 'Lance IA générative' }],
  priority_score: 8,
  priority_justification: 'strong fit',
  raw_analysis: {
    technologyStack: [{ name: 'IA', usage: 'maintenance', maturity: 'emerging' }],
    pains: [{ pain: 'Pannes', urgency: 'haute', business_impact: '300M€/an' }],
    angles: [{ title: 'Accélérateur IA', is_recommended: true }],
    competitors: [{ name: 'e.SNCF Solutions', strengths: 'connaissance métier' }],
    evaluationCompte: { goNoGo: 'GO', scoreGlobal: 8, justification: 'fit excellent' },
  },
  status: 'completed',
  error_message: null,
  user_context: null,
  api_cost_euros: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

describe('AccountPdfDocument', () => {
  it('renders to a non-empty PDF blob', async () => {
    const data = buildAccountPdfData(account, [])
    const blob = await pdf(<AccountPdfDocument brand={PRODUCT_BRAND} data={data} />).toBlob()
    expect(blob.size).toBeGreaterThan(0)
    expect(blob.type).toBe('application/pdf')
  }, 20_000)

  it('renders without throwing when raw_analysis lists are empty', async () => {
    const minimal: Account = { ...account, raw_analysis: null, it_challenges: [], recent_signals: [], subsidiaries: [] }
    const data = buildAccountPdfData(minimal, [])
    const blob = await pdf(<AccountPdfDocument brand={PRODUCT_BRAND} data={data} />).toBlob()
    expect(blob.size).toBeGreaterThan(0)
  }, 20_000)

  describe('page « Organigramme de décision »', () => {
    // Dossier minimal (comme `normalize.test.ts`) : peu de contenu, pour que
    // la page 1 ne déborde JAMAIS naturellement sur une seconde page
    // physique — sinon un décompte de pages ne distinguerait plus « la page
    // organigramme existe » de « le contenu de la page 1 a débordé ».
    const minimal: Account = {
      ...account,
      it_challenges: [],
      recent_signals: [],
      subsidiaries: [],
      raw_analysis: null,
    }

    it('stays a single page when the dossier carries no org graph', async () => {
      const data = buildAccountPdfData(minimal, [])
      expect(data.orgPage).toBeNull()
      const raw = await pdf(<AccountPdfDocument brand={PRODUCT_BRAND} data={data} />).toString()
      expect(countPdfPages(raw)).toBe(1)
    }, 20_000)

    it('renders a SECOND page as soon as the dossier carries an org graph', async () => {
      const withOrg: Account = { ...minimal, raw_analysis: { org: { orgGraph: orgGraphFixture() } } }
      const data = buildAccountPdfData(withOrg, [])
      expect(data.orgPage).not.toBeNull()
      const blob = await pdf(<AccountPdfDocument brand={PRODUCT_BRAND} data={data} />).toBlob()
      expect(blob.size).toBeGreaterThan(0)
      const raw = await pdf(<AccountPdfDocument brand={PRODUCT_BRAND} data={data} />).toString()
      expect(countPdfPages(raw)).toBe(2)
    }, 20_000)

    // Le cœur de l'organigramme du produit — trait plein (vérifié) vs trait
    // pointillé (hypothèse) — n'est pas mesuré ici sur les octets du PDF
    // compilé (potentiellement compressés, dépendant de l'encodage police) :
    // c'est `reportingLineStyle` (`styles.reportingLineStyle.test.ts`) qui
    // le garde, en isolation et de façon fiable. Ce test-ci prouve seulement
    // que la page se rend sans jeter avec les DEUX cas présents (vérifié et
    // hypothèse dans le même graphe).
    it('renders without throwing when the graph mixes verified and unverified reporting lines', async () => {
      const withOrg: Account = { ...minimal, raw_analysis: { org: { orgGraph: orgGraphFixture() } } }
      const data = buildAccountPdfData(withOrg, [])
      expect(data.orgPage?.levelRows.flatMap(row => row.people).some(p => p.reporting?.verified === true)).toBe(true)
      expect(data.orgPage?.levelRows.flatMap(row => row.people).some(p => p.reporting?.verified === false)).toBe(true)
      const blob = await pdf(<AccountPdfDocument brand={PRODUCT_BRAND} data={data} />).toBlob()
      expect(blob.size).toBeGreaterThan(0)
    }, 20_000)
  })

  /**
   * #4073.1 (13/10/2026) — l'historique chez ce client (affaires, missions,
   * besoins récurrents, échanges). `data.facts` vient du lecteur unique
   * (#4069), jamais recalculé ici (voir `normalize.test.ts`) : ce test prouve
   * seulement que la section se rend, avec et sans brief.
   */
  describe('historique chez ce client (#4073.1)', () => {
    const factsBrief: AccountFactsBrief = {
      asOf: '2026-10-13T08:00:00Z',
      deals: [{ date: '2024-03-01T00:00:00Z', kind: 'deal_lost', label: 'Refonte SI RH' }],
      missions: [{ date: '2023-01-15T00:00:00Z', kind: 'mission', label: 'Audit infra' }],
      recurringNeeds: [{ label: 'Besoin DevOps', occurrences: 2, lastDate: '2026-09-01T00:00:00Z' }],
      exchanges: [{ date: '2026-08-20T00:00:00Z', kind: 'exchange', label: 'Relance — point budget' }],
    }

    it('ne rend rien de plus sans brief', async () => {
      const data = buildAccountPdfData(account, [])
      expect(data.facts).toBeNull()
      const blob = await pdf(<AccountPdfDocument brand={PRODUCT_BRAND} data={data} />).toBlob()
      expect(blob.size).toBeGreaterThan(0)
    }, 20_000)

    it('rend la section sans jeter quand le brief porte des faits', async () => {
      const data = buildAccountPdfData(account, [], factsBrief)
      expect(data.facts).not.toBeNull()
      const blob = await pdf(<AccountPdfDocument brand={PRODUCT_BRAND} data={data} />).toBlob()
      expect(blob.size).toBeGreaterThan(0)
    }, 20_000)
  })

  // #4292.13 — le PDF annonce lui-même son plafond, en clair.
  describe('plafond de contacts annoncé (#4292.13)', () => {
    const contact = (i: number) =>
      ({
        id: `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`,
        account_id: account.id,
        full_name: `Contact ${i}`,
        decision_role: 'user',
        priority: 1,
      }) as unknown as Parameters<typeof buildAccountPdfData>[1][number]

    it('dit « 40 contacts sur 1 212 » et se rend sans jeter', async () => {
      const data = buildAccountPdfData(
        account,
        Array.from({ length: 1212 }, (_, i) => contact(i)),
      )
      const cap = pdfContactsCap(data)
      expect(cap).toEqual({ shown: PDF_CONTACTS_LIMIT, total: 1212, hidden: 1212 - PDF_CONTACTS_LIMIT })
      const text = i18n.t('exports:pdf.contactsMore', { ...cap, brand: PRODUCT_BRAND.name, lng: 'fr' })
      expect(text.replace(/\s/g, ' ')).toContain('40 contacts sur 1 212')
      const blob = await pdf(<AccountPdfDocument brand={PRODUCT_BRAND} data={data} />).toBlob()
      expect(blob.size).toBeGreaterThan(0)
    }, 30_000)

    it('ne dit rien quand le compte tient sous le plafond (contrôle négatif)', () => {
      const data = buildAccountPdfData(
        account,
        Array.from({ length: 5 }, (_, i) => contact(i)),
      )
      expect(pdfContactsCap(data)).toBeNull()
    })
  })
})
