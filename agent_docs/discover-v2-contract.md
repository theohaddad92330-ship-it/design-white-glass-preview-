# Découvrir v2 — contrat partagé

Spec de référence pour la refonte de `/discover`. **Tout chantier doit s'y conformer
à la lettre** : les cinq lots sont développés en parallèle et ne s'assemblent que
si le contrat est respecté au champ près.

## Pourquoi

L'écran actuel est **1 appel Brave + 1 appel Claude Haiku** (`apps/ia/app/routers/discover.py`).
Les noms d'entreprises, le score `X/10` et les « contacts clés » sont **générés par le
LLM** : aucune résolution SIREN, aucun registre, aucune vérification d'existence.
Trois conséquences mesurées :

1. des résultats qui ne sont pas des entreprises (« Fabricant Fenêtres / Industrie ») ;
2. un score inventé, sans échelle ni rubrique, rendu dans un badge d'apparence précise ;
3. si Brave est HS ou hors quota, l'exception est avalée → run **100 % halluciné**, sans
   signal utilisateur.

Règle projet (CLAUDE.md) : **JAMAIS de données fictives. Échec API → erreur claire, pas
de fallback inventé.** La v2 applique cette règle à Découvrir.

## Principe directeur

> **Le registre produit la liste. Le LLM ne produit que l'angle commercial.**

Un candidat sans SIREN résolu n'est jamais rendu. Le score est **calculé** et **justifié
facteur par facteur**. Chaque signal porte sa date et sa source.

## Contrat de données (partagé IA ↔ API ↔ Web)

```ts
type DiscoverSignal = {
  type: 'tender' | 'award' | 'hiring' | 'legal' | 'tech'
  label: string // « AO IT publié », « 5 postes data ouverts »
  date: string // ISO — obligatoire, c'est le « pourquoi maintenant »
  url?: string
  detail?: string // ex. titulaire du marché (DECP) = concurrent en place
}

type DiscoverScoreFactor = {
  label: string // « NAF 62.02 exact », « siège dans la zone cible »
  points: number // contribution signée au score
  evidence?: string // la donnée brute qui justifie
}

type DiscoverCandidate = {
  // --- REGISTRE (factuel, jamais inventé) ---
  name: string
  siren: string // OBLIGATOIRE. Pas de SIREN = candidat écarté.
  nafCode: string | null
  sector: string | null
  city: string | null
  department: string | null
  headcountRange: string | null
  creationDate: string | null

  // --- CALCULÉ (déterministe, explicable) ---
  score: number // 0-100
  scoreFactors: DiscoverScoreFactor[]
  signals: DiscoverSignal[]

  // --- SUGGÉRÉ (LLM, clairement étiqueté comme tel côté UI) ---
  angle: string | null
  suggestedRoles: Array<{ title: string; department: string }>

  // --- PERSONNES (#2544.2 — PUBLIÉES par une source, jamais écrites par un modèle) ---
  // Absent = ce chemin ne regarde pas les personnes (ou réponse d'avant le
  // déploiement). Liste VIDE = on a regardé, personne n'a été nommé.
  people?: DiscoverPerson[]

  // --- ÉTAT PORTEFEUILLE (résolu côté API) ---
  portfolioState: 'new' | 'analyzed' | 'watched' | 'customer'
  accountId: string | null // si déjà en portefeuille

  sources: Array<{ name: string; url?: string; fetchedAt: string }>
}

// Chaque FAIT porte sa provenance et sa date de constat — pas la personne
// entière. Un nom peut venir du registre pendant qu'un lieu de travail vient
// d'une correction humaine ; une provenance posée sur la personne obligerait à
// choisir la plus faible des deux.
type PersonFact = {
  value: string
  origin: 'registry' | 'human' | 'provider' | 'workspace' // des FAMILLES, jamais des marques
  observedAt: string // ISO — obligatoire : un fait sans date ne peut pas vieillir
  url?: string // la preuve publique, OMISE plutôt que construite
}

type DiscoverPerson = {
  name: PersonFact // obligatoire
  role?: PersonFact // ABSENT = inconnu, jamais « non renseigné » fabriqué
  workplace?: {
    city: string
    siret?: string // ce qui distingue « on sait où » de « on a recopié le siège »
    origin: 'human' | 'provider' | 'workspace' // ⚠️ JAMAIS 'registry' — refusé par le schéma
    observedAt: string
    url?: string
  }
}

type DiscoverResponse = {
  candidates: DiscoverCandidate[]
  query: Record<string, unknown> // critères normalisés effectivement appliqués
  degraded: Array<{ source: string; reason: string }> // source HS = dit, jamais masqué
}
```

**`degraded` est non négociable** : toute source injoignable, sans clé ou hors quota y
apparaît, et l'UI l'affiche. Aucun repli silencieux sur du LLM.

## Endpoints

| Endpoint                           | Rôle                                                                                                 |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `POST /discover/registry` (IA)     | Liste depuis le registre : NAF × département × effectif × ancienneté                                 |
| `POST /discover/signals` (IA)      | Liste depuis le signal : AO ouverts (BOAMP), marchés attribués (DECP), recrutements (France Travail) |
| `POST /ia/discover/registry` (API) | Proxy JWT + résolution profil ESN + état portefeuille                                                |
| `POST /ia/discover/signals` (API)  | idem                                                                                                 |

L'ancien `POST /discover/search` reste en place le temps de la bascule mais n'est plus
la source de vérité de l'écran.

## Règles transverses

- **TDD** : test d'abord, puis code (règle 1 du CLAUDE.md).
- **Zéro donnée inventée** : si une source ne répond pas, elle va dans `degraded`.
- **Gratuit** : découvrir ne consomme ni slot d'analyse ni crédit d'enrichissement.
  Seul le lancement d'une analyse coûte, et c'est un acte explicite.
- **i18n FR + EN** obligatoire sur tout libellé UI (règle permanente projet).
- **TypeScript strict**, imports nommés, optional chaining sur données Supabase.

## Les personnes — ce que le contrat refuse, et pourquoi (#2544.2, 18/09/2026)

**Mesuré sur une réponse RÉELLE** (`GET recherche-entreprises.api.gouv.fr/search?q=arquus&departement=58`,
le 18/09/2026) : chaque entrée de `dirigeants` porte `nom`, `prenoms`,
`annee_de_naissance`, `date_de_naissance`, `qualite`, `nationalite`,
`type_dirigeant` — et **aucun champ d'adresse, d'établissement ni de SIRET**.
Le mandat est attaché à l'**unité légale** (le SIREN), jamais à un site.

Quatre conséquences, toutes tenues par le schéma plutôt que par la discipline
de l'appelant :

1. **`workplace.origin` ne peut pas valoir `registry`.** « Ce dirigeant
   travaille à Garchizy » n'est pas une lecture du registre : c'est une
   invention. Et la tentation est à portée de main — la ligne rendue par
   Découvrir porte justement le SIRET de l'établissement qui a fait matcher la
   zone (#2544.1). La ville d'un candidat décrit un **établissement** ; « où
   travaille cette personne » est une **autre question**.
2. **`DiscoverPerson` et `workplace` sont `.strict()`.** Le registre publie
   l'âge et la nationalité : ils ne peuvent pas voyager clandestinement. Ville
   et pays sont les deux seules exceptions nommées à l'interdit des critères
   protégés (registre de doctrine, `c58_criteres_proteges`).
3. **`observedAt` est obligatoire** et vaut, côté registre, `date_mise_a_jour_rne`
   — la date du registre lui-même. Sans elle le mandat n'est **pas rendu** :
   lui coller la date du jour ferait passer un mandat de 2011 pour un constat
   frais, ce que la provenance existe pour empêcher.
4. **Les personnes ne partent jamais vers un modèle.**
   `build_angle_user_prompt` les retire de sa charge utile — « ni dans le code
   qui calcule, ni dans le PROMPT qui note ».

`resolvePersonFact` (`@bellum/contracts`) tranche quand plusieurs sources
parlent du même champ : une **correction humaine gagne toujours**, quelle que
soit sa date ; à défaut, le constat le plus récent. Ce qui manque est **nommé**
par `discoverPersonUnknownFields`, DÉRIVÉ des champs absents — jamais
transporté, pour qu'aucune liste ne puisse contredire la donnée.

## COMPETENCE-TROUVE (Louis 20/10/2026) — une compétence posée TROUVE les comptes

Constat prod du 20/10 : « SAP » + régions 11 et 44 ⇒ 0 compte, « 10 résultats hors cible écartés ». La compétence
(`keywords` / `technologiesObserved`) ne faisait que FILTRER une liste tirée du registre par zone × effectif, et le
filtre `technologiesObserved` de l'API écartait tout compte sans pile connue en mémoire marché.

**Le tirage** (`apps/ia/app/services/discover_skill_offers.py`, branché dans `_discover_registry_collected`) :

1. **Sources gratuites par mot-clé + zone** : France Travail `motsCles` (#4419.2 : ≤ `SKILL_FT_MAX_DEPARTMENTS` = 13
   départements — une région entière — un appel par département, en parallèle ; au-delà ou sans zone, la lecture
   nationale paginée, ≤ `SKILL_FT_NATIONAL_PAGES` pages de 150, arrêtée à une page incomplète ; chaque lecture gardée
   24 h), Adzuna `what` (≤ `SKILL_ADZUNA_MAX_PAGES`
   pages, seulement tant que `adzuna_budget.discover_allowed()` — la réserve des analyses n'est jamais entamée ; aucun
   paramètre de lieu, `where` n'ayant jamais été vérifié ; #4419.5 : la localisation PUBLIÉE `location.area` voyage
   avec l'offre et décide de la zone avant le siège), et le cache commun d'offres (`source_cache.search_job_offers`,
   faits publics `jobs` clé SIREN, < 90 j). **Aucune source payée à l'offre** dans ce tirage.
2. **Règles d'offre** : < 90 j, date obligatoire, aucun stage (`internship_posting`), hors métiers du vendeur écartée
   (`is_domain_offer` / tri de France Travail), offre anonyme = aucun compte.
3. **Employeurs** : résolus au registre (`resolve_company_identity`, ou `identity_by_siren` quand le cache porte le
   SIREN) ; homonymie : #4419.3, le département de l'offre tranche entre homonymes au nom équivalent (un seul
   siège dans ce département), sinon écarté et compté `homonym` ; dédoublonnés par SIREN ; ≤ `SKILL_MAX_EMPLOYERS`
   = 150 résolutions (#4419.4, concurrentes sous `_RESOLVE_CONCURRENCY` et la deadline ; un groupe non tenté faute de
   temps est compté `notAttempted`, jamais « introuvable ») ; hors zone (ni l'offre ni le siège dans la zone) = écarté
   et compté `outsideZone`.
4. **Intermédiaires** (`intermediary_kind`) : cabinet (`intermediation.is_intermediated_employer` : NAF 78.10Z / 78.30Z
   ou nom connu — 78.20Z reste hors liste, voir ce module) ou ESN / conseil IT (`esn_naf.is_esn_naf_code` : 62.0x,
   70.22Z, ou `is_known_esn_name`) → `skillIntermediaries`, jamais la liste principale.
5. **Fusion avec le registre** : le tirage registre n'est PAS lancé quand une compétence est posée — ses comptes sans
   preuve ne s'affichent pas (« on n'affiche pas ce qu'on n'a pas »), ceux qui en ont une sont déjà trouvés par leurs
   offres. L'effectif demandé reste un critère (effectif inconnu = gardé).
6. **Cible du profil** : `_rank_and_angle(skill_mode=True)` — les secteurs du profil pèsent dans le score, n'écartent
   rien (`targetSectorFilter` absent). Le tirage registre pur garde l'écartement D1.
7. **Rang** : nombre d'offres sur la compétence, puis la plus récente, puis le rang d'avant (verdict, score, taille).
8. **Budget / coût** : sous `registry_deadline` ; moisson gardée `provider_cache.TTL_TERRITORY` (24 h) par
   (compétence pliée, zone, tri métier), clé versionnée `HARVEST_KEY_VERSION` (#4419.5 : à changer à chaque évolution
   de la moisson) ; une moisson coupée par le délai n'est pas rangée ; journal `COMPETENCE-TROUVE calls ft=… … received=…
rejected=… groups=… beyond_cap=… failures=… not_attempted=… outside_zone=… accounts=…` (#4419.1).

**Contrat** (`@bellum/contracts`, `discover-skill-evidence.ts`) : `DiscoverCandidate.skillEvidence`
(`skill`, `offerCount`, `latestOffer {title, city, date, url, source}` — la source reste dans la donnée, jamais à
l'écran), `DiscoverResponse.skillIntermediaries[]` (`kind: recruiter | esn`), `query.skillSearch`
(`discoverSkillSearchSchema`, lu par `readSkillSearch` — #4419.1 : `skills`, `offersBySource`, `calls`, `harvestCached`,
`sourcesCut`, `offersSeen`, `offersRejected {anonymous, tooOld, internship, skillAbsent, outsideTrade, outsideZone}`,
`employerGroups`, `beyondCap`, `resolutionFailures {homonym, registrySilent, publicAdministration, unavailable}`,
`unresolvedEmployers`, `notAttempted`, `outsideZone`, `employersFound`, `intermediaries`, `accountsFound`,
`outsideHeadcount`, `outsideSector` (#4420.4 a : secteur coché = filtre), `deadlineCut`, `emptyCause` :
`no_offers | no_offers_in_city | only_intermediaries | no_employer_identified | sources_unavailable | outside_headcount | null`).
Écran (#4419.6, `SkillSearchNotices`) : cabinets/ESN (Voir), hors taille (Retirer la taille), non identifiés, coupure
par le délai (Relancer) ; `deadlineCut` déclenche aussi le second passage #4305 (`needsSecondPass`).

**API** : `DiscoverMarketMemoryService.applyFilters` garde un compte prouvé par offre sur la techno demandée
(`candidateProvenBySkill`) sans pile en mémoire marché. La mémoire marché n'est PAS alimentée par ce tirage : le
corpus `market_*` est en lecture seule (#3671.3, `market-memory-read-only.spec.ts`) ; la preuve datée voyage sur la
carte et dans le cache de moisson.

**Écran** : `SkillSearch.tsx` (`SkillEvidenceLine` sur la carte, `SkillIntermediariesSection` repliée APRÈS les
clients finaux, `SkillSearchEmptyCause`), espace de noms i18n `discoverSkill`.

## La recherche en DEUX TEMPS (#4305, 25/10/2026) — ce que coûte chaque temps

Constat (call refonte UX, 19/10) : les sources ne tolèrent pas autant d'appels qu'on le voudrait en UNE requête. La contrainte
est technique, pas un choix produit : elle est donc DITE à l'écran, jamais cachée ni masquée par un compteur.

| Temps                     | Ce qu'il fait                                                                                                                                                                        | Ce qu'il coûte                                                                                                                                                                                                                                       |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1er passage**           | `POST /discover/registry` : registre public (pages de `LIST_PAGE_MAX` lignes, au plus `MAX_REGISTRY_PAGES`), puis, pour une compétence, les offres → employeurs résolus au registre. | Budget de temps GLOBAL `DISCOVER_TIME_BUDGET_S = 32 s` (13 s sous le couperet de 45 s du proxy), dont 1/3 réservé au modèle d'angle. Au-delà : `degraded[].reason = 'time_budget'` (liste) ou `skillSearch.deadlineCut` (employeurs `notAttempted`). |
| **2nd passage** (en fond) | La MÊME requête, une seule fois par recherche (`useSecondPass`). Elle COMPLÈTE la liste, ne la remplace jamais.                                                                      | Ce que le cache ne sert pas : les identités d'entreprises sont relues du cache 30 j, les lectures d'offres du cache 24 h. Seul le reste coûte un appel. Aucune boucle : un échec se dit et laisse la liste du 1er passage.                           |

Ce que l'écran dit (`SecondPassNotice` + `secondPassScope`) : « D'autres comptes arrivent… », puis ce qui est DÉJÀ cherché
(« N comptes déjà cherchés et affichés ») et ce qui RESTE (« la suite de la liste d'entreprises », « N employeurs dont les
offres ne sont pas lues »), puis « N comptes ajoutés ». Jamais un compteur de crédits (les crédits sont IMPLICITES,
Louis 22/10), jamais « 0 » (une absence ne fait aucune phrase), jamais un fournisseur nommé.
