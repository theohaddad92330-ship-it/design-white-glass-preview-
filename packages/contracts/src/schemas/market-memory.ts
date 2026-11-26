import { z } from 'zod'
import { accountCohortIndexSchema } from './market-memory-cohort-index-axes.js'
import { marketSignalDateSchema } from './market-signal-date.js'

/**
 * LA MÉMOIRE MARCHÉ BELLUM — ce que Bellum a OBSERVÉ, jamais ce qu'il affirme.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE C'EST
 * ─────────────────────────────────────────────────────────────────────────────
 * Un référentiel PARTAGÉ, en lecture seule, construit à partir de parcours
 * professionnels agrégés : qui est passé chez quelle entreprise, quelles
 * sociétés de services gravitent autour d'un compte, quelles technologies y ont
 * été citées. Il ne dit RIEN sur des personnes qu'on pourrait utiliser — il dit
 * quelque chose sur les ENTREPRISES et sur les LIENS entre elles.
 *
 * Ce que ça change de nature : avant, le produit INFÉRAIT qui travaille avec
 * qui. Maintenant il OBSERVE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES QUATRE INTERDITS, ET POURQUOI ILS SONT DANS LE TYPE
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. **Le CORPUS n'expose aucune date.** Ni ici, ni à l'écran, ni dans un
 *    prompt. La période du corpus reste en base pour l'audit ; elle n'apporte
 *    rien à l'utilisateur et elle fait douter d'un signal qui est frais. C'est
 *    pour ça qu'aucun champ d'OBSERVATION de ce fichier ne porte de date : un
 *    champ absent ne peut pas fuiter. ⚠️ Les deux documents d'intégration livrés
 *    avec le corpus écrivent « observé en 2022, non masquable » — c'est PÉRIMÉ,
 *    corrigé le 05/09/2026 par le catalogue des usages, qui date la base de
 *    2024-2025 et interdit l'affichage. Les 31 retours du 06/09 disent tous
 *    « aucune date affichée ».
 *
 *    ⚠️ **CE QUI A ÉTÉ LEVÉ LE 18/09/2026, ET SEULEMENT CELA (#2288.2).** La
 *    raison profonde de cet interdit n'était pas la fraîcheur : c'était qu'une
 *    date, plus une entreprise, plus un fait suffisent souvent à désigner QUEL
 *    espace a fait l'observation — et les espaces sont des ESN, donc des
 *    concurrents (la raison de GA-43). L'arbitrage de Louis rouvre les dates
 *    **des faits d'accès**, jamais celles du corpus, et avec un périmètre tenu
 *    par un TYPE : `marketSignalDateSchema` (`market-signal-date.ts`) — date
 *    exacte pour ce que MON espace a observé, mois pour ce qui vient d'ailleurs
 *    au-dessus du seuil de trois espaces, aucune date en dessous. Le seul champ
 *    de ce fichier qui la porte est `currentSignal` sur un résultat de
 *    RECHERCHE ; `marketMemoryCoverageSchema` et ses listes restent, elles,
 *    strictement sans date.
 *
 * 2. **Une absence n'est jamais un « non ».** « Pas d'observation » ne veut pas
 *    dire « n'externalise pas ». C'est pourquoi `marketPaths` vaut `null` et
 *    JAMAIS `0` : « zéro parcours observé » et « pas de donnée » sont deux
 *    affirmations différentes, et seule la seconde est vraie quand on ne sait pas.
 *
 * 3. **Une observation n'est jamais une présence actuelle.** Une société de
 *    services observée autour d'un compte ouvre un CHEMIN POTENTIEL à qualifier,
 *    jamais un « accès connu ». Le vocabulaire est « observé », jamais
 *    « présent », « actuel », « en place » ou « travaille chez ».
 *
 * 4. **Aucune identité de personne ne sort d'ici.** Les agrégats ne portent que
 *    des comptages. Le fichier d'identités et de coordonnées livré avec le
 *    corpus est resté DEHORS, et ce n'est pas un oubli : sa base légale de
 *    collecte, l'information des personnes et la finalité n'ont pas été
 *    tranchées. Aucun usage produit n'en a besoin.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE SEUIL
 * ─────────────────────────────────────────────────────────────────────────────
 * Trois parcours. En dessous, il n'y a rien à dire : on ne caractérise pas un
 * environnement sur deux observations, et un « 2 parcours observés » affiché se
 * lirait comme une mesure alors que c'est du bruit. Le seuil vit ICI et nulle
 * part ailleurs (un réglage vit à un seul endroit) — ni le client, ni un prompt,
 * ni le copilote ne peuvent le baisser.
 */

/** Le seuil, unique. Sous 3 observations, la mémoire ne dit RIEN. */
export const MARKET_MEMORY_MIN_PATHS = 3

/**
 * #3177.2 / épopée #3225 — LA TAILLE D'UN SCOPE DE GROUPE (`coverageForGroup`).
 *
 * Un groupe, c'est l'entité RACINE (`company_id` résolu) plus ses filiales
 * connues (`account.subsidiaries`) : `search_market_memory` ancré sur une
 * IDENTITÉ plutôt que sur des critères. La racine ET jusqu'à 5 filiales, pas
 * plus — une lecture identité par identité (`MarketMemoryService.coverageFor`,
 * appelée une fois par entité) qui balaierait un groupe entier sans borne
 * multiplierait les requêtes par le nombre d'entités déclarées ; un groupe
 * français compte rarement plus de 5 filiales SUIVIES par un commercial. Vit
 * ICI et nulle part ailleurs (un réglage vit à un seul endroit) : le DTO du
 * pont (`CopilotMarketMemoryGroupContextDto`) et l'outil de chat le relisent
 * tous les deux, jamais une borne dupliquée.
 */
export const MARKET_MEMORY_GROUP_MAX_ENTITIES = 6

/**
 * Le plancher d'une observation ISOLÉE — une technologie, une société de services.
 *
 * ⚠️ Distinct du seuil ci-dessus, qui porte sur l'ENTREPRISE entière. Celui-ci
 * porte sur chaque LIGNE : un seul parcours reliant deux organisations n'est pas
 * une observation, c'est une ligne de CV.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE LA PRODUCTION A MONTRÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * La règle était écrite pour les technologies et pas pour les sociétés — la même
 * phrase, appliquée à moitié. Résultat mesuré sur un compte réel : **38 sociétés
 * observées, dont 33 à UN SEUL parcours**. Un mur de trente-huit lignes où
 * trente-trois ne disent rien, c'est exactement le dump que le produit refuse
 * ailleurs, et ça noie les deux lignes qui comptaient.
 *
 * Le même plancher, pour la même raison, écrit à un seul endroit.
 */
export const MARKET_OBSERVATION_MIN_PERSONS = 2

/**
 * Le nombre de parcours observés sur une entreprise, tel que tout l'écran le lit.
 *
 * `null` = pas de couverture, ou couverture sous le seuil. Les deux se rendent
 * pareil : silence. `0` est REFUSÉ — il affirmerait qu'on a regardé et qu'il n'y
 * avait rien, ce qui est exactement le mensonge que la doctrine interdit.
 */
export const marketPathsSchema = z.number().int().min(MARKET_MEMORY_MIN_PATHS).nullable()

/**
 * La MÊME valeur, sur le seul écran où `0` est vrai : la désambiguïsation d'homonymes.
 *
 * ⚠️ EXCEPTION NOMMÉE — à ne propager NULLE PART ailleurs.
 *
 * Cet écran ne juge pas une entreprise, il DISTINGUE deux lignes de registre :
 * « ROCHE, 41 parcours observés » contre « ROCHE BOBOIS, aucun parcours
 * observé ». L'asymétrie EST l'information qui départage — c'est elle qui évite
 * de repayer une analyse sur le mauvais homonyme. Partout ailleurs, « aucun
 * parcours » se lirait « n'externalise pas », ce qui serait faux.
 *
 * Entre 1 et 2 observations, la valeur se rend `0` : deux parcours ne
 * distinguent rien. `null` reste « mémoire indisponible » — et dans ce cas
 * AUCUNE ligne ne porte le fait, jamais un sous-ensemble.
 */
export const disambiguationMarketPathsSchema = z
  .union([z.literal(0), z.number().int().min(MARKET_MEMORY_MIN_PATHS)])
  .nullable()

/**
 * #4016 L10 — LE PLANCHER D'UNE SOCIÉTÉ DE SERVICES OBSERVÉE, écrit une fois.
 *
 * ⚠️ RENVERSEMENT DATÉ du 11/10/2026 (Louis, épopée #4016 lot L10 : « concurrent
 * affiché dès 1 parcours, libellé « 1-2 parcours » »). Il lève GA-285 pour la
 * seule ligne ESN d'un compte DÉJÀ couvert (≥ {@link MARKET_MEMORY_MIN_PATHS}
 * parcours au total) : un compte sous le seuil ne dit toujours RIEN, et les
 * destinations d'une société de services gardent le seuil de 3.
 */
export const MARKET_ESN_OBSERVED_MIN_PATHS = 1

export type EsnObservedPathsRange =
  { readonly kind: 'range'; readonly label: '1-2' } | { readonly kind: 'exact'; readonly count: number }

/**
 * Comment dire le nombre de parcours d'une société observée. Sous le seuil
 * transverse, un « 2 parcours observés » se lirait comme une mesure alors que
 * c'est du bruit : on dit la FOURCHETTE. `null` pour 0 ou une valeur invalide —
 * une absence ne fait pas une ligne.
 */
export function esnObservedPathsRange(persons: number): EsnObservedPathsRange | null {
  if (!Number.isInteger(persons) || persons < MARKET_ESN_OBSERVED_MIN_PATHS) return null
  if (persons < MARKET_MEMORY_MIN_PATHS) return { kind: 'range', label: '1-2' }
  return { kind: 'exact', count: persons }
}

/** Les trois niveaux de certitude d'une observation, du plus fort au plus faible. */
export const OBSERVED_CERTAINTIES = ['forte', 'moyenne', 'faible'] as const
export const observedCertaintySchema = z.enum(OBSERVED_CERTAINTIES)
export type ObservedCertainty = z.infer<typeof observedCertaintySchema>

/**
 * L'échelle de certitude, DÉRIVÉE du nombre de personnes — jamais retapée.
 *
 * Deux chemins qui refont ce calcul divergent le jour où l'un des deux bouge.
 */
export function observedCertainty(persons: number): ObservedCertainty {
  if (persons >= 5) return 'forte'
  if (persons >= MARKET_MEMORY_MIN_PATHS) return 'moyenne'
  return 'faible'
}

/**
 * Une société de services observée autour d'un compte.
 *
 * `.strip()` n'est pas décoratif : il garantit qu'un `observedAt` glissé par un
 * appelant ne traverse pas le contrat. L'interdit n°1 est tenu par le TYPE.
 */
export const marketEsnObservedSchema = z
  .object({
    esnName: z.string().min(1),
    /**
     * #4016 L10 — ⚠️ RENVERSEMENT DATÉ du 11/10/2026 : une société reliée à
     * UN seul parcours entre (avant : plancher de la stack, 2). Le plancher
     * vit dans {@link MARKET_ESN_OBSERVED_MIN_PATHS}. Sous le seuil transverse
     * le compte exact ne s'affiche pas : voir {@link esnObservedPathsRange}.
     */
    persons: z.number().int().min(MARKET_ESN_OBSERVED_MIN_PATHS),
    certainty: observedCertaintySchema,
  })
  .strip()
export type MarketEsnObserved = z.infer<typeof marketEsnObservedSchema>

/**
 * La stack OBSERVÉE — ce que les parcours passés par là ont cité.
 *
 * Le seuil du corpus est de deux personnes par technologie : une citation
 * unique n'est pas un environnement technique, c'est une ligne de CV.
 * ⚠️ Ne se présente JAMAIS comme la stack officielle de l'entreprise.
 */
export const observedStackSchema = z.array(
  z.object({
    techno: z.string().min(1),
    persons: z.number().int().min(MARKET_OBSERVATION_MIN_PERSONS),
  }),
)
export type ObservedStack = z.infer<typeof observedStackSchema>

/** Une famille de rôles observée sur un compte, avec son comptage. */
export const marketRoleFamilySchema = z.object({
  family: z.string().min(1),
  persons: z.number().int().positive(),
})
export type MarketRoleFamily = z.infer<typeof marketRoleFamilySchema>

/**
 * L'empreinte de zone OBSERVÉE par le corpus — #1608 / #1630.10.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE C'EST, ET CE QUE CE N'EST PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * `market_company_signal` porte `city` / `region` / `country` depuis
 * l'ingestion du 06/09 (`market-memory-import.ts`), et **personne ne les
 * lisait** : `MarketMemoryService.coverageFor` construisait son objet
 * `coverage` sans jamais les recopier. Ce type est ce qui les fait traverser.
 *
 * ⚠️ **Ce n'est PAS un établissement officiel.** Le corpus donne UNE zone
 * approximative par entreprise, jamais un SIRET, jamais une adresse
 * vérifiée : c'est le meilleur effort du parcours agrégé, pas la fiche
 * registre que portent les branches Pappers d'un compte. Un écran qui la
 * traiterait comme un site réel (rattachement SIRET, marqueur plein, tri
 * automatique) transformerait une observation en fait — l'interdit n°1 du
 * dépôt. Elle se rend avec un traitement visuel DISTINCT et la légende
 * « Empreinte observée ≠ site officiel ».
 *
 * Chaque champ est INDÉPENDAMMENT nullable : le corpus peut connaître la
 * ville d'une entreprise sans sa région, ou l'inverse. `null` sur LES TROIS
 * n'est normalement pas construit par le service (voir
 * `EMPTY_MARKET_MEMORY_COVERAGE` et `coverageFor` : l'objet entier devient
 * `null` plutôt que `{ city: null, region: null, country: null }`), mais le
 * schéma reste permissif — un appelant qui le validerait de son côté ne doit
 * pas se heurter à une combinaison que le service ne produit jamais mais que
 * rien n'interdit par construction.
 *
 * `.strip()` n'est pas décoratif : comme `marketEsnObservedSchema`, il
 * garantit qu'un `observedAt` ou un `corpusLabel` glissé par un appelant ne
 * traverse pas le contrat — l'interdit n°1 (aucune date exposée) est tenu par
 * le TYPE.
 */
export const marketObservedZoneSchema = z
  .object({
    city: z.string().min(1).nullable(),
    region: z.string().min(1).nullable(),
    country: z.string().min(1).nullable(),
  })
  .strip()
export type MarketObservedZone = z.infer<typeof marketObservedZoneSchema>

/**
 * Ce que la mémoire marché sait d'UNE entreprise — la forme que lisent l'écran,
 * le prompt d'analyse et le copilote.
 *
 * `covered: false` n'est pas « couverture à zéro » : c'est « je n'ai pas
 * suffisamment d'observations ». Les listes sont alors VIDES et `marketPaths`
 * est `null`. Le raffinement croisé refuse la contradiction inverse — se
 * déclarer couvert sans parcours — parce qu'un écran qui la recevrait
 * afficherait un bloc vide en affirmant qu'il sait quelque chose.
 */
export const marketMemoryCoverageSchema = z
  .object({
    covered: z.boolean(),
    marketPaths: marketPathsSchema,
    esnObserved: z.array(marketEsnObservedSchema),
    observedStack: observedStackSchema,
    roleFamilies: z.array(marketRoleFamilySchema),
    /** Personnes passées par une société de services et aujourd'hui chez ce compte. `null` = non mesuré. */
    exEsnPresent: z.number().int().positive().nullable(),
    /**
     * #1608 / #1630.10 — `null` quand aucune des trois valeurs n'est connue,
     * `undefined` quand le champ n'existe pas DU TOUT sur l'objet (un appelant
     * écrit avant #1608, ou un test qui construit un littéral typé sur ce
     * contrat sans le fournir).
     *
     * ⚠️ `.optional()`, PAS `.default(null)` : un `.default()` rend le champ
     * FACULTATIF côté entrée mais OBLIGATOIRE dans le type de SORTIE inféré
     * (`z.infer`) — et ce type de sortie est ce que consomment les appelants
     * qui construisent l'objet à la main (`accounts.controller.ts` ici, et
     * plusieurs tests ailleurs qui typent un littéral dessus sans jamais
     * appeler `.parse()`). Un `.default()` aurait donc cassé rétroactivement
     * tout littéral existant qui ne connaît pas encore ce champ — exactement
     * l'erreur que ce commentaire existe pour éviter à qui la retenterait.
     * Tout LECTEUR doit donc traiter `null` et `undefined` pareil : « non
     * mesuré » — jamais `?? 0` ni deux branches d'affichage distinctes.
     */
    observedZone: marketObservedZoneSchema.nullable().optional(),
    /**
     * #3212.3 (reste, épopée #3235) — la révision du CORPUS qui a produit ce
     * comptage (`market_company_signal.dataset_version`, colonne réelle,
     * même patron que `dataforge_accounts.data_version`), relue TELLE QUELLE
     * — jamais recalculée (GA-258, un seul point d'entrée vers les tables
     * partagées). `null` = non mesuré (corpus antérieur à la colonne, ou
     * couverture vide) — jamais devinée. `undefined` accepté pour qu'un
     * littéral écrit avant ce champ (tests, `EMPTY_MARKET_MEMORY_COVERAGE`)
     * reste byte-identique.
     */
    datasetVersion: z.string().nullable().optional(),
    /**
     * #3672 — la FIN de la période COUVERTE par le corpus (`period_end`,
     * `YYYY-MM-DD`), relue telle quelle. C'est une période documentée, jamais
     * la date d'une observation individuelle ni « la dernière activité » :
     * elle sert à dater un fait « Historique observé » au lieu de l'écrire
     * « date inconnue ». `null`/`undefined` = le corpus ne la porte pas.
     */
    periodEnd: z.string().nullable().optional(),
  })
  .refine(value => !value.covered || value.marketPaths !== null, {
    message: 'une couverture déclarée porte toujours ses parcours',
    path: ['marketPaths'],
  })
export type MarketMemoryCoverage = z.infer<typeof marketMemoryCoverageSchema>

/**
 * La couverture VIDE, nommée une fois.
 *
 * Elle est rendue dans les trois cas qui se ressemblent à l'écran et qu'il ne
 * faut surtout pas confondre en base : entité non résolue, entité résolue mais
 * sous le seuil, et lecture en erreur. Aucun appelant ne doit fabriquer son
 * propre objet vide — c'est comme ça qu'un `0` réapparaît.
 */
export const EMPTY_MARKET_MEMORY_COVERAGE: MarketMemoryCoverage = {
  covered: false,
  marketPaths: null,
  esnObserved: [],
  observedStack: [],
  observedZone: null,
  roleFamilies: [],
  exEsnPresent: null,
}

/**
 * Le résultat d'une LECTURE de la mémoire marché.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE N'EST PAS SIMPLEMENT UNE COUVERTURE
 * ─────────────────────────────────────────────────────────────────────────────
 * « Je n'ai pas d'observations sur ce compte » et « je n'ai pas pu lire » se
 * ressemblent à l'écran et n'ont pas du tout le même sens. Les confondre produit
 * le défaut le plus cher du dépôt : un « 0 » affiché sur une panne, c'est-à-dire
 * un mensonge présenté comme une mesure.
 *
 * Les deux cas ne se rendent pas pareil, et chaque appelant DOIT choisir :
 * · le bandeau de compteurs ne rend pas le compteur du tout quand c'est
 *   `unavailable` — un « 0 » sur une panne mentirait ;
 * · la liste de désambiguïsation ne porte le fait sur AUCUNE ligne, jamais sur
 *   un sous-ensemble ;
 * · le prompt d'analyse n'injecte simplement aucun bloc, et l'analyse continue.
 *
 * Rendre une union force ce choix à l'endroit où il se prend. Une fonction qui
 * renverrait une couverture vide dans les deux cas le prendrait à la place de
 * tout le monde, et personne ne s'en apercevrait.
 */
export type MarketMemoryRead =
  | { readonly status: 'ok'; readonly coverage: MarketMemoryCoverage }
  | { readonly status: 'unavailable'; readonly reason: string }

/**
 * #1961.21 — la route de la fiche d'UN compte, et rien d'autre.
 *
 * Le copilote la rend cliquable TELLE QUELLE : une URL absolue, un sous-écran ou
 * un schéma `javascript:` qui passeraient ici deviendraient un lien dans une
 * réponse. La forme est donc tenue par le TYPE, pas par la bonne volonté de
 * l'appelant qui la construit (`MarketMemoryService.searchByFilters`).
 */
const ACCOUNT_ROUTE_PATTERN = /^\/accounts\/[0-9a-fA-F-]{36}$/

/**
 * #1961 — UNE entreprise trouvée par la recherche PAR FILTRE (`search_market_memory`).
 *
 * La MÊME couverture que `coverageFor`, avec le nom qui dit LAQUELLE. Cette forme
 * vivait en interface LOCALE du service, sans aucun `.parse()` sur la route qui
 * la sert : un champ glissé côté serveur traversait jusqu'au modèle sans que
 * rien ne le voie.
 *
 * `.strip()` n'est pas décoratif, comme partout dans ce fichier : ni le domaine,
 * ni la clé du corpus, ni une date ne traversent — l'entreprise se désigne par
 * son nom, le rapprochement reste une affaire du service.
 *
 * `accountRoute` (#1961.21) — présent SEULEMENT quand l'entreprise est aussi un
 * compte du portefeuille de l'espace APPELANT, rapproché par son domaine ou par
 * une décision humaine, jamais par son nom seul. ABSENT sinon : ni `null`, ni une
 * chaîne vide — une absence de lien n'est pas un lien vide.
 */
const marketMemorySearchMatchSchema = z
  .object({
    companyName: z.string().min(1),
    coverage: marketMemoryCoverageSchema,
    accountRoute: z.string().regex(ACCOUNT_ROUTE_PATTERN).optional(),
    /**
     * #2288.2 — LA DATE DU DERNIER SIGNAL CONNU, AVEC SA NATURE.
     *
     * Le seul champ daté de ce fichier, et il ne vient PAS du corpus : il vient
     * des faits d'accès HUMAINS, décidés par `decideMarketSignalDate`
     * (`market-signal-date.ts`, la seule fonction qui tranche). La `coverage`
     * juste au-dessus, elle, reste strictement sans date.
     *
     * **ABSENT** — jamais `null` — quand aucune date n'est lisible : sous le
     * seuil de trois espaces contributeurs, ou sans aucune observation datée.
     * Un `null` finirait par se rendre « date manquante », qui est une autre
     * façon d'affirmer qu'on a regardé ; l'absence du champ, elle, se rend
     * « aucun signal actuel », ce qui est vrai.
     */
    currentSignal: marketSignalDateSchema.optional(),
  })
  .strip()
export type MarketMemorySearchMatch = z.infer<typeof marketMemorySearchMatchSchema>

/**
 * #1961 — le résultat de la recherche par filtre. Même union que
 * `MarketMemoryRead` : un corpus sans résultat et un corpus qu'on n'a pas pu lire
 * ne se rendent jamais pareil. `truncated` (LOT 18, GA-326) dit si la limite
 * affichée a mordu.
 */
export const marketMemorySearchReadSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('ok'),
    matches: z.array(marketMemorySearchMatchSchema),
    truncated: z.boolean(),
  }),
  z.object({ status: z.literal('unavailable'), reason: z.string().min(1) }),
])
export type MarketMemorySearchRead = z.infer<typeof marketMemorySearchReadSchema>

/**
 * LE CONTEXTE MARCHÉ D'UN COMPTE — ce que le popover de la ligne de compte
 * affiche (#1582), et la place que le fragment de #1577 a fini par trouver.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UN POPOVER, ET POURQUOI CETTE FORME
 * ─────────────────────────────────────────────────────────────────────────────
 * La 2ᵉ ligne d'`AccountTableRow` est saturée à **4,3×** : 159 px rendus pour
 * 679 px requis (mesuré en production le 06/09/2026). C'est ce qui a fait
 * retirer le fragment « N parcours observés » le jour même de sa livraison, et
 * c'est ce qui bloquait #1417, #1577 et #1582 ensemble. **Un popover ne
 * consomme aucune largeur** : c'est la seule des trois formes proposées qui
 * n'aggrave pas la saturation, et c'est exactement celle que #1582 demande.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE FORME NE PORTE PAS, ET POURQUOI
 * ─────────────────────────────────────────────────────────────────────────────
 * · **Aucune date.** #1582 l'écrit, et la mémoire marché n'expose de toute
 *   façon ni date ni identité.
 * · **Aucun « Non ».** Le vocabulaire est fermé — Observé / À qualifier — et
 *   une absence d'observation ne devient jamais une négation. « Aucune ESN
 *   observée » ne veut pas dire « aucune ESN » : ça veut dire qu'on n'en a pas
 *   vu, ce qui est un travail de qualification, pas un fait de marché.
 * · **Aucune ligne « Fit avec ton offre ».** #1582 la demande ; l'axe `fit` est
 *   bien calculé (`apps/ia/app/services/score_axes.py`) et rangé dans
 *   `raw_analysis.scoreAxes`, mais **rien dans le web ne le lit** — vérifié le
 *   07/09/2026. Une ligne qui dirait toujours « Non mesuré » occuperait la
 *   place sans jamais rien dire. Arbitré avec Louis le 07/09 : le fit reste
 *   dans Score / axes, ce que #1582 dit lui-même (« le détail complet reste
 *   dans : Score / axes pour le fit »).
 *
 * ⚠️ **Le champ n'existe QUE pour un compte couvert.** Sous
 * `MARKET_MEMORY_MIN_PATHS`, la couverture est VIDE et non partielle : il n'y a
 * donc pas de « 0 parcours observés » à afficher, et l'icône ne se rend pas du
 * tout. « Ne rien afficher si aucune observation suffisamment couverte
 * n'existe » (#1582) est tenu par l'ABSENCE de la donnée, pas par une condition
 * d'écran qu'on pourrait oublier de recopier ailleurs.
 */
export const accountMarketContextSchema = z.object({
  /** Parcours observés vers ce compte. Toujours ≥ `MARKET_MEMORY_MIN_PATHS`. */
  paths_observed: z.number().int().min(MARKET_MEMORY_MIN_PATHS),
  /**
   * Combien d'ESN ont été observées autour de ce compte.
   *
   * `0` est ici une VRAIE mesure et non une absence : le compte est couvert
   * (donc la mémoire a bien été lue sur lui), et elle n'a vu passer aucune
   * société de services. L'écran le dit « à qualifier », jamais « aucune ».
   */
  esn_observed: z.number().int().min(0),
  /**
   * #1608 / #1630.10 — la même empreinte de zone que `MarketMemoryCoverage`,
   * pour l'onglet Sites du dossier de compte. `null` quand le corpus n'a pas
   * de ville/région/pays pour cette entreprise — jamais une zone inventée ;
   * `undefined` quand le champ n'existe pas du tout (littéral construit avant
   * #1608 — voir le commentaire de `marketMemoryCoverageSchema.observedZone`
   * sur pourquoi c'est `.optional()` et pas `.default(null)`).
   *
   * Ajout distinct de `paths_observed` / `esn_observed`, qui restent la portée
   * originale du popover de ligne (#1582) : un consommateur qui ignore ce
   * champ (le popover, aujourd'hui) reste valide, il ne le lit simplement pas.
   */
  observed_zone: marketObservedZoneSchema.nullable().optional(),
  /**
   * #1607.2 — LES TECHNOLOGIES OBSERVÉES, UNE FOIS LE COMPTE DANS LE PORTEFEUILLE.
   *
   * ⚠️ L'asymétrie que ce champ corrige est mesurée : la pile observée
   * s'affiche AVANT de dépenser un crédit (l'aperçu de `/search`, #1589.2, via
   * `MarketPreview.observed_stack`), puis **disparaît** dès que le compte entre
   * au portefeuille — `coverageFor` la calcule, et cette façade la jetait. C'est
   * la même forme que le constat de #1606 sur l'adressabilité : « l'intelligence
   * disparaît après création/analyse du compte ».
   *
   * Le retour dit quoi en faire, et surtout ce qu'il ne faut PAS en faire : les
   * technologies observées se rendent **à côté** des technologies actuellement
   * détectées, jamais fusionnées. Les deux ne disent pas la même chose — l'une
   * est ce que l'entreprise utilise aujourd'hui d'après ses propres traces,
   * l'autre l'environnement dans lequel des prestataires ont été observés.
   *
   * Liste vide sur un compte couvert dont le corpus ne connaît aucune techno :
   * c'est une mesure (on a regardé). `undefined` sur une API antérieure au champ.
   */
  observed_stack: z.array(z.string().min(1)).optional(),
  /**
   * #1611.3 — LE MÊME CONTENU AVEC SON COMPTAGE, POUR QUE « FAIBLE » EXISTE.
   *
   * `observed_stack` ci-dessus ne porte que des libellés : la façade appliquait
   * `.map(entry => entry.techno)` et JETAIT `persons`, que `coverageFor` calcule
   * pourtant. Conséquence à l'écran : la corroboration était BINAIRE — soit le
   * renforcement plein, soit le silence. Le troisième cas que le retour demande,
   * « Peu de corroboration marché disponible pour cette expertise », n'avait
   * aucun ingrédient pour exister.
   *
   * ⚠️ Un champ AJOUTÉ, jamais un champ dont la FORME change. `observed_stack`
   * reste un tableau de chaînes et ne bouge pas d'un octet : un onglet resté
   * ouvert sur l'ancien front continue de le lire exactement comme avant. Ce
   * dépôt a déjà payé un champ qui change de forme pendant un déploiement.
   *
   * `undefined` sur une API antérieure au champ — l'écran retombe alors sur le
   * comportement binaire, qui n'était pas faux, seulement muet sur un cas.
   */
  observed_stack_detail: observedStackSchema.optional(),
  /**
   * #1609 — LES FAMILLES DE RÔLES OBSERVÉES, COMME PISTE DE RECHERCHE.
   *
   * Le retour est catégorique sur ce que ce champ N'EST PAS : « la base Market
   * Memory ne fournit AUCUNE personne exploitable », donc aucune identité
   * historique n'entre dans Contacts ni dans l'Organigramme. Ce champ ne porte
   * que des LIBELLÉS de familles et des comptages — ni nom, ni date, ni
   * identifiant. Ce n'est pas une règle appliquée par prudence : le service ne
   * lit aucune colonne d'identité, donc il n'y a rien à laisser fuir.
   *
   * Ce qu'il autorise, et rien de plus : dire « la famille Data / IA ressort
   * dans l'environnement observé » pour ORIENTER une recherche de contacts
   * ACTUELS. La piste n'est jamais un champion, ni un décideur, ni un nœud.
   *
   * ⚠️ Le seau RÉSIDUEL (« Autre ») voyage tel quel et se filtre à l'affichage
   * par `isResidualRoleFamily` — le même filtre que l'aperçu de `/search`. Le
   * retirer ici en ferait une seconde dérivation, et #1755 a déjà payé le prix
   * d'un fourre-tout arrivé en tête d'une liste tronquée.
   */
  role_families: z.array(z.object({ family: z.string().min(1), persons: z.number().int().min(0) })).optional(),
  /**
   * #1607.3 — LES ESN OBSERVÉES, NOMMÉES — pour corroborer un titulaire que
   * l'analyse a nommé (`raw_analysis.competitors[]`, lu par `IncumbentEsnCard`).
   *
   * `esn_observed` ci-dessus n'est qu'un COMPTAGE depuis #1582 — l'écran qui l'a
   * fait naître (le popover de ligne) n'avait besoin que de « combien », jamais
   * « lesquelles ». La corroboration a besoin du NOM pour rapprocher une entrée
   * du corpus d'un nom que l'analyse a écrit — c'est le même
   * `marketEsnObservedSchema` que `MarketMemoryCoverage.esnObserved` et
   * `PartnerLandscape.observed`, jamais une seconde forme.
   *
   * `undefined` sur une API antérieure au champ — l'écran retombe alors sur le
   * comportement d'avant (aucune corroboration, jamais un « non »). Un champ
   * AJOUTÉ, jamais un champ dont la forme change (même discipline que
   * `observed_stack_detail` juste au-dessus) : `esn_observed` ne bouge pas.
   */
  esn_observed_detail: z.array(marketEsnObservedSchema).optional(),
  /**
   * Lot 773 — les personnes passées par une société de services et aujourd'hui chez ce compte : un COMPTAGE, jamais
   * une identité. Absent = non mesuré (jamais « 0 »). Champ AJOUTÉ : un onglet resté ouvert l'ignore.
   */
  ex_esn_present: z.number().int().positive().optional(),
  /**
   * #1640.2 — L'INDEX D'EXTERNALISATION NORMALISÉ PAR COHORTE, quand il est allumé.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * TROIS VALEURS, ET CE QUE CHACUNE VEUT DIRE
   * ─────────────────────────────────────────────────────────────────────────
   * · `undefined` — une API antérieure au champ, OU
   *   `MARKET_MEMORY_SCORING_ENABLED` à `false`. C'est l'état d'AUJOURD'HUI :
   *   le calcul existe (`buildCohortIndexReport`, `classifyCohortIndex`), le
   *   drapeau ne l'est pas, et la carte du dossier continue de n'écrire que
   *   « Recours externe observé » ou « Non mesuré ». Construire l'index et
   *   l'ALLUMER sont deux décisions ; la seconde attend la calibration sur
   *   données réelles (`measure-market-memory-cohort-index.ts`).
   * · `null` — l'entreprise n'est pas rapprochée du corpus (non résolue ou
   *   ambiguë). Rien à dire, et surtout pas « 0 ».
   * · l'objet — l'index ET ses axes, ou la raison NOMMÉE de son absence.
   *
   * ⚠️ Un champ AJOUTÉ, jamais un champ dont la FORME change : un onglet resté
   * ouvert sur l'ancien front lit exactement ce qu'il lisait avant.
   *
   * ⚠️ Ce n'est PAS une probabilité et ce n'est PAS un fait de marché
   * (doctrine `c26_probabilite`, `c65_couverture_nest_pas_un_fait_de_marche`) :
   * `cohortRelativePosition` est un RANG dans un échantillon de pairs de même
   * tranche d'effectif. « 72 » ne dit jamais « 72 % externalisent ».
   */
  cohort_index: accountCohortIndexSchema.nullable().optional(),
})
export type AccountMarketContext = z.infer<typeof accountMarketContextSchema>

/**
 * LAU-FINAL-211 (#3205.5) — LA SATURATION D'UN COMPTE, EN CATÉGORIES NOMMÉES.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * « NE PAS CALCULER UN SCORE OPAQUE »
 * ─────────────────────────────────────────────────────────────────────────────
 * L'issue le dit explicitement : la question « le marché est-il déjà saturé ? »
 * n'appelle pas un chiffre, elle appelle une catégorie qu'un commercial peut
 * répéter en rendez-vous. Ces cinq valeurs sont la sortie ENTIÈRE de
 * `marketSaturation` — aucune part, aucun ratio ne traverse jusqu'à l'écran.
 *
 * `insufficient_information` n'est PAS la même chose que « aucune ESN
 * observée » (`esnObserved === 0`, qui rend `null` — voir ci-dessous) : c'est
 * le cas où le COMPTAGE existe mais où le détail par société (une API
 * antérieure au champ, ou une ligne sans détail) empêche de juger la
 * structure. Une absence de donnée ne devient jamais une catégorie choisie
 * par défaut (doctrine « on n'affiche pas ce qu'on n'a pas »).
 */
export const MARKET_SATURATION_CATEGORIES = [
  'insufficient_information',
  'few_complementary',
  'fragmented',
  'structured_panel',
  'dominant_player',
] as const
export const marketSaturationCategorySchema = z.enum(MARKET_SATURATION_CATEGORIES)
export type MarketSaturationCategory = (typeof MARKET_SATURATION_CATEGORIES)[number]

//: Une société dont les parcours pèsent au moins ce SEUIL du total observé
//: tient le compte seule — la classification bascule sur ELLE, pas sur le
//: nombre de sociétés autour.
const DOMINANT_PLAYER_SHARE = 0.6
//: Les trois sociétés les plus observées concentrent au moins ce seuil : un
//: panel resserré, distinct d'un marché où les parcours se dispersent.
const STRUCTURED_PANEL_TOP3_SHARE = 0.6

/**
 * Classe la densité de prestataires observés autour d'un compte, sans jamais
 * rendre le ratio qui a servi à trancher (doctrine : pas de score opaque).
 *
 * `null` — rien à classer : `esnObserved <= 0` est déjà rendu « à qualifier »
 * ailleurs (`AccountMarketMemoryCard`), une catégorie de saturation dessus
 * inventerait une lecture qu'on n'a pas.
 */
export function marketSaturation(input: {
  esnObserved: number
  esnObservedDetail?: readonly { esnName: string; persons: number }[]
}): MarketSaturationCategory | null {
  if (input.esnObserved <= 0) return null
  if (!input.esnObservedDetail || input.esnObservedDetail.length === 0) return 'insufficient_information'

  const total = input.esnObservedDetail.reduce((sum, entry) => sum + entry.persons, 0)
  if (total <= 0) return 'insufficient_information'

  const sorted = [...input.esnObservedDetail].sort((a, b) => b.persons - a.persons)
  const topShare = sorted[0].persons / total
  if (topShare >= DOMINANT_PLAYER_SHARE) return 'dominant_player'
  if (sorted.length <= 2) return 'few_complementary'

  const top3Share = sorted.slice(0, 3).reduce((sum, entry) => sum + entry.persons, 0) / total
  return top3Share >= STRUCTURED_PANEL_TOP3_SHARE ? 'structured_panel' : 'fragmented'
}

/* ═══════════════════════════════════════════════════════════════════════════
 * LA COUVERTURE MÉMOIRE MARCHÉ À L'ÉCHELLE DU PORTEFEUILLE (#1633, #1635)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Tout ce qui précède répond compte par compte. Trois écrans posent la question
 * un cran au-dessus — « sur MES comptes, que sait la mémoire marché ? » :
 * `/pilotage/qualite` (#1633), `/pilotage/marche` (#1635) et le territoire
 * (#1634). Un agrégat construit UNE fois, décliné trois fois : trois surfaces
 * qui recompteraient chacune de leur côté divergeraient (#1621, GA-258).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE « COUVERTURE » VEUT DIRE ICI, ET CE QU'ELLE NE VEUT PAS DIRE
 * ─────────────────────────────────────────────────────────────────────────────
 * « 72 % de couverture » signifie **72 % des comptes ont un contexte mémoire
 * marché exploitable**. Ça ne signifie JAMAIS « 72 % externalisent », ni
 * « 28 % n'externalisent pas » — l'issue #1633 l'écrit, #1635 le répète, et les
 * deux ont raison : ce taux mesure ce que NOUS savons, pas ce que le marché
 * FAIT. Un compte non résolu n'est pas un compte qui n'externalise pas, c'est
 * un compte que nous n'avons pas su rapprocher du corpus.
 *
 * C'est la même faute que « non mesuré » rendu « 0 », d'un cran plus haut : au
 * lieu d'un chiffre faux sur une ligne, une phrase fausse sur tout un
 * portefeuille. Garde GA-259 (`market-coverage-is-not-externalisation`).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI QUATRE SEAUX, ET POURQUOI ILS S'ADDITIONNENT
 * ─────────────────────────────────────────────────────────────────────────────
 * Chaque compte tombe dans EXACTEMENT un seau, et leur somme fait le
 * dénominateur. Sans cette propriété, « 24 restants » ne se déduirait de rien
 * et un écran pourrait afficher des parts qui ne bouclent pas — « un nombre
 * déduit qui a l'air juste est pire qu'une case vide ».
 *
 * Les quatre reprennent, sans en inventer un cinquième, les quatre issues de
 * `resolveMarketCompany` croisées avec le seuil :
 *
 * · `covered`                  résolu, ET au-dessus de `MARKET_MEMORY_MIN_PATHS`
 * · `insufficientObservations` résolu, mais sous le seuil
 * · `ambiguous`                plusieurs entreprises répondent, aucune ne tranche
 * · `unresolved`               aucune entreprise ne répond
 *
 * `ambiguous` reste SÉPARÉ d'`unresolved`, alors que le dossier de compte les
 * rend pareil (silence) : c'est précisément la page qualité qui a besoin de la
 * distinction, parce que l'un se corrige (départager deux homonymes) et l'autre
 * s'attend (le corpus ne connaît pas cette entreprise).
 */

/** Un compte du portefeuille tombe dans exactement un de ces quatre seaux. */
export const MARKET_PORTFOLIO_BUCKETS = ['covered', 'insufficientObservations', 'ambiguous', 'unresolved'] as const
export type MarketPortfolioBucket = (typeof MARKET_PORTFOLIO_BUCKETS)[number]

/**
 * La partition du portefeuille. `accounts` EST la somme des quatre — vérifié
 * par le contrat lui-même, parce qu'un total qui ne boucle pas est un total
 * faux, et qu'il se découvrirait à l'écran plutôt qu'ici.
 */
export const marketPortfolioCoverageSchema = z
  .object({
    /** Le dénominateur : les comptes du portefeuille interrogés. */
    accounts: z.number().int().min(0),
    covered: z.number().int().min(0),
    insufficientObservations: z.number().int().min(0),
    ambiguous: z.number().int().min(0),
    unresolved: z.number().int().min(0),
    /**
     * Le sous-ensemble d'`ambiguous` où ce sont deux NOMS qui se confondent
     * (#1633.3, « homonymie signalée ») — par opposition à deux lignes qui
     * partagent un domaine. Toujours ≤ `ambiguous` : c'en est une part, pas un
     * cinquième seau.
     */
    homonyms: z.number().int().min(0),
  })
  .refine(
    value => value.covered + value.insufficientObservations + value.ambiguous + value.unresolved === value.accounts,
    { message: 'les quatre seaux font le portefeuille', path: ['accounts'] },
  )
  .refine(value => value.homonyms <= value.ambiguous, {
    message: 'une homonymie est une ambiguïté',
    path: ['homonyms'],
  })
export type MarketPortfolioCoverage = z.infer<typeof marketPortfolioCoverageSchema>

/**
 * Les deux raisons pour lesquelles un compte demande une REVUE humaine (#1633.3).
 *
 * `unresolved` n'y figure pas : il n'y a rien à arbitrer, le corpus ne connaît
 * simplement pas l'entreprise. Ce qui se corrige, c'est une ambiguïté — et sa
 * NATURE change le geste : deux lignes qui partagent un domaine ne se
 * départagent pas comme deux entreprises qui portent le même nom.
 */
export const MARKET_REVIEW_REASONS = ['ambiguous_domain', 'ambiguous_name'] as const
export const marketReviewReasonSchema = z.enum(MARKET_REVIEW_REASONS)
export type MarketReviewReason = z.infer<typeof marketReviewReasonSchema>

/**
 * Une ligne de file : un compte à regarder, et pourquoi.
 *
 * Aucune date, aucune identité — la mémoire marché n'en expose pas, et ce n'est
 * pas parce qu'on agrège qu'elle commencerait à le faire. `candidates` est le
 * nombre d'entreprises qui répondaient : c'est ce qui dit à l'humain s'il
 * arbitre entre deux lignes ou entre onze.
 */
/**
 * #1617.4 — UNE ENTREPRISE ENTRE LESQUELLES L'HUMAIN DOIT CHOISIR.
 *
 * Sans cette liste, la file de revue pouvait DIRE qu'il y a trois candidates et
 * ne jamais permettre d'en désigner une : « c'est bien cette entreprise »
 * demande une CLÉ, et personne côté navigateur ne l'avait. Le compte partait
 * alors vers son dossier, où il n'y avait rien de plus à cliquer.
 *
 * Les trois champs, et pourquoi exactement ceux-là :
 *
 * · `companyName` — le seul moyen de départager deux lignes qui partagent un
 *   domaine (`ambiguous_domain`) ;
 * · `websiteDomain` et `country` — les seuls moyens de départager deux
 *   entreprises qui portent le MÊME nom (`ambiguous_name`). Ce sont d'ailleurs
 *   les deux colonnes sur lesquelles `resolveMarketCompany` arbitre lui-même
 *   quand il y arrive : l'humain reçoit la matière que l'automatique a eue.
 *
 * ⚠️ AUCUN comptage de parcours ici, et c'est délibéré. Un candidat peut être
 * sous `MARKET_MEMORY_MIN_PATHS` : afficher « 2 parcours observés » à côté de
 * son nom le ferait lire comme une mesure alors que c'est du bruit — le seuil
 * de ce fichier existe pour l'empêcher. Choisir une entreprise se fait sur son
 * IDENTITÉ, pas sur la taille de ce qu'on sait d'elle.
 *
 * ⚠️ Aucune date non plus : l'interdit n°1 de ce fichier vaut ici comme ailleurs.
 */
export const marketReviewCandidateSchema = z
  .object({
    /** La clé du corpus — ce que l'écran renvoie quand l'humain désigne celle-ci. */
    companyKey: z.string().min(1),
    companyName: z.string().min(1),
    /** `null` quand le corpus n'en porte pas : on n'invente pas un domaine. */
    websiteDomain: z.string().min(1).nullable(),
    country: z.string().min(1).nullable(),
  })
  .strip()
export type MarketReviewCandidate = z.infer<typeof marketReviewCandidateSchema>

export const marketReviewItemSchema = z
  .object({
    accountId: z.string().guid(),
    accountName: z.string().min(1),
    reason: marketReviewReasonSchema,
    candidates: z.number().int().min(2),
    /**
     * #1617.4 — les entreprises entre lesquelles on n'a pas su trancher, NOMMÉES.
     *
     * Jamais tronquée : une liste coupée ferait disparaître la bonne réponse
     * sans le dire, et l'humain choisirait parmi ce qui reste. `candidates`
     * dit le même nombre sous une autre forme — le COMPTE sert la phrase
     * (« 3 entreprises portent ce nom »), la LISTE sert le geste.
     *
     * ⚠️ Optionnelle au schéma, et seulement pour la durée d'un déploiement :
     * un onglet déjà ouvert lit une API qui ne la rend pas encore, et un champ
     * NEUF lu sans garde casse durablement l'écran qui l'attend. Le service la
     * remplit toujours.
     */
    companies: z.array(marketReviewCandidateSchema).optional(),
  })
  .strip()
export type MarketReviewItem = z.infer<typeof marketReviewItemSchema>

/**
 * Combien de files on rend au plus. Une file de revue est une liste de GESTES ;
 * au-delà d'une vingtaine, ce n'est plus une file, c'est un export — et le
 * compte total vit déjà dans la partition ci-dessus.
 */
export const MARKET_REVIEW_QUEUE_MAX = 20

/**
 * #1635.4 — « FIT STRUCTUREL DU PORTEFEUILLE », ET CE QU'IL N'EST PAS.
 *
 * L'issue demande « 22 comptes présentent une forte affinité avec tes
 * expertises déclarées », et pose elle-même la condition : « seulement si les
 * données sont fiables ».
 *
 * Ce qui est livré : le NOMBRE de comptes couverts dont la pile OBSERVÉE
 * recoupe au moins une expertise déclarée de l'espace, avec le critère visible.
 * Ce qui ne l'est pas : la gradation « FORTE ». Elle demanderait de normaliser
 * un recoupement par cohorte (un grand compte cite mécaniquement plus de
 * technologies qu'une PME, donc recoupe plus souvent), exactement la question
 * ouverte qui tient `MARKET_MEMORY_SCORING_ENABLED` à `false`. Sans cohorte,
 * « forte » mesurerait la taille de l'entreprise.
 *
 * `null` quand l'espace n'a déclaré AUCUNE expertise : la question ne se pose
 * pas, et un « 0 sur 38 » se lirait « ton portefeuille ne te correspond pas »
 * alors qu'il veut dire « tu n'as rien déclaré ». `0` avec des expertises
 * déclarées, lui, est une VRAIE mesure et se rend.
 */
export const marketStructuralFitSchema = z
  .object({
    /** Comptes couverts dont la pile observée recoupe une expertise déclarée. */
    matching: z.number().int().min(0),
    /** Le dénominateur : les comptes COUVERTS. Les seuls où la question a un sens. */
    covered: z.number().int().min(0),
    /** Les expertises qui ont servi de critère — le lecteur doit voir sur quoi on l'a mesuré. */
    expertises: z.array(z.string().min(1)).min(1),
  })
  .strip()
  .refine(value => value.matching <= value.covered, {
    message: 'on ne recoupe que parmi les comptes couverts',
    path: ['matching'],
  })
export type MarketStructuralFit = z.infer<typeof marketStructuralFitSchema>

/**
 * Ce que les trois écrans lisent.
 *
 * Même union que `MarketMemoryRead`, et pour la même raison : « je n'ai rien
 * trouvé » et « je n'ai pas pu lire » se ressemblent à l'écran et n'ont pas le
 * même sens. Sur une panne, un écran n'affiche AUCUN compteur — pas des zéros.
 *
 * `computedAt` voyage avec les chiffres parce que GA-80 l'exige de tout agrégat
 * et parce que la valeur est lue à la demande : sans elle, l'écran daterait
 * l'agrégat de son propre rendu.
 */
export const marketPortfolioReadSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('ok'),
    coverage: marketPortfolioCoverageSchema,
    /** Au plus `MARKET_REVIEW_QUEUE_MAX` lignes, les plus gros arbitrages d'abord. */
    review: z.array(marketReviewItemSchema).max(MARKET_REVIEW_QUEUE_MAX),
    structuralFit: marketStructuralFitSchema.nullable(),
    computedAt: z.string().datetime(),
  }),
  z.object({ status: z.literal('unavailable'), reason: z.string().min(1) }),
])
export type MarketPortfolioRead = z.infer<typeof marketPortfolioReadSchema>

/* ═══════════════════════════════════════════════════════════════════════════
 * LA PREVIEW PRÉ-COMPTE DE L'ÉCRAN DE LANCEMENT (#1589.2)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE FORME DE PLUS, ALORS QUE `MarketMemoryCoverage` EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * `MarketMemoryCoverage` est la forme INTERNE : elle porte les noms d'ESN, les
 * comptages par technologie, l'empreinte de zone. Elle traverse déjà vers le
 * dossier d'un compte, où l'utilisateur a demandé ce compte et l'a payé.
 *
 * L'écran de LANCEMENT est un autre contexte : on y regarde une entreprise
 * qu'on n'a pas encore analysée, **avant tout débit**. #1589.2 énumère
 * explicitement ce qui ne doit pas en sortir — « nom de freelance »,
 * « coordonnées », « nombre présenté comme recensement exhaustif », « date du
 * corpus ». Une réduction faite à l'ÉCRAN se serait oubliée au premier
 * appelant suivant ; faite dans le TYPE, elle ne s'oublie pas.
 *
 * D'où une forme réduite, sur le patron d'`accountMarketContextSchema` (#1582),
 * qui a fait ce choix-là pour la même raison.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * « RECOURS À DES EXTERNES : OBSERVÉ » N'EST PAS UN CHAMP
 * ─────────────────────────────────────────────────────────────────────────────
 * C'est l'EXISTENCE de la preview qui le dit — exactement comme
 * `AccountMarketMemoryCard` le dérive de la présence du contexte marché. Un
 * champ booléen de plus serait une seconde dérivation du même fait, et deux
 * dérivations divergent. Sous `MARKET_MEMORY_MIN_PATHS`, `preview` vaut `null`
 * et l'écran écrit « Bellum n'a pas suffisamment d'observations marché sur ce
 * compte » — jamais « ce compte n'externalise pas » (#1589.2, et GA-259 d'un
 * cran plus haut).
 */

/**
 * Combien d'items au maximum dans chaque liste de la preview.
 *
 * Trois, et pas « tout ce que le corpus a » : l'écran de lancement montre ce
 * que Bellum sait AVANT de dépenser un crédit, pas un inventaire. Un compte
 * réel sort 38 lignes de pile observée ; les afficher ferait passer un aperçu
 * pour un recensement, ce que #1589.2 interdit en toutes lettres.
 *
 * La borne vit ICI et nulle part ailleurs (GA-26) : le contrôleur tronque, le
 * contrat refuse au-delà, et l'écran n'a aucune décision à prendre.
 */
export const MARKET_PREVIEW_MAX_ITEMS = 3

/**
 * LE SEAU DE RÉSIDU DU CORPUS — ce qui n'est pas une famille de rôles.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TROUVÉ À LA RECETTE, PAS EN CI
 * ─────────────────────────────────────────────────────────────────────────────
 * Mesuré en production le 08/09/2026, sur les CINQ premières entreprises
 * couvertes de la salle de démonstration :
 *
 *   ORANGE            → Autre | Chef de projet | Data / IA
 *   SNCF              → Autre | Chef de projet | Infra / Cloud
 *   Thales            → Autre | Développement  | Infra / Cloud
 *   BlaBlaCar         → Autre | Data / IA      | Marketing / Com
 *   MCDONALD'S FRANCE → Autre | Direction / Conseil | Formation / RH
 *
 * « Autre » est PREMIER partout — mécaniquement, puisque c'est le seau où le
 * corpus range tout ce qu'il n'a pas su classer, donc le plus gros. Sur les
 * trois libellés que la preview montre, un tiers de la ligne n'apprenait donc
 * rien, sur tous les comptes à la fois.
 *
 * C'est un défaut de POPULATION : chaque ligne de code était juste, et aucun
 * test ne pouvait le voir — un test fabrique ses familles, et personne
 * n'écrirait « Autre » dans une donnée d'exemple.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * UNE LISTE, PAS UN HEURISTIQUE
 * ─────────────────────────────────────────────────────────────────────────────
 * Écrite en toutes lettres et relisible, comme les mots vides de
 * `expertiseTokens` — un filtre malin (« la famille la plus grosse »,
 * « celle qui ne contient pas de barre oblique ») jetterait un jour une vraie
 * famille sans que personne ne s'en aperçoive.
 *
 * ⚠️ Ce n'est PAS une correction de la donnée : `role_families` garde son seau
 * en base, et le comptage du corpus reste entier. C'est un choix d'AFFICHAGE
 * pour un aperçu borné à trois libellés, et il vit ici pour qu'un second écran
 * qui bornerait la même liste n'ait pas à réinventer la liste.
 */
export const MARKET_RESIDUAL_ROLE_FAMILIES: readonly string[] = ['Autre']

/** Vrai quand ce libellé est un seau de résidu et non une famille NOMMÉE. */
export function isResidualRoleFamily(family: string): boolean {
  const folded = family.trim().toLowerCase()
  return MARKET_RESIDUAL_ROLE_FAMILIES.some(residual => residual.toLowerCase() === folded)
}

/**
 * Ce que l'écran de lancement lit d'une entreprise choisie à l'autocomplétion.
 *
 * `.strip()` n'est pas décoratif, c'est l'interdit lui-même : un `esnName`, un
 * `observedAt` ou un `persons` glissés par un appelant ne traversent pas.
 */
export const marketPreviewSchema = z
  .object({
    /** Parcours observés. Toujours ≥ `MARKET_MEMORY_MIN_PATHS` — sinon il n'y a pas de preview. */
    paths_observed: z.number().int().min(MARKET_MEMORY_MIN_PATHS),
    /**
     * COMBIEN d'ESN ont été observées, jamais LESQUELLES.
     *
     * `0` est une vraie mesure sur un compte couvert : la mémoire a été lue et
     * n'a vu passer aucune société de services. L'écran l'écrit « Inconnu »,
     * jamais « aucune ESN » — une absence d'observation n'est pas un fait.
     */
    esn_observed: z.number().int().min(0),
    /** Les technologies observées, SANS leur comptage (#1589.2 : pas de recensement). */
    observed_stack: z.array(z.string().min(1)).max(MARKET_PREVIEW_MAX_ITEMS),
    /** Les familles de rôles observées, SANS leur comptage, même raison. */
    role_families: z.array(z.string().min(1)).max(MARKET_PREVIEW_MAX_ITEMS),
  })
  .strip()
export type MarketPreview = z.infer<typeof marketPreviewSchema>

/**
 * Le résultat de la lecture.
 *
 * Même union que `MarketMemoryRead` et `MarketPortfolioRead`, et pour la même
 * raison : `preview: null` veut dire « lu, pas assez d'observations » ;
 * `unavailable` veut dire « pas lu ». Les rendre pareil ferait annoncer une
 * absence de mémoire sur une panne de base — le défaut le plus cher du dépôt.
 */
export const marketPreviewReadSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('ok'), preview: marketPreviewSchema.nullable() }),
  z.object({ status: z.literal('unavailable'), reason: z.string().min(1) }),
])
export type MarketPreviewRead = z.infer<typeof marketPreviewReadSchema>

/* ═══════════════════════════════════════════════════════════════════════════
 * LE CLASSEMENT DES PREMIERS COMPTES SUGGÉRÉS (#1593.2)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * L'écran de lancement propose trois à quatre entreprises tirées du Profil ESN.
 * #1593.2 demande de les DÉPARTAGER par la couverture de la mémoire marché —
 * pas de les noter, pas d'en inventer d'autres.
 *
 * ⚠️ Une lecture par chip serait un N+1 sur un écran d'accueil. `pathsFor` est
 * écrit exactement pour ça (« la lecture des listes et des compteurs : une
 * ligne par compte, sans une requête par ligne »), et la liste des comptes s'en
 * sert déjà. On lit donc le lot d'un coup.
 *
 * ⚠️ La valeur est `marketPathsSchema` : `null` sous le seuil, jamais `0`.
 * L'exception « 0 s'affiche » de la désambiguïsation (#1586) ne vaut PAS ici —
 * là-bas l'asymétrie départage deux homonymes, ici elle ferait lire « aucun
 * parcours » comme un fait sur l'entreprise.
 */

/** Au-delà, ce n'est plus un départage de chips, c'est un balayage. */
export const MARKET_PATHS_BATCH_MAX = 12

export const marketPathsBatchReadSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('ok'),
    /** Nom demandé → parcours observés, ou `null` (non couvert, ambigu, sous le seuil). */
    paths: z.record(z.string(), marketPathsSchema),
  }),
  z.object({ status: z.literal('unavailable'), reason: z.string().min(1) }),
])
export type MarketPathsBatchRead = z.infer<typeof marketPathsBatchReadSchema>

/* ═══════════════════════════════════════════════════════════════════════════
 * L'ENTREPRISE DE L'ESPACE, VUE PAR LA MÉMOIRE MARCHÉ (#1636)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Tout ce qui précède répond sur un compte du PORTEFEUILLE — une entreprise
 * qu'on prospecte. #1636 pose la question à l'envers : « et MON entreprise, que
 * dit la mémoire marché d'elle ? ». C'est le seul endroit du produit où
 * l'utilisateur peut vérifier la matière sur ce qu'il connaît le mieux.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE FORME DE PLUS, ALORS QUE `MarketMemoryCoverage` EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * `MarketMemoryCoverage` regarde une entreprise comme un CLIENT : quelles
 * sociétés de services gravitent autour d'elle, quelles technos y sont citées.
 * Retourné vers l'ESN de l'espace, l'objet n'aurait plus de sens — une ESN
 * n'est pas le client de sa propre prospection.
 *
 * Ce type-ci regarde la même entreprise comme une SOCIÉTÉ DE SERVICES : ses
 * familles de rôles, et les entreprises où ses anciens sont observés
 * aujourd'hui (`market_ex_esn_at_client.esn_origin_key`, la direction de
 * lecture que personne n'ouvrait avant ce lot).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'IL NE PORTE PAS, ET POURQUOI
 * ─────────────────────────────────────────────────────────────────────────────
 * · **Aucun nom de personne, aucun identifiant, aucune date** — les quatre
 *   interdits de tête valent ici comme partout, et `.strip()` les tient.
 * · **Aucun COMPTAGE sur les destinations.** Ailleurs dans la mémoire marché un
 *   comptage est anonyme : « 9 anciens d'une société de services sont chez ce
 *   client » ne désigne personne, parce que le lecteur ne connaît ni les uns ni
 *   les autres. Ici le lecteur EST l'employeur : sur une ESN de douze
 *   personnes, « 3 anciens sont partis chez X » nomme trois collègues sans
 *   écrire leur nom. L'ORDRE (le plus fréquent d'abord) survit ; le nombre, non.
 *   ⚠️ C'est le seul endroit du produit où cette asymétrie s'applique — elle
 *   tient à QUI regarde, pas à la donnée.
 * · **Aucun taux.** « 14 parcours observés » est un comptage d'observations, et
 *   il se dit. « 14 % de ton effectif » serait un taux sur une population qu'on
 *   ne connaît pas — et un taux de couverture ne dit jamais ce que le marché
 *   FAIT (doctrine `c65`, GA-259).
 */

/**
 * Combien de libellés au plus dans chaque liste du bloc.
 *
 * Trois, la même borne et la même raison que {@link MARKET_PREVIEW_MAX_ITEMS} :
 * le bloc dit ce que la mémoire OBSERVE, il ne dresse pas l'inventaire d'une
 * entreprise. Un vrai corpus sort trente-huit destinations ; les afficher
 * ferait passer une observation pour un recensement.
 *
 * ⚠️ Une borne DISTINCTE de celle de la preview, et non un import : les deux
 * valent trois aujourd'hui par coïncidence de raison, pas par dépendance. Les
 * lier ferait bouger un écran de lancement le jour où un écran de réglages
 * change d'avis — un réglage vit à un seul endroit, et ce sont deux réglages.
 */
export const MARKET_ESN_VIEW_MAX_ITEMS = 3

/**
 * Ce que la mémoire marché observe d'une entreprise EN TANT QUE société de services.
 *
 * `matchedCompanyName` et `matchedOn` ne sont pas décoratifs : ils sont la
 * condition pour que ce bloc ait le droit d'exister. Le corpus ne porte ni
 * SIREN, ni identifiant de registre, ni identifiant LinkedIn
 * (`market-company-resolution.ts`), et le profil ESN d'un espace ne porte ni
 * site ni numéro — le rapprochement se fait donc par le NOM, c'est-à-dire par
 * le lien FAIBLE que la doctrine du dépôt marque `inferred`. La règle est alors
 * que « la force voyage avec le résultat » : l'écran NOMME l'entreprise
 * rapprochée et dit par quoi, et l'utilisateur — le seul au monde à pouvoir le
 * faire d'un coup d'œil sur sa propre société — dément si ce n'est pas elle.
 *
 * ⚠️ `matchedOn: 'domain'` est INATTEIGNABLE aujourd'hui et reste dans le
 * vocabulaire à dessein : c'est celui de `MarketResolution`, et en retirer une
 * valeur obligerait le jour où le profil ESN portera un site à retraduire une
 * union au lieu de la laisser passer.
 */
/**
 * #1617.4 — LES DEUX SENS D'UNE CORRECTION HUMAINE de rapprochement.
 *
 * `confirmed` — « c'est bien cette entreprise du corpus ».
 * `dismissed` — « ce n'est pas exact », sans en proposer une autre : écarter
 * une lecture est une réponse complète, pas une donnée manquante.
 *
 * ⚠️ Deux valeurs, et PAS les quatre états de `MarketResolution`. L'état
 * calculé (`resolved` / `ambiguous` / `unresolved`) ne se persiste pas : il
 * résulte d'un calcul qui doit rester vivant, et le figer créerait deux vérités
 * qui divergeraient au premier import du corpus.
 *
 * Nommée ici pour que la contrainte SQL `market_company_resolution_override_
 * decision_check` soit comparable à son énumération TypeScript (GA-12) — une
 * contrainte sans enum nommée n'est gardée par personne.
 */
export const MARKET_RESOLUTION_DECISIONS = z.enum(['confirmed', 'dismissed'])
export type MarketResolutionDecision = z.infer<typeof MARKET_RESOLUTION_DECISIONS>

/**
 * #1617.4 — CE QU'UN HUMAIN ENVOIE QUAND IL TRANCHE UN RAPPROCHEMENT.
 *
 * Une union DISCRIMINÉE, et pas un objet à champs optionnels : c'est la même
 * règle que le CHECK croisé de `market_company_resolution_override`, exprimée
 * là où la requête arrive. `confirmed` sans clé ne désigne rien ; `dismissed`
 * avec une clé dit deux choses contraires. Les refuser au bord évite qu'une
 * contrainte SQL fasse le travail d'une validation — une erreur Postgres rend
 * un 500 opaque, ce schéma rend un 400 qui NOMME le champ.
 *
 * ⚠️ Aucune raison n'est OBLIGATOIRE. Exiger une justification fait cliquer
 * « autre » à tout le monde, et on n'apprend rien — c'est écrit sur la colonne
 * `note` de l'entité, et c'est la même décision ici.
 *
 * ⚠️ La clé n'est PAS vérifiée contre le corpus, et c'est voulu : le corpus est
 * RÉIMPORTÉ, une clé absente aujourd'hui peut revenir demain. Une décision qui
 * vise une clé absente ne désigne rien à la lecture — et c'est la bonne
 * réponse, pas une erreur à lever au moment d'écrire.
 */
export const MARKET_RESOLUTION_NOTE_MAX = 500

export const marketResolutionDecisionRequestSchema = z.discriminatedUnion('decision', [
  z.object({
    decision: z.literal('confirmed'),
    /** La clé du corpus désignée — celle d'une `MarketReviewCandidate`. */
    marketCompanyKey: z.string().min(1),
    note: z.string().trim().min(1).max(MARKET_RESOLUTION_NOTE_MAX).nullable().optional(),
  }),
  z.object({
    decision: z.literal('dismissed'),
    note: z.string().trim().min(1).max(MARKET_RESOLUTION_NOTE_MAX).nullable().optional(),
  }),
])
export type MarketResolutionDecisionRequest = z.infer<typeof marketResolutionDecisionRequestSchema>

/**
 * Ce que l'API rend après avoir écrit — l'état ACTUELLEMENT enregistré.
 *
 * On rend la décision relue plutôt qu'un `204` muet : l'écran a besoin de
 * savoir que c'est bien SA décision qui tient, et deux personnes de la même
 * équipe peuvent trancher le même compte à trente secondes d'intervalle.
 *
 * ⚠️ Aucun état de rapprochement recalculé ici. Il vit dans la lecture
 * (`/accounts/market-memory-portfolio`), qui applique la correction à chaud :
 * le rendre ici en ferait une SECONDE vérité, qui divergerait au premier
 * import du corpus. C'est le refus déjà écrit sur l'entité.
 */
export const marketResolutionDecisionSchema = z
  .object({
    accountId: z.string().guid(),
    decision: MARKET_RESOLUTION_DECISIONS,
    marketCompanyKey: z.string().min(1).nullable(),
    note: z.string().min(1).nullable(),
  })
  .strip()
export type MarketResolutionDecisionRecord = z.infer<typeof marketResolutionDecisionSchema>

export const marketEsnViewSchema = z
  .object({
    matchedCompanyName: z.string().min(1),
    matchedOn: z.enum(['domain', 'name', 'alias']),
    /** Toujours ≥ `MARKET_MEMORY_MIN_PATHS` — sinon il n'y a pas de vue du tout. */
    pathsObserved: z.number().int().min(MARKET_MEMORY_MIN_PATHS),
    /** Les familles NOMMÉES, le seau de résidu déjà retiré (`isResidualRoleFamily`). */
    roleFamilies: z.array(z.string().min(1)).max(MARKET_ESN_VIEW_MAX_ITEMS),
    /** Les entreprises où des anciens sont observés — les plus fréquentes d'abord, SANS leur nombre. */
    destinations: z.array(z.string().min(1)).max(MARKET_ESN_VIEW_MAX_ITEMS),
  })
  .strip()
export type MarketEsnView = z.infer<typeof marketEsnViewSchema>

/**
 * Le résultat de la lecture — QUATRE issues, parce que quatre choses
 * différentes peuvent se passer et qu'aucune ne se dit comme une autre.
 *
 * · `ok`          — on a lu, et il y a de quoi parler.
 * · `insufficient` — on a lu, et il n'y a pas assez d'observations. C'est un
 *   fait sur NOS observations, jamais sur l'entreprise : « pas suffisamment
 *   couverte », jamais « n'externalise pas », jamais « 0 ».
 * · `undeclared`  — personne n'a renseigné le nom de l'entreprise, donc on n'a
 *   RIEN cherché. Le confondre avec `insufficient` ferait annoncer une absence
 *   de couverture au repos, alors que l'interrupteur est simplement éteint —
 *   le défaut « un écran qui lit ce qui MANQUE sans lire l'INTERRUPTEUR ».
 * · `unavailable` — on n'a PAS pu lire. Même distinction que partout ailleurs
 *   dans la mémoire marché, et pour la même raison : un « pas couvert » affiché
 *   sur une panne est un mensonge présenté comme une mesure.
 */
export const marketEsnViewReadSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('ok'), view: marketEsnViewSchema }),
  z.object({ status: z.literal('insufficient') }),
  z.object({ status: z.literal('undeclared') }),
  z.object({ status: z.literal('unavailable'), reason: z.string().min(1) }),
])
export type MarketEsnViewRead = z.infer<typeof marketEsnViewReadSchema>

/**
 * #5192 (lot 781) — LE DÉTAIL DES PARCOURS OBSERVÉS chez un compte, derrière « Voir les détails » de la carte
 * « Observé sur le marché ». Décision Louis 02/11 : toute la donnée du parcours (poste, famille, compétences, période,
 * statut, ESN employeuse, TJM), AUCUN identifiant — ni nom, prénom, genre, téléphone, e-mail, URL de profil, photo,
 * adresse, date de naissance, ni le pseudonyme. `.strict()` : un champ de plus REFUSE au lieu de fuiter.
 * Une absence est `null`, jamais « 0 » ; la liste est plafonnée, `paths_total` dit combien il en existe.
 */
export const MARKET_PATHS_DETAIL_MAX = 200
export const accountMarketPathSchema = z
  .object({
    job_title: z.string().nullable(),
    role_family: z.string().nullable(),
    skills: z.array(z.string()),
    start_date: z.string().nullable(),
    end_date: z.string().nullable(),
    date_precision: z.enum(['day', 'month', 'year']).nullable(),
    work_status: z.enum(['freelance', 'esn', 'salarie', 'inconnu']),
    esn_name: z.string().nullable(),
    daily_rate_eur: z.number().nullable(),
  })
  .strict()
export const accountMarketPathsSchema = z
  .object({
    paths_total: z.number().int().min(0),
    paths: z.array(accountMarketPathSchema).max(MARKET_PATHS_DETAIL_MAX),
  })
  .strict()
export type AccountMarketPath = z.infer<typeof accountMarketPathSchema>
export type AccountMarketPaths = z.infer<typeof accountMarketPathsSchema>
