import type { PageSpec } from '../../types'
import { RESPONSIVE_DECISION, RESPONSIVE_ECART_SHELL, SETTINGS_SECTION_NAV } from './settings-shared'

/**
 * /settings/knowledge — Base de connaissance (D1 : re-hébergée ici, plus une
 * page autonome). Lu dans `apps/web/src/routes/settings/knowledge.tsx` →
 * `Knowledge.tsx` : 5 onglets (Templates, Playbooks, Méthode, Données CRM,
 * Mes documents) — cette spec détaille l'onglet par défaut « Mes documents ».
 * Les quatre autres sont des frames séparés plus bas dans ce fichier
 * (`app/settings-knowledge-templates`, `-playbooks`, `-methode`,
 * `-donnees-crm`), sur le même modèle que `settings-profile-*`. Textes de
 * `i18n/locales/fr/knowledge.json`.
 */
export const settingsKnowledgePage: PageSpec = {
  id: 'app/settings-knowledge',
  surface: 'app',
  domain: 'settings',
  route: 'apps/web/src/routes/settings/knowledge.tsx',
  title: 'Base de connaissance',
  template: 'settings',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Base de connaissance', style: 'title' },
      {
        type: 'text',
        text: "Templates, playbooks et documents personnels pour enrichir l'IA.",
        style: 'body',
        color: 'text/secondary',
      },
    ],
    sectionNav: SETTINGS_SECTION_NAV,
    primary: [
      {
        type: 'component',
        component: 'Tabs',
        props: { items: ['Mes documents', 'Templates', 'Playbooks', 'Méthode', 'Données CRM'] },
      },
      {
        type: 'stack',
        direction: 'row',
        gap: '2',
        justify: 'between',
        children: [
          {
            type: 'component',
            component: 'SearchInput',
            props: { size: 'sm', content: { placeholder: 'Rechercher un document...' } },
          },
          {
            type: 'component',
            component: 'Button',
            props: { variant: 'default', size: 'sm', content: { label: 'Ajouter un document' } },
          },
        ],
      },
      {
        type: 'component',
        component: 'Card',
        props: { content: { description: 'Glisse-dépose un fichier ou clique pour sélectionner' } },
        children: [
          { type: 'text', text: '.pdf, .txt, .md, .csv, .json — max 9 Mo', style: 'caption', color: 'text/muted' },
        ],
      },
      {
        type: 'component',
        component: 'Table',
        props: {
          table: {
            columns: ['Titre', 'Type', 'Ajouté le'],
            rows: [
              ['Template de prospection LinkedIn', 'Template', '—'],
              ['Méthode de qualification', 'Méthode', '—'],
            ],
          },
        },
      },
    ],
  },
  states: {
    loading: [{ type: 'component', component: 'Skeleton', props: { shape: 'block' } }],
    error: [
      {
        type: 'component',
        component: 'GenericProblemMessage',
        props: { content: { title: 'Je n’ai pas pu charger tes documents.', description: 'Réessaie.' } },
      },
    ],
  },
  uxNotes: [
    RESPONSIVE_DECISION,
    RESPONSIVE_ECART_SHELL,
    {
      kind: 'decision',
      text: 'Le titre « Base de connaissances » vit déjà dans l’en-tête de page (`header`) — le corps de l’onglet ne répète qu’un sous-titre, jamais un titre dupliqué (GA-26).',
      source: 'apps/web/src/features/knowledge/view/Knowledge.tsx:337',
    },
  ],
}

const KNOWLEDGE_TABS_ROW = {
  type: 'component' as const,
  component: 'Tabs' as const,
  props: { items: ['Mes documents', 'Templates', 'Playbooks', 'Méthode', 'Données CRM'] },
}

/** Onglet « Templates » — `LibraryTab` (kind `template`), en grille 2/3 colonnes. */
export const settingsKnowledgeTemplatesPage: PageSpec = {
  id: 'app/settings-knowledge-templates',
  surface: 'app',
  domain: 'settings',
  route: 'apps/web/src/routes/settings/knowledge.tsx',
  title: 'Base de connaissance — Templates',
  template: 'settings',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Base de connaissance', style: 'title' },
      {
        type: 'text',
        text: 'Les messages types que Laura peut reprendre dans ses propositions.',
        style: 'body',
        color: 'text/secondary',
      },
    ],
    sectionNav: SETTINGS_SECTION_NAV,
    primary: [
      KNOWLEDGE_TABS_ROW,
      {
        type: 'component',
        component: 'Button',
        props: { variant: 'default', size: 'sm', content: { label: 'Nouveau template' } },
      },
      {
        type: 'grid',
        columns: 3,
        columnsMobile: 1,
        gap: '3',
        children: [
          {
            type: 'component',
            component: 'Card',
            props: { content: { title: 'Message de prise de contact LinkedIn' } },
            children: [
              {
                type: 'component',
                component: 'Badge',
                props: { variant: 'outline', content: { label: 'Template LinkedIn' } },
              },
              {
                type: 'component',
                component: 'Button',
                props: { variant: 'ghost', size: 'sm', content: { label: 'Voir' } },
              },
            ],
          },
          {
            type: 'component',
            component: 'Card',
            props: { content: { title: 'Relance après silence' } },
            children: [
              {
                type: 'component',
                component: 'Badge',
                props: { variant: 'outline', content: { label: 'Template Email' } },
              },
              {
                type: 'component',
                component: 'Button',
                props: { variant: 'ghost', size: 'sm', content: { label: 'Voir' } },
              },
            ],
          },
          {
            type: 'component',
            component: 'Card',
            props: { content: { title: 'Pitch commercial ESN' } },
            children: [
              {
                type: 'component',
                component: 'Badge',
                props: { variant: 'outline', content: { label: 'Pitch commercial' } },
              },
              {
                type: 'component',
                component: 'Button',
                props: { variant: 'ghost', size: 'sm', content: { label: 'Voir' } },
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
            title: 'Aucun template',
            description: 'Ajoute ton premier template pour que Laura puisse le reprendre.',
          },
        },
      },
    ],
    loading: [{ type: 'component', component: 'Skeleton', props: { shape: 'block' } }],
    error: [
      {
        type: 'component',
        component: 'GenericProblemMessage',
        props: { content: { title: 'Je n’ai pas pu charger tes templates.', description: 'Réessaie.' } },
      },
    ],
  },
  uxNotes: [
    RESPONSIVE_DECISION,
    {
      kind: 'decision',
      text: 'La grille passe de 3 colonnes (`lg`) à 2 (`sm`) puis à 1 sous 768 px — un template porte un titre et une catégorie, jamais assez de texte pour justifier une carte pleine largeur au-delà de la tablette.',
      source: 'apps/web/src/features/knowledge/view/Knowledge.tsx:686',
    },
  ],
}

/** Onglet « Playbooks » — `LibraryTab` (kind `playbook`), en grille 2 colonnes. */
export const settingsKnowledgePlaybooksPage: PageSpec = {
  id: 'app/settings-knowledge-playbooks',
  surface: 'app',
  domain: 'settings',
  route: 'apps/web/src/routes/settings/knowledge.tsx',
  title: 'Base de connaissance — Playbooks',
  template: 'settings',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Base de connaissance', style: 'title' },
      {
        type: 'text',
        text: 'Les trames d’approche réutilisables sur un type de compte.',
        style: 'body',
        color: 'text/secondary',
      },
    ],
    sectionNav: SETTINGS_SECTION_NAV,
    primary: [
      KNOWLEDGE_TABS_ROW,
      {
        type: 'component',
        component: 'Button',
        props: { variant: 'default', size: 'sm', content: { label: 'Nouveau playbook' } },
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
            props: {
              content: {
                title: 'Playbook grand compte bancaire',
                description: 'Cycle de décision long, comité d’achats centralisé.',
              },
            },
            children: [
              {
                type: 'component',
                component: 'Button',
                props: { variant: 'ghost', size: 'sm', content: { label: 'Voir' } },
              },
            ],
          },
          {
            type: 'component',
            component: 'Card',
            props: {
              content: {
                title: 'Playbook réponse à appel d’offres public',
                description: 'Marché public, DCE, mémoire technique.',
              },
            },
            children: [
              {
                type: 'component',
                component: 'Button',
                props: { variant: 'ghost', size: 'sm', content: { label: 'Voir' } },
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
          content: { title: 'Aucun playbook', description: 'Ajoute ta première trame d’approche.' },
        },
      },
    ],
    loading: [{ type: 'component', component: 'Skeleton', props: { shape: 'block' } }],
    error: [
      {
        type: 'component',
        component: 'GenericProblemMessage',
        props: { content: { title: 'Je n’ai pas pu charger tes playbooks.', description: 'Réessaie.' } },
      },
    ],
  },
  uxNotes: [
    RESPONSIVE_DECISION,
    {
      kind: 'decision',
      text: 'Deux colonnes seulement (pas trois comme les templates) : un playbook porte une description, ce qui demande plus de largeur pour rester lisible.',
      source: 'apps/web/src/features/knowledge/view/Knowledge.tsx:710',
    },
  ],
}

/** Onglet « Méthode » — `LibraryTab` (kind `method_playbook`), les playbooks du plan de compte. */
export const settingsKnowledgeMethodePage: PageSpec = {
  id: 'app/settings-knowledge-methode',
  surface: 'app',
  domain: 'settings',
  route: 'apps/web/src/routes/settings/knowledge.tsx',
  title: 'Base de connaissance — Méthode',
  template: 'settings',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Base de connaissance', style: 'title' },
      {
        type: 'text',
        text: 'Les playbooks de méthode, réutilisables sur toute analyse de compte.',
        style: 'body',
        color: 'text/secondary',
      },
    ],
    sectionNav: SETTINGS_SECTION_NAV,
    primary: [
      KNOWLEDGE_TABS_ROW,
      {
        type: 'component',
        component: 'Button',
        props: { variant: 'default', size: 'sm', content: { label: 'Nouvelle méthode' } },
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
            props: { content: { title: 'Méthode de qualification BANT' } },
            children: [
              {
                type: 'component',
                component: 'Button',
                props: { variant: 'ghost', size: 'sm', content: { label: 'Voir' } },
              },
            ],
          },
          {
            type: 'component',
            component: 'Card',
            props: { content: { title: 'Méthode de cartographie des décideurs' } },
            children: [
              {
                type: 'component',
                component: 'Button',
                props: { variant: 'ghost', size: 'sm', content: { label: 'Voir' } },
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
          content: { title: 'Aucune méthode', description: 'Ajoute ta première méthode de plan de compte.' },
        },
      },
    ],
    loading: [{ type: 'component', component: 'Skeleton', props: { shape: 'block' } }],
    error: [
      {
        type: 'component',
        component: 'GenericProblemMessage',
        props: { content: { title: 'Je n’ai pas pu charger tes méthodes.', description: 'Réessaie.' } },
      },
    ],
  },
  uxNotes: [
    RESPONSIVE_DECISION,
    {
      kind: 'decision',
      text: 'Une phrase d’intention précède la grille (`method.description`) : les playbooks de méthode servent le PLAN de compte, pas une seule approche — contrairement aux templates et aux playbooks d’approche.',
      source: 'apps/web/src/features/knowledge/view/Knowledge.tsx:730',
    },
  ],
}

/** Onglet « Données CRM » — statut de connexion et panneau d’échange à deux sens. */
export const settingsKnowledgeCrmPage: PageSpec = {
  id: 'app/settings-knowledge-donnees-crm',
  surface: 'app',
  domain: 'settings',
  route: 'apps/web/src/routes/settings/knowledge.tsx',
  title: 'Base de connaissance — Données CRM',
  template: 'settings',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Base de connaissance', style: 'title' },
      {
        type: 'text',
        text: 'Ce que ton CRM connecté partage avec BellumAI, et ce qui en revient.',
        style: 'body',
        color: 'text/secondary',
      },
    ],
    sectionNav: SETTINGS_SECTION_NAV,
    primary: [
      KNOWLEDGE_TABS_ROW,
      {
        type: 'component',
        component: 'Card',
        props: {},
        children: [
          { type: 'component', component: 'Badge', props: { variant: 'success', content: { label: 'Connecté' } } },
          { type: 'text', text: 'Salesforce — connecté depuis le 03/02/2026', style: 'body' },
          {
            type: 'component',
            component: 'Button',
            props: { variant: 'outline', size: 'sm', content: { label: 'Déconnecter' } },
          },
        ],
      },
      {
        type: 'component',
        component: 'Table',
        props: {
          content: { caption: 'Import CRM → BellumAI' },
          table: {
            columns: ['Objet', 'Enregistrements importés', 'Dernière synchro'],
            rows: [
              ['Comptes', '214', '25/09/2026'],
              ['Contacts', '1 042', '25/09/2026'],
              ['Opportunités', '63', '25/09/2026'],
            ],
          },
        },
      },
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Gouvernance des données' } },
        children: [
          {
            type: 'component',
            component: 'DataList',
            props: {},
            children: [
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Écriture vers le CRM', value: 'Sur geste utilisateur uniquement' } },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: {
                  content: { label: 'Doublons détectés', value: '7 — proposés, jamais fusionnés automatiquement' },
                },
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
            title: 'Aucun CRM connecté',
            description: 'Connecte ton CRM depuis Réglages › Intégrations pour importer tes données.',
          },
        },
      },
    ],
    loading: [{ type: 'component', component: 'Skeleton', props: { shape: 'block' } }],
    error: [
      {
        type: 'component',
        component: 'GenericProblemMessage',
        props: { content: { title: 'Je n’ai pas pu lire le statut du CRM.', description: 'Réessaie.' } },
      },
    ],
  },
  uxNotes: [
    RESPONSIVE_DECISION,
    {
      kind: 'decision',
      text: 'Une écriture CRM passe par une porte (auto-approuvée sur geste utilisateur, sinon prévisualisation figée) — jamais une synchronisation silencieuse qui modifierait le CRM du client sans qu’il l’ait demandé.',
      source: 'apps/web/src/features/knowledge/view/Knowledge.tsx:759',
    },
    {
      kind: 'decision',
      text: 'On PROPOSE une fusion de doublons, on ne fusionne JAMAIS automatiquement.',
      source: 'apps/web/src/features/knowledge/view/Knowledge.tsx:764',
    },
  ],
}
