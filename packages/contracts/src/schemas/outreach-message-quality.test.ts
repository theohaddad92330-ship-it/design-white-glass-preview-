import { describe, expect, it } from 'vitest'
import {
  MESSAGE_QUALITY_CRITERIA,
  MESSAGE_SUBJECT_MAX_CHARS,
  MESSAGE_MAX_WORDS,
  scoreMessageQuality,
} from './outreach-message-quality.js'

/** Lot L-C (#4166) — le score de qualité d'un message, calculé sur place. */

const good = {
  channel: 'email' as const,
  subject: 'Votre poste de Lead Data',
  body: 'Bonjour Marie, j’ai vu votre offre de Lead Data chez Acme. Nous avons placé deux profils proches le mois dernier. Seriez-vous ouverte à un échange de 15 minutes cette semaine ?',
  personalization: ['Marie', 'Acme'],
}

describe('scoreMessageQuality', () => {
  it('un bon message tient tous les critères', () => {
    const score = scoreMessageQuality(good)
    expect(score.evaluated).toBe(true)
    if (score.evaluated) {
      expect(score.failed).toEqual([])
      expect(score.passed.length).toBe(MESSAGE_QUALITY_CRITERIA.length)
    }
  })

  it('plus de 120 mots rate « longueur »', () => {
    const body = `Bonjour Marie. ${'mot '.repeat(MESSAGE_MAX_WORDS)}Seriez-vous disponible ?`
    const score = scoreMessageQuality({ ...good, body })
    expect(score.evaluated && score.failed).toContain('length')
  })

  it('deux questions ratent « une seule question »', () => {
    const score = scoreMessageQuality({ ...good, body: 'Bonjour Marie, êtes-vous libre jeudi ? Ou plutôt vendredi ?' })
    expect(score.evaluated && score.failed).toContain('single_question')
  })

  it('aucune question rate aussi « une seule question » : il faut UNE demande claire', () => {
    const score = scoreMessageQuality({ ...good, body: 'Bonjour Marie, voici notre plaquette Acme.' })
    expect(score.evaluated && score.failed).toContain('single_question')
  })

  it('sans prénom ni compte ni variable : « personnalisation » ratée', () => {
    const score = scoreMessageQuality({
      ...good,
      body: 'Bonjour, nous placons des profils. Seriez-vous ouvert à un échange ?',
    })
    expect(score.evaluated && score.failed).toContain('personalization')
  })

  it('une variable {{prenom|…}} compte comme personnalisation', () => {
    const score = scoreMessageQuality({
      channel: 'email',
      subject: 'Votre poste',
      body: 'Bonjour {{prenom|à vous}}, un échange de 15 minutes vous irait-il ?',
    })
    expect(score.evaluated && score.failed).not.toContain('personalization')
  })

  it('un objet de plus de 60 caractères rate « objet court » ; un objet vide aussi', () => {
    const long = scoreMessageQuality({ ...good, subject: 'x'.repeat(MESSAGE_SUBJECT_MAX_CHARS + 1) })
    expect(long.evaluated && long.failed).toContain('short_subject')
    const empty = scoreMessageQuality({ ...good, subject: '  ' })
    expect(empty.evaluated && empty.failed).toContain('short_subject')
  })

  it('LinkedIn n’a pas d’objet : le critère n’est pas évalué, il ne compte pas', () => {
    const score = scoreMessageQuality({ ...good, channel: 'linkedin', subject: undefined })
    expect(score.evaluated).toBe(true)
    if (score.evaluated) {
      expect(score.passed).not.toContain('short_subject')
      expect(score.failed).not.toContain('short_subject')
      expect(score.notEvaluable).toContain('short_subject')
    }
  })

  it('une variable sans valeur ni repli est détectée', () => {
    const score = scoreMessageQuality({ ...good, body: 'Bonjour {{prenom}}, un échange de 15 minutes, Acme ?' })
    expect(score.evaluated && score.failed).toContain('empty_variable')
    const withFallback = scoreMessageQuality({
      ...good,
      body: 'Bonjour {{prenom|Marie}}, un échange de 15 minutes, Acme ?',
    })
    expect(withFallback.evaluated && withFallback.failed).not.toContain('empty_variable')
  })

  it('le jargon est nommé', () => {
    const score = scoreMessageQuality({
      ...good,
      body: 'Bonjour Marie, notre solution innovante apporte de la synergie chez Acme. Un échange ?',
    })
    expect(score.evaluated && score.failed).toContain('jargon')
    if (score.evaluated) expect(score.jargon).toEqual(expect.arrayContaining(['solution innovante', 'synergie']))
  })

  it('un corps vide n’est PAS évaluable (jamais « 0 »)', () => {
    expect(scoreMessageQuality({ ...good, body: '   ' })).toEqual({ evaluated: false })
    expect(scoreMessageQuality({ ...good, body: undefined })).toEqual({ evaluated: false })
  })

  it('l’appel et la tâche ne se notent pas', () => {
    expect(scoreMessageQuality({ ...good, channel: 'call' })).toEqual({ evaluated: false })
  })
})
