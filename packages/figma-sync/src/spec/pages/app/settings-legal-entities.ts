import type { PageSpec } from '../../types'
import {
  RESPONSIVE_DECISION,
  RESPONSIVE_ECART_SHELL,
  RESPONSIVE_ECART_WIDE,
  SETTINGS_SECTION_NAV,
} from './settings-shared'

/**
 * /settings/legal-entities — Entités juridiques (D9). Lu dans
 * `apps/web/src/routes/settings/legal-entities.tsx` → `LegalEntitiesView.tsx`
 * : entête + pourquoi (une ESN peut porter plusieurs sociétés facturantes),
 * table des sociétés déclarées, formulaire d'ajout. Textes de
 * `i18n/locales/fr/legalEntities.json`.
 */
export const settingsLegalEntitiesPage: PageSpec = {
  id: 'app/settings-legal-entities',
  surface: 'app',
  domain: 'settings',
  route: 'apps/web/src/routes/settings/legal-entities.tsx',
  title: 'Entités juridiques',
  template: 'settings',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Entités juridiques de ton ESN', style: 'title' },
      {
        type: 'text',
        text: 'Déclare ici uniquement les sociétés de TON ESN susceptibles de porter et de facturer une mission.',
        style: 'body',
        color: 'text/secondary',
      },
      {
        type: 'text',
        text: 'Tes clients, partenaires et concurrents ne se configurent pas ici.',
        style: 'caption',
        color: 'text/muted',
      },
      {
        type: 'component',
        component: 'Button',
        props: { variant: 'link', size: 'sm', content: { label: 'À quoi sert une société porteuse de mission ?' } },
      },
    ],
    sectionNav: SETTINGS_SECTION_NAV,
    primary: [
      {
        type: 'component',
        component: 'SectionCard',
        props: {
          content: {
            description:
              'Une ESN installée est rarement une seule société : une structure de conseil, une de régie, parfois une filiale par pays. L’équipe, le vivier et le pipe restent communs ; c’est la facturation qui change. Ton abonnement BellumAI ne bouge pas : un contrat, un pool de crédits, un décompte de sièges pour tout l’espace.',
          },
        },
      },
      {
        type: 'component',
        component: 'Card',
        props: { content: { title: 'Compte exemple SAS' } },
        children: [
          {
            type: 'component',
            component: 'DataList',
            props: {},
            children: [
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Identifiant légal', value: '812 345 678 00019' } },
              },
              { type: 'component', component: 'DataRow', props: { content: { label: 'Pays', value: 'FR' } } },
              { type: 'component', component: 'DataRow', props: { content: { label: 'TVA', value: 'FR40812345678' } } },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Adresse', value: '12 rue de la Paix, 75002 Paris' } },
              },
              { type: 'component', component: 'DataRow', props: { content: { label: 'Devise', value: 'EUR' } } },
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
                props: { variant: 'ghost', size: 'sm', content: { label: 'Archiver' } },
              },
            ],
          },
        ],
      },
      {
        type: 'component',
        component: 'SettingsGroup',
        props: {
          content: {
            title: 'Compte exemple SAS — modification en cours',
            description:
              'L’icône « Modifier » de la carte remplace la carte par ce formulaire : les six mêmes champs que « Ajouter une société », préremplis, avec Enregistrer et Annuler.',
          },
        },
        children: [
          {
            type: 'component',
            component: 'Input',
            props: { content: { label: 'Raison sociale', value: 'Compte exemple SAS' } },
          },
          {
            type: 'component',
            component: 'Input',
            props: { content: { label: 'Identifiant légal', value: '812 345 678 00019' } },
          },
          {
            type: 'text',
            text: 'Optionnel : toutes les juridictions n’ont pas le même.',
            style: 'caption',
            color: 'text/muted',
          },
          { type: 'component', component: 'Input', props: { content: { label: 'Pays', value: 'FR' } } },
          { type: 'text', text: 'Deux lettres, code pays de facturation.', style: 'caption', color: 'text/muted' },
          {
            type: 'component',
            component: 'Input',
            props: { content: { label: 'Numéro de TVA', value: 'FR40812345678' } },
          },
          {
            type: 'text',
            text: 'Optionnel : numéro de TVA intracommunautaire.',
            style: 'caption',
            color: 'text/muted',
          },
          {
            type: 'component',
            component: 'Input',
            props: { content: { label: 'Adresse de facturation', value: '12 rue de la Paix, 75002 Paris' } },
          },
          { type: 'component', component: 'Input', props: { content: { label: 'Devise', value: 'EUR' } } },
          {
            type: 'text',
            text: 'Trois lettres, code devise de facturation (ISO 4217).',
            style: 'caption',
            color: 'text/muted',
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
                props: { variant: 'default', content: { label: 'Enregistrer' } },
              },
              {
                type: 'component',
                component: 'Button',
                props: { variant: 'ghost', content: { label: 'Annuler' } },
              },
            ],
          },
        ],
      },
      {
        type: 'component',
        component: 'Card',
        props: { content: { title: 'Compte exemple GmbH' } },
        children: [
          {
            type: 'component',
            component: 'DataList',
            props: {},
            children: [
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Identifiant légal', value: 'HRB 987654' } },
              },
              { type: 'component', component: 'DataRow', props: { content: { label: 'Pays', value: 'DE' } } },
              { type: 'component', component: 'DataRow', props: { content: { label: 'TVA', value: 'DE312456789' } } },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Adresse', value: 'Adresse non renseignée' } },
              },
              { type: 'component', component: 'DataRow', props: { content: { label: 'Devise', value: 'EUR' } } },
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
                props: { variant: 'ghost', size: 'sm', content: { label: 'Archiver' } },
              },
            ],
          },
        ],
      },
      {
        type: 'component',
        component: 'Card',
        props: { content: { title: 'Compte exemple SARL' } },
        children: [
          {
            type: 'stack',
            direction: 'row',
            gap: '2',
            align: 'center',
            children: [
              {
                type: 'component',
                component: 'Badge',
                props: { variant: 'secondary', content: { label: 'Archivée' } },
              },
            ],
          },
          {
            type: 'component',
            component: 'DataList',
            props: {},
            children: [
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Identifiant légal', value: 'Identifiant légal non renseigné' } },
              },
              { type: 'component', component: 'DataRow', props: { content: { label: 'Pays', value: 'FR' } } },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'TVA', value: 'TVA non renseignée' } },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Adresse', value: '5 avenue Foch, 33000 Bordeaux' } },
              },
              { type: 'component', component: 'DataRow', props: { content: { label: 'Devise', value: 'EUR' } } },
            ],
          },
          {
            type: 'component',
            component: 'Button',
            props: { variant: 'ghost', size: 'sm', content: { label: 'Réactiver' } },
          },
        ],
      },
      {
        type: 'component',
        component: 'SettingsGroup',
        props: { content: { title: 'Ajouter une société' } },
        children: [
          {
            type: 'component',
            component: 'Input',
            props: { content: { label: 'Raison sociale', placeholder: 'Telle qu’elle apparaîtra sur une facture' } },
          },
          {
            type: 'component',
            component: 'Input',
            props: { content: { label: 'Identifiant légal', placeholder: 'SIREN, numéro d’entreprise, EIN…' } },
          },
          {
            type: 'text',
            text: 'Optionnel : toutes les juridictions n’ont pas le même.',
            style: 'caption',
            color: 'text/muted',
          },
          { type: 'component', component: 'Input', props: { content: { label: 'Pays', placeholder: 'FR' } } },
          { type: 'text', text: 'Deux lettres, code pays de facturation.', style: 'caption', color: 'text/muted' },
          {
            type: 'component',
            component: 'Input',
            props: { content: { label: 'Numéro de TVA', placeholder: 'FR12812345678' } },
          },
          {
            type: 'text',
            text: 'Optionnel : numéro de TVA intracommunautaire.',
            style: 'caption',
            color: 'text/muted',
          },
          {
            type: 'component',
            component: 'Input',
            props: { content: { label: 'Adresse de facturation', placeholder: '12 rue de la Paix, 75002 Paris' } },
          },
          { type: 'component', component: 'Input', props: { content: { label: 'Devise', placeholder: 'EUR' } } },
          {
            type: 'text',
            text: 'Trois lettres, code devise de facturation (ISO 4217).',
            style: 'caption',
            color: 'text/muted',
          },
          {
            type: 'component',
            component: 'Button',
            props: { variant: 'default', content: { label: 'Ajouter la société' } },
          },
        ],
      },
      {
        type: 'text',
        text: 'On archive, on ne supprime pas : une société a porté des missions et des mois facturés, et l’effacer rendrait illisible l’historique qui la nomme. Archivée, elle sort des sélecteurs, pas de la mémoire.',
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
            title: 'Aucune société déclarée',
            description:
              "Tes missions ne portent donc aucune raison sociale, et c'est le cas normal d'une ESN mono-société. Déclare-les seulement si plusieurs de tes structures facturent.",
          },
        },
      },
    ],
    loading: [{ type: 'component', component: 'Skeleton', props: { shape: 'table' } }],
    error: [
      {
        type: 'component',
        component: 'GenericProblemMessage',
        props: { content: { title: 'Les sociétés n’ont pas pu être chargées.', description: 'Réessaie.' } },
      },
    ],
  },
  uxNotes: [
    RESPONSIVE_DECISION,
    RESPONSIVE_ECART_SHELL,
    RESPONSIVE_ECART_WIDE,
    {
      kind: 'ecart',
      text: 'Corrigé dans cette maquette : le vrai écran n’est PAS un tableau — chaque société est sa propre carte (`LegalEntityRow`), avec ses boutons Modifier/Archiver et 5 lignes qui NOMMENT toujours une valeur absente (« Identifiant légal non renseigné », « TVA non renseignée »…) plutôt que de la laisser vide, qui se lirait comme « cette société n’a pas d’identifiant » au lieu de « personne n’en a saisi un ». Le lien `AskLaura` et les hints sous 4 des 6 champs du formulaire manquaient.',
      source: 'apps/web/src/features/legal-entities/view/LegalEntitiesView.tsx:153',
    },
    {
      kind: 'ecart',
      text: 'Corrigé dans cette maquette : cliquer sur l’icône « Modifier » d’une carte (`LegalEntityRow`) la REMPLACE en place par `EditLegalEntityForm` — les six mêmes champs que « Ajouter une société », préremplis avec les valeurs de la société, suivis d’Enregistrer et Annuler. Ce n’est ni une surcouche (pas de `Dialog`/`Sheet`) ni un second formulaire à part : le même `LegalEntityFields` sert à la création ET à la correction. Représenté ici sur la carte « Compte exemple SAS ».',
      source: 'apps/web/src/features/legal-entities/view/LegalEntitiesView.tsx:315',
    },
    {
      kind: 'decision',
      text: 'Aucun bouton « Supprimer » n’existe nulle part sur cet écran — pas une convention de style, l’ABSENCE d’un chemin : une société a pu porter des missions et des mois facturés, l’effacer corromprait l’historique qui la nomme. Archiver, jamais supprimer.',
      source: 'apps/web/src/features/legal-entities/view/LegalEntitiesView.tsx:28',
    },
    {
      kind: 'decision',
      text: 'Déclarer une société est une décision de FACTURATION, pas une décision d’équipe : en lecture seule pour qui ne gère pas la facturation, le formulaire d’ajout est remplacé par le message qui le dit.',
      source: 'apps/web/src/features/legal-entities/view/LegalEntitiesView.tsx:139',
    },
    {
      kind: 'decision',
      text: '`empty` est un état FACULTATIF du gabarit `settings` (`catalog.ts` TEMPLATES.settings.optionalStates) : déclaré ici, car « Aucune société déclarée » est le cas NORMAL d’une ESN mono-société, pas une anomalie.',
      source: 'apps/web/src/features/legal-entities/view/LegalEntitiesView.tsx:120',
    },
  ],
}
