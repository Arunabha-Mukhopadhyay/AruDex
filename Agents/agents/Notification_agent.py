import json
import os
import smtplib
from email.message import EmailMessage
from typing import Any, Dict, List, Optional

import requests
from dotenv import load_dotenv
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from pydantic import BaseModel, Field

load_dotenv()


class NotificationResult(BaseModel):
    message: str
    discord_sent: bool = False
    email_sent: bool = False
    dispatch_errors: List[str] = Field(default_factory=list)
    llm_error: Optional[str] = None


def _build_model() -> ChatGoogleGenerativeAI:
    return ChatGoogleGenerativeAI(
        model=os.getenv(
            "NOTIFICATION_GEMINI_MODEL",
            os.getenv("GEMINI_MODEL", "gemini-3.8-flash")
        ),
        temperature=0.45,
        google_api_key=os.getenv("GEMINI_API_KEY"),
        max_retries=0,
    )


def _json_blob(payload: Dict[str, Any]) -> str:
    return json.dumps(payload, indent=2, default=str)


def _extract_profit(payload: Dict[str, Any]) -> Optional[Any]:
    strategy = payload.get("strategy") or {}
    arb_details = strategy.get("arb_details") or {}
    return arb_details.get("profit_usdc") or arb_details.get("profit")


def _fallback_message(payload: Dict[str, Any]) -> str:
    strategy = payload.get("strategy") or {}
    execution = payload.get("execution") or {}
    profit = _extract_profit(payload)

    profit_text = f"Estimated net profit: {profit} USDC." if profit is not None else "Estimated net profit is available in the attached blueprint."
    route = strategy.get("arb_details", {}).get("direction") or strategy.get("best_route", "ARBITRAGE")
    action = execution.get("action", "review execution blueprint")
    dex = execution.get("dex", "the selected route")
    reason = strategy.get("reason") or execution.get("reason") or "Arbitrage conditions were detected by the scanner."

    return (
        "Arbitrage opportunity detected.\n\n"
        f"{profit_text}\n"
        f"Route: {route}.\n"
        f"Execution: {action} on {dex}.\n"
        f"Signal: {reason}\n\n"
        "Review the execution blueprint before submitting capital."
    )


def draft_notification(payload: Dict[str, Any]) -> tuple[str, Optional[str]]:
    try:
        model = _build_model()
        messages = [
            SystemMessage(content="""
You are a senior DeFi analyst writing urgent trading alerts.

Use only the JSON provided by the scanner. Do not invent profit, gas, token,
or execution details. If a value is missing, say it needs review.

Write one concise human-readable alert for Discord and email:
- Start with the opportunity and expected profit.
- Mention gas cost or gas-estimation steps if present.
- Summarize the execution steps in plain English.
- Keep the tone exciting but responsible.
- End with a clear reminder to review the blueprint before execution.
"""),
            HumanMessage(content=f"""
Create the alert from this arbitrage notification blueprint.

JSON:
{_json_blob(payload)}
""")
        ]
        response = model.invoke(messages)
        content = getattr(response, "content", response)
        if isinstance(content, list):
            content = " ".join(str(item) for item in content)
        message = str(content).strip()
        if not message:
            raise ValueError("Gemini returned an empty notification")
        return message, None
    except Exception as exc:
        return _fallback_message(payload), str(exc)


def send_discord_message(message: str) -> bool:
    webhook_url = os.getenv("DISCORD_WEBHOOK_URL")
    if not webhook_url:
        raise ValueError("DISCORD_WEBHOOK_URL is not configured")

    discord_message = message
    if len(discord_message) > 1900:
        discord_message = f"{discord_message[:1890].rstrip()}\n...(truncated)"

    response = requests.post(
        webhook_url,
        json={"content": discord_message},
        timeout=15,
    )
    response.raise_for_status()
    return True


def send_email(subject: str, message: str) -> bool:
    gmail_user = os.getenv("GMAIL_USER")
    gmail_pass = os.getenv("GMAIL_PASS")
    notify_email = os.getenv("NOTIFY_EMAIL")

    missing = [
        name for name, value in {
            "GMAIL_USER": gmail_user,
            "GMAIL_PASS": gmail_pass,
            "NOTIFY_EMAIL": notify_email,
        }.items()
        if not value
    ]
    if missing:
        raise ValueError(f"Missing email environment variables: {', '.join(missing)}")

    email = EmailMessage()
    email["Subject"] = subject
    email["From"] = gmail_user
    email["To"] = notify_email
    email.set_content(message)

    smtp_host = os.getenv("GMAIL_SMTP_HOST", "smtp.gmail.com")
    smtp_port = int(os.getenv("GMAIL_SMTP_PORT", "465"))

    with smtplib.SMTP_SSL(smtp_host, smtp_port, timeout=20) as smtp:
        smtp.login(gmail_user, gmail_pass)
        smtp.send_message(email)

    return True


def notification_agent(payload: Dict[str, Any]) -> NotificationResult:
    message, llm_error = draft_notification(payload)
    dispatch_errors: List[str] = []
    discord_sent = False
    email_sent = False

    try:
        discord_sent = send_discord_message(message)
    except Exception as exc:
        dispatch_errors.append(f"Discord dispatch failed: {exc}")

    try:
        email_sent = send_email("AruDex Arbitrage Opportunity", message)
    except Exception as exc:
        dispatch_errors.append(f"Email dispatch failed: {exc}")

    return NotificationResult(
        message=message,
        discord_sent=discord_sent,
        email_sent=email_sent,
        dispatch_errors=dispatch_errors,
        llm_error=llm_error,
    )
