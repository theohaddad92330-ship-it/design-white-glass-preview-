import type { Queue } from 'bullmq'
import type { Repository } from 'typeorm'
import type { ConsultantEntity } from '../../database/entities/consultant.entity'
import type { WorkspaceEntity } from '../../database/entities/workspace.entity'
import type { CvAutoParseProvenancePort } from './cv-auto-parse-provenance.port'
import { cvAutoParseJobId } from './cv-auto-parse.queue'
import {
  CV_COMPLETENESS_FIX_AT,
  CV_CONTACT_FIX_AT,
  CV_IDENTITY_CITATION_FIXED_AT,
  CvAutoParseService,
} from './cv-auto-parse.service'
import type { CvParseService } from './cv-parse.service'

const WS = 'w0000000-0000-4000-8000-000000000001'
const USER = 'u0000000-0000-4000-8000-000000000001'
const C1 = 'c0000000-0000-4000-8000-000000000001'

function make(
  over: {
    existingState?: string | null
    written?: { column: string; previous: unknown; value: unknown; source: 'model' }[] | null
    isDemo?: boolean
    rows?: unknown[]
    spacedRows?: unknown[]
    addThrows?: boolean
  } = {},
) {
  const remove = jest.fn(async () => undefined)
  const existing = over.existingState ? { getState: jest.fn(async () => over.existingState), remove } : undefined
  const queue = {
    getJob: jest.fn(async () => existing),
    add: jest.fn(async () => {
      if (over.addThrows) throw new Error('redis down')
      return {}
    }),
  } as unknown as Queue
  const autoRead = jest.fn(async () => (over.written === null ? null : { written: over.written ?? [] }))
  const cvParse = { autoRead } as unknown as CvParseService
  const provenance = {
    currentSources: jest.fn(async () => ({ title: 'human' })),
    commit: jest.fn(async () => undefined),
  } as unknown as CvAutoParseProvenancePort & { commit: jest.Mock; currentSources: jest.Mock }
  // #3935.6 — la requête « texte espacé » est reconnue à sa sélection de `cv_text`.
  const query = jest.fn(async (sql: string) =>
    sql.includes('c.cv_text,') ? (over.spacedRows ?? []) : (over.rows ?? []),
  )
  const consultants = { manager: { query } } as unknown as Repository<ConsultantEntity>
  const workspaces = {
    findOne: jest.fn(async () => ({ id: WS, is_demo: over.isDemo ?? false })),
  } as unknown as Repository<WorkspaceEntity>
  const service = new CvAutoParseService(queue, cvParse, provenance, consultants, workspaces)
  return { service, queue, autoRead, provenance, query, remove }
}

/** c88 (04/10/2026, import ZIP de 688 CV) — la file de lecture automatique. */
describe('CvAutoParseService (c88)', () => {
  it('met une fiche en file sous un identifiant SANS `:`, avec des tentatives espacées', async () => {
    const { service, queue } = make()
    expect(await service.enqueue(WS, USER, C1)).toBe(true)
    expect(queue.add).toHaveBeenCalledWith(
      'cv-auto-parse',
      { workspaceId: WS, userId: USER, consultantId: C1 },
      expect.objectContaining({ jobId: cvAutoParseJobId(C1), attempts: 3 }),
    )
    expect(cvAutoParseJobId(C1)).not.toContain(':')
  })

  it('une fiche déjà EN ATTENTE n’est pas remise en file deux fois', async () => {
    const { service, queue } = make({ existingState: 'waiting' })
    await service.enqueue(WS, USER, C1)
    expect(queue.add).not.toHaveBeenCalled()
  })

  it('une lecture ÉCHOUÉE se remet en file (sinon BullMQ ignorerait l’identifiant en silence)', async () => {
    const { service, queue, remove } = make({ existingState: 'failed' })
    await service.enqueue(WS, USER, C1)
    expect(remove).toHaveBeenCalled()
    expect(queue.add).toHaveBeenCalled()
  })

  it('une file indisponible ne fait JAMAIS échouer l’import — rend `false`', async () => {
    const { service } = make({ addThrows: true })
    await expect(service.enqueue(WS, USER, C1)).resolves.toBe(false)
  })

  it('lit avec la provenance ACTUELLE et journalise en `model`, règle `cv_parse.auto_read`', async () => {
    const written = [{ column: 'full_name', previous: null, value: 'Yanis Berthier', source: 'model' as const }]
    const { service, autoRead, provenance } = make({ written })
    expect(await service.readOne({ workspaceId: WS, userId: USER, consultantId: C1 })).toEqual({ written: 1 })
    expect(autoRead).toHaveBeenCalledWith(C1, WS, USER, { title: 'human' }, { demo: false })
    expect(provenance.commit).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'model',
        rule: 'cv_parse.auto_read',
        entityId: C1,
        changes: [{ field: 'full_name', oldValue: null, newValue: 'Yanis Berthier' }],
      }),
    )
  })

  it('salle de démonstration : la lecture part en mode scripté', async () => {
    const { service, autoRead } = make({ isDemo: true })
    await service.readOne({ workspaceId: WS, userId: USER, consultantId: C1 })
    expect(autoRead).toHaveBeenCalledWith(C1, WS, USER, expect.anything(), { demo: true })
  })

  it('rien d’écrit : aucun journal', async () => {
    const { service, provenance } = make({ written: [] })
    await service.readOne({ workspaceId: WS, userId: USER, consultantId: C1 })
    expect(provenance.commit).not.toHaveBeenCalled()
  })

  it('le rattrapage ne vise QUE l’espace, sans les fiches corrigées à la main ni déjà lues', async () => {
    const { service, query, queue } = make({ rows: [{ id: C1 }, { id: 'c2' }] })
    expect(await service.enqueueUnread(WS, USER)).toEqual({ queued: 2 })
    const [sql, params] = query.mock.calls[0] as unknown as [string, unknown[]]
    expect(params).toEqual([WS])
    expect(sql).toContain('c.workspace_id = $1')
    expect(sql).toContain("fp.source = 'human'")
    expect(sql).toContain('c.cv_auto_read_at IS NULL')
    // c97 (12/10) — `qualified` ne dit plus « humain » : une fiche AUTO-qualifiée reste rattrapable ; l'exclusion est la provenance `human` et l'archive.
    expect(sql).not.toContain('review_status')
    expect(sql).toContain('c.archived_at IS NULL')
    expect(queue.add).toHaveBeenCalledTimes(2)
  })

  it('Louis 06/10/2026 : plus aucun plafond — le rattrapage ne porte aucun LIMIT', async () => {
    const { service, query } = make({ rows: [] })
    await service.enqueueUnread(WS, USER)
    const [sql] = query.mock.calls[0] as unknown as [string, unknown[]]
    expect(sql).not.toMatch(/LIMIT/i)
  })

  it('#3734 — rattrape aussi les CV lus AVANT le correctif de citation et restés sans nom', async () => {
    // « Concerné » se décide sur la date de lecture du segment contre la date
    // de la capacité, jamais sur un symptôme (doctrine : un correctif de
    // collecte rattrape l'existant). Le nom manquant reste exigé : une fiche
    // déjà nommée n'est pas relue.
    const { service, query } = make({ rows: [] })
    await service.enqueueUnread(WS, USER)
    const [sql] = query.mock.calls[0] as unknown as [string, unknown[]]
    expect(sql).toContain('c.full_name IS NULL')
    expect(sql).toContain(`c.cv_auto_read_at < '${CV_IDENTITY_CITATION_FIXED_AT}'`)
  })

  it('#4401.1 — le nom d’un CV mal lu avant le 23/10 se rattrape, sans écraser une saisie humaine ni toucher le parc entier', async () => {
    // La capacité (lecture du nom : civilité, poste sur la ligne, champs étiquetés) date du 23/10 : toute fiche
    // lue avant, sans nom, avec un CV en texte, redevient éligible — ciblée (jamais tout le parc).
    expect(Date.parse(CV_IDENTITY_CITATION_FIXED_AT)).toBeGreaterThanOrEqual(Date.parse('2026-10-23T00:00:00Z'))
    const { service, query } = make({ rows: [] })
    await service.enqueueUnread(WS, USER)
    const [sql] = query.mock.calls[0] as unknown as [string, unknown[]]
    expect(sql).toContain('c.full_name IS NULL')
    expect(sql).toContain('c.cv_text IS NOT NULL')
    expect(sql).toContain("fp.source = 'human'")
    expect(sql).toContain('c.archived_at IS NULL')
  })

  it('compte les CV non lus de l’espace', async () => {
    const { service } = make({ rows: [{ count: '42' }] })
    expect(await service.unreadCount(WS)).toBe(42)
  })

  /** #3935.3 — le rattrapage de COMPLÉTUDE (LinkedIn, langues), distinct du
   *  rattrapage d'identité : même garde-fous, mais SANS exiger un nom manquant. */
  describe('rattrapage de complétude (#3935.3)', () => {
    it('#3935.2a — la date de la capacité couvre les colonnes écrites depuis le 09/10 (environnements, outils, certifications)', () => {
      // « Concerné » se décide sur la date de collecte contre la date de la
      // capacité : une fiche lue le 09/10 avant le déploiement n'a pas ces
      // colonnes, elle doit rester éligible au rattrapage.
      expect(Date.parse(CV_COMPLETENESS_FIX_AT)).toBeGreaterThanOrEqual(Date.parse('2026-10-10T00:00:00Z'))
    })

    // #3935 (lot P03, décision Louis 09/10) — une date d'expérience à l'ANNÉE seule
    // était laissée vide par la lecture du lot M07 ; elle est désormais gardée à
    // l'année. Une fiche lue avant cette capacité doit rester éligible au rattrapage.
    it('#3935 (P03) — la date de la capacité couvre les dates d’expérience gardées à l’année', () => {
      expect(Date.parse(CV_COMPLETENESS_FIX_AT)).toBeGreaterThanOrEqual(Date.parse('2026-10-11T00:00:00Z'))
    })

    it('compte les fiches lues AVANT le correctif de complétude', async () => {
      const { service } = make({ rows: [{ count: '7' }] })
      expect(await service.completenessCatchUpCount(WS)).toBe(7)
    })

    it('met en file les fiches concernées, sans exiger un nom manquant', async () => {
      const { service, query, queue } = make({ rows: [{ id: C1 }, { id: 'c2' }] })
      expect(await service.enqueueCompletenessCatchUp(WS, USER)).toEqual({ queued: 2 })
      const [sql, params] = query.mock.calls[0] as unknown as [string, unknown[]]
      expect(params).toEqual([WS])
      expect(sql).toContain('c.workspace_id = $1')
      expect(sql).toContain("fp.source = 'human'")
      // c97 (12/10) — `qualified` ne dit plus « humain » : une fiche AUTO-qualifiée reste rattrapable ; l'exclusion est la provenance `human` et l'archive.
      expect(sql).not.toContain('review_status')
      expect(sql).toContain('c.archived_at IS NULL')
      expect(sql).toContain('c.cv_auto_read_at IS NOT NULL')
      expect(sql).toContain(`c.cv_auto_read_at < '${CV_COMPLETENESS_FIX_AT}'`)
      expect(sql).not.toContain('c.full_name IS NULL')
      expect(queue.add).toHaveBeenCalledTimes(2)
    })

    // #4401.1 / #4401.2 (recette 23/10) — un CV simple lu AVANT la lecture des coordonnées (21-22/10) montrait
    // « Aucun moyen de contact » : le rattrapage vise ce SEGMENT, ciblé (sans e-mail ni téléphone), jamais tout le parc.
    it('#4401 — le segment « coordonnées » : lue avant le correctif ET sans e-mail ni téléphone, jamais plus large', async () => {
      expect(Date.parse(CV_CONTACT_FIX_AT)).toBeGreaterThanOrEqual(Date.parse('2026-10-25T00:00:00Z')) // #4401.3
      const { service, query } = make({ rows: [] })
      await service.enqueueCompletenessCatchUp(WS, USER)
      const [sql] = query.mock.calls[0] as unknown as [string, unknown[]]
      expect(sql).toContain(`c.cv_auto_read_at < '${CV_CONTACT_FIX_AT}'`)
      expect(sql).toContain('c.email IS NULL')
      expect(sql).toContain('c.phone IS NULL')
      // la fiche qui a déjà une coordonnée n'est rattrapée que par l'ancien segment (date de complétude)
      expect(sql).toMatch(/\(\s*c\.cv_auto_read_at < '[^']+'\s+OR\s+\(c\.cv_auto_read_at < '[^']+'\s+AND/)
    })

    it('une fiche jamais lue n’est PAS concernée — elle est déjà couverte par l’import au prompt à jour', async () => {
      const { service, query } = make({ rows: [] })
      await service.enqueueCompletenessCatchUp(WS, USER)
      const [sql] = query.mock.calls[0] as unknown as [string, unknown[]]
      expect(sql).toContain('c.cv_auto_read_at IS NOT NULL')
    })
  })

  // #3935.6 — le rattrapage couvre aussi les fiches dont le `cv_text` STOCKÉ est espacé lettre à lettre.
  describe('rattrapage : texte stocké espacé lettre à lettre (#3935.6)', () => {
    const SPACED_TEXT = [
      'J e a n',
      'D U P O N T',
      'I n g é n i e u r e   C y b e r s é c u r i t é',
      'P a r i s   F r a n c e',
      'C o m p é t e n c e s   :   P y t h o n   D o c k e r   K u b e r n e t e s',
      'E x p é r i e n c e s   p r o f e s s i o n n e l l e s   d e p u i s   2 0 1 5',
    ].join('\n')
    const CLEAN_TEXT = 'Jean DUPONT\nIngénieur cybersécurité\nParis, France\nCompétences : Python, Docker, Kubernetes.'
    const spaced = (id: string, over: { in_completeness?: boolean; cv_text?: string } = {}) => ({
      id,
      cv_text: over.cv_text ?? SPACED_TEXT,
      in_completeness: over.in_completeness ?? false,
    })

    it('compte une fiche à texte espacé en plus des fiches de complétude', async () => {
      const { service } = make({ rows: [{ count: '7' }], spacedRows: [spaced('s1')] })
      expect(await service.completenessCatchUpCount(WS)).toBe(8)
    })

    it('ne compte pas deux fois une fiche déjà dans la sélection de complétude', async () => {
      const { service } = make({ rows: [{ count: '7' }], spacedRows: [spaced('s1', { in_completeness: true })] })
      expect(await service.completenessCatchUpCount(WS)).toBe(7)
    })

    it('un texte propre remonté par le pré-tri SQL n’est ni compté ni touché', async () => {
      const { service, query } = make({ rows: [{ count: '0' }], spacedRows: [spaced('s1', { cv_text: CLEAN_TEXT })] })
      expect(await service.completenessCatchUpCount(WS)).toBe(0)
      await service.enqueueCompletenessCatchUp(WS, USER)
      expect(query.mock.calls.some(([sql]) => /UPDATE/.test(String(sql)))).toBe(false)
    })

    it('recolle le cv_text stocké PUIS met la fiche en file', async () => {
      const { service, query, queue } = make({ rows: [], spacedRows: [spaced('s1')] })
      expect(await service.enqueueCompletenessCatchUp(WS, USER)).toEqual({ queued: 1 })
      const update = query.mock.calls.find(([sql]) => /UPDATE consultants/.test(String(sql))) as unknown as [
        string,
        string[],
      ]
      expect(update[1][0]).toContain('Jean\nDUPONT')
      expect(update[1][0]).not.toContain('J e a n')
      expect(update[1][1]).toBe('s1')
      // L'ancien texte est la condition d'écriture : on n'écrase pas un texte qui a bougé entre-temps.
      expect(update[0]).toContain('cv_text = $3')
      // Jamais de qualification.
      expect(update[0]).not.toMatch(/review_status|qualified_at/)
      expect(queue.add).toHaveBeenCalledTimes(1)
    })

    it('le pré-tri SQL exclut archivées et fiches portant une correction humaine — PAS les auto-qualifiées (c97)', async () => {
      const { service, query } = make({ rows: [], spacedRows: [] })
      await service.enqueueCompletenessCatchUp(WS, USER)
      const [sql] = query.mock.calls.find(([text]) => String(text).includes('c.cv_text,')) as unknown as [string]
      // c97 (12/10) — `qualified` ne dit plus « humain » : une fiche AUTO-qualifiée reste rattrapable ; l'exclusion est la provenance `human` et l'archive.
      expect(sql).not.toContain('review_status')
      expect(sql).toContain('c.archived_at IS NULL')
      expect(sql).toContain("fp.source = 'human'")
    })

    it('la limite borne aussi les fiches recollées (jamais recollée sans être relue)', async () => {
      const { service, queue, query } = make({ rows: [], spacedRows: [spaced('s1'), spaced('s2')] })
      expect(await service.enqueueCompletenessCatchUp(WS, USER, 1)).toEqual({ queued: 1 })
      expect(query.mock.calls.filter(([sql]) => /UPDATE consultants/.test(String(sql)))).toHaveLength(1)
      expect(queue.add).toHaveBeenCalledTimes(1)
    })
  })

  // #3883 — rattrapage du stock : tous les espaces, CV jamais lus.
  describe('qualify — rattrapage « CV lu = qualifiée » (c97)', () => {
    it('compte les fiches RENDUES par l’UPDATE … RETURNING (forme pg `[lignes, nombre]`), pas la paire', async () => {
      const { service } = make({ rows: [[{ id: C1 }], 1] })
      expect(await service.qualify([C1, 'c2'])).toBe(1)
    })

    it('sait dire NON : aucune fiche rendue → 0', async () => {
      const { service } = make({ rows: [[], 0] })
      expect(await service.qualify([C1])).toBe(0)
    })
  })

  describe('rattrapage du stock (#3883)', () => {
    it('lit TOUS les espaces (aucun paramètre d’espace), hors démo, seulement les CV jamais lus', async () => {
      const { service, query } = make({ rows: [{ id: C1 }] })
      expect(await service.neverReadStockCandidates()).toEqual([{ id: C1 }])
      const [sql, params] = query.mock.calls[0] as unknown as [string, unknown[] | undefined]
      expect(params ?? []).toEqual([])
      expect(sql).toContain('c.cv_auto_read_at IS NULL')
      expect(sql).toContain('is_demo')
      expect(sql).toContain("fp.source = 'human'")
    })

    it('mise en file différée : le délai part dans les options du job', async () => {
      const { service, queue } = make()
      await service.enqueue(WS, USER, C1, { delay: 40_000 })
      expect(queue.add).toHaveBeenCalledWith(
        'cv-auto-parse',
        { workspaceId: WS, userId: USER, consultantId: C1 },
        expect.objectContaining({ delay: 40_000 }),
      )
    })

    it('sans option, aucun délai (le chemin de l’import est inchangé)', async () => {
      const { service, queue } = make()
      await service.enqueue(WS, USER, C1)
      expect((queue.add as jest.Mock).mock.calls[0]?.[2]).not.toHaveProperty('delay')
    })
  })
})
