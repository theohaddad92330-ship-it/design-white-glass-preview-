import type { PageSpec } from '../../types'
import { GAIN_MASTER_DETAIL, responsiveDecision, responsiveEcartTable } from './_shared'

/**
 * /prospects — #2706 : Théo (CEO, 22/09/2026) « pouvoir lire, trier et
 * recontacter les prospects qui ont ouvert la démo — sans ouvrir la base à la
 * main. » Un prospect ne porte AUCUN `workspace_id` : l'exposer dans
 * l'application obligerait à le rattacher à un espace, ce que le
 * cloisonnement interdit. Le back-office est l'espace d'exploitation interne
 * — à côté de `clients`, `usage`, `feedback` — protégé par
 * `DM_ALLOWED_EMAILS` et le rôle `leads.read` (plancher `viewer`).
 *
 * Le tri (plus récent d'abord) et le dédoublonnage par e-mail sont faits côté
 * API (`DemoLeadService.listMostRecentFirst`, #2705) — cet écran lit et
 * affiche, il ne recalcule rien (GA-26).
 *
 * Lu dans : `apps/dashboard-manager/src/app/prospects/page.tsx` →
 * `_components/prospects-table.tsx`.
 */
export const dmProspectsPage: PageSpec = {
  id: 'dm/prospects',
  surface: 'dm',
  domain: 'prospects',
  route: 'apps/dashboard-manager/src/app/prospects/page.tsx',
  title: 'Prospects',
  template: 'admin-table',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Prospects', style: 'title' },
      {
        type: 'text',
        text: 'Qui a lancé la démo, depuis quand, et par quel canal — lecture seule.',
        style: 'body',
        color: 'text/secondary',
      },
      {
        type: 'text',
        text: 'Les personnes qui ont lancé la démo depuis le formulaire d’accès, plus récente d’abord — pour les lire, les trier et les recontacter sans ouvrir la base à la main.',
        style: 'caption',
        color: 'text/muted',
      },
    ],
    primary: [
      {
        type: 'component',
        component: 'Table',
        props: {
          table: {
            columns: ['Identité', 'Statut', 'Premier accès', 'Dernier accès', 'Accès', 'Source · UTM'],
            rows: [
              ['Prospect exemple · Directeur commercial / Acme · ••••@exemple.test', 'Démo lancée', '—', '—', '—', '—'],
            ],
          },
        },
      },
      { type: 'text', text: 'Mesuré le —.', style: 'caption', color: 'text/muted' },
    ],
  },
  states: {
    empty: [
      {
        type: 'component',
        component: 'EmptyState',
        props: { size: 'md', align: 'center', content: { title: 'Aucun prospect n’a encore lancé la démo.' } },
      },
    ],
    loading: [{ type: 'component', component: 'Skeleton', props: { shape: 'table' } }],
    error: [
      {
        type: 'component',
        component: 'GenericProblemMessage',
        props: {
          content: {
            title: 'Prospects indisponibles',
            description: 'L’API n’a pas répondu. Message technique renvoyé tel quel.',
          },
        },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'decision',
      text: 'L’adresse e-mail est TOUJOURS en clair dans cette liste (`EmailEnClair`, c87, Louis 04/10/2026) ; GA-411 refuse qu’un masquage revienne dans le dashboard-manager.',
      source: 'apps/dashboard-manager/src/app/_components/email-en-clair.tsx:10',
    },
    {
      kind: 'decision',
      text: 'Téléphone et source/UTM suivent « on n’affiche pas ce qu’on n’a pas » (doctrine, Louis 20/09/2026) : un champ absent ne rend AUCUNE ligne dans la cellule, jamais un « — » deviné.',
      source: 'apps/dashboard-manager/src/app/prospects/_components/prospects-table.tsx:13',
    },
    {
      kind: 'decision',
      text: 'Un prospect n’a pas de fiche détail ni d’action d’écriture depuis cet écran (lecture seule, rôle `leads.read`) : « recontacter » se fait hors de cet outil, une fois l’adresse révélée — jamais un envoi déclenché depuis le back-office.',
      source: 'apps/dashboard-manager/src/app/prospects/page.tsx:34',
    },
    responsiveDecision(GAIN_MASTER_DETAIL),
    responsiveEcartTable(),
  ],
}
