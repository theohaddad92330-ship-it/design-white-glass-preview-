import { isFailure, isSuccess } from '@bellum/utils'
import { AccountsService } from './accounts.service'
import type { AccountEntity } from '../../database/entities/account.entity'

/**
 * #1111 — le lien « même groupe » se VOIT et se DÉFAIT.
 *
 * Ce que ces tests protègent, et qui manquait :
 *
 *  1. `accounts.merged_into_id` était écrite et JAMAIS relue. Un dossier
 *     archivé par un rattachement n'avait aucune explication à l'écran, et le
 *     dossier gardé ne disait pas ce qui lui était rattaché. Le premier bloc
 *     ci-dessous échoue si plus personne n'appelle cette colonne.
 *  2. Le rattachement écrasait `status` sans garder l'état d'avant. Un
 *     détachement aurait dû CHOISIR un statut de retour — donc en inventer un.
 *     Les tests vérifient que l'état rendu est celui qui a été ENREGISTRÉ.
 */

type Row = Partial<AccountEntity> & { id: string }

/** L'espace du scénario — `getAccountLinks` lit TOUJOURS par espace (#4786). */
const WS = 'ws-1'

/** Une ligne de compte telle que `findOne` la rend (`SELECT a.*`). */
const accountRow = (over: Row): Row => ({
  company_name: 'KLESIA ADP',
  status: 'archived',
  workspace_id: WS,
  merged_into_id: null,
  merged_at: null,
  merged_by: null,
  merged_previous_status: null,
  merged_previous_commercial_status: null,
  merged_entity_id: null,
  ...over,
})

/**
 * Un service câblé sur un routeur SQL : chaque requête est reconnue à son
 * texte, et rend les lignes du scénario. On capture aussi TOUT le SQL émis,
 * ce qui permet d'asserter ce que l'écriture fait réellement.
 */
function makeService(scenario: {
  accounts: Row[]
  /** Les comptes rattachés à celui qu'on lit (`merged_into_id = $1`). */
  linkedRows?: Array<Record<string, unknown>>
  /** Contacts portés par l'entité d'accueil. */
  hostedContacts?: Array<{ id: string; full_name: string | null }>
  /** Contacts déjà présents sur le dossier qu'on détache. */
  homeContacts?: Array<{ id: string; full_name: string | null }>
}) {
  const issued: Array<{ sql: string; params: unknown[] }> = []

  const query = jest.fn(async (sql: string, params: unknown[] = []) => {
    issued.push({ sql, params })
    // `findOne` — SELECT a.* … WHERE a.id = $1 AND a.user_id = $2
    if (sql.includes('FROM accounts a') && sql.includes('a.user_id')) {
      const found = scenario.accounts.find(row => row.id === params[0])
      // Une ligne qui déclare son `user_id` ne répond qu'à lui (un repo qui rend tout ne sait pas dire NON).
      return found && (found.user_id === undefined || found.user_id === params[1]) ? [found] : []
    }
    // `findOneForWorkspace` — … WHERE a.id = $1 AND a.workspace_id = $2
    if (sql.includes('FROM accounts a') && sql.includes('a.workspace_id = $2')) {
      const found = scenario.accounts.find(row => row.id === params[0] && row.workspace_id === params[1])
      if (!found) return []
      // #4786 — la clause BU filtre VRAIMENT : un faux qui rend la ligne quelle
      // que soit l'unité ne sait pas dire NON, et une garde verte sur lui ne
      // prouverait rien. On rejoue les trois formes de `businessUnitScopeClause`.
      //
      // ⚠️ L'ORDRE compte : la forme à identifiants est
      // `(… IN (…) OR … IS NULL)` — elle contient AUSSI « IS NULL ». Tester
      // `IS NULL` d'abord ferait lire tout périmètre comme un périmètre VIDE,
      // et le faux refuserait des comptes que la vraie requête sert.
      if (sql.includes('a.business_unit_id IN')) {
        const permis = (params[2] as string[] | undefined) ?? []
        return !found.business_unit_id || permis.includes(found.business_unit_id) ? [found] : []
      }
      if (sql.includes('a.business_unit_id IS NULL')) {
        return found.business_unit_id ? [] : [found]
      }
      return [found]
    }
    // Les dossiers rattachés à celui-ci.
    if (sql.includes('a.merged_into_id = $1')) return scenario.linkedRows ?? []
    if (sql.includes('FROM contacts WHERE entity_id')) return scenario.hostedContacts ?? []
    if (sql.includes('FROM contacts WHERE account_id')) return scenario.homeContacts ?? []
    return []
  })

  const manager = {
    query,
    transaction: jest.fn(async (cb: (runner: { query: typeof query }) => Promise<void>) => cb({ query })),
  }
  const service = new AccountsService(
    { manager } as never,
    { discoverCompanies: jest.fn() } as never,
    { resolveActiveWorkspace: jest.fn() } as never,
    { resolveProfileData: jest.fn() } as never,
  )
  return { service, issued }
}

/** Tout le SQL émis, concaténé — pour asserter qu'une écriture a bien eu lieu. */
const allSql = (issued: Array<{ sql: string }>) => issued.map(entry => entry.sql).join('\n')

describe('getAccountLinks — la colonne écrite est enfin LUE (#1111)', () => {
  it('dit à quel dossier celui-ci a été rattaché, et depuis quand', async () => {
    const { service } = makeService({
      accounts: [
        accountRow({
          id: 'a-adp',
          merged_into_id: 'a-klesia',
          merged_at: new Date('2026-08-27T09:30:00.000Z'),
          merged_previous_status: 'completed',
        }),
        accountRow({ id: 'a-klesia', company_name: 'KLESIA', status: 'completed' }),
      ],
    })

    const result = await service.getAccountLinks('a-adp', WS)
    expect(isSuccess(result)).toBe(true)
    if (!isSuccess(result)) return
    expect(result.output.mergedInto).toEqual({
      id: 'a-klesia',
      companyName: 'KLESIA',
      status: 'completed',
      linkedAt: '2026-08-27T09:30:00.000Z',
    })
  })

  // #4609.3 — la fiche d'un collègue s'ouvre (liste par ESPACE) ; ses liens se lisent, sans 404.
  it('#4609.3 — lit les liens du compte d’un collègue de l’espace', async () => {
    const { service } = makeService({
      accounts: [
        accountRow({ id: 'a-adp', user_id: 'un-collegue', workspace_id: 'ws-1', merged_into_id: 'a-klesia' }),
        accountRow({ id: 'a-klesia', user_id: 'un-collegue', workspace_id: 'ws-1', company_name: 'KLESIA' }),
      ],
    })
    const result = await service.getAccountLinks('a-adp', WS)
    expect(isSuccess(result)).toBe(true)
    if (!isSuccess(result)) return
    expect(result.output.mergedInto?.companyName).toBe('KLESIA')
    // Un AUTRE espace reste un 404.
    const autre = await service.getAccountLinks('a-adp', 'ws-autre')
    expect(isFailure(autre)).toBe(true)
  })

  it('laisse la date à null quand le lien est antérieur à son enregistrement — jamais aujourd’hui', async () => {
    // Une date inconnue ne devient pas la date du jour : un lien ancien se
    // lirait comme un lien posé ce matin.
    const { service } = makeService({
      accounts: [
        accountRow({ id: 'a-adp', merged_into_id: 'a-klesia', merged_at: null, merged_previous_status: 'completed' }),
        accountRow({ id: 'a-klesia', company_name: 'KLESIA' }),
      ],
    })
    const result = await service.getAccountLinks('a-adp', WS)
    if (!isSuccess(result)) throw new Error('attendu un succès')
    expect(result.output.mergedInto?.linkedAt).toBeNull()
  })

  it('liste les dossiers rattachés au compte gardé', async () => {
    const { service } = makeService({
      accounts: [accountRow({ id: 'a-klesia', company_name: 'KLESIA', status: 'completed' })],
      linkedRows: [
        { id: 'a-adp', company_name: 'KLESIA ADP', status: 'archived', merged_at: new Date('2026-08-27T09:30:00Z') },
      ],
    })
    const result = await service.getAccountLinks('a-klesia', WS)
    if (!isSuccess(result)) throw new Error('attendu un succès')
    expect(result.output.linked).toEqual([
      { id: 'a-adp', companyName: 'KLESIA ADP', status: 'archived', linkedAt: '2026-08-27T09:30:00.000Z' },
    ])
    // Le compte gardé n'est rattaché à personne : c'est `null`, pas un objet vide.
    expect(result.output.mergedInto).toBeNull()
  })

  it('ne nomme PAS un dossier hors du périmètre du lecteur', async () => {
    // Le pointeur existe, la cible n'est pas lisible : on ne fuite pas un nom
    // de compte d'un autre espace par un identifiant.
    const { service } = makeService({
      accounts: [
        accountRow({ id: 'a-adp', merged_into_id: 'a-ailleurs', merged_previous_status: 'completed' }),
        // 'a-ailleurs' absent du périmètre : `findOneForWorkspace` rend not_found.
      ],
    })
    const result = await service.getAccountLinks('a-adp', WS)
    if (!isSuccess(result)) throw new Error('attendu un succès')
    expect(result.output.mergedInto).toBeNull()
  })

  it('porte le refus de détachement, calculé côté serveur', async () => {
    const { service } = makeService({
      accounts: [accountRow({ id: 'a-adp', merged_into_id: 'a-klesia', merged_previous_status: null })],
    })
    const result = await service.getAccountLinks('a-adp', WS)
    if (!isSuccess(result)) throw new Error('attendu un succès')
    expect(result.output.detachRefusal).toBe('link_predates_reversal')
    expect(result.output.detachRefusalMessage).toContain('antérieur')
  })
})

/**
 * #4786 — LE PÉRIMÈTRE BU VA JUSQU'AU BOUT DE LA LECTURE DES LIENS.
 *
 * Le défaut : la lecture appelait `findOneForWorkspace(accountId, workspaceId)`
 * — DEUX arguments, donc sans périmètre — et retombait sur
 * `findOne(accountId, userId)` quand aucun espace n'était passé. GA-336 l'avait
 * dit ; la réponse apportée avait été d'INSCRIRE l'appel au registre de dette
 * en s'autorisant d'une « EXCEPTION DATÉE (Louis, 28/10/2026) » qui n'existait
 * pas : l'issue qui la cite est née le 29/10 à 07:06, la ligne a été écrite à
 * 08:31. Une garde protège une règle, elle ne l'invente pas.
 *
 * Arbitrage RÉEL (Louis, 29/10/2026, #4786) : retirer l'exception, porter le
 * périmètre. « Fusionné dans » nomme une RAISON SOCIALE — c'est exactement ce
 * que GA-367 a descendu dans la requête pour les six agrégats qui nommaient
 * des comptes.
 */
const SCOPE_LYON = { businessUnitIds: ['bu-lyon'], includeUnassigned: true } as const

describe('getAccountLinks — le périmètre Business Unit (#4786, GA-336)', () => {
  it('la fiche LUE porte la clause BU, avec les unités du lecteur en paramètre', async () => {
    const { service, issued } = makeService({ accounts: [accountRow({ id: 'a-adp', business_unit_id: 'bu-lyon' })] })

    const result = await service.getAccountLinks('a-adp', WS, SCOPE_LYON)

    expect(isSuccess(result)).toBe(true)
    const lecture = issued.find(entry => entry.sql.includes('a.workspace_id = $2'))
    expect(lecture?.sql).toContain('a.business_unit_id IN')
    // L'espace SURVIT à l'ajout : un second `WHERE` ouvrirait toutes les ESN.
    expect(lecture?.sql).toContain('a.workspace_id = $2')
    expect(lecture?.params[2]).toEqual(['bu-lyon'])
  })

  it('une fiche d’une AUTRE unité ne s’ouvre plus par la route des liens', async () => {
    const { service } = makeService({ accounts: [accountRow({ id: 'a-adp', business_unit_id: 'bu-paris' })] })

    expect(isFailure(await service.getAccountLinks('a-adp', WS, SCOPE_LYON))).toBe(true)
  })

  it('le dossier d’accueil d’une autre unité n’est pas NOMMÉ', async () => {
    // LA fuite, exactement : le compte ouvert est dans le périmètre, sa cible de
    // rattachement ne l'est pas. Sans la clause, « fusionné dans » sortait la
    // raison sociale d'un compte d'une autre agence.
    const { service } = makeService({
      accounts: [
        accountRow({
          id: 'a-adp',
          business_unit_id: 'bu-lyon',
          merged_into_id: 'a-klesia',
          merged_previous_status: 'completed',
        }),
        accountRow({ id: 'a-klesia', business_unit_id: 'bu-paris', company_name: 'KLESIA' }),
      ],
    })

    const result = await service.getAccountLinks('a-adp', WS, SCOPE_LYON)

    if (!isSuccess(result)) throw new Error('attendu un succès')
    expect(result.output.mergedInto).toBeNull()
  })

  it('un périmètre VIDE ne vaut pas « voit tout » : seules les fiches sans unité', async () => {
    const porte = { businessUnitIds: [], includeUnassigned: true } as const
    const { service } = makeService({ accounts: [accountRow({ id: 'a-adp', business_unit_id: 'bu-lyon' })] })

    expect(isFailure(await service.getAccountLinks('a-adp', WS, porte))).toBe(true)

    const sansUnite = makeService({ accounts: [accountRow({ id: 'a-adp', business_unit_id: null })] })
    expect(isSuccess(await sansUnite.service.getAccountLinks('a-adp', WS, porte))).toBe(true)
  })

  it('un compte SANS unité reste visible de qui le voyait avant', async () => {
    // La seconde moitié de la clause (`OR IS NULL`) n'est pas décorative : sans
    // elle, tout le portefeuille historique disparaîtrait au déploiement.
    const { service } = makeService({ accounts: [accountRow({ id: 'a-adp', business_unit_id: null })] })

    expect(isSuccess(await service.getAccountLinks('a-adp', WS, SCOPE_LYON))).toBe(true)
  })

  it('la LISTE des dossiers rattachés porte la MÊME clause BU', async () => {
    const { service, issued } = makeService({
      accounts: [accountRow({ id: 'a-klesia', business_unit_id: 'bu-lyon', company_name: 'KLESIA' })],
      linkedRows: [{ id: 'a-adp', company_name: 'KLESIA ADP', status: 'archived', merged_at: null }],
    })

    await service.getAccountLinks('a-klesia', WS, SCOPE_LYON)

    const liste = issued.find(entry => entry.sql.includes('a.merged_into_id = $1'))
    expect(liste?.sql).toContain('a.business_unit_id IN')
    expect(liste?.params[1]).toEqual(['bu-lyon'])
  })

  it('sans périmètre (`null`), le chemin reste byte-identique : aucune clause BU', async () => {
    const { service, issued } = makeService({
      accounts: [accountRow({ id: 'a-klesia', business_unit_id: 'bu-paris' })],
      linkedRows: [{ id: 'a-adp', company_name: 'KLESIA ADP', status: 'archived', merged_at: null }],
    })

    expect(isSuccess(await service.getAccountLinks('a-klesia', WS))).toBe(true)
    expect(allSql(issued)).not.toContain('business_unit_id')
  })

  it('plus AUCUN repli par `user_id` : la lecture est toujours bornée par l’espace', async () => {
    const { service, issued } = makeService({ accounts: [accountRow({ id: 'a-adp' })] })

    await service.getAccountLinks('a-adp', WS)

    expect(allSql(issued)).not.toContain('a.user_id')
  })
})

describe('detachAccount — rendre, sans rien inventer (#1111)', () => {
  it('rend au dossier le statut EXACT qui avait été enregistré', async () => {
    const { service, issued } = makeService({
      accounts: [
        accountRow({
          id: 'a-adp',
          merged_into_id: 'a-klesia',
          merged_previous_status: 'completed',
          merged_previous_commercial_status: 'opportunity',
          merged_entity_id: 'e-adp',
        }),
        accountRow({ id: 'a-klesia', company_name: 'KLESIA' }),
      ],
      hostedContacts: [{ id: 'c-1', full_name: 'Marie Dupont' }],
    })

    const result = await service.detachAccount('a-adp', 'user-1')
    expect(isSuccess(result)).toBe(true)
    if (!isSuccess(result)) return
    expect(result.output.returnedContacts).toBe(1)

    const restore = issued.find(entry => entry.sql.includes('merged_into_id = NULL'))
    expect(restore).toBeDefined()
    // Le statut rendu est celui de la colonne, pas une constante du code.
    expect(restore?.params).toEqual(['a-adp', 'completed', 'opportunity'])
  })

  it('ramène les contacts de l’entité d’accueil sur le dossier détaché', async () => {
    const { service, issued } = makeService({
      accounts: [
        accountRow({
          id: 'a-adp',
          merged_into_id: 'a-klesia',
          merged_previous_status: 'completed',
          merged_entity_id: 'e-adp',
        }),
        accountRow({ id: 'a-klesia', company_name: 'KLESIA' }),
      ],
      hostedContacts: [
        { id: 'c-1', full_name: 'Marie Dupont' },
        { id: 'c-2', full_name: 'Paul Martin' },
      ],
    })
    await service.detachAccount('a-adp', 'user-1')
    const move = issued.find(entry => entry.sql.includes('UPDATE contacts SET account_id'))
    expect(move?.params).toEqual(['a-adp', ['c-1', 'c-2']])
  })

  it('ne retire l’entité d’accueil QUE si plus aucun contact ne s’y rattache', async () => {
    const { service, issued } = makeService({
      accounts: [
        accountRow({
          id: 'a-adp',
          merged_into_id: 'a-klesia',
          merged_previous_status: 'completed',
          merged_entity_id: 'e-adp',
        }),
        accountRow({ id: 'a-klesia', company_name: 'KLESIA' }),
      ],
    })
    await service.detachAccount('a-adp', 'user-1')
    // La condition vit dans le SQL : « on archive, on ne supprime pas » vaut
    // aussi pour une subdivision où quelqu'un aurait rangé un contact depuis.
    expect(allSql(issued)).toContain('NOT EXISTS (SELECT 1 FROM contacts c WHERE c.entity_id = e.id)')
  })

  it('refuse un dossier qui n’est rattaché à rien, sans rien écrire', async () => {
    const { service, issued } = makeService({ accounts: [accountRow({ id: 'a-seul', merged_into_id: null })] })
    const result = await service.detachAccount('a-seul', 'user-1')
    expect(isFailure(result)).toBe(true)
    if (isFailure(result)) expect(result.problem.code).toBe('invalid_input')
    expect(allSql(issued)).not.toContain('UPDATE accounts')
  })

  it('refuse un lien trop ancien EN LE DISANT, plutôt que de choisir un statut', async () => {
    const { service, issued } = makeService({
      accounts: [accountRow({ id: 'a-adp', merged_into_id: 'a-klesia', merged_previous_status: null })],
    })
    const result = await service.detachAccount('a-adp', 'user-1')
    expect(isFailure(result)).toBe(true)
    if (isFailure(result)) expect(result.problem.message).toContain('sans l’inventer')
    expect(allSql(issued)).not.toContain('UPDATE accounts')
  })
})

describe('absorbAccount — le rattachement enregistre de quoi revenir (#1111)', () => {
  it('copie l’état d’avant et la provenance AVANT d’écraser le statut', async () => {
    const { service, issued } = makeService({
      accounts: [
        accountRow({ id: 'a-adp', status: 'completed', company_name: 'KLESIA ADP' }),
        accountRow({ id: 'a-klesia', status: 'completed', company_name: 'KLESIA' }),
      ],
    })

    const result = await service.absorbAccount('a-adp', 'a-klesia', 'user-1')
    expect(isSuccess(result)).toBe(true)

    const archive = issued.find(entry => entry.sql.includes("status = 'archived'"))
    expect(archive).toBeDefined()
    // Sans ces deux COALESCE, l'état d'avant serait perdu au moment même où on
    // l'écrase — et le détachement n'aurait plus qu'à inventer un statut.
    expect(archive?.sql).toContain('merged_previous_status = COALESCE(merged_previous_status, status)')
    expect(archive?.sql).toContain(
      'merged_previous_commercial_status = COALESCE(merged_previous_commercial_status, commercial_status)',
    )
    // La provenance : la date ET la source du geste.
    expect(archive?.sql).toContain('merged_at = now()')
    expect(archive?.params).toEqual(expect.arrayContaining(['a-adp', 'a-klesia', 'user-1']))
  })
})
