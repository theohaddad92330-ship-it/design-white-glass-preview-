import { describe, expect, it } from 'vitest'
import type { ChatbotStageReading } from '@/lib/chatbot-funnel'
import { decrireMediane, decrireTaux, libelleEtape, raisonDeLAbsence, segmentsDuTunnel } from './funnel.logic'

const MESUREE: ChatbotStageReading = {
  stage: 'widget_opened',
  measured: true,
  count: 200,
  sessions: 180,
  passRate: { kind: 'measured', ratio: 0.05 },
  shareOfEntry: { kind: 'measured', ratio: 0.05 },
}

const ABSENTE: ChatbotStageReading = {
  stage: 'qualified',
  measured: false,
  unmeasured: 'not_instrumented',
  passRate: { kind: 'unmeasured' },
  shareOfEntry: { kind: 'unmeasured' },
}

describe('libelleEtape', () => {
  it('nomme les cinq étapes du tunnel de #1659', () => {
    expect(libelleEtape('visitors')).toBe('Visiteurs')
    expect(libelleEtape('widget_opened')).toBe('Widget ouvert')
    expect(libelleEtape('conversation')).toBe('Conversation')
    expect(libelleEtape('qualified')).toBe('Qualification atteinte')
    expect(libelleEtape('booked')).toBe('RDV pris')
  })

  it('ne recopie AUCUN seuil chiffré dans un libellé (GA-26)', () => {
    // Le seuil de qualification vit dans le routage du chatbot du site. L'écrire
    // ici en ferait une seconde valeur, qui divergerait le jour où il change.
    for (const stage of ['visitors', 'widget_opened', 'conversation', 'qualified', 'booked'] as const) {
      expect(libelleEtape(stage)).not.toMatch(/\d/)
    }
  })
})

describe('decrireTaux — une absence NOMMÉE, jamais « 0 % »', () => {
  it('formate un taux mesuré en part de cent', () => {
    expect(decrireTaux({ kind: 'measured', ratio: 0.05 })).toBe('5.0 %')
  })

  it('un taux mesuré à zéro reste « 0,0 % » — c’est une vraie mesure', () => {
    // Zéro passage EST une information : personne n'a franchi l'étape. Ce n'est
    // pas le zéro que la doctrine interdit, qui est celui d'une ABSENCE.
    expect(decrireTaux({ kind: 'measured', ratio: 0 })).toBe('0.0 %')
  })

  it('l’entrée du tunnel n’a pas de taux, et le DIT', () => {
    expect(decrireTaux({ kind: 'no_previous' })).toBe('entrée du tunnel')
  })

  it('sous le seuil : la phrase nomme le seuil ET le compte, sans afficher de taux', () => {
    const phrase = decrireTaux({ kind: 'below_threshold', sessions: 3, minSessions: 5 })
    expect(phrase).toContain('moins de 5 sessions')
    expect(phrase).toContain('(3)')
    expect(phrase).not.toContain('%')
  })

  it('sans dénominateur mesuré : aucun chiffre, jamais « 0 % »', () => {
    const phrase = decrireTaux({ kind: 'unmeasured' })
    expect(phrase).toContain('dénominateur non mesuré')
    expect(phrase).not.toContain('%')
    expect(phrase).not.toMatch(/\b0\b/)
  })
})

describe('raisonDeLAbsence — deux causes, deux gestes', () => {
  it('distingue « rien ne l’émet » de « la source n’a pas répondu »', () => {
    const panne = raisonDeLAbsence('source_unavailable')
    const trou = raisonDeLAbsence('not_instrumented')
    expect(panne).not.toBe(trou)
    expect(panne).toContain('n’a pas répondu')
    expect(trou).toContain('instrumentation')
  })

  it('aucune des deux ne prononce « zéro » comme une valeur', () => {
    expect(raisonDeLAbsence('not_instrumented')).not.toMatch(/\b0\b/)
  })
})

describe('decrireMediane', () => {
  it('non instrumentée : la phrase dit POURQUOI, et ne chiffre rien', () => {
    const phrase = decrireMediane({ kind: 'not_instrumented' })
    expect(phrase).toContain('non instrumentée')
    expect(phrase).not.toMatch(/\d/)
  })

  it('retenue par le seuil : elle NOMME le seuil, elle ne l’affiche pas à 0', () => {
    const phrase = decrireMediane({ kind: 'below_threshold', sessions: 4, minSessions: 5 })
    expect(phrase).toContain('moins de 5 sessions')
    expect(phrase).toContain('désigne quelqu’un')
  })

  it('mesurée : la valeur et son effectif', () => {
    expect(decrireMediane({ kind: 'measured', value: 12.5, sessions: 40 })).toBe('12.5 sur 40 sessions')
  })

  it('source muette : ce n’est pas « pas encore assez de sessions »', () => {
    expect(decrireMediane({ kind: 'source_unavailable' })).not.toContain('sessions')
  })
})

describe('segmentsDuTunnel — la barre ne dessine QUE ce qui est mesuré', () => {
  it('une étape non mesurée SORT de la barre et part dans les absentes', () => {
    const { segments, absentes } = segmentsDuTunnel([MESUREE, ABSENTE])
    expect(segments).toEqual([{ label: 'Widget ouvert', value: 200 }])
    expect(absentes).toEqual([{ libelle: 'Qualification atteinte', raison: raisonDeLAbsence('not_instrumented') }])
  })

  it('sait dire NON — jamais un segment de largeur nulle pour une absence', () => {
    // C'est LE défaut que ce module empêche : `SegmentBar` ne reçoit que des
    // nombres, elle ne peut pas savoir qu'un 0 vient d'une absence, et un
    // segment à zéro se lirait « personne n'y est passé ».
    const { segments } = segmentsDuTunnel([ABSENTE])
    expect(segments).toEqual([])
    expect(segments.some(segment => segment.value === 0)).toBe(false)
  })

  it('un vrai zéro mesuré RESTE dans la barre — c’est une mesure, pas une absence', () => {
    const zeroMesure: ChatbotStageReading = {
      stage: 'booked',
      measured: true,
      count: 0,
      sessions: 0,
      passRate: { kind: 'measured', ratio: 0 },
      shareOfEntry: { kind: 'measured', ratio: 0 },
    }
    expect(segmentsDuTunnel([zeroMesure]).segments).toEqual([{ label: 'RDV pris', value: 0 }])
  })

  it('conserve l’ordre du parcours — l’écran affiche ce qu’il reçoit', () => {
    const visiteurs: ChatbotStageReading = { ...MESUREE, stage: 'visitors', count: 4000, sessions: 4000 }
    const { segments } = segmentsDuTunnel([visiteurs, MESUREE])
    expect(segments.map(segment => segment.label)).toEqual(['Visiteurs', 'Widget ouvert'])
  })
})
