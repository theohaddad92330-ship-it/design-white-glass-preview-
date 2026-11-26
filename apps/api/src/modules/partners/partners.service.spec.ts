import { BadRequestException } from '@nestjs/common'
import { MARKET_MEMORY_PARTNERS_FLAG, PartnersService } from './partners.service'

/**
 * Les ESN présentes sur un compte (décision D11).
 *
 * Une recommandation PAR ENTITÉ, jamais une pour le compte entier : le §2 R5
 * place le rang 1 sur l'entité, et une seule recommandation pour « EDF »
 * mélangerait une DSI verrouillée et une filiale ouverte.
 */
describe('PartnersService', () => {
  const build = (
    over: {
      partners?: unknown[]
      entities?: unknown[]
      clash?: unknown
      account?: unknown
      // #1818.2 — les comptes de l'espace, pour la jointure de logo par nom
      // normalisé. Vide par défaut : sans compte homonyme, `attachLogos` ne
      // trouve rien, et les tests déjà écrits gardent EXACTEMENT leur sortie
      // (aucun champ `logo_url`/`website` n'apparaît sur une ligne inchangée).
      accountsList?: unknown[]
      // #2298.7 — les lignes `profiles` que `declaredByNamesOf` lirait, pour
      // résoudre `declared_by` en nom sur `landscape()`.
      profiles?: unknown[]
      memory?: unknown
      esnDirectory?: { factsByName: jest.Mock }
      // #1624.9 — le service reçoit un JETON (une fonction), plus le service
      // de drapeaux : GA-07 est au plafond, la composition vit dans le module.
      isFeatureOn?: jest.Mock
      // #3404.5 — la relation gouvernée qu'un `qualify` peut désigner.
      partnerRelation?: unknown
      // #3181.4 — les relations d'espace lues par `accessBySiren`.
      relations?: unknown[]
    } = {},
  ) => {
    const qb = {
      where: jest.fn(() => qb),
      andWhere: jest.fn(() => qb),
      getOne: jest.fn().mockResolvedValue(over.clash ?? null),
    }
    const partners = {
      find: jest.fn().mockResolvedValue(over.partners ?? []),
      create: jest.fn((value: unknown) => value),
      save: jest.fn(async (value: Record<string, unknown>) => ({ id: 'p-1', created_at: new Date(), ...value })),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
      createQueryBuilder: jest.fn(() => qb),
      // #2298.7 — la résolution du nom du déclarant (`declaredByNamesOf`) lit
      // `profiles` en SQL brut, sur le même geste que `ownersOf`
      // (`delivery.service.ts`) : vide par défaut, aucun profil à résoudre.
      manager: { query: jest.fn().mockResolvedValue(over.profiles ?? []) },
    }
    const entities = { find: jest.fn().mockResolvedValue(over.entities ?? []) }
    // Le compte, pour la lecture de la mémoire marché. Sans nom d'entreprise,
    // rien n'est interrogé — c'est le défaut du harnais, et c'est aussi l'état
    // du produit tant que le corpus n'est pas chargé.
    const accounts = {
      findOne: jest.fn().mockResolvedValue(over.account ?? null),
      find: jest.fn().mockResolvedValue(over.accountsList ?? []),
    }
    // #3404.5 — `null` par défaut : la plupart des tests existants ne parlent
    // pas de lien de gouvernance, et ne doivent pas commencer à en trouver un.
    const partnerRelations = {
      findOne: jest.fn().mockResolvedValue(over.partnerRelation ?? null),
      find: jest.fn().mockResolvedValue(over.relations ?? []),
    }
    const marketMemory = over.memory ?? {
      coverageFor: jest.fn(async () => ({
        status: 'ok',
        coverage: {
          covered: false,
          marketPaths: null,
          esnObserved: [],
          observedStack: [],
          roleFamilies: [],
          exEsnPresent: null,
        },
      })),
    }
    // #1624.7 / #1624.9 — le référentiel ESN (rang déclaré) et Reflag (drapeau
    // de déploiement progressif) : deux dépendances nouvelles, chacune inerte
    // par défaut ici — aucune ESN connue, drapeau éteint — pour que les 25
    // tests déjà écrits gardent EXACTEMENT leur comportement.
    const esnDirectory = over.esnDirectory ?? { factsByName: jest.fn().mockResolvedValue(new Map()) }
    const isFeatureOn = over.isFeatureOn ?? jest.fn().mockReturnValue(false)
    return {
      service: new PartnersService(
        partners as never,
        entities as never,
        accounts as never,
        partnerRelations as never,
        marketMemory as never,
        esnDirectory as never,
        isFeatureOn as never,
      ),
      partners,
      accounts,
      partnerRelations,
      marketMemory,
      esnDirectory,
      isFeatureOn,
    }
  }

  const partner = (over: Record<string, unknown> = {}) => ({
    id: 'p-1',
    account_id: 'a-1',
    entity_id: null,
    name: 'Sopra',
    rank: 'rank1',
    relationship: 'partner',
    note: null,
    source: 'declared',
    placements: 0,
    // #2298.7 — `null` par défaut : la plupart des fixtures existantes ne
    // parlent pas de qui a déclaré, et ne doivent PAS commencer à porter un
    // nom deviné.
    declared_by: null,
    created_at: new Date(),
    ...over,
  })

  it('classe le partenaire qui commande la stratégie en premier', async () => {
    const { service } = build({
      partners: [
        partner({ id: 'p-2', name: 'Petite ESN', rank: 'rank2', relationship: 'unknown' }),
        partner({ id: 'p-1', name: 'Sopra', rank: 'rank1', relationship: 'partner', placements: 3 }),
      ],
    })
    const result = await service.landscape('w-1', 'a-1')
    expect(result.partners[0]?.name).toBe('Sopra')
    expect(result.partners[0]?.score).toBeGreaterThan(result.partners[1]?.score ?? 0)
  })

  it('rend une recommandation PAR ENTITÉ, jamais une pour le compte entier', async () => {
    const { service } = build({
      entities: [
        { id: 'e-1', name: 'DSI Groupe', rank1_incumbent: 'yes' },
        { id: 'e-2', name: 'Renouvelables', rank1_incumbent: 'no' },
      ],
      partners: [partner({ entity_id: 'e-1', name: 'Capgemini', rank: 'rank1', relationship: 'competitor' })],
    })
    const { recommendations } = await service.landscape('w-1', 'a-1')
    expect(recommendations).toHaveLength(2)
    // #3205.6 (épopée #3239) — verrouillée d'un côté, ouverte de l'autre :
    // désormais « vise l'autre filiale » plutôt qu'un déplacement frontal,
    // exactement ce qu'une recommandation unique aurait écrasé.
    expect(recommendations.find(item => item.entity_id === 'e-1')?.play).toBe('target_other_subsidiary')
    expect(recommendations.find(item => item.entity_id === 'e-1')?.partner).toBe('Renouvelables')
    expect(recommendations.find(item => item.entity_id === 'e-2')?.play).toBe('direct')
  })

  // #3205.6 (épopée #3239) — les deux issues manquantes de la spec,
  // maintenant CÂBLÉES sur un appelant réel (`landscape`), pas seulement sur
  // la fonction pure `rank1Recommendation`.
  describe('rank1Recommendation câblée — target_other_subsidiary et differentiate (#3205.6)', () => {
    it('reste displace sans autre entité ouverte ni positionnement déclaré', async () => {
      const { service } = build({
        entities: [{ id: 'e-1', name: 'DSI Groupe', rank1_incumbent: 'yes' }],
        partners: [partner({ entity_id: 'e-1', name: 'Capgemini', rank: 'rank1', relationship: 'competitor' })],
      })
      const { recommendations } = await service.landscape('w-1', 'a-1')
      expect(recommendations[0]?.play).toBe('displace')
    })

    it('se différencie quand le positionnement déclaré de l’utilisateur est niche/expertise', async () => {
      const { service } = build({
        entities: [{ id: 'e-1', name: 'DSI Groupe', rank1_incumbent: 'yes' }],
        partners: [partner({ entity_id: 'e-1', name: 'Capgemini', rank: 'rank1', relationship: 'competitor' })],
      })
      service['sellingPostureOf'] = jest.fn().mockResolvedValue('nicheVerticals')
      const { recommendations } = await service.landscape('w-1', 'a-1', 'u-1')
      expect(recommendations[0]?.play).toBe('differentiate')
    })

    it('une lecture de profil en échec dégrade sans casser l’onglet — reste displace', async () => {
      const { service, partners } = build({
        entities: [{ id: 'e-1', name: 'DSI Groupe', rank1_incumbent: 'yes' }],
        partners: [partner({ entity_id: 'e-1', name: 'Capgemini', rank: 'rank1', relationship: 'competitor' })],
      })
      partners.manager.query = jest.fn().mockRejectedValue(new Error('boom'))
      const { recommendations } = await service.landscape('w-1', 'a-1', 'u-1')
      expect(recommendations[0]?.play).toBe('displace')
    })
  })

  it('refuse deux lignes pour la même ESN — deux rangs contradictoires rendraient la reco aléatoire', async () => {
    const { service } = build({ clash: partner() })
    await expect(service.create('w-1', 'a-1', { name: 'sopra' }, 'u-1')).rejects.toBeInstanceOf(BadRequestException)
  })

  it('marque une saisie manuelle comme DÉCLARÉE — le pipeline, lui, écrira « analysis »', async () => {
    const { service } = build()
    const created = await service.create('w-1', 'a-1', { name: 'Sopra', rank: 'rank1' }, 'u-1')
    expect(created.source).toBe('declared')
    // Rien n'est deviné : sans relation saisie, elle reste inconnue.
    expect(created.relationship).toBe('unknown')
  })

  /**
   * #2298.7 — QUI a déclaré la relation, et QUAND.
   *
   * `created_at` porte déjà QUAND (`@CreateDateColumn`, jamais retouché ici).
   * Ce lot ajoute QUI : `declared_by` porte l'id de l'utilisateur qui a saisi
   * la ligne — renseigné À L'ÉCRITURE, jamais reconstitué après coup.
   */
  it('#2298.7 — écrit `declared_by` avec l’id de qui déclare la relation', async () => {
    const { service, partners } = build()
    await service.create('w-1', 'a-1', { name: 'Sopra', rank: 'rank1' }, 'u-42')
    expect(partners.create).toHaveBeenCalledWith(expect.objectContaining({ declared_by: 'u-42' }))
  })

  describe('#2298.7 — le déclarant, résolu en nom (`landscape`)', () => {
    it('résout `declared_by` en `declared_by_name`, via `profiles` — jamais un id brut sur le fil', async () => {
      const { service } = build({
        partners: [partner({ declared_by: 'u-42' })],
        profiles: [{ user_id: 'u-42', first_name: 'Louis', last_name: 'Schlegel', email: 'louis@bellum-it.com' }],
      })
      const { partners: rows } = await service.landscape('w-1', 'a-1')
      expect(rows[0]?.declared_by_name).toBe('Louis Schlegel')
    })

    it('une ligne sans `declared_by` (pipeline, ou déclarée avant ce lot) rend `null` — jamais un nom deviné', async () => {
      const { service } = build({ partners: [partner({ declared_by: null })] })
      const { partners: rows } = await service.landscape('w-1', 'a-1')
      expect(rows[0]?.declared_by_name).toBeNull()
    })

    it('un profil illisible ne fait pas tomber la liste — `declared_by_name` reste `null`, comme `ownersOf` (#2195.13)', async () => {
      const { service, partners } = build({ partners: [partner({ declared_by: 'u-42' })] })
      partners.manager.query.mockRejectedValueOnce(new Error('profiles illisible'))
      const { partners: rows } = await service.landscape('w-1', 'a-1')
      expect(rows[0]?.declared_by_name).toBeNull()
    })
  })

  /**
   * #1624.7 — LE RANG DÉCLARÉ DU RÉFÉRENTIEL ESN, SUR L'ONGLET PARTENAIRES.
   * #1624.9 — DERRIÈRE UN DRAPEAU DE DÉPLOIEMENT PROGRESSIF.
   *
   * Les deux se testent ENSEMBLE : le drapeau n'existe QUE pour commander
   * cette capacité (`market_memory_partners_enabled`), donc un test qui
   * prouve l'un sans l'autre ne prouverait ni que le drapeau COMMANDE
   * quelque chose de réel (il pourrait n'être lu nulle part), ni que la
   * capacité est bien gouvernée par lui.
   */
  it('ajoute declared_subcontracting quand le drapeau est ARMÉ et le référentiel dit "oui"', async () => {
    const { service, isFeatureOn } = build({
      // `source: 'declared'` (le défaut de `partner()`) fait déjà porter
      // `workspace_declared` par `mergePartnerEvidence` — la preuve, c'est
      // que le NOUVEAU champ s'AJOUTE à côté, il ne le remplace pas.
      partners: [partner({ name: 'Nordiq' })],
      esnDirectory: {
        factsByName: jest.fn().mockResolvedValue(new Map([['nordiq', { openToSubcontracting: 'oui' }]])),
      },
      isFeatureOn: jest.fn().mockReturnValue(true),
    })

    const result = await service.landscape('w-1', 'a-1')

    expect(result.partners[0]?.evidence_origins).toEqual(
      expect.arrayContaining(['workspace_declared', 'declared_subcontracting']),
    )
    // Le drapeau COMMANDE vraiment quelque chose : il est bien LU, avec le nom
    // exact que #1624.9 documente, et le périmètre de l'espace (déploiement
    // PROGRESSIF, pas global).
    expect(isFeatureOn).toHaveBeenCalledWith(MARKET_MEMORY_PARTNERS_FLAG, expect.any(String))
  })

  it('n’ajoute RIEN quand le drapeau est ÉTEINT — même si le référentiel dit "oui"', async () => {
    // Défaut du harnais (`build()` sans `isFeatureOn`) : le drapeau rend `false`.
    // C'est l'état du produit tant que personne n'a activé le déploiement.
    const { service } = build({
      partners: [partner({ name: 'Nordiq', evidence_origins: [] })],
      esnDirectory: {
        factsByName: jest.fn().mockResolvedValue(new Map([['nordiq', { openToSubcontracting: 'oui' }]])),
      },
    })

    const result = await service.landscape('w-1', 'a-1')

    expect(result.partners[0]?.evidence_origins ?? []).not.toContain('declared_subcontracting')
  })

  it('n’interroge même PAS le référentiel quand le drapeau est éteint — pas d’appel réseau superflu', async () => {
    const { service, esnDirectory } = build({
      partners: [partner({ name: 'Nordiq' })],
      isFeatureOn: jest.fn().mockReturnValue(false),
    })

    await service.landscape('w-1', 'a-1')

    expect(esnDirectory.factsByName).not.toHaveBeenCalled()
  })

  /**
   * #1818.2 — LE LOGO, UNIQUEMENT QUAND LE RAPPROCHEMENT PAR NOM EST SANS
   * AMBIGUÏTÉ.
   *
   * Le test qui compte est celui des DEUX HOMONYMES : la même règle que
   * #1756.3 (`companies.controller.ts`, les trois « THALES » de SIREN
   * distincts) — deux comptes analysés du même nom normalisé ne se
   * départagent pas, donc AUCUN des deux ne prête son logo.
   */
  describe('le logo du partenaire, joint SANS AMBIGUÏTÉ (#1818.2)', () => {
    it('un SEUL compte analysé porte ce nom normalisé — le logo passe', async () => {
      const { service } = build({
        partners: [partner({ name: 'Capgemini' })],
        accountsList: [{ company_name: 'Capgemini', logo_url: 'https://logo.example/capgemini.png', website: null }],
      })

      const result = await service.landscape('w-1', 'a-1')

      expect(result.partners[0]?.logo_url).toBe('https://logo.example/capgemini.png')
    })

    it('DEUX comptes distincts portent le même nom normalisé — aucun logo, jamais un choix arbitraire', async () => {
      const { service } = build({
        partners: [partner({ name: 'Thales' })],
        accountsList: [
          { company_name: 'Thales', logo_url: 'https://logo.example/groupe-aerospatial.png', website: null },
          { company_name: 'Thales', logo_url: 'https://logo.example/fret-fluvial.png', website: null },
        ],
      })

      const result = await service.landscape('w-1', 'a-1')

      // Ni l'un ni l'autre : impossible de savoir lequel, si un seul, est le
      // bon (même refus que la fusion de doublons). La pastille à initiale
      // reste — `logo_url` n'apparaît pas du tout sur la ligne.
      expect(result.partners[0]?.logo_url).toBeUndefined()
    })

    it('AUCUN compte analysé ne porte ce nom — aucun logo', async () => {
      const { service } = build({
        partners: [partner({ name: 'ESN Inconnue' })],
        accountsList: [{ company_name: 'Autre Société', logo_url: 'https://logo.example/autre.png', website: null }],
      })

      const result = await service.landscape('w-1', 'a-1')

      expect(result.partners[0]?.logo_url).toBeUndefined()
    })

    it('le rapprochement ignore la casse et les accents — « CAPGEMINI » retrouve « Capgemini »', async () => {
      const { service } = build({
        partners: [partner({ name: 'CAPGEMINI' })],
        accountsList: [{ company_name: 'Capgemini', logo_url: 'https://logo.example/capgemini.png', website: null }],
      })

      const result = await service.landscape('w-1', 'a-1')

      expect(result.partners[0]?.logo_url).toBe('https://logo.example/capgemini.png')
    })

    it('un compte unique SANS logo ni site — la ligne ressort inchangée, jamais un logo deviné', async () => {
      const { service } = build({
        partners: [partner({ name: 'Sopra' })],
        accountsList: [{ company_name: 'Sopra', logo_url: null, website: null }],
      })

      const result = await service.landscape('w-1', 'a-1')

      expect(result.partners[0]?.logo_url).toBeUndefined()
      expect(result.partners[0]?.website).toBeUndefined()
    })

    it('un compte unique sans logo mais avec un site — le site voyage pour le repli favicon', async () => {
      const { service } = build({
        partners: [partner({ name: 'Sopra' })],
        accountsList: [{ company_name: 'Sopra', logo_url: null, website: 'https://sopra.example' }],
      })

      const result = await service.landscape('w-1', 'a-1')

      expect(result.partners[0]?.logo_url).toBeNull()
      expect(result.partners[0]?.website).toBe('https://sopra.example')
    })
  })

  /**
   * #2151.42 / #2166.38 — LA RELATION WORKSPACE, jointe SANS AMBIGUÏTÉ.
   *
   * Même rapprochement que le logo (#1818.2) — un SEUL compte analysé de
   * l'espace porte ce nom normalisé — mais une question différente : « cette
   * ESN est-elle DÉJÀ un compte que mon espace connaît ? ». La réponse ne
   * dépend pas d'avoir un logo à afficher : un compte connu SANS logo reste un
   * compte connu.
   */
  describe('le lien SIREN partenaire↔client (#3181.4)', () => {
    it('un compte possédé sous ce SIREN + une ESN déclarée en rang 2 → un chemin, SIREN du partenaire via sa relation', async () => {
      const { service } = build({
        accountsList: [{ id: 'a-1', siren: '111111111' }],
        partners: [
          partner({
            name: 'Alpha Conseil',
            account_id: 'a-1',
            rank: 'rank2',
            relationship: 'partner',
            partner_relation_id: 'r-1',
          }),
        ],
        relations: [{ id: 'r-1', siren: '222222222', name: 'Alpha Conseil', stage: 'actif' }],
      })

      const result = await service.accessBySiren('w-1', ['111111111'])

      expect(result['111111111']?.paths[0]).toMatchObject({ partner_name: 'Alpha Conseil', partner_siren: '222222222' })
    })

    it('aucun compte sous ce SIREN → absent, jamais « aucun chemin »', async () => {
      const { service } = build()

      expect(await service.accessBySiren('w-1', ['999999999'])).toEqual({})
    })

    /**
     * #3247 (décision Louis 14/10) — ÉLARGIR : un candidat jamais ajouté au
     * portefeuille obtient un chemin quand il est la TÊTE DE GROUPE d'une
     * filiale possédée (`accounts.group_head_siren`, déjà persisté).
     */
    it('la tête de groupe d’une filiale possédée, jamais ajoutée elle-même → un chemin marqué `via_group`', async () => {
      const { service } = build({
        accountsList: [{ id: 'a-sub', siren: '333333333', group_head_siren: '999999999' }],
        partners: [
          partner({
            name: 'Alpha Conseil',
            account_id: 'a-sub',
            rank: 'rank2',
            relationship: 'partner',
          }),
        ],
      })

      const result = await service.accessBySiren('w-1', ['999999999'])

      expect(result['999999999']?.paths[0]).toMatchObject({ partner_name: 'Alpha Conseil', via_group: true })
    })
  })

  describe('la relation workspace, jointe SANS AMBIGUÏTÉ (#2151.42)', () => {
    it('un SEUL compte analysé porte ce nom — l’id du compte voyage, même sans logo', async () => {
      const { service } = build({
        partners: [partner({ name: 'Sopra' })],
        accountsList: [{ id: 'acc-sopra', company_name: 'Sopra', logo_url: null, website: null }],
      })

      const result = await service.landscape('w-1', 'a-1')

      expect(result.partners[0]?.workspace_account_id).toBe('acc-sopra')
    })

    it('DEUX comptes distincts portent le même nom — aucune relation, jamais un choix arbitraire', async () => {
      const { service } = build({
        partners: [partner({ name: 'Thales' })],
        accountsList: [
          { id: 'acc-1', company_name: 'Thales', logo_url: null, website: null },
          { id: 'acc-2', company_name: 'Thales', logo_url: null, website: null },
        ],
      })

      const result = await service.landscape('w-1', 'a-1')

      expect(result.partners[0]?.workspace_account_id).toBeUndefined()
    })

    it('AUCUN compte de l’espace ne porte ce nom — aucune relation', async () => {
      const { service } = build({
        partners: [partner({ name: 'ESN Inconnue' })],
        accountsList: [{ id: 'acc-1', company_name: 'Autre Société', logo_url: null, website: null }],
      })

      const result = await service.landscape('w-1', 'a-1')

      expect(result.partners[0]?.workspace_account_id).toBeUndefined()
    })
  })
})

describe('PartnersService — les sociétés de services OBSERVÉES (#1579)', () => {
  const ACCOUNT = { id: 'a-1', company_name: 'Thales', website: 'https://thalesgroup.com' }

  const covered = (esnObserved: unknown[]) => ({
    coverageFor: jest.fn(async () => ({
      status: 'ok',
      coverage: {
        covered: true,
        marketPaths: 41,
        esnObserved,
        observedStack: [],
        roleFamilies: [],
        exEsnPresent: null,
      },
    })),
  })

  const buildWith = (over: Record<string, unknown>) => {
    const qb = { where: jest.fn(() => qb), andWhere: jest.fn(() => qb), getOne: jest.fn().mockResolvedValue(null) }
    const partners = {
      find: jest.fn().mockResolvedValue((over.partners as unknown[]) ?? []),
      createQueryBuilder: jest.fn(() => qb),
    }
    const entities = { find: jest.fn().mockResolvedValue([]) }
    const accounts = {
      findOne: jest.fn().mockResolvedValue(over.account ?? null),
      // #1818.2 — même défaut vide que le harnais du bloc précédent : ces
      // tests portent sur les preuves observées, pas sur le logo.
      find: jest.fn().mockResolvedValue((over.accountsList as unknown[]) ?? []),
    }
    // #1624.7 / #1624.9 — inertes par défaut, comme dans le harnais du bloc
    // précédent : ces tests portent sur la mémoire marché, pas sur le rang
    // déclaré ni sur le drapeau.
    const esnDirectory = over.esnDirectory ?? { factsByName: jest.fn().mockResolvedValue(new Map()) }
    const isFeatureOn = over.isFeatureOn ?? jest.fn().mockReturnValue(false)
    // #3404.5 — même défaut inerte : ces tests ne parlent pas du lien vers
    // `partner_relations`.
    const partnerRelations = { findOne: jest.fn().mockResolvedValue(null) }
    return new PartnersService(
      partners as never,
      entities as never,
      accounts as never,
      partnerRelations as never,
      over.memory as never,
      esnDirectory as never,
      isFeatureOn as never,
    )
  }

  it('rend les sociétés observées, avec leur certitude', async () => {
    const service = buildWith({
      account: ACCOUNT,
      memory: covered([{ esnName: 'ALTEN', persons: 9, certainty: 'forte' }]),
    })

    const result = await service.landscape('w-1', 'a-1')

    expect(result.observed).toEqual([{ esnName: 'ALTEN', persons: 9, certainty: 'forte', alsoKnown: false }])
  })

  /**
   * #1605 — CE TEST A CHANGÉ D'INTENTION, ET C'EST VOULU.
   *
   * Il gardait la forme de #1579 : deux listes, et un drapeau `alsoKnown` sur la
   * ligne observée pour éviter d'écrire « ALTEN » deux fois. Le souci était juste
   * — ne pas doublonner — mais la solution obligeait à DÉDUIRE que deux chemins
   * concordaient.
   *
   * Le retour #1605 donne la bonne forme : on fusionne la LIGNE, on garde les
   * PREUVES. « ALTEN » sort une seule fois, dans la liste canonique, en portant
   * ses deux origines. Le bloc « observées » ne garde plus que ce que l'espace
   * ne connaît pas.
   */
  it('fusionne une société déclarée ET observée en UNE ligne, sans perdre de preuve', async () => {
    const service = buildWith({
      account: ACCOUNT,
      partners: [
        {
          id: 'p-1',
          account_id: 'a-1',
          entity_id: null,
          name: 'ALTEN',
          rank: 'rank1',
          relationship: 'partner',
          note: null,
          source: 'declared',
          placements: 0,
          created_at: new Date(),
        },
      ],
      memory: covered([{ esnName: 'ALTEN', persons: 9, certainty: 'forte' }]),
    })

    const result = await service.landscape('w-1', 'a-1')

    // Elle ne réapparaît plus dans le bloc des observées — c'est le doublon visé.
    expect(result.observed).toEqual([])
    // La ligne déclarée reste dans `partners` : l'observation ne la remplace pas.
    expect(result.partners).toHaveLength(1)
    // Et elle porte ses DEUX preuves, simultanément.
    expect(result.partners[0].evidence_origins).toEqual(['workspace_declared', 'market_observation'])
    expect(result.partners[0].market_observation_count).toBe(9)
  })

  it('rend une liste vide quand la couverture est sous le seuil', async () => {
    const service = buildWith({
      account: ACCOUNT,
      memory: {
        coverageFor: jest.fn(async () => ({
          status: 'ok',
          coverage: {
            covered: false,
            marketPaths: null,
            esnObserved: [],
            observedStack: [],
            roleFamilies: [],
            exEsnPresent: null,
          },
        })),
      },
    })

    expect((await service.landscape('w-1', 'a-1')).observed).toEqual([])
  })

  it('rend une liste vide quand la mémoire est INDISPONIBLE — l’onglet fonctionne sans elle', async () => {
    const service = buildWith({
      account: ACCOUNT,
      memory: { coverageFor: jest.fn(async () => ({ status: 'unavailable', reason: 'read_failed' })) },
    })

    const result = await service.landscape('w-1', 'a-1')

    expect(result.observed).toEqual([])
    expect(result.recommendations).toEqual([])
  })

  it('n’interroge PAS la mémoire quand le compte n’a pas de nom d’entreprise', async () => {
    const memory = covered([{ esnName: 'ALTEN', persons: 9, certainty: 'forte' }])
    const service = buildWith({ account: { id: 'a-1', company_name: null, website: null }, memory })

    expect((await service.landscape('w-1', 'a-1')).observed).toEqual([])
    expect(memory.coverageFor).not.toHaveBeenCalled()
  })

  it('n’interroge PAS la mémoire quand le compte est introuvable dans cet espace', async () => {
    const memory = covered([])
    const service = buildWith({ account: null, memory })

    expect((await service.landscape('w-1', 'a-1')).observed).toEqual([])
    expect(memory.coverageFor).not.toHaveBeenCalled()
  })
})
