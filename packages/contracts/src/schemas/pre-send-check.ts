import {
  OUTREACH_KILLER_MISTAKES,
  OUTREACH_PERSONA_PROFILES,
  OUTREACH_WRITING_RULES,
  type OutreachPersona,
} from './outreach-scenarios.js'

/**
 * Le contrôle avant envoi — la checklist en huit points du document source,
 * ramenée à ce qu'une machine peut RÉELLEMENT vérifier.
 *
 * Il tourne dans le navigateur, sur le brouillon que le commercial a sous les
 * yeux : fonction pure, aucun appel réseau, aucun appel modèle, aucun crédit. Un
 * contrôle qui coûterait un appel serait désactivé le jour où quelqu'un regarde
 * la facture, et c'est précisément le contrôle qu'on veut voir tourner à chaque
 * message.
 *
 * ## Trois verdicts, et le troisième porte l'honnêteté
 *
 * - `pass` — vérifié, conforme.
 * - `fail` — vérifié, non conforme, avec ce qui cloche EN CLAIR.
 * - `not_checkable` — la règle existe et cette machine ne sait pas la vérifier.
 *
 * Le troisième n'est pas un remplissage. Trois des huit règles demandent de
 * comprendre un texte : la cohérence M1-M2-M3, l'adéquation du levier au persona
 * et « avoir lu le profil ». Les approximer ferait afficher « conforme » sur un
 * message qui ne l'est pas — et un contrôle qui se trompe dans ce sens-là est
 * pire que pas de contrôle, parce qu'il remplace la relecture.
 *
 * ⚠️ **Rien ici ne BLOQUE un envoi.** Le contrôle informe la personne qui va
 * cliquer ; c'est elle qui décide. Bloquer un envoi sur une heuristique de
 * comptage de mots ferait perdre un message juste, et apprendrait à contourner
 * le contrôle plutôt qu'à le lire.
 */

export type PreSendVerdict = 'pass' | 'fail' | 'not_checkable'

export type PreSendCheckItem = {
  /** L'identifiant de la règle dans `OUTREACH_WRITING_RULES`. */
  readonly id: string
  readonly rule: string
  readonly verdict: PreSendVerdict
  /** Ce qui cloche, ou pourquoi ce n'est pas vérifiable. Jamais vide. */
  readonly detail: string
  /**
   * L'erreur qui tue dont cet échec est une occurrence, EN CLAIR — le libellé
   * vient de `OUTREACH_KILLER_MISTAKES`, jamais d'une seconde formulation.
   *
   * Absente sur `pass` et sur `not_checkable` : nommer une erreur sous une ligne
   * qu'on n'a pas su vérifier serait une accusation gratuite, et c'est ce qui
   * fait cesser de lire une checklist. Absente aussi pour les deux erreurs que
   * rien ne détecte (« écrire sans avoir lu le profil », « abandonner après un
   * silence au M1 ») — les rattacher à un point voisin les ferait passer pour
   * vérifiées.
   */
  readonly mistake?: string
}

export type PreSendCheckInput = {
  /** Le corps du message, tel qu'il partira. */
  readonly body: string
  /** L'objet, pour un e-mail. Un message LinkedIn n'en a pas. */
  readonly subject?: string | null
  /** Le rang du message dans la séquence — 1 = premier contact. */
  readonly step?: number
  /** Le nom de l'ESN qui écrit : interdit dans le premier message. */
  readonly sellerCompany?: string | null
  /** Le persona du destinataire, quand il est établi. */
  readonly persona?: OutreachPersona | null
  /** Jours écoulés depuis le message précédent, et le minimum du scénario. */
  readonly daysSincePrevious?: number | null
  readonly minDelayDays?: number | null
  /**
   * #2123.74 — les éléments RÉELS du dossier que ce brouillon peut citer (un
   * signal daté, une entité précise…), tels que le moteur les a relevés. Absent
   * ou vide ⇒ la règle `names_real_context` dit qu'elle ne sait pas ; elle ne
   * conclut jamais « conforme » sur un dossier dont elle ignore le contenu.
   */
  readonly realContext?: readonly string[] | null
}

/** 200 mots : la borne du document, et la limite au-delà de laquelle un message
 *  LinkedIn se lit en deux écrans sur mobile. */
const MAX_WORDS = 200

/** Une question « facile » se répond en une phrase. Au-delà, ce n'est plus une
 *  question, c'est un questionnaire. */
const MAX_QUESTION_WORDS = 25

/** Le jargon que le document nomme, plus ses variantes les plus courantes. Une
 *  liste COURTE et littérale : élargie à coups de mots génériques, elle
 *  signalerait des messages parfaitement écrits et cesserait d'être lue. */
const ESN_JARGON: readonly string[] = [
  'expertises reconnues',
  'expertise reconnue',
  'méthodologie éprouvée',
  'methodologie eprouvee',
  'savoir-faire éprouvé',
  'acteur incontournable',
  'partenaire de confiance',
  'solutions innovantes',
  'accompagner votre transformation',
  'à votre écoute',
]

/** Les tournures qui rendent une relance vide — la quatrième des six erreurs. */
const EMPTY_FOLLOW_UP: readonly string[] = [
  'juste un petit follow',
  'petit follow-up',
  'petit follow up',
  'un simple suivi',
  'je me permets de revenir vers vous',
  'je reviens vers vous',
  'up sur mon message',
  'as-tu vu mon message',
  'avez-vous vu mon message',
]

/** Demander un rendez-vous — interdit au premier message. */
const MEETING_ASK: readonly string[] = [
  'rendez-vous',
  'rendez vous',
  'un créneau',
  'un creneau',
  'quinze minutes',
  '15 minutes',
  '30 minutes',
  'trente minutes',
  'un appel',
  'un call',
  'une visio',
  'votre agenda',
  'votre calendrier',
]

/** #2123.76 — dérouler l'offre de l'ESN au premier message : parler de soi
 *  avant de parler de l'autre, en version catalogue. Liste COURTE et littérale,
 *  comme le jargon : « notre échange » n'est pas un catalogue. Les accents sont
 *  pliés par `normalized`, pas les apostrophes — d'où les deux graphies. */
const FULL_OFFER_PITCH: readonly string[] = [
  'nous intervenons sur',
  'nous intervenons dans',
  'nos offres',
  'notre offre complète',
  'notre offre globale',
  'une offre globale',
  'nos services',
  'nos domaines d’expertise',
  "nos domaines d'expertise",
  'nos domaines d’intervention',
  "nos domaines d'intervention",
  'notre catalogue',
  'de bout en bout',
  'à 360',
  'nous proposons également',
]

/** #2123.78 — une échéance ou une rareté que le contexte ne porte pas. */
const FALSE_URGENCY: readonly string[] = [
  'dernière chance',
  'urgent',
  'offre limitée',
  'places limitées',
  'plus que quelques',
  'ne tardez pas',
  'sans tarder',
  'avant qu’il ne soit trop tard',
  "avant qu'il ne soit trop tard",
  'dans les plus brefs délais',
  'au plus vite',
  'expire bientôt',
]

/** #2123.79 — l'observation historique inquiétante citée en accroche : une
 *  donnée PRIVÉE présentée comme un signal marché (#1926.25). */
const WORRYING_HISTORY: readonly string[] = [
  'plan social',
  'plan de sauvegarde de l’emploi',
  "plan de sauvegarde de l'emploi",
  'licenciement',
  'suppression de postes',
  'suppressions de postes',
  'redressement judiciaire',
  'liquidation judiciaire',
  'procédure collective',
  'difficultés financières',
  'baisse du chiffre d’affaires',
  "baisse du chiffre d'affaires",
  'chute du chiffre',
  'résultats en baisse',
  'fermeture de site',
  'cyberattaque',
  'fuite de données',
]

/** #2371.7 — dérouler le stack technique à un décideur. Liste COURTE et
 *  littérale, même idiome que `FULL_OFFER_PITCH` : élargie à coups de noms de
 *  technologies génériques, elle accuserait n'importe quelle phrase technique
 *  légitime. */
const TECH_CATALOGUE_PHRASES: readonly string[] = [
  'notre stack technique',
  'nos technologies',
  'les technologies suivantes',
  'notre stack technologique',
  'compétences techniques suivantes',
  'expertises techniques suivantes',
  'stack technique couvre',
]

/** #2372.6 — un document JOINT (ou envoyé d'office) au lieu d'être annoncé.
 *  Liste COURTE et littérale : « je peux vous envoyer une synthèse » est
 *  l'annonce que la règle DEMANDE, elle ne doit pas être accusée. */
const ATTACHED_ASSET: readonly string[] = [
  'ci-joint',
  'ci-jointe',
  'ci joint',
  'en pièce jointe',
  'en pj',
  'je vous joins',
  'je joins',
  'vous trouverez joint',
  'notre plaquette',
  'notre brochure',
  'notre présentation commerciale',
]

/** Les éléments réels que le brouillon cite, et ceux qu'il laisse de côté. */
function citedContext(body: string, context: readonly string[]): { cited: string[]; usable: string[] } {
  const hay = normalized(body)
  const usable = context.map(value => value.trim()).filter(value => value.length > 0)
  return { cited: usable.filter(value => hay.includes(normalized(value))), usable }
}

function deaccent(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

function normalized(value: string): string {
  return deaccent(value).toLowerCase().replace(/\s+/g, ' ')
}

function countWords(value: string): number {
  const words = value.trim().match(/[\p{L}\p{N}'’-]+/gu)
  return words ? words.length : 0
}

/** Les phrases interrogatives du corps. */
function questions(body: string): string[] {
  return body
    .split(/(?<=[.!?…])\s+/u)
    .map(sentence => sentence.trim())
    .filter(sentence => sentence.endsWith('?'))
}

function found(haystack: string, needles: readonly string[]): string[] {
  const hay = normalized(haystack)
  return needles.filter(needle => hay.includes(normalized(needle)))
}

function ruleText(id: string): string {
  return OUTREACH_WRITING_RULES.find(rule => rule.id === id)?.rule ?? id
}

/** Le libellé d'une erreur qui tue, lu au registre. Rien n'est recopié : deux
 *  formulations divergeraient au premier remaniement, et c'est l'écran qui
 *  afficherait l'ancienne. */
function mistakeText(id: string): string | undefined {
  return OUTREACH_KILLER_MISTAKES.find(mistake => mistake.id === id)?.mistake
}

/** Le nombre de jours, écrit. `0` est une MESURE ici — « parti aujourd'hui » —
 *  et non l'absence déguisée en zéro : l'appelant qui n'a pas la date passe
 *  `null`, et la branche « date inconnue » ne cite aucun nombre. */
function days(count: number): string {
  return `${count} jour${count > 1 ? 's' : ''}`
}

/**
 * Passe le brouillon aux douze points : les huit du document, dans son ordre,
 * puis les quatre interdits de ton du premier message (#2123.74/.76/.78/.79).
 *
 * Rend TOUJOURS douze éléments : un contrôle qui masquerait ses lignes non
 * vérifiables laisserait croire que la checklist en compte cinq.
 */
export function preSendCheck(input: PreSendCheckInput): PreSendCheckItem[] {
  const body = input.body ?? ''
  const isFirstStep = (input.step ?? 1) <= 1
  const items: PreSendCheckItem[] = []
  const add = (id: string, verdict: PreSendVerdict, detail: string, mistakeId?: string) => {
    // L'erreur n'est citée que sur un ÉCHEC : c'est le seul moment où elle est
    // vraie, et le seul où elle sert — juste avant l'envoi, pas après.
    const mistake = verdict === 'fail' && mistakeId !== undefined ? mistakeText(mistakeId) : undefined
    items.push({ id, rule: ruleText(id), verdict, detail, ...(mistake === undefined ? {} : { mistake }) })
  }

  // 1. Variables personnalisées — le seul contrôle qui rattrape un accident
  //    vraiment coûteux : un « {{Prénom}} » parti tel quel.
  const placeholders = [...body.matchAll(/\{\{\s*([^}]+?)\s*\}\}/g)].map(match => match[1] ?? '')
  const subjectPlaceholders = [...(input.subject ?? '').matchAll(/\{\{\s*([^}]+?)\s*\}\}/g)].map(m => m[1] ?? '')
  const allPlaceholders = [...placeholders, ...subjectPlaceholders]
  add(
    'variables_filled',
    allPlaceholders.length === 0 ? 'pass' : 'fail',
    allPlaceholders.length === 0
      ? 'Aucune variable laissée en place.'
      : `Variables non remplacées : ${allPlaceholders.map(name => `{{${name}}}`).join(', ')}`,
    // Un gabarit parti sans être rempli EST « le même message à tout le monde » —
    // la première des six erreurs, dans sa forme la plus littérale.
    'same_message_to_everyone',
  )

  // 2. Moins de 200 mots.
  const words = countWords(body)
  add(
    'under_200_words',
    words <= MAX_WORDS ? 'pass' : 'fail',
    words <= MAX_WORDS ? `${words} mots.` : `${words} mots — ${words - MAX_WORDS} de trop.`,
  )

  // 3. Une question, et elle se répond en une phrase.
  const asked = questions(body)
  if (asked.length === 0) {
    add('easy_question', 'fail', 'Aucune question — rien à quoi répondre.')
  } else {
    const shortest = asked.reduce((best, q) => Math.min(best, countWords(q)), Number.POSITIVE_INFINITY)
    add(
      'easy_question',
      shortest <= MAX_QUESTION_WORDS ? 'pass' : 'fail',
      shortest <= MAX_QUESTION_WORDS
        ? `${asked.length} question${asked.length > 1 ? 's' : ''}, la plus courte en ${shortest} mots.`
        : `La question la plus courte fait ${shortest} mots — elle ne se répond pas en une phrase.`,
    )
  }

  // 4. Zéro jargon.
  const jargon = found(body, ESN_JARGON)
  add(
    'no_esn_jargon',
    jargon.length === 0 ? 'pass' : 'fail',
    jargon.length === 0 ? 'Aucune formule creuse repérée.' : `À retirer : « ${jargon.join(' », « ')} »`,
  )

  // 5. Aucune mention de son entreprise au premier message.
  const seller = (input.sellerCompany ?? '').trim()
  if (!isFirstStep) {
    add('no_company_in_first', 'pass', 'Ne s’applique qu’au premier message.')
  } else if (!seller) {
    add('no_company_in_first', 'not_checkable', 'Le nom de la société qui écrit n’est pas connu ici.')
  } else {
    const mentioned = normalized(body).includes(normalized(seller))
    add(
      'no_company_in_first',
      mentioned ? 'fail' : 'pass',
      mentioned ? `« ${seller} » apparaît dans le premier message.` : 'Le premier message ne se présente pas.',
      // Se présenter d'abord, c'est parler de soi avant de parler de l'autre —
      // la deuxième des six erreurs.
      'self_before_other',
    )
  }

  // 6. Cohérence M1-M2-M3 — NON vérifiable. Il faudrait comparer le sens de
  //    trois messages, et une comparaison de surface dirait « cohérent » sur
  //    trois paraphrases du même texte, qui est exactement le défaut visé.
  add('sequence_coherence', 'not_checkable', 'À relire d’affilée : le M2 suit le M1, le M3 clôture sans répéter.')

  // 7. Timing — plus les deux tournures qui vident une relance.
  const emptyFollowUp = found(body, EMPTY_FOLLOW_UP)
  const since = input.daysSincePrevious
  const minimum = input.minDelayDays
  if (isFirstStep) {
    add('timing_respected', 'pass', 'Premier message — aucun délai à respecter.')
  } else if (emptyFollowUp.length > 0) {
    add(
      'timing_respected',
      'fail',
      `Relance vide : « ${emptyFollowUp.join(' », « ')} » — une relance apporte du neuf.`,
      // La quatrième des six erreurs, mot pour mot.
      'empty_follow_up',
    )
  } else if (typeof since !== 'number') {
    // ⚠️ Deux ignorances DIFFÉRENTES, et les confondre faisait dire « la date
    // n'est pas connue » à un appelant qui la fournissait. Ici : pas de date.
    // Aucun nombre de jours n'est cité — « 0 jour depuis le précédent » n'est
    // pas « aucun message précédent ».
    add('timing_respected', 'not_checkable', 'La date du message précédent n’est pas connue ici.')
  } else if (typeof minimum !== 'number') {
    // Là : la date EST connue, c'est le plancher qui manque. Le fait mesuré est
    // rendu, la conclusion ne l'est pas.
    add(
      'timing_respected',
      'not_checkable',
      `${days(since)} depuis le message précédent — aucun délai minimal n’est établi pour ce contact.`,
    )
  } else {
    add(
      'timing_respected',
      since >= minimum ? 'pass' : 'fail',
      since >= minimum
        ? `${days(since)} depuis le précédent (minimum ${minimum}).`
        : `${days(since)} depuis le précédent — le scénario en demande ${minimum}.`,
      // Aucune erreur citée : relancer TROP TÔT n'est pas « relancer avec un
      // follow-up vide ». Les six erreurs sont une liste fermée, et y ranger un
      // défaut voisin la rendrait fausse.
    )
  }

  // 8. Le bon persona — non vérifiable au sens strict (il faudrait juger si le
  //    levier employé est celui qui parle à cette personne). Ce qui EST
  //    vérifiable est rendu quand même : demander un rendez-vous au premier
  //    message, quel que soit le persona, est la troisième des six erreurs.
  const meetingAsk = isFirstStep ? found(body, MEETING_ASK) : []
  if (meetingAsk.length > 0) {
    add(
      'right_persona',
      'fail',
      `Rendez-vous demandé au premier message : « ${meetingAsk.join(' », « ')} »`,
      // La troisième des six erreurs.
      'meeting_in_first_message',
    )
  } else if (!input.persona) {
    add('right_persona', 'not_checkable', 'Le persona du destinataire n’est pas établi.')
  } else {
    // Toujours `not_checkable` — juger si le levier employé est le bon demande
    // de comprendre un texte. Ce qui change : la ligne dit désormais À QUOI le
    // comparer. « Persona decideur » ne se relit pas ; « levier attendu : un
    // arbitrage qu'il est en train de faire » se relit.
    const profile = OUTREACH_PERSONA_PROFILES[input.persona]
    add(
      'right_persona',
      'not_checkable',
      `Levier attendu : ${profile.lever}. Il parle en ${profile.speaksIn} ; il décroche sur ${profile.turnsOff}.`,
    )
  }

  // 9. #2123.74 — le premier message nomme un contexte réel du dossier.
  const { cited, usable } = citedContext(body, input.realContext ?? [])
  if (!isFirstStep) {
    add('names_real_context', 'pass', 'Relance : le contexte réel est exigé au premier message.')
  } else if (usable.length === 0) {
    // Rien de connu ⇒ rien à conclure. « Conforme » sur un dossier ignoré
    // remplacerait la relecture ; « échec » accuserait sans preuve.
    add('names_real_context', 'not_checkable', 'Aucun élément réel du dossier n’est connu ici.')
  } else if (cited.length > 0) {
    add('names_real_context', 'pass', `Cite : « ${cited.join(' », « ')} ».`)
  } else {
    add(
      'names_real_context',
      'fail',
      `Aucun élément réel du dossier n’est cité — à disposition : « ${usable.join(' », « ')} ».`,
      // Un premier message sans contexte réel part identique vers n'importe qui.
      'same_message_to_everyone',
    )
  }

  // 10. #2123.76 — pas le catalogue de l'ESN au premier message.
  const pitch = isFirstStep ? found(body, FULL_OFFER_PITCH) : []
  add(
    'no_full_offer_pitch',
    pitch.length === 0 ? 'pass' : 'fail',
    !isFirstStep
      ? 'Relance : l’offre peut s’y préciser.'
      : pitch.length === 0
        ? 'Aucune offre déroulée.'
        : `Offre déroulée : « ${pitch.join(' », « ')} » — une seule accroche suffit.`,
    'self_before_other',
  )

  // 11. #2123.78 — aucune fausse urgence, à tout rang. Aucune des six erreurs
  //     n'en est une : la liste est fermée, rien n'est cité.
  const urgency = found(body, FALSE_URGENCY)
  add(
    'no_false_urgency',
    urgency.length === 0 ? 'pass' : 'fail',
    urgency.length === 0 ? 'Aucune urgence affichée.' : `Urgence sans contexte : « ${urgency.join(' », « ')} ».`,
  )

  // 12. #2123.79 — pas d'observation historique inquiétante en accroche.
  const alarm = isFirstStep ? found(body, WORRYING_HISTORY) : []
  add(
    'no_worrying_history',
    alarm.length === 0 ? 'pass' : 'fail',
    !isFirstStep
      ? 'Relance : la règle vise l’accroche du premier message.'
      : alarm.length === 0
        ? 'Aucune observation inquiétante en accroche.'
        : `Observation inquiétante citée : « ${alarm.join(' », « ')} » — un signal négatif ancien n’ouvre pas une relation.`,
  )

  // 13. #2371.7 — le décideur ne reçoit pas le catalogue technique de l'ESN.
  //     Ne s'applique qu'au persona `decideur` ; les autres personas parlent
  //     chacun leur propre unité (PERSONA_PROFILES), donc y appliquer la même
  //     règle accuserait le bon message pour le mauvais destinataire.
  const techCatalogue = found(body, TECH_CATALOGUE_PHRASES)
  if (!input.persona) {
    // Même cause que `right_persona` (persona inconnu), mais DEUX lignes de la
    // checklist : un texte identique aux deux lignes lirait comme un bug
    // d'affichage, pas comme deux règles qui s'appliquent chacune.
    add(
      'no_tech_catalogue_for_decision_maker',
      'not_checkable',
      'Persona non établi — impossible de dire s’il reçoit un catalogue technique.',
    )
  } else if (input.persona !== 'decideur') {
    add('no_tech_catalogue_for_decision_maker', 'pass', 'Ne s’applique qu’au persona decideur.')
  } else {
    add(
      'no_tech_catalogue_for_decision_maker',
      techCatalogue.length === 0 ? 'pass' : 'fail',
      techCatalogue.length === 0
        ? 'Aucun catalogue technique déroulé.'
        : `Catalogue technique déroulé : « ${techCatalogue.join(' », « ')} » — un décideur parle arbitrage, pas stack.`,
    )
  }

  // 14. #2372.6 — un document utile s'annonce, il ne se joint pas. À TOUT rang :
  //     un message de séquence part avant une réponse (le M2/M3 relancent un
  //     silence), donc aucun ne porte l'intérêt confirmé qui autorise l'envoi.
  const asset = found(body, ATTACHED_ASSET)
  add(
    'asset_after_interest',
    asset.length === 0 ? 'pass' : 'fail',
    asset.length === 0
      ? 'Aucun document joint d’office.'
      : `Document joint avant tout intérêt : « ${asset.join(' », « ')} » — annoncez-le et proposez de l’envoyer.`,
  )

  return items
}

/** Le nombre de points en échec — ce que l'écran met en avant. */
export function preSendFailures(items: readonly PreSendCheckItem[]): PreSendCheckItem[] {
  return items.filter(item => item.verdict === 'fail')
}

function foldForMatch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * #3436 — « trop générique » dit comme un ÉCHEC, jamais comme un avis.
 *
 * Le test de la spec : « en changeant le nom de l'entreprise, le message
 * resterait-il valable ? ». Un message qui ne nomme ni l'entreprise ni la
 * personne l'est : échec explicite. Sans destinataire connu (`recipientTerms`
 * vide), la règle n'a rien à comparer : `not_checkable`, jamais un « conforme »
 * deviné. Hors de la liste partagée avec l'écran (le contact y est connu et
 * déjà nommé par la fiche) : ajoutée seulement là où le texte arrive nu.
 */
export function recipientSpecificityCheck(body: string, recipientTerms: readonly string[]): PreSendCheckItem {
  const terms = recipientTerms.map(foldForMatch).filter(term => term.length >= 2)
  const rule = 'Le message parle de CE destinataire (son entreprise, son nom), pas de n’importe qui.'
  if (terms.length === 0) {
    return {
      id: 'recipient_specific',
      rule,
      verdict: 'not_checkable',
      detail: 'Le destinataire n’est pas connu ici : impossible de dire si le message est personnel.',
    }
  }
  const text = ` ${foldForMatch(body)} `
  const named = terms.some(term => text.includes(` ${term} `))
  if (named) return { id: 'recipient_specific', rule, verdict: 'pass', detail: 'Le message nomme son destinataire.' }
  const mistake = mistakeText('same_message_to_everyone')
  return {
    id: 'recipient_specific',
    rule,
    verdict: 'fail',
    detail:
      'Trop générique : ni l’entreprise ni la personne ne sont nommées — il vaudrait pour n’importe quel destinataire.',
    ...(mistake === undefined ? {} : { mistake }),
  }
}
