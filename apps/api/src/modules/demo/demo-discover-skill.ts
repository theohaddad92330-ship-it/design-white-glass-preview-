import type {
  DiscoverCandidate,
  DiscoverSignal,
  DiscoverSkillIntermediary,
  DiscoverSkillPendingEmployer,
} from '@bellum/contracts'

/**
 * COMPETENCE-TROUVE (Louis 20/10/2026) — la recherche par compétence en salle de démonstration.
 *
 * Le vrai chemin (`apps/ia/app/services/discover_skill_offers.py`) part des OFFRES qui citent la
 * compétence : les comptes trouvés portent leur preuve (`skillEvidence`), les cabinets et ESN vont à part
 * (`skillIntermediaries`). La salle rejoue cette FORME avec des entreprises fictives et la compétence
 * TAPÉE (jamais « SAP » en dur) : une recherche « SAP » ou « Kubernetes » se voit pleine en réunion.
 * Tout est fictif : noms inventés, SIREN à clé de Luhn fausse, liens en `example.org` (domaine réservé),
 * aucune source nommée à l'écran. Coverage : `DEMO_DISCOVER_SKILL_SEARCH_COVERAGE`.
 */

interface DemoSkillAccount {
  readonly siren: string
  readonly name: string
  readonly nafCode: string
  readonly sector: string
  readonly city: string
  readonly department: string
  readonly headcountRange: string
  /** Intitulés (la compétence est insérée à la place de `{skill}`) et âge en jours de chaque offre. */
  readonly offers: readonly { readonly title: string; readonly daysAgo: number }[]
  /** #4515 (lot DÉCOUVRIR-MOTEUR, 27/10) — la ville de l'offre quand elle n'est pas le siège : la carte la dit. */
  readonly offerCity?: string
  /** #4430 — d'où viennent ses offres en salle : collecte fraîche, ou cache commun daté. */
  readonly provenance?: 'freshFill' | 'cached'
}

const DEMO_SKILL_ACCOUNTS: readonly DemoSkillAccount[] = [
  {
    siren: '000000917',
    name: 'Rhénalp Équipements (démo)',
    nafCode: '46.69B',
    sector: 'Commerce de gros de fournitures et équipements industriels divers',
    city: 'Bartenheim',
    department: '68',
    headcountRange: '250 à 499 salariés',
    offerCity: 'Mulhouse',
    offers: [
      { title: 'Business Analyst {skill} H/F', daysAgo: 4 },
      { title: 'Consultant {skill} confirmé', daysAgo: 19 },
      { title: 'Chef de projet {skill}', daysAgo: 41 },
    ],
  },
  {
    siren: '000000925',
    name: 'Brasseries de l’Ill (démo)',
    nafCode: '11.05Z',
    sector: 'Fabrication de bière',
    city: 'Strasbourg',
    department: '67',
    headcountRange: '500 à 999 salariés',
    provenance: 'cached',
    offers: [
      { title: 'Responsable applicatif {skill}', daysAgo: 8 },
      { title: 'Administrateur {skill}', daysAgo: 33 },
    ],
  },
  {
    siren: '000000933',
    name: 'Mutuelle Seine-et-Marne Prévoyance (démo)',
    nafCode: '65.12Z',
    sector: 'Autres assurances',
    city: 'Melun',
    department: '77',
    headcountRange: '250 à 499 salariés',
    provenance: 'freshFill',
    offers: [{ title: 'Expert {skill} — équipe finance', daysAgo: 12 }],
  },
  // #4819.4 — Castaing Transports est semé dans la liste scriptée (`demo-scripts.ts`), mais dès qu'un mot-clé est posé
  // le contrôleur répond par CETTE liste-ci : sans lui, « Java », « cyber » ou « transport » ne le rendaient jamais.
  {
    siren: '000000982',
    name: 'Castaing Transports (démo)',
    nafCode: '49.41A',
    sector: 'Transport & Logistique — transport routier et affrètement',
    city: 'Nantes',
    department: '44',
    headcountRange: '500 à 999 salariés',
    offers: [{ title: 'Lead développeur {skill} — supervision de la flotte', daysAgo: 20 }],
  },
]

/**
 * #4115.5 (recette R8 du 03/11/2026) — LES SIGNAUX DATÉS DES COMPTES DE LA RECHERCHE D'EXEMPLE (craft rule n°9). Sans
 * eux, « Besoins et signaux » disait « aucun signal daté » sur une recherche pleine de comptes. Chaque compte porte, rangés
 * par la grille (`tier`, un RANG et jamais une probabilité) : UN signal fort (le recrutement sur la compétence TAPÉE) et
 * deux de contexte. Les dates sont FIGÉES (jours ISO écrits en dur, jamais relatifs à aujourd'hui) ; fictifs, sans source nommée.
 */
const DEMO_SKILL_SIGNALS: Readonly<
  Record<
    string,
    { hiring: { label: string; date: string }; context: readonly Pick<DiscoverSignal, 'type' | 'label' | 'date'>[] }
  >
> = {
  '000000917': {
    hiring: { label: 'Recrutement {skill} — équipe systèmes d’information, site de Mulhouse', date: '2026-10-27' },
    context: [
      {
        type: 'business',
        label: 'Réorganisation de la direction des systèmes d’information annoncée',
        date: '2026-09-18',
      },
      { type: 'tech', label: 'Migration du système de gestion des commandes engagée', date: '2026-08-24' },
    ],
  },
  '000000925': {
    hiring: { label: 'Recrutement {skill} — responsable applicatif', date: '2026-10-22' },
    context: [
      { type: 'funding', label: 'Budget d’investissement industriel voté pour 2027', date: '2026-09-30' },
      { type: 'business', label: 'Ouverture d’un second site de production annoncée', date: '2026-07-09' },
    ],
  },
  '000000933': {
    hiring: { label: 'Recrutement {skill} — équipe finance', date: '2026-10-20' },
    context: [
      { type: 'legal', label: 'Mise en conformité réglementaire du système d’information engagée', date: '2026-09-04' },
      { type: 'business', label: 'Fusion avec une mutuelle voisine approuvée en assemblée', date: '2026-06-26' },
    ],
  },
  '000000966': {
    hiring: { label: 'Recrutement {skill} — développeur', date: '2026-10-29' },
    context: [
      { type: 'tech', label: 'Refonte de la plateforme client lancée', date: '2026-09-11' },
      { type: 'funding', label: 'Financement de croissance annoncé', date: '2026-07-21' },
    ],
  },
  '000000974': {
    hiring: { label: 'Recrutement {skill} — développeur', date: '2026-10-19' },
    context: [
      { type: 'business', label: 'Deux nouveaux contrats cadres signés', date: '2026-09-02' },
      { type: 'tech', label: 'Industrialisation de la chaîne de livraison en cours', date: '2026-08-05' },
    ],
  },
  // #4819.4 — Castaing Transports est rendu dès qu'un mot-clé est posé : il porte donc aussi ses signaux datés.
  '000000982': {
    hiring: { label: 'Recrutement {skill} — supervision de la flotte', date: '2026-10-14' },
    context: [
      { type: 'tech', label: 'Renouvellement du système de suivi de flotte engagé', date: '2026-09-09' },
      { type: 'business', label: 'Ouverture d’une plateforme logistique régionale annoncée', date: '2026-07-16' },
    ],
  },
}

/** Les signaux datés d'un compte de la salle (compétence TAPÉE reprise), du plus fort au contexte ; `[]` si inconnu. */
export function demoSkillSignals(skill: string, siren: string): DiscoverSignal[] {
  const entry = DEMO_SKILL_SIGNALS[siren]
  if (!entry) return []
  return [
    { type: 'hiring', label: entry.hiring.label.replace('{skill}', skill), date: entry.hiring.date, tier: 'strong' },
    ...entry.context.map((signal): DiscoverSignal => ({ ...signal, tier: 'context' })),
  ]
}

const DEMO_SKILL_INTERMEDIARIES: readonly (Omit<DemoSkillAccount, 'nafCode' | 'sector' | 'headcountRange'> & {
  readonly kind: 'recruiter' | 'esn'
})[] = [
  {
    siren: '000000941',
    name: 'Talents & Cadres Recrutement (démo)',
    kind: 'recruiter',
    city: 'Paris',
    department: '75',
    offers: [
      { title: 'Consultant {skill} FICO — pour notre client', daysAgo: 2 },
      { title: 'Chef de projet {skill} S/4 — pour notre client', daysAgo: 9 },
    ],
  },
  {
    siren: '000000958',
    name: 'Numéris Conseil (démo)',
    kind: 'esn',
    city: 'Nanterre',
    department: '92',
    offers: [{ title: 'Consultant {skill} — centre d’excellence', daysAgo: 6 }],
  },
]

function demoDay(daysAgo: number): string {
  return new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10)
}

function evidence(skill: string, siren: string, offers: DemoSkillAccount['offers'], offerCity?: string) {
  const recentFirst = [...offers].sort((a, b) => a.daysAgo - b.daysAgo)
  const latest = recentFirst[0]!
  return {
    skill,
    offerCount: offers.length,
    // #4664 — le détail des offres qui ont fait sortir le compte, chacune avec le lien de SON annonce (domaine réservé).
    offers: recentFirst.map((offer, index) => ({
      title: offer.title.replace('{skill}', skill),
      city: null,
      date: demoDay(offer.daysAgo),
      url: `https://offres.example.org/demo/${siren}/${index + 1}`,
    })),
    latestOffer: {
      title: latest.title.replace('{skill}', skill),
      city: offerCity ?? null,
      date: demoDay(latest.daysAgo),
      url: `https://offres.example.org/demo/${siren}/1`,
      source: null,
    },
  }
}

/** #4419.1 — employeurs fictifs que le registre ne tranche pas (homonymie) : comptés, jamais listés. */
const DEMO_SKILL_UNRESOLVED = 1

/**
 * #4674 — l'employeur fictif en homonymie est RENDU quand même : l'offre le prouve, son identité est « en cours » (deux
 * entreprises portent ce nom). Sans SIREN : aucune fiche, aucune action. Domaine d'annonce réservé (`example.org`).
 */
const DEMO_SKILL_PENDING = { key: 'delorme', name: 'Ateliers Delorme', city: 'Colmar', daysAgo: 6 } as const

/** La compétence posée (premier mot-clé, sinon première technologie), telle que tapée ; `null` = aucune. */
function demoSkill(query: Record<string, unknown>): string | null {
  const pick = (value: unknown): string | null =>
    Array.isArray(value) ? (value.map(v => String(v ?? '').trim()).find(v => v.length > 0) ?? null) : null
  return pick(query.keywords) ?? pick(query.technologiesObserved)
}

/**
 * La réponse de démonstration d'une recherche par compétence, ou `null` sans compétence (la liste
 * scriptée d'avant reste alors la réponse). Les comptes sont rangés par nombre d'offres, comme le vrai rang.
 */
export function demoSkillSearchResponse(query: Record<string, unknown>): {
  candidates: DiscoverCandidate[]
  query: Record<string, unknown>
  degraded: unknown[]
  skillIntermediaries: DiscoverSkillIntermediary[]
  skillPendingEmployers: DiscoverSkillPendingEmployer[]
} | null {
  const skill = demoSkill(query)
  if (skill === null) return null
  const candidates = [...DEMO_SKILL_ACCOUNTS]
    .sort((a, b) => b.offers.length - a.offers.length)
    .map((account): DiscoverCandidate => ({
      name: account.name,
      siren: account.siren,
      nafCode: account.nafCode,
      sector: account.sector,
      city: account.city,
      department: account.department,
      headcountRange: account.headcountRange,
      creationDate: null,
      score: null,
      scoreFactors: [],
      // #4115.5 — les signaux datés du compte (dates figées), sinon l'onglet « Besoins et signaux » reste vide.
      signals: demoSkillSignals(skill, account.siren),
      angle: null,
      suggestedRoles: [],
      portfolioState: 'new',
      accountId: null,
      sources: [],
      skillEvidence: evidence(skill, account.siren, account.offers, account.offerCity),
      // #4430 — la provenance, comme le vrai chemin : un compte trouvé par une collecte d'offres
      // fraîche (recherche maigre remplie), un autre aux offres lues dans le cache commun, datées.
      ...(account.provenance === 'freshFill' ? { skillFreshFill: true } : {}),
      ...(account.provenance === 'cached' ? { jobsAsOf: demoDay(3) } : {}),
    }))
  const skillIntermediaries = DEMO_SKILL_INTERMEDIARIES.map(item => ({
    siren: item.siren,
    name: item.name,
    kind: item.kind,
    city: item.city,
    department: item.department,
    skillEvidence: evidence(skill, item.siren, item.offers),
  }))
  const skillPendingEmployers: DiscoverSkillPendingEmployer[] = [
    {
      id: `offer:demo-${DEMO_SKILL_PENDING.key}`,
      name: DEMO_SKILL_PENDING.name,
      identity: 'ambiguous',
      // #4712 — motif FINAL : plusieurs entités du groupe recrutent sur place, aucune n'est choisie au hasard.
      identityReason: 'homonym_on_site',
      city: DEMO_SKILL_PENDING.city,
      skillEvidence: evidence(
        skill,
        DEMO_SKILL_PENDING.key,
        [{ title: 'Développeur {skill} H/F', daysAgo: DEMO_SKILL_PENDING.daysAgo }],
        DEMO_SKILL_PENDING.city,
      ),
    },
  ]
  return {
    candidates,
    query: {
      ...query,
      skillSearch: {
        skills: [skill],
        // #4419.1 — les compteurs par étape, cohérents avec la liste rendue : un employeur fictif reste en homonymie
        // (le bandeau « non identifiés » se voit en salle), aucune coupure par le délai, aucune source nommée.
        offersSeen: [...DEMO_SKILL_ACCOUNTS, ...DEMO_SKILL_INTERMEDIARIES].reduce((n, a) => n + a.offers.length, 0),
        offersRejected: { anonymous: 2, tooOld: 3, internship: 1, skillAbsent: 0, outsideTrade: 1, outsideZone: 4 },
        employerGroups: candidates.length + skillIntermediaries.length + DEMO_SKILL_UNRESOLVED,
        beyondCap: 0,
        resolutionFailures: {
          homonym: DEMO_SKILL_UNRESOLVED,
          registrySilent: 0,
          publicAdministration: 0,
          unavailable: 0,
        },
        notAttempted: 0,
        unresolvedRendered: skillPendingEmployers.length,
        outsideZone: 0,
        employersFound: candidates.length + skillIntermediaries.length,
        unresolvedEmployers: DEMO_SKILL_UNRESOLVED,
        intermediaries: skillIntermediaries.length,
        accountsFound: candidates.length,
        deadlineCut: false,
        emptyCause: null,
      },
    },
    degraded: [],
    skillIntermediaries,
    skillPendingEmployers,
  }
}
