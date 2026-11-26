/**
 * Static i18n configuration shared by the runtime init and the language switcher.
 *
 * FR is the product's default and fallback language; EN is the first
 * translation. Keep this list and the `resources` map (resources.ts) in sync.
 */
export const SUPPORTED_LANGUAGES = ['fr', 'en'] as const

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]

/** Default + fallback language. Existing users keep FR unless they opt into EN. */
export const DEFAULT_LANGUAGE: SupportedLanguage = 'fr'

/** localStorage key holding the user's explicit language choice. */
export const LANGUAGE_STORAGE_KEY = 'bellum_lang'

/** Human-readable, self-referential language names for the switcher. */
export const LANGUAGE_LABELS: Record<SupportedLanguage, string> = {
  fr: 'Français',
  en: 'English',
}

/** Short codes shown in the compact switcher variant. */
export const LANGUAGE_SHORT_LABELS: Record<SupportedLanguage, string> = {
  fr: 'FR',
  en: 'EN',
}

/**
 * All translation namespaces (one JSON file per language under `locales/`).
 * Adding a namespace: create `locales/fr/<ns>.json` + `locales/en/<ns>.json`,
 * then register both in resources.ts and append the name here.
 */
export const NAMESPACES = [
  'common',
  // Laura Produit — la couche proactive du copilote (PDF 10 §5).
  'laura',
  // La bulle de Laura — la MÊME assistante, une autre porte (fils éphémères).
  'lauraBubble',
  'chains',
  // L'audit commercial — ce que le produit a compris de l'activité (#2071).
  'commercialAudit',
  'chatCommands',
  'matching',
  'nav',
  'auth',
  'onboarding',
  // #2212/#2213/#2214 — le socle du guide dans le produit (spotlight, bulle).
  'guide',
  'dashboard',
  // « Explique-moi ce chiffre » (PDF 6 §5.1) — le panneau qui ouvre le calcul
  // d'un agrégat. Un namespace à lui : ses six intitulés servent QUATRE écrans.
  'explain',
  'search',
  // #2207.67 — la recherche GLOBALE multi-entités (épopée #3015), à PART de
  // `search` : celui-ci porte le composeur de PROSPECTION (une entreprise,
  // hors produit), quand `globalSearch` porte l'accès clavier à ce qui est
  // DÉJÀ dans l'espace (comptes, contacts, besoins…).
  'globalSearch',
  'discover',
  'billing',
  'branding',
  'settings',
  'accounts',
  // #2155.13 — « Mes cibles ».
  'targets',
  'accountDetail',
  'apollo',
  'accountOrg',
  // L'onglet Missions d'un dossier de compte (PDF 4 §3.3, BEL-BO-006).
  'accountMissions',
  'accountSites',
  // Brief d'un marché local (capacité « Marchés locaux », L4a).
  'marketBrief',
  // #4282 — le radar par technologie (Découvrir + Laura).
  'technologyRadar',
  // COMPETENCE-TROUVE — la preuve par offres et les intermédiaires d'une recherche par compétence.
  'discoverSkill',
  'accountWatch',
  // #4072 — les faits du compte (date · TYPE · fait) des écrans d'action.
  'accountFacts',
  'activityLog',
  'teamResearch',
  'teamActivity',
  'teamAdmin',
  'engagement',
  'contacts',
  // Socle CRM natif : notes, édition de fiche, journal des modifications.
  'crm',
  'integrations',
  // « BellumAI ne repart pas de zéro » — la restitution après une connexion ou
  // un import (#2080). Inscrit ICI et pas seulement dans `resources` : c'est ce
  // tableau que `parity.test.ts` parcourt.
  'restitution',
  'google',
  'microsoft',
  'chat',
  'knowledge',
  'actions',
  'outreach',
  'feedback',
  'team',
  // LA MÉMOIRE COLLECTIVE — « le pont, pas le dossier ». Inscrit ICI et pas
  // seulement dans `resources` : c'est ce tableau que `parity.test.ts`
  // parcourt, et un namespace qui n'y figure pas n'est JAMAIS testé.
  'memoireCollective',
  'watchlist',
  'signalsLibrary',
  'projects',
  'activities',
  'tasks',
  'submissions',
  'missions',
  // L'administration des ventes (31/08/2026) — l'écran `/missions/adv`.
  'adv',
  'crmImport',
  'governance',
  'playbooks',
  'rfp',
  'manager',
  'profile',
  'welcome',
  'analysis',
  'routes',
  'exports',
  // Les dix états d'écran (PDF 1 §2) — les messages GÉNÉRIQUES de chaque état.
  // Un écran qui a mieux à dire passe son propre message ; ceux-ci sont le
  // plancher, pour qu'aucun état ne s'affiche nu.
  'screenState',
  // « Mes données » (PDF 7 §9.2) : ce qu'on emporte, et ce qu'on n'emporte pas.
  'myData',
  // Les durees cibles d'etape du pipe (PDF 3 §3.5).
  'pipelineSla',
  'share',
  'changelog',
  'impersonation',
  'briefing',
  'mailbox',
  'meetings',
  'routines',
  'proposals',
  // Le lexique par espace (D17) : les mots que l'ESN emploie pour les objets
  // du produit, et ceux qu'elle refuse d'y lire.
  'lexicon',
  // La cession de créance / affacturage (31/08/2026) — l'écran `/missions/cessions`.
  'factoring',
  'expenses',
  // « Suivi, facturation & automatisations » (/missions/suivi, D-22-2 levée
  // le 31/08/2026) — sa propre table, ses cinq tuiles, son rail
  // d'automatisations en lecture seule.
  'missionTracking',
  // Les paiements SORTANTS vers le consultant (31/08/2026) — un namespace À
  // PART de `missions`, parce que les deux écrans ne montrent pas la même
  // population : l'un suit l'argent qui rentre du client, l'autre celui qui
  // sort. Inscrit ICI et pas seulement dans `resources` : c'est ce tableau que
  // `parity.test.ts` parcourt, et un namespace qui n'y figure pas n'est
  // simplement JAMAIS testé — ni sur ses clés, ni sur ses interpolations.
  'payments',
  // Les sociétés de l'ESN — Réglages › Sociétés (31/08/2026). Un namespace À
  // PART de `settings` : `settings` porte les préférences PERSONNELLES, celui-ci
  // un registre d'ESPACE que seul le siège facturation modifie. Inscrit ICI et
  // pas seulement dans `resources` : c'est ce tableau que `parity.test.ts`
  // parcourt, et un namespace qui n'y figure pas n'est jamais testé.
  'legalEntities',
  // #2420.17 — le seuil d'alerte de marge, Réglages › Finance. À PART de
  // `settings` (préférences PERSONNELLES) et de `pilotage` (l'écran qui
  // AFFICHE la marge) : c'est le réglage d'ESPACE qui pose la valeur que ces
  // deux-là lisent. Inscrit ICI et pas seulement dans `resources` : c'est ce
  // tableau que `parity.test.ts` parcourt.
  'financeSettings',
  // #2005.5 — la fiche d'un périmètre de travail (capacité, objectif du
  // trimestre), Réglages › Périmètres. À PART de `profile` (qui porte « Mes
  // périmètres », un geste PERSONNEL) : ici vit la fiche d'un périmètre que
  // seul `team:manage` modifie.
  'businessUnitsAdmin',
  // #2081.14 — les règles d'espace, Réglages › Règles d'espace : posées par
  // l'administrateur, elles priment sur les réglages individuels.
  'workspaceRules',
  // Réglages › Mon espace et Réglages › Laura refondus d'après les maquettes Théo V22 (22/10/2026) : le texte propre
  // aux pages d'onglets (libellés d'onglets, garde-fous, comportement). Chaque onglet garde le namespace de sa vue.
  'settingsHub',
  // #4158 (lot L4) — garde-fous entre collègues : déjà travaillé, contacté par un
  // collègue, ne pas contacter, déjà proposé, doublons, équipe de compte.
  'teamGuardrails',
  // #1633 / #1635 / #1634 — la couverture mémoire marché du PORTEFEUILLE. Son
  // propre espace de noms, et pas celui d'un écran : le même bloc se monte sur
  // trois écrans qui ont chacun le leur (`pilotage`, `marketWatch`,
  // `territory`), et le ranger dans l'un des trois aurait fait dépendre les
  // deux autres d'un fichier qui ne les concerne pas. Inscrit ICI et pas
  // seulement dans `resources` : c'est ce tableau que `parity.test.ts`
  // parcourt, et un namespace qui n'y figure pas n'est jamais testé.
  'marketMemory',
  // #2422.6 (épopée #2869, lot R24 07/10/2026) — la page PUBLIQUE du dépôt de
  // pièce de contrat (un contact externe, sans compte BellumAI, sans session,
  // sans sidebar). Son propre espace de noms, comme `share` : aucun autre
  // écran ne lit ces clés. Inscrit ICI et pas seulement dans `resources` :
  // c'est ce tableau que `parity.test.ts` parcourt.
  'contractUpload',
  // L2 Pilotage › Pipe (14/10/2026) — l'onglet `/pilotage/pipe`. Son propre espace de noms : quatre
  // onglets Pilotage s'écrivent en parallèle, et un seul fichier `pilotage` les ferait se heurter.
  // Inscrit ICI et pas seulement dans `resources` : c'est ce tableau que `parity.test.ts` parcourt.
  'pilotagePipe',
] as const

type Namespace = (typeof NAMESPACES)[number]

/** Namespace used when a `t()` call omits an explicit namespace. */
export const DEFAULT_NAMESPACE: Namespace = 'common'

export function isSupportedLanguage(value: string | null | undefined): value is SupportedLanguage {
  return value === 'fr' || value === 'en'
}
