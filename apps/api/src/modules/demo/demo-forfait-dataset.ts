import { DEMO_DOSSIERS, demoSourceUrl } from './demo-dataset'

/**
 * #4291 (lot J, décision Louis 21/10/2026 : « Oui, un 2e espace démo au profil forfait / conseil ») — LE JEU DE LA
 * SALLE FORFAIT / CONSEIL, pour que #4291.6 à .9 se prouvent à l'écran.
 *
 * La salle forfait reçoit d'abord le semis staffing ENTIER (même code, mêmes gardes de complétude), puis ce
 * qui suit : trois comptes FICTIFS (aucun SIREN, domaines `.example`) dont l'ESN cadre et supervise des
 * projets au forfait, réalisés par les équipes du client. Le vivier de la salle reste celui du semis staffing
 * — au second plan de la navigation, comme le profil #4270.2 le veut (c76 : l'ordre change, jamais le contenu).
 *
 * Chaque compte est ENTIER (« aucun compte mince ») : contacts aux noms complets dont ses décideurs, signaux
 * datés, enjeux, angles d'attaque et plan. Les dates sont FIXES (jamais relatives à l'horloge du module) :
 * l'empreinte de la salle forfait les inclut, une date mouvante la périmerait chaque jour.
 *
 * Gardes : `demo-forfait-room.spec.ts` (forme, CHECK SQL, branchement du semis).
 */
type DemoDossier = (typeof DEMO_DOSSIERS)[number]
type DemoContact = DemoDossier['contacts'][number]

const SIMULATED =
  'Interlocuteur SIMULÉ d’un compte fictif de démonstration : nom, fonction et parcours sont inventés, aucune personne réelle n’est décrite.'

function person(
  input: Pick<
    DemoContact,
    | 'full_name'
    | 'title'
    | 'entity'
    | 'family'
    | 'decision_role'
    | 'priority'
    | 'why_contact'
    | 'contact_score'
    | 'seniority'
    | 'key_points'
  >,
): DemoContact {
  return {
    photo_url: null,
    email: null,
    email_message: null,
    linkedin_message: null,
    profile_summary: SIMULATED,
    lifecycle_state: 'identite_verifiee',
    ...input,
  }
}

function forfaitDossier(config: {
  company: string
  slug: string
  sector: string
  business_description: string
  employees: string
  revenue: string
  headquarters: string
  commercial_status: DemoDossier['account']['commercial_status']
  sprint: DemoDossier['account']['sprint']
  sprint_reason: string
  priority_score: number
  priority_justification: string
  it_challenges: DemoDossier['account']['it_challenges']
  recent_signals: DemoDossier['account']['recent_signals']
  contacts: DemoContact[]
  attackAngles: DemoDossier['attackAngles']
  actionPlan: DemoDossier['actionPlan']
}): DemoDossier {
  return {
    account: {
      company_name: config.company,
      tags: ['forfait', 'démonstration'],
      siren: null,
      naf_code: null,
      registry_country: 'FR',
      sector: config.sector,
      employees: config.employees,
      revenue: config.revenue,
      headquarters: config.headquarters,
      website: `https://www.${config.slug}.example`,
      logo_url: null,
      subsidiaries: [],
      it_challenges: config.it_challenges,
      recent_signals: config.recent_signals,
      priority_score: config.priority_score,
      priority_justification: config.priority_justification,
      commercial_status: config.commercial_status,
      priority_gate: 'pending',
      gate_reason: null,
      sprint: config.sprint,
      sprint_reason: config.sprint_reason,
      sprint_exit_reason: null,
      relationship_memory: null,
      // Les clés du contrat `raw_analysis` qu'un compte fictif porte honnêtement : ce qu'il fait, ses enjeux, ses
      // signaux. Les autres (registre, organigramme, scoring IA…) sont vides à dessein — `demo-coverage.ts`.
      raw_analysis: {
        demo_seed: true,
        business_description: config.business_description,
        it_challenges: config.it_challenges,
        recent_signals: config.recent_signals,
      },
    },
    contacts: config.contacts,
    attackAngles: config.attackAngles,
    actionPlan: config.actionPlan,
  }
}

/* ------------------------------------------------------------------ */
/* Mutuelle Horizon Santé — refonte du SI de gestion des adhérents      */
/* ------------------------------------------------------------------ */

const horizon = forfaitDossier({
  company: 'Mutuelle Horizon Santé',
  slug: 'horizon-sante',
  sector: 'Assurance santé — mutuelle',
  business_description:
    'Mutuelle santé régionale, 310 000 adhérents, gestion des remboursements en propre. Ses projets SI se font au forfait, avec ses équipes, cadrés par un partenaire extérieur.',
  employees: '1 800 salariés',
  revenue: '920 M€',
  headquarters: 'Lyon',
  commercial_status: 'inbox',
  sprint: 'focus',
  sprint_reason:
    'Deux projets à cadrer sur le même sponsor (la direction des opérations) et un forfait déjà gagné chez elle : c’est le compte où l’effort de cadrage rapporte le plus vite.',
  priority_score: 8,
  priority_justification:
    'Un forfait gagné en cours, un sponsor identifié et deux projets ouverts : la relation est installée, le cadrage du suivant est à portée.',
  it_challenges: [
    {
      title: 'Refonte du SI de gestion des adhérents',
      description:
        'Le progiciel de gestion arrive en fin de support en 2028 : la mutuelle doit arrêter un périmètre de refonte avant de consulter, sans équipe projet interne dimensionnée pour le cadrer seule.',
      severity: 'high',
      timeframe: '6 mois',
    },
    {
      title: 'Portail adhérent à remettre au niveau',
      description:
        'Les demandes de remboursement passent encore à 40 % par courrier ; le portail doit absorber ce volume sans dégrader le délai de traitement.',
      severity: 'medium',
      timeframe: '12 mois',
    },
  ],
  recent_signals: [
    {
      id: 's1',
      signal: 'Le conseil d’administration valide un plan de transformation 2027-2029 du SI de gestion',
      source: 'Communiqué de la mutuelle',
      url: demoSourceUrl('press', 'horizon-1'),
      source_kind: 'press',
      type: 'projet',
      date: '2026-09-18',
      sales_implication:
        'Un plan voté AVANT le cadrage : le périmètre se décide dans les mois qui viennent, c’est le moment d’apporter une méthode de cadrage au forfait.',
      freshness: 'current',
    },
    {
      id: 's2',
      signal: 'Nomination d’un directeur des opérations venu d’un assureur, chargé de la transformation',
      source: 'Presse spécialisée assurance',
      url: demoSourceUrl('press', 'horizon-2'),
      source_kind: 'press',
      type: 'nomination',
      date: '2026-08-27',
      sales_implication:
        'Un sponsor neuf cherche des résultats rapides et visibles : un premier lot borné l’intéresse.',
      freshness: 'current',
    },
    {
      id: 's3',
      signal: 'Appel à candidatures pour un chef de projet MOA interne, publié puis retiré',
      source: 'Offre d’emploi',
      url: demoSourceUrl('job', 'horizon-3'),
      source_kind: 'job',
      type: 'recrutement',
      date: '2026-10-06',
      sales_implication:
        'Le poste retiré dit que le pilotage interne ne sera pas pourvu à temps : un cadrage et une supervision au forfait comblent ce trou.',
      freshness: 'current',
    },
  ],
  contacts: [
    person({
      full_name: 'Delphine Moreau-Vasseur',
      title: 'Directrice générale',
      entity: 'Mutuelle Horizon Santé',
      family: 'C-Level',
      decision_role: 'economic',
      priority: 3,
      why_contact:
        'Signataire des engagements au-delà de 150 k€ : elle tranche le budget du forfait, pas le périmètre.',
      contact_score: 58,
      seniority: 'c_suite',
      key_points: ['Signe les forfaits au-delà de 150 k€', 'À voir en fin de cadrage, jamais à froid'],
    }),
    person({
      full_name: 'Bastien Lefranc',
      title: 'Directeur des opérations',
      entity: 'Mutuelle Horizon Santé',
      family: 'C-Level',
      decision_role: 'champion',
      priority: 1,
      why_contact:
        'Sponsor des deux projets à cadrer et du forfait gagné : c’est lui qui arrête le périmètre et défend le budget.',
      contact_score: 86,
      seniority: 'c_suite',
      key_points: ['Sponsor nommé du plan 2027-2029', 'Veut un premier lot visible en six mois'],
    }),
    person({
      full_name: 'Sandrine Aubertin',
      title: 'Directrice des systèmes d’information',
      entity: 'Mutuelle Horizon Santé',
      family: 'IT',
      decision_role: 'technical',
      priority: 2,
      why_contact: 'Valide l’architecture cible et la reprise de données : sans elle, le périmètre ne tient pas.',
      contact_score: 74,
      seniority: 'director',
      key_points: ['Fin de support du progiciel en 2028', 'Équipe interne de 12 personnes, déjà chargée'],
    }),
    person({
      full_name: 'Karim Benslimane',
      title: 'Responsable des achats',
      entity: 'Mutuelle Horizon Santé',
      family: 'Achat',
      decision_role: 'procurement',
      priority: 4,
      why_contact: 'Porte la consultation : forfait à engagement de résultat, pénalités de retard plafonnées.',
      contact_score: 52,
      seniority: 'manager',
      key_points: ['Préfère le forfait à la régie depuis 2025', 'Exige un plan de réversibilité'],
    }),
    person({
      full_name: 'Élodie Charpentier',
      title: 'Responsable de la relation adhérents',
      entity: 'Mutuelle Horizon Santé',
      family: 'Digital',
      decision_role: 'user',
      priority: 5,
      why_contact: 'Utilisatrice principale du portail : elle sait ce que le courrier coûte, chiffres à l’appui.',
      contact_score: 48,
      seniority: 'manager',
      key_points: ['40 % des demandes encore par courrier'],
    }),
  ],
  attackAngles: [
    {
      title: 'Cadrer la refonte du SI de gestion au forfait',
      description:
        'Six semaines de cadrage au forfait : périmètre, lots, reprise de données et critères de réussite écrits, présentés au sponsor avant toute consultation.',
      entry_point: 'Directeur des opérations',
      is_recommended: true,
      rank: 1,
    },
    {
      title: 'Superviser le premier lot du portail adhérent',
      description:
        'Un lot borné réalisé par les équipes de la mutuelle, cadré et supervisé par l’ESN : délai de traitement mesuré avant et après.',
      entry_point: 'Responsable de la relation adhérents',
      is_recommended: false,
      rank: 2,
    },
  ],
  actionPlan: {
    strategy_type: 'land_and_expand',
    strategy_justification:
      'Le forfait gagné installe la relation ; le cadrage de la refonte s’y adosse, avec le même sponsor.',
    weeks: [
      {
        name: 'semaine_1_2',
        title: 'Présenter la méthode de cadrage au sponsor',
        objective: 'Faire valider le format (six semaines, livrables écrits, critères d’arrêt) avant de chiffrer.',
        actions: [
          {
            action_id: 'HS1',
            action:
              'Proposer au directeur des opérations un atelier de 45 minutes sur le plan 2027-2029, en s’appuyant sur le forfait du portail déjà en cours.',
            contact: 'Bastien Lefranc',
            channel: 'meeting',
            deadline: 'Semaine 1',
            expected_outcome: 'Atelier fixé, périmètre de cadrage esquissé.',
            kpi: 'Atelier obtenu',
          },
        ],
      },
      {
        name: 'semaine_3_4',
        title: 'Arrêter le périmètre avec la DSI',
        objective: 'Écrire le périmètre, les lots et la reprise de données, validés par la DSI.',
        actions: [
          {
            action_id: 'HS2',
            action: 'Partager une note de périmètre (lots, reprise, risques) à la DSI et recueillir ses réserves.',
            contact: 'Sandrine Aubertin',
            channel: 'email',
            deadline: 'Semaine 3',
            expected_outcome: 'Périmètre validé par écrit.',
            kpi: 'Note validée',
          },
          {
            action_id: 'HS3',
            action: 'Remettre la proposition de cadrage au forfait aux achats, avec le plan de réversibilité exigé.',
            contact: 'Karim Benslimane',
            channel: 'email',
            deadline: 'Semaine 4',
            expected_outcome: 'Proposition recevable par les achats.',
            kpi: 'Proposition remise',
          },
        ],
      },
    ],
  },
})

/* ------------------------------------------------------------------ */
/* Valmont Distribution — omnicanal et logistique magasin               */
/* ------------------------------------------------------------------ */

const valmont = forfaitDossier({
  company: 'Valmont Distribution',
  slug: 'valmont-distribution',
  sector: 'Distribution spécialisée — équipement de la maison',
  business_description:
    'Enseigne d’équipement de la maison, 140 magasins et un site marchand. La DSI réalise en interne ; elle cherche un cadrage et une supervision, pas des renforts.',
  employees: '4 200 salariés',
  revenue: '1,3 Md€',
  headquarters: 'Lille',
  commercial_status: 'watching',
  sprint: 'focus',
  sprint_reason:
    'Un projet qualifié (le click & collect) avec budget voté et un second à cadrer : on concentre l’effort sur la proposition du premier.',
  priority_score: 7,
  priority_justification:
    'Budget voté et sponsor engagé sur le click & collect ; le second projet attend le résultat du premier.',
  it_challenges: [
    {
      title: 'Click & collect en deux heures dans 140 magasins',
      description:
        'L’enseigne promet le retrait en deux heures ; les stocks magasin ne remontent qu’une fois par nuit. Le projet est voté, son périmètre technique reste à arrêter.',
      severity: 'high',
      timeframe: 'immédiat',
    },
    {
      title: 'Données produit éclatées entre trois référentiels',
      description:
        'Fiches produit, prix et stocks vivent dans trois outils sans référentiel commun : chaque nouveau canal multiplie les écarts.',
      severity: 'medium',
      timeframe: '12 mois',
    },
  ],
  recent_signals: [
    {
      id: 's1',
      signal: 'L’enseigne annonce le retrait en deux heures dans tous ses magasins d’ici l’été 2027',
      source: 'Presse économique régionale',
      url: demoSourceUrl('press', 'valmont-1'),
      source_kind: 'press',
      type: 'projet',
      date: '2026-09-30',
      sales_implication:
        'Une promesse publique datée : le projet a un délai ferme, le cadrage doit commencer maintenant pour tenir l’été.',
      freshness: 'current',
    },
    {
      id: 's2',
      signal: 'Budget d’investissement 2027 relevé de 18 %, fléché sur l’omnicanal',
      source: 'Rapport annuel',
      url: demoSourceUrl('official', 'valmont-2'),
      source_kind: 'official',
      type: 'budget',
      date: '2026-07-15',
      sales_implication: 'Le budget existe et il est fléché : la question n’est pas « si », mais « qui cadre ».',
      freshness: 'current',
    },
  ],
  contacts: [
    person({
      full_name: 'Thierry Vandamme',
      title: 'Directeur général',
      entity: 'Valmont Distribution',
      family: 'C-Level',
      decision_role: 'economic',
      priority: 3,
      why_contact: 'A porté publiquement la promesse du retrait en deux heures : il arbitre le budget, pas la méthode.',
      contact_score: 55,
      seniority: 'c_suite',
      key_points: ['Promesse publique datée (été 2027)'],
    }),
    person({
      full_name: 'Nadia Ferhat',
      title: 'Directrice omnicanal',
      entity: 'Valmont Distribution',
      family: 'Digital',
      decision_role: 'champion',
      priority: 1,
      why_contact: 'Sponsor du click & collect : elle porte le délai et choisit qui cadre.',
      contact_score: 84,
      seniority: 'director',
      key_points: ['Budget voté', 'Veut un pilote dans 10 magasins avant Noël'],
    }),
    person({
      full_name: 'Olivier Desrumaux',
      title: 'Directeur informatique',
      entity: 'Valmont Distribution',
      family: 'IT',
      decision_role: 'technical',
      priority: 2,
      why_contact: 'Tient les trois référentiels et la remontée des stocks : il dira ce qui est faisable d’ici l’été.',
      contact_score: 70,
      seniority: 'director',
      key_points: ['Stocks remontés une fois par nuit', 'Équipe interne qui réalisera'],
    }),
    person({
      full_name: 'Claire Hennebelle',
      title: 'Responsable logistique magasins',
      entity: 'Valmont Distribution',
      family: 'PMO',
      decision_role: 'user',
      priority: 4,
      why_contact: 'Vit les ruptures en magasin : ses chiffres rendent le périmètre concret.',
      contact_score: 50,
      seniority: 'manager',
      key_points: ['140 magasins', 'Ruptures non vues avant le passage client'],
    }),
  ],
  attackAngles: [
    {
      title: 'Cadrer puis superviser le click & collect en deux heures',
      description:
        'Cadrage de quatre semaines puis supervision de la réalisation par l’équipe informatique de l’enseigne, pilote dans dix magasins avant le déploiement.',
      entry_point: 'Directrice omnicanal',
      is_recommended: true,
      rank: 1,
    },
    {
      title: 'Référentiel produit unique',
      description: 'Un second projet, cadré une fois le click & collect lancé, sur la même équipe interne.',
      entry_point: 'Directeur informatique',
      is_recommended: false,
      rank: 2,
    },
  ],
  actionPlan: {
    strategy_type: 'land_and_expand',
    strategy_justification:
      'Le click & collect est voté et daté : gagner son cadrage, puis enchaîner sur le référentiel produit.',
    weeks: [
      {
        name: 'semaine_1_2',
        title: 'Défendre la proposition de cadrage',
        objective: 'Présenter le cadrage au forfait et le pilote dans dix magasins à la sponsor.',
        actions: [
          {
            action_id: 'VD1',
            action:
              'Présenter la proposition (quatre semaines de cadrage, pilote, supervision) à la directrice omnicanal.',
            contact: 'Nadia Ferhat',
            channel: 'meeting',
            deadline: 'Semaine 1',
            expected_outcome: 'Proposition défendue, objections notées.',
            kpi: 'Rendez-vous tenu',
          },
        ],
      },
      {
        name: 'semaine_3_4',
        title: 'Lever les réserves techniques',
        objective: 'Faire valider la remontée de stock en quasi temps réel par la DSI.',
        actions: [
          {
            action_id: 'VD2',
            action: 'Atelier technique avec la DSI sur la remontée des stocks et les trois référentiels.',
            contact: 'Olivier Desrumaux',
            channel: 'meeting',
            deadline: 'Semaine 3',
            expected_outcome: 'Faisabilité confirmée pour le pilote.',
            kpi: 'Réserves levées',
          },
        ],
      },
    ],
  },
})

/* ------------------------------------------------------------------ */
/* Régie des Eaux du Grand Ouest — SI patrimonial                       */
/* ------------------------------------------------------------------ */

const regie = forfaitDossier({
  company: 'Régie des Eaux du Grand Ouest',
  slug: 'eaux-grand-ouest',
  sector: 'Services publics — eau et assainissement',
  business_description:
    'Régie publique de l’eau et de l’assainissement, 9 000 km de réseau. Achète par marchés publics ; ses agents réalisent, un prestataire cadre et supervise.',
  employees: '650 agents',
  revenue: '210 M€',
  headquarters: 'Rennes',
  commercial_status: 'inbox',
  sprint: 'watch',
  sprint_reason:
    'Un forfait gagné en cours de supervision ; le projet suivant dépend d’un appel d’offres attendu au printemps : on suit, on ne relance pas.',
  priority_score: 6,
  priority_justification:
    'Client installé par un forfait gagné ; le prochain projet passe par la commande publique, à son calendrier.',
  it_challenges: [
    {
      title: 'SI patrimonial des réseaux à moderniser',
      description:
        'Les 9 000 km de réseau sont suivis dans un SIG vieillissant ; la régie doit prioriser ses renouvellements de canalisations sur des données fiables.',
      severity: 'high',
      timeframe: '12 mois',
    },
  ],
  recent_signals: [
    {
      id: 's1',
      signal: 'Délibération du conseil d’administration sur un schéma directeur du SI patrimonial',
      source: 'Délibérations publiques',
      url: demoSourceUrl('official', 'regie-1'),
      source_kind: 'official',
      type: 'projet',
      date: '2026-09-09',
      sales_implication:
        'Un schéma directeur délibéré annonce des marchés : le cadrage du prochain se prépare avant la publication.',
      freshness: 'current',
    },
    {
      id: 's2',
      signal: 'Avis de pré-information : marché de modernisation du SIG attendu au printemps 2027',
      source: 'Plateforme de marchés publics',
      url: demoSourceUrl('official', 'regie-2'),
      source_kind: 'official',
      type: 'appel_offres',
      date: '2026-10-01',
      sales_implication: 'La date de l’appel d’offres est connue : préparer la réponse, pas relancer le client.',
      freshness: 'current',
    },
  ],
  contacts: [
    person({
      full_name: 'Yannick Le Goff',
      title: 'Directeur général',
      entity: 'Régie des Eaux du Grand Ouest',
      family: 'C-Level',
      decision_role: 'economic',
      priority: 3,
      why_contact: 'Porte le schéma directeur devant le conseil d’administration.',
      contact_score: 54,
      seniority: 'c_suite',
      key_points: ['Schéma directeur délibéré en septembre'],
    }),
    person({
      full_name: 'Morgane Kerhervé',
      title: 'Directrice du patrimoine et des réseaux',
      entity: 'Régie des Eaux du Grand Ouest',
      family: 'C-Level',
      decision_role: 'champion',
      priority: 1,
      why_contact: 'Sponsor du forfait en cours et du prochain projet SIG : elle juge sur la qualité du cadrage.',
      contact_score: 80,
      seniority: 'director',
      key_points: ['Sponsor du forfait de priorisation en cours', 'Prochain marché au printemps'],
    }),
    person({
      full_name: 'Jérôme Tanguy',
      title: 'Responsable du système d’information géographique',
      entity: 'Régie des Eaux du Grand Ouest',
      family: 'Data',
      decision_role: 'technical',
      priority: 2,
      why_contact: 'Réalise avec son équipe le forfait que l’ESN supervise : il est la preuve du résultat.',
      contact_score: 72,
      seniority: 'manager',
      key_points: ['Équipe SIG de quatre agents', 'Réalise le forfait supervisé'],
    }),
    person({
      full_name: 'Anne-Sophie Le Bihan',
      title: 'Responsable de la commande publique',
      entity: 'Régie des Eaux du Grand Ouest',
      family: 'Achat',
      decision_role: 'procurement',
      priority: 4,
      why_contact: 'Rédige les marchés : le calendrier et les critères passent par elle.',
      contact_score: 50,
      seniority: 'manager',
      key_points: ['Avis de pré-information publié le 1er octobre'],
    }),
  ],
  attackAngles: [
    {
      title: 'Livrer le forfait de priorisation, preuve pour le marché suivant',
      description:
        'Le forfait gagné (priorisation des renouvellements) livré dans les délais est la meilleure référence pour le marché SIG du printemps.',
      entry_point: 'Directrice du patrimoine et des réseaux',
      is_recommended: true,
      rank: 1,
    },
    {
      title: 'Préparer la réponse au marché de modernisation du SIG',
      description: 'Cadrage de la réponse dès l’avis de pré-information : lots, références, équipe client mobilisée.',
      entry_point: 'Responsable de la commande publique',
      is_recommended: false,
      rank: 2,
    },
  ],
  actionPlan: {
    strategy_type: 'land_and_expand',
    strategy_justification: 'Livrer le forfait en cours, puis répondre au marché SIG avec cette référence.',
    weeks: [
      {
        name: 'semaine_1_2',
        title: 'Tenir le jalon du forfait en cours',
        objective: 'Présenter l’avancement du forfait de priorisation à la sponsor.',
        actions: [
          {
            action_id: 'RE1',
            action: 'Comité de suivi du forfait : avancement, risques, prochaines livraisons de l’équipe SIG.',
            contact: 'Morgane Kerhervé',
            channel: 'meeting',
            deadline: 'Semaine 1',
            expected_outcome: 'Jalon validé, satisfaction notée.',
            kpi: 'Comité tenu',
          },
        ],
      },
      {
        name: 'semaine_3_4',
        title: 'Préparer le marché du printemps',
        objective: 'Comprendre les critères du marché SIG avant sa publication.',
        actions: [
          {
            action_id: 'RE2',
            action: 'Lire l’avis de pré-information et noter les questions à poser lors du sourcing.',
            contact: 'Anne-Sophie Le Bihan',
            channel: 'email',
            deadline: 'Semaine 4',
            expected_outcome: 'Critères et calendrier connus.',
            kpi: 'Note de préparation écrite',
          },
        ],
      },
    ],
  },
})

export const DEMO_FORFAIT_DOSSIERS: readonly DemoDossier[] = [horizon, valmont, regie]

/**
 * Les BESOINS de la salle forfait, lus comme des PROJETS À CADRER (#4270.3, #4291.7) : le périmètre est le
 * contexte du besoin, le sponsor son décideur (`decision_maker_contact_id`, un contact NOMMÉ du compte), le
 * budget et l'échéance ceux du projet. Un projet GAGNÉ porte sa mission en forfait encadré (#4291.8) : suivie
 * comme un projet, aucun consultant à placer — l'équipe qui réalise est celle du client.
 */
export const DEMO_FORFAIT_PROJECTS = [
  {
    company: 'Mutuelle Horizon Santé',
    title: 'Cadrage — refonte du SI de gestion des adhérents',
    status: 'to_qualify' as const,
    status_changed_days_ago: 4,
    scope:
      'Refonte du SI de gestion des adhérents avant la fin de support de 2028 : arrêter les lots, la reprise de données et les critères de réussite avec la DSI, avant toute consultation.',
    sponsor: 'Bastien Lefranc',
    budget_cents: 240_000_00,
    deadline_in_days: 45,
    supervision_role: 'framing' as const,
    client_team_names: ['Sandrine Aubertin', 'Marc Rivoire'],
    mission: null,
  },
  {
    company: 'Mutuelle Horizon Santé',
    title: 'Portail adhérent — dématérialisation des remboursements (forfait gagné)',
    status: 'won' as const,
    status_changed_days_ago: 30,
    scope:
      'Forfait gagné : cadrage et supervision de la dématérialisation des demandes de remboursement, réalisée par l’équipe digitale de la mutuelle. Suivi comme un projet.',
    sponsor: 'Bastien Lefranc',
    budget_cents: 120_000_00,
    deadline_in_days: 90,
    supervision_role: 'both' as const,
    client_team_names: ['Élodie Charpentier', 'Paul Granger', 'Inès Rocher'],
    mission: {
      label: 'Supervision du forfait portail adhérent — équipe digitale de la mutuelle',
      status: 'active' as const,
      started_days_ago: 28,
      ends_in_days: 90,
      daily_rate: 950,
      loaded_daily_cost_cents: 590_00,
      delivery_mode: 'supervised' as const,
      supervision_role: 'both' as const,
      client_team_size: 6,
      client_team_names: ['Élodie Charpentier', 'Paul Granger', 'Inès Rocher'],
      role_title: 'Directeur de projet — cadrage et supervision',
    },
  },
  {
    company: 'Valmont Distribution',
    title: 'Click & collect en deux heures — cadrage et pilote',
    status: 'qualified' as const,
    status_changed_days_ago: 6,
    scope:
      'Retrait en deux heures dans 140 magasins : périmètre technique (remontée des stocks, trois référentiels), pilote dans dix magasins, puis supervision de la réalisation par la DSI de l’enseigne.',
    sponsor: 'Nadia Ferhat',
    budget_cents: 310_000_00,
    deadline_in_days: 30,
    supervision_role: 'both' as const,
    client_team_names: ['Olivier Desrumaux', 'Claire Hennebelle'],
    mission: null,
  },
  {
    company: 'Valmont Distribution',
    title: 'Référentiel produit unique — à cadrer',
    status: 'to_qualify' as const,
    status_changed_days_ago: 12,
    scope:
      'Un référentiel commun pour les fiches produit, les prix et les stocks : à cadrer une fois le click & collect lancé, sur la même équipe interne.',
    sponsor: 'Olivier Desrumaux',
    budget_cents: 150_000_00,
    deadline_in_days: 120,
    supervision_role: 'framing' as const,
    client_team_names: ['Olivier Desrumaux'],
    mission: null,
  },
  {
    company: 'Régie des Eaux du Grand Ouest',
    title: 'Priorisation des renouvellements de canalisations (forfait gagné)',
    status: 'won' as const,
    status_changed_days_ago: 45,
    scope:
      'Forfait gagné : méthode de priorisation des renouvellements sur 9 000 km de réseau, réalisée par l’équipe SIG de la régie, cadrée et supervisée par l’ESN.',
    sponsor: 'Morgane Kerhervé',
    budget_cents: 85_000_00,
    deadline_in_days: 60,
    supervision_role: 'supervision' as const,
    client_team_names: ['Jérôme Tanguy', 'Gwenaëlle Morvan'],
    mission: {
      label: 'Supervision du forfait de priorisation des renouvellements — équipe SIG',
      status: 'active' as const,
      started_days_ago: 40,
      ends_in_days: 60,
      daily_rate: 880,
      loaded_daily_cost_cents: 540_00,
      delivery_mode: 'supervised' as const,
      supervision_role: 'supervision' as const,
      client_team_size: 4,
      client_team_names: ['Jérôme Tanguy', 'Gwenaëlle Morvan'],
      role_title: 'Responsable de supervision du forfait',
    },
  },
]

/**
 * #4291.7 (recette 23/10) — l'affaire « Plan stratégique 2029 » du compte Société Générale, reprise dans la salle forfait :
 * lue comme un projet À CADRER, elle porte son périmètre (`opportunities.scope_label`) et son sponsor (contact du
 * compte rattaché avec le rôle `sponsor`). Le budget (90 000 €) est celui de l'affaire, déjà semé. Contenu fictif.
 */
export const DEMO_FORFAIT_FRAMED_OPPORTUNITY = {
  label: 'Plan stratégique 2029 à outiller techniquement',
  scope_label:
    'Outillage technique du plan 2029 : arrêter les trois lots applicatifs et le calendrier trimestriel avec la DSI, avant toute consultation.',
  sponsor: 'Julien Castaing',
} as const
