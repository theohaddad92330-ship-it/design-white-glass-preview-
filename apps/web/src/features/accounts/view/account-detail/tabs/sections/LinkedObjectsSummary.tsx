import { Badge, Box, Button, Text } from '@bellum/ui'
import { Link } from '@tanstack/react-router'

/**
 * #2124 (lot M1-9) — LE RÉSUMÉ COMPACT DES OBJETS LIÉS AU COMPTE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE GESTE EMPÊCHÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * Depuis le dossier d'un compte, on ne voyait pas d'un coup ce qui est ACTIF
 * dessus : le tableau détaillé existait (`TabProjects`, `TabMissions`), mais
 * aucune vue ne répondait à « qu'est-ce qu'il faut que je regarde MAINTENANT,
 * et qu'est-ce que je peux faire dessus ». Ce composant est ce résumé —
 * générique, monté par ses deux appelants avec des données différentes
 * (opportunités/besoins/projets plausibles depuis `TabProjects`, missions
 * depuis `TabMissions`).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ UNE VALEUR ABSENTE NE S'AFFICHE JAMAIS « 0 »
 * ─────────────────────────────────────────────────────────────────────────────
 * Le porteur (`ownerName`) et le signal « profil positionné » DISPARAISSENT
 * quand ils ne sont pas mesurés — jamais un identifiant brut, jamais un tiret
 * muet, jamais un zéro. Un bucket sans ligne affiche sa phrase dédiée, jamais
 * une liste vide silencieuse.
 */
export interface LinkedObjectSummaryAction {
  label: string
  to?: string
  /** #2150.39 — le filtre à poser sur `to` (ex. `{ company: account.companyName }`
   *  pour ouvrir l'annuaire canonique déjà scopé) : le MÊME mécanisme `search`
   *  que partout ailleurs, jamais une route dédiée par appelant (GA-26). */
  search?: Record<string, string>
  /** #3676 — les paramètres de chemin d'une route d'objet (`/projects/$id`). */
  params?: Record<string, string>
  onClick?: () => void
  disabled?: boolean
}

export interface LinkedObjectSummaryRow {
  id: string
  label: string
  /** Porteur côté ESN (#2124.5). `null` = non résolu ou non attribué : la
   *  ligne se tait plutôt que d'écrire un identifiant ou un tiret muet. */
  ownerName: string | null
  /** Profil ou consultant positionné (#2124.9), déjà traduit par l'appelant.
   *  `undefined`/vide = rien à affirmer, la ligne se tait — ce n'est pas la
   *  même chose que « mesuré : personne n'est positionné ». */
  positionedLabel?: string
  /** #3676.6 — la nature de la ligne, déjà traduite par l'appelant (« Demande confirmée »). */
  natureLabel?: string
  /** Statut de renouvellement (#2124.23), déjà traduit par l'appelant — la
   *  dérivation elle-même (fenêtres de renouvellement) reste dans
   *  `@bellum/contracts`, un seul endroit. */
  renewalLabel?: string
  /** #3918 — l'issue d'une affaire passée (gagnée / perdue / en sommeil) et sa date. */
  outcomeLabel?: string
  /** Risques identifiés (#2124.24), déjà traduits par l'appelant. `[]` =
   *  calculé, rien à signaler (l'appelant écrit sa propre phrase pour ce cas
   *  s'il le souhaite) ; absent = non applicable à cette ligne. */
  riskLabels?: readonly string[]
  actions: readonly LinkedObjectSummaryAction[]
}

export interface LinkedObjectsSummaryBucket {
  key: string
  title: string
  emptyLabel: string
  rows: readonly LinkedObjectSummaryRow[]
  /** #3918 — une rubrique sans ligne ne fait aucune section (jamais « (0) »). */
  hideWhenEmpty?: boolean
}

export function LinkedObjectsSummary({ buckets }: { buckets: readonly LinkedObjectsSummaryBucket[] }) {
  return (
    <Box className="space-y-4">
      {buckets
        .filter(bucket => !bucket.hideWhenEmpty || bucket.rows.length > 0)
        .map(bucket => (
          <Box key={bucket.key} className="space-y-2" data-testid={`linked-objects-summary-${bucket.key}`}>
            <Text size="sm" weight="semibold" color="text-[var(--bellum-text-primary)]">
              {`${bucket.title} (${bucket.rows.length})`}
            </Text>
            {bucket.rows.length === 0 ? (
              <Text size="sm" color="text-[var(--bellum-text-muted)]">
                {bucket.emptyLabel}
              </Text>
            ) : (
              <Box className="space-y-2">
                {bucket.rows.map(row => (
                  <SummaryRow key={row.id} row={row} />
                ))}
              </Box>
            )}
          </Box>
        ))}
    </Box>
  )
}

function SummaryRow({ row }: { row: LinkedObjectSummaryRow }) {
  // #2124.5/.9/.23 — chaque bribe est OPTIONNELLE et ne s'affiche que si elle
  // est mesurée ; le séparateur ` · ` n'apparaît qu'entre deux bribes réelles.
  const metaParts: string[] = []
  if (row.outcomeLabel) metaParts.push(row.outcomeLabel)
  if (row.ownerName) metaParts.push(row.ownerName)
  if (row.renewalLabel) metaParts.push(row.renewalLabel)

  return (
    <Box className="flex flex-col gap-2 rounded-md border border-[var(--bellum-border)] p-3 sm:flex-row sm:items-center sm:justify-between">
      <Box className="min-w-0 flex-1 space-y-1">
        {/* #2708.2 — RÉFUTÉ en prod le 23/09 : le libellé d'un projet/besoin/
            mission résumé ici porte le texte intégral d'un signal détecté par
            l'analyse (jusqu'à ~470 caractères, aucune borne de longueur), et
            c'est CE composant — pas TabProjects.tsx:298, jamais monté pour
            « Projets plausibles » — qui rend la ligne mesurée à 100 px sur
            18 lignes en prod. `line-clamp-2` borne la HAUTEUR, `title` garde
            le texte intégral atteignable au survol (GA-385, même correctif
            que QualificationLeadsQueue.tsx pour #2708.1). */}
        <Text
          size="sm"
          weight="medium"
          color="text-[var(--bellum-text-primary)]"
          className="line-clamp-2 break-words"
          title={row.label}
        >
          {row.label}
        </Text>
        {metaParts.length > 0 ? (
          <Text size="xs" color="text-[var(--bellum-text-secondary)]">
            {metaParts.join(' · ')}
          </Text>
        ) : null}
        <Box className="flex flex-wrap items-center gap-1">
          {row.natureLabel ? (
            <Badge variant="outline" className="px-1 py-0 text-xs">
              {row.natureLabel}
            </Badge>
          ) : null}
          {row.positionedLabel ? (
            <Badge variant="outline" className="px-1 py-0 text-xs">
              {row.positionedLabel}
            </Badge>
          ) : null}
          {(row.riskLabels ?? []).map(risk => (
            <Badge key={risk} variant="outline" className="px-1 py-0 text-xs">
              {risk}
            </Badge>
          ))}
        </Box>
      </Box>
      <Box className="flex flex-wrap items-center gap-2">
        {row.actions.map(action =>
          action.to ? (
            <Button key={action.label} asChild variant="outline" size="sm" className="pointer-coarse:min-h-11">
              <Link to={action.to} search={action.search} params={action.params}>
                {action.label}
              </Link>
            </Button>
          ) : (
            <Button
              key={action.label}
              type="button"
              variant="outline"
              size="sm"
              className="pointer-coarse:min-h-11"
              disabled={action.disabled}
              onClick={action.onClick}
            >
              {action.label}
            </Button>
          ),
        )}
      </Box>
    </Box>
  )
}
