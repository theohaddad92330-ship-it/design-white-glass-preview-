/**
 * #2952 (#2305.30/.31/.33/.34) — LAU-FINAL-046, les garde-fous anti-conflation.
 *
 * Un signal réel ne prouve pas, à lui seul, l'offre qu'on serait tenté d'y
 * lire : un recrutement en CDI n'est pas un besoin freelance, une nouvelle
 * usine n'appelle pas immédiatement une ESN, un budget de GROUPE n'est pas
 * disponible dans une filiale, la nomination d'un dirigeant n'est pas un
 * besoin d'achat. Les quatre exemples de l'issue, tels quels.
 *
 * Ce module ne DEVINE rien de plus que le texte du signal : il repère les
 * quelques marqueurs textuels qui rendent CHACUNE de ces quatre conflations
 * plausible, et les nomme — jamais un score, jamais une probabilité. Un
 * signal qui ne déclenche aucun marqueur est réputé pertinent : l'absence de
 * garde-fou n'est pas une preuve de pertinence, seulement l'absence du piège
 * nommé par l'issue.
 */

type SignalGuardrailId =
  | 'cdi_not_freelance'
  | 'factory_not_immediate_esn'
  | 'group_budget_not_subsidiary'
  | 'executive_appointment_not_purchase'

type SignalOfferRelevance = {
  relevant: boolean
  blockedBy: SignalGuardrailId[]
}

function normalize(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

const EXECUTIVE_TITLES =
  /\b(pdg|dg|directeur general|directrice generale|ceo|daf|directeur administratif et financier|dsi|directeur des systemes d.information|president|dirigeant)\b/

/**
 * #2305.30 — Recrutement CDI ≠ besoin freelance.
 * Un poste ouvert en CDI comble le besoin EN INTERNE ; ce n'est pas, à soi
 * seul, un signal de recours à une ESN.
 */
function isCdiNotFreelance(text: string): boolean {
  return /\bcdi\b/.test(text) && /(recrut|embauch|\bposte\b)/.test(text)
}

/**
 * #2305.31 — Nouvelle usine ≠ appel immédiat à une ESN.
 * Une implantation industrielle est un fait métier ; elle ne dit rien, seule,
 * du besoin IT/conseil qu'une ESN adresse.
 */
function isFactoryNotImmediateEsn(text: string): boolean {
  return /\busines?\b/.test(text)
}

/**
 * #2305.33 — Budget GROUPE ≠ budget disponible en filiale.
 * Un budget annoncé au niveau groupe/maison mère n'est pas, sans plus,
 * arbitré ni débloqué au niveau de l'entité qu'on adresse.
 */
function isGroupBudgetNotSubsidiary(text: string): boolean {
  return /budget/.test(text) && /(groupe|maison.mere)/.test(text)
}

/**
 * #2305.34 — Nomination d'un dirigeant ≠ besoin d'achat.
 * Une nomination change un interlocuteur ; elle ne formule aucune demande.
 */
function isExecutiveAppointmentNotPurchase(text: string): boolean {
  return /nomm[ée]|nomination/.test(text) && EXECUTIVE_TITLES.test(text)
}

export function evaluateSignalOfferRelevance(signal: {
  type?: string | null
  signal?: string | null
}): SignalOfferRelevance {
  const text = normalize(`${signal.type ?? ''} ${signal.signal ?? ''}`)
  const blockedBy: SignalGuardrailId[] = []

  if (isCdiNotFreelance(text)) blockedBy.push('cdi_not_freelance')
  if (isFactoryNotImmediateEsn(text)) blockedBy.push('factory_not_immediate_esn')
  if (isGroupBudgetNotSubsidiary(text)) blockedBy.push('group_budget_not_subsidiary')
  if (isExecutiveAppointmentNotPurchase(text)) blockedBy.push('executive_appointment_not_purchase')

  return { relevant: blockedBy.length === 0, blockedBy }
}
