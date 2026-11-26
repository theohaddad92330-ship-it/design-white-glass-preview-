"""SIG-B (11/10/2026) — les recruteurs NOMMÉS d'une offre GARDÉE, prouvés par elle.

Une offre d'emploi publiée nomme parfois sa ``hiring_team`` (TheirStack la rend
dans la même réponse, sans crédit de plus). Chaque personne nommée devient un
CONTACT CANDIDAT du compte : nom, rôle tel que l'offre le donne, profil s'il est
publié — et la PREUVE (intitulé, URL, date de publication de l'offre).

Ce module ne collecte rien : il SÉPARE, après le tri métier du vendeur et le
rattachement à l'employeur, les recruteurs des offres gardées.

- Le bloc offres reste byte-identique (la clé ``recruiters`` en est retirée) :
  ni le prompt daté, ni ``itJobSignals`` ne voient une personne.
- Une offre sans URL ne prouve rien (la preuve ne se vérifie pas) : aucun
  recruteur n'en sort.
- Une même personne citée par deux offres sort UNE fois (mêmes clés d'identité
  que la persistance : profil, puis nom), avec la preuve la plus RÉCENTE.
- Jamais de valeur fabriquée : un rôle ou un profil absent reste absent.

L'écriture passe par la porte contacts EXISTANTE de l'API
(``ContactsService.bulkInsert`` : dédoublonnage, empreinte d'effacement RGPD,
correction humaine protégée), jamais par ce service.
"""

from __future__ import annotations

from typing import Any

from app.services.contact_identity import contact_identity_keys

#: La clé posée par un agrégateur sur une offre qui nomme son équipe de recrutement.
RECRUITERS_KEY = "recruiters"


def _proof(offer: dict[str, Any]) -> dict[str, Any] | None:
    url = str(offer.get("url") or "").strip()
    if not url:
        return None
    proof: dict[str, Any] = {"title": str(offer.get("title") or "").strip(), "url": url}
    posted = str(offer.get("date") or "").strip()
    if posted:
        proof["postedAt"] = posted
    return proof


def split_job_recruiters(offers: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """``(offres sans recruteurs, recruteurs prouvés)``. L'entrée n'est jamais modifiée.

    Sans aucun recruteur, rend la MÊME liste d'offres (chemin byte-identique)."""
    if not any(isinstance(o, dict) and RECRUITERS_KEY in o for o in offers):
        return offers, []
    jobs: list[dict[str, Any]] = []
    people: list[dict[str, Any]] = []
    by_key: dict[str, dict[str, Any]] = {}
    for offer in offers:
        if not isinstance(offer, dict) or RECRUITERS_KEY not in offer:
            jobs.append(offer)
            continue
        jobs.append({k: v for k, v in offer.items() if k != RECRUITERS_KEY})
        proof = _proof(offer)
        if proof is None:
            continue
        for raw in offer.get(RECRUITERS_KEY) or []:
            if not isinstance(raw, dict):
                continue
            name = " ".join(str(raw.get("fullName") or "").split())
            if not name:
                continue
            person: dict[str, Any] = {"fullName": name}
            for field in ("role", "linkedinUrl"):
                value = " ".join(str(raw.get(field) or "").split())
                if value:
                    person[field] = value
            keys = contact_identity_keys(person)
            known = next((by_key[k] for k in keys if k in by_key), None)
            if known is None:
                person["jobPosting"] = proof
                people.append(person)
                known = person
            else:
                for field in ("role", "linkedinUrl"):
                    if field in person and field not in known:
                        known[field] = person[field]
                if str(proof.get("postedAt") or "") > str(known["jobPosting"].get("postedAt") or ""):
                    known["jobPosting"] = proof
            for key in keys:
                by_key.setdefault(key, known)
    # La preuve en DERNIER, quel que soit l'ordre de remplissage des champs.
    return jobs, [{**{k: v for k, v in p.items() if k != "jobPosting"}, "jobPosting": p["jobPosting"]} for p in people]


__all__ = ["RECRUITERS_KEY", "split_job_recruiters"]
