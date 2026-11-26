import type { CommercialLifecycle, SprintLevel } from '@bellum/contracts'
import { Popover, PopoverContent, PopoverTrigger, Text } from '@bellum/ui'
import { capitalize, compactSector } from '@bellum/utils'
import { useTranslation } from 'react-i18next'
import { headquartersCity } from '../account-detail/tabs/synthesis/accountSynthesis'

/**
 * #1417.1 / #1417.7 — LES FAITS ADMINISTRATIFS DE LA LIGNE, REPLIÉS.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE LE RETOUR DEMANDE, ET CE QU'IL NE DEMANDE PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * « Réduire les textes administratifs. Augmenter la densité utile. Les
 * informations secondaires passent en tooltip/drawer. » Et la grille de tri est
 * écrite juste après : au premier écran on doit voir **plusieurs comptes, leur
 * potentiel, leur accessibilité, leur signal, et l'action suivante**.
 *
 * Trois choses de la ligne ne sont dans aucune des cinq, et aucune ne qualifie
 * un nombre affiché à côté d'elle :
 *   · le libellé NAF ENTIER (il vivait dans un `title=`) ;
 *   · la TRANCHE d'effectif du registre (« 200 à 249 ») ;
 *   · l'ÉTAPE DU PIPE, qui occupait une colonne de 7rem pour un mot tronqué.
 * Elles se replient ici. Ce qui QUALIFIE un chiffre — la date de dernière
 * analyse et « À rafraîchir », qui disent si le score et le signal peuvent être
 * périmés — reste dans le flux, et une garde le tient
 * (`accountRowFoldsOnlyAdministrativeFacts.test.ts`).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE GESTE DÉCONGESTIONNE VRAIMENT LA LIGNE 2
 * ─────────────────────────────────────────────────────────────────────────────
 * Mesuré en production le 06/09/2026, à 1 456 px : la 2ᵉ ligne fait **159 px**
 * pour **561 px** de besoin cumulé — secteur 89 px rendus / 423 requis,
 * effectif 29 / 138. Deux `flex-auto` se partageaient une largeur qui manquait
 * déjà à un seul : les DEUX étaient tronqués. En retirant l'effectif du flux, le
 * secteur cesse de partager — c'est le même raisonnement qui a fait retirer
 * « N parcours observés » (#1577), et la même conclusion : un fragment rendu
 * dans 7 px n'affiche rien, il vole de la place.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE PATRON EST CELUI DE `Completeness` (#1866), PAS UN NOUVEAU
 * ─────────────────────────────────────────────────────────────────────────────
 * · Un `<button type="button">` — ce qui se clique se tabule (GA-35). Jamais un
 *   `title=` : le dépôt a déjà payé « la donnée rangée dans un attribut
 *   title », qui n'existe ni au clavier ni au doigt.
 * · Le nom accessible du bouton est son TEXTE plus un indice en `sr-only`, et
 *   **jamais un `aria-label`** : celui-ci REMPLACERAIT la phrase visible, et un
 *   lecteur d'écran perdrait ce qu'on voulait justement garder. L'indice nomme
 *   le compte — vingt-cinq « Détail du compte » identiques ne se distinguent
 *   pas.
 * · Pas de plancher tactile de 44 px, et c'est l'exception que GA-30 nomme
 *   elle-même : la ligne est FIXÉE à 64 px et porte deux lignes de texte ; un
 *   plancher sur un enfant pousserait la seconde hors de la boîte. C'est déjà
 *   le choix de `SignalPreviewTrigger` et d'`AccountMarketContextButton`, dans
 *   la même ligne.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES TROIS REFUS
 * ─────────────────────────────────────────────────────────────────────────────
 * · **Absent ⇒ RIEN.** Un effectif inconnu n'est pas une entreprise sans
 *   salarié : pas de « 0 », pas de « — », pas de « non renseigné ».
 * · **Rien deux fois.** Le libellé entier ne s'écrit que s'il dit PLUS que le
 *   secteur lisible ; sinon la ligne « Secteur » n'existe pas (loi 4 du tome 7).
 * · **Le flux garde un ancrage.** Sans secteur lisible, c'est l'étape du pipe
 *   qui se montre — jamais un bouton vide, qui serait une porte invisible.
 */
export function AccountRowFacts({
  companyName,
  sector,
  headquarters,
  employees,
  commercialStatus,
  sprint,
  ownerName,
  sprintReason,
  sprintReviewAt,
  lastActionAt,
}: {
  companyName: string
  /** La chaîne d'enrichissement COMPLÈTE (libellé, NAF, verbiage du registre). */
  sector: string | null | undefined
  /** #4497.a — le siège du registre ; la ville s'en tire (`headquartersCity`). Absent ou sans ville ⇒ rien. */
  headquarters?: string | null
  /** La TRANCHE telle que le registre la publie (« 200 à 249 »), jamais un nombre. */
  employees: string | null | undefined
  /** L'étape du pipe. `undefined` = ligne antérieure à la colonne ⇒ « À trier ». */
  commercialStatus: CommercialLifecycle | undefined
  /**
   * #3407 — le NIVEAU D'EFFORT et les faits d'action de la ligne. Ils vivaient
   * dans un badge `shrink-0` sur la ligne 2, qui écrasait le secteur à 0 px
   * (recette du 30/09) : ils se lisent maintenant dans CE texte (préfixe) et
   * ce repli. Absent ⇒ RIEN — jamais un niveau, une raison ou une action
   * devinés.
   */
  sprint?: SprintLevel | null
  /** #3407 — le responsable du compte (« Toi » quand c'est l'occupant) ; absent ⇒ rien. */
  ownerName?: string | null
  sprintReason?: string | null
  sprintReviewAt?: string | null
  lastActionAt?: string | null
}) {
  const { t, i18n } = useTranslation('accounts')
  // Le MÊME lexique que le board d'effort (`sprints.json#levels`, GA-26).
  const { t: tSprint } = useTranslation('sprints')
  const formatDate = (iso: string) => new Date(iso).toLocaleDateString(i18n.language)

  const full = sector?.trim() || null
  const readable = compactSector(sector)
  const headcount = employees?.trim() || null
  // i18n keys: commercialStatus.inbox | commercialStatus.watching | commercialStatus.opportunity | commercialStatus.customer | commercialStatus.archived
  const stage = t(`commercialStatus.${commercialStatus ?? 'inbox'}`)

  // Ce qui reste VISIBLE. Le secteur lisible d'abord — c'est lui qui qualifie le
  // compte d'un coup d'œil ; à défaut, l'étape du pipe, pour que la ligne 2 ne
  // soit jamais un bouton sans texte.
  const city = headquartersCity(headquarters)
  const base = readable ?? stage
  // Maquette V22 : « Aéronautique · Blagnac ». Sans ville, le texte d'avant, à l'octet près.
  const visible = city ? `${base} · ${city}` : base
  // Le libellé entier ne se replie que s'il dit PLUS que le texte visible.
  // Avec un niveau d'effort, la ligne visible tient sur UNE ligne (#3407, Y18) :
  // le secteur entier se lit alors TOUJOURS dans le repli, jamais perdu.
  const foldedSector = full && (full !== base || sprint || ownerName) ? full : null

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid="account-facts-trigger"
          /* #3508 — le libellé ENTIER se lit : plus de `truncate` (mesuré en
             recette démo le 01/10 : 85×16 px pour 294 px de contenu, l'effort
             et le secteur coupés). Il se replie sur plusieurs lignes, et la
             ligne 2 passe à la ligne (`flex-wrap`) plutôt que d'écraser son
             unique texte ; `min-h-11` tient la cible tactile à 44 px.
             `flex-auto` + `min-w-0` : l'UNIQUE prétendant de la ligne 2. Le
             soulignement pointillé dit qu'il y a quelque chose dessous sans se
             lire comme un lien de navigation. Jetons uniquement : une couleur
             en dur ne suivrait pas le thème (D79, GA-33). */
          className="inline-flex min-h-11 min-w-0 flex-auto basis-40 items-center whitespace-normal break-normal hyphens-none rounded-sm text-left text-xs leading-4 text-[var(--bellum-text-secondary)] underline decoration-dotted decoration-from-font underline-offset-2 transition-colors hover:text-[var(--bellum-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bellum-primary-500)]"
          /* La ligne entière ouvre le dossier : sans cet arrêt, un clic sur le
             secteur quitterait l'écran au lieu d'ouvrir le repli. Pas de
             `preventDefault` — Radix compose et ouvre (leçon de #1416). */
          onClick={event => event.stopPropagation()}
        >
          {/* #3407 — UN seul élément flex : le préfixe d'effort et le secteur
              forment un même texte qui se replie ensemble. Séparés, le
              préfixe devenait un 2ᵉ élément flex qui se rétrécissait à 57 px
              (« Route partenaire » sur 3 lignes) quand le secteur était long. */}
          <span className={sprint || ownerName ? 'line-clamp-1 min-w-0' : 'min-w-0'}>
            {(sprint || ownerName) && (
              <span className="whitespace-nowrap font-medium text-[var(--bellum-text-primary)]">
                {[
                  sprint ? t('list.effortInline', { level: tSprint(`levels.${sprint}`) }) : null,
                  ownerName ? t('list.ownerInline', { name: ownerName }) : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}{' '}
                ·{' '}
              </span>
            )}
            {visible}
          </span>
          {/* Le nom accessible = le texte ci-dessus PLUS cet indice. Un
              `aria-label` aurait remplacé le premier (patron #1866). */}
          <span className="sr-only"> {t('list.rowFactsHint', { company: capitalize(companyName) })}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="top"
        sideOffset={8}
        onClick={event => event.stopPropagation()}
        className="w-[280px] rounded-xl border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-3 shadow-[var(--shadow-elevated)]"
      >
        <Text element="p" size="xs" weight="semibold" className="text-[var(--bellum-text-primary)]">
          {t('list.rowFactsTitle')}
        </Text>
        <dl className="mt-2 space-y-1.5">
          {foldedSector && <RowFact label={t('table.sector')} value={foldedSector} />}
          {headcount && <RowFact label={t('table.employees')} value={headcount} />}
          {/* Rien ne se perd : l'étape fine (7 valeurs) reste lisible sous la relation (3 statuts). */}
          <RowFact label={t('table.commercialStatus')} value={stage} />
          {ownerName && <RowFact label={t('list.ownerLabel')} value={ownerName} />}
          {sprint && <RowFact label={t('list.effortLevelLabel')} value={tSprint(`levels.${sprint}`)} />}
          {sprint && sprintReason && <RowFact label={t('list.effortReasonLabel')} value={sprintReason} />}
          {sprint && sprintReviewAt && (
            <RowFact label={t('list.effortReviewLabel')} value={formatDate(sprintReviewAt)} />
          )}
          {lastActionAt && <RowFact label={t('list.lastActionLabel')} value={formatDate(lastActionAt)} />}
          {/* Refonte Théo — la PROCHAINE action a quitté le repli : elle s'écrit dans « Sujet & prochaine action ». */}
        </dl>
      </PopoverContent>
    </Popover>
  )
}

/**
 * Une ligne « intitulé → fait ». `<dt>`/`<dd>` natifs et non `Text` : la
 * primitive partagée n'accepte que dix éléments, et ces deux balises n'en font
 * pas partie — élargir son union pour deux balises toucherait un composant
 * utilisé des centaines de fois. Même choix que `MarketContextLine`, juste à
 * côté. `text-xs` est bien sur l'échelle (12 px, le plancher de D80).
 *
 * ⚠️ La valeur s'ALIGNE À DROITE mais ne se tronque pas : un libellé NAF fait
 * une phrase, et le replier pour le couper ensuite n'aurait servi à rien.
 */
function RowFact({ label, value, testId }: { label: string; value: string; testId?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-xs text-[var(--bellum-text-muted)]">{label}</dt>
      <dd data-testid={testId} className="min-w-0 text-right text-xs font-medium text-[var(--bellum-text-primary)]">
        {value}
      </dd>
    </div>
  )
}
