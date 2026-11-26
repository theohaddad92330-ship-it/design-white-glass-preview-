/**
 * Garde-fou du plan d'attaque d'un besoin (décision Louis 31/07, D9 option A).
 *
 * Le prompt demande à un modèle de VENDRE. La pente naturelle de la vente est
 * d'affirmer une référence qu'on n'a pas — « nous avons fait la même chose chez
 * un acteur de votre secteur ». Ce serait une donnée fictive sur l'ESN
 * elle-même, envoyée à un prospect, et démontée au premier rendez-vous.
 *
 * Ce module ne fait donc pas confiance à la consigne du prompt. Il CONFRONTE la
 * sortie à la matière source :
 *
 *   1. chaque preuve doit citer (`proof`) un fragment RÉELLEMENT présent dans le
 *      profil de l'ESN ou dans le dossier du compte. Citation introuvable =
 *      preuve inventée → retirée ;
 *   2. une personne nommée doit exister parmi les contacts du dossier. Un nom
 *      qui n'y est pas devient un RÔLE à identifier — jamais un contact fantôme
 *      que le commercial chercherait sur LinkedIn ;
 *   3. tout ce qui est retiré est DIT dans `missing` — jamais supprimé en
 *      silence, sinon le garde-fou ne ferait que rendre l'invention invisible.
 *
 * Pur, sans NestJS ni réseau : cette partie doit se tester sans base.
 */

/** En dessous, une citation ne prouve rien : « Data » se retrouve partout. */
const MIN_PROOF_CHARS = 12

/** Bornes de rendu — un plan tient sur une page. */
const MAX_TARGETS = 6
const MAX_PROOFS = 6
const MAX_MISSING = 10

type NeedPlayTarget = { name: string; role: string; why: string }
type NeedPlayProof = { claim: string; proof: string }

export type NeedPlay = {
  angle: string
  targets: NeedPlayTarget[]
  message: string
  proofs: NeedPlayProof[]
  missing: string[]
  next_action: string
}

/** Texte comparable : minuscules, accents retirés, espaces compactés. Cherche
 *  une citation sans se faire piéger par la casse ou un retour à la ligne. */
function comparable(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

/**
 * La matière que le modèle avait le droit d'utiliser, mise à plat en un seul
 * texte comparable. Tout ce qui n'est pas là-dedans n'existe pas.
 */
export function buildSourceMaterial(parts: {
  profile?: Record<string, unknown> | null
  account?: Record<string, unknown> | null
  need?: Record<string, unknown> | null
}): string {
  return comparable([parts.profile, parts.account, parts.need].map(p => (p ? JSON.stringify(p) : '')).join(' '))
}

/**
 * Confronte le plan produit à la matière source.
 *
 * Ce qui ne se prouve pas est retiré ET énoncé : un commercial qui sait qu'il
 * n'a pas de référence sectorielle prépare autrement ; un commercial à qui on en
 * invente une la cite en rendez-vous et perd le compte.
 */
export function sanitizeNeedPlay(
  raw: unknown,
  sourceMaterial: string,
  knownContacts: ReadonlyArray<{ full_name?: string | null }>,
): NeedPlay {
  const data = (raw ?? {}) as Record<string, unknown>
  const missing = new Set(list(data.missing).map(str).filter(Boolean))

  const knownNames = new Set(knownContacts.map(c => comparable(str(c.full_name))).filter(Boolean))

  const proofs: NeedPlayProof[] = []
  for (const entry of list(data.proofs)) {
    const item = (entry ?? {}) as Record<string, unknown>
    const claim = str(item.claim)
    const proof = str(item.proof)
    if (!claim) continue
    const quote = comparable(proof)
    // Une preuve trop courte ou introuvable dans la matière source n'est pas une
    // preuve : c'est une affirmation. On la sort, et on dit qu'elle manque.
    if (quote.length < MIN_PROOF_CHARS || !sourceMaterial.includes(quote)) {
      missing.add(claim)
      continue
    }
    proofs.push({ claim, proof })
    if (proofs.length >= MAX_PROOFS) break
  }

  const targets: NeedPlayTarget[] = []
  for (const entry of list(data.targets)) {
    const item = (entry ?? {}) as Record<string, unknown>
    const role = str(item.role)
    const name = str(item.name)
    const why = str(item.why)
    if (!role && !name) continue
    // Un nom absent du dossier est un nom inventé : on garde le RÔLE (utile,
    // c'est la personne à identifier) et on jette l'identité.
    const nameIsKnown = name.length > 0 && knownNames.has(comparable(name))
    targets.push({ name: nameIsKnown ? name : '', role: role || name, why })
    if (targets.length >= MAX_TARGETS) break
  }

  return {
    angle: str(data.angle),
    targets,
    message: str(data.message),
    proofs,
    missing: [...missing].slice(0, MAX_MISSING),
    next_action: str(data.next_action),
  }
}

/**
 * Clé stable d'un besoin — ce qui décide si l'équipe repaie ou non.
 *
 * Les besoins ne sont pas des lignes en base : ils sont dérivés de
 * `raw_analysis` à chaque lecture. La clé doit donc survivre à une re-analyse
 * qui reformule à la marge (casse, accents, ponctuation, espaces) ; sinon une
 * équipe repaie un plan qu'elle possède déjà, ce qui est exactement le reproche
 * qu'on cherchait à éviter en choisissant l'option A.
 */
export function needKey(accountId: string, kind: string, label: string): string {
  // La ponctuation retirée laisse des espaces : on recompacte APRÈS, sinon
  // « migration erp ! » et « Migration ERP » donnent deux clés — donc deux
  // paiements pour le même besoin.
  const normalized = comparable(label)
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return `${accountId}:${comparable(kind)}:${normalized}`
}
