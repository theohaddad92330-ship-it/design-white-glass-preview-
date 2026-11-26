import type { PageSpec } from '../../types'
import { RESPONSIVE_DECISION, RESPONSIVE_ECART_SHELL, SETTINGS_SECTION_NAV } from './settings-shared'

/**
 * /settings/mes-donnees — Mes données (réversibilité RGPD, PDF 7 §9.2). Lu
 * dans `apps/web/src/routes/settings/mes-donnees.tsx` → `MyDataView.tsx` :
 * entête → résumé des périmètres (personnel/espace) → table des objets
 * exportables → export global → « ce que tu n'emportes pas » → questions à
 * Laura. Textes de `i18n/locales/fr/myData.json`.
 */
export const settingsMesDonneesPage: PageSpec = {
  id: 'app/settings-mes-donnees',
  surface: 'app',
  domain: 'settings',
  route: 'apps/web/src/routes/settings/mes-donnees.tsx',
  title: 'Mes données',
  template: 'settings',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Tes données t’appartiennent', style: 'title' },
      {
        type: 'text',
        text: 'Consulte ce que BellumAI conserve dans ton espace, récupère ce qui t’appartient, et comprends ce qui reste partagé avec ton équipe.',
        style: 'body',
        color: 'text/secondary',
      },
    ],
    sectionNav: SETTINGS_SECTION_NAV,
    primary: [
      {
        // #1520 — l'état `partial` (ScreenState, MyDataView.tsx:175-182) :
        // déclenché quand au moins un objet revient avec un compte de lignes
        // `null`. Montré ICI, dans `primary`, plutôt que dans `states` : à la
        // différence de `loading`/`vide`/`erreur` qui REMPLACENT tout le
        // slot, `partial` s'affiche EN PLUS des données déjà chargées — le
        // gabarit `settings` (catalog.ts → TEMPLATES.settings.optionalStates)
        // ne déclare que `empty` comme état facultatif, `partial` n'est pas
        // un remplacement de `primary` qu'un gabarit puisse déclarer.
        type: 'component',
        component: 'InfoBanner',
        props: {
          variant: 'warning',
          size: 'md',
          content: {
            title: 'La liste est là, mais certains comptes n’ont pas pu être lus.',
            description: 'Les objets concernés affichent « non mesuré » — ils restent exportables.',
          },
        },
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
            props: { content: { title: 'Mes données personnelles' } },
            children: [
              {
                type: 'text',
                text: 'Ce que tu emportes où que tu ailles : ton identité, ton abonnement, tes appareils.',
                style: 'caption',
                color: 'text/muted',
              },
              { type: 'text', text: '4 objets exportables · 6 lignes', style: 'body' },
            ],
          },
          {
            type: 'component',
            component: 'Card',
            props: { content: { title: 'Les données de l’espace de travail' } },
            children: [
              {
                type: 'text',
                text: 'Ce qui vit dans l’espace de travail : comptes, contacts, talents, documents, historique.',
                style: 'caption',
                color: 'text/muted',
              },
              { type: 'text', text: '7 objets exportables · 428 lignes', style: 'body' },
            ],
          },
        ],
      },
      {
        type: 'component',
        component: 'SettingsGroup',
        props: { content: { title: 'Mes données personnelles' } },
        children: [
          {
            type: 'component',
            component: 'SettingsRow',
            props: { content: { label: 'Mon identité', description: 'Donnée personnelle', value: '1 ligne' } },
            children: [
              {
                type: 'component',
                component: 'Button',
                props: { variant: 'ghost', size: 'xs', content: { label: 'CSV' } },
              },
              {
                type: 'component',
                component: 'Button',
                props: { variant: 'ghost', size: 'xs', content: { label: 'JSON' } },
              },
            ],
          },
          {
            type: 'component',
            component: 'SettingsRow',
            props: { content: { label: 'Abonnement', description: 'Donnée personnelle', value: '1 ligne' } },
            children: [
              {
                type: 'component',
                component: 'Button',
                props: { variant: 'ghost', size: 'xs', content: { label: 'CSV' } },
              },
              {
                type: 'component',
                component: 'Button',
                props: { variant: 'ghost', size: 'xs', content: { label: 'JSON' } },
              },
            ],
          },
          {
            type: 'component',
            component: 'SettingsRow',
            props: { content: { label: 'Appareils connectés', description: 'Donnée personnelle', value: '3 lignes' } },
            children: [
              {
                type: 'component',
                component: 'Button',
                props: { variant: 'ghost', size: 'xs', content: { label: 'CSV' } },
              },
              {
                type: 'component',
                component: 'Button',
                props: { variant: 'ghost', size: 'xs', content: { label: 'JSON' } },
              },
            ],
          },
          {
            type: 'component',
            component: 'SettingsRow',
            props: { content: { label: 'Numéro pour les alertes SMS', description: 'Sensible', value: '1 ligne' } },
            children: [
              {
                type: 'component',
                component: 'Button',
                props: { variant: 'ghost', size: 'xs', content: { label: 'CSV' } },
              },
              {
                type: 'component',
                component: 'Button',
                props: { variant: 'ghost', size: 'xs', content: { label: 'JSON' } },
              },
            ],
          },
        ],
      },
      {
        type: 'component',
        component: 'SettingsGroup',
        props: { content: { title: 'Les données de l’espace de travail' } },
        children: [
          {
            type: 'component',
            component: 'SettingsRow',
            props: { content: { label: 'Mon profil ESN', description: 'Interne à l’espace', value: '1 ligne' } },
            children: [
              {
                type: 'component',
                component: 'Button',
                props: { variant: 'ghost', size: 'xs', content: { label: 'CSV' } },
              },
              {
                type: 'component',
                component: 'Button',
                props: { variant: 'ghost', size: 'xs', content: { label: 'JSON' } },
              },
            ],
          },
          {
            type: 'component',
            component: 'SettingsRow',
            props: { content: { label: 'Comptes suivis', description: 'Confidentiel', value: '18 lignes' } },
            children: [
              {
                type: 'component',
                component: 'Button',
                props: { variant: 'ghost', size: 'xs', content: { label: 'CSV' } },
              },
              {
                type: 'component',
                component: 'Button',
                props: { variant: 'ghost', size: 'xs', content: { label: 'JSON' } },
              },
            ],
          },
          {
            type: 'component',
            component: 'SettingsRow',
            props: { content: { label: 'Contacts', description: 'Confidentiel', value: '312 lignes' } },
            children: [
              {
                type: 'component',
                component: 'Button',
                props: { variant: 'ghost', size: 'xs', content: { label: 'CSV' } },
              },
              {
                type: 'component',
                component: 'Button',
                props: { variant: 'ghost', size: 'xs', content: { label: 'JSON' } },
              },
            ],
          },
          {
            type: 'component',
            component: 'SettingsRow',
            props: {
              content: { label: 'Talents et compétences', description: 'Interne à l’espace', value: '7 lignes' },
            },
            children: [
              {
                type: 'component',
                component: 'Button',
                props: { variant: 'ghost', size: 'xs', content: { label: 'CSV' } },
              },
              {
                type: 'component',
                component: 'Button',
                props: { variant: 'ghost', size: 'xs', content: { label: 'JSON' } },
              },
            ],
          },
          {
            type: 'component',
            component: 'SettingsRow',
            props: { content: { label: 'Documents déposés', description: 'Confidentiel', value: 'non mesuré' } },
            children: [
              {
                type: 'component',
                component: 'Button',
                props: { variant: 'ghost', size: 'xs', content: { label: 'CSV' } },
              },
              {
                type: 'component',
                component: 'Button',
                props: { variant: 'ghost', size: 'xs', content: { label: 'JSON' } },
              },
            ],
          },
          {
            type: 'component',
            component: 'SettingsRow',
            props: {
              content: { label: 'Activités et historique', description: 'Interne à l’espace', value: '84 lignes' },
            },
            children: [
              {
                type: 'component',
                component: 'Button',
                props: { variant: 'ghost', size: 'xs', content: { label: 'CSV' } },
              },
              {
                type: 'component',
                component: 'Button',
                props: { variant: 'ghost', size: 'xs', content: { label: 'JSON' } },
              },
            ],
          },
          {
            type: 'component',
            component: 'SettingsRow',
            props: {
              content: { label: 'Mouvements de crédits', description: 'Interne à l’espace', value: '6 lignes' },
            },
            children: [
              {
                type: 'component',
                component: 'Button',
                props: { variant: 'ghost', size: 'xs', content: { label: 'CSV' } },
              },
              {
                type: 'component',
                component: 'Button',
                props: { variant: 'ghost', size: 'xs', content: { label: 'JSON' } },
              },
            ],
          },
        ],
      },
      {
        type: 'component',
        component: 'Card',
        props: { content: { title: 'Préparer mon export', description: 'dernier export : 12/08/2026' } },
        children: [
          {
            type: 'component',
            component: 'Button',
            props: { variant: 'default', content: { label: 'Préparer mon export' } },
          },
        ],
      },
      {
        type: 'component',
        component: 'SectionCard',
        props: {
          content: {
            title: 'Voici ce que ton export contiendra',
            description: 'Rien n’est téléchargé avant que tu confirmes.',
          },
        },
        children: [
          {
            type: 'component',
            component: 'DataList',
            props: {},
            children: [
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Mon identité', value: '1 ligne' } },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Comptes suivis', value: '18 lignes' } },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Documents déposés', value: 'non mesuré' } },
              },
            ],
          },
          {
            type: 'text',
            text: 'Un fichier JSON unique. Pour un CSV, télécharge l’objet qui t’intéresse depuis la liste.',
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
                props: { variant: 'ghost', size: 'sm', content: { label: 'Annuler' } },
              },
              {
                type: 'component',
                component: 'Button',
                props: { variant: 'default', size: 'sm', content: { label: 'Télécharger mon export' } },
              },
            ],
          },
        ],
      },
      {
        type: 'component',
        component: 'InfoBanner',
        props: {
          variant: 'info',
          size: 'md',
          content: {
            title: 'Ce que tu n’emportes pas',
            description:
              'Cette liste se calcule à partir de ce que l’export sait produire. Le référentiel partagé (annuaire d’ESN, registres publics) et les modèles internes du produit ne s’exportent jamais.',
          },
        },
      },
      {
        type: 'component',
        component: 'DataList',
        props: {},
        children: [
          {
            type: 'component',
            component: 'DataRow',
            props: {
              content: {
                label: 'Données partagées de l’espace',
                value: 'appartiennent à l’espace de travail, pas à toi seul',
              },
            },
          },
          {
            type: 'component',
            component: 'DataRow',
            props: {
              content: {
                label: 'Référentiels communs',
                value: 'annuaire d’ESN, registres publics — jamais spécifiques à ton export',
              },
            },
          },
          {
            type: 'component',
            component: 'DataRow',
            props: {
              content: { label: 'Technologie BellumAI', value: 'modèles internes du produit, jamais exportés' },
            },
          },
          {
            type: 'component',
            component: 'DataRow',
            props: {
              content: { label: 'Appartenance non tranchée', value: 'objet non encore classé personnel/espace' },
            },
          },
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
            props: { variant: 'link', content: { label: 'Qu’est-ce qu’il y a dans mon export ?' } },
          },
          {
            type: 'component',
            component: 'Button',
            props: { variant: 'link', content: { label: 'Pourquoi certaines données ne sont pas incluses ?' } },
          },
          {
            type: 'component',
            component: 'Button',
            props: { variant: 'link', content: { label: 'Mien ou de l’espace ?' } },
          },
        ],
      },
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Comprendre la suppression' } },
        children: [
          {
            type: 'component',
            component: 'Button',
            props: { variant: 'outline', size: 'sm', content: { label: 'Comprendre la suppression' } },
          },
          {
            type: 'text',
            text: '1. Effacé : identité, contacts, consultants, documents déposés → anonymisés ; sessions révoquées ; abonnement annulé.',
            style: 'caption',
            color: 'text/secondary',
          },
          {
            type: 'text',
            text: '2. Quand : tout de suite, à la confirmation — aucun délai de rétractation.',
            style: 'caption',
            color: 'text/secondary',
          },
          {
            type: 'text',
            text: '3. Conservé, sans nom : facturation, journal des crédits, journal des actions, données d’entreprises — purgées après 90 jours.',
            style: 'caption',
            color: 'text/secondary',
          },
          {
            type: 'text',
            text: '4. Collègues : ce qui appartient à l’espace de travail y reste.',
            style: 'caption',
            color: 'text/secondary',
          },
          {
            type: 'text',
            text: '5. Irréversible : rien ne se restaure.',
            style: 'caption',
            color: 'text/secondary',
          },
          {
            type: 'text',
            text: '6. Exporte d’abord : après, il n’y a plus rien à exporter.',
            style: 'caption',
            color: 'text/secondary',
          },
        ],
      },
      {
        type: 'component',
        component: 'DangerZone',
        props: { content: { title: 'Zone sensible' } },
        children: [
          {
            type: 'component',
            component: 'Button',
            props: { variant: 'destructive', size: 'sm', content: { label: 'Aller à la suppression' } },
          },
        ],
      },
    ],
  },
  states: {
    loading: [{ type: 'component', component: 'Skeleton', props: { shape: 'table' } }],
    error: [
      {
        type: 'component',
        component: 'GenericProblemMessage',
        props: { content: { title: 'Je n’ai pas pu charger tes données.', description: 'Réessaie.' } },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'decision',
      text: 'Le contenu de `ExportRecapDialog` et de « Comprendre la suppression » (dépliée par défaut ici) est reproduit en cartes plutôt qu’en `Dialog`/pop-in réels : un vrai composant modal a une largeur propre, indépendante de celle du cadre — l’embarquer tel quel dans une page mobile (390 px) déborderait toujours, quel que soit son contenu.',
      source: 'apps/web/src/features/settings/view/MyDataView.tsx:267',
    },
    {
      kind: 'ecart',
      text: 'Corrigé dans cette maquette : le résumé par périmètre (2 cartes, personnel puis espace) manquait, remplacé par un tableau plat à 3 colonnes qui ne reflétait ni l’ordre réel du catalogue `PORTABLE_OBJECTS` (11 objets) ni ses classifications (Public/Interne à l’espace/Confidentiel/Donnée personnelle/Sensible/Technique) ni ses deux formats de téléchargement (CSV, JSON) par objet. Le contenu du `ExportRecapDialog` (« rien n’est téléchargé avant que tu confirmes ») et les 6 puces de la Zone sensible (effacé/quand/conservé/collègues/irréversible/exporte d’abord) étaient absents, remplacés par une bannière générique.',
      source: 'apps/web/src/features/settings/model/export-perimeter.ts:26',
    },
    {
      kind: 'decision',
      text: 'Une ligne compte « non mesuré » sans jamais additionner un `null` comme un 0 dans le total du résumé de périmètre — un total partiel se lit « non mesuré », jamais un chiffre qui sous-compterait en silence.',
      source: 'apps/web/src/features/settings/view/MyDataView.tsx:337',
    },
    RESPONSIVE_DECISION,
    RESPONSIVE_ECART_SHELL,
    {
      kind: 'decision',
      text: 'Responsive ultra-large — cette page ne suit PAS la règle générale « troisième colonne » : elle borne elle-même sa largeur (`max-w-5xl`, mesuré à 1500 px où une ligne de réglage devenait un tableur) et ne s’étire jamais, quelle que soit la largeur — un choix déjà conforme à « on n’étire jamais » avant même l’addendum du 25/09.',
      source: 'apps/web/src/features/settings/view/MyDataView.tsx:151',
    },
    {
      kind: 'decision',
      text: 'L’export ne se refait pas dans Sécurité : la rangée « Exporter mes données » de `/settings/security` RENVOIE ici (un seul geste d’export, jamais deux formes du même geste, loi 4 tome 7).',
      source: 'apps/web/src/features/settings/components/security/DataExportRow.tsx:30',
    },
    {
      kind: 'decision',
      text: 'La bannière `InfoBanner` (variant `warning`) en tête de `primary` maquette l’état `partial` de `ScreenState` : déclenché quand au moins un objet du catalogue revient avec un compte de lignes `null`. Non porté dans `states` — le gabarit `settings` ne déclare `empty` comme état facultatif (`TEMPLATES.settings.optionalStates`, `catalog.ts`), jamais `partial`, parce que `partial` ne REMPLACE pas `primary` comme le font vide/chargement/erreur : il s’affiche EN PLUS des données déjà chargées.',
      source: 'apps/web/src/features/settings/view/MyDataView.tsx:175',
    },
  ],
}
