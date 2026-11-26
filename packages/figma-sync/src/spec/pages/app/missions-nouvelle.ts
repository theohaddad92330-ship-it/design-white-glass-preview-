import type { PageSpec } from '../../types'

/**
 * /missions/nouvelle — « Nouvelle mission » (#4196, épopée #4191, lot L5).
 *
 * ⚠️ Renversement du 14/10/2026 : cet écran montait l'assistant de BESOIN en
 * quatre étapes (`NeedWizard`) et écrivait un `project_need`. Il écrit
 * désormais une vraie MISSION (`POST /delivery/missions`) avec un formulaire
 * d'une seule page ; le besoin garde sa porte (`/projects/needs`).
 *
 * Lu dans : `apps/web/src/routes/missions/nouvelle.tsx` →
 * `CreateMissionPage.tsx` (retour) → `MissionCreateForm.tsx` (champs, envoi).
 * Textes de `apps/web/src/i18n/locales/fr/missions.json` (`createMission`,
 * `createForm`).
 */
export const missionsNouvellePage: PageSpec = {
  id: 'app/missions-nouvelle',
  surface: 'app',
  domain: 'missions',
  route: 'apps/web/src/routes/missions/nouvelle.tsx',
  title: 'Nouvelle mission',
  template: 'wizard',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [{ type: 'text', text: 'Nouvelle mission', style: 'title' }],
    progress: [
      {
        type: 'text',
        text: 'Une seule étape : un compte, un intitulé, une date de début.',
        style: 'caption',
        color: 'text/secondary',
      },
    ],
    primary: [
      {
        type: 'stack',
        direction: 'column',
        gap: '3',
        children: [
          {
            type: 'component',
            component: 'Input',
            props: { content: { label: 'Compte', placeholder: 'Chercher un compte' } },
          },
          { type: 'component', component: 'Input', props: { content: { label: 'Intitulé' } } },
          {
            type: 'grid',
            columns: 2,
            columnsMobile: 1,
            gap: '3',
            children: [
              { type: 'component', component: 'Input', props: { content: { label: 'Date de début' } } },
              { type: 'component', component: 'Input', props: { content: { label: 'Date de fin' } } },
            ],
          },
          { type: 'component', component: 'Input', props: { content: { label: 'TJM vendu (€)' } } },
          {
            type: 'component',
            component: 'Select',
            props: { size: 'md', content: { label: 'Consultant', value: 'Choisir un consultant' } },
          },
          {
            type: 'component',
            component: 'Select',
            props: { size: 'md', content: { label: 'Affaire', value: 'Rattacher à une affaire' } },
          },
        ],
      },
    ],
    footer: [
      {
        type: 'stack',
        direction: 'row',
        gap: '2',
        justify: 'end',
        children: [
          { type: 'component', component: 'Button', props: { variant: 'ghost', content: { label: 'Annuler' } } },
          {
            type: 'component',
            component: 'Button',
            props: { variant: 'default', content: { label: 'Créer la mission' } },
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
        component: 'InfoBanner',
        props: { variant: 'danger', size: 'sm', content: { title: 'La mission n’a pas pu être créée.' } },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'decision',
      text: 'Renversement assumé du 14/10/2026 (#4196) : « Nouvelle mission » écrit une MISSION, plus un besoin — un commercial qui clique « Nouvelle mission » repartait avec un besoin.',
      source: 'apps/web/src/features/missions/view/CreateMissionPage.tsx:12',
    },
    {
      kind: 'decision',
      text: 'Venant d’une opportunité signée (`?project_id=`), le compte et l’affaire sont IMPOSÉS : le compte est nommé, aucun champ de recherche n’est affiché.',
      source: 'apps/web/src/features/missions/view/MissionCreateForm.tsx:89',
    },
    {
      kind: 'decision',
      text: 'Un champ facultatif vide n’est jamais envoyé — ni « 0 », ni chaîne vide : un TJM non saisi reste non renseigné.',
      source: 'apps/web/src/features/missions/view/MissionCreateForm.tsx:74',
    },
    {
      kind: 'decision',
      text: 'Une date de fin antérieure au début est dite sous le champ et bloque l’envoi.',
      source: 'apps/web/src/features/missions/view/MissionCreateForm.tsx:145',
    },
  ],
}
