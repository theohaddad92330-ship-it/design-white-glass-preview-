/**
 * #3811.4 — le CV CITE des compétences (une section, un titre) : s'il n'en sort
 * aucune, la lecture est PARTIELLE et l'écran le dit, au lieu de présenter un
 * « non trouvé » comme si le CV n'en parlait pas.
 *
 * On cherche un TITRE de section, pas un mot au hasard : « compétition » ou
 * « compétent » ne sont pas une section de compétences.
 */
const SKILLS_HEADING =
  /(?:^|\n|\r)\s*(?:comp[ée]tences?|skills|technologies|environnement technique|technical skills)\b/i

export function cvMentionsSkills(text: string | null | undefined): boolean {
  if (!text) return false
  return SKILLS_HEADING.test(text) || /\bcomp[ée]tences?\s+(?:cl[ée]s|techniques)\b/i.test(text)
}
