import { describe, expect, it } from 'vitest'
import { TEMPS1_REQUIRED_KEYS } from './onboarding.js'
import {
  countAnsweredRequired,
  parseRunProfileProvenance,
  resolveRunProfileMode,
  runProfileProvenanceSchema,
  TEMPS1_REQUIRED_COUNT,
  ranWithOlderProfile,
} from './run-profile.js'

/** Un profil complet : toutes les réponses obligatoires renseignées. */
function fullAnswers(): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const key of TEMPS1_REQUIRED_KEYS) {
    out[key] = key === 'consultant_size' || key === 'sales_team_size' ? '10-50' : ['valeur']
  }
  return out
}

describe('resolveRunProfileMode — le droit de dire « personnalisé » (§13, §53)', () => {
  it('profil complet → personnalisé, sans raison à donner', () => {
    const out = resolveRunProfileMode({ answers: fullAnswers() })
    expect(out).toEqual({
      mode: 'personalised',
      reason: null,
      answered: TEMPS1_REQUIRED_COUNT,
      required: TEMPS1_REQUIRED_COUNT,
    })
  })

  it('aucune réponse → générique, « pas de profil »', () => {
    expect(resolveRunProfileMode({ answers: null })).toMatchObject({
      mode: 'generic',
      reason: 'no_profile',
      answered: 0,
    })
    expect(resolveRunProfileMode({ answers: {} })).toMatchObject({ mode: 'generic', reason: 'no_profile' })
  })

  it('une seule réponse manquante suffit à retirer le « personnalisé »', () => {
    // Le seuil est TOUTES les réponses, pas une majorité : c'est le cœur du
    // reproche du rapport. « Presque complet » produisait un dossier générique
    // qui se présentait comme taillé sur mesure.
    const answers = fullAnswers()
    delete answers[TEMPS1_REQUIRED_KEYS[3]!]
    const out = resolveRunProfileMode({ answers })
    expect(out.mode).toBe('generic')
    expect(out.reason).toBe('incomplete_profile')
    expect(out.answered).toBe(TEMPS1_REQUIRED_COUNT - 1)
  })

  it('une chaîne vide ou un tableau vide ne comptent pas comme une réponse', () => {
    // Un questionnaire ouvert puis abandonné laisse des valeurs vides en base.
    // Les compter ferait passer l'abandon pour un profil exploitable.
    const answers = fullAnswers()
    answers[TEMPS1_REQUIRED_KEYS[0]!] = '   '
    answers[TEMPS1_REQUIRED_KEYS[1]!] = []
    expect(countAnsweredRequired(answers)).toBe(TEMPS1_REQUIRED_COUNT - 2)
  })

  it('un report explicite se distingue d’un profil jamais commencé', () => {
    // Les deux donnent un run générique, mais l'écran n'écrit pas la même
    // chose : « vous avez choisi de remplir plus tard » n'est pas « nous ne
    // savons rien de vous ».
    expect(resolveRunProfileMode({ answers: null, skippedByUser: true }).reason).toBe('skipped_by_user')
    expect(resolveRunProfileMode({ answers: fullAnswers(), skippedByUser: true }).mode).toBe('personalised')
  })

  it('un profil imposé par un opérateur s’explique comme tel, pas comme un oubli de l’utilisateur', () => {
    const out = resolveRunProfileMode({ answers: {}, overridden: true, skippedByUser: true })
    expect(out.reason).toBe('overridden')
  })
})

describe('runProfileProvenanceSchema — ce que le run garde', () => {
  it('accepte une provenance complète et garde les deux versions distinctes', () => {
    // Deux tables, deux questions : la révision des RÉPONSES et celle du
    // CONTEXTE dérivé. Les confondre perdrait la trace d'une régénération de
    // contexte à réponses inchangées.
    const parsed = runProfileProvenanceSchema.parse({
      mode: 'personalised',
      esnProfileVersion: 4,
      profileContextVersion: 2,
      answered: 10,
      required: 10,
      esnName: 'Skaizen',
    })
    expect(parsed.esnProfileVersion).toBe(4)
    expect(parsed.profileContextVersion).toBe(2)
    expect(parsed.reason).toBeNull()
  })

  it("#2453.8 — un run dont le MODE a écarté le profil est générique, et garde le mode qui l'a décidé", () => {
    const parsed = runProfileProvenanceSchema.parse({
      mode: 'generic',
      reason: 'context_mode',
      contextMode: 'neutral',
      answered: 10,
      required: 10,
    })
    expect(parsed.reason).toBe('context_mode')
    expect(parsed.contextMode).toBe('neutral')
    // Un run d'avant #2453.8 ne porte pas de mode : null, jamais « Mon activité » deviné.
    expect(
      runProfileProvenanceSchema.parse({ mode: 'personalised', answered: 10, required: 10 }).contextMode,
    ).toBeNull()
    expect(
      runProfileProvenanceSchema.safeParse({ mode: 'generic', contextMode: 'neutre', answered: 0, required: 10 })
        .success,
    ).toBe(false)
  })

  it('une valeur illisible en base redevient null, jamais « personnalisé » par défaut', () => {
    // Le pire défaut possible ici serait un défaut optimiste : un run dont la
    // provenance est corrompue se présenterait comme personnalisé.
    expect(parseRunProfileProvenance(null)).toBeNull()
    expect(parseRunProfileProvenance({ mode: 'inconnu' })).toBeNull()
    expect(parseRunProfileProvenance({ mode: 'generic', answered: 0, required: 10 })?.mode).toBe('generic')
  })
})

describe('ranWithOlderProfile — dire qu’un dossier vient d’un autre profil', () => {
  it('vrai quand la révision du run est INFÉRIEURE à celle d’aujourd’hui', () => {
    expect(ranWithOlderProfile({ esnProfileVersion: 3, currentEsnProfileVersion: 5 })).toBe(true)
  })

  it('faux quand les deux révisions sont les mêmes', () => {
    expect(ranWithOlderProfile({ esnProfileVersion: 5, currentEsnProfileVersion: 5 })).toBe(false)
  })

  it('faux dès qu’une révision manque — on n’avertit pas sur une comparaison impossible', () => {
    // Annoncer « profil différent » ici ferait relancer une analyse payante sans
    // raison. Les deux `null` disent la même chose : on ne sait pas.
    expect(ranWithOlderProfile({ esnProfileVersion: null, currentEsnProfileVersion: 5 })).toBe(false)
    expect(ranWithOlderProfile({ esnProfileVersion: 3, currentEsnProfileVersion: null })).toBe(false)
    expect(ranWithOlderProfile({ esnProfileVersion: 3 })).toBe(false)
  })

  it('faux quand la révision du run est SUPÉRIEURE — c’est une incohérence, pas une péremption', () => {
    expect(ranWithOlderProfile({ esnProfileVersion: 7, currentEsnProfileVersion: 5 })).toBe(false)
  })
})
