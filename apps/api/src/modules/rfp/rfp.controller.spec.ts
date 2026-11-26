import type { CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { RfpController } from './rfp.controller'

/**
 * #2571 — un appel d'offres transféré devient un besoin EN PRÉVISUALISATION.
 *
 * Deux choses se testent ici, et elles sont distinctes :
 *
 *   - #2571.2 — importer et analyser un dossier (`create`, `decide`) ne
 *     produit qu'une LECTURE (`GET :id/need-preview`) : aucune écriture dans
 *     `project_needs`. Le besoin n'existe qu'après l'appel EXPLICITE à
 *     `POST :id/need`, avec un `projectId` choisi par l'utilisateur.
 *   - #2571.4 — GARDE-FOU : une offre d'emploi, un signal ou une conversation
 *     exploratoire arrivent tous par le MÊME chemin d'intake (`create`). Rien
 *     dans ce chemin — ni l'import, ni la décision bid/no-bid, ni la lecture de
 *     la prévisualisation — n'appelle jamais `pipeline.addNeed`. Si un jour
 *     quelqu'un « aide » en écrivant le besoin dès l'analyse jugée bonne, ce
 *     test rougit.
 */

const USER = { userId: 'user-1', email: 'rep@esn.fr' } as CurrentUserPayload

function build() {
  const rfpService = {
    create: jest.fn().mockResolvedValue({ rfp: { id: 'rfp-1' }, compliance: {} }),
    preview: jest.fn().mockResolvedValue({ draft: {}, indicators: {} }),
    confirm: jest.fn().mockResolvedValue({ rfp: { id: 'rfp-1' }, compliance: {} }),
    decide: jest.fn().mockResolvedValue({ rfp: { id: 'rfp-1', status: 'bid' } }),
    findOne: jest.fn(),
    markNeedCreated: jest.fn(),
    listSourceDocuments: jest.fn().mockResolvedValue({ files: [], usedBytes: 0, quotaBytes: 1_000 }),
    downloadSourceDocument: jest.fn().mockResolvedValue({ url: 'https://storage.example/signed' }),
  }
  const pipeline = {
    addNeed: jest.fn().mockResolvedValue({ id: 'need-1' }),
    hasNeed: jest.fn().mockResolvedValue(true),
  }
  const workspaceContext = { resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1' }) }
  const importSessions = {
    current: jest.fn().mockResolvedValue(null),
    save: jest.fn().mockResolvedValue({ id: 'session-1' }),
    close: jest.fn().mockResolvedValue(undefined),
  }
  const controller = new RfpController(
    rfpService as never,
    pipeline as never,
    workspaceContext as never,
    importSessions as never,
  )
  return { controller, rfpService, pipeline, workspaceContext, importSessions }
}

describe('RfpController — garde-fou #2571.4', () => {
  it("importer et analyser un appel d'offres n'écrit JAMAIS de besoin tout seul", async () => {
    const { controller, pipeline } = build()

    await controller.create(USER, { title: 'Offre transférée par e-mail', text: 'texte du document' } as never)

    expect(pipeline.addNeed).not.toHaveBeenCalled()
  })

  it("trancher bid/no-bid n'écrit pas de besoin non plus — c'est une décision, pas une création", async () => {
    const { controller, pipeline } = build()

    await controller.decide(USER, 'rfp-1', 'bid')

    expect(pipeline.addNeed).not.toHaveBeenCalled()
  })

  it("prévisualiser un import n'écrit pas de besoin non plus — c'est une lecture (#2180.5)", async () => {
    const { controller, pipeline } = build()

    await controller.preview(USER, { title: 'AO', text: 'contenu' } as never)

    expect(pipeline.addNeed).not.toHaveBeenCalled()
  })

  it('lire la prévisualisation ne mute rien : aucune écriture de besoin', async () => {
    const { controller, rfpService, pipeline } = build()
    rfpService.findOne.mockResolvedValue({
      rfp: {
        id: 'rfp-1',
        title: 'Refonte du SI de facturation',
        due_at: null,
        issuer: null,
        lots: [],
        requirements: [],
        account_id: null,
      },
      compliance: {},
      actionability: { actionable: false, missing: [] },
    })

    const preview = await controller.previewNeed(USER, 'rfp-1')

    expect(pipeline.addNeed).not.toHaveBeenCalled()
    // #2571.1 — l'émetteur et l'échéance absents restent des inconnues NOMMÉES.
    expect(preview.unknowns).toContainEqual({ kind: 'issuer', value: null })
    expect(preview.unknowns).toContainEqual({ kind: 'deadline', value: null })
  })
})

/**
 * #2180.5 / #2180.6 — l'écran de preview d'import. `POST /rfp/preview` lit
 * seul (voir le garde-fou #2571.4 ci-dessus) ; `POST /rfp/confirm` délègue au
 * SERVICE l'unique écriture, sans jamais passer par `create`.
 */
describe('RfpController — preview et confirmation d’import (#2180.5, #2180.6)', () => {
  it('preview délègue au service, avec le corps reçu', async () => {
    const { controller, rfpService } = build()

    await controller.preview(USER, { title: 'AO', text: 'contenu' } as never)

    expect(rfpService.preview).toHaveBeenCalledWith(USER.userId, { title: 'AO', text: 'contenu' })
    expect(rfpService.create).not.toHaveBeenCalled()
  })

  it('confirm délègue au service, jamais à `create` — aucune ré-analyse', async () => {
    const { controller, rfpService } = build()
    const draft = { title: 'AO', requirements: [] }

    await controller.confirm(USER, { draft } as never)

    expect(rfpService.confirm).toHaveBeenCalledWith(USER.userId, { draft })
    expect(rfpService.create).not.toHaveBeenCalled()
  })
})

describe('RfpController — POST :id/need reste la SEULE porte d’écriture (#2571.2)', () => {
  it("l'appel explicite avec un projet choisi écrit le besoin, sans device intermédiaire", async () => {
    const { controller, rfpService, pipeline } = build()
    rfpService.findOne.mockResolvedValue({
      rfp: { id: 'rfp-1', title: 'Refonte du SI', due_at: null, need_id: null },
      compliance: {},
      actionability: { actionable: false, missing: [] },
    })

    await controller.createNeed(USER, 'rfp-1', { projectId: 'proj-1' } as never)

    expect(pipeline.addNeed).toHaveBeenCalledTimes(1)
    const [workspaceId, projectId] = pipeline.addNeed.mock.calls[0]
    expect(workspaceId).toBe('ws-1')
    expect(projectId).toBe('proj-1')
  })

  // #2179.36 — deux clics sur « Créer le besoin » (double-clic, requête
  // relancée après un timeout) ne doivent créer qu'UN SEUL `project_needs`.
  it('pose need_id après l’écriture, pour que le clic suivant se refuse', async () => {
    const { controller, rfpService, pipeline } = build()
    rfpService.findOne.mockResolvedValue({
      rfp: { id: 'rfp-1', title: 'Refonte du SI', due_at: null, need_id: null },
      compliance: {},
      actionability: { actionable: false, missing: [] },
    })
    pipeline.addNeed.mockResolvedValue({ id: 'need-42' })

    await controller.createNeed(USER, 'rfp-1', { projectId: 'proj-1' } as never)

    expect(rfpService.markNeedCreated).toHaveBeenCalledWith(USER.userId, 'rfp-1', 'need-42')
  })

  it('refuse un second appel — un besoin a déjà été créé pour ce dossier', async () => {
    const { controller, rfpService, pipeline } = build()
    rfpService.findOne.mockResolvedValue({
      rfp: { id: 'rfp-1', title: 'Refonte du SI', due_at: null, need_id: 'need-42' },
      compliance: {},
      actionability: { actionable: false, missing: [] },
    })

    await expect(controller.createNeed(USER, 'rfp-1', { projectId: 'proj-1' } as never)).rejects.toThrow()

    expect(pipeline.addNeed).not.toHaveBeenCalled()
  })
})

// #2957 (#2179.31) — « Créer depuis un besoin » : le besoin d'origine vient du
// client, il se vérifie DANS l'espace de l'appelant avant d'être posé.
describe('RfpController — confirm depuis un besoin', () => {
  const draft = {} as never
  const NEED = '00000000-0000-4000-8000-0000000000aa'

  it('vérifie le besoin dans l’espace de l’appelant, puis confirme', async () => {
    const { controller, rfpService, pipeline } = build()
    await controller.confirm(USER, { draft, sourceNeedId: NEED })
    expect(pipeline.hasNeed).toHaveBeenCalledWith('ws-1', NEED)
    expect(rfpService.confirm).toHaveBeenCalledWith('user-1', { draft, sourceNeedId: NEED })
  })

  it('refuse un besoin introuvable dans l’espace — rien n’est écrit', async () => {
    const { controller, rfpService, pipeline } = build()
    pipeline.hasNeed.mockResolvedValueOnce(false)
    await expect(controller.confirm(USER, { draft, sourceNeedId: NEED })).rejects.toThrow('Besoin introuvable.')
    expect(rfpService.confirm).not.toHaveBeenCalled()
  })

  it('sans besoin d’origine, aucune vérification (comportement d’avant)', async () => {
    const { controller, pipeline } = build()
    await controller.confirm(USER, { draft })
    expect(pipeline.hasNeed).not.toHaveBeenCalled()
  })
})

// #2957 (#2180.54) — les deux routes ne font que déléguer : la vérification
// d'espace et d'appartenance vit dans `RfpService`.
describe('RfpController — fichiers sources (#2180.54)', () => {
  it('liste les fichiers sources du dossier demandé', async () => {
    const { controller, rfpService } = build()
    await controller.listDocuments(USER, 'rfp-1')
    expect(rfpService.listSourceDocuments).toHaveBeenCalledWith('user-1', 'rfp-1')
  })

  it('ouvre un fichier source du dossier demandé', async () => {
    const { controller, rfpService } = build()
    await controller.downloadDocument(USER, 'rfp-1', 'object-1')
    expect(rfpService.downloadSourceDocument).toHaveBeenCalledWith('user-1', 'rfp-1', 'object-1')
  })
})

// #2957 (#2180.53) — l'import interruptible et reprenable, câblé sur la route.
describe('RfpController — import interruptible (#2180.53)', () => {
  it('reprendre lit la session en cours de l’appelant', async () => {
    const { controller, importSessions } = build()
    const result = await controller.currentImportSession(USER)
    expect(importSessions.current).toHaveBeenCalledWith('ws-1', USER.userId)
    // Jamais un corps vide : `{ session: null }` quand il n'y a rien à reprendre.
    expect(result).toEqual({ session: null })
  })

  it('l’aperçu est gardé côté serveur', async () => {
    const { controller, importSessions } = build()
    const body = { title: 'AO', pastedText: null, documentNames: [], preview: {} } as never
    await controller.saveImportSession(USER, body)
    expect(importSessions.save).toHaveBeenCalledWith('ws-1', USER.userId, body)
  })

  it('annuler archive la session (cancelled)', async () => {
    const { controller, importSessions } = build()
    await controller.cancelImportSession(USER)
    expect(importSessions.close).toHaveBeenCalledWith('ws-1', USER.userId, 'cancelled')
  })

  it('confirmer ferme la session (confirmed) APRÈS l’écriture', async () => {
    const { controller, rfpService, importSessions } = build()
    await controller.confirm(USER, { draft: {} } as never)
    expect(rfpService.confirm).toHaveBeenCalled()
    expect(importSessions.close).toHaveBeenCalledWith('ws-1', USER.userId, 'confirmed')
  })

  it('une confirmation refusée ne ferme pas la session (on peut encore reprendre)', async () => {
    const { controller, rfpService, importSessions } = build()
    rfpService.confirm.mockRejectedValueOnce(new Error('échec'))
    await expect(controller.confirm(USER, { draft: {} } as never)).rejects.toThrow('échec')
    expect(importSessions.close).not.toHaveBeenCalled()
  })
})
