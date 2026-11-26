import type { PageSpec } from '../../types'

/**
 * /billing — abonnement, crédits, consommation, recharge, factures et
 * mouvements de crédits. Le calculateur de rentabilité a été retiré (#4531.3).
 *
 * Lu dans : `apps/web/src/routes/billing/index.tsx` → `Billing.tsx`
 * (`BillingHeader`, `PlanCard` + `CreditsCard`,
 * `UsageCard`, `TopupCard`, `InvoiceHistoryCard`, `CreditLedgerCard`,
 * `PlanPickerDialog`). Textes de `apps/web/src/i18n/locales/fr/billing.json`.
 */
export const billingPage: PageSpec = {
  id: 'app/billing',
  surface: 'app',
  domain: 'billing',
  route: 'apps/web/src/routes/billing/index.tsx',
  title: 'Abonnement et crédits',
  template: 'settings',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Abonnement et crédits', style: 'title' },
      {
        type: 'text',
        text: 'Gère ton abonnement, suis ta consommation et recharge tes crédits.',
        style: 'body',
        color: 'text/secondary',
      },
    ],
    sectionNav: [
      {
        type: 'component',
        component: 'SectionSidebarNav',
        props: {
          content: { title: 'Réglages' },
          items: ['Profil', 'Équipe', 'Intégrations', 'Abonnement et crédits', 'Connaissances'],
        },
      },
    ],
    primary: [
      {
        type: 'component',
        component: 'InfoBanner',
        props: {
          variant: 'danger',
          size: 'md',
          content: {
            title: 'Aucune licence active',
            description:
              'La démonstration montre le produit sans compte. Pour travailler tes vrais comptes, il te faut une licence.',
          },
        },
      },
      {
        type: 'component',
        component: 'Button',
        props: { variant: 'default', size: 'sm', content: { label: 'Voir les offres' } },
      },
      {
        type: 'grid',
        columns: 2,
        columnsMobile: 1,
        gap: '3',
        children: [
          {
            type: 'component',
            component: 'Card',
            props: { content: { title: 'Ton abonnement', description: 'Team' } },
            children: [
              {
                type: 'component',
                component: 'Badge',
                props: { variant: 'primary', content: { label: 'Actuel' } },
              },
              {
                type: 'stack',
                direction: 'column',
                gap: '1',
                children: [
                  { type: 'text', text: '600 crédits/mois', style: 'body', color: 'text/secondary' },
                  { type: 'text', text: '3 utilisateurs', style: 'body', color: 'text/secondary' },
                  { type: 'text', text: 'Dossier complet, comptes & contacts', style: 'body', color: 'text/secondary' },
                  {
                    type: 'text',
                    text: 'Laura, historique & tout Starter-Solo',
                    style: 'body',
                    color: 'text/secondary',
                  },
                  { type: 'text', text: 'Espace partagé & crédits mutualisés', style: 'body', color: 'text/secondary' },
                ],
              },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Sièges', value: '3 sur 3 utilisés' } },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Renouvellement', value: '01/10/2026' } },
              },
              {
                type: 'component',
                component: 'Button',
                props: { variant: 'outline', size: 'sm', content: { label: 'Gérer mon abonnement' } },
              },
              {
                type: 'text',
                text: 'Ton plan est géré par le propriétaire de l’espace de travail.',
                style: 'caption',
                color: 'text/muted',
              },
            ],
          },
          {
            type: 'component',
            component: 'Card',
            props: { content: { title: 'Crédits restants' } },
            children: [
              {
                type: 'component',
                component: 'UsageBar',
                props: { size: 'md', content: { label: 'Inclus dans ton plan', used: '410', limit: '600' } },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: {
                  content: { label: 'Répartition', value: '560 inclus dans ta formule · 50 en recharge ponctuelle' },
                },
              },
              {
                type: 'text',
                text: 'Renouvellement le 01/10/2026 · 40 crédits reportés du mois dernier',
                style: 'caption',
                color: 'text/muted',
              },
              {
                type: 'component',
                component: 'InfoBanner',
                props: {
                  variant: 'info',
                  size: 'sm',
                  content: {
                    description:
                      'Une analyse complète coûte 8 crédits, un enrichissement de contact 1 crédit. La mémoire marché BellumAI est incluse.',
                  },
                },
              },
              {
                type: 'component',
                component: 'Button',
                props: { variant: 'default', size: 'sm', content: { label: 'Acheter des crédits' } },
              },
              {
                type: 'text',
                text: 'Ton plan est géré par le propriétaire de l’espace de travail.',
                style: 'caption',
                color: 'text/muted',
              },
            ],
          },
        ],
      },
      {
        type: 'component',
        component: 'Card',
        props: { content: { title: 'Consommation mensuelle', description: 'Crédits utilisés par jour' } },
        children: [
          { type: 'placeholder', kind: 'chart', label: 'Crédits utilisés par jour sur la période', height: 'md' },
          {
            type: 'component',
            component: 'DataList',
            props: {},
            children: [
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Période', value: '01/09/2026 → 25/09/2026' } },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Crédits utilisés', value: '410' } },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Moyenne quotidienne', value: '16,4 crédits/jour' } },
              },
            ],
          },
        ],
      },
      {
        type: 'component',
        component: 'Card',
        props: {
          content: {
            title: 'Recharge de crédits',
            description: 'Ajoute des crédits ponctuels sans changer d’abonnement',
          },
        },
        children: [
          {
            type: 'grid',
            columns: 2,
            columnsMobile: 1,
            gap: '2',
            children: [
              {
                type: 'stack',
                direction: 'row',
                gap: '3',
                align: 'center',
                justify: 'between',
                fill: 'surface/1',
                stroke: 'border/default',
                radius: 'lg',
                padding: '3',
                children: [
                  { type: 'text', text: 'Pack 100 crédits · 39 €', style: 'body' },
                  {
                    type: 'component',
                    component: 'Button',
                    props: { variant: 'outline', size: 'sm', content: { label: 'Ajouter' } },
                  },
                ],
              },
              {
                type: 'stack',
                direction: 'row',
                gap: '3',
                align: 'center',
                justify: 'between',
                fill: 'surface/1',
                stroke: 'border/default',
                radius: 'lg',
                padding: '3',
                children: [
                  { type: 'text', text: 'Pack 500 crédits · 169 €', style: 'body' },
                  {
                    type: 'component',
                    component: 'Button',
                    props: { variant: 'outline', size: 'sm', content: { label: 'Ajouter' } },
                  },
                ],
              },
            ],
          },
          {
            type: 'text',
            text: 'Ces crédits s’ajoutent à ton quota du cycle en cours et ne sont pas reportés au mois suivant. Pour augmenter durablement ton quota, change de formule.',
            style: 'caption',
            color: 'text/muted',
          },
        ],
      },
      {
        type: 'component',
        component: 'Card',
        props: { content: { title: 'Historique de facturation' } },
        children: [
          {
            type: 'stack',
            direction: 'column',
            gap: '2',
            children: [
              {
                type: 'stack',
                direction: 'row',
                gap: '3',
                align: 'center',
                justify: 'between',
                fill: 'surface/1',
                stroke: 'border/default',
                radius: 'lg',
                padding: '3',
                children: [
                  {
                    type: 'stack',
                    direction: 'column',
                    gap: '1',
                    grow: true,
                    children: [
                      { type: 'text', text: 'Facture #2026-09', style: 'body' },
                      { type: 'text', text: '01/09/2026', style: 'caption', color: 'text/secondary' },
                    ],
                  },
                  { type: 'component', component: 'Badge', props: { variant: 'success', content: { label: 'Payée' } } },
                  { type: 'text', text: '149,00 €', style: 'body' },
                  {
                    type: 'component',
                    component: 'Button',
                    props: { variant: 'outline', size: 'icon', content: { label: 'Voir la facture sur Stripe' } },
                  },
                ],
              },
              {
                type: 'stack',
                direction: 'row',
                gap: '3',
                align: 'center',
                justify: 'between',
                fill: 'surface/1',
                stroke: 'border/default',
                radius: 'lg',
                padding: '3',
                children: [
                  {
                    type: 'stack',
                    direction: 'column',
                    gap: '1',
                    grow: true,
                    children: [
                      { type: 'text', text: 'Facture #2026-08', style: 'body' },
                      { type: 'text', text: '01/08/2026', style: 'caption', color: 'text/secondary' },
                    ],
                  },
                  { type: 'component', component: 'Badge', props: { variant: 'success', content: { label: 'Payée' } } },
                  { type: 'text', text: '149,00 €', style: 'body' },
                  {
                    type: 'component',
                    component: 'Button',
                    props: { variant: 'outline', size: 'icon', content: { label: 'Voir la facture sur Stripe' } },
                  },
                ],
              },
              {
                type: 'stack',
                direction: 'row',
                gap: '3',
                align: 'center',
                justify: 'between',
                fill: 'surface/1',
                stroke: 'border/default',
                radius: 'lg',
                padding: '3',
                children: [
                  {
                    type: 'stack',
                    direction: 'column',
                    gap: '1',
                    grow: true,
                    children: [
                      { type: 'text', text: 'Facture #2026-10', style: 'body' },
                      { type: 'text', text: '01/10/2026', style: 'caption', color: 'text/secondary' },
                    ],
                  },
                  {
                    type: 'component',
                    component: 'Badge',
                    props: { variant: 'warning', content: { label: 'En attente' } },
                  },
                  { type: 'text', text: '149,00 €', style: 'body' },
                  {
                    type: 'component',
                    component: 'Button',
                    props: { variant: 'outline', size: 'icon', content: { label: 'Facture indisponible' } },
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        type: 'component',
        component: 'Card',
        props: {
          content: { title: 'Mouvements de crédits', description: 'Crédits consommés, remboursements et recharges' },
        },
        children: [
          {
            type: 'stack',
            direction: 'column',
            gap: '2',
            children: [
              {
                type: 'stack',
                direction: 'row',
                gap: '3',
                align: 'center',
                justify: 'between',
                fill: 'surface/1',
                stroke: 'border/default',
                radius: 'lg',
                padding: '3',
                children: [
                  {
                    type: 'stack',
                    direction: 'column',
                    gap: '1',
                    grow: true,
                    children: [
                      { type: 'text', text: 'Analyse consommée — Compte exemple 1', style: 'body' },
                      { type: 'text', text: '24/09/2026', style: 'caption', color: 'text/muted' },
                    ],
                  },
                  { type: 'text', text: '−8', style: 'body', color: 'text/secondary' },
                ],
              },
              {
                type: 'stack',
                direction: 'row',
                gap: '3',
                align: 'center',
                justify: 'between',
                fill: 'surface/1',
                stroke: 'border/default',
                radius: 'lg',
                padding: '3',
                children: [
                  {
                    type: 'stack',
                    direction: 'column',
                    gap: '1',
                    grow: true,
                    children: [
                      { type: 'text', text: 'Enrichissement consommé', style: 'body' },
                      { type: 'text', text: '23/09/2026', style: 'caption', color: 'text/muted' },
                    ],
                  },
                  { type: 'text', text: '−1', style: 'body', color: 'text/secondary' },
                ],
              },
              {
                type: 'stack',
                direction: 'row',
                gap: '3',
                align: 'center',
                justify: 'between',
                fill: 'surface/1',
                stroke: 'border/default',
                radius: 'lg',
                padding: '3',
                children: [
                  {
                    type: 'stack',
                    direction: 'column',
                    gap: '1',
                    grow: true,
                    children: [
                      { type: 'text', text: 'Recharge de crédits', style: 'body' },
                      { type: 'text', text: '10/09/2026', style: 'caption', color: 'text/muted' },
                    ],
                  },
                  { type: 'text', text: '+100', style: 'body', color: 'success/text' },
                ],
              },
              {
                type: 'stack',
                direction: 'row',
                gap: '3',
                align: 'center',
                justify: 'between',
                fill: 'surface/1',
                stroke: 'border/default',
                radius: 'lg',
                padding: '3',
                children: [
                  {
                    type: 'stack',
                    direction: 'column',
                    gap: '1',
                    grow: true,
                    children: [
                      { type: 'text', text: 'Crédits du plan', style: 'body' },
                      { type: 'text', text: '01/09/2026', style: 'caption', color: 'text/muted' },
                    ],
                  },
                  { type: 'text', text: '+600', style: 'body', color: 'success/text' },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
  states: {
    loading: [{ type: 'component', component: 'Skeleton', props: { shape: 'block' } }],
    error: [
      {
        type: 'component',
        component: 'EmptyState',
        props: {
          size: 'md',
          align: 'center',
          content: { title: 'La facturation n’est pas disponible', description: 'Réessaie.', action: 'Réessayer' },
        },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'decision',
      text: 'RUX-36 (docs/revue-ux.md §2 P2, Top 20 non retenu) : « Facturation » désignait à la fois l’abonnement (cette page) et la facturation client dans Missions (`app/missions-facturation`) — le même mot changeait de sens selon la section. Cette page et son entrée de navigation (`SETTINGS_SECTION_NAV`, `./settings-shared.ts`) deviennent « Abonnement et crédits » ; « Facturation » ne désigne plus que Missions.',
      source: 'apps/web/src/components/sidebar/items.settings.ts:35',
    },
    {
      kind: 'ecart',
      text: 'Corrigé dans cette maquette : `PlanPickerDialog` (le sélecteur de plan ouvert par « Gérer mon abonnement » ou « Voir les offres ») manquait entièrement. C’est une vraie modale (`Dialog`), pas du contenu de page — elle est déjà recensée comme surcouche à maquetter (`src/spec/overlays/inventory.md:138`, lot suivant) et reste donc hors du périmètre de cette page.',
      source: 'apps/web/src/features/billing/components/PlanPickerDialog.tsx:36',
    },
    {
      kind: 'decision',
      text: 'Corrigé dans cette maquette : `NoLicenseBanner` manquait. Bandeau CONDITIONNEL — un seul état, jamais un compte à essai : rendu uniquement pour un compte sur un palier à fenêtre (`trial`/`decouverte`) sans licence active et hors salle de démo (`credits.is_demo`). Un abonnement actif ou une session de démo ne le voient jamais.',
      source: 'apps/web/src/features/billing/components/NoLicenseBanner.tsx:30',
    },
    {
      kind: 'decision',
      text: 'Corrigé dans cette maquette : la notice « Ton plan est géré par le propriétaire de l’espace de travail » REMPLACE le bouton « Gérer mon abonnement » — jamais les deux à la fois. Elle ne s’affiche qu’aux membres qui ne sont pas propriétaires de la facturation (`model.isBillingOwner === false`) ; le propriétaire voit le bouton, jamais la notice.',
      source: 'apps/web/src/features/billing/components/dashboard/PlanCard.tsx:39',
    },
    {
      kind: 'decision',
      text: 'Un échec de lecture du solde se distingue explicitement du chargement : sans modèle ET sans requête en vol, l’écran affiche une indisponibilité avec un bouton « Réessayer » plutôt qu’un squelette qui tournerait indéfiniment sans jamais dire que la facturation est cassée.',
      source: 'apps/web/src/features/billing/view/Billing.tsx:79',
    },
    {
      kind: 'decision',
      text: '« Acheter des crédits » et « Choisir un plan » sont deux gestes distincts (ils étaient identiques avant, d’où la confusion) : le premier saute directement aux packs de recharge ponctuelle, il ne retombe sur le sélecteur de plan que si aucun pack n’est configuré — jamais un bouton qui ne mène nulle part.',
      source: 'apps/web/src/features/billing/view/Billing.tsx:44',
    },
    {
      kind: 'ecart',
      text: "L’entrée de la page anime avec `ease: 'easeOut'` (mot-clé Framer intégré), pas `EASE.out` de la grammaire `packages/ui/src/motion.ts` (GA-25) — une cinquième redéfinition locale d’une courbe qui devrait venir d’un seul endroit.",
      source: 'apps/web/src/features/billing/view/Billing.tsx:92',
    },
    {
      kind: 'decision',
      text: 'Responsive : depuis #4466 la page est une seule colonne (forfait, moyen de paiement, factures), empilée à toutes les largeurs — plus de carte Crédits à accoler au forfait. Au-delà de 1920 px (2560, 3440) la colonne garde sa largeur de lecture ; la table de factures gagne des colonnes secondaires plutôt que de s’étirer.',
      source: 'apps/web/src/features/billing/view/Billing.tsx:64',
    },
  ],
}
