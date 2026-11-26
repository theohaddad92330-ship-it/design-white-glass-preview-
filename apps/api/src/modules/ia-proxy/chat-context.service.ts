import { Inject, Injectable, Optional } from '@nestjs/common'
import { planSummaryOf } from './plan-summary'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
  decisionRoleSchema,
  deriveAccountStrategy5P,
  deriveInternalCapabilities,
  memoryItemsSentToModel,
  parseAccountAnalysis,
  readRelationshipState,
  type AccountStrategy5PContactInput,
  type BusinessUnitContextItem,
  type ConversationThreadState,
  type MarketPortfolioRead,
  type PinnedMemoryContextItem,
} from '@bellum/contracts'
import { isSuccess } from '@bellum/utils'
import { killSwitchCut } from '../../common/kill-switches'
import { CrmConnectionEntity } from '../../database/entities/crm-connection.entity'
import { AccountFeedbackService } from '../account-feedback/account-feedback.service'
import { AccountsService, type CopilotAccountFacts } from '../accounts/accounts.service'
import { foldForNameMatch } from '../contacts/contact-name-match'
import { ContactsService } from '../contacts/contacts.service'
import { CrmReadService } from '../crm/crm-read.service'
import { domainFromWebsite, formatCrmPresence, type CrmPresence, type CrmPresenceContact } from '../crm/crm-presence'
import { EsnProfileReader } from '../esn-profile/esn-profile-reader.service'
import { MemoryService, type RecordTurnArgs } from '../memory/memory.service'
import { renderInternalCapabilityDigest } from '../tool-registry/tool-capability-digest'
import { ToolRegistryService } from '../tool-registry/tool-registry.service'
import { workspaceScopeWhere } from '../workspace/workspace-scoping'
import { contactIdentityLabel } from './contact-identity-label'
import {
  ACCOUNT_FACTS_CONTEXT,
  COMMERCIAL_METHOD_CONTEXT,
  LOST_DEAL_REX_CONTEXT,
  NEEDS_HISTORY_CONTEXT,
  WORKSPACE_LEARNED_RULES_CONTEXT,
  WORKSPACE_RECALL_CONTEXT,
  type AccountFactsContextReader,
  type CommercialMethodContextReader,
  type LostDealRexContextReader,
  type NeedsHistoryContextReader,
  type WorkspaceLearnedRulesContextReader,
  type WorkspaceRecallContextReader,
} from './module-tokens'

/**
 * #2259.30-.35 — la FICHE d'une BU que le CONTRÔLEUR a résolue
 * (`BusinessUnitService.findByIds`, GA-07 : ce service ne va pas la chercher
 * lui-même). `id` sert au calcul du compte de comptes rattachés ; il ne part
 * jamais vers le service IA (voir {@link BusinessUnitContextItem}).
 */
interface BusinessUnitDetailInput {
  id: string
  name: string
  territory: string | null
  specialties: readonly string[]
  /** #3384.1 — la couche BU déclarée (équipe commerciale + vivier) ; absent / `null` = non déclaré. */
  teamSize?: number | null
  consultantCount?: number | null
  capacityAvailableConsultants?: number | null
  quarterObjective?: string | null
}

// #2259.30-.35 — `BusinessUnitContextItem` (ce que Laura reçoit pour UNE BU
// portée) vit dans `@bellum/contracts` : `IaClient` (module `ia`) en a besoin
// aussi pour la transmettre, et cette classe ne peut pas l'importer d'ici
// sans inverser la dépendance `ia` → `ia-proxy`.

export interface ChatContext {
  accountData: Record<string, unknown> | null
  contactsSummary: string | null
  planSummary: string | null
  /** Portfolio digest injected when NO single account is active, so the shared
   *  thread can reason about the workspace's accounts (Théo §13). */
  accountsSummary: string | null
  /**
   * #1941.4 — LES COMPTES QUE LAURA A RÉELLEMENT PU LIRE, NOMMÉS.
   *
   * Le panneau « Ce que Laura utilise » n'affichait qu'un NOMBRE, et ce nombre
   * était compté côté IA en comptant les LIGNES de `accountsSummary`
   * (`context_transparency._count_lines`) — donc l'en-tête du bloc et le bloc de
   * mémoire marché avec. « Comprendre les comptes lisibles » demandait la LISTE,
   * et la liste est ici : elle vient du digest que ce service a lui-même bâti,
   * jamais d'un texte re-découpé.
   *
   * `total` = ce que l'espace porte ; `names.length` = ce qui est réellement
   * parti au modèle. Les deux diffèrent quand la liste est PARTIELLE, et c'est
   * précisément ce qu'il faut pouvoir dire — « 20 comptes sur 57 », jamais 57.
   *
   * `null` = aucun portefeuille dans ce tour (un dossier est ouvert, ou la
   * lecture a échoué) — jamais une liste vide, qui se lirait « tu n'as aucun
   * compte ».
   */
  readablePortfolio?: { names: string[]; total: number } | null
  profileData: Record<string, unknown>
  // Durable "long memory" (Théo P2): the copilot remembers pinned facts, the
  // user's preferences and a rolling summary of this conversation across sessions.
  // Les faits EXPIRÉS n'y sont jamais : `MemoryService.listFacts` (l'unique
  // lecture de la mémoire) les exclut en SQL — restitution V2 §20, « un fait
  // épinglé est vrai pour toujours » était le défaut relevé.
  //
  // #1962.8 — chaque élément porte sa NATURE (`kind`) et son ORIGINE
  // (`origin`), pas seulement son texte. Avant #1962, cette liste ne portait
  // que `fact` : le prompt ne pouvait donc pas distinguer une correction
  // humaine d'une conclusion de Laura jamais confirmée (`origin: 'copilot'`) —
  // les deux entraient à égalité sous « Faits épinglés ».
  pinnedFacts: PinnedMemoryContextItem[]
  /**
   * #1916.24 — les IDENTIFIANTS des éléments de `pinnedFacts`, même ordre, mêmes
   * filtres : la liste exacte qui part dans le prompt, et donc la seule qu'on
   * trace. Jamais envoyée au service IA.
   */
  pinnedFactIds: string[]
  userPreferences: Record<string, unknown>
  conversationSummary: string | null
  // Real integration state (P0 chat transparency): resolved from `crm_connections`
  // so the copilot's response can honestly say « CRM non connecté ». Passed down to
  // the IA, which builds the structured "not consulted" list. Never guessed.
  crmConnected: boolean
  crmProvider: string | null
  /** CRM presence read-back for the ACTIVE account (roadmap §8/§9) : « X contacts
   *  déjà dans votre CRM chez ce groupe, Y deals ouverts ». Non-null ONLY when a
   *  CRM is connected, an account is active AND the CRM was actually queried —
   *  the IA treats it as "CRM consulté" in the transparency panel. Data comes
   *  straight from the CRM's API, never invented. */
  crmPresence: string | null
  /** #1915.11 — la lecture CRM a été TENTÉE et a ÉCHOUÉ (panne réseau, 500 du
   *  fournisseur) plutôt que « rien à en dire ». Distinct de `crmPresence: null`,
   *  qui vaut aussi bien pour « pas connecté », « rien trouvé » que « raté » — le
   *  panneau de transparence doit dire « indisponible », jamais « non croisé »,
   *  sinon un beta testeur croit que Bellum a interrogé le CRM et n'y a rien vu.
   *  Optionnel comme `threadState` ci-dessous : un appelant qui assemble un
   *  contexte à la main (tests, route MCP) n'a rien à inventer — absent vaut
   *  `false`, jamais vrai sans une erreur réellement attrapée. */
  crmUnavailable?: boolean
  /** Mémoire de corrections du compte actif (feedback loop A2) : les retours
   *  utilisateur sur ce dossier, condensés en directives factuelles. Non-null
   *  UNIQUEMENT quand un compte est actif ET qu'il a du feedback — le copilote
   *  ne doit pas re-proposer ce que l'utilisateur a déjà corrigé. */
  accountFeedback: string | null
  /** #3272.6 — REX de perte(s) déjà connu(s) sur le compte actif, condensés en
   *  quelques lignes courtes (jamais le REX mot pour mot) : Laura peut ainsi
   *  dire « ce compte a déjà été perdu après telle route » sans réciter le
   *  formulaire. Non-null UNIQUEMENT quand un compte est actif ET porte au
   *  moins un REX de perte. Optionnel comme {@link crmUnavailable} : un
   *  appelant qui assemble un contexte à la main (tests, route MCP) n'a rien
   *  à inventer — absent vaut `null`. */
  lostDealRexContext?: string | null
  /** #3390.10/.11 — la méthode commerciale RETENUE pour le besoin ouvert du compte
   *  actif (`chooseCommercialMethod`, même objet que l'écran des besoins), déjà
   *  rendue en texte par `renderLauraCommercialMethodContext`. `null` sans
   *  lecteur câblé, sans besoin ouvert, ou lecture en échec. */
  commercialMethodContext?: string | null
  /** #4071.1 — les FAITS DU COMPTE actif (socle #4069 : signaux de tout âge,
   *  affaires gagnées/perdues/en sommeil, missions, besoins, notes, comptes
   *  rendus, corrections, observations de marché, documents), bornés, les plus
   *  pertinents d'abord, chacun daté et SANS provenance
   *  (`accountFactsContextFor`). `null` sans lecteur câblé, sans compte actif,
   *  sans fait, ou lecture en échec — absent ≠ inventé. */
  accountFactsContext?: string | null
  /** #4071.3 — ce que l'ESPACE a gardé : recherches enregistrées, listes de cibles, résumés des
   *  conversations passées de la personne (`workspaceRecallContextFor`), bornés, datés, les plus
   *  récents d'abord, SANS provenance. Niveau espace : présent sans dossier ouvert. `null` sans
   *  lecteur, sans rien de gardé, en mode « sans les données de l'espace », ou lecture en échec. */
  workspaceRecallContext?: string | null
  /** #3295 — les règles APPRISES de l'espace (propositions d'apprentissage
   *  adoptées PUIS activées), condensées. Niveau ESPACE, pas compte : présent
   *  même sans dossier ouvert. `null` sans lecteur câblé ou sans règle active. */
  workspaceLearnedRulesContext?: string | null
  /** Registre d'outils (Tool Registry v2, roadmap §8-9) : digest compact des
   *  outils réellement CONNECTÉS du caller + le coût de leurs actions, pour que
   *  le copilote puisse proposer « je peux enrichir cet email via Dropcontact,
   *  coût 1 crédit » — jamais un outil non connecté. Null quand rien n'est
   *  connecté (ou sur erreur) : bloc non injecté côté IA. */
  toolsSummary: string | null
  /**
   * #2261.21-32 — digest des capacités INTERNES du produit (comptes, contacts,
   * besoins, vivier, missions, mémoire marché, DataForge, routines) : pas des
   * outils à connecter, mais Laura doit pouvoir dire d'elle-même si elles sont
   * utilisables MAINTENANT (ex. routines coupées par l'opérateur). Même
   * registre que {@link toolsSummary} (GA-26) — jamais un second manifeste.
   */
  internalCapabilitiesSummary?: string | null
  /** Le PRÉNOM de la personne (tome 6 §5.7, D44 : une seule voix).
   *
   * Une assistante qui redemande au dixième message ce qu'on lui a dit au
   * premier n'en est pas une — et l'espace connaît déjà ce prénom. `null` quand
   * le profil ne le porte pas : le bloc n'apparaît alors pas du tout, ce qui
   * vaut mieux qu'un « Bonjour  » à deux espaces. */
  firstName: string | null
  /** #2259.11 — LE NOM DE FAMILLE (`profiles.last_name`), jamais deviné.
   *  `null` quand le profil ne le porte pas : même contrat que {@link firstName}.
   *  Optionnel comme `crmUnavailable` ci-dessus : un appelant qui assemble un
   *  contexte à la main (tests, route MCP) n'a rien à inventer — absent vaut
   *  `null`. */
  lastName?: string | null
  /** #2259.4 / #2259.13 — LE RÔLE D'ESPACE (RBAC : owner/admin/sales_ops/
   *  sales/tech_admin/member/viewer), résolu par le CONTRÔLEUR
   *  (`resolveActiveWorkspace`, GA-07 — même raison que `businessUnitIds`
   *  ci-dessus) et simplement PORTÉ ici. C'est le seul signal RÉEL de
   *  « fonction commerciale » (#2259.13) : aucun champ distinct n'existe, en
   *  inventer un serait deviner. `null`/absent = appelant qui ne le fournit
   *  pas (tests, route MCP). */
  workspaceRole?: string | null
  /** #2259.4 — VRAI quand cette personne est la propriétaire du compte Bellum
   *  (`workspaceRole === 'owner'`). Ne dit PAS qu'elle dirige l'ESN (#2259.5,
   *  non modélisé, resté `retenu` au registre) — jamais promu au-delà de ce
   *  que le rôle dit réellement. Absent = `false` (comme `crmUnavailable`). */
  isAccountOwner?: boolean
  /** #2259.6 — un COLLÈGUE de l'espace (pas un contact externe) cité par son
   *  prénom dans le message, résolu par le même rapprochement nom-dans-message
   *  que {@link contactsNamedIn} pour les contacts. `null`/absent = personne
   *  citée, ou un nom qui désigne deux collègues à la fois (homonymes : aucun
   *  ne l'emporte). */
  mentionedColleague?: string | null
  /**
   * #2259.30 / #2259.32 / #2259.33 / #2259.34 / #2259.35 — LA OU LES BU QUE
   * LA PERSONNE PORTE, avec ce que l'espace en sait (DÉCISION Louis 17/09
   * après-midi).
   *
   * ⚠️ C'est un CONTEXTE pour Laura — prioriser, formuler — JAMAIS un FILTRE
   * de ce qu'elle voit ailleurs : aucun compte, consultant ou référence hors
   * BU ne disparaît. `[]`/absent = propriétaire sans BU (`perimetersOf` rend
   * `[]`) : aucune ligne dans le prompt.
   */
  businessUnits?: BusinessUnitContextItem[]
  /**
   * LE FUSEAU DE LA PERSONNE (décision Louis, 14/09/2026 — « ajouter un fuseau
   * par utilisateur »), nom IANA lu dans `profiles.timezone`.
   *
   * Pourquoi il est résolu ICI, côté serveur, et pas envoyé par le navigateur :
   * « relance-la demain à 9 h » est résolu par le MODÈLE contre la date que
   * porte le bloc de queue du prompt (`current_time_block`). Le navigateur sait
   * DÉTECTER un fuseau, mais le choix, lui, vit sur le profil — et c'est ce
   * choix qui doit gagner, y compris sur un autre appareil ou un autre fuseau
   * de voyage.
   *
   * `null` = inconnu ⇒ la clé est OMISE sur le fil ⇒ le service IA garde son
   * fuseau de RÉFÉRENCE nommé (`REFERENCE_TIMEZONE`). Jamais UTC, jamais une
   * devinette, et le prompt reste byte-identique pour qui n'a rien renseigné.
   */
  timezone: string | null
  /**
   * #1958.2 — LE FUSEAU DE L'ESPACE, lu dans `workspaces.timezone`.
   *
   * Jusqu'ici seuls existaient le fuseau de la PERSONNE (juste au-dessus) et le
   * défaut produit nommé : aucun fuseau n'était porté par l'ESPACE, donc une
   * équipe dont personne n'avait rempli son fuseau personnel retombait
   * directement sur Paris, même basée à Montréal.
   *
   * `null` = cet espace n'a rien réglé ⇒ la clé est OMISE sur le fil. C'est la
   * MARCHE JUSTE AVANT le défaut produit nommé dans l'escalier
   * `resolve_applicable_timezone` (`apps/ia/app/prompts/current_time.py`) :
   * personne → rendez-vous (#1958.3) → espace → défaut produit.
   *
   * Optionnel (contrairement à `timezone` juste au-dessus) : un appelant qui
   * construit un contexte à la main (specs existantes, route MCP) n'a rien à
   * inventer, et `undefined` se lit exactement comme `null` en aval.
   */
  workspaceTimezone?: string | null
  /**
   * #2266.8 (épopée #2920) — DEPUIS QUAND cet espace utilise Bellum
   * (`workspaces.created_at`). Même discipline que `workspaceTimezone`
   * juste au-dessus : `null`/`undefined` = clé omise, le service IA ne peut
   * alors pas dater l'ancienneté de l'espace et ne l'affirme jamais.
   */
  workspaceCreatedAt?: string | null
  /**
   * #2266.10 (épopée #2920) — QUAND cet espace a vu sa dernière collecte de
   * données réussie (le plus récent des six `*_collected_at` de `accounts`,
   * tous comptes de l'espace confondus — #AF, `segment-catchup.service.ts`).
   * Il n'existe aucun signal de fraîcheur à l'échelle du WORKSPACE, seulement
   * PAR SEGMENT PAR COMPTE : ce champ ne fabrique rien, il prend le plus
   * récent de ce qui existe déjà. `null`/`undefined` = clé omise, jamais une
   * date inventée pour un espace sans collecte connue.
   */
  workspaceLastSyncAt?: string | null
  /**
   * #1927.10 — L'ÉTAT STRUCTURÉ du fil (objets cités, dernière liste, dernière
   * recherche préparée, actions préparées, questions déjà posées), rechargé à
   * la réouverture du fil. Personnel comme le résumé qu'il accompagne : même
   * ligne, même borne `(user_id, workspace_id, conversation_id)`.
   *
   * `null` = aucun état connu (fil neuf, lecture en échec, ligne illisible) :
   * le service IA ne reçoit alors aucune clé et construit le prompt d'avant.
   * Optionnel pour qu'un appelant qui assemble un contexte à la main (route
   * MCP, specs) n'ait rien à inventer.
   */
  threadState?: ConversationThreadState | null
}

/**
 * #1581.1 — LE BLOC « MÉMOIRE MARCHÉ » DU CONTEXTE, ET SON MODE D'EMPLOI.
 *
 * ⚠️ TROIS PHRASES INTERDITES, ET C'EST POURQUOI LE SENS EST ÉCRIT ICI :
 *  · « 38 de tes comptes externalisent » — un taux de COUVERTURE mesure ce que
 *    NOUS savons, pas ce que le marché fait (`c65_…`, GA-259) ;
 *  · « les 24 autres n'externalisent pas » — la négation est aussi fausse, et
 *    elle est à un remaniement de devenir l'affirmation ;
 *  · « cette entreprise travaille actuellement avec X » — une observation de
 *    corpus n'est jamais un fait présent.
 *
 * ⚠️ Sur une panne, AUCUN chiffre. Pas des zéros : « 0 couvert sur 0 » se lirait
 * « le marché ne connaît aucun de tes comptes », ce qui est rassurant et faux.
 * Le contrat force le choix (`status: 'unavailable'`), il ne peut pas s'oublier.
 *
 * ⚠️ Le mot « forte » n'apparaît PAS sur l'affinité, et c'est le contrat qui le
 * refuse : graduer demanderait de normaliser par cohorte (un grand compte cite
 * mécaniquement plus de technologies), sans quoi « forte » mesurerait la TAILLE.
 * Même refus que `externalization_score` (#1640.6, GA-257).
 */
function marketMemoryBlock(read: MarketPortfolioRead | null): string | null {
  if (read === null) return null
  const title = 'Observations du marché — ce qui a été OBSERVÉ, jamais ce que ces entreprises font aujourd’hui :'
  if (read.status !== 'ok') {
    return `${title}\n- Lecture indisponible pour ce tour. N’en déduis RIEN : ce n’est pas « aucune couverture ».`
  }
  const { accounts, covered, insufficientObservations, ambiguous, unresolved } = read.coverage
  const lines = [
    `- Couverture : sur ${accounts} comptes du portefeuille interrogés, ${covered} ont assez de parcours professionnels observés pour que Bellum en dise quelque chose.`,
    `- Les ${insufficientObservations + ambiguous + unresolved} autres se répartissent en ${insufficientObservations} « observations insuffisantes », ${ambiguous} « ambigus » et ${unresolved} « non résolus ». Ils sont hors de ce que Bellum SAIT — ça ne dit RIEN de ce qu’ils font, ni dans un sens ni dans l’autre.`,
  ]
  if (read.structuralFit) {
    const { matching, covered: denominator, expertises } = read.structuralFit
    lines.push(
      `- Affinité structurelle : parmi les ${denominator} comptes couverts, ${matching} ont un environnement technologique observé qui recoupe au moins une expertise déclarée de l’espace (critère : ${expertises.join(', ')}).`,
    )
  } else {
    lines.push(
      '- Affinité structurelle : non mesurable, l’espace n’a déclaré aucune expertise. Ce n’est pas « aucune affinité ».',
    )
  }
  lines.push(
    '- Ce que cette mémoire ne permet pas : dire qu’une entreprise « travaille actuellement avec » quelqu’un, ni créer une urgence. Elle augmente le POTENTIEL d’un compte ; seul un signal récent justifie d’agir maintenant. Dis « Bellum a observé… ».',
  )
  return `${title}\n${lines.join('\n')}`
}

/** Empty memory — the degradable default when the store errors / is unreachable. */
const EMPTY_MEMORY = {
  pinnedFacts: [] as PinnedMemoryContextItem[],
  pinnedFactIds: [] as string[],
  userPreferences: {} as Record<string, unknown>,
  conversationSummary: null,
}

/**
 * Assemble the Copilote (chat) context SERVER-SIDE from the authenticated user +
 * an optional accountId. Théo restitution §4/§13: "le vrai produit doit résoudre
 * le contexte côté backend ; le front envoie seulement message + accountId". The
 * SPA used to client-fetch the account, contacts and — critically — send
 * profileApi.getMe() (a UserProfile with NO ESN fields), so the advisor prompt
 * read esn_name/offers → N/A and answered generically. Here the profile is the
 * validated ESN seller profile, and account/contacts are read with the user's own
 * scope (never trusted from the body).
 *
 * Long memory (Théo P2) is folded in the same place: pinned facts, user
 * preferences and the rolling conversation summary. Memory is best-effort — a
 * failure degrades to empty memory and NEVER breaks the chat.
 */
/**
 * #1995 — la fenêtre CLASSÉE du résumé des contacts.
 *
 * Dix jusqu'au 14/09/2026 : une ligne fait ~100 caractères (`nom - poste -
 * rôle - contact_id: <uuid>`), donc dix lignes ≈ 1 000 — confortablement sous
 * le cap `_CONTACTS_SUMMARY_MAX = 4000` de `apps/ia/app/prompts/bellum_advisor.py`.
 * Élargir la fenêtre ne réparait PAS le défaut mesuré : THALES porte 2 027
 * contacts qualifiés (`contacts.service.ts`, mesure du 12/09/2026), et 25 ne
 * couvre que 1,2 % du dossier — la personne nommée peut rester invisible.
 * C'est le NOM prononcé (`contactsNamedIn`), pas la largeur de cette fenêtre,
 * qui répare ce défaut-là.
 *
 * D15 — décision Louis 14/09/2026 : fenêtre 25 (était 10), tranchée CONTRE
 * cette recommandation. 25 lignes ≈ 2 500 caractères, toujours sous le cap.
 */
const CONTACTS_RANKED_WINDOW = 25 // D15 — décision Louis 14/09/2026 : fenêtre 25 (était 10)

/**
 * #1995 — combien de contacts NOMMÉS dans le message peuvent entrer en plus de
 * la fenêtre. Cinq : une phrase qui nomme plus de cinq personnes ne demande pas
 * un rappel sur l'une d'elles. Le total du bloc reste donc borné à trente
 * lignes (~3 000 caractères, fenêtre à 25 — D15) — un contexte borné, jamais
 * la taille du dossier.
 */
const CONTACTS_NAMED_MAX = 5

function escapeForRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * #1995 — les contacts que le message NOMME, dans le dossier déjà résolu.
 *
 * Le correctif précédent a mis l'identifiant sur la ligne des dix premiers
 * contacts. Le geste rejoué en production le 14/09/2026 échoue quand même :
 * « Rappelle-moi de relancer Sandrine Pata chez THALES demain à 9 h 30 » nomme
 * quelqu'un qui n'est PAS dans ces dix — le dossier en compte 2 027. Laura ne
 * peut pas rendre un identifiant qu'elle n'a jamais reçu, et les quatre outils
 * qui exigent un `contact_id` (`schedule_reminder_for_contact`,
 * `prepare_message_for_contact`, `enrich_contact`, `export_contact_to_crm`)
 * restent inatteignables depuis une conversation de portefeuille.
 *
 * Le dépôt avait déjà tranché la même question pour l'objet voisin : c'est
 * exactement ce que `resolveAccountByName` fait du nom d'ENTREPRISE prononcé
 * dans le message. On fait ici pour la personne ce qui se faisait pour le
 * compte, dans le MÊME référentiel — pas un rapprochement entre deux
 * référentiels par le nom, qui est l'autre défaut du dépôt.
 *
 * Trois bornes, chacune pour une raison mesurée :
 *  - un nom qui désigne DEUX personnes n'en désigne AUCUNE (doctrine : deux
 *    homonymes ne se rapprochent jamais — Laura demandera laquelle, ce qui est
 *    la bonne réponse) ;
 *  - la correspondance est au BORD DE MOT, jamais au milieu : « Li » ne se lit
 *    pas dans « Lille » ;
 *  - un contact sans identifiant lisible n'entre pas — il n'apporterait rien
 *    que la fenêtre classée ne dise déjà.
 */
function contactsNamedIn<T extends { id?: unknown; full_name?: string | null }>(
  message: string | null | undefined,
  rows: readonly T[],
): T[] {
  const haystack = foldForNameMatch(String(message ?? ''))
  if (haystack.trim().length < 3) return []
  const occurrences = new Map<string, number>()
  for (const row of rows) {
    const name = foldForNameMatch(String(row.full_name ?? '').trim())
    if (name.length < 2) continue
    occurrences.set(name, (occurrences.get(name) ?? 0) + 1)
  }
  const named: T[] = []
  for (const row of rows) {
    const name = foldForNameMatch(String(row.full_name ?? '').trim())
    if (name.length < 2) continue
    if ((occurrences.get(name) ?? 0) > 1) continue
    if (typeof row.id !== 'string' || !row.id.trim()) continue
    // Sans drapeau `g` : `RegExp.test()` avec `g` est STATEFUL, et la même
    // expression rendrait un résultat différent au deuxième appel.
    const atWordBoundary = new RegExp(`(?<![\\p{L}\\p{N}])${escapeForRegExp(name)}(?![\\p{L}\\p{N}])`, 'u')
    if (atWordBoundary.test(haystack)) named.push(row)
  }
  return named
}

/** `<identité> - <poste> - <rôle>`, sans identifiant — la portion COMMUNE aux
 *  lignes de la fenêtre classée, du nom prononcé et de la présence CRM. */
function contactIdentityLine<
  T extends {
    full_name?: string | null
    title?: string | null
    decision_role?: string | null
    entity?: string | null
    email?: string | null
    phone?: string | null
    linkedin_url?: string | null
    last_name_obfuscated?: string | null
    raw_data?: Record<string, unknown> | null
  },
>(c: T): string {
  return `${contactIdentityLabel(c)} - ${c.title ?? '?'} - ${c.decision_role ?? '?'}`
}

/**
 * #2430.2 — le résumé d'une BRANCHE : le sien d'abord, puis celui de son fil
 * d'origine, NOMMÉ comme tel pour que Laura ne confonde pas ce qui a été dit
 * ici avec ce qui l'a été là-bas. `null` quand ni l'un ni l'autre n'existe.
 */
function withParentThreadSummary(own: string | null, parent: string | null): string | null {
  if (!parent) return own
  const origin = `Contexte du fil d’origine (cette conversation en est une branche) : ${parent}`
  return own ? `${own}\n\n${origin}` : origin
}

/** #3243 — le marqueur lu par `commercial_challenge.detect_departed_contact`
 *  (apps/ia) : la même chaîne des deux côtés, jamais reformulée. */
const DEPARTED_CONTACT_MARKER = 'parti de l’entreprise'

/** #3243 (#186.10) — la personne NOMMÉE dans le message : lu par
 *  `commercial_challenge.detect_too_senior_contact` (apps/ia), même chaîne des deux côtés. */
const NAMED_CONTACT_MARKER = 'nommé dans le message'

/** #3231 (#219.8, recette prod 05/10) — le préfixe du marqueur de relation
 *  DÉCLARÉE : lu par `person_relation_proof.declared_relations_context_block`
 *  (apps/ia), même chaîne des deux côtés. La valeur qui suit est l'une des
 *  treize de `PERSON_COMPANY_RELATION_VALUES` (`@bellum/contracts`) — jamais
 *  reformulée ici, Python reste le seul à classer (GA-26). Avant ce marqueur,
 *  `introduction_capability`/`collision_risk` n'existaient que dans les
 *  retours d'outils (`with_relation_proof`) : un tour sans appel d'outil ne
 *  les voyait jamais, malgré une relation déclarée sur la fiche. */
const DECLARED_RELATION_MARKER_PREFIX = 'relation déclarée: '

/** Une ligne de `contactsSummary` — `contact_id: <uuid>` en FIN de ligne quand
 *  un identifiant lisible existe, jamais inventé sinon. `chat_thread_state.py`
 *  (`_CONTEXT_CONTACT_ID`) exige cette position pour porter l'identité au tour
 *  suivant : rien ne doit s'écrire APRÈS `contact_id: …` sur cette ligne. */
function contactSummaryLine<
  T extends Parameters<typeof contactIdentityLine>[0] & {
    id?: unknown
    declared_person_company_relation?: string | null
  },
>(c: T, named = false, departed = false): string {
  // #3243 / #3231 — marqueurs AVANT `contact_id` (qui reste en FIN de ligne).
  const declaredRelation =
    typeof c.declared_person_company_relation === 'string' ? c.declared_person_company_relation.trim() : ''
  const markers = [
    named ? NAMED_CONTACT_MARKER : '',
    departed ? DEPARTED_CONTACT_MARKER : '',
    declaredRelation ? `${DECLARED_RELATION_MARKER_PREFIX}${declaredRelation}` : '',
  ].filter(Boolean)
  const identity = [contactIdentityLine(c), ...markers].join(' - ')
  const id = typeof c.id === 'string' ? c.id.trim() : ''
  return id ? `${identity} - contact_id: ${id}` : identity
}

/**
 * #1995 — un contact nommé par la présence CRM porte l'id de sa fiche Bellum.
 *
 * `formatCrmPresence` (`../crm/crm-presence.ts`) ne restitue que ce que le CRM
 * a renvoyé — nom, poste, e-mail — jamais d'identifiant Bellum : le CRM
 * externe n'en connaît pas. Une personne nommée UNIQUEMENT par ce canal
 * (Sandrine Pata, REPRODUIT en production le 14/09/2026 à 15h52 malgré trois
 * correctifs déjà servis) n'avait donc AUCUN identifiant nulle part dans le
 * pipeline, quel que soit le tour : les quatre outils qui exigent un
 * `contact_id` (`schedule_reminder_for_contact`, `prepare_message_for_contact`,
 * `enrich_contact`, `export_contact_to_crm`) restaient inatteignables depuis
 * une conversation où seule la présence CRM l'avait nommée.
 *
 * Résolution par e-mail normalisé d'abord — le plus fiable, deux fiches ne
 * partagent normalement pas une adresse — puis par nom plié (casse ET
 * accents, comme `contactsNamedIn` ci-dessus) : le MÊME référentiel que le
 * dossier Bellum, jamais un rapprochement entre deux référentiels par le nom
 * (doctrine : « SG SOCIETE GENERALE » ne retrouve pas ses 267 parcours par ce
 * chemin-là). Une correspondance AMBIGUË (deux fiches Bellum partagent le
 * même e-mail ou le même nom) ne résout personne — même refus que
 * `contactsNamedIn` sur les homonymes : un identifiant faux serait pire
 * qu'aucun identifiant.
 */
function resolveCrmContactToBellum<T extends { id?: unknown; full_name?: string | null; email?: string | null }>(
  crmContact: Pick<CrmPresenceContact, 'name' | 'email'>,
  rows: readonly T[],
): T | null {
  const readableId = (row: T): boolean => typeof row.id === 'string' && row.id.trim().length > 0
  const email = (crmContact.email ?? '').trim().toLowerCase()
  if (email) {
    const byEmail = rows.filter(r => (r.email ?? '').trim().toLowerCase() === email)
    if (byEmail.length === 1 && readableId(byEmail[0])) return byEmail[0]
  }
  const name = foldForNameMatch((crmContact.name ?? '').trim())
  if (name.length < 2) return null
  const byName = rows.filter(r => foldForNameMatch(String(r.full_name ?? '').trim()) === name)
  if (byName.length === 1 && readableId(byName[0])) return byName[0]
  return null
}

/**
 * #4055 (lot W-C 13/10) — « complète ce compte » : une personne du CRM SANS fiche Bellum résolue n'est
 * pas forcément NOUVELLE. Doublon PROBABLE d'une fiche Bellum quand : deux fiches ou plus partagent son
 * e-mail ou son nom (homonymes — aucune n'est résolue, cf. ci-dessus), les mêmes mots dans un autre ordre
 * (« DUPONT Jean » / « Jean Dupont »), ou le même nom de famille avec la même initiale (« M. Leroy » /
 * « Marc Leroy »). On le PROPOSE, on ne fusionne jamais (doctrine) ; la première fiche proche est nommée.
 */
function probableBellumDuplicate<T extends { id?: unknown; full_name?: string | null; email?: string | null }>(
  crmContact: Pick<CrmPresenceContact, 'name' | 'email'>,
  rows: readonly T[],
): T | null {
  const words = (value: string): string[] =>
    foldForNameMatch(value)
      .split(/[^\p{L}\p{N}]+/u)
      .filter(Boolean)
  const email = (crmContact.email ?? '').trim().toLowerCase()
  if (email) {
    const byEmail = rows.find(r => (r.email ?? '').trim().toLowerCase() === email)
    if (byEmail) return byEmail
  }
  const crmWords = words((crmContact.name ?? '').trim())
  if (crmWords.length < 2) return null
  const crmSorted = [...crmWords].sort().join(' ')
  for (const row of rows) {
    const rowWords = words(String(row.full_name ?? '').trim())
    if (rowWords.length < 2) continue
    if ([...rowWords].sort().join(' ') === crmSorted) return row
    const [crmFirst, crmLast] = [crmWords[0], crmWords[crmWords.length - 1]]
    const [rowFirst, rowLast] = [rowWords[0], rowWords[rowWords.length - 1]]
    if (
      crmLast.length >= 2 &&
      crmLast === rowLast &&
      crmFirst[0] === rowFirst[0] &&
      (crmFirst.length === 1 || rowFirst.length === 1)
    ) {
      return row
    }
  }
  return null
}

/**
 * #1995 — les lignes CRM presence à ajouter à `contactsSummary`, dédoublonnées
 * contre ce qui y figure déjà (`alreadyIncludedIds`). Un contact résolu porte
 * son `contact_id` sous la mention « déjà dans votre CRM » ; un contact NON
 * résolu reste nommé SANS id — honnête, jamais un identifiant inventé — et sa
 * ligne le dit : « fiche Bellum absente ».
 */
function crmPresenceContactLines<T extends Parameters<typeof contactIdentityLine>[0] & { id?: unknown }>(
  crmContacts: readonly CrmPresenceContact[],
  rows: readonly T[],
  alreadyIncludedIds: ReadonlySet<string>,
): { lines: string[]; withoutRecord: CrmContactWithoutBellumRecord[] } {
  const seen = new Set(alreadyIncludedIds)
  const lines: string[] = []
  const withoutRecord: CrmContactWithoutBellumRecord[] = []
  for (const crmContact of crmContacts) {
    const matched = resolveCrmContactToBellum(crmContact, rows)
    if (matched) {
      const id = typeof matched.id === 'string' ? matched.id.trim() : ''
      if (!id || seen.has(id)) continue
      seen.add(id)
      lines.push(`${contactIdentityLine(matched)} - déjà dans votre CRM - contact_id: ${id}`)
      continue
    }
    const label = (crmContact.name ?? '').trim() || (crmContact.email ?? '').trim()
    if (!label) continue
    const jobTitle = (crmContact.jobTitle ?? '').trim()
    // #4055 — vraiment nouvelle, ou doublon probable d'une fiche Bellum : la ligne le dit, sans fusionner.
    const duplicate = probableBellumDuplicate(crmContact, rows)
    const duplicateName = duplicate ? String(duplicate.full_name ?? '').trim() : ''
    // Jamais son `contact_id` ici : un identifiant d'une AUTRE personne possible serait pire qu'aucun (#1995).
    const duplicateNote = duplicateName
      ? ` - doublon probable de « ${duplicateName} », à vérifier, jamais fusionné`
      : ''
    lines.push(
      `${label}${jobTitle ? ` - ${jobTitle}` : ''} - déjà dans votre CRM, fiche Bellum absente${duplicateNote}`,
    )
    // Les mêmes faits, BRUTS. La ligne ci-dessus est du texte pour l'humain —
    // elle ne porte ni l'e-mail ni la référence de la ligne d'origine, et
    // l'outil de création en a besoin champ par champ.
    withoutRecord.push({
      fullName: (crmContact.name ?? '').trim() || null,
      jobTitle: jobTitle || null,
      email: (crmContact.email ?? '').trim() || null,
      crmReference: (crmContact.id ?? '').trim() || null,
      probableDuplicateOf: duplicateName || null,
    })
  }
  return { lines, withoutRecord }
}

/**
 * #1995 — LES CHAMPS BRUTS D'UNE PERSONNE QUE SEUL LE CRM CONNECTÉ NOMME.
 *
 * La ligne « … déjà dans votre CRM, fiche Bellum absente » est un texte : elle
 * dit QUI, pas COMMENT créer la fiche. `create_contact_from_crm_presence`
 * (`apps/ia/app/services/chat_tools.py`) attend un nom, un poste, un e-mail et
 * la référence de la ligne d'origine — aucun ne tient dans cette phrase sans
 * la réécrire, et la réécrire casserait le compte de lignes du panneau de
 * transparence (`context_transparency._count_lines` annonce « N contacts »).
 * Les faits voyagent donc À CÔTÉ, dans le bloc de présence CRM.
 */
type CrmContactWithoutBellumRecord = {
  fullName: string | null
  jobTitle: string | null
  email: string | null
  crmReference: string | null
  /** #4055 — le nom de la fiche Bellum dont cette personne est un doublon probable ; `null` = vraiment nouvelle. */
  probableDuplicateOf: string | null
}

/**
 * #1995 — le bloc qui donne au modèle de quoi APPELER l'outil de création.
 *
 * Rendu seulement quand il y a quelque chose à dire : aucune personne sans
 * fiche ⇒ chaîne inchangée, au byte près, donc prompt inchangé. Aucun nom de
 * fournisseur — « votre CRM » est la capacité, le produit est à nous (D354).
 * Un champ absent est ABSENT : jamais un `-` ni une chaîne vide qui se
 * lirait comme « pas d'e-mail vérifié ».
 */
function withCrmContactsWithoutRecord(
  digest: string | null,
  withoutRecord: readonly CrmContactWithoutBellumRecord[],
  accountId: string,
): string | null {
  const nameable = withoutRecord.filter(c => (c.fullName ?? '').trim().length > 0)
  if (nameable.length === 0) return digest
  const lines = nameable.map(contact => {
    const parts = [`nom: ${contact.fullName}`]
    if (contact.jobTitle) parts.push(`poste: ${contact.jobTitle}`)
    if (contact.email) parts.push(`email: ${contact.email}`)
    if (contact.crmReference) parts.push(`crm_reference: ${contact.crmReference}`)
    parts.push(`account_id: ${accountId}`)
    if (contact.probableDuplicateOf) parts.push(`doublon_probable_de: ${contact.probableDuplicateOf}`)
    return `- ${parts.join(' | ')}`
  })
  // #4055 — seulement si une ligne en porte : sinon le bloc reste identique au byte près.
  const duplicateRule = nameable.some(c => c.probableDuplicateOf)
    ? [
        '`doublon_probable_de` présent = PAS une personne nouvelle : dis-le, propose de vérifier la fiche',
        'Bellum nommée avant toute création ; on ne fusionne jamais. Sans ce champ, la personne est nouvelle.',
      ]
    : []
  const block = [
    'Personnes connues de votre CRM SANS fiche Bellum — aucun contact_id ne peut exister pour elles.',
    "Pour poser un rappel, préparer un message ou enrichir l'une d'elles, appelle d'abord",
    '`create_contact_from_crm_presence` avec les champs ci-dessous (la fiche est créée au clic de',
    "l'utilisateur, et c'est SEULEMENT après qu'un contact_id existe) :",
    // #1995 bis — constat en prod (46df969d7, 17/09) : « Rappelle-moi de relancer
    // X demain » sur une telle personne faisait REFUSER Laura entièrement, sans
    // même proposer cette création. `create_contact_from_crm_presence` accepte
    // maintenant `reminder_at`/`reminder_note` : la même proposition porte le
    // rappel demandé, prêt dès que la fiche existe — jamais un second tour de
    // modèle ni une phrase qui renvoie l'utilisateur ouvrir un autre écran.
    'Si la demande portait AUSSI un rappel sur cette personne, passe `reminder_at`',
    '(date ISO absolue, résous toi-même « demain », « lundi »…) et `reminder_note` :',
    'le rappel sera proposé juste après la création, dans la même réponse.',
    ...duplicateRule,
    ...lines,
  ].join('\n')
  return digest ? `${digest}\n${block}` : block
}

/** #3384.1 — un entier ≥ 0 DÉCLARÉ, sinon `null` : jamais un 0 fabriqué pour une absence. */
function declaredCount(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null
}

/** #3384.1 — « N consultant(s) disponible(s) », tel que le responsable de BU l'a déclaré. */
function availableConsultantsLabel(value: number | null | undefined): string | null {
  const count = declaredCount(value)
  return count === null ? null : `${count} consultant${count > 1 ? 's' : ''} disponible${count > 1 ? 's' : ''}`
}

@Injectable()
export class ChatContextService {
  constructor(
    private readonly accounts: AccountsService,
    private readonly contacts: ContactsService,
    private readonly esnProfile: EsnProfileReader,
    private readonly memory: MemoryService,
    @InjectRepository(CrmConnectionEntity)
    private readonly crmConnections: Repository<CrmConnectionEntity>,
    // Presence read-back (roadmap §8/§9). `@Optional()` keeps plain-constructor
    // specs (and any context without CrmModule) working — absent = no lookup.
    @Optional() private readonly crmRead?: CrmReadService,
    // Mémoire de corrections (feedback loop A2). `@Optional()` pour la même
    // raison — absent = pas de lookup, contexte inchangé.
    @Optional() private readonly accountFeedbackService?: AccountFeedbackService,
    // Registre d'outils (Tool Registry v2). `@Optional()` pour la même raison —
    // absent = pas de digest outils, contexte inchangé.
    @Optional() private readonly toolRegistry?: ToolRegistryService,
    // #3272.6 — REX de perte du compte, par JETON (GA-07, voir `module-tokens.ts`).
    @Optional()
    @Inject(LOST_DEAL_REX_CONTEXT)
    private readonly lostDealRexReader?: LostDealRexContextReader,
    // #3295 — règles apprises de l'espace, par JETON (GA-07).
    @Optional()
    @Inject(WORKSPACE_LEARNED_RULES_CONTEXT)
    private readonly learnedRulesReader?: WorkspaceLearnedRulesContextReader,
    // #3390.10/.11 — la méthode retenue du besoin ouvert, par JETON (GA-07).
    @Optional()
    @Inject(COMMERCIAL_METHOD_CONTEXT)
    private readonly commercialMethodReader?: CommercialMethodContextReader,
    // #4071.1 — les faits du compte (socle #4069), par JETON (GA-07).
    @Optional()
    @Inject(ACCOUNT_FACTS_CONTEXT)
    private readonly accountFactsReader?: AccountFactsContextReader,
    // #4071.3 — recherches enregistrées, listes de cibles, conversations passées, par JETON (GA-07).
    @Optional()
    @Inject(WORKSPACE_RECALL_CONTEXT)
    private readonly recallReader?: WorkspaceRecallContextReader,
    // #4759 — l'agrégat daté de l'historique des besoins de chaque compte, par JETON (GA-07).
    @Optional()
    @Inject(NEEDS_HISTORY_CONTEXT)
    private readonly needsHistoryReader?: NeedsHistoryContextReader,
  ) {}

  async build(args: {
    userId: string
    workspaceId: string
    accountId?: string | null
    conversationId?: string | null
    /**
     * #2430.2 — le fil d'ORIGINE quand cette conversation est une branche
     * (`ChatConversationsService.parentOf`, lu par le CONTRÔLEUR). Son résumé
     * roulant — celui de la même personne — suit le résumé de la branche.
     */
    parentConversationId?: string | null
    /**
     * #1918.2 — LES PÉRIMÈTRES QUE LA PERSONNE PORTE, lus par le CONTRÔLEUR.
     *
     * En argument et non par injection, pour la même raison que
     * `marketPortfolio` juste en dessous : `BusinessUnitService` vit dans un
     * autre module et GA-07 refuse qu'un service aille en chercher un. Absent
     * ou vide = aucune mémoire d'équipe dans ce prompt (repli FERMÉ).
     */
    businessUnitIds?: readonly string[]
    /**
     * #2259.30 / #2259.32 / #2259.33 / #2259.34 / #2259.35 — LES FICHES des BU
     * ci-dessus (`businessUnitIds`), lues par le CONTRÔLEUR
     * (`BusinessUnitService.findByIds`) pour la MÊME raison que
     * `businessUnitIds` : `BusinessUnitService` vit dans un autre module,
     * GA-07 refuse que ce service aille le chercher. Absent/vide = aucun
     * contexte de BU dans le prompt (propriétaire sans BU, `perimetersOf`
     * rend `[]`).
     */
    businessUnitDetails?: readonly BusinessUnitDetailInput[]
    /**
     * #2259.4 / #2259.13 — LE RÔLE D'ESPACE DE L'APPELANT (RBAC), déjà résolu
     * par le CONTRÔLEUR (`resolveActiveWorkspace`, même appel qui rend
     * `workspaceId`) — GA-07 : ce service ne va chercher aucun rôle lui-même,
     * il le PORTE. Absent = `null` (tests, route MCP) : aucune ligne
     * « fonction dans l'espace » ni « propriétaire du compte » dans le prompt.
     */
    role?: string | null
    /** The user's message — lets the shared thread resolve an account named in the
     *  text ("regarde l'analyse … pour SNCF") and pull its full analysis. */
    message?: string | null
    /**
     * #2428.12 — L'IDENTIFIANT CANONIQUE d'un collègue mentionné, choisi dans
     * le menu « Mentionner un membre » du composeur (jamais deviné depuis le
     * texte). `resolveMentionedColleague` le préfère à l'heuristique par
     * prénom quand il est fourni ; `null`/absent = client ancien, ou mention
     * tapée à la main — l'heuristique reste le repli, jamais retirée.
     */
    mentionedUserId?: string | null
    /**
     * #1581.1 — LA COUVERTURE MÉMOIRE MARCHÉ DU PORTEFEUILLE, LUE PAR LE CONTRÔLEUR.
     *
     * Elle arrive en ARGUMENT et non par injection, et ce n'est pas un détail de
     * style : `MarketMemoryService` vit dans un autre module, et GA-07 refuse
     * qu'un service aille en chercher un — deux lots l'ont déjà appris
     * (`coverage.controller.ts`, `companies.controller.ts`). Un tour de chat est
     * un geste d'utilisateur, donc son orchestration appartient au contrôleur.
     *
     * `undefined` = personne n'a lu (contexte de test, module absent) ;
     * `status: 'unavailable'` = la lecture a échoué. Les deux se disent, aucun ne
     * se rend en zéro.
     */
    marketPortfolio?: MarketPortfolioRead | null
    /**
     * #3772.5 — EXCLUSION STRICTE : ni portefeuille, ni compte résolu depuis le
     * texte. `accountsSummary` et `readablePortfolio` restent `null` — l'écran
     * dit « non lu », jamais un portefeuille vide présenté comme lu.
     */
    excludeWorkspaceData?: boolean
  }): Promise<ChatContext> {
    const {
      userId,
      workspaceId,
      accountId = null,
      conversationId = null,
      parentConversationId = null,
      message = null,
      mentionedUserId = null,
      marketPortfolio = null,
      businessUnitIds = [],
      businessUnitDetails = [],
      role = null,
      excludeWorkspaceData = false,
    } = args
    // #2259.4 / #2259.13 — porté, jamais recalculé (voir le docblock de `role`
    // dans les args ci-dessus).
    const workspaceRole = role
    const isAccountOwner = workspaceRole === 'owner'
    // The ESN profile is always resolved — the copilote is profile-aware even
    // without an active account (e.g. "quels comptes prioriser cette semaine ?").
    // The CRM connection state is resolved in the same pass so the transparency
    // panel can state « CRM non connecté » from real data (P0), not a guess.
    const [
      profileData,
      memory,
      crmState,
      toolsSummary,
      firstName,
      lastName,
      mentionedColleague,
      timezone,
      workspaceTimezone,
      workspaceCreatedAt,
      workspaceLastSyncAt,
      businessUnits,
      workspaceLearnedRulesContext,
    ] = await Promise.all([
      this.esnProfile.resolveProfileData(userId) as Promise<Record<string, unknown>>,
      this.loadMemory({ userId, workspaceId, accountId, conversationId, parentConversationId, businessUnitIds }),
      this.resolveCrmState(workspaceId),
      this.resolveToolsSummary(userId),
      this.resolveFirstName(userId),
      this.resolveLastName(userId),
      this.resolveMentionedColleague(workspaceId, userId, message, mentionedUserId),
      this.resolveTimezone(userId),
      this.resolveWorkspaceTimezone(workspaceId),
      this.resolveWorkspaceCreatedAt(workspaceId),
      this.resolveWorkspaceLastSyncAt(workspaceId),
      this.resolveBusinessUnitContext(workspaceId, businessUnitDetails),
      this.learnedRulesReader ? this.learnedRulesReader(workspaceId) : Promise.resolve(null),
    ])
    // #4071.3 — ce que l'espace a gardé (recherches, listes, conversations passées). « Sans les données
    // de l'espace » ne lit RIEN de l'espace (#3853) ; une lecture en échec laisse Laura répondre sans.
    const workspaceRecallContext =
      this.recallReader && !excludeWorkspaceData
        ? await this.recallReader({ workspaceId, userId, excludeConversationId: conversationId }).catch(() => null)
        : null
    // An explicit accountId wins; otherwise try to resolve one named in the message
    // so the shared "Copilote partagé" thread can answer about a specific account.
    const resolvedId = excludeWorkspaceData
      ? null
      : (accountId ?? (await this.resolveAccountByName(workspaceId, message)))
    if (!resolvedId) {
      // No active/named account → give the copilote the workspace portfolio so it
      // can still answer "quels comptes prioriser ?" instead of "profil vide"
      // (Théo §13 — le chat reçoit workspace + comptes server-side).
      const { summary: accountsSummary, portfolio } = excludeWorkspaceData
        ? { summary: null, portfolio: null }
        : await this.buildAccountsSummary(workspaceId, marketPortfolio)
      return {
        accountData: null,
        contactsSummary: null,
        planSummary: null,
        accountsSummary,
        readablePortfolio: portfolio,
        profileData,
        ...memory,
        ...crmState,
        crmPresence: null,
        crmUnavailable: false,
        accountFeedback: null,
        lostDealRexContext: null,
        workspaceLearnedRulesContext,
        workspaceRecallContext,
        toolsSummary,
        internalCapabilitiesSummary: this.resolveInternalCapabilitiesSummary(),
        firstName,
        lastName,
        workspaceRole,
        isAccountOwner,
        mentionedColleague,
        businessUnits,
        timezone,
        workspaceTimezone,
        workspaceCreatedAt,
        workspaceLastSyncAt,
      }
    }
    const [accountResult, contactRows] = await Promise.all([
      this.accounts.findOne(resolvedId, userId),
      this.contacts.findByAccount(resolvedId, userId),
    ])
    const account = isSuccess(accountResult) ? accountResult.output : null
    if (!account) {
      // A name match that fails ownership/load must degrade to the portfolio, not 500.
      const { summary: accountsSummary, portfolio } = await this.buildAccountsSummary(workspaceId, marketPortfolio)
      return {
        accountData: null,
        contactsSummary: null,
        planSummary: null,
        accountsSummary,
        readablePortfolio: portfolio,
        profileData,
        ...memory,
        ...crmState,
        crmPresence: null,
        crmUnavailable: false,
        accountFeedback: null,
        lostDealRexContext: null,
        workspaceLearnedRulesContext,
        workspaceRecallContext,
        toolsSummary,
        internalCapabilitiesSummary: this.resolveInternalCapabilitiesSummary(),
        firstName,
        lastName,
        workspaceRole,
        isAccountOwner,
        mentionedColleague,
        businessUnits,
        timezone,
        workspaceTimezone,
        workspaceCreatedAt,
        workspaceLastSyncAt,
      }
    }
    const accountData = account as unknown as Record<string, unknown>
    // BEL-SC-226 (#3255) — la PROJECTION 5P du compte, jamais un second objet
    // (maison canonique `AccountStrategy5P`, BEL-SC-225) : la seule chose que
    // le pipeline de raisonnement de Laura a besoin de savoir pour décider s'il
    // y a une objection méthodologique à faire est OÙ en est le compte
    // (`readiness`) et QUELLE dimension le mérite ensuite
    // (`next_action_dimension`) — jamais les cinq P entiers (« pas de document
    // complet exposé », spec TRANSPARENCE). Dérivée ici, sur les données DÉJÀ
    // chargées pour ce tour (`account.raw_analysis`, `contactRows`) — jamais un
    // second aller-retour base : `AccountStrategy5PService.strategyFor`
    // refait exactement ces deux lectures, ce chemin les a déjà.
    const strategy5PContacts: AccountStrategy5PContactInput[] = contactRows.map(contact => ({
      id: contact.id,
      full_name: contact.full_name,
      title: contact.title,
      decision_role: decisionRoleSchema.safeParse(contact.decision_role).data ?? null,
    }))
    const strategy5P = deriveAccountStrategy5P({
      accountId: account.id,
      analysis: parseAccountAnalysis(account.raw_analysis),
      contacts: strategy5PContacts,
    })
    accountData.strategy5p = {
      readiness: strategy5P.readiness,
      next_action_dimension: strategy5P.next_action_dimension,
    }
    // #3285 — l'ÉTAT DE RELATION du compte (froid / dormant / ancien client…),
    // lu par la même fonction que la fiche compte : la route « ouverture de
    // compte fermé » du reçu de réponse en dérive. Absent = clé absente.
    const relationshipState = readRelationshipState(account.raw_analysis)
    if (relationshipState) accountData.relationship_state = relationshipState
    // L'identité passe par `contactIdentityLabel` : le copilote écrivait
    // « Maximilian » — un prénom seul — exactement comme il aurait écrit un nom
    // complet. Un modèle ne peut pas deviner qu'une chaîne est tronquée ; les
    // écrans, eux, badgent ces contacts « Nom à révéler » depuis longtemps.
    // #1995 — l'identifiant voyage AVEC le nom, sur la MÊME ligne.
    // Laura annonçait « je peux te poser un rappel sur Sarah Martin », puis
    // l'outil échouait : quatre outils du copilote — `prepare_message_for_contact`,
    // `schedule_reminder_for_contact`, `enrich_contact`, `export_contact_to_crm` —
    // exigent un `contact_id` (UUID), aucun des 54 ne résout un nom vers un
    // identifiant, et ce résumé ne portait QUE des noms. Elle proposait donc un
    // geste qu'elle ne pouvait pas exécuter.
    // Le dépôt avait déjà tranché la même question pour l'objet voisin :
    // `accountData` (ci-dessus) porte l'`id` complet de la ligne. Porter l'`id`
    // ici plutôt qu'ajouter un outil de résolution évite deux mécanismes pour une
    // seule question. Le libellé `contact_id:` est celui de l'argument attendu —
    // c'est ce qui permet au modèle de relier le nom qu'il lit à l'appel.
    // Doctrine `c58_criteres_proteges` : un `id` est de l'IDENTITÉ (le livrable
    // DÉSIGNE la personne), exception NOMMÉE — rien d'autre n'entre au passage.
    // Un identifiant illisible ne s'invente pas : la ligne reste sans lui.
    // Et il reste UNE ligne par contact — `context_transparency._count_lines`
    // annonce « N contacts » en comptant les lignes non vides.
    //
    // #1995 (RÉOUVERTE) — la personne NOMMÉE entre, où qu'elle soit classée.
    // La fenêtre classée montre les vingt-cinq plus actionnables (D15) ; le
    // message, lui, désigne QUI l'utilisateur veut relancer, et sur un dossier
    // de 2 027 contacts ce n'est presque jamais l'un des vingt-cinq.
    //
    // Elle passe en TÊTE, et ce n'est pas cosmétique : `fit_to_budget`
    // (`apps/ia/app/prompts/context_budget.py`) rogne la QUEUE — `t[:remaining]`.
    // Placée 26e, sa ligne est la PREMIÈRE sacrifiée quand le plan et la
    // base de connaissance sont pleins, donc l'identifiant redeviendrait
    // manquant précisément sur les gros dossiers, ceux du défaut.
    const rankedRows = contactRows.slice(0, CONTACTS_RANKED_WINDOW)
    const rankedIds = new Set(rankedRows.map(c => (typeof c.id === 'string' ? c.id.trim() : '')))
    const namedRows = contactsNamedIn(message, contactRows)
      .filter(c => !rankedIds.has(String(c.id).trim()))
      .slice(0, CONTACTS_NAMED_MAX)
    // Presence read-back (roadmap §8/§9) : with an ACTIVE account and a connected
    // CRM, ask the CRM whether the team is already in relation with this group.
    // Résolue ICI (avant `contactsSummary`, pas plus bas) — #1995 a besoin de
    // `presence.contacts` pour le rapprochement vers la fiche Bellum, AVANT sa
    // mise en forme en texte pour le panneau de transparence.
    const { raw: crmPresenceRaw, unavailable: crmUnavailable } = await this.resolveCrmPresenceRaw(
      userId,
      crmState.crmConnected,
      accountData,
    )
    const includedIds = new Set([...rankedIds, ...namedRows.map(c => String(c.id).trim())])
    const crmPresenceContacts = crmPresenceRaw
      ? crmPresenceContactLines(crmPresenceRaw.contacts, contactRows, includedIds)
      : { lines: [], withoutRecord: [] }
    // #3243 — seule la personne NOMMÉE dans le message ET `historique` (partie du
    // compte) est marquée : une partie non visée ne déclenche aucun challenge.
    const allNamed = contactsNamedIn(message, contactRows)
    const namedIds = new Set(allNamed.map(c => String(c.id).trim()))
    const departedNamedIds = new Set(
      allNamed
        .filter(c => (c as { lifecycle_state?: string | null }).lifecycle_state === 'historique')
        .map(c => String(c.id).trim()),
    )
    const summaryLine = (c: (typeof contactRows)[number]) =>
      contactSummaryLine(c, namedIds.has(String(c.id).trim()), departedNamedIds.has(String(c.id).trim()))
    const contactsSummary =
      [...namedRows.map(summaryLine), ...rankedRows.map(summaryLine), ...crmPresenceContacts.lines].join('\n') || null
    const planSummary = planSummaryOf(account.raw_analysis)
    // #1995 — le digest de présence, PUIS les champs bruts des personnes sans
    // fiche. Même canal (`crm_presence`), donc aucun étage de plus à traverser
    // entre la lecture du CRM et l'outil qui en a besoin.
    const crmPresence = withCrmContactsWithoutRecord(
      crmPresenceRaw ? formatCrmPresence(crmPresenceRaw, account.company_name) : null,
      crmPresenceContacts.withoutRecord,
      resolvedId,
    )
    // Mémoire de corrections (A2) : les retours utilisateur du workspace sur
    // cette entreprise, condensés — le copilote en tient compte au lieu de
    // re-proposer un play jugé hors sujet ou un contact signalé parti.
    const accountFeedback = await this.resolveAccountFeedback(account)
    // #3272.6 — REX de perte du compte, condensés (jamais mot pour mot) : Laura
    // peut dire « ce compte a déjà été perdu après telle route » quand elle en
    // prépare une nouvelle. `null` sans lecteur câblé ou sans aucun REX connu.
    // #3546.1 — enrichissement, jamais une condition du tour : une lecture qui
    // échoue (table pas encore migrée, ligne illisible) laisse Laura répondre
    // SANS ce REX, au lieu d'un 500 avant l'ouverture du flux. Absent ≠ inventé.
    const lostDealRexContext = this.lostDealRexReader ? await this.lostDealRexReader(account).catch(() => null) : null
    // #3390.10/.11 — la méthode retenue pour le besoin ouvert de CE compte, lue
    // pour CE lecteur (sa charge). Enrichissement : une lecture en échec laisse
    // Laura répondre sans, jamais avec une méthode devinée.
    const commercialMethodContext = this.commercialMethodReader
      ? await this.commercialMethodReader({ workspaceId, accountId: account.id, userId }).catch(() => null)
      : null
    // #4071.1 — les faits du compte du socle (#4069), pour CE lecteur (ses
    // documents personnels, jamais ceux d'un collègue — #4071.4). Enrichissement,
    // jamais une condition du tour : une lecture en échec laisse Laura répondre sans.
    const accountFactsContext = this.accountFactsReader
      ? await this.accountFactsReader({ workspaceId, accountId: account.id, userId }).catch(() => null)
      : null
    return {
      accountData,
      contactsSummary,
      planSummary,
      accountsSummary: null,
      // Un dossier est ouvert : le portefeuille n'a pas été lu pour ce tour.
      readablePortfolio: null,
      profileData,
      ...memory,
      ...crmState,
      crmPresence,
      crmUnavailable,
      accountFeedback,
      lostDealRexContext,
      commercialMethodContext,
      accountFactsContext,
      workspaceLearnedRulesContext,
      workspaceRecallContext,
      toolsSummary,
      internalCapabilitiesSummary: this.resolveInternalCapabilitiesSummary(),
      firstName,
      lastName,
      workspaceRole,
      isAccountOwner,
      mentionedColleague,
      businessUnits,
      timezone,
      workspaceTimezone,
      workspaceCreatedAt,
      workspaceLastSyncAt,
    }
  }

  /**
   * Le prénom de la personne, ou `null`.
   *
   * Best-effort et silencieux : une lecture ratée doit rendre un copilote sans
   * prénom, jamais une conversation qui échoue. C'est la moitié de la promesse
   * de Laura — l'autre moitié est de ne pas le redemander.
   */
  private async resolveFirstName(userId: string): Promise<string | null> {
    try {
      // Lecture par le manager de la connexion déjà injectée : injecter un
      // repository de plus pour lire une colonne obligerait chaque spec à
      // constructeur nu à en simuler un.
      //
      // #2259.10 — `WHERE user_id = $1`, pas `id` : `profiles.id` est un
      // SUBSTITUT généré (`1780000000000-OnboardingProfilesSchema`, docblock de
      // `ProfileEntity`), distinct de `user_id`. Le prédicat d'avant ne pouvait
      // donc jamais trouver la ligne : le prénom injecté à Laura restait
      // toujours vide. `resolveTimezone`, juste en dessous, a toujours eu le
      // bon prédicat — c'est lui qui prouve que ce n'était pas voulu.
      const rows = (await this.crmConnections.manager.query(`SELECT first_name FROM profiles WHERE user_id = $1`, [
        userId,
      ])) as Array<{ first_name: string | null }>
      return rows[0]?.first_name?.trim() || null
    } catch {
      return null
    }
  }

  /**
   * #2259.11 — LE NOM DE FAMILLE, ou `null`. Même discipline que
   * {@link resolveFirstName} juste au-dessus (best-effort, silencieux,
   * `WHERE user_id = $1` — pas `id`, colonne substitut).
   */
  private async resolveLastName(userId: string): Promise<string | null> {
    try {
      const rows = (await this.crmConnections.manager.query(`SELECT last_name FROM profiles WHERE user_id = $1`, [
        userId,
      ])) as Array<{ last_name: string | null }>
      return rows[0]?.last_name?.trim() || null
    } catch {
      return null
    }
  }

  /**
   * #2259.6 — UN COLLÈGUE DE L'ESPACE cité par son prénom dans le message, ou
   * `null`.
   *
   * Même rapprochement nom-dans-message que {@link contactsNamedIn} pour les
   * contacts d'un compte : bord de mot, et un nom qui désigne deux collègues
   * n'en désigne aucun (homonymes). Le référentiel n'est PAS celui des
   * contacts (personnes externes) — c'est `workspace_members` × `profiles`,
   * les collègues RÉELS de cet espace, pour ne jamais confondre un collègue
   * cité avec un contact externe (#2259.6, LAU-FINAL-004).
   *
   * Le rapprochement se fait sur le PRÉNOM seul, pas le nom complet : un
   * collègue se cite « avec Théo », jamais « avec Théo Martin » — même usage
   * que le prénom partout ailleurs dans ce fichier (#2259.10).
   *
   * Best-effort et silencieux, pour la même raison que {@link resolveFirstName} :
   * une lecture ratée rend `null`, jamais une conversation qui échoue.
   *
   * #2428.12 — `mentionedUserId` (choisi au clic, menu « Mentionner un
   * membre ») saute cette heuristique quand il est fourni : une lecture par
   * ID ne peut pas confondre deux homonymes, contrairement au rapprochement
   * texte. `null`/absent (mention tapée à la main, client ancien, ou id
   * fourni mais introuvable — retiré de l'espace) retombe sur l'heuristique,
   * jamais rendu `null` sur un message qui nomme peut-être quelqu'un.
   */
  private async resolveMentionedColleague(
    workspaceId: string,
    userId: string,
    message: string | null,
    mentionedUserId: string | null = null,
  ): Promise<string | null> {
    if (mentionedUserId) {
      try {
        const rows = (await this.crmConnections.manager.query(
          `SELECT p.first_name as full_name
           FROM workspace_members wm
           JOIN profiles p ON p.user_id = wm.user_id
           WHERE wm.workspace_id = $1 AND wm.user_id = $2 AND wm.user_id != $3 AND p.first_name IS NOT NULL`,
          [workspaceId, mentionedUserId, userId],
        )) as Array<{ full_name: string | null }>
        const canonical = rows[0]?.full_name?.trim() || null
        if (canonical) return canonical
      } catch {
        // best-effort — retombe sur l'heuristique par texte ci-dessous.
      }
    }
    if (!message || !message.trim()) return null
    try {
      const rows = (await this.crmConnections.manager.query(
        `SELECT wm.user_id as id, p.first_name as full_name
         FROM workspace_members wm
         JOIN profiles p ON p.user_id = wm.user_id
         WHERE wm.workspace_id = $1 AND wm.user_id != $2 AND p.first_name IS NOT NULL`,
        [workspaceId, userId],
      )) as Array<{ id: string; full_name: string | null }>
      const named = contactsNamedIn(message, rows)
      return named[0]?.full_name?.trim() || null
    } catch {
      return null
    }
  }

  /**
   * #2259.30 / #2259.32 / #2259.33 / #2259.34 / #2259.35 — LE CONTEXTE DE BU
   * ENVOYÉ À LAURA (DÉCISION Louis 17/09 après-midi).
   *
   * Pour chaque BU PORTÉE (fiche fournie par le contrôleur, {@link
   * BusinessUnitDetailInput}) : ce que l'espace sait déjà (territoire,
   * spécialités) ; #3384.1 — la couche BU DÉCLARÉE par le responsable (consultants
   * disponibles → `capacity`, objectif du trimestre, consultants, effectif de
   * l'équipe commerciale), `null` quand elle ne l'est pas — ce service n'en
   * INVENTE aucune ; le nombre RÉEL de comptes rattachés
   * (`AccountsService.countByBusinessUnit`, `0` compris — une mesure) ;
   * `referenceCount` toujours `null` — aucune colonne ne rattache une
   * référence à une BU dans le schéma actuel (#2259.34), donc rien à compter,
   * jamais un `0` qui se lirait comme une mesure.
   *
   * `[]` en entrée ⇒ `[]` en sortie : propriétaire sans BU, rien n'est dit.
   */
  private async resolveBusinessUnitContext(
    workspaceId: string,
    details: readonly BusinessUnitDetailInput[],
  ): Promise<BusinessUnitContextItem[]> {
    return Promise.all(
      details.map(async bu => ({
        name: bu.name,
        territory: bu.territory,
        specialties: bu.specialties,
        // #3384.1 — les colonnes du lot CP2 existent désormais : ce que le
        // responsable de BU a DÉCLARÉ part au prompt, le reste reste `null`.
        capacity: availableConsultantsLabel(bu.capacityAvailableConsultants),
        quarterObjective: bu.quarterObjective?.trim() || null,
        accountCount: await this.accounts.countByBusinessUnit(workspaceId, bu.id),
        consultantCount: declaredCount(bu.consultantCount),
        referenceCount: null,
        teamSize: declaredCount(bu.teamSize),
      })),
    )
  }

  /**
   * LE FUSEAU DE LA PERSONNE, ou `null` (décision Louis, 14/09/2026).
   *
   * Best-effort et silencieux, pour la même raison que le prénom juste
   * au-dessus : une lecture ratée doit rendre un tour de copilote avec le
   * fuseau de RÉFÉRENCE du produit, jamais une conversation qui échoue. `null`
   * ⇒ clé omise sur le fil ⇒ `REFERENCE_TIMEZONE` côté service IA, donc le
   * comportement exact d'avant ce lot.
   *
   * ⚠️ `WHERE user_id = $1`, comme les sept autres lectures brutes de
   * `profiles` du dépôt (`accounts.service.ts:4099`,
   * `laura-probe.service.ts:350`, `staffing.service.ts:500`,
   * `activity-capture.service.ts:411`, `activities.service.ts:463`,
   * `esn-profile-workspace.resolver.ts:164`) — et depuis #2259.10,
   * `resolveFirstName` juste au-dessus aussi : elle interrogeait `WHERE id = $1`,
   * or `profiles.id` est un SUBSTITUT généré, distinct de `user_id`
   * (`1780000000000-OnboardingProfilesSchema`, et le docblock de `ProfileEntity`
   * le dit) — cette lecture-là ne pouvait donc jamais trouver de ligne, et le
   * prénom injecté à Laura restait toujours vide.
   *
   * ⚠️ PUBLIQUE depuis #1955.18 : l'export d'un fil (`ia-proxy.controller.ts`,
   * `exportChatThreadMarkdown`/`exportChatThreadPdf`) la réutilise pour
   * afficher une date au fuseau de l'utilisateur — la MÊME dérivation que le
   * tour de chat, jamais une seconde lecture de `profiles.timezone`.
   */
  async resolveTimezone(userId: string): Promise<string | null> {
    try {
      const rows = (await this.crmConnections.manager.query(`SELECT timezone FROM profiles WHERE user_id = $1`, [
        userId,
      ])) as Array<{ timezone: string | null }>
      return rows[0]?.timezone?.trim() || null
    } catch {
      return null
    }
  }

  /**
   * #1958.2 — LE FUSEAU DE L'ESPACE, ou `null`. Même discipline que
   * {@link resolveTimezone} juste au-dessus (best-effort, silencieux) et lu en
   * SQL brut pour la même raison : GA-07 refuse qu'un service de ce module
   * aille chercher `WorkspaceTimezoneService` (module `workspace`) — un tour de
   * chat est un geste d'utilisateur, son orchestration reste ICI.
   *
   * `WHERE id = $1` (et non `user_id`) : `workspaceId` DÉSIGNE déjà la ligne
   * `workspaces`, contrairement au `userId` des lectures `profiles` voisines.
   */
  async resolveWorkspaceTimezone(workspaceId: string): Promise<string | null> {
    try {
      const rows = (await this.crmConnections.manager.query(`SELECT timezone FROM workspaces WHERE id = $1`, [
        workspaceId,
      ])) as Array<{ timezone: string | null }>
      return rows[0]?.timezone?.trim() || null
    } catch {
      return null
    }
  }

  /**
   * #2266.8 (épopée #2920) — DEPUIS QUAND cet espace utilise Bellum, ou
   * `null`. Même discipline que {@link resolveWorkspaceTimezone} juste
   * au-dessus (best-effort, silencieux, SQL brut — GA-07 : un tour de chat
   * reste orchestré ICI, jamais par le module `workspace`).
   */
  async resolveWorkspaceCreatedAt(workspaceId: string): Promise<string | null> {
    try {
      const rows = (await this.crmConnections.manager.query(`SELECT created_at FROM workspaces WHERE id = $1`, [
        workspaceId,
      ])) as Array<{ created_at: Date | string | null }>
      const createdAt = rows[0]?.created_at
      if (!createdAt) return null
      return createdAt instanceof Date ? createdAt.toISOString() : createdAt
    } catch {
      return null
    }
  }

  /**
   * #2266.10 (épopée #2920) — LA DERNIÈRE COLLECTE RÉUSSIE de cet espace, ou
   * `null`. Même discipline que {@link resolveWorkspaceCreatedAt} juste
   * au-dessus (best-effort, silencieux, SQL brut — GA-07).
   *
   * Aucun signal de fraîcheur n'existe à l'échelle du WORKSPACE : seul
   * `collected_at` existe PAR SEGMENT PAR COMPTE (six colonnes,
   * `segment-catchup.service.ts`). `GREATEST` ignore les colonnes NULL par
   * ligne et ne rend NULL que si les six sont NULL pour un compte donné ;
   * `MAX` ignore ensuite les comptes sans aucune collecte connue. Le résultat
   * n'est `null` que si AUCUN compte de l'espace n'a jamais collecté quoi que
   * ce soit — jamais une date inventée pour combler l'absence.
   */
  async resolveWorkspaceLastSyncAt(workspaceId: string): Promise<string | null> {
    try {
      const rows = (await this.crmConnections.manager.query(
        `SELECT MAX(
           GREATEST(
             contacts_collected_at,
             signals_collected_at,
             entities_collected_at,
             strategy_collected_at,
             dossier_read_collected_at,
             addressability_relation_collected_at
           )
         ) AS last_sync
         FROM accounts
         WHERE workspace_id = $1`,
        [workspaceId],
      )) as Array<{ last_sync: Date | string | null }>
      const lastSync = rows[0]?.last_sync
      if (!lastSync) return null
      return lastSync instanceof Date ? lastSync.toISOString() : lastSync
    } catch {
      return null
    }
  }

  /**
   * Digest compact des outils connectés + coûts (Tool Registry v2). Best-effort :
   * sans service (spec à constructeur nu) ou sur erreur → null, jamais un chat
   * cassé. Le registre ne renvoie que des connexions RÉELLES — le copilote ne
   * proposera jamais un outil fantôme.
   */
  private async resolveToolsSummary(userId: string): Promise<string | null> {
    if (!this.toolRegistry) return null
    try {
      return await this.toolRegistry.chatToolsSummary(userId)
    } catch {
      return null // best-effort — the registry read must never break chat
    }
  }

  /**
   * #2261.21-32 — digest des HUIT capacités INTERNES (comptes, contacts,
   * besoins, vivier, missions, mémoire marché, DataForge, routines). Aucune
   * lecture de compte à faire : le seul signal mesuré aujourd'hui est le
   * kill-switch opérateur des routines (`ROUTINES_DISABLED`) — les sept autres
   * familles n'ont pas de coupure déclarée, donc `available: true` (jamais
   * « inconnu » rendu indisponible). Best-effort : une lecture d'environnement
   * qui échoue rend `null`, jamais un chat cassé.
   */
  private resolveInternalCapabilitiesSummary(): string | null {
    try {
      const routinesCut = killSwitchCut('routines.sweep')
      const descriptors = deriveInternalCapabilities({ routinesCut })
      return renderInternalCapabilityDigest(descriptors, descriptors.length)
    } catch {
      return null
    }
  }

  /**
   * Directives de correction pour le compte actif (A2). Best-effort : sans
   * service (spec à constructeur nu) ou sans feedback → null ; `directivesFor`
   * dégrade déjà en '' sur erreur de lecture — jamais un chat cassé.
   */
  private async resolveAccountFeedback(account: {
    id: string
    workspace_id?: string | null
    company_name: string
  }): Promise<string | null> {
    if (!this.accountFeedbackService) return null
    const directives = await this.accountFeedbackService.directivesFor({
      accountId: account.id,
      workspaceId: account.workspace_id ?? null,
      companyName: account.company_name,
    })
    return directives || null
  }

  /**
   * Cross the active account with the connected CRM (« X contacts déjà dans votre
   * CRM chez ce groupe, Y deals ouverts »). Best-effort: no CRM connected / no
   * read service / a CRM error → null, and the chat proceeds without it. The
   * summary only ever contains records the CRM itself returned.
   *
   * #1995 — renvoie l'objet BRUT (pas le texte déjà mis en forme) : `build()`
   * a besoin de `presence.contacts` pour résoudre chaque contact CRM vers sa
   * fiche Bellum AVANT que ce texte soit produit pour le panneau de
   * transparence (`formatCrmPresence`, appelé par l'appelant).
   */
  private async resolveCrmPresenceRaw(
    userId: string,
    crmConnected: boolean,
    accountData: Record<string, unknown>,
  ): Promise<{ raw: CrmPresence | null; unavailable: boolean }> {
    if (!crmConnected || !this.crmRead) return { raw: null, unavailable: false }
    const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)
    const name = str(accountData['company_name'])
    if (!name) return { raw: null, unavailable: false }
    try {
      const raw = await this.crmRead.findAccountPresence(userId, {
        account: name,
        domain: domainFromWebsite(str(accountData['website'])) ?? undefined,
        siren: str(accountData['siren']) ?? undefined,
      })
      return { raw, unavailable: false }
    } catch {
      // best-effort — the CRM read must never break chat, but #1915.11 keeps
      // the failure VISIBLE to the transparency panel instead of collapsing it
      // into "nothing found" (`crmPresence: null` on its own means both).
      return { raw: null, unavailable: true }
    }
  }

  /**
   * Resolve whether the workspace has ANY CRM connected (HubSpot or Salesforce —
   * both share the `crm_connections` table). Drives the honest « CRM non connecté »
   * line in the chat transparency panel. Best-effort: a read error (or a missing
   * migration in that env) degrades to "not connected" and never breaks chat — the
   * safe default is to claim NO connection rather than a phantom one.
   */
  private async resolveCrmState(workspaceId: string): Promise<{ crmConnected: boolean; crmProvider: string | null }> {
    try {
      const conn = await this.crmConnections.findOne({ where: workspaceScopeWhere(workspaceId) })
      return conn ? { crmConnected: true, crmProvider: conn.provider } : { crmConnected: false, crmProvider: null }
    } catch {
      return { crmConnected: false, crmProvider: null }
    }
  }

  /**
   * Match the user's message against the workspace's analysed account names so the
   * shared thread can pull an account's full analysis when it's named ("… pour
   * SNCF"). Longest name wins; ≥3 chars to avoid a tiny name matching noise.
   * Best-effort — ownership is re-checked by `findOne` in build(). */
  private async resolveAccountByName(workspaceId: string, message?: string | null): Promise<string | null> {
    const text = (message ?? '').toLowerCase()
    if (text.trim().length < 3) return null
    try {
      const { rows } = await this.accounts.listAccountsDigest(workspaceId)
      const hit = rows
        .filter(a => a.company_name && a.company_name.trim().length >= 3 && text.includes(a.company_name.toLowerCase()))
        .sort((a, b) => b.company_name.length - a.company_name.length)[0]
      return hit?.id ?? null
    } catch {
      return null
    }
  }

  /**
   * #1581.1 / #1573.1 — LE PORTEFEUILLE TEL QUE LAURA LE REÇOIT, EN QUATRE COUCHES.
   *
   * ───────────────────────────────────────────────────────────────────────────
   * CE QUI MANQUAIT, ET CE QUE ÇA PRODUISAIT
   * ───────────────────────────────────────────────────────────────────────────
   * Ce bloc rendait « Nom — Secteur — Score/10 ». Les deux retours demandent,
   * chacun depuis son écran, que Laura croise quatre couches : les données
   * PRIVÉES de l'espace, les SIGNAUX actuels, la MÉMOIRE MARCHÉ, et ce qu'on ne
   * SAIT PAS. Aucune des quatre n'arrivait. Un modèle à qui on ne donne pas le
   * silence d'un compte ne peut pas répondre « quels comptes ai-je négligés » —
   * il peut seulement en avoir l'air, ce qui est pire.
   *
   * ───────────────────────────────────────────────────────────────────────────
   * POURQUOI LES RÈGLES DE LECTURE VOYAGENT AVEC LES CHIFFRES
   * ───────────────────────────────────────────────────────────────────────────
   * Un taux de couverture mesure CE QUE NOUS SAVONS, jamais ce que le marché
   * FAIT : « 38 sur 62 » veut dire « sur 38 comptes Bellum a de quoi dire
   * quelque chose », JAMAIS « 38 externalisent » — et le complément n'est pas
   * « 24 n'externalisent pas », ces 24 sont hors de ce que nous savons. La
   * doctrine l'inscrit (`c65_couverture_nest_pas_un_fait_de_marche`) et GA-259
   * le tient à l'écran, où `coverage.meaning` est affiché et non facultatif.
   *
   * Ici le lecteur est un MODÈLE qui va PARAPHRASER. C'est donc la surface la
   * plus risquée du dépôt pour cette faute : un chiffre nu dans un prompt
   * ressort en phrase. Le sens accompagne donc le chiffre dans le texte même,
   * exactement comme il accompagne le chiffre à l'écran.
   *
   * ⚠️ Ce n'est PAS une consigne de comportement déguisée en donnée : ce bloc ne
   * dit que ce que ses propres nombres signifient et ce qu'ils ne permettent pas
   * de conclure. Le ton, le format de réponse et le nombre de recommandations
   * appartiennent au prompt système (`apps/ia`), et n'ont rien à faire ici.
   *
   * ───────────────────────────────────────────────────────────────────────────
   * LA TRONCATURE SE DIT — DÉFAUT VU LE 04/08
   * ───────────────────────────────────────────────────────────────────────────
   * Sans la ligne « liste partielle », le copilote lit une liste bornée comme le
   * portefeuille entier et NIE posséder un compte que l'utilisateur a sous les
   * yeux (« Dassault Aviation n'apparaît pas… »). Un modèle ne peut pas deviner
   * ce qu'on ne lui a pas donné ; il peut tenir compte d'un « c'est partiel ».
   *
   * Best-effort de bout en bout : une lecture qui échoue rend `null` et ne casse
   * jamais le chat.
   */
  private async buildAccountsSummary(
    workspaceId: string,
    marketPortfolio: MarketPortfolioRead | null,
  ): Promise<{ summary: string | null; portfolio: { names: string[]; total: number } | null }> {
    try {
      const { rows, total } = await this.accounts.listAccountsDigest(workspaceId)
      if (rows.length === 0) return { summary: null, portfolio: null }
      // Une seule requête pour les faits privés des comptes DÉJÀ bornés — jamais
      // une par compte.
      const facts = await this.accounts
        .listCopilotAccountFacts(
          workspaceId,
          rows.map(row => row.id),
        )
        .catch(() => new Map<string, CopilotAccountFacts>())
      // #4759 — l'historique des besoins : un AGRÉGAT daté par compte (une lecture pour tous), le détail se lit
      // par l'outil de Laura. Illisible = aucune ligne, jamais une ligne inventée.
      const needsLines = this.needsHistoryReader
        ? await this.needsHistoryReader({ workspaceId, accountIds: rows.map(row => row.id) }).catch(
            () => new Map<string, string>(),
          )
        : new Map<string, string>()

      const lines = rows.map(account => {
        const fact = facts.get(account.id)
        const parts = [account.company_name, account.sector ?? 'secteur inconnu', `${account.priority_score ?? '?'}/10`]
        if (fact) {
          parts.push(
            fact.withoutNextAction ? 'aucune prochaine action programmée' : 'une prochaine action est programmée',
          )
          // ⚠️ « aucun échange ENREGISTRÉ », jamais « aucun échange » : la
          // seconde est une affirmation sur le passé du client, la première n'en
          // est une que sur notre journal. C'est « non mesuré n'est pas zéro »
          // appliqué à une date.
          parts.push(
            fact.lastInteractionAt
              ? `dernier échange enregistré le ${fact.lastInteractionAt.slice(0, 10)}`
              : 'aucun échange enregistré',
          )
          // #4759 — plus de booléen à deux faces : « aucun signal » affirmait une absence que le journal ne prouve
          // pas. Seul le fait positif reste ; l'historique daté vient de l'agrégat ci-dessous.
          if (fact.hasRecentSignal) parts.push('un signal est apparu ces 7 derniers jours')
        }
        const needs = needsLines.get(account.id)
        if (needs) parts.push(needs)
        return parts.join(' — ')
      })

      const hidden = total - rows.length
      const header =
        hidden > 0
          ? `Portefeuille analysé — liste PARTIELLE : ${rows.length} comptes listés sur ${total}. ${hidden} autres comptes analysés ne sont pas listés ici — ne conclus jamais qu'un compte absent de cette liste n'existe pas.`
          : `Portefeuille analysé — ${rows.length} comptes, la liste est complète.`

      const blocks = [header, lines.join('\n')]
      const market = marketMemoryBlock(marketPortfolio)
      if (market) blocks.push(market)
      // #1941.4 — les NOMS des comptes réellement servis, pris à la source du
      // digest. Un nom blanc ne devient pas un identifiant : il sort de la
      // liste, parce qu'une ligne sans nom n'apprend rien à qui la lit.
      const names = rows.map(account => account.company_name?.trim()).filter((name): name is string => !!name)
      return { summary: blocks.join('\n\n'), portfolio: { names, total } }
    } catch {
      return { summary: null, portfolio: null }
    }
  }

  /**
   * Persist one exchange into the rolling conversation summary. Best-effort — a
   * failure is swallowed so it never turns a good chat reply into an error.
   */
  async recordConversationTurn(args: RecordTurnArgs): Promise<void> {
    try {
      await this.memory.appendConversationTurn(args)
    } catch {
      // degradable — long memory must never break chat
    }
  }

  private async loadMemory(args: {
    userId: string
    workspaceId: string
    accountId: string | null
    conversationId: string | null
    /** #2430.2 — le fil d'origine d'une branche, ou `null`. */
    parentConversationId?: string | null
    /** #1918.2 — les périmètres PORTÉS par la personne, résolus au CONTRÔLEUR
     *  (GA-07). Vide : aucune mémoire d'équipe n'entre dans ce prompt. */
    businessUnitIds?: readonly string[]
  }): Promise<{
    pinnedFacts: PinnedMemoryContextItem[]
    pinnedFactIds: string[]
    userPreferences: Record<string, unknown>
    conversationSummary: string | null
    threadState: ConversationThreadState | null
  }> {
    // #1927.10 — l'état du fil est lu À PART, avec son propre filet : une
    // lecture ratée (ou un `MemoryService` qui ne connaît pas encore la méthode)
    // rend `null` sans vider le reste de la mémoire — et une panne du reste ne
    // l'emporte pas non plus. Il part avec `memory`, donc dans les TROIS
    // branches de `build` (compte actif, portefeuille, compte introuvable).
    // #1918.2 — l'état du fil ne reçoit QUE la clé du fil : les périmètres
    // portés ne le concernent pas, et un objet élargi qui traverse une frontière
    // de service finit par y être lu.
    const threadState = this.loadThreadState({
      userId: args.userId,
      workspaceId: args.workspaceId,
      accountId: args.accountId,
      conversationId: args.conversationId,
    })
    try {
      const [facts, userPreferences, ownSummary, parentSummary] = await Promise.all([
        // #1918.1 — `userId` borne ce qui PART AU MODÈLE : les éléments partagés
        // avec l'espace et ceux de cette personne. L'élément « moi uniquement »
        // d'un collègue n'entre jamais dans ce prompt.
        this.memory.listFacts({
          workspaceId: args.workspaceId,
          userId: args.userId,
          accountId: args.accountId,
          // #1918.2 — la mémoire d'une équipe entre dans le prompt de qui en
          // est MEMBRE, et de personne d'autre.
          businessUnitIds: args.businessUnitIds,
          // #1918.5 — et la mémoire « cette conversation » entre dans le prompt
          // de SON fil, jamais d'un autre : c'est tout ce que « temporaire »
          // promet, et c'est ici qu'il se tient.
          thread: { accountId: args.accountId, conversationId: args.conversationId },
        }),
        this.memory.getPreferences(args.userId),
        // ⚠️ `userId` borne ce résumé à SA personne. Les faits épinglés
        // au-dessus sont un partage délibéré vers l'équipe ; le résumé, lui, est
        // dérivé en silence des messages de quelqu'un — sans cette borne, les
        // extraits d'un collègue entraient dans ce prompt (D65).
        this.memory.getConversationSummary({
          userId: args.userId,
          workspaceId: args.workspaceId,
          accountId: args.accountId,
          conversationId: args.conversationId,
        }),
        // #2430.2 — le résumé du fil d'ORIGINE d'une branche, borné à la MÊME
        // personne (D65). Aucun parent : aucune seconde lecture.
        args.parentConversationId
          ? this.memory.getConversationSummary({
              userId: args.userId,
              workspaceId: args.workspaceId,
              accountId: args.accountId,
              conversationId: args.parentConversationId,
            })
          : Promise.resolve(null),
      ])
      const conversationSummary = withParentThreadSummary(ownSummary, parentSummary)
      // #1962.8/.25 — `kind` et `origin` voyagent avec le texte : avant, seul
      // `f.fact` atteignait le prompt (`facts.map(f => f.fact)`), et une
      // conclusion de Laura jamais confirmée (`origin: 'copilot'`) devenait,
      // au fil du contexte, indiscernable d'une correction humaine.
      //
      // #1916.24 — CE QUI PART EST CE QUI EST TRACÉ. La borne du prompt et
      // l'écart des textes vides s'appliquent ICI, avant l'envoi
      // (`memoryItemsSentToModel`) : le service IA reçoit exactement la liste
      // que la trace retient, et un élément au-delà de la borne n'est ni envoyé
      // ni prétendu « consulté ».
      //
      // Q1 (13/09) — `confirmed: true` SEULEMENT sur une note de Laura qu'une
      // personne a confirmée : le service IA la range avec les faits déclarés
      // (`_format_memory`). Tout autre élément voyage exactement comme avant.
      const sent = memoryItemsSentToModel(facts)
      // #3892.1 (ADD-SANOFI-06) — le NOM du compte d'origine, pour qu'un fait
      // borné à UN compte ne se lise plus comme une règle générale dès qu'il
      // atteint un AUTRE compte ou une conversation sans compte actif (les
      // deux cas où `listFacts`/#1918.1 le rend quand même). Batché : une
      // seule requête pour TOUS les comptes visés par ce lot de faits.
      const scopedAccountIds = [...new Set(sent.map(f => f.accountId).filter((id): id is string => Boolean(id)))]
      const accountNames =
        scopedAccountIds.length > 0
          ? await this.accounts.namesForAccounts(args.workspaceId, scopedAccountIds)
          : new Map<string, string>()
      const pinnedFacts: PinnedMemoryContextItem[] = sent.map(f => ({
        fact: f.fact,
        kind: f.kind,
        origin: f.origin,
        ...(f.origin === 'copilot' && f.confirmedAt ? { confirmed: true as const } : {}),
        ...(f.accountId && accountNames.has(f.accountId) ? { accountName: accountNames.get(f.accountId) } : {}),
      }))
      const pinnedFactIds = sent.map(f => f.id)
      return { pinnedFacts, pinnedFactIds, userPreferences, conversationSummary, threadState: await threadState }
    } catch {
      return { ...EMPTY_MEMORY, threadState: await threadState }
    }
  }

  /**
   * #1927.10 — l'état structuré de CE fil pour CETTE personne, ou `null`.
   * Best-effort : ne rejette jamais (la mémoire ne casse pas le chat).
   */
  private async loadThreadState(args: {
    userId: string
    workspaceId: string
    accountId: string | null
    conversationId: string | null
  }): Promise<ConversationThreadState | null> {
    try {
      return await this.memory.getConversationThreadState(args)
    } catch {
      return null
    }
  }

  /**
   * #1927.10 — un fil supprimé emporte son résumé et son état, pour chaque
   * membre de l'espace (`MemoryService.forgetConversation`). N'avale PAS
   * l'échec : c'est le contrôleur, qui vient de supprimer les messages, qui
   * décide comment le dire.
   */
  forgetConversation(args: { workspaceId: string; accountId: string | null; conversationId: string | null }) {
    return this.memory.forgetConversation(args)
  }
}
