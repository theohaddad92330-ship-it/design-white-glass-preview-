import { plausibleRegistryDate } from '@/lib/signal-date'
import type { TerritoryCompanyRecord } from '@bellum/contracts'
import { Badge, Box, Button, Sheet, SheetContent, SheetHeader, SheetTitle, Text } from '@bellum/ui'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Zap } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { fetchTerritoryCompany } from '../api/territory-api'

/**
 * CE QUE LE REGISTRE PUBLIC DIT GRATUITEMENT D'UNE ENTREPRISE DU TERRITOIRE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE PANNEAU EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * L'écran Territoire nommait des dizaines d'entreprises qui recrutent, en texte
 * mort : « Airbus — 12 offres », sans lien, sans identité, rien à ouvrir. La
 * seule façon d'en savoir plus était de lancer une analyse complète — 8 crédits,
 * par entreprise — sur un territoire qui en compte quarante. Explorer coûtait
 * donc trop cher pour être fait.
 *
 * Arbitrage de Louis (04/09/2026) : un clic ouvre d'abord ce que le REGISTRE
 * PUBLIC donne sans clé et sans crédit — SIREN, adresse exacte, effectif, NAF,
 * forme juridique, date de création, dirigeants —, et l'analyse reste un geste
 * SÉPARÉ, décidé, avec son coût annoncé. On voit beaucoup, on ne paie que si
 * on veut le dossier.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ TROIS RÉPONSES, PAS DEUX
 * ─────────────────────────────────────────────────────────────────────────────
 * « Le registre ne connaît pas ce nom » et « le registre n'a pas répondu » ne
 * mènent pas à la même décision : la première dit d'aller vérifier la raison
 * sociale, la seconde de réessayer. Elles ont donc deux phrases, et l'absence
 * de fiche n'est jamais rendue comme une fiche vide.
 */
export function TerritoryCompanyPanel({
  name,
  onClose,
}: {
  /** L'entreprise ouverte, ou `null` quand le panneau est fermé. */
  name: string | null
  onClose: () => void
}) {
  const { t } = useTranslation('territory')
  const lookup = useQuery({
    queryKey: ['territory', 'company', name ?? ''] as const,
    queryFn: () => fetchTerritoryCompany(name!),
    enabled: Boolean(name),
    // Le registre met sa réponse en cache 30 jours côté serveur ; la rejouer à
    // chaque ouverture du panneau ne changerait rien au contenu et coûterait un
    // aller-retour. `staleTime` aligne le client sur cette réalité.
    staleTime: 10 * 60 * 1000,
  })

  return (
    <Sheet open={Boolean(name)} onOpenChange={open => !open && onClose()}>
      <SheetContent closeLabel={t('common:actions.close')} side="right" className="w-full max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{name ?? ''}</SheetTitle>
        </SheetHeader>

        <Box display="flex" className="flex-col gap-4 pt-2">
          {/* Le geste payant, ANNONCÉ comme tel et jamais déclenché par
              l'ouverture du panneau. Il passe par le chemin d'analyse existant
              (`/search` pré-rempli), où le coût s'affiche et la confirmation se
              demande — aucun second chemin d'analyse n'est créé. */}
          {name ? (
            <Box display="flex" className="flex-col gap-1">
              <Link to="/search" search={{ company: name }} aria-label={t('panel.analyseAria', { name })}>
                <Button size="sm" icon={Zap} className="w-full">
                  {t('panel.analyse')}
                </Button>
              </Link>
              <Text size="xs" color="text-[var(--bellum-text-muted)]">
                {t('panel.analyseHint')}
              </Text>
            </Box>
          ) : null}

          {lookup.isPending ? (
            <Text size="sm" color="text-[var(--bellum-text-muted)]">
              {t('panel.loading')}
            </Text>
          ) : lookup.isError ? (
            /* La source n'a pas répondu — à distinguer de « elle ne connaît pas
               ce nom » : l'une dit de réessayer, l'autre de vérifier la raison
               sociale. */
            <Text size="sm" color="text-[var(--bellum-text-muted)]">
              {t('panel.failed')}
            </Text>
          ) : !lookup.data?.company ? (
            <Text size="sm" color="text-[var(--bellum-text-muted)]">
              {t('panel.notFound')}
            </Text>
          ) : (
            <RegistryFacts record={lookup.data.company} />
          )}
        </Box>
      </SheetContent>
    </Sheet>
  )
}

/**
 * Les faits de registre. Chaque ligne se TAIT quand elle n'a rien à dire :
 * une fiche à trous nommés vaut mieux qu'une fiche complète dont la moitié
 * des valeurs sont des tirets — et infiniment mieux qu'une valeur déduite.
 */
function RegistryFacts({ record }: { record: TerritoryCompanyRecord }) {
  const { t } = useTranslation('territory')
  const address = [record.address, [record.postalCode, record.city].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(', ')

  return (
    <Box display="flex" className="flex-col gap-3">
      <Box display="flex" className="flex-wrap gap-1.5">
        {record.category ? <Badge variant="secondary">{record.category}</Badge> : null}
        {record.headcountRange ? <Badge variant="outline">{record.headcountRange}</Badge> : null}
        {record.legalForm ? <Badge variant="outline">{record.legalForm}</Badge> : null}
      </Box>

      <Fact label={t('panel.siren')} value={record.siren} />
      <Fact label={t('panel.address')} value={address || null} />
      <Fact label={t('panel.naf')} value={record.nafCode} />
      <Fact label={t('panel.created')} value={plausibleRegistryDate(record.creationDate)} />
      {/* Établissements OUVERTS, jamais le total : un compte qui inclut les
          sites fermés fait passer pour décentralisée une entreprise qui ne
          l'est plus, et abaisse la barrière d'accès estimée. */}
      <Fact
        label={t('panel.establishments')}
        value={record.etablissementCount != null ? String(record.etablissementCount) : null}
      />

      {(record.dirigeants ?? []).length > 0 ? (
        <Box display="flex" className="flex-col gap-1">
          <Text size="xs" color="text-[var(--bellum-text-muted)]" className="uppercase tracking-wider">
            {t('panel.dirigeants')}
          </Text>
          {(record.dirigeants ?? []).map(person => (
            <Text key={`${person.name}-${person.role}`} size="sm">
              {person.name}
              {person.role ? ` — ${person.role}` : ''}
            </Text>
          ))}
        </Box>
      ) : null}
    </Box>
  )
}

/** Un fait, ou rien. Jamais un tiret : une ligne muette ne promet rien. */
function Fact({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null
  return (
    <Box display="flex" className="flex-col gap-0.5">
      <Text size="xs" color="text-[var(--bellum-text-muted)]" className="uppercase tracking-wider">
        {label}
      </Text>
      <Text size="sm">{value}</Text>
    </Box>
  )
}
