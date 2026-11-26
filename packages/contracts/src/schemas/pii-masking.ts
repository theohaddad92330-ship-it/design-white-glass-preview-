/**
 * Le masquage des données personnelles dans les journaux et l'observabilité.
 *
 * ## Pourquoi ce module existe
 *
 * L'évaluation de migration du paquet de récupération le pose en garde-fou :
 * « PII masquée dans logs et observabilité », et le descripteur d'import nomme
 * les quatre champs concernés — adresse e-mail, téléphone, adresse postale, nom.
 * Le fichier source, lui, porte 17 387 contacts.
 *
 * Un journal n'est pas une base : il part chez un tiers d'observabilité, il est
 * conservé des mois, il est lu par des gens qui n'ont aucune raison de connaître
 * l'adresse de quelqu'un. Une ligne de journal qui recopie un e-mail au moment
 * d'un import de masse en distribue dix-sept mille.
 *
 * ## Masquer, pas supprimer
 *
 * Un champ VIDE dans un journal ne se distingue pas d'un champ absent, et c'est
 * précisément ce qu'on cherche à voir quand on débogue un import (« la colonne
 * était-elle là ? »). Le masque garde donc la FORME — assez pour reconnaître un
 * e-mail d'un numéro, jamais assez pour joindre la personne.
 */

/** Les quatre familles nommées par le descripteur d'import. */
export const MASKED_FIELD_HINTS: readonly string[] = [
  'email',
  'mail',
  'phone',
  'tel',
  'address',
  'adresse',
  'name',
  'nom',
]

/**
 * Masque une adresse e-mail : première lettre, puis le domaine.
 *
 * Le DOMAINE reste lisible parce qu'il est la seule chose utile au débogage —
 * « toutes les lignes rejetées sont en @acme.fr » est un diagnostic, et un
 * domaine d'entreprise n'identifie personne à lui seul.
 */
export function maskEmail(value: string): string {
  const at = value.indexOf('@')
  if (at <= 0) return maskGeneric(value)
  const local = value.slice(0, at)
  return `${local[0] ?? ''}***@${value.slice(at + 1)}`
}

/** Masque un numéro : les deux premiers caractères et les deux derniers. */
export function maskPhone(value: string): string {
  const trimmed = value.trim()
  if (trimmed.length <= 4) return '***'
  return `${trimmed.slice(0, 2)}***${trimmed.slice(-2)}`
}

/** Masque une valeur quelconque : sa première lettre et sa longueur. */
export function maskGeneric(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  // La LONGUEUR est conservée : elle distingue « champ vide » de « champ rempli
  // mais masqué », qui est la question qu'on se pose en relisant un journal.
  return `${trimmed[0]}***(${trimmed.length})`
}

/**
 * Ce qui SORT du masquage même quand le nom du champ contient un indice.
 *
 * ⚠️ En français, un champ de société s'appelle « societe_nom », « company_name »
 * ou « raison sociale » — tous contiennent « nom » ou « name ». Les masquer
 * rendrait un journal d'import illisible (« quelle société a échoué ? ») sans
 * protéger personne : le nom d'une entreprise n'est pas une donnée personnelle.
 * Trouvé par le test de ce module, sur `societe_nom`.
 */
const NOT_PERSONAL = ['societe', 'société', 'company', 'raison', 'entreprise', 'account', 'compte', 'organisation']

/** Ce nom de champ porte-t-il une donnée personnelle ? */
export function isMaskedField(field: string): boolean {
  const lower = field.toLowerCase()
  if (NOT_PERSONAL.some(marker => lower.includes(marker))) return false
  return MASKED_FIELD_HINTS.some(hint => lower.includes(hint))
}

/**
 * Masque un enregistrement avant de le journaliser.
 *
 * Les champs NON personnels passent tels quels : masquer un identifiant de
 * société ou un code postal rendrait le journal inutilisable sans protéger
 * personne. Le tri se fait sur le NOM du champ, jamais sur la forme de la
 * valeur — une heuristique sur la valeur masquerait « Paris » dans une colonne
 * ville et laisserait passer un e-mail dans une colonne « commentaire ».
 */
export function maskRecordForLog(record: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [field, value] of Object.entries(record)) {
    if (typeof value !== 'string' || value.length === 0) {
      out[field] = value
      continue
    }
    if (!isMaskedField(field)) {
      out[field] = value
      continue
    }
    const lower = field.toLowerCase()
    if (lower.includes('mail')) out[field] = maskEmail(value)
    else if (lower.includes('phone') || lower.includes('tel')) out[field] = maskPhone(value)
    else out[field] = maskGeneric(value)
  }
  return out
}
