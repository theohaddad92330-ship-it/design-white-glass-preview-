/**
 * Kanban commercial d'un compte → entrée « état de relation » du run IA
 * (annexe Méthodologie Sales ESN p6).
 *
 * La colonne où le commercial a rangé le compte (`watching`, `opportunity`,
 * `customer`, `archived`) est le signal de relation le plus fiable dont on
 * dispose après une déclaration explicite : un compte « Client » ne doit pas
 * être ouvert comme un compte froid. L'IA sait déjà le traduire
 * (`_KANBAN_TO_STATE`), personne ne le lui envoyait.
 *
 * `inbox` (la colonne par défaut : le compte n'a jamais été trié) et l'absence
 * de valeur veulent dire exactement la même chose — rien de déclaré — et
 * traduisent tous deux vers « froid » côté IA. On les omet donc du wire : la
 * requête d'un compte non trié reste byte-identique à ce qu'elle était avant
 * cette feature.
 */
export function relationStatusForRun(commercialStatus?: string | null): string | undefined {
  const status = (commercialStatus ?? '').trim()
  return status && status !== 'inbox' ? status : undefined
}
