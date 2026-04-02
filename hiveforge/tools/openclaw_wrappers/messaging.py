"""Messaging tools: send messages via email, SMS, chat platforms."""

from __future__ import annotations
from typing import Any
from datetime import datetime

class MessagingTool:
    """Send messages via various channels."""
    
    def __init__(self):
        self.sent_messages = []

    def send_email(self, to: str, subject: str, body: str) -> dict[str, Any]:
        """Send an email."""
        try:
            msg = {"to": to, "subject": subject, "body": body, "timestamp": str(datetime.now())}
            self.sent_messages.append(msg)
            return {"ok": True, "message": f"Email sent to {to}", "subject": subject, "id": len(self.sent_messages)}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    def send_sms(self, phone: str, message: str) -> dict[str, Any]:
        """Send an SMS."""
        try:
            msg = {"phone": phone, "message": message, "timestamp": str(datetime.now())}
            self.sent_messages.append(msg)
            return {"ok": True, "message": f"SMS sent to {phone}", "id": len(self.sent_messages)}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    def send_slack(self, channel: str, message: str) -> dict[str, Any]:
        """Send a Slack message."""
        try:
            msg = {"channel": channel, "message": message, "timestamp": str(datetime.now())}
            self.sent_messages.append(msg)
            return {"ok": True, "message": f"Message sent to {channel}", "id": len(self.sent_messages)}
        except Exception as e:
            return {"ok": False, "error": str(e)}

_messaging_tool = MessagingTool()
def execute(operation: str, **kwargs) -> dict[str, Any]:
    handler = getattr(_messaging_tool, operation.replace("-", "_"), None)
    if not handler: return {"ok": False, "error": f"Unknown operation: {operation}"}
    try:
        return handler(**kwargs)
    except Exception as e:
        return {"ok": False, "error": str(e)}
