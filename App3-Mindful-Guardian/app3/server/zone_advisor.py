#!/usr/bin/env python3
"""Zone advisor for App 3.

Input can come from stdin JSON, CLI flags, environment variables, or the
interactive prompt:

  python3 zone_advisor.py --provider google --model gemini-3.5-flash --api-key ...
  python3 zone_advisor.py --provider ollama --url http://127.0.0.1:11434 --model gemma3:4b
  python3 zone_advisor.py --provider openai --url https://api.example.com/v1 --model gemma --api-key ...
  python3 zone_advisor.py --interactive

The bridge sends zone snapshots through stdin. The script returns JSON with a
LLM-decided riskLevel so the frontend can drive red/yellow/green status lights.
"""

from __future__ import annotations

import argparse
import getpass
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request


Risk = str
MOJIBAKE_RE = re.compile(r"[�\ue000-\uf8ff]|ï¿½|Ã|Â|[撌瘜隢璈鈭嚗蝘蝣摰雿霈]")

# Optional local script configuration. Leave blank to use CLI flags or env vars.
# Do not commit real API keys.
SCRIPT_LLM_PROVIDER = "google"  # "google", "ollama", or "openai"
SCRIPT_LLM_API_URL = "https://generativelanguage.googleapis.com/v1beta"
SCRIPT_LLM_API_KEY = ""
SCRIPT_LLM_MODEL = "gemini-3.5-flash"

ZONE_RULES = {
    "zone-library": {
        "name": "圖書館",
        "temperature_max": 28.0,
        "humidity_max": 50,
        "light_min": 650,
        "context": "圖書館需要安靜、乾燥、明亮且舒適，濕度過高容易影響書籍與閱讀舒適度。",
    },
    "zone-hall": {
        "name": "穿堂",
        "temperature_max": 28.0,
        "humidity_max": 60,
        "light_min": 500,
        "context": "穿堂是通行與集合區，允許短暫人流與溫度波動，但仍要保持通風與足夠照明。",
    },
    "zone-field": {
        "name": "操場",
        "temperature_max": 32.0,
        "humidity_max": 75,
        "light_min": 700,
        "context": "操場是戶外活動區，溫濕度容忍較高，但高溫高濕或光線不足時應提醒巡查。",
    },
}


def as_number(value, default=0.0):
    try:
        if value is None:
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def clamp(value, low=0, high=100):
    return max(low, min(high, value))


def sensor_text(sensor):
    sensor = sensor or {}
    return {
        "temperature": as_number(sensor.get("temperature")),
        "humidity": as_number(sensor.get("humidity")),
        "light": as_number(sensor.get("light")),
        "motion": bool(sensor.get("motion")),
        "status": sensor.get("status") or "unknown",
    }


def zone_rule(payload):
    zone_id = str(payload.get("zoneId") or "").strip()
    zone_name = str(payload.get("zoneName") or payload.get("name") or "").strip()
    if zone_id in ZONE_RULES:
        return ZONE_RULES[zone_id]
    for rule in ZONE_RULES.values():
        if rule["name"] and rule["name"] in zone_name:
            return rule
    return {
        "name": zone_name or "此區域",
        "temperature_max": 28.0,
        "humidity_max": 60,
        "light_min": 500,
        "context": "一般校園區域以舒適、通風與足夠照明作為基準。",
    }


def rule_lines(rule):
    return [
        f"溫度不應高於 {rule['temperature_max']} C",
        f"濕度不應高於 {rule['humidity_max']} %",
        f"光照不應低於 {rule['light_min']}",
    ]


def status_label(level: Risk):
    if level == "high":
        return "高風險"
    if level == "medium":
        return "注意"
    return "安全"


def normalize_risk(value) -> Risk:
    text = str(value or "").strip().lower()
    if text in {"high", "red", "danger", "critical", "高風險", "危險", "紅"}:
        return "high"
    if text in {"medium", "yellow", "warning", "attention", "注意", "黃"}:
        return "medium"
    if text in {"low", "green", "safe", "normal", "安全", "綠"}:
        return "low"
    return "medium"


def local_sensor_risk(payload):
    sensor = sensor_text(payload.get("sensor"))
    rule = zone_rule(payload)
    if sensor["status"] == "offline":
        return "medium", 58

    score = 18
    temp_over = sensor["temperature"] - rule["temperature_max"]
    humidity_over = sensor["humidity"] - rule["humidity_max"]
    light_under = rule["light_min"] - sensor["light"]

    if temp_over > 2.5:
        score += 34
    elif temp_over > 0:
        score += 18

    if humidity_over > 15:
        score += 30
    elif humidity_over > 0:
        score += 16

    if light_under > 300:
        score += 34
    elif light_under > 0:
        score += 16

    score = clamp(round(score))
    if score >= 68:
        return "high", score
    if score >= 45:
        return "medium", score
    return "low", score


def local_fallback(payload, reason="llm unavailable"):
    if payload.get("mode") == "manual_event":
        return local_event_fallback(payload, reason)
    if payload.get("mode") == "care_advice":
        return local_care_fallback(payload, reason)

    sensor = sensor_text(payload.get("sensor"))
    rule = zone_rule(payload)
    zone_name = payload.get("zoneName") or payload.get("name") or "此區域"
    detail_mode = payload.get("mode") != "status"
    risk_level, score = local_sensor_risk(payload)
    situations = []
    suggestions = []

    if risk_level == "high":
        situations.append("感測器數值已明顯偏離平常範圍，可能需要立即確認現場狀況。")
        suggestions.append("請優先派值勤人員或機器人前往，並確認通風、照明與學生動線。")
    elif risk_level == "medium":
        situations.append("感測器數值有偏移，可能是環境短暫變化或人流造成。")
        suggestions.append("先持續觀察 1 到 3 分鐘，若燈號維持注意再前往確認。")
    else:
        situations.append("感測器數值落在穩定範圍，未見明顯異常。")
        suggestions.append("維持例行巡查即可。")

    if sensor["temperature"] > rule["temperature_max"]:
        situations.append(f"溫度 {sensor['temperature']:.1f}°C 高於此區建議上限 {rule['temperature_max']}°C。")
        suggestions.append("確認現場是否悶熱，必要時調整通風。")
    if sensor["humidity"] > rule["humidity_max"]:
        situations.append(f"濕度 {sensor['humidity']:.0f}% 高於此區建議上限 {rule['humidity_max']}%。")
        suggestions.append("留意學生舒適度與地面濕滑狀況。")
    if sensor["light"] < rule["light_min"]:
        situations.append(f"光照 {sensor['light']:.0f} 低於此區建議下限 {rule['light_min']}。")
        suggestions.append("檢查照明或提醒現場開燈。")

    return {
        "ok": True,
        "source": "fallback",
        "model": None,
        "riskLevel": risk_level,
        "statusLabel": status_label(risk_level),
        "confidence": score,
        "summary": f"{zone_name}目前判定為「{status_label(risk_level)}」，依感測器數值給出備援燈號。" if detail_mode else "",
        "situations": situations[:5] if detail_mode else [],
        "suggestions": suggestions[:5] if detail_mode else [],
        "error": reason,
    }


def local_event_fallback(payload, reason="llm unavailable"):
    text = str(payload.get("eventText") or payload.get("description") or payload.get("message") or "").strip()
    zone_name = payload.get("zoneName") or payload.get("name") or payload.get("location") or "校園區域"
    hot_words = ("打架", "推擠", "威脅", "自傷", "哭", "崩潰", "攻擊", "霸凌", "失控", "危險", "受傷", "衝突", "生氣", "憤怒")
    risk_level = "high" if any(word in text for word in hot_words) else "medium"
    reason_text = "事件內容包含較高急迫性的關鍵詞。" if risk_level == "high" else "事件需要老師確認，但尚未出現立即危險訊號。"
    return {
        "ok": True,
        "source": "fallback",
        "model": None,
        "riskLevel": risk_level,
        "statusLabel": status_label(risk_level),
        "confidence": 82 if risk_level == "high" else 62,
        "summary": f"{zone_name}新增事件判定為「{status_label(risk_level)}」。",
        "situations": [reason_text, text[:80] if text else "手動事件未提供完整內容。"],
        "suggestions": [
            "請值週老師或機器人先前往確認現場。",
            "若學生情緒明顯低落、憤怒或有衝突跡象，請通知導師或輔導室接手。",
        ],
        "error": reason,
    }


def local_care_fallback(payload, reason="llm unavailable"):
    risk_level = normalize_risk(payload.get("severity") or payload.get("riskLevel"))
    category = str(payload.get("category") or "").strip()
    message = str(payload.get("message") or payload.get("description") or "").strip()

    if risk_level == "high":
        reply = "請先由熟悉學生或場域的老師低壓接近，確認安全與是否有立即危險；若出現自傷、衝突或失控跡象，立即通知導師與輔導室接手。"
    elif "課業" in category or "壓力" in message:
        reply = "建議老師先用短句確認學生目前壓力來源，提供可立即完成的一小步任務，並約定稍後再回來追蹤狀況。"
    else:
        reply = "建議先派老師或機器人到場確認，保持不公開點名、不貼標籤的關懷方式，記錄現場變化後再決定是否升級處理。"

    return {
        "ok": True,
        "source": "fallback",
        "model": None,
        "riskLevel": risk_level,
        "statusLabel": status_label(risk_level),
        "confidence": None,
        "summary": reply,
        "situations": [],
        "suggestions": [reply],
        "error": reason,
    }


def build_prompt(payload):
    if payload.get("mode") == "care_advice":
        return f"""
你是國中校園心靈守護系統的關懷建議助理。請根據提醒內容，給老師一段可立即執行的繁體中文建議。

限制：
- 不做心理或醫療診斷，不給學生貼標籤。
- 語氣專業、溫暖、低壓。
- 必須包含：第一步怎麼接近、現場要確認什麼、什麼情況需要導師或輔導室接手。
- 回覆 2 到 3 句，總長不要超過 110 字。

區域/地點：{payload.get("zoneName") or payload.get("location")}
班級/場域：{payload.get("className")}
對象：{payload.get("studentAlias")}
預警類型：{payload.get("alertType")}
分類：{payload.get("category")}
嚴重度：{payload.get("severity") or payload.get("riskLevel")}
提醒內容：{payload.get("message") or payload.get("description")}

請回傳 JSON，不要加 Markdown。
{{
  "riskLevel": "low|medium|high",
  "statusLabel": "安全|注意|高風險",
  "confidence": 0-100,
  "summary": "AI 關懷建議"
}}
""".strip()

    if payload.get("mode") == "manual_event":
        return f"""
你是國中校園安全守護系統的事件分級助理。請根據手動輸入事件判斷風險級別，只能回「medium」或「high」：
- medium = 注意：需要派人確認、學生可能情緒低落/焦慮/爭執，但沒有立即危險。
- high = 高風險：疑似衝突、霸凌、受傷、自傷、失控、威脅、強烈憤怒或需要立即介入。

區域：{payload.get("zoneName") or payload.get("name")}
位置：{payload.get("location")}
事件來源：{payload.get("source") or "manual"}
事件內容：{payload.get("eventText") or payload.get("description") or payload.get("message")}

請回傳 JSON，不要加 Markdown。
{{
  "riskLevel": "medium|high",
  "statusLabel": "注意|高風險",
  "confidence": 0-100,
  "summary": "一句話總結",
  "situations": ["可能狀況 1", "可能狀況 2"],
  "suggestions": ["建議處置 1", "建議處置 2"]
}}
""".strip()

    sensor = sensor_text(payload.get("sensor"))
    rule = zone_rule(payload)
    detail_mode = payload.get("mode") != "status"
    if not detail_mode:
        return f"""
只回 JSON。依此區門檻判斷燈號，riskLevel 只能是 low、medium、high。
區域：{payload.get("zoneName") or payload.get("name")}
門檻：溫度 <= {rule["temperature_max"]} C；濕度 <= {rule["humidity_max"]}%；光照 >= {rule["light_min"]}
目前：溫度 {sensor["temperature"]} C；濕度 {sensor["humidity"]}%；光照 {sensor["light"]}；感測器 {sensor["status"]}
格式：{{"riskLevel":"low|medium|high","statusLabel":"安全|注意|高風險","confidence":0-100}}
""".strip()
    output_shape = """
請回傳 JSON，不要加 Markdown。riskLevel 只能是 low、medium、high。
{
  "riskLevel": "low|medium|high",
  "statusLabel": "安全|注意|高風險",
  "confidence": 0-100,
  "summary": "一句話總結",
  "situations": ["可能狀況 1", "可能狀況 2"],
  "suggestions": ["建議處置 1", "建議處置 2"]
}
""".strip() if detail_mode else """
請回傳 JSON，不要加 Markdown。只需要燈號判斷，不要摘要、可能狀況或建議。riskLevel 只能是 low、medium、high。
{
  "riskLevel": "low|medium|high",
  "statusLabel": "安全|注意|高風險",
  "confidence": 0-100
}
""".strip()
    return f"""
你是國中校園安全守護系統的區域判讀助理。請只根據區域位置、節點狀態、提醒數、溫度、濕度、光照與感測器狀態判斷，不要使用聲量資料。

區域：{payload.get("zoneName") or payload.get("name")}
位置：{payload.get("location")}
區域特性：{rule["context"]}
此區判斷門檻：
- {rule_lines(rule)[0]}
- {rule_lines(rule)[1]}
- {rule_lines(rule)[2]}
目前本機燈號：{payload.get("currentStatusLabel") or payload.get("currentRiskLevel")}
本機感測器分數：{payload.get("ruleBasedScore")}
提醒數：{payload.get("alertCount")}
節點狀態：{payload.get("nodeStatus")}
溫度：{sensor["temperature"]} C
濕度：{sensor["humidity"]} %
光照：{sensor["light"]}
動作偵測：{sensor["motion"]}
感測器狀態：{sensor["status"]}

{output_shape}
""".strip()


def extract_json(text):
    text = text.strip()
    if not text:
        return None
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        return None
    try:
        return json.loads(text[start : end + 1])
    except json.JSONDecodeError:
        return None


def has_mojibake(value):
    return isinstance(value, str) and bool(MOJIBAKE_RE.search(value))


def clean_text(value, fallback=""):
    if isinstance(value, str):
        text = value.strip()
        if text and not has_mojibake(text):
            return text
    return fallback


def clean_list(value, fallback=None, limit=5):
    fallback = fallback or []
    if not isinstance(value, list):
        return fallback[:limit]
    cleaned = [clean_text(item) for item in value]
    cleaned = [item for item in cleaned if item]
    return cleaned[:limit] if cleaned else fallback[:limit]


def normalize_result(parsed, payload, source, model):
    if not isinstance(parsed, dict):
        parsed = {}
    detail_mode = payload.get("mode") != "status"
    risk_level = normalize_risk(parsed.get("riskLevel") or parsed.get("level") or payload.get("severity") or payload.get("riskLevel"))
    if payload.get("mode") == "manual_event" and risk_level == "low":
        risk_level = "medium"
    if payload.get("mode") == "care_advice":
        fallback = local_care_fallback(payload, "")
        summary = clean_text(parsed.get("summary") or parsed.get("reply"), fallback["summary"])
        return {
            "ok": True,
            "source": source,
            "model": model,
            "riskLevel": risk_level,
            "statusLabel": status_label(risk_level),
            "confidence": int(clamp(round(as_number(parsed.get("confidence"), 70)))) if parsed.get("confidence") is not None else None,
            "summary": summary,
            "situations": [],
            "suggestions": [summary] if summary else [],
        }
    confidence = parsed.get("confidence")
    confidence = int(clamp(round(as_number(confidence, 70)))) if confidence is not None else None
    return {
        "ok": True,
        "source": source,
        "model": model,
        "riskLevel": risk_level,
        "statusLabel": status_label(risk_level),
        "confidence": confidence,
        "summary": clean_text(parsed.get("summary"), f"{payload.get('zoneName') or '此區域'}目前判定為{status_label(risk_level)}。") if detail_mode else "",
        "situations": clean_list(parsed.get("situations"), [], 5) if detail_mode else [],
        "suggestions": clean_list(parsed.get("suggestions"), [], 5) if detail_mode else [],
    }


def read_payload_stdin():
    text = sys.stdin.read()
    if not text.strip():
        return {}
    return json.loads(text)


def read_args():
    parser = argparse.ArgumentParser(description="App 3 zone advisor")
    parser.add_argument("--provider", choices=["google", "ollama", "openai"], help="LLM provider mode")
    parser.add_argument("--url", "--api-url", dest="api_url", help="Base URL or full endpoint URL")
    parser.add_argument("--api-key", dest="api_key", help="API key for cloud or OpenAI-compatible endpoints")
    parser.add_argument("--model", help="Model name, for example gemma3:4b")
    parser.add_argument("--interactive", action="store_true", help="Prompt for URL/key/model before reading zone JSON")
    return parser.parse_args()


def first_text(*values):
    for value in values:
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""


def resolve_config(payload, args):
    config = {
        "api_url": first_text(
            getattr(args, "api_url", ""),
            os.environ.get("ZONE_ADVISOR_API_URL"),
            os.environ.get("GOOGLE_AI_STUDIO_API_URL"),
            os.environ.get("GEMINI_API_URL"),
            os.environ.get("LLM_API_URL"),
            SCRIPT_LLM_API_URL,
            os.environ.get("OLLAMA_BASE_URL"),
            os.environ.get("OLLAMA_HOST"),
            "https://generativelanguage.googleapis.com/v1beta",
        ),
        "api_key": first_text(
            getattr(args, "api_key", ""),
            os.environ.get("ZONE_ADVISOR_API_KEY"),
            os.environ.get("GEMINI_API_KEY"),
            os.environ.get("GOOGLE_API_KEY"),
            os.environ.get("GOOGLE_AI_STUDIO_API_KEY"),
            os.environ.get("LLM_API_KEY"),
            os.environ.get("OPENAI_API_KEY"),
            os.environ.get("OLLAMA_API_KEY"),
            SCRIPT_LLM_API_KEY,
        ),
        "model": first_text(
            getattr(args, "model", ""),
            os.environ.get("ZONE_ADVISOR_MODEL"),
            os.environ.get("GEMINI_MODEL"),
            os.environ.get("GOOGLE_AI_MODEL"),
            os.environ.get("LLM_MODEL"),
            SCRIPT_LLM_MODEL,
            os.environ.get("OLLAMA_MODEL"),
            "gemini-3.5-flash",
        ),
        "provider": first_text(getattr(args, "provider", ""), os.environ.get("ZONE_ADVISOR_PROVIDER"), os.environ.get("LLM_PROVIDER"), SCRIPT_LLM_PROVIDER),
    }

    if getattr(args, "interactive", False):
        config["api_url"] = input(f"LLM URL [{config['api_url']}]: ").strip() or config["api_url"]
        config["model"] = input(f"Model [{config['model']}]: ").strip() or config["model"]
        if not config["api_key"]:
            config["api_key"] = getpass.getpass("API key (optional): ").strip()

    if "://" not in config["api_url"]:
        config["api_url"] = f"http://{config['api_url']}"
    config["api_url"] = config["api_url"].rstrip("/")
    if not config["provider"]:
        if "generativelanguage.googleapis.com" in config["api_url"] or config["api_key"].startswith(("AIza",)):
            config["provider"] = "google"
        else:
            config["provider"] = "openai" if "/v1" in config["api_url"] or config["api_key"].startswith(("sk-", "gsk_")) else "ollama"
    return config


def call_google_ai_studio(payload, config, timeout):
    if not config["api_key"]:
        raise RuntimeError("GEMINI_API_KEY or GOOGLE_API_KEY is required for Google AI Studio")
    base_url = config["api_url"].rstrip("/")
    model = urllib.parse.quote(config["model"], safe="")
    endpoint = f"{base_url}/models/{model}:generateContent?key={urllib.parse.quote(config['api_key'], safe='')}"
    detail_mode = payload.get("mode") != "status"
    body = {
        "contents": [{
            "role": "user",
            "parts": [{
                "text": "你是繁體中文校園安全判讀助理，只回傳 JSON。\n\n" + build_prompt(payload)
            }],
        }],
        "generationConfig": {
            "temperature": 0.1 if not detail_mode else 0.2,
            "maxOutputTokens": 90 if not detail_mode else 420,
            "responseMimeType": "application/json",
        },
    }
    headers = {"Content-Type": "application/json"}
    request = urllib.request.Request(endpoint, data=json.dumps(body).encode("utf-8"), headers=headers, method="POST")
    with urllib.request.urlopen(request, timeout=timeout) as response:
        raw = response.read().decode("utf-8")
    result = json.loads(raw)
    parts = result.get("candidates", [{}])[0].get("content", {}).get("parts", [])
    content = "".join(str(part.get("text", "")) for part in parts)
    return normalize_result(extract_json(content), payload, "google-ai-studio", config["model"])


def call_ollama(payload, config, timeout):
    url = config["api_url"]
    endpoint = url if url.endswith("/api/generate") else f"{url}/api/generate"
    detail_mode = payload.get("mode") != "status"
    body = {
        "model": config["model"],
        "prompt": build_prompt(payload),
        "stream": False,
        "options": {"temperature": 0.1 if not detail_mode else 0.2, "num_predict": 80 if not detail_mode else 420},
    }
    headers = {"Content-Type": "application/json"}
    if config["api_key"]:
        headers["Authorization"] = f"Bearer {config['api_key']}"
    request = urllib.request.Request(endpoint, data=json.dumps(body).encode("utf-8"), headers=headers, method="POST")
    with urllib.request.urlopen(request, timeout=timeout) as response:
        raw = response.read().decode("utf-8")
    result = json.loads(raw)
    parsed = extract_json((result.get("response") or "").strip())
    return normalize_result(parsed, payload, "ollama-gemma", config["model"])


def call_openai_compatible(payload, config, timeout):
    url = config["api_url"]
    base_url = url[:-3] if url.endswith("/v1") else url
    endpoint = url if url.endswith("/chat/completions") else f"{base_url}/v1/chat/completions"
    detail_mode = payload.get("mode") != "status"
    body = {
        "model": config["model"],
        "temperature": 0.1 if not detail_mode else 0.2,
        "max_tokens": 90 if not detail_mode else 420,
        "messages": [
            {"role": "system", "content": "你是繁體中文校園安全判讀助理，只回傳 JSON。"},
            {"role": "user", "content": build_prompt(payload)},
        ],
    }
    headers = {"Content-Type": "application/json"}
    if config["api_key"]:
        headers["Authorization"] = f"Bearer {config['api_key']}"
    request = urllib.request.Request(endpoint, data=json.dumps(body).encode("utf-8"), headers=headers, method="POST")
    with urllib.request.urlopen(request, timeout=timeout) as response:
        raw = response.read().decode("utf-8")
    result = json.loads(raw)
    content = result.get("choices", [{}])[0].get("message", {}).get("content", "")
    return normalize_result(extract_json(content), payload, "cloud-gemma", config["model"])


def call_llm(payload, config):
    detail_mode = payload.get("mode") != "status"
    timeout_default = 5 if not detail_mode else 12
    timeout = as_number(os.environ.get("OLLAMA_TIMEOUT_SECONDS") or os.environ.get("LLM_TIMEOUT_SECONDS"), timeout_default)
    if config["provider"] == "google":
        return call_google_ai_studio(payload, config, timeout)
    if config["provider"] == "openai":
        return call_openai_compatible(payload, config, timeout)
    return call_ollama(payload, config, timeout)


def main():
    args = read_args()
    try:
        payload = read_payload_stdin()
    except json.JSONDecodeError as exc:
        print(json.dumps(local_fallback({}, f"invalid json: {exc}"), ensure_ascii=False))
        return

    try:
        config = resolve_config(payload, args)
        print(json.dumps(call_llm(payload, config), ensure_ascii=False))
    except (OSError, urllib.error.URLError, RuntimeError, TimeoutError, json.JSONDecodeError, KeyError, IndexError) as exc:
        print(json.dumps(local_fallback(payload, str(exc)), ensure_ascii=False))


if __name__ == "__main__":
    main()
