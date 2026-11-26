"""Rendu compact des signaux datés (presse, offres IT, événements légaux) pour
injection dans les prompts Phase-1.

Ces trois sources — Brave News, France Travail (offres IT), BODACC (annonces
légales) — étaient collectées mais JAMAIS vues par le LLM : elles ne décoraient
que la sortie. Les injecter (avec leurs vraies dates) est le #1 gain de
pertinence de l'audit : la stratégie n'est plus écrite aveugle à la source la
plus actionnable et la plus fraîche. Rendu vide (``""``) quand il n'y a rien —
le prompt ne grossit que sur de la donnée réelle.
"""

from __future__ import annotations

import re
from datetime import UTC, datetime, timedelta

from app.services.hierarchy_level import is_executive_recruitment_title


def _clean(value: object, limit: int | None = None) -> str:
    s = " ".join(str(value or "").split())
    return s[:limit] if limit else s


# #2289.13 — NO-GO : une actualité générique et ancienne ne doit jamais se
# retrouver sous le libellé "PRESSE RÉCENTE" (fabrication d'urgence, garde-fou
# propre au moteur de recherche actualité, #2769). Composition, pas réécriture :
# Brave News rend un âge RELATIF ("2 days ago"), une forme que
# ``source_judge``/``signal_freshness`` traitent volontairement comme non datée
# (aucune année) — ce module ajoute donc son propre calcul, borné à cette seule
# décision d'affichage, sans toucher au comportement documenté ailleurs.
_RELATIVE_AGE_RE = re.compile(r"(\d+)\s*(day|week|month|year)s?\s+ago", re.IGNORECASE)
_RELATIVE_AGE_UNIT_DAYS: dict[str, int] = {"day": 1, "week": 7, "month": 30, "year": 365}

# Même fenêtre par défaut que ``signal_freshness._ARCHIVE_AFTER_DAYS`` (24 mois) —
# une seule règle de fraîcheur généraliste, jamais une deuxième valeur devinée.
STALE_NEWS_AFTER_DAYS = 730


def _relative_age_days(age: object) -> int | None:
    """Jours écoulés depuis un âge relatif Brave ("2 days ago", "3 years ago").
    ``None`` quand le format ne correspond pas — jamais deviné."""
    m = _RELATIVE_AGE_RE.search(str(age or ""))
    if not m:
        return None
    return int(m.group(1)) * _RELATIVE_AGE_UNIT_DAYS[m.group(2).lower()]


def _is_stale_for_urgency(age: object) -> bool:
    """``True`` quand une brève est trop ancienne pour être présentée comme
    "récente" — un âge non reconnu (undated) n'est PAS considéré stale : on ne
    retire jamais un signal sur une absence d'information."""
    days = _relative_age_days(age)
    return days is not None and days > STALE_NEWS_AFTER_DAYS


def merge_job_signals(*sources: object) -> list[dict]:
    """Fusion ADDITIVE des offres d'emploi multi-sources (France Travail, APEC,
    WTTJ…) pour le bloc « OFFRES D'EMPLOI IT ».

    - **Round-robin** entre les sources (chacune déjà triée récent-first) pour
      que chaque source reste visible dans le cap du bloc prompt ; avec UNE
      seule source non vide l'ordre est inchangé (byte-identique à avant).
    - **Dédup par URL** (normalisée, insensible à la casse) — la première
      source qui fournit l'offre gagne. Les offres SANS url (France Travail)
      ne sont jamais dédupliquées entre elles (deux postes au même intitulé
      dans deux villes sont deux signaux réels).
    - Entrées non-list / non-dict ignorées (gracieux, jamais d'exception).
    """
    lists: list[list[dict]] = [
        [j for j in src if isinstance(j, dict)] if isinstance(src, list) else [] for src in sources
    ]
    merged: list[dict] = []
    seen_urls: set[str] = set()
    for i in range(max((len(lst) for lst in lists), default=0)):
        for lst in lists:
            if i >= len(lst):
                continue
            job = lst[i]
            url = _clean(job.get("url")).lower()
            if url:
                if url in seen_urls:
                    continue
                seen_urls.add(url)
            merged.append(job)
    return merged


#: #4182 — au-delà, une offre n'est montrée que si AUCUNE offre récente n'existe (les sources payées
#: filtrent déjà à J-90 ; la règle des ~12 mois reste celle de chaque source).
RECENT_OFFER_DAYS = 90


def prefer_recent_offers(offers: object, *, recent_days: int = RECENT_OFFER_DAYS) -> list[dict]:
    """Les offres récentes (≤ ``recent_days``) seules ; les plus anciennes ne subsistent que si rien
    n'est récent. Une offre SANS date lisible compte comme récente (on n'écarte jamais sur une
    absence d'information). Ordre conservé ; la date de chaque offre reste intacte."""
    rows = [o for o in offers if isinstance(o, dict)] if isinstance(offers, list) else []
    cutoff = datetime.now(UTC) - timedelta(days=recent_days)

    def _old(offer: dict) -> bool:
        raw = str(offer.get("date") or "").strip()[:10]
        try:
            when = datetime.fromisoformat(raw).replace(tzinfo=UTC)
        except ValueError:
            return False
        return when < cutoff

    recent = [o for o in rows if not _old(o)]
    return recent or rows


# #3922.1 — le JETON posé sur chaque ligne du bloc daté. Le modèle le recopie dans
# ``sourceRef`` ; c'est la SEULE clé de retour vers l'URL de la source. Préfixes
# distincts de ceux du scrape (P, I, O, PR, J, X) pour ne jamais se confondre.
_DATED_PREFIX: dict[str, str] = {"news": "N", "jobs": "E", "legal": "B", "tenders": "M", "awarded": "D"}
# Le genre de source que le jeton nomme (« Voir l'annonce BODACC » ne se déduit pas d'un libellé libre).
_KIND_BY_PREFIX: dict[str, str] = {
    "N": "press",
    "E": "job",
    "B": "bodacc",
    "M": "tender",
    "D": "tender",
    "P": "press",
    "I": "press",
    "O": "official",
    "PR": "official",
    "J": "job",
    "X": "other",
}


def _select_dated(
    news: object, jobs: object, legal: object, tenders: object, awarded: object, max_items: int
) -> dict[str, list[dict]]:
    """UNE sélection pour le rendu ET pour la table jeton → URL (GA-26) : un jeton
    qui n'est pas dans le prompt ne peut pas être cité, un jeton cité doit exister."""
    news_l = news if isinstance(news, list) else []
    jobs_l = jobs if isinstance(jobs, list) else []
    legal_l = legal if isinstance(legal, list) else []
    tenders_l = tenders if isinstance(tenders, list) else []
    awarded_l = awarded if isinstance(awarded, list) else []
    return {
        "news": [
            n for n in news_l if isinstance(n, dict) and n.get("title") and not _is_stale_for_urgency(n.get("age"))
        ][:max_items],
        "jobs": [j for j in jobs_l if isinstance(j, dict) and j.get("title")][:max_items],
        "tenders": [t for t in tenders_l if isinstance(t, dict) and t.get("title")][: min(max_items, 5)],
        "awarded": [a for a in awarded_l if isinstance(a, dict) and a.get("title")][: min(max_items, 4)],
        "legal": [
            ev for ev in legal_l if isinstance(ev, dict) and (ev.get("type") or ev.get("label"))
        ][:max_items],
    }


def _ref(group: str, idx: int) -> str:
    return f"[{_DATED_PREFIX[group]}{idx}]"


def _http_url(value: object) -> str:
    url = _clean(value)
    return url if url.lower().startswith(("http://", "https://")) else ""


def dated_signal_refs(
    news: object = None,
    jobs: object = None,
    legal: object = None,
    tenders: object = None,
    awarded: object = None,
    *,
    max_items: int = 20,
) -> dict[str, str]:
    """Jeton → URL des lignes du bloc daté. Une ligne SANS URL n'apparaît pas :
    elle ne produira jamais un lien deviné (« Sans lien vérifiable » à l'écran)."""
    selected = _select_dated(news, jobs, legal, tenders, awarded, max_items)
    out: dict[str, str] = {}
    for group, items in selected.items():
        for idx, item in enumerate(items, start=1):
            url = _http_url(item.get("url") or item.get("sourceUrl"))
            if url:
                out[_ref(group, idx)] = url
    return out


def stamp_signal_urls(signals: object, ref_urls: dict[str, str]) -> list[dict]:
    """Pose ``url`` et ``source_kind`` sur chaque signal depuis son ``source_ref``
    UNIQUEMENT. Jeton inconnu, vide ou URL non http(s) ⇒ aucune URL (jamais un
    rapprochement par texte, jamais une recherche)."""
    out: list[dict] = []
    for sig in signals if isinstance(signals, list) else []:
        if not isinstance(sig, dict):
            continue
        item = dict(sig)
        ref = _clean(item.get("source_ref") or item.get("sourceRef"))
        url = _http_url(ref_urls.get(ref))
        if url:
            item["url"] = url
            prefix = ref.strip("[]").rstrip("0123456789")
            kind = _KIND_BY_PREFIX.get(prefix)
            if kind:
                item["source_kind"] = kind
        out.append(item)
    return out


def render_dated_signals(
    news: object,
    jobs: object,
    legal: object,
    tenders: object = None,
    awarded: object = None,
    *,
    max_items: int = 20,
) -> str:
    """Bloc daté, source-attribué, compact pour les 3 prompts de recherche.

    ``news`` = Brave News ``{title, url, age, description}`` ;
    ``jobs`` = France Travail ``{title, location, date, contractType, skills[]}`` ;
    ``legal`` = BODACC ``{date, type, tribunal, label}`` ;
    ``tenders`` = BOAMP ``{title, buyer, location, publishedDate, deadline, cpv}`` ;
    ``awarded`` = DECP marchés attribués ``{title, buyer, winner, location,
    notifiedDate, ...}`` — le titulaire (winner) est un concurrent potentiel.
    Chaque source est optionnelle et dégradable (une liste vide/None disparaît du
    bloc).

    ``max_items`` par défaut 20 (#3885 — relevé de 8 ; vannes ouvertes) : les lignes sont compactes
    (~200 chars), datées, triées récent-first — les items 7-8 restent frais et
    actionnables. Coût : +6 lignes max (news+jobs+legal) ≈ +300 tokens sur 2
    prompts ≈ +0,001€/run. Les marchés publics gardent leurs mins (tenders 5,
    awarded 4) : lignes les plus longues, rendement décroissant plus rapide.
    """
    selected = _select_dated(news, jobs, legal, tenders, awarded, max_items)
    lines: list[str] = []

    fresh_news = selected["news"]
    if fresh_news:
        lines.append("PRESSE RÉCENTE :")
        for i, n in enumerate(fresh_news, start=1):
            age = _clean(n.get("age"))
            title = _clean(n.get("title"))
            desc = _clean(n.get("description"), 200)
            when = f" ({age})" if age else ""
            lines.append(f"- {_ref('news', i)} {title}{when}" + (f" — {desc}" if desc else ""))

    fresh_jobs = selected["jobs"]
    if fresh_jobs:
        if lines:
            lines.append("")
        lines.append("OFFRES D'EMPLOI IT (signaux recrutement + stack recherchée) :")
        for i, j in enumerate(fresh_jobs, start=1):
            date = _clean(j.get("date"))[:10]
            contract = _clean(j.get("contractType"))
            loc = _clean(j.get("location"))
            skills = _clean(", ".join(s for s in (j.get("skills") or []) if s), 160)
            head = _clean(j.get("title"))
            meta = " · ".join(p for p in (date, contract, loc) if p)
            line = f"- {_ref('jobs', i)} {head}" + (f" [{meta}]" if meta else "")
            if skills:
                line += f" — stack: {skills}"
            lines.append(line)

    fresh_tenders = selected["tenders"]
    if fresh_tenders:
        if lines:
            lines.append("")
        lines.append("MARCHÉS PUBLICS IT (appels d'offres — intention d'achat datée, géo-localisée) :")
        for i, t in enumerate(fresh_tenders, start=1):
            date = _clean(t.get("publishedDate"))[:10]
            buyer = _clean(t.get("buyer"), 80)
            loc = _clean(t.get("location"), 60)
            title = _clean(t.get("title"), 160)
            meta = " · ".join(p for p in (date, buyer, loc) if p)
            line = f"- {_ref('tenders', i)} {title}" + (f" [{meta}]" if meta else "")
            deadline = _clean(t.get("deadline"))[:10]
            if deadline:
                line += f" — échéance {deadline}"
            lines.append(line)

    fresh_awarded = selected["awarded"]
    if fresh_awarded:
        if lines:
            lines.append("")
        lines.append("MARCHÉS ATTRIBUÉS (récents — qui a acheté quoi, à qui ; titulaire = concurrent potentiel) :")
        for i, a in enumerate(fresh_awarded, start=1):
            date = _clean(a.get("notifiedDate"))[:10]
            buyer = _clean(a.get("buyer"), 80)
            winner = _clean(a.get("winner"), 80)
            loc = _clean(a.get("location"), 60)
            title = _clean(a.get("title"), 160)
            won = f"→ {winner}" if winner else ""
            meta = " · ".join(p for p in (date, buyer, won, loc) if p)
            lines.append(f"- {_ref('awarded', i)} {title}" + (f" [{meta}]" if meta else ""))

    fresh_legal = selected["legal"]
    if fresh_legal:
        if lines:
            lines.append("")
        lines.append("ÉVÉNEMENTS LÉGAUX (annonces légales) :")
        for i, legal_ev in enumerate(fresh_legal, start=1):
            date = _clean(legal_ev.get("date"))[:10]
            typ = _clean(legal_ev.get("type"))
            label = _clean(legal_ev.get("label"), 120)
            meta = " · ".join(p for p in (date, typ) if p)
            lines.append(f"- {_ref('legal', i)} {meta}" + (f" — {label}" if label else ""))

    return "\n".join(lines).strip()


# ─────────────────────────────────────────────────────────────────────────────
# #3970 (lot P07, 09/10) — LES COLLECTEURS DEVIENNENT DES SIGNAUX TYPÉS
# ─────────────────────────────────────────────────────────────────────────────
# Louis (09/10) : « c'est un peu toujours la même chose, faut de tout ». Les
# offres d'emploi, les annonces légales, les appels d'offres et les marchés
# attribués étaient collectés, mais n'atteignaient ``recentSignals`` que si le
# modèle choisissait de les citer dans le bloc daté ci-dessus. Ils y entrent
# désormais par ce chemin déterministe, comme la presse (``merge_press_signals``)
# et les événements officiels (``merge_company_event_signals``).

#: Plafond PAR NATURE : dix offres ne doivent pas noyer l'unique appel d'offres.
COLLECTOR_SIGNALS_PER_KIND = 3
#: #3885 — « Recrutements détectés » ne compte que les signaux TYPÉS : à 3, un compte qui publie
#: vingt offres en montrait trois, et une relance ne changeait rien. Les offres sont un volume
#: (sans coût modèle) ; les autres natures restent à 3 pour ne pas être noyées.
COLLECTOR_SIGNALS_CAP_BY_KIND: dict[str, int] = {"recrutement": 8}

#: La CAPACITÉ qui a produit le signal — jamais le nom d'un fournisseur (GA-44).
_COLLECTOR_SOURCE_LABEL: dict[str, str] = {
    "jobs": "Offre d'emploi publiée",
    "legal": "Annonce légale",
    "tenders": "Appel d'offres publié",
    "awarded": "Marché public attribué",
}
_COLLECTOR_SOURCE_KIND: dict[str, str] = {"jobs": "job", "legal": "bodacc", "tenders": "tender", "awarded": "tender"}
#: Genre d'annonce légale (``bodacc.classify_announcement_kind``) → nature de signal.
#: Dépôt de comptes, radiation et genre non reconnu ne font AUCUN signal : ce ne
#: sont pas des événements commerciaux, et un genre deviné serait un fait faux.
_LEGAL_SIGNAL_TYPE: dict[str, str] = {
    "sale": "acquisition",
    "collective_proceeding": "restructuration",
    "creation": "investissement",
    "modification": "organisation",
}
_ISO_DAY_RE = re.compile(r"^\d{4}-\d{2}-\d{2}")
#: #4732 — une MODIFICATION ou un genre non reconnu qui NOMME une fusion/absorption/scission est un
#: rapprochement de sociétés : un acte se nomme par ce qu'il est, jamais interprété.
_MERGER_TERMS_RE = re.compile(r"\b(fusion|absorption|scission|rachat|apport\s+partiel)", re.IGNORECASE)


def names_merger(text: object) -> bool:
    """Le texte d'un acte nomme-t-il une fusion / absorption / scission / un rachat / un apport partiel ?
    Le prédicat unique de la fiche compte ET de la carte Découvrir (#4732, GA-26)."""
    return _MERGER_TERMS_RE.search(str(text or "")) is not None


def _iso_day(value: object) -> str:
    """Le jour ISO (``YYYY-MM-DD``) en tête de la valeur, sinon ``""`` — jamais deviné."""
    m = _ISO_DAY_RE.match(_clean(value))
    return m.group(0) if m else ""


def _collector_row(group: str, it: dict) -> tuple[str, str, str] | None:
    """(libellé, jour, type) d'une ligne de collecteur, ou ``None`` si elle n'en fait pas un signal."""
    from app.services.data_sources.bodacc import classify_announcement_kind

    if group == "jobs":
        # Le piège du cabinet de recrutement (`intermediation.py`) : l'offre
        # d'un intermédiaire ne dit rien du recrutement de l'employeur.
        if it.get("intermediated"):
            return None
        label, day, kind = _clean(it.get("title"), 200), _iso_day(it.get("date")), "recrutement"
    elif group == "legal":
        kind = _LEGAL_SIGNAL_TYPE.get(classify_announcement_kind(None, it.get("type")), "")
        family, name = _clean(it.get("type"), 80), _clean(it.get("label"), 120)
        if kind in ("", "organisation") and _MERGER_TERMS_RE.search(f"{family} {name}"):
            kind = "acquisition"
        label = f"{family} — {name}" if family and name else family
        day = _iso_day(it.get("date"))
    elif group == "tenders":
        label, day, kind = _clean(it.get("title"), 200), _iso_day(it.get("publishedDate")), "appel_offres"
    else:
        label, day, kind = _clean(it.get("title"), 200), _iso_day(it.get("notifiedDate")), "marche_public"
    return (label, day, kind) if label and day and kind else None


#: La CAPACITÉ qui a produit la ligne — jamais le nom de l'annuaire ni de son opérateur (GA-44).
_ECOSYSTEM_SOURCE_LABEL = "Annuaire de l'écosystème startup"


def merge_ecosystem_signals(recent_signals: object, rows: object) -> list[dict]:
    """#4734 — ajoute aux ``recentSignals`` ce que les annuaires disent d'un SIREN, TYPÉ ``ecosystem``.

    La ligne garde le libellé, la date et le lien de l'annuaire (jamais « levée », jamais interprétée) ; un label
    périmé (``status`` = ``unknown``) reste listé, daté, « à confirmer ». Sans ligne : rien ne s'ajoute. Un lien
    déjà porté par un signal n'est pas ajouté deux fois ; les signaux existants restent en tête, intacts."""
    out = [dict(s) for s in recent_signals if isinstance(s, dict)] if isinstance(recent_signals, list) else []
    seen_urls = {str(s.get("url") or "") for s in out if s.get("url")}
    for row in rows if isinstance(rows, list) else []:
        if not isinstance(row, dict):
            continue
        label, day = _clean(row.get("label"), 200), _clean(row.get("date"), 10)
        if not label or not day:
            continue
        url = _http_url(row.get("url"))
        if url and url in seen_urls:
            continue
        signal: dict = {"signal": label, "source": _ECOSYSTEM_SOURCE_LABEL, "type": "ecosystem", "date": day}
        if row.get("status") in ("known", "unknown"):
            signal["status"] = row["status"]
        if row.get("detail"):
            signal["detail"] = _clean(row["detail"], 200)
        if url:
            signal["url"] = url
            seen_urls.add(url)
        out.append(signal)
    return out


def merge_collector_signals(
    recent_signals: object,
    *,
    jobs: object = None,
    legal: object = None,
    tenders: object = None,
    awarded: object = None,
) -> list[dict]:
    """Ajoute aux ``recentSignals`` les lignes datées des collecteurs, TYPÉES.

    Une ligne SANS libellé ou SANS date lisible est écartée (jamais une date
    inventée) ; le lien n'est posé que s'il est http(s) (jamais deviné). Un lien
    déjà porté par un signal — celui que le modèle a cité par son jeton — n'est
    pas ajouté deux fois ; sans lien, un même (type, libellé, jour) non plus.
    Les signaux existants restent en tête, intacts."""
    out = [dict(s) for s in recent_signals if isinstance(s, dict)] if isinstance(recent_signals, list) else []
    seen_urls = {str(s.get("url") or "") for s in out if s.get("url")}
    seen_keys = {(str(s.get("type") or ""), _clean(s.get("signal")).lower(), str(s.get("date") or "")) for s in out}
    per_kind: dict[str, int] = {}
    groups = (("jobs", jobs), ("legal", legal), ("tenders", tenders), ("awarded", awarded))
    for group, items in groups:
        for it in items if isinstance(items, list) else []:
            row = _collector_row(group, it) if isinstance(it, dict) else None
            if row is None:
                continue
            label, day, kind = row
            if per_kind.get(kind, 0) >= COLLECTOR_SIGNALS_CAP_BY_KIND.get(kind, COLLECTOR_SIGNALS_PER_KIND):
                continue
            url = _http_url(it.get("url") or it.get("sourceUrl"))
            key = (kind, label.lower(), day)
            # #4031 — DECATHLON-FIN : deux entités d'un groupe publient le même intitulé le même
            # jour sous deux liens : deux offres. Le libellé ne départage que les lignes SANS lien.
            if (url and url in seen_urls) or (not url and key in seen_keys):
                continue
            seen_keys.add(key)
            signal: dict = {"signal": label, "source": _COLLECTOR_SOURCE_LABEL[group], "type": kind, "date": day}
            # #4020 / #4022 — le LIEU de l'offre, tel que collecté : l'écran Opportunités trie les
            # recrutements France → lieu non précisé → hors France. Absent = aucune clé, jamais deviné.
            location = _clean(it.get("location"), 120) if group == "jobs" else ""
            if location:
                signal["location"] = location
            # #4733 — recrutement de dirigeant : drapeau posé sur l'intitulé réel, jamais deviné.
            if group == "jobs" and is_executive_recruitment_title(label):
                signal["executive_role"] = True
            if url:
                seen_urls.add(url)
                signal["url"] = url
                signal["source_kind"] = _COLLECTOR_SOURCE_KIND[group]
            per_kind[kind] = per_kind.get(kind, 0) + 1
            out.append(signal)
    return _undated_recruitment_last(out)


def stamp_offer_locations(signals: object, jobs: object) -> list[dict]:
    """#4816 — le LIEU de l'offre voyage sur le signal de recrutement rédigé par l'analyse.

    Pose ``location`` sur un signal ``recrutement`` qui n'en a pas, quand son URL est celle d'une offre collectée
    qui en porte un : la jointure est l'URL (le jeton cité), JAMAIS la prose. Une offre d'intermédiaire, sans lieu,
    ou un signal sans lien : rien ne se pose, un lieu existant n'est jamais écrasé. Tout autre signal passe inchangé."""
    by_url: dict[str, str] = {}
    for job in jobs if isinstance(jobs, list) else []:
        if not isinstance(job, dict) or job.get("intermediated"):
            continue
        url, location = _http_url(job.get("url") or job.get("sourceUrl")), _clean(job.get("location"), 120)
        if url and location:
            by_url.setdefault(url, location)
    out: list[dict] = []
    for sig in signals if isinstance(signals, list) else []:
        if not isinstance(sig, dict):
            continue
        item = dict(sig)
        if item.get("type") == "recrutement" and not _clean(item.get("location")):
            location = by_url.get(_http_url(item.get("url")))
            if location:
                item["location"] = location
        out.append(item)
    return out


#: La CAPACITÉ qui a produit la ligne de levée — jamais le nom du fournisseur (doctrine : on nomme ce que l'espace
#: a branché, jamais ce qui nous sert).
_FUNDING_SOURCE_LABEL = "Base de levées de fonds"


def merge_funding_signals(recent_signals: object, rows: object) -> list[dict]:
    """#4735 — ajoute aux ``recentSignals`` les tours de table datés, TYPÉS ``levee_fonds``.

    Le montant est celui PUBLIÉ (devise d'origine, déjà dans le libellé), la date celle de la source, telle quelle :
    un tour sans date complète n'arrive pas jusqu'ici. Tous les tours d'une entreprise partagent le MÊME lien : la
    déduplication se fait donc sur (libellé, jour), jamais sur le lien. Les signaux existants restent en tête."""
    out = [dict(s) for s in recent_signals if isinstance(s, dict)] if isinstance(recent_signals, list) else []
    seen = {(str(s.get("type") or ""), _clean(s.get("signal")).lower(), str(s.get("date") or "")) for s in out}
    for row in rows if isinstance(rows, list) else []:
        if not isinstance(row, dict):
            continue
        label, day = _clean(row.get("label"), 200), _clean(row.get("date"), 10)
        if not label or not day or ("levee_fonds", label.lower(), day) in seen:
            continue
        seen.add(("levee_fonds", label.lower(), day))
        signal: dict = {"signal": label, "source": _FUNDING_SOURCE_LABEL, "type": "levee_fonds", "date": day}
        if _clean(row.get("stage")):
            signal["detail"] = _clean(f"Stade : {_clean(row['stage'])}", 200)
        url = _http_url(row.get("url"))
        if url:
            signal["url"] = url
        out.append(signal)
    return out


async def ecosystem_signals_merged(recent_signals: object, siren: object, *, client: object = None) -> list[dict]:
    """L'APPELANT de ``french_tech.french_tech_signals`` et de ``crunchbase.funding_rounds_for_domain``.

    Annuaires : rattachement par SIREN SEUL. ``FRENCH_TECH_DIRECTORY_URLS`` vide, SIREN absent ou invalide = les
    ``recentSignals`` rendus tels quels, zéro appel réseau. Une panne d'annuaire ne casse jamais le dossier.
    Levées : voir ``_with_funding_rounds``."""
    from app.services.data_sources.french_tech import french_tech_signals

    base = [dict(s) for s in recent_signals if isinstance(s, dict)] if isinstance(recent_signals, list) else []
    try:
        rows = await french_tech_signals(str(siren or ""), client=client)  # type: ignore[arg-type]
    except Exception:  # noqa: BLE001 — une source libre ne casse jamais un dossier
        rows = []
    merged = merge_ecosystem_signals(base, rows) if rows else base
    return await _with_funding_rounds(merged, siren, client=client)


async def _with_funding_rounds(signals: list[dict], siren: object, *, client: object = None) -> list[dict]:
    """#4735.1 — appelant de la source de levées : le SITE connu du SIREN → ses tours datés, avec leur lien.

    NO-OP STRICT sans ``CRUNCHBASE_API_KEY`` : on sort AVANT même de lire le site (zéro réseau, zéro cache). Sans
    site connu : aucune recherche — un nom d'entreprise ne résout jamais rien. Une panne rend la liste d'origine."""
    from app.services import company_domains
    from app.services.data_sources import crunchbase

    if not crunchbase.is_configured():
        return signals
    try:
        domain = await company_domains.lookup(siren)
        rows = await crunchbase.funding_rounds_for_domain(domain, client=client) if domain else []  # type: ignore[arg-type]
    except Exception:  # noqa: BLE001 — une source payante d'appoint ne casse jamais un dossier
        return signals
    return merge_funding_signals(signals, rows) if rows else signals


def _undated_recruitment_last(signals: list[dict]) -> list[dict]:
    """DECATHLON 11/10 — un recrutement SANS date (page carrière citée par le
    modèle) ne passe jamais devant une offre datée : il glisse en fin de liste,
    dans son ordre, rien n'est retiré. Sans recrutement daté, rien ne bouge."""

    def undated_recruitment(s: dict) -> bool:
        return s.get("type") == "recrutement" and not _iso_day(s.get("date"))

    if not any(s.get("type") == "recrutement" and not undated_recruitment(s) for s in signals):
        return signals
    return [s for s in signals if not undated_recruitment(s)] + [s for s in signals if undated_recruitment(s)]
