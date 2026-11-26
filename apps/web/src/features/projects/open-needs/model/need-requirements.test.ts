import { describe, expect, it } from 'vitest'
import type { OpenNeedRow } from '@bellum/contracts'
import { needRequirementsPatch, needRequirementsToForm, needRequirementsToPatch } from './need-requirements'

type Requirements = Pick<
  OpenNeedRow,
  'languages' | 'clearances' | 'interview_rounds' | 'onsite_days_per_week' | 'freelance_excluded' | 'budget_validated'
>

const EMPTY_SCALARS = {
  interviewRounds: '',
  onsiteDaysPerWeek: '',
  freelanceExcluded: 'unknown' as const,
  budgetValidated: 'unknown' as const,
}
const EMPTY_SCALAR_PATCH = {
  interview_rounds: null,
  onsite_days_per_week: null,
  freelance_excluded: null,
  budget_validated: null,
}

describe('needRequirementsToForm', () => {
  it('montre l’état ACTUEL, dans la grammaire de saisie', () => {
    const need: Requirements = {
      languages: [
        { code: 'fr', level: 'natif' },
        { code: 'en', level: 'b2' },
      ],
      clearances: ['Confidentiel Défense'],
      interview_rounds: 2,
      onsite_days_per_week: 3,
      freelance_excluded: true,
      budget_validated: false,
    }
    expect(needRequirementsToForm(need)).toEqual({
      languages: 'fr:natif, en:b2',
      clearances: 'Confidentiel Défense',
      interviewRounds: '2',
      onsiteDaysPerWeek: '3',
      freelanceExcluded: 'yes',
      budgetValidated: 'no',
    })
  })

  it('un besoin servi par une API qui ne connaît pas encore ces champs ouvre sur du VIDE, pas sur une erreur', () => {
    // Le web se déploie en une minute, l'API en plusieurs. Pendant la fenêtre,
    // l'écran neuf lit une réponse ancienne — et `undefined.map` ferait tomber
    // toute la fiche, pas seulement deux lignes.
    expect(needRequirementsToForm({} as Requirements)).toEqual({
      languages: '',
      clearances: '',
      ...EMPTY_SCALARS,
    })
  })
})

describe('needRequirementsToPatch', () => {
  it('produit ce que le serveur attend', () => {
    expect(needRequirementsToPatch({ languages: 'en:c1', clearances: 'Secret', ...EMPTY_SCALARS })).toEqual({
      languages: [{ code: 'en', level: 'c1' }],
      clearances: ['Secret'],
      ...EMPTY_SCALAR_PATCH,
    })
  })

  it('#2323.38/.40 — un entier hors bornes retombe sur `null`, jamais une valeur devinée', () => {
    expect(
      needRequirementsToPatch({
        languages: '',
        clearances: '',
        ...EMPTY_SCALARS,
        interviewRounds: '11',
        onsiteDaysPerWeek: '6',
      }),
    ).toEqual({
      languages: [],
      clearances: [],
      interview_rounds: null,
      onsite_days_per_week: null,
      freelance_excluded: null,
      budget_validated: null,
    })
  })

  it('#2323.41/.42 — les trois états freelance/budget se lisent depuis le sélecteur', () => {
    expect(
      needRequirementsToPatch({
        languages: '',
        clearances: '',
        ...EMPTY_SCALARS,
        freelanceExcluded: 'no',
        budgetValidated: 'yes',
      }),
    ).toMatchObject({ freelance_excluded: false, budget_validated: true })
  })
})

describe('needRequirementsPatch', () => {
  const need: Requirements = {
    languages: [{ code: 'en', level: 'b2' }],
    clearances: ['Secret'],
    interview_rounds: 2,
    onsite_days_per_week: 1,
    freelance_excluded: false,
    budget_validated: true,
  }
  const form = {
    languages: 'en:b2',
    clearances: 'Secret',
    interviewRounds: '2',
    onsiteDaysPerWeek: '1',
    freelanceExcluded: 'no' as const,
    budgetValidated: 'yes' as const,
  }

  it('ne renvoie RIEN quand rien n’a bougé', () => {
    // Un `PATCH` inutile touche `updated_at` : la fiche se dirait « modifiée il
    // y a une minute » et ferait chercher un changement qui n'existe pas.
    expect(needRequirementsPatch(need, form)).toBeNull()
  })

  it('ne renvoie rien non plus quand seule la PONCTUATION change', () => {
    // La comparaison porte sur le résultat ANALYSÉ, pas sur le texte tapé.
    expect(needRequirementsPatch(need, { ...form, languages: ' en:b2 ', clearances: 'Secret,' })).toBeNull()
  })

  it('renvoie tout dès que l’une des valeurs bouge', () => {
    // Le formulaire édite tout d'un seul geste ; n'envoyer que le champ
    // modifié ferait dépendre le résultat de l'ordre dans lequel on a tapé.
    expect(needRequirementsPatch(need, { ...form, languages: 'en:c1' })).toEqual({
      languages: [{ code: 'en', level: 'c1' }],
      clearances: ['Secret'],
      interview_rounds: 2,
      onsite_days_per_week: 1,
      freelance_excluded: false,
      budget_validated: true,
    })
  })

  it('VIDER est un geste, et il part', () => {
    // « Cette habilitation n'est plus exigée » doit pouvoir se dire. Traiter
    // `[]` comme « rien à changer » laisserait le besoin bloquant pour toujours
    // sur une exigence retirée.
    expect(needRequirementsPatch(need, { ...form, clearances: '' })).toEqual({
      languages: [{ code: 'en', level: 'b2' }],
      clearances: [],
      interview_rounds: 2,
      onsite_days_per_week: 1,
      freelance_excluded: false,
      budget_validated: true,
    })
  })

  it('un niveau non reconnu ne compte pas comme un changement de niveau', () => {
    // « en:courant » laisse le niveau à `null` — c'est bien un changement par
    // rapport à `b2`, et il doit partir : sinon l'écran afficherait « b2 » que
    // l'utilisateur vient d'effacer.
    expect(needRequirementsPatch(need, { ...form, languages: 'en:courant' })).toMatchObject({
      languages: [{ code: 'en', level: null }],
    })
  })

  it('#2323.41 — repasser freelance exclu de « non » à « non renseigné » PART aussi', () => {
    expect(needRequirementsPatch(need, { ...form, freelanceExcluded: 'unknown' })).toEqual({
      languages: [{ code: 'en', level: 'b2' }],
      clearances: ['Secret'],
      interview_rounds: 2,
      onsite_days_per_week: 1,
      freelance_excluded: null,
      budget_validated: true,
    })
  })
})
