/**
 * #2565 — LE PORT, PAS L'ADAPTATEUR.
 *
 * « Un contrat d'API non vérifiable ne se devine pas » (`CLAUDE.md` §
 * Doctrine). Odoo — l'exemple cité par le client — n'a AUCUNE écriture de
 * facture vérifiée sur une instance réelle dans ce dépôt ; deviner
 * `account.move` créerait une fausse facture chez un client. Ce fichier
 * déclare donc seulement la FORME que doit tenir n'importe quel adaptateur
 * futur, vérifié un jour sur une instance réelle — `InvoiceConnectorWriteService`
 * ne connaît que cette forme, jamais un fournisseur nommé.
 *
 * `RetainedInvoiceConnectorPort` (même fichier) ne fait NI requête HTTP NI
 * import réseau — zéro appel sortant (`invoice-connector-write.service.spec.ts`
 * le prouve par le nombre d'appels, pas par confiance).
 *
 * #2565.10 — l'adaptateur BRANCHÉ est désormais `OdooDraftInvoiceConnectorPort`
 * (`odoo-draft-invoice.port.ts`) : Louis a tranché (D4, 18/09) de coder contre
 * la doc PUBLIQUE d'Odoo et de marquer NON VÉRIFIÉ tout ce qu'une instance
 * réelle n'a pas confirmé. Il ne dépose qu'un BROUILLON ; tout autre outil
 * reçoit le refus de `RetainedInvoiceConnectorPort`. Sans lien Odoo sur
 * l'espace (la démonstration), il ne fait, lui non plus, aucun appel.
 */

import { Injectable } from '@nestjs/common'

/**
 * #2565.10 — les FAITS du mois, tels que l'écran les a prévisualisés
 * (`InvoiceReadinessService.list`). Aucun n'est au format d'un outil : chaque
 * adaptateur traduit, et refuse nommément ce qui lui manque — un `null` ne
 * devient jamais `0`, une chaîne vide ou un défaut deviné.
 */
export type InvoiceConnectorPayload = {
  missionId: string
  /** `YYYY-MM-01`. */
  periodMonth: string
  /** Jours × TJM, en CENTIMES, hors taxes — le montant prévisualisé. */
  preparedAmountCents: number | null
  missionLabel: string | null
  /** Le nom du compte client dans Bellum — la clé pour RETROUVER le client
   *  chez l'outil, jamais pour le créer. */
  accountName: string | null
  days: number | null
  dailyRateCents: number | null
}

/** Ce que le service envoie — jamais un identifiant Bellum interne, jamais un
 *  format deviné : whatever le futur adaptateur vérifié exige. */
type InvoiceConnectorWriteInput = {
  /** L'identifiant technique de l'outil connecté (ex. `'odoo'`) — jamais un nom
   *  affiché, seulement un routage vers le bon adaptateur. */
  provider: string
  /** #2565.10 — l'espace dont on lit le lien vers l'outil (ses identifiants
   *  sont ceux de l'ESPACE, jamais d'une variable d'environnement). */
  workspaceId: string
  payload: Readonly<InvoiceConnectorPayload>
}

/** `ok: true` = le connecteur a RÉPONDU avec une référence — la SEULE preuve
 *  qui autorise `state: 'invoiced'`. `ok: false` porte l'issue classée par
 *  `dispatchFailureOutcome` : `failed` (rejouable) ou `unknown` (arrêt).
 *
 *  #2418.2 — `document` est la PORTE des trois états du document chez le client
 *  (« acceptée », « rejetée », « avoir émis »). Un adaptateur qui sait les lire
 *  les rend ici, avec la référence du document et la date à laquelle L'OUTIL l'a
 *  dit ; tout adaptateur qui ne sait pas l'omet, et l'état reste `null` — « on ne
 *  sait pas » n'est pas « rejetée ». Aucun état ne se déduit d'un encaissement,
 *  d'un délai ou d'un silence : `InvoiceConnectorWriteService` ne l'écrit qu'en
 *  passant par `invoiceDocumentStatusFromConnector`, qui refuse tout ce qui n'est
 *  pas une preuve complète (garde GA-377). */
export type InvoiceConnectorWriteOutcome =
  | {
      ok: true
      reference: string
      document?: { state: string; reference: string; observedAt: string }
    }
  | { ok: false; outcome: 'failed' | 'unknown'; detail: string }

export interface InvoiceConnectorPort {
  createInvoice(input: InvoiceConnectorWriteInput): Promise<InvoiceConnectorWriteOutcome>
}

/** Le jeton d'injection NestJS — un `Injectable` concret n'est pas obligé
 *  d'exister pour que le port soit typé ; c'est CE jeton qu'un futur adaptateur
 *  vérifié remplacera dans `delivery.module.ts`, à UN seul endroit (GA-26). */
export const INVOICE_CONNECTOR_PORT = 'INVOICE_CONNECTOR_PORT'

/**
 * L'adaptateur RETENU (voir le fichier plus haut). Il ne devine RIEN : il dit,
 * honnêtement, qu'aucune écriture n'est encore vérifiée — `failed`, parce que
 * rien n'est jamais parti (donc rejouable le jour où un adaptateur réel prend
 * sa place), jamais `unknown`, qui affirmerait qu'un appel a pu partir.
 *
 * #2565.12 — Odoo est TRANCHÉ comme premier outil (décision Louis 18/09,
 * après-midi D2 « Facturation : Odoo reçoit le PREMIER adaptateur vérifié »,
 * confirmée le soir même : `.claude/notes/decisions-louis-18-09-soir.md` #8
 * « Odoo, Louis fournit un accès de recette » — « bloqué tant que l'accès
 * n'est pas fourni »). Le CHOIX est donc livré ; l'ADAPTATEUR (#2565.10)
 * reste `retenu` : aucune instance Odoo réelle n'a été fournie à ce dépôt
 * (même constat que `apps/api/src/modules/odoo/odoo.client.ts`, en tête —
 * « personne ici n'a encore branché une instance Odoo »). Deviner le contrat
 * `account.move` créerait une fausse facture chez un client ; le refus reste
 * donc générique pour tout `provider`, à une nuance près : Odoo, nommé et
 * daté, dit PRÉCISÉMENT pourquoi il attend plutôt que de laisser croire à un
 * oubli.
 *
 * #2565.10 — depuis, le module branche `OdooDraftInvoiceConnectorPort`
 * (`odoo-draft-invoice.port.ts`), qui traite `odoo` lui-même (D4 : la doc
 * publique, le non-prouvé marqué NON VÉRIFIÉ) et ne délègue ICI que les autres
 * outils. La branche `odoo` ci-dessous ne sert plus qu'à cette classe employée
 * seule. Elle ne lit que `provider` — aucun fait du mois.
 */
@Injectable()
export class RetainedInvoiceConnectorPort implements InvoiceConnectorPort {
  async createInvoice(input?: {
    readonly provider: string
    readonly [unread: string]: unknown
  }): Promise<InvoiceConnectorWriteOutcome> {
    if (input?.provider === 'odoo') {
      return {
        ok: false,
        outcome: 'failed',
        detail:
          "Odoo est l'outil retenu pour le premier adaptateur vérifié (#2565.12, décision Louis 18/09) — " +
          "mais aucune instance de recette réelle n'a encore été fournie : le contrat account.move ne se " +
          "devine pas. Rien n'est parti.",
      }
    }
    return {
      ok: false,
      outcome: 'failed',
      detail: "Aucun connecteur d'écriture vérifié pour cet outil — fonctionnalité retenue (#2565). Rien n'est parti.",
    }
  }
}
