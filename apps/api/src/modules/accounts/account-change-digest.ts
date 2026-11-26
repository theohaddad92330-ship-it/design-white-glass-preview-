import { accountChangeDigestSchema, type AccountChangeDigest } from '@bellum/contracts'

/**
 * Le tiroir « ce qui a changé » — construit depuis les DEUX versions du dossier
 * (D213 du dossier du 26 août, `T5.md:1117-1151`).
 *
 * ⚠️ **La section INCHANGÉ est l'exigence, pas un supplément.** Un tiroir qui ne
 * montre que ce qui a bougé se lit comme une liste d'incidents et laisse croire
 * que le reste n'a pas été regardé. « Ces huit champs ont été revérifiés et
 * n'ont pas changé » est ce qui donne sa valeur à « ces deux-là ont changé » —
 * c'est la différence entre « j'ai vérifié » et « je n'ai rien regardé ».
 *
 * Le contrat l'exige déjà (`accountChangeDigestSchema.unchanged` est requis) ;
 * cette fonction la REMPLIT, ce qui n'est pas la même promesse : un schéma peut
 * exiger un tableau et recevoir un tableau vide.
 */

/**
 * Les champs COMPARÉS, nommément.
 *
 * Pourquoi une liste et non le blob entier : `raw_analysis` porte des dizaines
 * de clés internes (coût du run, empreintes de prompt, journaux de phase). Les
 * comparer produirait un tiroir de trois cents lignes que personne ne lit, et
 * qui bougerait à chaque changement de FORMAT interne — ce qui n'est pas un
 * changement du COMPTE. On compare ce qu'un commercial reconnaîtrait comme un
 * fait du compte.
 *
 * ⚠️ Ajouter une clé ici la fait apparaître dans le tiroir de tous les comptes :
 * c'est une décision produit, pas un réglage technique.
 */
export const DIGEST_WATCHED_FIELDS = [
  'sector',
  'employees',
  'revenue',
  'headquarters',
  'website',
  'siren',
  'registry_id',
] as const

/** Un blob `jsonb` lu comme un objet, ou `null` s'il n'en est pas un. */
function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

/** Rend une valeur comparable, ou `null` si elle n'est pas lisible comme un
 *  fait. Un objet ou un tableau n'est pas comparé : ce sont des blocs, et un
 *  bloc « a changé » sans dire en quoi n'apprend rien. */
function readable(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'string') return value.trim() || null
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return null
}

/**
 * Compare deux versions du dossier et rend le tiroir, ou `null` quand il n'y a
 * rien d'honnête à montrer.
 *
 * `null` dans deux cas, et ils veulent dire la même chose : **on ne sait pas**.
 *  - aucune version précédente conservée (dossier analysé une seule fois, ou
 *    antérieur au chantier) ;
 *  - les deux versions ne portent aucun des champs surveillés.
 *
 * ⚠️ `null` n'est PAS « rien n'a changé ». Rendre un tiroir vide dans ces cas se
 * lirait « on a vérifié, tout va bien » — exactement le zéro qui ment. L'écran
 * n'affiche alors aucun tiroir.
 */
export function buildAccountChangeDigest(
  previousBlob: unknown,
  currentBlob: unknown,
  now: Date,
  options: { previousAt?: string | null } = {},
): AccountChangeDigest | null {
  // Les deux blobs viennent d'une colonne `jsonb` : leur forme n'est pas garantie
  // par le type, seulement par ce qui les a écrits. On la vérifie plutôt que de
  // la supposer — un blob illisible se lit « aucune version », pas « vide ».
  const previous = asRecord(previousBlob)
  const current = asRecord(currentBlob)
  if (!previous) return null

  const changed: AccountChangeDigest['changed'] = []
  const appeared: AccountChangeDigest['appeared'] = []
  const disappeared: AccountChangeDigest['disappeared'] = []
  const unchanged: string[] = []

  for (const field of DIGEST_WATCHED_FIELDS) {
    const before = readable(previous[field])
    const after = readable(current?.[field])

    if (before === null && after === null) continue
    if (before === null) {
      appeared.push({ field, before: null, after })
      continue
    }
    if (after === null) {
      // On archive, on ne supprime pas : la dernière valeur connue part avec sa
      // date. Sans date lisible, on ne peut pas honnêtement dater ce qu'on a
      // perdu — on le dit plutôt que d'inventer un « quand ».
      disappeared.push({
        field,
        lastKnownValue: before,
        lastKnownAt: options.previousAt?.trim() || 'date inconnue',
      })
      continue
    }
    if (before === after) unchanged.push(field)
    else changed.push({ field, before, after })
  }

  // Rien de surveillé de part et d'autre : il n'y a pas eu de vérification, donc
  // pas de tiroir. Le contrat refuserait de toute façon les quatre sections vides.
  if (changed.length + appeared.length + disappeared.length + unchanged.length === 0) return null

  const parsed = accountChangeDigestSchema.safeParse({
    comparedAt: now.toISOString(),
    changed,
    appeared,
    disappeared,
    unchanged,
  })
  return parsed.success ? parsed.data : null
}
