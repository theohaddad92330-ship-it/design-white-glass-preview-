import { z } from 'zod'
import { overflowScoreSchema } from './overflow-score.js'
import { TERRITORY_CHANGE_KINDS, TERRITORY_MEASURE_KEYS, type TerritoryMeasureKey } from './territory-watch.js'

/**
 * L'écran Territoire (tome 4, partie F) — « je veux ouvrir une ville,
 * qu'est-ce qu'il y a là-bas ? ».
 *
 * Cinq blocs, et **chaque bloc porte son état**. C'est la règle qui rend
 * l'écran lisible : quatre sources publiques ne répondent jamais ensemble, et
 * un écran qui tombe entier parce que l'une d'elles est muette ne dit pas ce
 * qu'il sait. Un bloc `unavailable` NOMME sa source ; un bloc `empty` dit
 * franchement qu'il n'y a rien — « le département 15 compte 4 ESN et 12 offres
 * IT : il n'y a pas de marché ici pour ton activité ».
 */
export const TERRITORY_BLOCK_STATES = ['ready', 'partial', 'empty', 'unavailable'] as const
export type TerritoryBlockState = (typeof TERRITORY_BLOCK_STATES)[number]

const blockMeta = {
  state: z.enum(TERRITORY_BLOCK_STATES),
  /** Pourquoi cet état, en français. `null` quand le bloc est simplement prêt. */
  reason: z.string().nullable().optional(),
}

export const territoryMarketBlockSchema = z.object({
  ...blockMeta,
  offers: z.number().int().nonnegative().optional(),
  technologies: z.array(z.object({ term: z.string(), count: z.number().int() })).optional(),
  /** Pourquoi le classement de technos est vide, quand il l'est. */
  technologiesReason: z.string().nullable().optional(),
  hiringAccounts: z
    .array(
      z.object({
        name: z.string(),
        offers: z.number().int(),
        /**
         * La VILLE de l'employeur, telle que la source d'offres la nomme.
         *
         * Elle voyageait déjà sur chaque offre et n'était lue NULLE PART — sur
         * un écran dont la question est « qu'est-ce qu'il y a LÀ-BAS ». La
         * graphie retenue est la plus fréquente pour cet employeur ; `null`
         * quand aucune offre n'en porte, jamais une ville devinée.
         */
        city: z.string().nullable().optional(),
      }),
    )
    .optional(),
  /**
   * La maille FINE a-t-elle été obtenue ?
   *
   * `true` = la source d'offres a refusé `commune`/`distance` et ces lignes
   * couvrent le DÉPARTEMENT. Sans ce drapeau, l'écran étiquetterait un
   * département entier « à 12 km de Toulouse » — une réponse exacte à une
   * question qu'on n'a pas posée, invisible à la lecture.
   */
  coarseFallback: z.boolean().optional(),
})

export const territoryCompetitionBlockSchema = z.object({
  ...blockMeta,
  esnPresent: z.number().int().nonnegative().optional(),
  /** `null` : l'emploi IT du département n'est publié par aucune source
   *  gratuite. Un ratio approché serait un chiffre inventé sur lequel on
   *  déciderait d'ouvrir une agence. */
  density: z.number().nullable().optional(),
  densityReason: z.string().nullable().optional(),
})

export const territoryOverflowBlockSchema = z.object({
  ...blockMeta,
  esn: z
    .array(
      z.object({
        name: z.string(),
        offers: z.number().int(),
        /**
         * Le score de débordement, posé côté API : ses entrées viennent des
         * offres (service IA) ET du référentiel (drapeau de risque, moyenne de
         * recrutement, ouverture déclarée).
         *
         * ⚠️ Il a porté `z.unknown()` jusqu'au 29/08/2026 (D141), et ce n'était
         * pas anodin : l'écran ne pouvait pas TYPER ce qu'il affiche, il a donc
         * dû recopier la forme du score dans un parseur de frontière — une
         * seconde description du même objet, qui cesse d'être vraie au premier
         * axe ajouté. Le schéma vit maintenant à côté du calcul qui produit la
         * valeur ({@link overflowScoreSchema}), et un seul endroit la décrit.
         *
         * `.optional()` RESTE, et pour une raison : ce contrat type les DEUX
         * réponses. Le service IA rend les ESN qui recrutent sans aucun score —
         * il ne connaît ni le référentiel ni le drapeau de risque —, et c'est
         * `territory.controller.ts:113` qui le pose par-dessus. Le rendre
         * obligatoire ferait mentir le contrat sur la première.
         */
        score: overflowScoreSchema.optional(),
      }),
    )
    .optional(),
})

/**
 * UN ACHETEUR PUBLIC QUI CHERCHE — avec de quoi lui répondre.
 *
 * Ce bloc rendait TROIS ENTIERS (« 3 appels d'offres · 12 marchés attribués »)
 * et jetait tout le reste. Les deux sources rendent des lignes NOMMÉES depuis
 * le premier jour : l'acheteur, l'objet du marché, la date limite de réponse,
 * le lien vers l'avis. Elles étaient collectées, payées en latence, puis
 * réduites à un `len()` — le défaut n°1 du dépôt dans sa forme la plus chère.
 */
export const territoryTenderSchema = z.object({
  name: z.string(),
  siren: z.string().nullable().optional(),
  department: z.string().nullable().optional(),
  /** L'objet du marché, tel que la source l'a écrit. */
  subject: z.string().nullable().optional(),
  date: z.string().nullable().optional(),
  /** Codes CPV et DATE LIMITE DE RÉPONSE — le « pourquoi maintenant ». */
  detail: z.string().nullable().optional(),
  /** Le lien vers l'avis. Sans lui, savoir qu'un marché existe ne permet pas d'y répondre. */
  url: z.string().nullable().optional(),
})

/**
 * UN MARCHÉ ATTRIBUÉ — c'est-à-dire une porte, et la date où elle se rouvre.
 *
 * ⚠️ `vendor` est le CONCURRENT EN PLACE, et `endsOn` la fin du contrat. C'est
 * l'information la plus chère de cet écran, et elle n'était nulle part : savoir
 * qu'un acheteur a attribué un marché ne dit rien ; savoir QUI le tient et
 * JUSQU'À QUAND dit quand commencer à travailler le compte.
 */
export const territoryAwardSchema = z.object({
  name: z.string(),
  siren: z.string().nullable().optional(),
  department: z.string().nullable().optional(),
  subject: z.string().nullable().optional(),
  /** Le titulaire. `null` = non résolu — JAMAIS un SIRET brut affiché comme un nom. */
  vendor: z.string().nullable().optional(),
  amount: z.number().nullable().optional(),
  durationMonths: z.number().int().nullable().optional(),
  /** `null` quand le millésime ne publie pas la durée : une fin de contrat
   *  estimée serait une date inventée sur laquelle on planifierait une prise
   *  de contact. */
  endsOn: z.string().nullable().optional(),
  url: z.string().nullable().optional(),
})

export type TerritoryTender = z.infer<typeof territoryTenderSchema>
export type TerritoryAward = z.infer<typeof territoryAwardSchema>

export const territoryAccessibleBlockSchema = z.object({
  ...blockMeta,
  openTenders: z.number().int().nonnegative().optional(),
  awardedContracts: z.number().int().nonnegative().optional(),
  buyersWithIncumbent: z.number().int().nonnegative().optional(),
  /** Les compteurs RESTENT (ils se lisent d'un coup d'œil) ; les listes s'y ajoutent. */
  tenders: z.array(territoryTenderSchema).optional(),
  awards: z.array(territoryAwardSchema).optional(),
})

/** Les trois mailles d'un territoire. Elles sont EXCLUSIVES. */
export const TERRITORY_SCOPE_KINDS = ['department', 'commune', 'around'] as const

/** Le rayon maximal, EN KILOMÈTRES — la borne vient de l'API du registre, qui
 *  la dit elle-même : `radius=51` rend un 400 « entre 0.001 et 50 » (mesuré le
 *  04/09/2026). L'écran borne son curseur avec cette constante, pour annoncer
 *  la limite AVANT le clic plutôt que la découvrir en erreur. */
export const TERRITORY_MAX_RADIUS_KM = 50

export const territoryScopeSchema = z.object({
  kind: z.enum(TERRITORY_SCOPE_KINDS),
  /** Comment NOMMER ce territoire, en une ligne. Calculé côté serveur : c'est
   *  cette phrase-là qui a servi à interroger les sources, et deux
   *  formulations du même territoire finiraient par diverger. */
  label: z.string(),
  department: z.string(),
  communeCode: z.string().nullable().optional(),
  communeName: z.string().nullable().optional(),
  radiusKm: z.number().nullable().optional(),
})

/** Une commune proposée par le champ « ville ». */
export const territoryCommuneSchema = z.object({
  code: z.string(),
  name: z.string(),
  postalCodes: z.array(z.string()).optional(),
  latitude: z.number(),
  longitude: z.number(),
  /** `null` quand elle n'est pas publiée — jamais 0, qui se lirait « commune vide ». */
  population: z.number().nullable().optional(),
  department: z.string().nullable().optional(),
  departmentName: z.string().nullable().optional(),
})
export type TerritoryCommune = z.infer<typeof territoryCommuneSchema>

/**
 * LA FICHE DE REGISTRE D'UNE ENTREPRISE — gratuite, sans crédit.
 *
 * L'écran Territoire nommait des dizaines d'entreprises en texte mort : la
 * seule façon d'en savoir plus était de lancer une analyse complète (8 crédits,
 * par entreprise) sur un territoire qui en compte quarante. Un clic ouvre
 * maintenant ce que le registre public dit gratuitement ; l'analyse reste un
 * geste séparé, décidé (arbitrage de Louis, 04/09/2026).
 *
 * ⚠️ Tout est nullable, et rien n'est déduit. Un siège sans adresse publiée
 * rend `null` — jamais la commune du département, qui se lirait comme une
 * adresse vraie.
 */
export const territoryCompanyRecordSchema = z.object({
  source: z.string().optional(),
  name: z.string().nullable().optional(),
  siren: z.string().nullable().optional(),
  nafCode: z.string().nullable().optional(),
  /** Catégorie INSEE : PME, ETI, GE. */
  category: z.string().nullable().optional(),
  headcountRange: z.string().nullable().optional(),
  /** Établissements OUVERTS — un total qui compte les sites fermés ferait
   *  passer pour décentralisée une entreprise qui ne l'est plus. */
  etablissementCount: z.number().nullable().optional(),
  creationDate: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  postalCode: z.string().nullable().optional(),
  legalForm: z.string().nullable().optional(),
  dirigeants: z.array(z.object({ name: z.string(), role: z.string() })).optional(),
})
export type TerritoryCompanyRecord = z.infer<typeof territoryCompanyRecordSchema>

/**
 * `company: null` n'est pas une erreur, et `reason` dit LAQUELLE des deux :
 * `not_found` (le registre a répondu, il ne connaît pas ce nom) ou
 * `empty_query`. Les confondre avec une panne ferait dire « entreprise
 * inconnue » quand la source est simplement muette.
 */
export const territoryCompanyLookupSchema = z.object({
  company: territoryCompanyRecordSchema.nullable(),
  reason: z.string().nullable().optional(),
})

export const territoryOverviewSchema = z.object({
  department: z.string(),
  sinceDays: z.number().int().positive(),
  /** La maille RÉELLEMENT interrogée. `.optional()` : une réponse antérieure au
   *  champ ne la porte pas, et l'écran retombe alors sur « département ». */
  scope: territoryScopeSchema.optional(),
  /**
   * Les sources qui ont répondu à une question PLUS LARGE que celle posée.
   *
   * Demander « à 12 km de Toulouse » et recevoir un département n'est pas
   * faux — c'est une autre question. Le taire serait le pire des deux : une
   * réponse exacte à une question qu'on n'a pas posée, impossible à repérer.
   * BOAMP et DECP publient au département : ils y sont donc toujours nommés
   * hors du mode département, même quand tout va bien.
   */
  coarseSources: z.array(z.string()).optional(),
  market: territoryMarketBlockSchema,
  competition: territoryCompetitionBlockSchema,
  overflow: territoryOverflowBlockSchema,
  accessible: territoryAccessibleBlockSchema,
  /** « Ce que je ne sais pas » — JAMAIS vide. C'est ce bloc qui empêche de lire
   *  une liste courte comme un territoire pauvre. */
  unknowns: z.array(z.string()),
})
export type TerritoryOverview = z.infer<typeof territoryOverviewSchema>

export const territoryRequestSchema = z.object({
  department: z.string().min(1),
  sinceDays: z.number().int().positive().max(730).optional(),
  /** Le code INSEE de la commune. Le code postal ne conviendrait pas : Toulouse
   *  en porte six, et un code postal rural couvre plusieurs communes. */
  communeCode: z.string().min(2).max(5).optional(),
  /** Le nom CHOISI dans la liste — il sert à nommer le territoire à l'écran, il
   *  n'entre dans aucune requête. C'est le code INSEE qui interroge. */
  communeName: z.string().max(120).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  /** ⚠️ Refusé au-delà de 50 km, pas rogné en silence : rendre 50 km à qui en
   *  demande 200 répondrait à une autre question. La borne est celle de l'API
   *  du registre, mesurée. */
  radiusKm: z.number().positive().max(TERRITORY_MAX_RADIUS_KM).optional(),
})
export type TerritoryRequest = z.infer<typeof territoryRequestSchema>

/**
 * Le suivi d'un territoire (tome 4 §21.3) — le contrat de l'écran Marché.
 *
 * Distinct de `territoryOverviewSchema` : l'aperçu répond à « qu'est-ce qu'il y
 * a là-bas ? », la veille répond à « qu'est-ce qui a bougé depuis la semaine
 * dernière ? ». Ce sont deux écrans parce que ce sont deux gestes — on ouvre le
 * premier quand on prospecte une ville, on lit le second toutes les semaines.
 */
export const territoryChangeSchema = z.object({
  kind: z.enum(TERRITORY_CHANGE_KINDS),
  label: z.string(),
  from: z.number().nullable(),
  to: z.number().nullable(),
  subject: z.string().optional(),
})

/**
 * OÙ MÈNE UN INDICATEUR — parce qu'un indicateur qui ne mène nulle part ne sert
 * à rien.
 *
 * Deux formes, et la distinction n'est pas cosmétique :
 *  · `route` — l'écran qui porte la LISTE de ce que le chiffre compte, avec ses
 *    critères en URL. C'est la même source publique des deux côtés : « 8 appels
 *    d'offres ouverts » ouvre l'écran Découvrir filtré sur les annonces BOAMP du
 *    département, où chaque ligne porte sa date de réponse. La destination est
 *    vérifiée contre l'ARBRE DE ROUTES RÉEL par `territory-indicators-lead-…`.
 *  · `panel` — la liste vit sur CET écran, parce que l'API la sert ici et nulle
 *    part ailleurs (le référentiel ESN d'un département). Une route inventée
 *    pour la forme serait une porte vers « Page introuvable ».
 */
export const TERRITORY_INDICATOR_PANELS = ['esn', 'movements', 'technologies'] as const
export type TerritoryIndicatorPanel = (typeof TERRITORY_INDICATOR_PANELS)[number]

export const territoryIndicatorTargetSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('route'),
    route: z.string(),
    /** Les critères qui cadrent l'écran d'arrivée sur CE territoire. */
    search: z.record(z.string(), z.string()).optional(),
  }),
  z.object({ kind: z.literal('panel'), panel: z.enum(TERRITORY_INDICATOR_PANELS) }),
])
export type TerritoryIndicatorTarget = z.infer<typeof territoryIndicatorTargetSchema>

/**
 * OÙ MÈNE CHAQUE MESURE — la table, à UN seul endroit.
 *
 * Elle vit dans les contrats et non dans l'écran, pour deux raisons : la garde
 * `territory-indicators-lead-somewhere.test.ts` la relit sans rien recopier, et
 * l'API la renvoie DÉJÀ RÉSOLUE (le département injecté dans les critères), si
 * bien que l'écran n'a aucune décision à reprendre.
 *
 * Les trois destinations « route » pointent vers l'écran Découvrir cadré sur le
 * MÊME registre public que la mesure : les annonces BOAMP pour les appels
 * d'offres ouverts, les marchés DECP pour les attributions, les offres France
 * Travail pour les recrutements. C'est là que chaque ligne porte sa date — et,
 * pour un appel d'offres, sa DATE DE RÉPONSE.
 *
 * `esnPresent` mène à un PANNEAU et non à une route : la liste des ESN du
 * référentiel de ce département n'est servie que par cet écran. Inventer une
 * route pour la forme serait une porte vers « Page introuvable », ce qui est
 * pire qu'un chiffre qui ne mène nulle part.
 */
export const TERRITORY_MEASURE_TARGETS: Record<TerritoryMeasureKey, TerritoryIndicatorTarget> = {
  offers: { kind: 'route', route: '/discover', search: { signals: 'hiring' } },
  esnPresent: { kind: 'panel', panel: 'esn' },
  openTenders: { kind: 'route', route: '/discover', search: { signals: 'tender' } },
  awardedContracts: { kind: 'route', route: '/discover', search: { signals: 'award' } },
}

/**
 * UNE VARIATION ENTRE DEUX PHOTOS, MESURÉE OU NON — la forme commune à
 * l'horizon ACTUEL (`trend`, les deux dernières photos) et à l'horizon
 * STRUCTUREL (`structuralTrend`, la plus ancienne et la plus récente). Un seul
 * schéma pour les deux : ils partagent la même arithmétique
 * (`territoryTrend`), donc la même forme de sortie.
 */
export const territoryTrendSchema = z.discriminatedUnion('measured', [
  z.object({ measured: z.literal(false), gap: z.string() }),
  z.object({
    measured: z.literal(true),
    change: z.number(),
    percent: z.number().nullable(),
    from: z.number(),
    to: z.number(),
    fromDate: z.string(),
    toDate: z.string(),
  }),
])

/**
 * UNE MESURE DE TERRITOIRE, AVEC TOUT CE QU'IL FAUT POUR LA LIRE.
 *
 * Le chiffre nu — « Offres IT 100 » — était la faute de cet écran. Une mesure
 * porte désormais quatre choses en plus, et chacune répond à une question qu'un
 * commercial se pose devant elle :
 *  · sa BORNE (`bounded` + `ceiling`) — « est-ce un compte ou un plafond ? » ;
 *  · son REGISTRE (`registry`) — « je peux aller vérifier où ? » ;
 *  · sa DATE (`observedOn`) — « ça date de quand ? » ;
 *  · sa DESTINATION (`target`) — « je vois quoi si je clique ? ».
 */
export const territoryMeasureSchema = z.object({
  key: z.enum(TERRITORY_MEASURE_KEYS),
  /** `null` = la source n'a pas répondu ce jour-là. JAMAIS zéro. */
  value: z.number().int().nullable(),
  /** `true` quand la valeur a ATTEINT sa borne : c'est un plancher, pas un compte. */
  bounded: z.boolean(),
  /** La borne en vigueur lors de la prise, pour que l'écran puisse l'écrire. */
  ceiling: z.number().int().positive(),
  /** Le registre public d'où vient le chiffre — son nom EST la garantie. */
  registry: z.string(),
  /** La date de la photo qui porte cette valeur. */
  observedOn: z.string().nullable(),
  /**
   * La variation depuis la photo précédente. Non mesurée avec sa RAISON —
   * `no_previous_snapshot` (une seule photo), `bounded_reading` (deux plafonds
   * ne font pas une stabilité). Jamais « +0 ».
   */
  trend: territoryTrendSchema,
  /**
   * #2206.42 — L'HORIZON STRUCTUREL, entre la plus ANCIENNE photo disponible
   * et la plus récente — jamais entre les deux dernières, c'est `trend` qui
   * porte déjà cet horizon-ACTUEL. Non mesuré avec sa propre raison en plus de
   * celles de `trend` : `not_enough_history`, quand l'historique n'a que deux
   * photos ou moins, ou quand la plus ancienne a moins de 30 jours — dans ces
   * deux cas, le fond SERAIT l'actuel déguisé.
   */
  structuralTrend: territoryTrendSchema,
  target: territoryIndicatorTargetSchema,
})

/**
 * CE QUE LE RÉFÉRENTIEL ESN SAIT DE CE DÉPARTEMENT.
 *
 * ⚠️ Population DIFFÉRENTE de `esnPresent`, et il ne faut jamais les additionner
 * ni les présenter comme une fraction l'une de l'autre :
 *  · `esnPresent` compte les établissements d'au moins trois salariés en code
 *    NAF d'ESN dont le SIÈGE est dans le département, au registre public ;
 *  · ceci compte les lignes du RÉFÉRENTIEL (les noms qu'on suit nationalement)
 *    dont le siège résolu tombe dans ce département. Il en manque forcément —
 *    `resolved / total` le dit.
 */
export const territoryEsnBreakdownSchema = z.object({
  /** Les lignes du référentiel dont le siège est ici. */
  known: z.number().int().nonnegative(),
  /** Combien de lignes du référentiel sont résolues, sur combien au total. */
  resolved: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  /** La répartition par TAILLE. `null` = tranche non résolue — jamais « 0 salarié ». */
  bySize: z.array(z.object({ sizeClass: z.string().nullable(), count: z.number().int().nonnegative() })),
  /** La répartition par RANG déclaré (ouverture au rang 2). */
  byOpenness: z.array(z.object({ openness: z.string(), count: z.number().int().nonnegative() })),
  /** Les ESN elles-mêmes, pour que le chiffre MÈNE à ce qu'il compte. */
  entries: z.array(
    z.object({
      name: z.string(),
      city: z.string().nullable(),
      sizeClass: z.string().nullable(),
      headcountRange: z.string().nullable(),
      openToSubcontracting: z.string(),
      riskFlag: z.string(),
    }),
  ),
})

export const watchedTerritorySchema = z.object({
  department: z.string(),
  /** La dernière photo, ou `null` si le balayage n'est pas encore passé. */
  lastSnapshotOn: z.string().nullable(),
  /** Le nombre de photos accumulées — c'est lui qui dit si une moyenne existe. */
  snapshots: z.number().int().nonnegative(),
  /** Les quatre dénombrements, chacun avec sa borne, sa date et sa destination. */
  measures: z.array(territoryMeasureSchema),
  changes: z.array(territoryChangeSchema),
  /**
   * Pourquoi il n'y a rien à montrer, quand c'est le cas. « La veille démarre,
   * la première comparaison arrivera lundi prochain » et « rien n'a bougé » ne
   * doivent pas s'afficher pareil.
   */
  reason: z.string().nullable(),
  esn: territoryEsnBreakdownSchema,
  /**
   * Les ESN qui recrutaient sur le territoire à la dernière photo. TOP 10 —
   * c'est ce que la collecte rend, et l'écran le dit plutôt que de laisser
   * croire à une liste exhaustive.
   */
  hiringEsn: z.array(z.object({ name: z.string(), offers: z.number().int().nonnegative() })),
  /**
   * Les technologies demandées, à la dernière photo. Comptées sur les SEULES
   * offres collectées — donc sur un échantillon borné, ce que l'écran écrit.
   * Vide quand la photo est passée sous le seuil de classement du service IA.
   */
  technologies: z.array(z.object({ term: z.string(), count: z.number().int().nonnegative() })),
  /**
   * Le lien avec le reste du produit — l'INTENTION de l'espace, jamais un fait
   * de marché partagé. Ces deux nombres ne quittent pas l'espace qui les lit
   * (frontière du coût d'accès, GA-43 : un fait de marché se partage, une
   * intention commerciale non).
   */
  portfolio: z.object({
    /** Comptes du portefeuille ayant un site déclaré dans ce département. */
    accountsHere: z.number().int().nonnegative(),
    /** Sur combien de comptes portent un site déclaré — le dénominateur RÉEL. */
    accountsWithSite: z.number().int().nonnegative(),
    /** ESN partenaires de l'espace dont le siège est ici. */
    partnersHere: z.number().int().nonnegative(),
  }),
})
export type WatchedTerritory = z.infer<typeof watchedTerritorySchema>

export const marketWatchSchema = z.object({
  territories: z.array(watchedTerritorySchema),
})
export type MarketWatch = z.infer<typeof marketWatchSchema>
