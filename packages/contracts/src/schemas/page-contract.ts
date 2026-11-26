import { z } from 'zod'

/**
 * #2931 (reprend #2167, hors lot 24/09) — LE CONTRAT DE PAGE TRANSVERSE.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE CE FICHIER EST, ET CE QU'IL N'EST PAS
 * ─────────────────────────────────────────────────────────────────────────
 * #2167 demande un système entier (contrat + tokens de design + inventaire de
 * boutons + 18 recettes E2E + 8 golden prompts + critères GO/NO-GO) — pas un
 * écran, un système. Ce fichier livre la PLUS PETITE tranche utile et
 * prouvable de ce système : le CONTRAT lui-même (les 13 champs qu'un écran de
 * prospection doit pouvoir dire, #2167.1/.3-.14) et un AUDIT honnête — greppé,
 * pas deviné — de qui, aujourd'hui, tient chacun. L'inventaire de boutons, les
 * recettes E2E et les golden prompts restent HORS de ce lot (raison : #2931,
 * commentaire de livraison).
 *
 * Trois statuts, jamais deux — doctrine « non mesuré ≠ 0, un axe non évaluable
 * est NOMMÉ » appliquée ici à l'audit lui-même :
 *   - `present`    : une preuve `fichier:ligne` existe, vérifiée par la garde
 *                    d'architecture (le fichier DOIT exister) ;
 *   - `absent`     : une recherche PRÉCISE et NOMMÉE n'a rien trouvé ;
 *   - `unverified` : le champ demande un jugement produit (« LA action
 *                    principale » sur un écran qui en propose plusieurs) ou une
 *                    vérification que ce passage ne pouvait pas faire par grep
 *                    seul — ce n'est PAS un `absent` déguisé.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LES 4 SURFACES — UNE DÉCISION TRANCHÉE SANS LOUIS
 * ─────────────────────────────────────────────────────────────────────────
 * #2167 nomme « Contacts / Mes cibles / Analyser / Découvrir » sans dire à
 * quelles routes ces noms correspondent. Trois sont sans ambiguïté
 * (`/contacts`, `/mes-cibles`, `/discover`). « Analyser » n'a PAS de route
 * dédiée : c'est le bouton « Analyser » de `AccountLaunchSurface`
 * (`apps/web/src/features/launcher/AccountLaunchSurface.tsx`), qui lance une
 * analyse EN PLACE depuis `/accounts` — et c'est le même mot que
 * `contextSurfaceSchema` porte déjà comme valeur `'analyze'`
 * (`surface-context-contract.ts`, #2454). Réutiliser ce vocabulaire plutôt que
 * d'en inventer un second (GA-26 : un réglage vit à un seul endroit) : la
 * quatrième surface du contrat s'appelle `analyze`, elle vit sous
 * `apps/web/src/features/accounts` et `apps/web/src/features/launcher`, ce
 * n'est PAS l'ensemble de la page « Comptes » (le dossier compte / onglet
 * « Connaître » n'est pas dans ce périmètre).
 */
export const PAGE_CONTRACT_SURFACES = ['contacts', 'mes_cibles', 'analyze', 'discover'] as const
export const pageContractSurfaceSchema = z.enum(PAGE_CONTRACT_SURFACES)
export type PageContractSurface = z.infer<typeof pageContractSurfaceSchema>

/**
 * Les 13 champs du contrat, dans l'ordre de #2167 (`.2`, la personnalisation,
 * n'est PAS reprise par #2931 — absente de la liste des points repris, donc
 * hors de ce contrat).
 */
export const PAGE_CONTRACT_FIELDS = [
  'benefit',
  'dataAvailable',
  'dataMissing',
  'mainAction',
  'lauraAccess',
  'sourceStatus',
  'provenance',
  'cost',
  'emptyState',
  'loadingState',
  'errorState',
  'mobile',
  'permissions',
] as const
export const pageContractFieldSchema = z.enum(PAGE_CONTRACT_FIELDS)
export type PageContractField = z.infer<typeof pageContractFieldSchema>

export const pageContractAuditEntrySchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('present'), evidence: z.string().min(1) }),
  z.object({ status: z.literal('absent'), reason: z.string().min(1) }),
  z.object({ status: z.literal('unverified'), reason: z.string().min(1) }),
])
export type PageContractAuditEntry = z.infer<typeof pageContractAuditEntrySchema>

export const pageContractAuditSchema = z.object({
  surface: pageContractSurfaceSchema,
  fields: z.partialRecord(pageContractFieldSchema, pageContractAuditEntrySchema),
})
export type PageContractAudit = z.infer<typeof pageContractAuditSchema>

const present = (evidence: string): PageContractAuditEntry => ({ status: 'present', evidence })
const absent = (reason: string): PageContractAuditEntry => ({ status: 'absent', reason })
const unverified = (reason: string): PageContractAuditEntry => ({ status: 'unverified', reason })

const NO_DATA_SPLIT_REASON =
  'aucune occurrence de « données disponibles » / « données manquantes » ni équivalent structurel ' +
  "(`git grep -rni 'donnees? (disponibles|manquantes)'` vide sur les 4 surfaces) : le contrat #2167.3/.4 " +
  "n'est tenu nulle part aujourd'hui."

/**
 * #2931, clôture du 26/09 — MAINACTION, TRANCHÉ SANS LOUIS.
 *
 * Le RESTE du 25-26/09 notait « plusieurs CTA par écran, arbitrage produit,
 * non déduit ». Ce n'est plus un jugement à inventer : les 4 surfaces suivent
 * déjà, sans exception trouvée, la même convention shadcn/ui — la variante
 * `outline`/`ghost` porte l'annulation ou une navigation SECONDAIRE, la
 * variante par défaut (`black`/sans variante explicite) porte le verbe
 * TERMINAL de l'écran. `ContactsIntro.tsx:41` le dit même en toutes lettres
 * (« #2158.6 — CTA PRINCIPAL »). La règle est donc : mainAction = le bouton
 * en variante primaire qui accomplit le verbe terminal de la surface, jamais
 * un bouton d'annulation ou une navigation vers un autre écran.
 */
const SOURCE_STATUS_ABSENT_REASON =
  '`git grep -n "sourceStatus"` (hors tests) sous features/contacts, features/accounts et features/launcher ' +
  'ne renvoie AUCUN résultat : le champ `sourceStatus` — le statut de l’annuaire professionnel vérifié — ' +
  'existe dans le contrat (`org-graph.ts`) mais aucun écran ne le consomme comme élément de page dédié à ' +
  'l’état des sources, distinct de la provenance déjà affichée (badge) ou du connecteur d’import CRM.'

/**
 * L'AUDIT — rempli le 25/09/2026, par lecture directe et `git grep` ciblé
 * (méthode du brief nocturne, §3). Chaque `present` pointe un fichier qui
 * EXISTE (la garde le vérifie) ; chaque `absent` cite la recherche qui est
 * revenue vide ; chaque `unverified` dit pourquoi grep ne suffit pas.
 */
export const PAGE_CONTRACT_AUDIT: readonly PageContractAudit[] = [
  {
    surface: 'contacts',
    fields: {
      benefit: present('apps/web/src/features/contacts/view/contacts-list/ContactsIntro.tsx'),
      dataAvailable: absent(NO_DATA_SPLIT_REASON),
      dataMissing: absent(NO_DATA_SPLIT_REASON),
      mainAction: present(
        'apps/web/src/features/contacts/view/contacts-list/ContactsIntro.tsx:41 (« #2158.6 — CTA PRINCIPAL », variant="black")',
      ),
      lauraAccess: present('apps/web/src/features/contacts/view/ContactContent.tsx:797'),
      sourceStatus: absent(SOURCE_STATUS_ABSENT_REASON),
      provenance: present('apps/web/src/features/contacts/components/ContactVerificationBadge.tsx:3'),
      cost: present('apps/web/src/features/contacts/components/EnrichConfirmDialog.tsx:12'),
      emptyState: present('apps/web/src/features/contacts/view/contacts-list/ContactsEmpty.tsx:11'),
      loadingState: present('apps/web/src/features/contacts/view/ContactContent.tsx:877'),
      errorState: present('apps/web/src/features/contacts/view/ContactContent.tsx:939'),
      mobile: absent(
        'aucun `HORIZONTAL_OVERSCROLL_CLASS`/`ResponsiveTable`/`useIsMobile` sous features/contacts (les trois ' +
          'marqueurs que `mes_cibles` porte, ci-dessous) — la table dense ne porte aucune variante mobile connue.',
      ),
      permissions: absent(
        'aucun hook de capacité (`can(`, `usePermission`, `useCapabilit…`) sous features/contacts — le contrôle, ' +
          "s'il existe, vit entièrement plus haut (garde de route), jamais visible sur la page elle-même.",
      ),
    },
  },
  {
    surface: 'mes_cibles',
    fields: {
      benefit: present('apps/web/src/features/target-lists/view/TargetListsSection.tsx:95'),
      dataAvailable: absent(NO_DATA_SPLIT_REASON),
      dataMissing: absent(NO_DATA_SPLIT_REASON),
      mainAction: present(
        'apps/web/src/features/target-lists/view/TargetListsSection.tsx:256 (`CreateTargetListForm`, variant="black")',
      ),
      lauraAccess: present('apps/web/src/features/target-lists/view/TargetListsSection.tsx:119'),
      sourceStatus: absent(
        'aucune citation de connecteur/état des sources sous features/target-lists (`git grep -rli connector` vide).',
      ),
      provenance: present('apps/web/src/features/target-lists/view/TargetListCard.tsx:123'),
      /**
       * #2931 (nuit du 26/09, vague SOIR) — TRANCHÉ SANS LOUIS : la nuit
       * précédente laissait ce champ `absent` avec « à confirmer si un import
       * volumineux doit un jour annoncer un coût ». Ce n'est pas une décision
       * produit en attente : `useImportTargetList` ne fait que retrouver des
       * `ref_id` DÉJÀ dans l'espace (`ImportTargetListDialog.tsx`), jamais de
       * collecte ni d'enrichissement — le coût est ZÉRO par construction,
       * quel que soit le volume, et `createList` (formulaire de création) ne
       * pose que du texte. La reco la plus simple compatible doctrine : le
       * DIRE, sur les deux gestes qui posent la question (créer, importer),
       * plutôt que laisser un silence qu'un utilisateur peut lire comme un
       * oubli avant de coller 927 noms (#2167, recette Antoine).
       */
      cost: present('apps/web/src/features/target-lists/view/ImportTargetListDialog.tsx:106'),
      emptyState: present('apps/web/src/features/target-lists/view/TargetListsSection.tsx:137'),
      loadingState: present('apps/web/src/features/target-lists/view/TargetListsSection.tsx:135'),
      errorState: present('apps/web/src/features/target-lists/view/TargetListCard.tsx:319'),
      mobile: present('apps/web/src/features/target-lists/view/TargetListsTable.tsx:24'),
      permissions: absent(
        'aucun hook de capacité (`can(`, `usePermission`, `useCapabilit…`) sous features/target-lists.',
      ),
    },
  },
  {
    surface: 'analyze',
    fields: {
      benefit: present('apps/web/src/features/accounts/view/AccountsPage.tsx'),
      dataAvailable: absent(NO_DATA_SPLIT_REASON),
      dataMissing: absent(NO_DATA_SPLIT_REASON),
      mainAction: present(
        'apps/web/src/features/launcher/AccountLaunchSurface.tsx:330 (bouton de confirmation du lancement, ' +
          'variante par défaut ; le bouton `outline` à sa gauche, ligne 327, annule)',
      ),
      lauraAccess: present('apps/web/src/features/accounts/view/account-detail/search/DossierSearchField.tsx:5'),
      sourceStatus: absent(SOURCE_STATUS_ABSENT_REASON),
      provenance: present(
        'apps/web/src/features/accounts/view/account-detail/components/AccountProfileProvenance.tsx:36',
      ),
      cost: present('apps/web/src/features/accounts/view/account-detail/tabs/TabContacts.tsx:125'),
      emptyState: present('apps/web/src/features/accounts/view/accounts-list/AccountsEmpty.tsx:13'),
      loadingState: present('apps/web/src/features/launcher/AccountLaunchSurface.tsx:216'),
      errorState: present(
        'apps/web/src/features/accounts/view/account-detail/tabs/organigramme/corrections/OrgCorrectionDrawer.tsx:471',
      ),
      mobile: present('apps/web/src/features/accounts/view/account-detail/components/BattleCardModal.tsx:88'),
      permissions: present('apps/web/src/features/accounts/view/account-detail/cta/DossierCta.tsx'),
    },
  },
  {
    surface: 'discover',
    fields: {
      /**
       * #2931 (nuit du 26/09, vague SOIR) — TRANCHÉ, DÉJÀ LÀ : l'audit du
       * 25/09 cherchait le composant `ScreenIntro` et concluait à une
       * absence. Le titre + sous-titre de l'écran (`Discover.tsx:1575`,
       * #2456/#2165.3) ne PASSENT pas par ce composant partagé (`PageHeader`
       * ne rend pas de h1 quand l'onglet nomme déjà l'écran, #2456) mais
       * disent la même chose : « Croise secteur, taille, territoire, signaux
       * d'activité et accessibilité pour faire émerger ce que tu ne
       * cherchais pas encore » EST le bénéfice de l'écran — chercher
       * l'équivalent structurel, pas seulement le nom du composant. Ligne
       * relue au réel le 27/09 (intégration matin) : `t('subtitle')` vit
       * désormais à `Discover.tsx:1575`, décalée d'un cran par les fusions
       * précédentes — même citation que HEAD (`discover.json:subtitle`
       * FR/EN), pas une seconde décision.
       */
      benefit: present('apps/web/src/features/discover/view/Discover.tsx:1575'),
      dataAvailable: absent(NO_DATA_SPLIT_REASON),
      dataMissing: absent(NO_DATA_SPLIT_REASON),
      mainAction: present(
        'apps/web/src/features/discover/view/AnalyzeSelectionDialog.tsx:211 (bouton de soumission, variante par ' +
          'défaut ; le bouton `ghost` ligne 208 annule)',
      ),
      lauraAccess: present('apps/web/src/features/discover/view/CandidateRowDetails.tsx:264'),
      sourceStatus: absent('aucune citation de connecteur/état des sources sous features/discover.'),
      provenance: present('apps/web/src/features/discover/view/Discover.tsx:1789'),
      cost: present('apps/web/src/features/discover/view/AnalyzeSelectionDialog.tsx:19'),
      emptyState: present('apps/web/src/features/discover/view/ProjectionResults.tsx:442'),
      loadingState: present('apps/web/src/features/discover/view/SimilarPanel.tsx:25'),
      errorState: present('apps/web/src/features/discover/view/Discover.tsx:1291'),
      mobile: present('apps/web/src/features/discover/view/FilterRail.tsx:396'),
      permissions: absent('aucun hook de capacité (`can(`, `usePermission`, `useCapabilit…`) sous features/discover.'),
    },
  },
]
