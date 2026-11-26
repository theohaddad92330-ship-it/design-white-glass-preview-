import type { PageSpec } from '../../types'

/**
 * /missions/paiements — le suivi des paiements aux consultants/sous-traitants.
 * Bellum SUIT le paiement, il ne le déclenche pas : aucun virement ne part
 * d'ici, aucune coordonnée bancaire n'est stockée.
 *
 * Lu dans : `apps/web/src/routes/missions/paiements.tsx` → `PaymentsPage.tsx`
 * (bandeau, mois, recherche, quatre compartiments, tableau, relance, refus).
 * Textes de `apps/web/src/i18n/locales/fr/payments.json`.
 */
export const missionsPaiementsPage: PageSpec = {
  id: 'app/missions-paiements',
  surface: 'app',
  domain: 'missions',
  route: 'apps/web/src/routes/missions/paiements.tsx',
  title: 'Gestion des paiements',
  template: 'dashboard',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Gestion des paiements', style: 'title' },
      {
        type: 'component',
        component: 'InfoBanner',
        props: {
          variant: 'info',
          size: 'sm',
          content: {
            description:
              'Bellum SUIT le paiement, il ne le déclenche pas : aucun ordre de virement ne part d’ici, et aucune coordonnée bancaire n’est stockée. Ce que tu prépares et valides ici, c’est le suivi ; le virement se fait dans ta banque.',
          },
        },
      },
    ],
    filters: [
      {
        type: 'stack',
        direction: 'row',
        gap: '2',
        align: 'center',
        children: [
          { type: 'component', component: 'Input', props: { content: { label: 'Mois', value: '2026-09' } } },
          {
            type: 'component',
            component: 'SearchInput',
            props: { size: 'sm', content: { placeholder: 'Rechercher un consultant, un client, une mission…' } },
          },
          {
            type: 'component',
            component: 'Select',
            props: { size: 'sm', content: { placeholder: 'Tous les statuts' } },
          },
          {
            type: 'component',
            component: 'Select',
            props: { size: 'sm', content: { placeholder: 'Tous les clients' } },
          },
        ],
      },
    ],
    kpis: [
      {
        type: 'grid',
        columns: 4,
        columnsMobile: 1,
        gap: '2',
        children: [
          { type: 'component', component: 'InfoLine', props: { content: { label: 'Payés', value: '8 · 34 200 €' } } },
          {
            type: 'component',
            component: 'InfoLine',
            props: { content: { label: 'En attente', value: '3 · 12 400 € · 1 sans montant' } },
          },
          {
            type: 'component',
            component: 'InfoLine',
            props: { content: { label: 'En retard', value: '1 · 2 100 €' } },
          },
          {
            type: 'component',
            component: 'InfoLine',
            props: { content: { label: 'À valider', value: '2 · 1 sans date de paiement prévue' } },
          },
        ],
      },
      {
        type: 'text',
        text: 'évolution non mesurée — aucune photo du mois précédent n’a été prise',
        style: 'caption',
        color: 'text/muted',
      },
      {
        type: 'text',
        text: '1 paiement refusé, hors de ces totaux.',
        style: 'caption',
        color: 'text/muted',
      },
    ],
    actions: [
      {
        type: 'component',
        component: 'DropdownMenu',
        props: {
          content: { trigger: 'Colonnes' },
          items: [
            'Consultant',
            'Mois',
            'Validation',
            'Client',
            'Mission',
            'Cession',
            'Montant dû',
            'Date de paiement prévue',
            'Statut paiement',
            'Échéance',
            'Action suivante',
            'Relances',
          ],
        },
      },
      {
        type: 'component',
        component: 'Button',
        props: { variant: 'outline', size: 'sm', content: { label: 'Relancer les paiements' } },
      },
      {
        type: 'component',
        component: 'Button',
        props: { variant: 'outline', size: 'sm', content: { label: 'Exporter' } },
      },
    ],
    primary: [
      {
        type: 'component',
        component: 'Table',
        props: {
          table: {
            columns: [
              'Consultant',
              'Mois',
              'Validation',
              'Client',
              'Mission',
              'Cession',
              'Montant dû',
              'Date de paiement prévue',
              'Statut paiement',
              'Échéance',
              'Action suivante',
              'Relances',
              'Gestes sur ce paiement',
            ],
            rows: [
              [
                'Talent exemple 1',
                'Septembre 2026',
                'aucune affectation lisible sur ce mois',
                'Compte exemple 1',
                'Mission exemple 1',
                'aucune cession préparée pour ce client sur ce mois',
                'aucune facture du sous-traitant ne chiffre encore ce paiement',
                'non renseignée',
                'En attente validation',
                'sans objet — non validé',
                'Attendre la validation du relevé',
                '0',
                'sans objet — paiement non généré, rien à faire avancer',
              ],
              [
                'Talent exemple 2',
                'Septembre 2026',
                'validé le 18/09/2026',
                'Compte exemple 2',
                'Mission exemple 2',
                'cession n° C-2026-041',
                '4 200 €',
                '30/09/2026',
                'Payé',
                'sans objet — déjà payé',
                'Rien à faire',
                '0',
                'sans objet — paiement déjà sorti',
              ],
              [
                'Talent exemple 3',
                'Août 2026',
                'validé le 02/09/2026',
                'Compte exemple 3',
                'Mission exemple 3',
                'cession n° C-2026-038',
                '3 800 €',
                '10/09/2026',
                'En retard',
                'dépassée de 15 jours',
                'Relancer le paiement',
                '1',
                'Marquer payé · Relancer le paiement · Refuser le paiement',
              ],
              [
                'Talent exemple 4',
                'Septembre 2026',
                'validé le 20/09/2026',
                'Compte exemple 4',
                'Mission exemple 4',
                'Cession préparée',
                '5 300 €',
                '15/10/2026',
                'En attente',
                'sans objet — pas encore due',
                'Rien à faire avant la date prévue',
                '0',
                'Marquer payé · Relancer le paiement · Refuser le paiement',
              ],
              [
                'Talent exemple 5',
                'Août 2026',
                'validé le 01/09/2026',
                'Compte exemple 5',
                'Mission exemple 5',
                'Cession refusée par le factor',
                '2 900 €',
                '08/09/2026',
                'En retard',
                'dépassée de 17 jours',
                'Relancer le paiement',
                '1',
                'Marquer payé · Relancer le paiement · Refuser le paiement',
              ],
              [
                'Talent exemple 6',
                'Septembre 2026',
                'validé le 10/09/2026',
                'Compte exemple 6',
                'Mission exemple 6',
                'Cession reprise par le factor',
                '3 100 €',
                '20/09/2026',
                'Refusé',
                'sans objet — paiement refusé',
                'sans objet — décision prise',
                '0',
                'Motif du refus : facture en double',
              ],
            ],
          },
        },
      },
      {
        type: 'text',
        text: 'Menu par ligne (déclencheur « … », un bouton icône seul porte un nom — GA-32) : trois gestes quand le paiement n’est ni sorti ni refusé.',
        style: 'caption',
        color: 'text/muted',
      },
      {
        type: 'component',
        component: 'DropdownMenu',
        props: {
          content: { trigger: 'Gestes sur ce paiement' },
          items: ['Marquer payé', 'Relancer le paiement', 'Refuser le paiement'],
        },
      },
      {
        type: 'text',
        text: 'Aucun virement ne part de BellumAI, et aucune relance non plus.',
        style: 'caption',
        color: 'text/muted',
      },
    ],
  },
  states: {
    empty: [
      {
        type: 'component',
        component: 'EmptyState',
        props: {
          size: 'md',
          align: 'center',
          content: {
            title: 'Aucun paiement à suivre sur ce mois.',
            description:
              'Une ligne apparaît ici dès qu’une mission a une affectation sur le mois. Si tu n’en vois aucune, c’est que le mois choisi ne couvre aucune mission active.',
          },
        },
      },
    ],
    loading: [{ type: 'component', component: 'Skeleton', props: { shape: 'table' } }],
    error: [
      {
        type: 'component',
        component: 'GenericProblemMessage',
        props: { content: { title: 'Les paiements n’ont pas pu être chargés' } },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'ecart',
      text: 'Corrigé dans cette maquette : le filtre « Mois » est un vrai `Input[type=month]`, positionné EN PREMIER, avant la recherche — pas un `Select` après elle. Le menu « Colonnes » ne portait que 8 des 12 clés réelles (`PAYMENT_COLUMN_KEYS`) ; Date de paiement prévue, Statut paiement, Échéance et Relances manquaient. Mission et Relances sont masquées par défaut dans le vrai écran (activables via ce même menu) ; la maquette les montre pour rester lisible sur « toutes les colonnes ».',
      source: 'apps/web/src/features/payments/columns.ts:24',
    },
    {
      kind: 'decision',
      text: 'Un paiement refusé sort des totaux affichés (« hors de ces totaux ») plutôt que de rester compté dans « en attente » ou « en retard » — la ligne reste lisible avec son motif, sans fausser les compartiments.',
      source: 'apps/web/src/i18n/locales/fr/payments.json:28',
    },
    {
      kind: 'decision',
      text: 'Relancer un paiement CONSIGNE une relance, n’en envoie aucune : « aucun virement ne part de Bellum, et aucune relance non plus ».',
      source: 'apps/web/src/i18n/locales/fr/payments.json:97',
    },
    {
      kind: 'decision',
      text: 'Responsive : les quatre compartiments passent de 1 colonne sous 768 px à 2 (tablette) puis 4 à partir de 1024 px (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`) ; le sélecteur de colonnes remplace tout masquage automatique. Au-delà de 1920 (2560/3440) : aucun gain, le tableau à douze colonnes s’étire seul, pas de panneau de détail latéral.',
      source: 'apps/web/src/features/payments/view/PaymentsPage.tsx:292',
    },
    {
      kind: 'ecart',
      text: 'Corrigé dans cette maquette : chaque ligne porte un menu de gestes nommé « Gestes sur ce paiement » (déclencheur « … », GA-32), avec trois entrées — Marquer payé / Relancer le paiement / Refuser le paiement — absent de la maquette précédente. Il est sans objet sur un paiement pas encore généré (rien à faire avancer) ou déjà sorti ; sur un paiement refusé, il affiche le motif du refus à la place des trois gestes. Cette colonne, contrairement aux douze autres, n’est PAS dans le menu « Colonnes » : elle est toujours affichée, comme dans le code.',
      source: 'apps/web/src/features/payments/view/PaymentsPage.tsx:866',
    },
    {
      kind: 'ecart',
      text: 'Manque encore, hors de ce passage sur le contenu de page : la modale « Refuser un paiement », ouverte par « Refuser » dans le menu de ligne — un champ motif OBLIGATOIRE et borné, deux boutons (Refuser / Annuler). Dans le code actuel elle s’affiche en ligne sous la file plutôt que dans un vrai composant `Dialog`, ce qui est lui-même un écart à corriger. Les surcouches (modales, menus ancrés) se maquettent dans le registre séparé `src/spec/overlays/`, pas dans cette spec de page.',
      source: 'apps/web/src/features/payments/view/PaymentsPage.tsx:918',
    },
    {
      kind: 'ecart',
      text: 'Corrigé dans cette maquette : la colonne « Cession » ne montrait que « manquante » et « reçue » ; elle montre aussi les deux autres états réels — « Cession préparée » (dossier prêt, pas encore transmis au factor, ce n’est pas une absence) et « Cession refusée »/« reprise » par le factor (un fait sur la créance, jamais confondu avec une ligne manquante).',
      source: 'apps/web/src/features/payments/view/PaymentsPage.tsx:729',
    },
  ],
}
