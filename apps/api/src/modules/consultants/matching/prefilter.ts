import type { ExclusionReason, MatchCandidate, MatchNeed } from '@bellum/contracts'
import { mentions, sameTerm } from './text'

/**
 * Le pré-filtrage déterministe (PDF 4 §16.2, « 3 000 talents dans le vivier »).
 *
 * Trois vérifications qui coûtent presque rien — une compétence obligatoire
 * totalement absente, un consentement expiré, une zone incompatible — passées
 * AVANT les treize axes.
 *
 * Il ne s'applique qu'au-delà de {@link PREFILTER_ABOVE}. En deçà, tout le monde
 * passe par les treize axes : un profil écarté sans son détail est un profil dont
 * on ne peut pas expliquer le rejet, et l'explication est due. La performance ne
 * justifie de perdre le détail que quand elle est réellement en jeu.
 *
 * Un profil écarté ici l'est TOUJOURS avec son code de motif. Le §4.1 est
 * explicite : « aucun profil n'est écarté sans code de motif. C'est une exigence
 * de conformité, pas une préférence UX. »
 */
export const PREFILTER_ABOVE = 300

type PrefilterVerdict = {
  consultantId: string
  reason: ExclusionReason
  detail: string
}

type PrefilterOutcome = {
  kept: MatchCandidate[]
  dropped: PrefilterVerdict[]
}

export function prefilter(need: MatchNeed, candidates: readonly MatchCandidate[]): PrefilterOutcome {
  if (candidates.length <= PREFILTER_ABOVE) return { kept: [...candidates], dropped: [] }

  const required = need.skills.filter(skill => skill.required)
  const kept: MatchCandidate[] = []
  const dropped: PrefilterVerdict[] = []

  for (const candidate of candidates) {
    if (candidate.consentState === 'expired') {
      dropped.push({
        consultantId: candidate.consultantId,
        reason: 'consent_expired',
        detail: 'consentement expiré — le renouveler avant de proposer ce profil',
      })
      continue
    }
    if (required.length > 0 && candidate.skills.length > 0) {
      const covered = required.filter(wanted =>
        candidate.skills.some(skill => sameTerm(skill.term, wanted.term) || sameTerm(skill.label, wanted.label)),
      )
      if (covered.length === 0) {
        dropped.push({
          consultantId: candidate.consultantId,
          reason: 'missing_required_skill',
          detail: `aucune des compétences obligatoires (${required.map(skill => skill.label).join(', ')})`,
        })
        continue
      }
    }
    if (need.location && need.remote !== 'remote' && candidate.zones.length > 0 && candidate.remote === 'on_site') {
      const inZone = candidate.zones.some(
        zone => mentions(zone, need.location ?? '') || mentions(need.location ?? '', zone),
      )
      if (!inZone) {
        dropped.push({
          consultantId: candidate.consultantId,
          reason: 'out_of_zone',
          detail: `zones déclarées hors « ${need.location} », sans distanciel accepté`,
        })
        continue
      }
    }
    kept.push(candidate)
  }

  return { kept, dropped }
}
