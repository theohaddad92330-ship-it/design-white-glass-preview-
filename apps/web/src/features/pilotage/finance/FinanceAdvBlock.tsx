import type { AdvSummary } from '@bellum/contracts'
import { Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'

/**
 * LE BLOC ADV du tableau de bord Finance — il ne RECODE rien.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TOUT VIENT DE `GET /adv/dossiers`
 * ─────────────────────────────────────────────────────────────────────────────
 * Le domaine ADV a été livré le 31/08/2026 : son module, son contrat, son écran.
 * Ce bloc est une LENTILLE dessus — les deux compteurs de la maquette, la file
 * par motif, et un lien vers l'écran qui permet d'agir. Recalculer un seul de
 * ces chiffres ici ferait deux vérités pour la même question.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES DEUX DELTAS DE LA MAQUETTE, ET POURQUOI UN SEUL EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * « +9 » et « +6 ». Le premier est mesuré depuis le 31/08 : un DÉMARRAGE est un
 * flux daté (`missions.started_on`), donc recomptable à l'identique pour un mois
 * passé. Le second ne l'est pas et ne le sera pas tant que les renouvellements
 * se calculeront sur une fenêtre J-60/J-30 relative à **maintenant** : « ceux à
 * traiter en juillet » n'est pas recomposable en août.
 *
 * L'écran ne les traite donc PAS pareil, et c'est le point : l'un porte une
 * variation, l'autre porte la phrase qui dit pourquoi il n'en a pas.
 *
 * ⚠️ Ce bloc n'appelle PAS `metricDelta`, et c'est délibéré. Le serveur a déjà
 * fait la soustraction — il a seul accès au mois de référence — et `metricDelta`
 * exige deux PHOTOS datées. Lui en fabriquer deux pour lui faire recracher un
 * écart qu'on connaît déjà aurait inventé deux points qui n'existent pas, dans
 * la fonction même dont tout le lot dépend pour refuser d'inventer. Le bloc
 * partage donc le VOCABULAIRE des variations (les mêmes clés `delta.*`) sans
 * emprunter une dérivation qui ne répond pas à sa question.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ CE QU'ON A CHERCHÉ POUR LE DELTA DES RENOUVELLEMENTS, ET CE QU'ON A TROUVÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * Le 01/09/2026, le manque a été repris avec une piste précise : PHOTOGRAPHIER
 * ce compteur, comme les neuf indicateurs de stock, en évitant le cliquet GA-07
 * (243/243 imports service → service, zéro marge) par une composition de modules
 * ou une orchestration en contrôleur — les deux sorties que GA-07 nomme
 * lui-même, et qui ne comptent pas.
 *
 * **La sortie existe, et elle ne s'applique pas ici** : GA-07 n'est pas le
 * premier obstacle, il est le deuxième. Deux blocages le précèdent, et aucun ne
 * se lève par une composition de modules.
 *
 *  1. **`renewalsToAct` est défini par UTILISATEUR.** Elle passe par
 *     `DeliveryService.list(userId)`, qui commence par `resolveActiveWorkspace(
 *     userId)`. Le balayage mensuel, lui, itère sur les ESPACES : il n'a aucun
 *     utilisateur à passer, et en choisir un serait une identité fabriquée —
 *     dont l'espace ACTIF pourrait même ne pas être celui qu'on photographie.
 *     Écrire une variante par espace serait une SECONDE définition de « à
 *     traiter », exactement ce que `AdvService` a refusé de faire quand il a
 *     préféré recevoir `renewals` de son contrôleur.
 *  2. **L'INSTANT de la photo serait arbitraire.** La fenêtre J-60/J-30 est
 *     relative à MAINTENANT : une photo prise le 3 et une prise le 28 ne
 *     répondent pas à la même question. Une photo écrite au premier passage sur
 *     l'écran (la seule orchestration en contrôleur possible) daterait donc de
 *     n'importe quel jour du mois, et l'écart entre deux photos mesurerait le
 *     jour du mois où quelqu'un a ouvert l'écran.
 *
 * Le refus TIENT donc, et il est désormais tenu pour la bonne raison. GA-07 n'a
 * pas été relevé : il est resté à 243, et la contrepartie qu'il réclame depuis
 * août (`routines.service`, −3 en une fois) reste due — elle n'a simplement rien
 * à voir avec ce compteur.
 */
export function FinanceAdvBlock({
  summary,
  previousLabel,
  loading,
  failed,
}: {
  summary: AdvSummary | undefined
  previousLabel: string | null
  loading: boolean
  failed: boolean
}) {
  const { t } = useTranslation('pilotage')

  if (loading) {
    return (
      <Text size="xs" className="text-[var(--bellum-text-muted)]">
        {t('loading')}
      </Text>
    )
  }
  if (failed || !summary) {
    return (
      <Text size="xs" className="text-[var(--bellum-text-muted)]">
        {t('finance.unavailable')}
      </Text>
    )
  }

  // Les motifs réellement comptés, du plus fourni au moins fourni. Un motif
  // RÉSERVÉ (`count: null`) sort de la file : « 0 KYC à valider » se lirait
  // « tout est vérifié » sur un espace où personne n'a jamais regardé.
  const blockers = summary.byBlocker
    .filter(
      (entry): entry is { blocker: (typeof summary.byBlocker)[number]['blocker']; count: number } =>
        typeof entry.count === 'number',
    )
    .filter(entry => entry.count > 0)
    .sort((a, b) => b.count - a.count)
  const reserved = summary.byBlocker.filter(entry => entry.count === null).length

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <Counter
          label={t('finance.adv.starts')}
          value={summary.starts}
          note={
            summary.startsDelta === null
              ? // ⚠️ PAS « premier mois » : contrairement à la photo mensuelle,
                // le mois de référence d'un démarrage se RECOMPTE. `null` veut
                // donc dire « je n'ai pas pu le compter », ce qui est une autre
                // phrase et un autre geste.
                t('finance.adv.startsNoDelta')
              : `${previousLabel ? t('delta.versus', { month: previousLabel }) : t('delta.vsPreviousMonth')} ${t(
                  'delta.countThisMonth',
                  { value: `${summary.startsDelta > 0 ? '+' : ''}${summary.startsDelta}` },
                )}`
          }
        />
        <Counter
          label={t('finance.adv.renewals')}
          value={summary.renewals}
          /* La phrase qui remplace la variation : ce n'est pas « pas encore »,
             c'est « la question a bougé avec le calendrier ». */
          note={t('finance.adv.renewalsNoDelta')}
        />
      </div>

      <div>
        <Text size="xs" weight="semibold" className="text-[var(--bellum-text-secondary)]">
          {t('finance.adv.queue')}
        </Text>
        {blockers.length === 0 ? (
          <Text size="xs" className="mt-1 block text-[var(--bellum-text-muted)]">
            {t('finance.adv.queueEmpty')}
          </Text>
        ) : (
          <ul className="mt-1 flex flex-col gap-1">
            {blockers.map(entry => (
              <li key={entry.blocker} className="flex items-baseline justify-between gap-2">
                <Text size="xs" className="min-w-0 text-[var(--bellum-text-secondary)]">
                  {/* Les libellés des motifs vivent déjà dans l'espace de noms
                      « adv » : les recopier ici en ferait deux jeux, qui
                      divergeraient au premier renommage. */}
                  {t(`adv:blockers.${entry.blocker}`, { defaultValue: entry.blocker })}
                </Text>
                <Text size="xs" weight="medium" className="shrink-0 text-[var(--bellum-text-primary)]">
                  {entry.count}
                </Text>
              </li>
            ))}
          </ul>
        )}
        {reserved > 0 ? (
          // Un motif non mesuré se DIT : replier en silence ferait croire que la
          // file est complète.
          <Text size="xs" className="mt-1 block text-[var(--bellum-text-muted)]">
            {t('finance.adv.reserved', { count: reserved })}
          </Text>
        ) : null}
      </div>
    </div>
  )
}

function Counter({ label, value, note }: { label: string; value: number; note: string }) {
  return (
    <div className="rounded-md border border-[var(--bellum-border)] p-2">
      <Text size="xs" className="block text-[var(--bellum-text-secondary)]">
        {label}
      </Text>
      <Text size="xl" weight="semibold" className="block text-[var(--bellum-text-primary)]">
        {value}
      </Text>
      <Text size="xs" className="block text-[var(--bellum-text-muted)]">
        {note}
      </Text>
    </div>
  )
}
