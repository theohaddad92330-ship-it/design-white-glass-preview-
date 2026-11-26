import type { PageSpec } from '../../types'

/**
 * `/health` — santé système : la grille des onze dépendances DU PRODUIT (#1660),
 * ce qui casse vu du client, le taux d'échec des analyses (24h), l'uptime et la
 * build, les files BullMQ, les interrupteurs coupés (D169), le coût par prompt,
 * l'état des sources externes. Distinct de `/dependances-manager` (dépendances
 * DE LA CONSOLE) et `/integrations` (connecteurs du client).
 *
 * Lu dans : `src/app/health/page.tsx` → `_components/dependency-grid.tsx`
 * (Sparkline par tuile), `client-facing-errors.tsx`, `kill-switch-panel.tsx`,
 * `cost-metrics-panel.tsx`, `source-health-panel.tsx`.
 */
export const healthPage: PageSpec = {
  id: 'dm/health',
  surface: 'dm',
  domain: 'system',
  route: 'apps/dashboard-manager/src/app/health/page.tsx',
  title: 'Santé système',
  template: 'dashboard',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      {
        type: 'stack',
        direction: 'row',
        gap: '2',
        align: 'center',
        children: [
          { type: 'text', text: 'Santé système', style: 'title' },
          { type: 'component', component: 'Badge', props: { variant: 'success', content: { label: 'opérationnel' } } },
        ],
      },
      {
        type: 'text',
        text: 'Les onze dépendances du produit et ce qui casse vu du client, puis les files BullMQ, le taux d’échec des analyses sur 24 h et l’identité de la build. Rafraîchi à chaque chargement.',
        style: 'body',
        color: 'text/secondary',
      },
    ],
    kpis: [
      {
        type: 'grid',
        columns: 3,
        columnsMobile: 1,
        gap: '4',
        children: [
          {
            type: 'component',
            component: 'Card',
            props: { content: { title: 'Taux d’échec (24 h)' } },
            children: [
              { type: 'text', text: '2,1 %', style: 'display' },
              { type: 'text', text: '4 / 190 runs', style: 'caption', color: 'text/muted' },
            ],
          },
          {
            type: 'component',
            component: 'Card',
            props: { content: { title: 'Uptime API' } },
            children: [{ type: 'text', text: '12j 4h', style: 'display' }],
          },
          {
            type: 'component',
            component: 'Card',
            props: { content: { title: 'Build' } },
            children: [
              { type: 'text', text: 'a1b2c3d4e5', style: 'mono' },
              { type: 'text', text: 'production', style: 'caption', color: 'text/muted' },
            ],
          },
        ],
      },
    ],
    primary: [
      {
        type: 'text',
        text: '0 en panne · 1 dégradée · 0 inconnue · 2 non branchées · 8 opérationnelles',
        style: 'caption',
        color: 'text/muted',
      },
      {
        type: 'grid',
        columns: 3,
        columnsMobile: 1,
        gap: '4',
        children: [
          {
            type: 'component',
            component: 'Card',
            props: { content: { title: 'API' } },
            children: [
              {
                type: 'component',
                component: 'Badge',
                props: { variant: 'success', content: { label: 'opérationnelle' } },
              },
              { type: 'placeholder', kind: 'chart', label: 'Sparkline latence médiane 24h', height: 'sm' },
              {
                type: 'text',
                text: 'disponibilité 7 j : 99,99 % · si elle tombe : tout le produit — plus aucune requête ne trouve de réponse',
                style: 'caption',
                color: 'text/muted',
              },
            ],
          },
          {
            type: 'component',
            component: 'Card',
            props: { content: { title: 'Worker d’analyse' } },
            children: [
              {
                type: 'component',
                component: 'Badge',
                props: { variant: 'success', content: { label: 'opérationnel' } },
              },
              { type: 'placeholder', kind: 'chart', label: 'Sparkline latence médiane 24h', height: 'sm' },
              {
                type: 'text',
                text: 'disponibilité 7 j : 99,94 % · si elle tombe : plus aucune analyse ne démarre ni ne se termine',
                style: 'caption',
                color: 'text/muted',
              },
            ],
          },
          {
            type: 'component',
            component: 'Card',
            props: { content: { title: 'Postgres' } },
            children: [
              {
                type: 'component',
                component: 'Badge',
                props: { variant: 'success', content: { label: 'opérationnelle' } },
              },
              { type: 'placeholder', kind: 'chart', label: 'Sparkline latence médiane 24h', height: 'sm' },
              {
                type: 'text',
                text: 'disponibilité 7 j : 100,00 % · si elle tombe : plus aucune lecture ni écriture, sur tout le produit',
                style: 'caption',
                color: 'text/muted',
              },
            ],
          },
          {
            type: 'component',
            component: 'Card',
            props: { content: { title: 'Redis' } },
            children: [
              {
                type: 'component',
                component: 'Badge',
                props: { variant: 'success', content: { label: 'opérationnel' } },
              },
              { type: 'placeholder', kind: 'chart', label: 'Sparkline latence médiane 24h', height: 'sm' },
              {
                type: 'text',
                text: 'disponibilité 7 j : 99,97 % · si il tombe : la file d’analyse, le temps réel et les verrous des passes planifiées',
                style: 'caption',
                color: 'text/muted',
              },
            ],
          },
          {
            type: 'component',
            component: 'Card',
            props: { content: { title: 'Supabase (authentification)' } },
            children: [
              { type: 'component', component: 'Badge', props: { variant: 'warning', content: { label: 'dégradée' } } },
              { type: 'placeholder', kind: 'chart', label: 'Sparkline latence médiane 24h', height: 'sm' },
              {
                type: 'text',
                text: 'disponibilité 7 j : 99,62 % · dernier incident : 09/09/2026 · si elle tombe : plus aucune connexion, nouvelle ou existante',
                style: 'caption',
                color: 'text/muted',
              },
            ],
          },
          {
            type: 'component',
            component: 'Card',
            props: { content: { title: 'Stripe' } },
            children: [
              {
                type: 'component',
                component: 'Badge',
                props: { variant: 'success', content: { label: 'opérationnel' } },
              },
              { type: 'placeholder', kind: 'chart', label: 'Sparkline latence médiane 24h', height: 'sm' },
              {
                type: 'text',
                text: 'disponibilité 7 j : 100,00 % · si il tombe : recharges de crédits et changements de plan',
                style: 'caption',
                color: 'text/muted',
              },
            ],
          },
          {
            type: 'component',
            component: 'Card',
            props: { content: { title: 'Claude' } },
            children: [
              {
                type: 'component',
                component: 'Badge',
                props: { variant: 'success', content: { label: 'opérationnel' } },
              },
              { type: 'text', text: 'mesurée à l’usage — pas de sonde dédiée', style: 'caption', color: 'text/muted' },
              {
                type: 'text',
                text: 'si il tombe : la rédaction, la classification et le plan d’action d’une analyse',
                style: 'caption',
                color: 'text/muted',
              },
            ],
          },
          {
            type: 'component',
            component: 'Card',
            props: { content: { title: 'Apollo' } },
            children: [
              {
                type: 'component',
                component: 'Badge',
                props: { variant: 'success', content: { label: 'opérationnel' } },
              },
              { type: 'text', text: 'mesurée à l’usage — pas de sonde dédiée', style: 'caption', color: 'text/muted' },
              {
                type: 'text',
                text: 'si il tombe : l’enrichissement des contacts',
                style: 'caption',
                color: 'text/muted',
              },
            ],
          },
          {
            type: 'component',
            component: 'Card',
            props: { content: { title: 'Firecrawl' } },
            children: [
              {
                type: 'component',
                component: 'Badge',
                props: { variant: 'outline', content: { label: 'non branchée' } },
              },
              { type: 'text', text: 'aucune clé posée sur cet environnement', style: 'caption', color: 'text/muted' },
              {
                type: 'text',
                text: 'si branchée puis coupée : le scraping de sites et de pages carrière',
                style: 'caption',
                color: 'text/muted',
              },
            ],
          },
          {
            type: 'component',
            component: 'Card',
            props: { content: { title: 'Pappers' } },
            children: [
              {
                type: 'component',
                component: 'Badge',
                props: { variant: 'success', content: { label: 'opérationnelle' } },
              },
              { type: 'text', text: 'mesurée à l’usage — pas de sonde dédiée', style: 'caption', color: 'text/muted' },
              {
                type: 'text',
                text: 'si elle tombe : fiche société, dirigeants, finances, filiales',
                style: 'caption',
                color: 'text/muted',
              },
            ],
          },
          {
            type: 'component',
            component: 'Card',
            props: { content: { title: 'Brave Search' } },
            children: [
              {
                type: 'component',
                component: 'Badge',
                props: { variant: 'outline', content: { label: 'non branchée' } },
              },
              { type: 'text', text: 'aucune clé posée sur cet environnement', style: 'caption', color: 'text/muted' },
              {
                type: 'text',
                text: 'si branchée puis coupée : actualités, signaux récents et veille',
                style: 'caption',
                color: 'text/muted',
              },
            ],
          },
        ],
      },
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Ce qui casse vu du client' } },
        children: [
          {
            type: 'component',
            component: 'Table',
            props: {
              table: {
                columns: ['Ce que le client essayait de faire', 'Espaces touchés', 'Dernière occurrence', 'Cause'],
                rows: [
                  ['Chercher un dirigeant chez Pappers', '4', '25/09/2026 09:12', 'l’outil n’a pas répondu'],
                  ['Résumer une analyse', '2', '24/09/2026 22:04', 'trop de demandes d’un coup'],
                  ['Envoyer un message préparé', '1', '24/09/2026 16:40', 'l’outil n’a pas répondu'],
                ],
              },
            },
          },
          {
            type: 'text',
            text: '7 erreurs de capacité écartées (Firecrawl et Brave Search non branchées ne comptent pas comme des pannes). Ce que ce tableau ne voit pas : un échec avalé côté client sans remontée, une lenteur perçue sous le seuil d’erreur, une capacité non branchée.',
            style: 'caption',
            color: 'text/muted',
          },
        ],
      },
    ],
    secondary: [
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Files d’attente (BullMQ)' } },
        children: [
          {
            type: 'component',
            component: 'Table',
            props: {
              table: {
                columns: ['Queue', 'En attente', 'Actifs', 'Terminés', 'Échoués', 'Différés', 'En pause'],
                rows: [
                  ['analysis', '3', '2', '1 204', '4', '0', '0'],
                  ['enrichment', '1', '1', '4 890', '6', '0', '0'],
                  ['messages', '0', '0', '9 620', '1', '0', '0'],
                  ['rag-index', '0', '0', '312', '0', '0', '0'],
                ],
              },
            },
          },
          {
            type: 'text',
            text: 'Snapshot à 25/09/2026 14:02. « Dégradé » = taux d’échec ≥ 20 % (sur ≥ 5 runs) ou backlog analysis (en attente + actifs) ≥ 100.',
            style: 'caption',
            color: 'text/muted',
          },
        ],
      },
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Capacités coupées' } },
        children: [
          {
            type: 'component',
            component: 'Badge',
            props: { variant: 'danger', content: { label: '1 coupée(s)' } },
          },
          {
            type: 'component',
            component: 'InfoBanner',
            props: {
              variant: 'danger',
              content: {
                title: '1 capacité(s) coupée(s) que les utilisateurs constatent',
                description: 'Veille Brave News. Leur écran continue de les annoncer disponibles.',
              },
            },
          },
          {
            type: 'component',
            component: 'InfoBanner',
            props: {
              variant: 'danger',
              content: {
                title: 'Le moteur d’analyse n’a pas répondu',
                description:
                  'L’état de ses capacités est inconnu, pas bon. Un service muet ne prouve pas que ce qu’il porte tourne.',
              },
            },
          },
          {
            type: 'component',
            component: 'Table',
            props: {
              table: {
                columns: ['Capacité', 'État', 'Service', 'Ce qui s’arrête', 'Qui le constate'],
                rows: [
                  ['Enrichissement Apollo', 'Active', 'Application', 'rien, capacité active', 'personne'],
                  [
                    'Veille Brave News',
                    'Coupée',
                    'Moteur d’analyse',
                    'La détection de signaux récents',
                    'Le client, en fin de dossier',
                  ],
                  ['Scraping Firecrawl', 'Active', 'Moteur d’analyse', 'rien, capacité active', 'personne'],
                  ['Export PDF', 'Active', 'Application', 'rien, capacité active', 'personne'],
                ],
              },
            },
          },
          {
            type: 'text',
            text: '3 active(s) · 1 coupée(s) · 0 inconnue(s) — mesuré le 25/09/2026 14:02.',
            style: 'caption',
            color: 'text/muted',
          },
        ],
      },
    ],
    aside: [
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Coût par prompt (hors analyse)' } },
        children: [
          {
            type: 'component',
            component: 'InfoBanner',
            props: {
              variant: 'danger',
              content: {
                title: '3 appel(s) sans tarif connu',
                description: 'Leur coût n’entre PAS dans le total affiché, qui le sous-compte d’autant.',
              },
            },
          },
          {
            type: 'component',
            component: 'Table',
            props: {
              table: {
                columns: [
                  'Prompt',
                  'Appels',
                  'Tokens entrée',
                  'Tokens sortie',
                  'Cache lu',
                  'Cache écrit',
                  'Coût',
                  'Modèle',
                  'Non tarifés',
                ],
                rows: [
                  [
                    'bellum_chat',
                    '9 620',
                    '4 812 400',
                    '1 926 800',
                    '2 104 600',
                    '318 200',
                    '82,70 $',
                    'claude-sonnet-5',
                    '0',
                  ],
                  ['discover', '640', '912 300', '284 100', '406 700', '52 900', '38,20 $', 'claude-sonnet-5', '0'],
                  ['battlecard', '210', '486 200', '166 400', '198 300', '24 100', '24,90 $', 'claude-sonnet-5', '2'],
                  ['weekly', '96', '204 100', '68 900', '84 200', '9 600', '11,40 $', 'claude-sonnet-5', '0'],
                  ['compare', '58', '118 400', '39 200', '46 800', '5 100', '6,80 $', 'claude-sonnet-5', '0'],
                  ['icebreaker', '312', '186 700', '61 300', '72 400', '8 800', '9,20 $', 'claude-haiku-4-5', '0'],
                  ['message', '1 402', '392 600', '128 900', '156 200', '18 400', '14,60 $', 'claude-sonnet-5', '1'],
                  ['summary', '780', '148 900', '48 600', '58 100', '6 700', '7,10 $', 'claude-haiku-4-5', '0'],
                  ['scorer', '2 020', '362 800', '119 400', '142 600', '16 900', '18,30 $', 'claude-sonnet-5', '0'],
                  ['activity', '440', '78 200', '25 600', '30 100', '3 400', '3,90 $', 'claude-haiku-4-5', '0'],
                ],
              },
            },
          },
          { type: 'text', text: 'Générations tronquées', style: 'heading' },
          {
            type: 'text',
            text: 'Le plafond de tokens de sortie a été atteint — un coût payé sans livrable utilisable.',
            style: 'caption',
            color: 'text/muted',
          },
          {
            type: 'component',
            component: 'Table',
            props: {
              table: {
                columns: ['Prompt', 'Événements', 'Tokens jetés', 'Coût jeté'],
                rows: [['battlecard', '2', '18 400', '0,3100 $']],
              },
            },
          },
          {
            type: 'text',
            text: 'Mesuré le 25/09/2026 14:02. Compteurs EN MÉMOIRE du process IA — remis à zéro à chaque redéploiement, non agrégés entre replicas : un ordre de grandeur lisible en direct, pas une comptabilité.',
            style: 'caption',
            color: 'text/muted',
          },
        ],
      },
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'État des sources externes' } },
        children: [
          {
            type: 'component',
            component: 'Table',
            props: {
              table: {
                columns: ['Source', 'État', 'En panne depuis', 'Cause', 'Runs dégradés', 'Dernier run OK'],
                rows: [
                  [
                    'pappers',
                    'OK',
                    'jamais tombée sur la fenêtre',
                    'aucune — source opérationnelle',
                    '0 / 84',
                    'il y a 12 min',
                  ],
                  [
                    'apollo_enrich',
                    'OK',
                    'jamais tombée sur la fenêtre',
                    'aucune — source opérationnelle',
                    '0 / 84',
                    'il y a 8 min',
                  ],
                  [
                    'firecrawl',
                    'Inconnu',
                    'sans objet — aucun run ne l’a sollicitée',
                    'sans objet — aucun run ne l’a sollicitée',
                    '0 / 0',
                    'jamais sur la fenêtre',
                  ],
                  [
                    'brave',
                    'Inconnu',
                    'sans objet — aucun run ne l’a sollicitée',
                    'sans objet — aucun run ne l’a sollicitée',
                    '0 / 0',
                    'jamais sur la fenêtre',
                  ],
                  [
                    'france_travail',
                    'Dégradée',
                    'au moins 3 h',
                    'clé API absente — quota mensuel non renouvelé',
                    '6 / 84',
                    'il y a 5 h',
                  ],
                ],
              },
            },
          },
          {
            type: 'text',
            text: '84 run(s) analysés — du 24/09/2026 14:02 au 25/09/2026 14:02. « HS » = tous les runs qui l’ont sollicitée ont échoué ; « Dégradée » = elle échoue en ce moment mais pas systématiquement ; « Inconnu » = source non branchée sur cet environnement, ou aucun run ne l’a sollicitée sur la fenêtre.',
            style: 'caption',
            color: 'text/muted',
          },
        ],
      },
    ],
  },
  states: {
    empty: [
      {
        type: 'text',
        text: 'État des dépendances inconnu — la route n’a pas répondu. Ce n’est pas « tout va bien » : c’est « on ne sait pas ce qui va ».',
        style: 'body',
        color: 'text/muted',
      },
    ],
    loading: [{ type: 'component', component: 'Skeleton', props: { shape: 'block' } }],
    error: [
      {
        type: 'component',
        component: 'GenericProblemMessage',
        props: {
          content: {
            title: 'Endpoint admin indisponible',
            description: 'Vérifie API_BASE_URL, INTERNAL_API_SECRET et que Redis est joignable.',
          },
        },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'ecart',
      text: 'TROUVÉ EN RECETTE LE 09/09/2026, pendant un incident réel : la pastille de tête disait « healthy » pendant que la grille juste en dessous affichait « 1 en panne · Supabase · incident en cours ». `health.status` décrit l’API elle-même, jamais les dépendances sondées du produit — deux questions, une seule pastille. Corrigé depuis (la pastille réutilise la même dérivation que la grille) ; la maquette montre l’état corrigé.',
      source: 'apps/dashboard-manager/src/app/health/page.tsx:133',
    },
    {
      kind: 'decision',
      text: '« Inconnu » n’est ni vert ni rouge et s’accompagne TOUJOURS de la date de dernière mesure ; une capacité non branchée affiche « non branchée », jamais « en panne » — trois états distincts, jamais fusionnés en un vert/rouge binaire.',
      source: 'apps/dashboard-manager/src/app/health/_components/dependency-grid.tsx:12',
    },
    {
      kind: 'decision',
      text: 'Une série de latence absente s’écrit en toutes lettres — dessiner une sparkline plate à la place se lirait comme une mesure, et ce serait un mensonge. Pas d’équivalent catalogue pour `Sparkline` : rendue en `placeholder` de type `chart`.',
      source: 'apps/dashboard-manager/src/app/health/_components/dependency-grid.tsx:17',
    },
    {
      kind: 'decision',
      text: 'Chaque bloc (dépendances, erreurs client, interrupteurs, coût par prompt, sources) se charge et échoue À PART : la panne de l’un rend « inconnu »/« indisponible », jamais un tableau vide qui se lirait « tout va bien » pour les autres.',
      source: 'apps/dashboard-manager/src/app/health/page.tsx:33',
    },
    {
      kind: 'decision',
      text: 'Le taux d’échec ne passe rouge que si la règle de dégradation est vraiment déclenchée (≥ 20 % ET ≥ 5 runs) : un taux de 100 % sur une seule exécution n’est pas statistiquement significatif et ne doit pas crier rouge à côté d’un verdict « opérationnel ».',
      source: 'apps/dashboard-manager/src/app/health/page.tsx:192',
    },
    {
      kind: 'decision',
      text: 'Responsive : la grille de dépendances utilise déjà `auto-fill`/`minmax(280px, 1fr)`, donc redistribue naturellement à 1280 ; la grille de 3 KPI (taux d’échec/uptime/build) reste à 3 (elle tient). Contenu borné à 1600 px sur 1920, jamais étiré. Au-delà (2560, 3440) la grille de dépendances afficherait plus de tuiles par ligne et les panneaux du bas (interrupteurs, coût, sources) passeraient côte à côte plutôt que d’étirer chacun.',
      source: 'apps/dashboard-manager/src/app/health/_components/dependency-grid.tsx:50',
    },
    {
      kind: 'ecart',
      text: 'Aucune règle `@media (min-width…)` n’existe dans le DM : au-delà de 1920, `.wrap` plafonne simplement à 1600 px — les panneaux du bas restent empilés verticalement comme à 1280, pas de bascule côte à côte mesurée aujourd’hui.',
      source: 'apps/dashboard-manager/src/app/globals.css:114',
    },
    {
      kind: 'ecart',
      text: 'Corrigé dans cette maquette : colonne « Cause » et libellé correct « Espaces touchés » (pas « Occurrences ») dans « Ce qui casse vu du client » ; les deux bandeaux d’alerte critiques (capacité coupée vue des utilisateurs, moteur d’analyse muet — montrés ensemble ici pour couvrir les deux, alors qu’ils sont normalement mutuellement indépendants) et la phrase de synthèse de « Capacités coupées » ; les 6 colonnes manquantes du tableau « Coût par prompt » (9 colonnes réelles) et le tableau conditionnel « Générations tronquées » ; « État des sources externes » modélisé en tableau à 6 colonnes (pas une liste label/valeur), sur le vocabulaire réel des sources (`pappers`, `apollo_enrich`, `firecrawl`, `brave`, `france_travail`…), distinct des dépendances de la grille du haut.',
      source: 'apps/dashboard-manager/src/app/health/_components/cost-metrics-panel.tsx:1',
    },
  ],
}
