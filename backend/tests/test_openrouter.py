import httpx
import pytest

from app.openrouter import OPENROUTER_MODEL, OpenRouterError, chat_with_openrouter
import app.openrouter as openrouter


def test_requires_api_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)

    with pytest.raises(OpenRouterError, match="not configured"):
        chat_with_openrouter("2+2")


def test_returns_model_message(monkeypatch: pytest.MonkeyPatch) -> None:
    class FakeResponse:
        def raise_for_status(self) -> None:
            return None

        def json(self) -> dict:
            return {"choices": [{"message": {"content": "4"}}]}

    def fake_post(*args, **kwargs) -> FakeResponse:
        assert args[0] == openrouter.OPENROUTER_URL
        assert kwargs["json"]["model"] == OPENROUTER_MODEL
        assert kwargs["json"]["messages"] == [{"role": "user", "content": "2+2"}]
        return FakeResponse()

    monkeypatch.setattr(openrouter.httpx, "post", fake_post)

    assert chat_with_openrouter("2+2", api_key="test-key") == "4"


def test_rejects_provider_errors(monkeypatch: pytest.MonkeyPatch) -> None:
    def fake_post(*args, **kwargs):
        request = httpx.Request("POST", openrouter.OPENROUTER_URL)
        response = httpx.Response(401, request=request)
        raise httpx.HTTPStatusError("unauthorized", request=request, response=response)

    monkeypatch.setattr(openrouter.httpx, "post", fake_post)

    with pytest.raises(OpenRouterError, match="HTTP 401"):
        chat_with_openrouter("2+2", api_key="test-key")
