import { describe, expect, it } from 'vitest'
import { CONSULTING_DOMAIN_GROUPS, CONSULTING_DOMAINS } from '@bellum/contracts'
import en from '@/i18n/locales/en/onboarding.json'
import fr from '@/i18n/locales/fr/onboarding.json'
import { TEMPS1_STAGES } from './questions'

/**
 * Les 66 domaines du portefeuille (DATAFORGE V10) ont leur libellé dans LES
 * DEUX langues, et ce libellé est CELUI du contrat — pas une re-traduction qui
 * divergerait à la première retouche. Une option sans libellé s'afficherait
 * comme sa clé machine (`RISK_COMPLIANCE_AML`), la version i18n de la « clé
 * muette » déjà rencontrée en recette.
 */
describe('offerDomains — i18n FR + EN alignée sur le contrat', () => {
  const locales = [
    { lang: 'fr', file: fr, label: (domain: (typeof CONSULTING_DOMAINS)[number]) => domain.labelFr },
    { lang: 'en', file: en, label: (domain: (typeof CONSULTING_DOMAINS)[number]) => domain.labelEn },
  ] as const

  it.each(locales)('$lang : chaque code a son libellé, égal au contrat', ({ file, label }) => {
    const options = (file.questions as Record<string, { options?: Record<string, string> }>)['offerDomains']?.options
    expect(options).toBeDefined()
    for (const domain of CONSULTING_DOMAINS) {
      expect(options?.[domain.code], domain.code).toBe(label(domain))
    }
    // Et rien d'orphelin : une clé i18n sans domaine au contrat est un libellé mort.
    expect(Object.keys(options ?? {}).sort()).toEqual([...CONSULTING_DOMAINS.map(domain => domain.code)].sort())
  })

  it.each(locales)('$lang : chaque groupe d’affichage a son libellé', ({ file }) => {
    const groups = (file.groups as Record<string, Record<string, string>>)['offerDomains']
    expect(Object.keys(groups ?? {}).sort()).toEqual([...CONSULTING_DOMAIN_GROUPS].sort())
    for (const label of Object.values(groups ?? {})) expect(label.trim().length).toBeGreaterThan(3)
  })

  it('la question du flux porte les 66 domaines, sans présélection ni « Autre » (D-DF2)', () => {
    const question = TEMPS1_STAGES.flatMap(stage => stage.steps)
      .flatMap(step => step.questions)
      .find(candidate => candidate.key === 'offer_domains')
    expect(question).toBeDefined()
    if (question?.kind !== 'multi-grouped') throw new Error('offer_domains doit être un multi-grouped')
    const values = question.groups.flatMap(group => group.choices.map(choice => choice.value))
    expect(values.sort()).toEqual([...CONSULTING_DOMAINS.map(domain => domain.code)].sort())
    expect(question.allowOther).toBeUndefined()
    // Aucun kind de la question ne porte de défaut : le choix est EXPLICITE.
    expect('defaultValue' in question).toBe(false)
  })
})
