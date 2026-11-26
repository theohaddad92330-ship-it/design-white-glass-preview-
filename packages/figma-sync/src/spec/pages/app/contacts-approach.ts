import type { PageSpec } from '../../types'

/**
 * /contacts/$id/approach/$channel — la page « Prépare ton e-mail / ton message LinkedIn » (Théo C6).
 *
 * Lu dans : `apps/web/src/routes/contacts/$id_.approach.$channel.tsx` → `ApproachPage.tsx`.
 * L'objectif, le canal, les précisions facultatives, le brouillon, puis « Valider le brouillon » ; envoyer,
 * déposer dans la boîte ou copier ne se débloquent qu'après validation. Textes :
 * `apps/web/src/i18n/locales/fr/engagement.json` (`approachPage`).
 */
export const contactsApproachPage: PageSpec = {
  id: 'app/contacts-approach',
  surface: 'app',
  domain: 'contacts',
  route: 'apps/web/src/routes/contacts/$id_.approach.$channel.tsx',
  title: 'Préparer un message',
  template: 'detail',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [{ type: 'text', text: 'Prépare ton e-mail', style: 'title' }],
    actions: [
      {
        type: 'component',
        component: 'Button',
        props: { variant: 'outline', size: 'sm', content: { label: 'Retour au contact' } },
      },
    ],
    primary: [
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Ce que tu veux obtenir' } },
        children: [
          {
            type: 'component',
            component: 'FilterChips',
            props: {
              size: 'sm',
              items: ['Obtenir une orientation', 'Reprendre un échange', 'Présenter une expertise'],
            },
          },
        ],
      },
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Canal de préparation' } },
        children: [
          {
            type: 'component',
            component: 'FilterChips',
            props: { size: 'sm', items: ['E-mail', 'LinkedIn', 'Appel'] },
          },
        ],
      },
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Ton brouillon' } },
        children: [
          { type: 'component', component: 'DataRow', props: { content: { label: 'Objet', value: '—' } } },
          { type: 'text', text: 'Tu gardes la main sur chaque formulation.', style: 'caption', color: 'text/muted' },
          {
            type: 'component',
            component: 'Button',
            props: { variant: 'outline', content: { label: 'Valider le brouillon' } },
          },
        ],
      },
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Après validation' } },
        children: [
          {
            type: 'text',
            text: 'Envoyer, déposer dans ta boîte ou copier ne se débloque qu’une fois le brouillon relu et validé.',
            style: 'body',
            color: 'text/muted',
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
        props: { content: { title: 'Ce contact est introuvable.' } },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'decision',
      text: 'Rien ne part sans le clic du commercial : l’envoi, le dépôt dans la boîte et la copie sont rangés SOUS « Valider le brouillon » (décision Louis 22/10).',
      source: 'apps/web/src/features/contacts/view/approach/ApproachPage.tsx:76',
    },
    {
      // Reprise de la note de la page d'appel dédiée, supprimée par #4525 (l'Appel est devenu un ONGLET de
      // cette page) : la décision, elle, n'est pas supprimée — elle déménage avec l'écran.
      kind: 'decision',
      text: 'Le copilote prépare, le commercial appelle : aucune action de l’onglet « Appel » ne lance un appel ni n’écrit au CRM.',
      source: 'apps/web/src/features/contacts/view/approach/CallApproachBody.tsx:370',
    },
  ],
}
