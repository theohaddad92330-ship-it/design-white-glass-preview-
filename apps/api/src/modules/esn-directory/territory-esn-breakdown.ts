import type { EsnDirectoryEntity } from '../../database/entities/esn-directory.entity'

/**
 * LA RÉPARTITION DES ESN D'UN TERRITOIRE — par taille et par rang.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER EXISTE SÉPARÉMENT DU SERVICE
 * ─────────────────────────────────────────────────────────────────────────────
 * `esn-directory.service.ts` est l'un des deux ÉCRIVAINS de `esn_directory`, et
 * `unwritten-columns.spec.ts` lit toute clé d'objet en position d'affectation
 * dans ce fichier-là comme une écriture. Une simple RECOPIE de `riskFlag` vers
 * une réponse HTTP y ressemblait à un écrivain, et la garde annonçait qu'une
 * colonne déclarée « sans source » venait d'en trouver une. Elle a raison de ne
 * pas savoir distinguer une lecture d'une écriture dans un fichier qui fait les
 * deux : c'est au code de ne pas les mélanger.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE RÉPARTITION N'EST PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Ce n'est PAS une part de `esnPresent` (le compte du registre public). Deux
 * populations différentes, mesurées par deux sources différentes : les diviser
 * l'une par l'autre produirait un taux qui ne veut rien dire. Elles s'affichent
 * côte à côte, chacune avec son registre.
 *
 * Une tranche d'effectif NON RÉSOLUE reste `null` et sort NOMMÉE, en dernier :
 * la ranger parmi les « petites » ferait dire à la répartition ce que la donnée
 * ne dit pas, et la mettre en tête la ferait lire comme la plus courante.
 */
export type EsnDepartmentBreakdown = {
  known: number
  bySize: { sizeClass: string | null; count: number }[]
  byOpenness: { openness: string; count: number }[]
  entries: {
    name: string
    city: string | null
    sizeClass: string | null
    headcountRange: string | null
    openToSubcontracting: string
    riskFlag: string
  }[]
}

export function esnDepartmentBreakdown(rows: EsnDirectoryEntity[], limit = 60): EsnDepartmentBreakdown {
  const sizes = new Map<string | null, number>()
  const openness = new Map<string, number>()
  for (const row of rows) {
    const size = row.sizeClass ?? null
    sizes.set(size, (sizes.get(size) ?? 0) + 1)
    const declared = row.openToSubcontracting || 'inconnu'
    openness.set(declared, (openness.get(declared) ?? 0) + 1)
  }
  return {
    known: rows.length,
    bySize: [...sizes.entries()]
      .map(([sizeClass, count]) => ({ sizeClass, count }))
      .sort((a, b) => (a.sizeClass === null ? 1 : b.sizeClass === null ? -1 : b.count - a.count)),
    byOpenness: [...openness.entries()]
      .map(([value, count]) => ({ openness: value, count }))
      .sort((a, b) => b.count - a.count),
    entries: rows.slice(0, Math.max(1, Math.min(limit, 500))).map(row => ({
      name: row.inputName,
      city: row.headquartersCity,
      sizeClass: row.sizeClass,
      headcountRange: row.headcountRange,
      openToSubcontracting: row.openToSubcontracting || 'inconnu',
      riskFlag: row.riskFlag || 'aucun',
    })),
  }
}
