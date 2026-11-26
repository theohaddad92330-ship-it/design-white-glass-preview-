import { SKILL_WRITTEN_FORMS, canonicalSkill } from '@bellum/contracts'

/**
 * #4579.6 — l'écran dit ce qu'il a CHERCHÉ : la puce « Compétences » nomme chaque compétence posée (« vue, java »,
 * deux compétences, jamais « vue java » collé) et son infobulle liste, pour chacune, les écritures que les sources
 * d'offres sont interrogées avec (`SKILL_WRITTEN_FORMS`, la SEULE liste — GA-26). Une compétence hors référentiel est
 * cherchée telle quelle : aucune écriture n'est inventée, elle ne fait aucune ligne d'infobulle.
 */
interface SkillChipPart {
  skill: string
  /** Les écritures cherchées EN PLUS de la saisie (vide : cherchée telle quelle). */
  variants: string[]
}

const FORMS = SKILL_WRITTEN_FORMS as Readonly<Record<string, readonly string[]>>

function skillChipParts(text: string): SkillChipPart[] {
  const parts: SkillChipPart[] = []
  for (const raw of text.split(/[,;]+/)) {
    const skill = raw.trim()
    if (!skill || parts.some(part => part.skill.toLowerCase() === skill.toLowerCase())) continue
    const canonical = canonicalSkill(skill)
    const forms = canonical ? (FORMS[canonical] ?? []) : []
    const typed = skill.toLowerCase()
    parts.push({ skill, variants: forms.filter(form => form.toLowerCase() !== typed) })
  }
  return parts
}

/** La puce : les compétences nommées, séparées par une virgule. */
export function skillChipLabel(text: string): string {
  return skillChipParts(text)
    .map(part => part.skill)
    .join(', ')
}

/** L'infobulle : « vue : vue.js, vuejs, vue 3 · java : java 17, j2ee, jee » — `null` quand aucune écriture n'est ajoutée. */
export function skillChipTitle(text: string): string | null {
  const lines = skillChipParts(text)
    .filter(part => part.variants.length > 0)
    .map(part => `${part.skill} : ${part.variants.join(', ')}`)
  return lines.length > 0 ? lines.join(' · ') : null
}
