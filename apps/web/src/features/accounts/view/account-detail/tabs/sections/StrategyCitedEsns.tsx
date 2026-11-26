import { personalAccessRisk, type AccountStrategyCitedEsn, type AccountStrategyPassage } from '@bellum/contracts'
import { Badge, Button, Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'

/**
 * #3684.2/.5/#3667.R1 — les ESN CITÉES par la stratégie, une ligne par société, avec ce qui les fonde
 * et la porte vers leur ligne Partenaires. Le statut affiché (`certainty`) est le MÊME vocabulaire que
 * l'onglet Accès (`personalAccessCertainty`, badge + action, `TabAccess.tsx`) — une ESN citée ici se
 * retrouve avec le même mot dans Écosystème/Accès (#3667, « même statut partout »), jamais une échelle
 * maison en parallèle. Sans aucune ESN : « relation non documentée » (une absence de trace, pas un
 * constat que personne n'intervient). `cited_esns` absent = lecture non faite : on se tait.
 *
 * #3684 — recette prod 09/10 : chaque carte répétait 3 fois la même idée
 * (`action.<certainty>`, `risk.<risk>`, `nextCheck.<next_check>` rendus comme
 * trois lignes) — `personalAccessRisk` dérive presque toujours le risque de
 * la SEULE certitude (`unconfirmed` pour une relation probable, par exemple :
 * exactement ce que `action.probable_relation` dit déjà). Cette carte est le
 * résumé sous « Cinq questions de terrain » (le détail complet reste à UN clic,
 * « Voir X dans Partenaires ») : elle garde le badge (l'état) et calcule UN
 * SEUL geste — le plus spécifique d'abord (une donnée périmée prime sur tout,
 * puis la vérification nommée par `next_check`, puis le geste générique de la
 * certitude en dernier repli, jamais les trois ensemble).
 */
function citedEsnGesture(
  esn: Pick<AccountStrategyCitedEsn, 'certainty' | 'freshness' | 'next_check'>,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  const risk = personalAccessRisk({ certainty: esn.certainty, freshness: esn.freshness })
  if (risk === 'stale') return t('access:personalPaths.risk.stale')
  if (esn.next_check) return t(`strategy5P.esn.nextCheck.${esn.next_check}`)
  return t(`access:personalPaths.action.${esn.certainty}`)
}

export function StrategyCitedEsns({
  passage,
  onOpenPartner,
}: {
  passage: AccountStrategyPassage
  /** Absente, aucun bouton : un appelant qui ne navigue pas ne promet rien. */
  onOpenPartner?: (partnerId: string | null) => void
}) {
  const { t } = useTranslation('accountDetail')
  const cited = passage.cited_esns
  if (!cited) return null
  if (cited.length === 0) {
    return (
      <Text size="xs" className="mt-1 block text-[var(--bellum-text-muted)]">
        {t('strategy5P.esn.undocumented')}
      </Text>
    )
  }
  // #3684 — une réserve identique sur ≥ 2 cartes se dit UNE fois pour le bloc ; chaque carte
  // ne garde que ce qui lui est propre.
  const gestures = cited.map(esn => citedEsnGesture(esn, t))
  const counts = new Map<string, number>()
  gestures.forEach(g => counts.set(g, (counts.get(g) ?? 0) + 1))
  const shared = [...counts.entries()].find(([, n]) => n >= 2)?.[0] ?? null
  return (
    <div className="mt-2">
      {shared ? (
        <Text size="xs" className="mb-2 block text-[var(--bellum-text-muted)]" data-testid="cited-esns-shared-gesture">
          {shared}
        </Text>
      ) : null}
      <ul className="space-y-2" aria-label={t('strategy5P.esn.title')}>
        {cited.map((esn, index) => (
          <li key={esn.name} className="min-w-0 rounded-md border border-[var(--bellum-border)] px-3 py-2">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <Text size="sm" weight="medium">
                {esn.name}
              </Text>
              <Badge variant={esn.certainty === 'verified_access' ? 'success' : 'outline'}>
                {t(`access:personalPaths.certainty.${esn.certainty}`)}
              </Badge>
            </div>
            {esn.scope ? (
              <Text size="xs" className="block text-[var(--bellum-text-muted)]">
                {esn.scope}
              </Text>
            ) : null}
            {/* UN geste, jamais trois : voir `citedEsnGesture` ci-dessus. */}
            {gestures[index] !== shared ? (
              <Text size="xs" className="block text-[var(--bellum-text-muted)]">
                {gestures[index]}
              </Text>
            ) : null}
            {onOpenPartner ? (
              <Button
                type="button"
                size="xs"
                variant="outline"
                className="mt-1"
                onClick={() => onOpenPartner(esn.partner_id)}
              >
                {t('strategy5P.esn.open', { name: esn.name })}
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  )
}
