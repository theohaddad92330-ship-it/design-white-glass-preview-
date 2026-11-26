import type { PageSpec } from '../../types'
import {
  RESPONSIVE_DECISION,
  RESPONSIVE_ECART_ROW,
  RESPONSIVE_ECART_SHELL,
  RESPONSIVE_ECART_WIDE,
  SETTINGS_SECTION_NAV,
} from './settings-shared'

/**
 * /settings/notifications — Notifications. Lu dans
 * `apps/web/src/routes/settings/notifications.tsx` → `NotificationsView.tsx` :
 * 4 présélections (raccourci d'écriture, GA-26), 3 groupes de bascules
 * (Activité, Assistante, Changelog), puis les canaux SMS et navigateur, puis
 * les règles de veille personnelles (`WatchlistRulesSection`). Textes de
 * `i18n/locales/fr/settings.json` (`notifications.*`).
 */
export const settingsNotificationsPage: PageSpec = {
  id: 'app/settings-notifications',
  surface: 'app',
  domain: 'settings',
  route: 'apps/web/src/routes/settings/notifications.tsx',
  title: 'Notifications',
  template: 'settings',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Notifications', style: 'title' },
      {
        type: 'text',
        text: "Choisis quand recevoir un email ou une alerte in-app pour tes comptes. Rien n'est coché d'avance : un envoi ne part qu'une fois allumé ici.",
        style: 'body',
        color: 'text/secondary',
      },
    ],
    sectionNav: SETTINGS_SECTION_NAV,
    primary: [
      {
        type: 'stack',
        direction: 'column',
        gap: '2',
        children: [
          { type: 'text', text: 'Cadence de notification', style: 'heading' },
          {
            type: 'text',
            text: "Un clic ajuste les réglages d'activité ci-dessous — jamais un nouveau canal, jamais un nouvel envoi.",
            style: 'caption',
            color: 'text/secondary',
          },
          {
            type: 'grid',
            columns: 4,
            columnsMobile: 2,
            gap: '2',
            children: [
              {
                type: 'component',
                component: 'Card',
                props: {
                  content: {
                    title: 'Urgent uniquement',
                    description: "Signaux d'achat, crédits bas et actions en retard.",
                  },
                },
              },
              {
                type: 'component',
                component: 'Card',
                props: {
                  content: {
                    title: 'Brief quotidien',
                    description: 'Les mêmes alertes immédiates, plus le digest quotidien de veille.',
                  },
                },
              },
              {
                type: 'component',
                component: 'Card',
                props: {
                  content: {
                    title: 'Résumé hebdomadaire',
                    description: 'Les mêmes alertes immédiates, plus les deux récapitulatifs hebdomadaires.',
                  },
                },
              },
              {
                type: 'component',
                component: 'Card',
                props: {
                  content: {
                    title: 'Personnalisé',
                    description:
                      "Actif dès qu'un réglage ne correspond à aucun des trois modèles — se coche tout seul.",
                  },
                },
              },
            ],
          },
        ],
      },
      {
        type: 'component',
        component: 'SettingsGroup',
        props: { content: { title: 'Activité' } },
        children: [
          {
            type: 'component',
            component: 'SettingsRow',
            props: {
              content: { label: "Signaux d'achat", description: 'Un signal fort détecté sur un compte suivi.' },
            },
          },
          {
            type: 'component',
            component: 'SettingsRow',
            props: { content: { label: 'Rappels de relance', description: 'Une action arrive à échéance.' } },
          },
          {
            type: 'component',
            component: 'SettingsRow',
            props: {
              content: {
                label: 'Résumé hebdomadaire',
                description: 'Le récapitulatif de la semaine sur ton portefeuille.',
              },
            },
          },
          {
            type: 'component',
            component: 'SettingsRow',
            props: { content: { label: 'Digest hebdomadaire', description: 'Le digest hebdomadaire des comptes.' } },
          },
          {
            type: 'component',
            component: 'SettingsRow',
            props: { content: { label: 'Crédit bas', description: 'Le solde de crédits passe sous le seuil.' } },
          },
          {
            type: 'component',
            component: 'SettingsRow',
            props: { content: { label: 'Action en retard', description: 'Une action prévue a dépassé son échéance.' } },
          },
          {
            type: 'component',
            component: 'SettingsRow',
            props: {
              content: {
                label: 'Digest quotidien de veille',
                description: 'Un e-mail quotidien filtré par tes règles de veille (06:30).',
              },
            },
          },
          {
            type: 'component',
            component: 'SettingsRow',
            props: {
              content: {
                label: 'Préparation de rendez-vous',
                description: 'Un rendez-vous approche sur un compte suivi.',
              },
            },
          },
          {
            type: 'component',
            component: 'SettingsRow',
            props: { content: { label: 'Fin de mission', description: 'Une mission arrive à son terme.' } },
          },
          {
            type: 'component',
            component: 'SettingsRow',
            props: { content: { label: 'Réponse client', description: 'Un client a répondu.' } },
          },
        ],
      },
      {
        type: 'component',
        component: 'SettingsGroup',
        props: { content: { title: 'Assistante' } },
        children: [
          {
            type: 'component',
            component: 'SettingsRow',
            props: {
              content: {
                label: 'Laura peut te parler en premier',
                description: 'Autorise le copilote à ouvrir une conversation.',
              },
            },
          },
        ],
      },
      {
        type: 'component',
        component: 'SettingsGroup',
        props: { content: { title: 'Changelog' } },
        children: [
          {
            type: 'component',
            component: 'SettingsRow',
            props: {
              content: {
                label: 'Nouveautés dans la barre latérale',
                description: 'Le badge « Nouveautés » au pied de la barre latérale.',
              },
            },
          },
          {
            type: 'component',
            component: 'SettingsRow',
            props: { content: { label: 'Newsletter changelog', description: 'Un e-mail les 1er et 15 du mois.' } },
          },
        ],
      },
      {
        type: 'component',
        component: 'SettingsGroup',
        props: { content: { title: 'SMS' } },
        children: [
          {
            type: 'component',
            component: 'SettingsRow',
            props: {
              content: {
                label: 'Alertes urgentes par SMS',
                description: 'Seulement les alertes urgentes, sur un numéro que tu vérifies par un code.',
              },
            },
          },
        ],
      },
      {
        type: 'component',
        component: 'SettingsGroup',
        props: { content: { title: 'Notifications navigateur' } },
        children: [
          {
            type: 'component',
            component: 'SettingsRow',
            props: {
              content: {
                label: 'Notifications natives de ce navigateur',
                description: "Relaie tes notifications de l'application, propre à CE navigateur.",
              },
            },
          },
        ],
      },
      {
        type: 'component',
        component: 'SettingsGroup',
        props: { content: { title: 'Règles de veille personnelles' } },
        children: [
          {
            type: 'component',
            component: 'DataList',
            props: {},
            children: [
              { type: 'component', component: 'DataRow', props: { content: { label: 'Secteurs suivis', value: '—' } } },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Comptes surveillés', value: '—' } },
              },
            ],
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
        props: {
          content: {
            title: 'Je n’ai pas pu charger tes préférences de notification.',
            description: 'Réessaie dans un instant.',
          },
        },
      },
    ],
  },
  uxNotes: [
    RESPONSIVE_DECISION,
    RESPONSIVE_ECART_SHELL,
    RESPONSIVE_ECART_WIDE,
    RESPONSIVE_ECART_ROW,
    {
      kind: 'decision',
      text: 'Les 4 présélections sont des cartes cliquables, pas des `SettingsRow` : ce n’est pas un réglage de plus, c’est un raccourci d’écriture vers les réglages d’Activité ci-dessous (GA-26, une seule source pour « quelle présélection est active »).',
      source: 'apps/web/src/features/settings/view/NotificationsView.tsx:181',
    },
  ],
}
