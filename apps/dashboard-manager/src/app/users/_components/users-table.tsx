'use client'

import { useMemo, useState, type JSX } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { DataTable, EmptyState, FilterBar, type DataTableColumn } from '@/ui'
import { readFilterFromSearch, withFilterInSearch } from '@/ui/FilterBar.logic'
import { EmailEnClair } from '@/app/_components/email-en-clair'
import { UserRowActions } from '@/app/clients/_components/user-row-actions'
import { PlanSelect } from './plan-select'
import { SuspendUser } from './suspend-user'
import { PosteDeTravailSeulement } from '@/ui'
import { jourCompact } from '@/lib/dates'
import {
  FILTRES,
  LIBELLES_FILTRES,
  compterEtatsNonLus,
  compterParFiltre,
  filtrer,
  libelleConnexion,
  libelleEtat,
  libellePortee,
  libelleRoles,
  triConnexion,
  triEspaces,
  triEtat,
  type Filtre,
  type LigneUtilisateur,
} from '../users.logic'

/**
 * L'ANNUAIRE DENSE DES UTILISATEURS (#1664).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES HUIT COLONNES DEMANDÉES, ET CE QUE CHACUNE PROMET
 * ─────────────────────────────────────────────────────────────────────────────
 * `Nom · Email · Espace · Rôle · Créé · Dernière connexion · État · Actions`.
 * Deux d'entre elles n'existaient nulle part avant ce lot — « Dernière
 * connexion » et « État » vivent côté Supabase, pas dans nos tables, et c'est
 * une lecture agrégée (`GET internal/admin/users-auth-states`) qui les apporte
 * en un appel plutôt qu'un par ligne.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * « JAMAIS CONNECTÉ » ET « ON NE SAIT PAS » NE SE RESSEMBLENT PAS ICI
 * ─────────────────────────────────────────────────────────────────────────────
 * La cellule écrit « jamais connecté » quand c'est MESURÉ, et « non lu » quand
 * l'état n'a pas pu être lu. La pilule « Jamais connectés » ne ramasse que les
 * premiers. Le nombre d'états non lus s'AFFICHE sous les pilules : sans lui,
 * « 18 actifs · 2 suspendus » sur 30 comptes se lit comme une erreur ou, pire,
 * ne se remarque pas. La décision vit dans `users.logic.ts`, testée.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI « SUSPENDRE » REVIENT EN LIGNE, ALORS QU'IL AVAIT ÉTÉ REFUSÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * `user-row-actions.tsx` l'écrit : « l'annuaire ne porte pas l'état
 * d'authentification — le lire coûterait un appel par utilisateur ». La raison
 * était juste ; elle ne l'est plus, parce que la ligne PORTE désormais cet
 * état. Le geste ne s'ouvre que sur un état MESURÉ : un compte « non lu »
 * n'offre aucun bouton, exactement pour la raison qui l'avait fait refuser.
 *
 * La SUPPRESSION, elle, reste sur la fiche — et cette décision-là ne bouge pas :
 * « une suppression à un clic dans une liste triée finit par tomber sur la ligne
 * d'à côté ». Sa confirmation nommée existe déjà là-bas (#1664.2).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI LE PANNEAU EST SOUS LE TABLEAU
 * ─────────────────────────────────────────────────────────────────────────────
 * Une confirmation qui nomme la conséquence fait cinq à sept lignes de texte.
 * Dans une cellule, `DataTable` la couperait (`overflow: auto` borne son propre
 * débordement) et la ligne exploserait en hauteur. Le panneau vit donc sous le
 * tableau, comme celui de `/revenus/clients` — tabulable, jamais coupé, et
 * `aria-controls` désigne un élément qui existe toujours.
 */
/**
 * #1672.4 — le texte sur lequel matche la recherche en tête de tableau. Un
 * `join` sur un tableau plutôt qu'un gabarit à interpolation — cette
 * dernière forme écrite avec l'adresse de la ligne est exactement ce que
 * `emails-masques-dans-les-listes.test.ts` refuse (et ce fichier ne strippe
 * même pas les commentaires avant de lire, donc une simple MENTION de cette
 * forme suffirait à le déclencher : mesuré en écrivant ce commentaire).
 */
function texteRecherche(ligne: LigneUtilisateur): string {
  return [ligne.fullName, ligne.email, libelleRoles(ligne.espaces), ligne.plan, ...ligne.espaces.map(e => e.name)]
    .filter(Boolean)
    .join(' ')
}

export function UsersTable({
  lignes,
  authComplete,
  fermeesParPlan,
}: {
  lignes: readonly LigneUtilisateur[]
  /** Ce que chaque palier N'ouvre PAS (PLAN-GATE #4381), lu dans le catalogue. */
  fermeesParPlan: Readonly<Record<string, string[]>>
  /** `false` = le magasin d'authentification n'a pas tout dit. La phrase sous
   *  les pilules change de raison, elle ne disparaît pas. */
  authComplete: boolean
}) {
  // #1673.2 — le filtre vit dans l'URL, pas dans un `useState` : un lien
  // copié ou un retour arrière doit rouvrir le même filtre. Motif copié de
  // `app/queues/page.tsx:97,126`, généralisé dans `FilterBar.logic.ts`.
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const filtre = readFilterFromSearch(searchParams.toString(), 'filtre', FILTRES, 'tous')
  const [selection, setSelection] = useState<string | null>(null)

  function setFiltre(next: Filtre): void {
    const qs = withFilterInSearch(searchParams.toString(), 'filtre', next, 'tous')
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }

  const comptes = useMemo(() => compterParFiltre(lignes), [lignes])
  const nonLus = useMemo(() => compterEtatsNonLus(lignes), [lignes])
  const visibles = useMemo(() => filtrer(lignes, filtre), [lignes, filtre])
  const choisie = visibles.find(l => l.userId === selection) ?? null

  const colonnes: DataTableColumn<LigneUtilisateur>[] = [
    {
      key: 'nom',
      header: 'Nom',
      sortValue: row => row.fullName,
      // C'est la colonne NOM qui porte le lien vers la fiche — jamais la colonne
      // e-mail : un `<button>` de révélation dans un `<a>` est du HTML invalide,
      // et le lien avalerait le clic (#1670.4, mesuré en prod le 06/09/2026).
      render: row => (
        <a className="link" href={`/users/${encodeURIComponent(row.userId)}`} style={{ color: 'var(--text)' }}>
          {row.fullName || 'Voir la fiche'}
        </a>
      ),
    },
    {
      key: 'email',
      header: 'Email',
      sortValue: row => row.email,
      render: row => <EmailEnClair email={row.email} />,
    },
    {
      key: 'espace',
      header: 'Espace',
      sortValue: row => triEspaces(row.espaces),
      render: row =>
        row.espaces.length === 0 ? (
          <span className="muted">aucun espace</span>
        ) : (
          <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap' }}>
            {row.espaces.map(espace => (
              <a
                key={espace.id}
                className="pill"
                href={`/esn/${encodeURIComponent(espace.id)}`}
                style={{ textDecoration: 'none' }}
              >
                {espace.name}
              </a>
            ))}
          </span>
        ),
    },
    {
      key: 'role',
      header: 'Rôle',
      sortValue: row => libelleRoles(row.espaces),
      render: row => <span className="muted">{libelleRoles(row.espaces)}</span>,
    },
    {
      key: 'offre',
      header: 'Offre',
      sortValue: row => row.plan,
      render: row => (
        <PlanSelect
          userId={row.userId}
          plan={row.plan}
          portee={libellePortee(row.planScope)}
          fermeesParPlan={fermeesParPlan}
        />
      ),
    },
    {
      key: 'cree',
      header: 'Créé',
      sortValue: row => row.createdAt,
      render: row => <span className="muted">{jourCompact(row.createdAt)}</span>,
    },
    {
      key: 'connexion',
      header: 'Dernière connexion',
      sortValue: row => triConnexion(row.connexion),
      render: row => {
        const libelle = libelleConnexion(row.connexion, jourCompact)
        return <span style={{ color: libelle.ton === 'absent' ? 'var(--muted)' : 'var(--text)' }}>{libelle.texte}</span>
      },
    },
    {
      key: 'etat',
      header: 'État',
      sortValue: row => triEtat(row.compte),
      render: row => {
        const libelle = libelleEtat(row.compte)
        return <span className={`badge ${libelle.badge}`}>{libelle.texte}</span>
      },
    },
    {
      key: 'actions',
      header: 'Actions',
      render: row => (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}>
          <UserRowActions userId={row.userId} email={row.email} />
          {row.compte.etat === 'inconnu' ? null : (
            <button
              type="button"
              className="link"
              aria-expanded={selection === row.userId}
              aria-controls="panneau-utilisateur"
              style={{ background: 'none', border: 0, padding: 0, font: 'inherit', cursor: 'pointer' }}
              onClick={() => setSelection(selection === row.userId ? null : row.userId)}
            >
              {row.compte.etat === 'suspendu' ? 'Réactiver…' : 'Suspendre…'}
            </button>
          )}
        </span>
      ),
    },
  ]

  if (lignes.length === 0) {
    return <EmptyState icon="◇" message="Aucun utilisateur. Rien à administrer tant que personne ne s’est inscrit." />
  }

  return (
    <>
      <FilterBar
        pills={FILTRES.map(cle => ({ key: cle, label: LIBELLES_FILTRES[cle], count: comptes[cle] }))}
        activeKey={filtre}
        defaultKey="tous"
        onSelect={key => {
          setFiltre((FILTRES as readonly string[]).includes(key) ? (key as Filtre) : 'tous')
          // Une ligne choisie qui sort du filtre laisserait un panneau
          // orphelin, ouvert sur quelqu'un qu'on ne voit plus.
          setSelection(null)
        }}
        onClear={() => {
          setFiltre('tous')
          setSelection(null)
        }}
        labels={{ clear: 'Réinitialiser le filtre', advanced: 'Filtres avancés' }}
      />

      {/* ⚠️ Ce chiffre est ce qui rend « actifs + suspendus = tous » vérifiable.
          Il s'affiche même à zéro — une phrase qui n'apparaît qu'en cas de
          problème ne se lit pas, elle se découvre. */}
      <p className="muted" style={{ fontSize: 12, margin: '0 0 12px' }}>
        {nonLus === 0
          ? `État d’authentification lu pour les ${comptes.tous} compte${comptes.tous > 1 ? 's' : ''} — « actifs » et « suspendus » couvrent donc tout le monde.`
          : `${nonLus} compte${nonLus > 1 ? 's' : ''} dont l’état d’authentification n’a pas pu être lu : ${
              authComplete ? 'aucun compte d’authentification ne leur correspond' : 'la lecture n’a pas abouti'
            }. Ils ne sont ni « actifs », ni « suspendus », ni « jamais connectés » — on ne sait pas.`}
      </p>

      {visibles.length === 0 ? (
        <EmptyState icon="◇" message={`Aucun utilisateur dans « ${LIBELLES_FILTRES[filtre]} ».`} />
      ) : (
        <DataTable
          rows={visibles}
          columns={colonnes}
          rowKey={row => row.userId}
          maxHeight="60vh"
          // #1672.4 — recherche en tête de tableau + compteur, sur les lignes
          // DÉJÀ filtrées par la pilule active (le compteur reste vrai : il
          // porte sur ce qui est réellement rendu, pas sur `lignes`).
          searchValue={texteRecherche}
          searchPlaceholder="Rechercher un nom, un email, un espace…"
          // #1672.1 — sélecteur de colonnes + largeur redimensionnable,
          // mémorisés sous cette clé (propre à CE tableau).
          persistKey="users"
        />
      )}

      <PanneauUtilisateur ligne={choisie} onFermer={() => setSelection(null)} />
    </>
  )
}

/**
 * Le panneau d'une ligne : la confirmation qui NOMME la conséquence.
 *
 * Il existe TOUJOURS dans le DOM (`hidden` quand rien n'est choisi) :
 * `aria-controls` doit désigner un élément qui existe, sinon l'annonce est
 * cassée pour un lecteur d'écran.
 */
function PanneauUtilisateur({
  ligne,
  onFermer,
}: {
  ligne: LigneUtilisateur | null
  onFermer: () => void
}): JSX.Element {
  if (!ligne) return <div id="panneau-utilisateur" hidden />

  const nom = ligne.fullName || ligne.userId

  return (
    <section
      id="panneau-utilisateur"
      className="card"
      style={{ margin: '16px 0 0', padding: 20, display: 'grid', gap: 14 }}
      aria-label={`Suspension — ${nom}`}
    >
      <header style={{ display: 'flex', gap: 12, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 16 }}>{nom}</strong>
        <span className="muted" style={{ fontSize: 12 }}>
          {ligne.espaces.length === 0
            ? 'aucun espace'
            : ligne.espaces.map(espace => `${espace.name} · ${espace.role}`).join(' — ')}
        </span>
        <span style={{ marginLeft: 'auto' }}>
          <button type="button" className="btn-sm" onClick={onFermer}>
            Fermer
          </button>
        </span>
      </header>

      {/* #1674.9 — absente du DOM sous 768 px, pas masquée. */}
      <PosteDeTravailSeulement>
        <SuspendUser
          userId={ligne.userId}
          label={nom}
          espaces={ligne.espaces}
          compte={ligne.compte}
          onDone={onFermer}
        />
      </PosteDeTravailSeulement>

      <p className="muted" style={{ fontSize: 12, margin: 0 }}>
        La suppression reste sur{' '}
        <a className="link" href={`/users/${encodeURIComponent(ligne.userId)}`}>
          la fiche
        </a>{' '}
        : irréversible, et une suppression à un clic dans une liste triée finit par tomber sur la ligne d’à côté.
      </p>
    </section>
  )
}
