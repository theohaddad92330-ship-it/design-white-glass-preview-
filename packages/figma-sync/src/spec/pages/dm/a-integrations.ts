import type { PageSpec } from '../../types'

/**
 * `/integrations` — registre des outils, vu opérateur (moitié cross-tenant de
 * Réglages › Intégrations côté app) : Catalogue (capacités, coût, débit,
 * rétention, configuré ou non), Par client (état réel par espace), Livraisons
 * (journal des webhooks avec sa trace technique complète — code HTTP,
 * tentative, erreur).
 *
 * Lu dans : `src/app/integrations/page.tsx` → `_components/catalogue-panel.tsx`,
 * `clients-panel.tsx`, `deliveries-panel.tsx`.
 */
export const integrationsPage: PageSpec = {
  id: 'dm/integrations',
  surface: 'dm',
  domain: 'produit',
  route: 'apps/dashboard-manager/src/app/integrations/page.tsx',
  title: 'Intégrations',
  template: 'admin-table',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Intégrations', style: 'title' },
      {
        type: 'text',
        text: 'Backoffice — registre des outils : capacités, coûts, limites de débit, rétention, et état réel par client.',
        style: 'body',
        color: 'text/secondary',
      },
    ],
    actions: [
      {
        type: 'component',
        component: 'TabNav',
        props: { variant: 'underline', items: ['Catalogue', 'Par client', 'Livraisons'] },
      },
    ],
    primary: [
      {
        type: 'grid',
        columns: 3,
        columnsMobile: 1,
        gap: '4',
        children: [
          {
            type: 'component',
            component: 'Card',
            props: { content: { title: 'Outils au catalogue' } },
            children: [{ type: 'text', text: '9', style: 'display' }],
          },
          {
            type: 'component',
            component: 'Card',
            props: { content: { title: 'Activables sur ce serveur' } },
            children: [{ type: 'text', text: '6', style: 'display' }],
          },
          {
            type: 'component',
            component: 'Card',
            props: { content: { title: 'Configuration manquante' } },
            children: [{ type: 'text', text: '3', style: 'display' }],
          },
        ],
      },
      {
        type: 'component',
        component: 'InfoBanner',
        props: {
          variant: 'warning',
          size: 'md',
          content: {
            title: 'Ce qu’il manque sur ce serveur',
            description: 'Apollo — clé API non posée · Attio — jeton OAuth non posé · Dropcontact — clé API non posée.',
          },
        },
      },
      { type: 'text', text: 'Catalogue', style: 'heading' },
      {
        type: 'component',
        component: 'Table',
        props: {
          table: {
            columns: ['Outil', 'État serveur', 'Actions', 'Données', 'Coût', 'Limites de débit', 'Rétention'],
            rows: [
              ['Pappers', 'Actif', 'Lire', 'Lit : identité légale, dirigeants', '0,20 € / requête', '5 req/s', '90 j'],
              ['Firecrawl', 'Actif', 'Lire', 'Lit : pages web publiques', '0,015 $ / page', '10 req/s', '30 j'],
              [
                'Brave Search',
                'Actif',
                'Lire',
                'Lit : résultats de recherche',
                '3 $ / 1000 requêtes',
                '20 req/s',
                '7 j',
              ],
              [
                'HubSpot',
                'Actif',
                'Lire, écrire',
                'Lit/écrit : contacts, deals',
                'Forfait client',
                '100 req/10 s',
                'Aucune (chez le client)',
              ],
              [
                'Apollo',
                'Non configuré',
                'Lire',
                'Lit : contacts, organigramme',
                '1 crédit / contact',
                '50 req/min',
                '90 j',
              ],
              [
                'Attio',
                'Non configuré',
                'Lire, écrire',
                'Lit/écrit : contacts, deals',
                'Forfait client',
                '100 req/10 s',
                'Aucune (chez le client)',
              ],
              [
                'Dropcontact',
                'Non configuré',
                'Lire',
                'Lit : e-mails vérifiés',
                '0,05 € / vérification',
                '10 req/s',
                '30 j',
              ],
            ],
          },
        },
      },
      {
        type: 'text',
        text: 'Vide : « Aucun outil au catalogue. »',
        style: 'caption',
        color: 'text/muted',
      },
      { type: 'text', text: 'Par client', style: 'heading' },
      {
        type: 'component',
        component: 'TabNav',
        props: { variant: 'pill', items: ['Thales', 'Société Générale', 'leboncoin', 'BlaBlaCar'] },
      },
      {
        type: 'grid',
        columns: 4,
        columnsMobile: 1,
        gap: '4',
        children: [
          {
            type: 'component',
            component: 'Card',
            props: { content: { title: 'Espace' } },
            children: [{ type: 'text', text: 'Thales', style: 'heading' }],
          },
          {
            type: 'component',
            component: 'Card',
            props: { content: { title: 'Membres' } },
            children: [{ type: 'text', text: '14', style: 'display' }],
          },
          {
            type: 'component',
            component: 'Card',
            props: { content: { title: 'Outils connectés' } },
            children: [{ type: 'text', text: '3', style: 'display' }],
          },
          {
            type: 'component',
            component: 'Card',
            props: { content: { title: 'Action requise' } },
            children: [{ type: 'text', text: '1', style: 'display' }],
          },
        ],
      },
      {
        type: 'component',
        component: 'Table',
        props: {
          table: {
            columns: ['Outil', 'État', 'Dernier usage', 'Périmètres', 'Données'],
            rows: [
              ['HubSpot', 'Connecté', '24/09/2026', '4', 'Lit : contacts / Écrit : deals'],
              ['Pappers', 'Connecté', '25/09/2026', '2', 'Lit : identité légale'],
              ['Apollo', 'Action requise', '02/09/2026', '3', 'Lit : contacts'],
              ['Attio', 'Disponible', 'Jamais utilisé', '0', 'Lit : contacts / Écrit : deals'],
              ['Slack (webhooks perso)', 'Connecté', '25/09/2026', '1', 'Écrit : notifications'],
            ],
          },
        },
      },
      {
        type: 'text',
        text: 'Vide : « Aucun espace de travail. »',
        style: 'caption',
        color: 'text/muted',
      },
      { type: 'text', text: 'Livraisons', style: 'heading' },
      {
        type: 'grid',
        columns: 2,
        columnsMobile: 1,
        gap: '4',
        children: [
          {
            type: 'component',
            component: 'Card',
            props: { content: { title: 'Livraisons affichées' } },
            children: [{ type: 'text', text: '5', style: 'display' }],
          },
          {
            type: 'component',
            component: 'Card',
            props: { content: { title: 'En échec' } },
            children: [{ type: 'text', text: '2', style: 'display' }],
          },
        ],
      },
      {
        type: 'component',
        component: 'Table',
        props: {
          table: {
            columns: ['Date', 'Fournisseur / client', 'Événement', 'Statut', 'Code HTTP', 'Tentative', 'Erreur'],
            rows: [
              ['25/09/2026 09:14', 'HubSpot · Thales', 'deal.updated', 'Livré', '200', '1', 'Aucune'],
              ['24/09/2026 18:02', 'Slack · BlaBlaCar', 'mission.signed', 'Livré', '200', '1', 'Aucune'],
              [
                '24/09/2026 11:47',
                'Attio · Société Générale',
                'contact.updated',
                'Échec',
                '403',
                '3',
                'jeton du webhook révoqué',
              ],
              ['23/09/2026 08:30', 'HubSpot · leboncoin', 'contact.created', 'En attente', 'en file', '0', 'Aucune'],
              [
                '22/09/2026 16:05',
                'Slack · Thales',
                'invoice.overdue',
                'Échec',
                'aucune réponse',
                '2',
                'connexion refusée',
              ],
            ],
          },
        },
      },
      {
        type: 'text',
        text: 'Seules les livraisons les plus récentes sont affichées — il y en a d’autres.',
        style: 'caption',
        color: 'text/muted',
      },
      {
        type: 'text',
        text: 'Vide : « Aucune livraison enregistrée pour cet espace. Les canaux d’équipe n’ont encore rien eu à transmettre. »',
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
        props: { size: 'md', align: 'center', content: { title: 'Aucun outil au registre' } },
      },
    ],
    loading: [{ type: 'component', component: 'Skeleton', props: { shape: 'table' } }],
    error: [
      {
        type: 'component',
        component: 'GenericProblemMessage',
        props: { content: { title: 'Registre des outils indisponible' } },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'decision',
      text: 'La vue « Par client » (colonnes Outil, État, Dernier usage, Périmètres, Données) et « Livraisons » (Date, Fournisseur/client, Événement, Statut, Code HTTP, Tentative, Erreur) sont deux tableaux séparés, pas des colonnes supplémentaires du catalogue : le catalogue répond « que sait faire cet outil », les deux autres « que se passe-t-il chez CE client ».',
      source: 'apps/dashboard-manager/src/app/integrations/_components/clients-panel.tsx:131',
    },
    {
      kind: 'decision',
      text: 'Le journal de livraison garde le code HTTP brut et le message d’erreur technique (nettoyé des URLs) — la version traduite (« Refusé par le canal ») reste côté écran utilisateur : un 403 dit ici que le jeton du webhook a été révoqué, ce qu’un libellé grand public n’apprendrait pas à qui doit réparer.',
      source: 'apps/dashboard-manager/src/app/integrations/_components/deliveries-panel.tsx:9',
    },
    {
      kind: 'decision',
      text: 'Un code HTTP absent n’est pas un « 0 » : la requête n’a jamais eu de réponse (DNS mort, connexion refusée) — diagnostic différent d’un `500`, affiché comme un tiret dédié, jamais une valeur inventée.',
      source: 'apps/dashboard-manager/src/app/integrations/_components/deliveries-panel.tsx:32',
    },
    {
      kind: 'decision',
      text: 'Responsive : à 1280 les colonnes Limites de débit et Rétention (secondaires pour l’action) se masquent en premier sur le Catalogue ; contenu borné à 1600 px sur 1920, jamais étiré. Au-delà (2560, 3440) le tableau gagnerait un panneau de détail par outil côte à côte plutôt que de s’étirer.',
      source: 'apps/dashboard-manager/src/app/integrations/_components/catalogue-panel.tsx:108',
    },
    {
      kind: 'ecart',
      text: 'Aucune règle `@media (min-width…)` n’existe dans le DM, et le tableau du catalogue (7 colonnes) n’a pas de conteneur `overflow-x` dédié visible dans ce fichier : à 1280 il compte sur `.wrap { overflow-x: auto }` (globals.css:133) pour défiler plutôt que de masquer une colonne.',
      source: 'apps/dashboard-manager/src/app/globals.css:133',
    },
  ],
}
