import { describe, expect, it } from 'vitest'
import { guideDefinitionSchema } from '@bellum/contracts'
import { GUIDE_REGISTRY, guideSessionFromDefinition } from './guide-registry'
import { i18n } from '@/i18n'
import { isDeclaredGuideAnchor } from './guide-anchors'

/**
 * #2212.44/.45 — LE REGISTRE CENTRAL, UNIQUE ET VERSIONNÉ, DES GUIDES.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE TEST PROUVE, ET CE QU'IL NE PROUVE PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Il ne prouve pas que #2214.24 (le catalogue de 12 guides) est livré — sa
 * source est coupée, et la décision du 19/09/2026 le laisse hors de ce lot. Il
 * prouve que le SOCLE du registre existe : un endroit unique, versionné, dont
 * chaque entrée est un guide valide (schéma #2212.44/.45) et dont chaque pas
 * désigne un ancrage RÉELLEMENT déclaré (#2212.16) — jamais un sélecteur qu'on
 * devine.
 *
 * ⚠️ Le registre ne doit jamais être vide : un registre vide serait une garde
 * aveugle qui boucle sur rien (« une garde aveugle n'est pas une exemption »).
 */
describe('le registre central des guides (#2212.44/.45)', () => {
  it('n’est jamais vide', () => {
    expect(GUIDE_REGISTRY.length).toBeGreaterThan(0)
  })

  it('chaque entrée est un guide valide au sens du contrat', () => {
    for (const definition of GUIDE_REGISTRY) {
      const { steps: _steps, ...metadata } = definition
      expect(guideDefinitionSchema.safeParse(metadata).success).toBe(true)
    }
  })

  it('a des identifiants uniques — deux guides ne partagent jamais un id', () => {
    const ids = GUIDE_REGISTRY.map(definition => definition.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('a au moins un pas par guide — un guide sans pas ne désigne rien', () => {
    for (const definition of GUIDE_REGISTRY) {
      expect(definition.steps.length).toBeGreaterThan(0)
    }
  })

  it('ne désigne que des ancrages déclarés dans le catalogue (#2212.16)', () => {
    for (const definition of GUIDE_REGISTRY) {
      for (const step of definition.steps) {
        expect(isDeclaredGuideAnchor(step.anchor)).toBe(true)
        if (step.fallbackAnchor) expect(isDeclaredGuideAnchor(step.fallbackAnchor)).toBe(true)
      }
    }
  })

  it('dérive une session de guide fidèle à sa définition', () => {
    const definition = GUIDE_REGISTRY[0]!
    const session = guideSessionFromDefinition(definition)
    expect(session).toEqual({ mode: definition.mode, level: definition.level, steps: definition.steps })
  })
})

/**
 * #2214.24 — LES GUIDES 2 À 12. Ce que ces tests refusent :
 * - un catalogue ramené à moins de 12 guides (le guide 1 + les 11 parcours) ;
 * - un guide d'écran dont un pas n'exige pas SA route : lancé ailleurs, il
 *   désignerait un élément homonyme d'un autre écran ;
 * - un guide dont les pas visent les ancrages de plusieurs écrans : le guide
 *   ne navigue jamais seul (GA-371), un pas d'un autre écran sauterait ;
 * - un titre, un résumé ou un pas sans texte en français OU en anglais.
 */
describe('le catalogue des guides du produit (#2214.24)', () => {
  const screenGuides = GUIDE_REGISTRY.filter(
    definition => definition.help.screen !== null && definition.trigger === 'manual',
  )

  it('compte quinze guides : le coachmark de retour, les treize parcours d’écran (dont le Vivier, #2214.18) et le guide 1 auto (#2214.23)', () => {
    // Intégration matin 27/09 : chantier A/clôture comptait 14 (12 parcours +
    // premier-succes-bellumai) et soir-1 comptait 14 (13 parcours, dont
    // vivier-de-talents, sans premier-succes-bellumai) — les deux guides sont
    // RÉELS et distincts, la fusion les encaisse tous les deux : 15.
    expect(GUIDE_REGISTRY).toHaveLength(15)
    expect(screenGuides).toHaveLength(13)
  })

  it('chaque parcours d’écran est un parcours guidé de plusieurs pas, lancé à la main', () => {
    for (const definition of screenGuides) {
      expect(definition.level).toBe('walkthrough')
      expect(definition.trigger).toBe('manual')
      expect(definition.steps.length).toBeGreaterThanOrEqual(2)
    }
  })

  it('chaque pas exige la route de son écran', () => {
    for (const definition of screenGuides) {
      for (const step of definition.steps) {
        expect(step.requirements?.route, `${definition.id} → ${step.anchor}`).toBe(definition.help.screen!.route)
      }
    }
  })

  it('chaque pas vise un ancrage de l’espace de noms de son écran', () => {
    for (const definition of screenGuides) {
      const namespaces = new Set(definition.steps.map(step => step.anchor.split('.')[0]))
      expect(namespaces.size, definition.id).toBe(1)
    }
  })

  it('a tous ses textes en français ET en anglais', () => {
    const keys = GUIDE_REGISTRY.flatMap(definition => [
      definition.help.titleKey,
      definition.help.summaryKey,
      ...definition.steps.flatMap(step => [
        step.titleKey,
        step.bodyKey,
        ...(step.actions ?? []).map(action => action.labelKey),
      ]),
    ])
    expect(keys.length).toBeGreaterThan(0)
    for (const lng of ['fr', 'en']) {
      for (const key of keys) {
        expect(i18n.exists(key, { ns: 'guide', lng }), `${lng}:${key}`).toBe(true)
      }
    }
  })
})

/**
 * #3646 — Découvrir n'a plus de saisie libre : le guide désigne le rail de
 * critères, et aucun pas ne propose de « remplir » un champ qui n'existe plus.
 */
describe('le guide Découvrir sans saisie libre (#3646)', () => {
  const decouvrir = GUIDE_REGISTRY.find(definition => definition.id === 'decouvrir-des-comptes')!

  it('aucun pas ne remplit de champ', () => {
    for (const step of decouvrir.steps) expect(step.actions).toBeUndefined()
  })

  // #2212.15 — GARDE #3646 (pas d'exemple remis). Le type `fill-and-advance` et ses clés sont retirés : aucun pas ne
  // peut référencer une action qui n'existe plus, et aucune clé « actions » / « exampleValue » ne survit sans pas.
  it('#2212.15 — aucun pas ne référence une action inexistante, aucune clé d’action n’est orpheline (FR + EN)', () => {
    const KINDS = new Set(['advance'])
    const used = new Set<string>()
    for (const definition of GUIDE_REGISTRY) {
      for (const step of definition.steps) {
        for (const action of step.actions ?? []) {
          expect(KINDS.has(action.kind), `${definition.id} → ${action.kind}`).toBe(true)
          used.add(action.labelKey)
        }
      }
    }
    for (const lng of ['fr', 'en'] as const) {
      const bundle = i18n.getResourceBundle(lng, 'guide') as {
        guides: Record<string, { steps: Record<string, object> }>
      }
      for (const [guideId, guide] of Object.entries(bundle.guides)) {
        for (const [stepKey, step] of Object.entries(guide.steps ?? {})) {
          const base = `guides.${guideId}.steps.${stepKey}`
          const stepKeys = step as { actions?: Record<string, string>; exampleValue?: string }
          expect(stepKeys.exampleValue, `${lng}:${base}.exampleValue`).toBeUndefined()
          for (const action of Object.keys(stepKeys.actions ?? {})) {
            expect(used.has(`${base}.actions.${action}`), `${lng}:${base}.actions.${action}`).toBe(true)
          }
        }
      }
    }
  })

  it('le pas « recherche » reste ancré, sur le rail de critères', () => {
    expect(decouvrir.steps.some(step => step.anchor === 'decouvrir.recherche')).toBe(true)
  })
})

/**
 * #2214.23 — LE GUIDE 1 « PREMIER SUCCÈS BELLUMAI », le seul du registre qui
 * se déclenche seul (voir `use-first-success-guide.test.ts` pour LE QUAND).
 * Ce test-ci ne prouve que sa CATALOGATION : seul le mode qui parle sans
 * qu'on le lui demande peut être automatique (#2213.20), et il désigne un
 * ancrage RÉUTILISÉ, pas un ancrage inventé pour l'occasion.
 */
describe('le guide « premier succès BellumAI » (#2214.23)', () => {
  const guide = GUIDE_REGISTRY.find(definition => definition.id === 'premier-succes-bellumai')!

  it('existe, se déclenche seul, en intervention-proactive', () => {
    expect(guide).toBeDefined()
    expect(guide.trigger).toBe('automatic')
    expect(guide.mode).toBe('intervention-proactive')
  })

  it('désigne l’ancrage déjà posé du guide Laura, jamais un ancrage inventé', () => {
    expect(guide.steps).toHaveLength(1)
    expect(guide.steps[0]!.anchor).toBe('laura.saisie')
    expect(guide.steps[0]!.requirements?.route).toBe('/chat')
  })

  it('n’est pas compté comme un guide d’écran de #2214.24', () => {
    expect(guide.help.screen).toBeNull()
  })
})

/**
 * #2212.12 — LE GUIDE « ANALYSER UN COMPTE » ATTEND LE RÉSULTAT RÉEL, PAS LE
 * CLIC SUR « LANCER » (`useAnalysis.ts` dispatche l'événement une fois la
 * réponse serveur connue).
 */
describe('le résultat réel avant poursuite (#2212.12)', () => {
  const analyser = GUIDE_REGISTRY.find(definition => definition.id === 'analyser-un-compte')!
  const preparer = analyser.steps.find(step => step.anchor === 'analyse.preparer')!

  it('le guide est en mode action-guidee', () => {
    expect(analyser.mode).toBe('action-guidee')
  })

  it('le dernier pas attend le résultat réel du lancement, pas le clic', () => {
    expect(preparer.awaitsResult).toEqual({ event: 'bellum:guide-analysis-started' })
  })

  it('le premier pas avance toujours sur le clic — aucun résultat à attendre pour composer', () => {
    const composer = analyser.steps.find(step => step.anchor === 'analyse.composer')!
    expect(composer.awaitsResult).toBeUndefined()
  })
})

/**
 * #2214.18 (épopée #2788) — LE PREMIER GUIDE CIBLÉ RECRUTEUR : LE VIVIER.
 *
 * Trois vérifications de nuit successives (25/09 23:50, 26/09 10:15, 26/09
 * 12:35) ont conclu qu'aucun écran Vivier/Besoins/Matching n'existait pour
 * ancrer un guide Recruteur. C'est inexact : `/consultants` EST l'adresse du
 * Vivier (`VivierPage.tsx`, décision #2152.39/.40 du 16/09/2026) depuis le
 * 25/09/2026 à 01h53 — AVANT la première de ces trois vérifications. Ce bloc
 * prouve qu'un guide existe désormais, ciblé sur le seul persona recruteur
 * (jamais un filtre qui retirerait les onze autres guides de sa vue —
 * `c76_role_reordonne_jamais_ne_filtre` reste intact, `audience` ne fait ici
 * que gagner un membre).
 */
describe('le guide Vivier — premier guide ciblé Recruteur (#2214.18, épopée #2788)', () => {
  const vivier = GUIDE_REGISTRY.find(definition => definition.id === 'vivier-de-talents')

  it('existe et cible le persona recruteur, jamais tout le monde', () => {
    expect(vivier).toBeDefined()
    expect(vivier?.audience).toEqual(['recruteur'])
  })

  it('ouvre le Vivier — /consultants, pas un autre écran', () => {
    expect(vivier?.help.screen?.route).toBe('/consultants')
  })
})
