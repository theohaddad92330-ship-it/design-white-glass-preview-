import type { PageSpec } from '../../types'

/**
 * /missions/cra — les relevés d'activité, une CARTE par mission et par
 * consultant (jamais un tableau). « Attendu » n'est pas « manquant », et
 * « aucun relevé » n'est pas « zéro jour ».
 *
 * Lu dans : `apps/web/src/routes/missions/cra.tsx` → `TimesheetsPage.tsx`
 * (bandeau, mois, filtre « Ce qui bloque », bouton « Ouvrir les relevés
 * attendus », liste de cartes, tiroir de revue `TimesheetReviewDrawer`
 * par relevé). Textes de `apps/web/src/i18n/locales/fr/missions.json` (`cra`).
 */
export const missionsCraPage: PageSpec = {
  id: 'app/missions-cra',
  surface: 'app',
  domain: 'missions',
  route: 'apps/web/src/routes/missions/cra.tsx',
  title: 'Relevés d’activité',
  template: 'list',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      {
        // Le bandeau d'accès dégradé : l'écran marche sans messagerie, il ne
        // peut simplement pas préparer les relances — il le dit avant tout le
        // reste et n'empêche rien (`CapabilityBanner`).
        type: 'stack',
        direction: 'column',
        gap: '2',
        children: [
          {
            type: 'component',
            component: 'InfoBanner',
            props: {
              variant: 'warning',
              size: 'sm',
              content: {
                title: 'Une partie de cet écran est indisponible',
                description:
                  'Le reste fonctionne normalement : consulter les relevés, valider et corriger les écarts. Ce qui manque : ta messagerie.',
              },
            },
          },
          {
            type: 'component',
            component: 'Button',
            props: { variant: 'outline', size: 'sm', content: { label: 'Connecter ta messagerie' } },
          },
        ],
      },
      { type: 'text', text: 'Relevés d’activité', style: 'title' },
      {
        type: 'text',
        text: '« Attendu » n’est pas « manquant », et « aucun relevé » n’est pas « zéro jour ».',
        style: 'body',
        color: 'text/secondary',
      },
    ],
    filters: [
      {
        type: 'stack',
        direction: 'row',
        gap: '2',
        align: 'center',
        children: [
          {
            type: 'component',
            component: 'Select',
            props: { size: 'sm', content: { label: 'Mois', value: 'Septembre 2026' } },
          },
          { type: 'component', component: 'FilterChips', props: { size: 'sm', items: ['Ce qui bloque'] } },
          {
            type: 'component',
            component: 'FilterChips',
            props: { size: 'sm', items: ['Mission : Migration ERP S/4HANA'] },
          },
          {
            type: 'component',
            component: 'Button',
            props: { variant: 'outline', size: 'sm', content: { label: 'Ouvrir les relevés attendus' } },
          },
        ],
      },
    ],
    intro: [
      {
        type: 'text',
        text: '2 en attente · 1 validé',
        style: 'caption',
        color: 'text/muted',
      },
      {
        // Le compteur de jours déclarés du résumé : « aucun jour déclaré » et
        // « zéro jour travaillé » ne se corrigent pas de la même façon.
        type: 'text',
        text: '37 jours déclarés',
        style: 'caption',
        color: 'text/muted',
      },
      {
        type: 'stack',
        direction: 'row',
        gap: '2',
        children: [
          {
            type: 'component',
            component: 'Badge',
            props: { variant: 'secondary', content: { label: '1 relevé reçu' } },
          },
          {
            type: 'component',
            component: 'Badge',
            props: { variant: 'warning', content: { label: '1 relevé en retard' } },
          },
          {
            type: 'component',
            component: 'Badge',
            props: { variant: 'danger', content: { label: '1 écart non expliqué' } },
          },
          {
            // Un relevé escaladé a besoin d'un humain, pas d'une pastille
            // permanente à zéro : visible seulement s'il y en a un.
            type: 'component',
            component: 'Badge',
            props: { variant: 'warning', content: { label: '1 relevé escaladé' } },
          },
        ],
      },
    ],
    primary: [
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Mission exemple 1 — Compte exemple 1' } },
        children: [
          {
            type: 'stack',
            direction: 'row',
            gap: '2',
            children: [
              {
                type: 'component',
                component: 'Badge',
                props: { variant: 'outline', content: { label: '2 consultants sur cette mission ce mois' } },
              },
              {
                type: 'component',
                component: 'Badge',
                props: { variant: 'warning', content: { label: 'Pas encore prêt pour la facturation' } },
              },
            ],
          },
          {
            type: 'component',
            component: 'DataList',
            props: {},
            children: [
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Talent exemple 1', value: 'Attendu — aucun jour déclaré pour l’instant' } },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Prochaine action', value: 'Relancer pour dépôt' } },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Jours', value: '0 / 20 attendus' } },
              },
              {
                // Rappel AVANT l'échéance (le mois court encore, rien déposé) —
                // distinct du « en retard » du mois clos. Purement informatif :
                // aucun bouton, aucun rang de relance consommé.
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Rappel avant échéance', value: 'Le mois se termine dans 3 jours' } },
              },
            ],
          },
          {
            type: 'stack',
            direction: 'row',
            gap: '2',
            children: [
              {
                type: 'component',
                component: 'Button',
                props: { variant: 'outline', size: 'sm', content: { label: 'Ouvrir le dossier' } },
              },
              {
                type: 'component',
                component: 'Button',
                props: { variant: 'ghost', size: 'sm', content: { label: 'Préparer une relance' } },
              },
            ],
          },
          {
            type: 'text',
            text: 'Rien ne part tout seul : la relance se consigne ici, elle ne s’envoie pas depuis BellumAI.',
            style: 'caption',
            color: 'text/muted',
          },
        ],
      },
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Mission exemple 2 — Compte exemple 2' } },
        children: [
          {
            type: 'component',
            component: 'DataList',
            props: {},
            children: [
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Talent exemple 2', value: 'Validé' } },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Jours', value: '19 / 20 attendus' } },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Validé par le client le', value: '22/09/2026' } },
              },
              {
                // Celui qui a ENREGISTRÉ la validation client, jamais le
                // contact client lui-même.
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Enregistré par', value: 'Léa Petit' } },
              },
              {
                // Les relances déjà consignées avant la validation : le même
                // fait, la même phrase, qu'on regarde depuis la ligne ou
                // depuis le tiroir de revue.
                type: 'component',
                component: 'DataRow',
                props: {
                  content: { label: 'Relances envoyées', value: '2 relances envoyées, la dernière le 15/09/2026' },
                },
              },
            ],
          },
          {
            type: 'component',
            component: 'Button',
            props: { variant: 'outline', size: 'sm', content: { label: 'Ouvrir le dossier' } },
          },
        ],
      },
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Mission exemple 3 — Compte exemple 3' } },
        children: [
          {
            type: 'component',
            component: 'DataList',
            props: {},
            children: [
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Talent exemple 3', value: 'Rejeté' } },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Motif du rejet', value: 'Écart de 3 jours non expliqué' } },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Rejeté le', value: '20/09/2026, puis redéposé le 23/09/2026' } },
              },
            ],
          },
          {
            type: 'stack',
            direction: 'row',
            gap: '2',
            children: [
              {
                type: 'component',
                component: 'Button',
                props: { variant: 'outline', size: 'sm', content: { label: 'Ouvrir le dossier' } },
              },
              {
                type: 'component',
                component: 'Button',
                props: { variant: 'ghost', size: 'sm', content: { label: 'Expliquer l’écart' } },
              },
            ],
          },
        ],
      },
      {
        // Un relevé SOUMIS : « Déclaré par » (un ops peut déclarer un mois
        // pour un autre consultant) et « Revu en interne par » (une revue
        // séparée de la validation client), un écart et ses anomalies, et les
        // trois gestes de décision côte à côte — collapsed ici, cartes 5 et 6
        // montrent chacun de leurs deux formulaires OUVERTS EN PLACE.
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Mission exemple 4 — Compte exemple 4' } },
        children: [
          {
            type: 'component',
            component: 'DataList',
            props: {},
            children: [
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Talent exemple 4', value: 'Validé consultant' } },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Jours', value: '18 / 20 attendus' } },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Déclaré par', value: 'Léa Petit' } },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Revu en interne par', value: 'Marc Dubois' } },
              },
            ],
          },
          {
            type: 'stack',
            direction: 'row',
            gap: '2',
            align: 'center',
            children: [
              {
                // L'écart ne se masque JAMAIS derrière son explication : le
                // nombre reste visible, l'explication l'accompagne.
                type: 'component',
                component: 'Badge',
                props: { variant: 'warning', content: { label: '2 jours manquants' } },
              },
            ],
          },
          {
            type: 'stack',
            direction: 'column',
            gap: '1',
            children: [
              {
                type: 'text',
                text: 'Aussi affecté à « Migration cloud, Banque Exemple » sur ce mois : vérifie que les jours ne sont pas partagés.',
                style: 'caption',
                color: 'text/muted',
              },
              {
                type: 'text',
                text: 'Un autre relevé de ce mois est déjà validé (Talent exemple 2) : vérifie qu’il ne s’agit pas d’un doublon.',
                style: 'caption',
                color: 'text/muted',
              },
            ],
          },
          {
            type: 'stack',
            direction: 'row',
            gap: '2',
            children: [
              {
                type: 'component',
                component: 'Button',
                props: { variant: 'outline', size: 'sm', content: { label: 'Enregistrer la validation client' } },
              },
              {
                type: 'component',
                component: 'Button',
                props: { variant: 'outline', size: 'sm', content: { label: 'Rejeter le relevé' } },
              },
              {
                type: 'component',
                component: 'Button',
                props: { variant: 'outline', size: 'sm', content: { label: 'Marquer non applicable' } },
              },
            ],
          },
        ],
      },
      {
        // « Rejeter » OUVERT EN PLACE — jamais une modale (aucun `Dialog` ni
        // `Sheet` dans `TimesheetsPage.tsx`) : le motif, les jours contestés
        // et la deadline de correction sont tous les trois exigés par le
        // serveur, donc tous les trois désactivent la confirmation tant
        // qu'ils manquent.
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Mission exemple 5 — Compte exemple 5' } },
        children: [
          {
            type: 'component',
            component: 'DataList',
            props: {},
            children: [
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Talent exemple 5', value: 'Validé consultant' } },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Jours', value: '21 / 20 attendus' } },
              },
            ],
          },
          {
            type: 'stack',
            direction: 'column',
            gap: '2',
            padding: '3',
            radius: 'md',
            stroke: 'border/default',
            children: [
              { type: 'text', text: 'Rejeter ce relevé', style: 'label' },
              {
                type: 'text',
                text: 'Le relevé n’est pas supprimé : il est renvoyé à son auteur, qui pourra le corriger et le redéposer.',
                style: 'caption',
                color: 'text/muted',
              },
              {
                type: 'component',
                component: 'Input',
                props: {
                  content: {
                    label: 'Motif du rejet',
                    placeholder: 'Ce qui ne va pas (obligatoire) : jours imputés au mauvais mois…',
                  },
                },
              },
              {
                type: 'component',
                component: 'Input',
                props: {
                  content: {
                    label: 'Jours contestés (obligatoire)',
                    placeholder: 'Combien de jours posent problème',
                  },
                },
              },
              {
                type: 'component',
                component: 'Input',
                props: { content: { label: 'Deadline de correction (obligatoire)', value: '30/09/2026' } },
              },
              {
                type: 'stack',
                direction: 'row',
                gap: '2',
                children: [
                  {
                    type: 'component',
                    component: 'Button',
                    props: { variant: 'default', size: 'sm', content: { label: 'Rejeter' } },
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
        ],
      },
      {
        // « Marquer non applicable » OUVERT EN PLACE — une EXCEPTION TRACÉE,
        // motif obligatoire, proposée seulement là où le serveur l'accepterait
        // (frontière dérivée du contrat, jamais recopiée).
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Mission exemple 6 — Compte exemple 6' } },
        children: [
          {
            type: 'component',
            component: 'DataList',
            props: {},
            children: [
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Talent exemple 6', value: 'Attendu — aucun jour déclaré pour l’instant' } },
              },
            ],
          },
          {
            type: 'stack',
            direction: 'column',
            gap: '2',
            padding: '3',
            radius: 'md',
            stroke: 'border/default',
            children: [
              { type: 'text', text: 'Ce mois n’attend pas de relevé', style: 'label' },
              {
                type: 'text',
                text: 'L’exception prime sur le contrat pour ce mois seulement. Qui, quand et pourquoi restent tracés, et « Annuler l’exception » la retire.',
                style: 'caption',
                color: 'text/muted',
              },
              {
                type: 'component',
                component: 'Input',
                props: {
                  content: { label: 'Motif de l’exception', placeholder: 'Ex. : congé sans solde tout le mois' },
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
                    props: { variant: 'default', size: 'sm', content: { label: 'Confirmer l’exception' } },
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
        ],
      },
      {
        // La TRACE d'une exception déjà posée, et sa révocation — jamais un
        // effacement : « Annuler l'exception » RÉVOQUE, et la déduction du
        // contrat reprend.
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Mission exemple 7 — Compte exemple 7' } },
        children: [
          {
            type: 'component',
            component: 'DataList',
            props: {},
            children: [
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Talent exemple 7', value: 'Attendu — exception posée pour ce mois' } },
              },
            ],
          },
          {
            type: 'stack',
            direction: 'column',
            gap: '1',
            padding: '3',
            radius: 'md',
            fill: 'surface/2',
            children: [
              {
                type: 'text',
                text: 'Marqué non applicable le 12/09/2026 par Chef de projet exemple',
                style: 'caption',
                color: 'text/muted',
              },
              { type: 'text', text: 'Congé sans solde tout le mois', style: 'caption' },
              {
                type: 'component',
                component: 'Button',
                props: { variant: 'ghost', size: 'sm', content: { label: 'Annuler l’exception' } },
              },
            ],
          },
        ],
      },
      {
        // Le statut ESCALADÉ (#2196.24) : la troisième relance a écoulé la
        // cadence sans dépôt, le sujet a besoin d'un humain, pas d'une
        // quatrième relance.
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Mission exemple 8 — Compte exemple 8' } },
        children: [
          {
            type: 'component',
            component: 'DataList',
            props: {},
            children: [
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Talent exemple 8', value: 'Escaladé' } },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Prochaine action', value: 'Passer par un humain' } },
              },
            ],
          },
          {
            type: 'stack',
            direction: 'row',
            gap: '2',
            children: [
              {
                type: 'component',
                component: 'Badge',
                props: { variant: 'warning', content: { label: 'Escaladé' } },
              },
            ],
          },
          {
            type: 'component',
            component: 'Button',
            props: { variant: 'outline', size: 'sm', content: { label: 'Ouvrir le dossier' } },
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
            title: 'Aucune mission sur ce mois',
            description: 'Aucune mission ne couvre ce mois — ou aucune n’attend de relevé.',
            action: 'Ouvrir les missions',
          },
        },
      },
    ],
    // Second état vide, distinct dans le code (le filtre « Ce qui bloque »
    // masque toutes les lignes d'un mois qui EN A : titre « Aucun relevé ne
    // bloque ce mois », description « Le filtre « Ce qui bloque » masque les
    // N lignes du mois », action « Voir tous les relevés » qui défait le
    // filtre) — pas de second slot où le gabarit `list` pourrait le dessiner
    // à part ; voir uxNotes.
    loading: [{ type: 'component', component: 'Skeleton', props: { shape: 'table' } }],
    error: [
      {
        type: 'component',
        component: 'GenericProblemMessage',
        props: {
          content: {
            title: 'Les relevés n’ont pas pu être chargés',
            description: 'Réessaie dans un instant. Ce n’est pas « aucun relevé ».',
          },
        },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'ecart',
      text: 'Corrigé dans cette maquette : le vrai écran n’a AUCUNE case à cocher ni bouton de relance groupée (« CRA manquants », « Relancer la saisie/validation CRA ») — la version précédente les inventait, ils n’existent nulle part dans `TimesheetsPage.tsx`. La liste est faite de CARTES, jamais d’un tableau : chaque ligne porte trop d’état (badges, notes multi-lignes, 5+ boutons conditionnels, formulaires imbriqués) pour tenir dans des colonnes.',
      source: 'apps/web/src/features/missions/view/TimesheetsPage.tsx:264',
    },
    {
      kind: 'decision',
      text: 'Un second état vide existe, distinct du premier : quand le filtre « Ce qui bloque » masque toutes les lignes d’un mois qui EN A (contrairement au mois réellement sans mission), l’écran dit « Aucun relevé ne bloque ce mois » avec un bouton « Voir tous les relevés » qui défait le filtre — jamais le même message générique que « aucune mission sur ce mois ». Le gabarit `list` n’a qu’un seul slot `empty` (`catalog.ts`, pas d’`optionalStates` pour ce gabarit) : seul le premier est dessiné dans `states.empty`.',
      source: 'apps/web/src/features/missions/view/TimesheetsPage.tsx:236',
    },
    {
      kind: 'decision',
      text: 'Le tiroir de revue (`TimesheetReviewDrawer`, ouvert par « Ouvrir le dossier ») porte 6 blocs non repris ici pour la lisibilité de cette maquette : vérification automatique (3 tons, jamais vert sur « non vérifié »), détail des jours, pièces jointes (aucun fichier stocké — seulement des traces : date de validation, motif de rejet, relances envoyées), recommandation, et la barre de décision.',
      source: 'apps/web/src/features/missions/view/TimesheetReviewDrawer.tsx:26',
    },
    {
      kind: 'decision',
      text: 'Rien ne part tout seul : relancer un consultant se fait dans l’outil externe, puis se CONSIGNE ici — aucun message n’est envoyé par Bellum.',
      source: 'apps/web/src/i18n/locales/fr/missions.json:816',
    },
    {
      kind: 'decision',
      text: 'Un rejet ne supprime pas le relevé : il le renvoie à son auteur, qui le corrige et le redépose — la trace du rejet reste visible sur la ligne.',
      source: 'apps/web/src/i18n/locales/fr/missions.json:776',
    },
    {
      kind: 'decision',
      text: 'Responsive : sous 768 px, le filtre « Mois » et la puce « Ce qui bloque » passent à la ligne (`flex-wrap`) au-dessus de la liste de cartes, chacune pleine largeur — les mêmes cartes à 360 px et à 1920 px. Au-delà de 1920 (2560/3440) : aucun gain, les cartes s’étirent pleine largeur au lieu d’ouvrir un panneau de revue à côté de la liste.',
      source: 'apps/web/src/features/missions/view/TimesheetsPage.tsx:135',
    },
    {
      kind: 'decision',
      text: 'RUX-35 (`docs/revue-ux.md` §4, priorité haute) : ouvert depuis la chaîne de livraison d’un dossier de mission (`?mission=<id>`), cet écran arrive filtré, une pastille retirable « Mission : <nom> » dans la `FilterBar` — jamais la liste complète des relevés à retrier soi-même.',
      source: 'apps/web/src/features/missions/chain/missionChain.ts:129',
    },
  ],
}
