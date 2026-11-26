/**
 * #3699.5 — le transport a RÉPONDU et refusé le message : rien n'est parti. À
 * l'inverse d'un délai dépassé ou d'une coupure, où la réponse n'est jamais
 * arrivée et où le message est peut-être parti. L'appelant s'en sert pour
 * distinguer « échec » (on peut renvoyer) d'« incertain » (on vérifie d'abord).
 */
export class MailTransportRejectedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MailTransportRejectedError'
  }
}
