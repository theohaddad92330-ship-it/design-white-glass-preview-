import { describe, expect, it } from 'vitest'
import {
  gapBefore,
  LAST_NUDGE_AFTER_MS,
  MAX_CONSECUTIVE_MESSAGES,
  MAX_GAP_MS,
  MIN_GAP_MS,
  nextSilenceNudge,
  saysGoodbye,
  SOFT_NUDGE_AFTER_MS,
  splitMessages,
  type SilenceContext,
} from './multi-message'

describe('le découpage en bulles', () => {
  it('laisse un message simple entier', () => {
    expect(splitMessages('Ça démarre à 119 € HT par mois.')).toEqual(['Ça démarre à 119 € HT par mois.'])
  })

  it('découpe une réponse en trois temps', () => {
    // Le cas « explication en deux temps » du §4.11 : le principe, puis
    // l'exemple concret, puis la question.
    expect(splitMessages('Ah, intéressant.\n---\nOn lit ce qui existe déjà.\n---\nVous êtes combien ?')).toEqual([
      'Ah, intéressant.',
      'On lit ce qui existe déjà.',
      'Vous êtes combien ?',
    ])
  })

  it('RECOLLE ce qui dépasse le plafond au lieu de le jeter', () => {
    // Une réponse tronquée parce que le modèle a mis un séparateur de trop
    // serait un défaut invisible : le visiteur ne peut pas savoir qu'il lui
    // manque une phrase.
    const parts = splitMessages('un\n---\ndeux\n---\ntrois\n---\nquatre\n---\ncinq')
    expect(parts).toHaveLength(MAX_CONSECUTIVE_MESSAGES)
    expect(parts.at(-1)).toBe('trois\n\nquatre\n\ncinq')
    expect(parts.join(' ')).toContain('cinq')
  })

  it('ignore les séparateurs vides et les blancs', () => {
    expect(splitMessages('\n---\n\nBonjour\n---\n---\n')).toEqual(['Bonjour'])
    expect(splitMessages('   ')).toEqual([])
  })

  it('garde les sauts de ligne à l’intérieur d’une bulle', () => {
    expect(splitMessages('ligne un\nligne deux')).toEqual(['ligne un\nligne deux'])
  })
})

describe('le temps de frappe', () => {
  it('reste entre 700 et 1200 ms, quoi qu’il arrive', () => {
    for (const text of ['', 'ok', 'a'.repeat(500)]) {
      expect(gapBefore(text)).toBeGreaterThanOrEqual(MIN_GAP_MS)
      expect(gapBefore(text)).toBeLessThanOrEqual(MAX_GAP_MS)
    }
  })

  it('fait attendre plus longtemps sur un message plus long — comme quelqu’un qui tape', () => {
    expect(gapBefore('Oui.')).toBeLessThan(gapBefore('Alors, on ne le remplace pas : Boond gère votre delivery.'))
  })

  it('est déterministe — aucun tirage aléatoire', () => {
    expect(gapBefore('Vous êtes combien ?')).toBe(gapBefore('Vous êtes combien ?'))
  })
})

describe('les relances de silence', () => {
  const base: SilenceContext = { silentForMs: 0, nudgesSent: 0, saidGoodbye: false, hasSpoken: true }

  it('relance légèrement après 45 secondes', () => {
    expect(nextSilenceNudge({ ...base, silentForMs: SOFT_NUDGE_AFTER_MS })).toBe('soft')
    expect(nextSilenceNudge({ ...base, silentForMs: SOFT_NUDGE_AFTER_MS - 1 })).toBeNull()
  })

  it('relance une dernière fois après trois minutes, puis se tait', () => {
    expect(nextSilenceNudge({ ...base, nudgesSent: 1, silentForMs: LAST_NUDGE_AFTER_MS })).toBe('last')
    expect(nextSilenceNudge({ ...base, nudgesSent: 2, silentForMs: LAST_NUDGE_AFTER_MS * 10 })).toBeNull()
  })

  it('ne relance JAMAIS après un au revoir', () => {
    // Insister après « merci, au revoir » est la façon la plus sûre de laisser
    // un mauvais souvenir d'un échange qui s'était bien passé.
    expect(nextSilenceNudge({ ...base, saidGoodbye: true, silentForMs: LAST_NUDGE_AFTER_MS })).toBeNull()
  })

  it('ne relance pas quelqu’un qui n’a jamais écrit — ce n’est pas un silence, c’est une lecture', () => {
    expect(nextSilenceNudge({ ...base, hasSpoken: false, silentForMs: LAST_NUDGE_AFTER_MS })).toBeNull()
  })

  it('n’envoie jamais la deuxième relance à la place de la première', () => {
    expect(nextSilenceNudge({ ...base, nudgesSent: 0, silentForMs: LAST_NUDGE_AFTER_MS })).toBe('soft')
  })
})

describe('reconnaître un au revoir', () => {
  it.each(['Au revoir !', 'merci, bonne journée', 'À bientôt', 'ok bye', 'Tschüss', 'doei'])(
    'reconnaît %j',
    message => {
      expect(saysGoodbye(message)).toBe(true)
    },
  )

  it.each(['merci', 'merci pour la réponse', 'Merci, et sinon vous faites quoi sur le CRM ?', 'bonjour'])(
    'ne prend pas %j pour un adieu',
    message => {
      // « merci » tout seul est souvent le contraire d'un au revoir : quelqu'un
      // qui remercie une réponse et continue.
      expect(saysGoodbye(message)).toBe(false)
    },
  )
})
