import { Injectable, Logger, Optional } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { InjectRepository } from '@nestjs/typeorm'
import { LessThan, Repository } from 'typeorm'
import { returnedCount } from '../../database/returned-rows'
import { UserSessionEntity } from '../../database/entities/user-session.entity'
import { BackofficeAccessJournalService } from '../admin/backoffice-access-journal.service'
import { TalentService } from '../consultants/talent.service'
import { SingletonLockService, withSingletonLock } from '../locks/singleton-lock.service'
// #1949.23 — fichier de faits PURS (aucun service) : la constante de rétention
// vit à un seul endroit, à côté de la trace qu'elle borne (GA-26).
import { CHAT_EVAL_SAMPLES_RETENTION_DAYS } from '../chat-eval-sampling/chat-eval-retention'
import { LAURA_UNROUTED_INTENTS_RETENTION_DAYS } from '../laura-unrouted-intents/unrouted-intent'
// #2297.51 — la durée de conservation des coordonnées enrichies vit au contrat (GA-26).
import { ENRICHED_CONTACT_RETENTION_DAYS } from '@bellum/contracts'
import { Correlated } from '../../correlation-id/background-correlation'
import { killSwitchCut } from '../../common/kill-switches'

/**
 * #2442.17 — les SIX catégories nommées par l'exigence d'observabilité
 * (LAU-FINAL-156 : « métriques ; logs ; traces ; audit ; sécurité ; support »).
 *
 * Optionnel sur {@link RetentionRule} : seules les règles qui EN font
 * réellement partie le portent. Le reste de cette politique (facturation,
 * comptes inactifs, coordonnées RGPD) est un périmètre différent — les y
 * rattacher de force ferait dire à #2442.17 plus qu'il n'a demandé.
 */
type ObservabilityRetentionCategory = 'metriques' | 'logs' | 'traces' | 'audit' | 'securite' | 'support'

/** One data category's retention rule — how long we keep it and why.
 *  Local: only referenced by {@link RetentionPolicy} in this file. */
type RetentionRule = {
  /** Stable machine key. */
  key: string
  /** Human label for the policy doc / settings screen. */
  label: string
  /** Retention window in days. `null` = kept for the life of the account. */
  days: number | null
  /** Why this window (legal basis / purpose). */
  rationale: string
  /** #2442.17 — la catégorie d'observabilité que cette règle représente. */
  observabilityCategory?: ObservabilityRetentionCategory
}

/** The whole documented policy, resolved from env (with safe defaults). */
export type RetentionPolicy = {
  rules: RetentionRule[]
  /** Whether the automated sweep is armed (default ON; `RETENTION_SWEEP_DISABLED=true` = break-glass off). */
  sweepEnabled: boolean
}

/** Reads a positive-integer env var, falling back to `fallback` when unset/bad. */
function envDays(key: string, fallback: number): number {
  const raw = Number(process.env[key])
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : fallback
}

/**
 * Armed by DEFAULT (zero-flag policy — the RGPD retention sweep is a product
 * behaviour, not an opt-in). `RETENTION_SWEEP_DISABLED=true` is the emergency
 * kill-switch (break-glass): set it only to freeze the purge, e.g. while an
 * abuse investigation needs revoked-device rows kept past the window.
 */
function sweepArmed(): boolean {
  return !killSwitchCut('privacy.retention_sweep')
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

/**
 * Plafond de lignes archivées effacées PAR PASSAGE.
 *
 * Il n'est pas là pour ménager la base — il est là pour qu'aucune instruction
 * de ce dépôt ne soit une suppression de masse. Un balayage quotidien borné à
 * 5 000 lignes met plusieurs jours à rattraper un arriéré, et c'est exactement
 * ce qu'on veut d'un geste irréversible : une fenêtre pendant laquelle on peut
 * encore l'arrêter (`RETENTION_SWEEP_DISABLED=true`) avant que tout soit parti.
 */
const ARCHIVED_SUMMARIES_BATCH = 5_000

/** Même rôle que {@link ARCHIVED_SUMMARIES_BATCH} pour le scrub des corps de
 *  messages : un plafond par passage, pour qu'aucun geste ne soit une purge de
 *  masse et qu'il reste une fenêtre pour l'arrêter. */
const ACTIVITY_BODIES_BATCH = 5_000

/** #1949.23 — même rôle pour la trace anonyme des demandes non comprises. */
const LAURA_UNROUTED_INTENTS_BATCH = 5_000
const CHAT_EVAL_SAMPLES_BATCH = 5_000

/** #2297.51 — même rôle pour l'archivage des coordonnées enrichies échues. */
const STALE_ENRICHED_CONTACTS_BATCH = 5_000

/**
 * #2297.51 — une coordonnée est ENRICHIE quand un appel payant l'a fournie
 * (`*_cost_credits`) ou quand la fiche vient d'un fournisseur. Une saisie de
 * l'espace (manual / import / crm) n'en est jamais une : « une correction
 * humaine gagne toujours », la rétention ne la touche pas.
 */
const WORKSPACE_SOURCES_SQL = `COALESCE(c.source, '') NOT IN ('manual', 'import', 'crm')`
const ENRICHED_EMAIL_SQL = `(c.email IS NOT NULL AND (c.email_cost_credits IS NOT NULL OR ${WORKSPACE_SOURCES_SQL}))`
const ENRICHED_PHONE_SQL = `(c.phone IS NOT NULL AND (c.phone_cost_credits IS NOT NULL OR ${WORKSPACE_SOURCES_SQL}))`

/**
 * #2297.51 — l'archivage, en UNE requête bornée : le lot est choisi (CTE), puis
 * chaque valeur enrichie part dans `enrichment_archive` et sa colonne lue
 * redevient NULL — inconnue, jamais « 0 ». Voir {@link PrivacyRetentionService.sweepStaleEnrichedContacts}.
 */
const ARCHIVE_STALE_ENRICHED_CONTACTS_SQL = `
  WITH stale AS (
    SELECT c.id,
           ${ENRICHED_EMAIL_SQL} AS archive_email,
           ${ENRICHED_PHONE_SQL} AS archive_phone
      FROM contacts c
     WHERE c.anonymized_at IS NULL
       AND (${ENRICHED_EMAIL_SQL}
            OR ${ENRICHED_PHONE_SQL}
            OR (c.apollo_enrichment IS NOT NULL AND c.apollo_enrichment ?| array['phone_numbers', 'personal_emails']))
       AND GREATEST(c.created_at, c.last_enrichment_at, c.email_sent_at) < $1
       AND GREATEST(
             c.created_at,
             c.last_enrichment_at,
             c.email_sent_at,
             (SELECT max(a.occurred_at) FROM activities a WHERE a.contact_id = c.id),
             (SELECT max(u.created_at) FROM user_actions u WHERE u.contact_id = c.id)
           ) < $1
     ORDER BY c.id
     LIMIT $2
  )
  UPDATE contacts AS t
     SET enrichment_archive = COALESCE(t.enrichment_archive, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
           'email', CASE WHEN s.archive_email THEN t.email END,
           'email_verified', CASE WHEN s.archive_email THEN t.email_verified END,
           'email_confidence', CASE WHEN s.archive_email THEN t.email_confidence END,
           'email_cost_credits', CASE WHEN s.archive_email THEN t.email_cost_credits END,
           'phone', CASE WHEN s.archive_phone THEN t.phone END,
           'phone_confidence', CASE WHEN s.archive_phone THEN t.phone_confidence END,
           'phone_cost_credits', CASE WHEN s.archive_phone THEN t.phone_cost_credits END,
           'phone_numbers', t.apollo_enrichment -> 'phone_numbers',
           'personal_emails', t.apollo_enrichment -> 'personal_emails'
         )),
         email = CASE WHEN s.archive_email THEN NULL ELSE t.email END,
         email_verified = CASE WHEN s.archive_email THEN false ELSE t.email_verified END,
         email_confidence = CASE WHEN s.archive_email THEN NULL ELSE t.email_confidence END,
         email_cost_credits = CASE WHEN s.archive_email THEN NULL ELSE t.email_cost_credits END,
         phone = CASE WHEN s.archive_phone THEN NULL ELSE t.phone END,
         phone_confidence = CASE WHEN s.archive_phone THEN NULL ELSE t.phone_confidence END,
         phone_cost_credits = CASE WHEN s.archive_phone THEN NULL ELSE t.phone_cost_credits END,
         apollo_enrichment = CASE
           WHEN t.apollo_enrichment IS NULL THEN NULL
           ELSE t.apollo_enrichment - 'phone_numbers' - 'personal_emails'
         END,
         enrichment_archived_at = $3
    FROM stale s
   WHERE t.id = s.id
  RETURNING t.id`

/**
 * The retention FRAMEWORK (RGPD art. 5-1-e « limitation de la conservation »).
 *
 * It exposes the documented policy (per data category, from env with defaults)
 * and runs ONE deliberately conservative sweep, ON by default: purging
 * long-revoked device rows (`RETENTION_SWEEP_DISABLED=true` = break-glass off).
 * Everything else — anonymised tombstones, the credit ledger, invoices — is
 * described by the policy but left to a manual/admin step by design: no
 * aggressive auto-purge of business or accounting data. See
 * `agent_docs/legal/privacy-retention-policy.md`.
 */
@Injectable()
export class PrivacyRetentionService {
  private readonly logger = new Logger(PrivacyRetentionService.name)

  constructor(
    @InjectRepository(UserSessionEntity)
    private readonly sessions: Repository<UserSessionEntity>,
    // Cron-tick lock — `@Optional()` so direct-`new` specs need no stub. The
    // DELETE is idempotent anyway; the lock just avoids N redundant sweeps.
    @Optional() private readonly locks?: SingletonLockService,
    // Optionnel : la rétention doit continuer de balayer les sessions même si
    // le vivier est retiré (règle #7). Absent, la purge des candidatures ne
    // tourne pas — et ne prétend pas avoir tourné.
    @Optional() private readonly talents?: TalentService,
    // Optionnel pour la même raison que les deux précédents : retirer la console
    // d'opération ne doit pas empêcher la rétention de balayer le reste. Absent,
    // la purge du journal d'accès ne tourne pas — et ne prétend pas avoir tourné.
    @Optional() private readonly accessJournal?: BackofficeAccessJournalService,
  ) {}

  /** The live policy — env-tunable windows plus the fixed rationale for each. */
  getRetentionPolicy(): RetentionPolicy {
    return {
      sweepEnabled: sweepArmed(),
      rules: [
        {
          key: 'revoked_sessions',
          label: 'Sessions révoquées (appareils déconnectés)',
          days: envDays('RETENTION_DAYS_REVOKED_SESSIONS', 90),
          rationale: 'Sécurité — trace des appareils, purgée après la fenêtre de détection d’abus.',
          // #2442.17 — catégorie « sécurité » : cette règle EXISTAIT déjà, elle est CLASSÉE, pas redéclarée (GA-26).
          observabilityCategory: 'securite',
        },
        {
          key: 'archived_conversation_summaries',
          label: 'Résumés de conversation archivés',
          days: envDays('RETENTION_DAYS_ARCHIVED_SUMMARIES', 90),
          rationale:
            'Extraits de conversations retirés de la lecture (`superseded_at`) : plus rien ne les lit, ' +
            'et ce sont des mots de personnes identifiables — la conservation n’a plus de finalité (art. 5-1-e).',
        },
        {
          key: 'backoffice_access',
          label: 'Journal d’accès du back-office',
          days: envDays('RETENTION_DAYS_BACKOFFICE_ACCESS', 365),
          rationale:
            'Qui est entré dans la console d’opération, quand et d’où (#1671.2). Douze mois : c’est la fenêtre ' +
            'demandée, et elle couvre un audit annuel. Aucune donnée de client n’y figure — seulement des opérateurs.',
          // #2442.17 — catégorie « audit » : cette règle EXISTAIT déjà, elle est CLASSÉE, pas redéclarée (GA-26).
          observabilityCategory: 'audit',
        },
        {
          key: 'message_bodies',
          label: 'Corps des messages du journal d’activité',
          days: envDays('RETENTION_DAYS_MESSAGE_BODIES', 1095),
          rationale:
            'Le corps intégral des e-mails/appels (arbitrage 16/08) sert le contexte de relance et la ' +
            'portabilité de l’historique. Passé la fenêtre, la finalité s’éteint (art. 5-1-e) : le CONTENU ' +
            'personnel est effacé, la métadonnée non nominative (canal, date, compte) reste. Fenêtre généreuse ' +
            'par défaut (3 ans) car ce sont des données ACTIVEMENT lues, contrairement aux résumés archivés.',
        },
        {
          // #2899 — décision Louis 11/10/2026. NON réglable par variable : la borne fait partie de la décision.
          key: 'chat_eval_samples',
          label: 'Échantillons anonymisés de conversations de Laura (évals)',
          days: CHAT_EVAL_SAMPLES_RETENTION_DAYS,
          rationale:
            'Tours de Laura versés aux évals par un espace qui a coché l’échantillonnage (#2899) : texte ' +
            'anonymisé avant stockage, corps de message jamais. Passé 90 jours, la finalité s’éteint ' +
            '(art. 5-1-e) ; décocher le réglage les efface aussitôt.',
        },
        {
          // #1949.23 — décision Louis 13/09 batch 12. NON réglable par variable :
          // la borne fait partie de la décision, pas de l'exploitation.
          key: 'laura_unrouted_intents',
          label: 'Demandes non comprises par Laura (trace anonyme)',
          days: LAURA_UNROUTED_INTENTS_RETENTION_DAYS,
          rationale:
            'Trace anonyme des demandes que Laura n’a pas su router (#1949.23) : texte masqué et tronqué, ' +
            'sans utilisateur ni espace. Elle sert à voir ce qui manque au produit ; passé 90 jours, la ' +
            'finalité s’éteint (art. 5-1-e). Relecture juridique toujours due.',
          // Pas de `observabilityCategory` ici : cette trace est un diagnostic
          // produit (#1949.23), pas une trace Langfuse au sens de #2442.17 —
          // `observability_traces` ci-dessous porte cette catégorie-là, une
          // seule fois (GA-26).
        },
        {
          // #2442.17 — catégorie « métriques ». Politique publiée, purge non
          // automatisée depuis ce service (même statut que `credit_ledger` /
          // `invoices` ci-dessous) : `ProductEventEntity` n'a pas encore de
          // balayage propre, et il ne s'invente pas ici.
          key: 'product_analytics_events',
          label: 'Métriques produit (événements agrégés par écran/parcours)',
          days: envDays('RETENTION_DAYS_PRODUCT_METRICS', 400),
          rationale:
            'Événements produits par `product-analytics.service.ts` : jamais de contenu, jamais un identifiant ' +
            'de personne (hash de session tourné à 24 h au plus — GA-240/241). Passé treize mois, un cycle ' +
            'annuel complet est déjà couvert et la finalité d’usage s’éteint (art. 5-1-e).',
          observabilityCategory: 'metriques',
        },
        {
          // #2442.17 — catégorie « logs ». Le contenu qui atteint un transport
          // est DÉJÀ caviardé par `observability-privacy.ts` (le puits tenu par
          // `createLogger`) : cette fenêtre borne la durée de conservation de
          // cette forme déjà nettoyée, pas un accès à du brut.
          key: 'application_logs',
          label: 'Journaux applicatifs (console/transport de production)',
          days: envDays('RETENTION_DAYS_APPLICATION_LOGS', 30),
          rationale:
            'Appliquée par la plateforme d’hébergement (Railway), pas par un balayage de ce service — même ' +
            'statut que « Factures » ci-dessous, stockées chez Stripe. Cette valeur documente la fenêtre ' +
            'RECOMMANDÉE : 30 jours couvrent une investigation d’incident sans faire des journaux un second ' +
            'entrepôt de données.',
          observabilityCategory: 'logs',
        },
        {
          // #2442.17 — catégorie « traces ». Les traces Langfuse (chat_turn,
          // analysis_run — `langfuse_client.py`) sont hébergées CHEZ Langfuse :
          // la fenêtre réelle se règle côté fournisseur (LANGFUSE_HOST), pas ici.
          key: 'observability_traces',
          label: 'Traces d’observabilité LLM (Langfuse)',
          days: envDays('RETENTION_DAYS_OBSERVABILITY_TRACES', 90),
          rationale:
            'Hébergées chez Langfuse (sous-traitant), pas dans notre base — même statut que les journaux ' +
            'applicatifs. Cette valeur documente la fenêtre attendue côté fournisseur, pour qu’un opérateur ' +
            'voie les six catégories sur une seule politique plutôt que d’ouvrir un second tableau de bord.',
          observabilityCategory: 'traces',
        },
        {
          // #2442.17 — catégorie « support ». Chaque fenêtre `SUPPORT_RAW_CAPTURE_WINDOWS`
          // porte DÉJÀ sa propre échéance (`observability-privacy.ts:parseRawCaptureWindows`)
          // et s’auto-referme : ce n’est pas un balayage de plus, c’est le
          // plafond RECOMMANDÉ pour la durée d’une fenêtre elle-même.
          key: 'support_raw_capture_windows',
          label: 'Fenêtres de capture brute support (consentement, échéance courte)',
          days: envDays('RETENTION_DAYS_SUPPORT_RAW_CAPTURE_WINDOWS', 7),
          rationale:
            'Une fenêtre ouverte par `SUPPORT_RAW_CAPTURE_WINDOWS` porte sa propre échéance et son audit ' +
            '(#2442.9 / #2442.19) : elle s’auto-referme, elle n’a pas besoin d’un second balayage. Cette valeur ' +
            'documente le plafond recommandé — sept jours, la durée d’un ticket support — pas encore imposé en code.',
          observabilityCategory: 'support',
        },
        // ⚠️ #1939 — CONSTAT (13/09/2026), question REPORTÉE par Louis, pas de
        // changement de durée ici : `chat_messages` (les échanges avec Laura)
        // n'a AUCUNE règle dans cette politique, contrairement au corps des
        // activités ci-dessus (`message_bodies`). Rien ne purge ni ne scrube
        // automatiquement un vieux fil encore actif — seule
        // `PrivacyDeletionService.anonymizeChatMessages` y touche, et
        // seulement à la SUPPRESSION D'UN COMPTE (retire l'auteur, jamais le
        // contenu). Aucune fenêtre n'est décidée : ne pas en inventer une ici.
        {
          // #2297.51 — décision Louis 19/09/2026. NON réglable par variable :
          // la borne (3 ans, référence CNIL) fait partie de la décision.
          key: 'enriched_contact_details',
          label: 'Coordonnées enrichies d’un contact (e-mail, téléphone)',
          days: ENRICHED_CONTACT_RETENTION_DAYS,
          rationale:
            'Coordonnées apportées par l’enrichissement (fournisseur, pas saisie de l’espace). Trois ans après ' +
            'le dernier contact ou la dernière activité tracée, elles sont archivées : plus affichées ni ' +
            'exportées, jamais supprimées (un fait périmé redevient inconnu). Seule une demande d’effacement ' +
            'RGPD les supprime réellement.',
        },
        {
          key: 'anonymized_records',
          label: 'Enregistrements anonymisés (compte supprimé)',
          days: envDays('RETENTION_DAYS_ANONYMIZED', 30),
          rationale: 'Tombstone technique post-effacement ; purge dure possible passé ce délai.',
        },
        {
          key: 'inactive_account',
          label: 'Compte inactif',
          days: envDays('RETENTION_DAYS_INACTIVE_ACCOUNT', 1095),
          rationale: 'Minimisation — un compte sans connexion depuis 3 ans est candidat à la clôture.',
        },
        {
          key: 'credit_ledger',
          label: 'Journal des crédits',
          days: envDays('RETENTION_DAYS_LEDGER', 3650),
          rationale: 'Audit facturation pseudonymisé — conservation alignée sur les obligations comptables.',
        },
        {
          key: 'invoices',
          label: 'Factures',
          days: envDays('RETENTION_DAYS_INVOICES', 3650),
          rationale: 'Obligation légale/fiscale (~10 ans) — stockées chez Stripe, jamais purgées ici.',
        },
      ],
    }
  }

  /**
   * La fenêtre d'une règle, LUE DANS LA POLITIQUE ci-dessus.
   *
   * Un balayage ne relit JAMAIS `process.env` pour son propre délai : ce serait
   * une seconde lecture du même réglage, et deux lectures d'un même réglage
   * finissent par diverger — la politique publiée par `GET /privacy/retention`
   * annoncerait 90 jours pendant que le balayage en appliquerait 30 (GA-26).
   *
   * Rend `null` si la règle n'existe plus : on ne devine pas une fenêtre
   * d'effacement, on s'arrête.
   */
  private windowDays(key: string): number | null {
    return this.getRetentionPolicy().rules.find(rule => rule.key === key)?.days ?? null
  }

  /**
   * Purge device rows revoked longer ago than the retention window. ON by
   * default; a no-op only under the `RETENTION_SWEEP_DISABLED=true`
   * kill-switch. Returns rows deleted.
   */
  async sweepRevokedSessions(now: Date = new Date()): Promise<number> {
    if (!sweepArmed()) return 0
    const days = this.windowDays('revoked_sessions')
    if (days === null) return 0
    const cutoff = new Date(now.getTime() - days * MS_PER_DAY)
    // `revoked_at < cutoff` already excludes NULL (active) rows — a SQL NULL
    // comparison is never true — so no explicit IS NOT NULL guard is needed.
    const res = await this.sessions.delete({ revoked_at: LessThan(cutoff) })
    const deleted = res.affected ?? 0
    if (deleted > 0) this.logger.log(`Retention sweep: purged ${deleted} revoked session(s) older than ${days}d`)
    return deleted
  }

  /**
   * Efface les dossiers de CANDIDATURE échus, espace par espace.
   *
   * Ne tourne que sur les espaces qui ont ARMÉ la purge — le défaut est
   * désarmé, parce qu'un effacement irréversible déclenché par surprise
   * détruirait un vivier constitué. Chaque espace est traité dans son propre
   * `try` : une base incohérente sur un espace ne doit pas empêcher les autres
   * de respecter leur propre politique.
   */
  async sweepExpiredCandidates(now: Date = new Date()): Promise<number> {
    if (!sweepArmed()) return 0
    if (!this.talents) return 0

    const workspaces = await this.sessions.manager.query<{ id: string }[]>(
      `SELECT id FROM workspaces WHERE talent_retention_enabled = true`,
    )
    let purged = 0
    for (const workspace of workspaces) {
      try {
        purged += await this.talents.purgeExpiredCandidates(workspace.id, now)
      } catch (error) {
        this.logger.error('Talent retention sweep failed for a workspace', {
          error,
          tags: { 'privacy.op': 'talent_retention', 'workspace.id': workspace.id },
        })
      }
    }
    return purged
  }

  /**
   * Efface les résumés de conversation ARCHIVÉS passé leur fenêtre.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * POURQUOI CETTE TABLE, ET POURQUOI ELLE SEULE
   * ─────────────────────────────────────────────────────────────────────────
   * `conversation_summaries.summary` n'est pas une donnée dérivée anodine : ce
   * sont DEUX extraits de 200 caractères par échange, le texte que la personne
   * a tapé et celui que Laura a répondu, tronqués sans reformulation. Des mots
   * de personnes identifiables, donc.
   *
   * `1790700047318-ConversationSummaryPerMember` a estampillé `superseded_at`
   * sur toutes les lignes écrites sous l'ancienne portée d'espace, parce
   * qu'elles mélangent les mots de plusieurs membres (D65). Depuis, **rien ne
   * les lit** — `memory.service.ts` filtre `superseded_at IS NULL` sur ses deux
   * lectures ET sur son unique effacement, si bien qu'une ligne archivée n'est
   * même plus atteignable par le geste « oublier cette conversation ». Elles ne
   * nourrissent donc plus aucune finalité, et l'art. 5-1-e ne laisse pas
   * conserver sans finalité.
   *
   * « On archive, on ne supprime pas » et le droit à l'effacement ne se
   * contredisent pas ici : la doctrine protège un FAIT MÉTIER périmé, qui doit
   * redevenir inconnu avec sa date plutôt que disparaître. Un extrait de
   * conversation n'est pas un fait métier — c'est une donnée personnelle sans
   * lecteur.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * CE QUI REND LA REQUÊTE SÛRE
   * ─────────────────────────────────────────────────────────────────────────
   * La seule frontière qui compte est `superseded_at IS NOT NULL` : une ligne
   * VIVANTE ne peut pas entrer dans l'ensemble. Elle est écrite EN TOUTES
   * LETTRES même si `superseded_at < $1` l'impliquerait déjà (une comparaison
   * SQL sur NULL n'est jamais vraie) — une portée d'effacement ne s'hérite pas
   * d'une subtilité du langage, elle se lit.
   *
   * Il n'y a volontairement PAS de filtre par propriétaire : c'est un balayage
   * de rétention, comme celui des sessions révoquées. Sa portée est temporelle
   * et archivistique, pas personnelle — et c'est précisément parce qu'aucun
   * propriétaire ne peut plus en revendiquer une qu'elles doivent partir.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * CE QU'ELLE REND
   * ─────────────────────────────────────────────────────────────────────────
   * Le nombre de lignes effacées, ou **`null` quand elle n'a pas mesuré** —
   * gelée par le kill-switch, en échec, ou rendue par le pilote sous une forme
   * qu'on ne sait pas compter. « 0 » dirait « la table était propre », ce qui
   * est une tout autre phrase.
   *
   * Rien du CONTENU ne sort : ni ici, ni dans le journal, qui ne porte que des
   * comptes. Les identifiants effacés ne sont pas journalisés non plus.
   */
  async sweepBackofficeAccessJournal(now: Date = new Date()): Promise<number | null> {
    if (!sweepArmed()) return null
    if (!this.accessJournal) return null

    const days = this.windowDays('backoffice_access')
    if (days === null) {
      // ⚠️ `null`, jamais `0`. « Aucune fenêtre déclarée » et « la table était
      // déjà propre » sont deux phrases différentes, et confondre les deux
      // ferait dire à un tableau de bord que la purge a tourné.
      this.logger.error('Purge du journal d’accès : aucune fenêtre déclarée, rien n’est effacé', {
        tags: { 'privacy.op': 'backoffice_access_retention' },
      })
      return null
    }

    try {
      const cutoff = new Date(now.getTime() - days * MS_PER_DAY)
      const deleted = await this.accessJournal.purgeOlderThan(cutoff)
      if (deleted > 0) {
        this.logger.log(`Retention sweep: purged ${deleted} backoffice access event(s) older than ${days}d`)
      }
      return deleted
    } catch (error) {
      this.logger.error('Purge du journal d’accès en échec — la table est intacte', {
        error,
        tags: { 'privacy.op': 'backoffice_access_retention' },
      })
      return null
    }
  }

  async sweepArchivedConversationSummaries(now: Date = new Date()): Promise<number | null> {
    if (!sweepArmed()) return null

    const days = this.windowDays('archived_conversation_summaries')
    if (days === null) {
      this.logger.error('Purge des résumés archivés : aucune fenêtre déclarée, rien n’est effacé', {
        tags: { 'privacy.op': 'archived_summaries_retention' },
      })
      return null
    }
    const cutoff = new Date(now.getTime() - days * MS_PER_DAY)

    try {
      // `RETURNING id` sert à COMPTER.
      //
      // ⚠️ TypeORM rend `[lignes, nombre]` pour un DELETE et `lignes` pour un
      // SELECT : lire `.length` sur le résultat brut donnerait **2** dès qu'une
      // ligne part — la longueur du COUPLE, pas le nombre de lignes. D'où
      // `returnedCount` (voir `database/returned-rows.ts`), qui reconnaît les
      // deux formes. Le contrôle `Array.isArray` reste AVANT, parce que
      // `returnedCount` rend 0 sur une réponse illisible, et « je n'ai pas pu
      // lire » n'est pas « il n'y avait rien ».
      const raw = await this.sessions.manager.query(
        `DELETE FROM conversation_summaries
           WHERE id IN (
             SELECT id
               FROM conversation_summaries
              WHERE superseded_at IS NOT NULL
                AND superseded_at < $1
              ORDER BY superseded_at
              LIMIT $2
           )
         RETURNING id`,
        [cutoff.toISOString(), ARCHIVED_SUMMARIES_BATCH],
      )

      if (!Array.isArray(raw)) {
        this.logger.error('Purge des résumés archivés : résultat illisible, comptage impossible', {
          tags: { 'privacy.op': 'archived_summaries_retention' },
        })
        return null
      }

      const purged = returnedCount(raw)
      // Écrit même à zéro : un silence ne doit pas se lire comme une panne.
      this.logger.log(
        `Purge des résumés archivés : ${purged} ligne(s) effacée(s), archivées depuis plus de ${days} j` +
          (purged === ARCHIVED_SUMMARIES_BATCH ? ' (lot plein — le reste au prochain passage)' : ''),
      )
      return purged
    } catch (error) {
      this.logger.error('Purge des résumés archivés en échec — la table est intacte', {
        error,
        tags: { 'privacy.op': 'archived_summaries_retention' },
      })
      return null
    }
  }

  /**
   * Efface le CONTENU personnel des activités passé leur fenêtre (finding #7).
   *
   * Contrairement aux résumés archivés (que plus rien ne lit), le corps des
   * messages est ACTIVEMENT lu — historique de boîte, contexte de relance. On ne
   * supprime donc pas la ligne : on scrube `body`/`subject` des activités dont
   * l'événement est plus vieux que la fenêtre, et SEULEMENT celles qui portent
   * encore un corps (`body IS NOT NULL`) pour ne pas re-balayer sans fin. La
   * métadonnée non nominative (canal, direction, date, compte) reste : « on
   * archive, on ne supprime pas » — le fait de l'échange survit, son contenu part.
   *
   * Rend le nombre de lignes scrubées, ou `null` si non mesuré (kill-switch,
   * fenêtre non déclarée, échec, forme illisible) — jamais `0` pour « rien fait ».
   */
  async sweepActivityBodies(now: Date = new Date()): Promise<number | null> {
    if (!sweepArmed()) return null

    const days = this.windowDays('message_bodies')
    if (days === null) {
      this.logger.error('Scrub des corps de messages : aucune fenêtre déclarée, rien n’est effacé', {
        tags: { 'privacy.op': 'message_bodies_retention' },
      })
      return null
    }
    const cutoff = new Date(now.getTime() - days * MS_PER_DAY)

    try {
      const raw = await this.sessions.manager.query(
        `UPDATE activities
            SET body = NULL, subject = NULL, body_truncated = false
          WHERE id IN (
            SELECT id
              FROM activities
             WHERE body IS NOT NULL
               AND occurred_at < $1
             ORDER BY occurred_at
             LIMIT $2
          )
        RETURNING id`,
        [cutoff.toISOString(), ACTIVITY_BODIES_BATCH],
      )

      if (!Array.isArray(raw)) {
        this.logger.error('Scrub des corps de messages : résultat illisible, comptage impossible', {
          tags: { 'privacy.op': 'message_bodies_retention' },
        })
        return null
      }

      const scrubbed = returnedCount(raw)
      this.logger.log(
        `Scrub des corps de messages : ${scrubbed} activité(s) effacée(s), plus vieilles que ${days} j` +
          (scrubbed === ACTIVITY_BODIES_BATCH ? ' (lot plein — le reste au prochain passage)' : ''),
      )
      return scrubbed
    } catch (error) {
      this.logger.error('Scrub des corps de messages en échec — les lignes sont intactes', {
        error,
        tags: { 'privacy.op': 'message_bodies_retention' },
      })
      return null
    }
  }

  /**
   * #1949.23 — efface la trace anonyme des demandes non comprises passé
   * {@link LAURA_UNROUTED_INTENTS_RETENTION_DAYS} jours.
   *
   * Aucun filtre par propriétaire : la table n'en a pas (ni utilisateur, ni
   * espace), c'est ce qui la rend anonyme. La portée est TEMPORELLE seulement,
   * écrite dans la requête et bornée par lot. Sous l'interrupteur de TOUT le
   * balayage (`RETENTION_SWEEP_DISABLED`) — et JAMAIS sous celui de l'écriture
   * (`LAURA_UNROUTED_INTENTS_DISABLED`) : couper la trace ne gèle pas son
   * effacement.
   *
   * Rend le nombre de lignes effacées, ou `null` quand rien n'a été mesuré —
   * jamais « 0 » pour « rien fait ». Rien du texte ne sort dans le journal.
   */
  async sweepLauraUnroutedIntents(now: Date = new Date()): Promise<number | null> {
    if (!sweepArmed()) return null

    const days = this.windowDays('laura_unrouted_intents')
    if (days === null) {
      this.logger.error('Purge des demandes non comprises : aucune fenêtre déclarée, rien n’est effacé', {
        tags: { 'privacy.op': 'laura_unrouted_intents_retention' },
      })
      return null
    }
    // Un JOUR, comme la colonne : `occurred_on < $1` garde le jour de la borne.
    const cutoff = new Date(now.getTime() - days * MS_PER_DAY).toISOString().slice(0, 10)

    try {
      const raw = await this.sessions.manager.query(
        `DELETE FROM laura_unrouted_intents
           WHERE id IN (
             SELECT id
               FROM laura_unrouted_intents
              WHERE occurred_on < $1
              ORDER BY occurred_on
              LIMIT $2
           )
         RETURNING id`,
        [cutoff, LAURA_UNROUTED_INTENTS_BATCH],
      )

      if (!Array.isArray(raw)) {
        this.logger.error('Purge des demandes non comprises : résultat illisible, comptage impossible', {
          tags: { 'privacy.op': 'laura_unrouted_intents_retention' },
        })
        return null
      }

      const purged = returnedCount(raw)
      this.logger.log(
        `Purge des demandes non comprises : ${purged} trace(s) effacée(s), plus vieilles que ${days} j` +
          (purged === LAURA_UNROUTED_INTENTS_BATCH ? ' (lot plein — le reste au prochain passage)' : ''),
      )
      return purged
    } catch (error) {
      this.logger.error('Purge des demandes non comprises en échec — la table est intacte', {
        error,
        tags: { 'privacy.op': 'laura_unrouted_intents_retention' },
      })
      return null
    }
  }

  /**
   * #2899 — efface les échantillons anonymisés d'évals passé {@link CHAT_EVAL_SAMPLES_RETENTION_DAYS} jours.
   * Sous l'interrupteur de TOUT le balayage. Rend le nombre de lignes effacées, ou `null` quand rien n'a
   * été mesuré — jamais « 0 » pour « rien fait ». Rien du texte ne sort dans le journal.
   */
  async sweepChatEvalSamples(now: Date = new Date()): Promise<number | null> {
    if (!sweepArmed()) return null

    const days = this.windowDays('chat_eval_samples')
    if (days === null) return null
    const cutoff = new Date(now.getTime() - days * MS_PER_DAY).toISOString()

    try {
      const raw = await this.sessions.manager.query(
        `DELETE FROM chat_eval_samples
           WHERE id IN (
             SELECT id FROM chat_eval_samples WHERE sampled_at < $1 ORDER BY sampled_at LIMIT $2
           )
         RETURNING id`,
        [cutoff, CHAT_EVAL_SAMPLES_BATCH],
      )
      if (!Array.isArray(raw)) return null
      const purged = returnedCount(raw)
      this.logger.log(`Purge des échantillons d’évals : ${purged} ligne(s) effacée(s), plus vieilles que ${days} j`)
      return purged
    } catch (error) {
      this.logger.error('Purge des échantillons d’évals en échec — la table est intacte', {
        error,
        tags: { 'privacy.op': 'chat_eval_samples_retention' },
      })
      return null
    }
  }

  /**
   * #2297.51 — ARCHIVE les coordonnées enrichies d'un contact
   * {@link ENRICHED_CONTACT_RETENTION_DAYS} jours (trois ans, référence CNIL)
   * après son dernier contact ou sa dernière activité tracée.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * POURQUOI UN BALAYAGE PLANIFIÉ, ET PAS UN CALCUL À LA LECTURE
   * ─────────────────────────────────────────────────────────────────────────
   * Une coordonnée se LIT par une dizaine de chemins : la fiche, les listes, le
   * chemin recommandé, l'export CSV, l'envoi d'un e-mail, la synchronisation
   * CRM, Laura. Un masque à la lecture devrait être posé sur chacun, et le
   * premier chemin oublié ré-exposerait la valeur. Déplacer la valeur dans une
   * archive que rien ne sélectionne (`select: false` sur l'entité) couvre tous
   * les chemins PAR CONSTRUCTION — la voie déjà prise pour le corps des
   * messages ({@link sweepActivityBodies}).
   *
   * CE QUI EST ARCHIVÉ — l'e-mail et le téléphone SEULEMENT s'ils viennent de
   * l'enrichissement (jamais une saisie de l'espace), leur provenance
   * (vérification, confiance, coût : elle décrit une valeur qui n'est plus lue)
   * et les coordonnées secondaires du profil fournisseur (`phone_numbers`,
   * `personal_emails`). La colonne lue redevient NULL — inconnue, pas « 0 » —
   * et `enrichment_archived_at` date le geste pour que l'écran le DISE.
   *
   * « DERNIER CONTACT / ACTIVITÉ » — des faits tracés : création, dernier
   * enrichissement, dernier envoi, dernière activité, dernière action du
   * commercial sur la fiche. Jamais `updated_at`, qu'un recalcul technique
   * remet à neuf sans que personne ait touché la personne.
   *
   * Rend le nombre de fiches archivées, ou `null` si non mesuré (kill-switch,
   * fenêtre non déclarée, échec, forme illisible) — jamais `0` pour « rien
   * fait ». Aucune coordonnée ni identifiant ne sort dans le journal.
   */
  async sweepStaleEnrichedContacts(now: Date = new Date()): Promise<number | null> {
    if (!sweepArmed()) return null

    const days = this.windowDays('enriched_contact_details')
    if (days === null) {
      this.logger.error('Archivage des coordonnées enrichies : aucune fenêtre déclarée, rien n’est archivé', {
        tags: { 'privacy.op': 'enriched_contact_retention' },
      })
      return null
    }
    const cutoff = new Date(now.getTime() - days * MS_PER_DAY)

    try {
      const raw = await this.sessions.manager.query(ARCHIVE_STALE_ENRICHED_CONTACTS_SQL, [
        cutoff.toISOString(),
        STALE_ENRICHED_CONTACTS_BATCH,
        now.toISOString(),
      ])
      if (!Array.isArray(raw)) {
        this.logger.error('Archivage des coordonnées enrichies : résultat illisible, comptage impossible', {
          tags: { 'privacy.op': 'enriched_contact_retention' },
        })
        return null
      }
      const archived = returnedCount(raw)
      this.logger.log(
        `Archivage des coordonnées enrichies : ${archived} fiche(s), sans activité depuis ${days} j` +
          (archived === STALE_ENRICHED_CONTACTS_BATCH ? ' (lot plein — le reste au prochain passage)' : ''),
      )
      return archived
    } catch (error) {
      this.logger.error('Archivage des coordonnées enrichies en échec — les fiches sont intactes', {
        error,
        tags: { 'privacy.op': 'enriched_contact_retention' },
      })
      return null
    }
  }

  /** Daily retention sweep at 04:17 (offset from the other crons). Guarded so a
   *  failure is logged, never thrown. Inert only under RETENTION_SWEEP_DISABLED. */
  @Cron('17 4 * * *', { name: 'privacy-retention-sweep' })
  @Correlated('cron:privacy-retention.retentionSweepCron')
  async retentionSweepCron(): Promise<void> {
    try {
      await withSingletonLock(this.locks, 'privacy-retention-sweep', async () => {
        await this.sweepRevokedSessions()
        await this.sweepExpiredCandidates()
        // Branché sur CE passage, et pas sur un planificateur à lui : le dépôt
        // porte déjà 23 déclencheurs, et un balayage de rétention de plus
        // n'aurait rien apporté qu'une heure supplémentaire à surveiller.
        await this.sweepArchivedConversationSummaries()
        await this.sweepBackofficeAccessJournal()
        await this.sweepActivityBodies()
        // #1949.23 — la trace anonyme des demandes non comprises, 90 jours.
        await this.sweepLauraUnroutedIntents()
        // #2899 — les échantillons anonymisés d'évals, 90 jours.
        await this.sweepChatEvalSamples()
        // #2297.51 — les coordonnées enrichies échues (3 ans), archivées.
        await this.sweepStaleEnrichedContacts()
      })
    } catch (error) {
      this.logger.error('Retention sweep failed', { error, tags: { 'privacy.op': 'retention_sweep' } })
    }
  }
}
