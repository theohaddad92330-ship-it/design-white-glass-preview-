import type { CommercialBrief } from '@bellum/contracts'
import { deaccentLower } from '@bellum/contracts'

/**
 * #4323.1 (recette PROD 22/10) — cinq blocs ESN sur le même écran : tuile « 2 ESN confirmées », rubrique « ESN en place »,
 * liste des ESN présentes, … La liste unique (`PresentEsnList`) porte désormais la synthèse par niveau de preuve ET la
 * lecture « ce que ça veut dire » : la tuile et la rubrique ESN du brief s'effacent derrière elle (GA-26 : rien n'apparaît
 * deux fois sous la même forme). Le mot « ESN » se cherche en mot entier — « Resnick » n'est pas une ESN.
 */
const ESN_WORD = /(^|[^a-z])esn([^a-z]|$)/

const mentionsEsn = (label: string): boolean => ESN_WORD.test(deaccentLower(label))

export function withoutEsnOverlap(brief: Pick<CommercialBrief, 'kpis' | 'what_i_know'>): {
  kpis: CommercialBrief['kpis']
  what_i_know: CommercialBrief['what_i_know']
  /** La lecture « ce que ça veut dire » de la rubrique ESN retirée — l'information reste, portée par la liste. */
  esnMeaning: string | null
} {
  const esnRows = brief.what_i_know.filter(row => mentionsEsn(row.rubric))
  return {
    kpis: brief.kpis.filter(kpi => !mentionsEsn(kpi.label)),
    what_i_know: brief.what_i_know.filter(row => !mentionsEsn(row.rubric)),
    esnMeaning: esnRows.find(row => row.meaning.trim() !== '')?.meaning.trim() ?? null,
  }
}
