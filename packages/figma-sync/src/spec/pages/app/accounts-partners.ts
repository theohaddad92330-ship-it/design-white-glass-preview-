import type { PageSpec } from '../../types'

/**
 * /accounts/partners — l'écran Partenaires (tome 4 §13) : les ESN de ton
 * territoire, en trois onglets qui ne se mélangent pas. La même ESN peut
 * apparaître dans les trois — ce n'est pas un doublon, c'est le point de
 * départ du tome (« une ESN, trois rôles »).
 *
 * Lu dans : `apps/web/src/routes/accounts/partners.tsx` (entête `ScreenIntro`
 * + `AskLaura`) → `PartnerPipeline.tsx` (onglets Mes partenaires / À
 * découvrir / Sur mes comptes) → `PartnerStageBand.tsx` (bandeau de
 * synthèse-filtre). Textes : `apps/web/src/i18n/locales/fr/partnerPipeline.json`.
 *
 * L'onglet « Mes partenaires » est ce frame (`primary`, le défaut à
 * l'ouverture). Les deux autres onglets sont des frames séparés :
 * `app/accounts-partners-a-decouvrir` (`DiscoverProfileMatches`) et
 * `app/accounts-partners-sur-mes-comptes` (`onAccounts`), plus bas dans ce
 * fichier.
 */
export const accountsPartnersPage: PageSpec = {
  id: 'app/accounts-partners',
  surface: 'app',
  domain: 'accounts',
  route: 'apps/web/src/routes/accounts/partners.tsx',
  title: 'Partenaires',
  template: 'list',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Tes partenaires, Louis', style: 'title' },
      {
        type: 'text',
        text: 'Retrouve les ESN avec lesquelles tu échanges déjà, celles à activer, celles à surveiller, et celles qui peuvent t’aider à ouvrir ou délivrer chez tes clients.',
        style: 'body',
        color: 'text/secondary',
      },
      {
        type: 'component',
        component: 'Button',
        props: { variant: 'link', content: { label: 'Demander à Laura d’analyser cette relation' } },
      },
    ],
    actions: [
      { type: 'component', component: 'Tabs', props: { items: ['Mes partenaires', 'À découvrir', 'Sur mes comptes'] } },
      {
        type: 'text',
        text: 'Les relations que tu entretiens déjà : où en est chacune, ce qui circule, et ce qu’il faut lancer ensuite.',
        style: 'caption',
        color: 'text/secondary',
      },
    ],
    filters: [
      {
        type: 'component',
        component: 'FilterChips',
        props: {
          size: 'md',
          items: [
            'Identifié',
            'Qualifié',
            'Contacté',
            'En discussion',
            'Cadre signé',
            'Flux actif',
            'Dormant',
            'Retiré',
          ],
        },
      },
    ],
    primary: [
      {
        type: 'component',
        component: 'Button',
        props: { variant: 'outline', size: 'sm', content: { label: 'Ajouter un partenaire' } },
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
            justify: 'between',
            children: [
              {
                type: 'stack',
                direction: 'row',
                gap: '2',
                align: 'center',
                children: [
                  { type: 'text', text: 'Devoteam', style: 'body' },
                  {
                    type: 'component',
                    component: 'Badge',
                    props: { variant: 'outline', content: { label: 'Concurrent' } },
                  },
                ],
              },
              {
                type: 'component',
                component: 'Gauge',
                props: { size: 'tiny', content: { value: '62', label: 'Score /100' } },
              },
            ],
          },
          {
            type: 'text',
            text: 'Calculé sur 12 mois — usage interne, jamais partagé au partenaire.',
            style: 'caption',
            color: 'text/muted',
          },
          {
            type: 'component',
            component: 'DataList',
            props: {},
            children: [
              { type: 'component', component: 'DataRow', props: { content: { label: 'Volume', value: '—' } } },
              { type: 'component', component: 'DataRow', props: { content: { label: 'Fiabilité', value: '—' } } },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Marge', value: 'Personne ne le collecte' } },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Accès', value: 'Personne ne le collecte' } },
              },
              { type: 'component', component: 'DataRow', props: { content: { label: 'Réciprocité', value: '—' } } },
            ],
          },
          {
            type: 'component',
            component: 'Badge',
            props: { variant: 'outline', content: { label: 'Étape : Flux actif' } },
          },
          {
            type: 'component',
            component: 'Select',
            props: { size: 'sm', content: { label: 'Clause de non-sollicitation au cadre', value: 'Non déclarée' } },
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
            title: 'Aucun partenaire enregistré',
            description: 'Un partenaire, c’est une ESN à qui tu confies des besoins — ou qui t’en confie.',
            action: 'Ajouter un partenaire',
          },
        },
      },
    ],
    loading: [{ type: 'component', component: 'Skeleton', props: { shape: 'block' } }],
    error: [
      {
        type: 'component',
        component: 'GenericProblemMessage',
        props: { content: { title: 'Impossible de charger tes partenaires.' } },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'decision',
      text: 'Un score de relation partenaire n’est jamais nu : les cinq axes se déplient, et deux d’entre eux (Marge, Accès) ne sont COLLECTÉS PAR PERSONNE aujourd’hui — nommés avec leur raison, jamais un gris qui laisserait attendre une valeur qui n’arrivera pas.',
      source: 'apps/web/src/features/partner-pipeline/view/PartnerPipeline.tsx:76',
    },
    {
      kind: 'decision',
      text: 'Le logo du partenaire est refusé par design : un partenaire vit dans sa propre table (SIREN, nom), sans site web fiable — 93 % des domaines dérivés du nom d’origine auraient affiché le logo d’une autre société une fois sur deux.',
      source: 'apps/web/src/features/partner-pipeline/view/PartnerPipeline.tsx:124',
    },
    {
      kind: 'ecart',
      text: 'Les sept étapes non courantes (bouton « Changer d’étape ») sont stylées en `style={{ border, color, background }}` avec des jetons `--border-subtle` / `--text-muted` — un DEUXIÈME nom de jeton pour la même chose que `--bellum-border` / `--bellum-text-muted` utilisés partout ailleurs sur cet écran (GA-26 : un réglage vit à un seul endroit).',
      source: 'apps/web/src/features/partner-pipeline/view/PartnerPipeline.tsx:327',
    },
    {
      kind: 'decision',
      text: 'Responsive : les trois onglets et le bandeau d’étapes passent en lignes qui s’enroulent (`flex-wrap`) dès 360 px, jamais en menu déroulant. Le formulaire d’ajout empile ses trois champs en colonne sous 768 px puis les aligne en ligne (`md:flex-row`). Pas d’aside sur cet écran à aucune largeur ; au-delà de 1920, les cartes de relation gardent leur largeur de lecture et la page ajoute de l’air autour plutôt que d’étirer les cartes.',
      source: 'apps/web/src/features/partner-pipeline/view/PartnerPipeline.tsx:518',
    },
    {
      kind: 'ecart',
      text: 'Aucun `100vh` ni `overflow-x` non maîtrisé trouvés sur cet écran — RAS à 360/390/768/1024/1280/1440/1920/2560/3440.',
      source: 'apps/web/src/features/partner-pipeline/view/PartnerPipeline.tsx:804',
    },
  ],
}

/**
 * Onglet « À découvrir » — `DiscoverProfileMatches` (#1798). Les ESN qui
 * collent au PROFIL de l'espace, calculées depuis sa zone géographique —
 * sans passer par une recherche territoire.
 */
export const accountsPartnersDiscoverPage: PageSpec = {
  id: 'app/accounts-partners-a-decouvrir',
  surface: 'app',
  domain: 'accounts',
  route: 'apps/web/src/routes/accounts/partners.tsx',
  title: 'Partenaires — À découvrir',
  template: 'list',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Tes partenaires, Louis', style: 'title' },
      {
        type: 'text',
        text: 'Retrouve les ESN avec lesquelles tu échanges déjà, celles à activer, celles à surveiller, et celles qui peuvent t’aider à ouvrir ou délivrer chez tes clients.',
        style: 'body',
        color: 'text/secondary',
      },
    ],
    actions: [
      { type: 'component', component: 'Tabs', props: { items: ['Mes partenaires', 'À découvrir', 'Sur mes comptes'] } },
      {
        type: 'text',
        text: 'Les ESN qui collent à ton profil — calculées automatiquement depuis ta zone géographique.',
        style: 'caption',
        color: 'text/secondary',
      },
    ],
    primary: [
      {
        type: 'component',
        component: 'Card',
        props: {},
        children: [
          {
            type: 'text',
            text: 'Zones sources : Île-de-France, Hauts-de-France',
            style: 'caption',
            color: 'text/muted',
          },
          {
            type: 'component',
            component: 'Table',
            props: {
              table: {
                columns: ['ESN', 'Localisation', 'Ouverte à la sous-traitance'],
                rows: [
                  ['Inetum', 'Lille (Hauts-de-France)', 'Oui'],
                  ['CGI France', 'Paris (Île-de-France)', 'Non'],
                  ['Umanis', 'Levallois-Perret (Île-de-France)', 'Inconnue'],
                ],
              },
            },
          },
          {
            type: 'component',
            component: 'Button',
            props: { variant: 'ghost', size: 'sm', content: { label: 'Actualiser' } },
          },
        ],
      },
      {
        type: 'component',
        component: 'Card',
        props: {},
        children: [
          {
            type: 'text',
            text: 'Une recherche plus précise reste possible — un département, une région, une ville que ton profil ne remplace pas.',
            style: 'caption',
            color: 'text/secondary',
          },
          {
            type: 'component',
            component: 'Button',
            props: { variant: 'link', size: 'sm', content: { label: 'Ouvrir Découvrir' } },
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
            title: 'Aucune ESN trouvée pour ton profil',
            description: 'Renseigne ta zone géographique dans ton profil ESN pour lancer le calcul.',
          },
        },
      },
    ],
    loading: [{ type: 'component', component: 'Skeleton', props: { shape: 'block' } }],
    error: [
      {
        type: 'component',
        component: 'GenericProblemMessage',
        props: { content: { title: 'Impossible de charger les ESN correspondantes.' } },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'decision',
      text: '« ici avoir juste le listing des ESN qui collent avec le profil, ne plus passer par le territoire » (Louis, 10/09/2026) — l’onglet ouvrait jusque-là un simple lien vers l’écran Territoire.',
      source: 'apps/web/src/features/partner-pipeline/view/PartnerPipeline.tsx:579',
    },
    {
      kind: 'decision',
      text: 'Chaque ligne nomme des FAITS, jamais un score composite : `esn_directory` ne connaît ni secteur ni expertise, un score sur ces axes serait inventé.',
      source: 'apps/web/src/features/partner-pipeline/view/PartnerPipeline.tsx:686',
    },
  ],
}

/**
 * Onglet « Sur mes comptes » — `onAccounts`. Les ESN EN PLACE chez les
 * clients de l'espace : un concurrent, et en même temps une porte de rang 2.
 */
export const accountsPartnersOnAccountsPage: PageSpec = {
  id: 'app/accounts-partners-sur-mes-comptes',
  surface: 'app',
  domain: 'accounts',
  route: 'apps/web/src/routes/accounts/partners.tsx',
  title: 'Partenaires — Sur mes comptes',
  template: 'list',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Tes partenaires, Louis', style: 'title' },
      {
        type: 'text',
        text: 'Retrouve les ESN avec lesquelles tu échanges déjà, celles à activer, celles à surveiller, et celles qui peuvent t’aider à ouvrir ou délivrer chez tes clients.',
        style: 'body',
        color: 'text/secondary',
      },
    ],
    actions: [
      { type: 'component', component: 'Tabs', props: { items: ['Mes partenaires', 'À découvrir', 'Sur mes comptes'] } },
      {
        type: 'text',
        text: 'Celles qui sont EN PLACE chez tes clients — un concurrent, et en même temps une porte de rang 2.',
        style: 'caption',
        color: 'text/secondary',
      },
    ],
    primary: [
      {
        type: 'text',
        text: '6 ESN distinctes en place, sur 11 comptes, dont 4 en rang 1.',
        style: 'caption',
        color: 'text/muted',
      },
      {
        type: 'component',
        component: 'Table',
        props: {
          table: {
            columns: ['ESN', 'Comptes', 'Rang 1', 'Certitude'],
            rows: [
              ['Sopra Steria', '4 comptes', '2 en rang 1', 'Confirmée'],
              ['Devoteam', '3 comptes', '1 en rang 1', 'Confirmée'],
              ['Capgemini', '2 comptes', '1 en rang 1', 'Faible'],
            ],
          },
        },
      },
      {
        type: 'text',
        text: 'Clique une ligne pour voir le détail par compte.',
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
            title: 'Aucune ESN observée sur tes comptes',
            description: 'Ce constat vient des dossiers déjà analysés — reviens après une analyse.',
          },
        },
      },
    ],
    loading: [{ type: 'component', component: 'Skeleton', props: { shape: 'block' } }],
    error: [
      {
        type: 'component',
        component: 'GenericProblemMessage',
        props: { content: { title: 'Impossible de charger les ESN observées.' } },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'decision',
      text: 'Le compteur se COMPTE sur ce que la route rend (plafonnée à 50 ESN côté service) — le dénominateur est celui de la liste affichée, et la phrase le dit.',
      source: 'apps/web/src/features/partner-pipeline/view/PartnerPipeline.tsx:902',
    },
    {
      kind: 'decision',
      text: 'La carte ENTIÈRE ouvre la modale à flèches réutilisée de l’onglet Partenaires d’une fiche compte (#1797), plutôt qu’une seconde modale construite pour ce seul onglet.',
      source: 'apps/web/src/features/partner-pipeline/view/PartnerPipeline.tsx:921',
    },
    {
      kind: 'decision',
      text: 'La certitude voyage à PART du nom de l’ESN, jamais dans le libellé : absente (fenêtre de déploiement) ou non mesurée, aucune pastille ne s’affiche — jamais une valeur devinée.',
      source: 'apps/web/src/features/partner-pipeline/view/PartnerPipeline.tsx:948',
    },
  ],
}
