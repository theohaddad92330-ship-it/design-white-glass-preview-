import { useTranslation } from 'react-i18next'
import { Building2, Mail, MapPin, Phone } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { Button } from '@bellum/ui'
import { AskLaura } from '@/components/primitives/AskLaura'
import type { DiscoverContactRow } from '@/features/discover/lib/discover-contact-rows'

/* ------------------------------------------------------------------ */
/*  #2166.15-.25 — UNE PERSONNE, une ligne.                             */
/*                                                                     */
/*  Deux choses que cette ligne ne fait PAS, et c'est délibéré :        */
/*                                                                     */
/*  - elle n'écrit aucune coordonnée (#2166.22). « E-mail disponible »  */
/*    suffit à décider d'ouvrir la fiche ; l'adresse dans une liste     */
/*    sort de l'écran de travail dès la première capture d'écran ;      */
/*  - elle ne dit JAMAIS « vérifié » (décision Louis 15/09). Elle dit   */
/*    « poste vu le <date>, source <la source> » — et RIEN quand la     */
/*    date manque (#2613, décision Louis 20/09 : on affiche pas ce      */
/*    qu'on a pas). Jamais « faux », jamais « 0 » : juste silencieuse.  */
/*                                                                     */
/*  #2150.37 — LA PORTE D'ENTRÉE « Découvrir > Contacts ».              */
/*  `row.id` EST DÉJÀ le contact canonique (`discover-contact-rows.ts`, */
/*  `id: item.id`, lui-même un `ContactListItem` de la base UNIQUE) :    */
/*  Découvrir ne recopie rien, il cherche DANS les contacts déjà         */
/*  collectés (voir `contactsResult.scope`). Il ne manquait qu'un        */
/*  bouton vers `/contacts/$id` — la MÊME fiche qu'ouvrent le compte,    */
/*  la séquence et l'annuaire (GA-26 : une seule fonction d'entrée).     */
/* ------------------------------------------------------------------ */

function formatDate(iso: string, locale: string): string {
  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) return iso
  return parsed.toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' })
}

interface ContactResultRowProps {
  row: DiscoverContactRow
}

export function ContactResultRow({ row }: ContactResultRowProps) {
  const { t, i18n } = useTranslation('discover')
  const { t: tContacts } = useTranslation('contacts')

  return (
    <div
      className="flex flex-wrap items-start gap-x-4 gap-y-2 rounded-xl px-4 py-3"
      style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
    >
      <div className="flex min-w-[220px] flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {/* #2166.15 */}
          <span className="text-sm font-semibold leading-tight text-[color:var(--text-primary)]">{row.fullName}</span>
          {/* #2166.20 — le rôle commercial, dans le vocabulaire déjà posé. */}
          {row.decisionRole && (
            <span
              className="rounded-full px-2 py-0.5 text-xs"
              style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-secondary)',
              }}
            >
              {tContacts(`roles.${row.decisionRole}`)}
            </span>
          )}
          {/* #2165.41 — où en est la relation de l'espace avec cette personne. */}
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {tContacts(`status.value.${row.relation}`)}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs" style={{ color: 'var(--text-muted)' }}>
          {/* #2166.17 */}
          {row.title && <span>{row.title}</span>}
          {/* #2166.16 */}
          {row.company && (
            <span className="inline-flex items-center gap-1">
              <Building2 className="h-[10px] w-[10px]" aria-hidden />
              {row.company}
            </span>
          )}
          {/* #2166.18 */}
          {row.entity && <span>{row.entity}</span>}
          {/* #2165.38 — le lieu de travail COLLECTÉ, et seulement lui. Absent,
              rien ne s'affiche ici : la ligne le dit plus bas (« Non su : la
              localisation »), elle n'écrit ni vide ni siège emprunté. */}
          {row.location && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-[10px] w-[10px]" aria-hidden />
              {row.location}
            </span>
          )}
          {/* #2166.22 — la DISPONIBILITÉ du canal, jamais sa valeur. */}
          {row.channels.email && (
            <span className="inline-flex items-center gap-1">
              <Mail className="h-[10px] w-[10px]" aria-hidden />
              {t('contactsResult.channelAvailable.email')}
            </span>
          )}
          {row.channels.phone && (
            <span className="inline-flex items-center gap-1">
              <Phone className="h-[10px] w-[10px]" aria-hidden />
              {t('contactsResult.channelAvailable.phone')}
            </span>
          )}
        </div>

        {/* G-FIX #4309 — le même geste que sur la carte d'un compte : Laura s'ouvre sur place avec la
            personne (et son compte, quand il existe) en portée. */}
        <AskLaura
          question={t('contactsResult.explainWithLauraQuestion', { name: row.fullName, company: row.company ?? '' })}
          label={t('actions.explainWithLaura')}
          accountId={row.accountId ?? undefined}
          alwaysVisible
        />

        {/* #2166.23 — la raison, telle qu'elle a été collectée. */}
        {row.reason && (
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            {row.reason}
          </p>
        )}

        {/* #2166.21 / #2166.24 — la provenance : source ET date, jamais « vérifié ».
            #2613 — et SEULEMENT ce qu'on a. Sans date observée, la ligne
            n'existe pas (elle disait « Poste non confirmé — aucune date de
            dernière vérification ») ; sans source, la date se dit seule (elle
            traînait « source non renseignée »). Décision de Louis du
            20/09/2026 : on affiche ce qu'on sait. */}
        {row.provenance.seenAt && (
          <p className="text-xs" style={{ color: 'var(--text-ghost)' }}>
            {row.provenance.sourceTag
              ? t('contactsResult.seenAt', {
                  date: formatDate(row.provenance.seenAt, i18n.language),
                  source: t(`contactsResult.sourceTag.${row.provenance.sourceTag}`),
                })
              : t('contactsResult.seenAtOnly', { date: formatDate(row.provenance.seenAt, i18n.language) })}
          </p>
        )}

        {/* #2613 — la ligne « Non su : … » (#2166.25) est RETIRÉE : son seul
            contenu était une absence, sous une ligne de liste. `row.unknown`
            reste au MODÈLE — il sert aux filtres, qui n'écartent jamais une
            personne sur une absence (GA-259). Ne pas afficher n'est pas ne pas
            savoir. */}
      </div>

      {/* #2150.37 — la porte : ouvre la fiche canonique, jamais une copie.
          #3720.6 (retour bêta SKAIZen, Laura, 22/09) — « impossible d'ouvrir
          dans un nouvel onglet depuis le tableau des contacts ». Le bouton
          naviguait par `onClick` + `navigate()`, sans `href` : clic droit,
          ctrl/cmd-clic et clic molette ne proposaient rien. Même correctif
          que #2719 (ContactTableRow) — `asChild` prête le style du bouton à
          un vrai `<Link>`, qui rend ces gestes natifs au navigateur. */}
      <Button type="button" variant="outline" size="sm" className="pointer-coarse:min-h-11" asChild>
        <Link to="/contacts/$id" params={{ id: row.id }}>
          {t('contactsResult.openFiche')}
        </Link>
      </Button>
    </div>
  )
}
