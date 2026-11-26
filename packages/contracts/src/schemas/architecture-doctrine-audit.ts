import { z } from 'zod'

/**
 * #2924 (LAU-FINAL, ARCHITECTURE PRODUIT — DOCTRINE FINALE ET CYCLE DE VIE DES
 * SURFACES, #2143) — L'AUDIT des points de doctrine qui ne sont NI un
 * registre par route (`route-registry.ts`, #2143.21/.22/.23) NI un arbitrage
 * déjà tranché (`doctrine-registry.ts`) : sept points qui décrivent un
 * COMPORTEMENT transverse (l'orientation par défaut, le rôle de Laura vs
 * Analyser, ce qu'une page dérivée ne recrée pas) plutôt qu'une ligne par
 * route.
 *
 * Même discipline que `page-contract.ts` (#2931) : un audit HONNÊTE, greppé,
 * jamais deviné, sur trois statuts jamais fondus (doctrine « non mesuré ≠
 * faux ») :
 *  - `present`    : une preuve `fichier:ligne` existe, vérifiée par la garde
 *                   (le fichier DOIT exister) ;
 *  - `absent`     : mesuré comme n'existant PAS — une recherche précise n'a
 *                   rien trouvé, ou a trouvé moins que ce que le point demande ;
 *  - `unverified` : le point demande un jugement humain (une recette
 *                   utilisateur, par ex.) que ce fichier ne peut pas trancher.
 *
 * Ce fichier ne PROMET pas que chaque point est TENU — il NOMME où chacun en
 * est, pour que « reste » ne redevienne jamais un silence.
 */

export const ARCHITECTURE_DOCTRINE_POINTS = [
  'laura_is_default_entry',
  'specialized_page_open_reasons',
  'no_forced_page_steps',
  'laura_role_named',
  'analyze_role_named',
  'technical_logs_surface',
  'derived_page_no_recreate_score',
  'laura_opens_with_full_context',
  'novice_understands_eight_destinations',
] as const
export const architectureDoctrinePointSchema = z.enum(ARCHITECTURE_DOCTRINE_POINTS)
export type ArchitectureDoctrinePoint = z.infer<typeof architectureDoctrinePointSchema>

export const ARCHITECTURE_DOCTRINE_STATUSES = ['present', 'absent', 'unverified'] as const
export const architectureDoctrineStatusSchema = z.enum(ARCHITECTURE_DOCTRINE_STATUSES)
export type ArchitectureDoctrineStatus = z.infer<typeof architectureDoctrineStatusSchema>

export type ArchitectureDoctrineEntry = {
  /** Le point de l'issue #2143, résumé en une phrase. */
  claim: string
  status: ArchitectureDoctrineStatus
  /** `fichier:ligne` quand `present` ou `absent` de façon mesurée ; `null` sinon. */
  evidence: string | null
  /** Ce que la preuve montre, ou pourquoi le point n'est pas vérifiable ici. */
  note: string
}

/**
 * #2143.1 — « Figer la doctrine d'architecture centrée sur Laura » :
 * `#1786` (Louis, 23/08/2026) a déjà tranché « quand on se connecte à Bellum,
 * c'est sur Laura qu'on doit arriver par défaut » — `DEFAULTS.defaultView`
 * vaut `'chat'`, et une correction humaine en Réglages gagne toujours (une
 * décision, pas un défaut qu'on peut oublier). C'est la doctrine, EN CODE,
 * depuis ce lot — pas une phrase de plus dans un PDF.
 *
 * #2143.6 — « Une page spécialisée n'ouvre qu'à valeur ajoutée » : les SEPT
 * raisons nommées ici (voir/comparer/corriger/filtrer/valider/exécuter/suivre)
 * sont le vocabulaire — la vérification écran par écran (« CETTE page
 * sert-elle l'une des sept ? ») reste HORS de ce lot : c'est un audit de
 * ~29 routes, la même discipline que #2143.2 (une ligne à la fois, jamais un
 * remplissage en série).
 *
 * #2143.7 — « Les pages ne sont plus des étapes obligatoires imposées » :
 * GA-27 (`<Navigate>` interdit) empêche la classe de bug qui a fait qu'une
 * redirection forcée est passée inaperçue (106 erreurs React avant de
 * commiter) — mais ne prouve pas l'ABSENCE de parcours forcé PRODUIT (un
 * onboarding qui bloque tant qu'une étape n'est pas faite, par ex.) :
 * `absent` de façon mesurée, pas `present` par extension.
 *
 * #2143.8/.9 — Laura (conseiller/décider/orchestrer) et Analyser (approfondir)
 * sont deux ENTRÉES déjà distinctes dans le produit — `AskLaura.tsx` (D44)
 * ouvre la conversation, `AccountLaunchSurface.tsx` lance une analyse EN
 * PLACE — mais aucun texte ne les NOMME comme deux rôles ; ce fichier est ce
 * texte.
 *
 * #2143.20 — aucun écran « Journaux techniques » n'existe : `commercial-audit`
 * porte un objet métier différent (mesuré 25/09, confirmé ce lot).
 *
 * #2143.26 — livré CE LOT (GA-396) : `BadgeColorScore.ts` recréait sa propre
 * table de couleurs de verdict, dérivée de la source canonique ; elle lit
 * maintenant `ACCOUNT_VERDICT_COLOR`, et une garde d'architecture empêche la
 * récidive sur tout `apps/web/src`.
 *
 * #2143.27 — `AskLaura.tsx` ne porte que `accountId` + la question rédigée
 * (mesuré 18/09, confirmé inchangé 26/09) : PAS le contexte complet qu'une
 * surface pourrait utiliser (l'onglet ouvert, l'objet précis regardé) —
 * `absent` de façon mesurée pour la promesse ENTIÈRE du point.
 *
 * #2143.28 — « le novice comprend la différence entre huit destinations » est
 * un critère de COMPRÉHENSION UTILISATEUR : aucun grep, aucune assertion de
 * code ne peut le trancher — une recette utilisateur le peut, hors de portée
 * de ce fichier (même discipline que `page-contract.ts`, champs `unverified`).
 */
export const ARCHITECTURE_DOCTRINE_AUDIT: Readonly<Record<ArchitectureDoctrinePoint, ArchitectureDoctrineEntry>> = {
  laura_is_default_entry: {
    claim: "L'architecture s'organise autour de Laura : elle est l'orientation PAR DÉFAUT.",
    status: 'present',
    evidence: 'apps/web/src/features/preferences/preferences-provider.tsx:118',
    note: "DEFAULTS.defaultView = 'chat' (#1786, Louis 23/08/2026) ; une correction humaine en Réglages gagne toujours.",
  },
  specialized_page_open_reasons: {
    claim: "Une page spécialisée n'ouvre que pour l'une de sept raisons nommées.",
    status: 'present',
    evidence: 'packages/contracts/src/schemas/architecture-doctrine-audit.ts',
    note: 'PAGE_OPEN_REASONS nomme le vocabulaire ; la vérification écran par écran des ~29 routes reste hors de ce lot.',
  },
  no_forced_page_steps: {
    claim: 'Les pages ne sont plus des étapes obligatoires imposées.',
    status: 'absent',
    evidence: null,
    note: 'GA-27 empêche une classe de bug de redirection, pas la présence de parcours forcés côté produit (onboarding, etc.) — non mesuré comme absent partout, mais aucune preuve positive trouvée.',
  },
  laura_role_named: {
    claim: 'Le rôle de Laura (conseiller/décider/orchestrer) est nommé, distinct d’Analyser.',
    status: 'present',
    evidence: 'apps/web/src/components/primitives/AskLaura.tsx:149',
    note: 'D44 — Laura ouvre la conversation avec une question déjà rédigée, jamais un envoi automatique.',
  },
  analyze_role_named: {
    claim: 'Le rôle « Analyser » (approfondir) est nommé, distinct de Laura.',
    status: 'present',
    evidence: 'apps/web/src/features/launcher/AccountLaunchSurface.tsx:203',
    note: 'Le geste « Analyser » lance une analyse EN PLACE, sans passer par la conversation.',
  },
  technical_logs_surface: {
    claim: 'Une surface « Journaux techniques » distingue l’audit support du travail quotidien.',
    status: 'absent',
    evidence: null,
    note: "Aucun écran de ce nom n'existe ; `commercial-audit` porte un objet métier différent (mesuré 25/09, confirmé 26/09).",
  },
  derived_page_no_recreate_score: {
    claim: 'Une page dérivée ne recrée jamais sa propre liste/statut/score/historique.',
    status: 'present',
    evidence: 'apps/web/src/architecture/GA-396-une-page-derivee-ne-recree-pas-un-score.test.ts',
    note: 'BadgeColorScore.ts recréait sa propre table de couleurs de verdict (dérivée) — corrigé ce lot pour lire ACCOUNT_VERDICT_COLOR ; GA-396 garde la promesse.',
  },
  laura_opens_with_full_context: {
    claim: 'Laura ouvre chaque surface utile avec le bon contexte.',
    status: 'absent',
    evidence: 'apps/web/src/components/primitives/AskLaura.tsx:149',
    note: 'Ne porte que accountId + la question rédigée — pas le contexte complet (onglet ouvert, objet précis) qu’une surface pourrait utiliser (mesuré 18/09, confirmé inchangé 26/09).',
  },
  novice_understands_eight_destinations: {
    claim: 'Le novice comprend la différence entre huit destinations.',
    status: 'unverified',
    evidence: null,
    note: 'Critère de compréhension utilisateur — une recette utilisateur le tranche, pas un grep ni une assertion de code.',
  },
}

/**
 * #2143.6 — les SEPT raisons pour lesquelles une page spécialisée ouvre,
 * verbatim de la mesure du 25/09/2026 sur le registre par route
 * (`.claude/notes/registre-2026-09-18-architecture-produit-chat.md`).
 * GA-08 : ajout en fin seulement.
 */
export const PAGE_OPEN_REASONS = ['see', 'compare', 'correct', 'filter', 'validate', 'execute', 'track'] as const
export const pageOpenReasonSchema = z.enum(PAGE_OPEN_REASONS)
export type PageOpenReason = z.infer<typeof pageOpenReasonSchema>
