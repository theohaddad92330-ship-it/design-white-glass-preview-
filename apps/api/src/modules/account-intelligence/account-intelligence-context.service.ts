import { Inject, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
  type AccountIntelligenceCandidate,
  type AccountIntelligenceContextView,
  type AccountIntelligenceDataforgeStatus,
  type AccountIntelligenceEntryPath,
  type AccountIntelligenceField,
  type AccountIntelligenceIncumbent,
  type AccountIntelligenceProvenance,
  type AccountIntelligenceRecommendation,
  type AccountIntelligenceTechnology,
  type IncumbentEsnUnknownReason,
  accountRecommendationFreshness,
  parseAccountAnalysis,
  resolveAccountIntelligenceField,
} from '@bellum/contracts'
import { AccountEntity } from '../../database/entities/account.entity'
import { FieldProvenanceEntity } from '../../database/entities/field-provenance.entity'
import {
  DATAFORGE_ACCOUNT_STATUS_READER,
  FIELD_CONFLICTS_READER,
  MARKET_MEMORY_COVERAGE_READER,
  type DataforgeAccountStatusReader,
  type FieldConflictsReader,
  type MarketMemoryCoverageReader,
} from './module-tokens'

/**
 * #1618 — LA façade `AccountIntelligenceContext` : UNE lecture du contexte
 * d'un compte, avec la hiérarchie de confiance codée dans
 * `@bellum/contracts` (`resolveAccountIntelligenceField`) et chaque valeur
 * datée et sourcée.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE SERVICE NE FAIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Il n'appelle JAMAIS `OrionAccountsService` ni `MarketMemoryService`
 * directement (GA-07, cliquet au plafond) : il reçoit deux LECTEURS injectés
 * par jeton (`module-tokens.ts`), composés dans `account-intelligence.module.ts`.
 * Il n'écrit rien : c'est une façade de LECTURE, comme `MarketMemoryService`
 * lui-même (« Il ne dépend que de ses tables partagées : le retirer ne casse
 * rien d'autre »).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * #2285.4 / #2285.10 — DÉCOUVRIR ET PILOTAGE NE SONT PAS DES APPELANTS
 * ─────────────────────────────────────────────────────────────────────────────
 * Tranché sans Louis (26/09/2026, épopée #2786) : `contextFor` exige un
 * `accountId` résolu — c'est une lecture DE LA VÉRITÉ D'UN COMPTE. Découvrir
 * travaille sur des candidats PAS ENCORE comptes (aucun `accountId` à lui
 * donner) ; Pilotage agrège des KPIs sur TOUT le portefeuille (revenu, marge,
 * chaîne de missions), jamais la fiche d'un compte pris seul. Ni l'un ni
 * l'autre ne recalcule « la vérité d'un compte » au sens de #2285 : il n'y a
 * rien à brancher sur cette façade, ce n'est pas un chantier reporté.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * #2285.7 / #2285.8 — PARTENAIRES ET REVERSE MARKET NE SONT PAS DES APPELANTS
 * ─────────────────────────────────────────────────────────────────────────────
 * Tranché sans Louis (26/09/2026, épopée #2786), même motif que #2285.4/.10
 * ci-dessus : vérifié `git grep "company_name\|companyName\|\.sector"` sur
 * `apps/web/src/features/partner-pipeline` et `apps/web/src/features/market-watch`
 * — zéro résultat. Partenaires (onglet « Sur mes comptes ») liste des relations
 * ESN AGRÉGÉES à travers le portefeuille (nom de l'ESN, nombre de comptes où
 * elle apparaît), jamais l'identité d'UN compte pris seul. Reverse Market
 * (Marché) suit des TERRITOIRES (villes/départements), pas des comptes. Ni
 * l'un ni l'autre n'a d'`accountId` résolu à donner à `contextFor` : il n'y a
 * rien à brancher sur cette façade, ce n'est pas un chantier reporté.
 */
export interface AccountIntelligenceContext extends AccountIntelligenceContextView {
  /**
   * #2116.3 / .6 / .7 — l'identité (`companyName`, `sector`, `headquarters`)
   * et la mémoire marché ne se redéclarent PLUS ici : elles vivent dans
   * `AccountIntelligenceContextView` (@bellum/contracts), qui est ce que
   * l'écran lit. Les déclarer des deux côtés est ce qui a permis à trois
   * champs d'être calculés, persistés et renvoyés sans qu'aucun écran ne
   * puisse les voir — un `tsc` ne peut rien dire d'un champ que la vue ignore.
   *
   * Reste ici le SEUL bloc que la vue ne porte pas : le statut de la mémoire
   * marché (faits), qui a sa propre carte et n'entre pas dans le dossier.
   */
  readonly dataforge: {
    readonly provenance: AccountIntelligenceProvenance | null
    readonly status: AccountIntelligenceDataforgeStatus | null
  }
}

/**
 * #2116.10-12 — LES TROIS FAITS QUE LES ÉCRANS RECALCULAIENT.
 *
 * L'ESN en place, les technologies et le chemin d'accès étaient dérivés dans
 * l'écran qui les montrait — le chemin d'accès l'était même DEUX fois, dans
 * deux fichiers différents (`useAccountOverviewData`, `evaluationViewData`).
 * Deux dérivations d'un même fait divergent : c'est la loi 1 du tome 7
 * (GA-26), et c'est le seul défaut de cette famille qu'on ne voit jamais en
 * CI, parce que chaque calcul est juste tout seul.
 *
 * Ils se dérivent donc ICI, une fois, avec leur provenance — l'écran les rend
 * tels quels.
 */

/** La date que porte une dimension du dossier — `null` quand elle n'a jamais
 *  été rafraîchie séparément. ⚠️ JAMAIS `updated_at` : un refresh de signaux
 *  l'incrémente, et le dossier annoncerait « à jour » au-dessus d'un
 *  organigramme de mars (docblock de `AccountEntity.signals_refreshed_at`). */
function observedAtOf(date: Date | null | undefined): string | null {
  return date ? date.toISOString() : null
}

/** Un texte utile, ou `null`. Une chaîne d'espaces n'est pas une valeur. */
function usefulText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

/** Les trois champs de compte que la façade résout aujourd'hui — voir le
 *  docblock de `account-intelligence-context.ts` pour ce qui ne l'est pas
 *  encore (`market_memory` et `inference` n'ont pas de candidat ici). */
type ResolvedField = 'companyName' | 'sector' | 'headquarters'

@Injectable()
export class AccountIntelligenceContextService {
  constructor(
    @InjectRepository(AccountEntity)
    private readonly accounts: Repository<AccountEntity>,
    @InjectRepository(FieldProvenanceEntity)
    private readonly fieldProvenance: Repository<FieldProvenanceEntity>,
    @Inject(DATAFORGE_ACCOUNT_STATUS_READER)
    private readonly readDataforgeStatus: DataforgeAccountStatusReader,
    @Inject(MARKET_MEMORY_COVERAGE_READER)
    private readonly readMarketMemoryCoverage: MarketMemoryCoverageReader,
    @Inject(FIELD_CONFLICTS_READER)
    private readonly readFieldConflicts: FieldConflictsReader,
  ) {}

  /**
   * ⚠️ #1618 (intégration, 10/09/2026) — `workspaceId` n'est pas décoratif.
   *
   * La première version lisait `findOne({ where: { id: accountId } })`, sans
   * aucun filtre d'espace : n'importe quel utilisateur authentifié aurait lu le
   * contexte d'un compte d'un AUTRE espace en devinant son identifiant. Les
   * espaces sont des ESN, donc des concurrents — c'est la fuite la plus chère
   * que ce dépôt puisse produire.
   *
   * La règle du dépôt est `where: { id, workspace_id }`, jamais `where: { id }`
   * seul, et elle vaut même quand un contrôleur a déjà vérifié : une défense en
   * profondeur ne se déduit pas de l'appelant.
   */
  /**
   * #3235 — la version du jeu DataForge qui décrit ce compte (`data_version`),
   * pour `dataforge_version` du versioning d'analyse. Lecture LÉGÈRE de la
   * même source que `contextFor` (jamais un second chemin vers DataForge,
   * GA-281), cloisonnée par espace. `null` : compte hors espace, sans SIREN,
   * sans ligne DataForge ou sans version — INCONNU, jamais deviné.
   */
  async dataforgeVersionFor(accountId: string, workspaceId: string): Promise<string | null> {
    const account = await this.accounts.findOne({ where: { id: accountId, workspace_id: workspaceId } })
    if (!account?.siren) return null
    const status = await this.readDataforgeStatus(account.siren)
    return usefulText(status?.dataVersion)
  }

  async contextFor(accountId: string, workspaceId: string): Promise<AccountIntelligenceContext | null> {
    const account = await this.accounts.findOne({ where: { id: accountId, workspace_id: workspaceId } })
    if (!account) return null

    const humanRows = await this.fieldProvenance.find({
      where: { entity_type: 'account', entity_id: accountId, source: 'human' },
    })
    const humanObservedAt = new Map<string, Date>(humanRows.map(row => [row.field, row.observed_at]))

    // DataForge est DÉGRADABLE (comme la mémoire marché) : sans SIREN résolu,
    // on ne consulte même pas le lecteur — un SIREN absent n'est pas une
    // panne, c'est un compte que le registre ne peut pas encore situer.
    const dataforgeStatus = account.siren ? await this.readDataforgeStatus(account.siren) : null

    const marketMemoryRead = await this.readMarketMemoryCoverage({
      ref: account.id,
      name: account.company_name,
      website: account.website ?? null,
      country: account.registry_country ?? null,
    })

    // #190.1/#190.8 (épopée #3219) — rejouée depuis `record_field_audit` à
    // chaque lecture ; voir le docblock de `conflicts` sur la vue.
    const conflicts = await this.readFieldConflicts(account.id, workspaceId)

    const currentDataObservedAt = account.updated_at.toISOString()
    const currentValues: Record<ResolvedField, string | null> = {
      companyName: account.company_name,
      sector: account.sector,
      headquarters: account.headquarters,
    }
    const dataforgeValues: Record<ResolvedField, string | null> = {
      companyName: dataforgeStatus?.companyName ?? null,
      sector: dataforgeStatus?.sector ?? null,
      headquarters: dataforgeStatus?.headquarters ?? null,
    }

    const resolve = (field: ResolvedField): AccountIntelligenceField<string> => {
      // `field` porte les mêmes noms que `ACCOUNT_FIELD_COLUMNS`
      // (`crm-core/record-fields.ts`), la carte que lit `arbitrate()`
      // (`accounts.service.ts`) : une correction humaine sur ce champ protège
      // déjà la valeur en base, donc `currentValues[field]` EST la correction
      // dès que `field_provenance` porte `source = 'human'` pour lui — voir
      // le docblock « CORRECTION HUMAINE ET DONNÉE COURANTE NE SONT PAS DEUX
      // VALEURS » de `account-intelligence-context.ts`.
      const humanAt = humanObservedAt.get(field)
      const candidates: AccountIntelligenceCandidate<string>[] = [
        {
          source: 'human_correction',
          observedAt: humanAt ? humanAt.toISOString() : null,
          value: humanAt ? currentValues[field] : null,
        },
        {
          source: 'current_data',
          observedAt: currentDataObservedAt,
          value: currentValues[field],
        },
        {
          source: 'dataforge',
          observedAt: dataforgeStatus?.observedAt ?? null,
          value: dataforgeValues[field],
        },
        // `market_memory` et `inference` : aucun candidat aujourd'hui — voir
        // le docblock de `account-intelligence-context.ts`. Le rang existe
        // déjà dans `resolveAccountIntelligenceField` ; un futur appelant leur
        // fournira un candidat sans toucher ce fichier.
      ]
      return resolveAccountIntelligenceField(candidates)
    }

    // #2116.10-12 — LA lecture du dossier, faite ICI et pas dans trois écrans.
    // `parseAccountAnalysis` est la MÊME normalisation que celle de l'écran :
    // deux normalisations du même JSONB divergent au premier champ renommé.
    const analysis = parseAccountAnalysis(account.raw_analysis)
    const entitiesObservedAt = observedAtOf(account.entities_refreshed_at)
    // #3672 — les comptes analysés avant `strategy_refreshed_at` ne portent que
    // `strategy_collected_at` (savePlan) : on date l'hypothèse par la collecte du
    // plan plutôt que « date inconnue ». Ni l'un ni l'autre ⇒ `null`, jamais devinée.
    const strategyObservedAt = observedAtOf(account.strategy_refreshed_at ?? account.strategy_collected_at)

    // #2116.10 — l'ESN en place. Les noms viennent de la collecte publique ;
    // une liste vide est `null` (aucun candidat), jamais `[]` — « on n'a rien
    // trouvé » et « on n'a pas cherché » ne se rendent pas pareil.
    //
    // #2116.10 — `contractType` / `strengths` / `weaknesses` voyagent avec le
    // nom : `IncumbentEsnCard` est le seul écran qui rend l'ESN en place, et
    // c'est ce qui dit par où un titulaire installé se déloge. AJOUT de
    // champs sur la même façade que les technologies (nom + usage) — rien ne
    // se retire de `raw_analysis.competitors[]`.
    const namedIncumbents: AccountIntelligenceIncumbent[] = (analysis.competitors ?? [])
      .map(competitor => ({
        name: usefulText(competitor?.name),
        contractType: usefulText(competitor?.contract_type),
        strengths: usefulText(competitor?.strengths),
        weaknesses: usefulText(competitor?.weaknesses),
      }))
      .filter((entry): entry is AccountIntelligenceIncumbent => entry.name !== null)
    const incumbentEsnResolved = resolveAccountIntelligenceField<readonly AccountIntelligenceIncumbent[]>([
      {
        source: 'public_sources',
        observedAt: entitiesObservedAt,
        value: namedIncumbents.length > 0 ? namedIncumbents : null,
      },
    ])
    // #4149 — « c'est tout le temps non mesuré » (retour bêta 13/10) : la carte
    // disait « non mesuré » sans jamais dire POURQUOI, alors que c'est elle qui
    // porte le `reason` depuis des mois (`UnknownValue`). Deux lectures du même
    // vide, jamais confondues : un compte qui n'a encore jamais traversé la
    // recherche (aucune date d'entités) n'a « rien cherché » ; un compte dont la
    // recherche a tourné et dont les sources consultées ne nomment aucune ESN a
    // « cherché, rien trouvé ». Le code voyage, jamais la phrase (FR/EN à l'écran).
    // #4149 (R12, Thales « 4 analyses ») — `entities_refreshed_at` manque aux analyses antérieures à
    // la colonne : « jamais analysé » ne se décide donc pas sur elle seule. Un dossier qui porte un
    // plan daté ou une analyse non vide a été analysé ; c'est alors « aucune ESN nommée ».
    const hasBeenAnalysed =
      Boolean(entitiesObservedAt) ||
      Boolean(strategyObservedAt) ||
      Object.keys((account.raw_analysis ?? {}) as Record<string, unknown>).length > 0
    const incumbentEsn: AccountIntelligenceField<readonly AccountIntelligenceIncumbent[]> =
      incumbentEsnResolved.state === 'unknown'
        ? {
            state: 'unknown',
            reason: (hasBeenAnalysed ? 'no_esn_named' : 'never_analyzed') satisfies IncumbentEsnUnknownReason,
          }
        : incumbentEsnResolved

    // #2116.11 — les technologies, avec leur USAGE. Le nom seul est un
    // inventaire ; « React — pour le portail client » est une prise.
    const namedTechnologies: AccountIntelligenceTechnology[] = (analysis.technology_stack ?? [])
      .map(entry => ({ name: usefulText(entry?.name), usage: usefulText(entry?.usage) }))
      .filter((entry): entry is AccountIntelligenceTechnology => entry.name !== null)
    const technologies = resolveAccountIntelligenceField<readonly AccountIntelligenceTechnology[]>([
      {
        source: 'public_sources',
        observedAt: entitiesObservedAt,
        value: namedTechnologies.length > 0 ? namedTechnologies : null,
      },
    ])

    // #2116.12 — LE chemin d'accès, un seul calcul. Deux candidats concurrents,
    // et c'est l'arbitre de #1618 qui tranche : la porte que DataForge
    // recommande bat l'inférence du modèle, parce qu'elle est adossée à un
    // corpus de parcours et pas à une lecture de dossier.
    //
    // #2116.17 — `openingStrategy` arrive TOUJOURS sous DEUX formes réelles :
    // une narration libre (string — la MAJORITÉ du pipeline actuel,
    // `bellum_strategy.py:200`) ou l'objet structuré `{ strategy,
    // entry_points }`. `commentOuvrirCompteSchema` (@bellum/contracts) garde
    // l'union TELLE QUELLE (pas de normalisation au contrat — `apps/web` fait
    // le même `typeof === 'string'` sur ce champ, et une valeur toujours-objet
    // aurait cassé sa branche narrative). Avant ce correctif, ce service ne
    // lisait `.entry_points`/`.strategy` QUE sur la forme objet : sur une
    // string, `entryPaths` restait `unknown` ET aucune narration n'était
    // jamais extraite — `recommendations: []` sur 25/25 comptes de prod,
    // THALES compris.
    const openingStrategy = analysis.comment_ouvrir_compte
    const inferredPaths: AccountIntelligenceEntryPath[] =
      openingStrategy && typeof openingStrategy !== 'string'
        ? (openingStrategy.entry_points ?? [])
            .map(entry => ({
              label: usefulText(entry?.label),
              targetProfile: usefulText(entry?.target_profile),
              justification: usefulText(entry?.justification),
            }))
            .filter((entry): entry is AccountIntelligenceEntryPath => entry.label !== null)
        : []
    // #2116.17 — LA NARRATION SANS PORTE NOMMÉE, extraite des DEUX formes :
    // la string brute EST la narration ; l'objet la porte sous `.strategy`.
    // Le pipeline actuel écrit le plus souvent une prose (« Entrer par la
    // DSI via… ») sans jamais structurer `entry_points` : sans ce filet,
    // `entryPaths.state` reste `unknown` et `recommendations` reste vide
    // alors que le dossier PORTE une lecture. La narration devient donc
    // elle-même une recommandation (voir `buildRecommendations`), avec sa
    // nature honnête : une INFÉRENCE du modèle sur le dossier, jamais un
    // fait observé (contrairement à `nextAction`/`mainRisk`, qui viennent de
    // DataForge, un corpus de parcours).
    const openingNarrative =
      typeof openingStrategy === 'string' ? usefulText(openingStrategy) : usefulText(openingStrategy?.strategy)
    const dataforgeEntryPoint = usefulText(dataforgeStatus?.recommendedEntryPoint)
    const dataforgePaths: AccountIntelligenceEntryPath[] = dataforgeEntryPoint
      ? [
          {
            label: dataforgeEntryPoint,
            targetProfile: usefulText(dataforgeStatus?.recommendedPersona),
            justification: usefulText(dataforgeStatus?.recommendedStrategy),
          },
        ]
      : []
    const entryPaths = resolveAccountIntelligenceField<readonly AccountIntelligenceEntryPath[]>([
      {
        source: 'dataforge',
        observedAt: dataforgeStatus?.observedAt ?? null,
        value: dataforgePaths.length > 0 ? dataforgePaths : null,
      },
      {
        source: 'inference',
        observedAt: strategyObservedAt,
        value: inferredPaths.length > 0 ? inferredPaths : null,
      },
    ])

    return {
      accountId: account.id,
      companyName: resolve('companyName'),
      sector: resolve('sector'),
      headquarters: resolve('headquarters'),
      incumbentEsn,
      technologies,
      entryPaths,
      recommendations: buildRecommendations({
        entryPaths,
        inferredLabels: inferredPaths.map(path => path.label),
        dataforgeLabels: dataforgePaths.map(path => path.label),
        dataforgeStatus,
        openingNarrative,
        strategyObservedAt,
        nowMs: Date.now(),
      }),
      dataforge: {
        provenance: dataforgeStatus ? { source: 'dataforge', observedAt: dataforgeStatus.observedAt } : null,
        status: dataforgeStatus,
      },
      marketMemory: {
        // GA-259 : la mémoire marché ne date pas ses observations (corpus
        // agrégé, jamais un fait daté). #3672 : mais elle porte la PÉRIODE
        // qu'elle couvre — sa fin date le fait (« Historique observé · le
        // 31 déc. 2024 ») au lieu de l'écrire « date inconnue » (recette prod
        // 06/10). Sans période portée : `null`, jamais une date devinée.
        provenance: {
          source: 'market_memory',
          observedAt: marketMemoryRead.status === 'ok' ? (marketMemoryRead.coverage.periodEnd ?? null) : null,
        },
        read: marketMemoryRead,
      },
      conflicts,
    }
  }
}

/**
 * #2116.17-24 — LES RECOMMANDATIONS, chacune avec ses HUIT métadonnées.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI HUIT, ET POURQUOI AUCUNE N'EST OPTIONNELLE
 * ─────────────────────────────────────────────────────────────────────────────
 * Une recommandation sans sa nature se lit comme un fait ; sans sa date, comme
 * une information d'aujourd'hui ; sans sa limite, comme une garantie. Les trois
 * se disent en rendez-vous, devant le client. Ce qui manque est donc NOMMÉ —
 * pas de date ⇒ `observedAt: null` et `freshness: 'undated'`, jamais un champ
 * absent ni une date devinée.
 *
 * ⚠️ LA CONFIANCE N'EST PAS UN POURCENTAGE. `corroborationCount` est un COMPTE
 * de sources concordantes que l'écran cite (« 2 sources concordantes ») ; le
 * niveau s'en DÉDUIT. Un « 78 % de confiance » est une probabilité déguisée,
 * refusée six fois (`c26_probabilite`).
 *
 * ⚠️ AUCUNE ACTION N'ENVOIE RIEN. Les quatre valeurs d'`action` ouvrent un
 * écran ou préparent un brouillon — « le copilote prépare, le commercial
 * envoie ». Ce fichier n'a aucun chemin d'écriture, et c'est ce qui le tient.
 */
function buildRecommendations(params: {
  entryPaths: AccountIntelligenceField<readonly AccountIntelligenceEntryPath[]>
  inferredLabels: readonly string[]
  dataforgeLabels: readonly string[]
  dataforgeStatus: AccountIntelligenceDataforgeStatus | null
  openingNarrative: string | null
  strategyObservedAt: string | null
  nowMs: number
}): AccountIntelligenceRecommendation[] {
  const { entryPaths, inferredLabels, dataforgeLabels, dataforgeStatus, openingNarrative, strategyObservedAt, nowMs } =
    params
  const recommendations: AccountIntelligenceRecommendation[] = []

  if (entryPaths.state === 'known') {
    const provenance = entryPaths.provenance
    // Une porte NOMMÉE par les deux côtés est corroborée. La comparaison est
    // faite sur le libellé replié en minuscules — rien de plus : deux
    // libellés proches ne sont PAS le même fait, et les rapprocher de force
    // fabriquerait une corroboration (le défaut de la jointure par le NOM).
    const inferred = new Set(inferredLabels.map(label => label.toLowerCase()))
    const dataforge = new Set(dataforgeLabels.map(label => label.toLowerCase()))

    entryPaths.value.forEach((path, index) => {
      const key = path.label.toLowerCase()
      const corroborationCount = (inferred.has(key) ? 1 : 0) + (dataforge.has(key) ? 1 : 0)
      recommendations.push({
        id: `entry-path-${index}`,
        label: path.label,
        detail: path.justification ?? path.targetProfile,
        // #2116.17 — ce que la porte EST. `dataforge` l'a OBSERVÉE sur un
        // corpus de parcours ; le modèle, lui, la DÉDUIT du dossier.
        nature: provenance.source === 'inference' ? 'inference' : 'observation',
        // #2116.18 + #2116.19 — la source qui a gagné l'arbitrage, et sa date.
        provenance,
        // #2116.20
        freshness: accountRecommendationFreshness(provenance.observedAt, nowMs),
        // #2116.21
        confidence: {
          level:
            corroborationCount >= 2 ? 'corroborated' : provenance.source === 'inference' ? 'deduced' : 'single_source',
          corroborationCount: corroborationCount > 0 ? corroborationCount : null,
        },
        // #2116.22 — une porte n'est pas un rendez-vous obtenu.
        limit: 'not_a_commitment',
        // #2116.23 — le geste le moins cher qui tranche.
        check: 'confirm_with_contact',
        // #2116.24 — OUVRE la liste des contacts. N'écrit rien, n'envoie rien.
        action: 'open_contacts',
      })
    })
  }

  // #2116.17 — LA STRATÉGIE NARRATIVE SANS PORTE NOMMÉE. Le pipeline actuel
  // écrit le plus souvent une prose (« Entrer par la DSI via… ») sans
  // structurer `entry_points` : `entryPaths.state` reste alors `unknown`
  // faute de `label`, et sans ce filet `recommendations` resterait vide sur
  // 25/25 comptes de prod (THALES compris) malgré un dossier qui PORTE une
  // lecture. `entryPaths.state === 'known'` couvre déjà ce cas quand une
  // porte est nommée (par DataForge ou par un `entry_points` structuré) —
  // ce bloc ne s'ajoute donc QUE quand aucune porte n'a gagné l'arbitrage.
  if (entryPaths.state !== 'known' && openingNarrative) {
    recommendations.push({
      id: 'opening-strategy',
      label: openingNarrative,
      detail: null,
      // Une narration N'EST PAS un fait observé sur un corpus de parcours
      // (contrairement à `nextAction`/`mainRisk`, ci-dessous) : c'est une
      // lecture du dossier par le modèle.
      nature: 'inference',
      provenance: { source: 'inference', observedAt: strategyObservedAt },
      freshness: accountRecommendationFreshness(strategyObservedAt, nowMs),
      // Une seule source, jamais corroborée : `corroborationCount: null`
      // nomme l'absence plutôt que d'écrire un `0` qui ressemblerait à un
      // compte de sources qui se contredisent.
      confidence: { level: 'deduced', corroborationCount: null },
      limit: 'not_a_commitment',
      check: 'confirm_with_contact',
      action: 'open_contacts',
    })
  }

  const nextAction = usefulText(dataforgeStatus?.nextAction)
  if (nextAction && dataforgeStatus) {
    recommendations.push({
      id: 'next-action',
      label: nextAction,
      detail: usefulText(dataforgeStatus.recommendedStrategy),
      nature: 'observation',
      provenance: { source: 'dataforge', observedAt: dataforgeStatus.observedAt },
      freshness: accountRecommendationFreshness(dataforgeStatus.observedAt, nowMs),
      confidence: { level: 'single_source', corroborationCount: 1 },
      // Ce que la mémoire marché sait d'un compte ne dit rien des autres
      // comptes du portefeuille : un taux de couverture mesure ce qu'on SAIT.
      limit: 'single_account_only',
      check: 'check_account_history',
      action: 'open_plan',
    })
  }

  const mainRisk = usefulText(dataforgeStatus?.mainRisk)
  if (mainRisk && dataforgeStatus) {
    recommendations.push({
      id: 'main-risk',
      label: mainRisk,
      detail: null,
      nature: 'observation',
      provenance: { source: 'dataforge', observedAt: dataforgeStatus.observedAt },
      freshness: accountRecommendationFreshness(dataforgeStatus.observedAt, nowMs),
      confidence: { level: 'single_source', corroborationCount: 1 },
      limit: 'dated_information',
      check: 'reread_the_source',
      action: 'open_sources',
    })
  }

  return recommendations
}
