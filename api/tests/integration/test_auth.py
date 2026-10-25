"""Auth security tests (directive section 20). Every case goes through the real verifier."""

import json
import time
import uuid

import httpx
import jwt

from tests.conftest import ISSUER, TRUSTED, UNTRUSTED, UserFactory, make_token


async def test_health_is_public_and_identifies_release(client: httpx.AsyncClient) -> None:
    r = await client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert {"status", "version", "git_sha", "environment"} <= body.keys()
    r = await client.get("/ready")
    assert r.status_code == 200 and r.json()["providers"]["schema"] == "0001_baseline"


async def test_no_token(client: httpx.AsyncClient) -> None:
    assert (await client.get("/me")).status_code == 401


async def test_malformed_token(client: httpx.AsyncClient) -> None:
    r = await client.get("/me", headers={"Authorization": "Bearer not.a.jwt"})
    assert r.status_code == 401


async def test_wrong_scheme(client: httpx.AsyncClient, make_user: UserFactory) -> None:
    u = await make_user()
    assert (
        await client.get("/me", headers={"Authorization": f"Basic {u.token}"})
    ).status_code == 401


async def test_tampered_payload(client: httpx.AsyncClient, make_user: UserFactory) -> None:
    victim = await make_user()
    attacker = await make_user()
    h, _, sig = attacker.token.split(".")
    forged_claims = jwt.utils.base64url_encode(
        json.dumps(
            {
                "sub": str(victim.id),
                "aud": "authenticated",
                "iss": ISSUER,
                "role": "authenticated",
                "iat": int(time.time()),
                "exp": int(time.time()) + 600,
            }
        ).encode()
    ).decode()
    r = await client.get("/me", headers={"Authorization": f"Bearer {h}.{forged_claims}.{sig}"})
    assert r.status_code == 401


async def test_signed_by_untrusted_key_with_same_kid(
    client: httpx.AsyncClient, make_user: UserFactory
) -> None:
    u = await make_user()
    r = await client.get(
        "/me", headers={"Authorization": f"Bearer {make_token(str(u.id), key=UNTRUSTED)}"}
    )
    assert r.status_code == 401


async def test_expired(client: httpx.AsyncClient, make_user: UserFactory) -> None:
    u = await make_user()
    t = make_token(str(u.id), iat=int(time.time()) - 7200, exp=int(time.time()) - 3600)
    assert (await client.get("/me", headers={"Authorization": f"Bearer {t}"})).status_code == 401


async def test_wrong_audience(client: httpx.AsyncClient, make_user: UserFactory) -> None:
    u = await make_user()
    t = make_token(str(u.id), aud="something-else")
    assert (await client.get("/me", headers={"Authorization": f"Bearer {t}"})).status_code == 401


async def test_wrong_issuer(client: httpx.AsyncClient, make_user: UserFactory) -> None:
    u = await make_user()
    t = make_token(str(u.id), iss="https://evil.example/auth/v1")
    assert (await client.get("/me", headers={"Authorization": f"Bearer {t}"})).status_code == 401


async def test_missing_exp_rejected(client: httpx.AsyncClient, make_user: UserFactory) -> None:
    u = await make_user()
    t = make_token(str(u.id), exp=None)
    assert (await client.get("/me", headers={"Authorization": f"Bearer {t}"})).status_code == 401


async def test_hs256_alg_confusion_rejected(
    client: httpx.AsyncClient, make_user: UserFactory
) -> None:
    u = await make_user()
    t = jwt.encode(
        {
            "sub": str(u.id),
            "aud": "authenticated",
            "iss": ISSUER,
            "role": "authenticated",
            "iat": int(time.time()),
            "exp": int(time.time()) + 600,
        },
        "super-secret-jwt-token-with-at-least-32-characters-long",
        algorithm="HS256",
        headers={"kid": TRUSTED.kid},
    )
    assert (await client.get("/me", headers={"Authorization": f"Bearer {t}"})).status_code == 401


async def test_anon_or_service_role_jwt_is_not_a_user(
    client: httpx.AsyncClient, make_user: UserFactory
) -> None:
    u = await make_user()
    t = make_token(str(u.id), role="service_role")
    assert (await client.get("/me", headers={"Authorization": f"Bearer {t}"})).status_code == 401


async def test_valid_token(client: httpx.AsyncClient, make_user: UserFactory) -> None:
    u = await make_user("student")
    r = await client.get("/me", headers=u.h)
    assert r.status_code == 200 and r.json()["profile"]["id"] == str(u.id)


async def test_unknown_user_must_onboard(client: httpx.AsyncClient) -> None:
    t = make_token(str(uuid.uuid4()))
    assert (await client.get("/me", headers={"Authorization": f"Bearer {t}"})).status_code == 403


async def test_onboard_cannot_self_assign_admin(client: httpx.AsyncClient, db) -> None:  # type: ignore[no-untyped-def]
    uid = uuid.uuid4()
    await db.execute("insert into auth.users(id) values ($1)", uid)
    h = {"Authorization": f"Bearer {make_token(str(uid))}"}
    r = await client.post(
        "/me/onboard",
        headers=h,
        json={"role": "admin", "display_name": "x", "preferred_language": "en"},
    )
    assert r.status_code == 422
    r = await client.post(
        "/me/onboard",
        headers=h,
        json={"role": "student", "display_name": "x", "preferred_language": "en"},
    )
    assert r.status_code == 201 and r.json()["profile"]["role"] == "student"
    r = await client.post(
        "/me/onboard",
        headers=h,
        json={"role": "tutor", "display_name": "x", "preferred_language": "en"},
    )
    assert r.status_code == 409  # cannot re-onboard into another role


async def test_suspended_user_blocked_immediately(
    client: httpx.AsyncClient, make_user: UserFactory, db
) -> None:  # type: ignore[no-untyped-def]
    u = await make_user()
    assert (await client.get("/me", headers=u.h)).status_code == 200
    await db.execute("update profiles set is_active = false where id = $1", u.id)
    # Same, still-valid token: suspension is read from the DB, not the token.
    assert (await client.get("/me", headers=u.h)).status_code == 403


async def test_role_guards(client: httpx.AsyncClient, make_user: UserFactory) -> None:
    student, tutor = await make_user("student"), await make_user("tutor")
    assert (await client.get("/admin/users", headers=student.h)).status_code == 403
    assert (await client.get("/admin/users", headers=tutor.h)).status_code == 403
    r = await client.post(
        "/tasks",
        headers=tutor.h,
        json={
            "subject": "Math",
            "title": "Impersonate",
            "description": "x",
            "budget_cents": 1000,
            "honor_code_ack": True,
        },
    )
    assert r.status_code == 403  # tutor cannot act as student
    r = await client.post(
        "/tasks/00000000-0000-0000-0000-000000000000/bids",
        headers=student.h,
        json={"amount_cents": 1000},
    )
    assert r.status_code == 403  # student cannot act as tutor


async def test_role_claims_in_token_are_ignored(
    client: httpx.AsyncClient, make_user: UserFactory
) -> None:
    u = await make_user("student")
    t = make_token(str(u.id), app_metadata={"role": "admin"}, user_role="admin")
    assert (
        await client.get("/admin/users", headers={"Authorization": f"Bearer {t}"})
    ).status_code == 403


async def test_admin_allowed(client: httpx.AsyncClient, make_user: UserFactory) -> None:
    a = await make_user("admin")
    assert (await client.get("/admin/users", headers=a.h)).status_code == 200
