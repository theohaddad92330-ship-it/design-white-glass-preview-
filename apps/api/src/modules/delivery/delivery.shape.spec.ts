import { DeliveryService } from './delivery.service'

/**
 * La forme rendue par `/delivery/missions` est celle que l'écran lit.
 *
 * Défaut vu EN PRODUCTION pendant la recette, pas par un test : l'écran
 * Missions affichait des lignes sans titre, sans compte, toutes « Sans date de
 * fin », et un badge portant la clé i18n brute `status.undefined`.
 *
 * La cause n'était ni un état manquant ni une traduction absente : deux types
 * portant le MÊME nom avaient divergé. Le service rendait
 * `{ mission: {...}, renewal, marginPercent, risks }` ; le web déclarait
 * `MissionView = Mission & { renewal, risks, marginPercent }`, c'est-à-dire une
 * forme À PLAT. Chaque champ lu — `label`, `status`, `ends_on` — valait donc
 * `undefined`, et `t('status.undefined')` rendait sa clé.
 *
 * Rien ne pouvait l'attraper : `apiFetch` type la réponse par assertion, donc
 * le compilateur voyait deux contrats cohérents chacun de son côté. C'est
 * exactement la classe de défaut que la recette live existe pour trouver.
 *
 * Ce test fige la forme du FIL. Il ne vérifie pas que l'écran est joli : il
 * vérifie qu'il reçoit les champs qu'il lit.
 */
describe('DeliveryService — la forme du fil', () => {
  const mission = {
    id: 'm-1',
    workspace_id: 'w-1',
    // `account_id` est NON NUL en base : une mission sans compte n'existe pas.
    // Le fixture l'omettait, ce qui rendait indétectable toute lecture qui en
    // dépend — dont le nom du compte, resté absent du fil pendant des mois.
    account_id: 'a-1',
    label: 'TMA ACME',
    status: 'active',
    ends_on: '2026-12-31',
    daily_rate_cents: 60000,
    daily_cost_cents: 40000,
  }

  /**
   * Les décorations LUES À CÔTÉ de la mission — le nom du compte et qui est
   * dessus. Chaque spec peut les remplacer pour décrire SA panne.
   */
  const build = (
    over: {
      accounts?: unknown
      assignmentRows?: unknown
      /** Les conditions commerciales — la source du coût chargé (D43). */
      terms?: { find: jest.Mock }
      /** Les LIGNES rendues par le dépôt, quand une spec décrit une mission
       *  autre que celle du fixture — une échéance différente, par exemple.
       *  Un `override` déclaré ici plutôt qu'un accès au champ privé du
       *  service : un test qui atteint l'intérieur d'un objet reste vert le
       *  jour où le champ est renommé. */
      rows?: unknown[]
    } = {},
  ) => {
    const missions = {
      find: jest.fn().mockResolvedValue(over.rows ?? [mission]),
      manager: {
        query: jest.fn().mockImplementation(async () => {
          if (over.assignmentRows instanceof Error) throw over.assignmentRows
          return over.assignmentRows ?? []
        }),
      },
    }
    const timesheets = { find: jest.fn().mockResolvedValue([]) }
    const accounts = {
      find: jest.fn().mockImplementation(async () => {
        if (over.accounts instanceof Error) throw over.accounts
        return over.accounts ?? []
      }),
    }
    // #2414.34/.40 — `marketDemandByConsultant` lit le même aiguillage démo
    // que `ReverseMarketService.forTalent()`.
    const workspaceContext = {
      resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'w-1' }),
      isDemoWorkspace: jest.fn().mockResolvedValue(false),
    }
    // Les conditions commerciales — la source du coût chargé depuis D43.
    const terms = over.terms ?? { find: jest.fn().mockResolvedValue([]) }
    return new DeliveryService(
      missions as never,
      timesheets as never,
      accounts as never,
      { findOne: jest.fn() } as never,
      // #2191.17 / #2191.18 — le besoin, non lu par ces tests de forme.
      { findOne: jest.fn() } as never,
      terms as never,
      // #2562 — le cache des deals CRM, non lu par ces tests de forme.
      { findOne: jest.fn() } as never,
      // #2560.6 — le vivier, non lu PAR SES CHAMPS par ces tests de forme
      // (aucun consultantId). #2194.7 — `list()` interroge désormais aussi
      // `consultants.manager.query` pour le compte d'intercontrat (voir
      // `delivery.service.spec.ts` pour ses propres tests) ; `[]` par défaut
      // ici, cette suite-ci ne mesure pas ce chiffre.
      { findOne: jest.fn(), manager: { query: jest.fn().mockResolvedValue([]) } } as never,
      // #2339.7 — le vivier des positionnements, non lu par ces tests de forme.
      { findOne: jest.fn() } as never,
      { assign: jest.fn() } as never,
      workspaceContext as never,
      { record: jest.fn() } as never,
      // #2411.11 — les résolutions de risque, non lues par ces tests de forme.
      { find: jest.fn().mockResolvedValue([]), upsert: jest.fn() } as never,
      // #2411.6 — l'état de facturation, vide par défaut pour ces tests de forme.
      {
        list: jest.fn().mockResolvedValue({ items: [], summary: {}, month: '2026-01', canReadFinance: true }),
      } as never,
    )
  }

  it('rend les champs de la mission À PLAT, pas sous une clé `mission`', async () => {
    const { missions } = await build().list('u-1', { canReadFinance: true })

    expect(missions[0]).toMatchObject({ id: 'm-1', label: 'TMA ACME', status: 'active', ends_on: '2026-12-31' })
  })

  it('n’imbrique plus la mission — c’est ce qui rendait chaque champ `undefined` à l’écran', async () => {
    const { missions } = await build().list('u-1', { canReadFinance: true })

    expect((missions[0] as unknown as Record<string, unknown>).mission).toBeUndefined()
  })

  it('garde les champs CALCULÉS à côté des champs de la mission', async () => {
    const { missions } = await build().list('u-1', { canReadFinance: true })

    expect(missions[0]).toHaveProperty('renewal')
    expect(missions[0]).toHaveProperty('risks')
    expect(missions[0]).toHaveProperty('marginPercent')
  })

  it('porte un `status` non vide — sans lui, le badge affiche sa clé de traduction', async () => {
    const { missions } = await build().list('u-1', { canReadFinance: true })

    expect(missions[0].status).toBeTruthy()
  })

  /* ------------------------------------------------------------------------- */
  /*  La marge ne sort pas sans `finance:read`                                  */
  /* ------------------------------------------------------------------------- */

  describe('la marge d’une mission est un champ FINANCIER', () => {
    /**
     * `GET /delivery/missions` n'a pas de permission déclarée — et c'est
     * légitime : la LISTE des missions intéresse tout le monde. Ce qui ne l'est
     * pas, c'est que la décoration y ajoutait `marginPercent` sans condition. Le
     * taux de marge de chaque mission sortait donc à tout membre de l'espace, y
     * compris un `viewer` ou un `recruiter`, pendant que le board, le vivier et le
     * matching la retiraient scrupuleusement.
     *
     * Le copilote la relayait au modèle par-dessus le marché
     * (`chat_tools.py` → `margin_percent`).
     */
    it('la VIDE quand l’appelant n’a pas le droit — présente, `null`, jamais un zéro', async () => {
      const { missions } = await build().list('u-1', { canReadFinance: false })
      // D45 (28/08/2026) : la clé reste PRÉSENTE et vaut `null`. Elle
      // disparaissait avant, et la forme de la réponse changeait donc avec le
      // rôle du lecteur — trois rédactions écrites à la main avaient divergé
      // sur ce point. Jamais `0` : un zéro se lirait comme une marge nulle, ce
      // qui est une information fausse plutôt qu'une absence d'information.
      expect(missions[0]).toHaveProperty('marginPercent')
      expect(missions[0]?.marginPercent).toBeNull()
      expect(missions[0]?.marginPercent).not.toBe(0)
    })

    it('la rend à qui l’a', async () => {
      const { missions } = await build().list('u-1', { canReadFinance: true })
      expect(missions[0]).toHaveProperty('marginPercent')
    })

    it('rend le DROIT avec la liste — sans lui, « pas mesuré » et « pas le droit » sont le même `null`', async () => {
      // Le champ ne porte plus la distinction depuis qu'il vaut `null` dans les
      // deux cas. Sans ce drapeau, l'écran afficherait le même vide pour « tu
      // n'as pas ce droit » et « personne n'a saisi le coût chargé ».
      await expect(build().list('u-1', { canReadFinance: false })).resolves.toMatchObject({ canReadFinance: false })
      await expect(build().list('u-1', { canReadFinance: true })).resolves.toMatchObject({ canReadFinance: true })
    })

    it('le reste de la mission est identique dans les deux cas', async () => {
      // Vider un champ financier ne doit pas dégrader la liste : c'est ce qui
      // rend la garde tenable plutôt que subie.
      const withFinance = (await build().list('u-1', { canReadFinance: true })).missions[0]
      const without = (await build().list('u-1', { canReadFinance: false })).missions[0]
      expect(without).toMatchObject({ id: withFinance?.id, label: withFinance?.label, status: withFinance?.status })
      // Les risques NON financiers ne bougent pas d'un côté à l'autre.
      const nonFinancial = (risks: readonly string[] | undefined) =>
        (risks ?? []).filter(risk => risk !== 'margin_at_risk' && risk !== 'margin_unknown')
      expect(nonFinancial(without?.risks)).toEqual(nonFinancial(withFinance?.risks))
    })

    /**
     * ⚠️ Les DEUX risques de marge suivent le droit de la marge (D43).
     *
     * `margin_at_risk` est la marge réduite à son signe : la retirer d'un champ
     * pour la laisser sortir dans une liste de risques ne garderait rien. Et
     * `margin_unknown` affirmé à quelqu'un qui n'a pas le droit de lire le coût
     * serait FAUX — la marge est peut-être parfaitement mesurée, c'est lui qui
     * ne la voit pas. « Un verdict ne se conclut pas d'un silence », surtout
     * d'un silence qu'on a soi-même imposé.
     */
    it('ne laisse AUCUN risque de marge fuir sans le droit', async () => {
      const { missions } = await build().list('u-1', { canReadFinance: false })
      expect(missions[0]?.risks).not.toContain('margin_at_risk')
      expect(missions[0]?.risks).not.toContain('margin_unknown')
    })

    it('ne lit même pas le coût chargé sans le droit — la requête ne part pas', async () => {
      // Charger une donnée financière pour la jeter juste après serait une
      // fuite en attente du premier `console.log` de débogage.
      const terms = { find: jest.fn().mockResolvedValue([]) }
      await build({ terms }).list('u-1', { canReadFinance: false })
      expect(terms.find).not.toHaveBeenCalled()
    })

    it('la FORME est la même avec et sans le droit — mêmes clés, à la lettre', async () => {
      // C'est l'objet même de D45 : la réponse ne change plus de FORME selon le
      // rôle du lecteur. Un client qui parse la liste n'a plus deux formes à
      // gérer, seulement une valeur qui peut être vide.
      const withFinance = (await build().list('u-1', { canReadFinance: true })).missions[0]
      const without = (await build().list('u-1', { canReadFinance: false })).missions[0]
      expect(Object.keys(without ?? {}).sort()).toEqual(Object.keys(withFinance ?? {}).sort())
    })
  })

  /* ------------------------------------------------------------------------- */
  /*  Le moteur de cadence — #2413.1 à .48, épopée #2965                        */
  /* ------------------------------------------------------------------------- */

  describe('le moteur de cadence voyage avec la mission (#2413.1 à .48)', () => {
    it('rend un palier et un état, dérivés, jamais persistés', async () => {
      const { missions } = await build().list('u-1', { canReadFinance: true })
      expect(missions[0]).toHaveProperty('renewalEngineTier')
      expect(missions[0]).toHaveProperty('renewalEngineState')
      expect(missions[0]).toHaveProperty('renewalEngineFactors')
      expect(missions[0]?.renewalEngineFactors).toHaveLength(8)
    })

    it('nomme le facteur marge, jamais une valeur, quand l’appelant n’a pas le droit financier', async () => {
      const { missions } = await build().list('u-1', { canReadFinance: false })
      const margeFactor = missions[0]?.renewalEngineFactors?.find((f: { key: string }) => f.key === 'marge')
      // Même garde que `marginPercent` juste au-dessus : le facteur ne doit pas
      // devenir le trou par lequel la marge fuit sans `finance:read`.
      expect(margeFactor).toMatchObject({ status: 'absent', value: null })
    })

    it('lit le préavis dans les conditions commerciales existantes — jamais une colonne dupliquée sur missions', async () => {
      // #2413.2, .25, .28 — `notice_days` (préavis) est DÉJÀ mesuré par
      // `mission_commercial_terms` (`upsertCommercialTermsSchema.noticeDays`) :
      // ce test garantit que le moteur de cadence le RELIE plutôt que d'en
      // ajouter un second, ce que GA-26 interdit.
      const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10)
      const farEnough = { ...mission, ends_on: inDays(100) }

      const withoutNotice = await build({ rows: [farEnough] }).list('u-1', { canReadFinance: true })
      expect(withoutNotice.missions[0]?.renewalEngineTier).toBe('not_due')

      const terms = { find: jest.fn().mockResolvedValue([{ mission_id: 'm-1', notice_days: 90 }]) }
      const withNotice = await build({ terms, rows: [farEnough] }).list('u-1', { canReadFinance: true })
      // Un préavis de 90 jours sur une fin à 100 jours ne laisse que 10 jours
      // utiles : la mission entre dans le cycle, alors qu'une lecture brute
      // de `ends_on` la disait encore "not_due".
      expect(withNotice.missions[0]?.renewalEngineTier).not.toBe('not_due')
      const preavisFactor = withNotice.missions[0]?.renewalEngineFactors?.find(
        (f: { key: string }) => f.key === 'preavis',
      )
      expect(preavisFactor).toMatchObject({ status: 'mesure', value: 90 })
    })

    it('mesure le facteur marge à qui a le droit, quand le coût est connu', async () => {
      const terms = {
        find: jest.fn().mockResolvedValue([{ mission_id: 'm-1', loaded_daily_cost_cents: 40000 }]),
      }
      const { missions } = await build({ terms, rows: [{ ...mission, daily_rate: 800 }] }).list('u-1', {
        canReadFinance: true,
      })
      const margeFactor = missions[0]?.renewalEngineFactors?.find((f: { key: string }) => f.key === 'marge')
      expect(margeFactor?.status).toBe('mesure')
    })
  })

  /* ------------------------------------------------------------------------- */
  /*  Le déclencheur de repositionnement — #2414.34 à .48, épopée #2986        */
  /* ------------------------------------------------------------------------- */

  describe('le déclencheur de repositionnement voyage avec la mission (#2414.34 à .48)', () => {
    it('rend un état et une raison, jamais un booléen nu', async () => {
      const { missions } = await build().list('u-1', { canReadFinance: true })
      expect(missions[0]).toHaveProperty('repositionTrigger')
      expect(missions[0]?.repositionTrigger).toHaveProperty('state')
      expect(missions[0]?.repositionTrigger).toHaveProperty('reasonKey')
    })

    it('#2414.38 — une reconduction SIGNÉE dit "pas encore", même tout près de l’échéance', async () => {
      const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10)
      const renewed = { ...mission, ends_on: inDays(5), renewal_status: 'renouvele' }
      const { missions } = await build({ rows: [renewed] }).list('u-1', { canReadFinance: true })
      expect(missions[0]?.repositionTrigger).toEqual({ state: 'pas_encore', reasonKey: 'renewed' })
    })

    it('#2414.34-48 NO-GO — une fin CONFIRMÉE démarre le moteur même loin de l’échéance', async () => {
      const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10)
      const confirmed = { ...mission, ends_on: inDays(100), renewal_status: 'fin_confirmee' }
      const { missions } = await build({ rows: [confirmed] }).list('u-1', { canReadFinance: true })
      expect(missions[0]?.repositionTrigger).toEqual({ state: 'a_commencer', reasonKey: 'ending_confirmed' })
    })
  })

  /* ------------------------------------------------------------------------- */
  /*  Le nom du compte — une colonne LUE, jamais ÉCRITE                         */
  /* ------------------------------------------------------------------------- */

  /**
   * `accountName` était déclaré côté WEB (`MissionView` dans
   * `features/missions/api.ts`), lu par la liste ET par l'entête du tiroir de
   * détail — et le service ne l'a JAMAIS envoyé. `decorate()` rendait
   * `{...mission, renewal, marginPercent?, risks}` et rien d'autre.
   *
   * Conséquence mesurable, pas théorique : l'entête du tiroir écrit
   * `mission.accountName ?? t('unknownAccount')`, donc TOUTE mission ouverte
   * affichait « Compte inconnu » — alors que `account_id` est non nul et
   * obligatoire en base. Sur la liste, la mention du compte ne s'affichait
   * simplement jamais.
   *
   * C'est la cause racine « colonne lue, jamais écrite » : les deux côtés
   * compilent, chacun cohérent avec lui-même, et le repli honnête
   * (« inconnu ») ressemble exactement à une base vide.
   *
   * La lecture existait DÉJÀ dans le même module — `MissionBoardService`
   * résout `accounts.company_name` pour ses cartes depuis toujours.
   */
  describe('le nom du compte porteur voyage avec la mission', () => {
    it('rend le nom du compte, pas seulement son identifiant', async () => {
      const service = build({ accounts: [{ id: 'a-1', company_name: 'ACME' }] })
      const { missions } = await service.list('u-1', { canReadFinance: false })

      expect(missions[0]?.accountName).toBe('ACME')
    })

    it('rend `null` quand le compte n’est pas dans le périmètre — jamais une chaîne vide', async () => {
      // Une chaîne vide s'afficherait comme une cellule blanche, que personne
      // ne distingue d'un nom manquant.
      const service = build({ accounts: [{ id: 'autre-compte', company_name: 'ACME' }] })
      const { missions } = await service.list('u-1', { canReadFinance: false })

      expect(missions[0]?.accountName).toBeNull()
    })
  })

  /* ------------------------------------------------------------------------- */
  /*  Le LOGO du compte — le même défaut, une colonne plus loin (#1349, #1363)  */
  /* ------------------------------------------------------------------------- */

  /**
   * `CompanyAvatar` existe et sert sur 29 fichiers ; les logos s'affichent sur
   * `/accounts`. Sur `/missions`, la même colonne rend une initiale — et la
   * cause n'est pas le composant, c'est que la donnée ne voyage pas : la
   * requête ne sélectionnait que `id` et `company_name`.
   *
   * C'est le motif « un composant juste que personne ne NOURRIT », déjà payé le
   * 02/09 sur trois écrans. Le brancher sans élargir la lecture aurait rendu
   * exactement la même initiale, et on aurait cru la famille livrée.
   *
   * ⚠️ Les DEUX champs, pas seulement le logo. `companyLogoSrc` applique une
   * précédence — logo réel d'abord, favicon du site ensuite : n'envoyer que
   * `logo_url` priverait du repli tous les comptes qui n'ont qu'un site.
   */
  describe('le logo du compte voyage avec la mission', () => {
    it('rend le logo ET le site du compte, pas seulement son nom', async () => {
      const service = build({
        accounts: [{ id: 'a-1', company_name: 'ACME', logo_url: 'https://cdn/acme.png', website: 'acme.com' }],
      })
      const { missions } = await service.list('u-1', { canReadFinance: false })

      expect(missions[0]?.accountLogoUrl).toBe('https://cdn/acme.png')
      expect(missions[0]?.accountWebsite).toBe('acme.com')
    })

    it('rend `null` sur les deux quand le compte n’en porte pas — jamais une chaîne vide', () => {
      // Une chaîne vide passerait le test de présence côté écran et rendrait
      // une image cassée. `null` retombe proprement sur l'initiale.
      return build({ accounts: [{ id: 'a-1', company_name: 'ACME', logo_url: null, website: null }] })
        .list('u-1', { canReadFinance: false })
        .then(({ missions }) => {
          expect(missions[0]?.accountLogoUrl).toBeNull()
          expect(missions[0]?.accountWebsite).toBeNull()
        })
    })

    it('rend `null` quand le compte est hors périmètre — comme le nom', async () => {
      const service = build({
        accounts: [{ id: 'autre-compte', company_name: 'ACME', logo_url: 'https://cdn/acme.png', website: 'acme.com' }],
      })
      const { missions } = await service.list('u-1', { canReadFinance: false })

      expect(missions[0]?.accountLogoUrl).toBeNull()
      expect(missions[0]?.accountWebsite).toBeNull()
    })
  })

  /* ------------------------------------------------------------------------- */
  /*  Qui est dessus — et la différence entre « personne » et « on ne sait pas » */
  /* ------------------------------------------------------------------------- */

  /**
   * ⚠️ `[]` et `null` disent deux choses DIFFÉRENTES, et c'est tout l'objet de
   * ces trois tests.
   *
   *  - `[]` : on a lu la table, personne n'est affecté. C'est une alerte — une
   *    mission qui tourne sans personne dessus est le cas que le board nomme
   *    déjà `unstaffed`.
   *  - `null` : la lecture a ÉCHOUÉ. On ne sait pas.
   *
   * Les confondre est la cause racine « cassé et non mesurable se ressemblent » :
   * un repli sur liste vide ferait afficher « Personne d'affecté » sur des
   * missions correctement staffées, et l'utilisateur irait corriger une donnée
   * qui n'a rien.
   *
   * Une panne d'affectations ne fait PAS tomber la liste, en revanche : c'est
   * une décoration, et le board applique déjà cette règle sur ses quatre
   * lectures annexes.
   */
  describe('les affectations : « personne » n’est pas « on ne sait pas »', () => {
    /**
     * ⚠️ LA FORME A CHANGÉ LE 04/09/2026 (#1350, #1363), et c'est le point du
     * test : le champ rendait `string[]`, il rend l'IDENTITÉ.
     *
     * Un nom ne suffit ni à l'avatar (il lui faut la photo) ni à la porte vers
     * le profil (il lui faut l'`id` — deux homonymes du vivier ouvriraient la
     * même fiche). Les trois champs voyagent donc ensemble.
     */
    it('rend les consultants en poste — identité, nom et photo', async () => {
      const service = build({
        assignmentRows: [
          { mission_id: 'm-1', consultant_id: 'c-1', full_name: 'Salomé Dufour', photo_url: 'https://x/s.jpg' },
          { mission_id: 'm-1', consultant_id: 'c-2', full_name: 'Camille Roussel', photo_url: null },
        ],
      })
      const { missions } = await service.list('u-1', { canReadFinance: false })

      expect(missions[0]?.assignees).toEqual([
        { id: 'c-1', fullName: 'Salomé Dufour', photoUrl: 'https://x/s.jpg' },
        { id: 'c-2', fullName: 'Camille Roussel', photoUrl: null },
      ])
    })

    it('rend `photoUrl: null` quand aucune photo n’est déposée — jamais une chaîne vide', async () => {
      const service = build({
        assignmentRows: [{ mission_id: 'm-1', consultant_id: 'c-1', full_name: 'Salomé Dufour' }],
      })
      const { missions } = await service.list('u-1', { canReadFinance: false })

      expect(missions[0]?.assignees).toEqual([{ id: 'c-1', fullName: 'Salomé Dufour', photoUrl: null }])
    })

    it('rend `[]` quand PERSONNE n’est affecté — c’est une alerte, pas une absence de mesure', async () => {
      const service = build({ assignmentRows: [] })
      const { missions } = await service.list('u-1', { canReadFinance: false })

      expect(missions[0]?.assignees).toEqual([])
    })

    it('rend `null` quand la lecture ÉCHOUE — et la liste tient quand même', async () => {
      const service = build({ assignmentRows: new Error('affectations illisibles') })
      const { missions } = await service.list('u-1', { canReadFinance: false })

      // La décoration tombe, la mission reste.
      expect(missions[0]?.assignees).toBeNull()
      expect(missions[0]?.label).toBe('TMA ACME')
    })
  })

  /**
   * LA PROCHAINE ACTION VOYAGE — #1354, #1355, #1357, #1366.
   *
   * ─────────────────────────────────────────────────────────────────────────────
   * LE DÉFAUT, ET SA CLASSE
   * ─────────────────────────────────────────────────────────────────────────────
   * Tout existait : la dérivation (`activeMissionNextAction`), la correspondance
   * action → écran (`nextActionLink`), la primitive de rendu (`NextAction`) et la
   * route (`/missions/$id`). Le champ ne partait simplement PAS sur
   * `GET /delivery/missions` — si bien que `/missions` affichait « Renouvellement
   * non engagé » et « Sans date de fin » en badges muets, alors que l'onglet
   * Missions d'un dossier de compte, qui lit une AUTRE route, le rendait en lien
   * depuis des semaines.
   *
   * C'est le défaut n°1 du dépôt, dans sa forme exacte : du code juste, calculé,
   * testé, que personne ne NOURRIT. Ce fichier existe déjà pour cette raison —
   * il fige la forme du FIL, parce que `apiFetch` type par assertion et que les
   * deux côtés compilent chacun de leur côté.
   *
   * ⚠️ L'HORLOGE EST FIGÉE. `renewalWindow` la lit : sans ça, ce bloc dirait
   * « renew_soon » aujourd'hui et « none » dans deux mois, et rougirait un matin
   * sans que personne n'ait touché au code.
   */
  describe('DeliveryService — la prochaine action part avec la ligne', () => {
    beforeEach(() => {
      jest.useFakeTimers()
      jest.setSystemTime(new Date('2026-11-15T09:00:00.000Z'))
    })

    afterEach(() => {
      jest.useRealTimers()
    })

    it('la rend, DÉRIVÉE de la fenêtre de renouvellement', async () => {
      // 31/12/2026 vu du 15/11 : quarante-six jours, donc la fenêtre J-60.
      const { missions } = await build().list('u-1', { canReadFinance: true })

      expect(missions[0]?.renewal).toBe('j60')
      expect(missions[0]?.nextAction).toBe('renew_soon')
    })

    it('sans date de fin, elle envoie en POSER une — c’est le geste de #1354', async () => {
      // La mission sans échéance est justement celle qu'aucune fenêtre ne
      // rattrape : « Sans date de fin » n'est pas un constat, c'est un geste.
      const service = build({ rows: [{ ...mission, ends_on: null }] })
      const { missions } = await service.list('u-1', { canReadFinance: true })

      expect(missions[0]?.renewal).toBe('unknown')
      expect(missions[0]?.nextAction).toBe('set_end_date')
    })

    it('sait dire NON : une échéance lointaine n’invente aucun geste', async () => {
      const service = build({ rows: [{ ...mission, ends_on: '2027-12-31' }] })
      const { missions } = await service.list('u-1', { canReadFinance: true })

      // `none` est une VÉRITÉ, et `nextActionLink` lui refuse toute destination :
      // un lien sur une ligne calme promettrait un geste qui n'existe pas.
      expect(missions[0]?.nextAction).toBe('none')
    })

    it('elle ne dépend PAS du droit financier — une alerte d’échéance n’est pas un montant', async () => {
      const { missions } = await build().list('u-1', { canReadFinance: false })

      expect(missions[0]?.nextAction).toBe('renew_soon')
      // …et la marge, elle, reste rédigée : présente et vide (D45).
      expect(missions[0]?.marginPercent).toBeNull()
    })
  })
})
