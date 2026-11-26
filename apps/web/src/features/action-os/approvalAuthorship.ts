import type { TFunction } from 'i18next'

/** Déclencheurs dont le libellé nomme DÉJÀ l'agent : « préparée par » le redirait. */
const AGENT_NAMED_TRIGGERS = new Set(['copilot_proposal', 'laura_job'])

/**
 * #2200.13 — LA formule d'auteur d'une demande « À valider » (GA-26 : une seule forme).
 * La rangée de /actions › Aujourd'hui disait « Préparé par Laura », la fenêtre ouverte à son
 * clic « Déclenchée par Louis Schlegel » : deux vérités partielles. Les deux disent désormais
 * l'humain qui a déclenché (sinon le déclencheur), la source quand un humain l'a lancée depuis
 * un événement, puis l'agent qui a préparé. Un inconnu ne fait aucun morceau.
 */
export function approvalAuthorship(
  t: TFunction,
  trace: { triggeredByName?: string | null; trigger?: string | null } | undefined,
): string[] {
  const trigger = trace?.trigger ?? 'manual'
  const parts: string[] = []
  if (trace?.triggeredByName) {
    parts.push(t('actions:center.trace.triggeredBy', { name: trace.triggeredByName }))
    // #2200.14 — la source (`trace.trigger`) : seulement si elle a un libellé humain.
    const from = t(`actions:center.trace.from.${trigger}`, { defaultValue: '' })
    if (from) parts.push(from)
  } else {
    parts.push(
      t(`actions:center.trace.trigger.${trigger}`, { defaultValue: t('actions:center.trace.trigger.unknown') }),
    )
  }
  if (!AGENT_NAMED_TRIGGERS.has(trigger)) parts.push(t('actions:center.trace.preparedBy'))
  return parts
}
