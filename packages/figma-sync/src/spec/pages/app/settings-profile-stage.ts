import type { PageSpec } from '../../types'
import {
  RESPONSIVE_DECISION,
  RESPONSIVE_ECART_SHELL,
  RESPONSIVE_ECART_WIDE,
  SETTINGS_SECTION_NAV,
} from './settings-shared'

/**
 * /settings/profile/$stage — édition d'une étape du questionnaire de profil.
 * Lu dans `apps/web/src/routes/settings/profile/$stage.tsx` →
 * `ProfileStagePage.tsx` : une question par ligne, enregistrement
 * automatique (pas de bouton « Enregistrer »), un champ partagé par l'ESN se
 * verrouille pour qui ne peut pas l'éditer, avec un bouton pour signaler une
 * erreur. Textes de `i18n/locales/fr/profile.json`.
 */
export const settingsProfileStagePage: PageSpec = {
  id: 'app/settings-profile-stage',
  surface: 'app',
  domain: 'settings',
  route: 'apps/web/src/routes/settings/profile/$stage.tsx',
  title: 'Profil ESN',
  template: 'settings',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'component', component: 'Button', props: { variant: 'ghost', size: 'sm', content: { label: 'Retour' } } },
      { type: 'text', text: 'Profil ESN', style: 'title' },
      { type: 'text', text: 'Modifications enregistrées automatiquement.', style: 'body', color: 'text/secondary' },
    ],
    sectionNav: SETTINGS_SECTION_NAV,
    primary: [
      {
        type: 'stack',
        direction: 'column',
        gap: '2',
        children: [
          { type: 'text', text: 'Combien de consultants travaillent chez toi ?', style: 'heading' },
          { type: 'component', component: 'Input', props: { content: { placeholder: '—' } } },
        ],
      },
      {
        type: 'stack',
        direction: 'column',
        gap: '2',
        children: [
          {
            type: 'stack',
            direction: 'row',
            gap: '2',
            align: 'center',
            children: [
              { type: 'text', text: 'Quel est le nom de ton ESN ?', style: 'heading' },
              { type: 'component', component: 'Badge', props: { variant: 'outline', content: { label: 'Confirmé' } } },
            ],
          },
          {
            type: 'text',
            text: 'Champ de l’entreprise — modifiable par le propriétaire ou un admin.',
            style: 'caption',
            color: 'text/secondary',
          },
          {
            type: 'component',
            component: 'Button',
            props: { variant: 'ghost', size: 'sm', content: { label: 'Signaler une erreur' } },
          },
          {
            type: 'component',
            component: 'Input',
            props: { content: { placeholder: '—', value: '—' }, state: 'disabled' },
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
        component: 'GenericProblemMessage',
        props: { content: { title: 'Je n’ai pas pu charger cette étape.', description: 'Réessaie.' } },
      },
    ],
  },
  uxNotes: [
    RESPONSIVE_DECISION,
    RESPONSIVE_ECART_SHELL,
    RESPONSIVE_ECART_WIDE,
    {
      kind: 'decision',
      text: 'Pas de bouton « Enregistrer » : l’enregistrement est automatique (`useAutoSaveProfile`) — seul un texte le dit, contrairement à `/settings/finance` ou `/settings/pipeline` qui, eux, exigent un clic explicite. Formes différentes du même geste « sauvegarder un réglage », à vérifier contre GA-26.',
      source: 'apps/web/src/features/profile/view/ProfileStagePage.tsx:102',
    },
    {
      kind: 'decision',
      text: 'Un badge de statut de réponse (`Confirmé`/`corrigé`…) ne s’affiche JAMAIS sur une question vide — une absence ne s’affiche jamais comme une valeur (GA-18/19) — et reste ÉTEINT PARTOUT tant qu’aucune réponse n’a jamais été confirmée (Louis 20/09/2026, #2006.22).',
      source: 'apps/web/src/features/profile/view/ProfileStagePage.tsx:163',
    },
    {
      kind: 'decision',
      text: 'Un champ verrouillé (donnée partagée par l’ESN, hors droit d’édition) reste visible mais désactivé, avec un bouton « Signaler une erreur » à côté — jamais masqué ni fondu en simple texte.',
      source: 'apps/web/src/features/profile/view/ProfileStagePage.tsx:186',
    },
  ],
}
