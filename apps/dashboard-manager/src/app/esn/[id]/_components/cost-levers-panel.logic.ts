import type { WorkspaceBudgetLevers } from '@bellum/contracts'

export type CostLeversForm = {
  monthly: string
  perMember: string
  perAction: string
  alertOnOverage: boolean
  blockAtCap: boolean
}

type CostLeversParse = { ok: true; levers: WorkspaceBudgetLevers } | { ok: false; error: string }

const CHAMPS = [
  { key: 'monthly', libelle: 'budget mensuel' },
  { key: 'perMember', libelle: 'plafond par membre' },
  { key: 'perAction', libelle: 'plafond par action' },
] as const

/**
 * Un plafond saisi : vide = pas de plafond (`null`, jamais 0 — doctrine « une valeur absente ne
 * s'affiche JAMAIS 0 »), sinon un montant strictement positif en dollars. La virgule décimale
 * française est acceptée ; toute autre forme est refusée plutôt que devinée.
 */
function plafond(saisie: string): number | null | undefined {
  const texte = saisie.trim()
  if (texte === '') return null
  if (!/^\d+(?:[.,]\d+)?$/.test(texte)) return undefined
  const valeur = Number(texte.replace(',', '.'))
  return Number.isFinite(valeur) && valeur > 0 ? valeur : undefined
}

export function leversFromForm(form: CostLeversForm): CostLeversParse {
  const lus: Record<(typeof CHAMPS)[number]['key'], number | null> = { monthly: null, perMember: null, perAction: null }
  for (const champ of CHAMPS) {
    const valeur = plafond(form[champ.key])
    if (valeur === undefined) {
      return {
        ok: false,
        error: `Le ${champ.libelle} est un montant positif en dollars, ou vide pour ne pas en poser.`,
      }
    }
    lus[champ.key] = valeur
  }
  return {
    ok: true,
    levers: {
      monthlyBudgetUsd: lus.monthly,
      perMemberCapUsd: lus.perMember,
      perActionCapUsd: lus.perAction,
      alertOnOverage: form.alertOnOverage,
      blockAtCap: form.blockAtCap,
    },
  }
}

export function formFromLevers(levers: WorkspaceBudgetLevers): CostLeversForm {
  const texte = (valeur: number | null) => (valeur === null ? '' : String(valeur))
  return {
    monthly: texte(levers.monthlyBudgetUsd),
    perMember: texte(levers.perMemberCapUsd),
    perAction: texte(levers.perActionCapUsd),
    alertOnOverage: levers.alertOnOverage,
    blockAtCap: levers.blockAtCap,
  }
}

/**
 * Ce que la porte fait RÉELLEMENT avec ces réglages. Les deux interrupteurs ne pèsent qu'en
 * présence d'au moins un plafond réglé (`checkBudgetGate` ne les lit qu'après un plafond dépassé) :
 * les présenter comme actifs sans plafond serait promettre un blocage qui n'existe pas.
 */
export function libelleEtatPlafonds(levers: WorkspaceBudgetLevers): string {
  const poses = [levers.monthlyBudgetUsd, levers.perMemberCapUsd, levers.perActionCapUsd].filter(
    valeur => valeur !== null,
  ).length
  if (poses === 0) return 'Aucun plafond réglé : rien n’est bloqué ni signalé.'
  const debut = poses === 1 ? '1 plafond réglé' : `${poses} plafonds réglés`
  if (levers.blockAtCap) return `${debut} : au-delà, l’action est refusée.`
  return levers.alertOnOverage
    ? `${debut} : au-delà, l’action passe et un dépassement est signalé.`
    : `${debut} : au-delà, l’action passe et rien n’est signalé.`
}
