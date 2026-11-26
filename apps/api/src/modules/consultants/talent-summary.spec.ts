import { TalentService } from './talent.service'

/**
 * LA FICHE D'UN TALENT LIT LA MÊME LIGNE QUE LE VIVIER (PDF-22 §01).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI MANQUAIT, ET POURQUOI ÇA SE VOYAIT À L'ÉCRAN
 * ─────────────────────────────────────────────────────────────────────────────
 * `GET /consultants/:id` rend un `Consultant` : la ligne SQL projetée, rien de
 * plus. Elle porte `availability`, le champ SAISI — dont le défaut en base est
 * « inconnu » — et ne porte ni la disponibilité DÉRIVÉE des affectations, ni le
 * nombre de compétences typées, ni la présence d'un CV. C'est exactement la
 * matière de l'entête d'une fiche : le badge de disponibilité (§6.2) et les cinq
 * axes de complétude (`talentCompleteness`) ne se calculent pas sans elle.
 *
 * Deux sorties possibles : refaire la dérivation côté fiche, ou rendre la ligne
 * DÉJÀ dérivée. La première crée un second calcul de disponibilité — et deux
 * chemins qui refont une dérivation divergent, c'est la loi 1 du tome 7. D'où
 * cette route : la fiche demande LA ligne du vivier, celle que `decorate()`
 * construit déjà, pour UN talent.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE GARDE VÉRIFIE
 * ─────────────────────────────────────────────────────────────────────────────
 *  1. la ligne rendue est DÉRIVÉE (`staffing`), pas recopiée du déclaratif ;
 *  2. les axes de complétude ont leur matière (`skillCount`, `hasCv`) ;
 *  3. les montants suivent `finance:read` — RETIRÉS, jamais mis à zéro ;
 *  4. elle sait dire NON : un talent d'un AUTRE espace ne se lit pas, et un
 *     identifiant inconnu rend `null` plutôt qu'une fiche vide.
 */

const WORKSPACE = 'w0000000-0000-4000-8000-000000000001'
const OTHER_WORKSPACE = 'w0000000-0000-4000-8000-000000000002'
const TALENT = 'c0000000-0000-4000-8000-000000000001'

type Overrides = {
  rows?: unknown[]
  assignments?: unknown[]
  typedSkills?: unknown[]
  submissions?: unknown[]
}

function makeService(overrides: Overrides = {}) {
  const queries: { sql: string; params: unknown[] }[] = []
  const manager = {
    query: jest.fn(async (sql: string, params: unknown[] = []) => {
      queries.push({ sql, params })
      if (sql.includes('SELECT c.* FROM consultants')) return overrides.rows ?? []
      if (sql.includes('FROM mission_assignments ma')) return []
      if (sql.includes('FROM mission_assignments')) return overrides.assignments ?? []
      if (sql.includes('FROM consultant_skills')) return overrides.typedSkills ?? []
      if (sql.includes('FROM submissions WHERE consultant_id')) return overrides.submissions ?? []
      return []
    }),
  }
  const repo = { manager }
  // ⚠️ Construit par NOM et non par position. La version positionnelle a
  // cassé à la fusion du 01/09 : un lot a ajouté `GeocodingService` en
  // cinquième dépendance, et le test a réclamé « Expected 5 arguments, but
  // got 4 » — un rouge qui ne nomme ni le lot ni ce qui manque. Ce test ne
  // touche que le `manager` : le lui donner par nom dit exactement ça.
  const service = Object.create(TalentService.prototype) as TalentService
  Object.assign(service, { consultants: repo, skills: repo, documents: repo })
  return { service, queries }
}

/** Une ligne `consultants` telle que `SELECT c.*` la rend. */
const ROW = {
  id: TALENT,
  workspace_id: WORKSPACE,
  kind: 'consultant',
  full_name: 'Nadia Berrada',
  title: 'Ingénieure SRE',
  seniority: 'senior',
  // Le DÉCLARATIF dit « tout de suite ». Une affectation court pourtant.
  availability: 'immediate',
  tjm: 650,
  min_tjm_cents: 55_000,
  cost_rate_cents: 42_000,
  purchase_tjm_cents: null,
  contract_type: 'cdi',
  engagement_kind: 'salarie',
  zones: ['IDF'],
  source: 'cooptation',
  archived_at: null,
  review_status: 'qualified',
  last_contact_at: null,
  cv_text: 'Dix ans de production Kubernetes.',
  remote_preference: 'hybride',
  updated_at: new Date('2026-08-30T10:00:00.000Z'),
}

describe('TalentService.summary — la fiche lit la ligne du vivier', () => {
  it('DÉRIVE la disponibilité des affectations, et ne recopie pas le déclaratif', async () => {
    // Une mission à 100 % jusqu'en mars : la fiche disait « disponible tout de
    // suite » parce que c'est ce que la colonne contient.
    const { service } = makeService({
      rows: [ROW],
      assignments: [{ consultant_id: TALENT, load_percent: 100, starts_on: '2026-01-01', ends_on: '2027-03-31' }],
    })
    const row = await service.summary(WORKSPACE, TALENT)
    expect(row?.staffing.availability).toBe('busy')
    expect(row?.staffing.freeFrom).toBe('2027-03-31')
    // Le déclaratif reste rendu À CÔTÉ : c'est lui qui rend la contradiction
    // visible, et donc corrigeable.
    expect(row?.declaredAvailability).toBe('immediate')
  })

  it('porte la matière des CINQ axes de complétude — sans elle, l’entête ne peut rien décomposer', async () => {
    const { service } = makeService({
      rows: [ROW],
      typedSkills: [
        { consultant_id: TALENT, skill: 'kubernetes', raw_label: 'Kubernetes', level: 'expert', source: 'mission' },
        { consultant_id: TALENT, skill: 'terraform', raw_label: null, level: 'confirme', source: 'cv' },
      ],
    })
    const row = await service.summary(WORKSPACE, TALENT)
    expect(row?.fullName).toBe('Nadia Berrada')
    expect(row?.skillCount).toBe(2)
    expect(row?.hasCv).toBe(true)
    expect(row?.tjm).toBe(650)
    expect(row?.staffing.availability).toBe('unknown')
  })

  it('RETIRE les montants sans `finance:read` — un zéro se lirait « coût nul »', async () => {
    const { service } = makeService({ rows: [ROW] })
    const withoutFinance = await service.summary(WORKSPACE, TALENT, { finance: false })
    expect(withoutFinance?.financeVisible).toBe(false)
    expect('costCents' in (withoutFinance ?? {})).toBe(false)
    expect('minTjmCents' in (withoutFinance ?? {})).toBe(false)

    const withFinance = await service.summary(WORKSPACE, TALENT, { finance: true })
    expect(withFinance?.financeVisible).toBe(true)
    expect(withFinance?.costCents).toBe(42_000)
    expect(withFinance?.minTjmCents).toBe(55_000)
  })

  it('BORNE la lecture à l’espace — la requête porte le workspace ET l’identifiant', async () => {
    const { service, queries } = makeService({ rows: [ROW] })
    await service.summary(OTHER_WORKSPACE, TALENT)
    const read = queries.find(entry => entry.sql.includes('SELECT c.* FROM consultants'))
    expect(read?.params).toEqual([OTHER_WORKSPACE, TALENT])
    expect(read?.sql).toContain('c.workspace_id = $1')
    expect(read?.sql).toContain('c.id = $2')
  })

  it('sait dire NON — un identifiant inconnu rend `null`, pas une fiche vide', async () => {
    // Sans cette assertion, un `decorate([])` qui rendrait un objet de
    // remplissage passerait les tests au-dessus.
    const { service } = makeService({ rows: [] })
    expect(await service.summary(WORKSPACE, TALENT)).toBeNull()
  })
})
