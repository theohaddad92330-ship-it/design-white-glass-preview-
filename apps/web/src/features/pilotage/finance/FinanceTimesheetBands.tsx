import { Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { appLocale } from '@/lib/locale'
import { timesheetSplit, type TimesheetSplitGroup, type TimesheetSummary } from './finance-timesheet-split'

/**
 * LA RÉPARTITION DES RELEVÉS — trois teintes, jamais quatre.
 *
 * Le regroupement vit dans `finance-timesheet-split.ts` (pur, testé) ; ce
 * fichier ne fait que le peindre. La raison des trois est écrite là-bas : « à
 * valider » et « à saisir » sont deux étapes du même « pas fini ».
 *
 * ⚠️ **Le chiffre est TOUJOURS écrit à côté de la barre** — la seule règle de
 * visualisation que l'annexe dit vraiment importante. Le compte ET la part sont
 * en toutes lettres ; la barre n'est jamais le seul chemin vers la valeur, et
 * elle est `aria-hidden` pour ne pas faire lire deux fois la même chose.
 *
 * ⚠️ La couleur n'est jamais SEULE : chaque bande porte son libellé. Une teinte
 * qui distingue « validé » de « en conflit » sans texte ne dit rien en niveaux
 * de gris ni à un lecteur d'écran.
 */
export function FinanceTimesheetBands({
  summary,
  loading,
  failed,
}: {
  summary: TimesheetSummary | null | undefined
  loading: boolean
  failed: boolean
}) {
  const { t } = useTranslation('pilotage')
  const split = timesheetSplit(summary)

  if (loading) {
    return (
      <Text size="xs" className="text-[var(--bellum-text-muted)]">
        {t('loading')}
      </Text>
    )
  }
  if (failed) {
    // Distinguer l'échec du vide : « aucun relevé » et « je n'ai pas pu
    // regarder » appellent deux gestes différents.
    return (
      <Text size="xs" className="text-[var(--bellum-text-muted)]">
        {t('finance.unavailable')}
      </Text>
    )
  }

  return (
    <div>
      <ul className="flex flex-col gap-1.5">
        {split.bands.map(band => (
          <li key={band.group} className="flex items-center gap-2">
            <Text size="xs" className="w-24 shrink-0 text-[var(--bellum-text-secondary)]">
              {t(`finance.timesheets.${band.group}`)}
            </Text>
            <div
              className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-[var(--bellum-surface-2)]"
              aria-hidden="true"
            >
              <div
                className="h-full rounded-full"
                style={{
                  // Aucune part mesurée ⇒ aucune barre. Une barre à 0 % de large
                  // est indiscernable d'une barre absente, mais une barre à 100 %
                  // grise se lirait « tout est dans cet état ».
                  width: band.share === null ? '0%' : `${band.share}%`,
                  backgroundColor: BAND_COLOR[band.group],
                }}
              />
            </div>
            <Text size="xs" weight="medium" className="shrink-0 text-[var(--bellum-text-primary)]">
              {/* ⚠️ Le COMPTE est toujours vrai ; la PART peut ne pas exister.
                  Écrire « 0 % » quand rien n'est mesuré dirait « aucun relevé
                  validé » sur un mois où aucun relevé n'est attendu. */}
              {band.share === null
                ? t('finance.timesheets.countOnly', { count: band.count })
                : t('finance.timesheets.countAndShare', {
                    count: band.count,
                    share: new Intl.NumberFormat(appLocale(), { maximumFractionDigits: 2 }).format(band.share),
                  })}
            </Text>
          </li>
        ))}
      </ul>

      {/* La population du calcul, DITE. Un dénominateur amputé en silence est
          exactement ce que « un agrégat dit sa population » veut empêcher. */}
      <Text size="xs" className="mt-2 block text-[var(--bellum-text-muted)]">
        {t('finance.timesheets.population', { count: split.measured })}
        {split.notRequired > 0 ? ` · ${t('finance.timesheets.notRequired', { count: split.notRequired })}` : ''}
        {split.unclassified > 0 ? ` · ${t('finance.timesheets.unclassified', { count: split.unclassified })}` : ''}
      </Text>
    </div>
  )
}

/**
 * Trois teintes, trois jetons — aucune couleur hexadécimale, aucune classe de la
 * palette Tailwind : elles ne suivraient pas le thème.
 *
 * ⚠️ Ce sont des FONDS de barre, jamais des couleurs de texte : le libellé de
 * chaque bande reste peint en couleur de texte, parce qu'une couleur sémantique
 * portant du texte échoue AA d'un côté ou de l'autre (`--bellum-warning` fait
 * 9,47:1 en sombre et 1,84:1 en clair).
 */
const BAND_COLOR: Record<TimesheetSplitGroup, string> = {
  validated: 'var(--bellum-success)',
  // Neutre, et c'est une décision : « en attente » n'est pas une faute. L'orange
  // dirait « c'est mauvais », et le dossier refuse nommément cette couleur tant
  // qu'aucune cible ne dit par rapport à quoi.
  pending: 'var(--bellum-text-accent)',
  conflict: 'var(--bellum-danger)',
}
