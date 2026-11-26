import { SG_COMPTE_COMPLET_CSV } from './data/sg-compte-complet.generated'
import { buildDemoOrgGraph } from './demo-org-graph'
import { seatName } from './demo-seat-names'
import { mapSgOrgGraphEntities } from './sg-csv-complement'
import { parseCompteCsvRows } from './compte-csv-parser'

/**
 * Les graphes d’organisation des dossiers de démonstration.
 *
 * Ils vivent dans leur propre fichier parce qu'ils sont la seule partie du jeu
 * de données à porter de l'intégrité référentielle : chaque nom cité ici DOIT
 * être un contact seedé du même dossier (`demo-org-graphs.spec.ts` le vérifie
 * dossier par dossier). Une personne du graphe absente des contacts ne casse
 * rien de visible — elle disparaît simplement du dessin, avec son trait.
 *
 * ⚠️ CE QUI A CHANGÉ AVEC LES SOCIÉTÉS RÉELLES. Ces graphes portaient onze
 * personnes inventées par dossier, toutes reliées entre elles avec assurance.
 * Sur une société réelle, cette assurance-là n'existe pas : le registre publie
 * un ou deux mandataires sociaux, et RIEN d'autre. Le reste de l'organisation
 * est fait de SIÈGES de décision — un rôle, une entité, une place dans la
 * chaîne — dont la personne reste à nommer.
 *
 * Trois conséquences, qui sont exactement ce qu'un vrai run produit :
 *
 * 1. Les seuls liens VÉRIFIÉS partent des mandataires du registre. Un lien
 *    vérifié cite sa preuve et reste au-dessus de 90.
 * 2. Tout le reste est INFÉRÉ, sous 80, en pointillé à l'écran. C'est honnête :
 *    personne n'a publié que tel responsable rapporte à tel autre.
 * 3. Aucun lien ne descend d'une personne du registre vers un siège de
 *    décision. Le registre nomme des mandataires ; il ne dit pas qui rapporte
 *    à qui. Déduire une hiérarchie d'une mise en page serait de la donnée
 *    inventée — la même règle que celle qui interdit à `official_directory` de
 *    poser un `reports_to`.
 *
 * Les ENTITÉS, elles, sont solides : ce sont des sociétés immatriculées, avec
 * leur numéro. C'est la partie du graphe qui vaut le plus sur un grand groupe,
 * et c'est celle qu'on peut affirmer.
 */

/** Le registre du commerce — la seule source de niveau A dont on dispose sur
 *  des personnes, et elle ne nomme que les mandataires sociaux. */
const REGISTRY = { kind: 'registry' as const, grounding: 'A' as const, date: '2026-08-11' }
/** La presse et les communiqués — datés, publics, mais sur des faits, pas sur
 *  des rattachements hiérarchiques. */
const PRESS = { kind: 'press' as const, grounding: 'A' as const, date: '2026-07-01' }
/** Ce que l'analyse DÉDUIT : un siège de décision existe forcément dans une
 *  organisation de cette taille, mais personne ne l'a publié. */
const INFERRED = { kind: 'llm' as const, grounding: 'C' as const, date: '2026-08-11' }

/**
 * #4509 — les personnes du graphe qui n'ont VOLONTAIREMENT pas de fiche contact semée, par dossier. Une exemption
 * NOMMÉE de la garde « chaque personne du graphe est un contact seedé » : sans elle, la démo ne pourrait pas montrer
 * « Créer sa fiche » (`demo-org-person-without-record-coverage.spec.ts`).
 */
export const DEMO_ORG_PEOPLE_WITHOUT_RECORD: Readonly<Record<string, readonly string[]>> = {
  SNCF: ['Camille Rivière'],
}

/* ------------------------------------------------------------------ */
/* Société Générale                                                    */
/* ------------------------------------------------------------------ */

export const societeGeneraleOrgGraph = buildDemoOrgGraph({
  // #2919/#2310.15 — vue « Relations workspace » (`WorkspaceRelationsView`) :
  // sans un edge relationnel seedé sur au moins un dossier, la vue restait
  // vide en démo comme sur tout compte réel non rejoué (même motif que les
  // quatre vues qui l'ont précédée avant leur premier producteur de données).
  relationalEdges: [
    {
      from: 'Pierre Palmieri',
      to: 'e-sg-plan',
      type: 'owns_project',
      scope: 'workspace',
      author: 'Pierre Palmieri',
      confidence: 62,
    },
  ],
  // #2284.14 — un homonyme écarté se nomme homonyme (jeu de démonstration fictif).
  rejected: [
    {
      sourceId: 'e-societe-generale-de-surveillance',
      reason: 'entité écartée (homonyme : même nom, autre entreprise)',
      entityKind: 'homonym',
    },
  ],
  // Complément du 28/09/2026 (retour de démo) : la vue Groupe ne montrait que
  // les quatre entités ci-dessous. Les 31 unités du bloc 02 et les 52 entités
  // du bloc 09 du CSV importé le 27/09 — chacune citant sa ligne source.
  extraEntities: mapSgOrgGraphEntities(parseCompteCsvRows(SG_COMPTE_COMPLET_CSV)),
  entities: [
    {
      id: 'e-sg',
      name: 'Société Générale',
      type: 'groupe',
      parentId: null,
      confidence: 98,
      evidence: { ...REGISTRY, ref: 'SIREN 552120222' },
    },
    {
      id: 'e-sg-dsi',
      name: 'Direction des systèmes d’information groupe',
      type: 'bu',
      // #2284.7 — une DSI est une direction métier, pas une business unit.
      entityKind: 'business_direction',
      parentId: 'e-sg',
      confidence: 70,
      evidence: { ...INFERRED, ref: 'Déduit de la taille du groupe — aucune source ne la décrit' },
    },
    {
      id: 'e-sg-treezor',
      name: 'Treezor',
      type: 'filiale',
      parentId: 'e-sg',
      confidence: 96,
      evidence: { ...REGISTRY, ref: 'SIREN 807465059' },
    },
    {
      id: 'e-sg-bourso',
      name: 'Boursorama / BoursoBank',
      type: 'filiale',
      parentId: 'e-sg',
      confidence: 96,
      evidence: { ...REGISTRY, ref: 'SIREN 351058151' },
    },
    {
      id: 'e-sg-plan',
      name: 'Plan stratégique à horizon 2029',
      type: 'programme',
      parentId: 'e-sg',
      confidence: 85,
      evidence: { ...PRESS, ref: 'Annonce d’un plan à horizon 2029 pour la fin 2026 (L’Agefi)' },
    },
  ],
  people: [
    {
      name: 'Lorenzo Bini Smaghi',
      title: 'Président du conseil d’administration',
      entityId: 'e-sg',
      family: 'C-Level',
      level: 'L0',
      roles: ['economic_buyer'],
      confidence: 98,
      evidence: { ...REGISTRY, ref: 'Mandataire social — SIREN 552120222' },
    },
    {
      name: 'Pierre Palmieri',
      title: 'Directeur général délégué',
      entityId: 'e-sg',
      family: 'C-Level',
      level: 'L1',
      roles: ['economic_buyer'],
      confidence: 98,
      evidence: { ...REGISTRY, ref: 'Mandataire social — SIREN 552120222' },
    },
    {
      name: seatName('Directeur des systèmes d’information groupe'),
      title: 'Directeur des systèmes d’information groupe',
      entityId: 'e-sg-dsi',
      family: 'IT',
      level: 'L1',
      roles: ['technical_buyer'],
      confidence: 62,
      evidence: { ...INFERRED, ref: 'Siège de décision déduit — titulaire fictif de démonstration' },
    },
    {
      name: seatName('Directeur des systèmes d’information — filiale de services de paiement'),
      title: 'Directeur des systèmes d’information — filiale de services de paiement',
      entityId: 'e-sg-treezor',
      family: 'IT',
      level: 'L2',
      roles: ['technical_buyer'],
      confidence: 64,
      evidence: {
        ...INFERRED,
        ref: 'Siège de décision déduit — filiale immatriculée, titulaire fictif de démonstration',
      },
    },
    {
      name: seatName('Responsable data & intelligence artificielle de business unit'),
      title: 'Responsable data & intelligence artificielle de business unit',
      entityId: 'e-sg-dsi',
      family: 'Data',
      level: 'L2',
      roles: ['technical_buyer', 'champion'],
      confidence: 58,
      evidence: { ...INFERRED, ref: 'Déduit du sujet public d’IA générative documentaire' },
    },
    {
      name: seatName('Responsable sécurité applicative'),
      title: 'Responsable sécurité applicative',
      entityId: 'e-sg-dsi',
      family: 'Cyber',
      level: 'L3',
      roles: ['technical_buyer'],
      confidence: 56,
      evidence: { ...INFERRED, ref: 'Siège de décision déduit — titulaire fictif de démonstration' },
    },
    {
      name: seatName('Architecte du système d’information groupe'),
      title: 'Architecte du système d’information groupe',
      entityId: 'e-sg-dsi',
      family: 'IT',
      level: 'L3',
      roles: ['influencer'],
      confidence: 52,
      // #2553 / #3740 — un organigramme IMPORTÉ (PDF de 2023) : la source nomme son
      // année et la vérification porte la date du DOCUMENT, donc la carte dit
      // « à vérifier » — exactement ce qu'un import réel produit.
      evidence: {
        kind: 'org_chart' as const,
        grounding: 'A' as const,
        date: '2023-06-01',
        ref: 'organigramme importé (2023)',
      },
      lastVerifiedAt: '2023-06-01',
    },
    {
      name: seatName('Responsable de la plateforme de données'),
      title: 'Responsable de la plateforme de données',
      entityId: 'e-sg-bourso',
      family: 'Data',
      level: 'L3',
      roles: ['technical_buyer'],
      confidence: 54,
      evidence: {
        ...INFERRED,
        ref: 'Siège de décision déduit — filiale immatriculée, titulaire fictif de démonstration',
      },
    },
    {
      name: seatName('Responsable achats informatiques'),
      title: 'Responsable achats informatiques',
      entityId: 'e-sg',
      family: 'Achat',
      level: 'L4',
      roles: ['procurement'],
      confidence: 50,
      evidence: { ...INFERRED, ref: 'Siège de décision déduit — titulaire fictif de démonstration' },
    },
  ],
  edges: [
    // VÉRIFIÉ : le registre nomme les deux mandataires de la même société.
    { from: 'Pierre Palmieri', to: 'Lorenzo Bini Smaghi', confidence: 95, verified: true },
    { from: 'Lorenzo Bini Smaghi', to: 'e-sg', type: 'member_of', confidence: 98, verified: true },
    { from: 'Pierre Palmieri', to: 'e-sg', type: 'member_of', confidence: 98, verified: true },
    // INFÉRÉ : aucune source ne publie ces rattachements. Pointillé à l'écran.
    {
      from: seatName('Responsable data & intelligence artificielle de business unit'),
      to: seatName('Directeur des systèmes d’information groupe'),
      confidence: 60,
      verified: false,
    },
    {
      from: seatName('Responsable sécurité applicative'),
      to: seatName('Directeur des systèmes d’information groupe'),
      confidence: 58,
      verified: false,
    },
    {
      from: seatName('Architecte du système d’information groupe'),
      to: seatName('Directeur des systèmes d’information groupe'),
      confidence: 55,
      verified: false,
    },
    { from: seatName('Responsable achats informatiques'), to: 'Pierre Palmieri', confidence: 45, verified: false },
    // Le sponsor d'un programme n'est pas un lien hiérarchique : type dédié.
    {
      from: seatName('Directeur des systèmes d’information groupe'),
      to: 'e-sg-plan',
      type: 'sponsors',
      confidence: 60,
      verified: false,
    },
  ],
  influences: [
    {
      from: seatName('Architecte du système d’information groupe'),
      to: seatName('Directeur des systèmes d’information groupe'),
      topic: 'Choix des partenaires techniques',
      stance: 'neutral',
      confidence: 55,
      reasoning:
        'Un architecte groupe donne un avis sur tout partenaire durable, même quand la mission est portée par une filiale.',
    },
    {
      from: seatName('Responsable achats informatiques'),
      to: seatName('Directeur des systèmes d’information — filiale de services de paiement'),
      topic: 'Référencement des prestataires',
      stance: 'detractor',
      confidence: 60,
      reasoning:
        'Un panel fournisseur groupe freine mécaniquement l’entrée d’une structure non référencée, même sur un besoin validé côté métier.',
    },
    {
      from: seatName('Responsable data & intelligence artificielle de business unit'),
      to: seatName('Directeur des systèmes d’information groupe'),
      topic: 'Industrialisation de l’IA documentaire',
      stance: 'supporter',
      confidence: 55,
      reasoning:
        'Le sujet est public et déjà financé au stade prototype : le porteur a intérêt à ce qu’il passe en production.',
    },
    {
      from: seatName('Responsable sécurité applicative'),
      to: seatName('Directeur des systèmes d’information groupe'),
      topic: 'Arbitrage entre sécurité et livraison',
      stance: 'neutral',
      confidence: 50,
      reasoning:
        'La contrainte réglementaire concurrence le budget de construction dans les mêmes arbitrages de direction.',
    },
    {
      from: 'Pierre Palmieri',
      to: seatName('Directeur des systèmes d’information groupe'),
      topic: 'Trajectoire du plan à horizon 2029',
      stance: 'supporter',
      confidence: 65,
      reasoning:
        'Une direction générale resserrée à deux exécutifs raccourcit le chemin entre l’ambition affichée et les jalons techniques.',
    },
  ],
  committee: [
    {
      name: seatName('Directeur des systèmes d’information — filiale de services de paiement'),
      role: 'technical_buyer',
      reason: 'Décide des prestataires de sa filiale sans passer par le panel du groupe.',
      accessScore: 62,
    },
    {
      name: seatName('Responsable data & intelligence artificielle de business unit'),
      role: 'champion',
      reason: 'Porte le sujet public d’IA documentaire, donc le besoin d’industrialisation.',
      accessScore: 58,
    },
    {
      name: seatName('Directeur des systèmes d’information groupe'),
      role: 'technical_buyer',
      reason: 'Arbitre le cadre technique — à informer, pas à solliciter en premier.',
      accessScore: 40,
    },
    {
      name: seatName('Architecte du système d’information groupe'),
      role: 'influencer',
      reason: 'Aucun partenaire durable n’est retenu sans son avis.',
      accessScore: 44,
    },
    {
      name: seatName('Responsable achats informatiques'),
      role: 'procurement',
      reason: 'Passage contractuel obligé, une fois le besoin porté en interne.',
      accessScore: 35,
    },
    {
      name: 'Pierre Palmieri',
      role: 'economic_buyer',
      reason: 'Mandataire social : utile en fin de cycle, jamais en première approche.',
      accessScore: 20,
    },
  ],
  path: [
    {
      name: seatName('Directeur des systèmes d’information — filiale de services de paiement'),
      objective: 'Obtenir un atelier de cadrage de 45 minutes sur un périmètre borné.',
      channel: 'Réseau professionnel',
      unlocks: 'Accès au circuit d’achat de la filiale, indépendant du panel groupe.',
      fallback: 'Basculer sur la filiale bancaire en ligne si la première ne répond pas sous deux semaines.',
    },
    {
      name: seatName('Responsable data & intelligence artificielle de business unit'),
      objective: 'Faire nommer LE cas d’usage documentaire à industrialiser en premier.',
      channel: 'E-mail',
      unlocks: 'Un périmètre écrit, donc chiffrable.',
    },
    {
      name: seatName('Responsable achats informatiques'),
      objective: 'Connaître le circuit contractuel avant que le besoin ne soit validé.',
      channel: 'E-mail',
      unlocks: 'Dix semaines de cycle économisées.',
    },
  ],
  zones: [
    {
      entityId: 'e-sg-treezor',
      family: 'IT',
      level: 'L3',
      importance: 'importante',
      reason:
        'Aucune personne n’est nommée sur cette filiale : c’est pourtant la porte d’entrée la mieux notée du dossier. C’est là qu’un enrichissement rapporte le plus.',
      suggestedTitles: ['Directeur des systèmes d’information', 'Responsable de la plateforme', 'Architecte'],
      estimatedAvailable: 8,
    },
    {
      entityId: 'e-sg-dsi',
      family: 'Data',
      level: 'L3',
      importance: 'secondaire',
      reason:
        'Le niveau qui exploite au quotidien les chaînes de données n’est pas cartographié — c’est lui qui porte la douleur d’industrialisation.',
      suggestedTitles: ['Responsable plateforme de données', 'Ingénieur données senior'],
      estimatedAvailable: 12,
    },
  ],
  // Le chemin À UN SAUT, avec sa relation PÉRIMÉE — la forme la plus utile à
  // montrer, parce qu'elle porte l'avertissement : « passe par Untel » ne vaut
  // que ce que vaut la fraîcheur du lien. Le saut s'appuie sur l'appartenance
  // à la même direction, pas sur un « il le connaît » que rien ne prouverait.
  origin: {
    form: 'one_hop',
    owner: 'Camille Bertrand',
    relation: 'Ancien client — mission de refonte livrée en 2024.',
    relationDate: '2026-03-04',
    relationFreshness: 'perime',
    hopName: seatName('Architecte du système d’information groupe'),
    hopBasis: 'same_entity',
  },
})

/* ------------------------------------------------------------------ */
/* SNCF                                                                */
/* ------------------------------------------------------------------ */

export const sncfOrgGraph = buildDemoOrgGraph({
  entities: [
    {
      id: 'e-sncf',
      name: 'Société nationale SNCF',
      type: 'groupe',
      parentId: null,
      confidence: 98,
      evidence: { ...REGISTRY, ref: 'SIREN 552049447' },
    },
    {
      id: 'e-sncf-dgn',
      name: 'Direction du numérique du groupe',
      type: 'bu',
      parentId: 'e-sncf',
      confidence: 82,
      evidence: { ...PRESS, ref: 'Réorganisation de la gouvernance numérique (communiqué, mars 2025)' },
    },
    {
      id: 'e-sncf-voyageurs',
      name: 'SNCF Voyageurs',
      type: 'filiale',
      parentId: 'e-sncf',
      confidence: 96,
      evidence: { ...REGISTRY, ref: 'SIREN 519037584' },
    },
    {
      id: 'e-sncf-connect',
      name: 'SNCF Connect & Tech',
      type: 'filiale',
      parentId: 'e-sncf-voyageurs',
      confidence: 96,
      evidence: { ...REGISTRY, ref: 'SIREN 483815619' },
    },
    {
      id: 'e-sncf-keolis',
      name: 'Keolis',
      type: 'filiale',
      parentId: 'e-sncf',
      confidence: 96,
      evidence: { ...REGISTRY, ref: 'SIREN 552111809' },
    },
  ],
  people: [
    {
      name: 'Jean Castex',
      title: 'Président du conseil d’administration et directeur général',
      entityId: 'e-sncf',
      family: 'C-Level',
      level: 'L0',
      roles: ['economic_buyer'],
      confidence: 98,
      evidence: { ...REGISTRY, ref: 'Mandataire social — SIREN 552049447' },
    },
    {
      name: 'Laurent Trévisani',
      title: 'Directeur général délégué',
      entityId: 'e-sncf',
      family: 'C-Level',
      level: 'L1',
      roles: ['economic_buyer'],
      confidence: 98,
      evidence: { ...REGISTRY, ref: 'Mandataire social — SIREN 552049447' },
    },
    {
      // #4509 (24/10/2026) — LA personne du graphe SANS fiche contact semée : le panneau de son nœud montre « Créer sa
      // fiche » devant un prospect. Interlocutrice FICTIVE de démonstration (aucune personne réelle inventée), sans
      // aucun lien : l'analyse l'a vue citée, rien ne la rattache à qui que ce soit. Exemptée NOMMÉMENT de la garde
      // « chaque personne du graphe est un contact seedé » (`DEMO_ORG_PEOPLE_WITHOUT_RECORD`).
      name: 'Camille Rivière',
      title: 'Responsable de programme data',
      entityId: 'e-sncf-dgn',
      family: 'Data',
      level: 'L3',
      roles: [],
      confidence: 55,
      evidence: { ...INFERRED, ref: 'Citée dans un échange de la salle — aucune fiche créée' },
    },
    {
      name: seatName('Directeur du numérique du groupe'),
      title: 'Directeur du numérique du groupe',
      entityId: 'e-sncf-dgn',
      family: 'IT',
      level: 'L1',
      roles: ['technical_buyer'],
      confidence: 66,
      // #3434 — organigramme ANCIEN : la mention « à vérifier » se déclenche en
      // démo. Re-semé sur SNCF le 01/10/2026 (retrait du compte qui la portait).
      lastVerifiedAt: '2024-09-12',
      evidence: {
        ...PRESS,
        ref: 'Direction créée par la réorganisation de mars 2025 — titulaire fictif de démonstration',
      },
    },
    {
      name: seatName('Responsable data et innovation — direction du numérique'),
      title: 'Responsable data et innovation — direction du numérique',
      entityId: 'e-sncf-dgn',
      family: 'Data',
      level: 'L2',
      roles: ['technical_buyer', 'champion'],
      confidence: 60,
      evidence: {
        ...PRESS,
        ref: 'La direction du numérique porte la chaire de recherche — titulaire fictif de démonstration',
      },
    },
    {
      name: seatName('Directeur technique — entité numérique voyageurs'),
      title: 'Directeur technique — entité numérique voyageurs',
      entityId: 'e-sncf-connect',
      family: 'Dev',
      level: 'L2',
      roles: ['technical_buyer'],
      confidence: 62,
      evidence: {
        ...INFERRED,
        ref: 'Siège de décision déduit — filiale immatriculée, titulaire fictif de démonstration',
      },
    },
    {
      name: seatName('Responsable de l’exploitation des systèmes temps réel'),
      title: 'Responsable de l’exploitation des systèmes temps réel',
      entityId: 'e-sncf-voyageurs',
      family: 'IT',
      level: 'L3',
      roles: ['user_buyer'],
      confidence: 56,
      evidence: { ...INFERRED, ref: 'Siège de décision déduit — titulaire fictif de démonstration' },
    },
    {
      name: seatName('Responsable de programme de refonte applicative'),
      title: 'Responsable de programme de refonte applicative',
      entityId: 'e-sncf-voyageurs',
      family: 'PMO',
      level: 'L3',
      roles: ['user_buyer'],
      confidence: 54,
      evidence: { ...INFERRED, ref: 'Déduit des postes ouverts sur plusieurs entités' },
    },
    {
      name: seatName('Responsable de la sécurité des systèmes d’information'),
      title: 'Responsable de la sécurité des systèmes d’information',
      entityId: 'e-sncf-dgn',
      family: 'Cyber',
      level: 'L2',
      roles: ['blocker'],
      confidence: 52,
      evidence: { ...INFERRED, ref: 'Siège de décision déduit — titulaire fictif de démonstration' },
    },
    // #4016 L4.2 (décision Louis 11/10/2026) — un siège SANS aucun rattachement
    // semé (ni ligne, ni hypothèse) : l'écran déduit son N+1 PROBABLE des
    // intitulés (« Directeur du numérique du groupe », seul siège IT au-dessus
    // dans la même direction) et le dessine en pointillés, badgé « probable ».
    // Rien n'est écrit dans le graphe : `demo-inferred-org-edge-coverage.spec.ts`.
    {
      name: seatName('Responsable des infrastructures numériques'),
      title: 'Responsable des infrastructures numériques',
      entityId: 'e-sncf-dgn',
      family: 'IT',
      level: 'L3',
      roles: [],
      confidence: 50,
      evidence: { ...INFERRED, ref: 'Siège de décision déduit — titulaire fictif de démonstration' },
    },
    {
      name: seatName('Responsable des systèmes d’information d’une filiale de transport'),
      title: 'Responsable des systèmes d’information d’une filiale de transport',
      entityId: 'e-sncf-keolis',
      family: 'IT',
      level: 'L2',
      roles: ['technical_buyer'],
      confidence: 50,
      evidence: {
        ...INFERRED,
        ref: 'Siège de décision déduit — filiale immatriculée, titulaire fictif de démonstration',
      },
    },
    {
      name: seatName('Responsable des achats de prestations informatiques'),
      title: 'Responsable des achats de prestations informatiques',
      entityId: 'e-sncf',
      family: 'Achat',
      level: 'L4',
      roles: ['procurement'],
      confidence: 48,
      evidence: { ...INFERRED, ref: 'Siège de décision déduit — titulaire fictif de démonstration' },
    },
  ],
  edges: [
    { from: 'Laurent Trévisani', to: 'Jean Castex', confidence: 95, verified: true },
    { from: 'Jean Castex', to: 'e-sncf', type: 'member_of', confidence: 98, verified: true },
    { from: 'Laurent Trévisani', to: 'e-sncf', type: 'member_of', confidence: 98, verified: true },
    {
      from: seatName('Directeur du numérique du groupe'),
      to: 'e-sncf-dgn',
      type: 'member_of',
      confidence: 90,
      verified: true,
    },
    {
      from: seatName('Responsable data et innovation — direction du numérique'),
      to: seatName('Directeur du numérique du groupe'),
      confidence: 62,
      verified: false,
    },
    {
      from: seatName('Responsable de la sécurité des systèmes d’information'),
      to: seatName('Directeur du numérique du groupe'),
      confidence: 56,
      verified: false,
    },
    {
      from: seatName('Directeur technique — entité numérique voyageurs'),
      to: seatName('Directeur du numérique du groupe'),
      confidence: 48,
      verified: false,
    },
    {
      from: seatName('Responsable de l’exploitation des systèmes temps réel'),
      to: seatName('Directeur technique — entité numérique voyageurs'),
      confidence: 54,
      verified: false,
    },
    {
      from: seatName('Responsable de programme de refonte applicative'),
      to: seatName('Directeur technique — entité numérique voyageurs'),
      confidence: 50,
      verified: false,
    },
    {
      from: seatName('Responsable des achats de prestations informatiques'),
      to: 'Laurent Trévisani',
      confidence: 42,
      verified: false,
    },
  ],
  influences: [
    {
      from: seatName('Responsable data et innovation — direction du numérique'),
      to: seatName('Directeur du numérique du groupe'),
      topic: 'Industrialisation des cas d’usage de recherche',
      stance: 'supporter',
      confidence: 62,
      reasoning:
        'Les partenariats de recherche sont visibles : leur absence d’effet opérationnel finit par se voir aussi, ce qui pousse à industrialiser.',
    },
    {
      from: seatName('Responsable de l’exploitation des systèmes temps réel'),
      to: seatName('Directeur technique — entité numérique voyageurs'),
      topic: 'Investissement en observabilité',
      stance: 'supporter',
      confidence: 58,
      reasoning:
        'Chaque indisponibilité de son périmètre devient publique en quelques heures : l’argument n’a pas besoin d’être construit.',
    },
    {
      from: seatName('Responsable des achats de prestations informatiques'),
      to: seatName('Directeur technique — entité numérique voyageurs'),
      topic: 'Circuit de référencement d’une mission d’entité',
      stance: 'detractor',
      confidence: 58,
      reasoning:
        'Un groupe public formalise ses achats : le circuit s’impose souvent même à une entité qui décide seule de son besoin.',
    },
    {
      from: seatName('Responsable de la sécurité des systèmes d’information'),
      to: seatName('Directeur du numérique du groupe'),
      topic: 'Obligations de résilience numérique',
      stance: 'neutral',
      confidence: 54,
      reasoning:
        'Pour un opérateur d’importance vitale, la résilience est une obligation qui concurrence les autres chantiers dans les mêmes arbitrages.',
    },
    {
      from: seatName('Responsable de programme de refonte applicative'),
      to: seatName('Directeur technique — entité numérique voyageurs'),
      topic: 'Recours au renfort plutôt qu’au recrutement',
      stance: 'supporter',
      confidence: 52,
      reasoning:
        'Des postes ouverts non pourvus depuis des mois rendent l’argument du renfort externe facile à porter en interne.',
    },
  ],
  committee: [
    {
      name: seatName('Directeur technique — entité numérique voyageurs'),
      role: 'technical_buyer',
      reason: 'Entité autonome immatriculée séparément : elle décide de ses prestataires.',
      accessScore: 60,
    },
    {
      name: seatName('Responsable data et innovation — direction du numérique'),
      role: 'champion',
      reason: 'Sponsor naturel de l’industrialisation des travaux de recherche.',
      accessScore: 56,
    },
    {
      name: seatName('Responsable de l’exploitation des systèmes temps réel'),
      role: 'user_buyer',
      reason: 'Porte une douleur immédiatement visible du public.',
      accessScore: 54,
    },
    {
      name: seatName('Responsable des achats de prestations informatiques'),
      role: 'procurement',
      reason: 'Le circuit d’achat d’un groupe public décide du calendrier.',
      accessScore: 34,
    },
    {
      name: seatName('Directeur du numérique du groupe'),
      role: 'technical_buyer',
      reason: 'Décide des priorités des six entités, pas de leurs missions.',
      accessScore: 42,
    },
    {
      name: 'Laurent Trévisani',
      role: 'economic_buyer',
      reason: 'Mandataire social : utile en fin de cycle uniquement.',
      accessScore: 18,
    },
  ],
  path: [
    {
      name: seatName('Directeur technique — entité numérique voyageurs'),
      objective: 'Obtenir un échange sur les priorités de l’entité, indépendamment du groupe.',
      channel: 'Réseau professionnel',
      unlocks: 'Un cycle de décision court, propre à l’entité.',
      fallback: 'Basculer sur la filiale de transport, immatriculée séparément elle aussi.',
    },
    {
      name: seatName('Responsable data et innovation — direction du numérique'),
      objective: 'Faire nommer le cas d’usage de recherche à industrialiser en premier.',
      channel: 'E-mail',
      unlocks: 'Un périmètre écrit avec un sponsor métier, pas seulement académique.',
    },
    {
      name: seatName('Responsable des achats de prestations informatiques'),
      objective: 'Faire dire le circuit avant que le besoin ne soit validé.',
      channel: 'E-mail',
    },
  ],
  zones: [
    {
      entityId: 'e-sncf-connect',
      family: 'Dev',
      level: 'L3',
      importance: 'importante',
      reason:
        'L’entité technique la plus accessible du groupe n’a aucune personne nommée : c’est là qu’un enrichissement change le plus la donne.',
      suggestedTitles: ['Directeur technique', 'Responsable d’équipe', 'Architecte'],
      estimatedAvailable: 12,
    },
    {
      entityId: 'e-sncf-keolis',
      family: 'IT',
      level: 'L2',
      importance: 'secondaire',
      reason: 'Filiale à autonomie propre, non cartographiée : une porte de plus, indépendante des autres.',
      suggestedTitles: ['Directeur des systèmes d’information', 'Responsable des opérations informatiques'],
      estimatedAvailable: 7,
    },
  ],
})
