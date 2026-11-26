import { EVIDENCE_GAP_LABELS, EVIDENCE_REQUIREMENTS, NOT_NOW_REVALIDATION_DAYS } from '@bellum/contracts'
import { CrmRoutinesService, ownedAccountIdsSql } from './crm-routines.service'

/**
 * Le BARÈME DE PREUVE exigé À LA CRÉATION (addendum final p42-46).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT QUE CES TESTS FIGENT
 * ─────────────────────────────────────────────────────────────────────────────
 * `EVIDENCE_REQUIREMENTS.detected_project` exige plus qu'un signal isolé.
 * Cette routine insérait pourtant une PORTE — un contact repéré chez un nouvel
 * employeur par comparaison de LIBELLÉS, donc approximative — et l'écran la
 * comptait parmi ses « 383 projets détectés à reprendre », pour un seul projet
 * réellement au pipe. Le barème existait, il était juste, testé, et n'avait
 * AUCUN appelant.
 *
 * ⚠️ Le barème lui-même a été corrigé le 28/08/2026 (D27) : il demandait « deux
 * faits datés qui convergent », que la table `opportunities` ne peut pas
 * porter. La porte ne le franchit toujours pas — un fait que rien ne rattache à
 * un chantier reste un fait — mais le refus n'est plus universel.
 *
 * ⚠️ Ce que ces tests exigent AUSSI : que rien ne disparaisse. La porte est
 * toujours créée, sous sa nature `signal`, à son étape, consultable — c'est ce
 * que le tome 1 appelle « le plus rentable des six cas ». Ce qui change est ce
 * qu'elle PRÉTEND être, et le fait que le refus soit ÉCRIT.
 */
describe('CrmRoutinesService — openDoorFromMove', () => {
  function serviceWith(inserted: unknown) {
    const query = jest.fn().mockResolvedValue(inserted)
    const service = new CrmRoutinesService({ manager: { query } } as never)
    const log = jest.spyOn(service['logger'], 'log').mockImplementation(() => undefined)
    return { service, query, log }
  }

  const move = {
    full_name: 'Camille Roux',
    company_name: 'Ancien Client SA',
    new_employer: 'Nouvel Employeur SAS',
    known_since: '2024-03-01T00:00:00.000Z',
    new_account_id: 'acc-new',
    // #2845 — requis par `ContactMove` depuis l'ajout de `c.id AS contact_id`.
    contact_id: 'contact-1',
    account_id: 'acc-old',
  }

  afterEach(() => jest.restoreAllMocks())

  it('ouvre bien la porte : ce qui ne satisfait pas le barème ne DISPARAÎT pas', async () => {
    const { service, query } = serviceWith([{ id: 'op-1' }])

    await expect(service.openDoorFromMove('ws-1', move)).resolves.toBe(true)

    const [sql] = query.mock.calls[0] as [string, unknown[]]
    expect(sql).toContain('INSERT INTO opportunities')
    // Sa nature dit ce qu'elle est : un signal, pas un besoin.
    expect(sql).toContain("'signal'")
    // Son étape ne bouge pas — la règle de non-régression du §4 tient, et aucune
    // détection utile n'est éteinte au passage.
    expect(sql).toContain("'detected'")
    // Idempotence conservée : la routine tourne tous les mois.
    expect(sql).toContain('WHERE NOT EXISTS')
  })

  it('n’accorde à une porte que la confiance de sa preuve — un fait, pas un faisceau', async () => {
    const { service, query } = serviceWith([{ id: 'op-1' }])

    await service.openDoorFromMove('ws-1', move)

    const [sql, params] = query.mock.calls[0] as [string, unknown[]]
    expect(sql).toContain('confidence')
    // `low`, et non la confiance vide d'avant : un seul fait daté, obtenu par
    // comparaison de libellés.
    expect(params[6]).toBe('low')
  })

  it('écrit le refus — lisible, jamais silencieux, avec l’exigence du barème', async () => {
    const { service, log } = serviceWith([{ id: 'op-1' }])

    await service.openDoorFromMove('ws-1', move)

    expect(log).toHaveBeenCalledTimes(1)
    const message = String(log.mock.calls[0]?.[0])
    // L'exigence n'est PAS reformulée sur place : c'est celle du barème, mot
    // pour mot. Deux formulations divergeraient dès la première retouche.
    expect(message).toContain(EVIDENCE_REQUIREMENTS.detected_project.fr)
    // Ce qui manque est NOMMÉ, jamais chiffré : aucune probabilité, nulle part.
    // Depuis D27 (28/08/2026) le manque n'est plus « il faut un second fait »
    // — la table n'en porte jamais — mais « rien ne rattache ce fait à un
    // chantier ». C'est un manque que la porte peut réellement combler.
    expect(message).toContain(EVIDENCE_GAP_LABELS.unattached_fact.fr)
    expect(message).toContain('Camille Roux')
    expect(message).not.toMatch(/%/)
  })

  it('sans date de relation, il n’y a même pas de fait daté — et le mot change', async () => {
    const { service, log } = serviceWith([{ id: 'op-1' }])

    await service.openDoorFromMove('ws-1', { ...move, known_since: null })

    const message = String(log.mock.calls[0]?.[0])
    expect(message).toContain(EVIDENCE_GAP_LABELS.no_dated_fact.fr)
  })

  it('n’ouvre aucune porte sur un employeur qui n’est pas déjà suivi', async () => {
    const { service, query } = serviceWith([{ id: 'op-1' }])
    // Inventer une fiche sur un nom deviné est exactement ce que le dépôt
    // s'interdit : pas de compte connu, pas d'écriture du tout.
    await expect(service.openDoorFromMove('ws-1', { ...move, new_account_id: null })).resolves.toBe(false)
    expect(query).not.toHaveBeenCalled()
  })

  it('un doublon (rien inséré) ne compte pas comme une porte ouverte', async () => {
    const { service } = serviceWith([])
    await expect(service.openDoorFromMove('ws-1', move)).resolves.toBe(false)
  })

  it('une porte manquée ne fait jamais tomber les sept autres routines', async () => {
    const query = jest.fn().mockRejectedValue(new Error('boom'))
    const service = new CrmRoutinesService({ manager: { query } } as never)
    await expect(service.openDoorFromMove('ws-1', move)).resolves.toBe(false)
  })
})

/**
 * #2845 — `contact_to_verify` (`OUTREACH_SEQUENCE_PAUSE_EVENTS`) existait déjà
 * mais n'avait AUCUN appelant : `contactJobChange` détectait le contact qui a
 * peut-être changé de poste, mais ne suspendait aucune séquence. Cette
 * méthode répare le manque, même patron que `MailboxService.pauseSequencesForContact`.
 */
describe('CrmRoutinesService — pauseSequencesForJobChange', () => {
  it('#2845 : un contact SANS séquence active ne pause rien', async () => {
    const query = jest.fn().mockResolvedValue([])
    const service = new CrmRoutinesService({ manager: { query } } as never)

    await expect(service.pauseSequencesForJobChange('ws-1', 'contact-1')).resolves.toBe(0)
    // Une seule requête (la lecture/pause elle-même) : aucune ligne trouvée,
    // donc aucune transition à journaliser.
    expect(query).toHaveBeenCalledTimes(1)
  })

  it('#2845 : met en pause les séquences ACTIVES du contact et journalise la cause `contact_to_verify`', async () => {
    const paused = [{ id: 'seq-1', user_id: 'u-1', previous_status: 'active' }]
    const query = jest.fn().mockResolvedValueOnce(paused).mockResolvedValue(undefined)
    const service = new CrmRoutinesService({ manager: { query } } as never)

    await expect(service.pauseSequencesForJobChange('ws-1', 'contact-1')).resolves.toBe(1)

    const [pauseSql, pauseParams] = query.mock.calls[0] as [string, unknown[]]
    expect(pauseSql).toContain("SET status = 'paused'")
    expect(pauseSql).toContain("status = 'active'")
    // Pas de `updated_at` : `outreach_sequences` ne porte pas cette colonne.
    expect(pauseSql).not.toContain('updated_at')
    expect(pauseParams).toEqual(['contact-1', 'ws-1'])

    const [transitionSql, transitionParams] = query.mock.calls[1] as [string, unknown[]]
    expect(transitionSql).toContain('INSERT INTO outreach_transitions')
    expect(transitionSql).toContain("'sequence'")
    expect(transitionSql).toContain("'system'")
    // L'acteur est NULL : aucun humain précis n'a déclenché cette pause.
    expect(transitionParams).toEqual(['ws-1', 'u-1', 'seq-1', 'active'])
  })

  it('#2845 : une pause manquée ne fait jamais tomber les sept autres routines', async () => {
    const query = jest.fn().mockRejectedValue(new Error('boom'))
    const service = new CrmRoutinesService({ manager: { query } } as never)
    const error = jest.spyOn(service['logger'], 'error').mockImplementation(() => undefined)

    await expect(service.pauseSequencesForJobChange('ws-1', 'contact-1')).resolves.toBe(0)
    expect(error).toHaveBeenCalledTimes(1)
  })
})

/**
 * #3061 / #2374.19 — le point d'ancrage manquant que l'épopée nommait comme
 * son seul reste : rien ne faisait RESSURGIR d'elle-même une pause « pas
 * maintenant » à échéance. Cette lecture ne reprend rien — elle NOMME.
 */
describe('CrmRoutinesService — notNowDeferredsDue', () => {
  it('n’invente pas son seuil — 30 jours, la même constante que la fiche contact', async () => {
    const query = jest.fn().mockResolvedValue([])
    const service = new CrmRoutinesService({ manager: { query } } as never)

    await service.notNowDeferredsDue('ws-1')

    expect(NOT_NOW_REVALIDATION_DAYS).toBe(30)
    expect(query).toHaveBeenCalledWith(expect.any(String), ['ws-1', NOT_NOW_REVALIDATION_DAYS])
  })

  it('ne retient que la pause causée par `not_now_deferred`, jamais une autre cause', async () => {
    const query = jest.fn().mockResolvedValue([])
    const service = new CrmRoutinesService({ manager: { query } } as never)

    await service.notNowDeferredsDue('ws-1')

    const sql = query.mock.calls[0]?.[0] as string
    expect(sql).toContain("lp.cause = 'not_now_deferred'")
    // La plus RÉCENTE transition vers `paused`, pas n'importe laquelle : une
    // séquence pausée pour `not_now_deferred` puis réactivée puis re-pausée
    // pour une AUTRE cause ne doit pas resurgir sur l'ancienne cause.
    expect(sql).toContain('DISTINCT ON (subject_id)')
  })

  it('ne retient que les séquences ENCORE en pause — une reprise humaine la sort de la liste', async () => {
    const query = jest.fn().mockResolvedValue([])
    const service = new CrmRoutinesService({ manager: { query } } as never)

    await service.notNowDeferredsDue('ws-1')

    const sql = query.mock.calls[0]?.[0] as string
    expect(sql).toContain("s.status = 'paused'")
  })

  it('nomme poste_still_valid sur le lifecycle du contact — jamais un envoi, jamais une reprise', async () => {
    const query = jest
      .fn()
      .mockResolvedValue([{ sequence_id: 'seq-1', full_name: 'Nadia Berrada', poste_still_valid: true, days: 45 }])
    const service = new CrmRoutinesService({ manager: { query } } as never)

    const result = await service.notNowDeferredsDue('ws-1')

    expect(result).toEqual({
      measured: true,
      rows: [{ sequence_id: 'seq-1', full_name: 'Nadia Berrada', poste_still_valid: true, days: 45 }],
    })
    const sql = query.mock.calls[0]?.[0] as string
    expect(sql).toContain("c.lifecycle_state <> 'historique'")
    expect(sql).not.toMatch(/UPDATE|INSERT/i)
  })

  it('est bornée et ordonnée — la plus ancienne échéance d’abord', async () => {
    const query = jest.fn().mockResolvedValue([])
    const service = new CrmRoutinesService({ manager: { query } } as never)

    await service.notNowDeferredsDue('ws-1')

    const sql = query.mock.calls[0]?.[0] as string
    expect(sql).toContain('ORDER BY lp.occurred_at ASC')
    expect(sql).toContain('LIMIT 20')
  })
})

/**
 * LE MÊME PATRON, LA BONNE JOINTURE — les contacts rattachés à une ESN du
 * référentiel PARTAGÉ (`esn_directory`), que `contactsWhoMayHaveMoved` ne
 * voyait jamais parce qu'elle ne joint QUE `accounts`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE FICHIER FIGE
 * ─────────────────────────────────────────────────────────────────────────────
 * La requête des COMPTES ne bouge pas d'un caractère : `ORIGINAL_ACCOUNT_SQL`
 * est une copie exacte de ce qui existait avant ce chantier. Si ce test casse,
 * c'est que le chemin existant a changé — et c'est lui qu'il faut regarder, pas
 * ce fichier.
 *
 * ⚠️ LOT 17 — mise à jour VOLONTAIRE : `a.id AS account_id` s'est ajoutée en
 * fin de `SELECT` (colonne ADDITIVE, rien d'autre ne bouge) pour que
 * `copilot-bridge` applique le cloisonnement de portefeuille (D5) EN MÉMOIRE,
 * par identifiant plutôt que par le nom du compte. `ORIGINAL_ACCOUNT_SQL`
 * porte cette colonne pour rester une copie exacte de ce qui s'exécute
 * VRAIMENT — pas de ce qui s'exécutait avant ce chantier.
 *
 * ⚠️ #2845 — SECONDE mise à jour VOLONTAIRE, même patron : `c.id AS
 * contact_id` s'ajoute à son tour en fin de `SELECT` pour que
 * `contactJobChange` (routine-executors.ts) puisse mettre en pause les
 * séquences ACTIVES du contact détecté — chose que l'ancienne requête, sans
 * identifiant, ne permettait pas.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA FORME RÉELLE D'`esn_directory`
 * ─────────────────────────────────────────────────────────────────────────────
 * Table PARTAGÉE entre espaces, SANS `workspace_id` et SANS clé vers
 * `contacts` (voir son entité). Le seul pont documenté vers un compte
 * d'espace est le SIREN — `partner_relations.siren` le dit déjà : « un LIEN
 * vers `esn_directory`, pas une clé étrangère ». Le rattachement d'un contact
 * à une ESN passe donc par SON COMPTE SUIVI (`contacts.account_id ->
 * accounts`), dont le SIREN (`accounts.siren`) matche une entrée du
 * référentiel — jamais par une comparaison de libellés, qui se tromperait sur
 * les innombrables homonymies du secteur (« Sopra », « Sopra Steria », « Sopra
 * Steria Next »).
 */
describe('CrmRoutinesService — la même détection pour les contacts d’ESN', () => {
  /** Copie EXACTE de la requête des comptes — `account_id` (LOT 17) et
   *  `contact_id` (#2845) compris, jamais réécrite AUTREMENT par ce chantier. */
  const ORIGINAL_ACCOUNT_SQL = `SELECT c.full_name,
              a.company_name,
              c.raw_data -> 'apolloDetails' ->> 'organization' AS new_employer,
              c.created_at AS known_since,
              -- Le compte du NOUVEL employeur, s'il est déjà suivi. Une
              -- jointure sur le libellé, donc approximative : c'est pourquoi
              -- rien ne s'écrit sans elle, et pourquoi son absence ne crée
              -- jamais de compte — inventer une fiche sur un nom deviné est
              -- exactement ce que le dépôt s'interdit.
              (SELECT n.id FROM accounts n
                WHERE n.workspace_id = c.workspace_id
                  AND lower(n.company_name) = lower(c.raw_data -> 'apolloDetails' ->> 'organization')
                  AND n.status <> 'archived'
                LIMIT 1) AS new_account_id,
              -- LOT 17 — le compte SUIVI (pas le nouvel employeur ci-dessus) :
              -- l'identifiant dont copilot-bridge a besoin pour appliquer le
              -- cloisonnement de portefeuille EN MÉMOIRE, jamais par le NOM.
              a.id AS account_id,
              -- #2845 — l'identifiant du CONTACT, additif : contactJobChange
              -- en a besoin pour mettre en pause SES séquences actives.
              c.id AS contact_id
         FROM contacts c
         JOIN accounts a ON a.id = c.account_id
        WHERE c.workspace_id = $1
          AND c.deleted_at IS NULL
          AND c.excluded_at IS NULL
          AND c.raw_data -> 'apolloDetails' ->> 'organization' IS NOT NULL
          AND lower(c.raw_data -> 'apolloDetails' ->> 'organization') <> lower(a.company_name)
        ORDER BY c.last_enrichment_at DESC NULLS LAST
        LIMIT 20`

  const accountMove = {
    full_name: 'Camille Roux',
    company_name: 'Client Ordinaire SA',
    new_employer: 'Nouvel Employeur SAS',
    known_since: '2024-03-01T00:00:00.000Z',
    new_account_id: null,
    account_id: 'acc-1',
    // #2845 — requis par `ContactMove` depuis l'ajout de `c.id AS contact_id`.
    contact_id: 'contact-1',
  }
  const esnMove = {
    full_name: 'Sacha Martin',
    company_name: 'SII',
    new_employer: 'Sopra Steria',
    known_since: '2024-05-01T00:00:00.000Z',
    new_account_id: null,
    account_id: 'acc-2',
    contact_id: 'contact-2',
  }

  /** Un `manager.query` qui distingue les deux requêtes par leur TEXTE — la
   *  seule chose qui les différencie réellement, comme en production. */
  function serviceWith(byQuery: { account?: unknown[]; esn?: unknown[] } = {}) {
    const query = jest.fn().mockImplementation((sql: string) => {
      if (String(sql).includes('esn_directory')) return Promise.resolve(byQuery.esn ?? [])
      return Promise.resolve(byQuery.account ?? [])
    })
    const service = new CrmRoutinesService({ manager: { query } } as never)
    return { service, query }
  }

  it('la requête des COMPTES reste EXACTEMENT celle qui existait, au caractère près', async () => {
    const { service, query } = serviceWith({ account: [accountMove] })
    await service.contactsWhoMayHaveMoved('ws-1')
    const accountCall = query.mock.calls.find(call => !String(call[0]).includes('esn_directory'))
    expect(accountCall?.[0]).toBe(ORIGINAL_ACCOUNT_SQL)
    expect(accountCall?.[1]).toEqual(['ws-1'])
  })

  it('esnContactsWhoMayHaveMoved joint esn_directory par SIREN, pas par libellé', async () => {
    const { service, query } = serviceWith({ esn: [esnMove] })
    const { measured, rows } = await service.esnContactsWhoMayHaveMoved('ws-1')
    expect(measured).toBe(true)
    expect(rows).toEqual([esnMove])
    const esnCall = query.mock.calls.find(call => String(call[0]).includes('esn_directory'))
    const sql = String(esnCall?.[0])
    expect(sql).toMatch(/JOIN esn_directory e ON e\.siren = a\.siren/)
    expect(sql).toMatch(/a\.siren IS NOT NULL/)
    // La MÊME base que la requête des comptes — même sélection, même exclusion
    // des fiches effacées ou exclues — et non une requête réinventée.
    expect(sql).toContain('FROM contacts c')
    expect(sql).toContain('JOIN accounts a ON a.id = c.account_id')
    expect(sql).toContain('c.deleted_at IS NULL')
    expect(esnCall?.[1]).toEqual(['ws-1'])
  })

  it('contactsWhoMayHaveMoved FUSIONNE les deux populations — comptes ET ESN', async () => {
    const { service } = serviceWith({ account: [accountMove], esn: [esnMove] })
    const { measured, rows } = await service.contactsWhoMayHaveMoved('ws-1')
    expect(measured).toBe(true)
    expect(rows).toEqual(expect.arrayContaining([accountMove, esnMove]))
    expect(rows).toHaveLength(2)
  })

  it('UNE MÊME PERSONNE ne produit jamais deux signaux — le signal ESN gagne', async () => {
    // Le même contact : son compte suivi EST une ESN, donc les deux requêtes le
    // trouvent avec la MÊME identité (nom, compte, nouvel employeur) — la
    // requête des comptes ne l'excluait déjà pas, et la jointure ESN ne fait
    // qu'ajouter une qualification, pas une population disjointe. Sans
    // dédoublonnage, la routine annoncerait « 2 contacts à vérifier » pour une
    // seule personne. `known_since` diverge ici pour rendre le choix du
    // gagnant OBSERVABLE — en production les deux lectures portent la même
    // valeur, prise à la même seconde sur la même ligne `contacts`.
    const sameContactViaEsn = { ...accountMove, known_since: '2024-05-01T00:00:00.000Z' }
    const { service } = serviceWith({ account: [accountMove], esn: [sameContactViaEsn] })
    const { rows } = await service.contactsWhoMayHaveMoved('ws-1')
    expect(rows).toHaveLength(1)
    // Le signal ESN gagne : c'est celui qui vaut le plus sur le second marché
    // (l'énoncé du chantier), et en cas de divergence future des deux
    // jointures, perdre cette qualification serait perdre l'information la
    // plus utile.
    expect(rows[0]).toEqual(sameContactViaEsn)
  })

  it('un espace sans aucun signal ESN reste identique à avant ce chantier', async () => {
    const { service } = serviceWith({ account: [accountMove], esn: [] })
    const { rows } = await service.contactsWhoMayHaveMoved('ws-1')
    expect(rows).toEqual([accountMove])
  })
})

/**
 * GA-196 — une lecture de routine CRM en échec ne se rend JAMAIS comme une
 * liste vide (D715, 30/08/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT
 * ─────────────────────────────────────────────────────────────────────────────
 * `rows()` attrapait toute erreur SQL et rendait `[]` — l'EXACTE même valeur
 * qu'un vrai zéro. « aucun contact n'a changé de poste » et « la requête vient
 * de casser » produisaient la même phrase à l'écran Réglages › Routines. C'est
 * le défaut nommé « cassé et non mesurable se ressemblent » : un verdict ne se
 * conclut pas d'un silence.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CES TESTS PROUVENT
 * ─────────────────────────────────────────────────────────────────────────────
 * Chaque lecture publique rend désormais `{ measured, rows }` : `measured` dit
 * si la requête a ABOUTI, indépendamment de si `rows` est vide. Et la
 * RÉSILIENCE du §13 ne recule pas : `contactsWhoMayHaveMoved` combine deux
 * requêtes (comptes + ESN) — si une seule casse, ce que l'autre a mesuré
 * SORT quand même, ce n'est pas jeté au nom de la prudence.
 */
describe('CrmRoutinesService — une lecture non mesurée n’est jamais rendue comme un vrai zéro (GA-196)', () => {
  function serviceThatRejects(message = 'relation "opportunities" does not exist') {
    const query = jest.fn().mockRejectedValue(new Error(message))
    const service = new CrmRoutinesService({ manager: { query } } as never)
    const error = jest.spyOn(service['logger'], 'error').mockImplementation(() => undefined)
    return { service, query, error }
  }

  afterEach(() => jest.restoreAllMocks())

  it('stalledProjects : une requête cassée rend measured=false, jamais measured=true avec rows=[]', async () => {
    const { service } = serviceThatRejects()
    const result = await service.stalledProjects('ws-1')
    expect(result).toEqual({ measured: false, rows: [] })
  })

  it('staleAccountPlans : même distinction', async () => {
    const { service } = serviceThatRejects()
    expect(await service.staleAccountPlans('ws-1')).toEqual({ measured: false, rows: [] })
  })

  it('needsWithoutShortlist : même distinction', async () => {
    const { service } = serviceThatRejects()
    expect(await service.needsWithoutShortlist('ws-1')).toEqual({ measured: false, rows: [] })
  })

  it('accountsDueForReexamination : le filtre après-coup ne réintroduit pas measured=true', async () => {
    const { service } = serviceThatRejects()
    expect(await service.accountsDueForReexamination('ws-1')).toEqual({ measured: false, rows: [] })
  })

  it('parkedAccountsWithSignal : le filtre après-coup ne réintroduit pas measured=true', async () => {
    const { service } = serviceThatRejects()
    expect(await service.parkedAccountsWithSignal('ws-1')).toEqual({ measured: false, rows: [] })
  })

  it('esnContactsWhoMayHaveMoved : même distinction', async () => {
    const { service } = serviceThatRejects()
    expect(await service.esnContactsWhoMayHaveMoved('ws-1')).toEqual({ measured: false, rows: [] })
  })

  it('notNowDeferredsDue : même distinction (#3061)', async () => {
    const { service } = serviceThatRejects()
    expect(await service.notNowDeferredsDue('ws-1')).toEqual({ measured: false, rows: [] })
  })

  it('une lecture RÉUSSIE et VRAIMENT vide reste measured=true — le cas normal ne change pas', async () => {
    const query = jest.fn().mockResolvedValue([])
    const service = new CrmRoutinesService({ manager: { query } } as never)
    expect(await service.stalledProjects('ws-1')).toEqual({ measured: true, rows: [] })
  })

  it('l’échec est JOURNALISÉ via logger.error — jamais Sentry direct, convention du dépôt', async () => {
    const { service, error } = serviceThatRejects('relation "opportunities" does not exist')
    await service.stalledProjects('ws-1')
    expect(error).toHaveBeenCalledTimes(1)
    const [message, meta] = error.mock.calls[0] as [string, { error: unknown }]
    // Le message ne recopie ni jeton ni e-mail — l'exception SQL du driver
    // Postgres n'en porte jamais, et rien ici n'invente de secret à journaliser.
    expect(String(message)).not.toMatch(/token|bearer|password|api[_-]?key/i)
    expect(meta.error).toBeInstanceOf(Error)
  })

  it('RÉSILIENCE (§13) : contactsWhoMayHaveMoved garde ce que la moitié qui a marché a trouvé', async () => {
    // La requête ESN casse, celle des comptes réussit : measured passe à
    // `false` (l'image est incomplète) mais la ligne COMPTES trouvée n'est PAS
    // jetée — cinq automatisations, une casse, les quatre autres (et la
    // moitié mesurée ICI) sortent quand même.
    const query = jest.fn().mockImplementation((sql: string) => {
      if (String(sql).includes('esn_directory')) return Promise.reject(new Error('boom'))
      return Promise.resolve([accountMoveFixture])
    })
    const service = new CrmRoutinesService({ manager: { query } } as never)
    jest.spyOn(service['logger'], 'error').mockImplementation(() => undefined)

    const { measured, rows } = await service.contactsWhoMayHaveMoved('ws-1')
    expect(measured).toBe(false)
    expect(rows).toEqual([accountMoveFixture])
  })

  it('RÉSILIENCE (§13) : et inversement, quand c’est la requête des COMPTES qui casse', async () => {
    const query = jest.fn().mockImplementation((sql: string) => {
      if (String(sql).includes('esn_directory')) return Promise.resolve([esnMoveFixture])
      return Promise.reject(new Error('boom'))
    })
    const service = new CrmRoutinesService({ manager: { query } } as never)
    jest.spyOn(service['logger'], 'error').mockImplementation(() => undefined)

    const { measured, rows } = await service.contactsWhoMayHaveMoved('ws-1')
    expect(measured).toBe(false)
    expect(rows).toEqual([esnMoveFixture])
  })

  it('les DEUX moitiés mesurées : measured=true, comme avant ce chantier', async () => {
    const query = jest.fn().mockImplementation((sql: string) => {
      if (String(sql).includes('esn_directory')) return Promise.resolve([esnMoveFixture])
      return Promise.resolve([accountMoveFixture])
    })
    const service = new CrmRoutinesService({ manager: { query } } as never)
    const { measured } = await service.contactsWhoMayHaveMoved('ws-1')
    expect(measured).toBe(true)
  })
})

/**
 * #2782 / #2392.6 — LA REVUE HEBDOMADAIRE COMPLÈTE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE MANQUE
 * ─────────────────────────────────────────────────────────────────────────────
 * `weekly_recap` (routine-executors.ts) ne comptait que les rendez-vous
 * TENUS — alors que le catalogue (routine-catalog.ts) promet « tes actions de
 * la semaine et l'état de tes comptes ». Un rendez-vous tenu n'est pas une
 * DÉCISION obtenue : ces deux lectures apportent le signal qui manquait,
 * « dossiers réellement avancés » et « décisions obtenues » du besoin
 * (#2392 LAU-FINAL-106) — jamais un compte d'emails, de clics ou d'actions
 * (#2392.7, doctrine « pas de vanity metrics »).
 *
 * `projectsDecidedThisWeek` lit `DECIDED_STAGES` (won/lost) — jamais une
 * probabilité ni un prévisionnel pondéré, juste ce qui s'est RÉELLEMENT
 * conclu. `projectsExpectedToCloseSoon` lit `expected_close_on`, une date
 * SAISIE par le commercial — jamais une date devinée ni une pondération : si
 * personne ne l'a saisie, la routine le DIT plutôt que de fabriquer un
 * forecast (#2392.8).
 */
describe('CrmRoutinesService — la revue hebdomadaire (#2782, #2392.6)', () => {
  function serviceOver(rows: unknown[]) {
    const query = jest.fn().mockResolvedValue(rows)
    return { service: new CrmRoutinesService({ manager: { query } } as never), query }
  }

  describe('openNeeds — les besoins ENCORE ouverts, séparés des dossiers décidés', () => {
    it('rend les besoins ouverts de l’espace', async () => {
      const rows = [{ title: 'Lead dev React — Client Ordinaire' }, { title: 'DevOps senior — Acme' }]
      const { service } = serviceOver(rows)
      const result = await service.openNeeds('ws-1')
      expect(result).toEqual({ measured: true, rows })
    })

    it('passe l’espace à la requête', async () => {
      const { service, query } = serviceOver([])
      await service.openNeeds('ws-1')
      expect(query).toHaveBeenCalledWith(expect.any(String), ['ws-1'])
    })

    it('measured=false sur une lecture cassée — jamais confondue avec « aucun besoin ouvert »', async () => {
      const query = jest.fn().mockRejectedValue(new Error('relation "project_needs" does not exist'))
      const service = new CrmRoutinesService({ manager: { query } } as never)
      jest.spyOn(service['logger'], 'error').mockImplementation(() => undefined)
      const result = await service.openNeeds('ws-1')
      expect(result).toEqual({ measured: false, rows: [] })
    })
  })

  describe('projectsDecidedThisWeek — les décisions RÉELLEMENT obtenues', () => {
    it('rend les dossiers gagnés et perdus depuis la date donnée', async () => {
      const rows = [
        { label: 'Refonte SI paiement', stage: 'won' },
        { label: 'Migration ERP', stage: 'lost' },
      ]
      const { service } = serviceOver(rows)
      const result = await service.projectsDecidedThisWeek('ws-1', new Date('2026-09-18T00:00:00.000Z'))
      expect(result).toEqual({ measured: true, rows })
    })

    it('passe l’espace ET la date plancher à la requête, jamais une seule', async () => {
      const { service, query } = serviceOver([])
      const since = new Date('2026-09-18T00:00:00.000Z')
      await service.projectsDecidedThisWeek('ws-1', since)
      expect(query).toHaveBeenCalledWith(expect.any(String), ['ws-1', since.toISOString()])
    })

    it('measured=false sur une lecture cassée — jamais confondue avec « aucune décision »', async () => {
      const query = jest.fn().mockRejectedValue(new Error('relation "opportunities" does not exist'))
      const service = new CrmRoutinesService({ manager: { query } } as never)
      jest.spyOn(service['logger'], 'error').mockImplementation(() => undefined)
      const result = await service.projectsDecidedThisWeek('ws-1', new Date())
      expect(result).toEqual({ measured: false, rows: [] })
    })
  })

  describe('projectsExpectedToCloseSoon — le forecast se PRÉPARE, il ne se fabrique pas (#2392.8)', () => {
    it('rend les dossiers OUVERTS dont l’échéance saisie tombe dans la fenêtre', async () => {
      const rows = [{ label: 'Refonte SI paiement', stage: 'negotiation', expected_close_on: '2026-09-22' }]
      const { service } = serviceOver(rows)
      const result = await service.projectsExpectedToCloseSoon(
        'ws-1',
        new Date('2026-09-18T00:00:00.000Z'),
        new Date('2026-09-25T00:00:00.000Z'),
      )
      expect(result).toEqual({ measured: true, rows })
    })

    it('measured=false sur une lecture cassée — jamais confondue avec « rien à prévoir »', async () => {
      const query = jest.fn().mockRejectedValue(new Error('relation "opportunities" does not exist'))
      const service = new CrmRoutinesService({ manager: { query } } as never)
      jest.spyOn(service['logger'], 'error').mockImplementation(() => undefined)
      const result = await service.projectsExpectedToCloseSoon('ws-1', new Date(), new Date())
      expect(result).toEqual({ measured: false, rows: [] })
    })
  })
})

const accountMoveFixture = {
  full_name: 'Camille Roux',
  company_name: 'Client Ordinaire SA',
  new_employer: 'Nouvel Employeur SAS',
  known_since: '2024-03-01T00:00:00.000Z',
  new_account_id: null,
  // #2845 — requis par `ContactMove` depuis l'ajout de `c.id AS contact_id`.
  contact_id: 'contact-1',
}

const esnMoveFixture = {
  full_name: 'Sacha Martin',
  company_name: 'SII',
  new_employer: 'Sopra Steria',
  known_since: '2024-05-01T00:00:00.000Z',
  new_account_id: null,
  contact_id: 'contact-2',
}

/**
 * LOT 17 — `ownedAccountIdsSql`, EXPORTÉE pour la même raison que les deux
 * requêtes de mouvement : `copilot-bridge` doit pouvoir l'exécuter sur SON
 * PROPRE repository, et la preuve qui compte est qu'elle S'EXÉCUTE — pas
 * qu'une copie la recopie. Figée au caractère près, comme les deux autres.
 */
describe('ownedAccountIdsSql — le cloisonnement de portefeuille (D5)', () => {
  it('même prédicat que chains.service.ts (OWNER_SUBJECT_SQL.account) : assigned_to = $2 OU ($3 ET NULL)', () => {
    expect(ownedAccountIdsSql()).toBe(
      `SELECT id::text AS id
         FROM accounts
        WHERE workspace_id = $1
          AND (assigned_to = $2 OR ($3 AND assigned_to IS NULL))`,
    )
  })
})
