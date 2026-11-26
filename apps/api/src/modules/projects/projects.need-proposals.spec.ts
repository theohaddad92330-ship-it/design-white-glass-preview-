import { NEED_PROVENANCES, NEED_SOURCES, createProjectNeedSchema } from '@bellum/contracts'
import { ProjectsController } from './projects.controller'
import { resolveBrand } from '@bellum/contracts'

/** Le service de marque, réduit à ce que le code testé lui demande : la marque
 *  du PRODUIT, c'est-à-dire un espace qui n'a rien posé. */
/**
 * Le service de marque, réduit à ce que le code testé lui demande : la marque
 * du PRODUIT, c'est-à-dire un espace qui n'a rien posé — et `null` pour
 * l'adresse d'expédition, donc repli sur celle d'environnement.
 */
const brandsStub = {
  getForUser: jest.fn().mockResolvedValue(resolveBrand(null)),
  getForWorkspace: jest.fn().mockResolvedValue(resolveBrand(null)),
  getSendingAddress: jest.fn().mockResolvedValue(null),
}

/**
 * Accepter une proposition écrit un besoin que la BASE accepte.
 *
 * Le défaut, trouvé le 27/08 en retirant un `as never` que le lint refusait :
 * le contrôleur passait trois valeurs qu'aucun lecteur n'attendait — des
 * compétences en `string[]` là où la colonne porte des objets typés, un
 * `source: 'detected'` absent des douze sources du contrat, et l'URL de
 * l'offre dans `provenance`, dont la contrainte SQL n'accepte que
 * `human|connector|pipeline|model`. Le cast éteignait le typage de l'objet
 * ENTIER, donc rien ne pouvait le dire : ni le compilateur, ni un test, ni
 * l'écran — seulement PostgreSQL, au moment du clic.
 *
 * Cette suite vérifie ce que le compilateur ne peut pas voir : que les deux
 * valeurs écrites appartiennent bien aux énumérations que les contraintes
 * `project_needs_source_check` et `project_needs_provenance_check` recopient.
 */
describe('ProjectsController — accepter une proposition de besoin', () => {
  const proposal = {
    id: 'prop-1',
    title: 'Développeur Java confirmé',
    skills: ['Java', 'Spring Boot'],
    source_url: 'https://exemple.example/offres/12345',
  }

  const build = () => {
    const pipeline = { addNeed: jest.fn().mockResolvedValue({ id: 'need-1' }) }
    const needProposals = {
      findPending: jest.fn().mockResolvedValue(proposal),
      markAccepted: jest.fn().mockResolvedValue(undefined),
    }
    const workspaceContext = { resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'w-1' }) }
    const controller = new ProjectsController(
      {} as never,
      pipeline as never,
      {} as never,
      workspaceContext as never,
      {} as never,
      needProposals as never,
      // Documents, étapes cochables et verdict du besoin — hors périmètre de
      // cette suite.
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      // Documents de l'opportunité (#2171.24) — hors périmètre de cette suite.
      {} as never,
      // Synthèse d'opportunité (#2171.27) — hors périmètre de cette suite.
      {} as never,
      // Le stockage de fichiers (31/08/2026) — hors périmètre de cette suite.
      {} as never,
      {} as never,
      brandsStub as never,
    )
    return { controller, pipeline, needProposals }
  }

  const user = { userId: 'u-1' } as never

  it('écrit un besoin que le contrat ACCEPTE — la contrainte SQL le refusait', async () => {
    const { controller, pipeline } = build()

    await controller.acceptNeedProposal('prop-1', { projectId: 'p-1' } as never, user)

    const [, projectId, input] = pipeline.addNeed.mock.calls[0]
    expect(projectId).toBe('p-1')
    // Le contrat est `.strict()` : il refuserait aussi un champ inventé.
    expect(() => createProjectNeedSchema.parse(input)).not.toThrow()
    expect(NEED_SOURCES).toContain(input.source)
    expect(NEED_PROVENANCES).toContain(input.provenance)
  })

  it('ne fait pas passer l’URL de l’offre pour une provenance', async () => {
    const { controller, pipeline } = build()

    await controller.acceptNeedProposal('prop-1', { projectId: 'p-1' } as never, user)

    // `provenance` répond à « QUI l'a apporté », pas à « où l'ai-je lu ». L'URL
    // reste sur la proposition, qui pointe le besoin créé.
    const [, , input] = pipeline.addNeed.mock.calls[0]
    expect(input.provenance).toBe('pipeline')
    expect(input.provenance).not.toContain('http')
  })

  it('transforme les termes en compétences SOUHAITÉES, jamais obligatoires', async () => {
    const { controller, pipeline } = build()

    await controller.acceptNeedProposal('prop-1', { projectId: 'p-1' } as never, user)

    // Une compétence obligatoire absente EXCLUT le profil du classement
    // (`missing_required_skill`). Écarter quelqu'un sur un mot extrait d'une
    // annonce serait une décision que personne n'a prise : c'est le recruteur
    // qui coche ce qui est vraiment éliminatoire.
    const [, , input] = pipeline.addNeed.mock.calls[0]
    expect(input.skills).toEqual([
      { term: 'Java', required: false, level: null },
      { term: 'Spring Boot', required: false, level: null },
    ])
  })
})

/**
 * #2647.1 — la route CLOISONNÉE par compte, pour la section « Besoins » en
 * tête du dossier. `GET needs/proposals` (transverse, BEL-CRM-101) reste
 * inchangée ; cette route ajoute `accountId` au filtre pour qu'un compte ne
 * voie jamais les propositions d'un autre compte du même espace.
 */
describe('ProjectsController.listNeedProposalsForAccount (#2647.1)', () => {
  const ACCOUNT = '33333333-3333-4333-8333-333333333333'

  const build = () => {
    const needProposals = { pending: jest.fn().mockResolvedValue([{ id: 'prop-1', account_id: ACCOUNT }]) }
    const workspaceContext = { resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'w-1' }) }
    const controller = new ProjectsController(
      {} as never,
      {} as never,
      {} as never,
      workspaceContext as never,
      {} as never,
      needProposals as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      brandsStub as never,
    )
    return { controller, needProposals }
  }

  const user = { userId: 'u-1' } as never

  it('passe le compte au service — la lecture est scopée, pas seulement l’espace', async () => {
    const { controller, needProposals } = build()

    const result = await controller.listNeedProposalsForAccount(ACCOUNT, user)

    expect(needProposals.pending).toHaveBeenCalledWith('w-1', ACCOUNT)
    expect(result).toEqual({ items: [{ id: 'prop-1', account_id: ACCOUNT }] })
  })
})
