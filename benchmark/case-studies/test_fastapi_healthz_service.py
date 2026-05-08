import subprocess

from fastapi.testclient import TestClient

import fastapi_healthz_service
from fastapi_healthz_service import app


def test_healthz_returns_ok_and_version(monkeypatch) -> None:
    expected_sha = "1234567890abcdef1234567890abcdef12345678"

    def _mock_check_output(args, **kwargs):
        assert args == ["git", "rev-parse", "HEAD"]
        assert kwargs["text"] is True
        assert kwargs["stderr"] is subprocess.DEVNULL
        return f"{expected_sha}\n"

    fastapi_healthz_service._read_feature_flags.cache_clear()
    fastapi_healthz_service._read_git_sha.cache_clear()
    monkeypatch.setattr(subprocess, "check_output", _mock_check_output)
    client = TestClient(app)
    response = client.get("/healthz")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "version": expected_sha}


def test_healthz_returns_unknown_when_git_lookup_fails(monkeypatch) -> None:
    def _raise_called_process_error(*_args, **_kwargs):
        raise subprocess.CalledProcessError(returncode=1, cmd="git rev-parse HEAD")

    fastapi_healthz_service._read_git_sha.cache_clear()
    fastapi_healthz_service._read_feature_flags.cache_clear()
    monkeypatch.setattr(subprocess, "check_output", _raise_called_process_error)

    client = TestClient(app)
    response = client.get("/healthz")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "version": "unknown"}


def test_healthz_caches_git_sha(monkeypatch) -> None:
    calls = {"count": 0}

    def _mock_check_output(*_args, **_kwargs):
        calls["count"] += 1
        return "abc123\n"

    fastapi_healthz_service._read_git_sha.cache_clear()
    fastapi_healthz_service._read_feature_flags.cache_clear()
    monkeypatch.setattr(subprocess, "check_output", _mock_check_output)

    client = TestClient(app)
    first = client.get("/healthz")
    second = client.get("/healthz")

    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json()["version"] == "abc123"
    assert second.json()["version"] == "abc123"
    assert calls["count"] == 1


def test_healthz_returns_404_when_feature_flag_disabled(monkeypatch) -> None:
    monkeypatch.setenv("FEATURE_HEALTHZ_ENDPOINT_ENABLED", "false")
    fastapi_healthz_service._read_feature_flags.cache_clear()

    client = TestClient(app)
    response = client.get("/healthz")

    assert response.status_code == 404
    assert response.json() == {"detail": "Not Found"}


def test_feature_flag_treats_invalid_value_as_default_true(monkeypatch) -> None:
    monkeypatch.setenv("FEATURE_HEALTHZ_ENDPOINT_ENABLED", "definitely")
    fastapi_healthz_service._read_feature_flags.cache_clear()

    client = TestClient(app)
    response = client.get("/healthz")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    assert "version" in response.json()


def test_feature_flag_true_variants_enable_healthz(monkeypatch) -> None:
    for value in ("1", "true", "yes", "on"):
        monkeypatch.setenv("FEATURE_HEALTHZ_ENDPOINT_ENABLED", value)
        fastapi_healthz_service._read_feature_flags.cache_clear()
        fastapi_healthz_service._read_git_sha.cache_clear()

        client = TestClient(app)
        response = client.get("/healthz")
        assert response.status_code == 200, value


def test_feature_flag_false_variants_disable_healthz(monkeypatch) -> None:
    for value in ("0", "false", "no", "off"):
        monkeypatch.setenv("FEATURE_HEALTHZ_ENDPOINT_ENABLED", value)
        fastapi_healthz_service._read_feature_flags.cache_clear()

        client = TestClient(app)
        response = client.get("/healthz")
        assert response.status_code == 404, value
