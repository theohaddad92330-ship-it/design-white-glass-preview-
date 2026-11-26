import type { PageSpec } from '../../types'

/**
 * /missions/encaissements — ce qui a été facturé ailleurs et ce qui est
 * rentré : échéance, retard, litige, règlement. Bellum n'émet aucune facture.
 *
 * Lu dans : `apps/web/src/routes/missions/encaissements.tsx` →
 * `CollectionsPage.tsx` (bandeau, cinq compartiments, tableau, règlement,
 * litige). Textes de `apps/web/src/i18n/locales/fr/missions.json`
 * (`collections`).
 */
export const missionsEncaissementsPage: PageSpec = {
  id: 'app/missions-encaissements',
  surface: 'app',
  domain: 'missions',
  route: 'apps/web/src/routes/missions/encaissements.tsx',
  title: 'Encaissements',
  template: 'dashboard',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Encaissements', style: 'title' },
      {
        type: 'text',
        text: 'Bellum n’émet aucune facture. Cet écran suit ce qui a été facturé ailleurs et ce qui est rentré — l’échéance, le retard, le litige, le règlement.',
        style: 'body',
        color: 'text/secondary',
      },
      {
        type: 'text',
        text: 'Les 6 derniers mois. Une facture plus ancienne n’entre dans aucun de ces totaux.',
        style: 'caption',
        color: 'text/muted',
      },
    ],
    filters: [
      {
        type: 'component',
        component: 'FilterChips',
        props: { size: 'sm', items: ['Mission : Migration ERP S/4HANA'] },
      },
    ],
    kpis: [
      {
        type: 'stack',
        direction: 'row',
        gap: '2',
        children: [
          {
            type: 'component',
            component: 'InfoLine',
            props: { content: { label: 'Facturé', value: '39 700 € · dont 1 déclarée sans preuve du connecteur' } },
          },
          { type: 'component', component: 'InfoLine', props: { content: { label: 'Encaissé', value: '31 200 €' } } },
          {
            type: 'component',
            component: 'InfoLine',
            props: { content: { label: 'En attente', value: '6 900 € · 1 sans échéance saisie' } },
          },
          { type: 'component', component: 'InfoLine', props: { content: { label: 'En retard', value: '1 600 €' } } },
          { type: 'component', component: 'InfoLine', props: { content: { label: 'Contesté', value: '0 €' } } },
        ],
      },
    ],
    actions: [
      {
        type: 'component',
        component: 'Button',
        props: { variant: 'outline', size: 'sm', content: { label: 'Exporter' } },
      },
    ],
    primary: [
      {
        type: 'component',
        component: 'Table',
        props: {
          table: {
            columns: [
              'Client',
              'Interlocuteur',
              'Mission',
              'Mois',
              'Montant',
              'Échéance',
              'Statut',
              'Retard',
              'Relances',
              'Dernière action',
              'Prochaine action',
              'Gestes',
            ],
            rows: [
              [
                'Compte exemple 1',
                'Interlocuteur non renseigné',
                'Mission exemple 1',
                'Août 2026',
                '6 100 €',
                '15/09/2026',
                'Échue',
                '10 jours',
                '3',
                'Relance ferme envoyée le 20/09/2026',
                'Trois relances sans réponse — à remonter',
                'Marquer réglée · Ouvrir un litige · Consigner une relance',
              ],
              [
                'Compte exemple 2',
                'Marc Ollivier',
                'Mission exemple 2',
                'Juillet 2026',
                '18 400 €',
                '31/08/2026',
                'Réglée',
                'aucun',
                '0',
                'Règlement du 28/08/2026',
                'Rien à faire avant l’échéance',
                'Lever le litige · Consigner une relance',
              ],
              [
                'Compte exemple 3',
                'Sophie Nguyen',
                'Mission exemple 3',
                'Septembre 2026',
                '9 200 €',
                '05/10/2026',
                'À échoir',
                'aucun',
                '0',
                'Facture émise le 05/09/2026',
                'Rien à faire avant l’échéance',
                'Marquer réglée · Consigner une relance',
              ],
              [
                'Compte exemple 4',
                'Yasmine Belkacem',
                'Mission exemple 4',
                'Juin 2026',
                '12 000 € · Réglé : 8 000 € · Reste dû : 4 000 €',
                '31/07/2026',
                'Échue',
                '20 jours',
                '2',
                'Règlement du 15/08/2026',
                '2ᵉ relance due',
                'Marquer réglée · Ouvrir un litige · Consigner une relance',
              ],
            ],
          },
        },
      },
    ],
    secondary: [
      {
        type: 'text',
        text: 'Ouvertes depuis le menu Gestes d’une ligne, sous le tableau — malgré leur nom, ni l’une ni l’autre n’est une surcouche modale (voir uxNotes).',
        style: 'caption',
        color: 'text/muted',
      },
      {
        type: 'component',
        component: 'SectionCard',
        props: {
          content: {
            title: 'Déclarer un litige sur cette facture',
            description:
              'Un litige n’est pas un retard : les relances s’arrêtent, la ligne reste, et ce délai ne compte plus dans le délai de paiement moyen. Écris ce que le client conteste — sans motif, personne ne saura de quoi il s’agissait.',
          },
        },
        children: [
          {
            type: 'component',
            component: 'Input',
            props: {
              content: {
                label: 'Déclarer un litige sur cette facture',
                placeholder: 'Que conteste le client ? (obligatoire)',
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
                props: { variant: 'default', size: 'sm', content: { label: 'Enregistrer le litige' } },
              },
              {
                type: 'component',
                component: 'Button',
                props: { variant: 'ghost', size: 'sm', content: { label: 'Ne rien changer' } },
              },
            ],
          },
        ],
      },
      {
        type: 'component',
        component: 'SectionCard',
        props: {
          content: {
            title: 'Enregistrer un règlement',
            description:
              'Le montant est facultatif — laissé vide, le règlement est consigné sans montant mesuré, et rien ne sera deviné. Un montant inférieur au facturé laisse la facture dans la file de relance, avec son reste dû.',
          },
        },
        children: [
          {
            type: 'component',
            component: 'Input',
            props: { content: { label: 'Montant encaissé, en euros', placeholder: '5000' } },
          },
          {
            type: 'stack',
            direction: 'row',
            gap: '2',
            children: [
              {
                type: 'component',
                component: 'Button',
                props: { variant: 'default', size: 'sm', content: { label: 'Enregistrer le règlement' } },
              },
              {
                type: 'component',
                component: 'Button',
                props: { variant: 'ghost', size: 'sm', content: { label: 'Annuler' } },
              },
            ],
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
            title: 'Aucune facture émise sur cette fenêtre.',
            description:
              'Ce qui n’est pas encore facturé se répare sur l’écran de facturation, avec ses bloqueurs. Ici ne vivent que les mois marqués comme facturés ailleurs.',
          },
        },
      },
    ],
    loading: [{ type: 'component', component: 'Skeleton', props: { shape: 'table' } }],
    error: [
      {
        type: 'component',
        component: 'GenericProblemMessage',
        props: { content: { title: 'Les encaissements n’ont pas pu être chargés' } },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'ecart',
      text: 'Corrigé dans cette maquette : « Non rapproché » n’existe pas sur cet écran (il vit sur `/pilotage/finance`, une source séparée #2419.9) ; le premier compartiment réel, absent ici avant correction, est « Facturé » — agrégat non cliquable, avec sa note « déclarée sans preuve du connecteur » quand pertinent. Les quatre autres (Encaissé/En attente/En retard/Contesté) sont des puces de filtre cliquables (`aria-pressed`) qui ne changent jamais leurs propres compteurs, seulement les lignes visibles.',
      source: 'apps/web/src/features/missions/view/CollectionsPage.tsx:178',
    },
    {
      kind: 'decision',
      text: 'Exactement quatre statuts d’encaissement — réglée, à échoir, échue, en litige — jamais un cinquième « partiellement réglée » : le reste dû se nomme au lieu de créer un statut (doctrine, ratifie #2419.4).',
      source: 'apps/web/src/i18n/locales/fr/missions.json:960',
    },
    {
      kind: 'decision',
      text: 'Une facture « déclarée facturée » sans preuve du connecteur reste marquée « non confirmé » — jamais confondue avec une facture dont l’outil branché atteste l’envoi.',
      source: 'apps/web/src/i18n/locales/fr/missions.json:452',
    },
    {
      kind: 'decision',
      text: 'Responsive : les cinq compartiments passent de 1 colonne sous 768 px à 2 (tablette) puis 5 à partir de 1024 px (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-5`) ; le tableau à douze colonnes défile horizontalement dans son conteneur (GA-119), colonnes identiques à 360 px et 1920 px. Au-delà de 1920 (2560/3440) : aucun gain — le tableau s’étire, aucune colonne masquée à 360 px ne réapparaît à 2560 px puisqu’aucune n’est jamais masquée.',
      source: 'apps/web/src/features/missions/view/CollectionsPage.tsx:160',
    },
    {
      kind: 'ecart',
      text: 'Corrigé dans cette maquette : malgré son nom, `DisputeDialog` n’est pas une surcouche modale — un `Box` bordé affiché en clair sous le tableau (pas de `Dialog`/`Sheet`, aucun voile) quand une ligne ouvre « Ouvrir un litige ». Dessinée ici comme section de page (`secondary`), pas dans le registre des surcouches `src/spec/overlays/`.',
      source: 'apps/web/src/features/missions/view/CollectionsPage.tsx:727',
    },
    {
      kind: 'ecart',
      text: 'Corrigé dans cette maquette : même chose pour `PaymentDialog` (importé aussi par `/missions/facturation`, GA-26) — un `Box` bordé sous le tableau, pas une modale. Le montant reste facultatif : un champ vide consigne un règlement sans montant mesuré, jamais un montant deviné.',
      source: 'apps/web/src/features/missions/view/PaymentDialog.tsx:35',
    },
    {
      kind: 'ecart',
      text: 'Corrigé dans cette maquette : le geste « Consigner une relance » du menu Gestes est TOUJOURS présent, quel que soit le statut de la ligne — il manquait aux trois lignes d’exemple.',
      source: 'apps/web/src/features/missions/view/CollectionsPage.tsx:715',
    },
    {
      kind: 'decision',
      text: 'Corrigé dans cette maquette : une facture partiellement réglée (ligne 4) n’ajoute ni cinquième statut ni pourcentage — la cellule Montant nomme le facturé, « Réglé : … » quand il diffère, et « Reste dû : … » ; jamais 0 € à la place, qui se lirait « plus rien à réclamer ».',
      source: 'apps/web/src/features/missions/view/CollectionsPage.tsx:592',
    },
    {
      kind: 'decision',
      text: 'RUX-35 (`docs/revue-ux.md` §4, priorité haute) : ouvert depuis la chaîne de livraison d’un dossier de mission (`?mission=<id>`), cet écran arrive filtré, une pastille retirable « Mission : <nom> » dans la `FilterBar` — avant, la chaîne envoyait vers cet écran SANS filtre sur la mission, le code l’avouait lui-même (`missionChain.ts:129-134`).',
      source: 'apps/web/src/features/missions/chain/missionChain.ts:129',
    },
  ],
}
