import { z } from 'zod'
import { discoverSourceAxesSchema } from './discover-source-axes.js'
import {
  discoverSkillEvidenceSchema,
  discoverSkillIntermediarySchema,
  discoverSkillPendingEmployerSchema,
} from './discover-skill-evidence.js'
import { criteriaWidenedBySchema } from './criteria-referential.js'
import { contextModeSchema } from './surface-context-contract.js'
import { similarityHeadlineSchema } from './account.js'
import {
  DISCOVER_MAX_CITY_RADIUS_KM,
  discoverCandidateZoneSchema,
  discoverZoneWideningSchema,
  zoneCeilingSchema,
} from './zone-tiers.js'

/**
 * Découvrir v2 — contrat partagé IA ↔ API ↔ Web.
 * Spec de référence : `agent_docs/discover-v2-contract.md`.
 *
 *     « Le registre produit la liste. Le LLM ne produit que l'angle commercial. »
 *
 * La v1 était **un appel Brave + un appel Claude** : noms d'entreprises, score
 * `X/10` et « contacts clés » étaient tous générés par le modèle, sans
 * résolution SIREN ni registre. Ce fichier encode les trois garde-fous qui
 * ferment cette porte :
 *
 * 1. `siren` est **obligatoire et non vide** sur un candidat — pas de SIREN, pas
 *    de candidat (c'est ce qui produisait « Fabricant Fenêtres / Industrie ») ;
 * 2. `score` est borné 0-100 et accompagné de `scoreFactors`, chaque point étant
 *    rattaché à un facteur nommé portant sa preuve — le badge redevient auditable.
 *    Il est `null` — et non `0` — quand rien n'était mesurable : « on n'a pas pu
 *    évaluer » et « ça ne correspond à rien » ne peuvent pas partager un chiffre ;
 * 3. `degraded` est **non négociable** : toute source sans clé, hors quota ou
 *    injoignable y apparaît et l'UI l'affiche. Aucun repli silencieux sur du LLM
 *    (règle CLAUDE.md : « JAMAIS de données fictives »).
 *
 * Flux : web → API (JWT, profil ESN résolu server-side, état portefeuille) → IA.
 */

/** Type de signal « pourquoi maintenant ». Chaque valeur correspond à une
 *  source réelle et libre : BOAMP (AO ouverts), DECP (marchés attribués),
 *  France Travail / APEC (recrutements), BODACC (vie juridique), tech-detect.
 *  #4045 — `business` : une actualité de l'entreprise (projet, levée, nomination)
 *  tirée de l'historique du compte, que le web fusionne dans la ligne (#3819) ;
 *  la démonstration la sert dans la réponse scriptée pour la même raison.
 *  #4734 — `ecosystem` : un label / une appartenance à un annuaire d'écosystème startup. Ce n'est PAS une levée
 *  (`funding`) : c'est un fait à part, rattaché par SIREN, rendu sous son propre nom. NATURE seulement — la
 *  source demandable reste `discoverSignalSourceSchema`, qui n'a pas bougé. */
export const discoverSignalTypeSchema = z.enum([
  'tender',
  'award',
  'hiring',
  'legal',
  'tech',
  'funding',
  'business',
  'ecosystem',
])

/** #4068 — au plus trois besoins connus voyagent avec un candidat : la carte n'en montre qu'un ou deux. */
export const DISCOVER_KNOWN_NEEDS_MAX = 3

/** #4068 — un besoin connu de l'espace, daté ; `dateIsDetection` = daté par l'analyse qui l'a produit. */
export const discoverKnownNeedSchema = z.object({
  label: z.string().min(1),
  date: z.string(),
  dateIsDetection: z.boolean().optional(),
})
export type DiscoverKnownNeed = z.infer<typeof discoverKnownNeedSchema>

export const discoverSignalSchema = z.object({
  type: discoverSignalTypeSchema,
  /** « AO IT publié », « 5 postes data ouverts ». */
  label: z.string(),
  /** ISO — OBLIGATOIRE : c'est le « pourquoi maintenant ». Un signal non daté ne
   *  justifie pas d'appeler aujourd'hui, et ne marque donc aucun point. */
  date: z.string(),
  url: z.string().optional(),
  /** Ex. titulaire du marché (DECP) = le concurrent déjà en place. */
  detail: z.string().optional(),
  /**
   * Offre publiée par un cabinet de recrutement POUR UN CLIENT (tome 2 §13).
   *
   * Le signal reste AFFICHÉ — le commercial peut vouloir travailler le cabinet
   * — mais il ne dit rien du besoin de l'employeur nommé, donc il ne marque
   * aucun point. Sans cette distinction, les intermédiaires trustent Découvrir :
   * ce sont eux qui publient le plus d'offres IT du pays.
   */
  intermediated: z.boolean().optional(),
  /**
   * #2616.2 — l'employeur d'un signal `hiring` est-il un organisme PUBLIC
   * (catégorie juridique INSEE 7xxx — `is_public_employer`,
   * `account_qualification.py`) ? `undefined`/`null` tant que la catégorie
   * juridique n'est pas résolue — jamais deviné : « non mesuré » n'est pas
   * « privé » (GA-18/GA-19). Sert le préréglage « comptes qui recrutent »
   * (`excludePublicEmployers`, `discover-filters.ts`) : un recrutement public
   * suit un cycle budgétaire fixé d'avance, pas une décision d'achat qu'un
   * commercial peut influencer.
   */
  publicEmployer: z.boolean().optional(),
  /**
   * #4045.1 — `true` quand le signal recoupe un mot-clé de la recherche : le serveur
   * (un seul lexique, `domain_job_filters.keyword_terms`) le passe en tête et pose
   * ce drapeau, l'écran ne recalcule rien. Absent = pas de mot-clé, ou aucun recoupement.
   */
  keywordMatch: z.boolean().optional(),
  /**
   * #4115 — la tranche où la grille de signaux (`discover_signal_grid.py`) range ce
   * signal : `strong` (5 au plus par carte) ou `context` (10 au plus). Un RANG, jamais
   * une probabilité. Absent = signal non passé par la grille (instantané d'avant).
   */
  tier: z.enum(['strong', 'context']).optional(),
})

/** Les huit blocs du barème, dans l'ordre d'affichage. Miroir exact de
 *  `_BLOCK_MAXIMA` (`apps/ia/app/services/discover_scoring.py`). */
export const DISCOVER_SCORE_BLOCKS = [
  { key: 'activity', max: 10 },
  { key: 'geography', max: 7 },
  { key: 'headcount', max: 5 },
  { key: 'age', max: 3 },
  { key: 'it_surface', max: 20 },
  { key: 'signals', max: 20 },
  { key: 'accessibility', max: 20 },
  { key: 'evidence', max: 15 },
] as const
export type DiscoverScoreBlock = (typeof DISCOVER_SCORE_BLOCKS)[number]['key']
export const discoverScoreBlockSchema = z.enum(
  DISCOVER_SCORE_BLOCKS.map(b => b.key) as unknown as [DiscoverScoreBlock, ...DiscoverScoreBlock[]],
)

/* ------------------------------------------------------------------ */
/*  La barrière d'achat (tome 3)                                       */
/* ------------------------------------------------------------------ */

/**
 * Les quatre classes d'adressabilité, et leur libellé produit.
 *
 * ⚠️ Le libellé ne dit JAMAIS « facile » et la classe A dit « ouvert
 * PROBABLE » (D88). La nuance n'est pas cosmétique : elle protège l'utilisateur
 * d'une déception et le produit d'une promesse fausse. Une cinquième valeur
 * existe — `null`, « non estimable » — et elle n'est pas une classe : c'est
 * l'absence de verdict.
 */
/**
 * Les trois lectures d'une même moisson territoriale (tome 4 §20.1).
 *
 * `client` = les comptes finaux qui recrutent (prospection directe) · `esn` =
 * les ESN qui débordent (prospection partenaire) · `all` = les deux. Le filtre
 * s'applique sur le NAF RÉSOLU : aucune source d'offres ne publie de SIREN ni
 * de code NAF, contrairement à ce que le tome suppose.
 */
export const ENTITY_TYPES = ['client', 'esn', 'all'] as const
export type DiscoverEntityType = (typeof ENTITY_TYPES)[number]

export const ACCESS_CLASSES = ['A', 'B', 'C', 'D'] as const
export type AccessBarrierClass = (typeof ACCESS_CLASSES)[number]

/** Les six proxies du §4, dans l'ordre du tome. */
export const ACCESS_PROXY_KEYS = [
  'statut',
  'effectif',
  'cotation',
  'commande_publique',
  'decentralisation',
  'anciennete',
] as const
export type AccessProxyKey = (typeof ACCESS_PROXY_KEYS)[number]

export const accessProxySchema = z.object({
  key: z.string(),
  /** Contribution SIGNÉE à la barrière. Négative pour la décentralisation. */
  contribution: z.number(),
  /** En français, citant ce qui l'établit. Jamais « public_procurement: true ». */
  evidence: z.string(),
  /** Faux = le proxy n'a pas été mesuré. Il ne vaut PAS zéro pour autant. */
  measurable: z.boolean(),
})

export const accessBarrierSchema = z.object({
  /** 0-10, ou `null` quand moins de trois proxies sont mesurables. */
  score: z.number().nullable(),
  /** 10 − barrière (+ bonus de décentralisation). Jamais fondu dans l'intérêt. */
  accessibility: z.number().nullable(),
  access_class: z.enum(ACCESS_CLASSES).nullable(),
  label: z.string().nullable(),
  proxies: z.array(accessProxySchema),
  measurable: z.boolean(),
  /** Ce qui manque pour estimer — nommé, jamais tu. */
  missing: z.array(z.string()),
  /** Les corrections datées appliquées après le score de base (§7). */
  corrections: z
    .array(z.object({ key: z.string(), delta: z.number(), label: z.string(), evidence: z.string() }))
    .default([]),
  /**
   * Un AVERTISSEMENT hors barème (§28) — aujourd'hui la procédure collective.
   *
   * Volontairement séparé du score : une entreprise en redressement n'est pas
   * « plus dure d'accès », elle est souvent très joignable, et c'est le piège.
   * L'ajouter à la barrière confondrait accessibilité et solvabilité. `date`
   * peut être `null` : taire un risque faute de date serait la pire des deux
   * erreurs, et l'écran dit que la date est inconnue.
   */
  warning: z
    .object({
      kind: z.string(),
      date: z.string().nullable(),
      label: z.string(),
      /** #3916.1 — le lien vers l'annonce BODACC. `null`/absent sur une ligne
       *  sans lien connu (jamais deviné) — l'écran le dit plutôt que de taire
       *  l'absence de preuve cliquable. */
      url: z.string().nullable().optional(),
    })
    .nullable()
    .default(null),
})
export type AccessBarrier = z.infer<typeof accessBarrierSchema>

export const discoverScoreFactorSchema = z.object({
  /** « NAF 62.02 exact », « siège dans la zone cible ». FRANÇAIS, et c'est le
   *  défaut du 09/09 : rendu verbatim, il faisait lire « Relation — L'entrée
   *  n'est pas froide » à un utilisateur en anglais. Il reste émis à
   *  l'identique — voir `label_key` ci-dessous pour le correctif. */
  label: z.string(),
  /** Contribution signée au score. Invariant tenu côté IA :
   *  `score === sum(scoreFactors[].points)` — aucun résidu inexpliqué. */
  points: z.number(),
  /** La donnée brute qui justifie le point. Reste un champ LIBRE, jamais
   *  traduit par ce mécanisme (cf. `CandidateScore.tsx` / `TabAccess.tsx`). */
  evidence: z.string().optional(),
  /** Le bloc du barème d'où vient ce facteur.
   *
   *  Optionnel parce qu'un instantané d'AVANT ce déploiement ne le porte pas —
   *  et un candidat en cache ne doit pas faire tomber l'écran. L'absence se
   *  replie sur la reconnaissance par libellé, qui était le seul mécanisme
   *  jusqu'ici et rangeait trois blocs sur huit dans « divers ». */
  block: discoverScoreBlockSchema.optional(),
  /**
   * Le CODE stable qui remplace `label` côté écran (`apps/web/src/i18n/locales/
   * {fr,en}/{discover,access}.json`) — ajouté le 09/09 pour que l'anglais cesse
   * de lire du français dans un facteur de score ou un axe d'adressabilité.
   *
   * STRICTEMENT ADDITIF, à dessein : le web (Vercel, ~1 min) et l'IA (Railway,
   * plusieurs minutes) ne déploient jamais ensemble, et un champ qui CHANGE de
   * forme pendant cette fenêtre casse l'écran. `label_key` est donc optionnel
   * — absent sur un candidat produit par une IA plus ancienne, ou en cache —
   * et l'écran PRÉFÈRE la clé quand elle est là, se replie sur `label` sinon.
   * `label` n'est retiré de rien : les deux voyagent ensemble.
   */
  label_key: z.string().optional(),
  /** Les valeurs interpolées dans la traduction de `label_key` (« code »,
   *  « city », « year », « n »…). Toujours un objet — vide si `label_key` n'a
   *  besoin d'aucun paramètre — jamais absent quand `label_key` est posé. */
  label_params: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
})

/** Les cinq axes du score d'adressabilité (tome 1 §6). La somme de leurs
 *  plafonds fait les 20 points que le barème lui réserve depuis le premier
 *  jour — et ne calculait jamais. */
export const ADDRESSABILITY_AXES = [
  { key: 'lock', max: 6 },
  { key: 'proportion', max: 5 },
  { key: 'path', max: 5 },
  { key: 'relation', max: 3 },
  { key: 'access_cost', max: 1 },
] as const
export type AddressabilityAxis = (typeof ADDRESSABILITY_AXES)[number]['key']

/**
 * Le SECOND nombre — « pourquoi tu peux y entrer », face à « pourquoi c'est
 * intéressant ».
 *
 * Il n'est jamais additionné au score d'intérêt, et ce n'est pas une
 * convention d'affichage : les facteurs d'adressabilité n'entrent dans aucune
 * somme côté IA. « Intérêt 68/80 · adressabilité 4/20 » dit qu'un compte est
 * parfait et hors de portée ; un 61 unique ne le dit pas, et c'est pourtant lui
 * qui sortirait en tête de liste.
 */
export const addressabilitySchema = z.object({
  /** `null` quand AUCUN axe n'était évaluable — « non mesuré », jamais 0. */
  score: z.number().min(0).max(20).nullable(),
  /** Dénominateur RÉEL : la somme des plafonds des seuls axes mesurés. */
  max: z.number().min(0).max(20),
  /** Les axes qu'on n'a pas pu regarder, NOMMÉS — sans quoi un 11/11 se lirait
   *  comme un 11/20. */
  unmeasured: z.array(z.string()),
  factors: z.array(discoverScoreFactorSchema.extend({ axis: z.string() })),
})
export type Addressability = z.infer<typeof addressabilitySchema>

/** État du candidat dans le portefeuille de l'appelant. Résolu **côté API**
 *  (seule à connaître les comptes du workspace) en croisant les SIREN — c'est
 *  ce qui empêche l'écran de reproposer un compte que le commercial possède
 *  déjà. L'IA renvoie toujours `new`, valeur neutre jamais devinée. */
export const discoverPortfolioStateSchema = z.enum([
  'new',
  'analyzed',
  'watched',
  'customer',
  /**
   * ÉCARTÉ à la porte G1 (PDF 2 §4.4 B2). Ajouté en fin de liste — la garde
   * d'additivité refuse une insertion.
   *
   * Sans cet état, Découvrir reproposait indéfiniment un compte que quelqu'un
   * avait explicitement refusé, et le motif de ce refus n'était visible nulle
   * part. Le candidat n'est pas SUPPRIMÉ de la liste : il est marqué, avec sa
   * date et sa raison, parce qu'un compte écarté il y a huit mois sur « pas de
   * budget » mérite d'être revu, et un compte écarté hier sur « concurrent
   * installé » non.
   */
  'parked',
])

export const discoverSourceSchema = z.object({
  name: z.string(),
  url: z.string().optional(),
  fetchedAt: z.string(),
})

/* ══════════════════════════════════════════════════════════════════════════
   #2544.2 — LE CONTRAT « PERSONNES » D'UN CANDIDAT.
   ══════════════════════════════════════════════════════════════════════════

   Jusqu'ici `DiscoverCandidate` ne portait AUCUNE personne : seulement des
   `suggestedRoles`, c'est-à-dire des fonctions à viser, jamais quelqu'un. Le
   registre public, lui, NOMME les mandataires sociaux, et l'écran n'avait pas
   de place pour les recevoir.

   Trois arbitrages tiennent cette forme, et chacun a coûté quelque chose
   ailleurs dans le produit :

   1. LA PROVENANCE VOYAGE AVEC CHAQUE CHAMP, pas avec la personne. Un nom peut
      venir du registre pendant qu'un lieu de travail vient d'une correction
      humaine ; une provenance posée sur la personne entière obligerait à
      choisir la plus faible des deux, et l'écran ne pourrait plus dire laquelle
      de ses moitiés est attestée. C'est exactement le défaut qu'on corrige
      ailleurs : un champ qui arrive sans dire d'où il vient ne peut pas être
      affiché honnêtement.

   2. UN CHAMP ABSENT EST INCONNU. Il n'y a ni valeur par défaut, ni chaîne
      vide, ni `0` (GA-18 / GA-19) — et, depuis #2613 (20/09/2026), l'écran
      n'écrit plus non plus ce qui manque : dans une liste, une absence ne
      produit AUCUNE ligne. Le contrat ne TRANSPORTE toujours pas de liste
      d'inconnus, qui laisserait deux sources de vérité se contredire (GA-26) :
      l'absence se lit sur les champs, ou elle ne se lit pas.

   3. LE LIEU D'UNE PERSONNE N'EST PAS CELUI DE L'ENTREPRISE. `city` /
      `department`, plus haut, décrivent l'ÉTABLISSEMENT retenu par la
      recherche. `workplace`, ici, décrit l'endroit où QUELQU'UN travaille. Le
      contrat REFUSE de les confondre, et il le refuse par construction :
      voir le raffinement sur `origin` ci-dessous.
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * D'où vient un fait porté par une personne — des FAMILLES, jamais des
 * marques : nos fournisseurs ne se nomment jamais à l'écran.
 *
 * - `registry` : le registre public des entreprises. Il PUBLIE les mandataires
 *   sociaux, rattachés à l'unité légale (le SIREN) — jamais à un site.
 * - `human` : quelqu'un de l'espace l'a saisi ou corrigé. GAGNE TOUJOURS, quelle
 *   que soit sa date (`resolvePersonFact`).
 * - `provider` : un fournisseur d'enrichissement sous contrat.
 * - `workspace` : la mémoire de l'espace lui-même — une fiche déjà possédée.
 */
const personFactOriginSchema = z.enum(['registry', 'human', 'provider', 'workspace'])

/** Ce que TOUT fait porté par une personne doit dire de lui-même. */
const personFactAttestation = {
  origin: personFactOriginSchema,
  /** ISO — QUAND la source a constaté ce fait. Un fait sans date ne peut pas
   *  vieillir, donc ne peut jamais redevenir inconnu (« on archive, on ne
   *  supprime pas »). Obligatoire pour cette raison. */
  observedAt: z.string().min(1),
  /** La preuve publique, quand la source en publie une. OMISE plutôt que
   *  construite : une URL déduite d'un identifiant se lit comme une preuve. */
  url: z.string().optional(),
}

/** Un fait textuel attesté — un nom, un mandat. `value` non vide : une chaîne
 *  blanche n'est pas un fait, c'est un vide qui s'afficherait comme une valeur. */
const attestedTextSchema = z.object({ value: z.string().min(1), ...personFactAttestation }).strict()

/**
 * L'ÉTABLISSEMENT où une personne travaille.
 *
 * ⚠️ `origin: 'registry'` est REFUSÉ, et c'est la pièce maîtresse de ce
 * contrat. Mesuré le 18/09/2026 sur une réponse réelle : un mandataire du
 * registre porte nom, prénoms, qualité, nationalité et type — et aucun champ
 * d'adresse, d'établissement ni de SIRET. Le mandat est attaché au SIREN.
 * « Ce dirigeant travaille à Garchizy » n'est donc pas une lecture du registre,
 * c'est une invention — et une invention que le contrat doit rendre
 * impossible, pas seulement déconseiller.
 */
const attestedWorkplaceSchema = z
  .object({
    /** La ville de l'établissement. Non vide : un lieu sans ville n'est pas un lieu. */
    city: z.string().min(1),
    /** Le SIRET de cet établissement, quand la source le NOMME. C'est lui qui
     *  distingue « on sait où cette personne travaille » de « on a recopié le
     *  siège ». Omis, jamais deviné. */
    siret: z.string().optional(),
    ...personFactAttestation,
  })
  .strict()
  .refine(place => place.origin !== 'registry', {
    message:
      'le registre public rattache un mandataire au SIREN, jamais à un établissement : il ne peut pas attester un lieu de travail',
    path: ['origin'],
  })

/**
 * Une personne nommée sur un candidat.
 *
 * `.strict()` n'est pas une coquetterie : c'est la garde qui empêche un
 * attribut PROTÉGÉ de voyager clandestinement. Le registre publie la
 * nationalité de chaque mandataire, et une liste de personnes EST un classement
 * (registre de doctrine, c58). Ville et pays sont les deux seules exceptions
 * nommées, et ils vivent dans `workplace` — rien d'autre n'a de porte ici.
 */
export const discoverPersonSchema = z
  .object({
    /** Le nom tel que la source le PUBLIE. Obligatoire : sans nom il n'y a pas
     *  de personne, seulement une ligne. */
    name: attestedTextSchema,
    /** Le mandat ou la fonction. ABSENT = inconnu, jamais « non renseigné »
     *  fabriqué. */
    role: attestedTextSchema.optional(),
    /** L'établissement où cette personne travaille. ABSENT = inconnu — et
     *  aujourd'hui TOUJOURS absent des candidats venus du registre, parce
     *  qu'aucune source vérifiée ne le donne. Le jour où l'une le donnera, elle
     *  remplira ce champ sans que rien d'autre bouge. */
    workplace: attestedWorkplaceSchema.optional(),
  })
  .strict()

export type DiscoverPerson = z.infer<typeof discoverPersonSchema>

/*
 * #2613 (20/09/2026) — `discoverPersonUnknownFields` A ÉTÉ SUPPRIMÉE, et c'est
 * une suppression, pas un oubli.
 *
 * Elle dérivait la liste des champs manquants d'une personne pour qu'un écran
 * l'ÉCRIVE (« Non su : le mandat · le lieu de travail »). La décision de Louis
 * du 20/09 retire cet énoncé des listes — « on affiche pas ce qu'on a pas » —
 * et son seul appelant, `CandidatePeople`, ne l'appelle plus. La garder aurait
 * produit exactement le défaut n°1 de ce dépôt : du code juste, calculé, testé,
 * que personne n'appelle.
 *
 * Ce qui reste vrai et n'a pas besoin d'elle : un champ absent est INCONNU, il
 * n'a ni valeur par défaut, ni chaîne vide, ni `0` — le schéma le tient, et
 * c'est lui qui refuse une valeur vide déguisée en fait.
 */

/**
 * Le fait qui GAGNE quand plusieurs sources parlent du même champ.
 *
 * Une correction humaine gagne TOUJOURS, quelle que soit sa date — c'est un
 * arbitrage de doctrine, pas une heuristique de fraîcheur : quelqu'un qui
 * corrige un nom a vu quelque chose que la source n'a pas vu, et le registre
 * qui se rafraîchit demain ne le lui reprend pas. À défaut d'humain, le constat
 * le plus RÉCENT l'emporte. Rien à choisir ⇒ `null`, jamais un marque-place.
 */
export function resolvePersonFact<T extends { origin: string; observedAt: string }>(facts: readonly T[]): T | null {
  const human = facts.filter(fact => fact.origin === 'human')
  const pool = human.length > 0 ? human : facts
  return pool.reduce<T | null>((best, fact) => (best && best.observedAt >= fact.observedAt ? best : fact), null)
}

/**
 * #2291.2 (19/09/2026) — COMMENT CETTE ENTREPRISE CONTRACTUALISE, OBSERVÉ.
 *
 * DÉCISION Louis (QCM) : l'OBSERVER, jamais le déduire. Lu côté IA
 * (`contract_model.py`) sur les lignes que la recherche de signaux a DÉJÀ en
 * main — aucun appel de plus :
 *  - `jobOffers` : les offres que la cible publie ELLE-MÊME (jamais un cabinet
 *    pour elle), classées par le code NATIF de contrat de France Travail —
 *    `freelance` = « Profession libérale », le seul code natif d'indépendant ;
 *    un code non vérifié reste `other`, jamais classé au jugé ;
 *  - `publicContracts` : les avis de marchés publics dont la cible est
 *    l'ACHETEUR, quand l'avis DIT le mode (« assistance technique »,
 *    « en régie » → `regie` ; « au forfait », « forfaitaire » → `fixedPrice`).
 *    Un avis peut nommer les deux : chacun est compté là où il est dit.
 *
 * Chaque bloc porte sa SOURCE, sa FENÊTRE (`since` → `until`, dates des faits
 * comptés) et son VOLUME (`total` ≥ 1 : un bloc n'existe que s'il a lu au
 * moins un fait). `null` sur un bloc = rien d'attribuable dans cette source.
 * Une observation sans indépendant ni régie ne dit JAMAIS « n'y recourt pas »
 * — elle dit ce qui a été lu (doctrine c65, GA-259).
 */
const discoverContractCountSchema = z.number().int().nonnegative()
const discoverContractModelSchema = z.object({
  /** Jour du constat (ISO). */
  observedAt: z.string(),
  jobOffers: z
    .object({
      source: z.string().min(1),
      total: z.number().int().positive(),
      counts: z.object({
        permanent: discoverContractCountSchema,
        fixedTerm: discoverContractCountSchema,
        interim: discoverContractCountSchema,
        freelance: discoverContractCountSchema,
        other: discoverContractCountSchema,
      }),
      since: z.string(),
      until: z.string(),
    })
    .nullable(),
  publicContracts: z
    .object({
      source: z.string().min(1),
      total: z.number().int().positive(),
      regie: discoverContractCountSchema,
      fixedPrice: discoverContractCountSchema,
      since: z.string(),
      until: z.string(),
    })
    .nullable(),
})
export type DiscoverContractModel = z.infer<typeof discoverContractModelSchema>

/** DISCOVER-OFFRES (15/10) — volume d'offres d'une carte (France, fenêtre en jours). */
export const offersVolumeSchema = z.object({
  count: z.number().int().positive(),
  windowDays: z.number().int().positive(),
  country: z.literal('FR'),
})
export type OffersVolume = z.infer<typeof offersVolumeSchema>

/**
 * #3983.1 (#3705.3) — la BASE d'une géographie : siège ou implantation. Posé par
 * le service IA quand une zone département/région est demandée ET que le
 * registre public prouve quelque chose (le siège ou un établissement ACTIF dans
 * la zone). Absent = le registre ne prouve rien : jamais « 0 établissement ».
 *
 * « Équipe » (l'effectif LOCAL d'un site) n'a volontairement AUCUN champ ici :
 * la source ne le publie pas, et on ne l'invente pas.
 */
const discoverGeographySchema = z.object({
  /** `headquarters` = le siège est dans la zone ; `establishment` = seule une
   *  implantation (établissement actif, hors siège) tient la zone. */
  basis: z.enum(['headquarters', 'establishment']),
  headquarters: z.object({ city: z.string().nullable(), department: z.string().nullable() }),
  /** Établissements ACTIFS de la zone, hors siège, tels que le registre les liste. */
  siteCount: z.number().int().nonnegative(),
  sites: z.array(
    z.object({
      siret: z.string().nullable(),
      city: z.string().nullable(),
      department: z.string().nullable(),
      region: z.string().nullable(),
    }),
  ),
  /** Code INSEE de la région quand la zone demandée en est une (pour la nommer). */
  zoneRegion: z.string().nullable(),
})

/** #4430 — un jour civil AAAA-MM-JJ (la date d'une collecte d'offres). */
const discoverIsoDaySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

/** #4791.2 / #4762.1 (Louis 31/10) — un besoin OBSERVÉ dans la base commune, avec sa DATE (« besoin Java, mars
 *  2025 »), récent ou historique, sans borne d'âge. Sans date, pas de besoin : la clé est absente. Aucune source
 *  ne s'y nomme (#4791.4). */
/** #5203 (lot 782) — la NATURE d'un besoin, pour dire POURQUOI le compte est là et pour filtrer. */
export const DISCOVER_NEED_NATURES = ['recrutement', 'mission', 'projet'] as const
export type DiscoverNeedNature = (typeof DISCOVER_NEED_NATURES)[number]
/** #5203 — la période des besoins : tous (défaut, aucune borne d'âge — décision 31/10), récents, anciens. */
export const DISCOVER_NEED_PERIODS = ['all', 'recent', 'old'] as const
export type DiscoverNeedPeriod = (typeof DISCOVER_NEED_PERIODS)[number]
/** #5203 — « récent » = moins de 6 mois ; « ancien » = au-delà. UN seul seuil (GA-26). */
export const DISCOVER_NEED_RECENT_MONTHS = 6

/** #5203 — les filtres de besoins : ils RETIRENT ce qui ne correspond pas (contrairement aux filtres qui classent). */
export const discoverNeedFiltersSchema = z.object({
  needsPeriod: z.enum(DISCOVER_NEED_PERIODS).optional(),
  needsNature: z.array(z.enum(DISCOVER_NEED_NATURES)).max(DISCOVER_NEED_NATURES.length).optional(),
})
export type DiscoverNeedFilters = z.infer<typeof discoverNeedFiltersSchema>

const discoverObservedNeedSchema = z.object({
  label: z.string().min(1).max(160),
  date: z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/),
  /** #5203 — absente = nature inconnue (jamais devinée). */
  nature: z.enum(DISCOVER_NEED_NATURES).optional(),
})

/**
 * #4793.1 / #4791.1 (Louis 31/10) — LE CONTRAT API → IA : un compte de la base COMMUNE (partagée entre espaces,
 * GA-16) qui correspond aux critères, envoyé au moteur comme CANDIDAT. Strict : aucun champ d'espace n'y passe —
 * rien de propre à un espace (CRM, comptes suivis, notes, coûts) ne nourrit un autre espace (#4791.3).
 */
export const discoverCommonBaseCandidateSchema = z
  .object({
    siren: z.string().regex(/^\d{9}$/),
    name: z.string().min(1).max(300),
    city: z.string().max(200).nullable().optional(),
    sector: z.string().max(200).nullable().optional(),
    nafCode: z.string().max(10).nullable().optional(),
    observedNeed: discoverObservedNeedSchema.optional(),
    /** #5203 — vrai = venu des besoins PASSÉS DE L'ESPACE de l'appelant (jamais « base commune »). Aucun champ de personne. */
    fromSpace: z.boolean().optional(),
  })
  .strict()
export type DiscoverCommonBaseCandidate = z.infer<typeof discoverCommonBaseCandidateSchema>

/** #4437 (Louis 21/10/2026) — pourquoi un compte VOISIN est dans la liste : ce qui était demandé
 *  (jetons machine, ex. `hiring:react`) et le type de fait voisin qui l'a amené. */
const discoverWidenedFromSchema = z.object({
  axis: z.enum(['signal']),
  requested: z.array(z.string()),
  via: z.string(),
})

/** #4437 — ce que le palier voisin a fait : ajouté N comptes par ces sources, ou sauté (temps). */
const discoverWideningSchema = z.object({
  requested: z.array(z.string()),
  added: z.number().int().nonnegative(),
  via: z.array(z.string()).optional(),
  skipped: z.enum(['time_budget']).optional(),
})

export const discoverCandidateSchema = z.object({
  // ── REGISTRE (factuel, jamais inventé) ──────────────────────────────────
  name: z.string().min(1),
  /** OBLIGATOIRE. Pas de SIREN = candidat écarté en amont, côté IA. */
  siren: z.string().min(1),
  nafCode: z.string().nullable(),
  sector: z.string().nullable(),
  city: z.string().nullable(),
  department: z.string().nullable(),
  headcountRange: z.string().nullable(),
  creationDate: z.string().nullable(),
  /** #3983.1 — siège / implantation dans la zone demandée ; absent sans zone. */
  geography: discoverGeographySchema.optional(),
  /** #4429.1 — le palier de zone d'un compte ajouté par l'élargissement ; absent sur un compte exact. */
  zone: discoverCandidateZoneSchema.optional(),

  // ── CALCULÉ (déterministe, explicable — aucun LLM) ──────────────────────
  /** `null` = AUCUN critère n'était évaluable (ni donnée registre, ni filtre,
   *  ni profil ESN à quoi comparer). L'UI écrit alors « score indisponible » :
   *  un `0` afficherait « ce compte ne correspond à rien » là où la vérité est
   *  « nous n'avons rien pu mesurer » — deux affirmations opposées sur le même
   *  chiffre, et c'est exactement ce qui rendait l'écran « 0/100 » partout. */
  score: z.number().min(0).max(100).nullable(),
  /** Dénominateur RÉEL du badge : la somme des plafonds des seuls blocs du
   *  barème qu'on a pu mesurer. 100 quand tout était évaluable. */
  scoreMax: z.number().min(0).max(100).optional(),
  /** Blocs du barème sans donnée (`activity`, `geography`, `headcount`,
   *  `signals`, `age`) — dits à l'utilisateur, jamais comptés comme des zéros. */
  scoreUnmeasured: z.array(z.string()).optional(),
  scoreFactors: z.array(discoverScoreFactorSchema),
  /**
   * La barrière d'ACHAT estimée (tome 3). Elle ne se fond ni dans l'intérêt ni
   * dans l'adressabilité : « peux-tu entrer » et « cette organisation
   * sait-elle acheter à quelqu'un comme toi » sont deux questions, et le
   * terrain montre qu'un compte peut être accessible et verrouillé (D71).
   */
  barrier: accessBarrierSchema.nullable().optional(),
  signals: z.array(discoverSignalSchema),
  /**
   * Décision 1 (18/09/2026) — `true` SEULEMENT quand la recherche a
   * réellement interrogé les sources datées pour CE candidat (les premières
   * lignes rendues, en nombre borné — coût maîtrisé). `signals: []` sans ce
   * champ à `true` n'est PAS une mesure : « non mesuré », jamais « aucun
   * signal » (GA-18/19). Optionnel : un instantané d'avant ce déploiement ne
   * le porte pas.
   */
  signalsSearched: z.boolean().optional(),
  /** #4677 — pourquoi une carte n'a PAS (encore) ses signaux : `pending` (la moisson finit en arrière-plan,
   *  la page se relit), `none` (cherché, rien trouvé — une mesure), `unavailable` (une source n'a pas pu
   *  répondre : son vide n'est pas une mesure). Absent = des signaux sont là, ou la carte n'a pas été ciblée. */
  signalsState: z.enum(['pending', 'none', 'unavailable']).optional(),
  /** #4284.26 (décision 22) — ses seules offres sont hors des métiers de l'espace : gardé plus bas, marqué. */
  outOfTrade: z.boolean().optional(),
  /** Second axe, distinct du score commercial (cf. `app/services/score_axes.py`) :
   *  à quel point la donnée sous-jacente est sûre. Se dégrade sur champs registre
   *  manquants, signaux archivés et sources en panne. */
  dataConfidence: z.number().min(0).max(100).optional(),
  /** Le second axe du tome 1 : « peux-tu y entrer ? ». Optionnel — un
   *  instantané d'avant ce déploiement ne le porte pas, et l'écran affiche
   *  alors le seul score d'intérêt, comme avant. */
  addressability: addressabilitySchema.optional(),

  // ── SUGGÉRÉ (LLM — l'UI doit l'étiqueter comme tel) ─────────────────────
  /** `null` quand les faits ne suffisaient pas : un angle vide vaut mieux qu'un
   *  angle inventé. */
  angle: z.string().nullable(),
  /** Des FONCTIONS à viser, jamais des personnes identifiées. */
  suggestedRoles: z.array(z.object({ title: z.string(), department: z.string() })),

  /**
   * Le NAF de cette entreprise peut désigner une ESN comme un cabinet qui n'en
   * est pas un (70.22Z « conseil de gestion », 62.09Z « autres activités
   * informatiques »). Elle apparaît alors dans les DEUX lectures du
   * retournement — marché client et marché ESN — et l'écran le dit, au lieu de
   * la ranger d'un côté au hasard.
   *
   * Optionnel : une réponse d'avant ce déploiement ne porte pas la clé.
   */
  nafAmbiguous: z.boolean().optional(),
  /**
   * #2265.14 — « jamais un intermédiaire présenté comme client final sans
   * badge ». `actorType` (typologie #2265.1/.3) porte une prose française
   * NON traduisible côté client sans deviner un mapping — `isIntermediary`
   * nomme le seul jugement qu'un badge écran doit prendre aujourd'hui : ce
   * candidat n'est pas le client final, c'est un cabinet de recrutement ou
   * une plateforme de mise en relation qui publie POUR un tiers (même preuve
   * qu'`actorType`, `discover_signals.py`, aucun second calcul, GA-26).
   * Optionnel : une réponse d'avant ce déploiement ne porte pas la clé.
   */
  isIntermediary: z.boolean().optional(),
  /**
   * #3757 — une ESN (ou une ESN du référentiel) n'est pas un client final : concurrente ou
   * partenaire rang 2 potentiel. Même classement qu'`actorType` (GA-26) ; jamais posé pour un
   * NAF ambigu (`nafAmbiguous`). Optionnel : réponse d'avant ce déploiement.
   */
  isEsnPeer: z.boolean().optional(),
  /**
   * #4746.2 (lot P) — la pastille d'« Autres acteurs » : ESN, cabinets, intérim, partenaires, sites d'annonces. Même
   * classement qu'`actorType` (GA-26) ; absent = client final ou nature non prouvée. Réponse d'avant : pas de clé.
   */
  actorKind: z.enum(['esn', 'recruiter', 'interim', 'partner', 'adsite']).optional(),
  /**
   * Lot T — POURQUOI une ESN est dans « Autres acteurs » quand son NAF ne le dit pas : `referential` (référencée
   * comme ESN) ou `offers` (ses offres le disent). Absent = reconnue par son NAF, ou pas reconnue : jamais devinée.
   */
  esnRecognition: z.enum(['referential', 'offers']).nullable().optional(),
  /**
   * #3757 (reste) — distingue, ligne par ligne, « concurrente » (hypothèse NAF,
   * `isEsnPeer`) de « partenaire de rang 2 » (fait DÉCLARÉ par CET espace,
   * `partner_relations`, résolu côté API). `true` ⇒ `isEsnPeer` est TOUJOURS
   * `false` : `classify_actor_type` (apps/ia) rend un seul type par candidat,
   * jamais les deux badges à la fois. Optionnel : réponse d'avant ce déploiement.
   */
  isDeclaredPartner: z.boolean().optional(),
  /**
   * #4892.1 — une marque = une ligne : regroupement d'AFFICHAGE proposé quand plusieurs entités juridiques (SIREN
   * distincts) portent la même marque dans la même ville. La tête liste ses entités, un membre nomme sa tête.
   * Jamais une fusion de données. Optionnel : absent = rien à dire.
   */
  brandGroup: z
    .discriminatedUnion('role', [
      z.object({ role: z.literal('head'), members: z.array(z.object({ siren: z.string(), name: z.string() })) }),
      z.object({ role: z.literal('member'), headSiren: z.string(), headName: z.string().nullish() }),
    ])
    .optional(),

  // ── ÉTAT PORTEFEUILLE (résolu côté API) ─────────────────────────────────
  portfolioState: discoverPortfolioStateSchema,
  accountId: z.string().nullable(),
  /** Le motif et la date de l'écartement, quand il y en a un. Optionnels : un
   *  instantané d'avant ce déploiement n'a pas les clés, et un candidat sans
   *  écartement n'a rien à dire ici. */
  parkedReason: z.string().nullable().optional(),
  parkedAt: z.string().nullable().optional(),
  /**
   * #2166.1 — LE LOGO, QUAND IL EST SANS AMBIGUÏTÉ.
   *
   * Le registre (INSEE / Pappers) ne porte ni domaine ni logo pour un candidat
   * qui n'est pas encore possédé — en inventer un depuis un nom serait le même
   * défaut que `AccountPartner.logo_url` a déjà refusé (#1818.2, 93 % des
   * domaines dérivés du nom étaient faux). La seule source réelle : un compte
   * DÉJÀ POSSÉDÉ du même espace que `DiscoverPortfolioService` a apparié sur le
   * SIREN — il porte alors son vrai `logo_url`/`website`.
   *
   * `.optional()` pour le deploy-skew (comme `parkedReason` ci-dessus) : une
   * réponse d'avant ce déploiement ne porte pas ces clés, et l'écran retombe
   * sur la pastille à initiale, comme avant.
   */
  logoUrl: z.string().nullable().optional(),
  /** Le site du compte apparié, pour le seul repli favicon d'affichage — la
   *  même paire que `logoUrl` ci-dessus, jamais deviné. */
  website: z.string().nullable().optional(),

  /**
   * #2165.24 / #2166.3 / #2165.16 — LE RATTACHEMENT CAPITALISTIQUE.
   *
   * Même règle que `logoUrl` ci-dessus : SEULEMENT quand ce candidat
   * correspond déjà à un compte possédé de l'espace qui porte un lien
   * résolu (Pappers cartographie, via `AccountEntity.group_role`). Jamais
   * calculé pour un candidat neuf — appeler la cartographie pour chaque
   * résultat d'une recherche dépenserait un crédit par ligne.
   *
   * `undefined` (clé absente) = candidat neuf ou réponse d'avant ce
   * déploiement. `null` = compte possédé sans lien connu — l'écran écrit
   * « non renseigné », jamais vide trompeur.
   */
  groupRole: z.enum(['groupe', 'filiale']).nullable().optional(),
  /** La tête de groupe (SIREN), quand `groupRole` est `'filiale'`. */
  groupHeadSiren: z.string().nullable().optional(),

  /**
   * #3819.1 — « besoins connus », SEULEMENT quand le candidat correspond déjà
   * à un compte possédé (`accountId` non nul) : un candidat neuf n'a aucun
   * besoin à connaître, donc pas de champ du tout plutôt qu'un `0` deviné.
   * Compte RÉEL des besoins OUVERTS (`NEED_OPEN_STATUSES`) de ce compte,
   * résolu en UNE requête pour toute la page (`DiscoverPortfolioService`,
   * même patron que `resolve()` pour `accountId`) — jamais un appel par carte.
   *
   * `0` est un fait MESURÉ (« on a cherché, il n'y en a aucun »), jamais une
   * non-mesure : contrairement à `scoreUnmeasured`, il n'y a pas de cas où ce
   * compte existe sans avoir pu être calculé pour un compte déjà possédé.
   * `undefined` = candidat neuf, ou réponse d'avant ce déploiement.
   */
  knownNeedsCount: z.number().int().min(0).optional(),
  /**
   * #4068 (lot DECOUVRIR-CARTE, Louis 13/10) — les besoins connus EUX-MÊMES (les
   * plus récents, `DISCOVER_KNOWN_NEEDS_MAX` au plus) : « N besoins connus » ne
   * s'affiche plus sans qu'aucun ne figure dans les signaux forts de la carte.
   * `undefined` = candidat neuf ou lecture en panne, jamais une liste devinée.
   */
  knownNeeds: z.array(discoverKnownNeedSchema).max(DISCOVER_KNOWN_NEEDS_MAX).optional(),

  /**
   * #2166.11 (épopée #2806) — LA RÉFÉRENCE COMPARABLE.
   *
   * Même famille que `similarity_headline` sur `SimilarAccountSuggestion`
   * (`account.ts`, panneau « Similaires » de la fiche compte) — mais calculée
   * ici pour un candidat DÉCOUVERT (registre/signal), jamais pour un compte
   * déjà possédé (`DiscoverPortfolioService.resolveSimilarityHeadlines` ne
   * regarde que les candidats `portfolioState: 'new'`).
   *
   * Seul `kind: 'sector'` est produit sur ce chemin : l'appariement se fait
   * sur le NAF EXACT du candidat contre celui des comptes du portefeuille —
   * la même précision que `listSimilarCompaniesToExplore`
   * (`accounts.service.ts`), qui a remplacé un texte de secteur flou par le
   * NAF précisément parce qu'un texte libre fait remonter des entreprises
   * hors secteur. `twin` (mission signée) et `tech` (pile technique commune)
   * restent le panneau « Similaires » — les extraire ici demanderait
   * d'injecter `AccountMissionsService`/`MarketMemoryService` dans un service
   * du module `ia-proxy`, ce que GA-07 (frontières de modules, ratchet à zéro
   * marge au 25/09/2026) ne laisse pas passer sans relèvement délibéré.
   *
   * `undefined` = candidat déjà possédé, secteur NAF non apparié, ou réponse
   * d'avant ce déploiement.
   */
  similarityHeadline: similarityHeadlineSchema.optional(),

  /**
   * DISCOVER-OFFRES (15/10) — LE VOLUME d'offres publiées par cette entreprise : « N offres en France sur
   * 90 jours ». Un seul aperçu à 0 crédit pour toute la page, additionné par domaine racine ; `count` est
   * STRICTEMENT positif. Absent = pas de réponse, pas de domaine connu ou réponse d'avant ce déploiement :
   * l'écran n'écrit alors AUCUNE ligne (jamais « 0 offre », GA-18 / GA-19). Le fournisseur ne se nomme pas.
   */
  offersVolume: offersVolumeSchema.optional(),

  /**
   * #3408 — la pile technique OBSERVÉE par la mémoire marché sur ce compte
   * (même lecture que le filtre « technologies observées »). Source du
   * « Périmètre conseillé » quand aucune offre du compte ne NOMME de technologie.
   * Absent = compte non couvert ou pile non nommée : une absence ne fait aucune
   * ligne, jamais une pile devinée.
   */
  technologiesObserved: z.array(z.string()).optional(),
  /** COMPETENCE-TROUVE — la preuve qu'il recrute sur la compétence posée (« N offres SAP » + la plus
   *  récente). Absent hors tirage par compétence : une absence ne fait aucune ligne. */
  skillEvidence: discoverSkillEvidenceSchema.optional(),
  /** #4433 — remonté par ÉLARGISSEMENT (moins de 10 résultats exacts) : l'axe, le palier et ce qui l'a fait
   *  remonter (« proche : JavaScript », « secteur voisin : défense », « taille voisine : GC »). Absent =
   *  résultat exact ; l'écran n'écrit alors aucune étiquette. */
  widenedBy: criteriaWidenedBySchema.optional(),
  /** #4430 — compte AJOUTÉ à une recherche par compétence maigre par une collecte d'offres fraîche
   *  (une offre lue cite la compétence). Absent sur un compte trouvé d'abord. */
  skillFreshFill: z.boolean().optional(),
  /** #4793.1 (01/11) — ce compte n'est entré dans la liste que par la base COMMUNE (aucun fournisseur nommé, #4791.4).
   *  Absent = venu du registre. */
  fromCommonBase: z.boolean().optional(),
  /** #4430 — les offres de ce compte sont lues dans le cache commun (plafond d'offres fraîches atteint,
   *  ou collecte récente) : la DATE de leur collecte (AAAA-MM-JJ). Absent = offres fraîches ou non lues. */
  jobsAsOf: discoverIsoDaySchema.optional(),
  /** #4791.2 / #4762.1 — le besoin DATÉ que la base commune a observé chez ce compte. Absent = aucun besoin daté. */
  observedNeed: discoverObservedNeedSchema.optional(),
  /** #4437 — compte ajouté par le palier VOISIN d'un signal maigre (pourquoi il est là). Absent sur l'exact. */
  widenedFrom: discoverWidenedFromSchema.optional(),

  /**
   * #2544.2 — LES PERSONNES NOMMÉES sur ce candidat.
   *
   * Distinct de `suggestedRoles` juste au-dessus, et la différence est celle
   * qui compte : `suggestedRoles` liste des FONCTIONS écrites par un modèle,
   * `people` liste des personnes qu'une source a PUBLIÉES, chaque fait avec sa
   * provenance et sa date. Aucun modèle n'écrit ici.
   *
   * ⚠️ Clé ABSENTE (`undefined`) et liste VIDE ne disent pas la même chose :
   * absente = ce chemin ne regarde pas les personnes, ou la réponse précède ce
   * déploiement ; vide = la source a regardé et n'a NOMMÉ personne. L'écran
   * n'affiche rien dans les deux cas — il n'écrit jamais « 0 personne ».
   */
  people: z.array(discoverPersonSchema).optional(),

  /**
   * #2291.2 — le modèle de contrat OBSERVÉ (voir `discoverContractModelSchema`).
   * Clé ABSENTE = jamais cherché (hors des premières lignes, ou réponse d'avant
   * ce déploiement) ; `null` = cherché, rien d'attribuable — « non observé »,
   * jamais une préférence déduite.
   */
  contractModel: discoverContractModelSchema.nullable().optional(),

  /**
   * #4067 — CE QUE L'ESPACE SAIT DÉJÀ de ce candidat, en six axes nommés
   * (historique des signaux, CRM, mémoire marché, référentiel de comptes
   * cibles, Drive, missions / vivier) — voir `discover-source-axes.ts`.
   * Résolu côté API, filtré par l'espace. Absent = réponse d'avant ce
   * déploiement, ou salle sans lecture : l'écran classe alors comme avant.
   */
  sourceAxes: discoverSourceAxesSchema.optional(),

  sources: z.array(discoverSourceSchema),
})

/** Ce qui n'a pas tourné comme prévu. Jamais masqué — mais pas tout de la même
 *  nature, et c'est `kind` qui les sépare (jamais la lecture de `reason`).
 *
 *  Deux familles très différentes cohabitent dans ce tableau :
 *
 *  - **une PANNE** (`missing_api_key`, `unauthorized`, `quota_exceeded`,
 *    `rate_limited`, `upstream_error`, `network_error`, `invalid_response`,
 *    `empty_query`, `time_budget` — #2521, on a cessé d'attendre à la limite de
 *    temps) : des entreprises (ou des angles) manquent réellement. À rendre fort ;
 *  - **une LIMITE DE CAPACITÉ** (`unsupported_filters`, `kind: 'capability'`) :
 *    la source a répondu, elle n'a simplement pas su exprimer un critère, donc
 *    elle a rendu un SUR-ensemble. Rien ne manque — c'est le resserrement qui
 *    manque. La peindre en « ⚠ Résultats partiels — une source n'a pas répondu »
 *    énonce trois faux et apprend au commercial à ignorer le bandeau, si bien
 *    que la vraie panne du lendemain ne sera plus lue ;
 *  - **UN FILTRE SUR DONNÉE INCONNUE** (`kind: 'unmeasured'`, #2165.28 /
 *    #2165.30) : un filtre serveur sur une donnée que la mémoire marché n'a
 *    pas pour CE compte (pile technique, recours externe) l'écarte de la vue
 *    filtrée sans jamais affirmer qu'il ne correspond pas — le compte n'est
 *    pas exclu EN SILENCE, `count` dit combien, `fields` nomme le critère.
 *
 *  `kind` ABSENT = panne. C'est le défaut fail-loud : une raison future ou
 *  inconnue reste bruyante tant que quelqu'un ne l'a pas classée. */
export const discoverDegradedSchema = z.object({
  source: z.string(),
  reason: z.string(),
  /** Nombre d'entreprises concernées, quand la source le sait. */
  count: z.number().int().nonnegative().optional(),
  /** Nature de l'entrée, pour que l'UI la cadre sans lire la prose :
   *  `capability` (la source a répondu plus LARGE que demandé), `no-match`
   *  (elle a répondu « rien ne correspond »), `not-examined` (borne de
   *  couverture), `ambiguous` (examinée puis rejetée), `unreachable` (registre
   *  muet). Absent = panne. */
  kind: z.string().optional(),
  /** `kind: 'capability'` uniquement — QUELS critères la source n'a pas su
   *  exprimer. Nommés dans le vocabulaire d'écran (`sector`, `city`) quand la
   *  source les connaît, pour que la note se pose À CÔTÉ DU FILTRE concerné
   *  plutôt que dans une alerte en haut de page. Omis plutôt que deviné. */
  fields: z.array(z.string()).optional(),
})

/** Ce que la recherche a RÉELLEMENT couvert.
 *
 *  Quatrième garde-fou, de la même famille que les trois ci-dessus. La
 *  résolution SIREN de `/discover/signals` est bornée par nécessité : l'API
 *  coupe l'appel à 45 s (`timeoutMs: 45_000`, sans retry) et 120 résolutions
 *  coûtent 85 à 144 s de file d'attente derrière le limiteur du registre —
 *  l'étape ne pouvait donc pas finir, et l'écran rendait une liste tronquée
 *  comme si elle était complète.
 *
 *  Les compteurs sont volontairement DISJOINTS, avec un invariant tenu côté IA :
 *  `resolved + rejectedAmbiguous + rejectedUnreachable + notExamined ===
 *  candidatesFound`. `notExamined` n'est PAS un rejet : ces entreprises n'ont
 *  reçu aucun verdict. Les additionner afficherait un jugement jamais rendu —
 *  la même faute que « rate-limit rendu comme homonymie », un cran plus haut. */
export const discoverCoverageSchema = z.object({
  candidatesFound: z.number().int().nonnegative(),
  resolutionsAttempted: z.number().int().nonnegative(),
  resolved: z.number().int().nonnegative(),
  rejectedAmbiguous: z.number().int().nonnegative(),
  rejectedUnreachable: z.number().int().nonnegative(),
  /** Détectées, JAMAIS examinées. Ni retenues, ni écartées. */
  notExamined: z.number().int().nonnegative(),
  /** #4319.2 — les NOMS des entreprises détectées mais non identifiées (non examinées, homonymes, registre muet),
   *  plafonnés côté IA. Absent / vide = aucune ligne à l'écran. */
  notIdentifiedNames: z.array(z.string()).optional(),
  stoppedOn: z.enum(['complete', 'max-resolutions', 'time-budget']),
  resolveOffset: z.number().int().nonnegative(),
  hasMore: z.boolean(),
  /** Résolues puis écartées PAR LE FILTRE de nature (client / ESN). Comptées à
   *  part des rejets et des non-examinées : ce n'est ni un verdict sur la
   *  donnée ni une borne, c'est un choix de l'utilisateur — et le taire ferait
   *  croire que le territoire est plus pauvre qu'il ne l'est. */
  filteredByEntityType: z.number().int().nonnegative().optional(),
})

/** #2489.3/D1 (décision Louis, 18/09/2026 après-midi) — la cible déclarée du
 *  profil ESN FILTRE toujours Découvrir par défaut, y compris une recherche en
 *  texte libre. Mesuré en PRODUCTION le 18/09 (`474fcfa31`, espace
 *  « LouisESN ») : `?freetext=entreprises+dans+le+75` rendait 24 résultats, 0
 *  dans les 5 secteurs cibles déclarés.
 *
 *  Le compteur n'est PAS décoratif : un écran qui écarte en silence ment sur
 *  ce qu'il a trouvé. `applied: false` (bouton « chercher hors de ma cible »
 *  actionné) et `applied: true, excludedCount: 0` (le filtre a tourné et n'a
 *  rien écarté) sont deux affirmations DIFFÉRENTES, et l'écran ne doit jamais
 *  les confondre — voir `discoverResponseSchema.targetSectorFilter` :
 *  `undefined` (pas cet objet à `excludedCount: 0`) est la TROISIÈME lecture,
 *  pour l'espace qui n'a déclaré AUCUNE cible. */
export const discoverTargetSectorFilterSchema = z.object({
  applied: z.boolean(),
  excludedCount: z.number().int().nonnegative(),
  /** Les secteurs (libellé CANDIDAT tel que rendu par la source) écartés — le
   *  POURQUOI mesuré en prod le 18/09 (« 9 restauration traditionnelle, 4
   *  restauration rapide, 2 supermarchés… »), jamais les secteurs cibles déjà
   *  connus de l'utilisateur. */
  excludedSectors: z.array(z.string()),
})

/** #4361.2 — ce que « Exclure les sociétés cotées » a fait, en nombres. Absent quand
 *  l'interrupteur n'est pas posé (un filtre qui n'a pas tourné n'a pas de compteur).
 *  `unknownCount` = les comptes RESTÉS dont la cotation n'est pas établie : l'index prouve
 *  « cotée », jamais « non cotée » — aucun compte n'est donc compté « non coté ».
 *  `sourceAvailable: false` = l'index n'a pas répondu, rien n'a été retiré. */
export const discoverListingFilterSchema = z.object({
  applied: z.boolean(),
  excludedCount: z.number().int().nonnegative(),
  unknownCount: z.number().int().nonnegative(),
  sourceAvailable: z.boolean(),
})

export const discoverResponseSchema = z.object({
  /** #4437 — le palier voisin d'un recrutement qualifié maigre ; absent quand rien n'a été élargi. */
  widening: discoverWideningSchema.optional(),
  candidates: z.array(discoverCandidateSchema),
  /** Lot 786 (#5203) — combien de cartes un filtre de besoins (période / nature) a RETIRÉES ; absent = aucune. */
  needsFilteredOut: z.number().int().positive().optional(),
  /** Les critères normalisés RÉELLEMENT appliqués — l'utilisateur doit voir sur
   *  quoi la liste a été construite. */
  query: z.record(z.string(), z.unknown()),
  degraded: z.array(discoverDegradedSchema),
  /** Absent des réponses `/discover/registry` (chemin non borné). */
  coverage: discoverCoverageSchema.optional(),
  /** Le tri à PROPOSER d'entrée, déduit de la maturité déclarée de l'ESN
   *  (tome 1 §8.3) : une ESN qui démarre ouvre sur l'adressabilité, une ESN
   *  établie sur l'intérêt. Proposé, jamais imposé — un choix explicite de
   *  l'utilisateur le remplace et rien ne le ré-écrase ensuite. */
  recommendedSort: z.enum(['interest', 'addressability', 'balanced']).optional(),
  /** #2489.3/D1 — absent quand l'espace n'a déclaré aucun secteur cible. */
  targetSectorFilter: discoverTargetSectorFilterSchema.optional(),
  /** #4361.2 — absent quand « Exclure les sociétés cotées » n'est pas posé. */
  listingFilter: discoverListingFilterSchema.optional(),
  /** #4429.1 — la ville seule rendait trop peu de comptes : le palier appliqué, ÉCRIT au-dessus de
   *  la liste. Absent quand rien n'a été élargi (assez de résultats, ou `zoneStrict`). */
  zoneWidening: discoverZoneWideningSchema.optional(),
  /** #4045 — des cartes de la page n'ont pas pu être cherchées dans le budget de temps :
   *  leur collecte finit en arrière-plan. Indicateur machine (jamais un nom de source) ;
   *  le web relit UNE fois, plus tard. Absent = rien en cours. */
  jobsPending: z.boolean().optional(),
  jobsPendingCount: z.number().int().nonnegative().optional(),
  /** COMPETENCE-TROUVE — cabinets et ESN qui recrutent sur la compétence : section repliée, à part. */
  skillIntermediaries: z.array(discoverSkillIntermediarySchema).optional(),
  /** #4674 — employeurs prouvés par une offre dont l'identité registre est « en cours » : sans SIREN, donc sans
   *  analyse ni contacts ni CRM. Absent = aucun (l'écran n'écrit alors aucune ligne). */
  skillPendingEmployers: z.array(discoverSkillPendingEmployerSchema).optional(),
})

/** Critères structurés de `POST /ia/discover/registry`. Tous optionnels : sans
 *  critère, c'est le registre qui décide — jamais le modèle. */
export const discoverRegistryFiltersSchema = z.object({
  /** Secteur unique — conservé pour compatibilité (chemin mono-secteur). */
  sector: z.string().optional(),
  /** Secteurs CROISÉS (rail unifié, maquette p.20) : le registre est interrogé
   *  une fois PAR secteur et les listes sont fusionnées par SIREN. Un tableau
   *  vide ou absent = aucune contrainte de secteur. Additif à `sector` : quand
   *  les deux sont fournis, `sectors` prime (le rail n'envoie que `sectors`). */
  sectors: z.array(z.string()).optional(),
  nafCode: z.string().optional(),
  department: z.string().optional(),
  /** Territoire à PLUSIEURS départements. Le registre gouv.fr en accepte
   *  nativement une liste — mesuré le 04/09/2026 : `departement=31,33` rend 142
   *  quand 31 seul en rend 97 et 33 seul 45. Un commercial dont le secteur fait
   *  trois départements ne fait donc plus trois recherches. */
  departments: z.array(z.string()).optional(),
  /** Code de région INSEE. Le champ existait côté IA et était déjà sérialisé —
   *  il n'était jamais REÇU de l'écran, faute d'entrée au contrat. */
  region: z.string().optional(),
  /** #2642.1 — région à PLUSIEURS codes (le rail coche IDF + Occitanie…). Le
   *  registre gouv.fr en accepte nativement une liste, sur le même modèle que
   *  `departments` (`region=11,76` mesuré à 341, contre 220 et 156 séparément,
   *  21/09/2026). */
  regions: z.array(z.string()).optional(),
  /** Chiffre d'affaires, en euros.
   *
   *  ⚠️ Le service IA déclarait ces critères « sans équivalent gouv.fr ». C'ÉTAIT
   *  vrai, ça ne l'est plus : `ca_min=50000000` fait tomber la base NAF 30.30Z
   *  de 745 à 38 (04/09/2026). Les garder « non couverts » envoyait chez Pappers,
   *  facturé à l'appel, des recherches que la source gratuite sait faire.
   *
   *  ⚠️ Ne PAS confondre avec `tranche_chiffre_affaires`, qui est IGNORÉ EN
   *  SILENCE par le registre — même total avant et après, comme un paramètre
   *  inventé. */
  revenueMin: z.number().int().nonnegative().optional(),
  revenueMax: z.number().int().nonnegative().optional(),
  /** Catégorie INSEE : `PME`, `ETI`, `GE`. Elle croise effectif, chiffre
   *  d'affaires et bilan, ce qui rend « ETI industrielle » exprimable là où
   *  l'effectif seul ne suffit pas.
   *
   *  ⚠️ CHOISIE par l'utilisateur, jamais appliquée par défaut : le dépôt a déjà
   *  refusé `categorie_entreprise=ETI,GE` comme correctif automatique au tri du
   *  registre, parce que « les clients d'une ESN ne sont pas tous des ETI, et
   *  une PME de 200 personnes est une cible parfaitement légitime ». */
  companyCategory: z.array(z.string()).optional(),
  /** Catégorie juridique INSEE (`nature_juridique`), ex. `5710` = SAS. */
  legalCategory: z.string().optional(),
  city: z.string().optional(),
  /** #2642.2 — un CERCLE autour de `city`, en kilomètres. Sans effet sans
   *  `city` résolue en commune (voir `_registry_filters` côté IA) : un rayon
   *  n'a pas de centre. L'API du registre refuse au-delà de 50 km (`radius=51`
   *  → 400, mesuré 04/09/2026) : #4641 — jusqu'à 100 km (le défaut d'une ville
   *  seule), le service IA le sert par sept cercles de 50 km (`zone_cover`). */
  radiusKm: z.number().positive().max(DISCOVER_MAX_CITY_RADIUS_KM).optional(),
  /** #4429.1 — « revenir à Toulouse seule » : la ville stricte, aucun palier tenté. */
  zoneStrict: z.boolean().optional(),
  /** #4429.1 (25/10) — « revenir au barreau d'avant » : jusqu'où l'élargissement automatique peut aller
   *  (100 km, le département, ou la région). Absent = toute l'échelle, France comprise (règle finale, Louis 27/10).
   *  Sans effet avec `zoneStrict`. */
  zoneCeiling: zoneCeilingSchema.optional(),
  /** #4433.3 (01/11) — « Élargir la zone » MONTE d'un palier (département, puis région) au lieu de retirer la ville ;
   *  jamais la France (c144). Sans effet avec `zoneStrict`. */
  zoneRaise: z.enum(['department', 'region']).optional(),
  /** #3983.2 (#3705.3) — la BASE de la zone département/région : `headquarters` =
   *  le SIÈGE y est ; `presence` (ou absent) = au moins un établissement actif
   *  y est, ce que le registre fait déjà. Sans zone, sans effet. */
  siteBasis: z.enum(['headquarters', 'presence']).optional(),
  headcountMin: z.number().int().nonnegative().optional(),
  headcountMax: z.number().int().nonnegative().optional(),
  /** #4361.2 — retire les sociétés PROUVÉES cotées. Seul `true` contraint (décoché
   *  n'affirme jamais « non cotée ») ; une cotation non établie ne retire rien. */
  excludeListed: z.boolean().optional(),
  /** #3908 — PLUSIEURS tranches cochées ensemble (10-49 + 250-499…), non
   *  contiguës. `headcountMin`/`headcountMax` ci-dessus ne portent qu'UN
   *  intervalle : les envelopper (min du plus bas, max du plus haut) ferait
   *  remonter aussi la tranche intermédiaire non cochée. Additif : un rail qui
   *  ne coche qu'une tranche continue d'envoyer `headcountMin`/`headcountMax`
   *  seuls (comportement inchangé) ; `headcountRanges` ne part que pour un
   *  cumul de 2 tranches ou plus, et porte alors l'UNION exacte. */
  headcountRanges: z
    .array(
      z.object({
        headcountMin: z.number().int().nonnegative().optional(),
        headcountMax: z.number().int().nonnegative().optional(),
      }),
    )
    .optional(),
  createdAfter: z.string().optional(),
  createdBefore: z.string().optional(),
  freetext: z.string().optional(),
  /** #4045.1 — les mots-clés de la recherche : ils TRIENT les signaux de chaque compte
   *  (le recoupement passe en tête), ils ne retirent aucune entreprise. */
  keywords: z.array(z.string()).optional(),
  /**
   * #2165.28 — la pile technique OBSERVÉE par la mémoire marché (jamais
   * déclarée par l'entreprise elle-même). Résolu CÔTÉ API, en masse, après le
   * registre (`MarketMemoryService.observedStacksFor`, un aller-retour pour
   * toute la page — jamais un par ligne). Un compte dont le corpus n'a pas de
   * pile observée n'est ni exclu en silence ni compté comme « sans stack » :
   * il ressort dans `degraded[].kind === 'unmeasured'` avec son compte.
   */
  technologiesObserved: z.array(z.string()).optional(),
  /** #5203 — période et nature des besoins : RETIRENT ce qui ne correspond pas. */
  ...discoverNeedFiltersSchema.shape,
  /**
   * #2165.30 — au moins une ESN OBSERVÉE (`observed-esn.ts`) sur ce compte,
   * plancher `MARKET_MEMORY_MIN_PATHS` inclus. ⚠️ doctrine c65 : un compte dont
   * la donnée est INCONNUE n'est JAMAIS compté comme « sans recours externe » —
   * `false` n'est pas une valeur qui filtre (seul `true` restreint), et les
   * comptes non résolus ressortent comptés dans `degraded[].kind ===
   * 'unmeasured'`, jamais exclus en silence (GA-259).
   */
  externalRecourseObserved: z.boolean().optional(),
  /** #4632.2 — famille de rôles observée : l'API CLASSE la liste par la mémoire marché (aucune exclusion). */
  roleFamilyObserved: z.string().trim().min(1).max(120).optional(),
  /** #4632.2 — écosystème lié à (ESN observée) : même mécanisme. */
  ecosystemObserved: z.string().trim().min(1).max(120).optional(),
})

/** Borne dure sur le volume demandé — protège le quota des sources registre (la
 *  taille du prompt d'angle est bornée à part, côté IA).
 *
 *  ⚠️ #4016 L7 — décision Louis 11/10/2026 : Découvrir SANS PALIER. 50 était
 *  le plus haut palier de capacité (`PROPOSED_ACCOUNT_VOLUME_BY_BAND`) ; ce
 *  volume n'est plus qu'un PREMIER LOT et « Voir plus » continue au-delà.
 *  200 = une borne TECHNIQUE (budget de temps d'une requête), miroir de
 *  `MAX_REGISTRY_LIMIT` (`apps/ia/app/routers/discover.py`). */
export const DISCOVER_MAX_LIMIT = 200

export const discoverRegistryRequestSchema = z.object({
  filters: discoverRegistryFiltersSchema.optional(),
  limit: z.number().int().positive().max(DISCOVER_MAX_LIMIT).optional(),
  /** #2489.3/D1 — le bouton « chercher hors de ma cible ». Jamais posé par
   *  défaut : la cible déclarée du profil ESN filtre TOUJOURS, y compris en
   *  texte libre, tant que l'utilisateur ne choisit pas explicitement de
   *  l'ignorer. */
  includeOutOfTarget: z.boolean().optional(),
  /** #2454.10 — « Neutre » : le profil vendeur habituel est IGNORÉ pour cette
   *  recherche (le contrat de contexte le dit). Absent = « Mon activité ». */
  contextMode: contextModeSchema.optional(),
  /** #4433 — « revenir au strict » : sous 10 résultats, la recherche s'élargit d'elle-même par paliers ;
   *  `true` (le geste de l'écran) la garde exacte. Absent = élargissement permis. */
  strictCriteria: z.boolean().optional(),
})

/** Critères de `POST /ia/discover/signals` — la découverte par le SIGNAL (AO
 *  ouverts, marchés attribués, recrutements) plutôt que par le registre. */
/** Les sources RÉELLEMENT interrogeables — quatre, pas cinq (#3941.5 : `capital`, l'augmentation de capital
 *  BODACC B, s'y ajoute — à COCHER, jamais dans le défaut des trois).
 *
 *  {@link discoverSignalTypeSchema} décrit la NATURE d'un signal rendu (dont
 *  `legal` et `tech`, produits ailleurs) ; ceci décrit ce qu'un appelant peut
 *  DEMANDER d'interroger. Les confondre laisserait cocher une source qu'aucun
 *  collecteur ne sait lancer. Miroir exact de `KNOWN_SOURCES`
 *  (`apps/ia/app/routers/discover_signals.py`) et de `SIGNAL_SOURCES` (web). */
export const discoverSignalSourceSchema = z.enum(['tender', 'award', 'hiring', 'capital', 'deal']) // #4732.1 — « Rachat ou fusion »

export const discoverSignalsRequestSchema = z.object({
  /** #2454.10 — même mode que `discoverRegistryRequestSchema`. Retiré par le
   *  proxy avant l'appel au moteur : c'est un réglage, pas un critère. */
  contextMode: contextModeSchema.optional(),
  /** #3551 — « chercher hors de ma cible » en mode Signaux. Lu par la salle de
   *  démonstration (liste scriptée) ; retiré par le proxy avant le moteur réel. */
  includeOutOfTarget: z.boolean().optional(),
  /** ⚠️ Champ FANTÔME — personne ne l'envoie, nulle part dans le dépôt.
   *
   *  Il est gardé pour ne pas casser un appelant tiers, mais ce n'est PAS le
   *  filtre de sources : c'est `sources` ci-dessous. Sa présence est ce qui a
   *  fait passer ce schéma pour complet pendant que les trois vrais critères de
   *  l'écran — `sources`, `keywords`, `sectors` — n'y étaient pas déclarés et
   *  étaient donc RETIRÉS par le DTO (zod retire les clés inconnues). La
   *  recherche par technologie et la sélection de sources n'atteignaient ainsi
   *  jamais le service IA. Voir `discover-signals-request.test.ts`. */
  signalTypes: z.array(discoverSignalTypeSchema).optional(),
  /** Les sources cochées au rail. Vide/absent = les trois. */
  sources: z.array(discoverSignalSourceSchema).optional(),
  /** La recherche par TECHNOLOGIE — « j'ai des consultants de cette stack ».
   *  Appliquée aux intitulés d'offres par la source d'emploi. */
  keywords: z.string().optional(),
  /** Les SECTEURS cochés au rail, commun aux deux modes. Appliqués côté IA sur
   *  le NAF **résolu** : les sources de signal ne rendent ni SIREN ni NAF. */
  sectors: z.array(z.string()).optional(),
  department: z.string().optional(),
  /** LUD.2 — une RÉGION (code INSEE : AURA=84, BFC=27, PACA=93) ou une VILLE connue (Lyon → 69) : la moisson
   *  couvre ses départements. Un `department` explicite l'emporte. */
  region: z.string().optional(),
  city: z.string().optional(),
  sinceDays: z.number().int().positive().max(1095).optional(),
  limit: z.number().int().positive().max(DISCOVER_MAX_LIMIT).optional(),
  /** Reprise progressive : combien d'entreprises déjà examinées il faut sauter.
   *  Permet de demander la SUITE de `coverage.notExamined` sans allonger l'appel
   *  au-delà du délai que l'API accorde (45 s). Sans état serveur : la moisson
   *  est refaite (~1 s) et son ordre — du signal le plus frais au plus ancien —
   *  est déterministe. */
  resolveOffset: z.number().int().nonnegative().max(1000).optional(),
  /** Le RETOURNEMENT (tome 4 §20.1) : la même moisson d'offres lit un marché
   *  CLIENT (`client`) ou un marché ESN (`esn`) selon qui a publié l'offre.
   *  `all` par défaut — un filtre qu'on n'a pas demandé ne retire rien. */
  entityType: z.enum(ENTITY_TYPES).optional(),
  /** #2165.28 — même critère, même mécanisme que `discoverRegistryFiltersSchema`. */
  technologiesObserved: z.array(z.string()).optional(),
  /** #5203 — période et nature des besoins. */
  ...discoverNeedFiltersSchema.shape,
  /** #2165.30 — même critère, même mécanisme que `discoverRegistryFiltersSchema`. */
  externalRecourseObserved: z.boolean().optional(),
  /** #4632.2 — famille de rôles observée : l'API CLASSE la liste par la mémoire marché (aucune exclusion). */
  roleFamilyObserved: z.string().trim().min(1).max(120).optional(),
  /** #4632.2 — écosystème lié à (ESN observée) : même mécanisme. */
  ecosystemObserved: z.string().trim().min(1).max(120).optional(),
})

export type DiscoverDegradedSource = z.infer<typeof discoverDegradedSchema>
export type DiscoverSignal = z.infer<typeof discoverSignalSchema>
export type DiscoverScoreFactor = z.infer<typeof discoverScoreFactorSchema>
export type DiscoverCandidate = z.infer<typeof discoverCandidateSchema>
export type DiscoverPortfolioState = z.infer<typeof discoverPortfolioStateSchema>
export type DiscoverResponse = z.infer<typeof discoverResponseSchema>
export type DiscoverRegistryFilters = z.infer<typeof discoverRegistryFiltersSchema>
export type DiscoverSignalsRequest = z.infer<typeof discoverSignalsRequestSchema>
