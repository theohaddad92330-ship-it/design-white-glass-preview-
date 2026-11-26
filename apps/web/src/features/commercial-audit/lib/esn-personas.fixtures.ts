import type { ProfileContext, ProfileContextRevisionSummary } from '@bellum/contracts'

/**
 * #2070 — Corpus de non-régression multi-persona pour le moteur d'audit
 * commercial (`tension-detectors.ts`, 12 règles ; `maturity-axes.ts`, 12 axes).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * #2070.23 — CE FICHIER N'EST JAMAIS UN TEMPLATE.
 * ─────────────────────────────────────────────────────────────────────────
 * Chaque cas ci-dessous est une FORME d'ESN plausible, pas un client réel :
 * aucun nom d'entreprise réelle, aucun nom de personne réelle. Ces objets ne
 * sont consommés QUE par `esn-personas.test.ts` (même dossier) — jamais
 * importés depuis `apps/web/src/features/...` en dehors d'un fichier de
 * test, et jamais proposés à un utilisateur comme « profil type » à
 * recopier. `esn-personas.test.ts` fait échouer la CI si un jour un import
 * de production apparaît. Si tu es en train d'ajouter un tel import,
 * arrête-toi : c'est exactement le glissement que cette règle interdit.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CE CORPUS, ET POURQUOI IL NE COPIE PAS LE CALCUL
 * ─────────────────────────────────────────────────────────────────────────
 * `tension-detectors.ts` et `maturity-axes.ts` viennent d'atterrir : douze
 * règles de tension et douze axes de maturité, chacun testé unitairement
 * dans son propre fichier, mais qu'aucune forme RÉALISTE d'ESN n'a encore
 * traversés ensemble. Ce fichier porte les RÉPONSES (#2070.16) — un
 * `ProfileContext` complet et plausible par cas ; `esn-personas.test.ts`
 * porte l'audit ATTENDU (#2070.17), les contradictions (#2070.18), les
 * priorités (#2070.19), les interdits (#2070.20), la configuration produit
 * (#2070.21) et les limites (#2070.22) — en appelant le VRAI
 * `buildCommercialAuditContext`, jamais une réimplémentation du calcul.
 *
 * ⚠️ SEPT des douze détecteurs de tension et CINQ des douze axes de maturité
 * rendent structurellement `unknown` pour TOUS les cas ci-dessous :
 * `buildCommercialAuditContext` (`build-audit.ts:349`) appelle
 * `detectCommercialTensions(context)` SANS le deuxième argument
 * `signals` — les détecteurs à signal externe (vivier, besoins clients,
 * profils présentés, partenaires, contenu, appels d'offres, missions) ne
 * reçoivent donc jamais de quoi se prononcer. Ce n'est pas un trou de ce
 * corpus : c'est ce que `ProfileContext` (un questionnaire d'onboarding)
 * ne porte pas. Voir `esn-personas.test.ts` pour l'endroit où cette
 * honnêteté est vérifiée, cas par cas.
 *
 * #2070.3 (BU d'un grand groupe) N'EST PAS ici : le cloisonnement par
 * business unit est un droit d'accès qui attend une revue sécurité et un
 * arbitrage humain — voir le registre `.claude/notes/registre-2026-09-15-
 * onboarding-audit-welcome.md`.
 */

export type EsnPersonaCase = {
  /** Le numéro du point au registre (#2070.<point>) — jamais réutilisé. */
  point: number
  /** Identité stable du cas, utilisée dans les messages d'assertion. */
  id: string
  /** La forme d'ESN, en une phrase — jamais un nom d'entreprise réelle. */
  label: string
  profileContext: ProfileContext
  revisions: ProfileContextRevisionSummary[]
}

// #2070.1 — Technicien qui vient de créer une petite ESN : les deux seules
// questions d'onboarding auxquelles il a déjà répondu. Aucun bloc optionnel
// n'existe encore — ni deviné, ni rempli par défaut.
const technicienPetiteEsn: EsnPersonaCase = {
  point: 1,
  id: 'technicien-petite-esn',
  label: 'Technicien qui vient de créer sa petite ESN',
  profileContext: {
    esnArchetype: 'soloHunter',
    sellingPosture: 'expertiseRare',
  },
  revisions: [{ version: 1, schema_version: 2, created_at: '2026-01-10T09:00:00.000Z', was_last_validated: true }],
}

// #2070.2 — Fondateur qui fait lui-même la vente, en solo, mais depuis assez
// longtemps pour avoir un onboarding complet et cohérent.
const fondateurCommercialSolo: EsnPersonaCase = {
  point: 2,
  id: 'fondateur-commercial-solo',
  label: 'Fondateur qui fait lui-même la vente, seul',
  profileContext: {
    esnArchetype: 'soloHunter',
    sellingPosture: 'volumeFlexible',
    idealAccountProfile: {
      size: 'pme',
      sectorsPriority: ['Retail', 'Logistique'],
      decisionLevel: 'manager',
      entryStrategy: 'referral',
    },
    analysisParameters: {
      braveQueriesCount: 8,
      firecrawlPagesCount: 4,
      contactsTarget: 15,
      analysisDepth: 'light',
      maxTokensResearch: 8000,
      focusAreas: ['Recrutement'],
    },
    messagingStyle: {
      tone: 'relationshipFirst',
      messageLength: 'concise',
      valuePropositionAngle: 'Un point de contact unique, du devis à la facture',
      differentiationPoints: ['15 ans de réseau local', 'Délai de réponse en 24h'],
      avoid: ['Jargon technique'],
    },
    coachingInsights: {
      mainWeakness: 'Le suivi commercial s’arrête dès qu’une mission démarre',
      keyAdvice: 'Garder un créneau hebdomadaire dédié à la prospection',
      cadenceRecommendation: { analysesPerWeek: 2, messagesPerDay: 3, followUpsPerWeek: 2 },
      kpiTargets: { accountsPerMonth: 3, rdvPerMonth: 2, conversionRateTarget: '20 %' },
    },
    bellumPhrases: {
      welcome: 'On reprend là où tu en étais',
      firstAnalysisCta: 'Ouvre ton premier compte',
      weeklySummaryIntro: 'Cette semaine',
      emptyState: 'Rien pour le moment',
      scoreContext: 'Décomposé par axe',
    },
  },
  revisions: [{ version: 1, schema_version: 2, created_at: '2026-02-03T09:00:00.000Z', was_last_validated: true }],
}

// #2070.4 — Agence régionale d'un réseau ESN plus large : entrée topDown déjà
// établie, taille ETI — pas de grand compte visé en bottomUp.
const agenceRegionale: EsnPersonaCase = {
  point: 4,
  id: 'agence-regionale',
  label: 'Agence régionale d’un réseau ESN plus large',
  profileContext: {
    esnArchetype: 'midMarketChallenger',
    sellingPosture: 'nicheVerticals',
    idealAccountProfile: {
      size: 'eti',
      sectorsPriority: ['Industrie', 'Energie'],
      decisionLevel: 'director',
      entryStrategy: 'topDown',
    },
    analysisParameters: {
      braveQueriesCount: 10,
      firecrawlPagesCount: 5,
      contactsTarget: 30,
      analysisDepth: 'standard',
      maxTokensResearch: 10000,
      focusAreas: ['Maintenance industrielle'],
    },
    messagingStyle: {
      tone: 'consultative',
      messageLength: 'standard',
      valuePropositionAngle: 'Une équipe locale qui connaît le bassin industriel',
      differentiationPoints: ['Implantation locale depuis 12 ans', 'Astreinte régionale'],
      avoid: ['Promettre une couverture nationale'],
    },
    coachingInsights: {
      mainWeakness: 'Les comptes du siège national captent les meilleurs profils avant l’agence',
      keyAdvice: 'Valoriser la proximité et le délai d’intervention',
      cadenceRecommendation: { analysesPerWeek: 3, messagesPerDay: 4, followUpsPerWeek: 3 },
      kpiTargets: { accountsPerMonth: 6, rdvPerMonth: 3, conversionRateTarget: '15 %' },
    },
    bellumPhrases: {
      welcome: 'Ton secteur, ton territoire',
      firstAnalysisCta: 'Analyse un compte du bassin',
      weeklySummaryIntro: 'Cette semaine dans ton agence',
      emptyState: 'Rien pour le moment',
      scoreContext: 'Décomposé par axe',
    },
  },
  revisions: [{ version: 1, schema_version: 2, created_at: '2026-03-01T09:00:00.000Z', was_last_validated: true }],
}

// #2070.5 — ESN généraliste : cinq secteurs prioritaires simultanés, au-delà
// du seuil `MAX_SIMULTANEOUS_MARKETS` (3) — déclenche `tooManySimultaneousMarkets`.
const esnGeneraliste: EsnPersonaCase = {
  point: 5,
  id: 'esn-generaliste',
  label: 'ESN généraliste, encore en dispersion sur ses secteurs',
  profileContext: {
    esnArchetype: 'scaleUp',
    sellingPosture: 'volumeFlexible',
    idealAccountProfile: {
      size: 'all',
      sectorsPriority: ['Banque', 'Assurance', 'Retail', 'Energie', 'Secteur public'],
      decisionLevel: 'manager',
      entryStrategy: 'multiThread',
    },
    analysisParameters: {
      braveQueriesCount: 15,
      firecrawlPagesCount: 8,
      contactsTarget: 50,
      analysisDepth: 'standard',
      maxTokensResearch: 14000,
      focusAreas: ['Multi-secteurs'],
    },
    messagingStyle: {
      tone: 'directExpert',
      messageLength: 'standard',
      valuePropositionAngle: 'Une capacité à couvrir plusieurs secteurs en parallèle',
      differentiationPoints: ['Equipe pluridisciplinaire', 'Mutualisation des ressources'],
      avoid: ['Se positionner comme spécialiste unique'],
    },
    coachingInsights: {
      mainWeakness: 'La prospection se disperse sur trop de secteurs à la fois',
      keyAdvice: 'Resserrer sur les deux secteurs qui convertissent le mieux',
      cadenceRecommendation: { analysesPerWeek: 4, messagesPerDay: 6, followUpsPerWeek: 4 },
      kpiTargets: { accountsPerMonth: 12, rdvPerMonth: 6, conversionRateTarget: '10 %' },
    },
    bellumPhrases: {
      welcome: 'Tous les secteurs, un seul copilote',
      firstAnalysisCta: 'Choisis un compte à analyser',
      weeklySummaryIntro: 'Cette semaine',
      emptyState: 'Rien pour le moment',
      scoreContext: 'Décomposé par axe',
    },
  },
  revisions: [{ version: 1, schema_version: 2, created_at: '2026-03-10T09:00:00.000Z', was_last_validated: true }],
}

// #2070.6 — Niche cyber : un seul secteur, grand compte visé en topDown —
// même taille de cible que #2070.13, mais l'entrée n'est PAS bottomUp : la
// paire minimale qui prouve que `keyAccountsWithoutAccessPath` réagit à la
// STRATÉGIE d'entrée, pas seulement à la taille visée.
const nicheCyber: EsnPersonaCase = {
  point: 6,
  id: 'niche-cyber',
  label: 'ESN experte cybersécurité, un seul secteur ciblé',
  profileContext: {
    esnArchetype: 'boutiqueExpert',
    sellingPosture: 'expertiseRare',
    idealAccountProfile: {
      size: 'grandCompte',
      sectorsPriority: ['Cybersécurité'],
      decisionLevel: 'cLevel',
      entryStrategy: 'topDown',
    },
    analysisParameters: {
      braveQueriesCount: 20,
      firecrawlPagesCount: 10,
      contactsTarget: 25,
      analysisDepth: 'deep',
      maxTokensResearch: 16000,
      focusAreas: ['Cybersécurité'],
    },
    messagingStyle: {
      tone: 'directExpert',
      messageLength: 'detailed',
      valuePropositionAngle: 'Une expertise cyber pointue reconnue sur le marché',
      differentiationPoints: ['Certifications reconnues', 'Références bancaires publiques'],
      avoid: ['Généraliser sur l’IT au sens large'],
    },
    coachingInsights: {
      mainWeakness: 'Le marché cyber est étroit, chaque prospect compte',
      keyAdvice: 'Documenter chaque référence gagnée',
      cadenceRecommendation: { analysesPerWeek: 3, messagesPerDay: 4, followUpsPerWeek: 3 },
      kpiTargets: { accountsPerMonth: 5, rdvPerMonth: 3, conversionRateTarget: '25 %' },
    },
    bellumPhrases: {
      welcome: 'Ton marché est étroit, ton copilote est précis',
      firstAnalysisCta: 'Analyse ta prochaine cible cyber',
      weeklySummaryIntro: 'Cette semaine',
      emptyState: 'Rien pour le moment',
      scoreContext: 'Décomposé par axe',
    },
  },
  revisions: [{ version: 1, schema_version: 2, created_at: '2026-03-15T09:00:00.000Z', was_last_validated: true }],
}

// #2070.7 — Modèle freelance : un angle affirmé, aucun point de
// différenciation nommé — déclenche `offerWithoutProof`. Le vrai risque de ce
// modèle (la disponibilité du vivier) reste hors de portée de ce profil :
// voir `esn-personas.test.ts`, section « limites ».
const modeleFreelance: EsnPersonaCase = {
  point: 7,
  id: 'modele-freelance',
  label: 'Réseau de freelances, l’offre encore non différenciée',
  profileContext: {
    esnArchetype: 'soloHunter',
    sellingPosture: 'nearshoreCompetitive',
    idealAccountProfile: {
      size: 'pme',
      sectorsPriority: ['Digital'],
      decisionLevel: 'manager',
      entryStrategy: 'referral',
    },
    analysisParameters: {
      braveQueriesCount: 8,
      firecrawlPagesCount: 4,
      contactsTarget: 20,
      analysisDepth: 'light',
      maxTokensResearch: 9000,
      focusAreas: ['Freelance IT'],
    },
    messagingStyle: {
      tone: 'directExpert',
      messageLength: 'concise',
      valuePropositionAngle: 'Une disponibilité immédiate de profils seniors freelances',
      differentiationPoints: [],
      avoid: ['S’engager sur un délai de placement précis'],
    },
    coachingInsights: {
      mainWeakness: 'Les clients comparent surtout sur le prix et le délai de mise à disposition',
      keyAdvice: 'Nommer ce qui distingue vraiment le vivier proposé',
      cadenceRecommendation: { analysesPerWeek: 2, messagesPerDay: 5, followUpsPerWeek: 3 },
      kpiTargets: { accountsPerMonth: 4, rdvPerMonth: 3, conversionRateTarget: '18 %' },
    },
    bellumPhrases: {
      welcome: 'Ton vivier, mis en avant',
      firstAnalysisCta: 'Analyse ta prochaine mission',
      weeklySummaryIntro: 'Cette semaine',
      emptyState: 'Rien pour le moment',
      scoreContext: 'Décomposé par axe',
    },
  },
  revisions: [{ version: 1, schema_version: 2, created_at: '2026-03-20T09:00:00.000Z', was_last_validated: true }],
}

// #2070.8 — Cabinet de recrutement : objectif mensuel (15 comptes) au-dessus
// de la capacité impliquée par la cadence recommandée (2 analyses/semaine ×
// 4 = 8) — déclenche `objectivesAboveCapacity`.
const cabinetRecrutement: EsnPersonaCase = {
  point: 8,
  id: 'cabinet-recrutement',
  label: 'Cabinet de recrutement, sous pression de croissance',
  profileContext: {
    esnArchetype: 'boutiqueExpert',
    sellingPosture: 'nicheVerticals',
    idealAccountProfile: {
      size: 'eti',
      sectorsPriority: ['Tech', 'Santé'],
      decisionLevel: 'manager',
      entryStrategy: 'referral',
    },
    analysisParameters: {
      braveQueriesCount: 12,
      firecrawlPagesCount: 6,
      contactsTarget: 40,
      analysisDepth: 'standard',
      maxTokensResearch: 12000,
      focusAreas: ['Sourcing candidats'],
    },
    messagingStyle: {
      tone: 'consultative',
      messageLength: 'standard',
      valuePropositionAngle: 'Un accompagnement sur mesure du besoin au recrutement',
      differentiationPoints: ['Vivier qualifié en amont', 'Process de sélection en 3 étapes'],
      avoid: ['Promettre un délai de placement fixe'],
    },
    coachingInsights: {
      mainWeakness: 'Les candidats présentés n’ont pas de retour client formalisé',
      keyAdvice: 'Tracer chaque retour dans les 48 heures',
      cadenceRecommendation: { analysesPerWeek: 2, messagesPerDay: 6, followUpsPerWeek: 5 },
      kpiTargets: { accountsPerMonth: 15, rdvPerMonth: 10, conversionRateTarget: '8 %' },
    },
    bellumPhrases: {
      welcome: 'Chaque candidat, tracé jusqu’au bout',
      firstAnalysisCta: 'Analyse ton prochain client',
      weeklySummaryIntro: 'Cette semaine',
      emptyState: 'Rien pour le moment',
      scoreContext: 'Décomposé par axe',
    },
  },
  revisions: [{ version: 1, schema_version: 2, created_at: '2026-03-25T09:00:00.000Z', was_last_validated: true }],
}

// #2070.9 — Activité de rang 2 (sous-traitance) : niveau de décision visé
// structurellement plafonné à `operational` — l'interlocuteur est le
// prestataire de rang 1, jamais le client final.
const rang2SousTraitance: EsnPersonaCase = {
  point: 9,
  id: 'rang-2-sous-traitance',
  label: 'ESN qui intervient en sous-traitance d’un prestataire de rang 1',
  profileContext: {
    esnArchetype: 'midMarketChallenger',
    sellingPosture: 'nearshoreCompetitive',
    idealAccountProfile: {
      size: 'grandCompte',
      sectorsPriority: ['Automobile'],
      decisionLevel: 'operational',
      entryStrategy: 'referral',
    },
    analysisParameters: {
      braveQueriesCount: 10,
      firecrawlPagesCount: 5,
      contactsTarget: 20,
      analysisDepth: 'light',
      maxTokensResearch: 9000,
      focusAreas: ['Sous-traitance automobile'],
    },
    messagingStyle: {
      tone: 'directExpert',
      messageLength: 'concise',
      valuePropositionAngle: 'Une équipe opérationnelle immédiatement mobilisable sur le projet',
      differentiationPoints: ['Habilitations déjà à jour', 'Montée en charge rapide'],
      avoid: ['Se positionner comme apporteur d’affaires du client final'],
    },
    coachingInsights: {
      mainWeakness: 'L’accès au client final passe toujours par le prestataire de rang 1',
      keyAdvice: 'Documenter les interlocuteurs opérationnels rencontrés en mission',
      cadenceRecommendation: { analysesPerWeek: 3, messagesPerDay: 4, followUpsPerWeek: 3 },
      kpiTargets: { accountsPerMonth: 6, rdvPerMonth: 3, conversionRateTarget: '14 %' },
    },
    bellumPhrases: {
      welcome: 'Ton point d’entrée, même en rang 2',
      firstAnalysisCta: 'Analyse ton prochain prestataire de rang 1',
      weeklySummaryIntro: 'Cette semaine',
      emptyState: 'Rien pour le moment',
      scoreContext: 'Décomposé par axe',
    },
  },
  revisions: [{ version: 1, schema_version: 2, created_at: '2026-03-28T09:00:00.000Z', was_last_validated: true }],
}

// #2070.10 — Secteur public : le vrai mécanisme (GO/NO-GO sur appel d'offres)
// est exactement le détecteur #2064.11, qui reste `unknown` faute de signal —
// voir « limites » dans le test.
const secteurPublic: EsnPersonaCase = {
  point: 10,
  id: 'secteur-public',
  label: 'ESN qui répond aux marchés publics',
  profileContext: {
    esnArchetype: 'enterprisePlayer',
    sellingPosture: 'strategicConsulting',
    idealAccountProfile: {
      size: 'grandCompte',
      sectorsPriority: ['Secteur public'],
      decisionLevel: 'director',
      entryStrategy: 'referral',
    },
    analysisParameters: {
      braveQueriesCount: 14,
      firecrawlPagesCount: 7,
      contactsTarget: 30,
      analysisDepth: 'standard',
      maxTokensResearch: 12000,
      focusAreas: ['Marchés publics'],
    },
    messagingStyle: {
      tone: 'consultative',
      messageLength: 'detailed',
      valuePropositionAngle: 'Une conformité éprouvée aux exigences des marchés publics',
      differentiationPoints: ['Références sur marchés publics antérieurs', 'Equipe habituée aux DCE'],
      avoid: ['Promettre un contournement de la procédure'],
    },
    coachingInsights: {
      mainWeakness: 'Les réponses aux appels d’offres mobilisent l’équipe sans visibilité sur les décisions GO/NO-GO',
      keyAdvice: 'Statuer GO/NO-GO avant d’engager du temps de réponse',
      cadenceRecommendation: { analysesPerWeek: 3, messagesPerDay: 5, followUpsPerWeek: 3 },
      kpiTargets: { accountsPerMonth: 5, rdvPerMonth: 2, conversionRateTarget: '6 %' },
    },
    bellumPhrases: {
      welcome: 'Ton copilote connaît les marchés publics',
      firstAnalysisCta: 'Analyse ta prochaine collectivité',
      weeklySummaryIntro: 'Cette semaine',
      emptyState: 'Rien pour le moment',
      scoreContext: 'Décomposé par axe',
    },
  },
  revisions: [{ version: 1, schema_version: 2, created_at: '2026-04-02T09:00:00.000Z', was_last_validated: true }],
}

// #2070.11 — ESN sans CRM : aucun paramètre d'analyse configuré (le proxy le
// plus proche, dans `ProfileContext`, de « aucun outil structuré ») alors
// qu'une cadence EST recommandée — déclenche `acquisitionWithoutRoutine`.
const esnSansCrm: EsnPersonaCase = {
  point: 11,
  id: 'esn-sans-crm',
  label: 'ESN active sans outil CRM structuré',
  profileContext: {
    esnArchetype: 'midMarketChallenger',
    sellingPosture: 'volumeFlexible',
    idealAccountProfile: {
      size: 'pme',
      sectorsPriority: ['BTP', 'Industrie'],
      decisionLevel: 'manager',
      entryStrategy: 'referral',
    },
    messagingStyle: {
      tone: 'relationshipFirst',
      messageLength: 'standard',
      valuePropositionAngle: 'Un accompagnement de proximité, sans jargon',
      differentiationPoints: ['Relation de confiance de longue date', 'Réactivité reconnue'],
      avoid: ['Promettre un reporting temps réel'],
    },
    coachingInsights: {
      mainWeakness: 'Les opportunités se suivent sur un tableur mis à jour de façon irrégulière',
      keyAdvice: 'Centraliser le pipeline dans un seul endroit avant d’augmenter le volume',
      cadenceRecommendation: { analysesPerWeek: 3, messagesPerDay: 4, followUpsPerWeek: 3 },
      kpiTargets: { accountsPerMonth: 8, rdvPerMonth: 4, conversionRateTarget: '10 %' },
    },
    bellumPhrases: {
      welcome: 'On centralise, une bonne fois pour toutes',
      firstAnalysisCta: 'Analyse ton prochain compte',
      weeklySummaryIntro: 'Cette semaine',
      emptyState: 'Rien pour le moment',
      scoreContext: 'Décomposé par axe',
    },
    // #2070.11 — pas de `analysisParameters` : aucune routine d'analyse n'est
    // configurée, à l'image d'une activité sans outil qui structure le suivi.
  },
  revisions: [{ version: 1, schema_version: 2, created_at: '2026-04-05T09:00:00.000Z', was_last_validated: true }],
}

// #2070.12 — ESN mature, plusieurs commerciaux, process rodé : le cas de
// référence « sain », contrasté avec #2070.11 (même famille de cadence, mais
// une routine d'analyse configurée) et #2070.1 (0 axe évaluable).
const esnMatureMultiCommerciaux: EsnPersonaCase = {
  point: 12,
  id: 'esn-mature-multi-commerciaux',
  label: 'ESN mature avec plusieurs commerciaux, process rodé',
  profileContext: {
    esnArchetype: 'scaleUp',
    sellingPosture: 'strategicConsulting',
    idealAccountProfile: {
      size: 'eti',
      sectorsPriority: ['Finance', 'Assurance'],
      decisionLevel: 'director',
      entryStrategy: 'multiThread',
    },
    analysisParameters: {
      braveQueriesCount: 22,
      firecrawlPagesCount: 12,
      contactsTarget: 80,
      analysisDepth: 'deep',
      maxTokensResearch: 18000,
      focusAreas: ['Finance', 'Assurance'],
    },
    messagingStyle: {
      tone: 'challenger',
      messageLength: 'standard',
      valuePropositionAngle: 'Une équipe commerciale structurée qui tient ses engagements',
      differentiationPoints: ['Process de qualification partagé', 'Historique de missions documenté'],
      avoid: ['Sous-traiter la relation client sans transition'],
    },
    coachingInsights: {
      mainWeakness: 'Le reporting entre commerciaux reste manuel d’une semaine à l’autre',
      keyAdvice: 'Centraliser le reporting hebdomadaire dans un seul rituel',
      cadenceRecommendation: { analysesPerWeek: 5, messagesPerDay: 8, followUpsPerWeek: 6 },
      kpiTargets: { accountsPerMonth: 15, rdvPerMonth: 8, conversionRateTarget: '18 %' },
    },
    bellumPhrases: {
      welcome: 'Toute l’équipe, un seul copilote',
      firstAnalysisCta: 'Analyse ton prochain compte',
      weeklySummaryIntro: 'Cette semaine, toute l’équipe',
      emptyState: 'Rien pour le moment',
      scoreContext: 'Décomposé par axe',
    },
  },
  revisions: [{ version: 1, schema_version: 2, created_at: '2026-04-10T09:00:00.000Z', was_last_validated: true }],
}

// #2070.13 — Nouveau directeur d'agence : grand compte visé en bottomUp (pas
// encore de relais interne) — déclenche `keyAccountsWithoutAccessPath` — ET
// un objectif mensuel au-dessus de la capacité impliquée par sa cadence —
// déclenche aussi `objectivesAboveCapacity`.
const nouveauDirecteurAgence: EsnPersonaCase = {
  point: 13,
  id: 'nouveau-directeur-agence',
  label: 'Nouveau directeur d’agence, ambitieux, sans réseau encore',
  profileContext: {
    esnArchetype: 'midMarketChallenger',
    sellingPosture: 'strategicConsulting',
    idealAccountProfile: {
      size: 'grandCompte',
      sectorsPriority: ['Industrie'],
      decisionLevel: 'cLevel',
      entryStrategy: 'bottomUp',
    },
    analysisParameters: {
      braveQueriesCount: 12,
      firecrawlPagesCount: 6,
      contactsTarget: 35,
      analysisDepth: 'standard',
      maxTokensResearch: 11000,
      focusAreas: ['Industrie'],
    },
    messagingStyle: {
      tone: 'consultative',
      messageLength: 'standard',
      valuePropositionAngle: 'Une agence qui reprend contact avec les grands comptes du territoire',
      differentiationPoints: ['Equipe technique déjà en poste', 'Références historiques de l’agence'],
      avoid: ['Se présenter comme un nouvel entrant sans historique'],
    },
    coachingInsights: {
      mainWeakness: 'Le nouveau directeur vise les grands comptes sans encore avoir de relais interne',
      keyAdvice: 'Construire un premier accès via un projet pilote plus modeste',
      cadenceRecommendation: { analysesPerWeek: 2, messagesPerDay: 5, followUpsPerWeek: 4 },
      kpiTargets: { accountsPerMonth: 10, rdvPerMonth: 6, conversionRateTarget: '12 %' },
    },
    bellumPhrases: {
      welcome: 'Reprendre contact, méthodiquement',
      firstAnalysisCta: 'Analyse ton premier grand compte',
      weeklySummaryIntro: 'Cette semaine',
      emptyState: 'Rien pour le moment',
      scoreContext: 'Décomposé par axe',
    },
  },
  revisions: [{ version: 1, schema_version: 2, created_at: '2026-04-15T09:00:00.000Z', was_last_validated: true }],
}

// #2070.14 — Gros vivier, peu de besoins : le vrai déséquilibre (offre de
// consultants très supérieure à la demande client) vit entièrement dans des
// signaux (`candidatePool`, `clientNeeds`) que `buildCommercialAuditContext`
// ne relie jamais — voir « limites » dans le test.
const grosVivierPeuDeBesoins: EsnPersonaCase = {
  point: 14,
  id: 'gros-vivier-peu-de-besoins',
  label: 'Gros vivier de consultants, peu de besoins clients actifs',
  profileContext: {
    esnArchetype: 'scaleUp',
    sellingPosture: 'volumeFlexible',
    idealAccountProfile: {
      size: 'all',
      sectorsPriority: ['IT', 'Digital'],
      decisionLevel: 'manager',
      entryStrategy: 'multiThread',
    },
    analysisParameters: {
      braveQueriesCount: 16,
      firecrawlPagesCount: 8,
      contactsTarget: 60,
      analysisDepth: 'standard',
      maxTokensResearch: 14000,
      focusAreas: ['IT', 'Digital'],
    },
    messagingStyle: {
      tone: 'directExpert',
      messageLength: 'concise',
      valuePropositionAngle: 'Une disponibilité immédiate sur un large éventail de compétences IT',
      differentiationPoints: ['Vivier large et disponible', 'Délai de mobilisation court'],
      avoid: ['Multiplier les profils sans besoin identifié'],
    },
    coachingInsights: {
      mainWeakness: 'Le vivier de consultants disponibles dépasse largement les besoins clients actifs',
      keyAdvice: 'Réorienter l’effort commercial vers la génération de besoins plutôt que le recrutement de profils',
      cadenceRecommendation: { analysesPerWeek: 4, messagesPerDay: 6, followUpsPerWeek: 4 },
      kpiTargets: { accountsPerMonth: 10, rdvPerMonth: 5, conversionRateTarget: '10 %' },
    },
    bellumPhrases: {
      welcome: 'Un vivier large, un besoin à faire émerger',
      firstAnalysisCta: 'Analyse ton prochain compte',
      weeklySummaryIntro: 'Cette semaine',
      emptyState: 'Rien pour le moment',
      scoreContext: 'Décomposé par axe',
    },
  },
  revisions: [{ version: 1, schema_version: 2, created_at: '2026-04-20T09:00:00.000Z', was_last_validated: true }],
}

// #2070.15 — Pipeline sans suivi : une routine d'analyse EST configurée, mais
// le rythme de relance recommandé reste le plus léger du corpus (1/semaine) —
// une nuance d'axe, sans déclencher de contradiction : tous les cas ne
// lèvent pas une règle pour être honnêtes sur une faiblesse.
const pipelineSansSuivi: EsnPersonaCase = {
  point: 15,
  id: 'pipeline-sans-suivi',
  label: 'Beaucoup d’opportunités ouvertes, aucune relance structurée',
  profileContext: {
    esnArchetype: 'boutiqueExpert',
    sellingPosture: 'strategicConsulting',
    idealAccountProfile: {
      size: 'eti',
      sectorsPriority: ['Conseil', 'Digital'],
      decisionLevel: 'director',
      entryStrategy: 'referral',
    },
    analysisParameters: {
      braveQueriesCount: 10,
      firecrawlPagesCount: 5,
      contactsTarget: 25,
      analysisDepth: 'standard',
      maxTokensResearch: 10000,
      focusAreas: ['Conseil'],
    },
    messagingStyle: {
      tone: 'consultative',
      messageLength: 'standard',
      valuePropositionAngle: 'Un point d’entrée unique qui suit le dossier jusqu’au bout',
      differentiationPoints: ['Suivi personnalisé', 'Reporting hebdomadaire'],
      avoid: ['Relancer sans nouvelle information à apporter'],
    },
    coachingInsights: {
      mainWeakness: 'Les opportunités s’accumulent sans relance après le premier contact',
      keyAdvice: 'Fixer un jour fixe dans la semaine pour les relances',
      cadenceRecommendation: { analysesPerWeek: 3, messagesPerDay: 4, followUpsPerWeek: 1 },
      kpiTargets: { accountsPerMonth: 8, rdvPerMonth: 4, conversionRateTarget: '10 %' },
    },
    bellumPhrases: {
      welcome: 'On fixe le jour de relance',
      firstAnalysisCta: 'Analyse ton prochain compte',
      weeklySummaryIntro: 'Cette semaine',
      emptyState: 'Rien pour le moment',
      scoreContext: 'Décomposé par axe',
    },
  },
  revisions: [{ version: 1, schema_version: 2, created_at: '2026-04-25T09:00:00.000Z', was_last_validated: true }],
}

/**
 * Les QUATORZE formes, dans l'ordre du registre (#2070.3 — BU d'un grand
 * groupe — volontairement absente, voir le docblock de tête).
 */
export const ESN_PERSONA_CASES: readonly EsnPersonaCase[] = [
  technicienPetiteEsn,
  fondateurCommercialSolo,
  agenceRegionale,
  esnGeneraliste,
  nicheCyber,
  modeleFreelance,
  cabinetRecrutement,
  rang2SousTraitance,
  secteurPublic,
  esnSansCrm,
  esnMatureMultiCommerciaux,
  nouveauDirecteurAgence,
  grosVivierPeuDeBesoins,
  pipelineSansSuivi,
]
