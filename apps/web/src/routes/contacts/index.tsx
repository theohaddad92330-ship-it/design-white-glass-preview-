import { createFileRoute } from '@tanstack/react-router'
import {
  CONTACT_LIFECYCLE_STATES,
  CONTACT_VIEWS,
  contactFamilySchema,
  contactSourceSchema,
  MON_CRM_SOURCE_FILTER,
  contactStatusSchema,
  HIERARCHY_LEVELS,
  INTERACTION_ACTIVITY_KINDS,
} from '@bellum/contracts'
import { z } from 'zod'
import { ContactsPage } from '@/features/contacts/view/ContactsPage'
import { ROLE_FILTERS } from '@/lib/contactRoles'

/**
 * Search params bookmarkables :
 *   - `q`       → recherche texte
 *   - `role`    → filtre rôle décisionnel
 *   - `company` → ILIKE entreprise
 *   - `channel` → présence email / linkedin / les deux
 *   - `unassigned` → les contacts à qualifier, sans entreprise (#1473)
 *   - `state`   → état du cycle de vie (pastilles). Filtré server-side : les
 *                 pastilles annoncent un total workspace, donc le clic doit
 *                 paginer sur ce total et non sur les 25 lignes chargées.
 *   - `view`    → la vue sélectionnée (#2158.6), client-side sur la page déjà
 *                 chargée — contrairement aux filtres ci-dessus, jamais
 *                 envoyée à l'API.
 *   - `family`  → filtre famille métier (#2158.60), égalité exacte
 *   - `hierarchyLevel` → filtre niveau (#2158.59), égalité exacte
 *
 * ⚠️ #1800 (09/09/2026) — `favorite` a existé ici (la notion de favori,
 * retirée sur décision de Louis). Un vieux lien partagé qui porterait encore
 * `?favorite=true` ouvre simplement la liste NON filtrée : zod ignore une clé
 * qu'il ne connaît plus, ce n'est ni une erreur ni une page cassée.
 */
// #2167.51 — `with_phone` en fin de liste (GA-08) : la recette « cinq
// contacts avec email ET téléphone » n'avait aucun chemin vers un numéro.
const CHANNELS = ['with_email', 'with_linkedin', 'with_both', 'missing_details', 'with_phone'] as const

export const contactsSearchSchema = z.object({
  q: z.string().optional(),
  role: z.enum(ROLE_FILTERS).optional().catch(undefined),
  company: z.string().optional(),
  // #2159.26 — l'étiquette filtrée, dans l'URL : la puce d'une fiche y mène.
  tag: z.string().optional(),
  channel: z.enum(CHANNELS).optional().catch(undefined),
  // Le réseau dormant : la valeur EST le nombre de mois (« 12 »). Un `catch`
  // plutôt qu'une page en erreur — un lien partagé qui porterait autre chose
  // doit ouvrir la liste, pas casser.
  dormant: z.enum(['6', '12', '24']).optional().catch(undefined),
  // #2158.67 — la fraîcheur de LA FICHE (`contact.updated_at`), distincte du
  // réseau dormant (dernier échange). Même granularité que `dormant`.
  updatedWithin: z.enum(['3', '6', '12']).optional().catch(undefined),
  // #2158.61 — la ville/le pays où travaille le contact, ILIKE. Ville et pays
  // sont les deux seules exceptions nommées à l'interdit des critères
  // protégés (doctrine c58) — jamais une adresse personnelle.
  location: z.string().optional(),
  // #2158.57 — l'entité (filiale/direction/BU déclarée), ILIKE comme `company`.
  entity: z.string().optional(),
  // #2158.58 — la fonction (`contact.title`), ILIKE, distincte de la recherche libre `q`.
  title: z.string().optional(),
  // #2158.65 — le porteur du contact, un identifiant de membre d'espace.
  assignedTo: z.string().guid().optional().catch(undefined),
  // #2158.60 — la famille métier (`contact.family`), taxonomie fermée. Même
  // mapping que `role` : `'all'` s'écrit explicitement, l'absence de clé
  // veut dire « pas de filtre ».
  family: z
    .enum(['all', ...contactFamilySchema.options])
    .optional()
    .catch(undefined),
  state: z.enum(CONTACT_LIFECYCLE_STATES).optional().catch(undefined),
  // #1473 — les contacts à qualifier. Présent ou absent, jamais `false` dans
  // l'URL — un `?unassigned=false` bookmarké dirait « montre-moi ceux qui ont
  // une entreprise », ce qui est déjà le défaut.
  unassigned: z
    .preprocess(value => (value === true || value === 'true' ? true : undefined), z.boolean().optional())
    .catch(undefined),
  // #2158.68 — la cible (`target_list_items.contact_id`), égalité exacte.
  targetListId: z.string().guid().optional().catch(undefined),
  // #1903.15 — le compte discuté quand Laura ouvre cet écran depuis le chat.
  // `account_id`, PAS `accountId` (même convention que `/projects`, voir
  // `routes/projects/index.tsx`) : la clé littérale que le catalogue de
  // liens profonds (`chat_tools.py`) déclare doit matcher, mot pour mot,
  // celle que `validateSearch` déclare ici — sinon la garde
  // `laura-deep-links.test.ts` le voit et le refuse.
  account_id: z.string().guid().optional().catch(undefined),
  // #2158.6 — la vue sélectionnée (`ContactsViewChips`), pour qu'un lien
  // direct (le CTA d'en-tête « Traiter les contacts prêts ») ait quelque
  // chose à cibler. `'all'` s'écrit explicitement dans l'URL — l'absence de
  // clé retombe sur « à contacter » (#2158.72), pas sur « Toutes ».
  view: z
    .enum(['all', ...CONTACT_VIEWS])
    .optional()
    .catch(undefined),
  // #2834 (#2106.24) — le lien profond depuis la ligne « contacts ayant
  // changé » du brief (`sinceLastVisitLineHref`), même geste que `account_id`
  // ci-dessus : un lien posé par l'écran, jamais saisi à la main.
  sourceTag: z.enum(['RISQUE']).optional().catch(undefined),
  // #4597.3 — « voir les N contacts » depuis Imports & sources : l'identifiant du job d'import (`universal_import_jobs.id`),
  // jamais sa date. Un lien posé par l'écran, comme `account_id` : égalité exacte côté serveur.
  importJob: z.string().guid().optional().catch(undefined),
  // #2158.66 — la source (`contact.source`), taxonomie fermée. Même mapping
  // que `family` : `'all'` s'écrit explicitement, l'absence de clé veut dire
  // « pas de filtre ». La valeur reste le fournisseur brut dans l'URL —
  // jamais affichée telle quelle, l'écran ne rend que le libellé anonymisé
  // de `contactSourceLabel` (doctrine « nos fournisseurs ne se nomment jamais »).
  source: z
    .enum(['all', ...contactSourceSchema.options, MON_CRM_SOURCE_FILTER])
    .optional()
    .catch(undefined),
  // #2158.59 — le niveau (`computeHierarchyLevel(contact.title)`), taxonomie
  // fermée. Même mapping que `family`/`source` : `'all'` s'écrit
  // explicitement, l'absence de clé veut dire « pas de filtre ».
  hierarchyLevel: z
    .enum(['all', ...HIERARCHY_LEVELS])
    .optional()
    .catch(undefined),
  // #2158.14 (#2997) — la vue « Sans prochaine action », posée en filtre.
  // Présent ou absent, jamais `false` dans l'URL — même geste qu'`unassigned` :
  // il n'existe pas de besoin « montre-moi ceux qui EN ont une », c'est déjà
  // le défaut.
  withoutNextAction: z
    .preprocess(value => (value === true || value === 'true' ? true : undefined), z.boolean().optional())
    .catch(undefined),
  // #2158.69 (#2997) — la NATURE de la dernière activité échangée, distincte
  // de `dormant` (l'ancienneté).
  lastActivityKind: z.enum(INTERACTION_ACTIVITY_KINDS).optional().catch(undefined),
  // #3718 — le statut déclaré du contact (« Répondu »…), taxonomie fermée.
  userStatus: contactStatusSchema.optional().catch(undefined),
})

export const Route = createFileRoute('/contacts/')({
  validateSearch: contactsSearchSchema,
  component: ContactsPage,
})
