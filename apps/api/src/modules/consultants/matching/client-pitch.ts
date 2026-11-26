import type { MatchNeed, MatchResult, ShortlistEntry } from '@bellum/contracts'

/**
 * Le message de push au client, préparé (PDF 4 §12.1).
 *
 * PRÉPARÉ, jamais envoyé : la règle du dépôt est qu'on rédige et que le
 * commercial envoie. Le brouillon part ensuite par le chemin d'envoi EXISTANT,
 * qui porte déjà le contrôle d'opt-out et les pièces jointes réelles — un second
 * chemin d'envoi serait un second endroit où oublier une désinscription.
 *
 * **Le TJM (D21).** Éteint par défaut, réglable par espace. Beaucoup d'ESN
 * négocient le tarif après l'entretien, et un TJM annoncé dans le premier
 * message devient un plafond dont on ne remonte pas. Quand le réglage est
 * éteint, le montant n'est pas remplacé par « à discuter » : il est simplement
 * absent — écrire « à discuter » invite à discuter.
 *
 * Trois lignes par profil, pas plus. Un message qui déroule six paragraphes par
 * candidat ne se lit pas, et le client répond « envoyez-moi les CV » — ce qu'on
 * a déjà fait en pièce jointe.
 */

export type PitchProfile = {
  /** Le nom tel qu'il apparaîtra au client — anonymisé en amont si l'espace le veut. */
  displayName: string
  title: string | null
  availability: string
  /** Les trois compétences les plus fortes, dans l'ordre. */
  strengths: string[]
  dailyRateCents: number | null
}

export function pitchProfileFromEntry(entry: ShortlistEntry): PitchProfile {
  return {
    displayName: entry.fullName,
    title: entry.title,
    availability: entry.availability,
    strengths: entry.skills.slice(0, 3).map(skill => skill.label),
    dailyRateCents: entry.dailyRateCents,
  }
}

export function clientMessageSubject(need: MatchNeed, count: number): string {
  const role = need.role.trim() || 'profil'
  return count > 1 ? `${count} profils pour ${role}` : `Un profil pour ${role}`
}

export function clientMessageBody(
  need: MatchNeed,
  profiles: readonly PitchProfile[],
  options: { showRate: boolean; signature: string | null },
): string {
  const role = need.role.trim() || 'ce poste'
  const lines: string[] = []
  lines.push('Bonjour,')
  lines.push('')
  lines.push(
    profiles.length > 1
      ? `Voici ${profiles.length} profils pour ${role}. Leurs dossiers sont en pièce jointe.`
      : `Voici un profil pour ${role}. Son dossier est en pièce jointe.`,
  )
  lines.push('')
  for (const profile of profiles) {
    const header = profile.title ? `${profile.displayName} — ${profile.title}` : profile.displayName
    lines.push(header)
    if (profile.strengths.length > 0) lines.push(`· ${profile.strengths.join(' · ')}`)
    lines.push(`· ${profile.availability}`)
    if (options.showRate && profile.dailyRateCents !== null) {
      lines.push(`· TJM ${Math.round(profile.dailyRateCents / 100)} €`)
    }
    lines.push('')
  }
  lines.push('Dites-moi lequel vous souhaitez rencontrer, je cale un créneau.')
  if (options.signature) {
    lines.push('')
    lines.push(options.signature)
  }
  return lines.join('\n')
}

/**
 * Les compétences que le BESOIN demandait et que le profil ne prouve pas.
 *
 * Reprises telles quelles dans le dossier de compétences, sous « ce que ce
 * dossier ne prouve pas ». Une compétence ADJACENTE le dit : « a fait Flink,
 * pas Spark » est une information que le client découvrirait de toute façon en
 * soutenance, et mieux vaut qu'il la lise de nous.
 */
export function unprovenFromMatch(result: MatchResult): { term: string; reason: string }[] {
  return result.skills
    .filter(skill => skill.status !== 'matched')
    .map(skill => ({
      term: skill.term,
      reason:
        skill.status === 'adjacent'
          ? `demandée par le besoin — ${skill.label} en approche, pas la compétence elle-même`
          : skill.required
            ? 'demandée par le besoin — non prouvée'
            : 'souhaitée par le besoin — non prouvée',
    }))
}

/**
 * Les trois compétences les plus fortes d'un profil, pour la synthèse (§12).
 *
 * Ordonnées par la FORCE DE LA PREUVE puis par la couverture : une compétence
 * prouvée en mission passe devant une compétence mieux notée mais seulement
 * déclarée. C'est ce qui rend la synthèse défendable en soutenance.
 */
export function topStrengths(result: MatchResult, limit = 3): string[] {
  const weight: Record<string, number> = { mission: 4, interview: 3, cv: 2, declared: 1, derived: 1 }
  return result.skills
    .filter(skill => skill.status === 'matched')
    .slice()
    .sort(
      (a, b) =>
        (weight[b.source ?? 'declared'] ?? 0) - (weight[a.source ?? 'declared'] ?? 0) ||
        b.coverage - a.coverage ||
        a.label.localeCompare(b.label),
    )
    .slice(0, limit)
    .map(skill => skill.label)
}
