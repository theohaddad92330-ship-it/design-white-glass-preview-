import type { PageSpec } from '../../types'

/**
 * /chat — Laura, en plein écran (plus de widget flottant, #1320/#1906.7).
 * Historique repliable, fil de conversation, ligne de saisie avec pièces
 * jointes/connecteurs/mentions, mémoire longue sous la saisie.
 *
 * `/chat/commandes` REDIRIGE ici (décision de Louis, 02/09/2026) : le
 * catalogue de commandes est un tiroir ouvert depuis la ligne d'outils du
 * composer, pas une page séparée — pas de spec propre pour cette route.
 *
 * Lu dans : `apps/web/src/routes/chat/index.tsx` → `Chat.tsx` (`ChatHeader`,
 * `ConversationsPanel`, `MessagesArea`, `Composer`, `MemoryBar`). Textes de
 * `apps/web/src/i18n/locales/fr/chat.json` et `launcher.json`.
 */
export const chatPage: PageSpec = {
  id: 'app/chat',
  surface: 'app',
  domain: 'chat',
  route: 'apps/web/src/routes/chat/index.tsx',
  title: 'Laura',
  template: 'chat',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'component', component: 'LauraFace', props: {} },
      { type: 'text', text: 'Laura', style: 'label' },
      { type: 'component', component: 'Badge', props: { variant: 'info', content: { label: 'Assistante IA' } } },
      {
        type: 'component',
        component: 'Button',
        props: { variant: 'outline', size: 'sm', content: { label: 'Portefeuille entier' } },
      },
      {
        type: 'stack',
        direction: 'row',
        gap: '2',
        align: 'center',
        justify: 'end',
        children: [
          {
            type: 'component',
            component: 'Button',
            props: { variant: 'ghost', size: 'icon', content: { label: 'Résumé du fil' } },
          },
          {
            type: 'component',
            component: 'Button',
            props: { variant: 'ghost', size: 'icon', content: { label: 'Qui a accès à ce fil' } },
          },
          {
            type: 'component',
            component: 'Button',
            props: {
              variant: 'ghost',
              size: 'icon',
              content: { label: 'Propriétaire, rattachement, versions figées' },
            },
          },
          {
            type: 'component',
            component: 'Button',
            props: { variant: 'outline', size: 'sm', content: { label: 'Partager' } },
          },
        ],
      },
    ],
    history: [
      {
        type: 'component',
        component: 'SearchInput',
        props: { size: 'sm', content: { placeholder: 'Rechercher une conversation' } },
      },
      {
        type: 'component',
        component: 'DataList',
        props: {},
        children: [
          {
            type: 'component',
            component: 'DataRow',
            props: { content: { label: 'Nouvelle conversation', value: 'Maintenant' } },
          },
          { type: 'component', component: 'DataRow', props: { content: { label: 'Compte exemple 1', value: '—' } } },
          { type: 'component', component: 'DataRow', props: { content: { label: 'Fil sans titre', value: '—' } } },
        ],
      },
    ],
    thread: [
      {
        type: 'stack',
        direction: 'column',
        gap: '3',
        padding: '4',
        children: [
          // RUX-10 (adapté Q1, `docs/revue-ux.md` §4/§6) : la bannière « premier jour » d'app/welcome
          // vit ici, au-dessus du fil — l'arrivée par défaut est Laura, pas « Aujourd'hui ». Disparaît
          // après la première analyse.
          {
            type: 'component',
            component: 'InfoBanner',
            props: {
              variant: 'info',
              content: {
                title: 'Ton profil est prêt',
                description:
                  'BellumAI adapte chaque analyse à ton ESN — voir tout ce qui a été compris de ton activité.',
              },
            },
          },
          {
            type: 'stack',
            direction: 'row',
            gap: '2',
            children: [
              {
                type: 'component',
                component: 'Button',
                props: { variant: 'outline', size: 'sm', content: { label: 'Laisse Laura choisir' } },
              },
              {
                type: 'component',
                component: 'Button',
                props: { variant: 'outline', size: 'sm', content: { label: 'Voir tout mon profil' } },
              },
            ],
          },
          {
            type: 'stack',
            direction: 'row',
            justify: 'start',
            gap: '2',
            children: [
              { type: 'component', component: 'LauraFace', props: {} },
              {
                type: 'text',
                text: 'Bonjour {{firstName}}. Ton portefeuille compte des comptes analysés. Je peux te dire lesquels travailler cette semaine, préparer ton prochain rendez-vous ou partir d’un consultant disponible. Par quoi on commence ?',
                style: 'body',
              },
            ],
          },
          {
            type: 'stack',
            direction: 'row',
            justify: 'end',
            gap: '2',
            children: [{ type: 'text', text: 'Qu’est-ce qui attend ma validation cette semaine ?', style: 'body' }],
          },
        ],
      },
    ],
    composer: [
      {
        type: 'stack',
        direction: 'row',
        gap: '2',
        align: 'center',
        children: [
          {
            type: 'component',
            component: 'Button',
            props: { variant: 'ghost', size: 'icon', content: { label: 'Ajouter un fichier' } },
          },
          {
            type: 'component',
            component: 'Textarea',
            props: { state: 'default', content: { placeholder: 'Écris ton message...' } },
          },
          {
            type: 'component',
            component: 'Button',
            props: { variant: 'default', size: 'icon', content: { label: 'Envoyer' } },
          },
        ],
      },
    ],
  },
  states: {
    empty: [
      {
        type: 'stack',
        direction: 'column',
        gap: '3',
        align: 'center',
        children: [
          { type: 'text', text: 'Bonjour {{firstName}}. Par quoi on commence ?', style: 'title' },
          {
            type: 'stack',
            direction: 'row',
            gap: '2',
            children: [
              {
                type: 'component',
                component: 'Button',
                props: { variant: 'outline', size: 'sm', content: { label: 'Analyser une entreprise' } },
              },
              {
                type: 'component',
                component: 'Button',
                props: { variant: 'outline', size: 'sm', content: { label: 'Actualiser un dossier' } },
              },
              {
                type: 'component',
                component: 'Button',
                props: { variant: 'outline', size: 'sm', content: { label: 'Enrichir un contact' } },
              },
              {
                type: 'component',
                component: 'Button',
                props: { variant: 'outline', size: 'sm', content: { label: 'Matcher le vivier' } },
              },
              {
                type: 'component',
                component: 'Button',
                props: { variant: 'outline', size: 'sm', content: { label: 'Préparer un plan d’attaque' } },
              },
            ],
          },
        ],
      },
    ],
    loading: [{ type: 'component', component: 'BrailleLoader', props: { variant: 'grid-searching' } }],
    error: [
      {
        type: 'component',
        component: 'EmptyState',
        props: {
          size: 'md',
          align: 'center',
          content: {
            title: 'Ce fil n’est plus accessible',
            description: 'Il a peut-être été fermé ou n’appartient pas à ton espace.',
          },
        },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'decision',
      text: 'Aucune bande séparée pour les cinq travaux gouvernés (analyser, actualiser, enrichir, matcher, préparer un plan) : ils vivent DANS la ligne d’outils du composer une fois le fil entamé, et au centre de l’état vide sinon — jamais les deux à la fois, sinon ils s’afficheraient deux fois (loi 4 du tome 7).',
      source: 'apps/web/src/features/chat/view/Chat.tsx:2287',
    },
    {
      kind: 'decision',
      text: 'Le volet de contexte séparé a disparu : les comptes vivent dans la portée (bouton d’en-tête), les « actions rapides » dans les amorces, la mémoire et l’avertissement sous le fil, et la liste des membres dans Réglages › Équipe — un seul réglage à un seul endroit (GA-26).',
      source: 'apps/web/src/features/chat/view/Chat.tsx:1984',
    },
    {
      kind: 'ecart',
      text: 'La mémoire à long terme (« Laura garde en tête ») affiche `MemoryBar` directement sous la saisie, sans en-tête `h2` propre — un lecteur d’écran qui saute de titre en titre passe du composer au bandeau mémoire sans annonce.',
      source: 'apps/web/src/features/chat/view/Chat.tsx:2326',
    },
    {
      kind: 'decision',
      text: 'Responsive : sous 768 px, `ConversationsPanel` (colonne d’historique desktop) est masqué (`max-md:hidden`) et remplacé par `ConversationsDrawer`, ouvert depuis un bouton d’en-tête (`md:hidden`) — les deux déclencheurs ne coexistent jamais. L’en-tête passe de deux lignes empilées (< 768 px : nom, mention IA, portée) à une seule ligne alignée (≥ 768 px), et sa hauteur passe de 56 px à 40 px. Tablette (768-1194) et desktop (1195-1920) partagent la même mise en page en colonnes (historique + fil). Au-delà de 1920 px (2560, 3440) : l’historique garde une largeur fixe en rem, le fil garde sa largeur de lecture de texte (D81, ~70 caractères) centrée — l’espace en plus devient de la marge de part et d’autre du fil, jamais un fil étiré pleine largeur ni une troisième colonne inventée.',
      source: 'apps/web/src/features/chat/view/Chat.tsx:2401',
    },
    {
      kind: 'decision',
      text: 'Q1 (arbitrage du fondateur, 25/09/2026) : Laura est l’écran d’ARRIVÉE par défaut, sur bureau et sur mobile — sinon l’écran choisi par l’utilisateur dans Réglages › Démarrage. « Aujourd’hui » (`/briefing`) n’est plus le défaut (écart à la recommandation du §5, tranché explicitement). `app/home` documente déjà la redirection silencieuse vers ce défaut.',
      source: 'apps/web/src/components/templates/home-page.tsx:30',
    },
    {
      kind: 'decision',
      text: 'RUX-10 (`docs/revue-ux.md` §4, T3), ADAPTÉ à Q1 : la recommandation d’origine faisait de « Aujourd’hui » l’écran d’arrivée et posait la bannière « premier jour » au-dessus de « À faire maintenant ». Q1 tranche Laura comme arrivée par défaut : la bannière vit donc ICI, au-dessus du fil, plutôt que sur `app/briefing`. Elle résume `app/welcome` (profil prêt, personnalisation) et disparaît après la première analyse — deux listes de « prochaines choses à faire » (dashboard et briefing) ne coexistent plus (loi 4), la troisième candidate (cette bannière) ne s’affiche qu’au premier jour.',
      source: 'apps/web/src/features/welcome/view/WelcomeScreen.tsx:78',
    },
  ],
}
