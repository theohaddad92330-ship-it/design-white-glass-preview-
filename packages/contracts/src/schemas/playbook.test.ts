import { describe, expect, it } from 'vitest'
import {
  KPI_DICTIONARY,
  PLAYBOOK_DAILY_CAP,
  PLAYBOOK_KEYS,
  PLAYBOOK_MAX_PER_TARGET,
  playbookVerdict,
  updatePlaybookSchema,
  withinQuietHours,
  type PlaybookCandidate,
} from './playbook.js'

/** Un mardi 10 h — dans les heures d'envoi. */
const OK_TIME = new Date('2026-08-18T10:00:00')
/** Un dimanche. */
const SUNDAY = new Date('2026-08-16T10:00:00')
/** Un mardi 3 h du matin. */
const NIGHT = new Date('2026-08-18T03:00:00')

function candidate(over: Partial<PlaybookCandidate> = {}): PlaybookCandidate {
  return {
    enabled: true,
    hasReply: false,
    alreadySent: false,
    optedOut: false,
    silenceDays: 10,
    requiredSilenceDays: 7,
    recipient: 'marie@acme.fr',
    sentToday: 0,
    ...over,
  }
}

describe('les trois playbooks', () => {
  it('sont exactement TROIS — chaque playbook ajouté multiplie la surface d’accident', () => {
    expect(PLAYBOOK_KEYS).toHaveLength(3)
  })

  it('n’autorisent qu’UNE relance par cible — pas de cadence, pas d’escalade', () => {
    expect(PLAYBOOK_MAX_PER_TARGET).toBe(1)
  })
})

describe('updatePlaybookSchema', () => {
  it('n’arme rien tout seul — l’activation est explicite', () => {
    expect(updatePlaybookSchema.parse({ enabled: false }).enabled).toBe(false)
    expect(() => updatePlaybookSchema.parse({})).toThrow()
  })

  it('borne le silence exigé', () => {
    expect(() => updatePlaybookSchema.parse({ enabled: true, silenceDays: 0 })).toThrow()
    expect(() => updatePlaybookSchema.parse({ enabled: true, silenceDays: 400 })).toThrow()
  })
})

describe('withinQuietHours', () => {
  it('refuse le WEEK-END entièrement', () => {
    // Un e-mail commercial automatique reçu un samedi dit à son destinataire
    // qu'aucun humain ne l'a relu.
    expect(withinQuietHours(SUNDAY)).toBe(false)
  })

  it('refuse la nuit', () => {
    expect(withinQuietHours(NIGHT)).toBe(false)
  })

  it('accepte un mardi matin', () => {
    expect(withinQuietHours(OK_TIME)).toBe(true)
  })

  it('refuse à partir de 19 h pile', () => {
    expect(withinQuietHours(new Date('2026-08-18T19:00:00'))).toBe(false)
    expect(withinQuietHours(new Date('2026-08-18T18:59:00'))).toBe(true)
  })
})

describe('playbookVerdict — les six garde-fous', () => {
  it('laisse partir quand tout est vert', () => {
    expect(playbookVerdict(candidate(), OK_TIME)).toEqual({ allowed: true })
  })

  it('1. ARRÊTE dès qu’il y a une réponse', () => {
    // Relancer quelqu'un qui vient de répondre est la façon la plus rapide de
    // se faire ignorer.
    expect(playbookVerdict(candidate({ hasReply: true }), OK_TIME)).toEqual({
      allowed: false,
      reason: 'replied',
    })
  })

  it('2. n’envoie QU’UNE fois par cible', () => {
    expect(playbookVerdict(candidate({ alreadySent: true }), OK_TIME)).toEqual({
      allowed: false,
      reason: 'already_sent',
    })
  })

  it('3. respecte le désabonnement', () => {
    expect(playbookVerdict(candidate({ optedOut: true }), OK_TIME)).toEqual({
      allowed: false,
      reason: 'opted_out',
    })
  })

  it('4. respecte les heures calmes', () => {
    expect(playbookVerdict(candidate(), NIGHT)).toEqual({ allowed: false, reason: 'quiet_hours' })
    expect(playbookVerdict(candidate(), SUNDAY)).toEqual({ allowed: false, reason: 'quiet_hours' })
  })

  it('5. s’arrête au plafond quotidien', () => {
    // Une boucle qui s'emballe s'arrête sur un nombre, pas sur la vigilance de
    // quelqu'un.
    expect(playbookVerdict(candidate({ sentToday: PLAYBOOK_DAILY_CAP }), OK_TIME)).toEqual({
      allowed: false,
      reason: 'daily_cap',
    })
  })

  it('6. n’envoie RIEN tant que l’espace n’a pas armé', () => {
    expect(playbookVerdict(candidate({ enabled: false }), OK_TIME)).toEqual({
      allowed: false,
      reason: 'not_enabled',
    })
  })

  it('ne relance PAS sur un silence inconnu', () => {
    // Sans date, on ne sait pas depuis quand on attend, et relancer « au cas
    // où » est exactement ce qu'un client remarque.
    expect(playbookVerdict(candidate({ silenceDays: null }), OK_TIME)).toEqual({
      allowed: false,
      reason: 'not_silent_enough',
    })
  })

  it('ne relance pas avant le seuil de silence', () => {
    expect(playbookVerdict(candidate({ silenceDays: 3, requiredSilenceDays: 7 }), OK_TIME).allowed).toBe(false)
  })

  it('n’envoie rien sans destinataire', () => {
    expect(playbookVerdict(candidate({ recipient: null }), OK_TIME)).toEqual({
      allowed: false,
      reason: 'no_recipient',
    })
  })

  it('met « a répondu » AVANT « heures calmes »', () => {
    // Les deux bloquent, mais le premier ferme la séquence pour toujours alors
    // que le second la reporte : journaliser « heures calmes » sur une cible qui
    // a répondu ferait croire qu'un envoi partira demain.
    expect(playbookVerdict(candidate({ hasReply: true }), NIGHT)).toEqual({
      allowed: false,
      reason: 'replied',
    })
  })

  it('met « désabonné » AVANT le plafond quotidien', () => {
    // Un désabonnement n'est jamais « pour demain ».
    expect(playbookVerdict(candidate({ optedOut: true, sentToday: 999 }), OK_TIME)).toEqual({
      allowed: false,
      reason: 'opted_out',
    })
  })
})

describe('KPI_DICTIONARY', () => {
  it('dit pour CHAQUE indicateur ce qu’il n’compte pas', () => {
    // C'est le champ le plus utile du dictionnaire : deux personnes qui lisent
    // le même tableau en tirent sinon deux conclusions différentes.
    for (const kpi of KPI_DICTIONARY) {
      expect(kpi.excludes.trim().length).toBeGreaterThan(20)
      expect(kpi.definition.trim().length).toBeGreaterThan(20)
    }
  })

  it('n’a pas deux fois la même clé', () => {
    const keys = KPI_DICTIONARY.map(kpi => kpi.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('laisse `denominator` à null quand il n’y en a pas — pas une chaîne vide', () => {
    const noDenominator = KPI_DICTIONARY.filter(kpi => kpi.denominator === null)
    expect(noDenominator.length).toBeGreaterThan(0)
    for (const kpi of KPI_DICTIONARY) {
      expect(kpi.denominator === null || kpi.denominator.length > 10).toBe(true)
    }
  })
})
