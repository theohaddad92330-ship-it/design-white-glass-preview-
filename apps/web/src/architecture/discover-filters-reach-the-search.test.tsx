import { render, screen, fireEvent, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ContactListItem } from '@bellum/contracts'
import frDiscover from '@/i18n/locales/fr/discover.json'
import { FilterRail } from '@/features/discover/view/FilterRail'
import {
  applyRailConstraints,
  buildDiscoverRequest,
  emptyUnifiedFilters,
  knownContactLevelsByCompany,
  primaryMode,
  type UnifiedFilters,
} from '@/features/discover/lib/discover-filters'
import type { DiscoverCandidate } from '@/features/discover/lib/discover-types'

// LUDB.3 — le vocabulaire suit le pack de l'espace (session) ; la garde juge le rail d'un espace IT.
vi.mock('@/features/profile/hooks/usePackVocabulary', () => ({ usePackVocabulary: () => ({ context: undefined }) }))

/**
 * GA-275 — #1766 — CHAQUE FILTRE DÉCLARÉ AGIT, DANS LES DEUX MODES, OU LE DIT.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * L'INCIDENT
 * ─────────────────────────────────────────────────────────────────────────────
 * Le 09/09/2026 à 09:05, un client coche PME, ETI et Grande entreprise dans le
 * rail de Découvrir, puis deux signaux d'intention, puis « Rechercher ».
 * `companyCategory` est absent de `buildSignalsQuery` (le serveur des signaux ne
 * le déclare même pas) et n'est croisé nulle part côté écran : les trois cases
 * n'ont RIEN fait, et l'écran n'en a rien dit. Cinq autres champs du même rail —
 * région, chiffre d'affaires (deux bornes), forme juridique, code NAF — étaient
 * morts de la même façon.
 *
 * ⚠️ Ce n'est PAS ce qui a produit les « 0 résultats » du client : un filtre
 * ignoré ÉLARGIT la recherche, il ne la resserre jamais. Ce sont deux défauts
 * distincts trouvés dans la même capture, et les confondre ferait chercher au
 * mauvais endroit la prochaine fois.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA FAMILLE, ET POURQUOI UN CLIQUET
 * ─────────────────────────────────────────────────────────────────────────────
 * « Un filtre déclaré au contrat, accepté par le serveur, posé dans l'URL, passé
 * au hook, et jamais envoyé » a déjà été payé DEUX fois dans ce dépôt, dont une
 * fois huit jours durant. Le jumeau le plus proche est `sectors`, corrigé sur
 * cet écran même : il est croisé À L'ÉCRAN, sur le code NAF que chaque candidat
 * porte déjà, parce que le serveur des signaux ne sait pas l'exprimer.
 *
 * Corriger les six et laisser arriver le septième, c'est se préparer le même
 * retour. D'où ce cliquet : il énumère TOUS les champs de `UnifiedFilters`, et
 * pour chacun, dans CHAQUE mode, il exige l'une des trois honnêtetés possibles —
 * et il la PROUVE en exécutant le vrai code.
 *
 *   · `query`  — le critère part dans le corps de la requête ;
 *   · `screen` — il est croisé à l'écran, sur un fait réel du candidat ;
 *   · `mute`   — il ne peut pas agir dans ce mode, et l'écran LE DIT.
 *
 * ⚠️ « part réellement dans la requête » ne suffirait pas comme unique critère :
 * ce serait déclarer `sectors` cassé alors qu'il marche. La question honnête est
 * « ce critère AGIT-il, et sinon l'écran le dit-il ? ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE GARDE PROUVE D'ELLE-MÊME
 * ─────────────────────────────────────────────────────────────────────────────
 * · elle SAIT DIRE NON — retirer `filters.nafCode` de `applyRailConstraints`, ou
 *   retirer `notApplied={registryOnly}` d'un champ du rail, la fait rougir ;
 * · elle LIT quelque chose — le corpus de filtres est comparé aux clés RÉELLES
 *   de `emptyUnifiedFilters()`, et le corpus de candidats est vérifié non vide ;
 * · elle N'ATTRAPE PAS ce qu'elle ne vise pas — un témoin vérifie qu'en mode
 *   Registre les quatre champs `mute` ne portent AUCUNE note (ils agissent), et
 *   que `sinceDays`/`signalSources`, inertes par construction, ne sont pas
 *   comptés comme des défauts.
 *
 * ⚠️ Aucun libellé n'est recopié à la main : les phrases attendues sont LUES
 * dans le catalogue FR. Une garde qui recopie un libellé devient verte le jour
 * où l'apostrophe change.
 */

/* ------------------------------------------------------------------ */
/*  Le corpus : ce que chaque filtre doit prouver, mode par mode.       */
/* ------------------------------------------------------------------ */

type Mode = 'registry' | 'signals'

interface ModeClaim {
  /** `query` = sérialisé ; `screen` = croisé sur un fait ; `mute` = inerte, et dit. */
  how: 'query' | 'screen' | 'mute' | 'flips-mode'
  /** `query` : ce qui doit apparaître dans le corps sérialisé. */
  trace?: string
  /** `mute` : POURQUOI ce critère ne peut pas agir dans ce mode. */
  why?: string
  /** `mute` : le chemin de la clé FR que le rail rend à côté du champ. `null`
   *  quand le champ n'a AUCUN contrôle au rail — il n'y a alors rien à côté de
   *  quoi écrire, et la raison ci-dessus est la seule trace possible. */
  announcedBy?: string | null
  /** `mute` : le LIBELLÉ du champ qui doit porter cette note.
   *
   *  ⚠️ Sans lui la garde était BORGNE, et mesurée telle : quatre champs
   *  partagent la même phrase, si bien que la chercher « quelque part à
   *  l'écran » restait vert alors que la note avait été retirée de la
   *  catégorie d'entreprise — le champ EXACT que le client avait coché. Une
   *  note se vérifie là où le critère a été posé, pas ailleurs. */
  announcedOn?: string
}

interface FilterClaim {
  /** La valeur POSÉE sur le rail pour éprouver ce filtre. */
  sample: Partial<UnifiedFilters>
  /** Un candidat que ce filtre doit ÉCARTER (pour `screen`). */
  contradicts?: Partial<DiscoverCandidate>
  /** Un candidat que ce filtre doit GARDER (pour `screen`). */
  matches?: Partial<DiscoverCandidate>
  /** Les contacts connus de l'espace, quand le filtre les croise (#3528.3). */
  contacts?: Partial<ContactListItem>[]
  registry: ModeClaim
  signals: ModeClaim
}

/** Instant figé : `age` se traduit en dates absolues, qui doivent être lisibles. */
const NOW = Date.UTC(2026, 0, 15)

const CLAIMS: Record<keyof UnifiedFilters, FilterClaim> = {
  sectors: {
    sample: { sectors: ['aerospace'] },
    contradicts: { nafCode: '62.01Z' },
    matches: { nafCode: '30.30Z' },
    registry: { how: 'query', trace: '30.30Z' },
    signals: { how: 'screen' },
  },
  nafCode: {
    // #1766 — MORT en mode Signaux avant ce lot : ni envoyé, ni croisé.
    sample: { nafCode: '43.21A' },
    contradicts: { nafCode: '62.01Z' },
    matches: { nafCode: '43.21A' },
    registry: { how: 'query', trace: '43.21A' },
    signals: { how: 'screen' },
  },
  // #2165.27 — Exclusions. Aucune source (registre gouv.fr, sources de signal)
  // n'exprime de critère NÉGATIF : contrairement à `sectors` ci-dessus, ce
  // champ se croise donc À L'ÉCRAN dans LES DEUX MODES, jamais dans la requête.
  excludeSectors: {
    sample: { excludeSectors: ['software_tech'] },
    contradicts: { nafCode: '62.01Z' },
    matches: { nafCode: '30.30Z' },
    registry: { how: 'screen' },
    signals: { how: 'screen' },
  },
  // #2165.24 — Groupe / filiale. Même statut qu'`excludeSectors` ci-dessus :
  // aucune source ne l'exprime, croisé À L'ÉCRAN dans LES DEUX MODES, sur le
  // lien capitalistique déjà résolu (`DiscoverCandidate.groupRole`).
  groupRole: {
    sample: { groupRole: 'filiale' },
    contradicts: { groupRole: 'groupe' },
    matches: { groupRole: 'filiale' },
    registry: { how: 'screen' },
    signals: { how: 'screen' },
  },
  // #4294.7 — « Déjà travaillées ». Même statut que `groupRole` : aucune source ne l'exprime, croisé À L'ÉCRAN dans
  // LES DEUX MODES, sur `DiscoverCandidate.workedBefore` (relation ou mission passée, calculé à la lecture).
  workedOnly: {
    sample: { workedOnly: true },
    contradicts: { workedBefore: undefined },
    matches: { workedBefore: true },
    registry: { how: 'screen' },
    signals: { how: 'screen' },
  },
  // #2291.2 — « recourt au freelance / à la régie ». Même statut que
  // `groupRole` : aucune source ne l'exprime en requête, croisé À L'ÉCRAN
  // dans LES DEUX MODES, sur le modèle de contrat OBSERVÉ
  // (`DiscoverCandidate.contractModel`).
  contractRecourseObserved: {
    sample: { contractRecourseObserved: true },
    contradicts: {
      contractModel: {
        observedAt: '2026-01-15',
        jobOffers: {
          source: 'France Travail',
          total: 4,
          counts: { permanent: 4, fixedTerm: 0, interim: 0, freelance: 0, other: 0 },
          since: '2025-11-02',
          until: '2026-01-10',
        },
        publicContracts: null,
      },
    },
    matches: {
      contractModel: {
        observedAt: '2026-01-15',
        jobOffers: {
          source: 'France Travail',
          total: 4,
          counts: { permanent: 3, fixedTerm: 0, interim: 0, freelance: 1, other: 0 },
          since: '2025-11-02',
          until: '2026-01-10',
        },
        publicContracts: null,
      },
    },
    registry: { how: 'screen' },
    signals: { how: 'screen' },
  },
  // #2616.2 — Employeurs publics exclus (« comptes qui recrutent »). Même
  // statut que `contractRecourseObserved` ci-dessus : aucune source ne
  // l'exprime en requête, croisé À L'ÉCRAN dans LES DEUX MODES, sur le fait
  // déjà résolu par un signal (`DiscoverSignal.publicEmployer`,
  // `is_public_employer` côté IA).
  excludePublicEmployers: {
    sample: { excludePublicEmployers: true },
    contradicts: { signals: [{ type: 'hiring', label: '5 postes ouverts', date: '2026-01-10', publicEmployer: true }] },
    matches: { signals: [{ type: 'hiring', label: '3 postes ouverts', date: '2026-01-10', publicEmployer: false }] },
    registry: { how: 'screen' },
    signals: { how: 'screen' },
  },
  // #2616.1 — le CDI distinguable, filtrable. Même statut qu'`excludePublicEmployers`
  // juste au-dessus : aucune source ne l'exprime en requête, croisé À L'ÉCRAN
  // dans LES DEUX MODES, sur le même fait déjà résolu par un signal `hiring`
  // (`DiscoverSignal.contractType`, `job_kind` côté IA). INCLUSION plutôt
  // qu'exclusion : `contradicts` ci-dessous est donc le candidat SANS CDI
  // confirmé (celui qui doit sortir), `matches` celui qui reste.
  cdiOnly: {
    sample: { cdiOnly: true },
    contradicts: { signals: [{ type: 'hiring', label: 'Mission intérim', date: '2026-01-10', contractType: null }] },
    matches: { signals: [{ type: 'hiring', label: 'Dev Python', date: '2026-01-10', contractType: 'CDI' }] },
    registry: { how: 'screen' },
    signals: { how: 'screen' },
  },
  // #4999 — « Freelance seul » : même statut que `cdiOnly`, sur le CONTRAT réel de la source (`contractType`).
  freelanceOnly: {
    sample: { freelanceOnly: true },
    contradicts: { signals: [{ type: 'hiring', label: 'CDI Python', date: '2026-01-10', contractType: 'CDI' }] },
    matches: { signals: [{ type: 'hiring', label: 'Mission Python', date: '2026-01-10', contractType: 'FREELANCE' }] },
    registry: { how: 'screen' },
    signals: { how: 'screen' },
  },
  // #5000 — « CDD seul » et « Intérim seul » : même statut que `cdiOnly`, sur le CONTRAT réel de la source.
  cddOnly: {
    sample: { cddOnly: true },
    contradicts: { signals: [{ type: 'hiring', label: 'CDI Python', date: '2026-01-10', contractType: 'CDI' }] },
    matches: { signals: [{ type: 'hiring', label: 'CDD Python', date: '2026-01-10', contractType: 'CDD' }] },
    registry: { how: 'screen' },
    signals: { how: 'screen' },
  },
  interimOnly: {
    sample: { interimOnly: true },
    contradicts: { signals: [{ type: 'hiring', label: 'Mission', date: '2026-01-10', contractType: 'FREELANCE' }] },
    matches: { signals: [{ type: 'hiring', label: 'Intérim', date: '2026-01-10', contractType: 'INTERIM' }] },
    registry: { how: 'screen' },
    signals: { how: 'screen' },
  },
  // #3096 — la politique de télétravail, filtrable. Même statut que `cdiOnly`
  // juste au-dessus : aucune source ne l'exprime en requête, croisé À
  // L'ÉCRAN dans LES DEUX MODES, sur le même fait déjà résolu par un signal
  // `hiring` (`DiscoverSignal.remoteWorkPolicy`, `derive_remote_policy` côté
  // IA). INCLUSION : `contradicts` est le candidat SANS la politique cochée
  // (celui qui doit sortir), `matches` celui qui la confirme.
  remotePolicies: {
    sample: { remotePolicies: ['full_remote'] },
    contradicts: {
      signals: [{ type: 'hiring', label: 'Technicien', date: '2026-01-10', remoteWorkPolicy: 'sur_site' }],
    },
    matches: {
      signals: [{ type: 'hiring', label: 'Dev Python', date: '2026-01-10', remoteWorkPolicy: 'full_remote' }],
    },
    registry: { how: 'screen' },
    signals: { how: 'screen' },
  },
  // #3097 — la séniorité recherchée, filtrable. Même statut que
  // `remotePolicies` juste au-dessus : croisé À L'ÉCRAN dans LES DEUX MODES,
  // sur `DiscoverSignal.seniority` (`derive_seniority` côté IA).
  seniorities: {
    sample: { seniorities: ['senior'] },
    contradicts: {
      signals: [{ type: 'hiring', label: 'Dev Junior', date: '2026-01-10', seniority: 'junior' }],
    },
    matches: {
      signals: [{ type: 'hiring', label: 'Dev Senior', date: '2026-01-10', seniority: 'senior' }],
    },
    registry: { how: 'screen' },
    signals: { how: 'screen' },
  },
  // #3528.3 — niveau de décision. Même statut que `groupRole` : croisé À
  // L'ÉCRAN dans LES DEUX MODES, sur les contacts CONNUS de l'espace (intitulé
  // collecté → niveau, `resolveContactLevel`). Un compte sans contact connu est
  // écarté, jamais deviné.
  decisionLevels: {
    sample: { decisionLevels: ['n1'] },
    contradicts: { name: 'Sans Contact SA' },
    matches: { name: 'Avec Directeur SA' },
    contacts: [{ company_name: 'Avec Directeur SA', title: 'Directeur technique', decision_role: null }],
    registry: { how: 'screen' },
    signals: { how: 'screen' },
  },
  // #3226 (#3203.6) — le delivery fit externe, filtrable. Même statut que
  // `remotePolicies`/`seniorities` ci-dessus : croisé À L'ÉCRAN dans LES DEUX
  // MODES, sur `DiscoverSignal.deliveryFit` (`classify_delivery_fit` côté IA).
  deliveryFitFilter: {
    sample: { deliveryFitFilter: ['compatible'] },
    contradicts: {
      signals: [{ type: 'hiring', label: 'Dev', date: '2026-01-10', deliveryFit: 'incompatible' }],
    },
    matches: {
      signals: [{ type: 'hiring', label: 'Dev', date: '2026-01-10', deliveryFit: 'compatible' }],
    },
    registry: { how: 'screen' },
    signals: { how: 'screen' },
  },
  department: {
    sample: { department: '69' },
    registry: { how: 'query', trace: '"69"' },
    signals: { how: 'query', trace: '"69"' },
  },
  // #2165.28 — filtre SERVEUR mémoire marché : envoyé dans les DEUX modes
  // (`buildRegistryQuery` ET `buildSignalsQuery`), jamais croisé à l'écran —
  // aucun candidat ne porte sa pile observée côté client.
  technologiesObserved: {
    sample: { technologiesObserved: 'java, react' },
    registry: { how: 'query', trace: 'java' },
    signals: { how: 'query', trace: 'java' },
  },
  // #2165.30 — même mécanisme. ⚠️ Doctrine c65 (GA-259) : seul `true` est
  // sérialisé (voir `buildRegistryQuery`/`buildSignalsQuery`) — le corpus ne
  // prouve donc que le cas posé, jamais un `false` qui n'existe pas côté requête.
  externalRecourseObserved: {
    sample: { externalRecourseObserved: true },
    registry: { how: 'query', trace: '"externalRecourseObserved":true' },
    signals: { how: 'query', trace: '"externalRecourseObserved":true' },
  },
  // #4632.2 — les deux critères du panneau « Contexte marché observé » (retiré) sont BRANCHÉS sur la recherche : ils
  // voyagent jusqu'à l'API, qui CLASSE la liste par la mémoire marché (les comptes dont l'entreprise est observée
  // avec cette famille de rôles / cet écosystème d'abord, les autres suivent dans leur ordre — rien n'est écarté
  // sur une absence que la mémoire marché ne peut pas prouver). Plus inertes : GA-275 les voit agir.
  roleFamilyObserved: {
    sample: { roleFamilyObserved: 'Data' },
    registry: { how: 'query', trace: '"roleFamilyObserved":"Data"' },
    signals: { how: 'query', trace: '"roleFamilyObserved":"Data"' },
  },
  ecosystemObserved: {
    sample: { ecosystemObserved: 'Sopra' },
    registry: { how: 'query', trace: '"ecosystemObserved":"Sopra"' },
    signals: { how: 'query', trace: '"ecosystemObserved":"Sopra"' },
  },
  // #5203 (lot 782) — période et nature des besoins : elles RETIRENT côté serveur, dans les deux modes.
  needsPeriod: {
    sample: { needsPeriod: 'old' },
    registry: { how: 'query', trace: '"needsPeriod":"old"' },
    signals: { how: 'query', trace: '"needsPeriod":"old"' },
  },
  needsNature: {
    sample: { needsNature: ['mission'] },
    registry: { how: 'query', trace: '"needsNature":["mission"]' },
    signals: { how: 'query', trace: '"needsNature":["mission"]' },
  },
  region: {
    // #1766 — le registre l'expose (`region=76`), le serveur des signaux non.
    // #2642.1 — `region` est désormais MULTI-valeur (le rail coche IDF +
    // Occitanie ensemble) : l'échantillon garde une seule valeur, la trace
    // n'en dépend pas.
    sample: { region: ['76'] },
    registry: { how: 'query', trace: '"76"' },
    signals: {
      how: 'mute',
      why: "Le serveur des signaux ne déclare aucun champ de région, et un candidat de signal ne porte que son département — reconstruire la région depuis 101 départements écrits de mémoire fabriquerait une table que personne n'a mesurée.",
      announcedBy: 'rail.registryOnlyIdle',
      announcedOn: 'rail.regionLabel',
    },
  },
  revenueMin: {
    sample: { revenueMin: '5000000' },
    registry: { how: 'query', trace: '5000000' },
    signals: {
      how: 'mute',
      why: "Un candidat de signal ne porte AUCUN chiffre d'affaires : le croiser demanderait d'en inventer un.",
      announcedBy: 'rail.registryOnlyIdle',
      announcedOn: 'rail.revenueLabel',
    },
  },
  revenueMax: {
    sample: { revenueMax: '9000000' },
    registry: { how: 'query', trace: '9000000' },
    signals: {
      how: 'mute',
      why: "Même absence de fait que la borne basse — un candidat de signal ne porte pas de chiffre d'affaires.",
      announcedBy: 'rail.registryOnlyIdle',
      announcedOn: 'rail.revenueLabel',
    },
  },
  companyCategory: {
    // Le filtre EXACT que le client avait coché en entier le 09/09/2026.
    sample: { companyCategory: ['ETI'] },
    registry: { how: 'query', trace: 'ETI' },
    signals: {
      how: 'mute',
      why: "La catégorie INSEE croise effectif, chiffre d'affaires ET bilan ; la déduire de la seule tranche d'effectif d'un candidat (« 200 salariés donc PME ») fabriquerait un fait que le registre ne dit pas. #4362.2 : elle n'a plus de contrôle au rail — « Taille d'entreprise » est UN filtre de tranches (`headcount`), et une ancienne catégorie est migrée en tranches à la lecture (`migrateLegacySize`).",
      announcedBy: null,
    },
  },
  // #4361.2 — « Exclure les sociétés cotées » : retrait côté recherche (IA), sur la preuve de
  // cotation liée au SIREN. Un candidat de signal ne porte pas son SIREN prouvé : muet dans ce
  // mode, et le rail le DIT à côté de l'interrupteur.
  excludeListed: {
    sample: { excludeListed: true },
    registry: { how: 'query', trace: 'excludeListed' },
    signals: {
      how: 'mute',
      why: "Un candidat de signal ne porte pas de SIREN prouvé au registre : la cotation se lit sur le SIREN, la déduire d'un nom ou d'une taille fabriquerait un fait.",
      announcedBy: 'rail.registryOnlyIdle',
      announcedOn: 'rail.excludeListedLabel',
    },
  },
  legalForm: {
    sample: { legalForm: '5710' },
    registry: { how: 'query', trace: '5710' },
    signals: {
      how: 'mute',
      why: "Un candidat de signal ne porte pas sa forme juridique : elle n'est ni dans la moisson, ni dans les faits registre résolus.",
      announcedBy: 'rail.registryOnlyIdle',
      announcedOn: 'rail.legalFormLabel',
    },
  },
  city: {
    sample: { city: 'Toulouse' },
    contradicts: { city: 'Lyon' },
    matches: { city: 'Toulouse' },
    registry: { how: 'query', trace: 'Toulouse' },
    signals: { how: 'screen' },
  },
  // #2642.2 — le rayon ne part QUE combiné à une ville (`railFor` fournit déjà
  // `city: 'Lyon'` comme porteur neutre des autres champs).
  // #4627 — revient sur GA-275, décision Louis 31/10 : le rayon prime sur le nom. En Signaux il se croise à
  // l'écran sur les coordonnées CONNUES des communes (une commune hors du cercle reste écartée).
  cityRadiusKm: {
    sample: { city: 'Lyon', cityRadiusKm: '50' },
    contradicts: { city: 'Marseille' },
    matches: { city: 'Lyon' },
    registry: { how: 'query', trace: '"radiusKm":50' },
    signals: { how: 'screen' },
  },
  // #3983.2 — siège ou implantation. Le registre sait baser une zone sur le
  // siège (`siteBasis: 'headquarters'`, honoré côté IA) ; le serveur des signaux
  // ne déclare aucun champ de ce genre, et un candidat de signal ne porte pas
  // la preuve d'un siège. Le critère ne part que sur une ZONE : `department`
  // est le porteur neutre.
  siteBasis: {
    sample: { siteBasis: 'headquarters', department: '69' },
    registry: { how: 'query', trace: '"siteBasis":"headquarters"' },
    signals: {
      how: 'mute',
      why: "Le serveur des signaux ne déclare aucun champ de base de zone, et un candidat de signal ne porte pas la preuve de l'adresse de son siège — l'inférer d'une ville de site fabriquerait un siège que personne n'a mesuré.",
      announcedBy: 'rail.registryOnlyIdle',
      announcedOn: 'rail.siteBasisLabel',
    },
  },
  headcount: {
    // #3908 — `headcount` est désormais MULTI-valeur (cumul de tranches non
    // contiguës, union) : même renversement que `region` ci-dessus.
    // L'échantillon garde une seule valeur, la trace n'en dépend pas.
    sample: { headcount: ['250-999'] },
    contradicts: { headcountRange: '10 à 19 salariés' },
    matches: { headcountRange: '250 à 499 salariés' },
    registry: { how: 'query', trace: '250' },
    signals: { how: 'screen' },
  },
  age: {
    sample: { age: 'lt3' },
    contradicts: { creationDate: '1998-04-02' },
    matches: { creationDate: '2025-06-01' },
    registry: { how: 'query', trace: '2023-01-15' },
    signals: { how: 'screen' },
  },
  freetext: {
    sample: { freetext: 'migration SAP' },
    registry: { how: 'query', trace: 'migration SAP' },
    signals: {
      how: 'mute',
      why: "Le plein texte du registre cherche sur des champs qu'un candidat de signal ne porte pas (raison sociale complète, enseignes, sigles). Le croiser sur le seul `name` écarterait de vraies cibles au nom d'un critère plus étroit que celui qui a été posé — et ce champ n'a aucun contrôle au rail : il n'arrive que d'une recherche enregistrée au format registre.",
      announcedBy: null,
    },
  },
  signalSources: {
    sample: { signalSources: ['tender'] },
    registry: {
      how: 'flips-mode',
      why: "Cocher une source d'intention BASCULE la recherche en mode Signaux : il n'existe pas d'état « mode Registre avec une source cochée » où le critère pourrait être ignoré.",
    },
    signals: { how: 'query', trace: 'tender' },
  },
  sinceDays: {
    sample: { sinceDays: 30 },
    registry: {
      how: 'mute',
      why: "La fenêtre de fraîcheur borne des signaux datés ; sans signal coché elle ne s'applique à rien, et le registre n'a pas de fraîcheur à borner.",
      announcedBy: 'rail.recencyHint',
      announcedOn: 'signalsMode.recencyLabel',
    },
    signals: { how: 'query', trace: '30' },
  },
  keywords: {
    sample: { keywords: 'cloud' },
    // #4045.1 (Louis 12/10) — en mode Registre, les mots-clés TRIENT les signaux de chaque compte
    // (le recoupement passe en tête, aucune entreprise retirée) : ils sont sérialisés, plus muets.
    registry: { how: 'query', trace: 'cloud' },
    signals: { how: 'query', trace: 'cloud' },
  },
  entityType: {
    sample: { entityType: 'esn' },
    registry: {
      how: 'mute',
      why: "Le RETOURNEMENT lit qui a PUBLIÉ une offre ; le mode Registre cherche par code NAF explicite et n'a pas de publication à retourner. #4746.2 (lot P) : il n'a plus de contrôle au rail — « Le type de compte » vit dans l'onglet « Comptes / Autres acteurs » de la liste (GA-26 : un réglage à un seul endroit) ; une URL `entityType=` ouvre l'onglet et les pastilles qui lui correspondent.",
      announcedBy: null,
    },
    signals: { how: 'query', trace: 'esn' },
  },
}

/* ------------------------------------------------------------------ */
/*  Outillage                                                          */
/* ------------------------------------------------------------------ */

function candidate(over: Partial<DiscoverCandidate>): DiscoverCandidate {
  return {
    name: 'Témoin',
    siren: '000000000',
    nafCode: null,
    sector: null,
    city: null,
    department: null,
    headcountRange: null,
    creationDate: null,
    score: null,
    scoreMax: null,
    scoreUnmeasured: [],
    scoreFactors: [],
    signals: [],
    dataConfidence: null,
    angle: null,
    suggestedRoles: [],
    portfolioState: 'new',
    accountId: null,
    sources: [],
    ...over,
  }
}

/**
 * Un rail LANÇABLE dans le mode voulu, portant le filtre à éprouver et rien
 * d'autre. Le mode Registre exige au moins un critère structuré : un porteur
 * neutre est ajouté, et il change quand c'est LUI qu'on éprouve.
 */
function railFor(mode: Mode, key: keyof UnifiedFilters, sample: Partial<UnifiedFilters>): UnifiedFilters {
  const base =
    mode === 'signals'
      ? { ...emptyUnifiedFilters(), signalSources: ['hiring' as const] }
      : { ...emptyUnifiedFilters(), ...(key === 'city' ? { department: '31' } : { city: 'Lyon' }) }
  return { ...base, ...sample }
}

// #3983.2 — « sans » retire le SEUL critère testé et garde le reste de l'échantillon : un
// critère qui n'existe que sur une zone (`siteBasis` porté par `department`) doit être comparé
// à la même zone sans lui, sinon c'est la zone qu'on mesure, pas le critère.
function railWithout(mode: Mode, key: keyof UnifiedFilters, sample: Partial<UnifiedFilters> = {}): UnifiedFilters {
  const rest: Partial<UnifiedFilters> = { ...sample }
  delete rest[key]
  return railFor(mode, key, rest)
}

function serialise(filters: UnifiedFilters): string {
  return JSON.stringify(buildDiscoverRequest(filters, NOW))
}

/** Tous les candidats-témoins du corpus, ensemble : c'est sur EUX qu'on prouve
 *  qu'un filtre `mute` ne déplace rien. Un corpus vide rendrait la preuve nulle. */
const CORPUS: DiscoverCandidate[] = Object.values(CLAIMS).flatMap((claim, i) =>
  [claim.contradicts, claim.matches]
    .filter((over): over is Partial<DiscoverCandidate> => over !== undefined)
    .map((over, j) => candidate({ ...over, siren: `${100000000 + i * 10 + j}` })),
)

/** Le libellé FR d'une clé de traduction — LU, jamais recopié. */
function frLabel(path: string): string {
  const value = path
    .split('.')
    .reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], frDiscover)
  expect(typeof value, `clé FR absente : ${path}`).toBe('string')
  return value as string
}

const MODES: Mode[] = ['registry', 'signals']
const entries = Object.entries(CLAIMS) as [keyof UnifiedFilters, FilterClaim][]

/* ------------------------------------------------------------------ */
/*  1. La garde LIT quelque chose, et elle lit TOUT                     */
/* ------------------------------------------------------------------ */

describe('GA-275 — le corpus des filtres', () => {
  it('couvre EXACTEMENT les champs déclarés du rail — un filtre neuf rougit ici', () => {
    // C'est la moitié qui empêche le septième filtre mort : ajouter un champ à
    // `UnifiedFilters` sans dire comment il agit fait échouer la CI.
    expect(Object.keys(CLAIMS).sort()).toEqual(Object.keys(emptyUnifiedFilters()).sort())
  })

  it('n’est pas vide, et ses candidats-témoins non plus', () => {
    expect(entries.length).toBeGreaterThanOrEqual(16)
    expect(CORPUS.length).toBeGreaterThanOrEqual(10)
    // Le corpus doit être DISCRIMINANT : sans faits contradictoires, « rien ne
    // bouge » serait vrai de n'importe quel filtre.
    expect(CORPUS.filter(c => c.nafCode !== null).length).toBeGreaterThanOrEqual(2)
    expect(CORPUS.filter(c => c.city !== null).length).toBeGreaterThanOrEqual(2)
  })

  it('exige une raison ÉCRITE partout où un critère n’agit pas', () => {
    for (const [key, claim] of entries) {
      for (const mode of MODES) {
        const modeClaim = claim[mode]
        if (modeClaim.how === 'query' || modeClaim.how === 'screen') continue
        expect((modeClaim.why ?? '').length, `${key} / ${mode} : raison manquante`).toBeGreaterThan(60)
      }
    }
  })
})

/* ------------------------------------------------------------------ */
/*  2. Ce qui est déclaré ENVOYÉ part vraiment                          */
/* ------------------------------------------------------------------ */

describe('GA-275 — un critère déclaré « envoyé » atteint le corps de la requête', () => {
  const sent = entries.flatMap(([key, claim]) =>
    MODES.filter(mode => claim[mode].how === 'query').map(mode => [key, mode, claim] as const),
  )

  it('lit un corpus non vide', () => {
    expect(sent.length).toBeGreaterThanOrEqual(14)
  })

  it.each(sent)('%s — mode %s', (key, mode, claim) => {
    const body = serialise(railFor(mode, key, claim.sample))
    expect(primaryMode(railFor(mode, key, claim.sample))).toBe(mode)
    expect(body, `${key} n’apparaît pas dans le corps : ${body}`).toContain(claim[mode].trace as string)
  })
})

/* ------------------------------------------------------------------ */
/*  3. Ce qui est déclaré CROISÉ écarte vraiment                        */
/* ------------------------------------------------------------------ */

describe('GA-275 — un critère déclaré « croisé à l’écran » resserre vraiment la liste', () => {
  const crossed = entries.flatMap(([key, claim]) =>
    MODES.filter(mode => claim[mode].how === 'screen').map(mode => [key, mode, claim] as const),
  )

  it('lit un corpus non vide', () => {
    expect(crossed.length).toBeGreaterThanOrEqual(5)
  })

  it.each(crossed)('%s — mode %s', (key, mode, claim) => {
    const rail = railFor(mode, key, claim.sample)
    const contradicting = candidate({ ...claim.contradicts, siren: '999999999' })
    const matching = candidate({ ...claim.matches, siren: '888888888' })

    const kept = applyRailConstraints(
      [contradicting, matching],
      rail,
      mode,
      NOW,
      knownContactLevelsByCompany((claim.contacts ?? []) as ContactListItem[]),
    ).map(c => c.siren)

    expect(kept, `${key} n’a écarté personne`).not.toContain('999999999')
    expect(kept, `${key} a écarté ce qui correspond`).toContain('888888888')
  })
})

/* ------------------------------------------------------------------ */
/*  4. Ce qui est déclaré INERTE l'est vraiment — et l'écran le dit      */
/* ------------------------------------------------------------------ */

describe('GA-275 — un critère déclaré « n’agit pas dans ce mode » est bien inerte', () => {
  const mute = entries.flatMap(([key, claim]) =>
    MODES.filter(mode => claim[mode].how === 'mute').map(mode => [key, mode, claim] as const),
  )

  it('lit un corpus non vide', () => {
    expect(mute.length).toBeGreaterThanOrEqual(9)
  })

  // Si un jour le critère se met à agir, cette assertion rougit et l'entrée doit
  // remonter en `query` ou `screen` : le classement ne peut pas se périmer en
  // silence.
  it.each(mute)('%s — mode %s : ni envoyé, ni croisé', (key, mode, claim) => {
    const withIt = railFor(mode, key, claim.sample)
    const without = railWithout(mode, key, claim.sample)

    expect(serialise(withIt)).toBe(serialise(without))
    expect(applyRailConstraints(CORPUS, withIt, mode, NOW)).toEqual(applyRailConstraints(CORPUS, without, mode, NOW))
  })

  it('cocher une source d’intention BASCULE le mode plutôt que de se faire ignorer', () => {
    const rail = { ...emptyUnifiedFilters(), city: 'Lyon', ...CLAIMS.signalSources.sample }
    expect(primaryMode(rail)).toBe('signals')
  })
})

/* ------------------------------------------------------------------ */
/*  5. Et l'écran le DIT — au point où le critère a été posé            */
/* ------------------------------------------------------------------ */

function railProps(filters: UnifiedFilters) {
  return {
    filters,
    onChange: vi.fn(),
    onSubmit: vi.fn(),
    onApply: vi.fn(),
    extras: {
      fit: 'any' as const,
      minAccountsSeen: null,
      existingRelationshipOnly: false,
      rank2OpeningOnly: false,
      observedClientsOnly: false,
      expertiseKnownOnly: false,
      complementarityKnownOnly: false,
    },
    loading: false,
  }
}

function openFilters() {
  fireEvent.click(screen.getByRole('button', { name: /tous les filtres/i }))
  return within(screen.getByRole('dialog'))
}

/** #4494 — « Cadrer la recherche » range ses champs par RUBRIQUE : on ouvre celle qui porte le champ visé. */
function openSectionWith(labelPath: string) {
  const dialog = openFilters()
  for (const tab of dialog.getAllByTestId(/^framing-section-/)) {
    fireEvent.click(tab)
    if (screen.queryAllByText(frLabel(labelPath)).length > 0) return
  }
}

/** Toutes les rubriques, l'une après l'autre : ce qu'aucune ne dit n'est dit nulle part. */
function visitAllSections(visit: () => void) {
  const dialog = openFilters()
  for (const tab of dialog.getAllByTestId(/^framing-section-/)) {
    fireEvent.click(tab)
    visit()
  }
}

/**
 * Le CHAMP qui porte un libellé donné.
 *
 * `Field` rend `<span>libellé</span>` puis son contrôle, puis sa note, dans un
 * seul conteneur : remonter d'un cran depuis le libellé donne exactement le
 * champ, et rien d'autre. C'est ce qui rend la vérification LOCALE — la note
 * doit être à côté du critère, pas « quelque part à l'écran ».
 */
function fieldOf(labelPath: string): HTMLElement {
  const label = screen.getByText(frLabel(labelPath))
  const field = label.parentElement
  expect(field, `champ introuvable pour ${labelPath}`).not.toBeNull()
  return field as HTMLElement
}

describe('GA-275 — un critère inerte le DIT à côté de son champ', () => {
  const announced = entries.flatMap(([key, claim]) =>
    MODES.filter(mode => claim[mode].how === 'mute' && claim[mode].announcedBy).map(
      mode => [key, mode, claim[mode].announcedBy as string, claim[mode].announcedOn as string] as const,
    ),
  )

  it('lit un corpus non vide, et chaque note sait sur QUEL champ elle doit être', () => {
    expect(announced.length).toBeGreaterThanOrEqual(7)
    for (const [key, , , on] of announced) expect(on, `${key} : champ porteur non déclaré`).toBeTruthy()
  })

  it.each(announced)('%s — mode %s', (_key, mode, path, on) => {
    render(<FilterRail {...railProps(railWithout(mode, 'sectors'))} />)
    // #4494 — les champs vivent dans les rubriques de « Cadrer la recherche » : on ouvre celle du champ,
    // puis on cherche la note à côté de CE champ (recherche par champ, pas par conteneur).
    openSectionWith(on)
    expect(within(fieldOf(on)).getByText(frLabel(path))).toBeInTheDocument()
  })

  /**
   * LE TÉMOIN — la garde ne doit pas attraper ce qu'elle ne vise pas.
   *
   * En mode Registre, région / catégorie / chiffre d'affaires / forme juridique
   * AGISSENT : y écrire « ne s'applique pas » serait un mensonge symétrique, et
   * c'est exactement ce qu'un correctif trop gourmand aurait produit.
   */
  it('ne dit RIEN de tel là où le critère agit — mode Registre', () => {
    render(<FilterRail {...railProps(railWithout('registry', 'sectors'))} />)
    // `queryAllByText` et non `queryByText` : ce dernier JETTE quand il en
    // trouve plusieurs, et le rouge parlerait alors de multiplicité au lieu de
    // la règle enfreinte. Chaque rubrique est lue : aucune ne doit le dire.
    visitAllSections(() => expect(screen.queryAllByText(frLabel('rail.registryOnlyIdle'))).toHaveLength(0))
  })

  it('ne dit rien non plus des mots-clés : ils agissent dans les deux modes (#4045.1)', () => {
    for (const mode of MODES) {
      const { unmount } = render(<FilterRail {...railProps(railWithout(mode, 'sectors'))} />)
      expect(screen.queryAllByText(/Ne s’applique pas : coche un signal/)).toHaveLength(0)
      unmount()
    }
  })
})
