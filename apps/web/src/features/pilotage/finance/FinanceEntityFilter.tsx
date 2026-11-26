import { FINANCE_ENTITY_BLIND_READS, selectableEntities, type LegalEntity } from '@bellum/contracts'
import { SelectField, Text } from '@bellum/ui'
import { useId } from 'react'
import { useTranslation } from 'react-i18next'

/**
 * LE FILTRE PAR SOCIÉTÉ — ACTIF depuis le 01/09/2026.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE LA MAQUETTE DEMANDE, ET CE QU'ELLE NOMME MAL
 * ─────────────────────────────────────────────────────────────────────────────
 * La variante 2 porte un sélecteur « Toutes les BU ». **La notion de BU de
 * l'ESN n'existe pas dans le produit** : `ACCOUNT_ENTITY_KINDS` a bien une
 * valeur `'bu'`, mais c'est une division du COMPTE CLIENT — la BU d'un client,
 * pas une portée transverse de l'ESN. La lire comme telle aurait filtré les
 * chiffres de l'ESN par les divisions de ses clients, ce qui n'a aucun sens et
 * n'aurait rien affiché d'absurde à l'écran.
 *
 * Ce qui EXISTE, c'est `legal_entities` : les SOCIÉTÉS de l'ESN, celles qui
 * portent une mission et facturent le mois (D9). C'est la bonne notion, et
 * c'est celle qu'on nomme — le produit ne prend pas le vocabulaire d'une
 * maquette pour une décision de modèle.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IL A ÉTÉ LIVRÉ DÉSACTIVÉ LE 31/08, ET LE REFUS ÉTAIT JUSTE
 * ─────────────────────────────────────────────────────────────────────────────
 * « Aucune des six lectures financières ne prend de société en paramètre ;
 * `missions.legal_entity_id` existe et n'est lu par aucune d'elles. Livrer le
 * sélecteur actif aurait donné un contrôle qui change le libellé et pas les
 * chiffres : le pire des deux mondes, parce qu'on croit avoir filtré. »
 *
 * Ce qui manquait est livré : `legalEntityClause` (contrats), et les QUATRE
 * lectures qui peuvent la recevoir la reçoivent — les quatre chiffres
 * d'affaires, la marge d'espace et ses alertes, la marge par canal, et les deux
 * lignes contractualisées du prévisionnel.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ ET IL DIT CE QU'IL NE GOUVERNE PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Trois lectures restent aveugles à la société, et pour des raisons écrites au
 * registre partagé (`FINANCE_ENTITY_BLIND_READS`) : la capacité décrit l'ÉQUIPE
 * (un consultant n'est rattaché à aucune société), le délai de paiement est une
 * médiane à plancher d'observations, la ligne « espéré » du prévisionnel part
 * d'opportunités qui n'ont pas encore de mission.
 *
 * Sans cette phrase, trois blocs qui ne bougent pas se lisent comme une panne.
 * C'est le même geste que « ce que la période ne gouverne pas », livré avec le
 * sélecteur de mois le 27/08 — et c'est ce qui rend le filtre honnête.
 */
export function FinanceEntityFilter({
  entities,
  loading,
  value,
  onChange,
}: {
  entities: readonly LegalEntity[]
  loading: boolean
  /** `null` = toutes les sociétés. Jamais `''` : deux formes pour « toutes »
   *  divergeraient entre le sélecteur et la clé de cache. */
  value: string | null
  onChange: (next: string | null) => void
}) {
  const { t } = useTranslation('pilotage')
  const selectId = useId()
  const reasonId = useId()

  // Une société ARCHIVÉE sort du sélecteur, sauf si elle est celle qu'on
  // regarde : sans cette exception, revenir sur un lien partagé qui pointe une
  // société dissoute afficherait « toutes les sociétés » sous un chiffre qui
  // n'est pas celui-là.
  const options = selectableEntities(entities, value)
  // Rien à filtrer sur un espace mono-société : le contrôle reste VISIBLE et
  // désactivé, avec sa raison. Le retirer ferait re-poser la question tous les
  // mois — « pourquoi je ne peux pas filtrer par société ? ».
  const empty = options.length === 0

  // #3709 — une seule société (ou aucune déclarée) : il n'y a rien à filtrer, et la ligne
  // « Aucune société déclarée » faisait croire à un manque alors que le bloc Finance tourne.
  if (empty && !loading) return null

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={selectId} className="flex items-center gap-2">
        <Text size="xs" className="text-[var(--bellum-text-muted)]">
          {t('finance.entities.label')}
        </Text>
      </label>
      <SelectField
        id={selectId}
        ariaDescribedBy={reasonId}
        value={value ?? ''}
        onChange={next => onChange(next === '' ? null : next)}
        emptyOption={{ label: t('finance.entities.all') }}
        options={options.map(entity => ({ value: entity.id, label: entity.name }))}
        size="sm"
        disabled={loading || empty}
      />
      <Text id={reasonId} size="xs" className="block text-[var(--bellum-text-muted)]">
        {loading
          ? t('loading')
          : // ⚠️ La phrase change selon qu'une société est CHOISIE : sans
            // société, dire ce que le filtre ne gouverne pas serait du bruit
            // permanent ; avec une société, le taire ferait passer trois blocs
            // inchangés pour une panne.
            value === null
            ? t('finance.entities.hint', { count: options.length })
            : t('finance.entities.blind', {
                blocks: FINANCE_ENTITY_BLIND_READS.map(read => t(`finance.entities.blindReads.${read.key}`)).join(', '),
              })}
      </Text>
    </div>
  )
}
