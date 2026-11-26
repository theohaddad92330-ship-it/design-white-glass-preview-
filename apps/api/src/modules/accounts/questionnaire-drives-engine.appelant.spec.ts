import { AccountsService } from './accounts.service'

/**
 * #2040.15 / #2040.17 — L'APPELANT, PAS LA FONCTION.
 *
 * Le défaut n°1 de ce dépôt est du code juste que personne n'appelle : une
 * dérivation exacte, testée, et jamais branchée. Cette garde-ci ne juge donc
 * aucune règle — elle prouve que les deux lectures RÉELLES de l'API passent par
 * le profil vendeur :
 *
 *  - `listSimilarCompaniesToExplore` (GET accounts/similar-to-explore) ;
 *  - `listAccountSignals` (GET accounts/signals, la Veille).
 *
 * Elle sait dire NON : retirer le filtre de `rankSimilarCandidates` ou l'appel
 * à `orderSignalsByDecisiveKinds` fait rougir le premier `expect` de chacun des
 * deux blocs (vérifié en neutralisant les deux, 16/09/2026).
 */

/** Le repository minimal des deux lectures : `find` pour l'amorçage et
 *  l'exclusion, un query-builder chaînable pour la Veille. */
function makeRepo(signalRows: Record<string, unknown>[], portfolio: Record<string, unknown>[]) {
  const qb = {
    select: () => qb,
    where: () => qb,
    andWhere: () => qb,
    orderBy: () => qb,
    getRawMany: async () => signalRows,
  }
  return {
    find: jest.fn().mockResolvedValue(portfolio),
    createQueryBuilder: () => qb,
  }
}

function makeService(
  repo: ReturnType<typeof makeRepo>,
  profile: Record<string, unknown>,
  ia: { discoverCompanies: jest.Mock } = { discoverCompanies: jest.fn().mockResolvedValue({ suggestions: [] }) },
) {
  const esnProfile = { resolveProfileData: jest.fn().mockResolvedValue(profile) }
  const service = new AccountsService(
    repo as never,
    ia as never,
    { resolveActiveWorkspace: jest.fn() } as never,
    esnProfile as never,
  )
  return { service, esnProfile }
}

describe('#2040.15 — la lecture « comptes similaires » rend deux JEUX selon les réponses', () => {
  const portfolio = [{ id: 'a-1', company_name: 'VINCI', status: 'completed', sector: 'BTP', naf_code: '41.20A' }]
  const suggestions = {
    suggestions: [
      { name: 'BATI NORD', siren: '1', city: 'Lille', sector: 'Construction de bâtiments résidentiels' },
      { name: 'SOFTWARE ONE', siren: '2', city: 'Lille', sector: 'Programmation informatique' },
    ],
  }

  it('LIT un corpus non vide — deux candidats découverts pour une amorce', async () => {
    const ia = { discoverCompanies: jest.fn().mockResolvedValue(suggestions) }
    const { service } = makeService(makeRepo([], portfolio), {}, ia)
    const rendus = await service.listSimilarCompaniesToExplore('ws-1', 'user-1')
    expect(rendus).toHaveLength(2)
  })

  it('le secteur refusé au questionnaire ne sort PAS de la liste — il n’y entre pas', async () => {
    const ia = { discoverCompanies: jest.fn().mockResolvedValue(suggestions) }
    const { service, esnProfile } = makeService(makeRepo([], portfolio), { noGoSectors: ['BTP & Construction'] }, ia)

    const rendus = await service.listSimilarCompaniesToExplore('ws-1', 'user-1')

    expect(esnProfile.resolveProfileData).toHaveBeenCalledWith('user-1')
    expect(rendus.map(item => item.company_name)).toEqual(['SOFTWARE ONE'])
  })

  it('témoin — sans `userId`, aucun profil n’est résolu et les deux candidats restent', async () => {
    const ia = { discoverCompanies: jest.fn().mockResolvedValue(suggestions) }
    const { service, esnProfile } = makeService(makeRepo([], portfolio), { noGoSectors: ['BTP & Construction'] }, ia)

    const rendus = await service.listSimilarCompaniesToExplore('ws-1')

    expect(esnProfile.resolveProfileData).not.toHaveBeenCalled()
    expect(rendus).toHaveLength(2)
  })
})

describe('#2040.17 — la Veille rend deux LISTES selon les réponses', () => {
  const signalRows = [
    {
      id: 'acc-1',
      company_name: 'CARREFOUR',
      sector: 'Distribution',
      priority_score: 80,
      created_at: '2026-09-01T00:00:00.000Z',
      recent_signals: [
        // Ordre NATUREL de la Veille (score du compte, puis date décroissante) :
        // l'alliance d'abord. Un ordre naturel qui donnerait déjà la réponse
        // attendue rendrait les tests ci-dessous tautologiques.
        { signal: 'Alliance avec un intégrateur', type: 'partenariat', date: '2026-09-09' },
        { signal: 'Quinze postes ouverts en data', type: 'recrutement', date: '2026-09-03' },
      ],
      logo_url: null,
      website: null,
    },
  ]

  it('LIT un corpus non vide — deux signaux, deux natures', async () => {
    const { service } = makeService(makeRepo(signalRows, []), {})
    const items = await service.listAccountSignals('ws-1', 'user-1')
    expect(items).toHaveLength(2)
    expect(new Set(items.map(item => item.type)).size).toBe(2)
  })

  it('« recrute pour ses clients » ⇒ le poste ouvert passe devant l’alliance', async () => {
    const { service, esnProfile } = makeService(makeRepo(signalRows, []), { recruitsForClients: true })

    const items = await service.listAccountSignals('ws-1', 'user-1')

    expect(esnProfile.resolveProfileData).toHaveBeenCalledWith('user-1')
    // L'ordre naturel disait « partenariat » d'abord : c'est la RÉPONSE qui l'a
    // renversé, pas la date.
    expect(items.map(item => item.type)).toEqual(['recrutement', 'partenariat'])
  })

  it('deux jeux de réponses rendent deux LISTES, sur le même corpus', async () => {
    const placeur = makeService(makeRepo(signalRows, []), { recruitsForClients: true })
    const partenarial = makeService(makeRepo(signalRows, []), { staffingModes: ['Sous-traitance'] })

    const listePlaceur = (await placeur.service.listAccountSignals('ws-1', 'user-1')).map(item => item.type)
    const listePartenariale = (await partenarial.service.listAccountSignals('ws-1', 'user-1')).map(item => item.type)

    expect(listePlaceur).toEqual(['recrutement', 'partenariat'])
    expect(listePartenariale).toEqual(['partenariat', 'recrutement'])
    expect(listePlaceur).not.toEqual(listePartenariale)
  })

  it('témoin — sans `userId`, la Veille garde son ordre d’avant (date décroissante)', async () => {
    const { service, esnProfile } = makeService(makeRepo(signalRows, []), { recruitsForClients: true })

    const items = await service.listAccountSignals('ws-1')

    expect(esnProfile.resolveProfileData).not.toHaveBeenCalled()
    expect(items.map(item => item.type)).toEqual(['partenariat', 'recrutement'])
  })
})
