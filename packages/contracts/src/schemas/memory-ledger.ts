import { z } from 'zod'
import {
  memoryAuthorSchema,
  memoryItemKindSchema,
  memoryItemObjectRefSchema,
  memoryItemOriginSchema,
  memoryItemScopeSchema,
} from './memory-item.js'
import { memoryConsultationsSchema } from './memory-reply-uses.js'

/**
 * LE REGISTRE DE MÉMOIRE — ce que Laura garde, en clair, ligne à ligne.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA RÈGLE, CITÉE À LA SOURCE
 * ─────────────────────────────────────────────────────────────────────────────
 * Tome 6, §12.1 : « **Règle de transparence** : l'utilisateur voit cette
 * mémoire, en clair, dans un écran dédié, et peut en supprimer n'importe quelle
 * ligne. **Une mémoire invisible est une mémoire dangereuse.** »
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE CONTRAT NE FAIT PAS : INVENTER UNE COUCHE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le §12 du tome décrit SIX couches. Quatre seulement sont persistées dans ce
 * dépôt, et ce sont exactement celles que ce contrat expose :
 *
 *  · `facts`         — `memory_pinned_facts`. Ce que quelqu'un a épinglé à la
 *                      main, ou ce que le copilote a retenu d'une réponse.
 *                      Injecté dans son contexte (`ChatContextService`).
 *  · `preferences`   — `user_preferences`. Le sac de réglages libres relu à
 *                      chaque tour. **Personne ne l'écrivait ni ne le montrait
 *                      côté web** avant cet écran : c'était une mémoire lue par
 *                      le modèle et invisible pour son propriétaire.
 *  · `conversations` — `conversation_summaries`. Le résumé roulant : DEUX
 *                      extraits de 200 caractères par échange, l'un de ce que la
 *                      personne a écrit, l'autre de ce que Laura a répondu.
 *                      Relu au tour suivant. Invisible et ineffaçable avant.
 *  · `refusals`      — `laura_interventions`. Ce qui a été proposé et ce que la
 *                      personne en a fait. C'est la ligne « ce qu'il a refusé,
 *                      et quand » de la couche 5, et la seule qui existe.
 *
 * Les couches 3 (produit) et 4 (métier) du tome sont VERSIONNÉES AVEC LE CODE —
 * elles ne sont pas des lignes de base, il n'y a rien à montrer ni à supprimer.
 * Le reste de la couche 5 (« les écrans qu'il ouvre le matin », « son rythme »)
 * n'existe pas : aucune table ne le retient. On ne l'écrit donc pas ici. Un
 * registre qui listerait des couches vides mentirait dans l'autre sens.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES DEUX COUCHES AJOUTÉES LE 01/09 : `identity` ET `workspace`
 * ─────────────────────────────────────────────────────────────────────────────
 * Le §3.6 de la source en demande SIX, et les deux premières manquaient :
 *
 *  · `identity`  — le prénom de la personne. Il est lu à CHAQUE tour du copilote
 *                  (`ChatContextService.resolveFirstName` → bloc « LA PERSONNE À
 *                  QUI TU PARLES » du prompt), et aucun écran ne disait qu'il
 *                  entrait dans un prompt.
 *  · `workspace` — le profil de l'ESN : sa raison sociale, ses offres, ses
 *                  secteurs cibles, sa taille, son portefeuille d'offre, et le
 *                  fait qu'un CRM soit branché. Tout cela part dans le prompt à
 *                  chaque tour (`EsnProfileReader.resolveProfileData`,
 *                  `resolveCrmState`).
 *
 * Ce n'est pas un défaut de confort : ces champs sont DÉJÀ lus, donc BellumAI
 * s'en sert, et la personne ne pouvait ni les voir ni savoir qu'ils voyagent.
 * C'est exactement ce que le registre existe pour empêcher.
 *
 * ⚠️ Elles sont DÉCLARÉES, pas retenues : la personne les a écrites elle-même
 * dans un formulaire, et elles se corrigent là où elles se saisissent (Réglages
 * › Mon compte, Réglages › Profil de l'ESN). Les effacer depuis cet écran
 * détruirait une configuration délibérée sous couvert d'« oubli » — et une
 * suppression ne remplace pas une correction. Le registre les MONTRE et dit où
 * elles se changent ; il ne les efface pas. Voir {@link MEMORY_DECLARED_LAYERS}.
 */

/**
 * Les six couches, dans l'ordre où l'écran les présente.
 *
 * ⚠️ Enum LIVRÉ (GA-08) : une valeur s'ajoute EN FIN, jamais au milieu — le nom
 * de la couche voyage dans l'URL de suppression (`DELETE /memory/ledger/:layer/:id`).
 */
export const MEMORY_LAYERS = ['facts', 'preferences', 'conversations', 'refusals', 'identity', 'workspace'] as const
export const memoryLayerSchema = z.enum(MEMORY_LAYERS)
export type MemoryLayer = z.infer<typeof memoryLayerSchema>

/**
 * Les couches DÉCLARÉES — lues par le copilote, mais SAISIES par la personne.
 *
 * Elles se corrigent là où elles se saisissent. Le registre les rend visibles,
 * parce que c'est sa raison d'être ; il ne propose pas de les « oublier », parce
 * qu'un profil d'ESN vidé depuis l'écran de mémoire serait une configuration
 * détruite, pas une mémoire effacée.
 */
export const MEMORY_DECLARED_LAYERS = ['identity', 'workspace'] as const

/** `true` quand la couche se CORRIGE au lieu de s'oublier. */
export function isDeclaredMemoryLayer(layer: MemoryLayer): boolean {
  return (MEMORY_DECLARED_LAYERS as readonly string[]).includes(layer)
}

/**
 * Le compte-rendu de « tout oublier ».
 *
 * ⚠️ `failedLayers` n'est pas décoratif. Un effacement global qui échoue sur une
 * couche et réussit sur trois rendrait « 12 lignes oubliées » — un nombre VRAI
 * qui se lit comme un succès COMPLET. C'est le « zéro qui ment » retourné : la
 * couche non vidée est NOMMÉE, et l'écran le dit. Le geste est irréversible ; on
 * ne laisse personne croire qu'il a fini quand il n'a pas fini.
 *
 * Les couches déclarées (`identity`, `workspace`) n'y figurent jamais : « tout
 * oublier » ne les vise pas, il ne peut donc pas échouer dessus.
 */
export const memoryForgetAllResultSchema = z.object({
  forgotten: z.number().int().min(0),
  failedLayers: z.array(memoryLayerSchema.refine(layer => !isDeclaredMemoryLayer(layer))),
})
export type MemoryForgetAllResult = z.infer<typeof memoryForgetAllResultSchema>

/**
 * Une ligne du registre. Elle porte le TEXTE que Laura relit, jamais une clé
 * technique : « en clair » veut dire lisible sans traduction mentale.
 *
 * `id` est l'identifiant de suppression DANS SA COUCHE — un uuid pour un fait ou
 * une trace, la clé de préférence pour une préférence, la clé de conversation
 * pour un résumé. Il n'est unique QUE couplé à `layer`, et l'API l'exige des
 * deux côtés.
 */
/**
 * #1916.18 — LES SURFACES OÙ UN ÉLÉMENT ÉPINGLÉ PÈSE, et seulement celles que le
 * code prouve. Un élément non échu est lu par `MemoryService.listFacts`, et ses
 * seuls lecteurs vers un modèle sont `ChatContextService.loadMemory`, lui-même
 * appelé par exactement deux routes :
 *
 *  · `chat`              — `POST /ia/chat` (`ia-proxy.controller.ts`, le chat
 *                          avec Laura : ses réponses, et ce qu'elle rédige dans
 *                          la conversation). Un élément attaché à un compte y
 *                          entre, sauf dans une conversation sur un AUTRE compte ;
 *  · `externalAssistant` — `ask_bellum` (`mcp-api.controller.ts`), la question
 *                          qu'un assistant IA externe branché pose sur un compte.
 *
 * ⚠️ Ni Découvrir, ni le brief du matin, ni les priorités ne lisent cette
 * mémoire aujourd'hui : aucun de leurs services n'appelle `listFacts` ni
 * `ChatContextService.build`. Les annoncer serait promettre une conséquence qui
 * n'existe pas. Enum LIVRÉ (GA-08) : une surface s'ajoute EN FIN, le jour où un
 * lecteur réel existe.
 */
export const MEMORY_SURFACES = ['chat', 'externalAssistant'] as const
export type MemorySurface = (typeof MEMORY_SURFACES)[number]

export const memoryLedgerEntrySchema = z.object({
  id: z.string().min(1),
  layer: memoryLayerSchema,
  /** Ce que Laura relit, mot pour mot. Une ligne sans texte n'est pas « en clair ». */
  text: z.string().min(1),
  /** Quand la ligne a été retenue (ISO 8601). */
  recordedAt: z.string(),
  /** Le dossier concerné, ou `null` quand la ligne vaut pour tout l'espace. */
  accountId: z.string().nullable(),
  /**
   * Un qualificatif COURT : la nature d'un fait (`correction`), ce que la
   * personne a fait d'une proposition (`refused`), la clé d'une préférence
   * (`tone`). `null` quand il n'y a rien à préciser — on n'affiche pas un
   * défaut pour remplir.
   *
   * L'écran le passe à i18next avec un `defaultValue` égal à la valeur brute :
   * un qualificatif connu se traduit, un qualificatif venu d'une ligne plus
   * ancienne que le catalogue s'affiche tel quel. Jamais une clé nue, jamais un
   * libellé inventé.
   */
  detail: z.string().nullable(),
  /** Jusqu'à quand la ligne vaut. `null` = sans échéance. */
  expiresAt: z.string().nullable(),
  /**
   * #1916.3 / #1918.1 — pour qui la ligne vaut. Porté par la couche `facts`
   * SEULE : les autres couches n'ont pas de portée à CHOISIR (une préférence,
   * un résumé, une trace sont personnels par construction ; un profil déclaré
   * est celui de la personne ou de l'ESN). Absent ailleurs — et absent d'une
   * API plus ancienne que ce champ : l'écran n'affiche alors aucun badge
   * plutôt qu'une portée devinée.
   */
  scope: memoryItemScopeSchema.optional(),
  /**
   * #1918.2 — le périmètre visé quand `scope = 'business_unit'`. L'identifiant
   * seul : l'écran le NOMME depuis la liste des périmètres qu'il a déjà, plutôt
   * que de faire voyager deux fois un nom qui vit ailleurs. Absent partout
   * ailleurs, et d'une API plus ancienne que ce champ.
   */
  businessUnitId: z.string().nullable().optional(),
  /**
   * #2260.7 — L'OBJET VISÉ, RÉSOLU : contact, besoin, consultant ou mission,
   * avec son nom. Couche `facts` seule, comme `scope`. `null` = aucun objet
   * visé (mesuré) ; absent = couche/API qui ne le calcule pas encore.
   */
  object: memoryItemObjectRefSchema.nullable().optional(),
  /** `true` quand l'appelant a épinglé cette ligne — lui seul peut en changer la
   *  portée. Absent hors couche `facts`, comme `scope`. */
  ownedByMe: z.boolean().optional(),
  /** #1918.7 — l'appelant peut-il oublier cette ligne de faits ? (auteur, ou
   *  manager sur un élément partagé). Absent hors couche `facts`, ou d'une API
   *  plus ancienne : l'écran garde alors le geste, le serveur restant la garde. */
  canForget: z.boolean().optional(),
  /**
   * #1916.2 / #1916.13 — la NATURE et l'ORIGINE, en clair : ce que l'élément
   * est (fait, préférence, correction) et d'où il vient (épinglé à la main,
   * retenu d'une réponse de Laura, issu d'un dossier). L'écran en tire la
   * section (`memoryLedgerSectionOf`) et la phrase « pourquoi c'est retenu ».
   * Couche `facts` seule ; absents d'une API plus ancienne.
   */
  kind: memoryItemKindSchema.optional(),
  origin: memoryItemOriginSchema.optional(),
  /**
   * #1916.16 — qui l'a épinglé : prénom + avatar, résolu parmi les membres de
   * l'espace. `null` = inconnu (compte effacé, membre parti), jamais deviné.
   * Servi à l'ÉCRAN seulement : ni l'outil `get_memory` de Laura ni aucun
   * prompt ne le reçoivent.
   */
  author: memoryAuthorSchema.nullable().optional(),
  /**
   * Q1 (décision de Louis du 13/09) — QUI a confirmé cette note de Laura en en
   * réécrivant le texte (`detail: 'confirmedNote'` dit qu'elle l'est). Prénom +
   * avatar, résolus parmi les membres de l'espace ; `null` = confirmateur inconnu
   * (compte effacé) — la note reste confirmée, sans prénom deviné. Vue écran seule.
   */
  confirmedBy: memoryAuthorSchema.nullable().optional(),
  /**
   * #1962.22 — QUAND cette note a été confirmée (ISO 8601), au même titre que
   * `confirmedBy` — sans elle, la ligne dit QUI mais jamais DEPUIS QUAND. `null`
   * = jamais confirmée ; absent = couche/API qui ne calcule pas cette date.
   */
  confirmedAt: z.string().nullable().optional(),
  /** #1916.19 / #1916.22 — l'appelant peut-il modifier le texte ou l'échéance ?
   *  La MÊME règle que `canForget` (auteur ; manager sur un élément partagé). */
  canEdit: z.boolean().optional(),
  /**
   * #1916.18 / #1916.24 — OÙ Laura s'en sert aujourd'hui. Un tableau VIDE dit
   * « non utilisé par Laura aujourd'hui » (échéance passée) ; ABSENT dit « non
   * calculé » (autre couche, API plus ancienne) — les deux ne s'affichent pas
   * pareil. Voir {@link MEMORY_SURFACES} pour les lecteurs que chaque valeur cite.
   */
  surfaces: z.array(z.enum(MEMORY_SURFACES)).optional(),
  /**
   * #1916.24 — la conséquence MESURÉE : dans combien de réponses que le lecteur
   * peut relire cet élément était dans le contexte envoyé à Laura, la dernière
   * quand, et la conversation la plus récente qu'il peut ouvrir. Couche `facts`,
   * vue écran seule. ABSENT = non mesuré (API plus ancienne, lecture en échec) :
   * l'écran retombe alors sur `surfaces` sans rien affirmer.
   */
  consultations: memoryConsultationsSchema.optional(),
})
export type MemoryLedgerEntry = z.infer<typeof memoryLedgerEntrySchema>

/**
 * Le registre complet.
 *
 * ⚠️ `unreadableLayers` n'est pas un détail d'implémentation. Une couche dont la
 * lecture ÉCHOUE et une couche VIDE se ressemblent à l'écran, et la deuxième se
 * lit « Laura ne retient rien » — une phrase fausse et rassurante. La règle du
 * dépôt (« non mesuré n'est jamais 0 ») s'applique mot pour mot ici : la couche
 * illisible est NOMMÉE, et l'écran le dit.
 */
export const memoryLedgerSchema = z.object({
  entries: z.array(memoryLedgerEntrySchema),
  unreadableLayers: z.array(memoryLayerSchema),
})
export type MemoryLedger = z.infer<typeof memoryLedgerSchema>

/**
 * CE QUE LAURA NE MÉMORISE JAMAIS — tome 6, §12.2, verbatim :
 *
 * « Le contenu des messages · les données d'un autre espace · les données d'un
 * collègue hors périmètre · une information supprimée par l'utilisateur · un
 * secret partagé par erreur (elle prévient et n'y revient pas). »
 *
 * Cinq interdits, pas six — le rapport de passe B en annonce six, la source en
 * porte cinq. On garde ce que la source dit.
 *
 * ⚠️ `messageBodies` vise le corps des messages de la MESSAGERIE, pas le fil du
 * copilote. La distinction est celle de D65, et elle est déjà tranchée dans ce
 * dépôt : le corps d'un e-mail EST stocké dans le journal d'activité (arbitrage
 * du 16/08, raison écrite dans `activity.ts:34-40`) et n'est JAMAIS exposé, ni à
 * un humain ni au modèle. Le résumé de conversation, lui, est la couche 6 du
 * tome — « l'échange en cours + résumé roulant des précédents » — que le même
 * §12 autorise explicitement. Confondre les deux ferait « corriger » un
 * stockage voulu.
 *
 * Les libellés vivent dans l'i18n (`knowledge:memoryLedger.never.*`), en FR et
 * en EN : ce sont des phrases lues par l'utilisateur, pas des constantes.
 */
export const MEMORY_NEVER_STORED = [
  'messageBodies',
  'otherWorkspace',
  'colleagueOutOfScope',
  'deletedByUser',
  'accidentalSecret',
] as const
export type MemoryNeverStored = (typeof MEMORY_NEVER_STORED)[number]
