import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { EXPENSE_CATEGORIES } from '@bellum/contracts'

/**
 * PARITÉ DES CATÉGORIES ENTRE LE CONTRAT TS ET LE PROMPT PYTHON (#1827.2).
 *
 * `app/prompts/expense_receipt_prompt.py` DUPLIQUE `EXPENSE_CATEGORIES` — le
 * service IA n'a pas accès aux paquets TypeScript, exactement le motif déjà
 * assumé par `bellum_cv_parse.DETECTIONS` pour les douze blocs d'un CV. Sans
 * ce test, une catégorie ajoutée d'un côté (ex. `packages/contracts`) et
 * jamais de l'autre ferait rejeter en silence toute proposition de cette
 * catégorie par le modèle : `_check_category` la retrouverait absente de son
 * tuple Python et la nullerait, sans qu'aucun test ne le voie.
 */
const PROMPT_MODULE = join(__dirname, '../../../../ia/app/prompts/expense_receipt_prompt.py')

describe('les catégories du prompt Python couvrent celles du contrat', () => {
  const source = readFileSync(PROMPT_MODULE, 'utf8')

  it('lit bien le module Python — un fichier vide ou déplacé passerait au vert', () => {
    expect(source.length).toBeGreaterThan(500)
    expect(source).toContain('EXPENSE_CATEGORIES')
  })

  it('le contrat TS porte au moins les douze catégories attendues', () => {
    // La garde LIT quelque chose : si le contrat perdait ses catégories, ce
    // test s'en apercevrait avant de comparer à du vide.
    expect(EXPENSE_CATEGORIES.length).toBeGreaterThanOrEqual(12)
  })

  it.each(EXPENSE_CATEGORIES)('« %s » est cité comme chaîne Python dans le prompt', category => {
    expect(source).toContain(`"${category}"`)
  })

  it('la garde sait dire NON — une catégorie inventée n’est pas dans le prompt', () => {
    expect(source).not.toContain('"spaceship"')
  })
})
