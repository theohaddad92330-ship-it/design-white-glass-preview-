import type { PageSpec } from '../../types'

/**
 * /projects/needs — « Besoins ouverts » : tous les rôles que les clients
 * cherchent en ce moment, l’écran d’entrée du recruteur. Cinq compteurs de
 * tête, filtres rapides partagés, vue liste ou kanban.
 *
 * Lu dans : `apps/web/src/routes/projects/needs.tsx` →
 * `OpenNeedsPage.tsx` (entête, bandeau de 5 tuiles, `NeedProposalsPanel`,
 * recherche + filtres rapides + tiroir, `OpenNeedsTable`/`NeedsKanban`).
 * Textes de `apps/web/src/i18n/locales/fr/projects.json`.
 */
export const projectsNeedsPage: PageSpec = {
  id: 'app/projects-needs',
  surface: 'app',
  domain: 'projects',
  route: 'apps/web/src/routes/projects/needs.tsx',
  title: 'Besoins ouverts',
  template: 'list',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'text', text: 'Les besoins à traiter, {{firstName}}.', style: 'title' },
      {
        type: 'text',
        text: 'Commence par ceux qui ont une échéance proche, aucun profil défendable ou une décision client en attente.',
        style: 'body',
        color: 'text/secondary',
      },
      {
        type: 'component',
        component: 'Button',
        props: { variant: 'link', content: { label: 'Demander à Laura de prioriser mes besoins' } },
      },
    ],
    actions: [
      {
        type: 'component',
        component: 'Button',
        props: { variant: 'default', size: 'sm', content: { label: 'Créer un besoin' } },
      },
    ],
    intro: [
      {
        type: 'grid',
        columns: 5,
        columnsMobile: 2,
        gap: '2',
        children: [
          {
            type: 'component',
            component: 'Gauge',
            props: { size: 'small', content: { label: 'Besoins ouverts', value: '14' } },
          },
          {
            type: 'component',
            component: 'Gauge',
            props: { size: 'small', content: { label: 'Matching à traiter', value: '5' } },
          },
          {
            type: 'component',
            component: 'Gauge',
            props: { size: 'small', content: { label: 'Présentations en cours', value: '3' } },
          },
          {
            type: 'component',
            component: 'Gauge',
            props: { size: 'small', content: { label: 'Sans profil positionné', value: '6' } },
          },
          {
            type: 'component',
            component: 'Gauge',
            props: { size: 'small', content: { label: 'CA potentiel (k€)', value: '312k' } },
          },
        ],
      },
      {
        type: 'text',
        text: 'Besoins ouverts et sans profil positionné portent sur tout le filtre ; matching et présentations sont mesurés sur les besoins affichés ; CA potentiel = 312 000 €, exclut 2 besoins sans TJM (plancher).',
        style: 'caption',
        color: 'text/muted',
      },
      {
        type: 'component',
        component: 'SectionCard',
        props: {
          content: {
            title: 'Un besoin proposé depuis un appel d’offres',
            description: 'Ce que le document dit, et ce qu’il ne dit pas. Rien n’existe tant que tu n’as pas confirmé.',
          },
        },
        children: [
          { type: 'text', text: 'Ce que le document dit', style: 'label' },
          {
            type: 'component',
            component: 'DataList',
            props: {},
            children: [
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Émetteur', value: 'Aeroval Systems' } },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Date limite de remise', value: '10/10/2026' } },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Lot', value: 'Infrastructure cloud' } },
              },
            ],
          },
          { type: 'text', text: 'Ce qu’il ne dit pas', style: 'label' },
          {
            type: 'component',
            component: 'Badge',
            props: { variant: 'outline', content: { label: 'Compétences non extraites — à saisir' } },
          },
          {
            type: 'component',
            component: 'Select',
            props: { size: 'sm', content: { placeholder: 'Rattacher à un projet…' } },
          },
          {
            type: 'stack',
            direction: 'row',
            gap: '2',
            children: [
              { type: 'component', component: 'Button', props: { size: 'sm', content: { label: 'Confirmer' } } },
              {
                type: 'component',
                component: 'Button',
                props: { variant: 'ghost', size: 'sm', content: { label: 'Annuler' } },
              },
            ],
          },
        ],
      },
      { type: 'text', text: 'Ce que l’analyse a repéré', style: 'heading' },
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: '2 propositions à trier' } },
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
                  content: { label: 'Ingénieur DevOps — Toulouse', value: 'Opportunité détectée · 05/09/2026' },
                },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Data engineer — Nantes', value: 'Opportunité détectée · 22/08/2026' } },
              },
            ],
          },
          {
            type: 'component',
            component: 'Button',
            props: { variant: 'link', size: 'sm', content: { label: 'Trier les propositions' } },
          },
        ],
      },
    ],
    filters: [
      {
        type: 'component',
        component: 'SearchInput',
        props: { size: 'sm', content: { placeholder: 'Rechercher un besoin, une compétence…' } },
      },
      {
        type: 'component',
        component: 'FilterChips',
        props: {
          size: 'sm',
          items: [
            'Sans profil positionné',
            'Démarre bientôt',
            'À qualifier',
            'Revue client',
            'Deadline dépassée',
            'Archivés',
          ],
        },
      },
      {
        type: 'component',
        component: 'Button',
        props: { variant: 'outline', size: 'sm', content: { label: 'Plus de filtres (2)' } },
      },
      { type: 'text', text: '14 besoins', style: 'caption', color: 'text/muted' },
      { type: 'component', component: 'ModeTabs', props: { items: ['Liste', 'Kanban'] } },
    ],
    bulk: [
      {
        type: 'stack',
        direction: 'row',
        gap: '2',
        align: 'center',
        justify: 'between',
        children: [
          { type: 'text', text: '2 besoins sélectionnés', style: 'caption', color: 'text/secondary' },
          {
            type: 'stack',
            direction: 'row',
            gap: '2',
            children: [
              {
                type: 'component',
                component: 'DropdownMenu',
                props: {
                  content: { trigger: 'Actions' },
                  items: [
                    'Attribuer à…',
                    'Changer l’urgence',
                    'Créer des actions…',
                    'Lancer les rapprochements',
                    'Mettre en veille…',
                    'Réactiver',
                    'Marquer perdu…',
                    'Marquer annulé…',
                    'Archiver',
                    'Désarchiver',
                  ],
                },
              },
              {
                type: 'component',
                component: 'Button',
                props: { variant: 'ghost', size: 'sm', content: { label: 'Tout désélectionner' } },
              },
            ],
          },
        ],
      },
    ],
    primary: [
      {
        type: 'grid',
        columns: 5,
        columnsMobile: 2,
        gap: '2',
        children: [
          {
            type: 'component',
            component: 'Gauge',
            props: { size: 'small', content: { label: 'ouverts', value: '14' } },
          },
          {
            type: 'component',
            component: 'Gauge',
            props: { size: 'small', content: { label: 'sans shortlist', value: '6' } },
          },
          {
            type: 'component',
            component: 'Gauge',
            props: { size: 'small', content: { label: 'échéance passée', value: '2' } },
          },
          {
            type: 'component',
            component: 'Gauge',
            props: { size: 'small', content: { label: 'démarrent sous 30 j', value: '3' } },
          },
          {
            type: 'component',
            component: 'Gauge',
            props: { size: 'small', content: { label: 'non staffables', value: '4' } },
          },
        ],
      },
      {
        type: 'component',
        component: 'Badge',
        props: { variant: 'warning', content: { label: '5 sans compétence typée' } },
      },
      {
        type: 'text',
        text: 'Sur ce filtre : « sans shortlist » et « échéance passée » sont aussi des filtres cliquables (la même pastille qu’au-dessus) ; « démarrent sous 30 j » et « non staffables » restent des chiffres. « Sans compétence typée » est mesuré sur tout l’espace, pas sur ce filtre — la même question que le cockpit, jamais recalculée ici.',
        style: 'caption',
        color: 'text/muted',
      },
      {
        type: 'component',
        component: 'Table',
        props: {
          table: {
            columns: [
              'Rôle',
              'Compétences obligatoires',
              'Séniorité',
              'Postes',
              'TJM cible',
              'Démarrage',
              'Durée',
              'Lieu',
              'Télétravail',
              'Contrat',
              'Compte · Entité',
              'Périmètre',
              'Origine',
              'Deadline',
              'Owner',
              'Phase',
              'Âge dans l’étape',
              'Shortlist',
              'Staffable',
              'Prochaine action',
              'Matching',
            ],
            rows: [
              [
                'Ingénieur DevOps',
                'Kubernetes, Terraform, Azure',
                'Confirmé',
                '1',
                '520 €',
                '15/10/2026',
                '6 mois',
                'Toulouse',
                '2 j/semaine',
                'Régie',
                'Compte exemple 1 · Aeroval Systems',
                'Modernisation infra cloud',
                'Offre d’emploi',
                '10/10/2026',
                'Léa Dupuis',
                'Matching en cours',
                '4 jours',
                '3',
                'oui',
                'Lancer le matching',
                'Lancer le matching',
              ],
              [
                'Data engineer',
                'Python, Airflow, Spark',
                'Senior',
                '2',
                '580 €',
                '01/11/2026',
                '12 mois',
                'Nantes',
                'Full remote',
                'Forfait',
                'Compte exemple 2 · Sans entité',
                'Sans projet',
                'Signal de recrutement',
                '25/10/2026',
                'aucun',
                'À qualifier',
                'aucun changement d’état enregistré',
                '0',
                'non — Remplir le vivier',
                'Qualifier le besoin',
                'Lancer le matching · Enregistrer un consultant',
              ],
              [
                'Chef de projet SI',
                'PMO, SAFe',
                'Confirmé',
                '1',
                'non communiqué',
                '05/10/2026',
                '9 mois',
                'Paris',
                '1 j/semaine',
                'Régie',
                'Compte exemple 3 · Sans entité',
                'Refonte SI ADV',
                'Saisi à la main',
                'dépassée de 3 jours',
                'Karim Haddad',
                'Shortlist prête',
                '11 jours',
                '2',
                'oui',
                'Présenter les profils au client',
                'Lancer le matching',
              ],
            ],
          },
        },
      },
    ],
    aside: [
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Vue Kanban — colonnes réelles' } },
        children: [
          {
            type: 'component',
            component: 'DataList',
            props: {},
            children: [
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'À qualifier', value: '3 · 44 000 €' } },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Qualifié', value: '2 · 28 000 €' } },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Matching à lancer', value: '1 · TJM non communiqué' } },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Matching en cours', value: '2 · 62 000 €' } },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Shortlist prête', value: '2 · 38 000 €' } },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Profil proposé', value: '1 · 22 000 €' } },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'En validation client', value: '1 · 30 000 €' } },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'En veille', value: '1 · 1 sans TJM, plancher' } },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'À réactiver', value: '1 · 15 000 €' } },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Ouvert (avant reprise)', value: '0' } },
              },
            ],
          },
        ],
      },
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Laura peut traiter ces besoins' } },
        children: [
          {
            type: 'component',
            component: 'DataList',
            props: {},
            children: [
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Matching suggéré', value: '5 besoins éligibles' } },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Besoins à réactiver', value: '1 besoin' } },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Besoins sans porteur', value: '1 besoin' } },
              },
            ],
          },
          {
            type: 'component',
            component: 'Button',
            props: { variant: 'link', size: 'sm', content: { label: 'Voir toutes les actions (7)' } },
          },
          {
            type: 'text',
            text: 'Taux de conversion du pipeline : non mesuré — aucun besoin gagné, perdu ou annulé sur ce filtre pour l’instant.',
            style: 'caption',
            color: 'text/muted',
          },
        ],
      },
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Plus de filtres' } },
        children: [
          {
            type: 'component',
            component: 'DataList',
            props: {},
            children: [
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Compétence', value: 'Kubernetes' } },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Séniorité', value: 'Confirmé' } },
              },
              { type: 'component', component: 'DataRow', props: { content: { label: 'Lieu', value: 'Toulouse' } } },
              { type: 'component', component: 'DataRow', props: { content: { label: 'Urgence', value: 'Haute' } } },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Statut', value: 'Matching en cours' } },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Type de contrat', value: 'Régie' } },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Origine', value: 'Offre d’emploi' } },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Démarre sous (jours)', value: '30' } },
              },
            ],
          },
          {
            type: 'component',
            component: 'Switch',
            props: { checked: 'on', content: { label: 'Sans shortlist' } },
          },
          {
            type: 'component',
            component: 'Switch',
            props: { checked: 'off', content: { label: 'Deadline dépassée' } },
          },
          {
            type: 'component',
            component: 'Switch',
            props: { checked: 'off', content: { label: 'Inclure les besoins clos' } },
          },
          { type: 'text', text: 'Mes vues', style: 'label', color: 'text/secondary' },
          {
            type: 'text',
            text: 'Aucune vue enregistrée. Pose des filtres, puis enregistre-les.',
            style: 'caption',
            color: 'text/muted',
          },
          {
            type: 'component',
            component: 'Button',
            props: { variant: 'outline', size: 'sm', content: { label: 'Enregistrer cette vue' } },
          },
          {
            type: 'text',
            text: 'Ce qui ne se filtre pas ici : tarif cible, durée, langues, habilitations, origine commerciale, canal, propriétaire, rayon autour d’une ville.',
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
                component: 'Button',
                props: { variant: 'ghost', size: 'sm', content: { label: 'Réinitialiser' } },
              },
              {
                type: 'component',
                component: 'Button',
                props: { variant: 'default', size: 'sm', content: { label: 'Appliquer (2)' } },
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
            title: 'Aucun besoin ouvert',
            description: 'Ils apparaîtront dès qu’un projet passe en besoin exprimé.',
          },
        },
      },
      {
        type: 'stack',
        direction: 'row',
        gap: '2',
        justify: 'center',
        children: [
          { type: 'component', component: 'Button', props: { content: { label: 'Ouvrir le pipe' } } },
          {
            type: 'component',
            component: 'Button',
            props: { variant: 'outline', content: { label: 'Importer des fiches de poste' } },
          },
        ],
      },
    ],
    // Second état vide, distinct dans le code (`emptyFiltered` : titre « Aucun besoin ne
    // correspond », description « Assouplis un filtre — la recherche porte sur le rôle, le
    // projet et la société », action « Retirer les filtres ») — pas de second slot où le
    // gabarit `list` pourrait le dessiner à part ; voir uxNotes.
    loading: [{ type: 'component', component: 'Skeleton', props: { shape: 'table' } }],
    error: [
      {
        type: 'component',
        component: 'EmptyState',
        props: {
          size: 'md',
          align: 'center',
          content: {
            title: 'Je n’ai pas pu charger les besoins.',
            description: 'Réessaie — tes filtres sont conservés.',
            action: 'Réessayer',
          },
        },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'ecart',
      text: 'Corrigé dans cette maquette : le bandeau ne portait que 4 tuiles sur 5 — « CA potentiel » manquait entièrement (visible seulement pour qui a le droit financier, jamais un « 0 € » pour les autres). La table réelle a 21 colonnes (checkbox et menu d’action en plus des 19 reprises ici) ; le menu « Actions » (barre de sélection ET kebab de ligne) porte 10 gestes réels, jamais un export — aucun geste groupé ne fait sortir de donnée de l’espace. `NeedProposalsPanel` (« ce que l’analyse a repéré »), la vue Kanban (10 colonnes réelles), le rail Laura et le tiroir « Plus de filtres » (9 critères) étaient absents.',
      source: 'apps/web/src/features/projects/open-needs/view/OpenNeedsPage.tsx:361',
    },
    {
      kind: 'decision',
      text: 'Deux états vides sont distincts dans le code (`empty` : jamais eu de besoin ; `emptyFiltered` : le filtre masque tout) avec des libellés et une action différents — le gabarit `list` n’a qu’un seul slot `empty`, donc seul le premier est dessiné ici.',
      source: 'apps/web/src/features/projects/open-needs/view/OpenNeedsPage.tsx:700',
    },
    {
      kind: 'decision',
      text: '« À traiter » n’est pas une pastille de filtre : c’est l’état PAR DÉFAUT de l’écran (les besoins ouverts, sans filtre) — une pastille qui ne filtrerait rien ferait chercher un effet qu’elle n’a pas.',
      source: 'apps/web/src/features/projects/open-needs/view/OpenNeedsPage.tsx:452',
    },
    {
      kind: 'decision',
      text: 'Le montant potentiel du pipe n’apparaît QUE pour qui a le droit financier — jamais un « CA potentiel » à 0 € pour les autres, qui se lirait comme un pipe vide. Les besoins sans TJM sont comptés À PART, jamais agrégés à zéro dans le total.',
      source: 'apps/web/src/features/projects/open-needs/view/OpenNeedsPage.tsx:389',
    },
    {
      kind: 'decision',
      text: 'Deux compteurs de tête sur cinq sont calculés sur la PAGE (matching, présentations) et deux sur le FILTRE entier (ouverts, sans shortlist) — et chacun le dit dans sa légende, pour ne pas faire lire un chiffre borné comme s’il portait le même périmètre que son voisin.',
      source: 'apps/web/src/features/projects/open-needs/view/OpenNeedsPage.tsx:368',
    },
    {
      kind: 'decision',
      text: 'Plus de barre de lentilles séparée ici (Pipe/Portefeuille/Besoins) : trouvé en recette live le 27/08/2026, l’écran en portait deux empilées à 50 px pour le même mot. Pipe et Besoins ouverts se rejoignent par l’onglet de section « Projets », qui les porte tous les deux.',
      source: 'apps/web/src/features/projects/open-needs/view/OpenNeedsPage.tsx:311',
    },
    {
      kind: 'decision',
      text: 'Responsive : le bandeau de compteurs est en 2 colonnes sous 640 px (`sm`), 3 colonnes de 640 à 1023 px, 5 colonnes à partir de 1024 px (`lg`) — la tablette (768-1194) voit donc 3 colonnes jusqu’à 1024 px puis 5. Au-delà de 1920 px (2560, 3440) : le bandeau reste à 5 colonnes (jamais une 6ᵉ tuile), et la table gagne des colonnes secondaires optionnelles (compte + compétence sur une ligne) plutôt que de s’étirer.',
      source: 'apps/web/src/features/projects/open-needs/view/OpenNeedsPage.tsx:362',
    },
    {
      kind: 'ecart',
      text: 'Ajouté à cette passe (audit-couverture-h.md) : la deuxième rangée de compteurs — cinq, dont deux réellement cliquables (« sans shortlist » et « échéance passée » reprennent la pastille du dessus ; « démarrent sous 30 j » et « non staffables » restent des chiffres) — et le `HygieneBadge` « sans compétence typée », posés juste au-dessus du tableau. Les colonnes « Périmètre » et « Matching » manquaient au tableau (21 colonnes réelles hors case à cocher et kebab, pas 19). Le bouton « Importer des fiches de poste » manquait au second état vide.',
      source: 'apps/web/src/features/projects/open-needs/view/OpenNeedsPage.tsx:577',
    },
    {
      kind: 'decision',
      text: '`NeedFromRfpPreview` (un appel d’offres transféré) est un panneau EN PLACE (`Box` bordée, pas un `Dialog`) : critères connus, inconnues nommées, rattachement à un projet et confirmation explicite entrent donc dans cette page. Le petit encart « Besoin créé » qui lui succède (`NeedFromRfpNextStep`) est un état transitoire du même panneau après confirmation, pas une section à part.',
      source: 'apps/web/src/features/projects/open-needs/view/NeedFromRfpPreview.tsx:45',
    },
    {
      kind: 'decision',
      text: '`NeedConsultantDoor` (la troisième porte) ouvre un vrai `Dialog` (`ConsultantFormDialog`) et `MatchDrawer` un vrai `Sheet` : les deux restent hors de cette spec, tenus par le registre des surcouches (`src/spec/overlays/`, déjà listés pour `app/projects-needs`). Le panneau « Untel est enregistré, je le compare ? » qui suit la fermeture de la porte n°3 est un état transitoire de cette même porte, jamais une section permanente de l’écran.',
      source: 'apps/web/src/features/projects/open-needs/view/NeedConsultantDoor.tsx:95',
    },
    {
      kind: 'decision',
      text: '`SavedNeedViews` (« Mes vues ») vit dans le MÊME tiroir que les champs de filtre ci-dessus (une vue enregistrée, un vide nommé, « Enregistrer cette vue ») : elle est donc représentée au même niveau que « Plus de filtres », plutôt qu’à part.',
      source: 'apps/web/src/features/projects/open-needs/view/SavedNeedViews.tsx:94',
    },
  ],
}
