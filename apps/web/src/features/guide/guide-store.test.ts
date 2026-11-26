import { beforeEach, describe, expect, it } from 'vitest'
import { useGuideStore, type GuideSessionRequest, type GuideStep } from './guide-store'

const step = (anchor: string): GuideStep => ({ anchor, titleKey: `${anchor}.title`, bodyKey: `${anchor}.body` })

const walkthrough: GuideSessionRequest = {
  mode: 'tutoriel',
  level: 'walkthrough',
  steps: [step('retour.bouton-declencheur'), step('retour.panneau')],
}

beforeEach(() => {
  useGuideStore.setState({ session: null })
})

describe('le fil partagé des trois modes (#2213.21)', () => {
  it('ne montre rien tant que personne n’a rien demandé', () => {
    expect(useGuideStore.getState().session).toBeNull()
  })

  it('démarre au premier pas', () => {
    useGuideStore.getState().start(walkthrough)
    const session = useGuideStore.getState().session
    expect(session?.index).toBe(0)
    expect(session?.mode).toBe('tutoriel')
    expect(session?.level).toBe('walkthrough')
  })

  it('porte les trois modes sur la même infrastructure (#2213.18/.19/.20)', () => {
    for (const mode of ['tutoriel', 'action-guidee', 'intervention-proactive'] as const) {
      useGuideStore.getState().start({ ...walkthrough, mode })
      expect(useGuideStore.getState().session?.mode).toBe(mode)
    }
  })

  it('ne démarre rien sur une demande sans pas — une bulle qui ne désigne rien', () => {
    useGuideStore.getState().start({ ...walkthrough, steps: [] })
    expect(useGuideStore.getState().session).toBeNull()
  })

  /**
   * #2214.5 — « pas de pop-up automatique sur chaque bouton ». Deux aides
   * ancrées simultanées sont l'écran que la règle refuse : démarrer REMPLACE.
   */
  it('n’a jamais deux aides ancrées à la fois — démarrer remplace', () => {
    useGuideStore.getState().start(walkthrough)
    useGuideStore.getState().next()
    expect(useGuideStore.getState().session?.index).toBe(1)
    useGuideStore.getState().start({ ...walkthrough, mode: 'action-guidee' })
    const session = useGuideStore.getState().session
    expect(session?.mode).toBe('action-guidee')
    expect(session?.index).toBe(0)
  })
})

describe('avancer et reculer', () => {
  it('avance d’un pas', () => {
    useGuideStore.getState().start(walkthrough)
    useGuideStore.getState().next()
    expect(useGuideStore.getState().session?.index).toBe(1)
  })

  it('TERMINE au dernier pas — le fil ne boucle pas', () => {
    useGuideStore.getState().start(walkthrough)
    useGuideStore.getState().next()
    useGuideStore.getState().next()
    expect(useGuideStore.getState().session).toBeNull()
  })

  it('ne recule pas en dessous du premier pas', () => {
    useGuideStore.getState().start(walkthrough)
    useGuideStore.getState().previous()
    expect(useGuideStore.getState().session?.index).toBe(0)
  })

  it('ne lève pas quand on avance sans fil en cours', () => {
    expect(() => useGuideStore.getState().next()).not.toThrow()
    expect(() => useGuideStore.getState().previous()).not.toThrow()
  })
})

/**
 * #2212.40 — la sortie est toujours disponible. C'est la contrainte négative la
 * plus sévère du lot : un guide dont on ne peut pas sortir est pire que pas de
 * guide.
 */
describe('sortir (#2212.40)', () => {
  it('ferme le fil, depuis n’importe quel pas', () => {
    useGuideStore.getState().start(walkthrough)
    useGuideStore.getState().next()
    useGuideStore.getState().stop()
    expect(useGuideStore.getState().session).toBeNull()
  })

  it('ne lève pas quand il n’y a rien à fermer', () => {
    expect(() => useGuideStore.getState().stop()).not.toThrow()
  })
})

describe('écarter un pas dont la cible n’est pas là (#2212.37)', () => {
  it('passe au suivant en NOMMANT la raison', () => {
    useGuideStore.getState().start(walkthrough)
    useGuideStore.getState().skipCurrent('timeout')
    const session = useGuideStore.getState().session
    expect(session?.index).toBe(1)
    expect(session?.skipped).toEqual([{ anchor: 'retour.bouton-declencheur', reason: 'timeout' }])
  })

  /**
   * ⚠️ DOCTRINE — l'analytique produit mesure le PRODUIT, jamais la personne
   * (GA-240/241/264/266/267). La trace d'un pas écarté ne porte QUE l'ancrage
   * (qui nomme un écran et une fonction) et la raison. Un champ de plus ici
   * serait le début d'une mesure de la personne.
   */
  it('ne garde de l’absence que l’ancrage et la raison — rien sur la personne', () => {
    useGuideStore.getState().start(walkthrough)
    useGuideStore.getState().skipCurrent('permission')
    const trace = useGuideStore.getState().session?.skipped[0]
    expect(Object.keys(trace ?? {}).sort()).toEqual(['anchor', 'reason'])
  })

  it('termine le fil quand c’est le dernier pas qui est écarté', () => {
    useGuideStore.getState().start(walkthrough)
    useGuideStore.getState().next()
    useGuideStore.getState().skipCurrent('viewport')
    expect(useGuideStore.getState().session).toBeNull()
  })

  it('ne lève pas quand il n’y a aucun pas à écarter', () => {
    expect(() => useGuideStore.getState().skipCurrent('route')).not.toThrow()
  })
})
