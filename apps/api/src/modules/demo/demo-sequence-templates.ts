/**
 * #3756 — la bibliothèque de modèles de séquence de la salle de démonstration :
 * DEUX campagnes fictives (secteur × tier), TROIS étapes chacune, avec les
 * variables que le moteur sait résoudre. Aucun chiffre de performance : une
 * bibliothèque ne porte jamais les stats d'un outil d'envoi.
 */
export const DEMO_SEQUENCE_TEMPLATES = [
  {
    name: 'Campagne 1 — Logistique 3PL',
    sector: 'Logistique 3PL',
    tier_label: 'A' as const,
    steps: [
      {
        delay_days: 0,
        subject: 'Votre entrepôt de demain, {{firstName}}',
        body: 'Bonjour {{firstName}},\n\nChez {{companyName}}, les pics d’activité mettent vos équipes SI sous tension. Nous aidons des 3PL à fiabiliser leur WMS sans geler les évolutions.\n\nUn échange de 20 minutes cette semaine ?',
      },
      {
        delay_days: 3,
        subject: 'Re : votre entrepôt de demain',
        body: 'Bonjour {{firstName}},\n\nJe me permets de revenir vers vous : si le sujet WMS n’est pas d’actualité chez {{companyName}}, dites-le-moi simplement.',
      },
      {
        delay_days: 7,
        subject: 'Dernier message de ma part',
        body: 'Bonjour {{firstName}},\n\nJe ne vous écrirai plus sur ce sujet. Si vous souhaitez en reparler plus tard, ma porte reste ouverte.',
      },
    ],
    // #4426.7 — les scripts d'appel de la campagne (ce que l'import « Script : … » range avec le modèle).
    call_scripts: [
      {
        title: 'Accroche',
        body: 'Bonjour {{firstName}}, je vous appelle au sujet de votre WMS chez {{companyName}} — avez-vous deux minutes ?',
      },
      {
        title: 'Traitement des objections',
        body: 'Si « pas de budget » : proposer un cadrage de 20 minutes, sans engagement.',
      },
    ],
  },
  {
    name: 'Campagne 2 — Distribution Retail',
    sector: 'Distribution Retail',
    tier_label: 'B' as const,
    steps: [
      {
        delay_days: 0,
        subject: 'Omnicanal : où en est {{companyName}} ?',
        body: 'Bonjour {{firstName}},\n\nEn tant que {{jobTitle}} chez {{companyName}}, vous suivez sans doute de près l’unification stock magasin / e-commerce. Nous accompagnons des enseignes sur ce chantier.',
      },
      {
        delay_days: 4,
        subject: 'Re : omnicanal',
        body: 'Bonjour {{firstName}},\n\nUn retour d’expérience de 15 minutes pourrait vous être utile : souhaitez-vous que je vous l’envoie ?',
      },
      {
        delay_days: 10,
        subject: 'Clôture de ma relance',
        body: 'Bonjour {{firstName}},\n\nSans retour de votre part, je clos ce fil. Bonne continuation chez {{companyName}}.',
      },
    ],
    call_scripts: [
      {
        title: 'Accroche',
        body: 'Bonjour {{firstName}}, je travaille avec des enseignes sur l’unification stock magasin / e-commerce — c’est un sujet chez {{companyName}} ?',
      },
    ],
  },
]
