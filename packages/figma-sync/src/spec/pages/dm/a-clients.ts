import type { PageSpec } from '../../types'

/**
 * `/clients?view=esn` — annuaire ESN + KPIs manager, réunis (#1664). L'ancien
 * `/teams` est FUSIONNÉ ici sous l'onglet ESN (même entité, deux focales :
 * identité/plan/membres puis activité). `/clients` sans `?view=esn` redirige
 * vers `/users` (hors périmètre de ce lot) — la vue maquettée est celle qui
 * reste sur cette route.
 *
 * Lu dans : `src/app/clients/page.tsx` → `_components/esn-directory.tsx`,
 * `teams-panel.tsx`, `create-client-form.tsx` (provisionnement commercial).
 */
export const clientsPage: PageSpec = {
  id: 'dm/clients',
  surface: 'dm',
  domain: 'clients',
  route: 'apps/dashboard-manager/src/app/clients/page.tsx',
  title: 'Clients',
  template: 'admin-table',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Clients', style: 'title' },
      {
        type: 'text',
        text: 'Backoffice — utilisateurs et ESN (workspaces) réunis en un seul écran. La vue ESN combine l’annuaire et les KPIs manager par ESN.',
        style: 'body',
        color: 'text/secondary',
      },
    ],
    actions: [
      {
        type: 'grid',
        columns: 4,
        columnsMobile: 2,
        gap: '4',
        children: [
          {
            type: 'component',
            component: 'Card',
            props: { content: { title: 'Users' } },
            children: [{ type: 'text', text: '128', style: 'display' }],
          },
          {
            type: 'component',
            component: 'Card',
            props: { content: { title: 'ESN' } },
            children: [{ type: 'text', text: '18', style: 'display' }],
          },
          {
            type: 'component',
            component: 'Card',
            props: { content: { title: 'Comptes analysés' } },
            children: [{ type: 'text', text: '640', style: 'display' }],
          },
          {
            type: 'component',
            component: 'Card',
            props: { content: { title: 'Répartition plans' } },
            children: [
              {
                type: 'component',
                component: 'FilterChips',
                props: { items: ['trial · 4', 'starter · 2', 'team · 6', 'growth · 5', 'beta · 1'] },
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
            title: 'Créer un client (facturation manuelle)',
            description:
              'Provisionne l’ESN, son propriétaire, son équipe et son quota — sans passer par Stripe. Le client est facturé sur facture, hors application. Aucun mot de passe n’est créé : l’e-mail de bienvenue du propriétaire, avec son lien de définition de mot de passe, est remis ici pour être envoyé par l’opérateur.',
          },
        },
        children: [
          { type: 'text', text: 'ESN', style: 'caption', color: 'text/muted' },
          { type: 'component', component: 'Input', props: { content: { label: 'Nom de l’ESN', value: 'Skaizen' } } },
          { type: 'text', text: 'Propriétaire', style: 'caption', color: 'text/muted' },
          {
            type: 'stack',
            direction: 'row',
            gap: '3',
            children: [
              {
                type: 'component',
                component: 'Input',
                props: { content: { label: 'Email', value: 'a.durand@skaizen.fr' } },
              },
              { type: 'component', component: 'Input', props: { content: { label: 'Prénom', value: 'Ambre' } } },
              { type: 'component', component: 'Input', props: { content: { label: 'Nom', value: 'Durand' } } },
            ],
          },
          { type: 'text', text: 'Plan & quota', style: 'caption', color: 'text/muted' },
          {
            type: 'stack',
            direction: 'row',
            gap: '3',
            children: [
              { type: 'component', component: 'Select', props: { content: { label: 'Plan', value: 'Growth' } } },
              {
                type: 'component',
                component: 'Input',
                props: { content: { label: 'Sièges supplémentaires', value: '0' } },
              },
              { type: 'component', component: 'Input', props: { content: { label: 'Crédits / mois', value: '' } } },
              {
                type: 'component',
                component: 'Input',
                props: { content: { label: 'Crédits d’enrichissement', value: '' } },
              },
            ],
          },
          {
            type: 'text',
            text: 'Vide = valeur du plan — une analyse coûte 8 crédits.',
            style: 'caption',
            color: 'text/muted',
          },
          { type: 'text', text: 'Conditions commerciales', style: 'caption', color: 'text/muted' },
          {
            type: 'stack',
            direction: 'row',
            gap: '3',
            children: [
              { type: 'component', component: 'Input', props: { content: { label: 'Montant (€)', value: '4800' } } },
              {
                type: 'component',
                component: 'Select',
                props: { content: { label: 'Périodicité', value: 'Annuel' } },
              },
              {
                type: 'component',
                component: 'Input',
                props: { content: { label: 'Date de début', value: '01/10/2026' } },
              },
              {
                type: 'component',
                component: 'Select',
                props: { content: { label: 'Engagement', value: '12 mois' } },
              },
              { type: 'component', component: 'Select', props: { content: { label: 'Paiement', value: 'Non payé' } } },
              {
                type: 'component',
                component: 'Input',
                props: { content: { label: 'Référence facture', value: 'FA-2026-0913' } },
              },
            ],
          },
          {
            type: 'text',
            text: 'L’échéance de l’engagement est SIGNALÉE, jamais appliquée — aucun accès n’est coupé automatiquement.',
            style: 'caption',
            color: 'text/muted',
          },
          { type: 'text', text: 'Destinataire de la facture', style: 'caption', color: 'text/muted' },
          {
            type: 'stack',
            direction: 'row',
            gap: '3',
            children: [
              {
                type: 'component',
                component: 'Input',
                props: { content: { label: 'Facturé à', value: 'Skaizen SAS' } },
              },
              { type: 'component', component: 'Select', props: { content: { label: 'Qualité', value: 'Société' } } },
              {
                type: 'component',
                component: 'Input',
                props: { content: { label: 'Email de facturation', value: 'compta@skaizen.fr' } },
              },
            ],
          },
          { type: 'text', text: 'Équipe à inviter', style: 'caption', color: 'text/muted' },
          {
            type: 'stack',
            direction: 'row',
            gap: '2',
            align: 'center',
            children: [
              {
                type: 'component',
                component: 'Input',
                props: { content: { label: 'Email', value: 'r.moreau@skaizen.fr' } },
              },
              { type: 'component', component: 'Select', props: { content: { label: 'Rôle', value: 'Commercial' } } },
              { type: 'component', component: 'Button', props: { variant: 'ghost', content: { label: 'Retirer' } } },
            ],
          },
          {
            type: 'component',
            component: 'Button',
            props: { variant: 'ghost', content: { label: '+ Ajouter un collaborateur' } },
          },
          {
            type: 'component',
            component: 'Card',
            props: { content: { title: 'Ce qui sera fait — Skaizen' } },
            children: [
              {
                type: 'text',
                text: '1. ESN « Skaizen » — création',
                style: 'body',
              },
              { type: 'text', text: '2. Propriétaire Ambre Durand — création du compte', style: 'body' },
              { type: 'text', text: '3. Plan Growth, 0 siège supplémentaire — mise à jour', style: 'body' },
              { type: 'text', text: '4. Conditions commerciales 4 800 € / an — création', style: 'body' },
              { type: 'text', text: '5. 1 invitation d’équipe (Renaud Moreau, Commercial) — création', style: 'body' },
              {
                type: 'text',
                text: '6. E-mail de bienvenue avec lien de mot de passe — hors transaction',
                style: 'body',
              },
              {
                type: 'text',
                text: 'Si quelque chose échoue : l’espace créé n’est jamais retiré — chaque étape non écrite reste rejouable depuis la fiche ESN.',
                style: 'caption',
                color: 'text/muted',
              },
            ],
          },
          {
            type: 'stack',
            direction: 'row',
            gap: '2',
            align: 'center',
            children: [
              {
                type: 'component',
                component: 'Button',
                props: { variant: 'default', content: { label: 'Confirmer et créer le client' } },
              },
              {
                type: 'component',
                component: 'Button',
                props: { variant: 'ghost', content: { label: 'Réinitialiser' } },
              },
            ],
          },
        ],
      },
    ],
    filters: [
      {
        type: 'component',
        component: 'TabNav',
        props: { variant: 'underline', items: ['Utilisateurs (128)', 'ESN (18)'] },
      },
    ],
    primary: [
      {
        type: 'component',
        component: 'SearchInput',
        props: { content: { placeholder: 'Rechercher une ESN par nom…' } },
      },
      {
        type: 'component',
        component: 'Card',
        props: { content: { title: 'Créer l’ESN' } },
        children: [
          {
            type: 'stack',
            direction: 'row',
            gap: '3',
            align: 'end',
            children: [
              {
                type: 'component',
                component: 'Input',
                props: { content: { label: 'Nom de l’ESN', value: 'Ex : Skaizen' } },
              },
              {
                type: 'component',
                component: 'Input',
                props: { content: { label: 'Propriétaire (userId)', value: 'uuid du user propriétaire' } },
              },
              {
                type: 'component',
                component: 'Button',
                props: { variant: 'default', content: { label: 'Créer l’ESN' } },
              },
            ],
          },
        ],
      },
      {
        type: 'component',
        component: 'Table',
        props: {
          table: {
            columns: ['Nom', 'Propriétaire', 'Membres', 'Créée le'],
            rows: [
              ['Wavestone Consulting', 'j••••@wavestone-consulting.fr', '4', '02/01/2026'],
              ['Synaltic Group', 'l••••@synaltic-group.fr', '6', '14/02/2026'],
              ['Cassiopée Digital', 'm••••@cassiopee-digital.fr', '3', '03/04/2026'],
              ['Nextedia Conseil', 's••••@nextedia-conseil.fr', '5', '20/06/2026'],
              ['Ekitia Systems', 't••••@ekitia-systems.fr', '2', '11/07/2026'],
              ['Arion Technologies', 'p••••@arion-technologies.fr', '4', '30/08/2026'],
            ],
          },
        },
      },
      {
        type: 'text',
        text: 'Analyses lancées par ESN (top 10)',
        style: 'heading',
      },
      { type: 'placeholder', kind: 'chart', label: 'Barres : analyses lancées, top 10 ESN', height: 'md' },
      { type: 'text', text: 'Équipes', style: 'heading' },
      {
        type: 'text',
        text: 'Fenêtre : 7j · 30j · 90j',
        style: 'caption',
        color: 'text/muted',
      },
      {
        type: 'grid',
        columns: 4,
        columnsMobile: 2,
        gap: '4',
        children: [
          {
            type: 'component',
            component: 'Card',
            props: { content: { title: 'Analyses lancées' } },
            children: [{ type: 'text', text: '383', style: 'display' }],
          },
          {
            type: 'component',
            component: 'Card',
            props: { content: { title: 'Messages envoyés' } },
            children: [{ type: 'text', text: '471', style: 'display' }],
          },
          {
            type: 'component',
            component: 'Card',
            props: { content: { title: 'Crédits consommés' } },
            children: [{ type: 'text', text: '1 216', style: 'display' }],
          },
          {
            type: 'component',
            component: 'Card',
            props: { content: { title: 'Comptes chauds' } },
            children: [{ type: 'text', text: '22', style: 'display' }],
          },
        ],
      },
      {
        type: 'component',
        component: 'Table',
        props: {
          table: {
            columns: [
              'ESN',
              'Membres',
              'Analyses (terminées)',
              'Comptes actifs',
              'Chauds',
              'Contacts enrichis',
              'Messages (vérifiés/déclarés)',
              'Réponses',
              'Taux réponse',
              'RDV',
              'Crédits',
              'Activation',
            ],
            rows: [
              [
                'Wavestone Consulting',
                '4',
                '86',
                '22',
                '6',
                '104',
                '38/52',
                '14',
                '36,8 %',
                '5',
                '312 / 400',
                '3/4 (75 %)',
              ],
              ['Synaltic Group', '6', '142', '31', '9', '186', '61/70', '24', '39,3 %', '8', '540 / 600', '5/6 (83 %)'],
              ['Cassiopée Digital', '3', '48', '12', '2', '58', '19/24', '6', '31,6 %', '2', '96 / 150', '2/3 (67 %)'],
              ['Nextedia Conseil', '5', '77', '18', '4', '89', '28/36', '9', '32,1 %', '3', '210 / 300', '3/5 (60 %)'],
              [
                'Ekitia Systems',
                '2',
                '21',
                '5',
                '1',
                '24',
                '8/11',
                '2',
                '25,0 %',
                '1',
                '40 / 100',
                '1/2 (retenu — moins de 5 membres onboardés)',
              ],
              [
                'Arion Technologies',
                '4',
                '9',
                '2',
                '0',
                '10',
                '2/4',
                '0',
                'non mesuré',
                '0',
                '18 / 100',
                '0/1 (retenu — moins de 5 membres onboardés)',
              ],
            ],
          },
        },
      },
      {
        type: 'component',
        component: 'Card',
        props: { content: { title: 'Méthodologie & limites (aucun chiffre inventé)' } },
        children: [
          {
            type: 'text',
            text: 'Fenêtre glissante : analyses, contacts enrichis, messages/actions et crédits sont comptés sur la fenêtre ; comptes actifs et pipeline sont un instantané de l’état commercial courant (non fenêtré).',
            style: 'caption',
            color: 'text/muted',
          },
          {
            type: 'text',
            text: '« Messages envoyés » agrège des envois vérifiés (Bellum, preuve de livraison) et des envois déclarés (LinkedIn, auto-déclaratif) — le total seul ne doit pas servir à évaluer un commercial.',
            style: 'caption',
            color: 'text/muted',
          },
          {
            type: 'text',
            text: 'Le taux d’activation d’une équipe est RETENU (jamais 0) quand le nombre de membres onboardés est sous le minimum d’agrégation de la doctrine — un pourcentage à côté du nom d’un client, sous ce seuil, désigne une personne.',
            style: 'caption',
            color: 'text/muted',
          },
          {
            type: 'text',
            text: 'Crédits attribués via le journal des crédits ; les mouvements sans acteur résolu sont comptés au niveau équipe, exposés en « non attribués », jamais répartis arbitrairement.',
            style: 'caption',
            color: 'text/muted',
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
        props: { size: 'md', align: 'center', content: { title: 'Aucune ESN' } },
      },
    ],
    loading: [{ type: 'component', component: 'Skeleton', props: { shape: 'table' } }],
    error: [
      {
        type: 'component',
        component: 'GenericProblemMessage',
        props: { content: { title: 'Vue d’ensemble indisponible' } },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'decision',
      text: '`/clients` sans `?view=esn` redirige vers `/users` depuis le 07/09/2026 (#1664) : deux listes d’utilisateurs coexistaient, la redirection évite qu’un signet tombe en 404 tout en gardant un seul tableau maintenu. La maquette de `/users` est un lot séparé, hors de ce périmètre.',
      source: 'apps/dashboard-manager/src/app/clients/page.tsx:62',
    },
    {
      kind: 'decision',
      text: 'ESN et Équipes sont deux focales d’UNE entité (même agrégat par workspace), donc fusionnées sous un seul sous-onglet plutôt que deux écrans : annuaire (identité/plan/membres) puis KPIs d’activité, sur la même page.',
      source: 'apps/dashboard-manager/src/app/clients/_components/teams-panel.tsx:17',
    },
    {
      kind: 'ecart',
      text: 'La vue d’ensemble (`OverviewCards`) est une grille `repeat(4, 1fr)` en style inline, sans media query : à 1280 les 4 tuiles se resserrent, elles ne passent jamais à 3.',
      source: 'apps/dashboard-manager/src/app/clients/page.tsx:23',
    },
    {
      kind: 'decision',
      text: 'Responsive : à 1280 le tableau « Équipes » (12 colonnes, corrigé dans cette maquette — Crédits et Activation manquaient) masquerait Contacts enrichis, RDV et Taux réponse (les moins consultées au premier regard), gardant ESN/Membres/Analyses/Comptes actifs/Chauds/Messages/Réponses/Crédits/Activation ; la grille de 4 KPI passerait à 3. Contenu borné à 1600 px sur 1920, jamais étiré. Au-delà (2560, 3440) le tableau Équipes garderait sa largeur de lecture et gagnerait un panneau de détail par ESN plutôt que de s’étirer.',
      source: 'apps/dashboard-manager/src/app/clients/_components/teams-panel.tsx:132',
    },
    {
      kind: 'ecart',
      text: 'Aucune règle `@media (min-width…)` n’existe dans le DM : le tableau de 10 colonnes compte uniquement sur `.wrap { overflow-x: auto }` pour défiler à 1280, aucune colonne ne se masque aujourd’hui.',
      source: 'apps/dashboard-manager/src/app/globals.css:133',
    },
    {
      kind: 'ecart',
      text: 'Corrigé dans cette maquette : `CreateClientForm` (provisionnement commercial, 6 fieldsets + aperçu des 6 étapes + panneau de résultat) et `CreateWorkspace` (« Créer l’ESN ») sont tous deux des sections EN LIGNE dans la page (aucun `Dialog`/`Sheet`), pas des surcouches — `CreateClientForm` bascule un bouton replié vers ce formulaire par un `useState` local, pas une navigation. Le filtre de recherche de l’annuaire ESN manquait aussi.',
      source: 'apps/dashboard-manager/src/app/clients/_components/create-client-form.tsx:314',
    },
  ],
}
