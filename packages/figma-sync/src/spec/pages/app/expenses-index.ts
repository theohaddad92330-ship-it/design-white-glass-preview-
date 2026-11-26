import type { PageSpec } from '../../types'

/**
 * /expenses — les notes de frais à traiter : quatre tuiles (comptes, jamais
 * bloquées par le droit financier), recherche + mois + statut, table, dossier
 * au clic. Le montant, lui, passe par `finance:read`.
 *
 * Lu dans : `apps/web/src/routes/missions/notes-de-frais.tsx` (ex-`/expenses`, désormais redirigé, Louis 22/10/2026) →
 * `ExpenseReportsPage.tsx` (tuiles, filtres, `ResponsiveTable`,
 * `ExpenseReportDrawer`). Textes de `apps/web/src/i18n/locales/fr/expenses.json`.
 */
export const expensesIndexPage: PageSpec = {
  id: 'app/expenses-index',
  surface: 'app',
  domain: 'expenses',
  route: 'apps/web/src/routes/missions/notes-de-frais.tsx',
  title: 'Notes de frais',
  template: 'list',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Les notes de frais à traiter', style: 'title' },
      { type: 'text', text: 'Ce qui attend une décision, et pourquoi.', style: 'body', color: 'text/secondary' },
      { type: 'component', component: 'Button', props: { variant: 'link', content: { label: 'Barème de frais' } } },
      {
        type: 'component',
        component: 'Button',
        props: { variant: 'default', size: 'sm', content: { label: 'Déposer une note' } },
      },
    ],
    intro: [
      {
        type: 'grid',
        columns: 4,
        columnsMobile: 2,
        gap: '2',
        children: [
          {
            type: 'component',
            component: 'Gauge',
            props: { size: 'small', content: { label: 'Brouillons', value: '2' } },
          },
          {
            type: 'component',
            component: 'Gauge',
            props: { size: 'small', content: { label: 'En attente', value: '5' } },
          },
          {
            type: 'component',
            component: 'Gauge',
            props: { size: 'small', content: { label: 'Validées', value: '22' } },
          },
          {
            type: 'component',
            component: 'Gauge',
            props: { size: 'small', content: { label: 'Refusées', value: '1' } },
          },
        ],
      },
    ],
    filters: [
      {
        type: 'component',
        component: 'SearchInput',
        props: { size: 'sm', content: { placeholder: 'Rechercher par porteur, client, référence, mois…' } },
      },
      { type: 'component', component: 'Input', props: { content: { label: 'Mois de la période' } } },
      {
        type: 'component',
        component: 'FilterChips',
        props: { size: 'sm', items: ['En attente', 'Validée', 'Refusée', 'Brouillon'] },
      },
    ],
    primary: [
      {
        type: 'component',
        component: 'Table',
        props: {
          table: {
            columns: ['Porteur', 'Client', 'Période', 'Référence', '# Lignes', 'Montant total', 'Statut'],
            rows: [
              ['Membre exemple 1', 'Compte exemple', '2026-09', 'NF-0001', '4', 'Montants réservés', 'En attente'],
              ['Membre exemple 2', 'Sans client', '2026-09', 'NF-0002', '2', 'Montants réservés', 'Validée'],
              ['Membre exemple 3', 'Compte exemple', '2026-08', 'NF-0003', '6', 'Montants réservés', 'Refusée'],
              ['Membre exemple 1', 'Sans client', '2026-09', 'NF-0004', '1', 'Montants réservés', 'Brouillon'],
            ],
          },
        },
      },
      {
        type: 'stack',
        direction: 'row',
        gap: '2',
        justify: 'between',
        align: 'center',
        children: [
          { type: 'text', text: '1–4 sur 30', style: 'caption', color: 'text/secondary' },
          {
            type: 'stack',
            direction: 'row',
            gap: '2',
            children: [
              {
                type: 'component',
                component: 'Button',
                props: { variant: 'outline', size: 'sm', content: { label: '← Précédent' } },
              },
              { type: 'text', text: 'Page 1 sur 8', style: 'caption', color: 'text/muted' },
              {
                type: 'component',
                component: 'Button',
                props: { variant: 'outline', size: 'sm', content: { label: 'Suivant →' } },
              },
              {
                type: 'component',
                component: 'Select',
                props: {
                  size: 'sm',
                  content: { label: 'Notes par page', value: '10 / page' },
                  items: ['10 / page', '25 / page', '50 / page'],
                },
              },
            ],
          },
        ],
      },
      { type: 'text', text: 'Dossier NF-0001 (ouvert au clic sur la ligne)', style: 'heading' },
      {
        type: 'grid',
        columns: 4,
        columnsMobile: 2,
        gap: '2',
        children: [
          {
            type: 'component',
            component: 'Stat',
            props: { state: 'measured', content: { label: 'Période', value: '2026-09' } },
          },
          {
            type: 'component',
            component: 'Stat',
            props: { state: 'measured', content: { label: 'Référence', value: 'NF-0001' } },
          },
          {
            type: 'component',
            component: 'Stat',
            props: { state: 'measured', content: { label: '# Lignes', value: '4' } },
          },
          {
            type: 'component',
            component: 'Stat',
            props: { state: 'measured', content: { label: 'Montant total (TTC)', value: 'Montants réservés' } },
          },
        ],
      },
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Vérification automatique' } },
        children: [
          {
            type: 'stack',
            direction: 'row',
            justify: 'between',
            align: 'start',
            gap: '2',
            children: [
              { type: 'text', text: '1 point à vérifier', style: 'body', color: 'soft/warning/text' },
              {
                type: 'component',
                component: 'Button',
                props: { variant: 'outline', size: 'sm', content: { label: 'Masquer le détail' } },
              },
            ],
          },
          {
            type: 'text',
            text: 'Un justificatif dépasse le barème restauration de 12 €.',
            style: 'caption',
            color: 'soft/warning/text',
          },
        ],
      },
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Conformité politique frais' } },
        children: [
          { type: 'component', component: 'Badge', props: { variant: 'danger', content: { label: 'Dépassement' } } },
          {
            type: 'text',
            text: 'Remboursement au barème, selon Barème interne.',
            style: 'caption',
            color: 'text/muted',
          },
        ],
      },
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'TVA' } },
        children: [
          {
            type: 'component',
            component: 'DataList',
            props: {},
            children: [
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'TVA récupérable', value: '38,40 €' } },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'TVA supportée par l’entreprise', value: '4,20 €' } },
              },
            ],
          },
          { type: 'text', text: '1 ligne sans taux lu', style: 'caption', color: 'text/muted' },
        ],
      },
      { type: 'text', text: 'Détail des frais', style: 'heading' },
      {
        type: 'stack',
        direction: 'column',
        gap: '2',
        children: [
          {
            type: 'stack',
            direction: 'column',
            gap: '1',
            padding: '2',
            fill: 'surface/1',
            stroke: 'border/default',
            radius: 'md',
            children: [
              {
                type: 'stack',
                direction: 'row',
                justify: 'between',
                gap: '2',
                children: [
                  { type: 'text', text: 'Déjeuner client', style: 'body' },
                  { type: 'text', text: '45,00 €', style: 'body' },
                ],
              },
              { type: 'text', text: '2026-09-12 • Paris', style: 'caption', color: 'text/muted' },
              {
                type: 'stack',
                direction: 'row',
                gap: '3',
                children: [
                  { type: 'text', text: 'Plafond 33,00 €', style: 'caption', color: 'text/muted' },
                  { type: 'text', text: 'Dépasse de 12,00 €', style: 'caption', color: 'soft/warning/text' },
                  { type: 'text', text: 'TVA 10 %', style: 'caption', color: 'text/muted' },
                ],
              },
            ],
          },
          {
            type: 'stack',
            direction: 'column',
            gap: '1',
            padding: '2',
            fill: 'surface/1',
            stroke: 'border/default',
            radius: 'md',
            children: [
              {
                type: 'stack',
                direction: 'row',
                justify: 'between',
                gap: '2',
                children: [
                  { type: 'text', text: 'Trajet Paris–Lyon', style: 'body' },
                  { type: 'text', text: '86,40 €', style: 'body' },
                ],
              },
              { type: 'text', text: '2026-09-10', style: 'caption', color: 'text/muted' },
              {
                type: 'stack',
                direction: 'row',
                gap: '3',
                children: [
                  { type: 'text', text: '480 km · 6 CV', style: 'caption', color: 'text/muted' },
                  { type: 'text', text: 'Hors barème', style: 'caption', color: 'text/muted' },
                ],
              },
            ],
          },
        ],
      },
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Pièces jointes (2)' } },
        children: [
          {
            type: 'stack',
            direction: 'row',
            gap: '2',
            children: [
              {
                type: 'stack',
                direction: 'column',
                gap: '1',
                padding: '2',
                fill: 'surface/1',
                stroke: 'border/default',
                radius: 'md',
                children: [
                  { type: 'text', text: 'Facture_hotel.pdf', style: 'caption' },
                  { type: 'text', text: '842 Ko', style: 'caption', color: 'text/muted' },
                  { type: 'text', text: 'À conserver jusqu’au 2032-09-12', style: 'caption', color: 'text/muted' },
                  {
                    type: 'component',
                    component: 'Button',
                    props: { variant: 'link', size: 'sm', content: { label: 'Télécharger Facture_hotel.pdf' } },
                  },
                ],
              },
              {
                type: 'stack',
                direction: 'column',
                gap: '1',
                padding: '2',
                fill: 'surface/1',
                stroke: 'border/default',
                radius: 'md',
                children: [
                  { type: 'text', text: 'Ticket_taxi.jpg', style: 'caption' },
                  { type: 'text', text: 'non mesuré', style: 'caption', color: 'text/muted' },
                  { type: 'text', text: 'À conserver jusqu’au 2032-09-12', style: 'caption', color: 'text/muted' },
                  { type: 'text', text: 'Enregistrée, non téléchargeable ici', style: 'caption', color: 'text/muted' },
                ],
              },
            ],
          },
        ],
      },
      {
        type: 'text',
        text: 'Dépôt de justificatif — uniquement tant que la note n’est pas décidée',
        style: 'label',
        color: 'text/muted',
      },
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Ajoute un justificatif' } },
        children: [
          { type: 'text', text: 'Ajoute un justificatif — glisse-le ici, ou choisis-le.', style: 'body' },
          {
            type: 'component',
            component: 'Button',
            props: { variant: 'outline', size: 'sm', content: { label: 'Choisir un fichier' } },
          },
          {
            type: 'text',
            text: 'Formats acceptés : .pdf,.png,.jpg,.jpeg,.webp,.heic,.docx,.xlsx,.csv,.txt. 10 Mo maximum par fichier.',
            style: 'caption',
            color: 'text/muted',
          },
        ],
      },
      {
        type: 'component',
        component: 'InfoBanner',
        props: {
          variant: 'info',
          size: 'sm',
          content: {
            title: 'Action recommandée',
            description: 'Regarde d’abord ce que la vérification a relevé, puis valide ou refuse.',
          },
        },
      },
      {
        type: 'text',
        text: 'À la validation, ces frais entreront dans le coût de la mission.',
        style: 'caption',
        color: 'text/muted',
      },
      {
        type: 'text',
        text: 'Trace de rejet — uniquement si le statut est « Refusée » (ex. NF-0003)',
        style: 'label',
        color: 'text/muted',
      },
      {
        type: 'component',
        component: 'InfoBanner',
        props: {
          variant: 'danger',
          size: 'sm',
          content: {
            title: 'Refusée le 2026-08-30',
            description: 'Un justificatif de taxi est présent deux fois dans ce dossier.',
          },
        },
      },
      {
        type: 'text',
        text: 'Barre d’actions du dossier — état « En attente », avant refus',
        style: 'label',
        color: 'text/muted',
      },
      {
        type: 'stack',
        direction: 'row',
        gap: '2',
        children: [
          { type: 'component', component: 'Button', props: { variant: 'default', content: { label: 'Valider' } } },
          { type: 'component', component: 'Button', props: { variant: 'outline', content: { label: 'Refuser' } } },
        ],
      },
      {
        type: 'stack',
        direction: 'row',
        gap: '2',
        children: [
          {
            type: 'component',
            component: 'Button',
            props: { variant: 'ghost', size: 'sm', content: { label: 'Modifier' } },
          },
          {
            type: 'component',
            component: 'Button',
            props: { variant: 'ghost', size: 'sm', content: { label: 'Retirer' } },
          },
        ],
      },
      {
        type: 'text',
        text: 'Sous-vue ExpenseReportEditor (ouverte par « Déposer une note » ou par « Modifier »)',
        style: 'heading',
      },
      {
        type: 'component',
        component: 'SectionCard',
        props: {
          content: {
            title: 'Déposer une note de frais',
            description: 'Enregistre-la en brouillon autant de fois qu’il faut ; « Soumettre » l’envoie au valideur.',
          },
        },
        children: [
          { type: 'component', component: 'Input', props: { content: { label: 'Référence' } } },
          { type: 'component', component: 'Input', props: { content: { label: 'Porteur de la note' } } },
          { type: 'component', component: 'Input', props: { content: { label: 'Période' } } },
          { type: 'text', text: 'Ligne 1', style: 'label' },
          {
            type: 'component',
            component: 'Select',
            props: { content: { label: 'Catégorie' }, items: ['Repas', 'Hôtel', 'Train', 'Taxi'] },
          },
          { type: 'component', component: 'Input', props: { content: { label: 'Date de la dépense' } } },
          {
            type: 'component',
            component: 'Input',
            props: { content: { label: 'Libellé de la ligne', value: 'Déjeuner client' } },
          },
          { type: 'component', component: 'Input', props: { content: { label: 'Ville' } } },
          { type: 'component', component: 'Input', props: { content: { label: 'Montant TTC' } } },
          { type: 'component', component: 'Input', props: { content: { label: 'Taux de TVA' } } },
          {
            type: 'component',
            component: 'Button',
            props: { variant: 'ghost', size: 'sm', content: { label: 'Ajouter une ligne' } },
          },
          {
            type: 'text',
            text: 'Tu nommes ici les pièces du dossier. Le dépôt du fichier lui-même n’est pas encore branché : rien n’est téléversé, et aucun lien de téléchargement n’est proposé.',
            style: 'caption',
            color: 'text/muted',
          },
          {
            type: 'stack',
            direction: 'row',
            gap: '2',
            children: [
              {
                type: 'component',
                component: 'Button',
                props: { variant: 'outline', content: { label: 'Enregistrer le brouillon' } },
              },
              {
                type: 'component',
                component: 'Button',
                props: { variant: 'default', content: { label: 'Soumettre' } },
              },
            ],
          },
        ],
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
            title: 'Aucune note de frais sur cette période',
            description: 'Change de mois, ou retire les filtres.',
          },
        },
      },
    ],
    loading: [{ type: 'component', component: 'Skeleton', props: { shape: 'table' } }],
    error: [
      {
        type: 'component',
        component: 'EmptyState',
        props: { size: 'md', align: 'center', content: { title: 'Les notes de frais n’ont pas pu être chargées' } },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'ecart',
      text: 'Corrigé dans cette maquette : le lien vers le barème s’intitule « Barème de frais » (`page.policyLink`), pas « Voir le barème ». L’ordre réel des quatre tuiles est Brouillons → En attente → Validées → Refusées, pas En attente en tête.',
      source: 'apps/web/src/features/expenses/view/ExpenseReportsPage.tsx:226',
    },
    {
      kind: 'decision',
      text: 'Les quatre tuiles de tête comptent des NOTES (« quinze notes attendent »), jamais un montant — le compte sort toujours, le montant passe par `finance:read` et s’écrit « Montants réservés » plutôt que « 0,00 € » quand le droit manque (GA-18/19).',
      source: 'apps/web/src/features/expenses/view/ExpenseReportsPage.tsx:24',
    },
    {
      kind: 'decision',
      text: 'Le dossier ouvert au clic (`ExpenseReportDrawer`) ne stocke jamais le fichier lui-même : seulement des traces (date de validation, motif de rejet, relances). La conformité politique frais a 3 verdicts — jamais « non vérifiée » ne prend la couleur verte de « conforme ».',
      source: 'apps/web/src/features/expenses/view/ExpenseReportDrawer.tsx:49',
    },
    {
      kind: 'decision',
      text: 'Les tuiles IGNORENT le filtre de statut — elles le remplacent par leurs propres compteurs fixes : sur une liste filtrée « en attente », des tuiles elles-mêmes filtrées afficheraient 15/0/0 et feraient croire qu’il n’y a jamais rien eu de validé.',
      source: 'apps/web/src/features/expenses/view/ExpenseReportsPage.tsx:30',
    },
    {
      kind: 'decision',
      text: 'Le lien vers le barème (`/expenses/bareme`) est ici et nulle part ailleurs : un réglage vit à un seul endroit (GA-26), et c’est ici qu’on se demande pourquoi une note est « non vérifiée ».',
      source: 'apps/web/src/features/expenses/view/ExpenseReportsPage.tsx:179',
    },
    {
      kind: 'decision',
      text: 'Responsive : `ResponsiveTable` réduit chaque ligne à un titre (porteur) + un méta (client) sous le seuil mobile, les autres colonnes se lisant dans le dossier ouvert au clic — jamais un défilement horizontal illisible à 360/390 px.',
      source: 'apps/web/src/features/expenses/view/ExpenseReportsPage.tsx:88',
    },
    {
      kind: 'decision',
      text: 'Responsive (tablette/desktop/ultra-wide) : la grille de tuiles est 2 colonnes sous 768 px, 4 colonnes à partir de la tablette (768-1194) et jusqu’à 1920 px. Au-delà de 1920 px (2560, 3440) : la table gagne ses colonnes secondaires (référence, lignes) déjà visibles sans réduction, plutôt que de s’étirer — un montant financier ne s’agrandit jamais pour remplir l’espace.',
      source: 'apps/web/src/features/expenses/view/ExpenseReportsPage.tsx:226',
    },
    {
      kind: 'decision',
      text: 'Un résultat vide DISTINGUE « la période ne porte aucune note » (`empty.title`, ci-dessus) et « la période porte des notes, mais le filtre les a retirées » (`empty.filteredTitle` : « Aucune note ne correspond à ce filtre », avec un bouton « Retirer les filtres ») — jamais le même message pour les deux.',
      source: 'apps/web/src/features/expenses/view/ExpenseReportsPage.tsx:273',
    },
    {
      kind: 'ecart',
      text: '`empty` (état obligatoire du gabarit `list`) ne porte qu’UN message. Le second, distinct dans le code (filtre actif sur une période non vide : « La période porte {{count}} note(s) — c’est le filtre qui les a retirées. », suivi d’un bouton « Retirer les filtres ») n’a pas de second slot où se dessiner.',
      source: 'apps/web/src/features/expenses/view/ExpenseReportsPage.tsx:273',
    },
    {
      kind: 'decision',
      text: 'La sélection « par page » (Select, 10/25/50 lignes) vit dans le pied de tableau, juste après « Suivant → » — un réglage vit à un seul endroit, et ce n’est pas un filtre puisqu’il ne change pas ce qui est montré, seulement combien.',
      source: 'apps/web/src/features/expenses/view/ExpenseReportsPage.tsx:389',
    },
    {
      kind: 'decision',
      text: 'La conformité politique frais a TROIS verdicts, jamais deux : `compliant` → « Conforme » (badge success), `breach` → « Dépassement » (badge danger), `unknown` → « Non vérifiée » (badge secondary — jamais le vert de « conforme », qui serait une garantie tirée d’un silence). Le dossier maquetté ici montre l’état « Dépassement » ; les deux autres partagent la même carte, seuls le badge et la teinte changent.',
      source: 'apps/web/src/features/expenses/view/ExpenseReportDrawer.tsx:564',
    },
    {
      kind: 'decision',
      text: 'La vérification automatique a aussi un état « conforme » (`check.clean` : « Aucune anomalie détectée », palette success, sans bouton « Voir le détail » puisqu’il n’y a rien à déplier) — non maquetté ici, qui montre l’état avec un point à vérifier et son détail déplié (`check.toggle` / `check.hide`).',
      source: 'apps/web/src/features/expenses/view/ExpenseReportDrawer.tsx:516',
    },
    {
      kind: 'decision',
      text: 'La barre d’actions du dossier a trois formes selon l’état, jamais montrées ensemble : brouillon (« Modifier » + « Soumettre », avec la phrase « Tant qu’elle est en brouillon, personne d’autre ne la voit passer. ») ; en attente hors refus (« Valider » + « Refuser » en primaire, « Modifier » + « Retirer » en second rang, maquetté ici) ; en train de refuser (un champ Motif du refus obligatoire, puis « Confirmer le refus » / « Annuler »). Une note DÉCIDÉE (validée ou refusée) n’a plus aucune barre — le dossier se lit, il ne se rejoue pas.',
      source: 'apps/web/src/features/expenses/view/ExpenseReportDrawer.tsx:336',
    },
  ],
}
