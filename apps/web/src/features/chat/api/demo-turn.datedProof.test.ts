import { describe, expect, it } from 'vitest'
import { DEMO_DATED_FACTS_BY_ACCOUNT } from '@/features/demo/demo-chat-script'
import { replyBadgesFor } from '@/features/chat/view/reply-badges'
import { demoTurn } from './demo-turn'

const NOW = new Date('2026-10-14T12:00:00Z')

/**
 * #4069.4 (recette 14/10, démo) — la question suggérée sur SNCF rendait « Trois signaux datés »
 * avec le badge « Aucune preuve actuelle » ; les questions libres nommant un compte analysé
 * tombaient sur « réponses préparées à l'avance ».
 */
describe('démo — le badge de preuve suit les faits datés que la réponse cite', () => {
  it('la question suggérée sur SNCF cite des signaux datés : jamais « Aucune preuve actuelle »', () => {
    const turn = demoTurn('Quels signaux justifient de prioriser SNCF ?', 'fallback')
    expect(turn.reply).toMatch(/Trois signaux datés/)
    expect(turn.context?.sources.length).toBeGreaterThan(0)
    expect(turn.context?.sources.every(source => Boolean(source.as_of))).toBe(true)
    expect(replyBadgesFor(turn.context, NOW).badges).not.toContain('no_current_proof')
  })

  it('des faits datés d’il y a quelques jours se lisent « Signal actuel vérifié »', () => {
    const turn = demoTurn('Que sais-tu de daté sur ce compte ?', 'fallback', undefined, 'Renault')
    expect(replyBadgesFor(turn.context, NOW).badges).toContain('current_signal_verified')
    expect(replyBadgesFor(turn.context, NOW).badges).not.toContain('no_current_proof')
  })

  it('SAIT DIRE NON — une réponse qui ne cite aucun fait daté garde « Aucune preuve actuelle »', () => {
    const turn = demoTurn('Où en est mon portefeuille ?', 'fallback')
    expect(turn.context?.sources).toEqual([])
    expect(replyBadgesFor(turn.context, NOW).badges).toContain('no_current_proof')
  })
})

describe('démo — une question libre qui NOMME un compte analysé sert sa réponse datée', () => {
  it.each(['Airbus', 'EDF', 'Renault', 'Thales'])('« que sais-tu de %s ? »', name => {
    const turn = demoTurn(`que sais-tu de ${name} ?`, 'fallback')
    expect(turn.reply).toBe(DEMO_DATED_FACTS_BY_ACCOUNT[name])
    expect(turn.context?.active?.account).toMatchObject({ present: true, name })
    expect(replyBadgesFor(turn.context, NOW).badges).not.toContain('no_current_proof')
  })

  it('« Où en est SNCF ? » sert la réponse datée de SNCF', () => {
    const turn = demoTurn('Où en est SNCF ?', 'fallback')
    expect(turn.reply).toMatch(/Trois signaux datés/)
  })

  it('insensible à la casse et aux accents', () => {
    expect(demoTurn('dis-moi tout sur THALES', 'fallback').reply).toBe(DEMO_DATED_FACTS_BY_ACCOUNT.Thales)
  })

  it('SAIT DIRE NON — deux comptes nommés : on ne devine pas lequel', () => {
    expect(demoTurn('Compare Renault et Airbus', 'fallback').reply).toBe('fallback')
  })

  it('SAIT DIRE NON — un mot qui contient le nom n’est pas le nom', () => {
    expect(demoTurn('Parle-moi de Thalesia', 'fallback').reply).toBe('fallback')
  })

  it('SAIT DIRE NON — un compte sans réponse datée écrite ne fabrique rien (Groupe BPCE)', () => {
    expect(demoTurn('Où en est BPCE ?', 'fallback').reply).toBe('fallback')
  })

  it('une amorce exacte garde la main sur la détection de nom', () => {
    const turn = demoTurn('Quels signaux justifient de prioriser SNCF ?', 'fallback')
    expect(turn.reply).toMatch(/Chaque signal du dossier porte sa source/)
  })
})
