import { z } from 'zod'
import { describe, expect, it } from 'vitest'

import {
  consolidateNotifications,
  defaultNotificationPreferences,
  NOTIFICATION_IN_APP_PREFERENCE_KEYS,
  NOTIFICATION_LEVELS,
  NOTIFICATION_OUTBOUND_PREFERENCE_KEYS,
  detectNotificationPreset,
  notificationLevelFor,
  NOTIFICATION_PRESET_IDS,
  NOTIFICATION_PRESET_KEYS,
  NOTIFICATION_PRESETS,
  NOTIFICATION_TYPE_PURPOSES,
  notificationLevelSchema,
  notificationPreferencesSchema,
  notificationPresetIdSchema,
  notificationSchema,
  isInQuietHours,
  notificationTypeSchema,
  updateNotificationPreferencesSchema,
  type NotificationItem,
} from './notifications.js'

/** Les booléens RÉELS du schéma, lus depuis Zod — jamais une liste recopiée à
 *  la main, qui resterait verte le jour où une préférence est ajoutée. */
function booleanPreferenceKeys(): string[] {
  return Object.entries(notificationPreferencesSchema.shape)
    .filter(([, field]) => field instanceof z.ZodBoolean)
    .map(([key]) => key)
}

describe('notification preferences', () => {
  it('accepts a full set of the toggles', () => {
    const parsed = notificationPreferencesSchema.parse(defaultNotificationPreferences)
    expect(parsed).toEqual(defaultNotificationPreferences)
  })

  it('ships defaults that match the shipped screen', () => {
    expect(defaultNotificationPreferences).toEqual({
      buy_signals: true,
      relance_reminders: false,
      weekly_summary: false,
      // #2082.16 — envoi SORTANT : jamais vrai par défaut (voir la garde plus bas).
      weekly_digest: false,
      credit_low: true,
      action_overdue: true,
      // Cadence de veille (§11) : digest quotidien — opt-in, défaut OFF (aucun
      // envoi quotidien n'est encore câblé, on ne promet rien qu'on ne tient pas).
      watchlist_daily_digest: false,
      sidebar_changelog: true,
      // #2082.16 — envoi SORTANT (newsletter e-mail) : jamais vrai par défaut.
      newsletter_changelog: false,
      // #2082.4/.5/.6 — IN-APP (la cloche), et chacune annonce un engagement
      // DÉJÀ pris : un rendez-vous de ton agenda, une mission qui se termine,
      // une réponse qui est arrivée. Vraies par défaut, comme `action_overdue`,
      // et arrivées AVEC leur émetteur — jamais un interrupteur qui ne commande
      // rien.
      meeting_prep: true,
      mission_end: true,
      client_reply: true,
      // #4158.19 — ENVOIS entre collègues : jamais vrais par défaut.
      email_on_assignment: false,
      email_on_delegation: false,
      email_on_mention: false,
      email_on_manager_digest: false,
      // Pas un interrupteur : la langue d'interface reportée par la SPA.
      // `null` = pas encore connue → les e-mails partent en FR (défaut produit).
      email_language: null,
      // Théo D settings-compte.N1 — aucune plage par défaut : rien n'est réduit au silence sans geste.
      quiet_hours_start: null,
      quiet_hours_end: null,
      // Le plafond de proactivité (PDF 6 §7) : 3 par défaut, réglable de 1 à 5.
      // Jamais 0 — un plafond nul ferait taire le produit entier.
      proactivity_cap: 3,
      // Laura Produit (PDF 10, D49) : ACTIVE par défaut, comme toutes les
      // capacités du produit. L'interrupteur existe — « une Laura qu'on ne peut
      // pas couper est une Laura qu'on subit » — mais couper est un GESTE, pas
      // un état de départ.
      laura_enabled: true,
    })
  })

  it('accepts the two shipped locales for the email language, and nothing else', () => {
    for (const email_language of ['fr', 'en', null] as const) {
      expect(() =>
        notificationPreferencesSchema.parse({ ...defaultNotificationPreferences, email_language }),
      ).not.toThrow()
    }
    expect(() =>
      notificationPreferencesSchema.parse({ ...defaultNotificationPreferences, email_language: 'de' }),
    ).toThrow()
  })

  // #2082.16 / #2091.24 — REVIREMENT du 15/09/2026. La « politique zéro-flag
  // produit » avait fait de `weekly_digest` une case COCHÉE d'avance sur un
  // e-mail hebdomadaire : ce n'est pas un défaut de confort, c'est un
  // consentement présumé. Le digest existe toujours, il s'allume désormais.
  it('ne préconche PAS le digest hebdo de veille — c’est un e-mail (#2082.16)', () => {
    expect(defaultNotificationPreferences.weekly_digest).toBe(false)
    expect(defaultNotificationPreferences.newsletter_changelog).toBe(false)
  })

  it('defaults billing-transparency alerts to ON (Théo : jamais de débit découvert a posteriori)', () => {
    expect(defaultNotificationPreferences.credit_low).toBe(true)
    expect(defaultNotificationPreferences.action_overdue).toBe(true)
  })

  it('rejects a non-boolean toggle', () => {
    expect(() =>
      notificationPreferencesSchema.parse({ ...defaultNotificationPreferences, buy_signals: 'yes' }),
    ).toThrow()
  })

  it('lets the update body carry a single toggle', () => {
    const parsed = updateNotificationPreferencesSchema.parse({ weekly_summary: true })
    expect(parsed).toEqual({ weekly_summary: true })
  })

  it('rejects unknown keys are stripped from the update body', () => {
    const parsed = updateNotificationPreferencesSchema.parse({ buy_signals: false, nope: 1 } as Record<string, unknown>)
    expect(parsed).toEqual({ buy_signals: false })
  })
})

/**
 * #2082.16 / #2091.24 — « AUCUNE case précochée ».
 *
 * La règle que cette garde tient, et sa LIMITE : une préférence qui déclenche
 * un ENVOI SORTANT vers la personne (un e-mail) n'est jamais vraie par défaut,
 * parce qu'une case précochée ne vaut pas consentement. Une préférence qui ne
 * fait qu'AFFICHER dans l'application (cloche, encart, Laura) peut l'être :
 * c'est le produit qui parle chez lui, pas un message envoyé à quelqu'un.
 *
 * Elle prouve les TROIS choses :
 *  - elle LIT un corpus non vide (les booléens réels du schéma, pas une liste
 *    recopiée à la main) ;
 *  - elle SAIT DIRE NON (un défaut sortant remis à `true` est détecté, et une
 *    préférence future non classée l'est aussi) ;
 *  - elle N'ATTRAPE PAS ce qu'elle ne vise pas (les réglages in-app vrais par
 *    défaut — `buy_signals`, `credit_low`, `laura_enabled`… — passent).
 */
describe('#2082.16 — aucun ENVOI SORTANT n’est vrai par défaut', () => {
  it('lit un corpus non vide — chaque booléen du schéma est classé une fois et une seule', () => {
    const booleans = booleanPreferenceKeys()
    expect(booleans.length).toBeGreaterThan(5)
    const classified = [...NOTIFICATION_OUTBOUND_PREFERENCE_KEYS, ...NOTIFICATION_IN_APP_PREFERENCE_KEYS]
    expect([...classified].sort()).toEqual([...booleans].sort())
  })

  it('aucune préférence d’ENVOI SORTANT n’est vraie par défaut', () => {
    const precochees = NOTIFICATION_OUTBOUND_PREFERENCE_KEYS.filter(key => defaultNotificationPreferences[key])
    expect(precochees).toEqual([])
  })

  it('SAIT DIRE NON — un défaut sortant remis à `true` est détecté', () => {
    const tampered = { ...defaultNotificationPreferences, weekly_digest: true }
    const precochees = NOTIFICATION_OUTBOUND_PREFERENCE_KEYS.filter(key => tampered[key])
    expect(precochees).toEqual(['weekly_digest'])
  })

  it('SAIT DIRE NON — une préférence FUTURE non classée est détectée', () => {
    const tamperedBooleans = [...booleanPreferenceKeys(), 'push_browser']
    const classified: readonly string[] = [
      ...NOTIFICATION_OUTBOUND_PREFERENCE_KEYS,
      ...NOTIFICATION_IN_APP_PREFERENCE_KEYS,
    ]
    expect(tamperedBooleans.filter(key => !classified.includes(key))).toEqual(['push_browser'])
  })

  it('N’ATTRAPE PAS ce qu’elle ne vise pas — les réglages IN-APP vrais par défaut restent légitimes', () => {
    // Témoin : ces quatre-là sont vrais par défaut et doivent le rester — ce
    // sont des décisions écrites (transparence du débit, D49), pas des
    // consentements présumés. Si la garde les faisait rougir, elle serait
    // gourmande, pas juste.
    for (const key of ['buy_signals', 'credit_low', 'action_overdue', 'laura_enabled'] as const) {
      expect(NOTIFICATION_IN_APP_PREFERENCE_KEYS).toContain(key)
      expect(defaultNotificationPreferences[key]).toBe(true)
    }
  })
})

describe('notification item', () => {
  it('validates a well-formed notification', () => {
    const now = new Date().toISOString()
    const parsed = notificationSchema.parse({
      id: '11111111-1111-1111-1111-111111111111',
      type: 'buy_signal',
      title: 'Nouveau signal',
      body: 'Doctolib a publié un signal',
      link: '/accounts/abc',
      read_at: null,
      created_at: now,
    })
    expect(parsed.type).toBe('buy_signal')
    expect(parsed.read_at).toBeNull()
  })

  it('accepts the weekly_digest kind (veille digest dedup marker)', () => {
    const parsed = notificationSchema.parse({
      id: '11111111-1111-1111-1111-111111111111',
      type: 'weekly_digest',
      title: 'Votre veille de la semaine : 3 signaux sur 2 comptes',
      body: '',
      link: '/dashboard',
      read_at: null,
      created_at: new Date().toISOString(),
    })
    expect(parsed.type).toBe('weekly_digest')
  })

  it('accepts the credit_low kind (transparence billing)', () => {
    const parsed = notificationSchema.parse({
      id: '11111111-1111-1111-1111-111111111111',
      type: 'credit_low',
      title: 'Crédits bientôt épuisés',
      body: 'Il vous reste 3 analyses sur 50 ce cycle.',
      link: '/billing',
      read_at: null,
      created_at: new Date().toISOString(),
    })
    expect(parsed.type).toBe('credit_low')
  })

  it('accepts the action_overdue kind (digest actions en retard)', () => {
    const parsed = notificationSchema.parse({
      id: '11111111-1111-1111-1111-111111111111',
      type: 'action_overdue',
      title: '2 actions en retard',
      body: '« Relancer Marc » (Doctolib) — échéance dépassée, +1 autre.',
      link: '/dashboard',
      read_at: null,
      created_at: new Date().toISOString(),
    })
    expect(parsed.type).toBe('action_overdue')
  })

  it('#2404.3 — transporte le niveau nommé au wire', () => {
    const parsed = notificationSchema.parse({
      id: '11111111-1111-1111-1111-111111111111',
      type: 'buy_signal',
      title: 'Nouveau signal',
      body: '',
      link: null,
      read_at: null,
      created_at: new Date().toISOString(),
      level: 'critical',
    })
    expect(parsed.level).toBe('critical')
  })

  it('#2404.3 — un niveau absent reste `null`, jamais « information » par défaut', () => {
    const parsed = notificationSchema.parse({
      id: '11111111-1111-1111-1111-111111111111',
      type: 'buy_signal',
      title: 'Nouveau signal',
      body: '',
      link: null,
      read_at: null,
      created_at: new Date().toISOString(),
    })
    expect(parsed.level).toBeNull()
  })

  it('#2404.7 — transporte la source (ce que l’espace a branché) au wire', () => {
    const parsed = notificationSchema.parse({
      id: '11111111-1111-1111-1111-111111111111',
      type: 'client_reply',
      title: 'Une réponse est arrivée',
      body: '',
      link: '/inbox',
      read_at: null,
      created_at: new Date().toISOString(),
      source: 'Gmail',
    })
    expect(parsed.source).toBe('Gmail')
  })

  it('#2404.7 — une source non nommée reste `null`, jamais devinée (GA-18/GA-19)', () => {
    const parsed = notificationSchema.parse({
      id: '11111111-1111-1111-1111-111111111111',
      type: 'buy_signal',
      title: 'Nouveau signal',
      body: '',
      link: null,
      read_at: null,
      created_at: new Date().toISOString(),
    })
    expect(parsed.source).toBeNull()
  })

  it('rejects an unknown notification type', () => {
    expect(() =>
      notificationSchema.parse({
        id: '11111111-1111-1111-1111-111111111111',
        type: 'unknown_kind',
        title: 't',
        body: 'b',
        link: null,
        read_at: null,
        created_at: new Date().toISOString(),
      }),
    ).toThrow()
  })
})

/**
 * Présélections (#1938.6-9) — un JEU de réglages EXISTANTS, jamais un canal ou
 * un envoi neuf. `'custom'` n'a pas de valeur écrite : c'est ce qu'on DÉTECTE
 * quand aucune présélection nommée ne correspond, jamais un état qu'on stocke
 * (GA-26 — un second endroit qui mémoriserait « quelle présélection » finirait
 * par diverger des 7 réglages qu'il est censé résumer).
 */
describe('notification presets (#1938.6-9)', () => {
  it('accepte les 4 identifiants du contrat, et rien d’autre', () => {
    expect(NOTIFICATION_PRESET_IDS).toEqual(['urgent_only', 'daily_brief', 'weekly_recap', 'custom'])
    for (const id of NOTIFICATION_PRESET_IDS) expect(() => notificationPresetIdSchema.parse(id)).not.toThrow()
    expect(() => notificationPresetIdSchema.parse('inactivity_nudge')).toThrow()
  })

  it('les 3 présélections nommées ne portent QUE les 7 réglages de cadence commerciale', () => {
    for (const id of ['urgent_only', 'daily_brief', 'weekly_recap'] as const) {
      expect(Object.keys(NOTIFICATION_PRESETS[id]).sort()).toEqual([...NOTIFICATION_PRESET_KEYS].sort())
      // Ni les changelogs, ni l'assistante : ce sont des réglages À PART.
      expect(NOTIFICATION_PRESETS[id]).not.toHaveProperty('sidebar_changelog')
      expect(NOTIFICATION_PRESETS[id]).not.toHaveProperty('newsletter_changelog')
      expect(NOTIFICATION_PRESETS[id]).not.toHaveProperty('laura_enabled')
      expect(NOTIFICATION_PRESETS[id]).not.toHaveProperty('proactivity_cap')
    }
  })

  it('chaque présélection nommée est un patch valide (updateNotificationPreferencesSchema)', () => {
    for (const id of ['urgent_only', 'daily_brief', 'weekly_recap'] as const) {
      expect(() => updateNotificationPreferencesSchema.parse(NOTIFICATION_PRESETS[id])).not.toThrow()
    }
  })

  it('détecte « Urgent uniquement » quand les 7 réglages correspondent exactement', () => {
    const preferences = { ...defaultNotificationPreferences, ...NOTIFICATION_PRESETS.urgent_only }
    expect(detectNotificationPreset(preferences)).toBe('urgent_only')
  })

  it('détecte « Brief quotidien »', () => {
    const preferences = { ...defaultNotificationPreferences, ...NOTIFICATION_PRESETS.daily_brief }
    expect(detectNotificationPreset(preferences)).toBe('daily_brief')
  })

  it('détecte « Résumé hebdomadaire »', () => {
    const preferences = { ...defaultNotificationPreferences, ...NOTIFICATION_PRESETS.weekly_recap }
    expect(detectNotificationPreset(preferences)).toBe('weekly_recap')
  })

  it('SAIT DIRE NON — un seul réglage à la main sort de la présélection', () => {
    const preferences = { ...defaultNotificationPreferences, ...NOTIFICATION_PRESETS.urgent_only }
    expect(detectNotificationPreset({ ...preferences, relance_reminders: true })).toBe('custom')
  })

  // #2082.16 — depuis que plus aucun envoi sortant n'est coché d'avance, les
  // défauts serveur ÉGALENT « Urgent uniquement » : les trois alertes in-app,
  // aucun digest. Ce n'est pas une coïncidence à corriger, c'est la lecture
  // honnête de l'écran — et c'est la présélection que l'utilisateur voit
  // active tant qu'il n'a rien choisi.
  it('les défauts serveur égalent « Urgent uniquement » (aucun envoi coché d’avance)', () => {
    expect(detectNotificationPreset(defaultNotificationPreferences)).toBe('urgent_only')
  })

  it('N’ATTRAPE PAS ce qu’elle ne vise pas — un changement sur un réglage HORS présélection (changelog, assistante) ne fait pas sortir de la présélection active', () => {
    const preferences = {
      ...defaultNotificationPreferences,
      ...NOTIFICATION_PRESETS.weekly_recap,
      sidebar_changelog: false,
      laura_enabled: false,
    }
    expect(detectNotificationPreset(preferences)).toBe('weekly_recap')
  })
})

/**
 * Finalité métier obligatoire (#1938.10 — jamais une notification pour créer
 * de l'engagement seul). Le modèle : `chain.ts` impose déjà un `purpose` non
 * optionnel par parcours ; ici la garde porte sur le TYPE, pas l'instance.
 */
describe('notification type purposes (#1938.10 — jamais pour créer de l’engagement)', () => {
  it('lit un corpus non vide — chaque type ACTIF du contrat a sa finalité écrite', () => {
    expect(notificationTypeSchema.options.length).toBeGreaterThan(0)
    for (const type of notificationTypeSchema.options) {
      expect(NOTIFICATION_TYPE_PURPOSES[type]).toBeDefined()
      // Pas un mot-clé creux : une phrase qui dit VRAIMENT à quoi ça sert.
      expect(NOTIFICATION_TYPE_PURPOSES[type].length).toBeGreaterThan(20)
    }
  })

  it('SAIT DIRE NON — un type ajouté au schéma sans sa finalité écrite est détecté', () => {
    const tamperedTypes = [...notificationTypeSchema.options, 'inactivity_nudge'] as const
    const missing = tamperedTypes.filter(type => !(type in NOTIFICATION_TYPE_PURPOSES))
    expect(missing).toEqual(['inactivity_nudge'])
  })

  it('N’ATTRAPE PAS ce qu’elle ne vise pas — les 9 types réels du contrat passent tous', () => {
    const missing = notificationTypeSchema.options.filter(type => !(type in NOTIFICATION_TYPE_PURPOSES))
    expect(missing).toEqual([])
  })
})

/**
 * #2404.3 — LES QUATRE NIVEAUX NOMMÉS, JAMAIS POUR L'ENGAGEMENT.
 *
 * `notification.entity.ts` n'a qu'un `priority` 0-100 et un `type`, aucun
 * niveau nommé (Information / Action / Urgent / Critique). Cette fonction
 * DÉRIVE le niveau du score déjà calculé — elle n'invente aucune deuxième
 * mesure — et ne sert JAMAIS à décider si un message interrompt (ça reste le
 * budget de proactivité, `interruption-budget.ts` / `exceedsCap`).
 */
describe('#2404.3 — les quatre niveaux nommés (Information/Action/Urgent/Critique)', () => {
  it('porte exactement quatre niveaux, dans l’ordre croissant de gravité', () => {
    expect(NOTIFICATION_LEVELS).toEqual(['information', 'action', 'urgent', 'critical'])
  })

  it('un score NON MESURÉ ne rend aucun niveau — jamais un niveau par défaut deviné', () => {
    expect(notificationLevelFor(null)).toBeNull()
  })

  it('classe un score MESURÉ dans son quadrant, les bornes comprises', () => {
    expect(notificationLevelFor(0)).toBe('information')
    expect(notificationLevelFor(24)).toBe('information')
    expect(notificationLevelFor(25)).toBe('action')
    expect(notificationLevelFor(49)).toBe('action')
    expect(notificationLevelFor(50)).toBe('urgent')
    expect(notificationLevelFor(74)).toBe('urgent')
    expect(notificationLevelFor(75)).toBe('critical')
    expect(notificationLevelFor(100)).toBe('critical')
  })

  it('le schéma refuse toute valeur hors des quatre niveaux', () => {
    expect(notificationLevelSchema.safeParse('critical').success).toBe(true)
    expect(notificationLevelSchema.safeParse('urgentissime').success).toBe(false)
  })
})

/**
 * #2144.27 (épopée #2928) — PAS DEUX ALERTES IDENTIQUES SANS CONSOLIDATION.
 *
 * « Identique » : même TYPE, même LIEN (deux alertes qui pointent le même
 * endroit) et TOUTES DEUX NON LUES — deux alertes de nature différente, ou
 * dont l'une a déjà été lue, restent deux faits distincts, jamais fusionnés.
 * Tranché sans Louis (aucune définition écrite n'existait de « identique »
 * entre deux alertes de nature différente) : le TYPE fait partie de l'égalité
 * pour cette raison précise, jamais une seule alerte fourre-tout.
 */
function item(overrides: Partial<NotificationItem>): NotificationItem {
  return {
    id: overrides.id ?? '00000000-0000-0000-0000-000000000001',
    type: 'buy_signal',
    title: 'Signal',
    body: '',
    link: '/accounts/acc-1',
    read_at: null,
    created_at: '2026-09-27T10:00:00.000Z',
    level: null,
    source: null,
    source_url: null,
    source_kind: null,
    actor_name: null,
    derived: false,
    ...overrides,
  }
}

describe('#2144.27 — consolidation des alertes identiques', () => {
  it('fusionne deux alertes du même TYPE, du même LIEN, toutes deux non lues', () => {
    const older = item({ id: 'a', created_at: '2026-09-27T08:00:00.000Z' })
    const newer = item({ id: 'b', created_at: '2026-09-27T10:00:00.000Z' })
    const result = consolidateNotifications([older, newer])
    expect(result).toHaveLength(1)
    expect(result[0]?.id).toBe('b')
    expect(result[0]?.occurrences).toBe(2)
  })

  it('ne fusionne JAMAIS deux TYPES différents, même lien et même lecture', () => {
    const a = item({ id: 'a', type: 'buy_signal' })
    const b = item({ id: 'b', type: 'mission_end' })
    expect(consolidateNotifications([a, b])).toHaveLength(2)
  })

  it('#3920.5 — ne fusionne JAMAIS deux signaux de SOURCES différentes au même lien (annonce légale, « Votre CRM »)', () => {
    const legal = item({ id: 'a', source: 'Annonces légales officielles', created_at: '2026-09-27T10:00:00.000Z' })
    const crm = item({ id: 'b', source: 'Votre CRM', created_at: '2026-09-27T08:00:00.000Z' })
    const result = consolidateNotifications([legal, crm])
    expect(result.map(entry => entry.source)).toEqual(['Annonces légales officielles', 'Votre CRM'])
    // Même source : toujours fusionnées.
    expect(consolidateNotifications([legal, { ...legal, id: 'c' }])).toHaveLength(1)
  })

  it('ne fusionne JAMAIS une alerte déjà LUE avec une non lue — un fait lu reste un fait distinct', () => {
    const read = item({ id: 'a', read_at: '2026-09-27T09:00:00.000Z' })
    const unread = item({ id: 'b', read_at: null })
    const result = consolidateNotifications([read, unread])
    expect(result).toHaveLength(2)
  })

  it('ne fusionne jamais deux alertes SANS lien — chacune reste unique', () => {
    const a = item({ id: 'a', link: null })
    const b = item({ id: 'b', link: null })
    expect(consolidateNotifications([a, b])).toHaveLength(2)
  })

  it('une alerte seule porte `occurrences: 1`, jamais un compteur invisible', () => {
    const result = consolidateNotifications([item({ id: 'a' })])
    expect(result[0]?.occurrences).toBe(1)
  })

  it('garde l’ordre d’apparition de la première occurrence de chaque groupe', () => {
    const first = item({ id: 'a', link: '/accounts/acc-1', created_at: '2026-09-27T08:00:00.000Z' })
    const distinct = item({ id: 'x', type: 'mission_end', link: '/missions/m-1' })
    const dup = item({ id: 'b', link: '/accounts/acc-1', created_at: '2026-09-27T10:00:00.000Z' })
    const result = consolidateNotifications([first, distinct, dup])
    expect(result.map(entry => entry.id)).toEqual(['b', 'x'])
  })
})

describe('Théo D settings-compte.N1 — la plage de tranquillité', () => {
  it('accepte HH:MM, ou null pour « aucune plage »', () => {
    const ok = { ...defaultNotificationPreferences, quiet_hours_start: '21:00', quiet_hours_end: '07:30' }
    expect(() => notificationPreferencesSchema.parse(ok)).not.toThrow()
    expect(() => notificationPreferencesSchema.parse(defaultNotificationPreferences)).not.toThrow()
  })

  it('refuse une heure qui n’en est pas une', () => {
    for (const bad of ['24:00', '7:30', '21h00', '12:60']) {
      expect(() =>
        notificationPreferencesSchema.parse({ ...defaultNotificationPreferences, quiet_hours_start: bad }),
      ).toThrow()
    }
  })

  it('isInQuietHours — une plage de nuit enjambe minuit, dans le fuseau de la personne', () => {
    const range = { start: '21:00', end: '07:00', timeZone: 'Europe/Paris' }
    // 22:30 à Paris (UTC+2 en été) = 20:30 UTC
    expect(isInQuietHours(range, new Date('2026-07-01T20:30:00Z'))).toBe(true)
    // 08:00 à Paris = 06:00 UTC → hors plage
    expect(isInQuietHours(range, new Date('2026-07-01T06:00:00Z'))).toBe(false)
    // 03:00 à Paris = 01:00 UTC → dans la plage
    expect(isInQuietHours(range, new Date('2026-07-01T01:00:00Z'))).toBe(true)
  })

  it('isInQuietHours — une plage de jour ne enjambe pas, et début = fin ne silence jamais', () => {
    const day = { start: '12:00', end: '14:00', timeZone: 'UTC' }
    expect(isInQuietHours(day, new Date('2026-07-01T13:00:00Z'))).toBe(true)
    expect(isInQuietHours(day, new Date('2026-07-01T14:00:00Z'))).toBe(false)
    expect(isInQuietHours({ start: '09:00', end: '09:00', timeZone: 'UTC' }, new Date('2026-07-01T09:00:00Z'))).toBe(
      false,
    )
  })

  it('isInQuietHours — sans plage (null), rien n’est silencieux', () => {
    expect(isInQuietHours({ start: null, end: '07:00', timeZone: 'UTC' }, new Date())).toBe(false)
    expect(isInQuietHours({ start: '21:00', end: null, timeZone: 'UTC' }, new Date())).toBe(false)
  })
})
