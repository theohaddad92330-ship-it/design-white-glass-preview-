import type { AnalysisBatchInput, DiscoverOriginCriteria } from '@bellum/contracts'

/** La zone que la carte `account_ranking` porte (posée par le serveur, `known_shape_gate.py`). */
type SearchZone = { city?: string; departments?: string[]; regions?: string[] }

type LauraOffer = { title: string; date?: string }

/**
 * #4642 — le cadrage d'une carte « Comptes où placer X », tel que le commercial l'a LU et éventuellement
 * modifié avant le lancement. Il PRIORISE le dossier côté serveur ; il n'écarte rien, et sa zone est un
 * libellé (`zone`), jamais un périmètre (`zone_*`, #4432).
 */
export type LauraFraming = {
  talentId?: string
  /** Le nom de la fiche : le dossier dit « consultant Camille Fournier » (prod 27/10 : 0 occurrence). */
  talentName?: string
  skills: readonly string[]
  zone?: string
  /** Les offres relevées PAR COMPTE (clé = nom du compte) ; absent = le commercial ne les joint pas. */
  offers?: ReadonlyMap<string, readonly LauraOffer[]>
}

/**
 * #4432.3 — les sous-jobs d'un lot lancé depuis une carte de Laura. La zone de la recherche voyage
 * avec le nom (`suggestion_criteria`) et devient le PÉRIMÈTRE du dossier côté serveur
 * (`geoScopeFromOriginCriteria`). Sans zone : le nom seul, l'analyse reste nationale.
 *
 * #4642 — avec un cadrage, les compétences, la zone lue, la fiche du talent et les offres du compte
 * voyagent aussi. Sans cadrage (ou entièrement retiré), la sortie est celle d'avant.
 */
export function rankingBatchItems(
  names: readonly string[],
  zone: SearchZone | undefined,
  framing?: LauraFraming,
): AnalysisBatchInput[] {
  const criteria: DiscoverOriginCriteria = {}
  if (zone?.city) criteria.zone_city = zone.city
  if (zone?.departments?.length) criteria.zone_departments = zone.departments
  if (zone?.regions?.length) criteria.zone_regions = zone.regions
  const label = [zone?.city, ...(zone?.departments ?? []), ...(zone?.regions ?? [])].filter(Boolean).join(' · ')
  return names.map(name => {
    const framed = framingCriteria(name, framing, label !== '')
    if (!label && !framed) return { name }
    return {
      name,
      suggestion_id: `laura:${name}`.slice(0, 200),
      suggestion_criteria: { ...(label ? { zone: label.slice(0, 120), ...criteria } : {}), ...framed },
    }
  })
}

/** Ce que le cadrage ajoute pour CE compte, ou `undefined` quand il ne reste aucun axe lisible. */
function framingCriteria(
  name: string,
  framing: LauraFraming | undefined,
  hasSearchedZone: boolean,
): DiscoverOriginCriteria | undefined {
  if (!framing) return undefined
  const skills = framing.skills.slice(0, 20)
  const zone = hasSearchedZone ? undefined : framing.zone?.trim().slice(0, 120)
  const offers = (framing.offers?.get(name) ?? [])
    .slice(0, 10)
    .map(({ title, date }) => (date ? { title, date } : { title }))
  // La fiche du talent seule n'est pas un axe : sans compétence, zone ni offre, il n'y a rien à cadrer.
  if (skills.length === 0 && !zone && offers.length === 0) return undefined
  return {
    framed_by: 'laura',
    ...(framing.talentId ? { talent_id: framing.talentId } : {}),
    ...(framing.talentName ? { talent_name: framing.talentName.trim().slice(0, 120) } : {}),
    ...(skills.length > 0 ? { skills: [...skills] } : {}),
    ...(zone ? { zone } : {}),
    ...(offers.length > 0 ? { offers } : {}),
  }
}
