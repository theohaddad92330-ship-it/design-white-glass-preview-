import type { Block, PageSpec } from '../../types'
import { HEADER_BREAKPOINT_NOTE, TOKENS_THEME_NOTE, responsiveNote, SITE_FOOTER, SITE_NAV } from './shared'

/**
 * /webinar — le webinaire de lancement (5 septembre 2026) est passé : la page se
 * dépublie en état « Rediffusion » plutôt que de continuer à promettre un direct à
 * venir (RUX-43, docs/revue-ux.md §2 P5 — un contenu périmé n'est jamais silencieux :
 * il se corrige ou se dépublie). Cinq sections dans l'ordre réel de
 * `apps/website/src/app/[locale]/webinar/page.tsx:30-43` : Hero, Agenda, Speakers,
 * Replay, Form. Textes FR : `apps/website/messages/fr/webinar.json`.
 */

const kicker = (text: string): Block => ({ type: 'text', text, style: 'label', color: 'text/accent' })

const hero: Block = {
  type: 'stack',
  direction: 'column',
  gap: '5',
  padding: '10',
  children: [
    {
      type: 'component',
      component: 'Badge',
      props: { variant: 'outline', content: { label: 'Webinaire de lancement · Rediffusion disponible' } },
    },
    { type: 'text', text: 'Préparer un compte en minutes, pas en heures.', style: 'display' },
    {
      type: 'text',
      text: "Revivez la session du 5 septembre 2026 : comment BellumAI transforme le nom d'une entreprise en dossier de conquête complet — décideurs, signaux d'achat, plan d'action et messages prêts à envoyer. La prospection ESN, réinventée.",
      style: 'body',
      color: 'text/secondary',
    },
    {
      type: 'stack',
      direction: 'row',
      gap: '3',
      children: [
        {
          type: 'component',
          component: 'Button',
          props: { variant: 'default', content: { label: 'Recevoir le replay' } },
        },
        {
          type: 'component',
          component: 'Button',
          props: { variant: 'outline', content: { label: 'Voir le programme' } },
        },
      ],
    },
    {
      type: 'grid',
      columns: 3,
      columnsMobile: 1,
      gap: '6',
      children: [
        ['Terminé', 'Session du 5 sept. 2026'],
        ['~45 min', 'Démo + questions'],
        ['Gratuit', 'Replay par email'],
      ].map(
        ([value, label]): Block => ({
          type: 'stack',
          direction: 'column',
          gap: '1',
          children: [
            { type: 'text', text: value, style: 'display' },
            { type: 'text', text: label, style: 'caption', color: 'text/muted' },
          ],
        }),
      ),
    },
    {
      type: 'stack',
      direction: 'row',
      gap: '4',
      children: ['Replay envoyé aux inscrits', 'Hébergé en Europe', 'Conforme RGPD'].map(
        (t): Block => ({ type: 'text', text: t, style: 'caption', color: 'text/muted' }),
      ),
    },
  ],
}

const agenda: Block = {
  type: 'stack',
  direction: 'column',
  gap: '6',
  padding: '10',
  children: [
    kicker('Le déroulé'),
    { type: 'text', text: 'Ce qui se passe pendant les 45 minutes.', style: 'title' },
    {
      type: 'text',
      text: 'Une session dense et concrète : le problème, une vraie démo en direct, des cas ESN, vos questions, puis une offre réservée aux participants.',
      style: 'body',
      color: 'text/secondary',
    },
    {
      type: 'text',
      text: 'En direct · environ 45 minutes · animé par Louis et Théo',
      style: 'caption',
      color: 'text/muted',
    },
    {
      type: 'stack',
      direction: 'column',
      gap: '3',
      children: [
        [
          '5 min',
          'Le problème',
          'Chercher au lieu de vendre : 15 onglets ouverts, des données périmées, le mauvais interlocuteur.',
        ],
        [
          '15 min',
          'Démo en direct',
          'Une analyse lancée en live sur un vrai compte : profil ESN → dossier de compte → signaux → décideurs → message → export CRM.',
        ],
        [
          '10 min',
          "Cas d'usage ESN",
          "Ouvrir un compte, prioriser son portefeuille, préparer un RDV, détecter un signal d'achat.",
        ],
        [
          '10 min',
          'Questions / réponses',
          'Sources et fiabilité, RGPD, prix et crédits, LinkedIn, CRM, sécurité : on répond en direct.',
        ],
        [
          '5 min',
          'Offre early adopter',
          "Une démo personnalisée pour tout le monde, et des places d'accompagnement early adopter réservées aux ESN présentes.",
        ],
      ].map(
        ([duration, title, desc]): Block => ({
          type: 'component',
          component: 'DataRow',
          props: { content: { label: `${duration} — ${title}`, value: desc } },
        }),
      ),
    },
  ],
}

const speakers: Block = {
  type: 'stack',
  direction: 'column',
  gap: '6',
  padding: '10',
  children: [
    kicker('Les intervenants'),
    { type: 'text', text: 'Qui anime le webinaire.', style: 'title' },
    {
      type: 'text',
      text: 'Deux co-fondateurs, deux regards complémentaires : le produit et le terrain ESN.',
      style: 'body',
      color: 'text/secondary',
    },
    {
      type: 'grid',
      columns: 2,
      columnsMobile: 1,
      gap: '4',
      children: [['Co-fondateur — produit'], ['Co-fondateur — ex-Business Manager en ESN']].map(
        ([role]): Block => ({
          type: 'component',
          component: 'Card',
          props: { content: { title: role as string } },
          children: [{ type: 'component', component: 'Avatar', props: { content: { initials: '··' } } }],
        }),
      ),
    },
  ],
}

const replay: Block = {
  type: 'stack',
  direction: 'column',
  gap: '3',
  padding: '10',
  children: [
    kicker('La session est terminée'),
    { type: 'text', text: 'Recevez l’enregistrement complet.', style: 'title' },
    {
      type: 'text',
      text: 'Le webinaire a été enregistré le 5 septembre 2026. Laissez votre email pour recevoir le replay complet, plus des extraits courts à revoir à tête reposée.',
      style: 'body',
      color: 'text/secondary',
    },
    { type: 'component', component: 'Button', props: { variant: 'link', content: { label: 'Recevoir le replay' } } },
  ],
}

const form: Block[] = [
  {
    type: 'stack',
    direction: 'column',
    gap: '1',
    padding: '10',
    children: [
      {
        type: 'grid',
        columns: 2,
        columnsMobile: 1,
        gap: '10',
        children: [
          {
            type: 'stack',
            direction: 'column',
            gap: '4',
            children: [
              {
                type: 'component',
                component: 'Badge',
                props: { variant: 'outline', content: { label: 'Inscription' } },
              },
              { type: 'text', text: 'Recevez le replay.', style: 'title' },
              {
                type: 'text',
                text: 'La session est terminée. Laissez votre email professionnel pour recevoir l’enregistrement complet, envoyé sous 24 h.',
                style: 'body',
                color: 'text/secondary',
              },
              ...[
                'La démo en direct sur un vrai compte, telle qu’elle a eu lieu.',
                "D'où vient chaque information : la transparence des sources, sans donnée inventée.",
                'Comment prioriser votre portefeuille et repérer les signaux que personne ne surveille.',
                'L’offre early adopter réservée aux personnes qui demandent le replay.',
              ].map((t): Block => ({ type: 'text', text: t, style: 'body', color: 'text/secondary' })),
            ],
          },
          {
            type: 'component',
            component: 'Card',
            props: {
              content: { title: 'Recevoir le replay', description: 'Session du 5 septembre 2026 · gratuit.' },
            },
            children: [
              {
                type: 'component',
                component: 'Input',
                props: {
                  state: 'default',
                  content: { label: 'Email professionnel', placeholder: 'vous@votre-esn.com' },
                },
              },
              {
                type: 'component',
                component: 'Button',
                props: { variant: 'default', content: { label: 'Recevoir le replay' } },
              },
              {
                type: 'text',
                text: 'Le replay est envoyé par email sous 24 h. Vos données ne sont jamais revendues.',
                style: 'caption',
                color: 'text/muted',
              },
              {
                type: 'stack',
                direction: 'row',
                gap: '3',
                children: ['Gratuit', 'Replay complet', 'Sans engagement'].map(
                  (t): Block => ({ type: 'text', text: t, style: 'caption', color: 'text/muted' }),
                ),
              },
            ],
          },
        ],
      },
    ],
  },
]

export const webinarPage: PageSpec = {
  id: 'site/webinar',
  surface: 'site',
  domain: 'webinaire',
  route: 'apps/website/src/app/[locale]/webinar/page.tsx',
  title: 'Webinaire de lancement',
  template: 'marketing',
  viewports: ['desktop', 'mobile'],
  slots: {
    nav: SITE_NAV,
    hero: [hero],
    sections: [agenda, speakers, replay],
    cta: form,
    footer: SITE_FOOTER,
  },
  states: {},
  uxNotes: [
    HEADER_BREAKPOINT_NOTE,
    TOKENS_THEME_NOTE,
    responsiveNote(
      'Le formulaire d’inscription passe de 2 colonnes à 1 sous 1024 px ; les trois chiffres-clés du hero et les deux intervenants passent de 3/2 colonnes à 1 sous 768 px.',
      'apps/website/src/features/webinar/WebinarForm.tsx:1',
    ),
    {
      kind: 'ecart',
      text: 'RUX-43 (docs/revue-ux.md §2 P5) : le code affiche encore le webinaire (« vendredi 5 septembre 2026 ») comme un évènement à venir — badge, hero et carte d’inscription au futur, alors que la date est passée. La maquette cible l’état « Rediffusion » : plus d’inscription à un direct, un email pour recevoir le replay.',
      source: 'apps/website/messages/fr/webinar.json:7',
    },
    {
      kind: 'decision',
      text: 'RUX-43 (docs/revue-ux.md §2 P5, addenda au Top 20) : une page qui promeut un évènement daté se DÉPUBLIE dès que la date est passée (état « Rediffusion », jamais un contenu qui reste rédigé au futur) — ici, badge « Rediffusion disponible », statistique « Terminé » (jamais une date qui ment), CTA « Recevoir le replay » et un formulaire réduit à l’email (le nom, l’ESN et le rôle n’ont plus de sens pour demander un enregistrement).',
      source: 'apps/website/src/app/[locale]/webinar/page.tsx:30',
    },
  ],
}
