import type { NavigateOptions } from '@tanstack/react-router'

/**
 * OÙ MÈNE UNE NOTIFICATION — la dérivation, à un seul endroit.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI ELLE SORT DE LA CLOCHE
 * ─────────────────────────────────────────────────────────────────────────────
 * `notifications.link` est un CHEMIN écrit côté serveur (`/accounts/<uuid>`,
 * `/dashboard`, `/billing`). Il faut le traduire en destination du routeur —
 * `/accounts/$id` veut un `params`, `/billing` veut `?offers=true` — et cette
 * traduction vivait au milieu du `handleSelect` de la cloche.
 *
 * La bulle de Laura montre les mêmes notifications sous une autre forme. Si elle
 * recopiait ces quinze lignes, on aurait deux tables : le jour où une
 * notification neuve porte `/projects/needs/<id>`, une seule des deux la
 * suivrait, et personne ne saurait laquelle. C'est la loi 1 du tome 7 (GA-26) —
 * une dérivation vit à un seul endroit — appliquée avant d'avoir le défaut
 * plutôt qu'après.
 *
 * ⚠️ `null` veut dire « ce lien ne mène nulle part que je connaisse », et
 * l'appelant n'affiche alors AUCUN geste d'ouverture. Deviner en envoyant le
 * chemin brut au routeur produirait une route inconnue, donc un écran blanc :
 * un avertissement dont le geste de sortie est mort n'est pas un avertissement,
 * et c'est le défaut que la cloche a déjà corrigé une fois pour `/billing`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * #1938.11 — LA LISTE FERMÉE À 3 CAS ÉTAIT UNE PORTE PLUS ÉTROITE QUE SON FLUX
 * ─────────────────────────────────────────────────────────────────────────────
 * Avant ce lot, seuls `/accounts/<id>`, `/dashboard` et `/billing` étaient
 * reconnus : tout le reste rendait `null`. Or plusieurs sources CONNAISSENT
 * déjà un objet précis et écrivent un lien réel qui n'était simplement jamais
 * traduit : `routines.service.ts` (`/missions/cra`, `/projects/needs`,
 * `/contacts`, `/briefing`, `/consultants`…), `action-router.module.ts` et
 * `playbook-send.sweeper.ts` (`/actions`), `session-registry.service.ts`
 * (`/settings/team` — l'alerte « connexions simultanées » n'avait ELLE-MÊME
 * aucun geste d'ouverture, un lien mort depuis sa création). Une notification
 * affichée dont le clic ne fait rien est indistinguable d'un bouton cassé.
 *
 * La fonction ne CONSTRUIT toujours rien à partir d'un objet — elle ne fait
 * QUE traduire le `link` déjà écrit côté serveur — mais elle en reconnaît
 * désormais la forme GÉNÉRALE plutôt qu'une liste de cas nommés à faire
 * grandir à chaque notification neuve (ce qui garantirait d'en oublier une).
 * Les liens ne viennent jamais d'une saisie utilisateur — toujours d'un
 * service serveur — donc suivre n'importe quel chemin relatif qu'il a écrit
 * n'invente rien ; seul un chemin ABSOLU (`//hôte…`, `https://…`) est refusé,
 * pour ne jamais suivre un lien qui sortirait de l'application.
 */
export function notificationDestination(link: string | null): NavigateOptions | null {
  if (!link || readAsAnotherOrigin(link)) return null
  if (link.startsWith('/accounts/')) {
    const id = link.slice('/accounts/'.length)
    if (!id) return null
    return { to: '/accounts/$id', params: { id }, search: { tab: 'overview' } } as NavigateOptions
  }
  if (link === '/billing') {
    // La notification « Crédits bientôt épuisés » porte ce lien depuis qu'elle
    // existe — et il ne menait NULLE PART : le clic marquait lu, fermait le
    // panneau, et laissait l'utilisateur exactement là où il était.
    return { to: '/billing', search: { offers: true } } as NavigateOptions
  }
  // Toute autre route CONNUE portée par la source (mission, besoin, contact,
  // brief, réglages d'équipe, centre d'actions…) : le lien EXACT que le
  // serveur a écrit, jamais une route devinée. Une querystring déjà présente
  // dans le chemin (`/accounts?gate=parked`) est séparée en `search`.
  //
  // ⚠️ #1903.7 (15/09/2026) — LA RAISON ÉCRITE ICI ÉTAIT FAUSSE. Elle disait
  // qu'une requête « passée telle quelle dans `to` ne serait jamais lue par le
  // routeur ». Mesuré depuis, sur le routeur RÉEL (`laura-deep-links.test.ts`,
  // section « le véhicule ») : elle l'est — elle ressort dans le `href` poussé à
  // l'historique, que la couche d'historique redécoupe et analyse. Le
  // découpage fait ici reste JUSTE et ne bouge pas, mais il n'est pas une
  // nécessité : c'est une forme explicite, et rien d'autre.
  //
  // ⚠️ Ce qu'il faut savoir en revanche : `search` est posé ici en TEXTE BRUT,
  // là où le routeur, lui, ANALYSE (`parseSearch`) — `?offers=true` devient le
  // booléen `true` en passant par `to`, la chaîne `'true'` en passant par ici.
  // Toutes les valeurs écrites aujourd'hui par les services sont du texte
  // (`?gate=parked`), et les deux seuls liens à valeur non textuelle ont leur
  // branche nommée au-dessus. Le jour où un service écrit un booléen ou un
  // nombre dans un lien générique, c'est cette ligne qu'il faut reprendre — le
  // `validateSearch` de la route d'arrivée le refuserait en silence.
  const [pathname, queryString] = link.split('?')
  if (!pathname || !pathname.startsWith('/') || pathname.startsWith('//')) return null
  const search = queryString ? Object.fromEntries(new URLSearchParams(queryString)) : undefined
  return { to: pathname, ...(search ? { search } : {}) } as NavigateOptions
}

/**
 * Revue d'intégration du lot 7 — « // » n'est pas la seule forme
 * protocole-relative. L'analyseur d'URL du navigateur (WHATWG) lit une barre
 * oblique INVERSE comme une barre oblique, et RETIRE tabulations et retours à
 * la ligne avant d'analyser : `/\hôte` et `/<tab>/hôte` deviennent `//hôte`,
 * c'est-à-dire une autre origine. Aucun lien écrit par un service serveur ne
 * contient ces caractères : les refuser tous ne coûte aucune destination réelle.
 */
function readAsAnotherOrigin(link: string): boolean {
  for (const char of link) {
    const code = char.charCodeAt(0)
    if (char === '\\' || code < 0x20 || code === 0x7f) return true
  }
  return false
}
