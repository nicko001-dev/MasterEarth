import os
import tempfile

from fastapi.testclient import TestClient

from app.config import Settings
from app.main import app


def test_default_settings(monkeypatch) -> None:
    # Clear any host environment variables to ensure test isolation
    for env_var in [
        "APP_NAME",
        "API_VERSION",
        "APP_ENV",
        "API_HOST",
        "API_PORT",
        "API_DEBUG",
        "CORS_ORIGINS",
    ]:
        monkeypatch.delenv(env_var, raising=False)

    settings = Settings(_env_file=None)
    assert settings.app_name == "IntelliFlood API"
    assert settings.api_version == "0.1.0"
    assert settings.app_env == "development"
    assert settings.api_host == "127.0.0.1"
    assert settings.api_port == 8000
    assert settings.api_debug is False
    assert settings.cors_origins == [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:4173",
        "http://127.0.0.1:4173",
        "http://localhost:8080",
        "http://127.0.0.1:8080",
    ]


def test_custom_settings_via_env(monkeypatch) -> None:
    monkeypatch.setenv("APP_NAME", "IntelliFlood CI")
    monkeypatch.setenv("API_VERSION", "0.2.0-beta")
    monkeypatch.setenv("APP_ENV", "staging")
    monkeypatch.setenv("API_HOST", "0.0.0.0")
    monkeypatch.setenv("API_PORT", "9000")
    monkeypatch.setenv("API_DEBUG", "true")

    settings = Settings(_env_file=None)
    assert settings.app_name == "IntelliFlood CI"
    assert settings.api_version == "0.2.0-beta"
    assert settings.app_env == "staging"
    assert settings.api_host == "0.0.0.0"
    assert settings.api_port == 9000
    assert settings.api_debug is True


def test_cors_origins_comma_separated(monkeypatch) -> None:
    monkeypatch.setenv(
        "CORS_ORIGINS", "http://client.local:3000, https://client.local:3000"
    )
    settings = Settings(_env_file=None)
    assert settings.cors_origins == [
        "http://client.local:3000",
        "https://client.local:3000",
    ]


def test_cors_origins_json_format(monkeypatch) -> None:
    monkeypatch.setenv(
        "CORS_ORIGINS", '["http://client.local:3000", "https://client.local:3000"]'
    )
    settings = Settings(_env_file=None)
    assert settings.cors_origins == [
        "http://client.local:3000",
        "https://client.local:3000",
    ]


def test_dotenv_loading(monkeypatch) -> None:
    # Clear host environment variables to ensure dotenv file values are tested
    for env_var in [
        "APP_NAME",
        "API_VERSION",
        "APP_ENV",
        "API_HOST",
        "API_PORT",
        "API_DEBUG",
        "CORS_ORIGINS",
    ]:
        monkeypatch.delenv(env_var, raising=False)

    with tempfile.TemporaryDirectory() as tmpdir:
        dotenv_path = os.path.join(tmpdir, ".env")
        with open(dotenv_path, "w", encoding="utf-8") as f:
            f.write("APP_NAME=Custom Env App\n")
            f.write("APP_ENV=production\n")
            f.write("API_PORT=8080\n")
            f.write("CORS_ORIGINS=http://custom.example.org\n")

        settings = Settings(_env_file=dotenv_path)
        assert settings.app_name == "Custom Env App"
        assert settings.app_env == "production"
        assert settings.api_port == 8080
        assert settings.cors_origins == ["http://custom.example.org"]


def test_health_and_api_root_with_test_client() -> None:
    client = TestClient(app)

    health_res = client.get("/health")
    assert health_res.status_code == 200
    assert "status" in health_res.json()
    assert health_res.json()["status"] == "ok"

    api_res = client.get("/api/v1")
    assert api_res.status_code == 200
    payload = api_res.json()
    assert payload["version"] == "v1"
    assert payload["status"] == "running"
