import type { CommercialBrief, ItChallenge, KeyNote, PainPoint, ProgramName, TechnologyEntry } from '@bellum/contracts'
import { ORANGE_OFFERS, orangePublicSignals } from './orange-public-complement'
import {
  ORANGE_OBSERVED_NEEDS_COUNT,
  orangeNeedsSection,
  orangeTechLines,
  orangeTechnosSection,
} from './orange-needs-technos'

/**
 * PARITÉ ORANGE / GROUPE BPCE (13/10/2026), suite de `orange-public-complement.ts` : la LECTURE du compte — domaines
 * d'opportunité, besoins (hypothèses commerciales), vision, programmes, stack, indicateurs, garde-fous de fiabilité,
 * unités du groupe, chaîne d'achat. Même forme que `routeBpceRows` (`bpce-csv-mapping.ts`), même vocabulaire.
 *
 * D'où vient chaque chose :
 *  - tout ce qui porte un chiffre ou un constat de marché, d'achat ou de fiche est REPRIS du dossier de compte du
 *    12/10/2026 (le brief passé en paramètre) — rien n'est recalculé ni arrondi ;
 *  - les hypothèses de besoin sont des PISTES ANALYTIQUES (« hypothèse commerciale, sans demande externe ni budget
 *    ouvert confirmé », la même phrase que BPCE) ; une note de domaine n'est jamais une probabilité ;
 *  - les unités du groupe sont des entités PUBLIQUES du groupe Orange : aucune personne, aucun effectif.
 */

const note = (
  label: string,
  constat: string,
  interpretation: string | null,
  implication: string | null,
  reliability: string,
): KeyNote => ({ label, constat, interpretation, implication, reliability, amount: null, currency: null, period: null })

const REL_DOSSIER = 'Dossier de compte du 12/10/2026'
const REL_PUBLIC = 'Fait public — à recouper avant de le citer'
const REL_ANALYTIC = 'Analytique — à revalider terrain'

/* ------------------------------------------------------------------ */
/* Domaines d'opportunité (14) et hypothèses de besoin (60)             */
/* ------------------------------------------------------------------ */

type Domain = {
  label: string
  constat: string
  implication: string
  entry: string
  processus: string
  livrable: string
  modele: string
  /** Les hypothèses de besoin de ce domaine. */
  needs: readonly string[]
}

const DOMAINS: readonly Domain[] = [
  {
    label: 'Cloud de confiance et plateformes souveraines',
    constat:
      'Le plan stratégique met le cloud de confiance au centre ; une coentreprise de datacenters souverains (400 MW, environ 3 Md€) doit être signée avant fin 2026.',
    implication: 'Entrer par l’entité de services aux entreprises, côté architecture et exploitation des plateformes.',
    entry: 'Orange Business — architecture cloud',
    processus: 'Concevoir, migrer et exploiter des plateformes cloud souveraines',
    livrable: 'Architectures cibles, migrations de charges, exploitation',
    modele: 'Régie / forfait de migration / centre de services',
    needs: [
      'Architecture cible d’un cloud de confiance multi-sites',
      'Migration de charges applicatives vers une plateforme souveraine',
      'Exploitation et supervision d’un socle Kubernetes souverain',
      'Industrialisation de la chaîne d’infrastructure as code',
      'Plan de continuité et de reprise d’activité des plateformes hébergées',
    ],
  },
  {
    label: 'IA générative et agents',
    constat:
      'L’assistant Sharlie est lancé en France et des agents IA sont déployés chez Orange Business ; le plan vise 600 M€ d’économies d’opex par l’IA d’ici 2028.',
    implication:
      'Positionner du renfort sur l’industrialisation : évaluation, sécurité, supervision, coût d’inférence.',
    entry: 'Direction data et IA',
    processus: 'Passer des cas d’usage IA du prototype à la production',
    livrable: 'Plateforme MLOps, garde-fous, évaluation continue, supervision',
    modele: 'Régie / équipe mixte / forfait de mise en production',
    needs: [
      'Industrialisation d’une plateforme MLOps pour les modèles du groupe',
      'Évaluation continue et garde-fous des assistants IA',
      'Intégration de cas d’usage IA dans les parcours de service client',
      'Supervision du coût d’inférence et optimisation des charges',
      'Sécurisation de la chaîne de livraison des agents IA',
    ],
  },
  {
    label: 'Data et analytique',
    constat:
      'Un besoin « Data & Analytics Engineer » est en présentation dans la base (900 € par jour annoncé) ; plusieurs profils data sont observés en poste.',
    implication: 'Entrer par un manager opérationnel data, avec un profil précis plutôt qu’une offre générale.',
    entry: 'Direction data — plateforme analytique',
    processus: 'Construire et maintenir les chaînes de données de pilotage',
    livrable: 'Pipelines, modèles analytiques, restitution',
    modele: 'Régie / forfait / équipe mixte',
    needs: [
      'Modélisation analytique des données de pilotage commercial',
      'Chaînes de données du réseau : collecte, qualité, restitution',
      'Gouvernance et catalogue de données du groupe',
      'Migration d’un entrepôt de données vers une plateforme cloud',
      'Qualité de la donnée client multi-entités',
    ],
  },
  {
    label: 'Cyberdéfense et détection',
    constat:
      'Le chiffre d’affaires d’Orange Cyberdefense progresse de 10,6 % et ses commandes de 15 % au premier semestre 2026.',
    implication: 'Une entité en croissance qui recrute : la montée en charge se couvre en partie par du renfort.',
    entry: 'Orange Cyberdefense — opérations de sécurité',
    processus: 'Détecter, investiguer et répondre sur incident',
    livrable: 'Ingénierie de détection, automatisation de la réponse, durcissement',
    modele: 'Régie / centre de services',
    needs: [
      'Ingénierie de détection et règles de corrélation',
      'Automatisation de la réponse sur incident',
      'Durcissement des environnements cloud hébergés',
      'Gestion des identités et des accès privilégiés',
      'Revue des configurations de sécurité des plateformes SaaS',
    ],
  },
  {
    label: 'Intégration des SI après le rachat de SFR',
    constat:
      'Rachat d’une part de SFR : 5,6 Md€ pour environ 4 M de clients mobile et 1 M de fixe, coûts d’intégration d’environ 1,3 Md€ sur 5 ans, closing au plus tôt au second semestre 2027.',
    implication:
      'Un chantier lourd mobilisera le groupe : qualifier le périmètre avant d’y voir un besoin de prestation.',
    entry: 'Direction des systèmes d’information — programme d’intégration',
    processus: 'Converger les systèmes d’information de deux opérateurs',
    livrable: 'Cartographie, plan de convergence, migrations, recette',
    modele: 'Forfait / régie / équipe mixte',
    needs: [
      'Cartographie des applications à converger',
      'Plan de migration des bases clients',
      'Recette de bout en bout des parcours de facturation',
      'Pilotage du programme d’intégration (PMO)',
    ],
  },
  {
    label: 'Transformation SI d’Orange Business et partenariat Tech Mahindra',
    constat:
      'Le partenariat avec Tech Mahindra est effectif : 2 600 salariés transférés ; le chiffre d’affaires de l’entité recule de 3,1 % mais l’IT et l’intégration progressent de 1,3 %.',
    implication: 'L’entité est concurrente et canal de rang 2 : distinguer les deux logiques avant d’approcher.',
    entry: 'Orange Business — direction des opérations',
    processus: 'Reprendre et faire évoluer les services d’intégration transférés',
    livrable: 'Reprise de services, renfort de delivery, transfert de compétences',
    modele: 'Sous-traitance de rang 2 / régie',
    needs: [
      'Renfort de delivery sur les projets d’intégration repris',
      'Transfert de connaissances des équipes transférées',
      'Reprise de services d’infogérance en rang 2',
      'Consolidation des outils de pilotage de la production',
    ],
  },
  {
    label: 'Réseaux : automatisation et 5G autonome',
    constat: 'Plusieurs profils d’automatisation réseau et de plateformes de données réseau sont recherchés à Lannion.',
    implication: 'Des compétences rares : un besoin de renfort durable plutôt qu’une mission ponctuelle.',
    entry: 'Orange Innovation — réseaux',
    processus: 'Automatiser le déploiement et la supervision du réseau',
    livrable: 'Pipelines NetDevOps, outils d’observabilité, intégration OSS/BSS',
    modele: 'Régie / forfait',
    needs: [
      'Automatisation du déploiement des équipements réseau',
      'Observabilité de bout en bout du cœur de réseau',
      'Intégration des systèmes de supervision et de facturation (OSS/BSS)',
      'Modèles de configuration validés avant mise en production',
    ],
  },
  {
    label: 'Extinction du cuivre et bascule vers la fibre',
    constat: 'Fermeture technique du réseau cuivre par zones jusqu’en 2030, avec bascule des abonnés vers la fibre.',
    implication: 'Les systèmes d’exploitation et de facturation de la bascule génèrent de la TMA et des migrations.',
    entry: 'Direction du réseau France — systèmes d’exploitation',
    processus: 'Piloter la bascule des abonnés et adapter les systèmes',
    livrable: 'Évolutions des SI d’exploitation, migrations de données, TMA',
    modele: 'TMA / forfait',
    needs: [
      'Évolution du SI de pilotage des fermetures par zone',
      'Migration des données abonnés vers les offres fibre',
      'TMA des outils d’éligibilité et de prise de rendez-vous',
      'Rationalisation des applicatifs liés au cuivre',
    ],
  },
  {
    label: 'Applications mobiles et digital client',
    constat:
      'Deux besoins de développement mobile sont terminés dans la base ; une offre de développeur mobile est ouverte.',
    implication: 'Un historique à rouvrir avec le contact qui a exprimé les deux premiers besoins.',
    entry: 'Direction du digital — applications client',
    processus: 'Faire évoluer les applications client grand public',
    livrable: 'Fonctionnalités mobiles, API, tests de non-régression',
    modele: 'Régie / forfait',
    needs: [
      'Évolution de l’application client mobile',
      'API et backend pour les parcours de self-care',
      'Automatisation des tests de non-régression mobiles',
      'Accessibilité et performance des parcours digitaux',
    ],
  },
  {
    label: 'SI de vente et de facturation entreprises',
    constat: 'Plusieurs chefs de projet SI de vente aux professionnels et aux PME sont identifiés au dossier.',
    implication: 'Un point d’entrée par les chefs de projet SI, avec un périmètre applicatif connu.',
    entry: 'Direction des systèmes d’information — vente entreprises',
    processus: 'Faire évoluer les SI de vente, de contrat et de facturation B2B',
    livrable: 'Évolutions applicatives, intégrations, recette',
    modele: 'Régie / TMA',
    needs: [
      'Évolution des parcours de vente aux professionnels',
      'Intégration CRM et facturation pour les offres entreprises',
      'Recette des évolutions de tarification',
      'Refonte des API de commande B2B',
    ],
  },
  {
    label: 'Achats et relation fournisseurs',
    constat:
      'Plateforme achats Ivalua depuis 13 ans, portail fournisseurs OFusion, plateforme d’appels d’offres Sprint : le circuit officiel est documenté.',
    implication:
      'S’inscrire par le portail fournisseurs officiel avant tout contact ; le reste se qualifie auprès de l’acheteur.',
    entry: 'Group Sourcing Department',
    processus: 'Faire évoluer les outils achats et leurs intégrations',
    livrable: 'Intégrations Source-to-Pay, portail fournisseurs, catalogues',
    modele: 'Régie / TMA',
    needs: [
      'Intégrations de la plateforme achats avec l’ERP',
      'Évolution du portail fournisseurs',
      'Catalogues PunchOut et signature électronique',
      'Analyse des dépenses et reporting achats',
    ],
  },
  {
    label: 'Finance, pilotage et réduction des coûts',
    constat: 'Objectif 2026 : EBITDAaL en hausse de plus de 4 % et cash-flow organique d’environ 4,3 Md€.',
    implication: 'Les chantiers qui réduisent les coûts d’exploitation du SI sont écoutés en priorité.',
    entry: 'Direction financière — systèmes de pilotage',
    processus: 'Consolider et piloter la performance financière du groupe',
    livrable: 'Outils de consolidation, tableaux de bord, automatisation',
    modele: 'Régie / forfait',
    needs: [
      'Automatisation de la consolidation financière',
      'Tableaux de bord de pilotage des coûts du SI',
      'Rationalisation du parc applicatif',
      'FinOps : suivi et optimisation des dépenses cloud',
    ],
  },
  {
    label: 'Delivery agile et qualité logicielle',
    constat: 'Des coachs agiles, scrum masters et chefs de projet sont relevés parmi les anciens du compte.',
    implication: 'Un besoin de cadrage et de rigueur de delivery, souvent porté par les chefs de projet SI.',
    entry: 'Direction des systèmes d’information — delivery',
    processus: 'Structurer la delivery et la qualité des équipes produit',
    livrable: 'Coaching agile, industrialisation des tests, pilotage de la qualité',
    modele: 'Régie / forfait',
    needs: [
      'Coaching agile et passage à l’échelle',
      'Industrialisation des tests automatisés',
      'Pilotage de la qualité et des indicateurs de delivery',
      'Support de la chaîne d’intégration continue',
    ],
  },
  {
    label: 'Poste de travail, ITSM et exploitation',
    constat: 'Les profils d’exploitation et de support sont fréquents parmi les consultants observés en poste.',
    implication: 'Des besoins récurrents de support et d’exploitation, souvent couverts en rang 2.',
    entry: 'Direction des opérations IT',
    processus: 'Exploiter et supporter l’environnement de travail et les outils ITSM',
    livrable: 'Support N2/N3, automatisation des demandes, exploitation',
    modele: 'Centre de services / régie',
    needs: [
      'Support N2 et N3 des outils ITSM',
      'Automatisation des demandes récurrentes de support',
      'Exploitation d’un parc applicatif en 24/7',
      'Supervision applicative et astreinte',
    ],
  },
]

/** Les hypothèses de besoin — même phrase d'ouverture que Groupe BPCE. */
export function orangeItChallenges(): ItChallenge[] {
  return DOMAINS.flatMap(domain =>
    domain.needs.map((title): ItChallenge => ({
      title,
      description: [
        'Hypothèse commerciale, sans demande externe ni budget ouvert confirmé.',
        `Domaine : ${domain.label}.`,
        `Processus : ${domain.processus}.`,
        `Livrable : ${domain.livrable}.`,
        `Modèle : ${domain.modele}.`,
        `Question de qualification : qui porte ce besoin chez ${domain.entry} et par quel circuit d’achat ?`,
        `Constat : ${domain.constat}`,
        `Implication : ${domain.implication}`,
      ].join(' '),
      severity: null,
      timeframe: null,
    })),
  )
}

export function orangeOpportunityDomains(): KeyNote[] {
  return DOMAINS.map(domain =>
    note(domain.label, domain.constat, null, `${domain.implication} Point d’entrée : ${domain.entry}.`, REL_ANALYTIC),
  )
}

export function orangeAttackAngles() {
  return DOMAINS.map((domain, index) => ({
    title: domain.label,
    description: `${domain.constat} ${domain.implication}`,
    entry_point: domain.entry,
    is_recommended: index === 0,
    rank: index + 1,
  }))
}

/* ------------------------------------------------------------------ */
/* Besoins observés (pains)                                             */
/* ------------------------------------------------------------------ */

const cell = (row: Record<string, string | number | boolean | null>, key: string): string => {
  const value = row[key]
  return value === null || value === undefined ? '' : String(value)
}

const section = (brief: CommercialBrief, key: string) => brief.sections.find(candidate => candidate.key === key)

/** Les besoins du compte : les trois de la base, puis un besoin par offre ouverte, puis deux chantiers lourds. */
export function orangePains(brief: CommercialBrief): PainPoint[] {
  const fromBase = (section(brief, 'besoins-en-base')?.rows ?? []).map((row): PainPoint => ({
    pain: cell(row, 'besoin'),
    business_impact: [
      `Statut : ${cell(row, 'statut')}`,
      cell(row, 'date') && `Date : ${cell(row, 'date')}`,
      cell(row, 'tjm_annonce') && `TJM annoncé : ${cell(row, 'tjm_annonce')} € par jour`,
      cell(row, 'contact') && `Contact : ${cell(row, 'contact')}`,
      'Source : besoins en base du dossier de compte du 12/10/2026',
    ]
      .filter(Boolean)
      .join(' · '),
    esn_offer: 'À qualifier avec le contact du besoin avant de proposer un profil.',
    urgency: null,
  }))
  const fromOffers = ORANGE_OFFERS.map((offer): PainPoint => ({
    pain: `${offer.title} — ${offer.entity}`,
    business_impact: [
      'Besoin de compétence exprimé par une offre d’emploi publiée.',
      offer.city ? `Lieu : ${offer.city}` : null,
      offer.contract ? `Contrat : ${offer.contract}` : null,
    ]
      .filter(Boolean)
      .join(' · '),
    esn_offer: 'Proposer un profil en renfort tant que le poste n’est pas pourvu.',
    urgency: null,
  }))
  const fromProjects: PainPoint[] = [
    {
      pain: 'Convergence des SI après le rachat de SFR — Orange',
      business_impact:
        'Coûts d’intégration d’environ 1,3 Md€ sur 5 ans ; closing au plus tôt au second semestre 2027 · Lecture : le périmètre se prépare avant le closing.',
      esn_offer: 'Cartographie applicative et pilotage de programme dès la phase de préparation.',
      urgency: null,
    },
    {
      pain: 'Exploitation des datacenters souverains — Orange',
      business_impact:
        'Coentreprise de 400 MW, environ 3 Md€, signature attendue avant fin 2026, closing au premier trimestre 2027 · Lecture : un besoin d’exploitation et de supervision à préparer.',
      esn_offer: 'Exploitation, supervision et astreinte des plateformes hébergées.',
      urgency: null,
    },
  ]
  return [...fromBase, ...fromOffers, ...fromProjects]
}

/* ------------------------------------------------------------------ */
/* Programmes (15+), stack (31+), stack détectée (11)                   */
/* ------------------------------------------------------------------ */

export function orangePrograms(brief: CommercialBrief): ProgramName[] {
  const suffix = ' — Orientation documentée, pas mission ouverte : qualifier le lot et le prescripteur.'
  const fromBrief = (section(brief, 'projets-2026-2027')?.rows ?? []).map((row): ProgramName => ({
    name: cell(row, 'projet_tendance'),
    entity: null,
    budget: null,
    description: `${cell(row, 'ce_qui_est_public')}${suffix}`,
  }))
  const added: ProgramName[] = [
    [
      'Lead the Future (2023-2025)',
      'Plan stratégique précédent : réinventer l’opérateur, accélérer dans les services aux entreprises.',
    ],
    ['Net zéro carbone 2040', 'Trajectoire de neutralité carbone du groupe, effets sur les datacenters et le réseau.'],
    [
      'Orange Cyberdefense — montée en charge',
      'Chiffre d’affaires +10,6 % et commandes +15 % au premier semestre 2026.',
    ],
    [
      'Plateforme achats Ivalua et portail OFusion',
      'Circuit d’achat officiel documenté, partenariat de 13 ans avec l’éditeur.',
    ],
    [
      'Intégration SFR — préparation du closing',
      'Examen en cours ; les coûts d’intégration sont estimés à environ 1,3 Md€ sur 5 ans.',
    ],
  ].map(([name, description]) => ({ name, entity: null, budget: null, description: `${description}${suffix}` }))
  return [...fromBrief, ...added]
}

export const ORANGE_DETECTED_TECH_STACK: readonly string[] = [
  'Ivalua (achats Source-to-Pay)',
  'OFusion (portail fournisseurs)',
  'Online Tenders Sprint (appels d’offres)',
  'PunchOut (catalogues)',
  'Signature électronique eIDAS',
  'Cloud de confiance Bleu',
  'Cloud Avenue',
  'Live Intelligence (IA générative)',
  'Sharlie (assistant IA)',
  'Orange Cyberdefense (détection et réponse gérées)',
  'Open RAN et cœur de réseau virtualisé',
]

/* ------------------------------------------------------------------ */
/* Lecture structurelle, vision, plan stratégique (26)                  */
/* ------------------------------------------------------------------ */

export function orangeStructuralAxes(brief: CommercialBrief): KeyNote[] {
  const vision: KeyNote[] = [
    note(
      'Vision — plan « Trust the Future » (horizon 2028)',
      'Le plan 2026-2028 vise 600 M€ d’économies d’opex par l’IA d’ici 2028, avec un cloud de confiance et la cyberdéfense au centre.',
      'Le groupe réduit ses coûts d’exploitation tout en investissant dans la confiance numérique.',
      'Les offres qui font baisser le coût du SI ou renforcent la confiance (cloud, sécurité, IA) sont dans le sens du plan.',
      'Moyen — Light Reading, consulté le 12/10/2026',
    ),
    note(
      'Vision — pilier IA',
      'Assistant Sharlie lancé en France, agents IA déployés chez Orange Business.',
      'L’IA est un levier d’économies avant d’être un produit.',
      'Cibler l’industrialisation et la sécurisation plutôt que l’exploration.',
      'Fort — résultats S1 2026',
    ),
    note(
      'Vision — pilier cloud de confiance',
      'Coentreprise de datacenters souverains avec Morrison (400 MW, environ 3 Md€), signature avant fin 2026, closing au premier trimestre 2027 sous réserve d’approbations.',
      'Le groupe construit une capacité souveraine plutôt que de la louer.',
      'Un besoin d’architecture, de migration et d’exploitation se prépare autour de ces sites.',
      'Fort — résultats S1 2026',
    ),
    note(
      'Vision — pilier cyberdéfense',
      'Orange Cyberdefense : chiffre d’affaires +10,6 %, commandes +15 % au premier semestre 2026.',
      'La cyberdéfense est le segment le plus dynamique du groupe.',
      'Le recrutement de l’entité est un signal de timing à exploiter.',
      'Fort — résultats S1 2026',
    ),
    note(
      'Plan « Lead the Future » 2023-2025 — le plan précédent',
      'Réinventer le métier d’opérateur, accélérer dans les services aux entreprises et valoriser les actifs du groupe.',
      'Le plan suivant prolonge la logique de services et de confiance.',
      'Citer le plan précédent montre que l’on connaît la trajectoire, pas seulement l’actualité.',
      REL_PUBLIC,
    ),
    note(
      'Engagement net zéro carbone à l’horizon 2040',
      'Objectif public de neutralité carbone du groupe.',
      'Un cadre de long terme qui touche les datacenters, le réseau et les achats.',
      'Les offres d’efficience énergétique s’inscrivent dans cet engagement.',
      REL_PUBLIC,
    ),
    note(
      'Rachat d’une part de SFR',
      '5,6 Md€ pour environ 4 M de clients mobile et 1 M de fixe ; coûts d’intégration d’environ 1,3 Md€ sur 5 ans ; closing au plus tôt au second semestre 2027, examen de l’Autorité de la concurrence en cours.',
      'Un chantier de convergence qui mobilisera la DSI plusieurs années.',
      'Qualifier le périmètre avant d’y voir un besoin de prestation.',
      'Fort — résultats S1 2026 ; EDCOM 08/06/2026',
    ),
    note(
      'Orange Business : concurrent et canal de rang 2',
      'Filiale ESN et intégrateur du groupe, dont le chiffre d’affaires recule de 3,1 % au premier semestre 2026 (3 503 M€).',
      'Deux logiques d’achat à distinguer : l’entité vend les mêmes services qu’une ESN, et sous-traite aussi.',
      'Ne jamais présenter l’entité comme un simple client.',
      REL_DOSSIER,
    ),
    note(
      'Partenariat Orange Business × Tech Mahindra',
      'Partenariat effectif depuis le 1er juillet 2026, 2 600 salariés transférés ; l’IT et l’intégration progressent de 1,3 %.',
      'Une partie de la capacité d’intégration passe chez un partenaire mondial.',
      'Un risque de concurrence sur les lots d’intégration, une opportunité sur la reprise de services en rang 2.',
      'Fort — résultats S1 2026',
    ),
    note(
      'Une structure multi-entités',
      'Neuf entités rattachées au dossier, dont Orange Business, Orange Cyberdefense et Orange Labs ; des filiales hors de France sont relevées sous leur propre nom.',
      'Chaque entité a son budget et ses achats.',
      'Traiter chaque entité comme un compte à part entière.',
      REL_DOSSIER,
    ),
    note(
      'Organigramme reconstitué, pas officiel',
      'Aucun organigramme officiel trouvé : l’arbre est reconstitué à partir des entités et des villes des profils.',
      'Une reconstitution n’est pas une preuve de rattachement.',
      'Le présenter comme tel en rendez-vous.',
      'Garde-fou',
    ),
    note(
      'Aucun référencement ESN confirmé',
      '59 ESN vues en poste dans l’export 2024, 20 anciennes, 43 en rang 2 ouvert ; aucun panel ESN public trouvé.',
      'Une présence observée n’est pas un référencement.',
      'Ne jamais dire à un acheteur qu’une ESN est référencée.',
      REL_DOSSIER,
    ),
  ]
  const achats = (section(brief, 'achats-avant-d-appeler')?.rows ?? []).map(row =>
    note(
      `Achats — ${cell(row, 'nom') || cell(row, 'element')}`,
      cell(row, 'ce_que_c_est') || 'Aucun élément public ou interne trouvé.',
      cell(row, 'element') || null,
      cell(row, 'ce_que_tu_dois_avoir_en_tete') || null,
      cell(row, 'fiabilite') || REL_DOSSIER,
    ),
  )
  const fiche = (section(brief, 'fiche-compte')?.rows ?? [])
    .filter(row => cell(row, 'valeur') !== 'non trouvé')
    .map(row =>
      note(`Fiche — ${cell(row, 'champ')}`, cell(row, 'valeur'), null, null, cell(row, 'fiabilite') || REL_DOSSIER),
    )
  return [...vision, ...achats, ...fiche]
}

export function orangeEcosystem(): KeyNote[] {
  return [
    note(
      'Capgemini — première ESN vue en poste',
      'Huit consultants observés dans l’export 2024 ; partenaire de l’offre de cloud de confiance Bleu.',
      'La première ESN observée est aussi un partenaire de la stratégie cloud.',
      'Un concurrent direct, mais aussi un canal de sous-traitance possible.',
      'Observé — export 2024',
    ),
    note(
      'Tech Mahindra — partenaire mondial d’Orange Business',
      '2 600 salariés transférés au 1er juillet 2026.',
      'La capacité d’intégration passe en partie chez un partenaire mondial.',
      'Reprise de services et rang 2 : une porte d’entrée possible.',
      'Fort — résultats S1 2026',
    ),
    note(
      'Rang 2 ouvert chez 43 ESN',
      '43 ESN sont vues en rang 2 ouvert sur les profils en poste.',
      'Le compte achète déjà par intermédiaires.',
      'Une entrée en rang 2 est plausible sans référencement direct.',
      'Observé — export 2024',
    ),
    note(
      'Ivalua — plateforme achats',
      'Partenariat de 13 ans ; l’éditeur cite le groupe dans une étude de cas.',
      'Discours d’éditeur, pas un référencement de prestataires.',
      'S’inscrire par le portail fournisseurs officiel.',
      'Moyen — discours éditeur',
    ),
  ]
}

/* ------------------------------------------------------------------ */
/* Indicateurs (42), fiabilité (24)                                     */
/* ------------------------------------------------------------------ */

export function orangeFinancialIndicators(brief: CommercialBrief): KeyNote[] {
  const market = (section(brief, 'marche')?.rows ?? []).map(row => ({
    ...note(
      cell(row, 'indicateur'),
      `${cell(row, 'valeur')} — ${cell(row, 'source')}`,
      null,
      null,
      cell(row, 'fiabilite') || REL_DOSSIER,
    ),
    period: cell(row, 'consulte_le') || null,
  }))
  const kpis = brief.kpis.map(kpi =>
    note(
      `Repère — ${kpi.label.toLowerCase()}`,
      `${String(kpi.value)}${kpi.caption ? ` — ${kpi.caption}` : ''}`,
      null,
      null,
      REL_DOSSIER,
    ),
  )
  const projects = (section(brief, 'projets-2026-2027')?.rows ?? []).map(row =>
    note(
      `Projet — ${cell(row, 'projet_tendance')}`,
      `${cell(row, 'ce_qui_est_public')}`,
      cell(row, 'horizon') ? `Horizon : ${cell(row, 'horizon')}` : null,
      null,
      REL_DOSSIER,
    ),
  )
  const cities = (brief.charts[0]?.items ?? []).map(item =>
    note(
      `Consultants observés — ${item.label}`,
      `${item.value} consultants observés (ville du consultant, export 2024)`,
      null,
      'Ville du consultant, pas site Orange confirmé.',
      'Observé — export 2024',
    ),
  )
  const esn = (brief.charts[1]?.items ?? [])
    .slice(0, 8)
    .map(item =>
      note(
        `ESN vue en poste — ${item.label}`,
        `${item.value} consultants observés dans l’export 2024`,
        null,
        'Présence observée, pas un référencement.',
        'Observé — export 2024',
      ),
    )
  // Aucune offre collectée ⇒ aucune ligne (on n'affiche pas ce qu'on n'a pas).
  const offers =
    ORANGE_OFFERS.length > 0
      ? [
          note(
            'Offres d’emploi IT ouvertes',
            `${ORANGE_OFFERS.length} offres d’ingénierie et d’IT ouvertes sur les entités du dossier, sans stage.`,
            'Un signal de timing, pas une mission externe.',
            'Proposer du renfort sur les postes les plus anciens.',
            REL_PUBLIC,
          ),
        ]
      : []
  return [...market, ...kpis, ...projects, ...cities, ...esn, ...offers]
}

/**
 * 14/10/2026 (recette démo) — « Technologies en place » affichait « Non mesuré » alors que la section TECHNOS du brief en
 * porte déjà : la façade du compte (`account-intelligence-context`) lit `raw_analysis.technology_stack`, que BPCE remplit
 * et qu'Orange laissait vide. Une ligne par technologie citée par une offre réelle ou un profil du relevé — le même
 * relevé que la section TECHNOS (`orangeTechLines`), jamais une pile devinée.
 */
export function orangeTechnologyStack(): TechnologyEntry[] {
  return orangeTechLines().map(line => ({
    name: line.label,
    usage: [
      line.needs > 0 ? `citée dans ${line.needs} offre(s) d’emploi du groupe` : null,
      line.profiles > 0 ? `${line.profiles} profil(s) observé(s) au relevé` : null,
    ]
      .filter(Boolean)
      .join(' · '),
    maturity: null,
  }))
}

/** Fiabilité du dossier (grille de collecte, sur 100) — niveau « moyen » : sources publiques datées, mais siège et panel ESN non confirmés. */
export const ORANGE_DATA_CONFIDENCE = 58

/**
 * 14/10/2026 — « ESN déjà en place » : la carte lit `raw_analysis.competitors` (comme Groupe BPCE). Les ESN du dossier
 * y entrent sous leur nom, avec leur périmètre ; AUCUNE force ni faiblesse (le dossier n'en dit rien — on ne les invente pas).
 */
export function orangeCompetitors(brief: CommercialBrief) {
  const seen = new Set<string>()
  const competitors: { name: string; contract_type: string | null; strengths: null; weaknesses: null }[] = []
  for (const esn of brief.esn) {
    if (seen.has(esn.name)) continue
    seen.add(esn.name)
    competitors.push({ name: esn.name, contract_type: esn.perimeter ?? null, strengths: null, weaknesses: null })
  }
  return competitors
}

/**
 * 14/10/2026 (recette démo) — la lecture en SEPT AXES et ses réserves, semées pour qu'aucun bandeau « antérieure à la
 * lecture en sept axes » ne s'affiche sur un compte semé (Groupe BPCE la porte via son relevé). Chaque axe cite la
 * matière DÉJÀ semée (offres, besoins, domaines, ESN citées) ; un axe que le dossier ne permet pas de juger reste
 * « inconnu » et NOMMÉ (GA-18 / GA-19) — jamais un zéro, jamais une valeur devinée.
 */
export function orangeDossierRead(brief: CommercialBrief) {
  const offers = ORANGE_OFFERS.length
  return {
    axes: [
      {
        key: 'adequation_offre',
        state: 'unknown',
        impact:
          'Le dossier public dit ce qu’Orange cherche, pas ce que ton ESN vend : l’adéquation se juge sur tes domaines d’offre.',
        lever: 'Renseigner tes domaines d’offre pour comparer aux chantiers cloud, cyber, IA et data du plan.',
      },
      {
        key: 'potentiel_commercial',
        state: 'measured',
        value: 4,
        impact: `${offers} offres d’ingénierie et d’IT ouvertes, ${ORANGE_OBSERVED_NEEDS_COUNT} besoins relevés et 14 domaines d’opportunité : le volume existe, entité par entité.`,
        lever: 'Partir d’un poste ouvert ancien pour proposer du renfort.',
      },
      {
        key: 'fraicheur',
        state: 'partial',
        value: 3,
        impact:
          'Le plan stratégique et les résultats du premier semestre 2026 sont publics et datés ; les dates des offres se décalent à chaque consultation.',
        lever: 'Recouper les chiffres du semestre avec le PDF des résultats avant de les citer.',
      },
      {
        key: 'accessibilite',
        state: 'measured',
        value: 2,
        impact: 'Aucun référencement ESN n’est confirmé : le circuit passe par le portail fournisseurs officiel.',
        lever: 'Qualifier le circuit prestataire IT directement auprès de l’acheteur.',
      },
      {
        key: 'concurrence',
        state: 'partial',
        value: 3,
        impact: `${brief.esn.length} ESN sont citées au dossier, sans panel confirmé : la pression est réelle mais mal cadrée.`,
        lever: 'Viser un périmètre ou une entité où aucun titulaire n’est cité.',
      },
      {
        key: 'capacite_achat_externe',
        state: 'unknown',
        impact: 'Panel ESN, grille tarifaire et procédure prestataire IT : non trouvés dans les sources publiques.',
        lever: 'Le demander au premier échange avec l’acheteur.',
      },
      {
        key: 'qualite_preuves',
        state: 'partial',
        value: 3,
        impact: 'Faits publics sourcés et datés, mais siège non confirmé et organigramme reconstitué.',
        lever: 'Revalider les contacts « en poste » avant tout usage commercial.',
      },
    ],
    reliability: {
      quality: {
        state: 'partial',
        value: 58,
        note: 'Sources publiques datées ; siège, forme juridique et bilans non trouvés.',
      },
      coverage: {
        state: 'partial',
        value: 50,
        note: `${brief.entities.length} entités du dossier sur un groupe de plus de 50 unités.`,
      },
      freshness: { state: 'partial', value: 70, note: 'Dossier et collecte d’offres d’octobre 2026.' },
    },
    missing: [
      {
        label: 'Le panel ESN et la grille tarifaire',
        why: 'Non trouvés : à qualifier directement auprès de l’acheteur.',
      },
      {
        label: 'Le siège social confirmé',
        why: 'Le dossier porte « Paris » ; Issy-les-Moulineaux reste une hypothèse.',
      },
    ],
  }
}

export function orangeReliabilityNotes(brief: CommercialBrief): KeyNote[] {
  const guardrails = brief.guardrails.map(item =>
    note(item.point, item.detail, 'Lacune ou limite déclarée.', 'Ne pas affirmer avant vérification.', 'Garde-fou'),
  )
  const added: [string, string][] = [
    ['Siège social non confirmé', 'Le dossier porte « Paris » ; Issy-les-Moulineaux est une hypothèse à vérifier.'],
    ['Forme juridique, capital, NAF et bilans : non trouvés', 'Seul le SIREN est confirmé.'],
    [
      'Effectif et nombre de pays : source éditeur',
      'Environ 127 000 salariés et 26 pays selon une étude de cas d’éditeur.',
    ],
    [
      'Panel ESN, grille tarifaire et procédure prestataire IT : non trouvés',
      'À qualifier directement auprès de l’acheteur.',
    ],
    ['Aucun prix observé', 'Un seul TJM annoncé au dossier (900 € par jour) ; aucune moyenne n’est calculée.'],
    ['Signature du rachat de SFR : conditions suspensives', 'Examen de l’Autorité de la concurrence en cours.'],
    [
      'Datacenters souverains : sous réserve d’approbations',
      'Signature attendue avant fin 2026, closing au premier trimestre 2027.',
    ],
    [
      'Plan « Trust the Future » : source secondaire',
      'Chiffres issus d’un article de presse spécialisée, confiance moyenne.',
    ],
    [
      'Chiffres du premier semestre 2026 lus par extraction automatique',
      'À recouper avec le PDF des résultats avant de citer un chiffre à un client.',
    ],
    ['Orange Business : deux logiques à distinguer', 'Concurrent et canal de rang 2.'],
    ['Contacts « en poste » : export 2024', 'À revalider avant tout usage commercial.'],
    ['Villes des consultants', 'Ville du consultant, pas site Orange confirmé.'],
    ['Organigramme reconstitué', 'Aucun lien hiérarchique n’est donné pour vérifié.'],
    ['Étude de cas Ivalua', 'Discours d’éditeur : ni référencement, ni preuve de « tous les modules ».'],
    ['Besoins en base : historique mince', 'Trois besoins seulement ; à présenter comme un point de départ.'],
  ]
  return [
    ...guardrails,
    ...added.map(([label, constat]) =>
      note(label, constat, 'Lacune déclarée.', 'Ne pas affirmer avant vérification.', 'Garde-fou'),
    ),
  ]
}

/* ------------------------------------------------------------------ */
/* Unités du groupe (55) et chaîne d'achat                              */
/* ------------------------------------------------------------------ */

const UNITS: readonly (readonly [string, string])[] = [
  ['Orange France', 'Entité du groupe'],
  ['Orange Business', 'Entité du groupe'],
  ['Orange Cyberdefense', 'Entité du groupe'],
  ['Orange Innovation', 'Pôle fonctionnel'],
  ['Orange Wholesale & International Networks', 'Entité du groupe'],
  ['Orange Marine', 'Entité du groupe'],
  ['Orange Bank', 'Entité du groupe'],
  ['Orange Concessions', 'Entité du groupe'],
  ['Totem', 'Entité du groupe'],
  ['Sofrecom', 'Entité du groupe'],
  ['Orange Digital Center', 'Pôle fonctionnel'],
  ['Orange Money', 'Entité du groupe'],
  ['Orange Studio', 'Entité du groupe'],
  ['Orange Ventures', 'Entité du groupe'],
  ['Bleu', 'Coentreprise'],
  ['MasOrange', 'Coentreprise'],
  ['Orange Polska', 'Entité hors de France'],
  ['Orange Belgium', 'Entité hors de France'],
  ['Orange Luxembourg', 'Entité hors de France'],
  ['Orange Slovensko', 'Entité hors de France'],
  ['Orange Moldova', 'Entité hors de France'],
  ['Orange Egypt', 'Entité hors de France'],
  ['Orange Jordan', 'Entité hors de France'],
  ['Orange Maroc', 'Entité hors de France'],
  ['Orange Tunisie', 'Entité hors de France'],
  ['Orange Sénégal', 'Entité hors de France'],
  ['Orange Côte d’Ivoire', 'Entité hors de France'],
  ['Orange Cameroun', 'Entité hors de France'],
  ['Orange République démocratique du Congo', 'Entité hors de France'],
  ['Orange Mali', 'Entité hors de France'],
  ['Orange Guinée', 'Entité hors de France'],
  ['Orange Madagascar', 'Entité hors de France'],
  ['Orange Botswana', 'Entité hors de France'],
  ['Orange Caraïbe', 'Entité d’outre-mer'],
  ['Orange Réunion et Mayotte', 'Entité d’outre-mer'],
  ['Direction des systèmes d’information', 'Domaine fonctionnel SI'],
  ['Group Sourcing Department', 'Domaine fonctionnel SI'],
  ['Direction data et IA', 'Domaine fonctionnel SI'],
  ['Direction de la cybersécurité', 'Domaine fonctionnel SI'],
  ['Direction du réseau France', 'Pôle fonctionnel'],
  ['Direction du digital et des applications client', 'Pôle fonctionnel'],
  ['Direction financière', 'Pôle fonctionnel'],
  ['Direction des ressources humaines', 'Pôle fonctionnel'],
  ['Direction de la responsabilité d’entreprise', 'Pôle fonctionnel'],
  ['Direction des opérations IT', 'Domaine fonctionnel SI'],
  ['Cloud et plateformes', 'Capacité de service SI'],
  ['Exploitation et supervision', 'Capacité de service SI'],
  ['Intégration et delivery', 'Capacité de service SI'],
  ['Pilotage de programmes', 'Capacité de service SI'],
  ['Architecture d’entreprise', 'Capacité de service SI'],
  ['Qualité et tests', 'Capacité de service SI'],
  ['Données de pilotage', 'Capacité de service SI'],
  ['Marché grand public', 'Segment de reporting'],
  ['Marché entreprises', 'Segment de reporting'],
  ['Réseaux et services', 'Segment de reporting'],
  ['Programme d’intégration SFR', 'Programme transverse'],
]

export const ORANGE_ORG_UNITS = UNITS.map(([entity, level]) => ({
  entity,
  level,
  contacts: [] as string[],
  missingRoles: [] as string[],
}))

export const ORANGE_DECISION_CHAIN = {
  description:
    'Group Sourcing Department : plus de 60 000 fournisseurs, 26 affiliés. Plateforme achats Ivalua, portail fournisseurs OFusion, appels d’offres sur Sprint, catalogues PunchOut. Panel ESN, grille tarifaire et procédure prestataire IT : non trouvés — à qualifier auprès de l’acheteur.',
  steps: [
    { step: 'S’inscrire sur le portail fournisseurs officiel (OFusion)', actors: [] as string[], duration: null },
    {
      step: 'Identifier la catégorie d’achat et l’acheteur du Group Sourcing Department',
      actors: [] as string[],
      duration: null,
    },
    {
      step: 'Qualifier le circuit : direct, Orange Business en rang 2 ou ESN déjà en place',
      actors: [] as string[],
      duration: null,
    },
    { step: 'Répondre aux consultations publiées sur Online Tenders Sprint', actors: [] as string[], duration: null },
    {
      step: 'Contractualiser et intégrer le catalogue (PunchOut, signature électronique)',
      actors: [] as string[],
      duration: null,
    },
  ],
}

export const ORANGE_BUSINESS_DESCRIPTION =
  'Orange : opérateur de télécommunications qui sert le grand public et les entreprises (par Orange Business et Orange Cyberdefense). Le plan « Trust the Future » (2026-2028) vise 600 M€ d’économies d’opex par l’IA, un cloud de confiance et la cyberdéfense ; le rachat d’une part de SFR et les datacenters souverains sont les deux chantiers lourds de la période.'

/* ------------------------------------------------------------------ */
/* Le brief « Ce que je sais » complété                                 */
/* ------------------------------------------------------------------ */

type BriefSection = CommercialBrief['sections'][number]

const PLAN_ROWS: readonly [string, string, string, string][] = [
  [
    'Semaine 1',
    'Prérequis',
    'S’inscrire sur le portail fournisseurs OFusion et repérer la plateforme Sprint des appels d’offres.',
    'Sans inscription officielle, aucune réponse n’est possible.',
  ],
  [
    'Semaine 1',
    'Cartographie',
    'Choisir le circuit : direct auprès d’un manager opérationnel, rang 2 par Orange Business, ou ESN déjà en place.',
    'Le circuit détermine le prix et l’accès.',
  ],
  [
    'Semaine 2',
    'Qualifier les décideurs',
    'Contacter les sept décideurs du dossier et revalider les contacts « en poste » de l’export 2024.',
    'Un contact en poste est à revalider avant tout usage commercial.',
  ],
  [
    'Semaine 2',
    'Offres ouvertes',
    'Relever les offres d’emploi IT les plus anciennes et proposer un profil en renfort au manager concerné.',
    'Un poste ouvert depuis plusieurs semaines est un besoin non couvert.',
  ],
  [
    'Semaine 3',
    'Besoin en présentation',
    'Reprendre le besoin « Data & Analytics Engineer » en présentation et qualifier le contact.',
    'Seul besoin en cours de la base : il peut ouvrir la porte.',
  ],
  [
    'Semaine 3',
    'Historique mobile',
    'Rouvrir les deux missions de développement mobile terminées avec leur contact.',
    'Une relation existante vaut mieux qu’une approche à froid.',
  ],
  [
    'Semaine 4',
    'Orange Cyberdefense',
    'Approcher l’entité en croissance (+10,6 % de chiffre d’affaires) sur ses besoins de détection et de réponse.',
    'L’entité recrute : la montée en charge est un signal de timing.',
  ],
  [
    'Semaine 4',
    'Cloud de confiance',
    'Préparer une offre d’architecture et d’exploitation autour des datacenters souverains.',
    'La signature est attendue avant fin 2026 : le besoin se prépare dès maintenant.',
  ],
  [
    'Mois 2',
    'Intégration SFR',
    'Préparer une offre de cartographie applicative et de pilotage de programme pour la convergence des SI.',
    'Le closing est attendu au plus tôt au second semestre 2027 : se placer avant.',
  ],
]

/**
 * Complète le brief du dossier de compte (`orange.json`, généré et jamais édité) : postes ouverts, technologies à vendre,
 * plan d'action, trois projets, deux rubriques « Ce que je sais » et un graphique — les mêmes sections que Groupe BPCE
 * porte (`postes-ouverts`, `technos-a-vendre`, `plan-d-action`). Un garde-fou périmé (« aucun signal en base ») est mis à jour.
 */
export function enrichOrangeBrief(base: CommercialBrief): CommercialBrief {
  const signals = orangePublicSignals()
  const projectSignals = signals.filter(signal => signal.id?.startsWith('orange-projet-'))
  const columns = (...entries: [string, string][]): BriefSection['columns'] =>
    entries.map(([key, label]) => ({ key, label }))

  const projectRows = projectSignals.map(signal => ({
    projet_tendance: signal.signal ?? '',
    horizon: signal.date ?? null,
    ce_qui_est_public: signal.impact ?? null,
    url: null,
  }))
  const projets: BriefSection[] = base.sections.map(candidate =>
    candidate.key === 'projets-2026-2027' ? { ...candidate, rows: [...candidate.rows, ...projectRows] } : candidate,
  )

  const postes: BriefSection = {
    key: 'postes-ouverts',
    title: 'POSTES OUVERTS',
    // 14/10/2026 : plus de colonne VILLE — la source ne la rend pas pour six offres sur seize, et une cellule vide n'est
    // pas « non trouvé » (on n'affiche pas ce qu'on n'a pas). La ville, quand elle est connue, ouvre le détail.
    columns: columns(['poste_ouvert', 'POSTE OUVERT'], ['detail', 'DÉTAIL'], ['url', 'LIEN']),
    rows: ORANGE_OFFERS.map(offer => ({
      poste_ouvert: offer.title,
      detail: [
        `${offer.entity}.`,
        offer.city ? `Lieu : ${offer.city}.` : null,
        offer.contract ? `Contrat : ${offer.contract}.` : null,
      ]
        .filter(Boolean)
        .join(' '),
      url: offer.url,
    })),
  }

  // 14/10/2026 : BESOINS (un par offre réelle) et TECHNOS (citées par une offre ou un profil du relevé) — parité BPCE.
  const needs = orangeNeedsSection()
  const technos = orangeTechnosSection()

  const plan: BriefSection = {
    key: 'plan-d-action',
    title: 'PLAN',
    columns: columns(['quand', 'QUAND'], ['action', 'ACTION'], ['quoi_faire', 'QUOI FAIRE'], ['pourquoi', 'POURQUOI']),
    rows: PLAN_ROWS.map(([quand, action, quoi_faire, pourquoi]) => ({ quand, action, quoi_faire, pourquoi })),
  }

  const insertAfter = projets.findIndex(candidate => candidate.key === 'besoins-en-base')
  const at = insertAfter >= 0 ? insertAfter + 1 : projets.length
  // Aucune offre collectée ⇒ pas d'onglet « POSTES OUVERTS » vide.
  const sections = [
    ...projets.slice(0, at),
    ...(ORANGE_OFFERS.length > 0 ? [postes] : []),
    ...(needs ? [needs] : []),
    ...(technos ? [technos] : []),
    plan,
    ...projets.slice(at),
  ]

  return {
    ...base,
    what_i_know: [
      ...base.what_i_know.map(row =>
        row.rubric === 'BESOINS' && ORANGE_OBSERVED_NEEDS_COUNT > 0
          ? {
              ...row,
              meaning:
                'L’historique du dossier reste mince (un seul besoin en cours, deux missions sans date) ; les besoins observés viennent d’offres publiées, pas de missions : un point de départ à qualifier.',
              known: `${row.known.replace(/^3 besoins en base : /, '3 besoins en base du dossier : ')} S’y ajoutent ${ORANGE_OBSERVED_NEEDS_COUNT} besoins observés dans des offres d’emploi réelles du groupe (rubrique BESOINS).`,
            }
          : row,
      ),
      ...(ORANGE_OFFERS.length > 0
        ? [
            {
              rubric: 'RECRUTEMENT',
              known: `${ORANGE_OFFERS.length} offres d’emploi IT ouvertes, aucun stage.`,
              meaning:
                'Des postes non pourvus sont des besoins de compétence : proposer un profil en renfort au manager concerné.',
            },
          ]
        : []),
      {
        rubric: 'VISION / PLAN STRATÉGIQUE',
        known:
          'Plan « Trust the Future » 2026-2028 : 600 M€ d’économies d’opex par l’IA, cloud de confiance, cyberdéfense. Il prolonge « Lead the Future » (2023-2025) et le net zéro carbone à 2040.',
        meaning:
          'Un plan stratégique est une orientation, pas une consultation : il explique où les besoins vont naître.',
      },
    ],
    // Le graphique « postes ouverts » (parité BPCE) se lit dans les offres RÉELLES : un décompte par entité du groupe,
    // jamais un métier deviné. Ajouté EN FIN de liste : `charts[0]` / `charts[1]` restent ceux du dossier.
    charts: [
      ...base.charts,
      ...(ORANGE_OFFERS.length > 0
        ? [
            {
              title: 'POSTES OUVERTS PAR ENTITÉ',
              items: [...new Set(ORANGE_OFFERS.map(offer => offer.entity))]
                .map(entity => ({
                  label: entity,
                  value: ORANGE_OFFERS.filter(offer => offer.entity === entity).length,
                }))
                .sort((a, b) => b.value - a.value),
            },
          ]
        : []),
    ],
    sections,
    guardrails: base.guardrails.map(item =>
      item.point.startsWith('Signaux, appels d’offres')
        ? {
            point: 'Appels d’offres, roadmap DSI et budgets IT : non trouvés',
            detail:
              'Aucun appel d’offres Orange en base ; les offres d’emploi et les plans stratégiques sont des signaux, pas des consultations.',
          }
        : item,
    ),
  }
}

export const ORANGE_IT_IMPLICATIONS =
  'Orange Business est à la fois concurrent et canal de rang 2 : deux logiques d’achat à distinguer. Aucun référencement ESN n’est confirmé ; la présence observée de 59 ESN en poste montre que le compte achète déjà par intermédiaires. Pour une ESN, l’entrée la plus réaliste passe par le portail fournisseurs officiel, puis par un manager opérationnel qui exprime un besoin (data, cloud souverain, cyber, intégration SFR).'
