/**
 * #4402.1 — la fiche talent s'édite EN LIGNE, champ par champ ; la modale « Modifier » n'y est plus (GA-26 : un
 * réglage vit à un seul endroit).
 *
 * Elle protège la règle, elle ne l'invente pas : elle lit la page et refuse que la modale y revienne, ET que
 * l'inventaire des champs (`TALENT_FIELD_GROUPS`) ait un onglet sans section montée. Elle sait dire NON :
 * `mountsLegacyDialog` / `unmountedTabs` sont éprouvées sur de mauvais exemples.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { TALENT_FIELD_GROUPS } from '../features/consultants/lib/talentInlineFields'

const PAGE = resolve(__dirname, '../features/consultants/view/detail/TalentDetailPage.tsx')

const mountsLegacyDialog = (source: string) => /<ConsultantFormDialog\b|from '\.\.\/ConsultantFormDialog'/.test(source)
const unmountedTabs = (source: string) =>
  [...new Set(TALENT_FIELD_GROUPS.map(group => group.tab))].filter(
    tab => !new RegExp(`<TalentTabFields[^>]*tab="${tab}"`).test(source),
  )

describe('la fiche talent s’édite en ligne (#4402.1)', () => {
  it('la garde sait dire NON', () => {
    expect(mountsLegacyDialog("import { ConsultantFormDialog } from '../ConsultantFormDialog'")).toBe(true)
    expect(mountsLegacyDialog('<TalentTabFields talent={t} tab="profile" />')).toBe(false)
    expect(unmountedTabs('<TalentTabFields talent={t} tab="profile" />')).toContain('skills')
  })

  it('la page ne monte plus la modale « Modifier »', () => {
    expect(mountsLegacyDialog(readFileSync(PAGE, 'utf8'))).toBe(false)
  })

  it('chaque onglet de l’inventaire monte ses champs en ligne', () => {
    expect(unmountedTabs(readFileSync(PAGE, 'utf8'))).toEqual([])
  })
})
