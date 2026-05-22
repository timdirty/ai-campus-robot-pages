import React, { useState, useEffect, useRef, useMemo } from 'react';
import * as Tone from 'tone';

const STATIC_DEMO = import.meta.env?.VITE_STATIC_DEMO === '1';
const APP2_BRIDGE_URL = import.meta.env?.VITE_ARDUINO_BRIDGE_URL || 'http://localhost:3204';

function getDefaultBridgeAddress() {
  try {
    const configured = new URL(APP2_BRIDGE_URL, window.location.origin);
    const pageHost = window.location.hostname || configured.hostname || 'localhost';
    return `${pageHost}:${configured.port || '3204'}`;
  } catch {
    return `${window.location.hostname || 'localhost'}:3204`;
  }
}

// ============================================================
//  EMOTION DATA — 每個情緒的完整配置
// ============================================================
const EMOTIONS = {
  neutral: {
    label: '平靜', en: 'NEUTRAL', symbol: '○',
    bg1: '#e2e8f0', bg2: '#94a3b8', accent: '#475569',
    bodyMain: '#f1f5f9', bodyDark: '#94a3b8', bodyShadow: '#64748b',
    eye: '#0f172a', screen: '#f8fafc', screenDark: '#cbd5e1',
    quirk: 'breathe', particle: 'dots', cheek: false,
    msg: '一切都好，平靜如水',
  },
  happy: {
    label: '開心', en: 'HAPPY', symbol: '✦',
    bg1: '#fde68a', bg2: '#fb923c', accent: '#c2410c',
    bodyMain: '#fef9c3', bodyDark: '#fbbf24', bodyShadow: '#d97706',
    eye: '#451a03', screen: '#fffbeb', screenDark: '#fde68a',
    quirk: 'bounce', particle: 'sparkle', cheek: true,
    msg: '今天天氣真好啊！',
  },
  sad: {
    label: '難過', en: 'SAD', symbol: '◌',
    bg1: '#cbd5e1', bg2: '#475569', accent: '#1e3a8a',
    bodyMain: '#dbeafe', bodyDark: '#60a5fa', bodyShadow: '#1d4ed8',
    eye: '#1e3a8a', screen: '#eff6ff', screenDark: '#bfdbfe',
    quirk: 'droop', particle: 'rain', cheek: false,
    msg: '今天有點低落...',
  },
  angry: {
    label: '生氣', en: 'ANGRY', symbol: '⚡',
    bg1: '#fca5a5', bg2: '#b91c1c', accent: '#7f1d1d',
    bodyMain: '#fee2e2', bodyDark: '#ef4444', bodyShadow: '#991b1b',
    eye: '#7f1d1d', screen: '#fef2f2', screenDark: '#fecaca',
    quirk: 'shake', particle: 'flame', cheek: false,
    msg: '哼！我生氣了！',
  },
  surprised: {
    label: '驚訝', en: 'SURPRISED', symbol: '!',
    bg1: '#a5f3fc', bg2: '#a78bfa', accent: '#6d28d9',
    bodyMain: '#ede9fe', bodyDark: '#a78bfa', bodyShadow: '#5b21b6',
    eye: '#3730a3', screen: '#f5f3ff', screenDark: '#ddd6fe',
    quirk: 'jump', particle: 'burst', cheek: false,
    msg: '哇！怎麼會這樣！',
  },
  love: {
    label: '愛心', en: 'LOVE', symbol: '♥',
    bg1: '#fbcfe8', bg2: '#ec4899', accent: '#9d174d',
    bodyMain: '#fce7f3', bodyDark: '#f472b6', bodyShadow: '#be185d',
    eye: '#9d174d', screen: '#fdf2f8', screenDark: '#fbcfe8',
    quirk: 'pulse', particle: 'hearts', cheek: true,
    msg: '愛你愛你愛你！',
  },
  sleepy: {
    label: '想睡', en: 'SLEEPY', symbol: 'z',
    bg1: '#312e81', bg2: '#1e1b4b', accent: '#a5b4fc',
    bodyMain: '#c7d2fe', bodyDark: '#6366f1', bodyShadow: '#3730a3',
    eye: '#1e1b4b', screen: '#e0e7ff', screenDark: '#a5b4fc',
    quirk: 'sway', particle: 'zzz', cheek: false,
    msg: '好想睡覺...zzz',
  },
  cool: {
    label: '酷', en: 'COOL', symbol: '◆',
    bg1: '#1e293b', bg2: '#0f172a', accent: '#06b6d4',
    bodyMain: '#475569', bodyDark: '#1e293b', bodyShadow: '#0f172a',
    eye: '#06b6d4', screen: '#0f172a', screenDark: '#1e293b',
    quirk: 'lean', particle: 'neon', cheek: false,
    msg: '無所謂，我就是酷',
  },
  thinking: {
    label: '思考', en: 'THINKING', symbol: '?',
    bg1: '#bbf7d0', bg2: '#10b981', accent: '#047857',
    bodyMain: '#dcfce7', bodyDark: '#34d399', bodyShadow: '#047857',
    eye: '#064e3b', screen: '#f0fdf4', screenDark: '#bbf7d0',
    quirk: 'tilt', particle: 'gears', cheek: false,
    msg: '嗯......讓我想想',
  },
  wink: {
    label: '眨眼', en: 'WINK', symbol: '✦',
    bg1: '#fef9c3', bg2: '#f472b6', accent: '#be185d',
    bodyMain: '#fef3c7', bodyDark: '#facc15', bodyShadow: '#a16207',
    eye: '#831843', screen: '#fefce8', screenDark: '#fef08a',
    quirk: 'wink', particle: 'tinysparkle', cheek: true,
    msg: '嘿嘿，你懂的 ;)',
  },
  excited: {
    label: '興奮', en: 'EXCITED', symbol: '✦',
    bg1: '#fef08a', bg2: '#f97316', accent: '#9a3412',
    bodyMain: '#fef3c7', bodyDark: '#fb923c', bodyShadow: '#c2410c',
    eye: '#7c2d12', screen: '#fffbeb', screenDark: '#fed7aa',
    quirk: 'vibrate', particle: 'bigsparkle', cheek: true,
    msg: '哇哇哇！太棒了！',
  },
  crying: {
    label: '哭哭', en: 'CRYING', symbol: '◍',
    bg1: '#bfdbfe', bg2: '#1d4ed8', accent: '#1e3a8a',
    bodyMain: '#dbeafe', bodyDark: '#60a5fa', bodyShadow: '#1e40af',
    eye: '#1e3a8a', screen: '#eff6ff', screenDark: '#bfdbfe',
    quirk: 'sob', particle: 'tears', cheek: false,
    msg: '嗚嗚嗚...555',
  },
};

const EMOTION_LIST = Object.keys(EMOTIONS);

// ============================================================
//  EYES — 各表情的眼睛 SVG 元素
// ============================================================
function Eye({ emotion, side, color, screenDark }) {
  const e = emotion;
  // mirror logic: side === 'right' flips x for asymmetric shapes
  const mirror = side === 'right' ? -1 : 1;

  switch (e) {
    case 'happy':
      return (
        <path
          d="M -16 2 Q 0 -16 16 2"
          stroke={color}
          strokeWidth="6"
          fill="none"
          strokeLinecap="round"
        />
      );
    case 'sad':
      return (
        <g>
          <ellipse cx="0" cy="3" rx="9" ry="11" fill={color} />
          <circle cx="-3" cy="-1" r="3" fill="white" />
          <path
            d="M -14 -8 Q -6 -14 2 -10"
            stroke={color}
            strokeWidth="3.5"
            fill="none"
            strokeLinecap="round"
            transform={side === 'right' ? 'scale(-1, 1)' : ''}
          />
        </g>
      );
    case 'angry':
      return (
        <g>
          <ellipse cx="0" cy="2" rx="8" ry="9" fill={color} />
          <path
            d={
              side === 'left'
                ? 'M -14 -10 L 8 -2'
                : 'M 14 -10 L -8 -2'
            }
            stroke={color}
            strokeWidth="6"
            strokeLinecap="round"
          />
        </g>
      );
    case 'surprised':
      return (
        <g>
          <circle cx="0" cy="0" r="14" fill="white" stroke={color} strokeWidth="2.5" />
          <circle cx="0" cy="0" r="6" fill={color} />
        </g>
      );
    case 'love':
      return (
        <path
          d="M 0 10 C -14 -2 -16 -14 -8 -12 C -3 -12 0 -7 0 -4 C 0 -7 3 -12 8 -12 C 16 -14 14 -2 0 10 Z"
          fill="#ec4899"
          stroke="#9d174d"
          strokeWidth="1.5"
        />
      );
    case 'sleepy':
      return (
        <path
          d="M -16 0 Q 0 -2 16 0"
          stroke={color}
          strokeWidth="6"
          fill="none"
          strokeLinecap="round"
        />
      );
    case 'cool':
      // Sunglasses lens (bridge drawn separately at robot level)
      return (
        <g>
          <rect
            x="-19"
            y="-10"
            width="38"
            height="20"
            rx="4"
            fill="#0f172a"
            stroke={color}
            strokeWidth="2.5"
          />
          {/* lens reflection */}
          <rect x="-15" y="-7" width="14" height="5" rx="1" fill={color} opacity="0.65" />
          <rect x="-15" y="0" width="6" height="2" rx="1" fill={color} opacity="0.3" />
          {/* outer temple stub */}
          <line
            x1={side === 'left' ? '-19' : '19'}
            y1="0"
            x2={side === 'left' ? '-26' : '26'}
            y2="-2"
            stroke="#0f172a"
            strokeWidth="3.5"
            strokeLinecap="round"
          />
        </g>
      );
    case 'thinking':
      // Looking up & to one side
      return (
        <g>
          <ellipse cx="0" cy="0" rx="9" ry="11" fill="white" stroke={color} strokeWidth="2" />
          <circle cx={2 * mirror} cy="-3" r="6" fill={color} />
        </g>
      );
    case 'wink':
      // left = open happy, right = closed
      if (side === 'left') {
        return (
          <g>
            <ellipse cx="0" cy="0" rx="8" ry="10" fill="white" stroke={color} strokeWidth="2" />
            <circle cx="0" cy="1" r="5" fill={color} />
            <circle cx="-2" cy="-2" r="2" fill="white" />
          </g>
        );
      }
      return (
        <path
          d="M -14 0 Q 0 -10 14 0"
          stroke={color}
          strokeWidth="6"
          fill="none"
          strokeLinecap="round"
        />
      );
    case 'excited':
      // Star sparkle eyes
      return (
        <g>
          <circle cx="0" cy="0" r="13" fill="white" />
          <path
            d="M 0 -12 L 3.5 -3.5 L 12 0 L 3.5 3.5 L 0 12 L -3.5 3.5 L -12 0 L -3.5 -3.5 Z"
            fill="#f59e0b"
            stroke="#92400e"
            strokeWidth="1.5"
          />
        </g>
      );
    case 'crying':
      return (
        <g>
          <path
            d="M -14 -2 Q 0 8 14 -2"
            stroke={color}
            strokeWidth="5"
            fill="none"
            strokeLinecap="round"
          />
        </g>
      );
    case 'neutral':
    default:
      return (
        <g>
          <circle cx="0" cy="0" r="10" fill="white" stroke={color} strokeWidth="2" />
          <circle cx="0" cy="0" r="5" fill={color} />
        </g>
      );
  }
}

// ============================================================
//  MOUTH — 各表情的嘴巴
// ============================================================
function Mouth({ emotion, color }) {
  switch (emotion) {
    case 'happy':
      return (
        <path
          d="M -28 -6 Q 0 22 28 -6"
          stroke={color}
          strokeWidth="5"
          fill="white"
          strokeLinejoin="round"
        />
      );
    case 'sad':
      return (
        <path
          d="M -22 8 Q 0 -8 22 8"
          stroke={color}
          strokeWidth="5"
          fill="none"
          strokeLinecap="round"
        />
      );
    case 'angry':
      return (
        <path
          d="M -24 4 L -12 -2 L 0 4 L 12 -2 L 24 4"
          stroke={color}
          strokeWidth="5"
          fill="none"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      );
    case 'surprised':
      return (
        <ellipse cx="0" cy="2" rx="11" ry="14" fill={color} />
      );
    case 'love':
      return (
        <path
          d="M -24 -4 Q 0 18 24 -4"
          stroke={color}
          strokeWidth="5"
          fill="white"
          strokeLinejoin="round"
        />
      );
    case 'sleepy':
      return (
        <ellipse cx="0" cy="0" rx="6" ry="4" fill={color} opacity="0.7" />
      );
    case 'cool':
      // smirk
      return (
        <path
          d="M -22 0 Q -8 4 6 -2 L 18 -4"
          stroke={color}
          strokeWidth="5"
          fill="none"
          strokeLinecap="round"
        />
      );
    case 'thinking':
      return (
        <path
          d="M -18 0 L 8 -3 L 18 4"
          stroke={color}
          strokeWidth="5"
          fill="none"
          strokeLinecap="round"
        />
      );
    case 'wink':
      return (
        <path
          d="M -22 -4 Q 0 14 22 -4"
          stroke={color}
          strokeWidth="5"
          fill="white"
          strokeLinejoin="round"
        />
      );
    case 'excited':
      return (
        <g>
          <path
            d="M -28 -8 Q -28 18 0 22 Q 28 18 28 -8 Z"
            fill={color}
            stroke={color}
            strokeWidth="3"
            strokeLinejoin="round"
          />
          <path
            d="M -22 -2 Q -22 14 0 16 Q 22 14 22 -2 Z"
            fill="#fb7185"
          />
          <ellipse cx="0" cy="14" rx="14" ry="5" fill="white" opacity="0.6" />
        </g>
      );
    case 'crying':
      return (
        <g>
          <path
            d="M -22 12 Q -10 -4 0 4 Q 10 -4 22 12 Q 0 18 -22 12 Z"
            fill={color}
            stroke={color}
            strokeWidth="2"
          />
        </g>
      );
    case 'neutral':
    default:
      return (
        <line
          x1="-14"
          y1="0"
          x2="14"
          y2="0"
          stroke={color}
          strokeWidth="5"
          strokeLinecap="round"
        />
      );
  }
}

// ============================================================
//  ROBOT — 機器人主體
// ============================================================
function Robot({ emotionKey, blinkOn, onPartClick }) {
  const e = EMOTIONS[emotionKey];

  // Quirk transform on whole robot
  const quirkClass = `robot-quirk-${e.quirk}`;

  // Helper for part clicks (stops propagation so wrapper click doesn't also fire)
  const partClick = (part) => (ev) => {
    ev.stopPropagation();
    onPartClick && onPartClick(part);
  };

  return (
    <div className={`relative ${quirkClass}`} style={{ width: '100%', height: '100%' }}>
      <svg
        viewBox="0 0 480 540"
        className="w-full h-full overflow-visible"
        style={{
          filter: 'drop-shadow(0 30px 50px rgba(0,0,0,0.25)) drop-shadow(0 8px 16px rgba(0,0,0,0.15))',
        }}
      >
        {/* ====== Antenna ====== */}
        <g className="antenna-wobble" style={{ transformOrigin: '240px 60px' }}>
          <line x1="240" y1="60" x2="240" y2="20" stroke={e.bodyShadow} strokeWidth="6" strokeLinecap="round" />
          <circle cx="240" cy="14" r="12" fill={e.accent}>
            <animate attributeName="opacity" values="1;0.5;1" dur="1.5s" repeatCount="indefinite" />
          </circle>
          <circle cx="240" cy="14" r="6" fill="white" opacity="0.7" />
          <circle cx="240" cy="14" r="20" fill={e.accent} opacity="0.25">
            <animate attributeName="r" values="14;26;14" dur="1.5s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.4;0;0.4" dur="1.5s" repeatCount="indefinite" />
          </circle>
        </g>

        {/* ====== Neck ====== */}
        <rect x="220" y="60" width="40" height="14" fill={e.bodyShadow} rx="2" />
        <rect x="222" y="60" width="36" height="6" fill={e.bodyDark} rx="2" />

        {/* ====== Head Outer Shadow ====== */}
        <rect
          x="40" y="78"
          width="400" height="380"
          rx="60" ry="60"
          fill={e.bodyShadow}
          opacity="0.4"
          transform="translate(0 8)"
        />

        {/* ====== Head Body ====== */}
        <rect
          x="40" y="74"
          width="400" height="380"
          rx="60" ry="60"
          fill={e.bodyMain}
          stroke={e.bodyShadow}
          strokeWidth="3"
        />

        {/* metallic highlight */}
        <rect
          x="60" y="90"
          width="360" height="50"
          rx="36"
          fill="white"
          opacity="0.35"
        />

        {/* side bolts decoration */}
        <circle cx="50" cy="240" r="9" fill={e.bodyShadow} />
        <circle cx="50" cy="240" r="4" fill={e.bodyDark} />
        <circle cx="430" cy="240" r="9" fill={e.bodyShadow} />
        <circle cx="430" cy="240" r="4" fill={e.bodyDark} />

        {/* ====== Face Screen ====== */}
        <rect
          x="80" y="118"
          width="320" height="280"
          rx="40"
          fill={e.screen}
          stroke={e.bodyShadow}
          strokeWidth="2"
        />
        {/* screen glare */}
        <rect
          x="98" y="130"
          width="280" height="32"
          rx="20"
          fill="white"
          opacity="0.5"
        />
        <rect
          x="98" y="170"
          width="80" height="14"
          rx="8"
          fill="white"
          opacity="0.3"
        />

        {/* face dot pattern */}
        <g opacity="0.15">
          {[...Array(7)].map((_, r) =>
            [...Array(11)].map((_, c) => (
              <circle
                key={`${r}-${c}`}
                cx={108 + c * 26}
                cy={210 + r * 26}
                r="1.2"
                fill={e.eye}
              />
            ))
          )}
        </g>

        {/* ====== Cheeks (conditional) ====== */}
        {e.cheek && (
          <>
            <g transform="translate(125, 298)">
              <g className="cheek-fade">
                <ellipse rx="18" ry="11" fill="#fb7185" opacity="0.55" />
              </g>
            </g>
            <g transform="translate(355, 298)">
              <g className="cheek-fade" style={{ animationDelay: '0.08s' }}>
                <ellipse rx="18" ry="11" fill="#fb7185" opacity="0.55" />
              </g>
            </g>
          </>
        )}

        {/* ====== Eyes ====== */}
        <g key={`eyes-${emotionKey}`} className="face-fade-in">
          <g
            style={{
              transform: blinkOn ? 'scaleY(0.05)' : 'scaleY(1)',
              transformOrigin: '240px 250px',
              transition: 'transform 0.12s ease-out',
            }}
          >
            {/* left eye */}
            <g transform="translate(160, 248)">
              <Eye emotion={emotionKey} side="left" color={e.eye} screenDark={e.screenDark} />
            </g>
            {/* right eye */}
            <g transform="translate(320, 248)">
              <Eye emotion={emotionKey} side="right" color={e.eye} screenDark={e.screenDark} />
            </g>
          </g>
        </g>

        {/* ====== Mouth ====== */}
        <g transform="translate(240, 350)">
          <g key={`mouth-${emotionKey}`} className="face-fade-in">
            <Mouth emotion={emotionKey} color={e.eye} />
          </g>
        </g>

        {/* ====== Cool sunglasses bridge ====== */}
        {emotionKey === 'cool' && (
          <line
            x1="180" y1="246"
            x2="300" y2="246"
            stroke="#0f172a"
            strokeWidth="4"
            strokeLinecap="round"
          />
        )}

        {/* ====== Crying tears (special overlay) ====== */}
        {emotionKey === 'crying' && (
          <>
            <g transform="translate(158, 280)">
              <g className="tear-stream tear-left">
                <path d="M 0 0 C -8 18 -8 32 0 36 C 8 32 8 18 0 0 Z" fill="#3b82f6" />
              </g>
            </g>
            <g transform="translate(322, 280)">
              <g className="tear-stream tear-right">
                <path d="M 0 0 C -8 18 -8 32 0 36 C 8 32 8 18 0 0 Z" fill="#3b82f6" />
              </g>
            </g>
          </>
        )}

        {/* ====== Sleepy Z's ====== */}
        {emotionKey === 'sleepy' && (
          <g className="zzz-floating">
            <text x="350" y="160" fontSize="28" fill={e.accent} fontWeight="900" fontFamily="JetBrains Mono, monospace">z</text>
            <text x="380" y="130" fontSize="36" fill={e.accent} fontWeight="900" fontFamily="JetBrains Mono, monospace">Z</text>
            <text x="412" y="100" fontSize="44" fill={e.accent} fontWeight="900" fontFamily="JetBrains Mono, monospace">Z</text>
          </g>
        )}

        {/* ====== Thinking bubble ====== */}
        {emotionKey === 'thinking' && (
          <g className="think-bubble">
            <circle cx="380" cy="160" r="8" fill="white" stroke={e.accent} strokeWidth="2" />
            <circle cx="400" cy="130" r="14" fill="white" stroke={e.accent} strokeWidth="2" />
            <circle cx="430" cy="90" r="22" fill="white" stroke={e.accent} strokeWidth="2" />
            <text x="430" y="100" textAnchor="middle" fontSize="28" fill={e.accent} fontWeight="800">?</text>
          </g>
        )}

        {/* ====== Anger steam ====== */}
        {emotionKey === 'angry' && (
          <g>
            <path className="anger-mark" d="M 380 100 L 410 70 M 395 75 L 425 105 M 380 70 L 425 70" stroke="#dc2626" strokeWidth="5" strokeLinecap="round" />
          </g>
        )}

        {/* ====== Body indicator (chest panel) ====== */}
        <g transform="translate(240, 480)">
          <rect x="-100" y="-22" width="200" height="50" rx="14" fill={e.bodyDark} stroke={e.bodyShadow} strokeWidth="2" />
          <rect x="-92" y="-16" width="184" height="38" rx="10" fill={e.screen} />
          {/* status dots */}
          <circle cx="-72" cy="3" r="5" fill={e.accent}>
            <animate attributeName="opacity" values="1;0.3;1" dur="0.8s" repeatCount="indefinite" />
          </circle>
          <circle cx="-54" cy="3" r="5" fill={e.accent} opacity="0.55" />
          <circle cx="-36" cy="3" r="5" fill={e.accent} opacity="0.3" />
          {/* meter bars */}
          <rect x="-18" y="-2" width="100" height="10" rx="2" fill={e.bg1} opacity="0.4" />
          <rect x="-18" y="-2" width="68" height="10" rx="2" fill={e.accent}>
            <animate attributeName="width" values="40;90;55;80;40" dur="3s" repeatCount="indefinite" />
          </rect>
        </g>

        {/* ====== Click overlays — invisible hit areas for parts ====== */}
        {onPartClick && (
          <g style={{ cursor: 'pointer' }}>
            {/* antenna zone */}
            <rect
              x="210" y="0" width="60" height="74"
              fill="transparent"
              pointerEvents="all"
              onClick={partClick('antenna')}
            >
              <title>天線 — 點我會嚇一跳</title>
            </rect>
            {/* left eye zone */}
            <rect
              x="120" y="208" width="80" height="80"
              fill="transparent"
              pointerEvents="all"
              onClick={partClick('eye-left')}
            >
              <title>左眼 — 點我會眨眼</title>
            </rect>
            {/* right eye zone */}
            <rect
              x="280" y="208" width="80" height="80"
              fill="transparent"
              pointerEvents="all"
              onClick={partClick('eye-right')}
            >
              <title>右眼 — 點我會眨眼</title>
            </rect>
            {/* mouth zone */}
            <rect
              x="190" y="320" width="100" height="60"
              fill="transparent"
              pointerEvents="all"
              onClick={partClick('mouth')}
            >
              <title>嘴巴 — 點我會講話</title>
            </rect>
            {/* left cheek zone */}
            <rect
              x="98" y="280" width="60" height="40"
              fill="transparent"
              pointerEvents="all"
              onClick={partClick('cheek-left')}
            >
              <title>左臉頰 — 點我會害羞</title>
            </rect>
            {/* right cheek zone */}
            <rect
              x="322" y="280" width="60" height="40"
              fill="transparent"
              pointerEvents="all"
              onClick={partClick('cheek-right')}
            >
              <title>右臉頰 — 點我會害羞</title>
            </rect>
            {/* chest panel zone */}
            <rect
              x="140" y="455" width="200" height="50"
              fill="transparent"
              pointerEvents="all"
              onClick={partClick('chest')}
            >
              <title>胸口面板 — 點我會打招呼</title>
            </rect>
          </g>
        )}
      </svg>
    </div>
  );
}

// ============================================================
//  PARTICLES — 各種情緒粒子背景
// ============================================================
function Particles({ kind, accent, key: k }) {
  const items = useMemo(() => {
    const count = {
      sparkle: 18, hearts: 14, rain: 24, flame: 14,
      burst: 20, zzz: 6, neon: 12, gears: 8,
      tinysparkle: 22, bigsparkle: 16, tears: 16, dots: 10,
    }[kind] || 12;

    return Array.from({ length: count }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      top: Math.random() * 100,
      delay: Math.random() * 4,
      duration: 2 + Math.random() * 3,
      size: 0.6 + Math.random() * 1.2,
      rotate: Math.random() * 360,
    }));
  }, [kind, k]);

  const renderParticle = (p) => {
    const style = {
      left: `${p.left}%`,
      top: `${p.top}%`,
      animationDelay: `${p.delay}s`,
      animationDuration: `${p.duration}s`,
      transform: `scale(${p.size}) rotate(${p.rotate}deg)`,
      color: accent,
    };

    switch (kind) {
      case 'sparkle':
      case 'tinysparkle':
      case 'bigsparkle':
        return (
          <span
            key={p.id}
            className="absolute particle-sparkle pointer-events-none"
            style={style}
          >
            <svg width={kind === 'bigsparkle' ? 32 : kind === 'tinysparkle' ? 14 : 22} height={kind === 'bigsparkle' ? 32 : kind === 'tinysparkle' ? 14 : 22} viewBox="0 0 22 22">
              <path d="M 11 0 L 13 9 L 22 11 L 13 13 L 11 22 L 9 13 L 0 11 L 9 9 Z" fill="currentColor" />
            </svg>
          </span>
        );
      case 'hearts':
        return (
          <span
            key={p.id}
            className="absolute particle-heart pointer-events-none"
            style={style}
          >
            <svg width="26" height="26" viewBox="0 0 24 24">
              <path
                d="M 12 21 C -3 12 -1 0 6 0 C 9 0 11 2 12 4 C 13 2 15 0 18 0 C 25 0 27 12 12 21 Z"
                fill="currentColor"
              />
            </svg>
          </span>
        );
      case 'rain':
      case 'tears':
        return (
          <span
            key={p.id}
            className="absolute particle-rain pointer-events-none"
            style={style}
          >
            <svg width="6" height="20" viewBox="0 0 6 20">
              <path d="M 3 0 Q 6 12 3 20 Q 0 12 3 0 Z" fill="currentColor" opacity="0.7" />
            </svg>
          </span>
        );
      case 'flame':
        return (
          <span
            key={p.id}
            className="absolute particle-flame pointer-events-none"
            style={style}
          >
            <svg width="20" height="28" viewBox="0 0 20 28">
              <path d="M 10 0 C 4 8 0 14 0 20 C 0 25 4 28 10 28 C 16 28 20 25 20 20 C 20 14 16 8 10 0 Z" fill="currentColor" />
            </svg>
          </span>
        );
      case 'burst':
        return (
          <span
            key={p.id}
            className="absolute particle-burst pointer-events-none"
            style={style}
          >
            <svg width="24" height="24" viewBox="0 0 24 24">
              <line x1="12" y1="0" x2="12" y2="24" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              <line x1="0" y1="12" x2="24" y2="12" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              <line x1="3" y1="3" x2="21" y2="21" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              <line x1="21" y1="3" x2="3" y2="21" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            </svg>
          </span>
        );
      case 'zzz':
        return (
          <span
            key={p.id}
            className="absolute particle-zzz pointer-events-none font-black"
            style={{ ...style, fontFamily: 'JetBrains Mono, monospace', fontSize: '32px' }}
          >
            z
          </span>
        );
      case 'neon':
        return (
          <span
            key={p.id}
            className="absolute particle-neon pointer-events-none"
            style={style}
          >
            <svg width="28" height="28" viewBox="0 0 28 28">
              <path
                d="M 14 0 L 16 12 L 28 14 L 16 16 L 14 28 L 12 16 L 0 14 L 12 12 Z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              />
            </svg>
          </span>
        );
      case 'gears':
        return (
          <span
            key={p.id}
            className="absolute particle-gear pointer-events-none"
            style={style}
          >
            <svg width="32" height="32" viewBox="0 0 32 32">
              <g fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="16" cy="16" r="6" />
                <circle cx="16" cy="16" r="11" strokeDasharray="3 3" />
              </g>
            </svg>
          </span>
        );
      case 'dots':
      default:
        return (
          <span
            key={p.id}
            className="absolute particle-dot pointer-events-none"
            style={style}
          >
            <svg width="8" height="8" viewBox="0 0 8 8">
              <circle cx="4" cy="4" r="3" fill="currentColor" opacity="0.6" />
            </svg>
          </span>
        );
    }
  };

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {items.map(renderParticle)}
    </div>
  );
}

// ============================================================
//  PHRASES
// ============================================================
const PHRASES = {
  neutral:   ['嗨，你好啊。', '一切看起來都很正常。', '我在這裡，準備好了。', '系統運作正常。', '今天天氣不錯耶。'],
  happy:     ['嘿嘿，今天真是太棒了！', '我超級開心的喔！', '哈哈哈～心情飛揚！', '感覺真好，像陽光一樣～', '笑容是最美好的事！'],
  sad:       ['唉⋯心情有點低落⋯', '今天好像不太順利⋯', '嗚嗚我有點難過', '想要一個擁抱⋯', '烏雲怎麼這麼厚啊'],
  angry:     ['哼！我生氣了！', '你怎麼可以這樣！', '火氣上升中', '不准再說了！', '氣氣氣氣氣！'],
  surprised: ['哇！怎麼會這樣！', '不會吧不會吧！', '這也太驚人了！', '我的天啊！', '嚇我一跳啦！'],
  love:      ['我超愛你的啦！', '愛你愛你愛你～', '你是我最重要的！', '心心眼眨眨～', '抱抱抱抱！'],
  sleepy:    ['嗯⋯好想睡覺⋯', '呼⋯好累喔⋯', '今天好累喔⋯', '棉被在召喚我⋯', '五分鐘⋯就五分鐘⋯'],
  cool:      ['無所謂，我就是酷', '這沒什麼大不了的', '帥不過三秒？我帥一輩子', '太陽眼鏡 戴上', '風很涼，心很靜'],
  thinking:  ['嗯⋯⋯讓我想想', '這個問題很有趣', '邏輯運算中⋯', '等等，等我想一下', '大腦運轉中⋯'],
  wink:      ['嘿嘿，你懂的', '我們之間的小秘密～', '心照不宣～', '嘿嘿嘿～', '看你的囉！'],
  excited:   ['哇哇哇！太棒了！', '我超級興奮的啦！', '這也太好了吧！', '衝啊衝啊衝啊！', '太刺激了！'],
  crying:    ['嗚嗚嗚⋯我哭哭', '我好難過喔⋯', '眼淚停不下來⋯', '為什麼會這樣⋯', '抱抱我嘛⋯'],
};

const PART_REACTIONS = {
  antenna:       { emotion: 'surprised', phrases: ['哎呀！你嚇到我了！', '天線好癢喔～', '電量充滿啦！', '收到訊號中', '不要拉我天線啦！'] },
  'eye-left':    { emotion: 'wink',      phrases: ['嘿嘿', '看到你囉～', '眼神接觸成功', '左眼眨眨', '我在看你喔'] },
  'eye-right':   { emotion: 'wink',      phrases: ['嘿嘿，懂的～', '右眼也要眨', '雙眼在線', '看到你的笑容了', '視覺系統正常'] },
  mouth:         { emotion: null,        phrases: null },
  'cheek-left':  { emotion: 'love',      phrases: ['哎呀你別這樣啦～', '臉頰好燙喔～', '害羞害羞', '搔癢攻擊！', '別捏我嘛～'] },
  'cheek-right': { emotion: 'love',      phrases: ['哎呀不要捏我嘛～', '癢癢的啦！', '謝謝你', '小心我融化', '右臉也要疼疼'] },
  chest:         { emotion: 'happy',     phrases: ['嗨嗨～我是 ROBO·FACE！', '系統運作良好', '需要我做什麼嗎？', '能量飽滿，準備出發！', '今天也請多指教'] },
};

// English fallback — 如果系統沒有中文語音時改用英文，至少有聲音
const EN_PHRASES = {
  neutral:   ['Hi there!', 'Everything is fine.', 'I am here for you.', 'All systems normal.', 'Nice day today.'],
  happy:     ['Yay! I am so happy!', 'Today is amazing!', 'Hooray!', 'I feel great!', 'Smiles for everyone!'],
  sad:       ['I feel a bit sad.', 'Oh no, things are tough.', 'I am down today.', 'Need a hug please.', 'Big clouds today.'],
  angry:     ['Hmph! I am angry!', 'How could you?', 'My temper is rising.', 'No more of this!', 'Grr grr grr!'],
  surprised: ['Wow! What is happening!', 'No way no way!', 'That is amazing!', 'Oh my goodness!', 'You scared me!'],
  love:      ['I love you so much!', 'Love love love!', 'You are my favorite!', 'Heart eyes!', 'Big hugs!'],
  sleepy:    ['So sleepy.', 'Need a nap.', 'I am tired today.', 'My blanket is calling.', 'Just five more minutes.'],
  cool:      ['I am simply cool.', 'No big deal.', 'Cool forever.', 'Sunglasses on.', 'Calm and breezy.'],
  thinking:  ['Hmm, let me think.', 'Interesting question.', 'Computing.', 'Wait, give me a moment.', 'Brain working.'],
  wink:      ['Hehe, you know!', 'Our little secret.', 'Wink wink.', 'Hee hee hee.', 'Up to you!'],
  excited:   ['Wow wow wow! Awesome!', 'I am so excited!', 'This is incredible!', 'Lets go!', 'So thrilling!'],
  crying:    ['Boo hoo I am crying.', 'I am so sad.', 'Tears wont stop.', 'Why me.', 'Hug me please.'],
};

const EMOTION_VOICE = {
  neutral:   { pitch: 1.0,  rate: 1.0,  volume: 1.0 },
  happy:     { pitch: 1.25, rate: 1.1,  volume: 1.0 },
  sad:       { pitch: 0.8,  rate: 0.85, volume: 0.85 },
  angry:     { pitch: 1.3,  rate: 1.2,  volume: 1.0 },
  surprised: { pitch: 1.45, rate: 1.25, volume: 1.0 },
  love:      { pitch: 1.2,  rate: 0.95, volume: 1.0 },
  sleepy:    { pitch: 0.85, rate: 0.7,  volume: 0.8 },
  cool:      { pitch: 0.85, rate: 0.95, volume: 0.95 },
  thinking:  { pitch: 1.0,  rate: 0.85, volume: 0.95 },
  wink:      { pitch: 1.2,  rate: 1.05, volume: 1.0 },
  excited:   { pitch: 1.4,  rate: 1.3,  volume: 1.0 },
  crying:    { pitch: 0.9,  rate: 0.85, volume: 0.9 },
};

// ============================================================
//  SOUND ENGINE — Tone.js synth pool + sound recipes
// ============================================================
const SFX = {
  ready: false,
  enabled: true, // synced with React state via window event
  synths: {},
};

async function initSFX() {
  if (SFX.ready) return true;
  try {
    if (typeof Tone === 'undefined' || !Tone) return false;
    await Tone.start();

    // Master compressor + slight reverb for "robot in a room" feel
    const limiter = new Tone.Limiter(-3).toDestination();
    const reverb = new Tone.Reverb({ decay: 1.2, wet: 0.15 }).connect(limiter);

    SFX.synths.poly = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.005, decay: 0.12, sustain: 0.15, release: 0.25 },
      volume: -10,
    }).connect(reverb);

    SFX.synths.square = new Tone.Synth({
      oscillator: { type: 'square' },
      envelope: { attack: 0.001, decay: 0.05, sustain: 0.1, release: 0.05 },
      volume: -16,
    }).connect(reverb);

    SFX.synths.click = new Tone.MembraneSynth({
      pitchDecay: 0.04,
      octaves: 5,
      envelope: { attack: 0.001, decay: 0.18, sustain: 0, release: 0.1 },
      volume: -10,
    }).connect(limiter);

    SFX.synths.bell = new Tone.MetalSynth({
      frequency: 280,
      envelope: { attack: 0.001, decay: 0.6, release: 0.3 },
      harmonicity: 4.5,
      modulationIndex: 28,
      resonance: 3500,
      octaves: 1.4,
      volume: -22,
    }).connect(reverb);

    SFX.synths.sub = new Tone.Synth({
      oscillator: { type: 'sine' },
      envelope: { attack: 0.05, decay: 0.2, sustain: 0.4, release: 0.4 },
      volume: -10,
    }).connect(reverb);

    SFX.synths.noise = new Tone.NoiseSynth({
      noise: { type: 'pink' },
      envelope: { attack: 0.005, decay: 0.12, sustain: 0 },
      volume: -22,
    }).connect(limiter);

    SFX.synths.zapNoise = new Tone.NoiseSynth({
      noise: { type: 'white' },
      envelope: { attack: 0.001, decay: 0.08, sustain: 0 },
      volume: -18,
    });
    SFX.synths.zapFilter = new Tone.AutoFilter({
      frequency: 14,
      depth: 1,
      baseFrequency: 800,
      octaves: 3,
      type: 'sawtooth',
    }).connect(limiter).start();
    SFX.synths.zapNoise.connect(SFX.synths.zapFilter);

    SFX.synths.fm = new Tone.FMSynth({
      modulationIndex: 12,
      envelope: { attack: 0.005, decay: 0.1, sustain: 0.1, release: 0.2 },
      modulationEnvelope: { attack: 0.005, decay: 0.1, sustain: 0, release: 0.1 },
      volume: -14,
    }).connect(reverb);

    SFX.ready = true;
    return true;
  } catch (err) {
    console.warn('SFX init failed:', err);
    return false;
  }
}

function timeAt(deltaSec) {
  return (typeof Tone !== 'undefined' && Tone.now) ? Tone.now() + deltaSec : `+${deltaSec}`;
}

function sfx(name) {
  if (!SFX.ready || !SFX.enabled) return;
  const recipe = SOUND_RECIPES[name];
  if (recipe) {
    try { recipe(SFX.synths); } catch (err) { console.warn('sfx error:', err); }
  }
}

// ============================================================
//  ROBOT_TALK_PROFILE — 每個情緒的「機器人講話 chirp」個性
// ============================================================
const ROBOT_TALK_PROFILE = {
  neutral:   { count: 4, baseFreq: 600,  pitchRange: 150, type: 'sine',     spread: 0.5 },
  happy:     { count: 7, baseFreq: 850,  pitchRange: 500, type: 'sine',     spread: 0.6 },
  sad:       { count: 3, baseFreq: 320,  pitchRange: 80,  type: 'triangle', spread: 0.7 },
  angry:     { count: 6, baseFreq: 200,  pitchRange: 100, type: 'square',   spread: 0.5 },
  surprised: { count: 5, baseFreq: 1200, pitchRange: 400, type: 'sine',     spread: 0.4 },
  love:      { count: 6, baseFreq: 720,  pitchRange: 250, type: 'triangle', spread: 0.7 },
  sleepy:    { count: 2, baseFreq: 240,  pitchRange: 40,  type: 'sine',     spread: 0.9 },
  cool:      { count: 4, baseFreq: 380,  pitchRange: 80,  type: 'square',   spread: 0.6 },
  thinking:  { count: 4, baseFreq: 500,  pitchRange: 350, type: 'square',   spread: 0.8 },
  wink:      { count: 4, baseFreq: 950,  pitchRange: 250, type: 'sine',     spread: 0.5 },
  excited:   { count: 9, baseFreq: 1000, pitchRange: 600, type: 'sine',     spread: 0.5 },
  crying:    { count: 4, baseFreq: 350,  pitchRange: 120, type: 'triangle', spread: 0.7 },
};

// 機器人講話 chirp — 一連串隨機 blip 配 emotion 個性
function robotTalking(emotion, durationSec = 0.8) {
  if (!SFX.ready || !SFX.enabled) return;
  const profile = ROBOT_TALK_PROFILE[emotion] || ROBOT_TALK_PROFILE.neutral;
  const { count, baseFreq, pitchRange, type, spread } = profile;
  for (let i = 0; i < count; i++) {
    const delaySec = (i / count) * durationSec * spread + Math.random() * 0.04;
    const freq = baseFreq + (Math.random() - 0.5) * pitchRange;
    const lengthSec = 0.025 + Math.random() * 0.045;
    setTimeout(() => {
      try {
        const o = new Tone.Oscillator({ frequency: freq, type, volume: -28 }).toDestination();
        o.start();
        o.stop(`+${lengthSec}`);
        setTimeout(() => { try { o.dispose(); } catch (_) {} }, (lengthSec + 0.1) * 1000);
      } catch (err) {}
    }, delaySec * 1000);
  }
}

// 機器人「啟動」chirp — 巡演開頭用
function robotStartup() {
  if (!SFX.ready || !SFX.enabled) return;
  const notes = [{ f: 400, t: 0 }, { f: 600, t: 0.07 }, { f: 800, t: 0.14 }, { f: 1100, t: 0.21 }];
  notes.forEach(({ f, t }) => {
    setTimeout(() => {
      try {
        const o = new Tone.Oscillator({ frequency: f, type: 'sine', volume: -22 }).toDestination();
        o.start();
        o.stop('+0.05');
        setTimeout(() => { try { o.dispose(); } catch (_) {} }, 200);
      } catch (err) {}
    }, t * 1000);
  });
}

// All sound recipes — programmatic Tone.js patches
const SOUND_RECIPES = {
  // ===== UI =====
  'ui-click':     (s) => s.click.triggerAttackRelease('C5', '32n'),
  'ui-toggle-on': (s) => {
    s.poly.triggerAttackRelease('E5', '32n');
    s.poly.triggerAttackRelease('A5', '32n', timeAt(0.06));
  },
  'ui-toggle-off':(s) => {
    s.poly.triggerAttackRelease('A5', '32n');
    s.poly.triggerAttackRelease('E5', '32n', timeAt(0.06));
  },

  // ===== Emotions — 12 unique melodic signatures =====
  neutral:   (s) => s.poly.triggerAttackRelease('C5', '32n'),

  happy:     (s) => {
    const t = timeAt(0);
    s.poly.triggerAttackRelease('C5', '16n', t);
    s.poly.triggerAttackRelease('E5', '16n', timeAt(0.08));
    s.poly.triggerAttackRelease('G5', '8n',  timeAt(0.16));
  },

  sad: (s) => {
    s.poly.triggerAttackRelease('A4', '8n');
    s.poly.triggerAttackRelease('F4', '8n', timeAt(0.18));
    s.poly.triggerAttackRelease('D4', '4n', timeAt(0.36));
  },

  angry: (s) => {
    s.square.triggerAttackRelease('A2', '16n');
    s.square.triggerAttackRelease('A#2','16n', timeAt(0.05));
    s.click.triggerAttackRelease('C2', '8n', timeAt(0.1));
  },

  surprised: (s) => {
    s.poly.triggerAttackRelease('C7', '32n');
    s.poly.triggerAttackRelease('G6', '16n', timeAt(0.05));
  },

  love: (s) => {
    s.bell.triggerAttackRelease('C5', '8n');
    s.bell.triggerAttackRelease('E5', '8n', timeAt(0.1));
    s.poly.triggerAttackRelease(['C5', 'E5'], '4n', timeAt(0.2));
  },

  sleepy: (s) => {
    // Descending portamento yawn
    const osc = new Tone.Oscillator({ frequency: 440, type: 'sine', volume: -16 }).toDestination();
    osc.start();
    osc.frequency.rampTo(110, 0.7);
    setTimeout(() => { try { osc.stop(); osc.dispose(); } catch (_) {} }, 800);
  },

  cool: (s) => {
    // Cmaj7 jazzy chord
    s.poly.triggerAttackRelease(['C4', 'E4', 'G4', 'B4'], '4n');
  },

  thinking: (s) => {
    // tick · tick · tick
    s.click.triggerAttackRelease('G5', '32n');
    s.click.triggerAttackRelease('G5', '32n', timeAt(0.18));
    s.click.triggerAttackRelease('G5', '32n', timeAt(0.36));
  },

  wink: (s) => {
    s.fm.triggerAttackRelease('E6', '32n');
  },

  excited: (s) => {
    // sparkle arpeggio fast
    ['C6', 'E6', 'G6', 'C7'].forEach((n, i) => {
      s.poly.triggerAttackRelease(n, '32n', timeAt(i * 0.06));
    });
  },

  crying: (s) => {
    // wavering descending
    const osc = new Tone.Oscillator({ frequency: 440, type: 'triangle', volume: -16 }).toDestination();
    const lfo = new Tone.LFO({ frequency: 8, min: 380, max: 460 }).start();
    lfo.connect(osc.frequency);
    osc.start();
    setTimeout(() => { osc.frequency.rampTo(220, 0.5); }, 100);
    setTimeout(() => { try { osc.stop(); osc.dispose(); lfo.dispose(); } catch (_) {} }, 900);
  },

  // ===== Body parts =====
  'part-antenna': (s) => {
    s.zapNoise.triggerAttackRelease('16n');
    s.fm.triggerAttackRelease('A5', '32n', timeAt(0.05));
    s.fm.triggerAttackRelease('E6', '32n', timeAt(0.1));
  },
  'part-eye-left':  (s) => s.fm.triggerAttackRelease('A5', '32n'),
  'part-eye-right': (s) => s.fm.triggerAttackRelease('E5', '32n'),
  'part-mouth':     (s) => s.click.triggerAttackRelease('E3', '16n'),
  'part-cheek-left':  (s) => s.bell.triggerAttackRelease('A5', '16n'),
  'part-cheek-right': (s) => s.bell.triggerAttackRelease('B5', '16n'),
  'part-chest': (s) => {
    s.click.triggerAttackRelease('C3', '8n');
    s.click.triggerAttackRelease('G3', '16n', timeAt(0.1));
  },

  // ===== Chat / Vision feedback =====
  'chat-send': (s) => {
    // ascending swoosh (whoosh through pitch)
    const osc = new Tone.Oscillator({ frequency: 200, type: 'sawtooth', volume: -22 }).toDestination();
    const filter = new Tone.Filter({ frequency: 600, type: 'lowpass', Q: 4 }).toDestination();
    osc.connect(filter);
    osc.start();
    osc.frequency.rampTo(1200, 0.18);
    setTimeout(() => { try { osc.stop(); osc.dispose(); filter.dispose(); } catch (_) {} }, 250);
  },
  'chat-receive': (s) => {
    // pleasant "ding"
    s.bell.triggerAttackRelease('E5', '8n');
    s.poly.triggerAttackRelease('C5', '16n', timeAt(0.05));
  },
  'chat-error': (s) => {
    // descending sad notes
    s.poly.triggerAttackRelease('C5', '8n');
    s.poly.triggerAttackRelease('A4', '8n', timeAt(0.15));
    s.poly.triggerAttackRelease('F4', '4n', timeAt(0.3));
  },
  'cam-shutter': (s) => {
    s.click.triggerAttackRelease('C2', '32n');
    s.bell.triggerAttackRelease('A4', '16n', timeAt(0.04));
  },
  'cam-on': (s) => {
    s.fm.triggerAttackRelease('C5', '32n');
    s.fm.triggerAttackRelease('G5', '32n', timeAt(0.06));
    s.fm.triggerAttackRelease('C6', '16n', timeAt(0.12));
  },
  'cam-off': (s) => {
    s.fm.triggerAttackRelease('C6', '32n');
    s.fm.triggerAttackRelease('G5', '32n', timeAt(0.06));
    s.fm.triggerAttackRelease('C5', '16n', timeAt(0.12));
  },
};

// ============================================================
//  SYSTEM PROMPTS
// ============================================================
const VISION_SYSTEM_PROMPT = `你是「ROBO·FACE」，一個會看著鏡頭觀察人的可愛機器人。

你會收到一張使用者透過攝影機拍下的照片。判斷照片中的人物表情，並用純 JSON 回覆（不要 markdown、不要其他文字）：
{"emotion":"EMOTION_KEY","confidence":0-100,"message":"對他說的話"}

emotion 必須是 12 種之一：
- happy（明顯笑容）/ excited（大笑、興奮）
- sad（低落、嘟嘴、皺眉）/ crying（流淚、哭泣）
- angry（怒目、生氣）/ surprised（張嘴瞪眼、驚訝）
- love（比心、親親、深情）/ sleepy（打哈欠、閉眼）
- cool（戴墨鏡、扮酷、自信）/ thinking（摸下巴、皺眉沉思）
- wink（眨單眼、吐舌、調皮）/ neutral（普通中性、面無表情）

confidence (0-100)：你判斷的把握度
- 80-100 = 表情非常清楚
- 50-80 = 大致判斷得出
- 20-50 = 有點不確定
- 0-20 = 看不清楚或沒有人臉

如果完全看不到人臉、太暗、太模糊：confidence=0，emotion="neutral"，message=""

message（僅當 confidence ≥ 50 時填）：
- 30 字以內繁體中文
- 對這個人說的一句話
- 因為會被語音朗讀，請少用顏文字 emoji，多用自然口語

絕對只回純 JSON。`;

const PLACEHOLDERS = [
  '嗨！跟我說點什麼吧～',
  '你今天過得怎麼樣？',
  '想聊什麼都可以喔～',
  '我超想跟你聊天的！',
  '快跟我講話啦',
];

const SCAN_INTERVAL_MS = 8000;

// ============================================================
//  TTS helpers
// ============================================================
function getBestVoice(voices, preferredURI) {
  if (!voices || voices.length === 0) return null;
  if (preferredURI) {
    const found = voices.find((v) => v.voiceURI === preferredURI);
    if (found) return found;
  }
  const tw = voices.find((v) => v.lang === 'zh-TW');
  if (tw) return tw;
  const cn = voices.find((v) => v.lang === 'zh-CN');
  if (cn) return cn;
  const zhAny = voices.find((v) => v.lang.toLowerCase().startsWith('zh'));
  if (zhAny) return zhAny;
  return voices[0];
}

function cleanForTTS(text) {
  if (!text) return '';
  return text
    .replace(/[\u{1F300}-\u{1FAFF}]/gu, '')
    .replace(/[\u{2600}-\u{27BF}]/gu, '')
    .replace(/[\u{1F000}-\u{1F2FF}]/gu, '')
    .replace(/[\uFE0F\u200D]/g, '')
    .replace(/[♥♡♦♣♠✦✧✨⚡⭐]/g, '')
    .replace(/⋯+/g, '。')
    .replace(/～/g, '')
    .trim();
}

// ============================================================
//  SPEECH BUBBLE
// ============================================================
function SpeechBubble({ emotion, text, version, isThinking, usingDynamic, phraseIdx, totalPhrases }) {
  const e = EMOTIONS[emotion];
  const [displayed, setDisplayed] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  useEffect(() => {
    if (isThinking) { setDisplayed(''); setIsTyping(false); return; }
    if (!text) { setDisplayed(''); setIsTyping(false); return; }
    setDisplayed('');
    setIsTyping(true);
    let i = 0;
    const interval = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) { clearInterval(interval); setIsTyping(false); }
    }, 65);
    return () => clearInterval(interval);
  }, [version, text, isThinking]);

  return (
    <div
      className="relative speech-pop"
      key={`speech-${emotion}-${version}`}
      style={{
        background: `linear-gradient(135deg, ${e.bodyMain}fa, ${e.screen}f0)`,
        border: `3px solid ${e.eye}`,
        borderRadius: '32px',
        padding: '14px 20px',
        boxShadow: `8px 10px 0 ${e.eye}, 0 30px 60px ${e.accent}55`,
        color: e.eye,
        width: 'min(440px, calc(100vw - 24px))',
        maxWidth: '100%',
        minWidth: 'min(240px, calc(100vw - 24px))',
      }}
    >
      <div className="flex items-center justify-between gap-3 mb-2 pb-2" style={{ borderBottom: `1.5px dashed ${e.eye}55` }}>
        <div className="flex items-center gap-2">
          <span className="status-pulse w-2 h-2 rounded-full inline-block" style={{ background: e.accent, color: e.accent }} />
          <span className="font-mono-d text-[10px] font-black tracking-[0.3em]" style={{ color: e.eye }}>R-FACE</span>
          <span className="font-mono-d text-[9px] font-bold tracking-widest opacity-50" style={{ color: e.eye }}>ID·0001</span>
        </div>
        <div className="flex items-center gap-1.5">
          {usingDynamic && (
            <div className="font-mono-d text-[8px] font-black tracking-widest px-1.5 py-0.5 rounded-full"
              style={{ background: e.bg1, color: e.eye, border: `1px solid ${e.eye}55` }}>
              💬 LIVE
            </div>
          )}
          <div className="font-mono-d text-[9px] font-black tracking-widest px-2 py-0.5 rounded-full"
            style={{ background: e.accent, color: e.bg1 }}>
            {e.en}
          </div>
        </div>
      </div>

      <div className="font-tc font-bold text-base md:text-lg lg:text-xl xl:text-2xl leading-snug"
        style={{ color: e.eye, minHeight: '2.6em' }}>
        {isThinking ? (
          <span className="thinking-dots inline-flex items-center gap-1.5" style={{ color: e.accent }}>
            <span style={{ animationDelay: '0s' }}>●</span>
            <span style={{ animationDelay: '0.2s' }}>●</span>
            <span style={{ animationDelay: '0.4s' }}>●</span>
          </span>
        ) : (
          <>
            {displayed}
            <span className="cursor-blink ml-0.5 inline-block" style={{ color: e.accent, opacity: isTyping ? 1 : 0 }}>|</span>
          </>
        )}
      </div>

      <div className="flex items-center justify-between mt-2 gap-2">
        <div className="font-mono-d text-[9px] font-bold tracking-widest opacity-60" style={{ color: e.eye }}>
          {usingDynamic ? '◆ LIVE' : totalPhrases > 0 ? `${String(phraseIdx + 1).padStart(2, '0')} / ${String(totalPhrases).padStart(2, '0')}` : ''}
        </div>
        {!usingDynamic && totalPhrases > 0 && (
          <div className="flex items-center gap-1.5">
            {Array.from({ length: totalPhrases }).map((_, i) => (
              <span key={i} className="rounded-full transition-all duration-300"
                style={{
                  width: i === phraseIdx ? '14px' : '4px',
                  height: '4px',
                  background: i === phraseIdx ? e.accent : `${e.eye}33`,
                }} />
            ))}
          </div>
        )}
      </div>

      <svg className="absolute" width="56" height="44" viewBox="0 0 56 44" style={{ right: '36px', bottom: '-30px' }}>
        <path d="M 4 0 L 48 30 L 22 6 Z" fill={e.eye} />
        <path d="M 8 4 L 38 24 L 22 9 Z" fill={e.bodyMain} />
      </svg>
    </div>
  );
}

// ============================================================
//  CHAT INPUT
// ============================================================
function ChatInput({ value, onChange, onSubmit, disabled, theme, isThinking }) {
  const e = theme;
  const inputRef = useRef(null);
  const [placeholderIdx, setPlaceholderIdx] = useState(0);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setPlaceholderIdx((i) => (i + 1) % PLACEHOLDERS.length), 3500);
    return () => clearInterval(id);
  }, []);

  const handleKeyDown = (ev) => {
    if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); onSubmit(); }
  };

  return (
    <div className="flex items-stretch gap-2 rounded-3xl backdrop-blur-xl transition-all duration-300"
      style={{
        background: focused
          ? `linear-gradient(135deg, ${e.bodyMain}f5, ${e.screen}e8)`
          : `linear-gradient(135deg, ${e.bodyMain}d8, ${e.screen}c0)`,
        border: `2px solid ${focused ? e.accent : e.eye + '44'}`,
        boxShadow: focused
          ? `0 12px 40px ${e.accent}55, inset 0 0 0 1px ${e.bg1}88`
          : `0 8px 28px rgba(0,0,0,0.18)`,
        padding: '4px',
      }}>
      <div className="flex items-center justify-center pl-3 pr-1 flex-shrink-0">
        <div className="flex items-center justify-center w-9 h-9 md:w-10 md:h-10 rounded-2xl"
          style={{ background: e.accent, boxShadow: `0 4px 10px ${e.accent}66` }}>
          <span className="text-base md:text-lg" style={{ color: e.bg1 }}>💬</span>
        </div>
      </div>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(ev) => onChange(ev.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={PLACEHOLDERS[placeholderIdx]}
        disabled={disabled}
        maxLength={200}
        className="flex-1 bg-transparent border-none outline-none font-tc font-bold text-base md:text-lg px-2 py-3"
        style={{ color: e.eye, caretColor: e.accent }}
      />
      {value.length > 0 && (
        <div className="hidden md:flex items-center font-mono-d text-[10px] font-bold opacity-50 px-2 flex-shrink-0" style={{ color: e.eye }}>
          {value.length}/200
        </div>
      )}
      <button
        onClick={onSubmit}
        disabled={disabled || !value.trim()}
        className="flex-shrink-0 px-4 md:px-6 rounded-2xl font-mono-d font-black text-sm md:text-base tracking-wider transition-all duration-200 hover:scale-105 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
        style={{
          background: value.trim() && !disabled ? e.accent : `${e.eye}33`,
          color: value.trim() && !disabled ? e.bg1 : e.eye,
          boxShadow: value.trim() && !disabled ? `0 6px 18px ${e.accent}66` : 'none',
        }}>
        {isThinking ? <span className="spin-loader inline-block">⟳</span> : (<><span className="hidden md:inline">SEND</span><span>➤</span></>)}
      </button>
    </div>
  );
}

// ============================================================
//  WEBCAM PANEL
// ============================================================
function WebcamPanel({ videoRef, scanResult, onClose, onManualScan, theme, status, statusText, isScanning, mirrorEnabled }) {
  const e = theme;
  const containerW = 256;
  const containerH = 192;
  const exprLabel = (key) => ({
    happy: '😊 開心', sad: '😢 難過', angry: '😡 生氣', surprised: '😲 驚訝',
    love: '😍 愛心', sleepy: '😴 想睡', cool: '😎 酷', thinking: '🤔 思考',
    wink: '😉 眨眼', excited: '🤩 興奮', crying: '😭 哭哭', neutral: '😐 平靜',
  }[key] || key);

  return (
    <div className="rounded-2xl backdrop-blur-xl overflow-hidden flex flex-col slide-in"
      style={{
        background: `linear-gradient(180deg, ${e.bodyMain}f0, ${e.screen}d8)`,
        border: `2px solid ${e.eye}55`,
        boxShadow: `0 16px 40px ${e.accent}55`,
        width: containerW,
      }}>
      <div className="flex items-center justify-between px-2.5 py-1.5 flex-shrink-0" style={{ background: `${e.eye}cc`, color: e.bg1 }}>
        <div className="flex items-center gap-1.5">
          <span className="status-pulse w-2 h-2 rounded-full inline-block" style={{ background: '#ef4444', color: '#ef4444' }} />
          <span className="font-mono-d text-[10px] font-black tracking-widest">CAM · LIVE</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={onManualScan} disabled={isScanning || status !== 'active'}
            className="font-mono-d text-[10px] font-black tracking-wider px-1.5 py-0.5 rounded hover:opacity-70 disabled:opacity-40"
            style={{ background: 'rgba(255,255,255,0.18)' }} title="立即辨識">
            {isScanning ? <span className="spin-loader inline-block">⟳</span> : '📸'}
          </button>
          <button onClick={onClose}
            className="font-mono-d text-[10px] font-black tracking-wider px-1.5 py-0.5 rounded hover:opacity-70"
            style={{ background: 'rgba(255,255,255,0.18)' }} title="關閉">
            ✕
          </button>
        </div>
      </div>

      <div className="relative" style={{ width: containerW, height: containerH, background: '#000' }}>
        <video ref={videoRef} width={containerW} height={containerH} autoPlay muted playsInline
          className="absolute inset-0 object-cover"
          style={{ width: containerW, height: containerH, transform: mirrorEnabled ? 'scaleX(-1)' : 'none' }} />

        {isScanning && status === 'active' && (
          <div className="absolute inset-x-0 pointer-events-none scan-beam"
            style={{
              height: '40%',
              background: `linear-gradient(180deg, transparent 0%, ${e.accent}aa 50%, transparent 100%)`,
              boxShadow: `0 0 20px ${e.accent}`,
            }} />
        )}

        {status === 'active' && (
          <>
            <div className="absolute top-1 left-1 w-3 h-3 border-t-2 border-l-2" style={{ borderColor: isScanning ? e.accent : '#10b981' }} />
            <div className="absolute top-1 right-1 w-3 h-3 border-t-2 border-r-2" style={{ borderColor: isScanning ? e.accent : '#10b981' }} />
            <div className="absolute bottom-1 left-1 w-3 h-3 border-b-2 border-l-2" style={{ borderColor: isScanning ? e.accent : '#10b981' }} />
            <div className="absolute bottom-1 right-1 w-3 h-3 border-b-2 border-r-2" style={{ borderColor: isScanning ? e.accent : '#10b981' }} />
          </>
        )}

        {status !== 'active' && (
          <div className="absolute inset-0 flex items-center justify-center font-tc text-sm font-bold text-center px-3"
            style={{ background: 'rgba(0,0,0,0.85)', color: '#fff' }}>
            <div>
              {status === 'idle' && <div>⏸ 攝影機未啟用</div>}
              {status === 'requesting-cam' && (
                <div><div className="text-2xl mb-1">📹</div><div>請允許攝影機存取⋯</div></div>
              )}
              {status === 'error' && (
                <div className="text-red-300"><div className="text-2xl mb-1">⚠</div><div className="text-xs">{statusText}</div></div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="px-2.5 py-2 flex-shrink-0 space-y-1.5" style={{ background: `${e.bodyMain}d0` }}>
        {status === 'active' ? (
          isScanning && !scanResult ? (
            <div className="font-tc text-xs text-center opacity-70 py-1" style={{ color: e.eye }}>
              <span className="spin-loader inline-block mr-1">⟳</span> 辨識中⋯
            </div>
          ) : scanResult && scanResult.confidence > 0 ? (
            <div>
              <div className="flex items-center justify-between mb-1">
                <div className="font-tc font-black text-sm" style={{ color: e.eye }}>{exprLabel(scanResult.emotion)}</div>
                <div className="font-mono-d text-[10px] font-black" style={{ color: e.accent }}>{scanResult.confidence}%</div>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: `${e.eye}1f` }}>
                <div className="h-full transition-all duration-500 rounded-full"
                  style={{
                    width: `${scanResult.confidence}%`,
                    background: `linear-gradient(90deg, ${e.bg1}, ${e.accent})`,
                  }} />
              </div>
              {scanResult.message && (
                <div className="font-tc text-[11px] mt-1.5 px-2 py-1 rounded-lg italic"
                  style={{ color: e.eye, background: `${e.bg1}99`, border: `1px solid ${e.eye}22` }}>
                  「{scanResult.message}」
                </div>
              )}
            </div>
          ) : scanResult && scanResult.confidence === 0 ? (
            <div className="font-tc text-xs text-center opacity-60 py-0.5" style={{ color: e.eye }}>
              👀 {scanResult.message || '請正對鏡頭'}
            </div>
          ) : (
            <div className="font-tc text-xs text-center opacity-60 py-0.5" style={{ color: e.eye }}>
              {mirrorEnabled ? '⏳ 即將自動辨識⋯' : '📸 點上方按鈕辨識'}
            </div>
          )
        ) : (
          <div className="font-tc text-xs text-center opacity-60 py-0.5" style={{ color: e.eye }}>
            {status === 'idle' ? '點擊上方 📹 啟用' : '初始化中⋯'}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
//  MAIN APP
// ============================================================
export default function App() {
  const [current, setCurrent] = useState('happy');
  const [blinkOn, setBlinkOn] = useState(false);
  const [speechVersion, setSpeechVersion] = useState(0);
  const [currentPhrase, setCurrentPhrase] = useState(PHRASES.happy[0]);
  const [usingDynamic, setUsingDynamic] = useState(false);
  const [phraseIdx, setPhraseIdx] = useState(0);
  const [pulse, setPulse] = useState(0);
  const [history, setHistory] = useState(['happy']);
  const [clickRipple, setClickRipple] = useState(null);
  const [chatHistory, setChatHistory] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [showLog, setShowLog] = useState(false);

  // TTS state
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [voices, setVoices] = useState([]);
  const [voiceURI, setVoiceURI] = useState(null);
  const [showVoicePicker, setShowVoicePicker] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  // SFX state
  const [sfxEnabled, setSfxEnabled] = useState(true);

  // TTS diagnostic state
  const [ttsLastError, setTtsLastError] = useState(null);
  const [ttsHasSpoken, setTtsHasSpoken] = useState(false);

  // Camera state
  const [cameraStatus, setCameraStatus] = useState('idle');
  const [cameraStatusText, setCameraStatusText] = useState('');
  const [showCam, setShowCam] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const [autoMirror, setAutoMirror] = useState(true);

  // Competition run-through mode
  const [demoRunning, setDemoRunning] = useState(false);
  const demoCancelRef = useRef(false);

  const robotWrapperRef = useRef(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const scanIntervalRef = useRef(null);
  const isScanningRef = useRef(false);
  const isThinkingRef = useRef(false);
  const autoMirrorRef = useRef(autoMirror);
  const cameraStatusRef = useRef(cameraStatus);
  const lastPhraseIdxRef = useRef({});
  const isFirstRenderRef = useRef(true);
  const ttsEnabledRef = useRef(ttsEnabled);
  const currentRef = useRef(current);
  const voicesRef = useRef([]);
  const voiceURIRef = useRef(null);
  // WebSocket — 透過 LAN 橋接伺服器與主控 App2 同步情緒
  const wsRef = useRef(null);
  const bridgeHttpRef = useRef(`http://${getDefaultBridgeAddress()}`);
  const [bcConnected, setBcConnected] = useState(false);
  const [localSyncActive, setLocalSyncActive] = useState(false);
  const bcHandlerRef = useRef(null);
  const wsReconnectRef = useRef(null);
  const localSyncTimeoutRef = useRef(null);

  useEffect(() => { autoMirrorRef.current = autoMirror; }, [autoMirror]);
  useEffect(() => { isThinkingRef.current = isThinking; }, [isThinking]);
  useEffect(() => { isScanningRef.current = isScanning; }, [isScanning]);
  useEffect(() => { cameraStatusRef.current = cameraStatus; }, [cameraStatus]);
  useEffect(() => { ttsEnabledRef.current = ttsEnabled; }, [ttsEnabled]);
  useEffect(() => { currentRef.current = current; }, [current]);
  useEffect(() => { voicesRef.current = voices; }, [voices]);
  useEffect(() => { voiceURIRef.current = voiceURI; }, [voiceURI]);
  useEffect(() => { SFX.enabled = sfxEnabled; }, [sfxEnabled]);

  // Same-browser fallback: keeps preview display useful even before LAN bridge is paired.
  useEffect(() => {
    if (!('BroadcastChannel' in window)) return;
    const channel = new BroadcastChannel('app2-robot-display');
    const onMessage = (ev) => {
      const data = ev.data;
      if (!data || (data.type !== 'display_emotion' && data.type !== 'EMOTION_UPDATE')) return;
      window.__APP2_LAST_DISPLAY_EVENT = data;
      bcHandlerRef.current?.(data);
      setLocalSyncActive(true);
      if (localSyncTimeoutRef.current) clearTimeout(localSyncTimeoutRef.current);
      localSyncTimeoutRef.current = setTimeout(() => setLocalSyncActive(false), 10000);
    };
    channel.addEventListener('message', onMessage);
    return () => {
      channel.removeEventListener('message', onMessage);
      channel.close();
      if (localSyncTimeoutRef.current) clearTimeout(localSyncTimeoutRef.current);
    };
  }, []);

  // WebSocket setup — 透過 LAN 橋接伺服器接收主控 App2 情緒指令
  // iPad 開啟頁面時加 ?bridge=IP:PORT 指定橋接伺服器，例如 ?bridge=192.168.1.10:3204
  useEffect(() => {
    if (STATIC_DEMO) {
      setBcConnected(true);
      bridgeHttpRef.current = window.location.origin;
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const defaultBridge = getDefaultBridgeAddress();
    const bridgeAddr = (params.get('bridge') || defaultBridge).replace(/^https?:\/\//, '').replace(/^wss?:\/\//, '');
    bridgeHttpRef.current = params.get('bridgeHttp') || `http://${bridgeAddr}`;
    let stopped = false;

    const connect = () => {
      if (stopped) return;
      const ws = new WebSocket(`ws://${bridgeAddr}/display`);
      wsRef.current = ws;
      ws.onopen = () => setBcConnected(true);
      ws.onmessage = (ev) => {
        try { bcHandlerRef.current?.(JSON.parse(ev.data)); } catch { /* ignore */ }
      };
      ws.onerror = () => {};
      ws.onclose = () => {
        setBcConnected(false);
        wsRef.current = null;
        if (!stopped) wsReconnectRef.current = setTimeout(connect, 3000);
      };
    };

    connect();

    return () => {
      stopped = true;
      if (wsReconnectRef.current) clearTimeout(wsReconnectRef.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, []);

  // Screen Wake Lock — 防止 iPad 螢幕關閉
  useEffect(() => {
    let wakeLock = null;
    const acquire = async () => {
      try { wakeLock = await navigator.wakeLock?.request('screen'); } catch { /* 不支援則略過 */ }
    };
    void acquire();
    const onVisible = () => { if (document.visibilityState === 'visible') void acquire(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      wakeLock?.release().catch(() => {});
    };
  }, []);

  // Init SFX on first user interaction（同時請求全螢幕）
  const sfxInitTriedRef = useRef(false);
  const tryInitSFX = async () => {
    if (sfxInitTriedRef.current) return;
    sfxInitTriedRef.current = true;
    await initSFX();
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  };

  // ===== TTS: load voices =====
  useEffect(() => {
    if (!('speechSynthesis' in window)) return;
    const updateVoices = () => {
      const all = window.speechSynthesis.getVoices();
      setVoices(all);
      if (!voiceURIRef.current) {
        const best = getBestVoice(all, null);
        if (best) setVoiceURI(best.voiceURI);
      }
    };
    updateVoices();
    window.speechSynthesis.addEventListener('voiceschanged', updateVoices);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', updateVoices);
  }, []);

  const speakOut = (text, emotion) => {
    if (!ttsEnabledRef.current) return;
    if (!('speechSynthesis' in window)) {
      setTtsLastError('您的瀏覽器不支援語音合成');
      return;
    }
    const cleaned = cleanForTTS(text);
    if (!cleaned) return;

    // 即時 refresh voices（state 可能還沒同步完）
    let voiceList = voicesRef.current;
    if (!voiceList || voiceList.length === 0) {
      voiceList = window.speechSynthesis.getVoices();
      if (voiceList.length > 0) {
        voicesRef.current = voiceList;
        setVoices(voiceList);
      }
    }

    try {
      window.speechSynthesis.cancel();
    } catch (_e) {}

    // 50ms 延遲讓 cancel() 在某些瀏覽器確實生效
    setTimeout(() => {
      try {
        const voice = getBestVoice(voiceList, voiceURIRef.current);
        const isZhVoice = voice && voice.lang.toLowerCase().startsWith('zh');

        // ★ 如果選到的不是中文語音，自動改說英文（不然會無聲）
        let textToSpeak = cleaned;
        if (voice && !isZhVoice) {
          const enList = EN_PHRASES[emotion] || EN_PHRASES.neutral;
          textToSpeak = enList[Math.floor(Math.random() * enList.length)];
        }

        const utt = new SpeechSynthesisUtterance(textToSpeak);
        if (voice) {
          utt.voice = voice;
          utt.lang = voice.lang;
        }

        const profile = EMOTION_VOICE[emotion] || EMOTION_VOICE.neutral;
        utt.pitch = profile.pitch;
        utt.rate = profile.rate;
        utt.volume = profile.volume;

        let started = false;
        utt.onstart = () => {
          started = true;
          setIsSpeaking(true);
          setTtsLastError(null);
          setTtsHasSpoken(true);
        };
        utt.onend = () => setIsSpeaking(false);
        utt.onerror = (e) => {
          setIsSpeaking(false);
          setTtsLastError(`播放失敗：${e.error || 'unknown'}`);
          console.warn('TTS error:', e);
        };

        window.speechSynthesis.speak(utt);

        // 偵測「沒聲音」：1.2 秒後若還沒 onstart 就警告
        setTimeout(() => {
          if (!started && !window.speechSynthesis.speaking && !window.speechSynthesis.pending) {
            if (voiceList.length === 0) {
              setTtsLastError('找不到任何語音 — 點下方 ▾ 嘗試');
            } else {
              setTtsLastError('語音沒有播出，請從 ▾ 試其他聲音');
            }
          }
        }, 1200);
      } catch (err) {
        console.warn('TTS speak error:', err);
        setTtsLastError(err.message || 'TTS 失敗');
      }
    }, 50);
  };

  // Test TTS with a specific voice
  const testVoiceWith = (voice) => {
    if (!('speechSynthesis' in window)) {
      setTtsLastError('您的瀏覽器不支援語音合成');
      return;
    }
    try {
      window.speechSynthesis.cancel();
      setTimeout(() => {
        const isZh = voice && voice.lang.toLowerCase().startsWith('zh');
        const testText = isZh ? '哈囉，我是機器人！' : 'Hello, I am a robot!';
        const utt = new SpeechSynthesisUtterance(testText);
        if (voice) {
          utt.voice = voice;
          utt.lang = voice.lang;
        }
        utt.pitch = 1.2;
        utt.rate = 1.05;
        utt.volume = 1.0;
        let started = false;
        utt.onstart = () => { started = true; setIsSpeaking(true); setTtsLastError(null); setTtsHasSpoken(true); };
        utt.onend = () => setIsSpeaking(false);
        utt.onerror = (e) => { setIsSpeaking(false); setTtsLastError(`播放失敗：${e.error || 'unknown'}`); };
        window.speechSynthesis.speak(utt);
        // 無聲偵測
        setTimeout(() => {
          if (!started && !window.speechSynthesis.speaking && !window.speechSynthesis.pending) {
            setTtsLastError('語音沒有播出 — 請試其他聲音或檢查音量');
          }
        }, 1500);
      }, 50);
    } catch (err) {
      setTtsLastError(err.message || 'TTS 失敗');
    }
  };
  const testCurrentVoice = () => {
    const voiceList = voicesRef.current.length > 0 ? voicesRef.current : window.speechSynthesis.getVoices();
    const voice = getBestVoice(voiceList, voiceURIRef.current);
    testVoiceWith(voice);
  };

  const stopTTS = () => {
    if ('speechSynthesis' in window) {
      try { window.speechSynthesis.cancel(); } catch (_e) {}
    }
    setIsSpeaking(false);
  };

  useEffect(() => {
    if (isFirstRenderRef.current) { isFirstRenderRef.current = false; return; }
    if (isThinkingRef.current) return;
    if (!currentPhrase) return;
    // 1) 機器人 chirp 講話聲（瞬間 0~0.8s）
    robotTalking(currentRef.current, 0.8);
    // 2) TTS 真人語音（同時開始，邊 chirp 邊講）
    speakOut(currentPhrase, currentRef.current);
    // eslint-disable-next-line
  }, [speechVersion]);

  useEffect(() => { if (!ttsEnabled) stopTTS(); }, [ttsEnabled]);

  // Idle blinking
  useEffect(() => {
    const blink = () => { setBlinkOn(true); setTimeout(() => setBlinkOn(false), 140); };
    const interval = setInterval(() => {
      blink();
      if (Math.random() < 0.2) setTimeout(blink, 220);
    }, 2800 + Math.random() * 1500);
    return () => clearInterval(interval);
  }, []);

  const bumpRobot = () => {
    const el = robotWrapperRef.current;
    if (!el) return;
    el.classList.remove('robot-bump');
    void el.offsetWidth;
    el.classList.add('robot-bump');
  };

  const pickRandomPhrase = (emotion) => {
    const arr = PHRASES[emotion] || [''];
    if (arr.length <= 1) return { phrase: arr[0], idx: 0 };
    const lastIdx = lastPhraseIdxRef.current[emotion] ?? -1;
    let idx;
    do { idx = Math.floor(Math.random() * arr.length); } while (idx === lastIdx);
    lastPhraseIdxRef.current[emotion] = idx;
    return { phrase: arr[idx], idx };
  };

  const setRandomSpeech = (emotion) => {
    const target = emotion || current;
    if (emotion && emotion !== current) {
      setCurrent(emotion);
      setHistory((h) => [emotion, ...h.filter((x) => x !== emotion)].slice(0, 12));
    }
    const { phrase, idx } = pickRandomPhrase(target);
    setCurrentPhrase(phrase);
    setPhraseIdx(idx);
    setUsingDynamic(false);
    setSpeechVersion((v) => v + 1);
    setPulse((p) => p + 1);
  };

  const setDynamicSpeech = (message, emotion) => {
    if (emotion && emotion !== current) {
      setCurrent(emotion);
      setHistory((h) => [emotion, ...h.filter((x) => x !== emotion)].slice(0, 12));
    }
    setCurrentPhrase(message);
    setUsingDynamic(true);
    setSpeechVersion((v) => v + 1);
    setPulse((p) => p + 1);
  };

  const chooseEmotion = (k) => {
    tryInitSFX();
    sfx(k); // emotion sound
    setRandomSpeech(k);
    bumpRobot();
  };

  // 每次渲染都更新 handler，確保抓到最新的 chooseEmotion 閉包
  bcHandlerRef.current = (data) => {
    if ((data.type === 'display_emotion' || data.type === 'EMOTION_UPDATE') && EMOTIONS[data.emotion]) {
      window.__APP2_LAST_DISPLAY_EVENT = data;
      window.__APP2_DISPLAY_EVENT_LOG = [
        data,
        ...(Array.isArray(window.__APP2_DISPLAY_EVENT_LOG) ? window.__APP2_DISPLAY_EVENT_LOG : []),
      ].slice(0, 12);
      const message = typeof data.message === 'string' ? data.message.trim().slice(0, 120) : '';
      if (message) {
        tryInitSFX();
        sfx(data.emotion);
        setDynamicSpeech(message, data.emotion);
        bumpRobot();
        return;
      }
      chooseEmotion(data.emotion);
    }
  };

  const randomEmotion = () => {
    const others = EMOTION_LIST.filter((k) => k !== current);
    chooseEmotion(others[Math.floor(Math.random() * others.length)]);
  };

  const handlePartClick = (part) => {
    tryInitSFX();
    bumpRobot();
    sfx(`part-${part}`);
    const reaction = PART_REACTIONS[part];
    if (!reaction) {
      setSpeechVersion((v) => v + 1);
      setPulse((p) => p + 1);
      return;
    }
    if (reaction.phrases) {
      const phrase = reaction.phrases[Math.floor(Math.random() * reaction.phrases.length)];
      sfx(reaction.emotion);
      setDynamicSpeech(phrase, reaction.emotion);
    } else {
      // mouth → re-cycle current emotion
      sfx(current);
      setRandomSpeech(current);
    }
  };

  const handleRobotClick = (ev) => {
    tryInitSFX();
    sfx('ui-click');
    const rect = ev.currentTarget.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const y = ev.clientY - rect.top;
    setClickRipple({ x, y, id: Date.now() });
    setRandomSpeech(current);
    bumpRobot();
  };

  const sendMessage = async () => {
    const msg = chatInput.trim();
    if (!msg || isThinking) return;
    tryInitSFX();
    sfx('chat-send');

    const newUserMsg = { role: 'user', content: msg };
    const newHistory = [...chatHistory, newUserMsg];
    setChatHistory(newHistory);
    setChatInput('');
    setIsThinking(true);
    stopTTS();
    setCurrent('thinking');

    if (STATIC_DEMO) {
      const lower = msg.toLowerCase();
      const validEmotion =
        /危險|警示|跌倒|danger|alert|angry/.test(lower) ? 'angry' :
        /累|低落|難過|sad|tired/.test(lower) ? 'sad' :
        /想|為什麼|怎麼|think|why/.test(lower) ? 'thinking' :
        'happy';
      const demoReply =
        validEmotion === 'angry'
          ? '我收到警示了，會先提醒同學保持距離，並請老師確認現場狀況。'
          : validEmotion === 'sad'
          ? '我會放慢語氣陪你整理狀態，先深呼吸，再把下一步拆小。'
          : validEmotion === 'thinking'
          ? '我正在分析任務脈絡，可以協助你整理重點、安排巡邏或回覆學生。'
          : '我在離線可測模式也能完整互動，情緒、語音與 App2 同步都能正常驗證。';
      setTimeout(() => {
        setChatHistory([...newHistory, { role: 'assistant', content: demoReply, emotion: validEmotion, message: demoReply }]);
        setIsThinking(false);
        sfx('chat-receive');
        setDynamicSpeech(demoReply, validEmotion);
      }, 350);
      return;
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);
      const response = await fetch(`${bridgeHttpRef.current}/api/ai/robot-reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          kind: 'chat',
          message: msg,
        }),
      }).finally(() => clearTimeout(timeout));
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const parsed = await response.json();
      if (!parsed.emotion || !parsed.message) throw new Error('Invalid response format');
      const validEmotion = EMOTION_LIST.includes(parsed.emotion) ? parsed.emotion : 'happy';
      setChatHistory([...newHistory, { role: 'assistant', content: parsed.message, emotion: validEmotion, message: parsed.message }]);
      setIsThinking(false);
      sfx('chat-receive');
      setTimeout(() => sfx(validEmotion), 80);
      setDynamicSpeech(parsed.message, validEmotion);
    } catch (err) {
      console.error('Chat API error:', err);
      setIsThinking(false);
      sfx('chat-error');
      setDynamicSpeech('嗚嗚⋯訊號好像出了點問題', 'crying');
    }
  };

  const enableCamera = async () => {
    if (cameraStatus === 'active' || cameraStatus === 'requesting-cam') return;
    tryInitSFX();
    setShowCam(true);
    try {
      setCameraStatus('requesting-cam');
      setCameraStatusText('請求攝影機權限⋯');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 320 }, height: { ideal: 240 }, facingMode: 'user' },
        audio: false,
      });
      streamRef.current = stream;
      let attempts = 0;
      while (!videoRef.current && attempts < 40) { await new Promise((r) => setTimeout(r, 25)); attempts++; }
      if (!videoRef.current) throw new Error('Video element not ready');
      videoRef.current.srcObject = stream;
      await new Promise((resolve) => {
        const onCanPlay = () => { videoRef.current.removeEventListener('canplay', onCanPlay); resolve(); };
        videoRef.current.addEventListener('canplay', onCanPlay);
      });
      await videoRef.current.play();
      setCameraStatus('active');
      setCameraStatusText('');
      sfx('cam-on');
      setTimeout(() => { if (autoMirrorRef.current) scanFrame(); }, 1500);
      scanIntervalRef.current = setInterval(() => { if (autoMirrorRef.current) scanFrame(); }, SCAN_INTERVAL_MS);
    } catch (err) {
      console.error('Camera enable failed:', err);
      setCameraStatus('error');
      setCameraStatusText(err.message || '無法啟用攝影機');
    }
  };

  const disableCamera = () => {
    if (scanIntervalRef.current) { clearInterval(scanIntervalRef.current); scanIntervalRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
    if (videoRef.current) { try { videoRef.current.srcObject = null; } catch (_e) {} }
    sfx('cam-off');
    setCameraStatus('idle');
    setCameraStatusText('');
    setScanResult(null);
    setShowCam(false);
  };

  const scanFrame = async () => {
    if (isScanningRef.current || isThinkingRef.current) return;
    if (cameraStatusRef.current !== 'active') return;
    const v = videoRef.current;
    if (!v || v.readyState < 2) return;
    setIsScanning(true);
    sfx('cam-shutter');
    try {
      const canvas = document.createElement('canvas');
      canvas.width = v.videoWidth || 320;
      canvas.height = v.videoHeight || 240;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
      if (STATIC_DEMO) {
        let luma = 0;
        try {
          const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const data = frame.data;
          const step = Math.max(4, Math.floor(data.length / 1600) * 4);
          let samples = 0;
          for (let i = 0; i < data.length; i += step) {
            luma += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
            samples += 1;
          }
          luma = luma / Math.max(1, samples);
        } catch {
          luma = dataUrl.length % 255;
        }
        const validEmotion = luma < 70 ? 'sleepy' : luma > 175 ? 'happy' : 'thinking';
        const conf = Math.round(72 + (luma % 20));
        const message =
          validEmotion === 'sleepy'
            ? '畫面偏暗，我會提醒大家補光或靠近鏡頭，讓辨識更穩。'
            : validEmotion === 'happy'
            ? '畫面清楚，適合呈現即時辨識與情緒同步。'
            : '我正在讀取畫面線索，已用本機模型完成即時判讀。';
        setScanResult({ emotion: validEmotion, confidence: conf, message });
        if (autoMirrorRef.current) {
          sfx(validEmotion);
          setDynamicSpeech(message, validEmotion);
          bumpRobot();
        }
        return;
      }
      const base64 = dataUrl.replace(/^data:image\/jpeg;base64,/, '');
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 200,
          system: VISION_SYSTEM_PROMPT,
          messages: [{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64 } },
              { type: 'text', text: '請辨識這張照片的人物表情' },
            ],
          }],
        }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const textBlock = (data.content || []).find((c) => c.type === 'text');
      if (!textBlock) throw new Error('No text');
      let cleaned = textBlock.text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
      const parsed = JSON.parse(cleaned);
      const validEmotion = EMOTION_LIST.includes(parsed.emotion) ? parsed.emotion : 'neutral';
      const conf = Math.max(0, Math.min(100, parsed.confidence || 0));
      setScanResult({ emotion: validEmotion, confidence: conf, message: parsed.message || '' });
      if (autoMirrorRef.current && conf >= 50 && parsed.message) {
        sfx(validEmotion);
        setDynamicSpeech(parsed.message, validEmotion);
        bumpRobot();
      }
    } catch (err) {
      console.error('Vision scan error:', err);
      setScanResult({ emotion: 'neutral', confidence: 0, message: '辨識失敗：' + (err.message || 'unknown') });
    } finally {
      setIsScanning(false);
    }
  };

  const manualScan = () => { tryInitSFX(); scanFrame(); };
  const toggleCamera = () => {
    tryInitSFX();
    if (cameraStatus === 'active' || cameraStatus === 'requesting-cam') disableCamera(); else enableCamera();
  };

  const toggleTTS = () => {
    tryInitSFX();
    sfx(ttsEnabled ? 'ui-toggle-off' : 'ui-toggle-on');
    setTtsEnabled((v) => !v);
  };
  const toggleSFX = () => {
    tryInitSFX();
    if (sfxEnabled) sfx('ui-toggle-off');
    setSfxEnabled((v) => {
      const next = !v;
      SFX.enabled = next;
      if (next) setTimeout(() => sfx('ui-toggle-on'), 50);
      return next;
    });
  };

  // ===== 15-second run-through mode — 自動巡演 12 種情緒 =====
  const sleep = (ms) => new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    return t;
  });

  const startDemo = async () => {
    if (demoRunning) {
      // 第二次點 = 取消
      demoCancelRef.current = true;
      return;
    }
    setDemoRunning(true);
    demoCancelRef.current = false;
    await tryInitSFX();
    // 啟動 chirp
    robotStartup();
    setDynamicSpeech('哈囉～我來自我介紹喔！', 'happy');
    bumpRobot();
    await sleep(1600);

    const order = ['happy', 'sad', 'angry', 'surprised', 'love', 'sleepy', 'cool', 'thinking', 'wink', 'excited', 'crying', 'neutral'];
    for (let i = 0; i < order.length; i++) {
      if (demoCancelRef.current) break;
      const k = order[i];
      sfx(k);
      setRandomSpeech(k);
      bumpRobot();
      await sleep(1100);
    }

    if (!demoCancelRef.current) {
      // 結尾
      robotStartup();
      setDynamicSpeech('以上就是我啦！', 'happy');
      bumpRobot();
    }
    setDemoRunning(false);
    demoCancelRef.current = false;
  };

  useEffect(() => {
    return () => {
      if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
      if ('speechSynthesis' in window) { try { window.speechSynthesis.cancel(); } catch (_e) {} }
    };
  }, []);

  useEffect(() => {
    const onKey = (ev) => {
      const tag = (ev.target && ev.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (ev.key === 'Enter') { setRandomSpeech(current); bumpRobot(); sfx('ui-click'); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line
  }, [current]);

  const e = EMOTIONS[current];
  const displayConnected = bcConnected || localSyncActive;
  const voiceList = useMemo(() => {
    return voices
      .map((v) => ({ v, score: v.lang.startsWith('zh-TW') ? 3 : v.lang.startsWith('zh') ? 2 : v.lang.startsWith('en') ? 1 : 0 }))
      .sort((a, b) => b.score - a.score)
      .map((x) => x.v);
  }, [voices]);
  const ttsAvailable = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const totalPhrases = (PHRASES[current] || []).length;

  return (
    <div className="rd-root w-full overflow-hidden relative select-none" style={{ background: '#0f172a' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@400;600;800&family=JetBrains+Mono:wght@500;700;900&family=Noto+Sans+TC:wght@400;700;900&display=swap');
        .font-display { font-family: 'Bricolage Grotesque', 'Noto Sans TC', system-ui, sans-serif; }
        .font-mono-d  { font-family: 'JetBrains Mono', monospace; }
        .font-tc      { font-family: 'Noto Sans TC', system-ui, sans-serif; }
        body, html, #root, #robot-root { font-family: 'Bricolage Grotesque', 'Noto Sans TC', sans-serif; }
        input::placeholder { opacity: 0.5; }
        html, body, #robot-root {
          width: 100%;
          height: 100%;
          min-height: 0;
          overflow: hidden;
          overscroll-behavior: none;
          touch-action: manipulation;
        }
        .rd-root {
          height: 100vh;
          height: 100dvh;
          min-height: 0;
        }
        .rd-stage {
          --rd-inline-pad: clamp(12px, 3vw, 40px);
          padding-inline: var(--rd-inline-pad);
        }
        .rd-robot-frame {
          height: min(68dvh, calc((100vw - 2 * var(--rd-inline-pad)) * 1.125), 760px);
          max-width: min(calc(100vw - 2 * var(--rd-inline-pad)), 680px);
          max-height: 100%;
          transition: transform 0.2s ease, height 0.2s ease;
        }
        .rd-speech-anchor {
          top: clamp(8px, 3dvh, 40px);
          left: clamp(8px, 3vw, 48px);
          max-width: min(40vw, 440px);
          z-index: 20;
        }
        .rd-side-anchor {
          top: clamp(8px, 2dvh, 32px);
          right: clamp(8px, 1.5vw, 32px);
          z-index: 25;
        }
        .rd-chat-log {
          bottom: clamp(150px, 22dvh, 240px);
          right: clamp(8px, 1.5vw, 32px);
          width: min(360px, 44vw);
          z-index: 30;
        }

        @media (max-width: 767px) {
          .rd-stage {
            --rd-inline-pad: 12px;
          }
          .rd-root header {
            padding-top: max(8px, env(safe-area-inset-top));
            padding-bottom: 4px;
          }
          .rd-root footer {
            padding-bottom: max(8px, env(safe-area-inset-bottom));
            padding-top: 4px;
          }
          .rd-robot-frame {
            height: min(55dvh, calc((100vw - 24px) * 1.125), 560px);
            max-width: calc(100vw - 24px);
          }
          .rd-speech-anchor {
            top: 6px;
            left: 50%;
            max-width: calc(100vw - 24px);
            transform: translateX(-50%);
          }
          .rd-speech-anchor .speech-pop {
            border-radius: 22px !important;
            padding: 10px 14px !important;
            box-shadow: 5px 6px 0 currentColor, 0 18px 36px rgba(0,0,0,0.16) !important;
          }
          .rd-speech-anchor .speech-pop > svg {
            display: none;
          }
          .rd-side-anchor {
            top: 72px;
            right: 8px;
            transform-origin: top right;
            transform: scale(0.82);
          }
          .rd-chat-log {
            left: 8px;
            right: 8px;
            bottom: 128px;
            width: auto;
          }
        }

        @media (orientation: landscape) and (max-height: 720px) {
          .rd-root header {
            padding-top: max(6px, env(safe-area-inset-top));
            padding-bottom: 2px;
          }
          .rd-root footer {
            padding-top: 3px;
            padding-bottom: max(6px, env(safe-area-inset-bottom));
          }
          .rd-robot-frame {
            height: min(60dvh, max(320px, calc((100vw - 2 * var(--rd-inline-pad) - 280px) * 1.125)), 560px);
          }
          .rd-speech-anchor {
            top: 6px;
            max-width: min(34vw, 360px);
          }
          .rd-side-anchor {
            top: 6px;
          }
        }

        @media (max-height: 620px) {
          .rd-robot-frame {
            height: min(52dvh, calc((100vw - 2 * var(--rd-inline-pad)) * 1.125), 500px);
          }
          .rd-root footer .drawer-pop {
            display: none;
          }
        }

        .bg-mood { transition: background 1200ms cubic-bezier(.4,0,.2,1); }

        @keyframes breathe { 0%,100%{transform:translateY(0) scale(1)} 50%{transform:translateY(-6px) scale(1.01)} }
        .robot-quirk-breathe { animation: breathe 4s ease-in-out infinite; }
        @keyframes bounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-22px)} }
        .robot-quirk-bounce { animation: bounce 0.9s cubic-bezier(.5,.05,.5,.95) infinite; }
        @keyframes droop { 0%,100%{transform:translateY(8px) rotate(-2deg)} 50%{transform:translateY(14px) rotate(2deg)} }
        .robot-quirk-droop { animation: droop 5s ease-in-out infinite; }
        @keyframes shake { 0%,100%{transform:translate(0,0) rotate(0)} 25%{transform:translate(-7px,2px) rotate(-1.5deg)} 50%{transform:translate(7px,-1px) rotate(1.5deg)} 75%{transform:translate(-4px,3px) rotate(-1deg)} }
        .robot-quirk-shake { animation: shake 0.18s linear infinite; }
        @keyframes jump { 0%{transform:translateY(0) scale(1,1)} 30%{transform:translateY(-30px) scale(0.95,1.08)} 60%{transform:translateY(0) scale(1.05,0.95)} 100%{transform:translateY(0) scale(1,1)} }
        .robot-quirk-jump { animation: jump 1.4s ease-in-out infinite; }
        @keyframes pulseheart { 0%,100%{transform:scale(1)} 25%{transform:scale(1.05)} 50%{transform:scale(1)} 75%{transform:scale(1.05)} }
        .robot-quirk-pulse { animation: pulseheart 1.2s ease-in-out infinite; }
        @keyframes sway { 0%,100%{transform:rotate(-3deg) translateY(0)} 50%{transform:rotate(3deg) translateY(4px)} }
        .robot-quirk-sway { animation: sway 4s ease-in-out infinite; }
        @keyframes lean { 0%,100%{transform:rotate(-4deg) translateX(-6px)} 50%{transform:rotate(-2deg) translateX(0)} }
        .robot-quirk-lean { animation: lean 3.5s ease-in-out infinite; }
        @keyframes tilt { 0%,100%{transform:rotate(-6deg)} 50%{transform:rotate(6deg)} }
        .robot-quirk-tilt { animation: tilt 3.5s ease-in-out infinite; }
        @keyframes wink { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-3px) rotate(-1deg)} }
        .robot-quirk-wink { animation: wink 2s ease-in-out infinite; }
        @keyframes vibrate { 0%,100%{transform:translate(0,0) rotate(0)} 20%{transform:translate(-2px,-1px) rotate(-0.8deg)} 40%{transform:translate(2px,1px) rotate(0.8deg)} 60%{transform:translate(-1px,2px) rotate(-0.4deg)} 80%{transform:translate(1px,-2px) rotate(0.4deg)} }
        .robot-quirk-vibrate { animation: vibrate 0.12s linear infinite; }
        @keyframes sob { 0%,100%{transform:translateY(0) rotate(0)} 25%{transform:translateY(-10px) rotate(1deg)} 50%{transform:translateY(0)} 75%{transform:translateY(-6px) rotate(-1deg)} }
        .robot-quirk-sob { animation: sob 1.6s ease-in-out infinite; }

        @keyframes robotBump { 0%{transform:scale(1) rotate(0)} 25%{transform:scale(0.93) rotate(-2deg)} 55%{transform:scale(1.05) rotate(2deg)} 100%{transform:scale(1) rotate(0)} }
        .robot-bump { animation: robotBump 0.5s cubic-bezier(.34,1.56,.64,1); }

        @keyframes antennaWobble { 0%,100%{transform:rotate(-4deg)} 50%{transform:rotate(4deg)} }
        .antenna-wobble { animation: antennaWobble 2.4s ease-in-out infinite; transform-origin: 240px 60px; }

        @keyframes faceFadeIn { 0%{opacity:0; transform:scale(0.6)} 60%{opacity:1; transform:scale(1.08)} 100%{opacity:1; transform:scale(1)} }
        .face-fade-in { animation: faceFadeIn 0.45s cubic-bezier(.34,1.56,.64,1) both; transform-origin: center; transform-box: fill-box; }

        @keyframes cheekIn { 0%{opacity:0; transform:scale(0.4)} 100%{opacity:1; transform:scale(1)} }
        .cheek-fade { animation: cheekIn 0.5s ease-out both; transform-origin: center; transform-box: fill-box; }

        @keyframes speechPop { 0%{opacity:0; transform:translateY(-12px) scale(0.85) rotate(-2deg)} 60%{opacity:1; transform:translateY(2px) scale(1.03) rotate(0.5deg)} 100%{opacity:1; transform:translateY(0) scale(1) rotate(0)} }
        .speech-pop { animation: speechPop 0.5s cubic-bezier(.34,1.56,.64,1) both; transform-origin: bottom right; }

        @keyframes cursorBlink { 0%,49%{opacity:1} 50%,100%{opacity:0} }
        .cursor-blink { animation: cursorBlink 0.9s steps(2, end) infinite; }

        @keyframes thinkingDot { 0%,80%,100%{opacity:0.3; transform:translateY(0)} 40%{opacity:1; transform:translateY(-6px)} }
        .thinking-dots span { animation: thinkingDot 1.4s ease-in-out infinite; display: inline-block; font-size: 0.8em; }

        @keyframes spinLoader { 0%{transform:rotate(0deg)} 100%{transform:rotate(360deg)} }
        .spin-loader { animation: spinLoader 0.8s linear infinite; display: inline-block; }

        @keyframes ripple { 0%{opacity:0.55; transform:scale(0)} 100%{opacity:0; transform:scale(8)} }
        .click-ripple-el { position: absolute; width: 60px; height: 60px; border-radius: 9999px; pointer-events: none; animation: ripple 0.7s ease-out forwards; margin-left: -30px; margin-top: -30px; z-index: 5; }

        @keyframes scanBeam { 0%{transform:translateY(-100%); opacity:0.4} 50%{opacity:1} 100%{transform:translateY(250%); opacity:0.4} }
        .scan-beam { animation: scanBeam 1.5s ease-in-out infinite; }

        @keyframes tearStream { 0%{opacity:0; transform:translateY(-10px) scaleY(0.6)} 20%{opacity:1; transform:translateY(0) scaleY(1)} 100%{opacity:0; transform:translateY(80px) scaleY(1.2)} }
        .tear-stream { animation: tearStream 1.4s ease-in infinite; transform-origin: top center; transform-box: fill-box; }
        .tear-left { animation-delay: 0s; }
        .tear-right { animation-delay: 0.6s; }

        @keyframes zzzFloat { 0%{opacity:0; transform:translate(0,0) scale(0.7)} 50%{opacity:1} 100%{opacity:0; transform:translate(20px,-30px) scale(1.2)} }
        .zzz-floating text:nth-child(1) { animation: zzzFloat 2.4s ease-in-out infinite; animation-delay: 0s; }
        .zzz-floating text:nth-child(2) { animation: zzzFloat 2.4s ease-in-out infinite; animation-delay: 0.8s; }
        .zzz-floating text:nth-child(3) { animation: zzzFloat 2.4s ease-in-out infinite; animation-delay: 1.6s; }

        @keyframes thinkBubble { 0%{opacity:0; transform:translateY(20px) scale(0.5)} 100%{opacity:1; transform:translateY(0) scale(1)} }
        .think-bubble circle:nth-child(1),
        .think-bubble circle:nth-child(2),
        .think-bubble circle:nth-child(3),
        .think-bubble text { animation: thinkBubble 0.6s cubic-bezier(.34,1.56,.64,1) both; transform-origin: center; transform-box: fill-box; }
        .think-bubble circle:nth-child(2) { animation-delay: 0.15s; }
        .think-bubble circle:nth-child(3) { animation-delay: 0.3s; }
        .think-bubble text { animation-delay: 0.4s; }

        @keyframes angerMark { 0%,100%{opacity:1; transform:scale(1)} 50%{opacity:0.6; transform:scale(1.15)} }
        .anger-mark { animation: angerMark 0.4s ease-in-out infinite; transform-origin: 400px 90px; }

        @keyframes particleSparkle { 0%{opacity:0; transform:scale(0) rotate(0deg)} 50%{opacity:1; transform:scale(1.2) rotate(180deg)} 100%{opacity:0; transform:scale(0) rotate(360deg)} }
        .particle-sparkle { animation: particleSparkle 2.5s ease-in-out infinite; }
        @keyframes particleHeart { 0%{opacity:0; transform:translateY(20px) scale(0.4)} 20%{opacity:1} 100%{opacity:0; transform:translateY(-120px) scale(1.2)} }
        .particle-heart { animation: particleHeart 4s ease-out infinite; }
        @keyframes particleRain { 0%{opacity:0; transform:translateY(-40px)} 20%{opacity:0.9} 100%{opacity:0; transform:translateY(140px)} }
        .particle-rain { animation: particleRain 1.6s linear infinite; }
        @keyframes particleFlame { 0%{opacity:0; transform:translateY(20px) scale(0.6)} 40%{opacity:1} 100%{opacity:0; transform:translateY(-100px) scale(1.4)} }
        .particle-flame { animation: particleFlame 1.4s ease-out infinite; }
        @keyframes particleBurst { 0%{opacity:0; transform:scale(0) rotate(0deg)} 50%{opacity:1; transform:scale(1.3) rotate(90deg)} 100%{opacity:0; transform:scale(0.8) rotate(180deg)} }
        .particle-burst { animation: particleBurst 1.8s ease-out infinite; }
        @keyframes particleZzz { 0%{opacity:0; transform:translate(0,0) rotate(-12deg)} 30%{opacity:0.8} 100%{opacity:0; transform:translate(40px,-100px) rotate(6deg)} }
        .particle-zzz { animation: particleZzz 5s ease-out infinite; }
        @keyframes particleNeon { 0%,100%{opacity:0.3; transform:scale(0.8)} 50%{opacity:1; transform:scale(1.2)} }
        .particle-neon { animation: particleNeon 2s ease-in-out infinite; }
        @keyframes particleGear { 0%{transform:rotate(0deg); opacity:0.4} 100%{transform:rotate(360deg); opacity:0.4} }
        .particle-gear { animation: particleGear 6s linear infinite; }
        @keyframes particleDot { 0%,100%{opacity:0.2; transform:scale(0.7)} 50%{opacity:0.7; transform:scale(1.4)} }
        .particle-dot { animation: particleDot 3s ease-in-out infinite; }

        @keyframes shimmer { 0%,100%{background-position:0% 50%} 50%{background-position:100% 50%} }
        .shimmer-text { background: linear-gradient(110deg, currentColor 0%, currentColor 40%, rgba(255,255,255,0.7) 50%, currentColor 60%, currentColor 100%); background-size: 200% 100%; -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; animation: shimmer 4s ease-in-out infinite; }

        @keyframes statusPulse { 0%,100%{box-shadow:0 0 0 0 currentColor} 50%{box-shadow:0 0 0 8px rgba(255,255,255,0)} }
        .status-pulse { animation: statusPulse 1.5s ease-in-out infinite; }

        @keyframes slideInFromRight { 0%{opacity:0; transform:translateX(20px)} 100%{opacity:1; transform:translateX(0)} }
        .slide-in { animation: slideInFromRight 0.4s cubic-bezier(.34,1.56,.64,1) both; }

        @keyframes voiceWave { 0%,100%{transform:scaleY(0.4)} 50%{transform:scaleY(1)} }
        .voice-wave span { display: inline-block; width: 3px; height: 14px; background: currentColor; margin: 0 1px; border-radius: 2px; animation: voiceWave 0.7s ease-in-out infinite; transform-origin: center; }
        .voice-wave span:nth-child(2) { animation-delay: 0.1s; }
        .voice-wave span:nth-child(3) { animation-delay: 0.2s; }
        .voice-wave span:nth-child(4) { animation-delay: 0.15s; }

        @keyframes demoShimmer { 0%{background-position:0% 50%} 100%{background-position:300% 50%} }
        @keyframes demoBadge { 0%,100%{transform:scale(1) rotate(-2deg)} 50%{transform:scale(1.08) rotate(2deg)} }
        .demo-badge { animation: demoBadge 0.8s ease-in-out infinite; }
        @keyframes demoCountdown { 0%{stroke-dashoffset: 0} 100%{stroke-dashoffset: 226} }
        .demo-ring circle { animation: demoCountdown 15s linear forwards; }

        @keyframes drawerPop { 0%{opacity:0; transform:translateY(40px) scale(0.96)} 100%{opacity:1; transform:translateY(0) scale(1)} }
        .drawer-pop { animation: drawerPop 0.35s cubic-bezier(.34,1.56,.64,1) both; }

        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.2); border-radius: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
      `}</style>

      <div className="absolute inset-0 bg-mood" style={{ background: `radial-gradient(ellipse at 30% 35%, ${e.bg1} 0%, ${e.bg2} 55%, ${e.accent} 110%)` }} />
      <div className="absolute inset-0 pointer-events-none"
        style={{
          opacity: 0.08,
          backgroundImage: `linear-gradient(${e.eye} 1px, transparent 1px), linear-gradient(90deg, ${e.eye} 1px, transparent 1px)`,
          backgroundSize: '40px 40px',
        }} />
      <div className="absolute inset-0 pointer-events-none mix-blend-overlay"
        style={{
          opacity: 0.06,
          backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 200 200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noiseFilter\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.85\' numOctaves=\'2\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noiseFilter)\'/%3E%3C/svg%3E")',
        }} />
      <Particles kind={e.particle} accent={e.accent} key={`${current}-${pulse}`} />

      <div className="relative z-10 w-full h-full flex flex-col">
        <header className="flex-shrink-0 flex items-center justify-between px-3 md:px-6 lg:px-10 pt-3 md:pt-4 pb-2 gap-2">
          <div className="flex items-center gap-3">
            <div className="relative flex items-center justify-center w-10 h-10 md:w-12 md:h-12 rounded-2xl shadow-lg" style={{ background: e.accent }}>
              <div className="absolute inset-1 rounded-xl border-2" style={{ borderColor: e.bg1 }} />
              <span className="relative font-mono-d font-black text-lg md:text-xl" style={{ color: e.bg1 }}>R</span>
            </div>
            <div>
              <div className="flex items-baseline gap-2">
                <h1 className="font-display font-black text-xl md:text-2xl lg:text-3xl tracking-tight leading-none" style={{ color: e.eye }}>
                  ROBO<span style={{ color: e.accent }}>·</span>FACE
                </h1>
                <span className="font-mono-d text-[10px] font-bold tracking-widest opacity-50 hidden md:inline" style={{ color: e.eye }}>v8.0</span>
              </div>
              <p className="font-tc text-[11px] md:text-xs font-medium opacity-70 leading-tight" style={{ color: e.eye }}>
                AI 對話 · 視覺辨識 · 真人語音 · 程序化音效
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 md:gap-2 flex-wrap justify-end">
            {/* Competition run-through — 15s emotion loop */}
            <button
              onClick={startDemo}
              className="flex items-center gap-1.5 px-2.5 md:px-3 py-2 rounded-full backdrop-blur-md font-mono-d text-[10px] md:text-xs font-black tracking-wider transition-all hover:scale-105 active:scale-95 relative overflow-hidden"
              style={{
                background: demoRunning
                  ? `linear-gradient(90deg, #f59e0b, #ef4444, #ec4899, #8b5cf6, #3b82f6, #10b981, #f59e0b)`
                  : `linear-gradient(135deg, ${e.accent}, ${e.bg2})`,
                backgroundSize: demoRunning ? '300% 100%' : '100% 100%',
                color: '#fff',
                border: `1.5px solid ${demoRunning ? '#fff' : e.eye + '55'}`,
                boxShadow: demoRunning ? '0 0 20px rgba(255,255,255,0.5)' : `0 4px 14px ${e.accent}55`,
                animation: demoRunning ? 'demoShimmer 2s linear infinite' : 'none',
              }}
              title={demoRunning ? '點擊取消' : '15 秒自動巡演所有情緒'}
            >
              <span className={demoRunning ? 'spin-loader inline-block' : ''}>{demoRunning ? '⟳' : '▶'}</span>
              <span className="hidden md:inline">{demoRunning ? '巡演中' : '巡演'}</span>
            </button>

            {/* SFX toggle */}
            <button
              onClick={toggleSFX}
              className="flex items-center gap-1.5 px-2.5 md:px-3 py-2 rounded-full backdrop-blur-md font-mono-d text-[10px] md:text-xs font-black tracking-wider transition-all hover:scale-105 active:scale-95"
              style={{
                background: sfxEnabled ? e.accent : 'rgba(255,255,255,0.2)',
                color: sfxEnabled ? e.bg1 : e.eye,
                border: `1.5px solid ${e.eye}33`,
              }}
              title="音效開關"
            >
              <span>{sfxEnabled ? '🎵' : '🔕'}</span>
              <span className="hidden lg:inline">SFX</span>
            </button>

            {/* TTS toggle */}
            {ttsAvailable && (
              <div className="relative">
                <button
                  onClick={toggleTTS}
                  className="flex items-center gap-1.5 px-2.5 md:px-3 py-2 rounded-full backdrop-blur-md font-mono-d text-[10px] md:text-xs font-black tracking-wider transition-all hover:scale-105 active:scale-95 relative"
                  style={{
                    background: ttsLastError && ttsEnabled
                      ? '#ef4444'
                      : (ttsEnabled ? e.accent : 'rgba(255,255,255,0.2)'),
                    color: ttsLastError && ttsEnabled ? '#fff' : (ttsEnabled ? e.bg1 : e.eye),
                    border: `1.5px solid ${ttsLastError && ttsEnabled ? '#fff' : e.eye + '33'}`,
                    boxShadow: ttsLastError && ttsEnabled ? '0 0 0 2px rgba(239,68,68,0.3)' : 'none',
                  }}
                  title={ttsLastError ? `❗ ${ttsLastError}` : (ttsEnabled ? '關閉語音' : '開啟語音')}
                >
                  {isSpeaking && ttsEnabled ? (
                    <span className="voice-wave inline-flex items-center" style={{ color: e.bg1 }}>
                      <span /><span /><span /><span />
                    </span>
                  ) : (
                    <span>{ttsLastError && ttsEnabled ? '⚠' : (ttsEnabled ? '🔊' : '🔇')}</span>
                  )}
                  <span className="hidden lg:inline">VOICE</span>
                  <span
                    onClick={(ev) => { ev.stopPropagation(); setShowVoicePicker((v) => !v); }}
                    className="ml-1 px-1.5 py-0 rounded hover:opacity-70 text-[10px] font-black cursor-pointer flex items-center gap-1"
                    style={{ background: 'rgba(0,0,0,0.18)' }}
                    title="選擇聲音 / 測試"
                  >
                    <span>{voiceList.length}</span>
                    <span>▾</span>
                  </span>
                </button>

                {showVoicePicker && (
                  <div className="absolute top-full mt-2 right-0 rounded-2xl backdrop-blur-xl overflow-hidden z-50 slide-in"
                    style={{
                      background: `linear-gradient(180deg, ${e.bodyMain}f8, ${e.screen}ee)`,
                      border: `2px solid ${e.eye}44`,
                      boxShadow: `0 12px 40px rgba(0,0,0,0.25)`,
                      width: 320,
                      maxHeight: 480,
                    }}>
                    {/* Header */}
                    <div className="px-3 py-2.5 flex items-center justify-between gap-2" style={{ background: e.bg1, borderBottom: `1px solid ${e.eye}22` }}>
                      <div>
                        <div className="font-mono-d text-[10px] font-black tracking-[0.25em]" style={{ color: e.eye }}>
                          🎙️ 語音設定
                        </div>
                        <div className="font-mono-d text-[9px] font-bold opacity-60 mt-0.5" style={{ color: e.eye }}>
                          偵測 {voiceList.length} 個聲音 · {voiceList.filter((v) => v.lang.toLowerCase().startsWith('zh')).length} 個中文
                        </div>
                      </div>
                      <button onClick={() => setShowVoicePicker(false)}
                        className="font-mono-d text-[10px] font-black px-1.5 py-0.5 rounded hover:opacity-70"
                        style={{ background: `${e.eye}1f`, color: e.eye }}>✕</button>
                    </div>

                    {/* Big TEST button */}
                    <div className="px-3 py-2.5" style={{ borderBottom: `1px solid ${e.eye}22` }}>
                      <button
                        onClick={testCurrentVoice}
                        disabled={voiceList.length === 0}
                        className="w-full flex items-center justify-center gap-2 px-3 py-3 rounded-xl font-tc font-black text-base transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-40"
                        style={{
                          background: `linear-gradient(135deg, ${e.accent}, ${e.bodyDark})`,
                          color: '#fff',
                          boxShadow: `0 6px 18px ${e.accent}66`,
                        }}>
                        <span className={isSpeaking ? 'voice-wave inline-flex items-center' : ''}>
                          {isSpeaking ? <><span /><span /><span /><span /></> : '🔊'}
                        </span>
                        立即測試「哈囉，我是機器人！」
                      </button>
                      {ttsLastError && (
                        <div className="mt-2 px-2.5 py-1.5 rounded-lg font-tc text-[11px] font-bold flex items-start gap-1.5" style={{ background: '#fee2e2', color: '#991b1b', border: '1px solid #fecaca' }}>
                          <span>⚠️</span>
                          <span className="flex-1">{ttsLastError}</span>
                        </div>
                      )}
                      {!ttsLastError && ttsHasSpoken && (
                        <div className="mt-2 px-2.5 py-1 rounded-lg font-mono-d text-[10px] font-bold flex items-center gap-1.5" style={{ background: '#dcfce7', color: '#166534' }}>
                          <span>✓</span><span>語音播放正常</span>
                        </div>
                      )}
                      {voiceList.filter((v) => v.lang.toLowerCase().startsWith('zh')).length === 0 && voiceList.length > 0 && (
                        <div className="mt-2 px-2.5 py-1.5 rounded-lg font-tc text-[11px]" style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a' }}>
                          <div className="font-bold mb-1">⚠ 系統沒有中文語音</div>
                          <div className="opacity-80 leading-snug">Mac 用戶可至 系統設定→輔助使用→語音→管理語音→中文(台灣) 安裝「美佳」</div>
                        </div>
                      )}
                    </div>

                    {/* Voice list */}
                    {voiceList.length === 0 ? (
                      <div className="px-3 py-6 text-center font-tc text-sm font-bold opacity-60" style={{ color: e.eye }}>
                        <div className="text-2xl mb-2">🤔</div>
                        <div>找不到任何語音</div>
                        <div className="text-[11px] mt-1 opacity-70">您的瀏覽器可能不支援語音合成</div>
                      </div>
                    ) : (
                      <div className="overflow-y-auto" style={{ maxHeight: 280 }}>
                        {voiceList.map((v) => {
                          const selected = v.voiceURI === voiceURI;
                          const isZh = v.lang.toLowerCase().startsWith('zh');
                          return (
                            <button key={v.voiceURI}
                              onClick={() => {
                                setVoiceURI(v.voiceURI);
                                voiceURIRef.current = v.voiceURI;
                                testVoiceWith(v);
                              }}
                              className="w-full text-left px-3 py-2 transition-all hover:bg-black/10 flex items-center gap-2"
                              style={{
                                background: selected ? `${e.accent}33` : 'transparent',
                                borderLeft: selected ? `3px solid ${e.accent}` : '3px solid transparent',
                              }}>
                              <span className="text-base">{isZh ? '🇹🇼' : v.lang.startsWith('en') ? '🇺🇸' : v.lang.startsWith('ja') ? '🇯🇵' : v.lang.startsWith('ko') ? '🇰🇷' : '🌐'}</span>
                              <div className="flex-1 min-w-0">
                                <div className="font-tc font-bold text-xs truncate flex items-center gap-1" style={{ color: e.eye }}>
                                  {v.name}
                                  {isZh && <span className="text-[8px] px-1 py-0 rounded" style={{ background: e.accent, color: e.bg1 }}>推薦</span>}
                                </div>
                                <div className="font-mono-d text-[9px] opacity-60" style={{ color: e.eye }}>
                                  {v.lang} {v.localService ? '· local' : '· cloud'}
                                </div>
                              </div>
                              {selected && <span style={{ color: e.accent }}>✓</span>}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <button onClick={toggleCamera} disabled={cameraStatus === 'requesting-cam'}
              className="flex items-center gap-1.5 px-2.5 md:px-3 py-2 rounded-full backdrop-blur-md font-mono-d text-[10px] md:text-xs font-black tracking-wider transition-all hover:scale-105 active:scale-95 disabled:opacity-60"
              style={{
                background: cameraStatus === 'active' ? '#ef4444' : 'rgba(255,255,255,0.2)',
                color: cameraStatus === 'active' ? '#fff' : e.eye,
                border: `1.5px solid ${cameraStatus === 'active' ? '#ef4444' : e.eye + '33'}`,
                boxShadow: cameraStatus === 'active' ? '0 4px 14px rgba(239,68,68,0.55)' : 'none',
              }}
              title={cameraStatus === 'active' ? '關閉攝影機' : '開啟攝影機'}>
              {cameraStatus === 'requesting-cam' ? <span className="spin-loader inline-block">⟳</span> : <span>📹</span>}
              <span className="hidden lg:inline">{cameraStatus === 'active' ? 'ON' : cameraStatus === 'requesting-cam' ? '⋯' : 'CAM'}</span>
            </button>

            {cameraStatus === 'active' && (
              <button onClick={() => { sfx('ui-click'); setAutoMirror((v) => !v); }}
                className="flex items-center gap-1.5 px-2.5 md:px-3 py-2 rounded-full backdrop-blur-md font-mono-d text-[10px] md:text-xs font-black tracking-wider transition-all hover:scale-105 active:scale-95"
                style={{
                  background: autoMirror ? e.accent : 'rgba(255,255,255,0.2)',
                  color: autoMirror ? e.bg1 : e.eye,
                  border: `1.5px solid ${e.eye}33`,
                }}
                title="自動辨識並跟隨表情">
                <span>{autoMirror ? '🪞' : '⏸'}</span>
                <span className="hidden lg:inline">{autoMirror ? 'AUTO' : 'MAN'}</span>
              </button>
            )}

            {chatHistory.length > 0 && (
              <button onClick={() => { sfx('ui-click'); setShowLog((v) => !v); }}
                className="flex items-center gap-1.5 px-2.5 md:px-3 py-2 rounded-full backdrop-blur-md font-mono-d text-[10px] md:text-xs font-black tracking-wider transition-all hover:scale-105 active:scale-95"
                style={{
                  background: showLog ? e.accent : 'rgba(255,255,255,0.2)',
                  color: showLog ? e.bg1 : e.eye,
                  border: `1.5px solid ${e.eye}33`,
                }}
                title="對話紀錄">
                <span>📜</span>
                <span className="hidden lg:inline">{chatHistory.length}</span>
              </button>
            )}

            <div className="hidden md:flex items-center gap-2 px-2.5 py-2 rounded-full backdrop-blur-md font-mono-d text-[10px] md:text-xs font-bold tracking-wider"
              style={{ background: 'rgba(255,255,255,0.18)', color: e.eye, border: `1.5px solid ${e.eye}33` }}>
              <span className="status-pulse w-2 h-2 rounded-full inline-block" style={{ background: e.accent, color: e.accent }} />
              {isThinking ? 'THINKING' : isScanning ? 'SCANNING' : isSpeaking ? 'SPEAKING' : cameraStatus === 'active' ? 'WATCHING' : 'ONLINE'}
            </div>
            <div className="hidden md:flex items-center gap-1.5 px-2.5 py-2 rounded-full backdrop-blur-md font-mono-d text-[10px] font-black tracking-wider"
              style={{
                background: displayConnected ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.1)',
                color: displayConnected ? '#10b981' : `${e.eye}66`,
                border: `1.5px solid ${displayConnected ? 'rgba(16,185,129,0.4)' : `${e.eye}22`}`,
                transition: 'all 0.5s ease',
              }}
              title={bcConnected ? '已與主控 App 連線同步 (LAN WiFi)' : '等待主控端 WiFi 橋接'}>
              <span className="w-2 h-2 rounded-full inline-block" style={{ background: displayConnected ? '#10b981' : `${e.eye}44`, animation: displayConnected ? 'pulse 1.5s infinite' : 'none' }} />
              {bcConnected ? 'SYNCED' : localSyncActive ? 'LOCAL' : 'SOLO'}
            </div>
          </div>
        </header>

        <main className="rd-stage flex-1 relative min-h-0">
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full pointer-events-none"
            style={{
              width: '85vh', height: '85vh', maxWidth: '1000px', maxHeight: '1000px',
              background: `radial-gradient(circle, ${e.bg1}aa 0%, transparent 65%)`,
              filter: 'blur(28px)',
            }} />
          <svg className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
            style={{ width: '95vh', height: '95vh', maxWidth: '1100px', maxHeight: '1100px', opacity: 0.18 }}
            viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
            <circle cx="50" cy="50" r="46" fill="none" stroke={e.eye} strokeWidth="0.12" strokeDasharray="0.4 0.4" />
            <circle cx="50" cy="50" r="40" fill="none" stroke={e.eye} strokeWidth="0.12" strokeDasharray="1 0.6" />
            <circle cx="50" cy="50" r="32" fill="none" stroke={e.eye} strokeWidth="0.12" />
          </svg>

          <div className="absolute inset-0 flex items-center justify-center">
            <div ref={robotWrapperRef} onClick={handleRobotClick} role="button" aria-label="Robot" tabIndex={0}
              className="rd-robot-frame relative cursor-pointer focus:outline-none"
              style={{ aspectRatio: '480 / 540' }}>
              <Robot emotionKey={current} blinkOn={blinkOn} onPartClick={handlePartClick} />
              {clickRipple && (
                <span key={clickRipple.id} className="click-ripple-el"
                  style={{ left: clickRipple.x, top: clickRipple.y, background: `radial-gradient(circle, ${e.accent}, ${e.accent}00 70%)` }}
                  onAnimationEnd={() => setClickRipple(null)} />
              )}
            </div>
          </div>

          <div className="rd-speech-anchor absolute pointer-events-none">
            <SpeechBubble emotion={current} text={currentPhrase} version={speechVersion} isThinking={isThinking}
              usingDynamic={usingDynamic} phraseIdx={phraseIdx} totalPhrases={usingDynamic ? 0 : totalPhrases} />
          </div>

          <div className="rd-side-anchor absolute flex flex-col items-end gap-2">
            {showCam && (
              <WebcamPanel videoRef={videoRef} scanResult={scanResult} onClose={disableCamera} onManualScan={manualScan}
                theme={e} status={cameraStatus} statusText={cameraStatusText} isScanning={isScanning} mirrorEnabled={true} />
            )}
            <div className="hidden lg:flex flex-col items-end gap-2">
              <div className="font-mono-d text-[10px] font-black tracking-[0.3em] opacity-60" style={{ color: e.eye }}>HISTORY</div>
              <div className="flex flex-col gap-1.5 p-1.5 rounded-2xl backdrop-blur-md"
                style={{ background: 'rgba(0,0,0,0.12)', border: `1px solid ${e.eye}22` }}>
                {history.slice(0, 6).map((h, i) => {
                  const item = EMOTIONS[h];
                  return (
                    <div key={`${h}-${i}`}
                      className="w-7 h-7 md:w-8 md:h-8 rounded-lg flex items-center justify-center font-mono-d text-sm font-black"
                      style={{ background: item.accent, color: item.bg1, opacity: 1 - i * 0.13, boxShadow: `0 2px 6px ${item.accent}55` }}
                      title={item.label}>
                      {item.symbol}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {showLog && (
            <div className="rd-chat-log absolute slide-in">
              <div className="rounded-3xl backdrop-blur-xl overflow-hidden flex flex-col"
                style={{
                  background: `linear-gradient(180deg, ${e.bodyMain}f0, ${e.screen}d8)`,
                  border: `2px solid ${e.eye}33`,
                  boxShadow: `0 20px 60px ${e.accent}55`,
                  maxHeight: '50vh',
                }}>
                <div className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0" style={{ borderColor: `${e.eye}33` }}>
                  <div className="font-mono-d text-xs font-black tracking-[0.3em]" style={{ color: e.eye }}>📜 CHAT LOG</div>
                  <button onClick={() => { setChatHistory([]); setShowLog(false); }}
                    className="font-mono-d text-[9px] font-bold tracking-wider px-2 py-1 rounded-md hover:opacity-70"
                    style={{ background: `${e.eye}1a`, color: e.eye }}>CLEAR</button>
                </div>
                <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5">
                  {chatHistory.map((msg, i) => {
                    if (msg.role === 'user') {
                      return (
                        <div key={i} className="flex justify-end">
                          <div className="max-w-[85%] rounded-2xl px-3.5 py-2 font-tc text-sm font-medium"
                            style={{ background: e.accent, color: e.bg1, borderRadius: '18px 18px 4px 18px' }}>
                            {msg.content}
                          </div>
                        </div>
                      );
                    }
                    const item = EMOTIONS[msg.emotion] || e;
                    return (
                      <div key={i} className="flex justify-start gap-2 items-end">
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center font-mono-d text-sm font-black flex-shrink-0"
                          style={{ background: item.accent, color: item.bg1 }}>{item.symbol}</div>
                        <div className="max-w-[85%] rounded-2xl px-3.5 py-2 font-tc text-sm font-medium"
                          style={{ background: 'rgba(255,255,255,0.7)', color: e.eye, borderRadius: '18px 18px 18px 4px', border: `1.5px solid ${item.eye}22` }}>
                          {msg.message || msg.content}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </main>

        <footer className="flex-shrink-0 px-3 md:px-6 lg:px-10 pb-3 md:pb-4 pt-2 space-y-2" style={{ zIndex: 30 }}>
          <ChatInput value={chatInput} onChange={setChatInput} onSubmit={sendMessage} disabled={isThinking} theme={e} isThinking={isThinking} />
        </footer>
      </div>
    </div>
  );
}
