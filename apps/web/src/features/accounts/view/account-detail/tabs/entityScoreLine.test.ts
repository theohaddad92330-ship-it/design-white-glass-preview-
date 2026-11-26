import type { AccessEntityAxis, AccessEntityReasonFact } from '@bellum/contracts'
import i18next from 'i18next'
import { describe, expect, it } from 'vitest'
import accessEn from '@/i18n/locales/en/access.json'
import accessFr from '@/i18n/locales/fr/access.json'
import { entityScoreLine } from './entityScoreLine'

async function tIn(lng: 'fr' | 'en') {
  const instance = i18next.createInstance()
  await instance.init({
    lng,
    resources: { fr: { access: accessFr }, en: { access: accessEn } },
    defaultNS: 'access',
    interpolation: { escapeValue: false },
  })
  return instance.t.bind(instance)
}

const facts: AccessEntityReasonFact[] = [
  { code: 'kind', kind: 'subsidiary', points: 25 },
  { code: 'contacts', count: 3, points: 18 },
]
const missing: AccessEntityAxis[] = ['sites', 'rank1']

/** #4016 L9 — le score d'une filiale / BU ne s'affiche JAMAIS nu : ses axes, et ce qui n'a pas pu être évalué est nommé. */
describe('entityScoreLine — le score d’entité avec ses axes (#4016 L9)', () => {
  it('dit le total, les points de CHAQUE axe, puis nomme les axes non renseignés (FR)', async () => {
    const line = entityScoreLine({ score: 43, reason_facts: facts, missing_axes: missing }, await tIn('fr'))
    expect(line).toBe(
      '43 points, 2 axes sur 4 évalués : filiale identifiée +25 · 3 contacts déjà identifiés +18. Non renseigné : sites, rang 1.',
    )
  })

  it('dit la même chose en anglais', async () => {
    const line = entityScoreLine({ score: 43, reason_facts: facts, missing_axes: missing }, await tIn('en'))
    expect(line).toBe(
      '43 points, 2 axes out of 4 evaluated: subsidiary identified +25 · 3 contacts already identified +18. Not provided: sites, tier-1.',
    )
  })

  it('ne nomme pas d’axes manquants quand tous ont un fait', async () => {
    const all: AccessEntityReasonFact[] = [
      ...facts,
      { code: 'sites', count: 1, points: 8 },
      { code: 'rank1', points: 5 },
    ]
    const line = entityScoreLine({ score: 56, reason_facts: all, missing_axes: [] }, await tIn('fr'))
    expect(line).not.toContain('Non renseigné')
    expect(line).toContain('56 points, 4 axes sur 4 évalués')
  })

  // ⚠️ #4016.L9.a revient sur GA-58, délibérément — Louis 13/10/2026 : un score
  // s'affiche dès DEUX axes évaluables (le 11/10, un seul fait suffisait).
  it('SAIT DIRE NON — un seul axe évaluable ne fait pas un score (#4016.L9.a)', async () => {
    const seul: AccessEntityReasonFact[] = [{ code: 'kind', kind: 'subsidiary', points: 25 }]
    expect(
      entityScoreLine({ score: 25, reason_facts: seul, missing_axes: ['contacts', 'sites', 'rank1'] }, await tIn('fr')),
    ).toBeNull()
  })

  it('SAIT DIRE NON — sans aucun fait, pas de score : jamais « 0 point »', async () => {
    expect(
      entityScoreLine(
        { score: 0, reason_facts: [], missing_axes: ['kind', 'contacts', 'sites', 'rank1'] },
        await tIn('fr'),
      ),
    ).toBeNull()
  })

  it('SAIT DIRE NON — un ancien serveur sans points ne montre pas un total qu’il ne peut pas décomposer', async () => {
    const legacy = [{ code: 'kind', kind: 'bu' }] as unknown as AccessEntityReasonFact[]
    expect(entityScoreLine({ score: 25, reason_facts: legacy }, await tIn('fr'))).toBeNull()
  })

  it('SAIT DIRE NON — un total qui ne se décompose pas en ses axes n’est pas montré', async () => {
    expect(entityScoreLine({ score: 99, reason_facts: facts, missing_axes: [] }, await tIn('fr'))).toBeNull()
  })
})
