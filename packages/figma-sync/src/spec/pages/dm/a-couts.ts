import type { PageSpec } from '../../types'

/**
 * `/couts` — coûts fournisseurs, « où part la facture » (#1661), réservé au
 * propriétaire. Trois blocs MESURABLES (fournisseur/jour, espace, action) et un
 * REFUSÉ (marge brute, ratio coût/MRR — D436 : le revenu est en euros, le
 * registre des coûts en dollars, Bellum ne convertit rien).
 *
 * Lu dans : `src/app/couts/page.tsx` (+ `couts.logic.ts` pour les bornages et
 * la lecture du pic).
 */
export const coutsPage: PageSpec = {
  id: 'dm/couts',
  surface: 'dm',
  domain: 'system',
  route: 'apps/dashboard-manager/src/app/couts/page.tsx',
  title: 'Coûts fournisseurs',
  template: 'dashboard',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Coûts fournisseurs', style: 'title' },
      {
        type: 'text',
        text: 'Ce que les fournisseurs nous coûtent, jour par jour, par espace et par action — en dollars, la devise du registre. C’est de la technique, pas du revenu : la marge brute et le ratio coût/MRR sont refusés ici, avec leur raison et ce qu’il faudrait pour les débloquer. Réservé au propriétaire.',
        style: 'body',
        color: 'text/secondary',
      },
    ],
    kpis: [
      {
        type: 'grid',
        columns: 4,
        columnsMobile: 2,
        gap: '4',
        children: [
          {
            type: 'component',
            component: 'Card',
            props: { content: { title: 'Coût tarifé' } },
            children: [
              { type: 'text', text: '1 240,50 $', style: 'display' },
              { type: 'text', text: '30 derniers jours', style: 'caption', color: 'text/muted' },
            ],
          },
          {
            type: 'component',
            component: 'Card',
            props: { content: { title: 'Appels facturés' } },
            children: [
              { type: 'text', text: '18 402', style: 'display' },
              { type: 'text', text: '30 jours', style: 'caption', color: 'text/muted' },
            ],
          },
          {
            type: 'component',
            component: 'Card',
            props: { content: { title: 'Lignes sans prix' } },
            children: [
              { type: 'text', text: '12', style: 'display' },
              { type: 'text', text: 'exclues du total, jamais comptées à 0 $', style: 'caption', color: 'text/muted' },
            ],
          },
          {
            type: 'component',
            component: 'Card',
            props: { content: { title: 'Pic quotidien' } },
            children: [
              { type: 'text', text: '84,20 $', style: 'display' },
              { type: 'text', text: 'vs médiane des 30 jours', style: 'caption', color: 'text/muted' },
            ],
          },
        ],
      },
    ],
    primary: [
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Ce que ces chiffres ne disent PAS' } },
        children: [
          {
            type: 'component',
            component: 'DataList',
            props: {},
            children: [
              {
                type: 'component',
                component: 'DataRow',
                props: {
                  content: {
                    label: 'C’est un plancher',
                    value: 'les lignes sans prix sont exclues, pas comptées gratuites',
                  },
                },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: {
                  content: {
                    label: 'Aucun coût fixe',
                    value: 'hébergement, observabilité, outillage interne non mesurés',
                  },
                },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: {
                  content: {
                    label: 'Environnements additionnés',
                    value: 'production et développement ne sont pas séparés ici',
                  },
                },
              },
            ],
          },
        ],
      },
      {
        type: 'component',
        component: 'Card',
        props: { content: { title: 'Coût par fournisseur, jour par jour' } },
        children: [
          {
            type: 'placeholder',
            kind: 'chart',
            label: 'Barres empilées : coût USD par fournisseur, 30 jours',
            height: 'md',
          },
          {
            type: 'text',
            text: 'Une journée en pointillés n’a aucune ligne tarifée : le registre n’a rien vu — ce n’est pas « rien dépensé ».',
            style: 'caption',
            color: 'text/muted',
          },
          {
            type: 'text',
            text: 'Les 4 fournisseurs les moins coûteux sont repliés sous « autres » plutôt qu’ignorés : la pile ne dessine qu’un nombre borné de séries, et des parts manquantes ne feraient plus le total de la journée.',
            style: 'caption',
            color: 'text/muted',
          },
        ],
      },
      {
        type: 'component',
        component: 'Card',
        props: { content: { title: 'Pic surveillé' } },
        children: [
          {
            type: 'text',
            text: '84,20 $ sur la journée, contre une médiane de 42,10 $ sur les 7 journées mesurées qui précèdent. Le seuil était à 63,15 $.',
            style: 'body',
            color: 'soft/danger/text',
          },
          {
            type: 'text',
            text: 'Le verdict porte sur la dernière journée COMPLÈTE : la journée en cours est incomplète par construction.',
            style: 'body',
          },
        ],
      },
    ],
    secondary: [
      {
        type: 'component',
        component: 'Card',
        props: { content: { title: 'Coût par espace de travail' } },
        children: [
          {
            type: 'text',
            text: 'Vingt espaces sur N — un top 20 présenté comme un total serait un mensonge dès le vingt-et-unième.',
            style: 'caption',
            color: 'text/muted',
          },
          {
            type: 'component',
            component: 'Table',
            props: {
              table: {
                columns: ['Espace', 'Appels', 'Unités', 'Coût tarifé', 'Lignes sans prix'],
                rows: [
                  ['Wavestone Consulting', '2 840', '3 120', '186,40 $', '2'],
                  ['Synaltic Group', '2 105', '2 340', '142,90 $', '0'],
                  ['Cassiopée Digital', '1 664', '1 810', '108,30 $', '1'],
                  ['Nextedia Conseil', '1 240', '1 390', '81,60 $', '0'],
                  ['Ekitia Systems', '980', '1 080', '64,20 $', '3'],
                  ['Arion Technologies', '742', '820', '47,10 $', '0'],
                ],
              },
            },
          },
        ],
      },
      {
        type: 'component',
        component: 'Card',
        props: { content: { title: 'Coût par action' } },
        children: [
          {
            type: 'component',
            component: 'Table',
            props: {
              table: {
                columns: ['Action', 'Appels', 'Unités', 'Coût tarifé', 'Lignes sans prix'],
                rows: [
                  ['Analyse de compte', '1 204', '1 340', '812,60 $', '4'],
                  ['Enrichissement de contacts', '4 890', '5 210', '246,80 $', '6'],
                  ['Plan de besoin', '312', '340', '98,40 $', '1'],
                  ['Copilote (Laura)', '9 620', '9 620', '82,70 $', '1'],
                ],
              },
            },
          },
          {
            type: 'text',
            text: 'Ce que cette liste ne contient pas, et pourquoi : Messages (comptés sous « Copilote » ou « Analyse de compte », jamais à part) et Vecteurs / embeddings (aucun appelant n’enregistre de coût sous cette famille).',
            style: 'caption',
            color: 'text/muted',
          },
        ],
      },
    ],
    aside: [
      {
        type: 'component',
        component: 'Card',
        props: { content: { title: 'Coût par opération' } },
        children: [
          {
            type: 'text',
            text: 'Le détail sous une action : un prompt de modèle (bellum_facts, bellum_chat…) ou un verbe fournisseur. C’est la seule colonne qui répond à « lequel des prompts d’une analyse porte la moitié de sa facture », donc la seule sur laquelle un routage de modèle se décide.',
            style: 'caption',
            color: 'text/muted',
          },
          {
            type: 'component',
            component: 'Table',
            props: {
              table: {
                columns: ['Opération', 'Appels', 'Unités', 'Coût tarifé', 'Lignes sans prix'],
                rows: [
                  ['bellum_facts', '2 480', '2 480', '412,90 $', '2'],
                  ['bellum_org_chart', '890', '890', '186,20 $', '0'],
                  ['bellum_signals', '1 120', '1 120', '164,50 $', '1'],
                  ['bellum_chat', '9 620', '9 620', '82,70 $', '1'],
                  ['bellum_enrich_contact', '4 890', '5 210', '246,80 $', '6'],
                  ['bellum_plan', '312', '340', '98,40 $', '1'],
                  ['bellum_message_draft', '1 402', '1 402', '58,30 $', '1'],
                ],
              },
            },
          },
        ],
      },
      {
        type: 'component',
        component: 'Card',
        props: { content: { title: 'Marge brute' } },
        children: [
          { type: 'text', text: 'non mesurable', style: 'display', color: 'text/muted' },
          {
            type: 'text',
            text: 'Le revenu est en euros, le registre des coûts en dollars : Bellum ne convertit rien (D436).',
            style: 'body',
          },
          {
            type: 'text',
            text: 'Ce qu’il faudrait pour le débloquer : une devise unique de part et d’autre de la division. Deux chemins possibles, et un seul est à choisir : soit provider_costs porte aussi un montant en euros figé au moment de la dépense (jamais recalculé ensuite), soit la grille des offres porte un prix déclaré en dollars. Tant que les deux registres parlent deux devises, la division n’a pas de sens — et un repère de marché n’a personne à comparer.',
            style: 'body',
          },
          {
            type: 'text',
            text: 'Le repère médian SaaS de 71-72 % (Blossom Street, T1 2025) n’est pas affiché en face d’un chiffre : sans marge mesurée, il n’aurait personne à comparer. Il reviendra le jour où la division aura un sens.',
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
        type: 'component',
        component: 'EmptyState',
        props: {
          size: 'md',
          align: 'center',
          content: {
            title: 'Aucune journée dans la fenêtre',
            description: 'La série apparaîtra dès que le registre aura vu passer une consommation.',
          },
        },
      },
    ],
    loading: [{ type: 'component', component: 'Skeleton', props: { shape: 'block' } }],
    error: [
      {
        type: 'component',
        component: 'GenericProblemMessage',
        props: { content: { title: 'Chiffres indisponibles', description: 'L’API n’a pas répondu.' } },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'decision',
      text: 'La marge brute et le ratio coût/MRR sont REFUSÉS, pas cachés : le bloc affiche « non mesurable » avec sa raison ET ce qu’il faudrait pour le débloquer (D436) — jamais un tiret muet, qui ferait chercher une panne, ni un taux de change inventé.',
      source: 'apps/dashboard-manager/src/app/couts/page.tsx:38',
    },
    {
      kind: 'decision',
      text: 'Le coût par espace est BORNÉ aux vingt plus coûteux, et l’écran le dit explicitement : un top 20 présenté comme un total serait un mensonge dès le 21ᵉ espace.',
      source: 'apps/dashboard-manager/src/app/couts/page.tsx:32',
    },
    {
      kind: 'decision',
      text: '« Aucune ligne sans prix » n’est jamais un « 0 $ » : une ligne sans tarif est EXCLUE du total, pas comptée gratuite — le total est explicitement qualifié de plancher.',
      source: 'apps/dashboard-manager/src/app/couts/page.tsx:180',
    },
    {
      kind: 'decision',
      text: 'Écran RÉSERVÉ au rôle propriétaire (`ECRANS_PROPRIETAIRE`) — pas rouvert à `operator` par ce lot, un arbitrage qui n’a pas été demandé.',
      source: 'apps/dashboard-manager/src/app/couts/page.tsx:48',
    },
    {
      kind: 'decision',
      text: 'Responsive : à 1280 la grille de 4 KPI passerait à 3 (le pic quotidien rejoindrait la ligne du dessous) et les tableaux « par espace »/« par action »/« par opération » masqueraient leur colonne « Lignes sans prix » (déjà résumée en badge dans les autres colonnes) ; contenu borné à 1600 px sur 1920, jamais étiré. Au-delà (2560, 3440) coût par espace et coût par action passeraient côte à côte au lieu d’empilés.',
      source: 'apps/dashboard-manager/src/app/couts/page.tsx:206',
    },
    {
      kind: 'ecart',
      text: '`gridTemplateColumns: repeat(4, minmax(0, 1fr))` est un style inline sans media query : à 1280 les 4 KPI se resserrent, ils ne passent jamais à 3 aujourd’hui.',
      source: 'apps/dashboard-manager/src/app/couts/page.tsx:206',
    },
  ],
}
