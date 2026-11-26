import type { PageSpec } from '../../types'

/**
 * `/analysis/[id]` — L'ÉCRAN LE PLUS DENSE DU BACK-OFFICE : le détail complet
 * d'une analyse (télémétrie IA), 18 sections lisant `raw_analysis`, dans un
 * ORDRE FIXE (entrelacé par thème pour la lecture d'un opérateur, verrouillé
 * par un test de snapshot — le réordonner change l'écran, `page.test.tsx` le
 * refuse). Ce fichier n'orchestre que l'ordre ; chaque section vit dans son
 * propre composant et rend `null` quand elle n'a rien à dire.
 *
 * Maquette d'un dossier fictif complet (Aeroval Systems, filiale de Delmas
 * Aéro Group) : les ~35 sous-sections réellement nommées à l'écran sont
 * reproduites une à une, dans l'ordre verrouillé par le snapshot — plus une
 * seule condensée en prose dans les `uxNotes`.
 *
 * Lu dans : `src/app/analysis/[id]/page.tsx` → les 18 `_components/Analysis*.tsx`
 * (+ `analysis-shared.tsx` pour l'enveloppe `<Section>` commune).
 */
export const analysisDetailPage: PageSpec = {
  id: 'dm/analysis-detail',
  surface: 'dm',
  domain: 'qualite',
  route: 'apps/dashboard-manager/src/app/analysis/[id]/page.tsx',
  title: 'Analyse — détail',
  template: 'detail',
  viewports: ['desktop', 'mobile'],
  slots: {
    header: [
      { type: 'component', component: 'Breadcrumb', props: { items: ['← retour'] } },
      { type: 'text', text: 'Aeroval Systems', style: 'title' },
    ],
    summary: [
      {
        type: 'stack',
        direction: 'row',
        gap: '2',
        children: [
          { type: 'component', component: 'Badge', props: { variant: 'success', content: { label: 'completed' } } },
          { type: 'component', component: 'Badge', props: { variant: 'secondary', content: { label: 'coût 0,40 $' } } },
          {
            type: 'component',
            component: 'Badge',
            props: { variant: 'secondary', content: { label: 'priorité 8/10' } },
          },
          {
            type: 'component',
            component: 'Badge',
            props: { variant: 'secondary', content: { label: 'confiance 75/100 (élevée)' } },
          },
          {
            type: 'component',
            component: 'Badge',
            props: { variant: 'warning', content: { label: 'plafonné qualité' } },
          },
          { type: 'component', component: 'Badge', props: { variant: 'success', content: { label: 'GO 19/25' } } },
          {
            type: 'component',
            component: 'Badge',
            props: { variant: 'warning', content: { label: 'qualité : à corriger (2)' } },
          },
          {
            type: 'component',
            component: 'Badge',
            props: { variant: 'secondary', content: { label: 'SIREN 812 345 678' } },
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
            props: { variant: 'success', content: { label: 'Technique 88/100' } },
          },
          {
            type: 'component',
            component: 'Badge',
            props: { variant: 'success', content: { label: 'Identité 95/100' } },
          },
          {
            type: 'component',
            component: 'Badge',
            props: { variant: 'success', content: { label: 'Sources 74/100' } },
          },
          {
            type: 'component',
            component: 'Badge',
            props: { variant: 'danger', content: { label: 'Commerciale 39/100' } },
          },
        ],
      },
      {
        type: 'text',
        text: 'Trois entités IT autonomes, un plan de modernisation annoncé, un cycle d’achat court. · fit offre 8 · accès 6 · urgence 7 · cycle 5',
        style: 'caption',
        color: 'text/muted',
      },
    ],
    primary: [
      {
        type: 'component',
        component: 'InfoBanner',
        props: {
          variant: 'danger',
          content: {
            title: '⚠ Identité légale incertaine',
            description:
              'Mode groupe web — les données registre (SIREN, effectif, secteur officiel) ne sont pas utilisées dans l’en-tête ni le scoring pour ce statut. SIREN écarté : 501 234 987. Raisons : nom trop générique pour lever l’homonymie · aucune correspondance Pappers exacte sur la raison sociale.',
          },
        },
      },
      { type: 'text', text: 'Score /25 — pourquoi', style: 'caption' },
      {
        type: 'text',
        text: 'Fit offre 4/5 · Accessibilité 4/5 · Urgence 4/5 · Cycle de vente 3/5 · Signaux collectés 4/5',
        style: 'caption',
        color: 'text/muted',
      },
      {
        type: 'component',
        component: 'InfoBanner',
        props: {
          variant: 'danger',
          content: {
            title: 'Échec de l’analyse — arrêt en phase classify',
            description:
              'Raison : timeout Claude après le budget de tokens alloué. Phases terminées : research · contacts · échec à : classify.',
          },
        },
      },
      { type: 'text', text: 'Fiche société — identité, secteur, effectif', style: 'heading' },
      {
        type: 'grid',
        columns: 4,
        columnsMobile: 2,
        gap: '4',
        children: [
          {
            type: 'component',
            component: 'Card',
            props: { content: { title: 'Secteur' } },
            children: [{ type: 'text', text: 'Aéronautique & défense', style: 'body' }],
          },
          {
            type: 'component',
            component: 'Card',
            props: { content: { title: 'Effectif' } },
            children: [{ type: 'text', text: '1 240 salariés', style: 'body' }],
          },
          {
            type: 'component',
            component: 'Card',
            props: { content: { title: 'Confiance globale' } },
            children: [
              { type: 'text', text: '75/100 (élevée)', style: 'body' },
              {
                type: 'text',
                text: 'Technique 88 · Identité 95 · Sources 74 · Commerciale 39',
                style: 'caption',
                color: 'text/muted',
              },
            ],
          },
          {
            type: 'component',
            component: 'Card',
            props: { content: { title: 'Filiales' } },
            children: [{ type: 'text', text: '4 filiales identifiées', style: 'body' }],
          },
        ],
      },
      { type: 'text', text: 'Cockpit décision — l’essentiel en 30 secondes', style: 'heading' },
      {
        type: 'component',
        component: 'DataList',
        props: {},
        children: [
          {
            type: 'component',
            component: 'DataRow',
            props: { content: { label: 'Positionnement', value: 'complément (groupe Delmas Aéro Group)' } },
          },
          {
            type: 'component',
            component: 'DataRow',
            props: {
              content: {
                label: '▶ Action immédiate',
                value: 'Contacter la DSI (Aeroval Systems) sur le programme de modernisation du SI de production',
              },
            },
          },
        ],
      },
      {
        type: 'text',
        text: 'Périmètres prioritaires — le plan attaque ces zones, pas « le groupe »',
        style: 'caption',
      },
      {
        type: 'component',
        component: 'FilterChips',
        props: {
          items: ['Aeroval Systems · P1 · entrée directe', 'Delmas Composites · P2 · influence à activer'],
        },
      },
      {
        type: 'text',
        text: 'Top offres — périmètre · signal · offre · contact · angle · action · preuve · risque (§5)',
        style: 'caption',
      },
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Aeroval Systems — modernisation du SI de production' } },
        children: [
          {
            type: 'stack',
            direction: 'row',
            gap: '2',
            children: [
              {
                type: 'component',
                component: 'Badge',
                props: { variant: 'warning', content: { label: 'action recadrée' } },
              },
              { type: 'component', component: 'Badge', props: { variant: 'outline', content: { label: 'P1' } } },
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
                props: { content: { label: 'Signal', value: 'Budget IT 2026 confirmé, +18 %' } },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Offre', value: 'Run applicatif + modernisation socle' } },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Contact', value: 'Julien Farge, DSI' } },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Angle', value: 'Renfort run applicatif pendant la modernisation' } },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: {
                  content: { label: '1re action', value: 'Message LinkedIn sur le programme de modernisation' },
                },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Preuve', value: 'Brave News, 12/09/2026' } },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Risque', value: 'Sopra Steria déjà en poste sur le legacy' } },
              },
            ],
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
            type: 'component',
            component: 'Badge',
            props: { variant: 'info', content: { label: 'à vérifier (règle 70 %)' } },
          },
          {
            type: 'text',
            text: 'Cycle d’achat court non confirmé par le client · Budget filiale arbitré sans validation groupe formalisée',
            style: 'caption',
            color: 'text/muted',
          },
        ],
      },
      { type: 'text', text: 'Logique Axians', style: 'caption' },
      {
        type: 'text',
        text: 'Aeroval Systems appartient au groupe Delmas Aéro Group (rattachement : filiale à 100 %). Le budget IT est arbitré au niveau groupe ; l’entrée par la filiale reste la plus rapide, la validation finale remonte à la DSI groupe.',
        style: 'body',
      },
      { type: 'text', text: 'Axes écartés', style: 'caption' },
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
                label: 'Cybersécurité — pas d’angle d’entrée mesuré',
                value: '→ réactiver si un incident de sécurité est publié sur le secteur',
              },
            },
          },
          {
            type: 'component',
            component: 'DataRow',
            props: {
              content: {
                label: 'Data & IA — trop tôt',
                value: '→ réactiver après la clôture du programme de modernisation SI',
              },
            },
          },
        ],
      },
      { type: 'text', text: 'Vocabulaire du groupe', style: 'caption' },
      {
        type: 'component',
        component: 'Table',
        props: {
          table: {
            columns: ['Terme', 'Type', 'Sens', 'Pourquoi (commercial)'],
            rows: [
              [
                'MOSAIC',
                'programme interne',
                'Programme de modernisation du socle applicatif de production',
                'Fil rouge de l’angle d’attaque principal',
              ],
              [
                'DSI Groupe',
                'entité',
                'Direction qui arbitre le budget IT des filiales',
                'Décideur final, au-dessus du contact d’entrée',
              ],
            ],
          },
        },
      },
      { type: 'text', text: 'Audit par phase — d’où viennent le coût, le temps et les infos', style: 'heading' },
      { type: 'placeholder', kind: 'chart', label: 'Barres : durée par phase', height: 'sm' },
      { type: 'placeholder', kind: 'chart', label: 'Barres : coût par phase', height: 'sm' },
      {
        type: 'component',
        component: 'Table',
        props: {
          table: {
            columns: ['Phase', 'Coût', 'Durée', 'Tokens in / out', 'Sources'],
            rows: [
              ['Collecte', '0,14 $', '48 s', '2 400 / 180', 'Pappers, Firecrawl, Brave Search'],
              ['Analyse', '0,18 $', '62 s', '9 800 / 1 200', 'raw_analysis (interne)'],
              ['Rédaction', '0,08 $', '24 s', '3 100 / 2 900', 'raw_analysis (interne)'],
            ],
          },
        },
      },
      { type: 'text', text: 'Déroulement — APIs appelées par phase', style: 'caption' },
      {
        type: 'component',
        component: 'DataList',
        props: {},
        children: [
          {
            type: 'component',
            component: 'DataRow',
            props: { content: { label: 'Pappers', value: 'succès — fiche société, dirigeants, finances' } },
          },
          {
            type: 'component',
            component: 'DataRow',
            props: { content: { label: 'Firecrawl', value: 'succès — site aeroval-systems.fr, 6 pages' } },
          },
          {
            type: 'component',
            component: 'DataRow',
            props: { content: { label: 'Brave Search', value: 'succès — 14 résultats retenus' } },
          },
          {
            type: 'component',
            component: 'DataRow',
            props: { content: { label: 'Claude', value: 'succès — synthèse et scoring' } },
          },
        ],
      },
      { type: 'text', text: 'Organigramme du groupe', style: 'heading' },
      {
        type: 'placeholder',
        kind: 'graph',
        label:
          'Organigramme du groupe : Delmas Aéro Group 🎯 P1 → Aeroval Systems 🎯 P1, Delmas Composites P2, Delmas MRO P3',
        height: 'lg',
      },
      {
        type: 'text',
        text: '🎯 = entité IT/digitale (cible n°1 ESN) · P1 attaque immédiate · P2 second temps · P3 longue traîne',
        style: 'caption',
        color: 'text/muted',
      },
      { type: 'text', text: 'Organigramme des contacts', style: 'caption' },
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
                label: 'C-Level / COMEX',
                value: 'Directeur des Systèmes d’Information · Directrice Industrielle',
              },
            },
          },
          {
            type: 'component',
            component: 'DataRow',
            props: {
              content: { label: 'Direction', value: 'Responsable Infrastructure · Responsable Applications métier' },
            },
          },
          {
            type: 'component',
            component: 'DataRow',
            props: { content: { label: 'Management', value: 'Chef de projet SI Production' } },
          },
        ],
      },
      { type: 'text', text: 'Contacts par entité', style: 'caption' },
      {
        type: 'text',
        text: '✓ décideur IT présent — Aeroval Systems compte 4 contacts identifiés.',
        style: 'caption',
        color: 'text/muted',
      },
      {
        type: 'component',
        component: 'Table',
        props: {
          table: {
            columns: ['Nom', 'Fonction', 'Email', 'Rôle décision', 'Qualification', 'Score'],
            rows: [
              [
                'Julien Farge',
                'Directeur des Systèmes d’Information',
                'julien.farge@aeroval-systems.fr',
                'Décideur technique',
                'À contacter maintenant',
                '86/100',
              ],
              [
                'Camille Vasseur',
                'Directrice Industrielle',
                'camille.vasseur@aeroval-systems.fr',
                'Décideur économique',
                'Sponsor',
                '74/100',
              ],
              [
                'Thibault Reyne',
                'Responsable Infrastructure',
                'thibault.reyne@aeroval-systems.fr',
                'Influenceur',
                'À enrichir',
                '58/100',
              ],
              [
                'Nora Kassim',
                'Chef de projet SI Production',
                'nora.kassim@aeroval-systems.fr',
                'Opérationnel',
                'À vérifier',
                '41/100',
              ],
            ],
          },
        },
      },
      { type: 'text', text: 'Fiche contact détaillée — Julien Farge', style: 'caption' },
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Julien Farge · Directeur des Systèmes d’Information' } },
        children: [
          {
            type: 'stack',
            direction: 'row',
            gap: '2',
            children: [
              { type: 'component', component: 'Badge', props: { variant: 'info', content: { label: 'PUBLIC' } } },
              {
                type: 'component',
                component: 'Badge',
                props: { variant: 'success', content: { label: 'Décideur technique' } },
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
                props: { content: { label: 'Provenance', value: 'Apollo, profil vérifié le 23/09/2026' } },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: {
                  content: {
                    label: 'Raison de priorité',
                    value: 'Décideur technique sur le programme MOSAIC, budget filiale confirmé',
                  },
                },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Téléphone', value: '+33 6 12 34 56 78' } },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'LinkedIn', value: 'linkedin.com/in/julien-farge' } },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: {
                  content: {
                    label: 'Détails Apollo',
                    value:
                      'séniorité : directeur · départements : IT, direction générale · fonctions : systèmes d’information · organisation : Aeroval Systems',
                  },
                },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: {
                  content: {
                    label: 'Résumé de profil',
                    value: 'DSI depuis 6 ans, pilote la refonte du socle applicatif de production (programme MOSAIC)',
                  },
                },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: {
                  content: {
                    label: 'Pourquoi ce contact',
                    value: 'Seul décideur technique identifié avec autorité directe sur le périmètre du lot MOSAIC',
                  },
                },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: {
                  content: {
                    label: '↗ Leviers',
                    value: 'Livrer MOSAIC dans les délais annoncés au conseil d’administration',
                  },
                },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: {
                  content: { label: '⚠ Peurs', value: 'Complexifier la gouvernance avec un second prestataire' },
                },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: {
                  content: {
                    label: 'Message prêt à envoyer',
                    value:
                      'Bonjour Julien, j’ai vu que MOSAIC avançait avec un budget confirmé pour 2026 — on accompagne plusieurs DSI de groupes industriels sur ce type de renfort applicatif pendant une modernisation. Un échange de 20 min cette semaine ?',
                  },
                },
              },
            ],
          },
        ],
      },
      { type: 'text', text: 'Société — fiche détaillée', style: 'heading' },
      {
        type: 'component',
        component: 'Table',
        props: {
          table: {
            columns: ['Champ', 'Valeur'],
            rows: [
              ['Activité', 'Équipementier aéronautique, systèmes embarqués et maintenance de flotte'],
              ['Chiffre d’affaires', '186 M€ (dernier exercice connu)'],
              ['Siège', 'Toulouse (31)'],
              ['Site web', 'aeroval-systems.fr'],
              ['Forme juridique', 'SAS'],
              ['Capital', '4 200 000 €'],
              ['Création', '1998'],
            ],
          },
        },
      },
      { type: 'text', text: 'Dirigeants & C-level', style: 'caption' },
      {
        type: 'component',
        component: 'DataList',
        props: {},
        children: [
          {
            type: 'component',
            component: 'DataRow',
            props: { content: { label: 'Dirigeants (mandataires)', value: 'Camille Vasseur — Présidente' } },
          },
          {
            type: 'component',
            component: 'DataRow',
            props: { content: { label: 'C-level', value: 'Julien Farge — DSI · Marc Oyono — Directeur Financier' } },
          },
        ],
      },
      { type: 'text', text: 'Finances — historique', style: 'caption' },
      {
        type: 'component',
        component: 'Table',
        props: {
          table: {
            columns: ['Exercice', 'CA', 'Résultat'],
            rows: [
              ['2025', '186 M€', '9,2 M€'],
              ['2024', '171 M€', '6,8 M€'],
              ['2023', '158 M€', '4,1 M€'],
            ],
          },
        },
      },
      { type: 'text', text: 'Les ESN concurrentes déjà présentes', style: 'caption' },
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
                label: 'Sopra Steria — ● présence confirmée',
                value: 'ESN connue (battlecard) · TJM 550-700 € · faiblesse exploitable : délais de staffing longs',
              },
            },
          },
          {
            type: 'component',
            component: 'DataRow',
            props: {
              content: {
                label: 'Capgemini — ○ présence probable',
                value: 'Indice : offre d’emploi ouverte côté client citant un intégrateur historique',
              },
            },
          },
          {
            type: 'component',
            component: 'DataRow',
            props: {
              content: {
                label: 'Sopra Steria — ⚔️ Concurrencer',
                value: 'Positionner le lot de modernisation en parallèle du run existant, sans reprise du legacy',
              },
            },
          },
          {
            type: 'component',
            component: 'DataRow',
            props: {
              content: {
                label: 'Sopra Steria — 🤝 Rang 2',
                value: 'Proposer un partenariat de sous-traitance sur les pics de charge si le lot principal est perdu',
              },
            },
          },
          {
            type: 'component',
            component: 'DataRow',
            props: {
              content: {
                label: 'Capgemini — ⚔️ Concurrencer',
                value: 'Mettre en avant la réactivité et l’ancrage local face à un intégrateur généraliste',
              },
            },
          },
        ],
      },
      { type: 'text', text: 'Concurrence & synergies ESN', style: 'caption' },
      {
        type: 'text',
        text: 'Concurrents : Sopra Steria, Capgemini, Devoteam. Synergies : le run applicatif actuel de Sopra Steria peut coexister avec un lot de modernisation confié en parallèle — pas besoin d’un remplacement complet pour entrer.',
        style: 'body',
      },
      { type: 'text', text: 'Grounding — provenance & fiabilité (fait / hypothèse)', style: 'heading' },
      {
        type: 'text',
        text: 'registre : complet · pages scrapées : 6/6 · dirigeants : 3/3 · contacts : 4/4',
        style: 'caption',
        color: 'text/muted',
      },
      {
        type: 'text',
        text: 'confiance 75/100 (élevée) · 📌 3 citations natives',
        style: 'caption',
        color: 'text/muted',
      },
      {
        type: 'component',
        component: 'DataList',
        props: {},
        children: [
          {
            type: 'component',
            component: 'DataRow',
            props: { content: { label: 'Effectif (1 240 salariés)', value: 'fait — sourcé Pappers, 25/09/2026' } },
          },
          {
            type: 'component',
            component: 'DataRow',
            props: {
              content: { label: 'Budget IT 2026 en hausse de 18 %', value: 'fait — sourcé Brave News, 12/09/2026' },
            },
          },
          {
            type: 'component',
            component: 'DataRow',
            props: {
              content: {
                label: 'Cycle d’achat court (moins de 3 mois)',
                value: 'hypothèse — déduite du volume d’offres d’emploi ouvertes',
              },
            },
          },
        ],
      },
      { type: 'text', text: 'Entités / zones de chasse', style: 'heading' },
      {
        type: 'text',
        text: 'P1 : 1 entité · P2 : 1 entité · P3 : 1 entité. Attaque immédiate : Aeroval Systems. Influence à activer : Delmas Composites. Quick win : Delmas Digital Lab. Longue traîne : Delmas MRO.',
        style: 'caption',
        color: 'text/muted',
      },
      {
        type: 'text',
        text: 'Matrice influence × accessibilité — attaque immédiate 1 · influence à activer 1 · quick win 1 · longue traîne 1',
        style: 'caption',
        color: 'text/muted',
      },
      {
        type: 'component',
        component: 'Table',
        props: {
          table: {
            columns: ['Entité', 'Type', 'Effectif', 'Zone', 'Accès', 'Cadence de recontact'],
            rows: [
              [
                'Aeroval Systems (🎯 entité IT) — à vendre : Run applicatif, Renfort DevOps · stack : SAP ERP, ServiceNow, Azure DevOps',
                'Filiale IT/digitale',
                '1 240 · IT autonomie élevée',
                'Attaque immédiate',
                'Direct — DSI identifiée',
                'Hebdomadaire',
              ],
              [
                'Delmas Composites — à vendre : Audit infrastructure · stack : SAP ERP',
                'Filiale industrielle',
                '480 · IT autonomie faible',
                'Influence à activer',
                'Indirect — via groupe',
                'Mensuelle',
              ],
              [
                'Delmas Digital Lab — à vendre : Renfort DevOps, atelier de cadrage express · stack : Azure DevOps, Salesforce',
                'Cellule innovation numérique',
                '18 · IT autonomie élevée',
                'Quick win',
                'Direct — responsable joignable',
                'Bimensuelle',
              ],
              [
                'Delmas MRO',
                'Filiale maintenance',
                '210 · IT autonomie non mesurée',
                'Longue traîne',
                'Aucun accès identifié',
                'Trimestrielle',
              ],
            ],
          },
        },
      },
      { type: 'text', text: 'Filiales opérationnelles', style: 'caption' },
      {
        type: 'component',
        component: 'Table',
        props: {
          table: {
            columns: ['Filiale', 'SIREN'],
            rows: [
              ['Aeroval Systems', '812 345 678'],
              ['Delmas Composites', '812 345 900'],
              ['Delmas MRO', '812 346 112'],
            ],
          },
        },
      },
      {
        type: 'text',
        text: '3 entités légales · 2 filtrées (SCI / holdings / GIE)',
        style: 'caption',
        color: 'text/muted',
      },
      { type: 'text', text: 'Sites France', style: 'caption' },
      {
        type: 'component',
        component: 'DataList',
        props: {},
        children: [
          {
            type: 'component',
            component: 'DataRow',
            props: { content: { label: 'Toulouse (31)', value: 'Siège — importance haute' } },
          },
          {
            type: 'component',
            component: 'DataRow',
            props: { content: { label: 'Blagnac (31)', value: 'Site industriel — importance haute' } },
          },
          {
            type: 'component',
            component: 'DataRow',
            props: { content: { label: 'Nantes (44)', value: 'Établissement — importance moyenne' } },
          },
        ],
      },
      { type: 'text', text: 'Registre & stack technique', style: 'heading' },
      {
        type: 'text',
        text: 'NAF 3316Z — Réparation et maintenance d’aéronefs. 6 établissements au registre.',
        style: 'caption',
        color: 'text/muted',
      },
      {
        type: 'component',
        component: 'Table',
        props: {
          table: {
            columns: ['Outil', 'Catégorie'],
            rows: [
              ['SAP ERP', 'Gestion intégrée'],
              ['ServiceNow', 'ITSM'],
              ['Azure DevOps', 'CI/CD'],
              ['Salesforce', 'CRM'],
            ],
          },
        },
      },
      { type: 'text', text: 'Signaux légaux — BODACC', style: 'caption' },
      {
        type: 'component',
        component: 'DataList',
        props: {},
        children: [
          {
            type: 'component',
            component: 'DataRow',
            props: { content: { label: '18/09/2026', value: 'Modification statutaire (Aeroval Systems)' } },
          },
          {
            type: 'component',
            component: 'DataRow',
            props: { content: { label: '02/06/2026', value: 'Nomination de dirigeant (Delmas Composites)' } },
          },
        ],
      },
      { type: 'text', text: 'Actualités — Brave News', style: 'caption' },
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
                label: 'Aeroval Systems annonce un budget IT en hausse de 18 % pour 2026',
                value: '12/09/2026',
              },
            },
          },
          {
            type: 'component',
            component: 'DataRow',
            props: {
              content: { label: 'Delmas Aéro Group signe un contrat de maintenance long terme', value: '28/07/2026' },
            },
          },
        ],
      },
      { type: 'text', text: 'Offres IT — France Travail', style: 'caption' },
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
                label: 'Chef de projet SI Production — Toulouse',
                value: 'publiée le 05/09/2026 · SAP, ServiceNow',
              },
            },
          },
          {
            type: 'component',
            component: 'DataRow',
            props: {
              content: {
                label: 'Ingénieur DevOps — Blagnac',
                value: 'publiée le 22/08/2026 · Azure DevOps, Kubernetes',
              },
            },
          },
        ],
      },
      { type: 'text', text: 'Bénéficiaires effectifs — INPI', style: 'caption' },
      {
        type: 'component',
        component: 'DataList',
        props: {},
        children: [
          {
            type: 'component',
            component: 'DataRow',
            props: { content: { label: 'Camille Vasseur', value: '62 % de détention' } },
          },
          {
            type: 'component',
            component: 'DataRow',
            props: { content: { label: 'Delmas Aéro Group (holding)', value: '38 % de détention' } },
          },
        ],
      },
      { type: 'text', text: 'Programmes', style: 'heading' },
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
                label: 'MOSAIC',
                value: 'Modernisation du socle applicatif de production, budget confirmé 2026',
              },
            },
          },
        ],
      },
      { type: 'text', text: 'Angles d’attaque', style: 'caption' },
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: '★ Renfort run applicatif pendant la modernisation' } },
        children: [
          {
            type: 'text',
            text: 'Entrer par le run applicatif pendant que le socle est modernisé, sans toucher au périmètre déjà tenu par Sopra Steria — l’angle le moins conflictuel pour un premier contrat.',
            style: 'caption',
            color: 'text/muted',
          },
          {
            type: 'component',
            component: 'DataList',
            props: {},
            children: [
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Offre', value: 'Run applicatif + modernisation socle' } },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Deal estimé', value: '480 000 € / an' } },
              },
              {
                type: 'component',
                component: 'DataRow',
                props: { content: { label: 'Contact d’entrée', value: 'Julien Farge, DSI' } },
              },
            ],
          },
        ],
      },
      { type: 'text', text: 'Stack & opportunités ESN', style: 'caption' },
      {
        type: 'component',
        component: 'Table',
        props: {
          table: {
            columns: ['Technologie', 'Maturité', 'Opportunité'],
            rows: [
              ['SAP ERP', 'établie', 'TMA et montée de version'],
              ['Azure DevOps', 'en croissance', 'renfort DevOps pour le programme MOSAIC'],
            ],
          },
        },
      },
      { type: 'text', text: 'Hypothèses qualifiées', style: 'caption' },
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Le programme MOSAIC inclut un volet cybersécurité — probable' } },
        children: [
          {
            type: 'text',
            text: 'angle ESN : proposer un audit de sécurité en amont du lot applicatif',
            style: 'caption',
            color: 'text/muted',
          },
          {
            type: 'text',
            text: 'fondé sur : les offres d’emploi ouvertes citent des exigences de conformité IT01',
            style: 'caption',
            color: 'text/muted',
          },
        ],
      },
      { type: 'text', text: 'Signaux & budget', style: 'caption' },
      {
        type: 'component',
        component: 'DataList',
        props: {},
        children: [
          {
            type: 'component',
            component: 'DataRow',
            props: {
              content: { label: '💶 Budget IT 2026', value: '+18 % vs 2025, confirmé en conseil d’administration' },
            },
          },
          {
            type: 'component',
            component: 'DataRow',
            props: { content: { label: 'Recrutements récents', value: '3 postes IT ouverts sur 60 jours' } },
          },
        ],
      },
      { type: 'text', text: 'Pains & défis IT', style: 'caption' },
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
                label: 'Socle applicatif vieillissant',
                value: 'urgence haute — cité dans deux offres d’emploi',
              },
            },
          },
          {
            type: 'component',
            component: 'DataRow',
            props: {
              content: {
                label: 'Dépendance à un intégrateur unique',
                value: 'urgence moyenne — non confirmée par le client',
              },
            },
          },
        ],
      },
      { type: 'text', text: 'Preuves · faits sourcés', style: 'heading' },
      {
        type: 'component',
        component: 'Table',
        props: {
          table: {
            columns: ['Fait', 'Source'],
            rows: [
              ['Effectif de 1 240 salariés', 'Pappers, fiche société, 25/09/2026'],
              ['Budget IT 2026 en hausse de 18 %', 'Brave News, 12/09/2026'],
              ['Chef de projet SI Production recruté', 'France Travail, offre du 05/09/2026'],
            ],
          },
        },
      },
      { type: 'text', text: 'Feuille de route 30j par zone', style: 'heading' },
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: 'Aeroval Systems ↓ top-down' } },
        children: [
          { type: 'text', text: 'Deadline : sous 15 jours', style: 'caption', color: 'text/muted' },
          { type: 'text', text: 'prochaine action : message LinkedIn au DSI sur le programme MOSAIC', style: 'body' },
          {
            type: 'text',
            text: 'contact : Julien Farge · offre : run applicatif + modernisation socle',
            style: 'caption',
            color: 'text/muted',
          },
        ],
      },
      { type: 'text', text: 'Plan d’action', style: 'caption' },
      {
        type: 'component',
        component: 'DataList',
        props: {},
        children: [
          {
            type: 'component',
            component: 'DataRow',
            props: { content: { label: 'Semaine 1', value: 'Contacter Julien Farge (DSI) via LinkedIn' } },
          },
          {
            type: 'component',
            component: 'DataRow',
            props: { content: { label: 'Semaine 2', value: 'Proposer un atelier de cadrage sur MOSAIC' } },
          },
          {
            type: 'component',
            component: 'DataRow',
            props: { content: { label: 'Offres à proposer', value: 'Run applicatif, renfort DevOps, audit sécurité' } },
          },
          {
            type: 'component',
            component: 'DataRow',
            props: { content: { label: 'Quick wins', value: 'Audit de sécurité en amont du lot applicatif' } },
          },
          {
            type: 'component',
            component: 'DataRow',
            props: {
              content: {
                label: 'Si pas de réponse',
                value: 'Relance à J+7 via un second contact (Camille Vasseur) puis appel direct à J+14',
              },
            },
          },
          {
            type: 'component',
            component: 'DataRow',
            props: {
              content: {
                label: 'Évaluation',
                value: 'Revoir la qualification sous 30 jours si aucun rendez-vous obtenu',
              },
            },
          },
          {
            type: 'component',
            component: 'DataRow',
            props: {
              content: {
                label: 'Stratégie concurrentielle',
                value:
                  'Ne pas attaquer le run existant de Sopra Steria — se positionner uniquement sur le lot de modernisation',
              },
            },
          },
        ],
      },
      { type: 'text', text: 'Sources consultées', style: 'heading' },
      {
        type: 'component',
        component: 'Table',
        props: {
          table: {
            columns: ['Source', 'Date'],
            rows: [
              ['Pappers — fiche société', '25/09/2026'],
              ['aeroval-systems.fr — page carrières', '25/09/2026'],
              ['Brave News — 3 articles retenus', '25/09/2026'],
              ['France Travail — 2 offres retenues', '25/09/2026'],
            ],
          },
        },
      },
      { type: 'text', text: 'Graphe de décision (phase 3)', style: 'heading' },
      { type: 'placeholder', kind: 'graph', label: 'Graphe de décision — acteurs et influence', height: 'lg' },
      { type: 'text', text: 'Chaîne de décision', style: 'caption' },
      {
        type: 'text',
        text: 'Cycle estimé : 2 à 3 mois. Autorité budget : DSI Groupe. Étapes : (1) Julien Farge qualifie le besoin, (2) Camille Vasseur arbitre le budget filiale, (3) DSI Groupe valide.',
        style: 'body',
      },
      { type: 'text', text: 'Ordre d’approche (séquence sandwich)', style: 'caption' },
      {
        type: 'component',
        component: 'DataList',
        props: {},
        children: [
          {
            type: 'component',
            component: 'DataRow',
            props: { content: { label: '1', value: 'Julien Farge (DSI) — qualifie le besoin technique' } },
          },
          {
            type: 'component',
            component: 'DataRow',
            props: { content: { label: '2', value: 'Camille Vasseur (Présidente) — sponsor budgétaire' } },
          },
          {
            type: 'component',
            component: 'DataRow',
            props: { content: { label: '3', value: 'Retour vers Julien Farge — cadrage du lot' } },
          },
        ],
      },
      { type: 'text', text: 'Carte des parties prenantes', style: 'caption' },
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
                label: 'Julien Farge — advocate',
                value: 'porteur du besoin, motivé par le calendrier du programme',
              },
            },
          },
          {
            type: 'component',
            component: 'DataRow',
            props: { content: { label: 'Marc Oyono — unknown', value: 'directeur financier, position non mesurée' } },
          },
        ],
      },
      { type: 'text', text: 'Zones blanches (1) — où vous n’avez personne', style: 'caption' },
      {
        type: 'component',
        component: 'DataList',
        props: {},
        children: [
          {
            type: 'component',
            component: 'DataRow',
            props: { content: { label: 'Delmas MRO', value: 'aucun contact identifié à ce jour' } },
          },
        ],
      },
      { type: 'text', text: 'Sales enablement — deliverables BELLUM-STRATEGY', style: 'heading' },
      {
        type: 'text',
        text: 'Comment ouvrir le compte : entrer par le programme MOSAIC, cité publiquement, plutôt que par un contact générique.',
        style: 'body',
      },
      { type: 'text', text: 'Script RDV', style: 'caption' },
      {
        type: 'component',
        component: 'DataList',
        props: {},
        children: [
          {
            type: 'component',
            component: 'DataRow',
            props: { content: { label: 'Ouverture', value: 'Référence au programme MOSAIC et au budget 2026' } },
          },
          {
            type: 'component',
            component: 'DataRow',
            props: { content: { label: 'Positionnement', value: 'Renfort run applicatif pendant la modernisation' } },
          },
          {
            type: 'component',
            component: 'DataRow',
            props: { content: { label: 'Exploration', value: 'Périmètre du lot, calendrier, contraintes du legacy' } },
          },
          {
            type: 'component',
            component: 'DataRow',
            props: { content: { label: 'Proposition', value: 'Atelier de cadrage à 2 semaines' } },
          },
          {
            type: 'component',
            component: 'DataRow',
            props: { content: { label: 'Closing', value: 'Date de l’atelier et participants côté Aeroval' } },
          },
        ],
      },
      { type: 'text', text: 'Power questions (3)', style: 'caption' },
      {
        type: 'component',
        component: 'DataList',
        props: {},
        children: [
          {
            type: 'component',
            component: 'DataRow',
            props: { content: { label: '1', value: 'Quel périmètre du socle applicatif est concerné par MOSAIC ?' } },
          },
          {
            type: 'component',
            component: 'DataRow',
            props: { content: { label: '2', value: 'Qui arbitre le budget filiale versus groupe ?' } },
          },
          {
            type: 'component',
            component: 'DataRow',
            props: {
              content: {
                label: '3',
                value: 'Le prestataire actuel est-il reconduit sur le run pendant la modernisation ?',
              },
            },
          },
        ],
      },
      { type: 'text', text: 'Objections (1)', style: 'caption' },
      {
        type: 'component',
        component: 'SectionCard',
        props: { content: { title: '« Sopra Steria est déjà en poste sur le legacy »' } },
        children: [
          {
            type: 'text',
            text: 'Vrai enjeu : peur de complexifier la gouvernance avec un second prestataire.',
            style: 'caption',
            color: 'text/muted',
          },
          {
            type: 'text',
            text: 'Réponse : positionner le lot de modernisation en parallèle, sans reprise du run existant.',
            style: 'body',
          },
        ],
      },
      { type: 'text', text: 'Fraîcheur des données & conformité', style: 'heading' },
      {
        type: 'component',
        component: 'Table',
        props: {
          table: {
            columns: ['Donnée', 'Âge', 'Conforme'],
            rows: [
              ['Signaux (Brave News)', '13 jours', 'oui'],
              ['Finances (Pappers)', '3 mois', 'oui'],
              ['Contacts (Apollo)', '2 jours', 'oui'],
            ],
          },
        },
      },
      { type: 'text', text: 'Réglementations', style: 'caption' },
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
                label: 'RGPD',
                value: 'contacts collectés depuis des sources publiques, base légale intérêt légitime',
              },
            },
          },
        ],
      },
      { type: 'text', text: 'Collecte — matière première fournie au modèle', style: 'heading' },
      {
        type: 'component',
        component: 'Table',
        props: {
          table: {
            columns: ['Source', 'Volume'],
            rows: [
              ['Pages scrapées (Firecrawl)', '6 pages'],
              ['Caractères scrapés', '48 200 caractères'],
              ['Résultats Brave', '14 résultats'],
              ['Dirigeants Pappers', '3 dirigeants'],
              ['C-level Pappers', '2 personnes'],
              ['Filiales Pappers', '3 filiales'],
              ['Établissements Pappers', '6 établissements'],
              ['Finances Pappers', '3 exercices'],
              ['Graphe capitalistique', '✓'],
            ],
          },
        },
      },
      { type: 'text', text: 'Personnes mentionnées — non converties en contacts', style: 'heading' },
      {
        type: 'component',
        component: 'Table',
        props: {
          table: {
            columns: ['Nom', 'Rôle mentionné'],
            rows: [
              ['Marc Oyono', 'Directeur Financier, cité dans un article sur le financement de MOSAIC'],
              ['Élodie Rambert', 'Responsable Achats, citée dans une offre d’emploi'],
            ],
          },
        },
      },
      { type: 'text', text: 'Réponse brute (raw_analysis)', style: 'heading' },
      { type: 'placeholder', kind: 'custom', label: 'JSON brut, repliable — diagnostic technique', height: 'md' },
    ],
  },
  states: {
    loading: [{ type: 'component', component: 'Skeleton', props: { shape: 'block' } }],
    error: [
      {
        type: 'component',
        component: 'GenericProblemMessage',
        props: { content: { title: 'Détail indisponible', description: 'L’API n’a pas répondu.' } },
      },
    ],
  },
  uxNotes: [
    {
      kind: 'decision',
      text: 'L’ordre des 18 sections est verrouillé par un test de snapshot : elles sont ENTRELACÉES par thème (l’audit d’exécution s’intercale entre l’organigramme et les entités, le grounding entre la concurrence et les entités) parce que c’est l’ordre de LECTURE d’un opérateur, pas l’ordre de rangement du code. Le réordonner casse le test.',
      source: 'apps/dashboard-manager/src/lib/telemetry.ts:1',
    },
    {
      kind: 'decision',
      text: 'Chaque section lit `raw_analysis` elle-même et rend `null` quand elle n’a rien à dire (contenu réellement optionnel de l’analyse, jamais un placeholder « à venir ») — le fichier de page n’orchestre que l’ordre, GA-26 : la lecture ne se refait pas à deux endroits.',
      source: 'apps/dashboard-manager/src/lib/roles.ts:1',
    },
    {
      kind: 'decision',
      text: 'Les contacts prospects de cette page (ex. Julien Farge, DSI) sont rendus EN CLAIR avec leur `mailto:` — exception NOMMÉE, documentée dans le fichier, à la garde qui masque les e-mails ailleurs dans le DM (Audit, Facturation, ESN) : une adresse d’opérateur BellumAI se masque, une adresse de contact prospect destinée à l’usage commercial ne se masque pas.',
      source: 'apps/dashboard-manager/src/app/analysis/[id]/_components/AnalysisContacts.tsx:8',
    },
    {
      kind: 'decision',
      text: 'Tous les scores de cette page (confiance /100, priorité /10, plan /25, contact /100) sont des scores dérivés de signaux mesurés — jamais une probabilité de closing (refusée six fois par la doctrine). La confiance est en outre PLAFONNÉE par le verdict qualité : jamais un « 100/100 » si le verdict est à corriger, halluciné ou trop faible.',
      source: 'apps/dashboard-manager/src/app/analysis/[id]/_components/AnalysisHeader.tsx:42',
    },
    {
      kind: 'decision',
      text: 'Responsive : à 1280 la grille de fiche société (4 colonnes) passerait à 3, les nombreux tableaux (registre, signaux, sources, preuves) masqueraient leur colonne la moins consultée en premier ; contenu borné à 1600 px sur 1920, jamais étiré. Au-delà (2560, 3440) l’écran gagnerait une navigation d’ancrage fixe vers les 18 sections (sommaire collant) plutôt que d’étirer chaque section en largeur — l’écran le plus long du DM en profiterait le plus.',
      source: 'apps/dashboard-manager/src/app/globals.css:114',
    },
    {
      kind: 'ecart',
      text: '`gridTemplateColumns: repeat(4, 1fr)` (fiche société, `AnalysisHeader`) est un style inline sans media query : à 1280 les 4 cartes se resserrent, elles ne passent jamais à 3 aujourd’hui. Aucune règle `@media (min-width…)` n’existe par ailleurs dans le DM : aucun sommaire d’ancrage n’est mesuré au-delà de 1920.',
      source: 'apps/dashboard-manager/src/app/globals.css:114',
    },
    {
      kind: 'decision',
      text: 'Passe de couverture (audit-couverture-h.md, dm/analysis-detail) : badge qualité + compteur d’issues et SIREN en entête, répartition « Score /25 », bannière identité incertaine et bloc « Échec de l’analyse », ligne de couverture du Grounding, angle/cohérence/tier sur les cartes « Top offres », tier des périmètres prioritaires, note « hypothèses à vérifier (règle 70 %) », texte stratégique par concurrent, paragraphe stratégie par angle, 4ᵉ zone « Quick win » + champs à vendre/stack/autonomie IT par entité, 3 sous-sections du plan d’action, et une fiche contact détaillée complète (provenance, téléphone, LinkedIn, Apollo, résumé, pourquoi ce contact, leviers/peurs, message prêt à envoyer). La bannière identité incertaine et le bloc « Échec de l’analyse » sont mutuellement exclusifs avec le statut « completed » / identité confirmée de ce dossier fictif : ils sont reproduits ici pour la même raison que « Zones blanches » ou « Personnes mentionnées » déjà présents — cette maquette catalogue les ~35 sous-sections nommées, pas un seul parcours cohérent (cf. en-tête du fichier).',
      source: 'apps/dashboard-manager/src/app/analysis/[id]/_components/AnalysisContacts.tsx:296',
    },
  ],
}
