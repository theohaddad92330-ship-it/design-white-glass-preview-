import type { Account } from '@bellum/contracts'
import { accountDisplayVerdict, namedAccountVerdict } from '@bellum/contracts'
import { LauraFace, Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { useHasOfferObjective } from '@/features/profile/hooks/useEsnProfile'
import { useAccountOverviewData } from '../tabs/useAccountOverviewData'
import { BADGE_COLORS } from '../tabs/sections/BadgeColorScore'
import { AccountGateStateChip } from './AccountGateStateChip'
import { DiscoverOriginLine } from './DiscoverOriginLine'

type AccountVerdictSummaryProps = {
  account: Account
}

/**
 * #2118.48 — LE VERDICT VISIBLE SANS DÉFILER.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA MESURE DU 18/09/2026
 * ─────────────────────────────────────────────────────────────────────────
 * Recette écran en production (ATOS FRANCE, `/accounts/<id>`, onglet Vue
 * d'ensemble, fenêtre 896 px de haut) : au chargement, on voit le nom du
 * compte, deux badges de statut génériques (« En observation », « Analyse :
 * Terminé »), les boutons d'action, et une ligne « Prochaine action »
 * tronquée — AUCUN chiffre ni étiquette ne résume le verdict. Il fallait
 * ~5 crans de défilement (~600-700 px) pour atteindre le score chiffré et
 * la phrase de verdict, portés par `BellumReadCard`, tout en bas de la pile
 * En-tête → Bannières de statut → Ligne de contexte → Barre d'onglets →
 * contenu de l'onglet Synthèse.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUI RESTE DEVANT, ET POURQUOI (pesé, pas réflexe)
 * ─────────────────────────────────────────────────────────────────────────
 * Le nom du compte et les boutons d'action du hero (`AccountDetailHero`)
 * restent EN PREMIER : Q-1816 (renversée le 14/09/2026, #2117) les a fait
 * remonter délibérément — Brief / Aperçu PDF / Partager / Exporter sont des
 * LIVRABLES du dossier, la porte de priorisation et l'action principale sont
 * LE geste qui commande tous les autres. Rejouer cet arbitrage n'est pas le
 * sujet de ce point.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUI BOUGE
 * ─────────────────────────────────────────────────────────────────────────
 * Ce bandeau REND, il ne DÉPLACE PAS `BellumReadCard` : la carte complète
 * (justification, fiabilité du dossier, axes, bouton « Voir plus ») reste à
 * sa place dans la Synthèse, en position 1 de la séquence de lecture
 * (#2115.7-13, gardée par `TabOverview.readingOrder.test.tsx` — ni cette
 * carte ni son ordre ne changent ici). Ce résumé compact est un ÉCHO,
 * au-dessus de la ligne de flottaison, de la MÊME lecture
 * (`useAccountOverviewData`, GA-26 — un second calcul du verdict n'existe
 * pas) : score, badge, et la phrase.
 *
 * Rendu à l'échelle du DOSSIER (`AccountDetail`), pas de l'onglet Synthèse :
 * `resolveArrivalTab` (#1817) peut atterrir sur Organigramme plutôt que sur
 * Synthèse quand le compte porte un graphe — sans ce bandeau, le verdict
 * resterait invisible tant qu'on n'a pas cliqué sur l'onglet Vue d'ensemble,
 * pas seulement « sous la ligne de flottaison ».
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DOCTRINE
 * ─────────────────────────────────────────────────────────────────────────
 * « Un score n'est jamais nu » : le compactage n'efface pas la décomposition
 * en axes, il la rend ACCESSIBLE plus bas (la carte complète n'a pas bougé).
 * Sur une analyse d'avant la lecture en sept axes, le même bandeau que
 * `BellumReadCard` (`dossierRead.noAxisBreakdownHint`) reste posé À CÔTÉ du
 * score compact — jamais un score compact seul qui tairait l'absence de
 * décomposition.
 *
 * Muet tant qu'aucune phrase de verdict n'existe (dossier jamais analysé) —
 * même garde que `BellumReadCard` (`if (!headline) return null`).
 */
export function AccountVerdictSummary({ account }: AccountVerdictSummaryProps) {
  const { t, i18n } = useTranslation('accountDetail')
  const overview = useAccountOverviewData(account)
  // #3818 — un STOP sans déclencheur ne dit « ÉCARTER POUR CET OBJECTIF » que
  // si l'espace a réellement renseigné un domaine d'offre à juger. Appelé
  // avant tout retour anticipé (règle des hooks).
  const hasObjective = useHasOfferObjective()
  const headline = overview.bellumRead.blocks?.verdictLine ?? overview.bellumRead.title

  if (!headline) return null

  // #2932 — la FAMILLE (GO/PRUDENT/NO-GO/EXPLORER) pilote toujours la couleur
  // (BADGE_COLORS), mais le TEXTE affiché est le verdict NOMMÉ (épopée #2932) :
  // named_verdict() côté IA n'était branché que sur le chat, jamais sur cet
  // écran — le badge repliait donc encore STOP sur l'ancien libellé « NO-GO ».
  const verdictFamily = accountDisplayVerdict(account.priority_score, overview.storedVerdict)
  const hasNoGoTrigger = overview.dossierRead?.noGo?.trigger != null
  // LUDB.7 — ce qui ferait changer d'avis : le déclencheur déjà écrit au dossier.
  const reopenTrigger = overview.dossierRead?.noGo?.trigger ?? null
  const badge = verdictFamily ? namedAccountVerdict(verdictFamily, hasNoGoTrigger, { hasObjective }) : null
  const badgeClassName = verdictFamily ? BADGE_COLORS[verdictFamily].badge : null
  // #3914 — le pont Découvrir ↔ analyse, seulement quand l'analyse contredit la remontée.
  const discoverBridge =
    badge === 'METTRE EN VEILLE' && account.origin === 'discover' && Boolean(account.discover_origin_reason)

  // #3499 — « CE QU'IL FAUT RETENIR » : la synthèse en une à deux phrases
  // lisibles, en langage commercial. Le SCORE n'est plus ici (décision 3 :
  // sous un score, les axes non évaluables restent nommés — il vit donc avec
  // ses axes dans « Sources et confiance », replié). Le verdict garde son nom
  // MÉTIER (#2932) et se traduit en une phrase d'action.
  const takeaway = verdictFamily ? t(`synthesis.takeaway.${verdictFamily}`) : null

  // #3524 (Louis 01/10) — revient sur la retraite du score (#3499) : « affiche
  // aussi le score et pourquoi faut y aller, catchy, sur des faits ». Le score
  // revient À CÔTÉ du verdict ; il n'est jamais nu (les axes non évalués sont
  // nommés dessous, comme dans `DossierReadBlocks`) et jamais « 0 » quand il
  // est absent. « Pourquoi » = les preuves déjà écrites au dossier
  // (`bellum_read.why`, 3 max) — aucune phrase générée ici.
  const score = typeof account.priority_score === 'number' ? account.priority_score : null
  // D10 (Louis 05/10) — palier posé par la démo, non arbitré : « 5/10 · non arbitré ».
  const scoreUnarbitrated =
    score !== null &&
    typeof account.raw_analysis === 'object' &&
    account.raw_analysis !== null &&
    (account.raw_analysis as Record<string, unknown>).score_unarbitrated === true
  const facts = (overview.bellumRead.blocks?.why ?? []).filter(fact => fact.trim() !== '').slice(0, 3)
  const dominantSignal = account.signal_preview?.label?.trim() ? account.signal_preview : null
  const unknownAxes = overview.dossierRead?.score.unknownAxes ?? []
  const unknownLabels = unknownAxes.map(key => t(`dossierRead.axis.${key}`))

  return (
    <section
      data-testid="account-verdict-summary"
      aria-labelledby="account-takeaway-title"
      className="flex min-w-0 flex-col gap-2"
    >
      {/* Refonte Théo (23/10) — « Le regard de Laura » (`.ac20-avatar-label`) : son visage, son nom, puis la
          lecture en GRAND (`.ac20-opening h2`). Aucun score en points (Louis 23/10) : le verdict s'écrit en mots,
          les axes non évalués restent nommés plus bas. */}
      <div className="flex items-center gap-2">
        <LauraFace size={26} decorative />
        <span className="text-xs font-semibold uppercase tracking-widest text-[var(--bellum-text-accent)]">
          {t('synthesis.takeaway.lauraLabel')}
        </span>
      </div>
      <div data-testid="verdict-row" className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
        <Text element="h2" id="account-takeaway-title" size="sm" weight="semibold" className="sr-only">
          {t('synthesis.takeaway.title')}
        </Text>
        {badge && badgeClassName ? (
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${badgeClassName}`}>{badge}</span>
        ) : null}
        {/* #3420.2 — l'ÉTAT de la porte, en toutes lettres : le bouton du hero n'est qu'une icône. */}
        <AccountGateStateChip account={account} />
        {/* Louis 23/10 — plus de « 15/25 » : un score arbitré ne s'affiche plus en points ; un score NON arbitré
            le dit en mots (c'est un fait sur la lecture, pas un chiffre). */}
        {scoreUnarbitrated ? (
          <span
            data-testid="verdict-score"
            className="rounded-full border border-[var(--bellum-border)] px-2.5 py-0.5 text-xs font-medium text-[var(--bellum-text-secondary)]"
          >
            {t('synthesis.takeaway.unarbitrated')}
          </span>
        ) : null}
      </div>
      <Text
        element="p"
        size="2xl"
        weight="semibold"
        leading="tight"
        data-testid="verdict-headline"
        className="tracking-tight text-[var(--bellum-text-primary)] md:text-3xl"
      >
        {headline}
      </Text>
      {takeaway ? (
        <Text element="p" size="sm" leading="relaxed" className="text-[var(--bellum-text-secondary)]">
          {takeaway}
        </Text>
      ) : null}
      {/* LUDOVIC-C LC.8 — le signal DOMINANT de la liste des comptes (même source, même choix
          par pack, `signal_preview`) fait partie du motif : un verdict qui le tairait contredirait
          la ligne de liste qui a fait ouvrir la fiche. Absent = aucune ligne. */}
      {dominantSignal ? (
        <Text data-testid="verdict-dominant-signal" size="sm" className="text-[var(--bellum-text-primary)]">
          {dominantSignal.date
            ? t('synthesis.takeaway.dominantSignalDated', {
                label: dominantSignal.label,
                date: formatSignalDate(dominantSignal.date, i18n.language),
              })
            : t('synthesis.takeaway.dominantSignal', { label: dominantSignal.label })}
        </Text>
      ) : null}
      {facts.length > 0 ? (
        <div className="mt-1 flex flex-col gap-1">
          <Text size="xs" weight="semibold" className="text-[var(--bellum-text-muted)]">
            {/* LUDB.7 — en veille, la section dit pourquoi ATTENDRE (jamais « y aller »). */}
            {badge === 'METTRE EN VEILLE' ? t('synthesis.takeaway.whyWaitTitle') : t('synthesis.takeaway.whyTitle')}
          </Text>
          <ul data-testid="verdict-why" className="flex list-disc flex-col gap-0.5 pl-4">
            {facts.map(fact => (
              <li key={fact} className="text-sm text-[var(--bellum-text-primary)]">
                {fact}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {badge === 'METTRE EN VEILLE' && reopenTrigger ? (
        <Text data-testid="verdict-reopen" size="xs" className="text-[var(--bellum-text-muted)]">
          {t('synthesis.takeaway.reopenWhen', { trigger: reopenTrigger })}
        </Text>
      ) : null}
      {/* #3524.1 — la ligne sous la pastille existe TOUJOURS quand il y a un score :
          les axes non mesurés NOMMÉS, ou — sur une analyse d'avant la lecture en
          sept axes, où `dossierRead` n'existe pas — la phrase qui dit pourquoi
          la décomposition manque (même texte que `BellumReadCard`). Un score
          n'est jamais nu. */}
      {unknownLabels.length > 0 ? (
        <Text data-testid="verdict-axes-line" size="xs" className="text-[var(--bellum-text-muted)]">
          {t('dossierRead.unknownOutOfScore', {
            count: unknownLabels.length,
            axesCount: unknownLabels.length,
            axes: unknownLabels.join(', '),
          })}
        </Text>
      ) : score !== null && !overview.dossierRead ? (
        <Text data-testid="verdict-axes-line" size="xs" className="text-[var(--bellum-text-muted)]">
          {t('dossierRead.noAxisBreakdownHint')}
        </Text>
      ) : score !== null && overview.dossierRead && overview.dossierRead.score.scoredAxes > 0 ? (
        // #3524 (recette prod Y8 02/10) — lecture en sept axes présente, rien
        // d'inconnu : la ligne manquait et le score restait nu. Il dit sur
        // combien d'axes il repose (tous évalués).
        <Text data-testid="verdict-axes-line" size="xs" className="text-[var(--bellum-text-muted)]">
          {t('dossierRead.allAxesScored', { count: overview.dossierRead.score.scoredAxes })}
        </Text>
      ) : null}
      {/* #3914 — « ce que tu me remontes et l'analyse pure et dure, ça peut
          différer » (retour bêta 08/10). Un compte venu de Découvrir, dont
          l'analyse conclut « mettre en veille », cite SUR QUOI Découvrir
          l'avait fait remonter — sans promettre que ce signal reste vrai,
          sans taire non plus qu'il a existé. Muet sur tout autre verdict :
          seul le « mettre en veille » contredit visiblement une remontée. */}
      {discoverBridge ? (
        <Text data-testid="discover-bridge-note" size="xs" className="text-[var(--bellum-text-muted)]">
          {t('synthesis.discoverBridge', { reason: account.discover_origin_reason })}
        </Text>
      ) : null}
      {/* #3819 (lot RBB) — la raison de sélection Découvrir et ses critères,
          quel que soit le verdict ; la raison n'est pas répétée si le pont
          #3914 la cite déjà juste au-dessus. */}
      <DiscoverOriginLine account={account} hideReason={discoverBridge} />
    </section>
  )
}

/** LUDOVIC-C LC.8 — date du signal dominant, au format du lecteur ; illisible = la valeur telle quelle. */
function formatSignalDate(value: string, language: string): string {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}
