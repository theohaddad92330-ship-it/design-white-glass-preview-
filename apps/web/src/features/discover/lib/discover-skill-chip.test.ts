import { describe, expect, it } from 'vitest'
import { skillChipLabel, skillChipTitle } from './discover-skill-chip'

/** #4579.6 — la puce de compétences après « dev vue et java à lille » : deux compétences, avec leurs variantes. */
describe('#4579.6 — la puce de compétences dit ce qui a été cherché', () => {
  it('« vue, java » : deux compétences nommées, avec leurs écritures', () => {
    expect(skillChipLabel('vue, java')).toBe('vue, java')
    // #4579 (lot L5, 28/10/2026) — nuxt et spring / jakarta ee ont rejoint les écritures d'annonce de leur
    // famille : l'infobulle dit ce qui part RÉELLEMENT aux sources, elle ne se contente pas d'exister.
    expect(skillChipTitle('vue, java')).toBe(
      'vue : vue.js, vuejs, vue 3, nuxt, nuxt.js · java : java 17, j2ee, jee, spring, spring boot, jakarta ee',
    )
  })

  it('sait dire NON : une compétence hors référentiel est cherchée telle quelle, sans écriture inventée', () => {
    expect(skillChipLabel('cobol')).toBe('cobol')
    expect(skillChipTitle('cobol')).toBeNull()
  })

  it('une compétence répétée ne fait qu’une ligne', () => {
    expect(skillChipLabel('java, Java')).toBe('java')
  })
})
