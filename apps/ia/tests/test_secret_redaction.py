"""COP-SEC — ce qu'une réponse du copilote ne peut pas contenir.

Le prompt l'interdit déjà. Ce fichier verrouille le filtre qui ne se laisse pas
convaincre : il lit la forme du texte sortant, pas la bonne volonté du modèle.
"""

from __future__ import annotations

import pytest

from app.services.secret_redaction import REDACTED, StreamingRedactor, redact_secrets


@pytest.mark.parametrize(
    "secret",
    [
        "sk-ant-api03-AbCdEf0123456789xyz",
        "sk-proj0123456789ABCDEFGHIJKLMNOP",
        "sk_live_51AbCdEfGhIjKlMnOp",
        "whsec_9aBcDeFgHiJkLmNoPqRsTu",
        "ghp_0123456789abcdefghijklmnopqrstuvwxyz",
        "xoxb-123456789012-abcdefghijklmnop",
        "SG.AbCdEfGhIjKlMnOpQr.StUvWxYz0123456789abcd",
        "AIzaSyA0123456789abcdefghijklmnopqrstuv",
        "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N",
    ],
)
def test_a_machine_secret_never_reaches_the_screen(secret: str):
    assert secret not in redact_secrets(f"Voici la valeur : {secret} — à recopier.")
    assert REDACTED in redact_secrets(f"Voici la valeur : {secret}")


def test_an_incoming_webhook_url_is_the_secret_and_goes_whole():
    text = "Poste ici : https://hooks.slack.com/services/T000/B000/XXXXXXXXXXXX"
    assert "XXXXXXXXXXXX" not in redact_secrets(text)


def test_an_environment_assignment_keeps_its_NAME_and_loses_its_VALUE():
    # « il manque STRIPE_SECRET_KEY » est une réponse UTILE ; la valeur, non.
    out = redact_secrets("Configure STRIPE_SECRET_KEY=sk_live_51AbCdEfGhIjKlMnOp dans Railway.")
    assert "STRIPE_SECRET_KEY" in out
    assert "sk_live_51AbCdEfGhIjKlMnOp" not in out


def test_an_authorization_header_loses_its_credential():
    out = redact_secrets("Envoie l'en-tête Authorization: Bearer abcdef.ghijkl.mnopqr")
    assert "abcdef.ghijkl.mnopqr" not in out
    assert "Authorization" in out


def test_it_is_idempotent():
    once = redact_secrets("clé sk-ant-api03-AbCdEf0123456789xyz")
    assert redact_secrets(once) == once


def test_it_does_not_censor_ordinary_business_prose():
    # LA condition d'acceptation : un filtre qui mange les réponses utiles serait
    # pire que pas de filtre. Rien ici n'a la forme d'un secret machine.
    prose = (
        "Objectif : ouvrir le compte ACME. Angle d'accroche : leur DSI recrute "
        "trois profils Java. Contacte Marie Dupont (marie.dupont@acme.example, "
        "+33 1 42 00 00 00), puis exporte la fiche vers ton CRM. "
        "Le dossier est sur https://app.bellum-ai.com/accounts/42."
    )
    assert redact_secrets(prose) == prose


def test_it_leaves_an_empty_reply_alone():
    assert redact_secrets("") == ""


# ── LOT STREAM (12/09/2026) : le même verrou, mais sur un texte qui arrive en
# PLUSIEURS morceaux — voir `StreamingRedactor` pour la raison (un fragment
# isolé n'a pas la forme d'un secret, même si son voisin complète le motif).


def test_a_secret_split_across_two_fragments_is_still_caught():
    secret = "sk-ant-api03-AbCdEf0123456789xyz"
    redactor = StreamingRedactor()
    # Coupure en PLEIN MILIEU du jeton — jamais sur un espace.
    out1 = redactor.feed("Voici la clé : sk-ant-api03-AbCdEf01")
    out2 = redactor.feed("23456789xyz — à ne pas partager.")
    out3 = redactor.flush()
    # Aucun des deux moitiés du secret, seule, n'a la forme d'un secret : un
    # masquage fragment par fragment laisserait passer les DEUX.
    assert secret not in out1
    assert secret not in out2
    assert secret not in out3
    joined = out1 + out2 + out3
    assert secret not in joined
    assert REDACTED in joined
    assert joined == redact_secrets("Voici la clé : " + secret + " — à ne pas partager.")


def test_a_secret_split_into_many_small_fragments_is_still_caught():
    secret = "sk-ant-api03-AbCdEf0123456789xyz"
    text = f"Clé : {secret} fin."
    redactor = StreamingRedactor()
    joined = "".join(redactor.feed(ch) for ch in text) + redactor.flush()
    assert secret not in joined
    assert REDACTED in joined
    assert joined == redact_secrets(text)


def test_an_authorization_header_split_between_the_prefix_and_the_token():
    redactor = StreamingRedactor()
    out1 = redactor.feed("Envoie l'en-tête Authorization: Bearer ")
    out2 = redactor.feed("abcdef.ghijkl.mnopqr et voilà.")
    out3 = redactor.flush()
    joined = out1 + out2 + out3
    assert "abcdef.ghijkl.mnopqr" not in joined
    assert "Authorization" in joined
    assert joined == redact_secrets("Envoie l'en-tête Authorization: Bearer abcdef.ghijkl.mnopqr et voilà.")


def test_feed_concatenates_to_the_redacted_text_when_nothing_is_secret():
    redactor = StreamingRedactor()
    parts = ["Bon", "jour, ", "voici ", "mon conseil."]
    joined = "".join(redactor.feed(p) for p in parts) + redactor.flush()
    assert joined == "Bonjour, voici mon conseil."


def test_flush_on_an_untouched_redactor_is_empty():
    assert StreamingRedactor().flush() == ""


# ── #1956.18 — DOMAINES INTERNES : un hôte que l'infra se donne à elle-même ──
#
# `*.railway.internal` (DNS privé Railway, `agent_docs/cles-a-poser.md:33` —
# `http://belllum-backend-service.railway.internal:3000`) et les plages d'IP
# privées (RFC 1918 + loopback + link-local) n'ont aucune raison de sortir
# d'une réponse Laura : ce sont des adresses qui désignent NOS services entre
# eux, jamais une information utile à un commercial.


def test_a_railway_internal_hostname_is_masked():
    out = redact_secrets("Appelle http://belllum-backend-service.railway.internal:3000/health pour vérifier.")
    assert "belllum-backend-service.railway.internal" not in out
    assert REDACTED in out


def test_a_private_ipv4_address_is_masked():
    for ip in ("10.0.4.12", "172.16.5.9", "192.168.1.20", "127.0.0.1", "169.254.1.1"):
        out = redact_secrets(f"Le service interne répond sur {ip}.")
        assert ip not in out, f"{ip} aurait dû être masqué"
        assert REDACTED in out


def test_a_public_looking_ip_is_not_censored():
    # Témoin : une IP qui n'est dans AUCUNE plage privée doit survivre — le
    # filtre attrape des adresses D'INFRASTRUCTURE INTERNE, pas tout ce qui a
    # la forme d'une IP. `192.0.2.10` (TEST-NET-1, RFC 5737) partage son
    # premier octet avec `192.168.x` sans être privée : le bon témoin pour
    # prouver que la plage est bien bornée à `192.168.*`.
    text = "Le point de sortie public est 192.0.2.10, documenté dans le runbook."
    assert redact_secrets(text) == text


def test_a_railway_internal_hostname_split_across_two_fragments_is_still_caught():
    redactor = StreamingRedactor()
    out1 = redactor.feed("Callback interne : http://belllum-backend-service.railway.int")
    out2 = redactor.feed("ernal:3000/health puis répond.")
    out3 = redactor.flush()
    joined = out1 + out2 + out3
    assert "belllum-backend-service.railway.internal" not in joined
    assert REDACTED in joined
    assert joined == redact_secrets(
        "Callback interne : http://belllum-backend-service.railway.internal:3000/health puis répond."
    )


# ── #1956.20 — COORDONNÉES SENSIBLES : coordonnées BANCAIRES, jamais les ──
# coordonnées PROFESSIONNELLES d'un contact (celles-ci sont le produit :
# `test_it_does_not_censor_ordinary_business_prose` ci-dessus les protège déjà
# et reste le témoin qui doit rester vert). Périmètre ancré sur la doctrine du
# dépôt, répétée dans les migrations (`OutgoingPayments`, `Factoring`,
# `AccountBillingProfile`…) : « Bellum ne signe rien, ne paie rien et ne
# stocke aucun IBAN » — et le test `1790979000001-MissionAdvRecords.spec.ts`
# nomme exactement ce vocabulaire : IBAN, BIC, SWIFT, RIB.


def test_an_iban_is_masked():
    out = redact_secrets("Voici l'IBAN : FR7630006000011234567890189 à ne pas partager.")
    assert "FR7630006000011234567890189" not in out
    assert REDACTED in out


def test_a_labeled_bic_is_masked_but_keeps_its_label():
    out = redact_secrets("BIC : BNPAFRPPXXX")
    assert "BNPAFRPPXXX" not in out
    assert "BIC" in out
    assert REDACTED in out


def test_a_labeled_rib_is_masked():
    # Un RIB est majoritairement numérique — il ne prend jamais la forme d'un
    # IBAN (pas de préfixe pays à deux lettres) : sans l'étiquette, rien ne le
    # distingue d'un autre numéro. D'où la règle par étiquette, pas la forme.
    out = redact_secrets("RIB: 30006000011234567890189")
    assert "30006000011234567890189" not in out
    assert "RIB" in out


def test_a_siren_number_is_not_censored_by_the_iban_pattern():
    # Témoin : un SIREN (9 chiffres, sans préfixe pays) doit survivre — le
    # motif IBAN exige deux LETTRES en tête, jamais un simple bloc de chiffres.
    text = "Le SIREN de ce compte est 552120222."
    assert redact_secrets(text) == text


def test_an_iban_split_across_two_fragments_is_still_caught():
    redactor = StreamingRedactor()
    out1 = redactor.feed("IBAN : FR76300060000112")
    out2 = redactor.feed("34567890189 à ne pas partager.")
    out3 = redactor.flush()
    joined = out1 + out2 + out3
    assert "FR7630006000011234567890189" not in joined
    assert REDACTED in joined
    assert joined == redact_secrets("IBAN : FR7630006000011234567890189 à ne pas partager.")


def test_a_labeled_bic_split_between_the_label_and_the_value():
    redactor = StreamingRedactor()
    out1 = redactor.feed("Le BIC : ")
    out2 = redactor.feed("BNPAFRPPXXX et voilà.")
    out3 = redactor.flush()
    joined = out1 + out2 + out3
    assert "BNPAFRPPXXX" not in joined
    assert "BIC" in joined
    assert joined == redact_secrets("Le BIC : BNPAFRPPXXX et voilà.")


# ── SUIVI D'INCIDENT — même famille que #1956.10 (le SSE non masqué) : le
# second verrou lui-même a un trou. `_ENV_ASSIGNMENT` ne matchait AUCUNE clé
# d'environnement RÉELLE à underscore avant son suffixe (`STRIPE_SECRET_KEY`,
# `DATABASE_URL`, `API_KEY`… tous à 0 match, prouvé en isolant la regex) : la
# règle `(?:_[A-Z0-9]+)*` consommait TOUJOURS le dernier segment underscore,
# ne laissant plus rien pour le suffixe obligatoire. Le test existant
# (`test_an_environment_assignment_keeps_its_NAME_and_loses_its_VALUE`)
# passait uniquement parce que sa valeur (`sk_live_…`) est interceptée par un
# motif structurel ANTÉRIEUR — une valeur qui ne l'est pas fuit en clair.


def test_a_database_url_with_embedded_credentials_is_masked():
    out = redact_secrets("Configure DATABASE_URL=postgres://user:pass@host:5432/db et relance.")
    assert "user:pass" not in out
    assert "DATABASE_URL" in out
    # Le schéma et l'hôte restent lisibles : masquer toute la valeur cacherait
    # une information de diagnostic utile (« la base est sur `host` ») en plus
    # du secret.
    assert "postgres://" in out
    assert "host:5432/db" in out


def test_a_secret_key_value_without_a_structural_prefix_is_masked():
    # Une valeur qui n'a la forme d'AUCUN préfixe connu (ni `sk-`, ni JWT...)
    # doit quand même être masquée dès qu'un nom de clé sensible la précède —
    # c'est tout le POINT de `_ENV_ASSIGNMENT` : la forme du nom, pas de la
    # valeur, cette fois.
    out = redact_secrets("STRIPE_SECRET_KEY=abc123n'importe-quoi dans Railway.")
    assert "abc123n'importe-quoi" not in out
    assert "STRIPE_SECRET_KEY" in out


def test_a_quoted_key_value_is_masked():
    out = redact_secrets('Ajoute API_KEY: "abc123secret" à la configuration.')
    assert "abc123secret" not in out
    assert "API_KEY" in out


def test_a_password_style_suffix_is_recognised():
    for name, value in (("DB_PASS", "hunter2"), ("DB_PWD", "hunter2")):
        out = redact_secrets(f"{name}={value}")
        assert value not in out
        assert name in out


def test_the_variable_name_alone_without_a_value_is_never_censored():
    # Témoin — nommer une variable manquante est une réponse UTILE : « il
    # manque DATABASE_URL » ne doit jamais disparaître.
    text = "La variable DATABASE_URL pointe vers la base, mais elle n'est pas posée."
    assert redact_secrets(text) == text


def test_a_public_url_without_credentials_is_not_censored():
    text = "Le tarif est expliqué sur https://bellum-ai.com/pricing."
    assert redact_secrets(text) == text


def test_a_mailto_link_is_not_censored():
    text = "Écris à mailto:contact@bellum-ai.com pour toute question."
    assert redact_secrets(text) == text


def test_a_bare_key_or_url_word_without_a_meaningful_prefix_is_not_censored():
    # Témoin du correctif : la règle exige un PRÉFIXE avant le suffixe
    # sensible (`DATABASE_URL`, pas `URL` seul) — sinon « voici l'URL : ... »
    # deviendrait un faux positif sur toute mention ordinaire d'une URL.
    text = "Voici l'URL : https://bellum-ai.com/pricing — et voici la clé de lecture du tableau."
    assert redact_secrets(text) == text


def test_a_database_url_with_credentials_split_across_two_fragments_is_still_caught():
    redactor = StreamingRedactor()
    out1 = redactor.feed("DATABASE_URL=postgres://user:pa")
    out2 = redactor.feed("ss@host:5432/db et voilà.")
    out3 = redactor.flush()
    joined = out1 + out2 + out3
    assert "user:pass" not in joined
    assert "DATABASE_URL" in joined
    assert joined == redact_secrets("DATABASE_URL=postgres://user:pass@host:5432/db et voilà.")


def test_an_env_key_split_between_the_name_and_its_value_is_still_caught():
    redactor = StreamingRedactor()
    out1 = redactor.feed("Configure STRIPE_SECRET_KEY=")
    out2 = redactor.feed("abc123n'importe-quoi puis relance.")
    out3 = redactor.flush()
    joined = out1 + out2 + out3
    assert "abc123n'importe-quoi" not in joined
    assert "STRIPE_SECRET_KEY" in joined
    assert joined == redact_secrets("Configure STRIPE_SECRET_KEY=abc123n'importe-quoi puis relance.")


def test_a_bare_credentialed_url_in_free_prose_without_any_label_is_masked():
    # « où qu'il apparaisse, pas seulement après = » — aucune étiquette KEY/URL
    # ne précède ce cas, seule la FORME `scheme://user:mdp@hôte` le trahit.
    out = redact_secrets("Connecte-toi sur https://admin:s3cret@intranet.example/panel pour vérifier.")
    assert "admin:s3cret" not in out
    assert "https://" in out
    assert "intranet.example/panel" in out


# ── GARDE DE NON-RÉGRESSION — la SORTIE EXACTE, pas seulement l'absence du
# secret. Le bug corrigé ci-dessus (`_leave_if_already_redacted`) produisait
# un artefact du type `"IBAN=[valeur masquée] masquée]"` : le secret brut
# avait bien disparu et `REDACTED in out` était vrai, donc AUCUN des tests
# existants (qui ne vérifiaient que ces deux choses) ne pouvait le voir.
# Ces témoins comparent la chaîne ENTIÈRE pour que le défaut ne revienne pas
# invisible une seconde fois.


def test_the_stripe_key_case_produces_no_duplicate_redacted_marker():
    out = redact_secrets("Configure STRIPE_SECRET_KEY=sk_live_51AbCdEfGhIjKlMnOp dans Railway.")
    assert out == f"Configure STRIPE_SECRET_KEY={REDACTED} dans Railway."


def test_the_iban_case_produces_no_duplicate_redacted_marker():
    out = redact_secrets("Voici l'IBAN : FR7630006000011234567890189 à ne pas partager.")
    assert out == f"Voici l'IBAN : {REDACTED} à ne pas partager."


def test_the_database_url_case_produces_no_duplicate_redacted_marker():
    out = redact_secrets("Configure DATABASE_URL=postgres://user:pass@host:5432/db et relance.")
    assert out == f"Configure DATABASE_URL=postgres://{REDACTED}@host:5432/db et relance."


# ── INTÉGRATION DU LOT (13/09/2026) — quatre fuites MESURÉES sur la version fusionnée ──
#
# Chaque cas ci-dessous a été joué contre le module AVANT correctif, et rendait
# le secret en clair :
#  1. un IBAN écrit par groupes de quatre — sa forme IMPRIMÉE, celle d'une
#     facture ou d'un RIB PDF — n'était pas reconnu : « Voici l'IBAN FR76 3000 … »
#     ressortait intact, et « IBAN : FR76 3000 … » ne masquait que « FR76 » ;
#  2. un RIB espacé (« 30006 00001 12345678901 89 ») ne perdait que son premier
#     bloc — le numéro de compte restait lisible ;
#  3. une URL à identifiants SANS nom d'utilisateur (`redis://:motdepasse@hôte`,
#     la forme d'un Redis sans ACL) gardait son mot de passe ;
#  4. une valeur d'affectation dont UN morceau avait été masqué par un motif plus
#     précis (`DB_PASSWORD=hunter2,10.0.0.1`) était laissée TELLE QUELLE —
#     `hunter2` compris — parce que « un masquage est déjà posé » suffisait.

_SPACED_IBAN = "FR76 3000 6000 0112 3456 7890 189"


def test_a_spaced_iban_in_free_prose_is_masked_whole():
    out = redact_secrets(f"Voici l'IBAN {_SPACED_IBAN} du client.")
    assert out == f"Voici l'IBAN {REDACTED} du client."


def test_a_labeled_spaced_iban_loses_every_group():
    assert redact_secrets(f"IBAN : {_SPACED_IBAN}") == f"IBAN : {REDACTED}"


def test_a_spaced_iban_split_across_fragments_is_still_caught():
    text = f"Voici l'IBAN {_SPACED_IBAN} à garder pour toi."
    redactor = StreamingRedactor()
    chunks = ["Voici l'IBAN FR76 ", "3000 6000 01", "12 3456 7890 189 à garder pour toi."]
    joined = "".join(redactor.feed(chunk) for chunk in chunks) + redactor.flush()
    assert "3456 7890" not in joined
    assert joined == redact_secrets(text)


def test_a_labeled_spaced_iban_streamed_character_by_character_is_still_caught():
    text = f"IBAN : {_SPACED_IBAN} fin."
    redactor = StreamingRedactor()
    joined = "".join(redactor.feed(ch) for ch in text) + redactor.flush()
    assert joined == redact_secrets(text) == f"IBAN : {REDACTED} fin."


def test_a_labeled_spaced_rib_loses_its_account_number():
    out = redact_secrets("RIB : 30006 00001 12345678901 89")
    assert "12345678901" not in out
    assert out == f"RIB={REDACTED}"


def test_a_labeled_spaced_rib_split_across_fragments_is_still_caught():
    text = "Le RIB : 30006 00001 12345678901 89 est dans la facture."
    redactor = StreamingRedactor()
    chunks = ["Le RIB : 30006 ", "00001 1234567", "8901 89 est dans la facture."]
    joined = "".join(redactor.feed(chunk) for chunk in chunks) + redactor.flush()
    assert "12345678901" not in joined
    assert joined == redact_secrets(text)


def test_url_credentials_without_a_user_name_are_masked():
    out = redact_secrets("Connecte-toi sur redis://:mypassword@cache.example.com:6379 pour vérifier.")
    assert out == f"Connecte-toi sur redis://{REDACTED}@cache.example.com:6379 pour vérifier."


def test_a_named_redis_url_without_user_on_a_private_host_keeps_no_password():
    out = redact_secrets("REDIS_URL=redis://:mypassword@10.0.0.5:6379")
    assert "mypassword" not in out
    assert "10.0.0.5" not in out
    assert out.startswith("REDIS_URL=")


@pytest.mark.parametrize(
    ("text", "leaked"),
    [
        ("DB_PASSWORD=hunter2,10.0.0.1", "hunter2"),
        ("API_KEY=abc123@10.0.0.1", "abc123"),
        ("RIB=0001234,192.168.1.4", "0001234"),
        # Une URL dont les identifiants sont masqués mais qui porte un secret
        # dans sa REQUÊTE : l'hôte lisible ne vaut pas la fuite du reste.
        ("DATABASE_URL=postgres://user:pass@host:5432/db?password=leak", "leak"),
    ],
)
def test_a_partially_masked_value_is_masked_whole(text: str, leaked: str):
    out = redact_secrets(text)
    assert leaked not in out
    assert out == f"{text.split('=')[0]}={REDACTED}"


def test_prose_with_short_uppercase_codes_is_not_censored_nor_held_back():
    # Témoin des voisins : un code à deux lettres et deux chiffres, un
    # trimestre, un SIREN espacé, le mot RIB sans valeur — rien de bancaire.
    text = "Rendez-vous Q3 2026 : contrat AB12 signé, agence FR75 PARIS, SIREN 552 120 222, RIB demandé."
    assert redact_secrets(text) == text
    redactor = StreamingRedactor()
    assert "".join(redactor.feed(ch) for ch in text) + redactor.flush() == text


def test_an_intracommunity_vat_number_is_not_censored_by_the_iban_pattern():
    # Témoin : un numéro de TVA intracommunautaire est une information d'ENTREPRISE
    # que Laura doit pouvoir donner. Il a la même tête qu'un IBAN (deux lettres,
    # deux chiffres), mais jamais plus de dix caractères après : un IBAN en a au
    # moins onze. Mesuré : la première version du motif imprimé les masquait.
    text = "TVA intracommunautaire : FR12345678901 en France, IT12345678901 en Italie, SE123456789701 en Suède."
    assert redact_secrets(text) == text
