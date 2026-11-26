/**
 * #4035.3 — l'alerte opérateur vue par le pool : une FORME, pas un import. GA-07 (`module-boundaries.spec.ts`) est un
 * cliquet au plafond ; la composition (`useExisting: BackofficeAlertDispatchService`) vit dans `demo.module.ts`,
 * hors périmètre de la garde — même gabarit que `backoffice-alerts/module-tokens.ts`.
 */
export const DEMO_OPERATOR_ALERT = 'DEMO_OPERATOR_ALERT'

export type DemoOperatorAlert = {
  dispatch(input: {
    kind: 'salle_demo_indisponible'
    subject: string
    title: string
    detail: string
    resolved: boolean
  }): Promise<unknown>
}
