import argparse
import asyncio
import base64
import json
import sys
import threading
import time

import cv2
import numpy as np
import websockets
from openai import OpenAI
from ultralytics import YOLO


# =====================
# LLM
# =====================
client = OpenAI(
    base_url="http://localhost:11434/v1",
    api_key="your_key"
)


# =====================
# YOLO model
# =====================
model = YOLO("yolov8n.pt")
model_lock = threading.Lock()


latest_result = ""
latest_payload = None
frontend_clients = set()
bridge_loop = None
scan_requested = threading.Event()
frame_lock = threading.Lock()
latest_frame = None

BRIDGE_HOST = "0.0.0.0"
BRIDGE_PORT = 3203
PAYLOAD_MARKER = "__LLM_EMOTION_JSON__"


# =====================
# Frontend bridge
# Kept for manual mode. The Vite API uses --once and does not need this.
# =====================
async def bridge_handler(ws):
    frontend_clients.add(ws)
    try:
        if latest_payload:
            await ws.send(json.dumps(latest_payload, ensure_ascii=False))

        async for raw in ws:
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                continue

            if data.get("type") == "scan":
                scan_requested.set()
    finally:
        frontend_clients.discard(ws)


async def bridge_main():
    async with websockets.serve(bridge_handler, BRIDGE_HOST, BRIDGE_PORT):
        print(f"Frontend bridge = ws://localhost:{BRIDGE_PORT}/ws")
        await asyncio.Future()


def start_bridge():
    global bridge_loop
    bridge_loop = asyncio.new_event_loop()
    asyncio.set_event_loop(bridge_loop)
    bridge_loop.run_until_complete(bridge_main())


def broadcast(payload):
    global latest_payload
    latest_payload = payload

    if not bridge_loop or not frontend_clients:
        return

    message = json.dumps(payload, ensure_ascii=False)

    async def send_all():
        dead = []
        for ws in list(frontend_clients):
            try:
                await ws.send(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            frontend_clients.discard(ws)

    asyncio.run_coroutine_threadsafe(send_all(), bridge_loop)


# =====================
# Emotion mapping
# =====================
VALID_EMOTIONS = {"happy", "calm", "focused", "anxious", "sad", "stressed"}
EMOTION_LABELS = {
    "happy": "愉悅",
    "calm": "平靜",
    "focused": "專注",
    "anxious": "焦慮",
    "sad": "低落",
    "stressed": "緊張",
}
EMOTION_ALIASES = {
    "愉悅": "happy",
    "開心": "happy",
    "快樂": "happy",
    "happy": "happy",
    "平靜": "calm",
    "穩定": "calm",
    "calm": "calm",
    "專注": "focused",
    "投入": "focused",
    "focused": "focused",
    "focus": "focused",
    "焦慮": "anxious",
    "不安": "anxious",
    "anxious": "anxious",
    "低落": "sad",
    "難過": "sad",
    "沮喪": "sad",
    "sad": "sad",
    "緊張": "stressed",
    "壓力": "stressed",
    "高壓": "stressed",
    "生氣": "stressed",
    "憤怒": "stressed",
    "stressed": "stressed",
    "stress": "stressed",
}


def normalize_emotion(value, fallback):
    if value is None:
        return fallback
    text = str(value).strip().lower()
    if text in VALID_EMOTIONS:
        return text
    for alias, key in EMOTION_ALIASES.items():
        if alias.lower() in text:
            return key
    return fallback


def clamp_metric(value, fallback):
    try:
        return max(0, min(100, int(value)))
    except Exception:
        return fallback


def extract_json(text):
    try:
        return json.loads(text)
    except Exception:
        pass

    start = text.find("{")
    end = text.rfind("}")
    if start >= 0 and end > start:
        try:
            return json.loads(text[start:end + 1])
        except Exception:
            return None
    return None


def fallback_params(text, person_count):
    lowered = text.lower()

    if any(w in text for w in ["高壓", "生氣", "憤怒", "暴躁", "煩躁", "緊繃", "緊張"]):
        emotion = "stressed"
        stress, stability, focus = 82, 34, 36
        advice = "現場壓力較高，建議老師以低壓方式靠近確認。"
    elif any(w in text for w in ["疲倦", "想睡", "低落", "趴", "放空", "沮喪", "難過"]):
        emotion = "sad"
        stress, stability, focus = 58, 48, 38
        advice = "班級精神稍低，建議安排短暫伸展或提問互動。"
    elif any(w in text for w in ["分散", "不穩定", "焦慮", "不安", "混亂"]):
        emotion = "anxious"
        stress, stability, focus = 68, 42, 45
        advice = "注意力有些浮動，建議降低干擾並重新聚焦課堂節奏。"
    elif any(w in text for w in ["專注", "認真", "聽課", "投入"]):
        emotion = "focused"
        stress, stability, focus = 32, 78, 88
        advice = "整體專注度不錯，可以進入需要思考的學習任務。"
    elif any(w in text for w in ["開心", "精神不錯", "輕鬆", "活躍", "愉快"]) or "happy" in lowered:
        emotion = "happy"
        stress, stability, focus = 22, 82, 72
        advice = "班級氣氛明亮，可以延續互動與討論。"
    else:
        emotion = "calm"
        stress, stability, focus = 28, 84, 68
        advice = "整體狀態平穩，持續觀察即可。"

    response = text.splitlines()[-1].replace("整體狀態：", "").strip() if text.strip() else "已完成教室狀態觀察。"
    if not response:
        response = "已完成教室狀態觀察。"

    return {
        "emotion": emotion,
        "emotionLabel": EMOTION_LABELS[emotion],
        "stress": stress,
        "stability": stability,
        "focus": focus,
        "response": response[:80],
        "advice": advice,
        "moodLabel": "教室觀察",
        "riskLabel": "需留意" if stress >= 65 else "穩定",
        "fusionScore": round((focus + stability + (100 - stress)) / 30, 1),
        "personStates": [],
        "summary": response,
        "personCount": person_count,
    }


def normalize_params(parsed, raw_text, person_count):
    fallback = fallback_params(raw_text, person_count)
    if not isinstance(parsed, dict):
        return fallback

    emotion = normalize_emotion(parsed.get("emotion") or parsed.get("emotionLabel") or parsed.get("label"), fallback["emotion"])

    response = parsed.get("response") or parsed.get("summary") or fallback["response"]
    advice = parsed.get("advice") or fallback["advice"]

    return {
        **fallback,
        **parsed,
        "emotion": emotion,
        "emotionLabel": EMOTION_LABELS[emotion],
        "stress": clamp_metric(parsed.get("stress"), fallback["stress"]),
        "stability": clamp_metric(parsed.get("stability"), fallback["stability"]),
        "focus": clamp_metric(parsed.get("focus"), fallback["focus"]),
        "response": str(response).strip()[:120],
        "advice": str(advice).strip()[:120],
        "moodLabel": str(parsed.get("moodLabel") or fallback["moodLabel"]),
        "riskLabel": str(parsed.get("riskLabel") or fallback["riskLabel"]),
        "fusionScore": parsed.get("fusionScore", fallback["fusionScore"]),
        "personCount": person_count,
    }


def build_frontend_payload(params, audio_context=None):
    audio_context = audio_context if isinstance(audio_context, dict) else {}
    audio_volume = audio_context.get("volumeIndex")
    try:
        audio_volume_number = int(audio_volume)
    except Exception:
        audio_volume_number = None
    mood_score_by_emotion = {
        "happy": 0,
        "calm": 0,
        "focused": 0,
        "anxious": 1,
        "sad": 1,
        "stressed": 2,
    }
    mood_score = mood_score_by_emotion.get(params["emotion"], 0)
    if audio_volume_number is None:
        sound_score = 0 if params["stability"] >= 70 else 1 if params["stability"] >= 45 else 2
    else:
        sound_score = 0 if audio_volume_number < 46 else 1 if audio_volume_number < 72 else 2
    node_score = 0 if params["focus"] >= 70 else 1 if params["focus"] >= 45 else 2
    alert_score = 0 if params["stress"] < 55 else 1 if params["stress"] < 75 else 2

    return {
        "type": "emotion",
        "source": "LLMEmotion.py",
        "emotion": params["emotion"],
        "emotionLabel": params.get("emotionLabel", EMOTION_LABELS.get(params["emotion"], params["emotion"])),
        "response": params["response"],
        "advice": params["advice"],
        "stress": params["stress"],
        "stability": params["stability"],
        "focus": params["focus"],
        "moodLabel": params["moodLabel"],
        "riskLabel": params["riskLabel"],
        "fusionScore": params["fusionScore"],
        "signals": {
            "moodScore": mood_score,
            "soundScore": sound_score,
            "nodeScore": node_score,
            "alertScore": alert_score,
            "personCount": params["personCount"],
            "personStates": params.get("personStates", []),
            "summary": params.get("summary", params["response"]),
            "ambientAudio": {
                "source": audio_context.get("source", "unknown"),
                "volumeIndex": audio_volume_number,
                "volatility": audio_context.get("volatility"),
                "level": audio_context.get("level"),
                "summary": audio_context.get("summary"),
            },
        },
        "robotActive": True,
        "createdAt": int(time.time() * 1000),
    }


# =====================
# LLM analysis
# =====================
def analyze(frame, should_broadcast=True, verbose=True, audio_context=None, location_context=None):
    global latest_result
    audio_context = audio_context if isinstance(audio_context, dict) else {}
    location_context = location_context if isinstance(location_context, dict) else {}

    _, buffer = cv2.imencode(".jpg", frame)
    img_b64 = base64.b64encode(buffer).decode()

    with model_lock:
        results = model(frame, verbose=False)[0]
    person_count = sum(1 for box in results.boxes if int(box.cls[0]) == 0)

    audio_line = ""
    if audio_context:
        audio_line = (
            "\n前端 iPad 麥克風環境聲音："
            f"音量指標 {audio_context.get('volumeIndex', '未知')}/100，"
            f"波動 {audio_context.get('volatility', '未知')}，"
            f"等級 {audio_context.get('level', '未知')}，"
            f"摘要：{audio_context.get('summary', '無')}。\n"
            "請把環境聲音作為輔助線索，不要當成唯一判斷。"
        )
    location_line = ""
    if location_context:
        location_line = (
            "\n目前機器人所在/被指派地點："
            f"{location_context.get('zoneName', '未知區域')}，"
            f"位置說明：{location_context.get('location', '未知')}，"
            f"狀態：{location_context.get('statusLabel', '未知')}，"
            f"任務階段：{location_context.get('stage', '未知')}。\n"
            "請把地點作為情境線索，例如圖書館通常較安靜、操場通常聲量較高、穿堂人流較多；但仍以畫面人物表情為主。"
        )

    prompt = f"""
你是國中校園裡的「AI 心靈守護機器人」，正在用鏡頭做低壓、非診斷式的情緒觀察。

請觀察畫面中每個學生的狀態（表情、眉眼、嘴角、臉部張力、姿勢、頭部方向、專注程度、是否低落或緊繃）。

畫面中 YOLO 偵測到的人數 = {person_count}
{audio_line}
{location_line}

判斷權重請嚴格依照：
- 70%：畫面人物表情與姿態。臉部表情、眉眼/嘴角、身體姿態與互動狀態是主要依據。
- 20%：環境聲音大小與波動。聲量高只代表現場較活躍或吵雜，不能單獨判為焦慮/緊張。
- 10%：目前地點情境。地點只用來校正聲音與行為的合理性。

如果畫面中的人物表情明顯，必須優先依表情判斷；不要讓地點或聲音覆蓋清楚的表情線索。

前端機器人只支援以下六種情緒分級，請務必選其中一種，不可以新增其他分類：
- happy / 愉悅：表情明亮、放鬆、有互動意願。
- calm / 平靜：狀態穩定、沒有明顯壓力或異常。
- focused / 專注：注意力集中、投入學習或任務。
- anxious / 焦慮：不安、坐立難安、注意力明顯飄移，壓力尚未到高壓。
- sad / 低落：疲倦、沮喪、趴桌、退縮、缺乏互動。
- stressed / 緊張：高壓、緊繃、憤怒、明顯煩躁、可能需要立即關懷。

回覆規則：
- emotion 必須輸出英文 key：happy、calm、focused、anxious、sad、stressed。
- emotionLabel 必須輸出中文分級：愉悅、平靜、專注、焦慮、低落、緊張。
- response 是「機器人前端要直接說出口」的一句話，請依 emotion 生成，不要使用固定模板。
- response 必須明確包含 emotionLabel 的其中一個關鍵字：愉悅、平靜、專注、焦慮、低落、緊張。
- response 必須依照 emotionLabel 生成，讓機器人像在現場溫柔回應學生；句子要自然，20-45 個中文字。
- response 可以輕微提到現場狀態或地點，但不要暴露隱私，不要說「我看到你的臉」。
- happy/calm/focused：語氣鼓勵、自然、短句即可。
- anxious/sad/stressed：語氣溫柔、低壓、不責備，提供可立即做的小步驟；不要說已通知老師，除非只是建議老師確認。
- advice 是給老師/中控的一句行動建議。
- summary 是給中控需注意狀況使用的一句現場摘要。
- personStates 請列出每個可見人物的自然中文短句，例如「第1人：有點疲倦但仍看向前方」。
- summary 需簡短說明：主要視覺表情線索、聲音狀態、地點情境如何一起影響判斷。

請只輸出 JSON，不要 Markdown，不要多餘說明。
格式如下：
{{
  "emotion": "happy/calm/focused/anxious/sad/stressed 其中之一",
  "emotionLabel": "愉悅/平靜/專注/焦慮/低落/緊張 其中之一",
  "stress": 0-100,
  "stability": 0-100,
  "focus": 0-100,
  "moodLabel": "自然中文短標籤，例如：專注但略疲倦",
  "riskLabel": "穩定/需留意/高關注",
  "response": "機器人要說的一句自然短回覆",
  "advice": "給老師或中控的一句短建議",
  "summary": "一句話描述現場情緒狀況",
  "personStates": ["第1人：...", "第2人：..."]
}}
"""

    try:
        res = client.chat.completions.create(
            model="gemma4:31b-cloud",
            messages=[{
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {
                        "url": f"data:image/jpeg;base64,{img_b64}"
                    }}
                ]
            }]
        )
        latest_result = res.choices[0].message.content
    except Exception as exc:
        latest_result = f"LLM 分析失敗：{exc}"

    parsed = extract_json(latest_result)
    params = normalize_params(parsed, latest_result, person_count)
    payload = build_frontend_payload(params, audio_context)

    if should_broadcast:
        broadcast(payload)

    if verbose:
        print(latest_result)
        print("Frontend emotion:", payload["emotion"], payload["response"])

    return payload


def capture_frame(camera_index=0, warmup_frames=8):
    cap = cv2.VideoCapture(camera_index)
    if not cap.isOpened():
        raise RuntimeError("camera error")

    frame = None
    try:
        for _ in range(max(1, warmup_frames)):
            ret, current = cap.read()
            if ret:
                frame = current
        if frame is None:
            raise RuntimeError("camera frame error")
        return frame
    finally:
        cap.release()


def frame_from_payload(payload):
    if not isinstance(payload, dict):
        return None
    image_data = payload.get("imageData") or payload.get("frame")
    if not isinstance(image_data, str) or not image_data.strip():
        return None
    if "," in image_data and image_data.lower().startswith("data:image"):
        image_data = image_data.split(",", 1)[1]
    raw = base64.b64decode(image_data)
    arr = np.frombuffer(raw, dtype=np.uint8)
    frame = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if frame is None:
        raise RuntimeError("payload frame decode error")
    return frame


def read_stdin_payload():
    raw = sys.stdin.read()
    if not raw.strip():
        return {}
    return json.loads(raw)


def run_once(camera_index=0, stdin_payload=False):
    payload_input = read_stdin_payload() if stdin_payload else {}
    frame = frame_from_payload(payload_input) if payload_input else None
    if frame is None:
        frame = capture_frame(camera_index)
    payload = analyze(
        frame,
        should_broadcast=False,
        verbose=False,
        audio_context=payload_input.get("audio") if isinstance(payload_input, dict) else None,
        location_context=payload_input.get("location") if isinstance(payload_input, dict) else None,
    )
    print(f"{PAYLOAD_MARKER}{json.dumps(payload, ensure_ascii=False)}")


def run_interactive(camera_index=0):
    global latest_frame

    threading.Thread(target=start_bridge, daemon=True).start()

    cap = cv2.VideoCapture(camera_index)
    if not cap.isOpened():
        print("camera error")
        return 1

    print("SPACE = analyze | Q = quit")

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        with frame_lock:
            latest_frame = frame.copy()

        display = frame.copy()

        with model_lock:
            results = model(frame, verbose=False)[0]

        for box in results.boxes:
            cls = int(box.cls[0])
            if cls != 0:
                continue

            x1, y1, x2, y2 = map(int, box.xyxy[0])
            cv2.rectangle(display, (x1, y1), (x2, y2), (0, 255, 0), 2)

        y0 = 30
        for line in latest_result.split("\n")[-6:]:
            cv2.putText(
                display,
                line[:60],
                (10, y0),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.5,
                (255, 255, 0),
                1
            )
            y0 += 20

        cv2.imshow("YOLO + LLM Classroom", display)

        key = cv2.waitKey(1)

        if scan_requested.is_set():
            scan_requested.clear()
            with frame_lock:
                frame_for_scan = latest_frame.copy() if latest_frame is not None else frame.copy()
            threading.Thread(
                target=analyze,
                args=(frame_for_scan,),
                daemon=True
            ).start()

        if key == 32:
            threading.Thread(
                target=analyze,
                args=(frame.copy(),),
                daemon=True
            ).start()
        elif key == ord("q"):
            break

    cap.release()
    cv2.destroyAllWindows()
    return 0


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--once", action="store_true", help="capture one frame, analyze, print frontend JSON, then exit")
    parser.add_argument("--camera", type=int, default=0)
    parser.add_argument("--stdin-payload", action="store_true", help="read JSON with imageData/audio from stdin")
    args = parser.parse_args()

    try:
        if args.once:
            run_once(args.camera, args.stdin_payload)
            return 0
        return run_interactive(args.camera)
    except Exception as exc:
        print(f"{PAYLOAD_MARKER}{json.dumps({'error': str(exc)}, ensure_ascii=False)}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
