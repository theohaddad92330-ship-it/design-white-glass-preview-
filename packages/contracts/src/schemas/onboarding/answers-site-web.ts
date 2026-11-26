import { z } from 'zod'

/**
 * #2640.2 — le site de l'entreprise, comme une réponse à part entière.
 *
 * Avant ce lot, `OnboardingCompanyPage.tsx` affichait `PrefillCompany.website`
 * une seule fois, sur la carte de confirmation, puis jetait la valeur : rien
 * ne l'écrivait dans `esn_profiles`, donc rien ne pouvait dire d'où elle
 * venait ni permettre de la corriger une fois le questionnaire commencé.
 *
 * `esn_website` fait de cette valeur une clé d'`EsnAnswers` comme les autres :
 * elle entre dans `PREFILLABLE_ANSWER_KEYS` (`onboarding.ts`), donc dans
 * `sanitizePrefilledFields` / `keepWhatNeverOverwrites`
 * (`esn-profile.controller.ts`) — la MÊME arbitration `applyFieldUpdates`
 * (`provenance.ts`) que tout autre champ du dépôt, jamais un second mécanisme
 * de correction (GA-26). Une fois confirmée ou corrigée, `stampAnswerMeta`
 * (`answer-meta.mapper.ts`) la marque `source: 'user'` — le registre ne
 * repasse plus jamais devant.
 *
 * `.catch(null)` comme le reste du corpus optionnel : une valeur mal formée
 * dégrade CE champ, jamais la lecture du profil entier.
 */
export const SITE_WEB_ANSWER_FIELDS = {
  esn_website: z.string().nullable().catch(null),
}
