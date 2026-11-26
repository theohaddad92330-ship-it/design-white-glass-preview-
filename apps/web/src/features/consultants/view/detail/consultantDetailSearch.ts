import { z } from 'zod'

/**
 * #2185.22/.24/.25 — LES ANCIENS `?tab=` DE LA FICHE TALENT, redirigés vers le
 * nouvel onglet — regroupement en six familles (brief nuit du 26/09/2026).
 *
 * Volontairement plus léger que `accountDetailSearch.ts` (le dossier de
 * compte, quatorze onglets → sept sections, sa propre notice de migration et
 * sa table de correspondance testée) : ici SIX clés fines changent de bouton,
 * jamais de contenu ni d'URL canonique — un lien `?tab=rates` continue de
 * fonctionner tel quel, `TalentDetailPage` sait déjà que `rates` vit dans le
 * bouton « Missions & disponibilité » ({@link groupOf} dans
 * `TalentDetailPage.tsx`). Rien à migrer PAR SECTION ici, donc pas de notice.
 *
 * `opportunities` est l'alias qu'un lien intuitif taperait pour l'ancien
 * intitulé de maquette (« Opportunités », jamais construit — #2185.22 l'a
 * refermé sur ce regroupement) ; il tombe sur `submissions`, la même famille.
 */
const TALENT_TAB_KEYS = [
  'profile',
  'skills',
  'documents',
  'delivery',
  'rates',
  'submissions',
  'missions',
  'notes',
  'consent',
  'identity',
  'studio',
] as const
type TalentTabKey = (typeof TALENT_TAB_KEYS)[number]

const TALENT_TAB_ALIASES: Record<string, TalentTabKey> = {
  opportunities: 'submissions',
  opportunites: 'submissions',
  activity: 'notes',
  activite: 'notes',
  compliance: 'consent',
  conformite: 'consent',
}

function resolveTalentTab(value: unknown): TalentTabKey | undefined {
  if (typeof value !== 'string') return undefined
  const key = value.trim().toLowerCase()
  if ((TALENT_TAB_KEYS as readonly string[]).includes(key)) return key as TalentTabKey
  return TALENT_TAB_ALIASES[key]
}

export const consultantDetailSearchSchema = z.object({
  tab: z.preprocess(resolveTalentTab, z.enum(TALENT_TAB_KEYS).optional()).catch(undefined),
})
