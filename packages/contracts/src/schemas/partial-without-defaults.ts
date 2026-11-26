import { z } from 'zod'

/** Ce que devient un champ une fois son `.default()` retiré — le reste intact. */
type WithoutDefault<Field> = Field extends z.ZodDefault<infer Inner> ? Inner : Field

type PartialWithoutDefaults<Shape extends z.ZodRawShape> = z.ZodObject<{
  [Key in keyof Shape]: z.ZodOptional<WithoutDefault<Shape[Key]>>
}>

/**
 * `X.partial()`, mais SANS les `.default()` — l'écriture partielle de zod 4.
 *
 * En zod 3, `.partial()` emportait le `.default()` avec lui : un corps de PATCH
 * qui n'envoyait pas un champ rendait un objet sans ce champ, et le service ne
 * touchait à rien. **En zod 4 le défaut SURVIT au `.partial()`** : le champ
 * revient rempli à son défaut, le service le fusionne sur l'existant, et la
 * valeur saisie par un humain est remplacée — sans erreur, sans trace. Le
 * lexique d'un espace repart vide parce qu'un écran a envoyé les trois champs
 * qu'il édite.
 *
 * Le piège est celui de zod, pas celui d'un schéma : il vit donc à un seul
 * endroit (GA-26) plutôt que redéclaré champ par champ dans chaque PATCH.
 *
 * Ce qui ne change PAS : la validation de la valeur envoyée, le `.catch()` posé
 * sous le défaut, et la configuration de l'objet — un `.strict()` continue de
 * refuser une clé inconnue.
 */
export function partialWithoutDefaults<Shape extends z.ZodRawShape>(
  schema: z.ZodObject<Shape>,
): PartialWithoutDefaults<Shape> {
  const unwrapped = Object.fromEntries(
    Object.entries(schema.shape).flatMap(([key, field]) =>
      field instanceof z.ZodDefault ? [[key, field.unwrap()] as const] : [],
    ),
  )
  // Un seul `as` : `.extend()` d'une forme calculée perd la précision que la
  // signature ci-dessus rétablit — le typage reste exact pour l'appelant.
  return schema.extend(unwrapped).partial() as unknown as PartialWithoutDefaults<Shape>
}
