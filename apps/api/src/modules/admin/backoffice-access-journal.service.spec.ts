import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  BackofficeAccessJournalService,
  calculerEtatSecurite,
  estHeureInhabituelle,
  type EvenementJournal,
} from './backoffice-access-journal.service'
import { BackofficeAccessEventEntity } from '../../database/entities/backoffice-access-event.entity'
import { createMockRepository, type MockRepository } from '../../database/test-utils'
import type { AuditJournalService } from './audit-journal.service'

/**
 * Le journal d'accès du back-office (#1671.2).
 *
 * CE QUE CES TESTS TIENNENT, ET POURQUOI CHACUN EXISTE
 * L'issue demande « qui s'est connecté, quand, depuis quelle IP, quel
 * navigateur — rétention 12 mois ». Trois pièges se cachent dans cette phrase,
 * et ce sont eux qu'on garde :
 *  · une TRACE ne doit pas devenir une PORTE — un `INSERT` en échec ne peut pas
 *    fermer la console à un opérateur ;
 *  · une lacune n'est pas un fait — `ip`/`country` absents restent `null` ;
 *  · l'historique des pays ne se construit que sur des connexions RÉUSSIES,
 *    sans quoi la première tentative depuis un pays inhabituel apprendrait ce
 *    pays et éteindrait l'alerte qu'elle aurait dû déclencher (#1671.3).
 */
describe('BackofficeAccessJournalService (#1671.2)', () => {
  let repo: MockRepository<BackofficeAccessEventEntity>
  let service: BackofficeAccessJournalService

  beforeEach(() => {
    repo = createMockRepository<BackofficeAccessEventEntity>()
    service = new BackofficeAccessJournalService(repo as never)
  })

  it('LIT quelque chose — une entrée complète est écrite telle qu’elle arrive', async () => {
    await service.record({
      event: 'connexion',
      actorEmail: 'ops@bellum-it.com',
      actorRole: 'owner',
      ip: '203.0.113.7',
      userAgent: 'Mozilla/5.0',
      country: 'FR',
    })

    expect(repo.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'connexion',
        actor_email: 'ops@bellum-it.com',
        actor_role: 'owner',
        ip: '203.0.113.7',
        user_agent: 'Mozilla/5.0',
        country: 'FR',
      }),
    )
  })

  it('une LACUNE reste une lacune — jamais « inconnu »', async () => {
    await service.record({ event: 'connexion_refusee', actorEmail: 'x@y.fr' })

    // Écrire `'inconnu'` ferait d'une absence un fait, et l'alerte « pays
    // inhabituel » compterait `'inconnu'` comme un pays de plus.
    expect(repo.insert).toHaveBeenCalledWith(
      expect.objectContaining({ ip: null, user_agent: null, country: null, actor_role: null }),
    )
  })

  it('SAIT DIRE NON à sa propre panne — un INSERT en échec ne ferme pas la console', async () => {
    ;(repo.insert as jest.Mock).mockRejectedValue(new Error('table indisponible'))

    // Une trace n'est pas une porte : la promesse ne rejette pas.
    await expect(service.record({ event: 'connexion', actorEmail: 'ops@bellum-it.com' })).resolves.toBeUndefined()
  })

  it('la lecture est BORNÉE — `?limit=999999` ne sort pas la table entière', async () => {
    ;(repo.find as jest.Mock).mockResolvedValue([])

    await service.recent(999_999)
    expect(repo.find).toHaveBeenCalledWith(expect.objectContaining({ take: 200 }))

    await service.recent(0)
    expect(repo.find).toHaveBeenLastCalledWith(expect.objectContaining({ take: 1 }))

    await service.recent(25)
    expect(repo.find).toHaveBeenLastCalledWith(expect.objectContaining({ take: 25 }))
  })

  it('compte les échecs D’UNE adresse sur une fenêtre — la mesure de l’alerte (#1671.3)', async () => {
    ;(repo.count as jest.Mock).mockResolvedValue(4)
    const depuis = new Date('2026-09-07T10:00:00Z')

    await expect(service.countRecentFailures('ops@bellum-it.com', depuis)).resolves.toBe(4)
    const where = (repo.count as jest.Mock).mock.calls[0][0].where
    expect(where.actor_email).toBe('ops@bellum-it.com')
    // ⚠️ Ne compte QUE les refus : compter aussi les réussites ferait qu'une
    // séance de travail normale déclencherait l'alerte.
    expect(where.event).toBe('connexion_refusee')
  })

  it('la purge supprime au-delà de la fenêtre, et rend ce qu’elle a supprimé', async () => {
    ;(repo.delete as jest.Mock).mockResolvedValue({ affected: 12 })
    await expect(service.purgeOlderThan(new Date('2025-09-07T00:00:00Z'))).resolves.toBe(12)

    // `affected` absent ne vaut pas « rien à purger » côté appelant : on rend 0
    // parce qu'on n'a rien pu compter, et c'est le journal qui le dira.
    ;(repo.delete as jest.Mock).mockResolvedValue({})
    await expect(service.purgeOlderThan(new Date())).resolves.toBe(0)
  })
})

/**
 * LE MIROIR VERS LE JOURNAL UNIQUE (#1666) — les deux moitiés.
 *
 * ⚠️ Une seule des deux ne suffit pas, et le dépôt l'a déjà payé : `CostAlertService`
 * appelait bien `withSingletonLock`, mais son module ne fournissait rien — le
 * code était juste, le CÂBLAGE manquait, et tous ses tests étaient verts. On
 * vérifie donc que le service MIROITE, et que le module FOURNIT de quoi
 * miroiter.
 */
describe('Le journal d’accès miroite dans le journal d’audit (#1666)', () => {
  let repo: MockRepository<BackofficeAccessEventEntity>
  let audit: { record: jest.Mock }
  let service: BackofficeAccessJournalService

  beforeEach(() => {
    repo = createMockRepository<BackofficeAccessEventEntity>()
    audit = { record: jest.fn().mockResolvedValue(undefined) }
    service = new BackofficeAccessJournalService(repo as never, audit as unknown as AuditJournalService)
  })

  it('une connexion écrit DANS LES DEUX journaux', async () => {
    await service.record({ event: 'connexion', actorEmail: 'ops@bellum-it.com', actorRole: 'owner', country: 'FR' })

    expect(repo.insert).toHaveBeenCalled()
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ operation: 'backoffice.connexion', category: 'ordinaire', outcome: 'succes' }),
    )
  })

  it('`email_revele` n’est PAS miroité — il a son propre écrivain, plus riche', async () => {
    await service.record({ event: 'email_revele', actorEmail: 'ops@bellum-it.com', target: '/clients' })

    expect(repo.insert).toHaveBeenCalled()
    expect(audit.record).not.toHaveBeenCalled()
  })

  it('SAIT DIRE NON à la panne du miroir — le journal d’accès s’écrit quand même', async () => {
    audit.record.mockRejectedValue(new Error('journal d’audit indisponible'))

    await expect(service.record({ event: 'connexion', actorEmail: 'x@y.fr' })).resolves.toBeUndefined()
    // L'alerte de #1671.3 compte des lignes de CE journal : une panne du miroir
    // ne doit pas l'éteindre.
    expect(repo.insert).toHaveBeenCalled()
  })

  it('SANS journal d’audit, le comportement d’avant, à l’octet près', async () => {
    const seul = new BackofficeAccessJournalService(repo as never)
    await expect(seul.record({ event: 'deconnexion', actorEmail: 'x@y.fr' })).resolves.toBeUndefined()
    expect(repo.insert).toHaveBeenCalled()
  })

  it('le module FOURNIT vraiment le miroir — un `@Optional()` non résolu dégrade en SILENCE', () => {
    const source = readFileSync(join(__dirname, 'backoffice-access-journal.module.ts'), 'utf8')
    expect(source).toContain('AuditJournalModule')
    // Le tableau `imports`, pas la ligne `import` : c'est exactement là que la
    // première version de GA-76 était née borgne.
    //
    // ⚠️ `[\s\S]{0,300}?` et NON `[^\]]*` : le tableau contient déjà
    // `TypeOrmModule.forFeature([…])`, donc un `]` avant la fin — un motif qui
    // s'arrête au premier crochet fermant ne verrait jamais ce qui suit.
    expect(/@Module\(\{[\s\S]{0,300}?imports:[\s\S]{0,300}?AuditJournalModule/.test(source)).toBe(true)
  })
})

/**
 * `knownCountries` ACCEPTE MAINTENANT UN `avant` — #1671.3.
 *
 * ⚠️ Extension, pas réécriture. La signature d'origine (sans second argument)
 * doit rester intacte — le test « les pays d'où cette adresse s'est déjà
 * connectée » plus haut ne passe qu'un seul argument, et il reste vert.
 * `avant` sert à demander « les pays connus AVANT cet instant », ce dont la
 * détection d'un pays jamais vu a besoin : `knownCountries(actor)` tout seul
 * inclut la connexion qu'on est justement en train de juger.
 */
describe('`knownCountries` avec `avant` — les pays connus À UN INSTANT (#1671.3)', () => {
  it('sans `avant`, le comportement est inchangé — un seul WHERE, pas de borne de date', async () => {
    const repo = createMockRepository<BackofficeAccessEventEntity>()
    repo._qb.getRawMany.mockResolvedValue([{ country: 'FR' }])
    const service = new BackofficeAccessJournalService(repo as never)

    await expect(service.knownCountries('ops@bellum-it.com')).resolves.toEqual(['FR'])
    expect(repo._qb.andWhere).not.toHaveBeenCalledWith(expect.stringContaining('avant'), expect.anything())
  })

  it('avec `avant`, seules les connexions STRICTEMENT antérieures comptent', async () => {
    const repo = createMockRepository<BackofficeAccessEventEntity>()
    repo._qb.getRawMany.mockResolvedValue([{ country: 'FR' }])
    const service = new BackofficeAccessJournalService(repo as never)
    const avant = new Date('2026-09-07T10:00:00Z')

    await service.knownCountries('ops@bellum-it.com', avant)

    expect(repo._qb.andWhere).toHaveBeenCalledWith('e.created_at < :avant', { avant })
  })
})

describe('`oldestEntryAt` — la plus ancienne entrée ENCORE présente (#1671.4)', () => {
  it('rend la date la plus ancienne du journal', async () => {
    const repo = createMockRepository<BackofficeAccessEventEntity>()
    repo._qb.getRawOne.mockResolvedValue({ min: '2025-09-08T00:00:00.000Z' })
    const service = new BackofficeAccessJournalService(repo as never)

    const resultat = await service.oldestEntryAt()
    expect(resultat).toEqual(new Date('2025-09-08T00:00:00.000Z'))
  })

  it('rend `null` — jamais une date inventée — quand le journal est vide', async () => {
    const repo = createMockRepository<BackofficeAccessEventEntity>()
    repo._qb.getRawOne.mockResolvedValue({ min: null })
    const service = new BackofficeAccessJournalService(repo as never)

    await expect(service.oldestEntryAt()).resolves.toBeNull()
  })
})

/**
 * `estHeureInhabituelle` — le TROISIÈME signal de #1671.3, celui qui n'existait
 * pas. Fenêtre : 1 h – 6 h, heure de PARIS (jamais celle du serveur, qui tourne
 * en UTC sur Railway — voir `lib/dates.ts` côté console pour le même défaut,
 * déjà payé trois fois en production).
 *
 * ⚠️ Les horaires sont choisis pour croiser les DEUX décalages de Paris :
 * janvier (UTC+1, heure d'hiver) et juillet (UTC+2, heure d'été). Un test qui
 * ne couvrirait que l'un des deux laisserait un bascule de DST invisible.
 */
describe('estHeureInhabituelle — la fenêtre 1 h – 6 h, heure de Paris (#1671.3)', () => {
  it('signale une connexion en pleine nuit, hiver (UTC+1) et été (UTC+2)', () => {
    expect(estHeureInhabituelle(new Date('2026-01-15T02:30:00Z'))).toBe(true) // 03:30 Paris
    expect(estHeureInhabituelle(new Date('2026-07-15T01:30:00Z'))).toBe(true) // 03:30 Paris
  })

  it('la borne BASSE (1 h) est incluse', () => {
    expect(estHeureInhabituelle(new Date('2026-01-15T00:00:00Z'))).toBe(true) // 01:00 Paris pile
  })

  it('la borne HAUTE (6 h) est exclue — 6 h du matin n’est plus la nuit', () => {
    expect(estHeureInhabituelle(new Date('2026-01-15T05:00:00Z'))).toBe(false) // 06:00 Paris pile
    expect(estHeureInhabituelle(new Date('2026-07-15T04:00:00Z'))).toBe(false) // 06:00 Paris pile (été)
  })

  it('minuit n’est PAS une heure inhabituelle — seule la tranche 1 h–6 h l’est', () => {
    expect(estHeureInhabituelle(new Date('2026-01-14T23:00:00Z'))).toBe(false) // 00:00 Paris
  })

  it('une connexion de journée n’est jamais signalée', () => {
    expect(estHeureInhabituelle(new Date('2026-01-15T10:00:00Z'))).toBe(false) // 11:00 Paris
    expect(estHeureInhabituelle(new Date('2026-07-15T08:00:00Z'))).toBe(false) // 10:00 Paris (été)
  })
})

/**
 * `calculerEtatSecurite` — la fonction PURE qui assemble les trois signaux de
 * #1671.3 (rafale d'échecs, pays jamais vu, heure inhabituelle) et les
 * compteurs de l'écran `/securite` de #1671.4. Tout est déjà fetché en entrée :
 * aucune horloge lue, aucune requête — c'est ce qui permet de tester les
 * endroits où un mensonge pourrait s'écrire, sans mock de base de données.
 */
describe('calculerEtatSecurite — les trois signaux de #1671.3, assemblés (#1671.4)', () => {
  const evt = (
    partial: Partial<EvenementJournal> & Pick<EvenementJournal, 'event' | 'created_at'>,
  ): EvenementJournal => ({
    id: partial.id ?? `id-${partial.created_at.toISOString()}-${Math.random()}`,
    actor_email: partial.actor_email ?? null,
    actor_role: partial.actor_role ?? null,
    reason: partial.reason ?? null,
    detail: partial.detail ?? null,
    ip: partial.ip ?? null,
    user_agent: partial.user_agent ?? null,
    country: partial.country ?? null,
    target: partial.target ?? null,
    ...partial,
  })

  const now = new Date('2026-09-07T12:00:00Z')
  const depuis = new Date('2026-08-08T12:00:00Z')

  it('« non mesuré » n’est jamais « 0 anomalie » — un journal VIDE le dit', () => {
    const etat = calculerEtatSecurite({
      evenements: [],
      oldestEntryAt: null,
      echecsRecents: new Map(),
      paysConnusAvant: new Map(),
      fenetreJours: 30,
      depuis,
      now,
    })
    expect(etat.mesure).toBe(false)
    expect(etat.total).toBe(0)
    expect(etat.anomalies).toEqual([])
    expect(etat.oldestEntryAt).toBeNull()
  })

  it('une fenêtre avec des événements EST mesurée, même sans aucune anomalie', () => {
    const etat = calculerEtatSecurite({
      evenements: [
        evt({
          event: 'connexion',
          actor_email: 'ops@bellum-it.com',
          created_at: new Date('2026-09-07T09:00:00Z'),
          country: 'FR',
        }),
      ],
      oldestEntryAt: new Date('2025-09-08T00:00:00Z'),
      echecsRecents: new Map(),
      paysConnusAvant: new Map(),
      fenetreJours: 30,
      depuis,
      now,
    })
    expect(etat.mesure).toBe(true)
    expect(etat.total).toBe(1)
    expect(etat.anomalies).toEqual([])
  })

  it('signale UNE rafale d’échecs — plus de 3, jamais 3 pile', () => {
    const acteur = 'ops@bellum-it.com'
    const refus = evt({ event: 'connexion_refusee', actor_email: acteur, created_at: new Date('2026-09-07T11:50:00Z') })

    const avecQuatre = calculerEtatSecurite({
      evenements: [refus],
      oldestEntryAt: null,
      echecsRecents: new Map([[acteur, 4]]),
      paysConnusAvant: new Map(),
      fenetreJours: 30,
      depuis,
      now,
    })
    expect(avecQuatre.anomalies).toHaveLength(1)
    expect(avecQuatre.anomalies[0]).toMatchObject({ type: 'rafale_echecs', actorEmail: acteur })

    // « plus de 3 » exclut 3 pile — c'est le mot exact du docblock de
    // `countRecentFailures`.
    const avecTrois = calculerEtatSecurite({
      evenements: [refus],
      oldestEntryAt: null,
      echecsRecents: new Map([[acteur, 3]]),
      paysConnusAvant: new Map(),
      fenetreJours: 30,
      depuis,
      now,
    })
    expect(avecTrois.anomalies).toEqual([])
  })

  it('ne signale une rafale QU’UNE fois par acteur, même avec plusieurs lignes de refus', () => {
    const acteur = 'ops@bellum-it.com'
    const evenements = [
      evt({ event: 'connexion_refusee', actor_email: acteur, created_at: new Date('2026-09-07T11:50:00Z') }),
      evt({ event: 'connexion_refusee', actor_email: acteur, created_at: new Date('2026-09-07T11:52:00Z') }),
    ]
    const etat = calculerEtatSecurite({
      evenements,
      oldestEntryAt: null,
      echecsRecents: new Map([[acteur, 5]]),
      paysConnusAvant: new Map(),
      fenetreJours: 30,
      depuis,
      now,
    })
    expect(etat.anomalies.filter(a => a.type === 'rafale_echecs')).toHaveLength(1)
  })

  it('signale un PAYS JAMAIS VU sur la dernière connexion réussie d’un acteur', () => {
    const acteur = 'ops@bellum-it.com'
    const connexion = evt({
      event: 'connexion',
      actor_email: acteur,
      created_at: new Date('2026-09-07T11:00:00Z'),
      country: 'DE',
    })
    const etat = calculerEtatSecurite({
      evenements: [connexion],
      oldestEntryAt: null,
      echecsRecents: new Map(),
      paysConnusAvant: new Map([[acteur, ['FR', 'ES']]]),
      fenetreJours: 30,
      depuis,
      now,
    })
    expect(etat.anomalies).toHaveLength(1)
    expect(etat.anomalies[0]).toMatchObject({ type: 'pays_inhabituel', actorEmail: acteur })
    expect(etat.anomalies[0]?.detail).toContain('DE')
  })

  it('NE signale RIEN quand il n’y a aucune ligne de base — un premier accès n’a pas de « pays habituel »', () => {
    const acteur = 'nouvel-operateur@bellum-it.com'
    const connexion = evt({
      event: 'connexion',
      actor_email: acteur,
      created_at: new Date('2026-09-07T11:00:00Z'),
      country: 'FR',
    })
    const etat = calculerEtatSecurite({
      evenements: [connexion],
      oldestEntryAt: null,
      echecsRecents: new Map(),
      paysConnusAvant: new Map([[acteur, []]]), // aucune ligne de base connue
      fenetreJours: 30,
      depuis,
      now,
    })
    expect(etat.anomalies).toEqual([])
  })

  it('ne signale PAS un pays déjà connu', () => {
    const acteur = 'ops@bellum-it.com'
    const connexion = evt({
      event: 'connexion',
      actor_email: acteur,
      created_at: new Date('2026-09-07T11:00:00Z'),
      country: 'FR',
    })
    const etat = calculerEtatSecurite({
      evenements: [connexion],
      oldestEntryAt: null,
      echecsRecents: new Map(),
      paysConnusAvant: new Map([[acteur, ['FR', 'ES']]]),
      fenetreJours: 30,
      depuis,
      now,
    })
    expect(etat.anomalies).toEqual([])
  })

  it('signale une HEURE INHABITUELLE (1 h – 6 h, Paris)', () => {
    const acteur = 'ops@bellum-it.com'
    // 2026-09-07T02:30:00Z est en septembre : Paris est en UTC+2 (CEST) → 04:30.
    const connexion = evt({
      event: 'connexion',
      actor_email: acteur,
      created_at: new Date('2026-09-07T02:30:00Z'),
      country: 'FR',
    })
    const etat = calculerEtatSecurite({
      evenements: [connexion],
      oldestEntryAt: null,
      echecsRecents: new Map(),
      paysConnusAvant: new Map([[acteur, ['FR']]]),
      fenetreJours: 30,
      depuis,
      now,
    })
    expect(etat.anomalies.filter(a => a.type === 'heure_inhabituelle')).toHaveLength(1)
  })

  it('les compteurs affichés — total, par type d’événement, pays observés — sont mesurés sur TOUTE la fenêtre', () => {
    const evenements = [
      evt({ event: 'connexion', actor_email: 'a@x.fr', created_at: new Date('2026-09-07T09:00:00Z'), country: 'FR' }),
      evt({ event: 'connexion', actor_email: 'b@x.fr', created_at: new Date('2026-09-06T09:00:00Z'), country: 'BE' }),
      evt({ event: 'connexion_refusee', actor_email: 'a@x.fr', created_at: new Date('2026-09-05T09:00:00Z') }),
    ]
    const etat = calculerEtatSecurite({
      evenements,
      oldestEntryAt: new Date('2025-09-08T00:00:00Z'),
      echecsRecents: new Map(),
      paysConnusAvant: new Map(),
      fenetreJours: 30,
      depuis,
      now,
    })
    expect(etat.total).toBe(3)
    expect(etat.parEvenement['connexion']).toBe(2)
    expect(etat.parEvenement['connexion_refusee']).toBe(1)
    expect(etat.acteursDistincts).toBe(2)
    expect(etat.paysObserves.sort()).toEqual(['BE', 'FR'])
    expect(etat.oldestEntryAt).toBe('2025-09-08T00:00:00.000Z')
  })

  it('les entrées affichées sont bornées — la fenêtre n’expose pas un annuaire', () => {
    const beaucoup = Array.from({ length: 80 }, (_, i) =>
      evt({ event: 'connexion', actor_email: `u${i}@x.fr`, created_at: new Date(now.getTime() - i * 60_000) }),
    )
    const etat = calculerEtatSecurite({
      evenements: beaucoup,
      oldestEntryAt: null,
      echecsRecents: new Map(),
      paysConnusAvant: new Map(),
      fenetreJours: 30,
      depuis,
      now,
    })
    expect(etat.entries.length).toBeLessThanOrEqual(50)
  })
})

/**
 * `etatSecurite` — l'ORCHESTRATION : la porte que #1671.3 et #1671.4 demandent
 * de BRANCHER. Elle relit `this.events.find`, `this.countRecentFailures` et
 * `this.knownCountries` (déjà testés isolément plus haut) puis délègue le calcul
 * à `calculerEtatSecurite` (pur, déjà testé plus haut). Ce test-ci prouve
 * seulement le CÂBLAGE — que les trois méthodes existantes sont vraiment
 * appelées — pas la logique de détection, déjà couverte.
 */
describe('etatSecurite — l’orchestration branchée (#1671.3, #1671.4)', () => {
  it('appelle countRecentFailures et knownCountries — ZÉRO appelant avant ce lot', async () => {
    const repo = createMockRepository<BackofficeAccessEventEntity>()
    const acteur = 'ops@bellum-it.com'
    const evenements = [
      { ...evtEntite(), event: 'connexion_refusee', actor_email: acteur, created_at: new Date('2026-09-07T11:55:00Z') },
      {
        ...evtEntite(),
        event: 'connexion',
        actor_email: acteur,
        created_at: new Date('2026-09-07T09:00:00Z'),
        country: 'DE',
      },
    ] as BackofficeAccessEventEntity[]
    repo.find.mockResolvedValue(evenements)
    repo.count.mockResolvedValue(4) // countRecentFailures
    repo._qb.getRawOne.mockResolvedValue({ min: '2025-09-08T00:00:00.000Z' }) // oldestEntryAt
    repo._qb.getRawMany.mockResolvedValue([{ country: 'FR' }]) // knownCountries

    const service = new BackofficeAccessJournalService(repo as never)
    const etat = await service.etatSecurite(30, new Date('2026-09-07T12:00:00Z'))

    expect(repo.find).toHaveBeenCalled()
    expect(repo.count).toHaveBeenCalled() // countRecentFailures a bien été appelée
    expect(repo._qb.getRawMany).toHaveBeenCalled() // knownCountries a bien été appelée
    expect(etat.mesure).toBe(true)
    expect(etat.anomalies.some(a => a.type === 'rafale_echecs')).toBe(true)
    expect(etat.anomalies.some(a => a.type === 'pays_inhabituel')).toBe(true)
  })

  it('un journal vide rend un état « non mesuré », jamais un « 0 anomalie » silencieux', async () => {
    const repo = createMockRepository<BackofficeAccessEventEntity>()
    repo.find.mockResolvedValue([])
    repo._qb.getRawOne.mockResolvedValue({ min: null })

    const service = new BackofficeAccessJournalService(repo as never)
    const etat = await service.etatSecurite(30, new Date('2026-09-07T12:00:00Z'))

    expect(etat.mesure).toBe(false)
    expect(etat.anomalies).toEqual([])
  })

  it('la fenêtre est bornée entre 1 et 365 jours — jamais une plage démesurée', async () => {
    const repo = createMockRepository<BackofficeAccessEventEntity>()
    repo.find.mockResolvedValue([])
    repo._qb.getRawOne.mockResolvedValue({ min: null })
    const service = new BackofficeAccessJournalService(repo as never)

    const trop = await service.etatSecurite(999_999, new Date('2026-09-07T12:00:00Z'))
    expect(trop.fenetreJours).toBe(365)

    const zero = await service.etatSecurite(0, new Date('2026-09-07T12:00:00Z'))
    expect(zero.fenetreJours).toBe(1)
  })
})

function evtEntite(): Pick<
  BackofficeAccessEventEntity,
  'id' | 'actor_role' | 'reason' | 'detail' | 'ip' | 'user_agent' | 'target' | 'country'
> {
  return {
    id: `id-${Math.random()}`,
    actor_role: null,
    reason: null,
    detail: null,
    ip: null,
    user_agent: null,
    target: null,
    country: null,
  }
}
