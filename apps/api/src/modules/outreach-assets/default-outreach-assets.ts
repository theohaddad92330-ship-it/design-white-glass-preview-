import type { OutreachAssetCategory, OutreachAssetUsageRights } from '@bellum/contracts'

/**
 * Le catalogue de démarrage — lazy-seedé la première fois que la bibliothèque
 * d'un workspace est ouverte (`OutreachAssetService.listForWorkspace`), même
 * geste que `DEFAULT_LIBRARY_ITEMS`. Après le semis, chaque asset est une ligne
 * normale, éditable ou supprimable par l'équipe.
 *
 * Trois natures, ancrées sur ce que le dépôt nomme déjà ailleurs :
 *  · `case_study` — `bellum_plan.py` cadence J6, « cas client chiffré » ;
 *  · `company_brochure` / `resume` — `bellum_icebreaker.py` RÈGLE 6, « Ne joins
 *    ni CV ni plaquette à un premier message sans contexte ».
 */
type DefaultOutreachAsset = {
  title: string
  description: string
  category: OutreachAssetCategory
  usageRights: OutreachAssetUsageRights
}

export const DEFAULT_OUTREACH_ASSETS: DefaultOutreachAsset[] = [
  {
    title: 'Plaquette ESN — présentation générale',
    description: 'Présentation courte des expertises et références de votre ESN.',
    category: 'company_brochure',
    usageRights: 'after_interest_confirmed',
  },
  {
    title: 'Cas client — livraison chiffrée',
    description: 'Un cas client comparable, avec un résultat chiffré, pour un message de valeur (cadence J6).',
    category: 'case_study',
    usageRights: 'after_interest_confirmed',
  },
  {
    title: 'CV consultant senior',
    description: "Le profil d'un consultant senior, à joindre seulement une fois l'intérêt confirmé.",
    category: 'resume',
    usageRights: 'after_interest_confirmed',
  },
]
