import type { PageSpec } from '../../types'

/**
 * `/changelog` — ce qu'on a livré, et qui l'a su (#1704). Le catalogue (source
 * `@bellum/contracts`, jamais recopié) et l'état de diffusion de la newsletter
 * Changelog : lecteurs, à jour/en retard, répartition par repère.
 *
 * Lu dans : `src/app/changelog/page.tsx`.
 */
export const changelogPage: PageSpec = {
  id: 'dm/changelog',
  surface: 'dm',
  domain: 'produit',
  route: 'apps/dashboard-manager/src/app/changelog/page.tsx',
  title: 'Changelog',
  template: 'dashboard',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Changelog', style: 'title' },
      {
        type: 'text',
        text: 'Ce qu’on a livré, et qui l’a su. Le catalogue vient du contrat partagé — le même que le panneau « Nouveautés » de l’application et que la newsletter bimensuelle. / What shipped, and who was told: one shared catalogue for the app panel, the newsletter and this screen.',
        style: 'body',
        color: 'text/secondary',
      },
    ],
    kpis: [
      {
        type: 'grid',
        columns: 4,
        columnsMobile: 2,
        gap: '4',
        children: [
          {
            type: 'component',
            component: 'Card',
            props: { content: { title: 'Entrées publiées / Published' } },
            children: [{ type: 'text', text: '24', style: 'display' }],
          },
          {
            type: 'component',
            component: 'Card',
            props: { content: { title: 'Lecteurs / Readers' } },
            children: [{ type: 'text', text: '312', style: 'display' }],
          },
          {
            type: 'component',
            component: 'Card',
            props: { content: { title: 'À jour / Up to date' } },
            children: [{ type: 'text', text: '78 %', style: 'display' }],
          },
          {
            type: 'component',
            component: 'Card',
            props: { content: { title: 'En retard / Behind' } },
            children: [{ type: 'text', text: '54', style: 'display' }],
          },
        ],
      },
    ],
    primary: [
      { type: 'text', text: 'Où en sont les lecteurs', style: 'heading' },
      {
        type: 'text',
        text: 'Les six familles s’additionnent aux lecteurs : chacun est dans une et une seule. La liste des lecteurs est la MÊME requête que l’envoi. / The six buckets add up to the readers: each is in exactly one. The reader list is the SAME query as the send itself.',
        style: 'caption',
        color: 'text/muted',
      },
      {
        type: 'component',
        component: 'Table',
        props: {
          table: {
            columns: ['Famille / Bucket', 'Lecteurs', 'Ce que le prochain envoi fera'],
            rows: [
              ['À jour / up to date', '210', 'Rien — pas d’e-mail creux.'],
              ['En retard / behind', '54', 'Le delta au-dessus de leur repère.'],
              ['Jamais servi / never served', '30', 'Pose le repère, n’envoie pas l’historique.'],
              ['Repère retiré du catalogue', '8', 'Re-pose le repère, n’envoie rien.'],
              ['Désinscrits / opted out', '7', 'Rien — interrupteur explicitement sur OFF.'],
              ['Sans adresse / no address', '3', 'Rien — on ne peut pas leur écrire.'],
            ],
          },
        },
      },
      {
        type: 'text',
        text: '⚠️ La liste de suppression n’est pas évaluée ici : elle se décide par espace au moment de l’envoi. « En retard » est donc un nombre de LECTEURS en retard, pas un nombre d’e-mails qui partiront. / The suppression list is decided per workspace at send time, so “behind” counts readers, not future emails.',
        style: 'caption',
        color: 'text/muted',
      },
      { type: 'text', text: 'Les repères, du plus en retard au plus à jour', style: 'heading' },
      {
        type: 'component',
        component: 'Table',
        props: {
          table: {
            columns: ['Calés sur / Marker', 'Date', 'Lecteurs', 'Entrées non reçues'],
            rows: [
              ['entrée retirée du catalogue', '15/07/2026', '22', '4'],
              ['Le plan de Laura s’édite sans treize formulaires', '02/09/2026', '44', '3'],
              ['La facture se prépare, elle ne s’émet plus toute seule', '19/08/2026', '96', '2'],
              ['Le rôle réordonne, il ne filtre plus', '05/08/2026', '70', '1'],
              ['campaign_label referme l’audience multi-contacts', '16/09/2026', '150', '0'],
            ],
          },
        },
      },
      { type: 'text', text: 'Ce qu’on a livré', style: 'heading' },
      {
        type: 'stack',
        direction: 'column',
        gap: '4',
        children: [
          {
            type: 'component',
            component: 'Card',
            props: {},
            children: [
              {
                type: 'stack',
                direction: 'row',
                gap: '2',
                align: 'center',
                children: [
                  { type: 'text', text: 'campaign_label referme l’audience multi-contacts', style: 'caption' },
                  { type: 'text', text: '16/09/2026', style: 'caption', color: 'text/muted' },
                  {
                    type: 'component',
                    component: 'Badge',
                    props: { variant: 'default', content: { label: 'la plus récente' } },
                  },
                ],
              },
              {
                type: 'text',
                text: '• Une campagne porte désormais une étiquette mono-contact, plutôt qu’une audience.\n• Le chantier multi-contacts est refermé, assumé et daté.',
                style: 'body',
              },
            ],
          },
          {
            type: 'component',
            component: 'Card',
            props: {},
            children: [
              {
                type: 'stack',
                direction: 'row',
                gap: '2',
                align: 'center',
                children: [
                  { type: 'text', text: 'Le plan de Laura s’édite sans treize formulaires', style: 'caption' },
                  { type: 'text', text: '02/09/2026', style: 'caption', color: 'text/muted' },
                ],
              },
              {
                type: 'text',
                text: '• Un formulaire générique remplace les treize écrans dédiés d’édition/duplication du plan.',
                style: 'body',
              },
            ],
          },
          {
            type: 'component',
            component: 'Card',
            props: {},
            children: [
              {
                type: 'stack',
                direction: 'row',
                gap: '2',
                align: 'center',
                children: [
                  { type: 'text', text: 'La facture se prépare, elle ne s’émet plus toute seule', style: 'caption' },
                  { type: 'text', text: '19/08/2026', style: 'caption', color: 'text/muted' },
                ],
              },
              {
                type: 'text',
                text: '• « Préparée » ≠ « créée » ≠ « envoyée » : une facture n’est jamais comptabilisée par Laura.\n• « Facturé » s’écrit désormais uniquement sur preuve du connecteur de l’outil branché par le client.',
                style: 'body',
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
        props: { size: 'md', align: 'center', content: { title: 'Aucune entrée au catalogue. / No catalogue entry.' } },
      },
    ],
    loading: [{ type: 'component', component: 'Skeleton', props: { shape: 'block' } }],
    error: [
      {
        type: 'component',
        component: 'GenericProblemMessage',
        props: { content: { title: 'Changelog indisponible' } },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'decision',
      text: 'Deux questions sur un seul écran, volontairement : « qu’est-ce qui est parti ? » (catalogue) et « les clients l’ont-ils su ? » (diffusion) — les séparer aurait fait deux écrans dont aucun ne répond seul.',
      source: 'apps/dashboard-manager/src/app/changelog/page.tsx:8',
    },
    {
      kind: 'decision',
      text: 'Une valeur absente ne s’affiche jamais « 0 » : le taux « à jour » écrit « non mesuré » plutôt qu’un pourcentage inventé quand `delivery` n’a pas encore de valeur (GA-18/19).',
      source: 'apps/dashboard-manager/src/app/changelog/page.tsx:19',
    },
    {
      kind: 'decision',
      text: 'Responsive : la grille de 4 tuiles (`repeat(4, 1fr)`) passerait à 3 colonnes à 1280 pour rester lisible ; contenu borné à 1600 px sur 1920, jamais étiré. Au-delà (2560, 3440) le tableau des repères gagnerait une colonne de contexte supplémentaire plutôt que de s’étirer.',
      source: 'apps/dashboard-manager/src/app/changelog/page.tsx:50',
    },
    {
      kind: 'ecart',
      text: '`gridTemplateColumns: repeat(4, 1fr)` est un style inline SANS media query : à 1280 les 4 tuiles ne se réduisent pas à 3, elles se resserrent simplement à l’intérieur du même conteneur — pas de bascule mesurée.',
      source: 'apps/dashboard-manager/src/app/changelog/page.tsx:50',
    },
    {
      kind: 'decision',
      text: 'Les 4 KPI (`kpis`) et les deux tableaux de diffusion (« Où en sont les lecteurs », « Les repères ») ne s’affichent que si l’API renvoie `delivery` ; sinon la page ne montre que « Ce qu’on a livré » (le catalogue, ou « Aucune entrée au catalogue » s’il est vide). Ce dégradé n’est pas représentable comme un `state` de cette spec : un état ne remplace que le slot `primary` (jamais `kpis`), et le gabarit `dashboard` ne déclare aucun `optionalStates` dans `catalog.ts` — à traiter par un lot qui touche le catalogue, hors périmètre de cette édition.',
      source: 'apps/dashboard-manager/src/app/changelog/page.tsx:48',
    },
    {
      kind: 'ecart',
      text: 'Le code affiche un tiret « — » quand `pendingEntries` vaut 0 (`marker.pendingEntries === 0 ? « — » : marker.pendingEntries`), alors qu’une valeur absente doit s’écrire « non mesuré » et une valeur mesurée à zéro doit s’écrire « 0 » (jamais un tiret, GA-18/19) : la maquette montre la vraie valeur `0` sur son dernier repère.',
      source: 'apps/dashboard-manager/src/app/changelog/page.tsx:144',
    },
    {
      kind: 'decision',
      text: 'Un repère dont l’entrée a été retirée du catalogue (`marker.title` absent) affiche le libellé « entrée retirée du catalogue » à la place d’un titre — modélisé ici en texte simple, `Table` ne portant pas de style atténué par cellule.',
      source: 'apps/dashboard-manager/src/app/changelog/page.tsx:140',
    },
  ],
}
