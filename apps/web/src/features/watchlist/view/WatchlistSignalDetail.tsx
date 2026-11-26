import {
  buildSignalHistoryLines,
  buildSignalReasons,
  matchWatchlistRules,
  offerAttachmentView,
} from '../model/watchlist'
import { Badge, Button, Text } from '@bellum/ui'
import { AskLaura } from '@/components/primitives/AskLaura'
import { jobOfferScopeParamOf } from '@/features/chat/scope/chat-scope'
import { ArrowUpRight, CheckSquare, History, Radio, ShieldCheck, Target, TrendingUp } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { ReactNode } from 'react'
import { ScoreWithAxes } from '@/components/primitives/ScoreWithAxes'
import { readableSource } from '@/lib/source-label'
import { SignalSourceLink } from '@/components/primitives/SignalSourceLink'
import { signalSourceLabel } from '@/lib/data-source-label'
import { isHiringSignalItem, type WatchlistItem } from '../model/watchlist'
import { OfferRequesterLine } from '@/features/discover/view/OfferRequesterLine'
import type { DiscoverOfferRequester } from '@/features/discover/lib/discover-types'
import { useCreateSignalAction } from '../actions/useSignalAction'
import { useVerifySignal } from '../actions/useVerifySignal'
import { useWatchlistRules } from '../rules/useWatchlistRules'
import { formatSignalDate } from '@/lib/signal-date'

/**
 * #1797 — LE DÉTAIL D'UN SIGNAL, sans sa coquille.
 *
 * Ce bloc vivait dans un panneau collé à droite de la liste, monté en
 * permanence : à l'arrivée sur `/watchlist`, il affichait d'office le premier
 * compte — un détail que personne n'avait demandé, sur un quart de l'écran
 * qui manquait à la liste. Il est désormais rendu DANS la modale ouverte au
 * clic (`BrowsableDialog`).
 *
 * Deux choses sont donc parties d'ici, et une seule chose a changé de place :
 *
 * - **l'état vide** (« Sélectionne un compte ») n'a plus de sujet : la modale
 *   ne s'ouvre que sur un élément choisi. `item` est requis, et c'est le
 *   compilateur qui le tient plutôt qu'une branche morte ;
 * - **l'identité** (logo, nom, secteur, statut) est passée dans l'entête de la
 *   modale. L'écrire ici aussi aurait dit deux fois la même chose au même
 *   endroit — le nom serait apparu dans le titre du dialogue ET sous lui.
 *
 * Aucun GESTE n'a bougé : « en faire une action », « ouvrir le dossier » et
 * « demander quoi faire » sont toujours les trois seuls, au même endroit, dans
 * le même ordre.
 */
/** #4286.12 — un recrutement dont le serveur n'a composé aucun demandeur : « à identifier » + la méthode par défaut. */
const UNCOMPOSED_REQUESTER: DiscoverOfferRequester = {
  author: 'non_precise',
  possibleManagerFunction: null,
  team: null,
  city: null,
  status: 'a_identifier',
  method: ['lire_offre', 'chercher_fonction_operationnelle', 'demander_au_premier_interlocuteur'],
}

export function WatchlistSignalDetail({
  item,
  onOpenAccount,
}: {
  item: WatchlistItem
  onOpenAccount: (accountId: string) => void
}) {
  const { t } = useTranslation('watchlist')
  const attachment = offerAttachmentView(item.offerAttachment)
  const reasons = buildSignalReasons(item)
  const history = buildSignalHistoryLines(item)
  // #4286.12 — l'équipe demandeuse d'un signal de RECRUTEMENT : nommée quand l'offre l'établit (la fonction de
  // rattachement ET l'équipe, quand les deux sont écrites), sinon « à identifier » avec sa méthode — jamais un nom deviné.
  const requesterWho =
    item.requester?.status === 'etaye'
      ? [
          item.requester.possibleManagerFunction,
          item.requester.team ? t('detail.requesterTeam', { team: item.requester.team }) : null,
        ]
          .filter((part): part is string => Boolean(part))
          .join(' · ') || null
      : null
  const requesterToIdentify: DiscoverOfferRequester | null =
    requesterWho === null && isHiringSignalItem(item)
      ? item.requester && item.requester.status === 'a_identifier'
        ? item.requester
        : UNCOMPOSED_REQUESTER
      : null
  // Bonus §11 : les règles de veille du commercial que ce signal matche
  // (déterministe, sans IA). Vide si aucune règle ou aucun match → aucun bloc.
  const { rules } = useWatchlistRules()
  const matchedRules = matchWatchlistRules(item, rules)
  // §20 : transformer CE signal en action, et afficher celle qu'il a déclenchée.
  const createAction = useCreateSignalAction()
  // #3206.2 (partiel, épopée #3240) : « je confirme que ce signal tient
  // toujours », sans attendre une re-détection.
  const verifySignal = useVerifySignal()
  /** L'âge du signal, calculé une seule fois. `null` = date illisible. */
  const freshnessDays = signalAgeInDays(item.signalDate)
  return (
    <div className="space-y-6 p-5">
      <section>
        <div className="flex flex-wrap items-center gap-2 text-[var(--bellum-text-secondary)]">
          <Radio className="size-4" />
          <Text size="xs">{item.signalType}</Text>
          <span aria-hidden="true">·</span>
          <Text size="xs">{formatSignalDate(item.signalDate)}</Text>
          {/* #1422 — la FRAÎCHEUR, en clair. La date seule oblige à compter
                de tête pour savoir si l'information est encore exploitable.
                Calculée depuis la date du signal ; absente quand la date ne se
                lit pas — un âge deviné vaudrait moins que pas d'âge.

                ⚠️ L'âge est calculé UNE fois et rendu tel quel. Écrit
                `age ?? 0` dans l'interpolation, il aurait affiché « 0 jour »
                sur une date illisible — GA-19 l'a refusé, à raison : c'est
                exactement « non mesuré » rendu « 0 ». */}
          {freshnessDays !== null && (
            <>
              <span aria-hidden="true">·</span>
              <Text size="xs">{t('detail.freshness', { count: freshnessDays })}</Text>
            </>
          )}
          {/* Importance (V2 §20) — dérivée de règles existantes (archive +
                « un signal sans source n'est pas une preuve »). Absente quand
                rien ne permet de la calculer : aucun badge plutôt qu'un poids
                deviné. */}
          {item.importance && (
            <Badge
              variant={item.importance === 'high' ? 'success' : item.importance === 'low' ? 'outline' : 'primary'}
              className="text-xs"
              title={t(`importance.${item.importance}Why`)}
            >
              {t(`importance.${item.importance}`)}
            </Badge>
          )}
          {/* #3206.3 (épopée #3240) — le STATUT dérivé de la vérification
                humaine, distinct du FAIT « vérifié le … » plus bas dans
                l'historique : celui-ci dit QUAND, ce badge dit ce que ça
                VAUT aujourd'hui (une vérification se périme, §
                VERIFICATION_VALID_MS côté contrat). N'apparaît QUE dans cet
                état précis — jamais pour RECENT/HISTORICAL/STALE/UNDATED,
                déjà lus dans la fraîcheur et l'historique juste au-dessus. */}
          {item.temporalStatus === 'CURRENT_VERIFIED' && (
            <Badge variant="success" className="inline-flex items-center gap-1 text-xs">
              <ShieldCheck className="size-3" aria-hidden="true" />
              {t('detail.currentlyVerified')}
            </Badge>
          )}
          {/* #3206.3 (reste, épopée #3240) — SUPERSEDED : ce signal n'est plus
                rapporté par la dernière analyse (`history_status: 'resolved'`,
                signal_history) — la donnée dit elle-même qu'il a été remplacé,
                jamais devinée d'une comparaison de texte entre signaux. Gagne
                même sur CURRENT_VERIFIED côté modèle (voir
                `classifyTemporalStatus`), donc les deux ne s'affichent
                jamais ensemble. */}
          {item.temporalStatus === 'SUPERSEDED' && (
            <Badge variant="info" className="inline-flex items-center gap-1 text-xs">
              <History className="size-3" aria-hidden="true" />
              {t('detail.superseded')}
            </Badge>
          )}
        </div>
        <Text element="h3" size="lg" weight="semibold" className="mt-3 leading-snug">
          {item.displayLabel ?? item.signalLabel}
        </Text>
        {/* « Pourquoi Bellum me montre ça ? » (V2 §11) : la phrase statique ne
              disait rien. Chaque ligne cite le fait qui la produit ; aucun fait
              exploitable ⇒ on retombe sur la consigne générique. */}
        {reasons.length > 0 ? (
          <div className="mt-3 rounded-lg border border-[var(--bellum-border)] bg-[var(--bellum-bg-lighter)] p-3">
            <Text size="xs" weight="semibold" className="text-[var(--bellum-text-secondary)]">
              {t('why.title')}
            </Text>
            <ul className="mt-2 space-y-1.5">
              {reasons.map(reason => (
                <li key={reason} className="flex gap-2">
                  <span aria-hidden="true" className="text-[var(--bellum-text-secondary)]">
                    ·
                  </span>
                  <Text size="sm" className="leading-relaxed text-[var(--bellum-text-secondary)]">
                    {reason}
                  </Text>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <Text size="sm" className="mt-3 leading-relaxed text-[var(--bellum-text-secondary)]">
            {t('detail.signalHint')}
          </Text>
        )}
        {/* Bonus §11 : « correspond à votre règle : {valeur} ». Chaque tag cite
              la règle personnelle que ce signal matche — comparaison
              déterministe, jamais un rapprochement inventé. */}
        {matchedRules.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {matchedRules.map(rule => (
              <Badge key={rule.id} variant="primary" className="inline-flex items-center gap-1 text-xs">
                <Target className="size-3" aria-hidden="true" />
                {t('rules.match', { value: rule.value })}
              </Badge>
            ))}
          </div>
        )}
      </section>

      {/* Historique du signal (V2 §11) : depuis quand Bellum le voit, combien
            de fois il a bougé, quand il a été vu pour la dernière fois, et s'il
            a disparu. La date affichée à côté du type reste celle de la NOUVELLE
            — deux questions différentes que la Veille confondait. Aucun
            historique matérialisé ⇒ aucun bloc, jamais de date devinée. */}
      {history.length > 0 && (
        <section>
          <div className="flex items-center gap-2 text-[var(--bellum-text-secondary)]">
            <History className="size-4" />
            <Text size="xs" weight="semibold">
              {t('history.title')}
            </Text>
          </div>
          <ul className="mt-2 space-y-1.5">
            {history.map(line => (
              <li key={line} className="flex gap-2">
                <span aria-hidden="true" className="text-[var(--bellum-text-secondary)]">
                  ·
                </span>
                <Text size="sm" className="leading-relaxed text-[var(--bellum-text-secondary)]">
                  {line}
                </Text>
              </li>
            ))}
          </ul>
          {/* #3206.2 (partiel, épopée #3240) — « Marquer vérifié ». Reste dans
                CETTE section (jamais un quatrième geste principal, #1423) :
                c'est un fait d'historique, comme les lignes juste au-dessus.
                Un signal sans historique matérialisé n'a pas de ligne
                `signal_history` à estampiller (même garde que le serveur,
                `hasSignal`) — le bouton n'existe donc que là où il peut agir. */}
          {!item.lastVerifiedAt && (
            <Button
              variant="outline"
              size="sm"
              icon={ShieldCheck}
              className="mt-3"
              isLoading={verifySignal.isPending}
              disabled={verifySignal.isPending}
              onClick={() => verifySignal.mutate({ accountId: item.accountId, label: item.signalLabel })}
            >
              {t('history.verifyAction')}
            </Button>
          )}
        </section>
      )}

      {/* « A déclenché : … » (V2 §20) : l'action que CE signal a réellement
            produite, avec son libellé tel qu'il est dans le plan. Rien n'est
            affiché tant qu'aucune action n'a été créée depuis ce signal — jamais
            un rapprochement deviné. */}
      {item.triggeredActionLabel && (
        <section className="rounded-lg border border-[var(--bellum-border)] bg-[var(--bellum-bg-lighter)] p-3">
          <div className="flex items-center gap-2 text-[var(--bellum-text-secondary)]">
            <CheckSquare className="size-4" />
            <Text size="xs" weight="semibold">
              {t('action.triggeredTitle')}
            </Text>
          </div>
          <Text size="sm" className="mt-1.5 leading-relaxed text-[var(--bellum-text-secondary)]">
            {item.triggeredActionLabel}
          </Text>
        </section>
      )}

      <section className="grid grid-cols-1 divide-y divide-[var(--bellum-border)] sm:grid-cols-3 sm:divide-x sm:divide-y-0 rounded-lg border border-[var(--bellum-border)] bg-[var(--bellum-bg-lighter)]">
        {/* La note passe par la primitive. Le tiret qui tenait ici ne disait
              pas laquelle des deux choses était vraie — « on a regardé, il n'y
              a rien » ou « on n'a pas regardé ». La primitive dit la seconde,
              avec sa raison. */}
        <Metric
          label={t('detail.currentScore')}
          value={<ScoreWithAxes score={item.score} max={10} reason={t('score.unknownReason')} />}
        />
        {/* Même filtre que la liste. Ici la case existe toujours (c'est une
              grille à trois colonnes), donc l'absence se DIT : « source
              inconnue » est la vérité, un blanc se lirait comme un bug. */}
        <Metric
          label={t('detail.source')}
          value={
            <Text size="sm" weight="semibold" noWrap className="truncate">
              {/* #1912.11 — `readableSource` retire les jetons du modèle, il ne
                  rédige pas un fournisseur : « Pappers » passait tel quel. */}
              {signalSourceLabel(t, readableSource(item.signalSource, item.sourceUrl)) ?? t('detail.unknownSource')}
            </Text>
          }
          // #3922.3 — le lien vers la preuve, sous le nom de la source.
          footer={
            <SignalSourceLink
              url={item.sourceUrl}
              sourceKind={item.sourceKind}
              collectedBeforeLink={item.collectedBeforeLink}
            />
          }
        />
        {/* #2107.31 — l'AMPLEUR business du signal pour l'entreprise cible,
              distincte de la lecture ESN affichée plus bas (`item.salesImplication`,
              « pourquoi »). Contexte SCORE (cette grille), donc l'absence se NOMME
              (« non évalué ») plutôt que de retirer la case — la même discipline
              que `detail.source` juste au-dessus, jamais une case tue. */}
        <Metric
          label={t('detail.impact')}
          value={
            <Text size="sm" weight="semibold" className="break-words">
              {item.impact ?? t('detail.unknownImpact')}
            </Text>
          }
        />
      </section>
      {/* #4182.5 / #4286.12 — qui demande ce profil : NOMMÉ, avec ce qui le rattache (le texte de l'offre), sinon
          « Équipe demandeuse à identifier » et son lien de méthode. ⚠️ Contrat Louis 26/10 : il REMPLACE la décision du
          25/10 (« demandeur inconnu = aucune ligne ») sur le DÉTAIL d'un recrutement ; la liste, elle, n'écrit toujours
          aucune ligne d'absence. Un signal qui n'est pas un recrutement n'a aucune ligne demandeur. */}
      {requesterWho ? (
        <div data-testid="signal-requester" className="text-sm text-[var(--bellum-text-secondary)]">
          <p data-testid="need-requester">{t('detail.requester', { who: requesterWho })}</p>
          <p className="text-xs">{t('detail.requesterEvidence')}</p>
        </div>
      ) : requesterToIdentify ? (
        <div data-testid="signal-requester" className="text-sm text-[var(--bellum-text-secondary)]">
          <OfferRequesterLine requester={requesterToIdentify} />
        </div>
      ) : null}
      {/* #4437.5 — le rattachement de l'offre (compétence, famille), ou « non classé » : jamais inventé. */}
      {attachment ? (
        <p data-testid="offer-attachment" className="text-sm text-[var(--bellum-text-secondary)]">
          {attachment.unclassified
            ? t('detail.attachmentUnclassified')
            : t('detail.attachment', {
                parts: [
                  attachment.factType ? t(`detail.attachmentType.${attachment.factType}`) : null,
                  ...attachment.skills,
                  attachment.family ? t(`discover:rail.jobFamily.${attachment.family}`) : null,
                ]
                  .filter(Boolean)
                  .join(' · '),
              })}
        </p>
      ) : null}

      <section>
        <Text size="xs" weight="semibold" className="text-[var(--bellum-text-secondary)]">
          {t('detail.nextStep')}
        </Text>
        <div className="mt-3 flex items-start gap-3">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-[var(--bellum-surface-2)]">
            <TrendingUp className="size-4" />
          </div>
          <div>
            <Text size="sm" weight="medium">
              {t('detail.nextStepTitle')}
            </Text>
            {/* #1424 — la LECTURE COMMERCIALE de ce signal, écrite par
                  l'analyse. Elle était calculée, stockée, semée en démo, rendue
                  sur la fiche compte et dans le PDF — et la Veille écrivait à sa
                  place la même phrase générique sous les deux cents signaux d'un
                  espace. Le repli reste le conseil générique : l'analyse peut
                  n'avoir rien dit, et on n'invente pas sa lecture. */}
            <Text
              size="xs"
              className="mt-1 text-[var(--bellum-text-secondary)]"
              data-testid="watchlist-sales-implication"
            >
              {item.salesImplication ?? t('detail.nextStepDescription')}
            </Text>
          </div>
        </div>
      </section>

      <div className="grid gap-2">
        {/* Transformer CE signal en action du plan (V2 §20). C'est ce clic —
              et lui seul — qui crée le lien signal → action : il n'est jamais
              inféré. Masqué une fois l'action créée : le bloc « a déclenché »
              la montre déjà. */}
        {!item.triggeredActionLabel && (
          <Button
            variant="outline"
            fullWidth
            icon={CheckSquare}
            isLoading={createAction.isPending}
            disabled={createAction.isPending}
            onClick={() => createAction.mutate({ accountId: item.accountId, label: item.signalLabel })}
          >
            {t('action.create')}
          </Button>
        )}
        <Button variant="black" fullWidth icon={ArrowUpRight} onClick={() => onOpenAccount(item.accountId)}>
          {t('detail.openAccount')}
        </Button>
        {/* #1423 — TROIS gestes au maximum, et le troisième est « demander
              quoi faire ».

              ⚠️ Il PREND LA PLACE de « me prévenir automatiquement », qui menait
              aux préférences d'alerte — et ce n'est pas une capacité retirée :
              l'entête de l'écran porte désormais ce même chemin (« Paramétrer
              mes alertes »), pour tous les signaux plutôt que pour celui-ci.
              Le garder ici aurait dit deux fois la même chose sur le même écran. */}
        <AskLaura
          variant="prominent"
          question={t('detail.askLaura', { company: item.companyName, signal: item.signalLabel })}
          label={t('detail.askLauraLabel')}
          accountId={item.accountId}
          // Théo L1 — sélecteur avancé — une offre d'emploi ouvre un fil cadré sur ELLE (lien partageable).
          scope={
            jobOfferScopeParamOf({
              history_id: item.historyId ?? null,
              label: item.signalLabel,
              type: item.signalType,
              company_name: item.companyName,
            }) ?? undefined
          }
        />
      </div>
    </div>
  )
}

/**
 * L'ÂGE d'un signal, en jours (#1422).
 *
 * `null` quand la date est illisible : l'écran n'affiche alors aucune fraîcheur.
 * Un « 0 jour » posé sur une date qu'on n'a pas su lire serait un chiffre faux,
 * pas un chiffre neutre.
 */
function signalAgeInDays(signalDate: string): number | null {
  const parsed = Date.parse(signalDate)
  if (Number.isNaN(parsed)) return null
  const days = Math.floor((Date.now() - parsed) / 86_400_000)
  return days >= 0 ? days : null
}

/** La case porte son intitulé ; ce qu'elle affiche est rendu par l'appelant —
 *  une note passe par `ScoreWithAxes`, une source est du texte. Forcer les deux
 *  dans une chaîne obligeait la note à se recomposer à la main. */
function Metric({ label, value, footer }: { label: string; value: ReactNode; footer?: ReactNode }) {
  return (
    <div className="min-w-0 p-4">
      <Text size="xs" className="text-[var(--bellum-text-secondary)]">
        {label}
      </Text>
      <div className="mt-1 min-w-0">{value}</div>
      {footer ? <div className="mt-1 min-w-0">{footer}</div> : null}
    </div>
  )
}
