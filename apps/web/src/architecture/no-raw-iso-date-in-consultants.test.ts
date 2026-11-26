import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * #4198 (lot L7) — une date ISO (`2027-04-29`) ne part jamais brute vers l'écran
 * d'un consultant : « En mission jusqu'au 29/04/2027 ». Elle passe par
 * `formatDate` (`@/lib/locale`, un seul endroit — GA-26).
 */
const racine = join(dirname(fileURLToPath(import.meta.url)), '..', 'features', 'consultants', 'view')

const CHAMPS_ISO = ['staffing.freeFrom', 'mission.startsOn', 'mission.endsOn']

describe('une date de consultant passe par formatDate', () => {
  it.each([
    ['TalentAvailabilityBadge.tsx', join(racine, 'TalentAvailabilityBadge.tsx')],
    ['detail/TalentDetailPage.tsx', join(racine, 'detail', 'TalentDetailPage.tsx')],
  ])('%s', (_nom, chemin) => {
    const source = readFileSync(chemin, 'utf8')
    expect(source).toContain('formatDate')
    for (const champ of CHAMPS_ISO) {
      // `date: row.staffing.freeFrom` ou `{mission.startsOn ?? …}` : brut, interdit.
      const brut = new RegExp(`(date: |\\{)${champ.replace('.', '\\.')}(?!\\w)(?! *\\))`)
      const lignes = source.split('\n').filter(l => brut.test(l) && !l.includes('formatDate'))
      expect(lignes).toEqual([])
    }
  })
})

/**
 * #4191 (recette 15/10, D2) — « Disponible à partir du 2026-11-10 » : la section
 * Profil écrivait `talent.available_from` tel quel. La garde de L7 ne regardait
 * que trois champs dans deux fichiers ; celle-ci balaie TOUTE la vue consultants.
 *
 * Deux formes de date brute, toutes deux interdites à l'écran :
 *  - un champ `*_from` / `available_from` passé tel quel à une valeur affichée ;
 *  - une troncature `.slice(0, 10)` d'un horodatage (l'ISO sans son heure).
 * Exceptions assumées : un `<Input type="date" value=…>` veut de l'ISO, et un nom
 * de fichier d'export (`toISOString().slice(0, 10)`) n'est pas affiché.
 */
const CHAMP_BRUT = /value=\{[\w.?]*available_from\}/
const TRONCATURE = /\.slice\(0, ?10\)/
const EXEMPTE = /toISOString\(\)\.slice|<Input|type="date"|form\.\w+\.slice/

function ligneFautive(ligne: string): boolean {
  if (ligne.includes('formatDate')) return false
  if (EXEMPTE.test(ligne)) return false
  return CHAMP_BRUT.test(ligne) || TRONCATURE.test(ligne)
}

function sources(dossier: string): string[] {
  return readdirSync(dossier, { withFileTypes: true }).flatMap(entree => {
    const chemin = join(dossier, entree.name)
    if (entree.isDirectory()) return sources(chemin)
    return /\.tsx$/.test(entree.name) && !/\.test\./.test(entree.name) ? [chemin] : []
  })
}

const VIEW = join(racine)

describe('aucune date ISO brute dans la vue consultants (D2)', () => {
  it('ne trouve aucune ligne fautive dans features/consultants/view', () => {
    const fautives = sources(VIEW).flatMap(chemin =>
      readFileSync(chemin, 'utf8')
        .split('\n')
        .filter(ligneFautive)
        .map(ligne => `${chemin.slice(VIEW.length + 1)} : ${ligne.trim()}`),
    )
    expect(fautives).toEqual([])
  })

  it('sait dire NON : la date brute de la recette est reconnue', () => {
    expect(ligneFautive("<Row label={t('form.availableFrom')} value={talent.available_from} />")).toBe(true)
    expect(ligneFautive('value={talent.tjm_metadata.observed_at.slice(0, 10)}')).toBe(true)
    expect(ligneFautive('{change.changedAt.slice(0, 10)}')).toBe(true)
  })

  it('ne dit pas NON à ce qu’elle ne vise pas', () => {
    expect(ligneFautive("<Row value={formatDate(talent.available_from, { dateStyle: 'medium' })} />")).toBe(false)
    expect(ligneFautive('downloadCSV(csv, `x-${new Date().toISOString().slice(0, 10)}.csv`)')).toBe(false)
    expect(ligneFautive('<Input type="date" value={form.consent_given_at.slice(0, 10)} />')).toBe(false)
  })
})
