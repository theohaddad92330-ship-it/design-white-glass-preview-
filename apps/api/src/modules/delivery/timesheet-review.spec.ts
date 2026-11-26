import { NotFoundException } from '@nestjs/common'
import { TimesheetsService } from './timesheets.service'

const WORKSPACE = 'w0000000-0000-4000-8000-000000000001'
const MISSION = 'a0000000-0000-4000-8000-000000000001'
const CONSULTANT = 'c0000000-0000-4000-8000-000000000001'
const TIMESHEET = 't0000000-0000-4000-8000-000000000001'

/**
 * LE DOSSIER D'UN RELEVÉ — ce que le tiroir de validation lit.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE FICHIER PROUVE
 * ─────────────────────────────────────────────────────────────────────────────
 * Trois choses, et chacune est une règle du dépôt, pas un détail :
 *
 *  1. un mois SANS dépôt s'ouvre quand même — c'est le mois qui coûte ;
 *  2. une lecture croisée EN ÉCHEC rend « non vérifié », jamais « rien trouvé » ;
 *  3. la recommandation se DÉRIVE des constats, et n'existe pas quand aucun
 *     constat n'a pu être établi.
 *
 * ⚠️ Les assertions portent sur des invariants — « aucun contrôle ne conclut »,
 * « la recommandation appartient à la liste fermée » — jamais sur l'ordre des
 * requêtes ni sur le texte d'un libellé.
 */

type Row = Record<string, unknown>

/** La ligne du mois, telle que la requête de `month()` la rend. */
function craRow(over: Row = {}): Row {
  return {
    mission_id: MISSION,
    mission_label: 'Refonte SI',
    account_name: 'Cliente SA',
    contract_kind: 'regie',
    started_on: null,
    ends_on: null,
    consultant_id: CONSULTANT,
    consultant_name: 'Sarah Lemoine',
    ts_id: TIMESHEET,
    ts_days: 20,
    ts_status: 'submitted',
    ts_expected: 20,
    ts_explanation: null,
    ts_validated_client: null,
    ts_anomalies: ['Il manque 1 jour(s) par rapport aux jours ouvrés du mois (21).'],
    ts_reminders: 0,
    ts_last_reminder: null,
    ts_rejected_at: null,
    ts_rejection_reason: null,
    ...over,
  }
}

/**
 * Un service branché sur un faux `manager`, qui répond PAR REQUÊTE.
 *
 * Le routage se fait sur un fragment de SQL propre à chaque lecture : un mock
 * qui rendrait la même chose à tout le monde ferait passer le test au vert sans
 * qu'aucune des trois requêtes n'ait été distinguée.
 */
function makeService(options: { line?: Row | null; overlapThrows?: boolean; duplicateThrows?: boolean } = {}) {
  const manager = {
    query: jest.fn(async (sql: string) => {
      if (sql.includes('FROM mission_assignments ma')) {
        if (options.overlapThrows) throw new Error('jointure illisible')
        return []
      }
      if (sql.includes('FROM mission_timesheets ts') && sql.includes("ts.status = 'validated'")) {
        if (options.duplicateThrows) throw new Error('jointure illisible')
        return []
      }
      if (sql.includes('FROM missions m')) {
        const line = options.line === undefined ? craRow() : options.line
        return line === null ? [] : [line]
      }
      return []
    }),
  }
  return new TimesheetsService({ manager } as never)
}

const QUERY = { missionId: MISSION, month: '2026-08', consultantId: CONSULTANT }
const NOW = new Date('2026-09-05T00:00:00.000Z')

describe('TimesheetsService.review — le dossier d’un relevé', () => {
  it('refuse une ligne qui n’existe pas dans cet espace', async () => {
    await expect(makeService({ line: null }).review(WORKSPACE, QUERY, NOW)).rejects.toBeInstanceOf(NotFoundException)
  })

  it('ouvre un mois SANS dépôt — et n’y conclut AUCUN contrôle', async () => {
    // Le mois qui coûte est celui où personne n'a rien déposé. S'il ne
    // s'ouvrait pas, le tiroir serait inaccessible là où il sert le plus ; et
    // s'il s'ouvrait en annonçant « aucune anomalie », il annoncerait une bonne
    // nouvelle qu'aucune vérification n'a produite.
    const service = makeService({
      line: craRow({ ts_id: null, ts_days: null, ts_status: null, ts_expected: null, ts_anomalies: null }),
    })
    const review = await service.review(WORKSPACE, QUERY, NOW)
    expect(review.timesheetId).toBeNull()
    expect(review.days).toBeNull()
    expect(review.checks.every(check => check.outcome === 'not_verified')).toBe(true)
    expect(review.recommendation).toBe('await_declaration')
  })

  it('porte l’ARCHIVE des anomalies du dépôt, sans la confondre avec le verdict', async () => {
    // On archive, on ne supprime pas : la phrase écrite au dépôt reste lisible.
    // Mais ce qu'un valideur lit se REFAIT à la lecture — sinon un relevé
    // déposé avant qu'un doublon n'existe s'afficherait « rien à signaler »
    // pour toujours.
    const review = await makeService().review(WORKSPACE, QUERY, NOW)
    expect(review.recordedAnomalies).toHaveLength(1)
    expect(review.checks.length).toBeGreaterThan(0)
  })

  it('une lecture croisée EN ÉCHEC devient « non vérifié », jamais « rien trouvé »', async () => {
    const review = await makeService({ overlapThrows: true, duplicateThrows: true }).review(WORKSPACE, QUERY, NOW)
    const overlap = review.checks.find(check => check.id === 'overlapping_mission')
    const duplicate = review.checks.find(check => check.id === 'duplicate_validated')
    expect(overlap).toMatchObject({ outcome: 'not_verified', reason: 'read_failed' })
    expect(duplicate).toMatchObject({ outcome: 'not_verified', reason: 'read_failed' })
  })

  it('ne lance PAS la lecture du chevauchement quand personne n’est affecté', async () => {
    // La requête ne peut pas partir : on ne sait pas QUI croiser. Le contrôle
    // le DIT plutôt que de conclure « aucun chevauchement ».
    const service = makeService({ line: craRow({ consultant_id: null, consultant_name: null }) })
    const review = await service.review(WORKSPACE, { missionId: MISSION, month: '2026-08' }, NOW)
    expect(review.checks.find(check => check.id === 'overlapping_mission')).toMatchObject({
      outcome: 'not_verified',
      reason: 'no_consultant',
    })
  })

  it('recommande de valider quand tout ce qui a pu être vérifié est passé', async () => {
    const review = await makeService().review(WORKSPACE, QUERY, NOW)
    expect(review.recommendation).toBe('validate')
  })

  it('recommande de faire corriger dès qu’un constat est relevé', async () => {
    const service = makeService({ line: craRow({ ts_days: 12 }) })
    expect((await service.review(WORKSPACE, QUERY, NOW)).recommendation).toBe('fix')
  })

  it('un relevé validé par le CLIENT ne se re-décide pas', async () => {
    const service = makeService({
      line: craRow({ ts_status: 'validated', ts_validated_client: new Date('2026-09-01T00:00:00.000Z') }),
    })
    expect((await service.review(WORKSPACE, QUERY, NOW)).recommendation).toBe('decided')
  })

  it('vise la bonne ligne quand deux consultants portent la même mission', async () => {
    // La maille est mission × consultant : viser la mission seule ouvrirait le
    // relevé de quelqu'un d'autre, et un rejet partirait sur la mauvaise ligne.
    const other = 'c0000000-0000-4000-8000-000000000002'
    const manager = {
      query: jest.fn(async (sql: string) => {
        if (sql.includes('FROM missions m')) {
          return [
            craRow({ consultant_id: other, consultant_name: 'Autre', ts_id: null, ts_days: null, ts_status: null }),
            craRow(),
          ]
        }
        return []
      }),
    }
    const review = await new TimesheetsService({ manager } as never).review(WORKSPACE, QUERY, NOW)
    expect(review.consultantId).toBe(CONSULTANT)
    expect(review.timesheetId).toBe(TIMESHEET)
  })
})
