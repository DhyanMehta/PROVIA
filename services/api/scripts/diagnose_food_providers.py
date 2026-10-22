"""Bounded, read-only diagnostics without printing response bodies or credentials."""

import httpx

from app.core.config import Settings


def main():
    settings = Settings()
    key = settings.usda_api_key
    cases = [
        (
            "usda_basic",
            "https://api.nal.usda.gov/fdc/v1/foods/search",
            {"api_key": key.get_secret_value() if key else "", "query": "rice", "pageSize": 1},
        ),
        (
            "usda_foundation",
            "https://api.nal.usda.gov/fdc/v1/foods/search",
            {
                "api_key": key.get_secret_value() if key else "",
                "query": "rice",
                "pageSize": 1,
                "dataType": "Foundation",
            },
        ),
    ]
    for name, url, params in cases:
        try:
            response = httpx.get(
                url, params=params, timeout=30, headers={"User-Agent": settings.off_user_agent}
            )
            body = response.text.lower()
            markers = [
                value
                for value in [
                    "api_key_invalid",
                    "api_key_missing",
                    "datatype",
                    "bad request",
                    "access denied",
                    "invalid api key",
                ]
                if value in body
            ]
            print(
                {
                    "check": name,
                    "status": response.status_code,
                    "content_type": response.headers.get("content-type"),
                    "known_markers": markers,
                }
            )
        except Exception as error:
            print({"check": name, "error_type": type(error).__name__})


if __name__ == "__main__":
    main()
