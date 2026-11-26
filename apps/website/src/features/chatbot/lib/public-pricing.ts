/**
 * Les TARIFS que Laura est autorisée à citer — lus, jamais écrits.
 *
 * Le rapport du 17/08 interdit deux fois d'inventer un prix, et le repo interdit
 * une troisième fois de figer un tarif dans un prompt. La conséquence n'est pas
 * « écrire la grille ailleurs » mais « ne l'écrire nulle part une deuxième
 * fois » : la source est le catalogue i18n `messages/<locale>/pricing.json`,
 * exactement celui que la page /tarifs affiche. Un visiteur à qui Laura annonce
 * un prix différent de la page qu'il a sous les yeux ne rachètera plus jamais un
 * seul de ses chiffres.
 *
 * Le rendu est PUR et défensif : une forme de catalogue inattendue produit une
 * ligne en moins, jamais une exception (le chat tomberait) et jamais une valeur
 * de remplissage (le visiteur y croirait).
 */

type Unknown = Record<string, unknown>

function asRecord(value: unknown): Unknown | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Unknown) : null
}

function asText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

/**
 * Le prix d'une offre, quelle que soit la forme sous laquelle le catalogue le
 * porte : une chaîne (« Sur devis », « 0 € ») ou un couple mensuel/annuel.
 */
function renderPrice(price: unknown, per: string | null): string | null {
  const flat = asText(price)
  if (flat) return per ? `${flat} ${per}` : flat

  const record = asRecord(price)
  if (!record) return null
  const monthly = asText(record.monthly)
  const annual = asText(record.annual)
  if (!monthly && !annual) return null

  const parts: string[] = []
  if (monthly) parts.push(`${monthly}${per ? ` ${per}` : ''}`)
  if (annual) parts.push(`${annual} en annuel`)
  return parts.join(' · ')
}

function renderPlan(plan: unknown): string | null {
  const record = asRecord(plan)
  if (!record) return null
  const name = asText(record.name)
  if (!name) return null

  const price = renderPrice(record.price, asText(record.per))
  const tagline = asText(record.tagline) ?? asText(record.sub)

  const segments = [name]
  if (price) segments.push(price)
  if (tagline) segments.push(tagline)
  return `- ${segments.join(' — ')}`
}

/**
 * La grille en texte, prête à être injectée dans le contexte du modèle.
 *
 * Rend `null` quand le catalogue ne porte aucune offre lisible : le prompt omet
 * alors le bloc TARIFS, et la règle de vérité fait le reste — Laura dit qu'elle
 * préfère ne pas se tromper et renvoie vers la page. C'est le seul comportement
 * acceptable ; un bloc vide se lirait « BellumAI est gratuit ».
 */
export function renderPublicPricing(catalog: unknown): string | null {
  const plans = asRecord(asRecord(catalog)?.plans)
  if (!plans) return null

  const lines: string[] = []

  const free = renderPlan(plans.free)
  if (free) lines.push(free)

  const items = Array.isArray(plans.items) ? plans.items : []
  for (const item of items) {
    const rendered = renderPlan(item)
    if (rendered) lines.push(rendered)
  }

  const enterprise = renderPlan(plans.enterprise)
  if (enterprise) lines.push(enterprise)

  if (!lines.length) return null

  // Les notes portent ce qui fait le plus mal quand il manque : ce qu'est un
  // crédit, et le report de 30 jours. Un prix sans son unité n'informe personne.
  const notes = asRecord(plans.notes)
  if (notes) {
    for (const key of ['credit', 'rollover', 'annual'] as const) {
      const note = asText(notes[key])
      if (note) lines.push(`- ${note}`)
    }
  }

  return lines.join('\n')
}

/**
 * Le visiteur a-t-il POSÉ une question de prix ? — garde GL-03 du §7.2.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE FONCTION DÉCIDE, ET PAS LE PROMPT
 * ─────────────────────────────────────────────────────────────────────────
 * Le défaut n°6 du transcript test est le plus révélateur du PDF 10 : à « t'es
 * trop cher », Laura a répondu « je note » puis a récité la grille tarifaire
 * complète — alors que le visiteur n'avait demandé aucun prix. Réciter le tarif
 * CONFIRME l'objection au lieu de la traiter.
 *
 * Le prompt le lui interdit désormais. Ça ne suffit pas : le bloc TARIFS était
 * injecté à CHAQUE tour, donc la grille était sous ses yeux à chaque objection.
 * On retire la tentation plutôt que de compter dessus.
 *
 * ⚠️ **« cher » n'est PAS un mot déclencheur, et c'est tout l'enjeu.** « C'est
 * trop cher » est une objection, pas une question — la bonne réaction est
 * « cher par rapport à quoi ? ». Si aucun mot de prix n'apparaît, Laura n'a
 * simplement pas la grille, et elle pose la question.
 */
const PRICE_QUESTION =
  /\b(prix|tarifs?|pricing|price|cost|couts?|coute|coutent|combien|budget|abonnement|payant|gratuit|free|preis|preise|kosten|kostet|tarief|prijs|prijzen|how much)\b/

export function asksAboutPricing(messages: readonly string[]): boolean {
  return messages.some(message =>
    PRICE_QUESTION.test(
      message
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase(),
    ),
  )
}
