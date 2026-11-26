import { describe, expect, it } from 'vitest'
import {
  GUIDE_ABSENCE_REASONS,
  GUIDE_HELP_LEVELS,
  GUIDE_MODES,
  GUIDE_REFUSED_ANCHOR_NAMESPACES,
  GUIDE_TARGET_TIMEOUT_MS,
  guideAnchorIdSchema,
  guideDefinitionSchema,
  guideStepRequirementsSchema,
  guideTargetResolutionSchema,
} from './guide.js'

/**
 * #2214.2/.3/.4 — les TROIS niveaux d'aide, et seulement trois.
 */
describe('les trois niveaux d’aide', () => {
  it('sont exactement trois, du plus léger au plus engageant', () => {
    expect(GUIDE_HELP_LEVELS).toEqual(['tooltip', 'coachmark', 'walkthrough'])
  })
})

/**
 * #2213.18/.19/.20 — les TROIS modes, et seulement trois.
 */
describe('les trois modes', () => {
  it('sont exactement trois : tutoriel, action guidée, intervention proactive', () => {
    expect(GUIDE_MODES).toEqual(['tutoriel', 'action-guidee', 'intervention-proactive'])
  })
})

/**
 * #2212.16 — une cible est un ancrage DÉCLARÉ, jamais un sélecteur CSS.
 *
 * C'est la moitié de la réponse à #1787 (`ProductTourDialog.tsx:9-19`) : ce qui
 * est fragile, c'est de DEVINER la structure du DOM. Un ancrage déclaré est un
 * contrat que le composant tient, et qu'une garde peut vérifier.
 */
describe('un ancrage de guide', () => {
  it('accepte un identifiant déclaré, en segments', () => {
    expect(guideAnchorIdSchema.safeParse('decouvrir.barre-de-recherche').success).toBe(true)
    expect(guideAnchorIdSchema.safeParse('compte').success).toBe(true)
  })

  it.each(['.sidebar > a', '#nav', '[data-guide]', 'div a', 'Decouvrir', 'a..b', 'compte-'])(
    'refuse « %s » — un sélecteur CSS n’est pas un ancrage',
    candidate => {
      expect(guideAnchorIdSchema.safeParse(candidate).success).toBe(false)
    },
  )

  it('refuse le rail de navigation, que #1787 a écarté nommément', () => {
    for (const namespace of GUIDE_REFUSED_ANCHOR_NAMESPACES) {
      expect(guideAnchorIdSchema.safeParse(`${namespace}.bouton`).success).toBe(false)
    }
  })

  it('nomme au moins le rail de navigation parmi les refus', () => {
    expect(GUIDE_REFUSED_ANCHOR_NAMESPACES).toContain('rail-de-navigation')
  })
})

/**
 * #2212.31/.36/.37 — une cible absente se NOMME. Jamais de donnée inventée.
 */
describe('la résolution d’une cible', () => {
  it('accepte une cible résolue, en disant si elle l’a été par le secours', () => {
    const parsed = guideTargetResolutionSchema.safeParse({
      state: 'resolved',
      anchor: 'decouvrir.barre-de-recherche',
      viaFallback: true,
    })
    expect(parsed.success).toBe(true)
  })

  it('exige une RAISON nommée quand la cible est absente', () => {
    expect(guideTargetResolutionSchema.safeParse({ state: 'absent', anchor: 'compte.bouton' }).success).toBe(false)
    expect(
      guideTargetResolutionSchema.safeParse({
        state: 'absent',
        anchor: 'compte.bouton',
        reason: 'timeout',
      }).success,
    ).toBe(true)
  })

  it('refuse une raison hors catalogue — une absence ne s’improvise pas', () => {
    expect(
      guideTargetResolutionSchema.safeParse({
        state: 'absent',
        anchor: 'compte.bouton',
        reason: 'parce que',
      }).success,
    ).toBe(false)
  })

  it('couvre les cinq portes, le délai dépassé et l’ancrage jamais déclaré', () => {
    expect([...GUIDE_ABSENCE_REASONS].sort()).toEqual(
      ['anchor-undeclared', 'data', 'flag', 'permission', 'route', 'timeout', 'viewport'].sort(),
    )
  })
})

/**
 * #2212.41 — n'attend JAMAIS indéfiniment. Le délai vit à UN seul endroit (GA-26).
 */
describe('le délai d’attente d’une cible', () => {
  it('est fini, et assez court pour qu’une personne ne le vive pas comme un gel', () => {
    expect(Number.isFinite(GUIDE_TARGET_TIMEOUT_MS)).toBe(true)
    expect(GUIDE_TARGET_TIMEOUT_MS).toBeGreaterThan(0)
    expect(GUIDE_TARGET_TIMEOUT_MS).toBeLessThanOrEqual(3000)
  })
})

/**
 * #2212.32/.33/.34/.35 — les portes d'une étape sont toutes OPTIONNELLES : une
 * étape qui n'exige rien est valide, sinon chaque pas de guide paierait un
 * formulaire de pré-requis qu'il n'a pas.
 */
describe('les pré-requis d’une étape', () => {
  it('sont tous optionnels', () => {
    expect(guideStepRequirementsSchema.safeParse({}).success).toBe(true)
  })

  it('portent la route, la permission, la largeur minimale, la donnée et le drapeau', () => {
    const parsed = guideStepRequirementsSchema.safeParse({
      route: '/decouvrir',
      permission: 'accounts.read',
      minViewportWidth: 768,
      requiresData: 'account.any',
      featureFlag: 'guide.decouvrir',
    })
    expect(parsed.success).toBe(true)
  })

  it('refuse une largeur minimale absurde — une borne négative n’est pas une borne', () => {
    expect(guideStepRequirementsSchema.safeParse({ minViewportWidth: -1 }).success).toBe(false)
  })
})

/**
 * #2212.44/.45 — LE SCHÉMA D'UN GUIDE, AU-DELÀ DU PAS. Décision Louis
 * (19/09/2026, QCM sur #2212.45) : « je complète moi-même ». Le corps de #2212
 * s'arrête à « id ; versio[n] » — ces tests couvrent la complétion.
 */
describe('la définition d’un guide (#2212.44/.45)', () => {
  const base = {
    id: 'feedback-coachmark',
    version: 1,
    mode: 'tutoriel' as const,
    level: 'coachmark' as const,
    trigger: 'manual' as const,
    audience: [],
  }

  it('accepte un guide minimal, manuel', () => {
    expect(guideDefinitionSchema.safeParse(base).success).toBe(true)
  })

  it('accepte une audience vide par défaut — pas de ciblage n’est pas une erreur', () => {
    const { audience: _audience, ...withoutAudience } = base
    const parsed = guideDefinitionSchema.safeParse(withoutAudience)
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data.audience).toEqual([])
  })

  /**
   * #2214.17-.21 (épopée #2788) — `audience` est FERMÉE à une liste de
   * personas nommés, jamais une chaîne arbitraire (le docblock de
   * `GUIDE_PERSONAS` le dit : « cibler un guide ne doit jamais pouvoir
   * glisser vers un critère protégé »).
   */
  it('accepte un persona de la liste fermée', () => {
    expect(guideDefinitionSchema.safeParse({ ...base, audience: ['commercial'] }).success).toBe(true)
  })

  it('refuse une chaîne hors de la liste fermée — jamais un critère arbitraire', () => {
    expect(guideDefinitionSchema.safeParse({ ...base, audience: ['stagiaire'] }).success).toBe(false)
  })

  it('refuse une version à zéro ou négative — une version compte à partir de 1', () => {
    expect(guideDefinitionSchema.safeParse({ ...base, version: 0 }).success).toBe(false)
    expect(guideDefinitionSchema.safeParse({ ...base, version: -1 }).success).toBe(false)
  })

  it('refuse le niveau tooltip — un guide catalogué est forcément ANCRÉ', () => {
    expect(guideDefinitionSchema.safeParse({ ...base, level: 'tooltip' }).success).toBe(false)
  })

  it('refuse un mode hors catalogue', () => {
    expect(guideDefinitionSchema.safeParse({ ...base, mode: 'improvise' }).success).toBe(false)
  })

  it('refuse un déclenchement automatique hors du mode intervention proactive (#2213.20)', () => {
    expect(guideDefinitionSchema.safeParse({ ...base, trigger: 'automatic' }).success).toBe(false)
  })

  it('accepte un déclenchement automatique pour le mode intervention proactive', () => {
    expect(
      guideDefinitionSchema.safeParse({
        ...base,
        mode: 'intervention-proactive',
        trigger: 'automatic',
      }).success,
    ).toBe(true)
  })
})
