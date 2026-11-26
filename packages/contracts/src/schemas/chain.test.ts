import { describe, expect, it } from 'vitest'
import {
  chainFlowSteps,
  chainManualSteps,
  chainProblems,
  chainStepSchema,
  derivePosition,
  nextPosition,
  type Chain,
} from './chain.js'

const step = (position: number) => ({
  position,
  label: { fr: `Étape ${position}`, en: `Step ${position}` },
  actor: 'user' as const,
  expectedOutput: { fr: 'Quelque chose', en: 'Something' },
  automationLevel: 'n1_prepare' as const,
  requiredCapability: null,
})

const chain = (over: Partial<Chain> = {}): Chain => ({
  key: 'ouverture_compte',
  label: { fr: 'Ouverture', en: 'Opening' },
  domain: 'acquisition',
  subjectType: 'account',
  steps: [step(1), step(2), step(3), step(4), step(5)],
  gates: [
    {
      afterPosition: 3,
      gate: 'account_priority',
      question: { fr: 'On y va ?', en: 'Do we go?' },
      yesTargetPosition: 4,
      noTargetPosition: 2,
      reasonRequired: true,
    },
  ],
  returnLoop: { fr: 'Un signal nouveau rafraîchit le plan.', en: 'A new signal refreshes the plan.' },
  ...over,
})

describe('nextPosition', () => {
  it('avance d’une position quand il n’y a pas de porte', () => {
    expect(nextPosition(chain(), 1)).toEqual({ position: 2, blocked: false })
  })

  it('une porte SANS réponse ne fait JAMAIS avancer', () => {
    // C'est ce qui donne son sens à une porte : tant que personne n'a tranché,
    // le dossier reste visible à l'endroit où il attend. Sans cette règle, une
    // porte serait une étape de plus qu'on franchit en avançant.
    expect(nextPosition(chain(), 3)).toEqual({ position: 3, blocked: true })
    expect(nextPosition(chain(), 3, undefined)).toEqual({ position: 3, blocked: true })
  })

  it('un OUI avance vers la cible déclarée', () => {
    expect(nextPosition(chain(), 3, true)).toEqual({ position: 4, blocked: false })
  })

  it('un NON renvoie en AMONT, jamais à la fin', () => {
    // Une chaîne qui « échoue vers l'avant » ferait disparaître les dossiers
    // qu'on voulait justement rattraper.
    const result = nextPosition(chain(), 3, false)
    expect(result.position).toBe(2)
    expect(result.position).toBeLessThan(3)
  })

  it('la dernière position ne boucle pas — une chaîne se termine', () => {
    expect(nextPosition(chain(), 5)).toEqual({ position: 5, blocked: false })
    expect(nextPosition(chain(), 99)).toEqual({ position: 5, blocked: false })
  })

  it('une réponse à une position SANS porte est ignorée', () => {
    // Répondre là où rien n'est demandé ne doit pas produire un saut : la
    // réponse n'a pas de porte à ouvrir.
    expect(nextPosition(chain(), 1, false)).toEqual({ position: 2, blocked: false })
    expect(nextPosition(chain(), 1, true)).toEqual({ position: 2, blocked: false })
  })

  it('enchaîne plusieurs portes sans se perdre', () => {
    const twoGates = chain({
      gates: [
        { ...chain().gates[0]!, afterPosition: 2, yesTargetPosition: 3, noTargetPosition: 1 },
        { ...chain().gates[0]!, afterPosition: 4, yesTargetPosition: 5, noTargetPosition: 3 },
      ],
    })
    expect(nextPosition(twoGates, 2, true).position).toBe(3)
    expect(nextPosition(twoGates, 3).position).toBe(4)
    expect(nextPosition(twoGates, 4, false).position).toBe(3)
  })
})

describe('chainProblems', () => {
  it('accepte une chaîne bien formée', () => {
    expect(chainProblems(chain())).toEqual([])
  })

  it('refuse une cible NON en AVAL de sa porte', () => {
    const broken = chain({
      gates: [{ ...chain().gates[0]!, noTargetPosition: 5 }],
    })
    expect(chainProblems(broken)).toContain('cible NON 5 en aval de la porte 3')
  })

  it('refuse une cible OUI qui n’avance pas', () => {
    const broken = chain({ gates: [{ ...chain().gates[0]!, yesTargetPosition: 3 }] })
    expect(chainProblems(broken)).toContain("cible OUI 3 n'avance pas depuis 3")
  })

  it('refuse une porte hors de la chaîne', () => {
    const broken = chain({ gates: [{ ...chain().gates[0]!, afterPosition: 99 }] })
    expect(chainProblems(broken).some(problem => problem.includes('hors chaîne'))).toBe(true)
  })

  it('refuse des positions hors séquence', () => {
    const broken = chain({ steps: [step(1), step(3)] })
    expect(chainProblems(broken).some(problem => problem.includes('hors séquence'))).toBe(true)
  })
})

describe('les étapes hors outil (décision D48)', () => {
  it('sont marquées, et ne prétendent rien exécuter', () => {
    // Ce que le produit s'interdit est de PRÉTENDRE exécuter, pas de suivre.
    // Le drapeau porte exactement cette différence.
    const manual = chainStepSchema.parse({
      position: 11,
      label: { fr: 'Badge d’accès obtenu', en: 'Access badge issued' },
      actor: 'user',
      expectedOutput: { fr: 'Un badge remis', en: 'A badge handed over' },
      automationLevel: 'n0_advice',
      requiredCapability: null,
      outsideTool: true,
    })
    expect(manual.outsideTool).toBe(true)
    expect(manual.automationLevel).toBe('n0_advice')
  })

  it('une étape ordinaire reste « dans l’outil » sans rien déclarer', () => {
    // Le défaut compte : sans lui, chaque étape existante deviendrait
    // « hors outil » du jour où le champ est ajouté.
    const ordinary = chainStepSchema.parse({
      position: 1,
      label: { fr: 'Mission créée', en: 'Assignment created' },
      actor: 'user',
      expectedOutput: { fr: 'Une mission rattachée', en: 'A linked assignment' },
      automationLevel: 'n1_prepare',
      requiredCapability: null,
    })
    expect(ordinary.outsideTool).toBe(false)
  })
})

describe('chainFlowSteps / chainManualSteps', () => {
  const mixed = chain({
    steps: [
      { ...step(1), outsideTool: false },
      { ...step(2), outsideTool: false },
      { ...step(3), outsideTool: true },
    ],
    gates: [],
  })

  it('sépare ce qu’un objet sait dire de ce qui se fait ailleurs', () => {
    expect(chainFlowSteps(mixed).map(entry => entry.position)).toEqual([1, 2])
    expect(chainManualSteps(mixed).map(entry => entry.position)).toEqual([3])
  })

  it('LIT vraiment le drapeau — une chaîne sans geste hors outil n’en invente aucun', () => {
    expect(chainManualSteps(chain())).toEqual([])
    expect(chainFlowSteps(chain())).toHaveLength(5)
  })
})

describe('derivePosition', () => {
  const fact = (position: number) => ({ position, fact: `f${position}`, at: null, count: null })

  it('prend la position la plus AVANCÉE, pas la première trouvée', () => {
    // Le cas qui compte : un statut qui traîne derrière la réalité. Prendre la
    // première étape constatée retiendrait le dossier là où les faits l'ont
    // déjà dépassé.
    const derived = derivePosition(chain(), [fact(1), fact(2)])
    expect(derived).toMatchObject({ kind: 'at', position: 2 })
  })

  it('ignore un fait hors du flux dérivable', () => {
    const mixed = chain({
      steps: [{ ...step(1) }, { ...step(2) }, { ...step(3), outsideTool: true }],
      gates: [],
    })
    expect(derivePosition(mixed, [fact(1), fact(3)])).toMatchObject({ position: 1 })
  })

  it('AUCUN fait ⇒ le dossier n’est PAS dans le parcours, et surtout pas à l’étape 1', () => {
    // `null`, et non « à déterminer » : la première étape définit
    // l'APPARTENANCE. Mesuré en production le 05/09 — rendre « à déterminer »
    // désignait 464 projets sur 651, c'est-à-dire tous ceux qui ne sont pas des
    // appels d'offres. Une alerte qui vise la population entière n'est plus lue.
    expect(derivePosition(chain(), [])).toBeNull()
  })

  it('une porte que l’objet ne sait pas répondre ne bloque personne', () => {
    expect(derivePosition(chain(), [fact(3)])).toMatchObject({ position: 3, blockedGate: null })
  })

  it('une porte SANS décision laisse le dossier DEVANT elle', () => {
    const derived = derivePosition(chain(), [fact(3)], { account_priority: { decided: null, reason: null } })
    expect(derived).toMatchObject({ position: 3, blockedGate: 'account_priority' })
  })

  it('un OUI DÉBLOQUE sans avancer, un NON renvoie en amont AVEC son motif', () => {
    // Avancer sur un OUI placerait le dossier sur une étape dont le fait n'est
    // PAS établi — s'il l'était, elle serait déjà la position la plus avancée.
    // C'est l'étape inventée du §6, sous sa forme plausible.
    expect(derivePosition(chain(), [fact(3)], { account_priority: { decided: true, reason: null } })).toMatchObject({
      position: 3,
      blockedGate: null,
      gateReason: null,
    })
    expect(
      derivePosition(chain(), [fact(3)], { account_priority: { decided: false, reason: 'trop petit' } }),
    ).toMatchObject({
      position: 2,
      gateReason: 'trop petit',
    })
  })

  it('rend les preuves TRIÉES — l’historique du §5 se lit dans l’ordre', () => {
    const derived = derivePosition(chain(), [fact(3), fact(1), fact(2)])
    expect(derived?.evidence.map(entry => entry.position)).toEqual([1, 2, 3])
  })
})
