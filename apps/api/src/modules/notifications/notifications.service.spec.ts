import type { Repository } from 'typeorm'
import { NotificationsService } from './notifications.service'
import type { IntegrationsService } from '../integrations/integrations.service'
import type { AccountEntity } from '../../database/entities/account.entity'
import type { NotificationEntity } from '../../database/entities/notification.entity'
import type { NotificationPreferenceEntity } from '../../database/entities/notification-preference.entity'

/**
 * Array-backed stand-in for a TypeORM repo covering the handful of methods the
 * service touches. `read_at: IsNull()` (a FindOperator) is matched as "null".
 */
function makeRepo<T extends Record<string, unknown>>(initial: T[] = []) {
  const store: T[] = initial.map(r => ({ ...r }))
  // #4158.56 — la boîte combine plusieurs critères (OU) et `Not(In(...))` : on honore `IsNull`, `In`,
  // `Not` et les `where` en tableau, au lieu de tout traiter comme « nul ».
  const matchesValue = (actual: unknown, expected: unknown): boolean => {
    if (expected !== null && typeof expected === 'object' && '_type' in (expected as object)) {
      const op = expected as { _type: string; _value: unknown }
      if (op._type === 'isNull') return actual == null
      if (op._type === 'in') return (op._value as unknown[]).includes(actual)
      if (op._type === 'not') return !matchesValue(actual, op._value)
      // #4648 — la purge hebdomadaire lit `created_at < seuil`.
      if (op._type === 'lessThan') return actual instanceof Date && actual < (op._value as Date)
      return actual == null
    }
    return actual === expected
  }
  const matchOne = (row: T, where: Record<string, unknown> | undefined): boolean =>
    Object.entries(where ?? {}).every(([key, value]) => matchesValue(row[key], value))
  const matches = (row: T, where: Record<string, unknown> | Record<string, unknown>[] | undefined): boolean =>
    Array.isArray(where) ? where.some(w => matchOne(row, w)) : matchOne(row, where)
  return {
    findOne: jest.fn(
      async ({ where }: { where?: Record<string, unknown> | Record<string, unknown>[] }) =>
        store.find(r => matches(r, where)) ?? null,
    ),
    find: jest.fn(async ({ where }: { where?: Record<string, unknown> | Record<string, unknown>[] } = {}) =>
      store.filter(r => matches(r, where)),
    ),
    findAndCount: jest.fn(
      async ({
        where,
        take,
        skip,
      }: {
        where?: Record<string, unknown> | Record<string, unknown>[]
        take?: number
        skip?: number
      } = {}) => {
        const filtered = store.filter(r => matches(r, where))
        const start = skip ?? 0
        return [filtered.slice(start, start + (take ?? filtered.length)), filtered.length] as [T[], number]
      },
    ),
    count: jest.fn(
      async ({ where }: { where?: Record<string, unknown> | Record<string, unknown>[] } = {}) =>
        store.filter(r => matches(r, where)).length,
    ),
    create: jest.fn((value: Partial<T>) => ({ ...value })),
    save: jest.fn(async (value: Partial<T>) => {
      const row = { id: value['id'] ?? `id-${store.length + 1}`, ...value } as unknown as T
      store.push(row)
      return row
    }),
    insert: jest.fn(async (value: Partial<T>) => {
      store.push({ id: `id-${store.length + 1}`, ...value } as unknown as T)
    }),
    update: jest.fn(async (where: Record<string, unknown>, patch: Partial<T>) => {
      store.forEach((row, i) => {
        if (matches(row, where)) store[i] = { ...row, ...patch }
      })
    }),
    // #4648 — Vider et la purge SUPPRIMENT : le faux dépôt retire vraiment les lignes, et rend `affected`.
    delete: jest.fn(async (where: Record<string, unknown>) => {
      const before = store.length
      for (let i = store.length - 1; i >= 0; i -= 1) if (matches(store[i] as T, where)) store.splice(i, 1)
      return { affected: before - store.length, raw: [] }
    }),
    _store: store,
  } as unknown as Repository<T> & { _store: T[] }
}

const USER = '11111111-1111-1111-1111-111111111111'
const ACCOUNT = '22222222-2222-2222-2222-222222222222'

type PrefRow = Record<string, unknown>
type NotifRow = Record<string, unknown>
type AccountRow = Record<string, unknown>

function build(opts: { prefs?: PrefRow[]; notifs?: NotifRow[]; accounts?: AccountRow[]; forAccount?: jest.Mock } = {}) {
  const prefs = makeRepo<PrefRow>(opts.prefs ?? [])
  const notifs = makeRepo<NotifRow>(opts.notifs ?? [])
  const accounts = makeRepo<AccountRow>(opts.accounts ?? [])
  const integrations = { notifyUser: jest.fn().mockResolvedValue(undefined) }
  const service = new NotificationsService(
    prefs as unknown as Repository<NotificationPreferenceEntity>,
    notifs as unknown as Repository<NotificationEntity>,
    accounts as unknown as Repository<AccountEntity>,
    integrations as unknown as IntegrationsService,
    undefined,
    opts.forAccount ? ({ forAccount: opts.forAccount } as never) : undefined,
  )
  return { service, prefs, notifs, accounts, integrations }
}

describe('NotificationsService — preferences', () => {
  it('returns defaults when the user has no row', async () => {
    const { service } = build()
    const prefs = await service.getPreferences(USER)
    expect(prefs).toEqual({
      buy_signals: true,
      relance_reminders: false,
      weekly_summary: false,
      // #2082.16 — les préférences d'ENVOI (e-mail) sont toutes FAUSSES par
      // défaut : une case cochée d'avance ne vaut pas consentement.
      weekly_digest: false,
      credit_low: true,
      action_overdue: true,
      watchlist_daily_digest: false,
      sidebar_changelog: true,
      newsletter_changelog: false,
      // #2082.4/.5/.6 — les trois annonces d'ENGAGEMENT, in-app : rien ne part
      // chez personne, et chacune annonce un engagement DÉJÀ pris. Vraies par
      // défaut, comme `action_overdue`, et arrivées avec leur émetteur.
      meeting_prep: true,
      mission_end: true,
      client_reply: true,
      // #4158.19 — e-mails entre collègues : des ENVOIS, faux par défaut.
      email_on_assignment: false,
      email_on_delegation: false,
      email_on_mention: false,
      email_on_manager_digest: false,
      // Plafond de proactivité (§7) : 3 par défaut. Jamais 0 — un plafond nul
      // ferait taire le produit entier, ce qui n'est le choix de personne.
      proactivity_cap: 3,
      // Laura Produit (D49) : active par défaut, comme les autres capacités.
      laura_enabled: true,
      // Langue des e-mails : inconnue tant que la SPA ne l'a pas reportée.
      email_language: null,
      // Théo D settings-compte.N1 — aucune plage par défaut.
      quiet_hours_start: null,
      quiet_hours_end: null,
    })
  })

  it('reads back the reported email language, and only the two shipped locales', async () => {
    const row = {
      id: 'p1',
      user_id: USER,
      buy_signals: true,
      relance_reminders: false,
      weekly_summary: false,
      sidebar_changelog: true,
      newsletter_changelog: true,
    }
    const en = build({ prefs: [{ ...row, email_language: 'en' }] })
    await expect(en.service.getPreferences(USER)).resolves.toMatchObject({ email_language: 'en' })

    // A legacy / hand-edited value reads as "unknown", never as a wrong language.
    const junk = build({ prefs: [{ ...row, email_language: 'de' }] })
    await expect(junk.service.getPreferences(USER)).resolves.toMatchObject({ email_language: null })
  })

  // #2082.16 — REVIREMENT : une colonne absente (ligne écrite avant la
  // migration, fixture ancienne) est une absence de choix, pas un « oui ».
  it('lit weekly_digest à OFF pour une ligne ancienne sans la colonne (#2082.16)', async () => {
    const { service } = build({
      prefs: [
        {
          id: 'p1',
          user_id: USER,
          buy_signals: true,
          relance_reminders: false,
          weekly_summary: false,
          sidebar_changelog: true,
          newsletter_changelog: true,
        },
      ],
    })
    const prefs = await service.getPreferences(USER)
    expect(prefs.weekly_digest).toBe(false)
  })

  it('defaults credit_low + action_overdue to ON for a legacy row missing the columns', async () => {
    const { service } = build({
      prefs: [
        {
          id: 'p1',
          user_id: USER,
          buy_signals: true,
          relance_reminders: false,
          weekly_summary: false,
          sidebar_changelog: true,
          newsletter_changelog: true,
        },
      ],
    })
    const prefs = await service.getPreferences(USER)
    expect(prefs.credit_low).toBe(true)
    expect(prefs.action_overdue).toBe(true)
  })

  it('honours an explicit opt-out of credit_low / action_overdue', async () => {
    const { service } = build({
      prefs: [
        {
          id: 'p1',
          user_id: USER,
          buy_signals: true,
          relance_reminders: false,
          weekly_summary: false,
          weekly_digest: true,
          credit_low: false,
          action_overdue: false,
          sidebar_changelog: true,
          newsletter_changelog: true,
        },
      ],
    })
    const prefs = await service.getPreferences(USER)
    expect(prefs.credit_low).toBe(false)
    expect(prefs.action_overdue).toBe(false)
  })

  it('inserts defaults merged with the patch on first update (upsert)', async () => {
    const { service, prefs } = build()
    const result = await service.updatePreferences(USER, { weekly_summary: true })
    expect(prefs.insert).toHaveBeenCalledTimes(1)
    expect(result.weekly_summary).toBe(true)
    // untouched toggles keep their defaults
    expect(result.buy_signals).toBe(true)
    expect(result.relance_reminders).toBe(false)
  })

  it('updates the existing row instead of inserting a second one', async () => {
    const { service, prefs } = build({
      prefs: [
        {
          id: 'p1',
          user_id: USER,
          buy_signals: true,
          relance_reminders: false,
          weekly_summary: false,
          sidebar_changelog: true,
          newsletter_changelog: true,
        },
      ],
    })
    const result = await service.updatePreferences(USER, { buy_signals: false })
    expect(prefs.insert).not.toHaveBeenCalled()
    expect(prefs.update).toHaveBeenCalledTimes(1)
    expect(result.buy_signals).toBe(false)
  })
})

/**
 * #2404.3 — LE NIVEAU NOMMÉ, DÉRIVÉ DE `priority`, JAMAIS ÉCRIT SANS LUI.
 *
 * `notificationLevelFor` (`@bellum/contracts`) pose la règle ; ce test prouve
 * l'APPELANT : `createNotification` l'appelle et persiste le résultat, sans
 * jamais l'utiliser pour décider si le message compte dans le plafond de
 * proactivité (`exceedsCap` ne lit que `priority`, jamais `level`).
 */
describe('NotificationsService — le niveau nommé (#2404.3)', () => {
  it('dérive et persiste le niveau à partir de `priority`', async () => {
    const { service, notifs } = build()
    await service.createNotification(USER, { type: 'buy_signal', title: 'Signal', priority: 80 })
    expect(notifs._store[0]?.['level']).toBe('critical')
  })

  it('ne devine AUCUN niveau quand `priority` n’est pas mesuré', async () => {
    const { service, notifs } = build()
    await service.createNotification(USER, { type: 'buy_signal', title: 'Signal' })
    expect(notifs._store[0]?.['level']).toBeNull()
  })
})

/**
 * #2404.7 — D'OÙ VIENT L'INFORMATION.
 *
 * `createNotification` accepte et persiste `source` (ce que l'espace a
 * BRANCHÉ — jamais un de nos fournisseurs d'enrichissement) ; une source non
 * fournie reste `null`, jamais devinée (GA-18/GA-19).
 */
describe('NotificationsService — la source de l’information (#2404.7)', () => {
  it('persiste la source fournie par l’appelant', async () => {
    const { service, notifs } = build()
    await service.createNotification(USER, { type: 'client_reply', title: 'Une réponse est arrivée', source: 'Gmail' })
    expect(notifs._store[0]?.['source']).toBe('Gmail')
  })

  it('ne devine AUCUNE source quand l’appelant n’en fournit pas', async () => {
    const { service, notifs } = build()
    await service.createNotification(USER, { type: 'buy_signal', title: 'Signal' })
    expect(notifs._store[0]?.['source']).toBeNull()
  })
})

// #3920 — dates RELATIVES : un signal d'achat neuf est daté de moins de 30 jours.
const recentDay = (daysAgo: number): string => new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10)

describe('NotificationsService — buy-signal trigger (gated by pref)', () => {
  const accountWithSignal: AccountRow = {
    id: ACCOUNT,
    user_id: USER,
    company_name: 'Doctolib',
    recent_signals: [{ title: 'Nouvelle levée de fonds', date: recentDay(2) }],
    priority_score: 40,
    status: 'completed',
  }

  it('creates an in-app notification AND fans out to connected channels when ON', async () => {
    const { service, notifs, integrations } = build({ accounts: [accountWithSignal] })
    await service.notifyBuySignalForAccount(ACCOUNT)
    expect(notifs.save).toHaveBeenCalledTimes(1)
    const row = notifs._store[0]
    expect(row['type']).toBe('buy_signal')
    expect(row['user_id']).toBe(USER)
    expect(String(row['title'])).toContain('Doctolib')
    expect(String(row['body'])).toContain('Nouvelle levée de fonds')
    // #3922.7 — la cloche mène à la VEILLE du compte, où chaque signal porte son lien vers la preuve.
    expect(row['link']).toBe(`/accounts/${ACCOUNT}?tab=veille`)

    expect(integrations.notifyUser).toHaveBeenCalledTimes(1)
    const [uid, event] = integrations.notifyUser.mock.calls[0]
    expect(uid).toBe(USER)
    expect(event).toMatchObject({ type: 'buy_signal', data: { accountId: ACCOUNT, companyName: 'Doctolib' } })
    expect(String(event.text)).toContain('Doctolib')
  })

  it('#3920 — nomme le fait quand le signal porte le champ `signal`, pas `title`/`label`', async () => {
    // Les items produits par les connecteurs de signaux datés (BOAMP, France
    // Travail…) portent le fait sous la clé `signal` — `offer_provenance.py`
    // le confirme côté moteur IA. `buildBuySignalBody` ne la lisait pas et
    // retombait sur « N signaux détectés », un message qui ne nomme rien.
    const { service, notifs } = build({
      accounts: [
        {
          ...accountWithSignal,
          recent_signals: [{ signal: 'Marché public attribué — 240 000 €', date: recentDay(3) }],
        },
      ],
    })
    await service.notifyBuySignalForAccount(ACCOUNT)
    expect(String(notifs._store[0]['body'])).toContain('Marché public attribué')
    expect(String(notifs._store[0]['body'])).not.toContain('détecté')
  })

  it('#3920 — à la fin d’une analyse, un signal SANS date ou de plus de 30 jours ne sonne pas', async () => {
    for (const stale of [{ title: 'Sans date' }, { title: 'Vieux', date: recentDay(45) }]) {
      const { service, notifs } = build({ accounts: [{ ...accountWithSignal, recent_signals: [stale] }] })
      await service.notifyBuySignalForAccount(ACCOUNT)
      expect(notifs.save).not.toHaveBeenCalled()
    }
  })

  it('#3920 — un compte à forte priorité sonne encore sans signal frais, et ne cite pas le périmé', async () => {
    const { service, notifs } = build({
      accounts: [
        { ...accountWithSignal, priority_score: 95, recent_signals: [{ title: 'Vieux', date: recentDay(90) }] },
      ],
    })
    await service.notifyBuySignalForAccount(ACCOUNT)
    expect(String(notifs._store[0]?.['body'])).toContain('Compte prioritaire')
    expect(String(notifs._store[0]?.['body'])).not.toContain('Vieux')
  })

  it('#3922.n — la notification porte ELLE-MÊME le lien vérifiable du signal cité, et son genre', async () => {
    const { service, notifs } = build({
      accounts: [
        {
          ...accountWithSignal,
          recent_signals: [
            {
              signal: 'Modification statutaire',
              date: recentDay(4),
              url: 'https://www.bodacc.fr/annonce/1',
              source_kind: 'bodacc',
            },
          ],
        },
      ],
    })
    await service.notifyBuySignalForAccount(ACCOUNT)
    expect(notifs._store[0]?.['source_url']).toBe('https://www.bodacc.fr/annonce/1')
    expect(notifs._store[0]?.['source_kind']).toBe('bodacc')
    // Le lien interne vers la veille reste : les deux se complètent.
    expect(notifs._store[0]?.['link']).toBe(`/accounts/${ACCOUNT}?tab=veille`)
  })

  it('#3922.n — sans URL http(s) vérifiable : `null`, jamais un lien deviné', async () => {
    const { service, notifs } = build({
      accounts: [
        {
          ...accountWithSignal,
          recent_signals: [{ signal: 'Rumeur', date: recentDay(1), url: 'javascript:alert(1)' }],
        },
      ],
    })
    await service.notifyBuySignalForAccount(ACCOUNT)
    expect(notifs._store[0]?.['source_url']).toBeNull()
    expect(notifs._store[0]?.['source_kind']).toBeNull()
  })

  it('#3922.n — une notification qui ne cite aucun signal n’a pas de lien source', async () => {
    const { service, notifs } = build()
    await service.createNotification(USER, { type: 'buy_signal', title: 'Signal' })
    expect(notifs._store[0]?.['source_url']).toBeNull()
  })

  // Intégration M (M02 × M03) — le fait neuf de la veille porte SON lien vérifiable, lu par le même lecteur.
  it('#3920.a × #3922.n — le fait neuf porte son lien vérifiable ; une URL non http(s) ne passe pas', async () => {
    const { service, notifs } = build({ accounts: [{ ...accountWithSignal, recent_signals: [] }] })
    await service.notifyBuySignalForAccount(ACCOUNT, {
      label: 'Procédures collectives',
      source: 'BODACC',
      date: '2026-10-05',
      url: 'https://www.bodacc.fr/annonce/42',
    })
    expect(notifs._store[0]?.['source_url']).toBe('https://www.bodacc.fr/annonce/42')
    await service.notifyBuySignalForAccount(ACCOUNT, {
      label: 'Ouverture',
      source: 'Sirene',
      date: '2026-10-06',
      url: 'javascript:alert(1)',
    })
    expect(notifs._store[1]?.['source_url']).toBeNull()
  })

  it('#3920.a — une alerte de veille nomme LE fait neuf, sa source et sa date, quelle que soit la source', async () => {
    // La veille compare désormais TOUTES les sources (offres, BODACC, Sirene,
    // presse…) : le fait neuf n'est pas forcément dans `recent_signals`. Il
    // voyage avec l'appel, et c'est LUI que la cloche nomme.
    const { service, notifs } = build({ accounts: [{ ...accountWithSignal, recent_signals: [] }] })
    await service.notifyBuySignalForAccount(ACCOUNT, {
      label: 'Procédures collectives',
      source: 'BODACC',
      date: '2026-10-05',
    })
    expect(String(notifs._store[0]['body'])).toBe('Procédures collectives · 5 oct. 2026')
    expect(notifs._store[0]['source']).toBe('BODACC')
  })

  it('does NOT notify when buy_signals is OFF', async () => {
    const { service, notifs } = build({
      accounts: [accountWithSignal],
      prefs: [
        {
          id: 'p1',
          user_id: USER,
          buy_signals: false,
          relance_reminders: false,
          weekly_summary: false,
          sidebar_changelog: true,
          newsletter_changelog: true,
        },
      ],
    })
    await service.notifyBuySignalForAccount(ACCOUNT)
    expect(notifs.save).not.toHaveBeenCalled()
    expect(notifs._store).toHaveLength(0)
  })

  it('does NOT notify when there are no signals and priority is low', async () => {
    const { service, notifs } = build({
      accounts: [{ ...accountWithSignal, recent_signals: [], priority_score: 10 }],
    })
    await service.notifyBuySignalForAccount(ACCOUNT)
    expect(notifs.save).not.toHaveBeenCalled()
  })

  it('notifies on a strong priority score even without discrete signals', async () => {
    const { service, notifs } = build({
      accounts: [{ ...accountWithSignal, recent_signals: [], priority_score: 88 }],
    })
    await service.notifyBuySignalForAccount(ACCOUNT)
    expect(notifs.save).toHaveBeenCalledTimes(1)
    expect(String(notifs._store[0]['body'])).toContain('prioritaire')
  })

  it('is a no-op when the account does not exist', async () => {
    const { service, notifs } = build()
    await service.notifyBuySignalForAccount('does-not-exist')
    expect(notifs.save).not.toHaveBeenCalled()
  })

  // #2404.7 — mesuré en production le 21/09/2026 : le panneau de notifications
  // ne rendait AUCUNE source, sur 18 items. `recent_signals[].source` existe
  // déjà (BOAMP/DECP/presse — voir `weekly-digest.service.ts` qui le lit, et
  // `demo-dataset.ts::thalesSignals[0].source`), mais ce déclencheur — le plus
  // visible des types de notification — ne le relayait jamais.
  it('relaie la SOURCE du premier signal vers la notification — #2404.7', async () => {
    const { service, notifs } = build({
      accounts: [
        {
          ...accountWithSignal,
          recent_signals: [{ title: 'Nouvelle levée de fonds', date: recentDay(2), source: 'Les Échos' }],
        },
      ],
    })
    await service.notifyBuySignalForAccount(ACCOUNT)
    expect(notifs._store[0]?.['source']).toBe('Les Échos')
  })

  it('ne devine AUCUNE source quand le signal n’en porte pas (GA-18/GA-19)', async () => {
    const { service, notifs } = build({ accounts: [accountWithSignal] })
    await service.notifyBuySignalForAccount(ACCOUNT)
    expect(notifs._store[0]?.['source']).toBeNull()
  })
})

describe('NotificationsService — feed', () => {
  it('counts only unread notifications', async () => {
    const { service } = build({
      notifs: [
        { id: 'n1', user_id: USER, type: 'system', title: 't', body: '', link: null, read_at: null },
        { id: 'n2', user_id: USER, type: 'system', title: 't', body: '', link: null, read_at: new Date() },
      ],
    })
    expect(await service.unreadCount(USER)).toBe(1)
  })

  it('marks every unread notification read', async () => {
    const { service, notifs } = build({
      notifs: [
        { id: 'n1', user_id: USER, type: 'system', title: 't', body: '', link: null, read_at: null },
        { id: 'n2', user_id: USER, type: 'system', title: 't', body: '', link: null, read_at: null },
      ],
    })
    await service.markAllRead(USER)
    expect(await service.unreadCount(USER)).toBe(0)
  })

  it('paginates the feed with correct meta', async () => {
    const notifs = Array.from({ length: 3 }, (_, i) => ({
      id: `n${i}`,
      user_id: USER,
      type: 'system',
      title: `t${i}`,
      body: '',
      link: null,
      read_at: null,
      created_at: new Date(),
    }))
    const { service } = build({ notifs })
    const page = await service.list(USER, 1, 2)
    expect(page.data).toHaveLength(2)
    expect(page.pagination).toMatchObject({
      currentPage: 1,
      size: 2,
      totalItems: 3,
      totalPages: 2,
      hasNext: true,
      hasPrev: false,
    })
  })

  // #2404.3 — écrit à la création (`notificationLevelFor`), jamais lu jusqu'ici :
  // le mapper `toNotificationItem` droppait `row.level`, donc aucun écran ne
  // pouvait le lire. Ce test verrouille l'APPELANT côté lecture du feed.
  it('transporte le niveau nommé jusqu’au wire (#2404.3)', async () => {
    const { service } = build({
      notifs: [
        { id: 'n1', user_id: USER, type: 'system', title: 't', body: '', link: null, read_at: null, level: 'critical' },
        { id: 'n2', user_id: USER, type: 'system', title: 't', body: '', link: null, read_at: null, level: null },
      ],
    })
    const page = await service.list(USER, 1, 10)
    expect(page.data.find(item => item.id === 'n1')?.level).toBe('critical')
    expect(page.data.find(item => item.id === 'n2')?.level).toBeNull()
  })

  // #2404.7 — même défaut que #2404.3 : une colonne écrite à la création mais
  // droppée par le mapper de lecture est invisible pour tout écran.
  it('transporte la source jusqu’au wire (#2404.7)', async () => {
    const { service } = build({
      notifs: [
        {
          id: 'n1',
          user_id: USER,
          type: 'client_reply',
          title: 't',
          body: '',
          link: null,
          read_at: null,
          source: 'Gmail',
        },
        { id: 'n2', user_id: USER, type: 'buy_signal', title: 't', body: '', link: null, read_at: null, source: null },
      ],
    })
    const page = await service.list(USER, 1, 10)
    expect(page.data.find(item => item.id === 'n1')?.source).toBe('Gmail')
    expect(page.data.find(item => item.id === 'n2')?.source).toBeNull()
  })
})

/* ------------------------------------------------------------------------- */
/*  Le classement de proactivité, enfin opérant                               */
/* ------------------------------------------------------------------------- */

describe('NotificationsService.createProactiveBatch', () => {
  /**
   * `decideProactivity` triait ses candidats par priorité — et il était appelé
   * avec UN candidat à la fois. Un tri sur un élément ne trie rien : le premier
   * message de la journée gagnait sa place quelle que soit son importance, et
   * une alerte grave arrivée en cinquième position se faisait supprimer pendant
   * que quatre messages anodins étaient partis.
   */
  function harness(cap: number, sentToday: number) {
    const rows: Record<string, unknown>[] = []
    const manager = {
      query: jest.fn(async (sql: string) => {
        if (sql.includes('proactivity_cap')) return [{ proactivity_cap: cap }]
        if (sql.includes('sent_count')) return [{ sent_count: sentToday }]
        return []
      }),
    }
    const notifications = {
      manager,
      create: jest.fn((entity: Record<string, unknown>) => entity),
      save: jest.fn(async (entity: Record<string, unknown>) => {
        rows.push(entity)
        return entity
      }),
    }
    const service = new NotificationsService({} as never, notifications as never, {} as never, {} as never)
    return { service, rows }
  }

  const candidate = (key: string, priority: number) => ({
    key,
    priority,
    type: 'system' as const,
    title: key,
  })

  it('garde les plus PRIORITAIRES, pas les premiers arrivés', async () => {
    const { service, rows } = harness(2, 0)
    await service.createProactiveBatch('u1', [
      candidate('anodin-a', 5),
      candidate('grave', 90),
      candidate('anodin-b', 4),
      candidate('important', 70),
    ])
    const sent = rows.filter(row => row['suppressed_at'] === null).map(row => row['title'])
    expect(sent.sort()).toEqual(['grave', 'important'])
  })

  it('ce qui dépasse est ENREGISTRÉ, jamais jeté ni mis en file', async () => {
    // Ce qu'on supprime est l'interruption, pas l'information : le message reste
    // visible dans le centre d'actions. Et il n'est pas reporté à demain, qui a
    // ses propres messages.
    const { service, rows } = harness(1, 0)
    await service.createProactiveBatch('u1', [candidate('a', 50), candidate('b', 10)])
    expect(rows).toHaveLength(2)
    expect(rows.filter(row => row['suppressed_at'] !== null)).toHaveLength(1)
  })

  it('tient compte de ce qui est DÉJÀ parti aujourd’hui', async () => {
    const { service, rows } = harness(3, 3)
    await service.createProactiveBatch('u1', [candidate('a', 90)])
    expect(rows[0]?.['suppressed_at']).not.toBeNull()
  })

  it('un plafond illisible laisse TOUT passer', async () => {
    // Mieux vaut une notification de trop qu'un message important avalé par une
    // panne de compteur — la version inverse du défaut que le plafond corrige.
    const rows: Record<string, unknown>[] = []
    const notifications = {
      manager: {
        query: jest.fn(async () => {
          throw new Error('base injoignable')
        }),
      },
      create: jest.fn((entity: Record<string, unknown>) => entity),
      save: jest.fn(async (entity: Record<string, unknown>) => {
        rows.push(entity)
        return entity
      }),
    }
    const service = new NotificationsService({} as never, notifications as never, {} as never, {} as never)
    await service.createProactiveBatch('u1', [candidate('a', 1), candidate('b', 1), candidate('c', 1)])
    expect(rows.every(row => row['suppressed_at'] === null)).toBe(true)
  })

  it('un lot vide ne lit même pas le compteur', async () => {
    const { service } = harness(3, 0)
    await expect(service.createProactiveBatch('u1', [])).resolves.toEqual([])
  })
})

/* ------------------------------------------------------------------------- */
/*  #1938.13 — le budget d'interruption partagé, consulté par le canal       */
/* ------------------------------------------------------------------------- */

describe('NotificationsService — le budget d’interruption partagé (#1938.13)', () => {
  /**
   * `interruption-budget.ts` (`@bellum/contracts`) tenait déjà « coupé » et
   * « en retrait » pour la bulle de Laura sur un écran (`laura.service.ts`) —
   * mais le canal des notifications avait son PROPRE plafond de volume
   * (`proactivity_cap`), sans jamais consulter ces deux refus-là. Un
   * utilisateur qui coupe Laura, ou qu'un retrait fait taire après plusieurs
   * fermetures sans lecture, continuait de recevoir des notifications
   * proactives par ce second canal — un budget que le canal ignore ne borne
   * rien.
   *
   * Même disposition que le plafond de volume existant : ce qui est refusé
   * est ENREGISTRÉ et marqué supprimé (visible dans le centre d'actions, sans
   * interrompre), jamais jeté ni mis en file — la question « que faire d'un
   * message refusé » était déjà tranchée pour le plafond, ce n'en est pas une
   * nouvelle.
   */
  function harnessWithBudget(opts: { lauraEnabled?: boolean; retreatUntil?: Date | null } = {}) {
    const rows: Record<string, unknown>[] = []
    const manager = {
      query: jest.fn(async (sql: string) => {
        if (sql.includes('laura_enabled')) {
          return [{ laura_enabled: opts.lauraEnabled ?? true, laura_retreat_until: opts.retreatUntil ?? null }]
        }
        if (sql.includes('proactivity_cap')) return [{ proactivity_cap: 5 }]
        if (sql.includes('sent_count')) return [{ sent_count: 0 }]
        return []
      }),
    }
    const notifications = {
      manager,
      create: jest.fn((entity: Record<string, unknown>) => entity),
      save: jest.fn(async (entity: Record<string, unknown>) => {
        rows.push(entity)
        return entity
      }),
    }
    const sms = { dispatch: jest.fn().mockResolvedValue(undefined) }
    const service = new NotificationsService(
      {} as never,
      notifications as never,
      {} as never,
      {} as never,
      sms as never,
    )
    return { service, rows, sms }
  }

  it('coupé : une notification PROACTIVE est enregistrée supprimée, jamais relayée par SMS', async () => {
    const { service, rows, sms } = harnessWithBudget({ lauraEnabled: false })
    await service.createNotification(USER, {
      type: 'buy_signal',
      title: 'Nouveau signal — Doctolib',
      origin: 'proactive',
      priority: 90,
    })
    expect(rows[0]?.['suppressed_at']).not.toBeNull()
    expect(sms.dispatch).not.toHaveBeenCalled()
  })

  it('en retrait : une notification PROACTIVE est enregistrée supprimée, sous le plafond de volume', async () => {
    const inTheFuture = new Date(Date.now() + 24 * 60 * 60 * 1000)
    const { service, rows } = harnessWithBudget({ retreatUntil: inTheFuture })
    await service.createNotification(USER, {
      type: 'buy_signal',
      title: 'Nouveau signal — Doctolib',
      origin: 'proactive',
      priority: 90,
    })
    expect(rows[0]?.['suppressed_at']).not.toBeNull()
  })

  it('un retrait EXPIRÉ ne bloque plus rien', async () => {
    const inThePast = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const { service, rows } = harnessWithBudget({ retreatUntil: inThePast })
    await service.createNotification(USER, {
      type: 'buy_signal',
      title: 'Nouveau signal — Doctolib',
      origin: 'proactive',
      priority: 90,
    })
    expect(rows[0]?.['suppressed_at']).toBeNull()
  })

  it('coupé n’empêche PAS un message non proactif — le budget ne porte que sur ce qui interrompt', async () => {
    // Témoin volontairement voisin : `user_triggered` et `failure` passent
    // TOUJOURS (§ « un message failure ou user_triggered passe toujours »).
    // Un gate trop gourmand qui les attraperait couperait des réponses à un
    // geste de l'utilisateur — jamais une interruption.
    const { service, rows } = harnessWithBudget({ lauraEnabled: false })
    await service.createNotification(USER, { type: 'credit_low', title: 'Crédits bientôt épuisés' })
    expect(rows[0]?.['suppressed_at']).toBeNull()
  })

  it('un budget illisible laisse PASSER — même repli que le plafond de volume', async () => {
    const rows: Record<string, unknown>[] = []
    const notifications = {
      manager: { query: jest.fn(async () => Promise.reject(new Error('base injoignable'))) },
      create: jest.fn((entity: Record<string, unknown>) => entity),
      save: jest.fn(async (entity: Record<string, unknown>) => {
        rows.push(entity)
        return entity
      }),
    }
    const service = new NotificationsService({} as never, notifications as never, {} as never, {} as never)
    await service.createNotification(USER, {
      type: 'buy_signal',
      title: 'Nouveau signal — Doctolib',
      origin: 'proactive',
      priority: 90,
    })
    expect(rows[0]?.['suppressed_at']).toBeNull()
  })
})

/* ------------------------------------------------------------------------- */
/*  #1938.4 — le relais SMS, branché au seul passage obligé des notifications */
/* ------------------------------------------------------------------------- */

describe('NotificationsService — relais SMS des alertes urgentes (#1938.4)', () => {
  /**
   * `createNotification` est le passage obligé des alertes : signal d'achat
   * (`notifyBuySignalForAccount`), crédits bas (`CreditsService`), actions en
   * retard (`NotificationsScheduler`). Le relais se branche ICI et nulle part
   * ailleurs — le mettre plus haut obligerait chaque émetteur à s'en souvenir.
   * Le filtrage (type urgent, fournisseur, consentement) appartient au canal :
   * ce test prouve que le canal est APPELÉ, et qu'il ne l'est pas pour ce qui
   * n'interrompt personne.
   */
  function withSms() {
    const rows: Record<string, unknown>[] = []
    const notifications = {
      manager: {
        query: jest.fn(async (sql: string): Promise<unknown[]> => {
          if (sql.includes('proactivity_cap')) return [{ proactivity_cap: 1 }]
          if (sql.includes('sent_count')) return [{ sent_count: 1 }]
          return []
        }),
      },
      create: jest.fn((entity: Record<string, unknown>) => entity),
      save: jest.fn(async (entity: Record<string, unknown>) => {
        rows.push(entity)
        return entity
      }),
    }
    const sms = { dispatch: jest.fn().mockResolvedValue(undefined) }
    const service = new NotificationsService(
      {} as never,
      notifications as never,
      {} as never,
      {} as never,
      sms as never,
    )
    return { service, sms, rows, notifications }
  }

  // Le relais SMS relit la plage de tranquillité avant d'envoyer : il part au
  // tour de microtâches suivant, jamais en bloquant la notification in-app.
  const flush = (): Promise<void> => new Promise(resolve => setImmediate(resolve))

  it('relaie une notification créée vers le canal SMS, avec son type et son titre', async () => {
    const { service, sms } = withSms()
    await service.createNotification(USER, {
      type: 'credit_low',
      title: 'Crédits bientôt épuisés',
      body: 'Il te reste 3 crédits.',
    })
    await flush()
    expect(sms.dispatch).toHaveBeenCalledTimes(1)
    expect(sms.dispatch).toHaveBeenCalledWith(USER, { type: 'credit_low', title: 'Crédits bientôt épuisés' })
    // Le CORPS ne voyage pas vers le canal : un SMS porte le titre seul.
    expect(JSON.stringify(sms.dispatch.mock.calls)).not.toContain('Il te reste 3 crédits.')
  })

  it('ne relaie PAS un message proactif supprimé par le plafond — un SMS est une interruption', async () => {
    const { service, sms, rows } = withSms()
    await service.createNotification(USER, {
      type: 'buy_signal',
      title: 'Nouveau signal — Doctolib',
      origin: 'proactive',
      priority: 50,
    })
    await flush()
    expect(rows[0]?.['suppressed_at']).not.toBeNull()
    expect(sms.dispatch).not.toHaveBeenCalled()
  })

  // Théo D settings-compte.N1 — la plage de tranquillité retient le SMS, jamais la cloche.
  it('ne relaie PAS par SMS pendant la plage de tranquillité — la notification in-app, elle, est créée', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] }).setSystemTime(new Date('2026-07-01T20:30:00Z'))
    try {
      const { service, sms, rows, notifications } = withSms()
      notifications.manager.query.mockImplementation(async (sql: string): Promise<unknown[]> => {
        if (sql.includes('quiet_hours_start'))
          return [{ quiet_hours_start: '21:00', quiet_hours_end: '07:00', timezone: 'Europe/Paris' }]
        if (sql.includes('proactivity_cap')) return [{ proactivity_cap: 1 }]
        if (sql.includes('sent_count')) return [{ sent_count: 1 }]
        return []
      })
      await service.createNotification(USER, { type: 'credit_low', title: 'Crédits bientôt épuisés' })
      await flush()
      expect(rows).toHaveLength(1)
      expect(sms.dispatch).not.toHaveBeenCalled()
    } finally {
      jest.useRealTimers()
    }
  })

  it('relaie par SMS hors de la plage, dans le fuseau du profil', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] }).setSystemTime(new Date('2026-07-01T10:00:00Z'))
    try {
      const { service, sms, notifications } = withSms()
      notifications.manager.query.mockImplementation(async (sql: string): Promise<unknown[]> => {
        if (sql.includes('quiet_hours_start'))
          return [{ quiet_hours_start: '21:00', quiet_hours_end: '07:00', timezone: 'Europe/Paris' }]
        return []
      })
      await service.createNotification(USER, { type: 'credit_low', title: 'Crédits bientôt épuisés' })
      await flush()
      expect(sms.dispatch).toHaveBeenCalledTimes(1)
    } finally {
      jest.useRealTimers()
    }
  })

  it('un canal SMS qui lève ne fait jamais échouer la notification in-app', async () => {
    const { service, sms, rows } = withSms()
    sms.dispatch.mockRejectedValueOnce(new Error('canal injoignable'))
    await expect(
      service.createNotification(USER, { type: 'action_overdue', title: '2 actions en retard' }),
    ).resolves.toBeDefined()
    expect(rows).toHaveLength(1)
  })

  it('sans canal SMS injecté (modules et specs qui ne le fournissent pas), rien ne change', async () => {
    const { service, notifs } = build()
    await expect(
      service.createNotification(USER, { type: 'credit_low', title: 'Crédits bientôt épuisés' }),
    ).resolves.toBeDefined()
    expect(notifs.save).toHaveBeenCalledTimes(1)
  })
})

/**
 * #3920.crm (lot M01, 09/10/2026) — l'alerte « nouveau signal » couvre aussi
 * le CRM : UNE alerte par compte et par passage, source « Votre CRM », qui
 * mène à la veille du compte où chaque affaire est listée.
 */
describe('NotificationsService.notifyCrmSignalsForAccount (#3920.crm)', () => {
  const account: AccountRow = {
    id: ACCOUNT,
    user_id: USER,
    company_name: 'AXA',
    recent_signals: [],
    status: 'completed',
  }

  it('UNE alerte qui nomme la première affaire, source « Votre CRM », lien vers la veille', async () => {
    const { service, notifs } = build({ accounts: [account] })
    await service.notifyCrmSignalsForAccount(ACCOUNT, [
      'TMA AXA : affaire perdue il y a 3 mois.',
      'Data AXA : sans la moindre activité connue depuis 60 jours.',
    ])
    expect(notifs.save).toHaveBeenCalledTimes(1)
    const row = notifs._store[0]
    expect(row['type']).toBe('buy_signal')
    expect(String(row['title'])).toBe('Nouveau signal — AXA')
    expect(String(row['body'])).toBe('TMA AXA : affaire perdue il y a 3 mois. (+1 autre)')
    expect(row['source']).toBe('Votre CRM')
    expect(row['link']).toBe(`/accounts/${ACCOUNT}?tab=veille`)
  })

  it('aucune affaire neuve : aucune alerte', async () => {
    const { service, notifs } = build({ accounts: [account] })
    await service.notifyCrmSignalsForAccount(ACCOUNT, [])
    expect(notifs.save).not.toHaveBeenCalled()
  })

  it('préférence « signaux d’achat » coupée : aucune alerte', async () => {
    const { service, notifs } = build({
      accounts: [account],
      prefs: [{ id: 'p1', user_id: USER, buy_signals: false, relance_reminders: false, weekly_summary: false }],
    })
    await service.notifyCrmSignalsForAccount(ACCOUNT, ['TMA AXA : affaire perdue il y a 3 mois.'])
    expect(notifs.save).not.toHaveBeenCalled()
  })
})

// #4072.4 — un fait neuf qui RÉPÈTE un besoin passé est signalé comme récurrence.
describe('NotificationsService — récurrence d’un besoin passé (#4072.4)', () => {
  const account: AccountRow = {
    id: ACCOUNT,
    user_id: USER,
    company_name: 'Doctolib',
    recent_signals: [],
    priority_score: 40,
    status: 'completed',
    workspace_id: 'ws-1',
  } as AccountRow
  const fresh = { label: 'Recrutement développeur Java senior', source: 'Offre', date: '2026-10-10' }
  const past = (over: Record<string, unknown> = {}) => ({
    date: '2025-08-01',
    kind: 'need',
    label: 'Développeur Java senior',
    weight: 1,
    ageDays: 435,
    ...over,
  })

  it('le dit dans la cloche, avec la date du besoin passé, sans nommer de provenance', async () => {
    const forAccount = jest.fn(async () => ({ asOf: 'x', facts: [past()] }))
    const { service, notifs } = build({ accounts: [account], forAccount })
    await service.notifyBuySignalForAccount(ACCOUNT, fresh)
    expect(forAccount).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: 'ws-1', accountId: ACCOUNT }))
    const body = String(notifs._store[0]?.['body'])
    expect(body).toContain('Besoin récurrent')
    expect(body).toContain('1 août 2025')
  })

  it('ne dit rien de plus sans besoin passé, et une lecture en panne ne coupe pas l’alerte', async () => {
    const none = build({ accounts: [account], forAccount: jest.fn(async () => ({ asOf: 'x', facts: [] })) })
    await none.service.notifyBuySignalForAccount(ACCOUNT, fresh)
    expect(String(none.notifs._store[0]?.['body'])).not.toContain('récurrent')
    const broken = build({ accounts: [account], forAccount: jest.fn().mockRejectedValue(new Error('boom')) })
    await broken.service.notifyBuySignalForAccount(ACCOUNT, fresh)
    expect(broken.notifs._store).toHaveLength(1)
  })
})

// #4648 — « Vider » (le geste) et la purge hebdomadaire (le cron) : la même suppression, à un seul endroit (GA-26).
describe('NotificationsService — vider et purger (#4648)', () => {
  const OTHER = '33333333-3333-3333-3333-333333333333'
  const DAY = 24 * 60 * 60 * 1000
  const row = (id: string, user: string, ageDays: number, read = false) => ({
    id,
    user_id: user,
    workspace_id: null,
    type: 'system',
    title: 't',
    body: '',
    link: null,
    read_at: read ? new Date() : null,
    created_at: new Date(Date.now() - ageDays * DAY),
  })

  it('Vider supprime les notifications de la personne, et le compteur retombe à 0', async () => {
    const { service, notifs } = build({ notifs: [row('a', USER, 0), row('b', USER, 3, true)] })
    expect(await service.clearInbox(USER)).toBe(2)
    expect(notifs._store).toHaveLength(0)
    expect(await service.unreadCount(USER)).toBe(0)
  })

  it('NON : Vider ne touche à AUCUNE notification d’un autre utilisateur', async () => {
    const { service, notifs } = build({ notifs: [row('a', USER, 0), row('b', OTHER, 0), row('c', OTHER, 9)] })
    await service.clearInbox(USER)
    expect(notifs._store.map(r => r['id']).sort()).toEqual(['b', 'c'])
    // Le filtre `user_id` est posé DANS la suppression, jamais un `where` sur le seul `id`.
    for (const [where] of (notifs.delete as jest.Mock).mock.calls) expect(where).toMatchObject({ user_id: USER })
  })

  it('NON : Vider ne touche pas aux notifications d’un AUTRE espace de la personne', async () => {
    const inSpace = { ...row('a', USER, 0), workspace_id: 'ws-1' }
    const otherSpace = { ...row('b', USER, 0), workspace_id: 'ws-2' }
    const { service, notifs } = build({ notifs: [inSpace, otherSpace] })
    await service.clearInbox(USER, { workspaceId: 'ws-1' })
    expect(notifs._store.map(r => r['id'])).toEqual(['b'])
  })

  it('la purge emporte tout ce qui a plus de 7 jours, lu comme non lu, pour tous', async () => {
    const { service, notifs } = build({
      notifs: [
        row('old-unread', USER, 8),
        row('old-read', OTHER, 30, true),
        row('six', USER, 6),
        row('today', OTHER, 0),
      ],
    })
    const result = await service.purgeOlderThan(new Date(Date.now() - 7 * DAY))
    expect(result).toEqual({ deleted: 2, users: 2 })
    // NON : six jours et le jour même restent.
    expect(notifs._store.map(r => r['id']).sort()).toEqual(['six', 'today'])
  })

  it('la purge est idempotente : relancée, elle ne supprime rien de plus', async () => {
    const { service, notifs } = build({ notifs: [row('old', USER, 10), row('six', USER, 6)] })
    const cutoff = new Date(Date.now() - 7 * DAY)
    await service.purgeOlderThan(cutoff)
    expect(await service.purgeOlderThan(cutoff)).toEqual({ deleted: 0, users: 0 })
    expect(notifs._store.map(r => r['id'])).toEqual(['six'])
  })
})
