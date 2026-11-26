import { describe, expect, it } from 'vitest'
import { i18n } from '@/i18n'

/**
 * #4424.2 — « Calculé à partir de du profil de ton espace » : le gabarit disait « de » ET chaque élément
 * commençait par « du / de l’ / des ». L'article est porté par l'élément, le gabarit n'ajoute pas de « de ».
 */
describe('briefing — « calculé à partir … » (#4424.2)', () => {
  const items = [
    'meeting_type',
    'relationship_state',
    'brief_coverage',
    'esn_profile',
    'prior_meeting',
    'workspace_knowledge',
  ]
  for (const lng of ['fr', 'en']) {
    it.each(items)(`${lng} : %s ne double jamais la préposition`, async item => {
      await i18n.changeLanguage(lng)
      const from = i18n.t(`briefing:agenda.brief.derivedFrom.${item}`)
      const line = i18n.t('briefing:agenda.brief.ground.derived', { from })
      expect(line).not.toMatch(/\bde (du|des|de l’|de la)\b/i)
      expect(line).not.toMatch(/\bfrom (the|of)\b.*\bfrom\b/i)
    })
  }
})
