import { z } from 'zod'
import { decisionGateSchema, type DecisionGate } from './decision-gate.js'

/**
 * LE MOTEUR DE CHAÎNES ORDONNÉES (PDF 6 §6, ticket BEL-AUT-502).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE PROBLÈME QU'IL RÉSOUT
 * ─────────────────────────────────────────────────────────────────────────
 * Un workflow BellumAI est PLAT : trois pas, exécutés une fois, terminé. Le
 * métier d'une ESN ne l'est pas — c'est une suite d'étapes avec une porte au
 * milieu et une boucle de retour. « Ce compte est bloqué depuis trois semaines »
 * est une phrase qu'aucun écran ne sait dire aujourd'hui : le pipe montre
 * l'ÉTAPE COMMERCIALE, jamais où l'on coince dans le PROCESSUS.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE CE MOTEUR N'EST PAS
 * ─────────────────────────────────────────────────────────────────────────
 * Ce n'est **pas** un troisième moteur d'exécution, et c'est la seule façon de
 * le livrer sans contredire le dépôt. Le runner d'Action OS exécute des pas ;
 * le service des routines déclenche à l'heure ; une chaîne, elle, ne fait
 * qu'une chose : **dire où en est un dossier et ce qu'on attend de lui**. Elle
 * n'appelle aucun connecteur, n'envoie rien, ne débite rien. Avancer d'une
 * position est un geste d'utilisateur ou la conséquence d'une porte franchie
 * ailleurs — jamais une exécution qu'elle déclenche.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA RÈGLE CENTRALE
 * ─────────────────────────────────────────────────────────────────────────
 * `nextPosition` est PURE, et trois de ses propriétés sont le cœur du §6 :
 *
 *  1. une réponse NON renvoie à une position **amont**, jamais à la fin — une
 *     chaîne qui « échoue vers l'avant » ferait disparaître les dossiers qu'on
 *     voulait justement rattraper ;
 *  2. une porte **sans réponse** ne fait JAMAIS avancer — c'est ce qui rend la
 *     porte utile : tant que personne n'a tranché, le dossier reste visible à
 *     l'endroit où il attend ;
 *  3. la dernière position ne boucle pas — une chaîne se termine.
 */

export const CHAIN_KEYS = [
  'ouverture_compte',
  'acquisition',
  'prospection_inversee',
  'sourcing_matching',
  'push_ao_conversion',
  'rang2_rang1',
  'onboarding_delivery',
] as const
export const chainKeySchema = z.enum(CHAIN_KEYS)
export type ChainKey = (typeof CHAIN_KEYS)[number]

/** Qui agit à cette étape. `connector` = rien ne bouge sans l'outil branché. */
export const CHAIN_ACTORS = ['user', 'agent', 'connector'] as const
export const chainActorSchema = z.enum(CHAIN_ACTORS)
export type ChainActor = (typeof CHAIN_ACTORS)[number]

const localized = z.object({ fr: z.string().min(1), en: z.string().min(1) })

export const chainStepSchema = z.object({
  /** 1-indexée. La position 1 est l'entrée dans la chaîne. */
  position: z.number().int().min(1),
  label: localized,
  actor: chainActorSchema,
  /** Ce que l'étape doit PRODUIRE pour être considérée franchie. */
  expectedOutput: localized,
  /**
   * N0 à N5, comme partout ailleurs. Une étape de chaîne ne dépasse pas N2.
   *
   * ⚠️ `n2_user_approval`, le nom de l'Action OS (`AUTOMATION_LEVELS`), et non
   * `n2_simple_approval` comme ici jusqu'au 22/08. Deux noms pour le MÊME
   * niveau d'automatisation, dans deux fichiers voisins, est la façon la plus
   * discrète de faire diverger deux moteurs : le jour où l'un des deux consulte
   * la politique d'approbation de l'autre, la comparaison échoue en silence et
   * l'étape passe au niveau par défaut.
   *
   * Le renommage est sans risque de données : le niveau vit dans le CATALOGUE
   * (code), aucune colonne ne le stocke.
   */
  automationLevel: z.enum(['n0_advice', 'n1_prepare', 'n2_user_approval']),
  /** La capacité sans laquelle l'étape ne peut pas se faire. `null` = aucune. */
  requiredCapability: z.string().nullable(),
  /**
   * L'étape est un geste que l'humain fait AILLEURS (décision D48 du 21/08).
   *
   * Badge d'accès, VPN, matériel, référencement grand compte : aucun connecteur
   * ne les exécute, et il n'en existera pas. Le chantier du PDF 6 les avait
   * donc écartées — un catalogue qui n'inscrit que ce qui tourne réellement.
   *
   * Louis a tranché autrement, et l'arbitrage se tient : une checklist
   * d'onboarding a de la valeur même sans connecteur. Ce que le produit
   * s'interdit est de PRÉTENDRE exécuter, pas de SUIVRE. Le drapeau porte
   * exactement cette différence, et l'écran le dit — « geste hors outil » —
   * pour que personne n'attende une automatisation qui ne viendra pas.
   */
  outsideTool: z.boolean().default(false),
})
export type ChainStep = z.infer<typeof chainStepSchema>

export const chainGateSchema = z.object({
  /** La porte s'ouvre APRÈS cette position. */
  afterPosition: z.number().int().min(1),
  /** La porte du catalogue partagé — jamais un numéro local. */
  gate: decisionGateSchema,
  question: localized,
  /** Où l'on va si OUI. Toujours plus loin. */
  yesTargetPosition: z.number().int().min(1),
  /**
   * Où l'on va si NON. Toujours en AMONT de la porte.
   *
   * C'est la propriété qui distingue une chaîne d'une liste de cases : un refus
   * renvoie travailler, il ne clôt pas le dossier.
   */
  noTargetPosition: z.number().int().min(1),
  /** Un refus exige-t-il un motif ? */
  reasonRequired: z.boolean(),
})
export type ChainGate = z.infer<typeof chainGateSchema>

/** Sur quoi porte un parcours. Exporté : l'écran en traduit chaque valeur, et
 *  une garde d'i18n vérifie qu'aucune ne s'affiche brute. */
export const CHAIN_SUBJECT_TYPES = ['account', 'project', 'need', 'mission', 'consultant'] as const
export const chainSubjectTypeSchema = z.enum(CHAIN_SUBJECT_TYPES)
/** Sur QUOI porte un parcours. Exporté : les fiches Besoin, Projet et Mission
 *  passent ce type au bloc de #1505, et une chaîne de caractères libre y ferait
 *  passer n'importe quoi. */
export type ChainSubjectType = (typeof CHAIN_SUBJECT_TYPES)[number]

export const chainSchema = z.object({
  key: chainKeySchema,
  label: localized,
  /**
   * LA FINALITÉ du parcours, en une phrase (#1502).
   *
   * « Sourcing et matching » ne dit pas à quoi ça sert ; « transformer un besoin
   * qualifié en profil accepté par le client » le dit. Le retour demande que
   * chaque parcours porte « un nom utilisateur clair + une finalité métier », et
   * c'est la seconde moitié qui manquait — le nom, lui, existait depuis le
   * premier jour dans `label`.
   *
   * Obligatoire, et pas optionnelle : un parcours sans finalité redevient la
   * boîte noire que ce retour décrit. Les sept l'ont.
   */
  purpose: localized,
  /** Le domaine métier — sert à ranger les pistes à l'écran. */
  domain: z.enum(['acquisition', 'sourcing', 'delivery', 'capitalisation']),
  /** Sur quoi porte un parcours : un compte, un besoin, une mission. */
  subjectType: chainSubjectTypeSchema,
  steps: z.array(chainStepSchema).min(1),
  gates: z.array(chainGateSchema),
  /**
   * Ce qui RAMÈNE un dossier en arrière hors d'une porte (§6, « boucle de
   * retour »). Une phrase, pas une règle exécutable : c'est un humain qui
   * constate « il a répondu », pas le moteur.
   */
  returnLoop: localized,
})
export type Chain = z.infer<typeof chainSchema>

export const CHAIN_RUN_STATES = ['running', 'blocked', 'done', 'abandoned'] as const
export const chainRunStateSchema = z.enum(CHAIN_RUN_STATES)
export type ChainRunState = (typeof CHAIN_RUN_STATES)[number]

export const chainRunSchema = z.object({
  id: z.string().guid(),
  chainKey: chainKeySchema,
  subjectType: z.string(),
  subjectId: z.string().guid(),
  currentPosition: z.number().int().min(1),
  state: chainRunStateSchema,
  /** Les réponses aux portes déjà franchies, par position. */
  gateAnswers: z.record(z.string(), z.boolean()),
  startedAt: z.string(),
  endedAt: z.string().nullable(),
})
export type ChainRun = z.infer<typeof chainRunSchema>

/**
 * Où va le dossier depuis `currentPosition`.
 *
 * PURE : aucune lecture, aucune écriture, aucune horloge. C'est ce qui permet de
 * la tester exhaustivement, et c'est ce que le ticket exige.
 *
 * `gateAnswer` vaut `undefined` quand personne n'a tranché — et dans ce cas la
 * position ne bouge PAS. C'est la règle qui donne son sens à une porte : sans
 * elle, une porte serait une étape de plus qu'on franchit en avançant.
 */
export function nextPosition(
  chain: Chain,
  currentPosition: number,
  gateAnswer?: boolean,
): { position: number; blocked: boolean } {
  const gate = chain.gates.find(entry => entry.afterPosition === currentPosition)

  if (gate) {
    // Une porte sans réponse ne fait JAMAIS avancer. Le dossier reste là où il
    // attend, et c'est ce qui le rend visible dans la file des décisions.
    if (gateAnswer === undefined) return { position: currentPosition, blocked: true }
    return { position: gateAnswer ? gate.yesTargetPosition : gate.noTargetPosition, blocked: false }
  }

  const last = chain.steps.length
  // La dernière position ne boucle pas : une chaîne se termine.
  if (currentPosition >= last) return { position: last, blocked: false }
  return { position: currentPosition + 1, blocked: false }
}

/**
 * Les problèmes de FORME d'une chaîne, avant qu'elle ne serve.
 *
 * Écrit comme une fonction et non comme un test pour une raison : la garde du
 * catalogue s'en sert, et un écran d'administration pourrait s'en servir aussi.
 * Une chaîne mal formée ne doit jamais atteindre un dossier réel.
 */
export function chainProblems(chain: Chain): string[] {
  const problems: string[] = []
  const last = chain.steps.length

  const positions = chain.steps.map(step => step.position)
  if (new Set(positions).size !== positions.length) problems.push('positions dupliquées')
  for (const [index, position] of positions.entries()) {
    if (position !== index + 1) problems.push(`position ${position} hors séquence`)
  }

  for (const gate of chain.gates) {
    if (gate.afterPosition > last) problems.push(`porte après la position ${gate.afterPosition}, hors chaîne`)
    if (gate.yesTargetPosition > last) problems.push(`cible OUI ${gate.yesTargetPosition} hors chaîne`)
    if (gate.noTargetPosition > last) problems.push(`cible NON ${gate.noTargetPosition} hors chaîne`)
    // La règle du §6 : un NON renvoie en AMONT. Une cible en aval ferait
    // « échouer vers l'avant », et le dossier qu'on voulait rattraper
    // disparaîtrait de la file.
    if (gate.noTargetPosition > gate.afterPosition) {
      problems.push(`cible NON ${gate.noTargetPosition} en aval de la porte ${gate.afterPosition}`)
    }
    if (gate.yesTargetPosition <= gate.afterPosition) {
      problems.push(`cible OUI ${gate.yesTargetPosition} n'avance pas depuis ${gate.afterPosition}`)
    }
  }
  return problems
}

/* ═══════════════════════════════════════════════════════════════════════════
 * LE MOTEUR DÉRIVÉ (#1503)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Un parcours n'est plus une LIGNE qu'on avance, c'est une LECTURE de l'état
 * des objets métier. « Où en est ce besoin » se calcule à la demande à partir
 * du besoin, de ses matchings, de ses positionnements et de sa mission.
 *
 * Ce que ça supprime, et pourquoi c'est le but : `POST chains/runs` et
 * `POST chains/runs/:id/advance`. Tant qu'une position s'écrivait à la main, le
 * produit portait DEUX vérités sur le même dossier — son état réel, et ce que
 * la ligne croyait. Elles divergent au premier événement raté : un besoin passé
 * en « gagné » par une correction manuelle laissait un parcours bloqué au
 * matching, pour toujours. Il n'y a plus rien à synchroniser parce qu'il n'y a
 * plus qu'une source.
 *
 * ⚠️ La contrepartie, et elle est stricte : **une position ne s'invente pas**.
 * Quand aucun fait lisible ne porte le dossier, la dérivation rend
 * `undetermined` AVEC sa raison, jamais une étape plausible.
 */

/**
 * Le flux DÉRIVABLE d'un parcours : les étapes qu'un objet sait dire.
 *
 * Les autres — badge d'accès, VPN, contrat signé, soutenance tenue — ne
 * correspondent à aucun fait en base et n'en correspondront jamais (décision
 * D48 : le produit les SUIT, il ne prétend pas les exécuter). Elles sortent
 * donc de la position et deviennent la checklist ci-dessous.
 *
 * ⚠️ La séparation est faite ICI, une fois. Deux écrans qui refiltreraient
 * `steps` chacun de leur côté divergeraient le jour où une étape change de
 * nature — et le compteur d'un des deux se mettrait à mentir sans rougir.
 */
export function chainFlowSteps(chain: Chain): ChainStep[] {
  return chain.steps.filter(step => !step.outsideTool)
}

/** Les gestes hors outil — la checklist rattachée au dossier. */
export function chainManualSteps(chain: Chain): ChainStep[] {
  return chain.steps.filter(step => step.outsideTool)
}

/**
 * Pourquoi le moteur ne sait pas placer un dossier.
 *
 * UNE seule raison : l'objet porte un état qu'aucune étape ne couvre. Le
 * libellé vit dans l'i18n de l'écran — un libellé d'affichage écrit dans un
 * contrat est français pour toujours.
 *
 * ⚠️ `no_readable_fact` a été RETIRÉ le 05/09/2026, après mesure en production.
 * « Aucun fait lisible » ne veut pas dire « je ne sais pas où il en est », ça
 * veut dire **le dossier n'est pas dans ce parcours** — et l'afficher comme
 * indéterminé produisait 464 projets « à déterminer » sur la chaîne des appels
 * d'offres, c'est-à-dire tous ceux qui n'en sont pas. Une alerte qui désigne la
 * population entière n'est plus une alerte.
 */
export const CHAIN_UNDETERMINED_REASONS = ['unmapped_status'] as const
export const chainUndeterminedReasonSchema = z.enum(CHAIN_UNDETERMINED_REASONS)
export type ChainUndeterminedReason = (typeof CHAIN_UNDETERMINED_REASONS)[number]

/**
 * LA PREUVE d'une étape atteinte (#1507 §4).
 *
 * « Passé à Profil proposé » ne suffit pas ; « car 2 positionnements sont
 * partis le 03/09 » se vérifie. `fact` est une CLÉ d'i18n
 * (`chains:fact.<chaîne>.<position>`), jamais une phrase : le moteur ne parle
 * aucune langue.
 */
export const chainEvidenceSchema = z.object({
  position: z.number().int().min(1),
  /** La clé du fait lu, résolue par l'écran. */
  fact: z.string().min(1),
  /** Quand le fait a été constaté. `null` = l'objet ne porte pas de date. */
  at: z.string().nullable(),
  /** Combien (profils, signaux, relevés). `null` = le fait ne se compte pas. */
  count: z.number().int().nullable(),
})
export type ChainEvidence = z.infer<typeof chainEvidenceSchema>

/**
 * Où en est UN dossier, dérivé de son objet.
 *
 * `blockedGate` porte la porte devant laquelle il attend une décision humaine —
 * et elle est LUE sur l'objet (`project_needs.staffable`, `accounts.priority_gate`,
 * `invoice_readiness.state`), jamais stockée à côté. Une porte que l'objet ne
 * sait pas exprimer ne bloque personne : le deviner remplirait la file des
 * décisions de dossiers que rien n'attend.
 */
export const chainDerivationSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('at'),
    position: z.number().int().min(1),
    blockedGate: decisionGateSchema.nullable(),
    /** Le motif du refus, quand l'objet le porte. `null` sinon — jamais deviné. */
    gateReason: z.string().nullable(),
    evidence: z.array(chainEvidenceSchema),
  }),
  z.object({
    kind: z.literal('undetermined'),
    reason: chainUndeterminedReasonSchema,
    /** Ce qu'on a QUAND MÊME lu. Vide n'est pas une erreur. */
    evidence: z.array(chainEvidenceSchema),
  }),
])
export type ChainDerivation = z.infer<typeof chainDerivationSchema>

/**
 * La position atteinte à partir des étapes CONSTATÉES.
 *
 * PURE, et c'est ce qui la rend testable exhaustivement. Deux propriétés
 * portent tout le §6 de #1507 :
 *
 *  1. **On prend la position la plus AVANCÉE dont le fait est vrai**, pas la
 *     première fausse. Un statut qui traîne derrière la réalité — un besoin
 *     resté « à matcher » alors que deux profils sont partis — ne doit pas
 *     retenir le dossier à une étape que les faits ont dépassée.
 *  2. **Une porte se lit sur l'objet.** Sans réponse, le dossier reste DEVANT
 *     elle : il n'avance pas d'un cran « en attendant ». Un refus le renvoie où
 *     `noTargetPosition` l'envoie — en amont, toujours.
 */
export function derivePosition(
  chain: Chain,
  evidence: readonly ChainEvidence[],
  gateAnswers: Readonly<Partial<Record<DecisionGate, { decided: boolean | null; reason: string | null }>>> = {},
): ChainDerivation | null {
  const flow = chainFlowSteps(chain)
  const reached = evidence.filter(entry => entry.position >= 1 && entry.position <= flow.length)
  const sorted = [...reached].sort((left, right) => left.position - right.position)

  /*
   * AUCUN FAIT ⇒ LE DOSSIER N'EST PAS DANS CE PARCOURS.
   *
   * `null`, et non « à déterminer ». La première étape de chaque chaîne est ce
   * qui définit l'APPARTENANCE : un besoin qui existe est dans le sourcing, un
   * consultant disponible est dans la prospection inversée, un projet dont le
   * compte a reçu un appel d'offres est dans la chaîne AO. Sans ce premier fait,
   * le dossier n'est pas « quelque part qu'on ignore » — il est ailleurs.
   *
   * Mesuré en production le 05/09 : rendre « à déterminer » désignait 464
   * projets sur 651, soit tous ceux qui ne sont pas des appels d'offres. Une
   * alerte qui vise la population entière cesse d'être lue.
   */
  if (sorted.length === 0) return null

  const furthest = sorted[sorted.length - 1].position
  const gate = chain.gates.find(entry => entry.afterPosition === furthest)
  if (!gate) return { kind: 'at', position: furthest, blockedGate: null, gateReason: null, evidence: sorted }

  const answer = gateAnswers[gate.gate]
  // L'objet ne sait pas répondre à cette porte : le dossier n'est pas bloqué,
  // il est simplement là. Inventer une attente ferait apparaître dans la file
  // des décisions des dossiers que personne n'attend.
  if (!answer) return { kind: 'at', position: furthest, blockedGate: null, gateReason: null, evidence: sorted }
  if (answer.decided === null) {
    return { kind: 'at', position: furthest, blockedGate: gate.gate, gateReason: null, evidence: sorted }
  }
  /*
   * ⚠️ UN OUI NE FAIT PAS AVANCER, IL DÉBLOQUE.
   *
   * `nextPosition` enverrait le dossier sur `yesTargetPosition` — c'est-à-dire
   * sur une étape dont le fait n'est PAS établi, puisque s'il l'était, il serait
   * déjà la position la plus avancée. Un compte prioritisé se retrouverait à
   * « Compte au portefeuille » alors que son statut commercial dit le contraire :
   * exactement l'étape inventée que le §6 de #1507 interdit, sous sa forme la
   * plus discrète — plausible, et fausse.
   *
   * Un NON, lui, DÉPLACE, et c'est le métier : « un refus client ramène au
   * matching, avec le motif attaché ». C'est la seule asymétrie du moteur, et
   * elle est voulue.
   */
  if (answer.decided) return { kind: 'at', position: furthest, blockedGate: null, gateReason: null, evidence: sorted }
  const target = nextPosition(chain, furthest, false)
  return { kind: 'at', position: target.position, blockedGate: null, gateReason: answer.reason, evidence: sorted }
}

/**
 * UN BLOCAGE, tel que « Aujourd'hui » l'affiche et que Laura le lit (#1506).
 *
 * Regroupé par (parcours, étape) : « 3 dossiers attendent un retour client
 * depuis plus de 7 jours » est actionnable ; trois lignes séparées, non. C'est
 * une LECTURE — rien n'est créé, rien n'est envoyé. « Ne jamais envoyer une
 * action automatiquement parce qu'une étape est bloquée » (#1507 §6).
 */
export const chainBlockerSchema = z.object({
  chainKey: chainKeySchema,
  subjectType: chainSubjectTypeSchema,
  position: z.number().int().min(1),
  /**
   * Les libellés du parcours et de l'étape, DANS LES DEUX LANGUES.
   *
   * ⚠️ Ce ne sont pas des phrases d'affichage écrites côté serveur : ce sont les
   * deux moitiés du catalogue, qui les porte déjà en `fr` et en `en`. Les
   * envoyer ici évite au lecteur d'aller rechercher le catalogue pour traduire
   * une clé — « Aujourd'hui » le rend dans une carte qui n'a rien à interroger.
   */
  chainLabel: localized,
  stepLabel: localized,
  /** La porte qui attend une décision. `null` = simple immobilité. */
  gate: decisionGateSchema.nullable(),
  count: z.number().int().min(1),
  /** Depuis combien de jours le plus ancien n'a pas bougé. */
  oldestDays: z.number(),
  /** Trois dossiers au plus — de quoi les reconnaître sans les ouvrir. */
  sample: z.array(z.object({ subjectId: z.string(), label: z.string().nullable(), days: z.number() })),
})
export type ChainBlocker = z.infer<typeof chainBlockerSchema>
