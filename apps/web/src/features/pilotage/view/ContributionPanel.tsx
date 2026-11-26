import type { Contribution, ContributionLine } from '@bellum/contracts'
import { Box, Card, CardContent, Text, cn } from '@bellum/ui'
import { useQuery } from '@tanstack/react-query'
import { Link, useRouter } from '@tanstack/react-router'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { UnknownValue } from '@/components/primitives/UnknownValue'
import { apiFetch } from '@/lib/api'
import { isReachable, knownDestinations } from '../quality/lib/destinations'

/**
 * « IMPACT MESURABLE DE BELLUM » (tome 1 §12, renommé par #1434).
 *
 * Il répond au signal de churn le plus explicite du call bêta : « je vais
 * essayer d'en enchaîner d'autres, comme ça après je pourrai garder
 * l'abonnement plus longtemps. »
 *
 * Des COMPTAGES, jamais un montant. « Bellum vous a fait gagner 42 000 € » est
 * la phrase que le premier client sérieux démonte ; « 3 missions signées sur des
 * comptes ouverts via Découvrir » est vérifiable, et c'est tout ce qu'on
 * affirme. La causalité appartient au commercial.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CHAQUE COMPTAGE NOMME SA POPULATION
 * ─────────────────────────────────────────────────────────────────────────────
 * « Vérifiable » suppose qu'on puisse aller voir. Les quatre chiffres étaient
 * justes et INERTES : la question que pose un commercial devant « 4 comptes
 * ouverts via Découvrir » est « lesquels ? », et il n'existait aucun chemin
 * depuis l'endroit où elle se pose vers les objets comptés. C'est le troisième
 * endroit du produit à porter ce défaut — le tableau de bord (#1095), puis le
 * compteur d'alertes de cet écran (#1128).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES TROIS NATURES SONT SÉPARÉES, PAS ALIGNÉES — #1434
 * ─────────────────────────────────────────────────────────────────────────────
 * *« Le bloc est dangereux marketingement quand il affiche plusieurs zéros alors
 * que l'attribution est partielle. »* Les trois natures existaient dans les
 * données depuis le début — `attribution: 'direct' | 'partial'` sur chaque
 * ligne, `unattributedAccounts` à part — mais l'écran les rendait À PLAT, avec
 * la mention « partielle » en petit à droite. Résultat : quatre chiffres qui se
 * lisaient tous comme des revendications directes, dont les zéros.
 *
 * Elles sont désormais dans TROIS groupes nommés. Ce qui change n'est pas le
 * chiffre : c'est ce à côté de quoi il se lit. « 0 mission signée » sous
 * « attribution partielle », à côté de « 6 comptes plus anciens : origine
 * inconnue », ne dit plus « Bellum n'a rien apporté » — il dit ce qu'il mesure.
 *
 * ⚠️ **La période est ÉCRITE.** Le contrat porte `since` depuis le premier jour
 * et aucun écran ne le rendait : les quatre comptages étaient donnés sans dire
 * sur quoi ils portent. C'est aussi la moitié de #1440 (« provenance des
 * chiffres obligatoire : période, population, source »).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ET « JE N'AI PAS PU COMPTER » NE S'ÉCRIT PAS « 0 »
 * ─────────────────────────────────────────────────────────────────────────────
 * Le serveur rendait `0` sur exception jusqu'au 29/08/2026 : sur l'écran qui
 * édicte « un taux sans dénominateur vaut non mesuré, pas 0 % », une requête
 * cassée écrivait « 0 compte ouvert grâce à Découvrir ». Il rend `null`, et
 * l'écran finit le travail — un `{count ?? 0}` ici annulerait la correction.
 * Une ligne non lue n'est pas non plus un LIEN : une valeur qu'on ignore ne dit
 * rien de ce qu'une liste contiendrait.
 */
export function ContributionPanel() {
  const { t, i18n } = useTranslation('pilotage')
  // L'arbre de routes RÉEL de ce navigateur — voir `quality/lib/destinations` :
  // le serveur peut être livré avant le web, et un lien mort est pire qu'une
  // absence de lien. Résolu UNE fois, pas une par ligne.
  const router = useRouter()
  const known = useMemo(() => knownDestinations(router.routesByPath as unknown as Record<string, unknown>), [router])
  const { data } = useQuery({
    queryKey: ['pilotage', 'contribution'],
    queryFn: () => apiFetch<Contribution>({ path: '/pilotage/contribution' }),
  })
  if (!data) return null

  const direct = data.lines.filter(line => line.attribution === 'direct')
  const partial = data.lines.filter(line => line.attribution === 'partial')

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4">
        <Box>
          <Text element="p" size="sm" weight="semibold">
            {t('contribution.title')}
          </Text>
          {/* La phrase que le retour écrit mot pour mot : ce que le bloc PEUT
              relier, et rien de plus. Elle est ici et pas en info-bulle — une
              promesse de mesure qui se survole ne se lit pas. */}
          <Text element="p" size="xs" className="mt-0.5 text-[var(--bellum-text-secondary)]">
            {t('contribution.method')}
          </Text>
          {/* #1434 / #1440 — LA PÉRIODE. `since` voyageait dans la charge utile
              sans que rien ne l'affiche : des comptages sans fenêtre de calcul. */}
          <Text element="p" size="xs" className="mt-0.5 text-[var(--bellum-text-muted)]">
            {t('contribution.since', { date: formatSince(data.since, i18n.language) })}
          </Text>
        </Box>

        <AttributionGroup
          title={t('contribution.groups.direct')}
          hint={t('contribution.groups.directHint')}
          lines={direct}
          known={known}
        />
        <AttributionGroup
          title={t('contribution.groups.partial')}
          hint={t('contribution.groups.partialHint')}
          lines={partial}
          known={known}
        />

        {/* LA TROISIÈME NATURE : ce que personne ne peut rattacher. Elle a son
            propre groupe et non une ligne perdue en bas — c'est elle qui donne
            leur échelle aux deux autres. */}
        <Box>
          <Text element="p" size="xs" weight="medium" className="text-[var(--bellum-text-secondary)]">
            {t('contribution.groups.unattributed')}
          </Text>
          <Text element="p" size="xs" className="mt-0.5 text-[var(--bellum-text-muted)]">
            {t('contribution.groups.unattributedHint')}
          </Text>
          <Box className="mt-1">
            {data.unattributedAccounts === null ? (
              /* Le bloc existe pour ne RIEN absorber ; se taire absorberait. La
                 condition `> 0` masquait `null` exactement comme elle masquait un
                 vrai zéro — sauf qu'un vrai zéro, lui, n'a rien à dire. */
              <UnknownValue reason={t('contribution.unattributedPopulation')} />
            ) : data.unattributedAccounts > 0 ? (
              /* Annoncé, jamais absorbé : les compter comme « pas venus de
                 Découvrir » sous-estimerait la contribution, les compter dedans
                 l'inventerait. Et ils s'ouvrent — « 12 comptes plus anciens » sans
                 chemin vers eux ne se vérifie pas. */
              <PopulationLink
                label={t('contribution.unattributed', { count: data.unattributedAccounts })}
                to="/accounts"
                known={known}
                muted
              />
            ) : (
              <Text size="xs" color="text-[var(--bellum-text-muted)]">
                {t('contribution.unattributedNone')}
              </Text>
            )}
          </Box>
        </Box>
      </CardContent>
    </Card>
  )
}

/**
 * UNE NATURE D'ATTRIBUTION, avec ses lignes.
 *
 * Le groupe disparaît quand il n'a aucune ligne : un intitulé seul (« attribution
 * partielle ») sans rien dessous se lit comme une panne d'affichage, alors qu'il
 * veut dire « aucune de tes lignes n'est de cette nature ».
 */
function AttributionGroup({
  title,
  hint,
  lines,
  known,
}: {
  title: string
  hint: string
  lines: ContributionLine[]
  known: ReadonlySet<string>
}) {
  const { t } = useTranslation('pilotage')
  if (lines.length === 0) return null
  return (
    <Box>
      <Text element="p" size="xs" weight="medium" className="text-[var(--bellum-text-secondary)]">
        {title}
      </Text>
      <Text element="p" size="xs" className="mt-0.5 text-[var(--bellum-text-muted)]">
        {hint}
      </Text>
      <Box className="mt-1 flex flex-col gap-1">
        {lines.map(line => (
          <Box key={line.key} display="flex" className="items-baseline justify-between gap-3">
            {line.count === null ? (
              /* Non lu. Ni un chiffre, ni un lien : « une valeur NON LUE ne dit
                 rien de ce qu'une liste contiendrait », et la population reste
                 NOMMÉE — « non mesuré » seul ne dit pas de quoi. */
              <UnknownValue reason={t(`contribution.population.${line.key}`)} />
            ) : (
              <PopulationLink
                label={t(`contribution.line.${line.key}`, { count: line.count })}
                to={LINE_POPULATIONS[line.key]}
                known={known}
              />
            )}
          </Box>
        ))}
      </Box>
    </Box>
  )
}

/**
 * La date d'origine des comptages, lisible.
 *
 * ⚠️ Une date illisible ne devient pas « aujourd'hui » ni une chaîne vide : elle
 * rend la valeur brute, qui dit au moins qu'il y a eu quelque chose. Sur l'écran
 * qui refuse le zéro menteur, un repli silencieux serait le pire des deux.
 */
function formatSince(since: string, language: string): string {
  const parsed = Date.parse(since)
  if (Number.isNaN(parsed)) return since
  return new Intl.DateTimeFormat(language, { dateStyle: 'long' }).format(new Date(parsed))
}

/**
 * Où vivent les objets que chaque ligne COMPTE.
 *
 * La table se lit sur les quatre requêtes de `contribution.service.ts`, une par
 * une : `FROM accounts`, `FROM opportunities`, `FROM submissions`, `FROM
 * missions`. Une destination « du même sujet » ne suffit pas — le geste que
 * l'utilisateur attend est de VOIR les objets comptés, pas d'atterrir sur un
 * écran voisin où il en cherchera d'autres.
 */
const LINE_POPULATIONS: Record<ContributionLine['key'], string> = {
  accounts_opened: '/accounts',
  needs_from_signal: '/projects/needs',
  submissions_from_matching: '/consultants',
  missions_signed: '/missions',
}

/**
 * Un comptage, et la porte vers ce qu'il compte — ou le comptage seul quand ce
 * navigateur ne connaît pas la destination. L'information ne disparaît jamais :
 * ce qu'on retire est le lien mort.
 */
function PopulationLink({
  label,
  to,
  known,
  muted = false,
}: {
  label: string
  to: string
  known: ReadonlySet<string>
  muted?: boolean
}) {
  const { t } = useTranslation('pilotage')
  const size = muted ? 'xs' : 'sm'

  if (!isReachable(to, known)) {
    return (
      <Text size={size} color={muted ? 'text-[var(--bellum-text-muted)]' : undefined}>
        {label}
      </Text>
    )
  }

  return (
    <Link
      to={to}
      // « 4 » n'est pas un nom accessible, et quatre liens qui se suivent
      // doivent se distinguer à l'oreille. Le libellé visible entre dans le nom
      // annoncé (WCAG 2.5.3, « label in name »).
      aria-label={t('population.openAria', { label })}
      className={cn(
        'inline-flex items-center rounded-md text-left text-[var(--bellum-text-accent)] underline-offset-4 hover:underline pointer-coarse:min-h-11',
        muted ? 'text-xs' : 'text-sm',
      )}
    >
      {label}
    </Link>
  )
}
