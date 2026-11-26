'use client'

import { useState } from 'react'

/**
 * Le formulaire de connexion, et l'enrôlement de la première application
 * d'authentification (#1668).
 *
 * DEUX ÉTATS, PAS TROIS
 *  - « connexion » : adresse + mot de passe + code, en une requête.
 *  - « enrôlement » : le QR code, puis le code qui prouve que le téléphone
 *    porte bien la graine. On n'y entre que si le serveur a répondu
 *    `mfa_absent` ET que la fenêtre d'enrôlement est ouverte.
 *
 * ⚠️ LE MOT DE PASSE NE VA NULLE PART D'AUTRE. Il reste dans l'état de ce
 * composant le temps des deux appels d'enrôlement, et n'est jamais posé dans un
 * cookie ni dans une URL. C'est ce qui évite de garder un jeton Supabase entre
 * les deux temps — c'est-à-dire de mettre en cookie ce que le second facteur
 * protège.
 */

type Etape = 'connexion' | 'enrolement'

type ReponseAuth = { ok?: boolean; error?: string; code?: string; qrCode?: string; secret?: string }

export function LoginForm({ suite, enrolementOuvert }: { suite: string; enrolementOuvert: boolean }) {
  const [etape, setEtape] = useState<Etape>('connexion')
  const [email, setEmail] = useState('')
  const [motDePasse, setMotDePasse] = useState('')
  const [code, setCode] = useState('')
  const [qrCode, setQrCode] = useState('')
  const [graine, setGraine] = useState('')
  const [erreur, setErreur] = useState('')
  const [enCours, setEnCours] = useState(false)
  const [enrolementPossible, setEnrolementPossible] = useState(false)

  async function poster(chemin: string, corps: Record<string, string>): Promise<ReponseAuth> {
    const res = await fetch(chemin, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(corps),
    })
    return (await res.json().catch(() => ({}))) as ReponseAuth
  }

  async function connecter(event: React.FormEvent): Promise<void> {
    event.preventDefault()
    setErreur('')
    setEnrolementPossible(false)
    setEnCours(true)
    try {
      const reponse = await poster('/api/auth/login', { email, password: motDePasse, code })
      if (reponse.ok) {
        window.location.assign(suite)
        return
      }
      setErreur(reponse.error ?? 'Connexion refusée.')
      // Le serveur dit « aucune application enrôlée » : on ne propose la suite
      // que si la fenêtre est ouverte, sinon on promettrait un geste impossible.
      if (reponse.code === 'mfa_absent' && enrolementOuvert) setEnrolementPossible(true)
    } catch {
      setErreur('Le serveur n’a pas répondu. Réessaie.')
    } finally {
      setEnCours(false)
    }
  }

  async function demarrerEnrolement(): Promise<void> {
    setErreur('')
    setEnCours(true)
    try {
      const reponse = await poster('/api/auth/enroll', { email, password: motDePasse })
      if (!reponse.ok) {
        setErreur(reponse.error ?? 'Enrôlement refusé.')
        return
      }
      setQrCode(reponse.qrCode ?? '')
      setGraine(reponse.secret ?? '')
      setCode('')
      setEtape('enrolement')
    } catch {
      setErreur('Le serveur n’a pas répondu. Réessaie.')
    } finally {
      setEnCours(false)
    }
  }

  async function confirmerEnrolement(event: React.FormEvent): Promise<void> {
    event.preventDefault()
    setErreur('')
    setEnCours(true)
    try {
      const reponse = await poster('/api/auth/enroll/confirm', { password: motDePasse, code })
      if (reponse.ok) {
        window.location.assign(suite)
        return
      }
      setErreur(reponse.error ?? 'Code refusé.')
    } catch {
      setErreur('Le serveur n’a pas répondu. Réessaie.')
    } finally {
      setEnCours(false)
    }
  }

  if (etape === 'enrolement') {
    return (
      <form className="card connexion" onSubmit={confirmerEnrolement}>
        <h2>Enrôler ton application d’authentification</h2>
        <p className="muted">
          Scanne ce code avec Google Authenticator ou 1Password, puis recopie les six chiffres qu’il affiche. Ce code ne
          sera plus affiché ensuite.
        </p>
        {/* ⚠️ LA SEULE CHOSE SECRÈTE QUE CETTE CONSOLE AFFICHE, ET C'EST VOULU.
            La graine TOTP s'affiche ici une seule fois, à qui vient de prouver
            son mot de passe : c'est la définition même de l'enrôlement, et rien
            ne la relit ensuite (Supabase la garde, pas le back-office).
            La garde `aucun-secret-affiche` (#1671.1) ne la voit pas — elle
            refuse les ACCÈS DE PROPRIÉTÉ au nom parlant (`x.secret`) dans du
            JSX, et vise les secrets des CLIENTS et de la plateforme. Écrit ici
            plutôt que caché : si un jour un second secret s'affiche dans cette
            application, il devra se justifier, pas se glisser. */}
        {qrCode.startsWith('data:') ? (
          // Une balise <img> nue et non `next/image` : la source est un data-URI
          // rendu par Supabase, pas un fichier que l'optimiseur saurait servir.
          <img className="connexion__qr" src={qrCode} alt="Code à scanner avec ton application d’authentification" />
        ) : null}
        {graine ? (
          <p className="mono connexion__graine">
            <span className="muted">À saisir à la main : </span>
            {graine}
          </p>
        ) : null}

        <label htmlFor="code-enrolement">Code à six chiffres</label>
        <input
          id="code-enrolement"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          value={code}
          onChange={event => setCode(event.target.value)}
          required
        />

        {erreur ? <p className="error">{erreur}</p> : null}
        <button className="btn" type="submit" disabled={enCours}>
          {enCours ? 'Vérification…' : 'Confirmer et entrer'}
        </button>
      </form>
    )
  }

  return (
    <form className="card connexion" onSubmit={connecter}>
      <label htmlFor="email">Adresse e-mail</label>
      <input
        id="email"
        name="email"
        type="email"
        autoComplete="username"
        value={email}
        onChange={event => setEmail(event.target.value)}
        required
      />

      <label htmlFor="mot-de-passe">Mot de passe</label>
      <input
        id="mot-de-passe"
        name="password"
        type="password"
        autoComplete="current-password"
        value={motDePasse}
        onChange={event => setMotDePasse(event.target.value)}
        required
      />

      <label htmlFor="code">Code à six chiffres</label>
      {/* ⚠️ PAS `required`, ET C'EST LE CORRECTIF. Avec l'attribut, le navigateur
          refusait d'envoyer le formulaire tant que six chiffres n'étaient pas
          saisis — donc la TOUTE PREMIÈRE connexion, celle qui mène justement à
          l'enrôlement, était impossible (le seul contournement trouvé en
          recette le 07/09 : taper `000000`). Un code vide n'ouvre rien : le
          serveur lit d'abord les facteurs, et répond soit « aucune application
          enrôlée » (le bouton ci-dessous apparaît), soit un refus. */}
      <input
        id="code"
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        aria-describedby="code-aide"
        value={code}
        onChange={event => setCode(event.target.value)}
      />
      <p id="code-aide" className="muted">
        Laisse ce champ vide si tu n’as pas encore enrôlé d’application d’authentification.
      </p>

      {erreur ? <p className="error">{erreur}</p> : null}

      <button className="btn" type="submit" disabled={enCours}>
        {enCours ? 'Vérification…' : 'Se connecter'}
      </button>

      {enrolementPossible ? (
        <button className="btn ghost" type="button" onClick={demarrerEnrolement} disabled={enCours}>
          Enrôler une application d’authentification
        </button>
      ) : null}
    </form>
  )
}
