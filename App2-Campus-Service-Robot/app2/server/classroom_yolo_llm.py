#!/usr/bin/env python3
import base64
import json
import os
import sys
from pathlib import Path

PERSON_CLASS_ID = 0
YOLO_IMAGE_SIZE = int(os.environ.get("YOLO_IMAGE_SIZE", "960"))
YOLO_CONFIDENCE = float(os.environ.get("YOLO_CONFIDENCE", "0.25"))
YOLO_IOU = float(os.environ.get("YOLO_IOU", "0.50"))
MAX_PEOPLE = int(os.environ.get("YOLO_MAX_PEOPLE", "80"))


def find_model_path() -> str:
    here = Path(__file__).resolve()
    configured = os.environ.get("YOLO_MODEL_PATH")
    candidates = [
        Path(configured).expanduser() if configured else None,
        Path.cwd() / "yolov8s.pt",
        Path.cwd() / "yolov8n.pt",
        here.parents[4] / "yolov8s.pt" if len(here.parents) > 4 else None,
        here.parents[4] / "yolov8n.pt" if len(here.parents) > 4 else None,
        here.parent / "yolov8s.pt",
        here.parent / "yolov8n.pt",
    ]
    for candidate in candidates:
        if candidate and candidate.exists():
            return str(candidate)
    return "yolov8n.pt"


def is_foreground_edge_occluder(box: dict, image_width: int, image_height: int) -> bool:
    x1, y1, x2, y2 = box["box"]
    confidence = float(box.get("confidence") or 0.0)
    width = max(0, x2 - x1)
    height = max(0, y2 - y1)
    area_ratio = (width * height) / max(1, image_width * image_height)
    touches_left = x1 <= image_width * 0.015
    touches_top = y1 <= image_height * 0.015
    touches_bottom = y2 >= image_height * 0.95
    huge_edge_fragment = area_ratio >= 0.22 and touches_left and (touches_top or touches_bottom)
    low_conf_bottom_fragment = confidence < 0.28 and touches_bottom and height <= image_height * 0.18
    return huge_edge_fragment or low_conf_bottom_fragment


def main() -> int:
    try:
        import cv2
        import numpy as np
        from ultralytics import YOLO
    except Exception as exc:
        print(json.dumps({"ok": False, "error": f"missing dependency: {exc}"}, ensure_ascii=False))
        return 0

    try:
        payload = json.loads(sys.stdin.read() or "{}")
        image_b64 = str(payload.get("imageBase64") or "")
        conf_threshold = float(payload.get("confidence") or YOLO_CONFIDENCE)
        image_size = int(payload.get("imageSize") or YOLO_IMAGE_SIZE)
        iou_threshold = float(payload.get("iou") or YOLO_IOU)
        raw = base64.b64decode(image_b64)
        arr = np.frombuffer(raw, dtype=np.uint8)
        frame = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if frame is None:
            raise ValueError("image decode failed")

        model = YOLO(find_model_path())
        result = model(
            frame,
            imgsz=image_size,
            conf=conf_threshold,
            iou=iou_threshold,
            classes=[PERSON_CLASS_ID],
            max_det=MAX_PEOPLE,
            verbose=False,
        )[0]
        detections = []
        for box in result.boxes:
            cls = int(box.cls[0])
            conf = float(box.conf[0])
            if cls != PERSON_CLASS_ID or conf < conf_threshold:
                continue
            x1, y1, x2, y2 = [float(v) for v in box.xyxy[0]]
            width = max(0.0, x2 - x1)
            height = max(0.0, y2 - y1)
            if width < 4 or height < 8:
                continue
            detections.append({
                "label": "person",
                "confidence": round(conf, 3),
                "box": [round(x1), round(y1), round(x2), round(y2)],
                "area": round(width * height),
            })

        detections.sort(key=lambda d: (d["box"][1], d["box"][0], -d["confidence"]))
        image_width = int(frame.shape[1])
        image_height = int(frame.shape[0])
        student_detections = [
            d for d in detections
            if not is_foreground_edge_occluder(d, image_width, image_height)
        ]
        print(json.dumps({
            "ok": True,
            "yoloPersonCount": len(student_detections),
            "rawPersonCount": len(detections),
            "imageSize": {"width": image_width, "height": image_height},
            "settings": {"imgsz": image_size, "conf": conf_threshold, "iou": iou_threshold},
            "detections": student_detections[:60],
        }, ensure_ascii=False))
        return 0
    except Exception as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False))
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
