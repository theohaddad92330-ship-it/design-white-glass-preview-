/**
 * Ce que le provisionnement d'un client VA faire, décidé AVANT d'écrire quoi que
 * ce soit (#1665, règle 3 : « un aperçu récapitule les 6 étapes avant
 * validation », test T2 : « aperçu affiché avant toute écriture »).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER EXISTE, ET POURQUOI IL EST PUR
 * ─────────────────────────────────────────────────────────────────────────────
 * Un aperçu qui passerait par le service d'écriture serait un aperçu qu'on ne
 * peut pas PROUVER sans effet de bord : il suffirait d'un `save()` oublié dans
 * une branche pour que « prévisualiser » crée un espace. Ici il n'y a aucun
 * dépôt, aucune horloge lue en douce (`now` est un PARAMÈTRE), aucun appel
 * réseau — donc rien à oublier. Le service se contente de LIRE l'état existant
 * et de passer ce qu'il a lu.
 *
 * ⚠️ L'ORDRE AFFICHÉ N'EST PAS L'ORDRE D'EXÉCUTION, et c'est volontaire.
 * L'issue numérote « 1. l'espace · 2. le propriétaire », parce que c'est ainsi
 * qu'un humain raconte ce qu'il vend. Le code crée forcément le PROPRIÉTAIRE
 * d'abord : un espace porte `owner_user_id`, il ne peut pas exister avant lui.
 * Le récapitulatif garde donc les rangs de l'issue — c'est un récit destiné à
 * être relu par Théo — et chaque étape déclare séparément si elle vit dans la
 * transaction SQL ou si elle demande une compensation.
 */

import { localDayKey } from '@bellum/contracts'
import { addDays, addMonths, commitmentEndOf } from './manual-billing-schedule'
import type { ManualBillingPeriod } from '../../database/entities/manual-billing-terms.entity'

/** Les six gestes de l'issue, dans leur ordre de RÉCIT. */
type ProvisioningStepKey = 'workspace' | 'owner' | 'plan' | 'credits' | 'billing' | 'invitations'

/**
 * Ce que l'étape fera à l'état existant.
 *
 * `reuse` et `rename` ne sont pas des détails d'implémentation : re-provisionner
 * un client déjà présent est le geste le plus dangereux de cet écran, et
 * l'opérateur doit LIRE « le compte de théo@… est réutilisé » avant de valider,
 * pas le découvrir dans le panneau de résultat.
 */
type ProvisioningAction = 'create' | 'reuse' | 'rename' | 'update' | 'none'

interface ProvisioningStep {
  key: ProvisioningStepKey
  /** Le rang de l'issue (1 à 6). Il ne suit pas l'ordre d'exécution — voir l'entête. */
  rank: number
  title: string
  action: ProvisioningAction
  /** Ce que l'étape écrira, une ligne par fait. Jamais un identifiant technique nu. */
  detail: string[]
  /**
   * `true` : l'écriture vit dans LA transaction SQL, donc elle est défaite
   * automatiquement si une autre échoue.
   * `false` : elle vit ailleurs (Supabase Auth, un e-mail parti), donc elle
   * demande une COMPENSATION explicite ou n'est pas réversible du tout.
   */
  transactional: boolean
}

/** Un e-mail préparé, montré à l'opérateur AVANT tout envoi (#1665, règle 2). */
export interface PreparedEmail {
  to: string
  subject: string
  /** Texte simple. Le back-office l'affiche tel quel et l'opérateur peut le copier. */
  body: string
  /**
   * `false` tant que le corps porte un EMPLACEMENT au lieu du lien.
   *
   * ⚠️ Un lien de définition de mot de passe est un jeton à usage unique. Il
   * n'est engendré qu'à la validation, jamais dans l'aperçu : un aperçu se
   * rejoue, se capture et se partage, et chaque rejeu invaliderait le lien
   * précédent (`aucun-secret-affiche.test.ts`).
   */
  carriesLink: boolean
}

/** Ce que la base dit DÉJÀ, lu par le service et passé ici tel quel. */
export interface ProvisioningContext {
  /** Un compte porte déjà cette adresse — il sera RÉUTILISÉ, jamais dupliqué. */
  ownerExists: boolean
  /** Cet e-mail porte un abonnement Stripe vivant : le provisionnement est refusé. */
  ownerHasStripeSubscription: boolean
  /** L'espace déjà rattaché à ce propriétaire, s'il y en a un. */
  existingWorkspace: { id: string; name: string } | null
  existingSubscription: { plan: string; accountsLimit: number; enrichmentCredits: number } | null
  /** Des conditions commerciales existent déjà pour cet espace. */
  existingTerms: boolean
  /** La référence de facture saisie est DÉJÀ au grand livre (re-provisionnement). */
  invoiceAlreadyRecorded: boolean
  /** Le palier tel que le catalogue le résout — jamais une grille recopiée ici. */
  plan: { label: string; accountsLimit: number; enrichmentCredits: number; seats: number }
}

/** Ce que l'aperçu décrit, et ce que le formulaire affiche avant de valider. */
export interface ProvisioningPreview {
  esnName: string
  ownerEmail: string
  plan: string
  steps: ProvisioningStep[]
  /**
   * Ce qui EMPÊCHE le provisionnement. Non vide = le bouton « Créer » ne doit
   * pas être proposé : l'appel échouerait, et il échouerait APRÈS avoir peut-être
   * créé un compte d'authentification.
   */
  blockers: string[]
  /**
   * Ce qui n'est PAS défait si ça tourne mal, dit en toutes lettres.
   *
   * L'issue demande « si une étape échoue, TOUT est annulé ». Les six étapes ne
   * vivent pas dans la même base : ce champ est la partie honnête de la réponse.
   */
  compensations: string[]
  /** L'e-mail du propriétaire, SANS son lien. `null` si le compte existe déjà. */
  ownerInvitation: PreparedEmail | null
  /** Les invitations d'équipe qui partiront, après le commit. */
  teamInvitations: Array<{ email: string; role: string }>
  /** `null` = aucun engagement négocié. Jamais « 0 mois ». */
  commitmentEnd: string | null
  /** La période que la première facture couvrirait, si une référence est saisie. */
  firstInvoiceWindow: { start: string; end: string } | null
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * L'ÉVÉNEMENT D'AUDIT — LE CONTRAT AVEC #1666
 * ─────────────────────────────────────────────────────────────────────────────
 * #1665 demande que « l'opération entière soit journalisée avec son auteur »
 * (T3). #1666 construit le journal d'audit UNIQUE du back-office, en parallèle.
 * Construire ici un second journal serait le défaut exact que le dépôt paie le
 * plus souvent : deux tables qui racontent le même fait et qui divergent.
 *
 * Ce type EST le contrat. Le provisionnement l'émet en UN seul endroit —
 * `ManualProvisioningService.emitAudit` — par le journal structuré du service
 * (Winston + Sentry, convention `tags: { 'admin.op': … }` déjà en place dans ce
 * module). Quand #1666 pose sa table, il lui suffit de brancher une écriture à
 * cet endroit-là : la charge utile est déjà complète et déjà datée.
 *
 * ⚠️ AUCUNE DONNÉE DE CLIENT FINAL ici : l'adresse du PROPRIÉTAIRE de l'espace
 * (c'est-à-dire de l'acheteur) et celle de l'opérateur, rien d'autre. Ni contact
 * prospect, ni contenu, ni jeton — un journal qui porterait le lien de
 * définition de mot de passe le rendrait rejouable par quiconque le lit.
 */
export interface ProvisioningAuditEntry {
  event: 'client.provisioned' | 'client.provision_failed'
  /**
   * Qui a déclenché l'opération. `null` quand la couche d'identité du
   * back-office est éteinte (`DM_ALLOWED_EMAILS` absente) — et c'est alors un
   * FAIT, pas un trou : personne ne peut être nommé, et écrire « admin » ferait
   * croire à une identité vérifiée.
   */
  actor: { email: string; role: string } | null
  workspaceId: string | null
  workspaceName: string
  ownerEmail: string
  /** `false` = un compte existant a été réutilisé, aucun doublon créé. */
  ownerCreated: boolean
  plan: string
  amountCents: number
  /** L'issue de chacune des six étapes, dans l'ordre du récit. */
  steps: Array<{ key: ProvisioningStepKey; action: ProvisioningAction; outcome: ProvisioningStepOutcome }>
  /** Pour un échec : ce qui reste à nettoyer à la main. Vide sinon. */
  manualCleanup: string[]
  /** L'horodatage, passé par l'appelant — jamais lu ici. */
  at: string
}

/** `unknown` = l'écriture est partie sans réponse : on ne sait pas. */
export type ProvisioningStepOutcome = 'done' | 'failed' | 'unknown' | 'skipped'

/** L'entrée minimale dont l'aperçu a besoin — un sous-ensemble de la charge du POST. */
export interface ProvisioningPreviewInput {
  esnName: string
  owner: { email: string; firstName?: string; lastName?: string }
  plan: string
  extraSeats?: number
  accountsLimit?: number
  enrichmentCredits?: number
  billing: {
    amountCents: number
    currency?: string
    period: ManualBillingPeriod
    startDate: string
    commitmentMonths?: number
    reference?: string
  }
  team?: Array<{ email: string; role: string }>
}

/**
 * Dernier jour couvert par UNE période de `period` commençant le `start`.
 *
 * ⚠️ Cette fonction vivait dans `manual-provisioning.service.ts`. Elle a été
 * DÉPLACÉE ici plutôt que recopiée : l'aperçu doit annoncer exactement la
 * fenêtre que l'écriture posera, et deux implémentations de la même dérivation
 * divergent — le jour où elles divergeraient, l'aperçu promettrait une période
 * que le grand livre n'ouvrirait pas.
 *
 * `one_off` couvre son jour de début et rien de plus : une affaire ponctuelle n'a
 * pas de récurrence, et l'étaler sur un mois inventerait une fenêtre que le
 * contrat n'a jamais eue.
 */
export function periodEndOf(period: ManualBillingPeriod, start: string): string {
  if (period === 'one_off') return start
  const months = period === 'monthly' ? 1 : period === 'quarterly' ? 3 : 12
  return addDays(addMonths(start, months), -1)
}

function euros(amountCents: number, currency: string): string {
  return `${(amountCents / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`
}

const PERIOD_LABELS: Record<ManualBillingPeriod, string> = {
  monthly: 'mensuel',
  quarterly: 'trimestriel',
  yearly: 'annuel',
  one_off: 'ponctuel',
}

/**
 * Le récapitulatif des six étapes. PUR : aucun dépôt, aucun réseau, et `now` est
 * un paramètre — un aperçu daté par `new Date()` à l'intérieur serait intestable
 * le jour où la fenêtre de facturation tomberait sur une bascule de mois.
 */
export function buildProvisioningPreview(
  input: ProvisioningPreviewInput,
  context: ProvisioningContext,
  now: Date,
): ProvisioningPreview {
  const esnName = input.esnName.trim()
  const ownerEmail = input.owner.email.trim().toLowerCase()
  const currency = (input.billing.currency ?? 'EUR').toUpperCase()
  const accountsLimit = input.accountsLimit ?? context.plan.accountsLimit
  const enrichmentCredits = input.enrichmentCredits ?? context.plan.enrichmentCredits
  const extraSeats = input.extraSeats ?? 0
  const reference = input.billing.reference?.trim()
  const team = (input.team ?? []).filter(row => row.email.trim().toLowerCase() !== ownerEmail)

  const blockers: string[] = []
  if (context.ownerHasStripeSubscription) {
    blockers.push(
      `${ownerEmail} a déjà un abonnement Stripe actif. Résiliez-le dans Stripe avant de basculer ce client en facturation manuelle.`,
    )
  }
  if (!esnName) blockers.push("Le nom de l'ESN est vide — l'espace n'aurait pas de nom.")

  const commitmentEnd = commitmentEndOf({
    period: input.billing.period,
    startDate: input.billing.startDate,
    commitmentMonths: input.billing.commitmentMonths ?? null,
  })

  const firstInvoiceWindow = reference
    ? { start: input.billing.startDate, end: periodEndOf(input.billing.period, input.billing.startDate) }
    : null

  // Le jour de l'opérateur, lu sur l'horloge LOCALE (GA-126) — `toISOString()`
  // recule d'un jour deux heures par nuit à Paris, et l'aperçu dirait alors « le
  // contrat commence demain » d'un contrat qui commence aujourd'hui.
  const today = localDayKey(now)
  const debut =
    input.billing.startDate > today
      ? `Le contrat n'a pas encore commencé (début le ${input.billing.startDate}, nous sommes le ${today}).`
      : input.billing.startDate < today
        ? `Le contrat a commencé le ${input.billing.startDate} — une période antérieure à aujourd'hui (${today}) sera immédiatement due.`
        : `Le contrat commence aujourd'hui (${today}).`

  const steps: ProvisioningStep[] = [
    {
      key: 'workspace',
      rank: 1,
      title: "Créer l'espace",
      action: context.existingWorkspace ? (context.existingWorkspace.name === esnName ? 'reuse' : 'rename') : 'create',
      detail: context.existingWorkspace
        ? [
            context.existingWorkspace.name === esnName
              ? `L'espace « ${esnName} » existe déjà et est réutilisé — aucun second espace.`
              : `L'espace « ${context.existingWorkspace.name} » est RENOMMÉ en « ${esnName} ».`,
            `Sièges : ${context.plan.seats + extraSeats} (${context.plan.seats} inclus dans le palier + ${extraSeats}).`,
          ]
        : [
            `Nouvel espace « ${esnName} ».`,
            `Sièges : ${context.plan.seats + extraSeats} (${context.plan.seats} inclus dans le palier + ${extraSeats}).`,
            'Le propriétaire y est inscrit comme membre `owner`.',
          ],
      transactional: true,
    },
    {
      key: 'owner',
      rank: 2,
      title: 'Créer le propriétaire',
      action: context.ownerExists ? 'reuse' : 'create',
      detail: context.ownerExists
        ? [`Le compte ${ownerEmail} existe déjà : il est RÉUTILISÉ, jamais dupliqué ni repris.`]
        : [
            `Nouveau compte ${ownerEmail}${nameSuffix(input.owner)}.`,
            "Aucun mot de passe n'est créé : la personne définit le sien par le lien d'invitation.",
            '⚠️ Ce compte vit dans Supabase Auth, hors de la transaction SQL — voir « ce qui se compense ».',
          ],
      transactional: false,
    },
    {
      key: 'plan',
      rank: 3,
      title: "Attribuer l'offre",
      action: context.existingSubscription ? 'update' : 'create',
      detail: [
        context.existingSubscription
          ? `Palier ${context.existingSubscription.plan} → ${context.plan.label} (${input.plan}).`
          : `Palier ${context.plan.label} (${input.plan}).`,
        'Facturation `manual` : aucun abonnement Stripe, aucun identifiant Stripe écrit.',
        "Aucune fin d'essai : un reliquat de période d'essai bloquerait le compte.",
      ],
      transactional: true,
    },
    {
      key: 'credits',
      rank: 4,
      title: 'Créditer',
      action: 'update',
      detail: [
        `${accountsLimit} crédits d'analyse par cycle${input.accountsLimit === undefined ? ' (valeur du palier)' : ' (négociés)'}.`,
        `${enrichmentCredits} crédits d'enrichissement${input.enrichmentCredits === undefined ? ' (valeur du palier)' : ' (négociés)'}.`,
        'Le cycle démarre maintenant : le client dispose du mois entier dès le premier jour.',
        'Une ligne `grant_plan` est inscrite au grand livre des crédits — sans elle, cette enveloppe initiale ne figurerait dans aucun historique.',
      ],
      transactional: true,
    },
    {
      key: 'billing',
      rank: 5,
      title: 'Facturation',
      action: context.existingTerms ? 'update' : 'create',
      detail: [
        `Sur facture (hors application), ${euros(input.billing.amountCents, currency)} — ${PERIOD_LABELS[input.billing.period]}.`,
        debut,
        commitmentEnd
          ? `Engagement de ${input.billing.commitmentMonths} mois, échéance le ${commitmentEnd} — SIGNALÉE, jamais appliquée.`
          : 'Sans engagement.',
        reference
          ? context.invoiceAlreadyRecorded
            ? `La facture ${reference} est déjà au grand livre : elle ne sera pas doublée.`
            : `Ouverture du grand livre avec la facture ${reference} (période ${firstInvoiceWindow?.start} → ${firstInvoiceWindow?.end}).`
          : "Aucune référence saisie : le grand livre reste vide et la première période s'affichera « facture manquante ».",
      ],
      transactional: true,
    },
    {
      key: 'invitations',
      rank: 6,
      title: "Envoyer l'invitation",
      action: team.length === 0 && context.ownerExists ? 'none' : 'create',
      detail: [
        context.ownerExists
          ? `${ownerEmail} a déjà un compte : aucun lien de définition de mot de passe n'est nécessaire.`
          : `Un e-mail de bienvenue est PRÉPARÉ pour ${ownerEmail}, avec son lien de définition de mot de passe. Il vous est montré ; rien ne part tout seul.`,
        team.length === 0
          ? 'Aucun collaborateur à inviter.'
          : `${team.length} invitation(s) d'équipe partiront APRÈS la création : ${team.map(row => row.role).join(', ')}.`,
        '⚠️ Un e-mail parti ne se dé-envoie pas : ces envois ont lieu une fois le reste COMMIS, jamais avant.',
      ],
      transactional: false,
    },
  ]

  return {
    esnName,
    ownerEmail,
    plan: input.plan,
    steps,
    blockers,
    compensations: describeCompensations(context.ownerExists),
    ownerInvitation: context.ownerExists
      ? null
      : renderOwnerInvitationEmail({
          ownerEmail,
          ownerFirstName: input.owner.firstName,
          esnName,
          planLabel: context.plan.label,
          link: null,
          expiresAt: null,
        }),
    teamInvitations: team.map(row => ({ email: row.email.trim().toLowerCase(), role: row.role })),
    commitmentEnd,
    firstInvoiceWindow,
  }
}

function nameSuffix(owner: { firstName?: string; lastName?: string }): string {
  const nom = [owner.firstName, owner.lastName].filter(Boolean).join(' ').trim()
  return nom ? ` (${nom})` : ''
}

/**
 * Ce que « tout est annulé » veut dire EXACTEMENT, étage par étage.
 *
 * L'issue demande une transaction unique. Les six étapes ne vivent pas dans une
 * seule base : le dire est plus utile que le promettre.
 */
function describeCompensations(ownerExists: boolean): string[] {
  return [
    'Espace, adhésion, offre, crédits, conditions et première facture : UNE transaction SQL. Si l’une échoue, aucune n’est écrite.',
    ownerExists
      ? "Le compte du propriétaire existait déjà : il n'est JAMAIS supprimé, même si la suite échoue — ce n'est pas notre compte à défaire."
      : "Le compte du propriétaire vit dans Supabase Auth, hors transaction. S'il vient d'être créé et que la suite échoue, il est SUPPRIMÉ en compensation.",
    "Si la réponse de Supabase ne revient pas (requête partie, réponse perdue), rien n'est supprimé à l'aveugle : l'opération s'arrête et nomme le compte à vérifier à la main.",
    'Les e-mails partent APRÈS le commit, et un e-mail parti ne se défait pas : un envoi manqué est RAPPORTÉ, jamais maquillé en succès.',
  ]
}

/**
 * L'e-mail que reçoit le propriétaire — préparé, montré, et envoyé seulement
 * après que l'opérateur l'a vu (#1665, règle 2 : « pas d'envoi silencieux »).
 *
 * `link: null` rend un EMPLACEMENT plutôt que le jeton : c'est ce que l'aperçu
 * affiche. Le même rendu, avec le lien, est ce que l'opérateur copie une fois le
 * client créé — une seule dérivation, deux moments.
 */
export function renderOwnerInvitationEmail(input: {
  ownerEmail: string
  ownerFirstName?: string
  esnName: string
  planLabel: string
  link: string | null
  expiresAt: string | null
}): PreparedEmail {
  const prenom = input.ownerFirstName?.trim()
  const bonjour = prenom ? `Bonjour ${prenom},` : 'Bonjour,'
  const lien = input.link ?? '[le lien sera engendré à la validation — il n’existe pas encore]'
  const echeance = input.expiresAt
    ? `Ce lien expire le ${input.expiresAt}.`
    : 'Ce lien aura une durée de validité limitée : envoyez-le sans tarder.'

  return {
    to: input.ownerEmail,
    subject: `Votre espace ${input.esnName} est prêt`,
    body: [
      bonjour,
      '',
      `L'espace « ${input.esnName} » est ouvert sur votre offre ${input.planLabel}.`,
      '',
      'Définissez votre mot de passe pour y accéder :',
      lien,
      '',
      echeance,
      '',
      "Vous pourrez ensuite inviter votre équipe depuis l'écran Équipe.",
    ].join('\n'),
    carriesLink: input.link !== null,
  }
}
