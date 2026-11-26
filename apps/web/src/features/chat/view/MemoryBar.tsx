import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Brain, ShieldAlert } from 'lucide-react'
import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, Text } from '@bellum/ui'
import { useIsMobile } from '@/features/mobile/useIsMobile'
import { usePinnedFacts } from '@/features/memory/hooks/usePinnedFacts'
import { MemoireCard } from '@/features/memory/view/MemoireCard'
import { visibleMemoryItems } from '@/features/memory/lib/visible-memory-items'

/**
 * #3775.4 (06/10/2026) — LA BARRE EST DEVENUE UN SEUL ACCÈS : « Mémoire · 6 éléments enregistrés ». Plus de « Voir »
 * ni d'« Épingler un fait » dans la barre : le titre ouvre le panneau, et c'est LÀ que se consulte, s'ajoute (avec sa
 * portée), se corrige et se retire un élément. Le texte historique ci-dessous garde sa raison (une ligne, aucun
 * texte de fait) ; seuls les deux boutons secondaires qu'il décrit ont été retirés — leur geste vit dans le panneau.
 *
 * « Laura garde en tête » — la mémoire longue, sous le fil et non dans un rail.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI ELLE DESCEND
 * ─────────────────────────────────────────────────────────────────────────────
 * Elle vivait dans le rail droit, une carte parmi cinq, sous le pli sur un écran
 * de portable. Or ce qu'elle contient est exactement ce qu'il faut avoir sous les
 * yeux EN ÉCRIVANT : « Laura sait déjà que le décideur est Untel » change la
 * question qu'on tape. Une information qui doit peser sur la saisie ne peut pas
 * vivre à l'autre bout de l'écran.
 *
 * Elle remplace la carte du rail — les deux ensemble seraient le doublon que la
 * loi 4 du tome 7 interdit (« rien n'apparaît deux fois sous la même forme avec
 * le même contenu »), et surtout deux endroits où dépingler.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI ELLE NE MONTRE AUCUN FAIT
 * ─────────────────────────────────────────────────────────────────────────────
 * Elle rendait UNE pastille par fait, dans un conteneur qui se replie : six
 * faits épinglés = six lignes fixes sous la conversation, soit un tiers de la
 * hauteur de l'écran mangé en permanence par du contexte. Et comme la barre est
 * FIXE, ces lignes-là ne se rattrapent pas en faisant défiler.
 *
 * ⚠️ La première correction plafonnait l'aperçu à deux pastilles bornées à
 * 16 rem. MESURÉ EN PROD, ça ne tenait toujours pas : la barre fait 966 px avec
 * le rail des conversations ouvert, l'avertissement en prend 435 et le titre
 * 222 — il restait 245 px pour deux pastilles, un compteur et le bouton
 * d'épinglage. Les pastilles ne rétrécissaient pas (`min-width: auto`, le
 * premier responsable des débordements de ce dépôt) : elles se PEIGNAIENT
 * par-dessus l'avertissement, et « Épingler un fait » finissait 5 px hors de la
 * barre. Un aperçu qui ne tient pas n'est pas un aperçu, c'est un
 * chevauchement.
 *
 * Donc plus AUCUN texte de fait dans la barre. Ce qu'elle porte est de longueur
 * connue — un titre, un compte, deux boutons — ce qui rend le débordement
 * impossible par construction, au lieu de dépendre d'une borne de largeur qu'il
 * faudrait deviner écran par écran. Le compte (« 6 faits en tête ») dit ce
 * qu'il y a à savoir en écrivant ; le texte des faits, qui demande d'être LU,
 * s'ouvre d'un clic.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE NE FAIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Elle n'expose ni la NATURE ni l'ÉCHÉANCE d'un fait à la saisie : une barre
 * dense n'est pas l'endroit pour trois champs, et l'épinglage sans échéance est
 * déjà le défaut historique. Ce qui est épinglé ici est donc un FAIT sans
 * échéance — exactement ce que le bouton dit.
 *
 * Elle ne dépingle plus non plus : une croix par fait, c'était une cible de
 * 12 px collée au texte, et c'est ce qui faisait ressembler la barre à une
 * corbeille. Oublier un fait mérite de VOIR ce qu'on oublie — le geste vit dans
 * la modale, où la ligne est entière, avec sa nature et son échéance.
 *
 * ⚠️ Ces réglages ne DISPARAISSENT donc pas : le titre comme le bouton « Voir »
 * ouvrent le panneau complet (`MemoireCard`), avec nature, échéance et badges. Les retirer aurait été une régression silencieuse — la
 * mémoire à échéance est une capacité livrée (restitution V2 §20), et une
 * capacité qu'aucun écran n'atteint est exactement le « livré mais jamais
 * appelé » que ce dépôt passe son temps à corriger.
 *
 * ⚠️ Elle refiltre les expirés comme le faisait la carte : l'API ne les rend
 * plus, mais la liste est CACHÉE côté client et un onglet resté ouvert la garde
 * après l'échéance. Sans ce filtre, la barre montrerait ce que Laura ne lit plus.
 */

/**
 * Le CONTENU de la modale de mémoire — `MemoireCard` (nature, échéance,
 * ajout), et rien d'autre. Extrait pour avoir DEUX déclencheurs qui ouvrent
 * la MÊME modale sans la dupliquer (loi 4 du tome 7) : `MemoryBar` elle-même
 * sur desktop, et l'entrée du « + » du composeur sous 768px (`Chat.tsx`,
 * `ComposerToolsMenu` → `onOpenMemory`) — voir le docblock de `MemoryBar`
 * pour la raison de cette seconde ouverture.
 */
export function MemoryDialog({
  accountId,
  conversationId = null,
  open,
  onOpenChange,
  showDisclaimer = true,
}: {
  accountId: string | null
  conversationId?: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  /**
   * #3050 (27/09/2026) — `false` pour `MemoryBar` (desktop) : sa barre montre
   * déjà l'avertissement EN PERMANENCE, juste à côté de son propre
   * déclencheur (plus bas dans ce fichier). Le répéter dans la modale qu'elle
   * ouvre le dirait deux fois (loi 4 du tome 7). Sous 768px, où aucune barre
   * ne le porte plus, le défaut (`true`) le dit ICI — une fois, à l'ouverture.
   */
  showDisclaimer?: boolean
}) {
  const { t } = useTranslation('chat')
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('common:actions.close')} className="max-h-[80dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('memoryBar.title')}</DialogTitle>
          <DialogDescription>{t('memoryBar.dialogDescription')}</DialogDescription>
        </DialogHeader>
        {showDisclaimer && (
          <span className="flex items-center gap-1.5">
            <ShieldAlert className="size-3.5 shrink-0 text-[var(--bellum-text-muted)]" aria-hidden />
            <Text size="xs" color="text-[var(--bellum-text-muted)]">
              {t('composer.disclaimer')}
            </Text>
          </span>
        )}
        <MemoireCard accountId={accountId} conversationId={conversationId} headless />
      </DialogContent>
    </Dialog>
  )
}

export function MemoryBar({
  accountId,
  conversationId = null,
}: {
  accountId: string | null
  /**
   * #1918.5 — LE FIL OUVERT. Il rend la portée « cette conversation »
   * proposable dans la modale, et borne ce qu'on y lit : hors d'un fil, aucune
   * mémoire de fil n'existe. `null` = la barre se comporte comme avant ce lot.
   */
  conversationId?: string | null
}) {
  const { t } = useTranslation('chat')
  // #3050 (27/09/2026) — SOUS 768px, CETTE BARRE NE SE MONTE PLUS DU TOUT.
  //
  // Elle est le panneau de mémoire qui vivait dans le rail droit du bureau
  // (voir la note de tête du fichier), redescendu sous le composeur. Sur un
  // téléphone, « sous le composeur » finit par vouloir dire « entre le
  // composeur et la navigation basse » — recette du 27/09 (fenêtre 500px) :
  // le composeur finissait à 375px sur 701, 325px de barre + navigation
  // s'empilaient dessous, et même réduite à un bouton compact, cette ligne
  // restait une ligne DE PLUS entre le composeur et la navigation basse — ce
  // que la recette refuse explicitement (« le composeur est collé en bas
  // juste au-dessus de la navigation »).
  //
  // Le geste qu'elle porte (voir/ajouter un fait) rejoint donc le « + » du
  // composeur (`Chat.tsx`, `ComposerToolsMenu` → `onOpenMemory`), qui ouvre la
  // MÊME modale (`MemoryDialog`, juste au-dessus) — rien n'est perdu, seulement
  // déplacé (doctrine), et cette modale ne rend rien tant qu'elle est fermée :
  // aucune hauteur ajoutée entre le composeur et la navigation.
  const isMobile = useIsMobile()
  // #3775.4 — le MÊME fil que la modale : sans `conversationId`, le compteur ignorait les éléments de portée
  // « cette conversation » que le panneau ouvert, lui, liste — deux nombres pour une seule mémoire.
  const { data: facts, isLoading, isError } = usePinnedFacts(accountId, conversationId)
  const [detailsOpen, setDetailsOpen] = useState(false)

  // #3775 (compteur) — la MÊME sélection pour le compteur de la barre et la liste du panneau.
  const visible = visibleMemoryItems(facts)

  if (isMobile) return null

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] px-3 py-1.5 sm:px-5">
      {/* #3775.4 — UN accès compact : « Mémoire · 6 éléments enregistrés ». Le compteur est celui du panneau qu'il
          ouvre (même requête, mêmes expirés écartés) et il dit « enregistrés » — pas « utilisés » : ce qui est
          enregistré n'est pas forcément relu dans une réponse, et aucune trace d'usage n'est comptée ici. La
          consultation, l'ajout, la correction et le retrait vivent dans le panneau (`MemoireCard`). */}
      <button
        type="button"
        onClick={() => setDetailsOpen(true)}
        aria-label={t('memoryBar.detailsAria')}
        className="flex shrink-0 items-center gap-1.5 rounded-md px-1 py-0.5 outline-none transition-colors hover:bg-[var(--bellum-surface-2)] focus-visible:ring-2 focus-visible:ring-[var(--bellum-focus-ring)]"
      >
        <Brain className="size-3.5 text-[var(--bellum-text-accent)]" aria-hidden />
        <Text size="xs" weight="semibold" color="text-[var(--bellum-text-secondary)]">
          {isLoading
            ? t('memoryBar.loading')
            : isError
              ? t('memoryBar.unavailable')
              : visible.length === 0
                ? t('memoryBar.empty')
                : t('memoryBar.summary', { count: visible.length })}
        </Text>
      </button>

      {/*
        L'avertissement qui vivait dans une carte du rail (« PrivacyCard »).
        Il tient à sa place ICI, au bord du champ de saisie : un rappel de
        vérification lu au moment de LIRE la réponse vaut ce qu'il coûte ; le
        même rappel dans une carte qu'on fait défiler ne se lit qu'une fois, le
        premier jour.
      */}
      <span className="flex shrink-0 items-center gap-1.5">
        <ShieldAlert className="size-3.5 shrink-0 text-[var(--bellum-text-muted)]" aria-hidden />
        <Text size="xs" color="text-[var(--bellum-text-muted)]">
          {t('composer.disclaimer')}
        </Text>
      </span>

      {/* Le détail : une MODALE, et non le survol de barre d'avant. Ce qu'on
          vient y faire — relire une ligne entière, lui donner une échéance,
          l'oublier — demande de la place et une décision ; un panneau qui se
          referme au moindre clic à côté n'est pas l'endroit. */}
      <MemoryDialog
        accountId={accountId}
        conversationId={conversationId}
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
        showDisclaimer={false}
      />
    </div>
  )
}
