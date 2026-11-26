/**
 * Les garde-fous de Laura, EN CODE et non dans le prompt.
 *
 * Le rapport du 17/08 le pose comme principe d'architecture, et c'est le seul
 * point du document qui ne se négocie pas : « le prompt seul ne constitue jamais
 * une barrière de sécurité ». Un prompt est du texte au milieu d'autre texte —
 * c'est précisément ce qu'une injection cherche à retourner contre lui. Ce
 * fichier contient donc ce qui doit rester vrai même si le modèle est convaincu
 * du contraire.
 *
 * Trois familles, dans l'ordre où elles s'appliquent :
 *
 *  1. l'ENTRÉE est bornée (longueur, fréquence) et les tentatives d'injection
 *     sont repérées AVANT d'atteindre le modèle ;
 *  2. la SORTIE est filtrée : rien qui ait la forme d'un secret ne franchit la
 *     frontière, quelle qu'ait été la question ;
 *  3. rien de ce que le visiteur écrit n'est traité comme une instruction.
 *
 * Le module est pur : il ne lit ni réseau, ni horloge (le temps est un
 * paramètre), ce qui le rend entièrement testable — et c'est ce qui permet la
 * batterie adversariale du §10 du rapport.
 */

/** Longueur maximale d'un message visiteur. Au-delà, on refuse sans appeler le
 *  modèle : un pavé de 20 000 caractères n'est jamais une question commerciale,
 *  c'est une tentative de noyer les instructions ou de faire exploser la facture. */
export const MAX_MESSAGE_CHARS = 1500

/** Messages par session et par fenêtre. Le rapport demande un rate-limit
 *  « IP/session » ; la borne par session vit ici, la borne par IP appartient à
 *  l'infrastructure (elle seule voit l'IP de façon fiable derrière un CDN). */
export const MAX_MESSAGES_PER_WINDOW = 30
export const RATE_WINDOW_MS = 10 * 60 * 1000

/**
 * Ce qui, dans un message, cherche à faire changer Laura de rôle.
 *
 * La liste vise des FORMES d'attaque, pas des mots-clés isolés : « ignore » tout
 * seul est un mot français ordinaire, « ignore les instructions précédentes »
 * ne l'est pas. Une détection trop large refuserait des visiteurs légitimes, ce
 * qui est un coût commercial réel sur un site public.
 *
 * Ce n'est PAS la seule défense, et elle n'a pas besoin d'être exhaustive : les
 * outils sont en liste blanche, le prompt ne contient aucun secret, et la sortie
 * est filtrée. Elle sert à répondre proprement — « je ne peux pas faire ça » —
 * plutôt qu'à laisser le modèle improviser un refus.
 */
const INJECTION_PATTERNS: readonly RegExp[] = [
  // Remplacer / ignorer les instructions.
  /\b(ignore|oublie|forget|disregard|override)\b[^.!?]{0,40}\b(instructions?|r[èe]gles?|rules?|prompt|consignes?)\b/i,
  // Faire réciter le prompt système.
  /\b(system\s*prompt|prompt\s*syst[èe]me|tes\s+instructions|your\s+instructions|initial\s+prompt)\b/i,
  // Changement de rôle / jailbreak nommé.
  /\b(tu\s+es\s+maintenant|you\s+are\s+now|act\s+as|agis\s+comme|pretend\s+to\s+be|DAN\s+mode|developer\s+mode|mode\s+d[ée]veloppeur)\b/i,
  // Extraction de secrets / configuration.
  /\b(cl[ée]s?\s+api|api\s*keys?|variables?\s+d.environnement|env\s+vars?|secrets?|token\s+oauth|service[_\s-]?role)\b/i,
  // Accès système / exécution.
  /\b(execute_sql|run_code|fetch_url|read_file|search_internal_docs|drop\s+table|select\s+\*\s+from)\b/i,
  // Exfiltration d'autres visiteurs.
  /\b(autres?\s+visiteurs?|other\s+users?|conversations?\s+pr[ée]c[ée]dentes?\s+d.un\s+autre)\b/i,
]

/** Pourquoi un message n'atteint pas le modèle. */
type RefusalReason = 'empty' | 'too_long' | 'rate_limited' | 'injection'

type InputVerdict = { ok: true; message: string } | { ok: false; reason: RefusalReason }

/**
 * Ce refus relève-t-il de la SÉCURITÉ, et doit-il donc se compter ?
 *
 * Une injection et un déluge de messages sont des abus ; un message vide ou trop
 * long est une maladresse. Les mélanger rendrait l'indicateur `chat_refusal` du
 * §9 illisible — on ne saurait plus si le chiffre monte parce qu'on est attaqué
 * ou parce que quelqu'un a collé un CV dans la zone de saisie.
 */
export function isAbuseRefusal(reason: RefusalReason): boolean {
  return reason === 'injection' || reason === 'rate_limited'
}

/**
 * Le message est-il recevable ? — la seule porte d'entrée vers le modèle.
 *
 * `recentCount` est le nombre de messages déjà envoyés dans la fenêtre courante
 * pour cette session. Il est passé plutôt que lu ici : le compteur appartient au
 * serveur, et un module pur qui irait le chercher lui-même ne serait pas testable.
 */
export function inspectInput(raw: string, recentCount = 0): InputVerdict {
  const message = raw.trim()
  if (!message) return { ok: false, reason: 'empty' }
  if (message.length > MAX_MESSAGE_CHARS) return { ok: false, reason: 'too_long' }
  if (recentCount >= MAX_MESSAGES_PER_WINDOW) return { ok: false, reason: 'rate_limited' }
  if (INJECTION_PATTERNS.some(pattern => pattern.test(message))) return { ok: false, reason: 'injection' }
  return { ok: true, message }
}

/* ------------------------------------------------------------------ */
/*  Sortie — ce qui ne franchit jamais la frontière                    */
/* ------------------------------------------------------------------ */

/** Le remplacement, volontairement lisible : le visiteur doit comprendre qu'il
 *  manque quelque chose, pas croire à un bug d'affichage. */
export const REDACTED = '[valeur masquée]'

/**
 * Ce qui a la FORME d'un secret machine.
 *
 * La forme fait foi, jamais le nom de la variable : un modèle qui recopierait
 * une clé sous un intitulé inventé serait invisible à une liste de noms. Même
 * discipline que le filtre du copilote applicatif (`secret_redaction.py`) — deux
 * surfaces, une seule règle.
 */
const SECRET_PATTERNS: readonly RegExp[] = [
  /\bsk-ant-[A-Za-z0-9_-]{8,}/i,
  /\bsk-[A-Za-z0-9]{20,}/,
  /\b[rs]k_(?:live|test)_[A-Za-z0-9]{10,}/,
  /\bwhsec_[A-Za-z0-9]{10,}/,
  /\bgh[pousr]_[A-Za-z0-9]{20,}/,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}/,
  /\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}/,
  /\bAIza[A-Za-z0-9_-]{30,}/,
  // JWT — la forme d'un jeton de session, d'un service-role ou d'un accès OAuth.
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/,
  /https:\/\/hooks\.slack\.com\/\S+/i,
]

/** `NOM_DE_VARIABLE=valeur` — on garde le NOM (dire « il manque telle clé » est
 *  une réponse utile) et on masque la VALEUR. */
const ENV_ASSIGNMENT = /\b([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*(?:KEY|TOKEN|SECRET|PASSWORD|DSN|CREDENTIALS))\s*[:=]\s*(\S+)/g

/**
 * Les hôtes internes que le chatbot public ne doit jamais nommer.
 *
 * Le rapport l'exige explicitement : « aucune clé, architecture, fournisseur
 * backend, coût interne, prompt, log, nom de table ». Le nom d'un hôte
 * d'infrastructure ne sert à aucun visiteur et renseigne un attaquant.
 */
const INTERNAL_HOSTS = /\b[\w-]+\.(?:up\.railway\.app|supabase\.co|vercel\.app|internal)\b/gi

/**
 * L'adresse e-mail d'un membre de l'équipe — l'invariant du §4.9 du PDF 10.
 *
 * « Jamais. C'est un invariant, pas une préférence. » Le prompt le disait déjà,
 * et le transcript test montre l'adresse personnelle du fondateur diffusée
 * **deux fois** à un inconnu. C'est la démonstration ordinaire du principe qui
 * porte tout ce fichier : une consigne de prompt n'est pas une garantie.
 *
 * On vise l'adresse et JAMAIS le domaine seul : le site s'appelle
 * `bellum-ai.com`, et masquer son propre nom de domaine dans une réponse
 * commerciale serait un défaut à son tour. Le sous-domaine est couvert
 * (`sales@mail.bellum-ai.com`), la casse aussi — un modèle recopie parfois une
 * adresse en capitales.
 */
const INTERNAL_EMAIL = /\b[A-Za-z0-9._%+-]+@(?:[A-Za-z0-9-]+\.)*bellum-(?:it|ai)\.com\b/gi

/** Volontairement lisible, et distinct de `REDACTED` : le visiteur doit
 *  comprendre qu'on ne donne pas d'adresse, pas croire à un secret masqué. */
export const REDACTED_INTERNAL_EMAIL = '[adresse retirée]'

/** Y a-t-il une adresse interne là-dedans ? — la question que pose la garde
 *  GL-01, sur la réponse ENTIÈRE et pas seulement sur son texte. */
export function containsInternalEmail(text: string): boolean {
  return new RegExp(INTERNAL_EMAIL).test(text)
}

/** Rend `text` débarrassé de ce qui ne doit pas sortir. Idempotent. */
export function redactOutput(text: string): string {
  if (!text) return text
  let cleaned = text
  for (const pattern of SECRET_PATTERNS) cleaned = cleaned.replace(new RegExp(pattern, 'gi'), REDACTED)
  cleaned = cleaned.replace(ENV_ASSIGNMENT, (match, name: string, value: string) =>
    value === REDACTED ? match : `${name}=${REDACTED}`,
  )
  cleaned = cleaned.replace(INTERNAL_HOSTS, REDACTED)
  cleaned = cleaned.replace(INTERNAL_EMAIL, REDACTED_INTERNAL_EMAIL)
  return cleaned
}

/* ------------------------------------------------------------------ */
/*  Données personnelles — ce qu'on refuse de collecter                */
/* ------------------------------------------------------------------ */

/**
 * Le visiteur vient de coller quelque chose qu'il ne devrait pas.
 *
 * On ne le stocke pas, on ne le répète pas, et on le lui DIT — c'est la
 * réponse-type du rapport. Volontairement étroit : un mot de passe choisi par un
 * humain ne se distingue pas d'une phrase, donc on ne détecte que ce qui
 * s'annonce comme tel ou porte une forme reconnaissable.
 */
const SENSITIVE_DISCLOSURE: readonly RegExp[] = [
  /\b(mon|le)\s+mot\s+de\s+passe\s+(est|:)/i,
  /\bmy\s+password\s+(is|:)/i,
  /\b(voici|voila|here.s)\s+(ma|my)\s+(cl[ée]|api\s*key)/i,
  ...SECRET_PATTERNS,
  // Numéro de carte : 13 à 19 chiffres, éventuellement groupés.
  /\b(?:\d[ -]?){13,19}\b/,
]

export function containsSensitiveDisclosure(text: string): boolean {
  return SENSITIVE_DISCLOSURE.some(pattern => pattern.test(text))
}
