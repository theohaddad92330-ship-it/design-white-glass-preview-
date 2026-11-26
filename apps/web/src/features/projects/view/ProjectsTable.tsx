import type { ProjectRow } from '@bellum/contracts'
import { Badge, Box, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Text, cn } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { CompanyAvatar } from '@/components/ui/CompanyAvatar'
import { UnknownValue } from '@/components/primitives/UnknownValue'
import { formatDate } from '@/lib/locale'
import { daysSince, staleLevel, staleThresholdsFor } from '../model/stale-alert'
import type { StageSlaRow } from '@/features/settings/lib/stage-sla-api'
import { PROJECT_COLUMN_KEYS, type ProjectColumnKey } from '../model/project-columns'
import { describeOrigin } from '../model/project-provenance'

/**
 * LE PIPE EN TABLEAU — #1328 (9/9).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE L'ISSUE DEMANDE, MOT POUR MOT
 * ─────────────────────────────────────────────────────────────────────────────
 * « Ajouter un switch compact : Kanban | Tableau. La vue Tableau réutilise
 * **exactement les mêmes objets** : Projet / Compte / Owner / Stade / Montant /
 * Dernière activité / Prochaine action / Âge / Origine. »
 *
 * Les deux vues répondent à deux questions différentes, et c'est la seule raison
 * d'en avoir deux : le kanban répond « **où** ça s'accumule », le tableau répond
 * « **lequel** » — on y compare, on y trie du regard, on y scanne trente lignes
 * quand le kanban en montre huit. C'est le même partage que la liste et le
 * kanban des besoins ouverts, qui le disent déjà dans leur propre commentaire.
 *
 * ⚠️ Aucun objet nouveau, aucune requête nouvelle : le tableau reçoit le MÊME
 * tableau de `ProjectRow` que le board, déjà filtré par la lentille. Deux vues
 * qui iraient chercher leurs lignes séparément finiraient par ne pas afficher le
 * même pipe — c'est le défaut que ce dépôt appelle « deux dérivations qui
 * divergent », et il coûte cher parce qu'aucune des deux n'a l'air fausse.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI N'EST PAS UN 0
 * ─────────────────────────────────────────────────────────────────────────────
 * Un montant absent affiche « non mesuré », jamais « 0 € » — un 0 se lit
 * « gratuit ». Une origine absente n'affiche RIEN plutôt qu'« origine
 * inconnue » : une provenance inventée se relit six mois plus tard comme un
 * fait. Une prochaine action que l'API n'a pas dite (`undefined`) laisse la
 * cellule muette, là où `null` dit franchement « aucune ».
 */
export function ProjectsTable({
  projects,
  selectedId,
  onSelect,
  ownerName,
  columns = PROJECT_COLUMN_KEYS,
  slaRows,
}: {
  projects: readonly ProjectRow[]
  selectedId?: string
  onSelect: (project: ProjectRow) => void
  /** Le nom du porteur, résolu par l'appelant. `null` = non attribué. */
  ownerName: (ownerId: string | null) => string | null
  /** #4337.1 — les colonnes affichées (le menu « Colonnes ») ; le nom de l'affaire reste toujours. */
  columns?: readonly ProjectColumnKey[]
  /** #2170.43 — les seuils d'étape de l'espace ; absents = 7/14/30 (`staleThresholdsFor`). */
  slaRows?: readonly StageSlaRow[]
}) {
  const { t, i18n } = useTranslation('projects')
  const show = (key: ProjectColumnKey): boolean => columns.includes(key)

  const money = (cents: number): string =>
    new Intl.NumberFormat(i18n.language === 'en' ? 'en-GB' : 'fr-FR', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 0,
    }).format(cents / 100)

  return (
    /* Le tableau défile dans SON conteneur, jamais le corps de la page (D81) :
       neuf colonnes ne tiennent pas sous 1 100 px, et une page qui défile
       horizontalement emmène la barre latérale avec elle.

       #4337.1 — la zone qui défile est celle de `Table` (ombres de bord, tabulation) ; ici on lui borne la hauteur
       pour que sa barre horizontale reste TOUJOURS sous l'œil (sur trente lignes, elle serait tout en bas de la
       page), et le nom de l'affaire est collant à gauche. */
    <Box className="min-w-0 overflow-hidden rounded-xl border border-[var(--bellum-border)]">
      <Table viewportClassName="max-h-[70dvh] overflow-x-scroll">
        <TableHeader>
          <TableRow>
            <TableHead className={cn(HEAD, STICKY_NAME, 'top-0 z-20')}>{t('table.columns.project')}</TableHead>
            {show('origin') ? (
              <TableHead className={cn(HEAD, STICKY_HEAD)}>{t('table.columns.origin')}</TableHead>
            ) : null}
            {show('account') ? (
              <TableHead className={cn(HEAD, STICKY_HEAD)}>{t('table.columns.account')}</TableHead>
            ) : null}
            {show('owner') ? <TableHead className={cn(HEAD, STICKY_HEAD)}>{t('table.columns.owner')}</TableHead> : null}
            {show('stage') ? <TableHead className={cn(HEAD, STICKY_HEAD)}>{t('table.columns.stage')}</TableHead> : null}
            {show('amount') ? (
              <TableHead className={cn(HEAD, STICKY_HEAD)}>{t('table.columns.amount')}</TableHead>
            ) : null}
            {show('lastActivity') ? (
              <TableHead className={cn(HEAD, STICKY_HEAD)}>{t('table.columns.lastActivity')}</TableHead>
            ) : null}
            {show('nextAction') ? (
              <TableHead className={cn(HEAD, STICKY_HEAD)}>{t('table.columns.nextAction')}</TableHead>
            ) : null}
            {show('age') ? <TableHead className={cn(HEAD, STICKY_HEAD)}>{t('table.columns.age')}</TableHead> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {projects.map(project => {
            const days = daysSince(project.stage_entered_at)
            const level = days === null ? null : staleLevel(days, staleThresholdsFor(project.stage, slaRows))
            const origin = describeOrigin(project, t)
            const owner = project.owner_name ?? ownerName(project.owner_id)
            return (
              <TableRow
                key={project.id}
                onClick={() => onSelect(project)}
                aria-current={project.id === selectedId ? 'true' : undefined}
                className={cn(
                  'cursor-pointer',
                  project.id === selectedId && 'bg-[color-mix(in_srgb,var(--bellum-primary-500)_8%,transparent)]',
                )}
              >
                <TableCell className={cn(CELL, STICKY_NAME, 'max-w-[22rem]')}>
                  {/* Le libellé d'un projet DÉTECTÉ est une phrase entière — le
                      pipeline y écrit de la prose. Sans borne, cette colonne
                      mange la largeur des huit autres. La troncature mesure son
                      conteneur, ce qui la rend compatible avec D81, et le texte
                      complet reste en infobulle.

                      ⚠️ Un `<button>` DANS la cellule, en plus du clic de ligne :
                      un `<tr>` n'est ni bouton ni lien, il ne se tabule pas et ne
                      s'annonce pas (GA-35). Le clic de ligne n'est que son
                      raccourci à la souris. */}
                  <button
                    type="button"
                    onClick={event => {
                      event.stopPropagation()
                      onSelect(project)
                    }}
                    title={project.label}
                    className="block min-w-0 max-w-full truncate rounded-sm text-left underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bellum-primary-500)]"
                  >
                    <Text size="sm" weight="semibold" color="text-[var(--bellum-text-primary)]">
                      {project.label}
                    </Text>
                  </button>
                </TableCell>

                {/* #4336.2 — « Origine » en 2e colonne, juste après l'affaire. */}
                {show('origin') ? (
                  <TableCell className={CELL}>
                    {origin ? (
                      // #4336.1 — la pastille tient dans sa cellule : une origine longue se tronque, le texte complet
                      // reste au survol (31 pastilles débordaient et étaient coupées en vue Tableau).
                      <Badge
                        variant="outline"
                        title={origin}
                        className="block max-w-[10rem] truncate whitespace-nowrap px-1 py-0 text-xs"
                      >
                        {origin}
                      </Badge>
                    ) : null}
                  </TableCell>
                ) : null}
                {show('account') ? (
                  <TableCell className={CELL}>
                    <Box className="flex min-w-0 items-center gap-2">
                      <CompanyAvatar
                        name={project.company_name ?? t('pipeline.unknownAccount')}
                        logoUrl={project.logo_url}
                        website={project.website}
                      />
                      <Text size="sm" noWrap color="text-[var(--bellum-text-secondary)]" className="min-w-0 truncate">
                        {project.company_name ?? t('pipeline.unknownAccount')}
                      </Text>
                    </Box>
                  </TableCell>
                ) : null}

                {/* Un projet non attribué affiche « — », jamais le créateur du
                    compte : « non attribué » est l'état honnête de départ, et
                    inventer un porteur ferait relancer la mauvaise personne. */}
                {show('owner') ? (
                  <TableCell className={CELL}>
                    {owner ? (
                      <Text size="sm" noWrap color="text-[var(--bellum-text-secondary)]">
                        {owner}
                      </Text>
                    ) : (
                      <Dash />
                    )}
                  </TableCell>
                ) : null}

                {show('stage') ? (
                  <TableCell className={CELL}>
                    <Badge variant="secondary" className="whitespace-nowrap">
                      {t(`stage.states.${project.stage}`, { defaultValue: project.stage })}
                    </Badge>
                  </TableCell>
                ) : null}

                {/* « non mesuré » et jamais « 0 € » : un pipe non chiffré ne vaut
                    pas zéro euro, il n'a jamais été mesuré. */}
                {/* ⚠️ `UnknownValue` SANS sa raison, et la raison sur la cellule.
                    Mesuré en recette le 03/09 : la primitive écrit sa raison à
                    la suite du verdict (« non mesuré — Personne n'a saisi de
                    montant sur ce projet »), ce qui est juste sur une carte
                    large et repliait la phrase sur six lignes dans une colonne
                    de tableau. Les lignes faisaient 181 px là où l'issue en
                    demande 60 à 68, et le tableau perdait exactement ce pour
                    quoi il existe : voir beaucoup de projets d'un coup.

                    Le verdict reste — jamais « 0 € », qui se lirait
                    « gratuit ». C'est sa JUSTIFICATION qui passe au survol. */}
                {show('amount') ? (
                  <TableCell className={CELL} title={hasAmount(project) ? undefined : t('table.amountUnknownReason')}>
                    {hasAmount(project) ? (
                      <Text size="sm" noWrap className="tabular-nums text-[var(--bellum-text-primary)]">
                        {money(project.amount_cents as number)}
                      </Text>
                    ) : (
                      // `whitespace-nowrap` : sans lui « non mesuré » se coupe en
                      // deux dans une colonne étroite et fait respirer la ligne
                      // d'un cran — mesuré à 61 px contre 49 pour ses voisines.
                      <UnknownValue className="whitespace-nowrap" />
                    )}
                  </TableCell>
                ) : null}

                {/* « Dernière activité » = la dernière fois que la LIGNE a bougé
                    (`updated_at`), pas un rendez-vous : le pipe ne porte pas
                    d'événement, et écrire « RDV client » ici inventerait un fait.
                    Le mot du libellé de colonne est celui de l'issue ; ce qu'il
                    recouvre est dit en infobulle. */}
                {show('lastActivity') ? (
                  <TableCell className={CELL}>
                    <Text
                      size="sm"
                      noWrap
                      color="text-[var(--bellum-text-secondary)]"
                      title={t('table.lastActivityHint')}
                    >
                      {formatDate(project.updated_at, { dateStyle: 'medium' }) ?? <Dash />}
                    </Text>
                  </TableCell>
                ) : null}

                {show('nextAction') ? (
                  <TableCell className={cn(CELL, 'max-w-[18rem]')}>
                    {project.next_action === undefined ||
                    (project.next_action === null && project.stage === 'won') ? null : project.next_action === null ? (
                      <Text size="sm" noWrap color="text-[var(--bellum-text-muted)]">
                        {t('pipeline.cardNoNextAction')}
                      </Text>
                    ) : (
                      <Text
                        size="sm"
                        noWrap
                        color="text-[var(--bellum-text-secondary)]"
                        title={project.next_action.title}
                        className="block truncate"
                      >
                        {project.next_action.title}
                      </Text>
                    )}
                  </TableCell>
                ) : null}

                {/* L'ÂGE DANS L'ÉTAPE, coloré au même palier que la carte
                    (#1326 6/9.1) : deux vues du même pipe qui coloreraient
                    différemment le même projet feraient douter des deux. Une
                    date illisible dit « non mesuré » et jamais « 0 j » — les
                    deux se ressemblent et appellent des gestes opposés. */}
                {show('age') ? (
                  <TableCell className={CELL} title={days === null ? t('table.ageUnknownReason') : undefined}>
                    {days === null ? (
                      // Même règle que le montant : le verdict tient sur la ligne,
                      // sa raison au survol.
                      <UnknownValue className="whitespace-nowrap" />
                    ) : (
                      <Text size="sm" noWrap className={cn('tabular-nums', level ? AGE_TONE[level] : undefined)}>
                        {t('table.ageDays', { count: days })}
                      </Text>
                    )}
                  </TableCell>
                ) : null}
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </Box>
  )
}

/** Densité de la maquette du 27/08 (`03_tous_contacts_couverture.png`) : des
 *  lignes hautes de deux crans, un entête discret, aucune grosse zone blanche.
 *  Les valeurs suivent l'échelle Tailwind — les « 60–68 px » de l'issue s'y
 *  expriment en `py-2.5` sur une ligne de texte de 14 px. */
const HEAD = 'whitespace-nowrap text-xs font-medium text-[var(--bellum-text-muted)]'
const CELL = 'py-2.5 align-middle'

/** #4337.1 — le nom de l'affaire reste sous l'œil quand les autres colonnes défilent : collant à gauche, sur un fond
 *  OPAQUE (jeton de carte, deux thèmes) — sans lui les colonnes passeraient sous le texte — et un filet de bord. */
const STICKY_NAME = 'sticky left-0 z-10 bg-card shadow-[inset_-1px_0_0_var(--bellum-border)]'
/** L'entête reste aussi en haut quand la zone défile verticalement (hauteur bornée). */
const STICKY_HEAD = 'sticky top-0 z-10 bg-card'

/** Le même partage de tons que la carte du kanban — jetons de TEXTE, jamais la
 *  couleur sémantique nue, qui ne passe pas AA des deux côtés. */
const AGE_TONE = {
  attention: 'text-[var(--bellum-text-secondary)]',
  warning: 'text-[var(--warning-soft-text)]',
  danger: 'text-[var(--danger-soft-text)]',
} as const

/**
 * « Ce projet porte-t-il un montant ? » — la règle du serveur, recopiée nulle
 * part ailleurs qu'ici et dans `PipelineBoard`.
 *
 * Un montant qui n'est pas un nombre FINI n'est pas un montant : `typeof ===
 * 'number'` seul laisserait passer un `NaN`, et le tableau afficherait alors
 * « NaN € » là où le kanban dit « Montant non saisi ».
 */
function hasAmount(project: ProjectRow): boolean {
  return typeof project.amount_cents === 'number' && Number.isFinite(project.amount_cents)
}

function Dash() {
  return (
    <Text element="span" size="sm" color="text-[var(--bellum-text-muted)]">
      —
    </Text>
  )
}
