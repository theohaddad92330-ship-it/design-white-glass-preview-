import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
  CLOSED_SUBMISSION_STAGES,
  NEED_OPEN_STATUSES,
  needStaffableNotRefusedSql,
  needStoredStatusesFor,
  NEED_STARTING_SOON_DAYS,
  needNextAction,
  needStillOpenSql,
  normaliseSpokenLanguages,
  type OpenNeedRow,
  type OpenNeedsCommercialAuditSignals,
  type OpenNeedsQuery,
  type OpenNeedsResponse,
  type PositionedConsultantFact,
  type RequiredSkill,
  type ReverseProspectMatch,
  type ReverseProspectsResult,
} from '@bellum/contracts'

// #2067.25-.29 — les étapes CLOSES, en SQL. Dérivées de `CLOSED_SUBMISSION_STAGES`
// (GA-26 : une seule source) plutôt que recopiées : un enum qui gagnerait une
// étape close ici sans gagner là-bas ferait mentir « autres processus en cours ».
const CLOSED_SUBMISSION_STAGES_SQL = CLOSED_SUBMISSION_STAGES.map(stage => `'${stage}'`).join(', ')
import { ProjectNeedEntity } from '../../database/entities/project-need.entity'
import { NEED_STALE_AFTER_DAYS } from '../briefing/briefing-actions'
import { NEED_REVERSE_PROSPECTS_MAX, rankReverseProspects, sharedSkillTerms } from './reverse-need-prospects'
// #2035.10 / #2035.11 — fusionné le 21/09, deux implémentations concurrentes :
// le plafond de besoins ouverts vit désormais dans le module `workspace`, à
// UN seul endroit (GA-26), sur la table de production.
import { WorkspaceCommercialLoadSettingsService } from '../workspace/workspace-commercial-load-settings.service'
import { sortByCommercialLoad } from './commercial-load-priority'

/** La ligne brute que lit la requête de RÉFÉRENCE — le besoin sur lequel le
 *  croisement se lance. */
type ReferenceRow = {
  id: string
  location: string | null
  skills: RequiredSkill[] | null
  account_id: string
}

/** La ligne brute d'un CANDIDAT — un autre besoin, sur un autre compte,
 *  ouvert, sur la même zone, partageant au moins une compétence. */
type CandidateRow = {
  id: string
  title: string | null
  skills: RequiredSkill[] | null
  project_id: string
  project_label: string | null
  account_id: string
  account_name: string | null
  location: string | null
  assigned_to: string | null
}

/**
 * #2872 (reste, constat PRODUCTION 27/09 18:18) — voir le docblock sur
 * `query.q` dans `list()` : les mots qu'une QUESTION posée à Laura porte
 * toujours, et qui ne décrivent jamais un besoin réel. Grammaticaux (FR + EN),
 * plus les verbes de la recherche elle-même (« cherche », « trouve »,
 * « liste »…) — même famille que `trouve`/`trouver`, déjà exclus par
 * `STOP_WORDS` (`apps/web/.../product-index.ts`) pour la même raison. Liste
 * tenue ICI, pas partagée avec `STOP_WORDS` ni `STOPWORDS`
 * (`discover-needs-freetext.ts`) : les deux existantes filtrent un texte
 * affiché côté web (nav, rail Discover) — celle-ci filtre les termes d'une
 * requête SQL côté API. Pas le même réglage (GA-26 borne un réglage, pas un
 * mot qui se répète ailleurs pour une autre raison).
 */
const OPEN_NEEDS_QUERY_STOPWORDS: ReadonlySet<string> = new Set([
  // Déterminants, prépositions, pronoms, conjonctions, interrogatifs — FR.
  'le',
  'la',
  'les',
  'l',
  'un',
  'une',
  'des',
  'du',
  'de',
  'd',
  'et',
  'ou',
  'mais',
  'donc',
  'ni',
  'car',
  'que',
  'qu',
  'qui',
  'quoi',
  'quel',
  'quels',
  'quelle',
  'quelles',
  'combien',
  'comment',
  'pourquoi',
  'dans',
  'en',
  'sur',
  'pour',
  'avec',
  'chez',
  'a',
  'au',
  'aux',
  'ce',
  'cet',
  'cette',
  'ces',
  'mon',
  'ma',
  'mes',
  'ton',
  'ta',
  'tes',
  'son',
  'sa',
  'ses',
  'notre',
  'nos',
  'votre',
  'vos',
  'leur',
  'leurs',
  'je',
  'tu',
  'il',
  'elle',
  'on',
  'nous',
  'vous',
  'ils',
  'elles',
  'y',
  'se',
  'est',
  'sont',
  'ont',
  'avoir',
  'etre',
  // Le verbe/nom de la RECHERCHE elle-même — jamais un critère du besoin.
  // « besoins »/« ouverts »/« demandent » sont les trois mots du constat du
  // 27/09 (« Quels besoins ouverts demandent du Java ? »).
  'besoin',
  'besoins',
  'ouvert',
  'ouverte',
  'ouverts',
  'ouvertes',
  'actif',
  'active',
  'actifs',
  'actives',
  'demande',
  'demandes',
  'demandent',
  'demander',
  'demandant',
  'cherche',
  'cherchent',
  'chercher',
  'cherchant',
  'recherche',
  'recherchent',
  'rechercher',
  'recherchant',
  'recherches',
  'trouve',
  'trouvent',
  'trouver',
  'montre',
  'montrent',
  'montrer',
  'affiche',
  'affichent',
  'afficher',
  'liste',
  'listent',
  'lister',
  'listes',
  'mentionne',
  'mentionnent',
  'mentionner',
  'mentionnant',
  'consultable',
  'consultables',
  // Déterminants, prépositions, auxiliaires, interrogatifs — EN.
  'the',
  'an',
  'of',
  'in',
  'is',
  'are',
  'do',
  'does',
  'what',
  'which',
  'how',
  'find',
  'my',
  'open',
  'needs',
  'mention',
  'mentioning',
])

const DIACRITICS_RE = /\p{Diacritic}/gu

/** Insensible à la casse ET aux accents, même repli que `fold` (`product-index.ts`) :
 *  « Où » et « ou » doivent tomber sous la même entrée de la liste. */
function foldOpenNeedsQueryTerm(term: string): string {
  return term.normalize('NFD').replace(DIACRITICS_RE, '').toLowerCase()
}

/**
 * « Tous les rôles que tes clients cherchent en ce moment » (PDF 2 §7.5,
 * ticket BEL-CRM-101).
 *
 * Une vue TRANSVERSE, tous comptes confondus. C'est le point : les besoins
 * étaient enterrés dans le tiroir de chaque projet, si bien qu'un recruteur
 * devait ouvrir compte par compte pour savoir sur quoi travailler — donc il
 * travaillait sur ce qu'il avait sous les yeux, pas sur ce qui était urgent.
 *
 * La pagination est SERVEUR : cinq cents besoins ouverts n'ont pas à traverser
 * le réseau pour qu'on en affiche cinquante. Le compteur de shortlist se calcule
 * dans la même requête, en LATERAL, plutôt qu'en N+1 — sur cinquante lignes,
 * cinquante allers-retours transforment un écran en attente.
 */
/**
 * Théo C projects-besoins.A8 — « Périmé — à revérifier ». UN seul prédicat : celui de la routine
 * des besoins sans shortlist (`needsWithoutShortlistSql`) et du verdict du besoin — ouvert, non refusé
 * à la porte G3, plus vieux que `NEED_STALE_AFTER_DAYS`, sans shortlist.
 */
function needStaleSql(alias: string): string {
  return `(${needStillOpenSql(`${alias}.status`)} AND ${needStaffableNotRefusedSql(`${alias}.staffable`)} AND ${alias}.created_at < now() - interval '${NEED_STALE_AFTER_DAYS} days' AND NOT EXISTS (SELECT 1 FROM shortlists s WHERE s.need_id = ${alias}.id))`
}

@Injectable()
export class OpenNeedsService {
  constructor(
    @InjectRepository(ProjectNeedEntity)
    private readonly needs: Repository<ProjectNeedEntity>,
    // #2035.11 — le plafond de charge commerciale par porteur.
    private readonly commercialLoadSettings: WorkspaceCommercialLoadSettingsService,
  ) {}

  /**
   * #2842 (reste, 26/09) — épopée #2074.13-.19, tranché sans Louis : les deux
   * signaux `clientNeeds`/`needDetailing` de `CommercialTensionExternalSignals`
   * (voisin `tension-detectors.ts`). Comptés sur les MÊMES besoins ouverts et
   * non archivés que `list()` (GA-26), jamais une seconde population — mais en
   * UNE requête à part, plutôt que dans `openNeedsCountersSchema` : cet écran
   * (`/settings/profile/audit`) ne charge jamais la liste paginée.
   *
   * « Qualifié » = le statut `qualified` littéral, jamais un statut en aval
   * (`to_match`, `matching`…) qui l'a pourtant déjà traversé — la décision la
   * plus simple, écrite pour être relue si elle doit changer. « Réduit à un
   * intitulé » = aucune compétence, aucune séniorité, aucune localisation,
   * aucune date de démarrage : ni contexte, ni contrainte, ni échéance —
   * exactement ce que `detectNeedReducedToTitle` reproche.
   */
  async commercialAuditSignals(workspaceId: string): Promise<OpenNeedsCommercialAuditSignals> {
    const openSql = needStillOpenSql('need.status')
    const raw = await this.needs
      .createQueryBuilder('need')
      .select(`COUNT(*) FILTER (WHERE ${openSql})`, 'total')
      .addSelect(`COUNT(*) FILTER (WHERE ${openSql} AND need.status = 'qualified')`, 'qualified')
      .addSelect(
        `COUNT(*) FILTER (WHERE ${openSql}
          AND jsonb_array_length(need.skills) = 0
          AND need.seniority IS NULL
          AND need.location IS NULL
          AND need.start_on IS NULL)`,
        'with_only_a_title',
      )
      .where('need.workspace_id = :workspaceId', { workspaceId })
      .andWhere('need.archived_at IS NULL')
      .getRawOne<{ total: string; qualified: string; with_only_a_title: string }>()

    const total = Number(raw?.total ?? 0)
    return {
      clientNeeds: { total, qualified: Number(raw?.qualified ?? 0) },
      needDetailing: { total, withOnlyATitle: Number(raw?.with_only_a_title ?? 0) },
    }
  }

  async list(
    workspaceId: string,
    query: OpenNeedsQuery,
    /**
     * #4016 L11 — une SÉLECTION par identité (l'export de masse). Comme `id`,
     * elle annule les replis de la vue (« seulement l'ouvert », « pas
     * archivé ») : ce qu'on a coché s'exporte tel quel. Le workspace, lui,
     * filtre toujours — c'est la garde qui compte.
     */
    scope: { needIds?: readonly string[] } = {},
  ): Promise<OpenNeedsResponse> {
    const selection = scope.needIds && scope.needIds.length > 0 ? [...scope.needIds] : null
    const qb = this.needs
      .createQueryBuilder('need')
      /**
       * #2558.1 — un besoin existe sans projet.
       *
       * ⚠️ LEFT, et c'est tout l'enjeu du lot : en INNER, un besoin dont
       * `project_id` est nul disparaissait purement et simplement du board —
       * pas d'erreur, pas de ligne, rien à voir en CI. La majorité des
       * missions d'ESN ne produisent aucun signal public et n'ont donc pas de
       * projet (retour bêta du 17/09/2026) : c'est le cas NORMAL, pas le cas
       * limite.
       *
       * ⚠️ Et le COMPTE se rejoint désormais par `need.account_id`, PAS par
       * `project.account_id` : sinon le compte s'en irait avec le projet, et
       * un besoin sans projet serait un besoin sans compte — joignable par
       * personne, invisible partout.
       */
      .leftJoin('opportunities', 'project', 'project.id = need.project_id')
      .leftJoin('accounts', 'account', 'account.id = need.account_id')
      .leftJoin('account_entities', 'entity', 'entity.id = project.entity_id')
      .where('need.workspace_id = :workspaceId', { workspaceId })

    /**
     * UN besoin, par son identité — la lecture qui porte sa FICHE.
     *
     * ⚠️ Elle passe par le MÊME `SELECT` que la liste, et c'est tout l'intérêt :
     * la fiche montre exactement la ligne du tableau. Une requête séparée
     * referait `shortlist_count`, l'âge d'étape et la jointure au compte une
     * seconde fois, et les deux finiraient par diverger sur le même besoin.
     *
     * ⚠️ Elle ANNULE aussi le repli « seulement ce qui est ouvert » : un lien
     * vers un besoin clos doit s'ouvrir, pas rendre « introuvable ». Le défaut
     * de la liste décrit ce qu'on montre quand on ne demande rien de précis ; il
     * ne dit rien de ce qu'on a le droit de lire. Le workspace, lui, filtre
     * toujours — c'est la garde qui compte.
     */
    if (query.id) qb.andWhere('need.id = :needId', { needId: query.id })
    if (selection) qb.andWhere('need.id IN (:...selectedNeedIds)', { selectedNeedIds: selection })

    // ⚠️ Les deux conditions de STATUT ne sont plus posées ici : elles le sont
    // plus bas, APRÈS le clone qui sert à compter les issues (gagnés / perdus /
    // annulés). Les laisser ici ferait compter « les gagnés parmi les ouverts »,
    // donc zéro — et un taux de conversion de 0 % qui n'aurait rien mesuré.
    if (query.urgency) qb.andWhere('need.urgency = :urgency', { urgency: query.urgency })
    if (query.contract_kind) qb.andWhere('need.contract_kind = :contractKind', { contractKind: query.contract_kind })
    // L'ORIGINE (§7.2). `need.source` était sélectionnée et rendue sur chaque
    // ligne depuis le premier jour ; aucun critère ne permettait de s'en servir.
    // Égalité stricte, et jamais de `IS NULL` implicite : un besoin dont
    // personne n'a dit l'origine ne ressemble à aucune des douze valeurs.
    if (query.source) qb.andWhere('need.source = :source', { source: query.source })
    // #2558.1 — le compte du BESOIN, pas celui de son projet : filtrer par
    // `project.account_id` laisserait dehors tous les besoins sans projet du
    // compte qu'on regarde.
    if (query.account_id) qb.andWhere('need.account_id = :accountId', { accountId: query.account_id })
    if (query.seniority) qb.andWhere('need.seniority ILIKE :seniority', { seniority: `%${query.seniority}%` })
    if (query.location) qb.andWhere('need.location ILIKE :location', { location: `%${query.location}%` })
    // #2872 — « propose un consultant pour Développeur Java/Spring Boot »
    // (`find_needs`, `apps/ia/app/services/chat_tools.py`) répondait « aucun
    // besoin correspondant trouvé » sur un besoin pourtant OUVERT et visible
    // sur `/projects/needs`. Un SEUL `ILIKE` sur la phrase entière exigeait
    // qu'un besoin en base porte EXACTEMENT ce texte — ponctuation et espaces
    // compris — dans son titre, le libellé de l'affaire ou le nom du compte ;
    // il ne cherchait JAMAIS les compétences, alors que l'outil `find_needs`
    // promet lui-même une recherche « par libellé, COMPÉTENCE ou nom de
    // compte » (FIND_NEEDS_TOOL) — un rôle+stack ne matche presque jamais un
    // titre mot pour mot. Chaque MOT (coupé sur l'espace ET la ponctuation,
    // donc « Java/Spring » devient deux termes) doit se retrouver quelque
    // part — titre, affaire, compte OU une compétence — indépendamment de
    // l'ordre ou de l'espacement d'origine.
    //
    // #2872 (reste, constat PRODUCTION 27/09 18:18) — le découpage ci-dessus
    // répare bien la recherche par RÔLE+STACK, mais `query` n'est pas un
    // mot-clé nettoyé : c'est la QUESTION posée à Laura, telle quelle
    // (`FIND_NEEDS_TOOL` ne promet qu'un « libellé, compétence ou nom de
    // compte », mais rien ne l'impose côté modèle). « Quels besoins ouverts
    // demandent du Java ? » se découpait en six mots, et CHAQUE mot restait
    // EXIGÉ (AND, un `andWhere` par terme) : « du » (grammatical) et
    // « besoins »/« ouverts »/« demandent » (ils décrivent la RECHERCHE
    // elle-même, jamais un besoin réel) ne se retrouvent dans AUCUN titre,
    // AUCUNE compétence, AUCUN nom de compte — un seul de ces mots dans la
    // phrase suffisait à vider le résultat, alors que le besoin LVMH cherché
    // portait bien « Java » dans ses compétences. On filtre donc ces mots
    // AVANT de poser un terme, plutôt que d'exiger un texte libre déjà
    // nettoyé — même motif que `STOP_WORDS` (`product-index.ts`, qui exclut
    // déjà « trouve »/« trouver » pour cette même raison) et `STOPWORDS`
    // (`discover-needs-freetext.ts`) ; liste tenue ICI et non partagée avec
    // elles : les deux existantes filtrent un texte affiché côté web (nav,
    // rail Discover), celle-ci filtre les termes d'une requête SQL côté API —
    // pas le même réglage (GA-26 borne un réglage, pas un mot qui se répète).
    if (query.q) {
      const terms = query.q
        .split(/[^\p{L}\p{N}]+/u)
        .map(term => term.trim())
        .filter(Boolean)
        .filter(term => !OPEN_NEEDS_QUERY_STOPWORDS.has(foldOpenNeedsQueryTerm(term)))
      terms.forEach((term, index) => {
        const param = `qTerm${index}`
        qb.andWhere(
          `(need.title ILIKE :${param} OR project.label ILIKE :${param} OR account.company_name ILIKE :${param} ` +
            `OR EXISTS (SELECT 1 FROM jsonb_array_elements(need.skills) s WHERE s->>'term' ILIKE :${param}))`,
          { [param]: `%${term}%` },
        )
      })
    }
    // La compétence se cherche DANS le tableau typé, pas dans une chaîne : un
    // `ILIKE` sur le JSON entier ferait matcher « Java » sur « JavaScript ».
    if (query.skill) {
      qb.andWhere(`EXISTS (SELECT 1 FROM jsonb_array_elements(need.skills) s WHERE s->>'term' ILIKE :skill)`, {
        skill: `%${query.skill}%`,
      })
    }
    if (query.starting_within_days) {
      qb.andWhere(`need.start_on IS NOT NULL AND need.start_on <= (now() + (:days || ' days')::interval)`, {
        days: String(query.starting_within_days),
      })
    }
    if (query.deadline_passed) qb.andWhere('need.deadline_at IS NOT NULL AND need.deadline_at < now()')
    if (query.stale) qb.andWhere(needStaleSql('need'))
    if (query.without_shortlist) {
      qb.andWhere(`NOT EXISTS (SELECT 1 FROM submissions sub WHERE sub.need_id = need.id)`)
    }
    // #2173.15 — la vue rapide « Entretiens » : au moins un positionnement au
    // stade `interview`. Composable, comme `deadline_passed` : ce n'est pas un
    // statut du BESOIN, qui garde le sien pendant qu'un positionnement avance.
    if (query.with_interview) {
      qb.andWhere(`EXISTS (SELECT 1 FROM submissions sub WHERE sub.need_id = need.id AND sub.stage = 'interview')`)
    }
    // #2173.9 — le geste du compteur « À clôturer » : un positionnement
    // `accepted` sur un besoin encore ouvert — le signal qu'il manque un geste,
    // pas une décision déjà prise par le serveur.
    if (query.ready_to_close) {
      qb.andWhere(`EXISTS (SELECT 1 FROM submissions sub WHERE sub.need_id = need.id AND sub.stage = 'accepted')`)
    }
    // #2173.49 — ARCHIVÉ n'est pas un statut : ce filtre est POSÉ toujours, et
    // c'est un point différent des autres critères ci-dessus — la valeur par
    // défaut (« pas archivé ») s'applique même quand rien d'autre n'est
    // demandé, exactement comme le workspace juste au-dessus. Un besoin rangé
    // ne doit JAMAIS réapparaître dans « Besoins ouverts » sous prétexte qu'il
    // garde un statut ouvert — c'est tout le point du rangement neutre.
    if (!selection) qb.andWhere(query.archived ? 'need.archived_at IS NOT NULL' : 'need.archived_at IS NULL')

    /**
     * LES ISSUES — gagnés, perdus, annulés — comptées AVANT que le filtre de
     * statut ne s'applique (31/08/2026).
     *
     * Ce clone est pris ICI, et l'ordre n'est pas un détail : les conditions de
     * statut sont posées juste en dessous, et un clone pris après elles
     * compterait « les besoins gagnés parmi les besoins ouverts », c'est-à-dire
     * zéro. Le rail afficherait alors « 0 % de conversion » — faux, et
     * rassurant à tort dans le mauvais sens.
     *
     * Tout le RESTE du filtre est conservé : compte, compétence, zone,
     * recherche. Le taux répond donc à « sur ce que je regarde », comme les
     * cinq compteurs de tête, et non à « sur tout l'espace » — deux réponses
     * différentes sous le même écran seraient pires qu'une seule imparfaite.
     */
    const outcomesBase = qb.clone()

    // Par défaut, l'écran ne montre que ce qui est OUVERT — c'est son nom. Les
    // valeurs héritées (`open`) sont dans la liste : une ligne écrite juste
    // avant la reprise ne doit pas disparaître de la vue.
    //
    // #2173.17 — la vue rapide « Perdus / clôturés » contourne ce défaut,
    // exactement comme `status` le fait déjà : un besoin perdu n'est par
    // définition plus ouvert.
    //
    // #2173.49 — la vue « Archivés » le contourne aussi : un besoin rangé peut
    // porter n'importe quel statut, ouvert ou clos — c'est le point du
    // rangement NEUTRE, il ne présuppose rien sur l'avancement.
    if (
      !query.id &&
      !selection &&
      !query.include_closed &&
      !query.status &&
      !query.theo_status &&
      !query.closed_lost_or_cancelled &&
      !query.archived
    ) {
      qb.andWhere('need.status IN (:...openStatuses)', { openStatuses: NEED_OPEN_STATUSES })
    }
    if (query.status) qb.andWhere('need.status = :status', { status: query.status })
    // Théo C projects-besoins.R3 — le statut affiché, traduit en états stockés (contrats).
    if (query.theo_status) {
      qb.andWhere('need.status IN (:...theoStatuses)', { theoStatuses: [...needStoredStatusesFor(query.theo_status)] })
    }
    if (query.closed_lost_or_cancelled) {
      // Regroupées pour l'AFFICHAGE seulement — `lost` et `cancelled` restent
      // deux compteurs distincts partout où un TAUX se calcule
      // (`needConversionRate`), cette vue ne fait que les montrer côte à côte.
      // GA-62 permet de nommer UN statut à la fois : deux prédicats à un seul
      // littéral chacun, jamais une liste recopiée à la main.
      qb.andWhere(`(need.status = 'lost' OR need.status = 'cancelled')`)
    }

    const total = await qb.clone().getCount()

    // Les cinq compteurs de tête (I-33), sur l'ENSEMBLE du filtre et jamais sur
    // la page : un « 3 urgents » calculé sur la première page de cinq
    // diminuerait en tournant les pages, ce qui est pire que pas de compteur.
    //
    // Cinq `getCount()` et non un `COUNT(*) FILTER` unique : le constructeur de
    // requête clone les JOINTURES et les conditions déjà posées, si bien que
    // chaque compteur porte EXACTEMENT le même filtre que la liste. Un SQL brut
    // écrit à côté finirait par diverger d'une condition, et le compteur
    // dirait alors autre chose que le tableau qu'il surmonte.
    const [withoutShortlist, deadlinePassed, startingSoon, notStaffable, withInterview, readyToClose] =
      await Promise.all([
        qb.clone().andWhere(`NOT EXISTS (SELECT 1 FROM submissions sub WHERE sub.need_id = need.id)`).getCount(),
        qb.clone().andWhere('need.deadline_at IS NOT NULL AND need.deadline_at < now()').getCount(),
        qb
          .clone()
          .andWhere(`need.start_on IS NOT NULL AND need.start_on <= (now() + (:soonDays || ' days')::interval)`, {
            soonDays: String(NEED_STARTING_SOON_DAYS),
          })
          .getCount(),
        qb.clone().andWhere(`need.staffable = 'no'`).getCount(),
        // #2173.8 — « Avec entretien », sur le MÊME filtre que la liste.
        qb
          .clone()
          .andWhere(`EXISTS (SELECT 1 FROM submissions sub WHERE sub.need_id = need.id AND sub.stage = 'interview')`)
          .getCount(),
        // #2173.9 — « À clôturer », idem.
        qb
          .clone()
          .andWhere(`EXISTS (SELECT 1 FROM submissions sub WHERE sub.need_id = need.id AND sub.stage = 'accepted')`)
          .getCount(),
      ])

    /**
     * Trois issues, trois `getCount()` — jamais un `COUNT(*) FILTER` unique,
     * pour la même raison que les cinq compteurs ci-dessus : le constructeur de
     * requête clone les jointures et les conditions déjà posées, donc chaque
     * compteur porte EXACTEMENT le filtre de la liste (moins le statut).
     *
     * Chaque prédicat ne nomme QU'UN statut — nommer une issue n'est pas
     * redéfinir un ensemble (GA-62). Les réunir en un seul compteur « clos »
     * aurait fusionné `lost` et `cancelled`, ce que le contrat refuse : un
     * besoin annulé chez nous n'est pas un besoin perdu chez le client.
     */
    const [won, lost, cancelled] = await Promise.all([
      outcomesBase.clone().andWhere(`need.status = 'won'`).getCount(),
      outcomesBase.clone().andWhere(`need.status = 'lost'`).getCount(),
      outcomesBase.clone().andWhere(`need.status = 'cancelled'`).getCount(),
    ])

    qb.select([
      'need.id AS id',
      'need.title AS title',
      'need.urgency AS urgency',
      'need.skills AS skills',
      'need.seniority AS seniority',
      'need.headcount AS headcount',
      'need.target_tjm_cents AS target_tjm_cents',
      'need.start_on AS start_on',
      'need.duration_months AS duration_months',
      'need.location AS location',
      // #2173.29 — LE TÉLÉTRAVAIL. Colonne posée par la migration
      // `1789759782176-NeedRemote.ts`, `null` = non renseigné.
      'need.remote AS remote',
      'need.contract_kind AS contract_kind',
      // X66 / #3547 — le forfait encadré, lu sur la fiche du besoin.
      'need.delivery_mode AS delivery_mode',
      'need.supervision_role AS supervision_role',
      'need.client_team_size AS client_team_size',
      'need.client_team_names AS client_team_names',
      'need.deadline_at AS deadline_at',
      // #2173.49 — ARCHIVÉ, jamais un statut. `null` = actif.
      'need.archived_at AS archived_at',
      'need.status AS status',
      'need.status_reason AS status_reason',
      // #3389.13 — `to_char` : pg rendrait un `Date` JS décalé par le fuseau.
      "to_char(need.resume_on, 'YYYY-MM-DD') AS resume_on",
      // L'ÂGE DANS L'ÉTAPE (colonne n°12 de la source). La colonne existait en
      // base et était écrite à chaque transition — elle n'était sélectionnée
      // par aucune requête, donc « qu'est-ce qui est bloqué en qualification
      // depuis trois semaines ? » n'avait aucune réponse à l'écran.
      'need.status_changed_at AS status_changed_at',
      'need.source AS source',
      'need.provenance AS provenance',
      'need.owner_id AS owner_id',
      'need.is_private AS is_private',
      // #2175.8 — L'INTERLOCUTEUR. `contact_id` existe en base et sur
      // `ProjectNeed` (« le DEMANDEUR, la personne qui a exprimé le besoin »)
      // depuis longtemps ; `OpenNeedRow` ne le portait pas, donc la fiche du
      // besoin (`NeedDetailPage.tsx`) ne pouvait jamais le nommer. Le nom est
      // lu SUR LA MÊME requête (sous-requête scalaire, même patron que
      // `positioned_consultant` plus bas) : un aller-retour par besoin
      // transformerait la liste en cascade réseau.
      'need.contact_id AS contact_id',
      `(SELECT con.full_name FROM contacts con WHERE con.id = need.contact_id) AS contact_name`,
      // #2939 (#2174.33) — LE DÉCIDEUR, même patron que l'interlocuteur juste
      // au-dessus : le nom se lit par jointure, jamais un second calcul.
      'need.decision_maker_contact_id AS decision_maker_contact_id',
      `(SELECT dm.full_name FROM contacts dm WHERE dm.id = need.decision_maker_contact_id) AS decision_maker_name`,
      'need.staffable AS staffable',
      'need.staffable_reason AS staffable_reason',
      // CE QUE LE BESOIN EXIGE, ET CE QU'IL RACONTE. Huit colonnes qui
      // existaient en base, que `projectNeedSchema` déclarait, et qu'AUCUNE
      // requête ne sélectionnait : le « Résumé : contexte et objectifs » du
      // §3.3 avait son champ et aucun chemin vers l'écran, et les deux axes du
      // rapprochement qui lisent `languages`/`clearances` tournaient sur du
      // vide — dont l'axe 12, qui est BLOQUANT.
      'need.languages AS languages',
      'need.clearances AS clearances',
      'need.context AS context',
      'need.expertise AS expertise',
      'need.stack AS stack',
      'need.constraints AS constraints',
      'need.presentation_process AS presentation_process',
      // Import universel (27/09/2026) — les colonnes du fichier sans champ d'accueil.
      'need.extra AS extra',
      // #2939 (#2174.32/.34) — comment le client décide, et les achats.
      'need.decision_process AS decision_process',
      'need.procurement_involvement AS procurement_involvement',
      'need.profile_type_agreement AS profile_type_agreement',
      // #3409.2 — la NATURE du besoin. Colonne écrite depuis le 26/09
      // (`changeNeedConvergenceState`) mais jamais lue par cette requête : la
      // fiche ne pouvait ni l'afficher ni proposer de la faire changer.
      'need.convergence_state AS convergence_state',
      'need.budget_cents AS budget_cents',
      'need.min_tjm_cents AS min_tjm_cents',
      // #2323.38-.42 — les quatre champs du moteur de contradictions
      // (`need-contradictions.ts`). Même patron que les huit colonnes
      // juste au-dessus : existaient en base, jamais sélectionnées.
      'need.interview_rounds AS interview_rounds',
      'need.onsite_days_per_week AS onsite_days_per_week',
      'need.freelance_excluded AS freelance_excluded',
      'need.budget_validated AS budget_validated',
      'project.id AS project_id',
      'project.label AS project_label',
      'project.stage AS project_stage',
      // #2175.12 — « RÉSULTAT ATTENDU » DE LA SYNTHÈSE. `objective`
      // (`ProjectRow.objective`, project.ts) est « CE QU'ON CHERCHE À
      // OBTENIR », écrit à la conversion d'une piste — exactement le champ
      // demandé, déjà réel, déjà joint via `project` (compte et libellé
      // ci-dessus). Jamais un second calcul : on relit le texte tel quel
      // (GA-26), comme `project_label` juste au-dessus.
      'project.objective AS project_objective',
      // #2558.1 — le compte vient de la COLONNE DU BESOIN. `account.id`
      // repasserait par la jointure, donc par le projet, donc par ce qu'on
      // vient justement de rendre facultatif.
      'need.account_id AS account_id',
      'account.company_name AS account_name',
      // LE LOGO RÉEL du compte — `accounts.logo_url`, servi par notre origine
      // (`GET /logo`). La carte du kanban retombait sur l'initiale pour TOUS les
      // comptes parce que la ligne ne portait aucune URL : l'initiale était le
      // repli permanent d'une donnée jamais demandée.
      //
      // ⚠️ Le SITE n'est PAS sélectionné, et c'est le point. `companyLogoSrc`
      // sait fabriquer une seconde piste à partir du domaine (le favicon
      // réellement servi) ; sur cette carte on ne veut QUE le logo persisté ou
      // l'initiale. Un favicon déduit d'un domaine est une image DEVINÉE, et
      // trente cartes qui affichent trente favicons approximatifs se lisent
      // comme trente identités visuelles fausses.
      'account.logo_url AS account_logo_url',
      'entity.id AS entity_id',
      'entity.name AS entity_name',
      `(SELECT COUNT(*) FROM submissions sub WHERE sub.need_id = need.id) AS shortlist_count`,
      `${needStaleSql('need')} AS stale`,
      // Théo C projects-besoins — la page d'origine de l'offre qui a fait naître le besoin (proposition acceptée).
      `(SELECT np.source_url FROM need_proposals np WHERE np.created_need_id = need.id AND np.source_url IS NOT NULL ORDER BY np.detected_at DESC NULLS LAST LIMIT 1) AS source_url`,
      /**
       * LES MISSIONS NÉES DE CE BESOIN, et celles dont on ne sait pas d'où
       * elles viennent (31/08/2026, colonne `missions.need_id`).
       *
       * Deux sous-requêtes et non une : le compte seul mentirait. Une mission
       * créée AVANT ce lien ne porte pas de `need_id` et rien ne peut le
       * deviner pour elle — sur un besoin dont l'affaire porte de telles
       * missions, « 0 mission attribuée » affirmerait ce qu'on ne sait pas.
       * Le second compte est ce qui permet à l'écran de dire la vraie phrase.
       *
       * Le prédicat ne nomme AUCUN statut de mission : une mission terminée est
       * née de ce besoin autant qu'une mission active, et l'exclure ferait
       * retomber le compteur à zéro le jour où la mission s'achève.
       */
      `(SELECT COUNT(*) FROM missions m WHERE m.need_id = need.id) AS missions_assigned`,
      `(SELECT COUNT(*) FROM missions m WHERE m.opportunity_id = need.project_id AND m.need_id IS NULL)
         AS project_missions_unlinked`,
      // #2067.21 / #2067.22 — LA DÉCISION ET LA VOIE D'ACHAT du rail CLIENT.
      // `project` (opportunities) est déjà joint ci-dessus pour le compte et le
      // libellé : la présence du texte sur l'axe BTMMP se lit SANS colonne
      // neuve en base. Jamais le texte lui-même (`BtmmpPanel.tsx` le porte
      // déjà) — seulement sa présence, comme `pilotage.service.ts` le fait
      // pour `btmmpCompleteness`.
      `(COALESCE(btrim(project.btmmp->>'management'), '') <> '') AS decision_known`,
      `(COALESCE(btrim(project.btmmp->>'process'), '') <> '') AS buying_process_known`,
      /**
       * #2067.25-.29 — LE RAIL CONSULTANT, PORTÉ PAR LE POSITIONNÉ. DÉCISION
       * Louis 17/09 après-midi : voir le docblock de `positioned_consultant`
       * dans `open-needs.ts`. `submitted_at IS NOT NULL` est LA condition — un
       * simple shortlisté n'est pas positionné, le client n'a encore rien reçu.
       * Le plus RÉCEMMENT soumis quand il y en a plusieurs ; le compte total
       * voisin permet à l'écran de dire « et N autres » plutôt que de les
       * cacher. Chaque fait est relu tel quel (`pushable_score`,
       * `availability`, `proposed_rate_cents`, `mobility_zones` /
       * `remote_preference`) — rien n'est recalculé, donc rien ne reclasse
       * personne (doctrine c58_criteres_proteges).
       */
      `(
         SELECT json_build_object(
           'submissionId', sub.id,
           'consultantId', sub.consultant_id,
           'consultantName', c.full_name,
           'submittedAt', sub.submitted_at,
           'fitScore', sub.pushable_score,
           'availability', c.availability,
           'proposedRateCents', sub.proposed_rate_cents,
           'mobilityKnown',
             (c.mobility_zones IS NOT NULL AND array_length(c.mobility_zones, 1) > 0)
             OR c.remote_preference IS NOT NULL,
           'otherActiveSubmissions', (
             SELECT COUNT(*) FROM submissions os
             WHERE os.consultant_id = sub.consultant_id
               AND os.id <> sub.id
               AND os.stage NOT IN (${CLOSED_SUBMISSION_STAGES_SQL})
           ),
           -- #2175.29 (épopée #2880) — l'accord réel : TJM ET CV validés par
           -- un GESTE (#2948), jamais déduits.
           'agreementConfirmed',
             c.tjm_validated_at IS NOT NULL AND c.cv_validated_at IS NOT NULL
         )
         FROM submissions sub
         JOIN consultants c ON c.id = sub.consultant_id
         WHERE sub.need_id = need.id AND sub.submitted_at IS NOT NULL
         ORDER BY sub.submitted_at DESC
         LIMIT 1
       ) AS positioned_consultant`,
      `(
         SELECT COUNT(*) FROM submissions sub3
         WHERE sub3.need_id = need.id AND sub3.submitted_at IS NOT NULL
       ) AS positioned_consultants_count`,
    ])
      // Le tri par DEADLINE d'abord, et les besoins sans date à la fin : c'est
      // l'ordre dans lequel un recruteur veut lire sa journée. `NULLS LAST` est
      // indispensable — sans lui, Postgres remonte les besoins sans échéance en
      // tête et enterre exactement ceux qui pressent.
      .orderBy('need.deadline_at', 'ASC', 'NULLS LAST')
      .addOrderBy('need.created_at', 'DESC')
      .offset(query.offset)
      .limit(query.limit)

    const rows = await qb.getRawMany<Record<string, unknown>>()
    const data: OpenNeedRow[] = rows
      .map(row => ({
        id: String(row['id']),
        title: String(row['title'] ?? ''),
        urgency: (row['urgency'] as OpenNeedRow['urgency']) ?? null,
        skills: Array.isArray(row['skills']) ? (row['skills'] as OpenNeedRow['skills']) : [],
        seniority: (row['seniority'] as string | null) ?? null,
        headcount: Number(row['headcount'] ?? 1),
        // `bigint` revient en CHAÎNE du pilote pg. `Number(null)` vaut 0, ce qui
        // afficherait « 0 € » sur un TJM que personne n'a communiqué.
        target_tjm_cents: row['target_tjm_cents'] == null ? null : Number(row['target_tjm_cents']),
        start_on: toIsoOrNull(row['start_on']),
        duration_months: row['duration_months'] == null ? null : Number(row['duration_months']),
        location: (row['location'] as string | null) ?? null,
        // #2173.29 — `null` reste `null` : non renseigné n'est jamais `sur_site`.
        remote: (row['remote'] as OpenNeedRow['remote']) ?? null,
        contract_kind: (row['contract_kind'] as OpenNeedRow['contract_kind']) ?? 'inconnu',
        // X66 / #3547 — `null` reste `null` : une équipe non renseignée n'est jamais 0.
        delivery_mode: (row['delivery_mode'] as OpenNeedRow['delivery_mode']) ?? 'staffed',
        supervision_role: (row['supervision_role'] as OpenNeedRow['supervision_role']) ?? null,
        client_team_size: row['client_team_size'] == null ? null : Number(row['client_team_size']),
        client_team_names: (row['client_team_names'] as string[] | null) ?? [],
        deadline_at: toIsoOrNull(row['deadline_at']),
        // #2173.49 — ARCHIVÉ, jamais un statut. `null` = actif.
        archived_at: toIsoOrNull(row['archived_at']),
        status: row['status'] as OpenNeedRow['status'],
        status_reason: (row['status_reason'] as string | null) ?? null,
        resume_on: (row['resume_on'] as string | null) ?? null,
        // `null` reste `null` : un besoin qui n'a jamais franchi de transition
        // n'a pas d'âge d'étape. Lui donner sa date de création inventerait un
        // âge — et l'âge inventé serait toujours rassurant.
        status_changed_at: toIsoOrNull(row['status_changed_at']),
        source: (row['source'] as OpenNeedRow['source']) ?? null,
        provenance: (row['provenance'] as OpenNeedRow['provenance']) ?? null,
        owner_id: (row['owner_id'] as string | null) ?? null,
        is_private: row['is_private'] === true,
        // #2175.8 — `null` reste `null` : aucun interlocuteur désigné n'est un
        // fait, jamais un nom à deviner depuis le compte.
        contact_id: (row['contact_id'] as string | null) ?? null,
        contact_name: (row['contact_name'] as string | null) ?? null,
        // #2939 (#2174.33) — même règle : `null` reste `null`, jamais deviné.
        decision_maker_contact_id: (row['decision_maker_contact_id'] as string | null) ?? null,
        decision_maker_name: (row['decision_maker_name'] as string | null) ?? null,
        shortlist_count: Number(row['shortlist_count'] ?? 0),
        stale: row['stale'] === true,
        // Jamais inventée : une valeur absente, ou qui n'est pas une page web, reste `null`.
        source_url:
          typeof row['source_url'] === 'string' && /^https?:\/\//i.test(row['source_url']) ? row['source_url'] : null,
        staffable: (row['staffable'] as OpenNeedRow['staffable']) ?? 'unknown',
        staffable_reason: (row['staffable_reason'] as string | null) ?? null,
        // #2558.1 — les TROIS champs du projet passent tels quels, `null`
        // compris. ⚠️ Jamais `String(null)` ni `?? ''` : « null » et la chaîne
        // vide s'afficheraient comme un projet qui existe et n'a pas de nom,
        // alors qu'il n'y a pas de projet du tout (GA-18 / GA-19).
        project_id: (row['project_id'] as string | null) ?? null,
        project_label: (row['project_label'] as string | null) ?? null,
        project_stage: (row['project_stage'] as OpenNeedRow['project_stage']) ?? null,
        // #2175.12 — même règle que les trois champs ci-dessus : `null` passe
        // tel quel, jamais une chaîne vide.
        project_objective: (row['project_objective'] as string | null) ?? null,
        // Le compte, lui, est toujours là — c'est l'invariant qui a remplacé
        // `project_id NOT NULL` (migration `1795711263408`).
        account_id: String(row['account_id']),
        account_name: (row['account_name'] as string | null) ?? null,
        account_logo_url: (row['account_logo_url'] as string | null) ?? null,
        // `bigint` en CHAÎNE du pilote pg — mais ici `Number(null)` ne peut pas
        // mentir : un `COUNT(*)` rend toujours une ligne, et zéro y est un VRAI
        // zéro. C'est le couple des deux comptes, pas l'un d'eux, qui décide si
        // l'écran a le droit d'écrire « 0 » (voir `deriveNeedStaffingBand`).
        missions_assigned: Number(row['missions_assigned'] ?? 0),
        project_missions_unlinked: Number(row['project_missions_unlinked'] ?? 0),
        entity_id: (row['entity_id'] as string | null) ?? null,
        entity_name: (row['entity_name'] as string | null) ?? null,
        // Les colonnes de tableau (`jsonb`, `text[]`) reviennent déjà décodées du
        // pilote pg ; `Array.isArray` garde quand même la main, parce qu'une
        // ligne écrite avant la contrainte de défaut peut porter `NULL` — et
        // `[].map` sur `null` ferait tomber TOUTE la liste, pas seulement la
        // cellule.
        languages: normaliseSpokenLanguages(row['languages']),
        clearances: Array.isArray(row['clearances']) ? (row['clearances'] as string[]) : [],
        stack: Array.isArray(row['stack']) ? (row['stack'] as string[]) : [],
        context: (row['context'] as string | null) ?? null,
        expertise: (row['expertise'] as string | null) ?? null,
        constraints: (row['constraints'] as string | null) ?? null,
        presentation_process: (row['presentation_process'] as string | null) ?? null,
        extra: (row['extra'] as Record<string, string> | null) ?? {},
        decision_process: (row['decision_process'] as string | null) ?? null,
        procurement_involvement: (row['procurement_involvement'] as OpenNeedRow['procurement_involvement']) ?? null,
        profile_type_agreement: (row['profile_type_agreement'] as OpenNeedRow['profile_type_agreement']) ?? 'unknown',
        // #3409.2 — `null` = jamais évalué, jamais un niveau deviné.
        convergence_state: (row['convergence_state'] as OpenNeedRow['convergence_state']) ?? null,
        // `bigint` en CHAÎNE, et `Number(null)` vaut 0 : un budget que personne
        // n'a communiqué s'afficherait « 0 € », c'est-à-dire « gratuit ».
        budget_cents: row['budget_cents'] == null ? null : Number(row['budget_cents']),
        min_tjm_cents: row['min_tjm_cents'] == null ? null : Number(row['min_tjm_cents']),
        interview_rounds: row['interview_rounds'] == null ? null : Number(row['interview_rounds']),
        onsite_days_per_week: row['onsite_days_per_week'] == null ? null : Number(row['onsite_days_per_week']),
        freelance_excluded: (row['freelance_excluded'] as boolean | null) ?? null,
        budget_validated: (row['budget_validated'] as boolean | null) ?? null,
        // #2067.21 / #2067.22 — le pilote pg rend un booléen SQL en `true`/`false`
        // JS directement (contrairement au `bigint`, toujours une chaîne).
        decision_known: row['decision_known'] === true,
        buying_process_known: row['buying_process_known'] === true,
        // #2067.25-.29 — le pilote pg rend `json_build_object(...)` déjà décodé
        // en objet JS (comme `skills`, plus haut) ; `null` reste `null`, jamais
        // un objet vide qui laisserait croire à un consultant sans nom.
        positioned_consultant: mapPositionedConsultant(row['positioned_consultant']),
        positioned_consultants_count: Number(row['positioned_consultants_count'] ?? 0),
      }))
      // #3348 — posée en UN second passage plutôt qu'à l'intérieur de l'objet
      // ci-dessus : `needNextAction` lit la ligne ENTIÈRE (statut, compétences,
      // shortlist…), pas seulement les champs de date déjà connus au moment où
      // cette ligne-ci se construit.
      .map(need => ({ ...need, next_action: needNextAction(need, new Date()) }))

    // #2035.11 — LA PRIORISATION DES BESOINS PAR LA CHARGE COMMERCIALE.
    //
    // `data` porte déjà la page (deadline ASC, created_at DESC) : on la
    // RÉORDONNE, on ne refait pas la requête. Un besoin dont le porteur a
    // atteint le plafond de l'espace (`max_open_needs`) passe après les
    // autres — le tri STABLE de `sortByCommercialLoad` garde l'ordre déjà
    // posé à l'intérieur de chaque groupe. ⚠️ Ceci ne réordonne QUE la page
    // demandée, pas l'ensemble des besoins ouverts de l'espace : un besoin de
    // la page 2 ne remonte jamais devant un besoin de la page 1.
    const [openNeedsByOwner, maxOpenNeeds] = await Promise.all([
      this.openNeedsCountByOwner(workspaceId),
      this.commercialLoadSettings.maxOpenNeedsFor(workspaceId),
    ])
    const prioritised = sortByCommercialLoad(data, openNeedsByOwner, maxOpenNeeds)

    const currentPage = Math.floor(query.offset / query.limit) + 1
    return {
      counters: {
        total,
        withoutShortlist,
        deadlinePassed,
        startingSoon,
        notStaffable,
        withInterview,
        readyToClose,
        outcomes: { won, lost, cancelled },
      },
      data: prioritised,
      pagination: {
        currentPage,
        size: query.limit,
        totalItems: total,
        totalPages: total === 0 ? 0 : Math.ceil(total / query.limit),
        hasNext: query.offset + query.limit < total,
        hasPrev: query.offset > 0,
      },
    }
  }

  /**
   * #2035.11 — combien de besoins OUVERTS chaque commercial porte
   * actuellement, dans CET espace. `NEED_OPEN_STATUSES` — le même ensemble
   * que le reste de l'écran (§7.4) — et `archived_at IS NULL`, exactement le
   * filtre neutre posé plus haut : un besoin rangé n'alourdit pas la charge
   * de qui l'a rangé.
   */
  private async openNeedsCountByOwner(workspaceId: string): Promise<Map<string, number>> {
    const rows = await this.needs.manager.query<{ owner_id: string; count: number }[]>(
      `SELECT owner_id, COUNT(*)::int AS count
         FROM project_needs
        WHERE workspace_id = $1 AND owner_id IS NOT NULL AND archived_at IS NULL
          AND status = ANY($2::text[])
        GROUP BY owner_id`,
      [workspaceId, [...NEED_OPEN_STATUSES]],
    )
    return new Map(rows.map(row => [row.owner_id, Number(row.count)]))
  }

  /**
   * « Un besoin sans candidat ouvre une piste » — voir le docblock de
   * `reverse-need-prospects.ts` pour ce que ça ferme et pourquoi
   * `ReverseProspectsSection` (comptes) ne s'y prête pas.
   *
   * La référence est relue CÔTÉ SERVEUR par son id, jamais prise du client —
   * même garde que `ProjectsService.findSimilar`. `null` = absente ou hors
   * espace, la seule chose qui vaut un 404 côté contrôleur.
   *
   * Le SQL ne fait que PRÉ-FILTRER (même zone normalisée, au moins une
   * compétence commune, même espace, un AUTRE compte, un statut OUVERT) ;
   * {@link sharedSkillTerms} et {@link rankReverseProspects} — déterministes,
   * testés sans base — font le reste : quels termes exacts justifient chaque
   * piste, et dans quel ordre les montrer.
   */
  async findReverseProspects(
    needId: string,
    workspaceId: string,
    currentUserId: string,
  ): Promise<ReverseProspectsResult | null> {
    const referenceRows = await this.needs.manager.query<ReferenceRow[]>(
      `
      -- #2558.1 — un besoin existe sans projet : le compte est sur le BESOIN,
      -- et la jointure au projet n'a plus lieu d'être ici. En INNER, la
      -- référence d'un besoin sans projet rendait NULL, donc un 404 côté
      -- contrôleur sur un besoin bien vivant.
      SELECT need.location AS location, need.skills AS skills, need.account_id AS account_id
      FROM project_needs need
      WHERE need.id = $1 AND need.workspace_id = $2
      LIMIT 1
      `,
      [needId, workspaceId],
    )
    const reference = referenceRows[0]
    if (!reference) return null

    const skillTerms = Array.isArray(reference.skills) ? reference.skills.map(skill => skill.term) : []
    const location = reference.location

    // ⚠️ La ZONE d'abord : sans elle, aucune des deux dimensions requises
    // n'est posée, et il est plus important de le dire que de dire lequel des
    // deux manque en premier quand les deux manquent à la fois.
    if (location === null || location.trim().length === 0) {
      return { needId, location: null, skillTerms, unavailableReason: 'location_missing', matches: [] }
    }
    if (skillTerms.length === 0) {
      return { needId, location, skillTerms: [], unavailableReason: 'skills_missing', matches: [] }
    }

    const candidateRows = await this.needs.manager.query<CandidateRow[]>(
      `
      SELECT
        need.id AS id,
        need.title AS title,
        need.skills AS skills,
        project.id AS project_id,
        project.label AS project_label,
        account.id AS account_id,
        account.company_name AS account_name,
        need.location AS location,
        account.assigned_to AS assigned_to
      -- #2558.1 — un besoin sans projet est une PISTE comme une autre : la
      -- jointure au projet devient facultative (son étiquette sera nulle), et
      -- c'est le compte du BESOIN qui mène au compte et au « autre compte ».
      FROM project_needs need
      LEFT JOIN opportunities project ON project.id = need.project_id
      JOIN accounts account ON account.id = need.account_id
      WHERE need.workspace_id = $1
        AND need.id <> $2
        AND need.account_id <> $3
        AND need.status = ANY($4::text[])
        AND LOWER(need.location) = LOWER($5)
        AND EXISTS (
          SELECT 1 FROM jsonb_array_elements(need.skills) s WHERE LOWER(s->>'term') = ANY($6::text[])
        )
      ORDER BY need.title, need.id
      LIMIT ${NEED_REVERSE_PROSPECTS_MAX}
      `,
      [
        workspaceId,
        needId,
        reference.account_id,
        [...NEED_OPEN_STATUSES],
        location,
        skillTerms.map(term => term.trim().toLowerCase()).filter(term => term.length > 0),
      ],
    )

    const matches: ReverseProspectMatch[] = candidateRows.map(row => ({
      need_id: String(row.id),
      need_title: String(row.title ?? ''),
      // #2558.1 — les deux champs du projet restent nuls ENSEMBLE quand la
      // piste n'a pas de projet : `String(null)` afficherait « null ».
      project_id: row.project_id === null ? null : String(row.project_id),
      project_label: row.project_id === null ? null : String(row.project_label ?? ''),
      account_id: String(row.account_id),
      account_name: String(row.account_name ?? ''),
      location: String(row.location ?? ''),
      shared_skills: sharedSkillTerms(reference.skills ?? [], Array.isArray(row.skills) ? row.skills : []),
      // Déjà rattaché à l'APPELANT (`accounts.assigned_to`) : c'est déjà son
      // client, pas une piste neuve — voir le docblock du champ.
      already_in_portfolio: row.assigned_to !== null && row.assigned_to === currentUserId,
    }))

    return { needId, location, skillTerms, unavailableReason: null, matches: rankReverseProspects(matches) }
  }
}

function toIsoOrNull(value: unknown): string | null {
  if (value == null) return null
  if (value instanceof Date) return value.toISOString()
  return String(value)
}

/** #2067.25-.29 — relit le JSON du positionné TEL QUEL, sans jamais inventer
 *  un objet vide quand la sous-requête n'a rien trouvé. */
function mapPositionedConsultant(value: unknown): PositionedConsultantFact | null {
  if (value == null || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  return {
    submissionId: String(raw['submissionId']),
    consultantId: String(raw['consultantId']),
    consultantName: (raw['consultantName'] as string | null) ?? null,
    submittedAt: toIsoOrNull(raw['submittedAt']) ?? String(raw['submittedAt']),
    fitScore: raw['fitScore'] == null ? null : Number(raw['fitScore']),
    availability: (raw['availability'] as string | null) ?? null,
    proposedRateCents: raw['proposedRateCents'] == null ? null : Number(raw['proposedRateCents']),
    mobilityKnown: raw['mobilityKnown'] === true,
    otherActiveSubmissions: Number(raw['otherActiveSubmissions'] ?? 0),
    // #2175.29 — `true` seulement si la base l'a dit ; tout le reste vaut « non mesuré ».
    agreementConfirmed: raw['agreementConfirmed'] === true,
  }
}
