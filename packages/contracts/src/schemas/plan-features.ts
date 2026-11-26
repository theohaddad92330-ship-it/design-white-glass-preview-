import { z } from 'zod'

/**
 * Ce qu'un palier DONNE, par opposition à ce qu'il donne EN QUANTITÉ.
 *
 * Jusqu'ici un plan ne différenciait que du chiffre — crédits, sièges, prix — et
 * les puces des cartes de facturation (« Chat IA, historique & exports PDF/CSV »)
 * étaient du texte marketing que rien n'appliquait : un Starter-Solo avait le
 * copilote, les exports et le CRM comme un Growth. Ces clés sont l'inverse : le
 * catalogue de plans (`plan_definitions.features`) dit lesquelles un palier
 * porte, l'API refuse les autres et l'app les présente verrouillées.
 *
 * Une clé n'entre ici QUE si elle est réellement applicable quelque part. Le
 * « support prioritaire » n'y est pas : c'est un engagement humain, pas une
 * porte dans le code — l'annoncer ici laisserait croire qu'on l'applique.
 *
 * Ce qui n'est PAS gaté, et ne le sera pas : le tableau de bord, les comptes,
 * les contacts, l'analyse elle-même et l'historique. C'est le produit ; un
 * palier payant qui n'y donnerait pas accès ne vaudrait rien. Le levier de
 * volume sur l'analyse, ce sont les CRÉDITS, pas une porte.
 *
 * Une seule liste, partagée : l'API (enforcement), le web (verrou + upsell) et
 * le backoffice (cases à cocher par plan) lisent le MÊME catalogue — un nom qui
 * dériverait entre les trois ouvrirait une porte que personne ne garde.
 */
export const PLAN_FEATURE_KEYS = [
  'exports',
  'chat_ai',
  'discover',
  'watchlist',
  'knowledge_base',
  'team_workspace',
  'needs',
  'talent_pool',
  'crm_native',
  'ats_native',
  'manager_cockpit',
  'crm_sync',
  'mcp_assistant',
  'public_api',
  // #2957 (#2179.1) — les appels d'offres, gatés par palier. Ouverts à TOUS
  // les paliers par défaut (comportement d'avant la porte) : la grille se
  // resserre depuis le back-office, sans redéploiement.
  'rfp',
] as const

export type PlanFeatureKey = (typeof PLAN_FEATURE_KEYS)[number]

export const planFeatureKeySchema = z.enum(PLAN_FEATURE_KEYS)

/** La liste des features d'un palier. Les clés inconnues sont REJETÉES : une
 *  faute de frappe dans le backoffice ne doit pas créer une feature fantôme que
 *  personne ne garde. */
export const planFeaturesSchema = z.array(planFeatureKeySchema)

/**
 * Nom et promesse de chaque feature, FR/EN.
 *
 * `label` nomme la porte (backoffice, message de verrou) ; `pitch` dit ce qu'on
 * y gagne — c'est lui qui doit rendre lisible pourquoi le palier du dessus vaut
 * son prix, sur la carte de facturation comme sur l'écran verrouillé. Ici plutôt
 * que dans les catalogues i18n de chaque app parce que trois surfaces nomment
 * les mêmes portes.
 */
export const PLAN_FEATURE_LABELS: Readonly<
  Record<PlanFeatureKey, { fr: string; en: string; pitchFr: string; pitchEn: string }>
> = {
  exports: {
    fr: 'Exports PDF / CSV',
    en: 'PDF / CSV exports',
    pitchFr: 'Emportez le dossier et vos listes hors de Bellum',
    pitchEn: 'Take the dossier and your lists out of Bellum',
  },
  chat_ai: {
    fr: 'Laura',
    en: 'Laura',
    pitchFr: 'Posez vos questions sur un compte et faites préparer vos messages',
    pitchEn: 'Ask anything about an account and have your messages drafted',
  },
  discover: {
    fr: 'Découvrir',
    en: 'Discover',
    pitchFr: 'Trouvez les comptes à cibler au lieu de les saisir un par un',
    pitchEn: 'Find the accounts worth targeting instead of typing them one by one',
  },
  watchlist: {
    fr: 'Veille',
    en: 'Watchlist',
    pitchFr: 'Vos comptes suivis vous préviennent quand quelque chose bouge',
    pitchEn: 'Your tracked accounts tell you when something moves',
  },
  knowledge_base: {
    fr: 'Base de connaissance',
    en: 'Knowledge base',
    pitchFr: "Vos documents nourrissent les analyses et les messages de l'équipe",
    pitchEn: "Your documents feed the team's analyses and messages",
  },
  team_workspace: {
    fr: 'Espace partagé',
    en: 'Shared workspace',
    pitchFr: 'Comptes, contacts et commentaires partagés entre commerciaux',
    pitchEn: 'Accounts, contacts and comments shared across the team',
  },
  needs: {
    fr: 'Besoins',
    en: 'Needs',
    pitchFr: 'Les besoins détectés chez vos comptes, suivis comme un pipe',
    pitchEn: 'The needs detected at your accounts, tracked like a pipeline',
  },
  talent_pool: {
    fr: 'Vivier',
    en: 'Talent pool',
    pitchFr: 'Vos consultants alignés sur un besoin, CV réécrit pour la mission',
    pitchEn: 'Your consultants matched to a need, CV rewritten for the mission',
  },
  crm_native: {
    fr: 'CRM Bellum',
    en: 'Bellum CRM',
    pitchFr: 'Projets, pipeline, activités et tâches, sans ressaisie dans un autre outil',
    pitchEn: 'Projects, pipeline, activities and tasks — no re-entry in another tool',
  },
  ats_native: {
    fr: 'ATS Bellum',
    en: 'Bellum ATS',
    pitchFr: 'Du projet au profil présenté : matching expliqué, positionnements, retours client',
    pitchEn: 'From project to submitted profile: explained matching, submissions, client feedback',
  },
  manager_cockpit: {
    fr: 'Pilotage',
    en: 'Management cockpit',
    pitchFr: "Objectifs, activité et couverture de l'équipe en un écran",
    pitchEn: 'Targets, activity and coverage of the team on one screen',
  },
  crm_sync: {
    fr: 'Export vers le CRM',
    en: 'Export to CRM',
    pitchFr: 'HubSpot, Salesforce, Pipedrive ou Attio en un clic',
    pitchEn: 'HubSpot, Salesforce, Pipedrive or Attio in one click',
  },
  mcp_assistant: {
    fr: 'Assistant IA externe (MCP)',
    en: 'External AI assistant (MCP)',
    pitchFr: 'Branchez Claude ou Cursor sur vos dossiers Bellum',
    pitchEn: 'Plug Claude or Cursor into your Bellum dossiers',
  },
  public_api: {
    fr: 'API publique',
    en: 'Public API',
    pitchFr: 'Vos données Bellum dans vos propres outils',
    pitchEn: 'Your Bellum data inside your own tools',
  },
  rfp: {
    fr: "Appels d'offres",
    en: 'Tenders',
    pitchFr: "Lisez, distribuez et préparez un appel d'offres sans perdre une exigence",
    pitchEn: 'Read, split and prepare a tender without losing a requirement',
  },
}

/** Toutes les features — ce que reçoivent les paliers qui ne se VENDENT pas
 *  (essai, beta, découverte) : leur rôle est de montrer le produit. */
export const ALL_PLAN_FEATURES: readonly PlanFeatureKey[] = PLAN_FEATURE_KEYS

/** Vrai si `value` est une clé de feature connue. Sert à filtrer une valeur
 *  venue de la base (colonne JSON libre) sans faire confiance à son contenu. */
export function isPlanFeatureKey(value: unknown): value is PlanFeatureKey {
  return typeof value === 'string' && (PLAN_FEATURE_KEYS as readonly string[]).includes(value)
}

/** Normalise une valeur de base/API en liste de features connues, dédupliquée et
 *  ordonnée comme {@link PLAN_FEATURE_KEYS}. Une valeur illisible (null, objet,
 *  chaîne) rend `[]` — jamais une exception : le catalogue ne doit pas pouvoir
 *  faire tomber l'enforcement. */
export function normalizePlanFeatures(value: unknown): PlanFeatureKey[] {
  if (!Array.isArray(value)) return []
  const seen = new Set(value.filter(isPlanFeatureKey))
  return PLAN_FEATURE_KEYS.filter(key => seen.has(key))
}
