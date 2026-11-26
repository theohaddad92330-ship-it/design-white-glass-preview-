import { HORIZONTAL_OVERSCROLL_CLASS, Text, cn } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { appLocale } from '@/lib/locale'

/**
 * « APPORTS D'AFFAIRES » — la ligne composée de la variante 3, REFUSÉE le
 * 26/08, **levée par Louis le 31/08/2026**.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE REFUS, ET LA MOITIÉ QU'IL FAUT GARDER
 * ─────────────────────────────────────────────────────────────────────────────
 * La maquette écrivait « − Marge Crème » là où il fallait « = ». Le dossier en
 * tire une règle : « le signe change tout le sens de la ligne → **une ligne de
 * résultat se calcule, elle ne se compose jamais** ».
 *
 * Louis a levé le refus le 31/08. Ce qui reste vrai, et ce que ce composant
 * TIENT : **la ligne de résultat est LUE du serveur, jamais soustraite ici.**
 * `= marge nette` affiche `marginPercent` du canal intermédié, tel que
 * `marginByChannel` l'a calculé — pondéré par les jours, avec les missions non
 * chiffrées sorties du numérateur ET du dénominateur. Écrire
 * `direct - commission` en JSX aurait redonné le même chiffre aujourd'hui, et
 * un chiffre faux le jour où la pondération change d'un seul côté.
 *
 * Les trois lignes viennent donc de la MÊME lecture (`GET /delivery/finance/
 * margin-by-channel`), et l'égalité qu'elles montrent est celle que le serveur
 * a calculée — pas une addition d'écran.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE VOCABULAIRE — « OCTO » ET « MARGE CRÈME » NE S'ÉCRIVENT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * L'annexe le dit dès sa première page : ce sont les mots d'un CONCURRENT,
 * arrivés là par la régénération des captures. « Marge totale », « commission
 * d'apport », « marge nette » disent la même chose en français ordinaire, et
 * n'engagent le produit sur le jargon de personne.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA COLONNE « PRÉVISIONNEL » EST VIDE, ET ELLE DIT POURQUOI
 * ─────────────────────────────────────────────────────────────────────────────
 * Aucune dérivation du dépôt ne calcule une marge PRÉVISIONNELLE.
 * `MissionScoresService.forecast` est un prévisionnel de chiffre d'affaires,
 * volontairement NON pondéré (doctrine « aucune probabilité »), et aucun
 * `forecastMargin` n'existe — `METRICS_NOT_PHOTOGRAPHED` l'écrit noir sur blanc.
 * La remplir supposerait de l'inventer. Elle porte donc UNE phrase, une seule
 * fois, au lieu de trois « non mesuré » empilés qui feraient croire à une panne.
 */
export function FinanceIntroducers({
  /** La marge du canal DIRECT, en % — `marginByChannel`. */
  directPercent,
  /** L'écart direct/intermédié, en POINTS — `intermediationCost`. */
  commissionPoints,
  /** La marge du canal INTERMÉDIÉ, en % — LUE, jamais soustraite. */
  netPercent,
}: {
  directPercent: number | null | undefined
  commissionPoints: number | null | undefined
  netPercent: number | null | undefined
}) {
  const { t } = useTranslation('pilotage')

  return (
    <div>
      <Text size="xs" weight="semibold" className="text-[var(--bellum-text-secondary)]">
        {t('finance.introducers.title')}
      </Text>
      <Text size="xs" className="mb-2 block text-[var(--bellum-text-muted)]">
        {t('finance.introducers.hint')}
      </Text>

      {/* Un tableau à deux colonnes, borné par son propre conteneur défilant :
          ce qui déborde défile ICI, jamais le corps de la page.
          #2588 — un tableau large ne renvoie pas le navigateur en arrière. */}
      <div className={cn('overflow-x-auto', HORIZONTAL_OVERSCROLL_CLASS)}>
        <table className="w-full min-w-[16rem] text-left">
          <caption className="sr-only">{t('finance.introducers.title')}</caption>
          <thead>
            <tr>
              <th scope="col" className="pb-1">
                <Text size="xs" className="text-[var(--bellum-text-muted)]">
                  {t('finance.introducers.line')}
                </Text>
              </th>
              <th scope="col" className="pb-1 text-right">
                <Text size="xs" className="text-[var(--bellum-text-muted)]">
                  {t('finance.introducers.realised')}
                </Text>
              </th>
            </tr>
          </thead>
          <tbody>
            <Row label={t('finance.introducers.gross')} value={percent(directPercent)} />
            {/* Le signe est PORTÉ par le libellé, jamais par le chiffre : c'est
                exactement l'erreur de la maquette (« − » au lieu de « = »), et
                un signe collé au nombre se recopierait dans l'export. */}
            <Row
              label={t('finance.introducers.commission')}
              value={
                commissionPoints == null
                  ? null
                  : t('delta.points', {
                      value: new Intl.NumberFormat(appLocale(), { maximumFractionDigits: 1 }).format(commissionPoints),
                    })
              }
            />
            <Row label={t('finance.introducers.net')} value={percent(netPercent)} emphasis />
          </tbody>
        </table>
      </div>

      <Text size="xs" className="mt-2 block text-[var(--bellum-text-muted)]">
        {t('finance.introducers.forecastAbsent')}
      </Text>
    </div>
  )
}

function Row({ label, value, emphasis }: { label: string; value: string | null; emphasis?: boolean }) {
  const { t } = useTranslation('pilotage')
  // #3483 — une ligne sans valeur ne s'écrit pas (« une absence = aucune ligne ») ; l'absence de
  // prévision est déjà dite UNE fois par `forecastAbsent` sous le tableau.
  if (value === null) return null
  return (
    <tr>
      <th scope="row" className="py-0.5 font-normal">
        <Text size="xs" weight={emphasis ? 'medium' : undefined} className="text-[var(--bellum-text-secondary)]">
          {label}
        </Text>
      </th>
      <td className="py-0.5 text-right">
        <Text size="xs" weight={emphasis ? 'semibold' : 'medium'} className="text-[var(--bellum-text-primary)]">
          {value}
        </Text>
      </td>
    </tr>
  )
}

/** ⚠️ `== null` couvre `null` ET `undefined` : un canal sans mission mesurable
 *  rend `null`, et « 0 % de marge » se lirait comme un désastre plutôt que
 *  comme une absence de données. */
function percent(value: number | null | undefined): string | null {
  return value == null ? null : `${new Intl.NumberFormat(appLocale(), { maximumFractionDigits: 1 }).format(value)} %`
}
