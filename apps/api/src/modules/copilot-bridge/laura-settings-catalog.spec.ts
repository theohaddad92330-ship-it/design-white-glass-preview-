import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEAL_STAGE_SLA_BOUNDS, type NotificationPreferences } from '@bellum/contracts'
import type { PipelineStageSlaRow } from './deal-stage-sla.port'
import {
  assertNoForbiddenWritableSettingsScreen,
  buildNotificationsOverviewFields,
  buildPipelineOverviewFields,
  FORBIDDEN_SETTINGS_WRITE_SCREENS,
  LAURA_SETTINGS_SCREENS,
  WRITABLE_SETTINGS_SCREENS,
} from './laura-settings-catalog'

/**
 * #1822 (Lot 16) — LE CATALOGUE des réglages que Laura peut ÉCRIRE depuis la
 * conversation, et la garde qui l'empêche de s'étendre à une famille interdite.
 *
 * Trois preuves, comme toute garde du dépôt :
 *  (a) elle sait dire NON — `assertNoForbiddenWritableSettingsScreen` lève sur
 *      une liste empoisonnée ;
 *  (b) elle LIT quelque chose — le corpus réel n'est pas vide ;
 *  (c) elle n'attrape pas ce qu'elle ne vise pas — un écran légitime passe.
 */
/**
 * #1822 — LA GARDE DE L'INVENTAIRE.
 *
 * Ce qu'elle empêche : un écran de réglages AJOUTÉ au produit sans que personne
 * ait tranché ce que Laura en fait. Sans elle, l'inventaire serait juste le
 * jour où il a été écrit et faux trois semaines après — le motif que ce dépôt
 * nomme « une règle de design qui n'est pas gardée redevient une opinion ».
 *
 * Elle lit `items.settings.ts` SUR LE DISQUE, comme son jumeau Python
 * (`test_settings_screens_catalog.py`) : c'est la barre latérale des Réglages
 * qui est la source unique de ces routes, et une liste recopiée dérive au
 * premier écran ajouté.
 */
const ITEMS_SETTINGS_TS = join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'web',
  'src',
  'components',
  'sidebar',
  'items.settings.ts',
)

function routesDeclaredOnDisk(): string[] {
  const source = readFileSync(ITEMS_SETTINGS_TS, 'utf8')
  // `matchAll`, jamais un `RegExp.test()` réutilisé : le drapeau `g` est
  // STATEFUL, et ce piège a déjà rendu une garde de ce dépôt aveugle.
  return [...source.matchAll(/to:\s*'(\/[^']*)'/g)].map(match => match[1])
}

// ÉCRANS SANS ENTRÉE DE MENU — ce que cette garde a confondu jusqu'au 25/10/2026.
//
// Elle comparait l'inventaire de Laura à la BARRE LATÉRALE, comme si « écran de
// réglages » et « entrée de menu » étaient la même chose. Ils ne le sont plus :
// l'intégration II a retiré trois entrées (#4535, #4532, #4533) sans retirer les
// PAGES, qui restent atteignables et dont un commercial parle encore à Laura.
// Retirer ces écrans de l'inventaire pour faire taire la garde aurait rendu Laura
// amnésique sur trois pages vivantes — « une garde protège une règle, elle ne
// l'invente pas ».
//
// La règle est : Laura connaît CHAQUE écran de réglages. Un écran sans entrée de
// menu se nomme ICI, avec sa raison. La garde garde ses dents : une page neuve
// non inventoriée, ou une entrée de menu neuve non inventoriée, font toujours rougir.
const ECRANS_SANS_ENTREE_DE_MENU: Record<string, string> = {
  // #4535 (25/10/2026, défait la PR #1255) — l'entrée « Raccourcis clavier » a quitté la
  // barre latérale ; la page vit, et « Préférences » s'allume dessus (`searchKeys`).
  '/settings/shortcuts':
    "l'entrée de menu a été retirée par #4535 ; la page reste, ouverte depuis Préférences › Raccourcis",
  // #4532 / #4533 (25/10/2026, revient sur #3950) — « Mes données » est devenue deux onglets
  // Exports · Imports ; les deux pages gardent leur route propre, sans entrée dédiée.
  '/settings/vivier-export': "onglet d'Exports depuis #4532 ; la route reste celle de l'export ATS en lot",
  '/settings/import': "onglet d'Imports depuis #4533 ; la route reste celle de la reprise d'une base",
}

describe('laura-settings-catalog', () => {
  describe('l’inventaire des écrans de réglages (#1822)', () => {
    it('LIT quelque chose — la barre latérale réelle, et elle n’est pas vide', () => {
      const onDisk = routesDeclaredOnDisk()
      expect(onDisk.length).toBeGreaterThanOrEqual(18)
      expect(onDisk).toContain('/settings/profile')
      expect(LAURA_SETTINGS_SCREENS.length).toBe(onDisk.length + Object.keys(ECRANS_SANS_ENTREE_DE_MENU).length)
    })

    it('couvre EXACTEMENT les écrans de réglages — aucun en trop, aucun oublié', () => {
      const onDisk = new Set([...routesDeclaredOnDisk(), ...Object.keys(ECRANS_SANS_ENTREE_DE_MENU)])
      const inventoried = new Set<string>(LAURA_SETTINGS_SCREENS.map(screen => screen.route))
      expect([...inventoried].filter(route => !onDisk.has(route))).toEqual([])
      expect([...onDisk].filter(route => !inventoried.has(route))).toEqual([])
    })

    it('un écran sans entrée de menu EXISTE vraiment, et dit pourquoi il n’est plus au menu', () => {
      const sidebar = new Set(routesDeclaredOnDisk())
      for (const [route, raison] of Object.entries(ECRANS_SANS_ENTREE_DE_MENU)) {
        // La page doit exister sur le disque : sinon ce n'est pas une exception, c'est un reste.
        const page = join(
          ITEMS_SETTINGS_TS,
          '..',
          '..',
          '..',
          'routes',
          `${route.replace('/settings/', 'settings/')}.tsx`,
        )
        expect(`${route} → page présente : ${existsSync(page)}`).toBe(`${route} → page présente : true`)
        // Et elle ne doit PAS être au menu : une exception qui n'en est plus une se retire.
        expect(`${route} → encore au menu : ${sidebar.has(route)}`).toBe(`${route} → encore au menu : false`)
        expect(raison.length).toBeGreaterThan(30)
      }
    })

    it('chaque écran porte une posture ET sa raison — une posture sans raison est une opinion', () => {
      for (const screen of LAURA_SETTINGS_SCREENS) {
        expect(['write', 'redirect', 'forbidden']).toContain(screen.posture)
        expect(screen.reason.length).toBeGreaterThan(30)
      }
    })

    it('une ÉCRITURE nomme sa porte, et rien d’autre n’en a une', () => {
      for (const screen of LAURA_SETTINGS_SCREENS) {
        if (screen.posture === 'write') expect(screen.via).not.toBeNull()
        else expect(screen.via).toBeNull()
      }
    })

    it('les deux listes DÉRIVENT de l’inventaire — il n’y a plus qu’un seul endroit', () => {
      expect([...WRITABLE_SETTINGS_SCREENS].sort()).toEqual(
        LAURA_SETTINGS_SCREENS.filter(s => s.posture === 'write' && s.via === 'settings_overview')
          .map(s => s.route)
          .sort(),
      )
      expect([...FORBIDDEN_SETTINGS_WRITE_SCREENS].sort()).toEqual(
        LAURA_SETTINGS_SCREENS.filter(s => s.posture === 'forbidden')
          .map(s => s.route)
          .sort(),
      )
    })

    it('sait dire NON — un inventaire amputé d’un écran RÉEL est reproché', () => {
      // Preuve que la comparaison ci-dessus échoue vraiment : sans ça, un
      // inventaire vide passerait aussi bien qu'un inventaire juste.
      const onDisk = new Set(routesDeclaredOnDisk())
      const amputated: string[] = LAURA_SETTINGS_SCREENS.map<string>(s => s.route).filter(
        route => route !== '/settings/pipeline',
      )
      expect([...onDisk].filter(route => !amputated.includes(route))).toEqual(['/settings/pipeline'])
    })

    it('n’attrape pas ce qu’elle ne vise pas — `/accounts` vit dans une AUTRE barre', () => {
      // Témoin du cas légitime voisin : `/accounts` est une route bien réelle,
      // déclarée dans `items.ts`. L'exiger ici confondrait deux fichiers.
      expect(routesDeclaredOnDisk()).not.toContain('/accounts')
      expect(LAURA_SETTINGS_SCREENS.map(s => s.route)).not.toContain('/accounts')
    })
  })

  describe('la garde des familles interdites', () => {
    it('(b) LIT un corpus non vide — sinon rien n’est protégé', () => {
      expect(WRITABLE_SETTINGS_SCREENS.length).toBeGreaterThan(0)
      expect(FORBIDDEN_SETTINGS_WRITE_SCREENS.length).toBeGreaterThan(0)
    })

    it('(c) accepte la liste RÉELLE — deux écrans sûrs et vérifiables, aucun interdit', () => {
      expect(() => assertNoForbiddenWritableSettingsScreen(WRITABLE_SETTINGS_SCREENS)).not.toThrow()
    })

    it('(a) sait dire NON — une liste empoisonnée par un écran d’argent, de droits, de cloisonnement ou de sécurité lève', () => {
      for (const forbidden of FORBIDDEN_SETTINGS_WRITE_SCREENS) {
        expect(() => assertNoForbiddenWritableSettingsScreen([...WRITABLE_SETTINGS_SCREENS, forbidden])).toThrow()
      }
    })

    it('la liste interdite couvre bien argent, droits, cloisonnement et sécurité', () => {
      expect(FORBIDDEN_SETTINGS_WRITE_SCREENS).toEqual(
        expect.arrayContaining([
          '/billing',
          '/settings/security',
          '/settings/team',
          '/settings/legal-entities',
          '/settings/mes-donnees',
        ]),
      )
    })
  })

  describe('buildNotificationsOverviewFields', () => {
    const prefs: NotificationPreferences = {
      buy_signals: true,
      relance_reminders: false,
      weekly_summary: false,
      weekly_digest: true,
      credit_low: true,
      action_overdue: true,
      watchlist_daily_digest: false,
      sidebar_changelog: true,
      newsletter_changelog: true,
      // #2082.4/.5/.6 — les trois annonces d'engagement.
      meeting_prep: true,
      mission_end: true,
      client_reply: true,
      email_on_assignment: false,
      email_on_delegation: false,
      email_on_mention: false,
      email_on_manager_digest: false,
      laura_enabled: true,
      proactivity_cap: 3,
      email_language: 'fr',
      quiet_hours_start: null,
      quiet_hours_end: null,
    }

    it('rend un champ BOOLÉEN par interrupteur réglable, avec sa valeur actuelle', () => {
      const fields = buildNotificationsOverviewFields(prefs)
      const buySignals = fields.find(f => f.field === 'buy_signals')
      expect(buySignals).toEqual({ field: 'buy_signals', label: expect.any(String), type: 'bool', value: true })
    })

    it('n’expose PAS `email_language` — reporté par le client, jamais choisi en conversation', () => {
      const fields = buildNotificationsOverviewFields(prefs)
      expect(fields.find(f => f.field === 'email_language')).toBeUndefined()
    })

    it('expose `proactivity_cap` en entier borné 1-5, jamais en booléen', () => {
      const fields = buildNotificationsOverviewFields(prefs)
      const cap = fields.find(f => f.field === 'proactivity_cap')
      expect(cap).toEqual({
        field: 'proactivity_cap',
        label: expect.any(String),
        type: 'int',
        value: 3,
        min: 1,
        max: 5,
      })
    })
  })

  describe('buildPipelineOverviewFields', () => {
    const rows: PipelineStageSlaRow[] = [
      { stage: 'qualified', slaDays: 7, isDefault: true },
      { stage: 'confirmed', slaDays: 10, isDefault: false },
      { stage: 'profiles_submitted', slaDays: 7, isDefault: true },
      { stage: 'negotiation', slaDays: 21, isDefault: true },
      { stage: 'won', slaDays: null, isDefault: true },
    ]

    it('rend une étape par ligne à durée cible NON NULLE, avec les bornes du produit', () => {
      const fields = buildPipelineOverviewFields(rows)
      expect(fields).toHaveLength(4)
      expect(fields.find(f => f.field === 'confirmed')).toEqual({
        field: 'confirmed',
        label: expect.any(String),
        type: 'int',
        value: 10,
        min: DEAL_STAGE_SLA_BOUNDS.min,
        max: DEAL_STAGE_SLA_BOUNDS.max,
      })
    })

    it('exclut « won » — une affaire gagnée n’a pas de durée cible à régler', () => {
      const fields = buildPipelineOverviewFields(rows)
      expect(fields.find(f => f.field === 'won')).toBeUndefined()
    })
  })
})
