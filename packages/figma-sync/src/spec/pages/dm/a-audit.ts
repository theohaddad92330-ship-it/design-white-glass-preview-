import type { PageSpec } from '../../types'

/**
 * `/audit` — le journal unique du back-office (#1666) : Qui · Quoi · Sur quoi ·
 * Quand · Depuis où · Résultat. Lecture seule (le `DELETE` répond 405 — on
 * retire le moyen, pas seulement le bouton), les cinq rétentions viennent du
 * serveur (même code que la purge), et aucun filtre ne masque une catégorie
 * entière (compteur calculé sans le filtre courant).
 *
 * Lu dans : `src/app/audit/page.tsx` → `_components/audit-table.tsx`,
 * `audit-filtres.tsx`, `audit-retentions.tsx`.
 */
export const auditPage: PageSpec = {
  id: 'dm/audit',
  surface: 'dm',
  domain: 'system',
  route: 'apps/dashboard-manager/src/app/audit/page.tsx',
  title: 'Audit',
  template: 'admin-table',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Audit', style: 'title' },
      {
        type: 'text',
        text: 'Le journal unique du back-office : qui a fait quoi, sur quoi, quand, depuis où, avec quel résultat. Lecture seule — aucune ligne ne se supprime, aucune purge ne se déclenche à la main.',
        style: 'body',
        color: 'text/secondary',
      },
    ],
    actions: [
      {
        type: 'grid',
        columns: 3,
        columnsMobile: 1,
        gap: '4',
        children: [
          {
            type: 'component',
            component: 'Card',
            props: { content: { title: 'Opérations journalisées' } },
            children: [
              { type: 'text', text: '4 812', style: 'display' },
              { type: 'text', text: 'tous filtres ignorés', style: 'caption', color: 'text/muted' },
            ],
          },
          {
            type: 'component',
            component: 'Card',
            props: { content: { title: 'Sur cette recherche' } },
            children: [
              { type: 'text', text: '312', style: 'display' },
              { type: 'text', text: '1–50 sur 312', style: 'caption', color: 'text/muted' },
            ],
          },
          {
            type: 'component',
            component: 'Card',
            props: { content: { title: 'Mesuré le' } },
            children: [
              { type: 'text', text: '25/09/2026 14:02', style: 'title' },
              { type: 'text', text: 'heure de Paris', style: 'caption', color: 'text/muted' },
            ],
          },
        ],
      },
    ],
    filters: [
      {
        type: 'component',
        component: 'FilterChips',
        props: {
          items: [
            'Toutes · 312',
            'Actions ordinaires · 240',
            'Changements de permission · 22',
            'Exports de données · 16',
            'Suppressions · 10',
            'Impersonations · 4',
          ],
        },
      },
      {
        type: 'stack',
        direction: 'row',
        gap: '2',
        align: 'center',
        children: [
          {
            type: 'text',
            text: 'Filtres additionnels actifs : résultat = Réussi · un opérateur · opération = workspace.membre.ajoute.',
            style: 'caption',
            color: 'text/muted',
          },
          {
            type: 'component',
            component: 'Button',
            props: { variant: 'link', size: 'sm', content: { label: 'Tout afficher' } },
          },
        ],
      },
    ],
    primary: [
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Rétentions appliquées' } },
        children: [
          {
            type: 'component',
            component: 'Table',
            props: {
              // RUX-05/26 : densité `compact` — le DM ne descend jamais sous 12 px (plancher D80).
              density: 'compact',
              table: {
                columns: ['Catégorie', 'Conservation', 'Effacé avant le'],
                rows: [
                  ['Actions ordinaires', '12 mois', '25/09/2025'],
                  ['Changements de permission', '36 mois', '25/09/2023'],
                  ['Exports de données', '36 mois', '25/09/2023'],
                  ['Suppressions', 'permanent', 'rien n’est jamais effacé'],
                  ['Impersonations', 'permanent', 'rien n’est jamais effacé'],
                ],
              },
            },
          },
        ],
      },
      {
        type: 'component',
        component: 'Table',
        props: {
          density: 'compact',
          table: {
            columns: ['Quand', 'Qui', 'Quoi', 'Sur quoi', 'Depuis où', 'Résultat'],
            rows: [
              [
                '25/09/2026 14:02',
                'j••••@wavestone-consulting.fr',
                'workspace.membre.ajoute',
                'Wavestone Consulting',
                '91.170.12.4 · FR',
                'Réussi',
              ],
              [
                '25/09/2026 11:41',
                'm••••@bellumai.fr',
                'impersonation.demarree',
                'Synaltic Group',
                '82.64.3.201 · FR',
                'Réussi',
              ],
              [
                '24/09/2026 18:20',
                'l••••@nextedia-conseil.fr',
                'export.donnees.demande',
                'Export contacts (312 lignes)',
                '178.33.9.44 · FR',
                'Réussi',
              ],
              [
                '24/09/2026 09:05',
                'a••••@bellumai.fr',
                'client.plan.modifie',
                'Cassiopée Digital',
                '5.51.88.12 · FR',
                'Réussi',
              ],
              [
                '23/09/2026 16:52',
                't••••@arion-technologies.fr',
                'compte.suppression.demandee',
                'Compte "Ancien prospect Q2"',
                '90.12.44.7 · FR',
                'Réussi',
              ],
              [
                '23/09/2026 08:12',
                's••••@ekitia-systems.fr',
                'facturation.acces.tente',
                '/facturation',
                '212.51.6.90 · BE',
                'Refusé',
              ],
              [
                '22/09/2026 19:37',
                'p••••@bellumai.fr',
                'flag.evalue',
                'export-pdf · workspace Synaltic Group',
                '82.64.3.201 · FR',
                'Réussi',
              ],
              [
                '22/09/2026 10:03',
                'j••••@wavestone-consulting.fr',
                'export.donnees.echoue',
                'Export missions (délai dépassé)',
                '91.170.12.4 · FR',
                'Échec',
              ],
            ],
          },
        },
      },
    ],
    footer: [
      {
        type: 'stack',
        direction: 'row',
        gap: '2',
        align: 'center',
        justify: 'between',
        children: [
          {
            type: 'component',
            component: 'Button',
            props: { variant: 'outline', size: 'sm', content: { label: '← Précédent' } },
          },
          { type: 'text', text: '1–50 sur 312', style: 'caption', color: 'text/muted' },
          {
            type: 'component',
            component: 'Button',
            props: { variant: 'outline', size: 'sm', content: { label: 'Suivant →' } },
          },
        ],
      },
    ],
  },
  states: {
    empty: [
      {
        type: 'text',
        text: 'Aucune opération ne correspond à cette recherche. Le journal, lui, en contient 4 812 — les compteurs ci-dessus le disent catégorie par catégorie.',
        style: 'body',
        color: 'text/muted',
      },
    ],
    loading: [{ type: 'component', component: 'Skeleton', props: { shape: 'table' } }],
    error: [
      {
        type: 'component',
        component: 'GenericProblemMessage',
        props: {
          content: {
            title: 'Journal indisponible',
            description:
              'L’API n’a pas répondu. Un tableau vide se lirait comme « il ne s’est rien passé » : ce n’est pas ce qu’on sait.',
          },
        },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'decision',
      text: 'Les filtres de catégorie sont des `<a href>`, jamais des boutons `Pill`/`FilterBar` (client, `onClick`) : ce qui se clique se tabule (GA-35), et un lien se partage, se met en signet, survit à un rechargement — essentiel pour « qui a fait ça, et quand ». `FilterChips` du catalogue est rendu ici par approximation ; l’implémentation réelle reste des liens.',
      source: 'apps/dashboard-manager/src/app/audit/_components/audit-filtres.tsx:20',
    },
    {
      kind: 'decision',
      text: 'Aucune catégorie ne disparaît quand on filtre : chaque compteur est calculé SANS le filtre de catégorie courant. Filtrer restreint la page, ça n’efface jamais un chiffre — l’inverse d’une liste déroulante qui ne proposerait que ce qui reste.',
      source: 'apps/dashboard-manager/src/app/audit/_components/audit-filtres.tsx:12',
    },
    {
      kind: 'ecart',
      text: 'Corrigé dans cette maquette : la version précédente listait « Sécurité », « Facturation », « Système » comme catégories — ces trois libellés n’existent nulle part dans `BACKOFFICE_AUDIT_CATEGORIES`. Les cinq catégories réelles, exhaustives, sont Actions ordinaires, Changements de permission, Exports de données, Suppressions, Impersonations.',
      source: 'packages/contracts/src/schemas/backoffice-audit.ts:56',
    },
    {
      kind: 'decision',
      text: 'Une panne d’API n’affiche jamais un tableau vide : un journal vide se lirait comme « il ne s’est rien passé », la conclusion la plus coûteuse qu’un écran d’audit puisse suggérer — d’où un message d’erreur dédié plutôt qu’un état vide générique.',
      source: 'apps/dashboard-manager/src/app/audit/page.tsx:44',
    },
    {
      kind: 'decision',
      text: 'L’adresse de l’opérateur est rendue EN CLAIR par `EmailEnClair` (c87, Louis 04/10/2026) ; le composant porte son propre `mailto:`, donc jamais dans un autre `<a>`. Pas d’équivalent catalogue pour ce composant.',
      source: 'apps/dashboard-manager/src/app/audit/_components/audit-table.tsx:9',
    },
    {
      kind: 'ecart',
      text: 'Cette maquette dessine la colonne « Qui » avec une adresse masquée (`j••••@wavestone-consulting.fr`) : dans le code, l’adresse est EN CLAIR (`EmailEnClair`, `mailto:`) — plus de clic « Révéler » (c87). `Table` du catalogue ne prend que des cellules texte (`string[][]`), donc aucun composant du catalogue ne peut porter ce lien dans une ligne — cette note tient lieu d’équivalent.',
      source: 'apps/dashboard-manager/src/app/_components/email-en-clair.tsx:10',
    },
    {
      kind: 'decision',
      text: 'Responsive : à 1280 la colonne « Depuis où » (la moins consultée) se masque en premier sur le tableau des 6 colonnes ; la grille de 3 KPI reste à 3 (elle tient déjà à 1280) ; contenu borné à 1600 px sur 1920, jamais étiré. Au-delà (2560, 3440) le tableau garderait sa largeur de lecture et gagnerait un panneau de détail par ligne plutôt que de s’étirer.',
      source: 'apps/dashboard-manager/src/app/audit/page.tsx:108',
    },
    {
      kind: 'ecart',
      text: 'Aucune règle `@media (min-width…)` n’existe dans le DM : le tableau de 6 colonnes compte uniquement sur `.wrap { overflow-x: auto }` pour défiler à 1280, aucune colonne ne se masque aujourd’hui.',
      source: 'apps/dashboard-manager/src/app/globals.css:133',
    },
    {
      kind: 'decision',
      text: 'Le paragraphe « Filtres additionnels actifs » ne s’affiche que si `outcome`, `actorEmail` ou `operation` sont présents dans l’URL — jamais pour la seule catégorie, dont les pilules restent visibles en permanence. Cette maquette montre l’état où les trois sont actifs (résultat, opérateur, opération). Le lien « Tout afficher » repart d’un filtre vierge (`/audit`) : il efface aussi la catégorie en cours, pas seulement ces trois-là.',
      source: 'apps/dashboard-manager/src/app/audit/_components/audit-filtres.tsx:78',
    },
    {
      kind: 'decision',
      text: 'RUX-05/26 (`docs/revue-ux.md` §4, T12) : les deux tableaux de cette page portent la densité `compact` — le DM du code descend aujourd’hui à 11 px (`DataTable.module.css:17,58,83`), la cible ne va jamais sous 12 px (plancher D80) : lignes 36 px, 14 px, zébrures.',
      source: 'apps/dashboard-manager/src/ui/DataTable.module.css:17',
    },
  ],
}
