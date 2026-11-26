import type { PageSpec } from '../../types'

/**
 * /projects/:id — le dossier d'un projet/affaire (épopée #2801, 25/09/2026).
 * Fermait un vide mesuré par `object-forms.ts` : aucune route `projects/$id`
 * n'existait, seulement la LISTE (`app/projects-index`) et le tiroir du
 * besoin (`app/projects-needs-detail`).
 *
 * Lu dans : `apps/web/src/routes/projects/$id.tsx` → `ProjectDossierPage.tsx`
 * (entête compte + badges nature/porteur, provenance des champs, contrôles
 * étape/porteur/montant, panneaux besoins/contacts/BTMMP/secteurs/
 * soumissions/timeline). Textes de `apps/web/src/i18n/locales/fr/projects.json`
 * (clé `dossier`).
 */
export const projectsDetailPage: PageSpec = {
  id: 'app/projects-detail',
  surface: 'app',
  domain: 'projects',
  route: 'apps/web/src/routes/projects/$id.tsx',
  title: 'Dossier de projet',
  template: 'detail',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      {
        type: 'component',
        component: 'Button',
        props: { variant: 'ghost', size: 'sm', content: { label: 'Retour aux projets' } },
      },
      {
        type: 'stack',
        direction: 'row',
        gap: '3',
        justify: 'between',
        align: 'start',
        children: [
          {
            type: 'stack',
            direction: 'row',
            gap: '2',
            align: 'center',
            children: [
              { type: 'component', component: 'EntityAvatar', props: { size: 'md', content: { name: 'CE' } } },
              {
                type: 'stack',
                direction: 'column',
                gap: '1',
                children: [
                  { type: 'text', text: 'Affaire exemple', style: 'title' },
                  { type: 'text', text: 'Compte exemple', style: 'body', color: 'text/secondary' },
                ],
              },
            ],
          },
          {
            type: 'stack',
            direction: 'row',
            gap: '2',
            align: 'center',
            children: [
              { type: 'component', component: 'Badge', props: { variant: 'default', content: { label: 'Régie' } } },
              {
                type: 'component',
                component: 'Badge',
                props: { variant: 'secondary', content: { label: 'Porté par —' } },
              },
            ],
          },
        ],
      },
    ],
    actions: [
      {
        type: 'component',
        component: 'Button',
        props: { variant: 'outline', size: 'sm', content: { label: 'Ouvrir le dossier' } },
      },
      {
        type: 'component',
        component: 'Button',
        props: { variant: 'link', size: 'sm', content: { label: 'Demander à Laura' } },
      },
    ],
    primary: [
      {
        type: 'component',
        component: 'DataList',
        props: {},
        children: [
          { type: 'component', component: 'DataRow', props: { content: { label: 'Étape', value: 'Qualifié' } } },
          { type: 'component', component: 'DataRow', props: { content: { label: 'Porteur', value: '—' } } },
          { type: 'component', component: 'DataRow', props: { content: { label: 'Montant', value: '—' } } },
        ],
      },
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Besoins du projet' } },
        children: [
          {
            type: 'component',
            component: 'EmptyState',
            props: { size: 'sm', content: { title: 'Aucun besoin rattaché' } },
          },
        ],
      },
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Contacts du projet' } },
        children: [
          {
            type: 'component',
            component: 'EmptyState',
            props: { size: 'sm', content: { title: 'Aucun contact rattaché' } },
          },
        ],
      },
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Historique' } },
        children: [
          { type: 'component', component: 'EmptyState', props: { size: 'sm', content: { title: 'Aucun évènement' } } },
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
          content: {
            title: 'Ce projet n’a pas pu être chargé',
            description: 'Réessaie dans un instant.',
            action: 'Réessayer',
          },
        },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'decision',
      text: 'Même palier que la liste (`feature="needs"`, celui du pipe) et mêmes sous-composants que le tiroir `ProjectDetailSheet` — un seul calcul par contrôle (étape/porteur/montant), l’assemblage seul diffère entre tiroir et dossier plein écran (même arbitrage que `MissionDossierPage`).',
      source: 'apps/web/src/features/projects/view/ProjectDossierPage.tsx:39',
    },
    {
      kind: 'decision',
      text: 'Deux vides distincts avant le contenu : « n’a pas pu être chargé » (erreur réseau, réessayer) et « ce projet n’est pas dans cet espace » (introuvable, retour à la liste) — jamais confondus sous un même message.',
      source: 'apps/web/src/features/projects/view/ProjectDossierPage.tsx:72',
    },
  ],
}
