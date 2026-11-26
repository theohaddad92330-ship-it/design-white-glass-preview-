/**
 * Ce que la conversation transmet à l'espace, à la création de compte —
 * « Conversation → workspace pré-configuré lors de la création de compte »
 * (§11, P2 du rapport du 17/08/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DEUX GARANTIES, ET ELLES SONT STRUCTURELLES
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. **Rien ne se crée sans le geste du visiteur.** Le contexte voyage dans
 *    l'URL que le visiteur CLIQUE. Il n'y a pas d'appel serveur qui pousse un
 *    espace, pas de lead créé en silence, pas de compte esquissé. S'il ne clique
 *    pas, rien n'a bougé nulle part.
 *
 * 2. **Aucune donnée personnelle ne voyage.** La liste est BLANCHE — ce qui
 *    n'y figure pas ne part pas, y compris les champs qui n'existent pas encore.
 *    Une liste noire aurait laissé passer le premier champ ajouté six mois plus
 *    tard. Et les valeurs elles-mêmes doivent ressembler à des CODES : le besoin
 *    dans les mots du visiteur (« on n'arrive pas à placer nos consultants chez
 *    tel client ») ne passe pas, parce qu'un texte libre contient des noms.
 *
 * La conséquence tenue par les tests : l'URL ne contient ni prénom, ni e-mail,
 * ni téléphone, ni phrase — seulement huit codes d'un vocabulaire fermé, ceux-là
 * mêmes que le visiteur a choisis en cliquant des réponses rapides. Le widget
 * les lui montre avant qu'il clique : c'est ce qui rend « il le sait » vrai.
 */

/**
 * Les seuls champs qui voyagent : les huit axes de qualification.
 *
 * Ce sont des énumérations fermées, choisies par le visiteur lui-même dans les
 * réponses rapides. Ni `pain` (texte libre), ni `firstName`, ni quoi que ce soit
 * qui désigne une personne.
 */
export const CHATBOT_PREFILL_FIELDS = [
  'companyType',
  'teamSize',
  'persona',
  'painFit',
  'tooling',
  'trigger',
  'decision',
  'horizon',
] as const

export type ChatbotPrefillField = (typeof CHATBOT_PREFILL_FIELDS)[number]

/** Le paramètre unique. Un seul, et nommé : le visiteur doit pouvoir regarder
 *  l'URL et voir ce qu'il emporte, sans le chercher entre huit paramètres. */
export const CHATBOT_PREFILL_PARAM = 'bellum_ctx'

/** Ce à quoi doit ressembler une valeur transmissible : un code, jamais une
 *  phrase. Bornée à 24 caractères — la plus longue enum du barème en fait 15. */
const CODE = /^[a-z0-9][a-z0-9_+-]{0,23}$/

export type ChatbotPrefill = {
  fields: Partial<Record<ChatbotPrefillField, string>>
  /**
   * Ce qui a été VOLONTAIREMENT laissé de côté alors qu'on l'avait.
   *
   * Nommé, et pas seulement absent : c'est ce que le widget affiche au visiteur
   * (« ton prénom et ton besoin restent ici »). Un champ simplement vide n'y
   * figure pas — il n'y a rien à retenir.
   */
  withheld: string[]
}

function isPrefillField(key: string): key is ChatbotPrefillField {
  return (CHATBOT_PREFILL_FIELDS as readonly string[]).includes(key)
}

/**
 * Ce que la conversation peut transmettre, et ce qu'elle retient.
 *
 * L'entrée est volontairement typée « objet de clés inconnues » : ce module est
 * la frontière, et une frontière qui fait confiance à son appelant n'en est pas
 * une.
 */
export function buildChatbotPrefill(lead: Readonly<Record<string, unknown>>): ChatbotPrefill {
  const fields: Partial<Record<ChatbotPrefillField, string>> = {}
  const withheld: string[] = []

  for (const [key, value] of Object.entries(lead)) {
    if (value === undefined || value === null || value === '') continue

    if (!isPrefillField(key)) {
      withheld.push(key)
      continue
    }

    // Un champ de la liste blanche dont la valeur ne ressemble pas à un code est
    // écarté SANS être annoncé comme retenu : ce n'est pas une décision de
    // confidentialité, c'est une donnée qu'on ne sait pas lire.
    if (typeof value === 'string' && CODE.test(value)) fields[key] = value
  }

  return { fields, withheld }
}

/**
 * La chaîne de requête à accrocher au lien d'inscription, ou `''`.
 *
 * Une chaîne vide et non un paramètre vide : `?bellum_ctx=` dans une URL se lit
 * comme un bug, et invite à se demander ce qu'on a perdu.
 */
export function encodeChatbotPrefill(prefill: ChatbotPrefill): string {
  const pairs = CHATBOT_PREFILL_FIELDS.filter(field => prefill.fields[field]).map(
    field => `${field}:${prefill.fields[field]}`,
  )
  if (!pairs.length) return ''
  return `${CHATBOT_PREFILL_PARAM}=${encodeURIComponent(pairs.join('~'))}`
}

/**
 * La relecture, côté application.
 *
 * Elle ne fait AUCUNE confiance à ce qui arrive : l'URL est écrite par le
 * navigateur, donc par n'importe qui. Une clé inconnue est jetée, une valeur qui
 * n'est pas un code est jetée, et le nombre de champs est borné par la liste
 * blanche elle-même. Ne lève jamais : un lien tordu doit ouvrir une inscription
 * normale, pas une page d'erreur.
 */
export function decodeChatbotPrefill(raw: string | URLSearchParams): Partial<Record<ChatbotPrefillField, string>> {
  let packed: string | null = null
  try {
    const params = typeof raw === 'string' ? new URLSearchParams(raw.replace(/^\?/, '')) : raw
    packed = params.get(CHATBOT_PREFILL_PARAM)
  } catch {
    return {}
  }
  if (!packed) return {}

  const fields: Partial<Record<ChatbotPrefillField, string>> = {}
  for (const pair of packed.split('~').slice(0, CHATBOT_PREFILL_FIELDS.length * 2)) {
    const separator = pair.indexOf(':')
    if (separator <= 0) continue
    const key = pair.slice(0, separator)
    const value = pair.slice(separator + 1)
    if (!isPrefillField(key) || !CODE.test(value)) continue
    fields[key] = value
  }
  return fields
}
