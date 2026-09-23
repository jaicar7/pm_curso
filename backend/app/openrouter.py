from __future__ import annotations

import os
from typing import Any

import httpx

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
OPENROUTER_MODEL = "nvidia/nemotron-3-ultra-550b-a55b:free"


class OpenRouterError(RuntimeError):
    """Raised when the OpenRouter request cannot produce a chat response."""


def chat_with_openrouter(message: str, api_key: str | None = None) -> str:
    key = api_key or os.getenv("OPENROUTER_API_KEY")
    if not key:
        raise OpenRouterError("OPENROUTER_API_KEY is not configured")

    try:
        response = httpx.post(
            OPENROUTER_URL,
            headers={
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json",
                "HTTP-Referer": "http://localhost:8000",
                "X-Title": "Project Management MVP",
            },
            json={
                "model": OPENROUTER_MODEL,
                "messages": [{"role": "user", "content": message}],
            },
            timeout=30.0,
        )
        response.raise_for_status()
        payload: dict[str, Any] = response.json()
    except httpx.HTTPStatusError as error:
        raise OpenRouterError(
            f"OpenRouter returned HTTP {error.response.status_code}"
        ) from error
    except httpx.RequestError as error:
        raise OpenRouterError("Could not connect to OpenRouter") from error
    except ValueError as error:
        raise OpenRouterError("OpenRouter returned invalid JSON") from error

    try:
        content = payload["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as error:
        raise OpenRouterError("OpenRouter returned an invalid response") from error

    if not isinstance(content, str) or not content.strip():
        raise OpenRouterError("OpenRouter returned an empty response")

    return content.strip()
