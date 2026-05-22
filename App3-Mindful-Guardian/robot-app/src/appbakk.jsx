// import React, { useState, useEffect, useRef, useCallback } from 'react';
// import {
//   Camera, Mic, MicOff, Wifi, Activity, Sparkles, ScanLine, Brain,
//   ChevronUp, X, Settings, Info, Zap, Shield, TrendingUp,
//   Volume2, VolumeX, Hand, MessageCircle, PlayCircle, Pause,
//   Loader2, AlertCircle, RefreshCw, MapPin, Bot
// } from 'lucide-react';

// /* ════════════════════════════════════════════════════════════════
//    情緒資料庫
//    ════════════════════════════════════════════════════════════════ */
// const EMOTIONS = {
//   happy: {
//     zh: '愉悅', en: 'Happy', short: 'HAPPY',
//     color: '#F59E0B', light: '#FEF3C7', glow: 'rgba(245,158,11,0.45)',
//     eyes: 'happy', mouth: 'smile', cheek: true,
//     stress: 14, stability: 92, focus: 88,
//     response: '看到你心情很好，繼續保持這份能量！今天也是美好的一天。',
//     advice: '這是進入心流的最佳狀態，把握時機完成有挑戰性的任務。'
//   },
//   calm: {
//     zh: '平靜', en: 'Calm', short: 'CALM',
//     color: '#14B8A6', light: '#CCFBF1', glow: 'rgba(20,184,166,0.4)',
//     eyes: 'soft', mouth: 'gentle', cheek: false,
//     stress: 22, stability: 88, focus: 75,
//     response: '你的狀態很平和，這是專注學習的最佳時機。',
//     advice: '心率變異穩定，適合進行需要思考的閱讀或寫作。'
//   },
//   focused: {
//     zh: '專注', en: 'Focused', short: 'FOCUS',
//     color: '#0EA5E9', light: '#E0F2FE', glow: 'rgba(14,165,233,0.4)',
//     eyes: 'focused', mouth: 'neutral', cheek: false,
//     stress: 38, stability: 78, focus: 96,
//     response: '專注力指數爆表！記得每 25 分鐘讓眼睛休息 20 秒。',
//     advice: '視線停留時間 12.4 秒，建議搭配 20-20-20 護眼法則。'
//   },
//   anxious: {
//     zh: '焦慮', en: 'Anxious', short: 'ANXIOUS',
//     color: '#F97316', light: '#FFEDD5', glow: 'rgba(249,115,22,0.45)',
//     eyes: 'worried', mouth: 'worried', cheek: false,
//     stress: 74, stability: 45, focus: 42,
//     response: '感覺到你有些焦慮，試試和我一起深呼吸三次？吸氣四秒，吐氣六秒。',
//     advice: '建議先離開壓力源 5 分鐘，到走廊散步或喝口水。'
//   },
//   sad: {
//     zh: '低落', en: 'Sad', short: 'SAD',
//     color: '#6366F1', light: '#E0E7FF', glow: 'rgba(99,102,241,0.4)',
//     eyes: 'sad', mouth: 'sad', cheek: false,
//     stress: 62, stability: 52, focus: 38,
//     response: '今天好像有點不開心？告訴老師、家人或我都可以，你不孤單。',
//     advice: '已通知班導師（已加密保護隱私），輔導室隨時為你開放。'
//   },
//   stressed: {
//     zh: '緊張', en: 'Stressed', short: 'STRESS',
//     color: '#EF4444', light: '#FEE2E2', glow: 'rgba(239,68,68,0.5)',
//     eyes: 'tense', mouth: 'tense', cheek: false,
//     stress: 89, stability: 28, focus: 30,
//     response: '偵測到較高壓力指數，建議起身走動或找輔導老師聊聊。',
//     advice: '已觸發高優先警示，輔導老師將於 5 分鐘內主動關懷。'
//   }
// };

// /* ════════════════════════════════════════════════════════════════
//    自我介紹腳本（國小組程度，總長約 15 秒）
//    ════════════════════════════════════════════════════════════════ */
// const INTRO_SCRIPT = [
//   { text: '嗨！大家好！我是情緒小幫手！', emotion: 'happy' },
//   { text: '我會看你的表情，聽你的聲音，知道你今天開不開心！', emotion: 'focused' },
//   { text: '心情不好的時候，我會請老師來陪你喔！', emotion: 'sad' },
//   { text: '我們一起做好朋友吧！', emotion: 'happy' }
// ];

// const ZONE_TONES = {
//   low: {
//     label: '安全',
//     color: '#10B981',
//     light: '#D1FAE5',
//     glow: 'rgba(16,185,129,0.42)',
//   },
//   medium: {
//     label: '注意',
//     color: '#F59E0B',
//     light: '#FEF3C7',
//     glow: 'rgba(245,158,11,0.45)',
//   },
//   high: {
//     label: '高風險',
//     color: '#F43F5E',
//     light: '#FFE4E6',
//     glow: 'rgba(244,63,94,0.5)',
//   },
// };

// const normalizeZoneRisk = (riskLevel) => (
//   riskLevel === 'high' || riskLevel === 'medium' || riskLevel === 'low' ? riskLevel : 'low'
// );

// const ROBOT_HOME_ASSIGNMENT = {
//   zoneId: 'robot-home',
//   zoneName: '巡邏底盤',
//   location: '中控待命點',
//   riskLevel: 'low',
//   statusLabel: '待命',
//   stage: '等待指派',
//   missionId: null,
//   active: false,
//   updatedAt: '',
// };

// const getMovementTiming = (route) => {
//   if (!route) {
//     return {durationStyle: '5000ms', delayStyle: '0ms', remainingMs: 5000};
//   }
//   const totalMs = Math.max(800, Number(route.totalMs) || 5000);
//   const remainingMs = Math.max(0, Math.min(totalMs, Number(route.durationMs) || totalMs));
//   const elapsedMs = Math.max(0, totalMs - remainingMs);
//   return {
//     durationStyle: `${totalMs}ms`,
//     delayStyle: elapsedMs > 0 ? `-${elapsedMs}ms` : '0ms',
//     remainingMs,
//   };
// };

// const EMOTION_ALERTS = {
//   sad: {riskLevel: 'medium', label: '低落', description: '機器人情緒判斷偵測到學生可能低落或難過。'},
//   anxious: {riskLevel: 'medium', label: '焦慮', description: '機器人情緒判斷偵測到學生可能焦慮或不安。'},
//   stressed: {riskLevel: 'high', label: '緊張/生氣', description: '機器人情緒判斷偵測到強烈壓力、生氣或需要立即關懷的表現。'},
// };

// const defaultBridgeHost = () => {
//   if (typeof window === 'undefined') return 'localhost:3203';
//   return `${window.location.hostname || 'localhost'}:3203`;
// };

// const bridgeHttpBase = (input) => {
//   try {
//     const raw = input || defaultBridgeHost();
//     const url = new URL(raw.includes('://') ? raw : `http://${raw}`);
//     url.protocol = 'http:';
//     url.pathname = '';
//     url.search = '';
//     url.hash = '';
//     return url.origin;
//   } catch {
//     return 'http://localhost:3203';
//   }
// };

// const bridgeWsUrl = (input) => {
//   try {
//     const raw = input || defaultBridgeHost();
//     const url = new URL(raw.includes('://') ? raw : `ws://${raw}`);
//     url.protocol = url.protocol === 'wss:' || url.protocol === 'https:' ? 'wss:' : 'ws:';
//     url.pathname = '/display';
//     url.search = '';
//     url.hash = '';
//     return url.toString();
//   } catch {
//     return 'ws://localhost:3203/display';
//   }
// };

// /* ════════════════════════════════════════════════════════════════
//    機器人音效引擎（Web Audio API · 純合成，無外部檔案）
//    ════════════════════════════════════════════════════════════════ */
// const audio = (() => {
//   let ctx = null;
//   let ready = false;
//   let muted = false;

//   const unlock = () => {
//     if (ready) return;
//     try {
//       if (!ctx) {
//         const Ctx = window.AudioContext || window.webkitAudioContext;
//         if (!Ctx) return;
//         ctx = new Ctx();
//       }
//       if (ctx.state === 'suspended') ctx.resume();
//       ready = true;
//     } catch (e) { /* silent */ }
//   };

//   // 單音 — freq Hz / duration 秒 / delay 秒 / 波形 / 音量
//   const tone = (freq, duration = 0.1, delay = 0, type = 'square', gain = 0.14) => {
//     if (!ready || !ctx || muted) return;
//     const now = ctx.currentTime + delay;
//     const osc = ctx.createOscillator();
//     const env = ctx.createGain();
//     osc.type = type;
//     osc.frequency.setValueAtTime(freq, now);
//     env.gain.setValueAtTime(0, now);
//     env.gain.linearRampToValueAtTime(gain, now + 0.008);
//     env.gain.exponentialRampToValueAtTime(0.0001, now + duration);
//     osc.connect(env).connect(ctx.destination);
//     osc.start(now);
//     osc.stop(now + duration + 0.05);
//   };

//   // 音高滑動（pitch sweep）— 適合「掃描」音
//   const sweep = (fromFreq, toFreq, duration = 0.3, delay = 0, type = 'sawtooth', gain = 0.1) => {
//     if (!ready || !ctx || muted) return;
//     const now = ctx.currentTime + delay;
//     const osc = ctx.createOscillator();
//     const env = ctx.createGain();
//     osc.type = type;
//     osc.frequency.setValueAtTime(fromFreq, now);
//     osc.frequency.exponentialRampToValueAtTime(Math.max(20, toFreq), now + duration);
//     env.gain.setValueAtTime(0, now);
//     env.gain.linearRampToValueAtTime(gain, now + 0.02);
//     env.gain.exponentialRampToValueAtTime(0.0001, now + duration);
//     osc.connect(env).connect(ctx.destination);
//     osc.start(now);
//     osc.stop(now + duration + 0.05);
//   };

//   const play = (name) => {
//     if (!ready || muted) return;
//     switch (name) {
//       case 'tap': {
//         // 隨機可愛 boop（R2D2 風）
//         const freqs = [659, 784, 880, 988, 1047];
//         const pick = freqs[Math.floor(Math.random() * freqs.length)];
//         tone(pick, 0.08, 0, 'square', 0.12);
//         break;
//       }
//       case 'cute': {
//         // 三連音可愛叫聲
//         const notes = [659, 784, 880, 988, 1047, 1175];
//         for (let i = 0; i < 3; i++) {
//           const f = notes[Math.floor(Math.random() * notes.length)];
//           tone(f, 0.05, i * 0.07, 'square', 0.1);
//         }
//         break;
//       }
//       case 'scanStart': {
//         sweep(400, 1200, 0.45, 0, 'sawtooth', 0.08);
//         tone(523, 0.08, 0, 'triangle', 0.15);
//         tone(784, 0.08, 0.15, 'triangle', 0.15);
//         tone(1047, 0.12, 0.3, 'triangle', 0.18);
//         break;
//       }
//       case 'scanComplete': {
//         // 完成 ding-dong
//         tone(784, 0.12, 0, 'triangle', 0.18);
//         tone(1047, 0.18, 0.13, 'triangle', 0.2);
//         tone(1568, 0.25, 0.28, 'sine', 0.12);
//         break;
//       }
//       case 'listenStart': {
//         // 「我在聽」雙音
//         tone(587, 0.06, 0, 'sine', 0.13);
//         tone(880, 0.1, 0.07, 'sine', 0.13);
//         break;
//       }
//       case 'listenStop': {
//         // 「停止聆聽」單音
//         tone(659, 0.1, 0, 'sine', 0.12);
//         break;
//       }
//       case 'sparkle': {
//         // 情緒切換閃光音
//         tone(1568, 0.06, 0, 'sine', 0.09);
//         tone(2093, 0.08, 0.06, 'sine', 0.09);
//         tone(2637, 0.12, 0.13, 'sine', 0.08);
//         break;
//       }
//       case 'introStart': {
//         // 開機啟動旋律
//         tone(523, 0.1, 0, 'triangle', 0.15);
//         tone(659, 0.1, 0.13, 'triangle', 0.15);
//         tone(784, 0.1, 0.26, 'triangle', 0.15);
//         tone(1047, 0.25, 0.39, 'triangle', 0.18);
//         tone(1568, 0.15, 0.55, 'sine', 0.1);
//         break;
//       }
//       case 'speak': {
//         // 說話前的可愛 R2D2 chirp（3 短音）
//         const opts = [
//           [880, 659, 988],
//           [988, 784, 1047],
//           [784, 587, 880],
//           [1047, 880, 1175]
//         ];
//         const seq = opts[Math.floor(Math.random() * opts.length)];
//         tone(seq[0], 0.04, 0, 'square', 0.08);
//         tone(seq[1], 0.04, 0.05, 'square', 0.08);
//         tone(seq[2], 0.05, 0.1, 'square', 0.08);
//         break;
//       }
//       case 'error': {
//         // 錯誤下行音
//         tone(440, 0.1, 0, 'square', 0.1);
//         tone(330, 0.18, 0.12, 'square', 0.1);
//         break;
//       }
//       case 'drawerOpen': {
//         // 抽屜開啟微音
//         tone(1175, 0.05, 0, 'sine', 0.06);
//         tone(1568, 0.07, 0.04, 'sine', 0.06);
//         break;
//       }
//       case 'wakeup': {
//         // 喚醒 / 開場 — 開機問候
//         tone(523, 0.08, 0, 'triangle', 0.13);
//         tone(784, 0.08, 0.1, 'triangle', 0.13);
//         tone(1047, 0.18, 0.2, 'triangle', 0.16);
//         break;
//       }
//     }
//   };

//   const setMuted = (m) => { muted = m; };
//   const isReady = () => ready;
//   const isMuted = () => muted;

//   return { unlock, play, setMuted, isReady, isMuted };
// })();

// /* ════════════════════════════════════════════════════════════════
//    語音輸入關鍵字 → 情緒對應
//    ════════════════════════════════════════════════════════════════ */
// const matchEmotion = (text) => {
//   const t = text.toLowerCase();
//   if (/(難過|不開心|低落|傷心|哭|沮喪|不好|想哭)/.test(t))
//     return { emotion: 'sad', response: '聽起來你今天心情有點低落。沒關係，把感受說出來就好，我會陪著你。需要我幫你聯絡輔導老師嗎？' };
//   if (/(緊張|壓力|焦慮|害怕|擔心|煩|焦躁|不安)/.test(t))
//     return { emotion: 'anxious', response: '感覺到你壓力很大。試試和我一起深呼吸？吸氣四秒，吐氣六秒，做三次看看。' };
//   if (/(生氣|氣|火大|討厭|憤怒|煩死)/.test(t))
//     return { emotion: 'stressed', response: '你看起來有些生氣。先深呼吸，告訴我發生了什麼事？我會聽你說。' };
//   if (/(開心|快樂|好棒|高興|讚|爽|喜歡|愛)/.test(t))
//     return { emotion: 'happy', response: '聽到你心情這麼好，我也很開心！要繼續保持喔。' };
//   if (/(專心|認真|讀書|考試)/.test(t))
//     return { emotion: 'focused', response: '感覺得到你正在認真學習，加油！記得每二十五分鐘休息一下眼睛。' };
//   if (/(平靜|平常|還好|普通|放鬆)/.test(t))
//     return { emotion: 'calm', response: '平靜也是很棒的狀態，這是學習與思考的好時機。' };
//   if (/(累|疲倦|困|想睡)/.test(t))
//     return { emotion: 'sad', response: '聽起來你很累了。記得適時休息，要不要喝口水或閉眼休息一下？' };
//   if (/(你好|嗨|哈囉|hello|hi)/i.test(t))
//     return { emotion: 'happy', response: '哈囉！我是你的情緒守護機器人，今天過得怎麼樣？' };
//   if (/(謝謝|感謝|thanks)/.test(t))
//     return { emotion: 'happy', response: '不客氣！能幫到你是我的榮幸。' };
//   if (/(再見|掰|bye)/i.test(t))
//     return { emotion: 'happy', response: '再見！記得我隨時都在這裡，有需要就回來找我。' };
//   if (/(你是誰|介紹|你是什麼|介紹你)/.test(t))
//     return { emotion: 'happy', response: '__INTRO__' };
//   return { emotion: null, response: `我聽到你說「${text}」了。可以告訴我更多現在的心情嗎？` };
// };

// /* ════════════════════════════════════════════════════════════════
//    表情零件
//    ════════════════════════════════════════════════════════════════ */
// const EyeShape = ({ state, side }) => {
//   const flip = side === 'right' ? 'scale(-1 1) translate(-16 0)' : '';
//   const inner = (() => {
//     if (state === 'blink') return <line x1="-1" y1="9" x2="17" y2="9" strokeWidth="3.5" strokeLinecap="round" />;
//     switch (state) {
//       case 'happy': return <path d="M 0 12 Q 8 0 16 12" strokeWidth="3.4" strokeLinecap="round" fill="none" />;
//       case 'soft': return <ellipse cx="8" cy="9" rx="3.4" ry="4.4" />;
//       case 'focused': return <g><circle cx="8" cy="9" r="5.6" fill="none" strokeWidth="2" /><circle cx="8" cy="9" r="2.6" /></g>;
//       case 'worried': return <g><path d="M -1 4 L 17 7" strokeWidth="2.4" strokeLinecap="round" fill="none" /><ellipse cx="8" cy="11" rx="3.2" ry="3" /></g>;
//       case 'sad': return <g><path d="M -1 1 L 17 7" strokeWidth="2.4" strokeLinecap="round" fill="none" /><ellipse cx="8" cy="12" rx="3.2" ry="2.4" /></g>;
//       case 'tense': return <g><path d="M 0 5 L 7 3 L 16 6" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" fill="none" /><circle cx="8" cy="11" r="2.8" /></g>;
//       default: return <circle cx="8" cy="9" r="3.4" />;
//     }
//   })();
//   return <g transform={flip} stroke="currentColor" fill="currentColor">{inner}</g>;
// };

// const MouthShape = ({ state }) => {
//   switch (state) {
//     case 'talking':
//       return (
//         <ellipse cx="20" cy="6" rx="9" ry="3" stroke="none">
//           <animate attributeName="ry" values="2;6;3;5;2;4;2" dur="0.55s" repeatCount="indefinite" />
//           <animate attributeName="rx" values="9;7;10;8;9;7;9" dur="0.55s" repeatCount="indefinite" />
//         </ellipse>
//       );
//     case 'listening':
//       return (
//         <g>
//           <circle cx="14" cy="6" r="2" fill="currentColor">
//             <animate attributeName="r" values="1.5;3;1.5" dur="0.6s" repeatCount="indefinite" />
//           </circle>
//           <circle cx="20" cy="6" r="2.5" fill="currentColor">
//             <animate attributeName="r" values="2;3.5;2" dur="0.6s" begin="0.2s" repeatCount="indefinite" />
//           </circle>
//           <circle cx="26" cy="6" r="2" fill="currentColor">
//             <animate attributeName="r" values="1.5;3;1.5" dur="0.6s" begin="0.4s" repeatCount="indefinite" />
//           </circle>
//         </g>
//       );
//     case 'smile': return <path d="M 4 4 Q 20 18 36 4" strokeWidth="3" strokeLinecap="round" fill="none" />;
//     case 'gentle': return <path d="M 8 4 Q 20 11 32 4" strokeWidth="2.6" strokeLinecap="round" fill="none" />;
//     case 'neutral': return <line x1="10" y1="6" x2="30" y2="6" strokeWidth="2.6" strokeLinecap="round" />;
//     case 'worried': return <path d="M 6 8 Q 13 3 20 8 Q 27 13 34 6" strokeWidth="2.6" strokeLinecap="round" fill="none" />;
//     case 'sad': return <path d="M 6 10 Q 20 -2 34 10" strokeWidth="2.6" strokeLinecap="round" fill="none" />;
//     case 'tense': return <path d="M 6 6 L 11 9 L 16 4 L 21 9 L 26 4 L 31 9 L 34 6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />;
//     default: return null;
//   }
// };

// /* ════════════════════════════════════════════════════════════════
//    主機器人 — 加上 talking / listening 嘴形
//    ════════════════════════════════════════════════════════════════ */
// const Robot = ({ emotion, scanning, eyeOffset, blinking, pressed, onTap, talking, listening }) => {
//   const e = EMOTIONS[emotion];
//   const eyeState = blinking ? 'blink' : e.eyes;
//   const mouthState = talking ? 'talking' : (listening ? 'listening' : e.mouth);

//   return (
//     <svg
//       viewBox="0 0 360 460"
//       className="w-full h-full select-none"
//       onClick={onTap}
//       style={{
//         cursor: 'pointer',
//         filter: 'drop-shadow(0 30px 40px rgba(0,0,0,0.18))',
//         transform: pressed ? 'scale(0.97)' : 'scale(1)',
//         transition: 'transform 200ms cubic-bezier(.34,1.56,.64,1)'
//       }}
//     >
//       <defs>
//         <linearGradient id="body-grad" x1="0" y1="0" x2="0" y2="1">
//           <stop offset="0%" stopColor="#FCFCFD" /><stop offset="55%" stopColor="#F1F2F4" /><stop offset="100%" stopColor="#D6D8DC" />
//         </linearGradient>
//         <linearGradient id="metal-grad" x1="0" y1="0" x2="0" y2="1">
//           <stop offset="0%" stopColor="#9CA3AF" /><stop offset="100%" stopColor="#4B5563" />
//         </linearGradient>
//         <linearGradient id="screen-bg" x1="0" y1="0" x2="0" y2="1">
//           <stop offset="0%" stopColor="#0F172A" /><stop offset="100%" stopColor="#1E293B" />
//         </linearGradient>
//         <radialGradient id="screen-glow" cx="50%" cy="50%" r="60%">
//           <stop offset="0%" stopColor={e.color} stopOpacity="0.4" />
//           <stop offset="100%" stopColor={e.color} stopOpacity="0" />
//         </radialGradient>
//         <radialGradient id="led-glow">
//           <stop offset="0%" stopColor={e.color} stopOpacity="0.95" />
//           <stop offset="100%" stopColor={e.color} stopOpacity="0" />
//         </radialGradient>
//         <filter id="soft-shadow" x="-20%" y="-20%" width="140%" height="140%">
//           <feGaussianBlur in="SourceAlpha" stdDeviation="3" />
//           <feOffset dx="0" dy="2" />
//           <feComponentTransfer><feFuncA type="linear" slope="0.25" /></feComponentTransfer>
//           <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
//         </filter>
//         <pattern id="grid-pat" width="14" height="14" patternUnits="userSpaceOnUse">
//           <path d="M 14 0 L 0 0 0 14" fill="none" stroke={e.color} strokeWidth="0.4" opacity="0.3" />
//         </pattern>
//       </defs>

//       <ellipse cx="180" cy="438" rx="118" ry="10" fill="#000" opacity="0.13" />

//       <g className="robot-float">
//         {/* 天線 */}
//         <line x1="180" y1="38" x2="180" y2="74" stroke="url(#metal-grad)" strokeWidth="3.5" strokeLinecap="round" />
//         <circle cx="180" cy="34" r="16" fill="url(#led-glow)" />
//         <circle cx="180" cy="34" r="6" fill={listening ? '#06B6D4' : e.color}>
//           <animate attributeName="opacity" values="0.6;1;0.6" dur={listening ? '0.7s' : '1.6s'} repeatCount="indefinite" />
//         </circle>

//         {/* 頭 */}
//         <rect x="85" y="68" width="190" height="155" rx="42" fill="url(#body-grad)" stroke="#B7BCC4" strokeWidth="1.5" filter="url(#soft-shadow)" />

//         {/* 側邊感測模組 */}
//         <g>
//           <rect x="72" y="125" width="16" height="36" rx="7" fill="url(#metal-grad)" />
//           <circle cx="80" cy="135" r="2.5" fill={e.color} />
//           <circle cx="80" cy="143" r="2.5" fill="#10B981" />
//           <circle cx="80" cy="151" r="2.5" fill={listening ? '#06B6D4' : '#0EA5E9'}>
//             {listening && <animate attributeName="opacity" values="0.3;1;0.3" dur="0.5s" repeatCount="indefinite" />}
//           </circle>
//         </g>
//         <g>
//           <rect x="272" y="125" width="16" height="36" rx="7" fill="url(#metal-grad)" />
//           <circle cx="280" cy="135" r="2.5" fill={e.color} />
//           <circle cx="280" cy="143" r="2.5" fill="#10B981" />
//           <circle cx="280" cy="151" r="2.5" fill={listening ? '#06B6D4' : '#0EA5E9'}>
//             {listening && <animate attributeName="opacity" values="0.3;1;0.3" dur="0.5s" repeatCount="indefinite" />}
//           </circle>
//         </g>

//         {/* 螢幕臉部 */}
//         <rect x="105" y="88" width="150" height="115" rx="22" fill="url(#screen-bg)" />
//         <rect x="105" y="88" width="150" height="115" rx="22" fill="url(#screen-glow)" />
//         <rect x="115" y="98" width="55" height="6" rx="3" fill="white" opacity="0.12" />

//         {/* 眼睛 */}
//         <g style={{ color: e.color, transition: 'all 600ms cubic-bezier(.34,1.56,.64,1)' }}>
//           <g
//             transform={`translate(${132 + eyeOffset.x} ${130 + eyeOffset.y})`}
//             style={{ transition: 'transform 200ms cubic-bezier(.4,.2,.2,1)' }}
//           >
//             <EyeShape state={eyeState} side="left" />
//           </g>
//           <g
//             transform={`translate(${212 + eyeOffset.x} ${130 + eyeOffset.y})`}
//             style={{ transition: 'transform 200ms cubic-bezier(.4,.2,.2,1)' }}
//           >
//             <EyeShape state={eyeState} side="right" />
//           </g>
//         </g>

//         {/* 嘴巴 */}
//         <g transform="translate(160 168)" style={{ color: e.color, transition: 'all 600ms cubic-bezier(.34,1.56,.64,1)' }}>
//           <g stroke="currentColor" fill="currentColor"><MouthShape state={mouthState} /></g>
//         </g>

//         {/* 紅暈 */}
//         {e.cheek && !blinking && (
//           <g>
//             <ellipse cx="125" cy="160" rx="9" ry="4" fill="#FB7185" opacity="0.55" />
//             <ellipse cx="235" cy="160" rx="9" ry="4" fill="#FB7185" opacity="0.55" />
//           </g>
//         )}

//         {/* 掃描動畫 */}
//         {scanning && (
//           <g>
//             <rect x="105" y="88" width="150" height="115" rx="22" fill="#06B6D4" opacity="0.18" />
//             <rect x="105" y="88" width="150" height="115" rx="22" fill="url(#grid-pat)" />
//             <line x1="105" y1="100" x2="255" y2="100" stroke="#06B6D4" strokeWidth="2.5" opacity="0.9">
//               <animate attributeName="y1" values="95;195;95" dur="2s" repeatCount="indefinite" />
//               <animate attributeName="y2" values="95;195;95" dur="2s" repeatCount="indefinite" />
//             </line>
//             <text x="180" y="200" textAnchor="middle" fill="#06B6D4" fontSize="9" fontFamily="ui-monospace, monospace" letterSpacing="2">
//               ANALYZING
//               <animate attributeName="opacity" values="0.4;1;0.4" dur="1s" repeatCount="indefinite" />
//             </text>
//           </g>
//         )}

//         {/* 攝影鏡頭 */}
//         <g>
//           <circle cx="180" cy="223" r="13" fill="#1F2937" />
//           <circle cx="180" cy="223" r="9" fill={scanning ? '#EF4444' : (listening ? '#06B6D4' : '#06B6D4')} />
//           <circle cx="180" cy="223" r="4" fill="white" opacity="0.85" />
//           {scanning && (
//             <circle cx="180" cy="223" r="13" fill="none" stroke="#EF4444" strokeWidth="2">
//               <animate attributeName="r" values="13;22;13" dur="1.4s" repeatCount="indefinite" />
//               <animate attributeName="opacity" values="1;0;1" dur="1.4s" repeatCount="indefinite" />
//             </circle>
//           )}
//         </g>

//         {/* 頸部 */}
//         <rect x="155" y="223" width="50" height="22" fill="url(#metal-grad)" />
//         <rect x="155" y="223" width="50" height="6" fill="#374151" opacity="0.4" />

//         {/* 機械臂 */}
//         <g>
//           <rect x="48" y="252" width="22" height="65" rx="11" fill="url(#body-grad)" stroke="#B7BCC4" strokeWidth="1.2" />
//           <rect x="54" y="266" width="10" height="3" fill="#9CA3AF" />
//           <rect x="54" y="280" width="10" height="3" fill="#9CA3AF" />
//           <circle cx="59" cy="324" r="13" fill="url(#body-grad)" stroke="#B7BCC4" strokeWidth="1.2" />
//           <circle cx="59" cy="324" r="6" fill={e.color} opacity="0.75" />
//         </g>
//         <g>
//           <rect x="290" y="252" width="22" height="65" rx="11" fill="url(#body-grad)" stroke="#B7BCC4" strokeWidth="1.2" />
//           <rect x="296" y="266" width="10" height="3" fill="#9CA3AF" />
//           <rect x="296" y="280" width="10" height="3" fill="#9CA3AF" />
//           <circle cx="301" cy="324" r="13" fill="url(#body-grad)" stroke="#B7BCC4" strokeWidth="1.2" />
//           <circle cx="301" cy="324" r="6" fill={e.color} opacity="0.75" />
//         </g>

//         {/* 身體 */}
//         <rect x="75" y="245" width="210" height="135" rx="22" fill="url(#body-grad)" stroke="#B7BCC4" strokeWidth="1.5" filter="url(#soft-shadow)" />

//         {/* 胸前螢幕 */}
//         <rect x="98" y="265" width="164" height="74" rx="10" fill="url(#screen-bg)" />
//         <rect x="98" y="265" width="164" height="74" rx="10" fill="url(#screen-glow)" opacity="0.6" />
//         <text x="108" y="280" fill={e.color} fontSize="8" fontFamily="ui-monospace, monospace" fontWeight="bold" letterSpacing="1.2">
//           {listening ? 'VOICE.LISTEN' : (talking ? 'VOICE.SPEAK' : 'EMOTION.SCAN')}
//         </text>
//         <circle cx="252" cy="277" r="2.4" fill="#10B981">
//           <animate attributeName="opacity" values="0.3;1;0.3" dur="1.2s" repeatCount="indefinite" />
//         </circle>
//         <polyline
//           fill="none" stroke={e.color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"
//           points={(scanning || talking || listening)
//             ? '108,308 116,300 124,316 132,294 140,318 148,302 156,310 164,296 172,314 180,300 188,316 196,294 204,310 212,302 220,316 228,300 236,310 244,296 252,308'
//             : '108,308 116,306 124,310 132,304 140,312 148,306 156,308 164,304 172,310 180,306 188,310 196,304 204,308 212,306 220,310 228,304 236,308 244,306 252,308'}
//           opacity="0.95"
//         />
//         <text x="108" y="332" fill="#94A3B8" fontSize="7" fontFamily="ui-monospace, monospace">{`>>> STATE: ${e.short}`}</text>

//         <g>
//           <circle cx="92" cy="358" r="3" fill="#10B981" />
//           <circle cx="104" cy="358" r="3" fill={e.color} />
//           <circle cx="116" cy="358" r="3" fill="#06B6D4" />
//           <text x="135" y="362" fill="#6B7280" fontSize="7" fontFamily="ui-monospace, monospace" fontWeight="bold">EV3-CORE · LIVE</text>
//           <rect x="240" y="354" width="36" height="9" rx="2" fill="none" stroke="#9CA3AF" strokeWidth="0.8" />
//           <rect x="242" y="356" width="22" height="5" rx="1" fill="#10B981" />
//           <text x="220" y="362" fill="#6B7280" fontSize="7" fontFamily="ui-monospace, monospace">98%</text>
//         </g>

//         {/* 底盤 + 輪子 */}
//         <rect x="85" y="380" width="190" height="32" rx="10" fill="url(#metal-grad)" />
//         <rect x="85" y="380" width="190" height="6" fill="#374151" opacity="0.5" />
//         <g>
//           <circle cx="120" cy="418" r="22" fill="#1F2937" stroke="#374151" strokeWidth="2" />
//           <circle cx="120" cy="418" r="14" fill="#4B5563" />
//           <circle cx="120" cy="418" r="5" fill="#9CA3AF" />
//           <line x1="120" y1="404" x2="120" y2="432" stroke="#1F2937" strokeWidth="2" />
//           <line x1="106" y1="418" x2="134" y2="418" stroke="#1F2937" strokeWidth="2" />
//         </g>
//         <g>
//           <circle cx="240" cy="418" r="22" fill="#1F2937" stroke="#374151" strokeWidth="2" />
//           <circle cx="240" cy="418" r="14" fill="#4B5563" />
//           <circle cx="240" cy="418" r="5" fill="#9CA3AF" />
//           <line x1="240" y1="404" x2="240" y2="432" stroke="#1F2937" strokeWidth="2" />
//           <line x1="226" y1="418" x2="254" y2="418" stroke="#1F2937" strokeWidth="2" />
//         </g>
//       </g>
//     </svg>
//   );
// };

// /* ════════════════════════════════════════════════════════════════
//    通用元件
//    ════════════════════════════════════════════════════════════════ */
// const Gauge = ({ value, color, label, size = 'md' }) => {
//   const r = size === 'lg' ? 44 : 38;
//   const wrap = size === 'lg' ? 'w-28 h-28' : 'w-24 h-24';
//   const num = size === 'lg' ? 'text-3xl' : 'text-2xl';
//   const c = 2 * Math.PI * r;
//   const offset = c - (value / 100) * c;
//   return (
//     <div className="flex flex-col items-center gap-2">
//       <div className={`relative ${wrap}`}>
//         <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
//           <circle cx="50" cy="50" r={r} stroke="#E5E7EB" strokeWidth="8" fill="none" />
//           <circle cx="50" cy="50" r={r} stroke={color} strokeWidth="8" fill="none"
//             strokeLinecap="round" strokeDasharray={c} strokeDashoffset={offset}
//             style={{ transition: 'stroke-dashoffset 900ms cubic-bezier(.4,.2,.2,1), stroke 600ms' }} />
//         </svg>
//         <div className="absolute inset-0 flex flex-col items-center justify-center">
//           <span className={`${num} font-bold tabular-nums font-display`} style={{ color }}>{Math.round(value)}</span>
//           <span className="text-[10px] text-stone-500 tracking-widest">%</span>
//         </div>
//       </div>
//       <span className="text-xs text-stone-600 tracking-wide font-medium">{label}</span>
//     </div>
//   );
// };

// const StatBar = ({ label, value, color }) => (
//   <div>
//     <div className="flex justify-between items-baseline mb-1.5">
//       <span className="text-[11px] text-stone-500 tracking-wider uppercase font-medium">{label}</span>
//       <span className="text-sm font-bold tabular-nums" style={{ color }}>{value}</span>
//     </div>
//     <div className="h-1.5 bg-stone-200/70 rounded-full overflow-hidden">
//       <div className="h-full rounded-full"
//         style={{ width: `${value}%`, background: `linear-gradient(90deg, ${color}99, ${color})`, transition: 'width 900ms cubic-bezier(.4,.2,.2,1), background 500ms' }} />
//     </div>
//   </div>
// );

// const Drawer = ({ open, onClose, position, children }) => {
//   const baseCls = 'fixed bg-white/95 backdrop-blur-xl shadow-2xl transition-transform duration-500 ease-[cubic-bezier(.16,1,.3,1)] z-40 overflow-hidden';
//   let posCls = '', transformStyle = {};
//   if (position === 'left') { posCls = 'top-0 left-0 h-full w-[340px] border-r border-stone-200/80 rounded-r-3xl'; transformStyle = { transform: open ? 'translateX(0)' : 'translateX(-100%)' }; }
//   else if (position === 'right') { posCls = 'top-0 right-0 h-full w-[360px] border-l border-stone-200/80 rounded-l-3xl'; transformStyle = { transform: open ? 'translateX(0)' : 'translateX(100%)' }; }
//   else { posCls = 'bottom-0 inset-x-0 max-h-[78vh] border-t border-stone-200/80 rounded-t-3xl'; transformStyle = { transform: open ? 'translateY(0)' : 'translateY(100%)' }; }

//   return (
//     <aside className={`${baseCls} ${posCls}`} style={transformStyle}>
//       <div className="relative h-full flex flex-col">
//         {position === 'bottom' && (
//           <div className="flex justify-center pt-3 pb-1">
//             <div className="w-12 h-1.5 rounded-full bg-stone-300" />
//           </div>
//         )}
//         <button onClick={onClose}
//           className="absolute top-4 right-4 w-9 h-9 rounded-full bg-stone-100 hover:bg-stone-200 flex items-center justify-center text-stone-600 transition-colors z-10">
//           <X className="w-4 h-4" />
//         </button>
//         <div className="flex-1 overflow-y-auto">{children}</div>
//       </div>
//     </aside>
//   );
// };

// /* ════════════════════════════════════════════════════════════════
//    語音 hooks — Web Speech API
//    ════════════════════════════════════════════════════════════════ */
// const useSpeech = () => {
//   const [supported, setSupported] = useState(false);
//   const [speaking, setSpeaking] = useState(false);
//   const [voices, setVoices] = useState([]);
//   const [currentVoice, setCurrentVoice] = useState(null);
//   const voiceRef = useRef(null);

//   // 將 voice 寫進 ref（speak 用）並同步進 state（UI 用）
//   const applyVoice = useCallback((v) => {
//     voiceRef.current = v;
//     setCurrentVoice(v);
//   }, []);

//   useEffect(() => {
//     if (typeof window === 'undefined' || !window.speechSynthesis) return;
//     setSupported(true);

//     const pickBestChineseVoice = (vs) => {
//       if (!vs.length) return null;
//       const lc = (s) => (s || '').toLowerCase();
//       // 依優先順序找：zh-TW > zh-Hant > zh-HK > zh-CN > zh-Hans > 任意 zh > 任意含中文名
//       const buckets = [
//         vs.filter(v => v.lang === 'zh-TW' || /zh.*tw/i.test(v.lang)),
//         vs.filter(v => /hant/i.test(v.lang)),
//         vs.filter(v => v.lang === 'zh-HK' || /zh.*hk/i.test(v.lang)),
//         vs.filter(v => v.lang === 'zh-CN' || /zh.*cn/i.test(v.lang)),
//         vs.filter(v => /hans/i.test(v.lang)),
//         vs.filter(v => lc(v.lang).startsWith('zh') || lc(v.lang).startsWith('cmn')),
//         vs.filter(v => /chinese|mandarin|中文|普通話|國語|粵語/i.test(v.name))
//       ];
//       const femaleHints = /female|女|Mei|Yating|Amber|Hanhan|Tracy|Sin-?ji|Tian|Tian-?Tian|Karen|Ting-?Ting|Lili|Yaoyao|Shanshan|Xiaoxiao/i;
//       for (const b of buckets) {
//         if (!b.length) continue;
//         const fem = b.find(v => femaleHints.test(v.name));
//         return fem || b[0];
//       }
//       return null;
//     };

//     const loadVoices = () => {
//       const vs = window.speechSynthesis.getVoices() || [];
//       setVoices(vs);
//       // 只在還沒選 voice 時自動挑
//       if (!voiceRef.current && vs.length) {
//         const picked = pickBestChineseVoice(vs);
//         if (picked) applyVoice(picked);
//       }
//     };

//     loadVoices();
//     window.speechSynthesis.onvoiceschanged = loadVoices;
//     // 部分瀏覽器（Safari, Firefox 行動版）voiceschanged 不會觸發，輪詢 fallback
//     const t1 = setTimeout(loadVoices, 250);
//     const t2 = setTimeout(loadVoices, 1000);
//     const t3 = setTimeout(loadVoices, 3000);
//     return () => {
//       try { window.speechSynthesis.onvoiceschanged = null; } catch (e) {}
//       clearTimeout(t1); clearTimeout(t2); clearTimeout(t3);
//     };
//   }, [applyVoice]);

//   const speak = useCallback((text, opts = {}) => {
//     if (!supported || !text) return Promise.resolve();
//     return new Promise((resolve) => {
//       let resolved = false;
//       const finish = () => { if (!resolved) { resolved = true; setSpeaking(false); resolve(); } };

//       const startSpeak = () => {
//         try {
//           const utt = new SpeechSynthesisUtterance(text);
//           // 關鍵：lang 跟著選定的 voice 走，避免「voice 是 zh-CN 但 lang=zh-TW」的不匹配
//           if (voiceRef.current) {
//             utt.voice = voiceRef.current;
//             utt.lang = voiceRef.current.lang || 'zh-TW';
//           } else {
//             utt.lang = 'zh-TW';
//           }
//           utt.rate = opts.rate || 1.05;
//           utt.pitch = opts.pitch || 1.15;
//           utt.volume = opts.volume != null ? opts.volume : 1.0;
//           utt.onstart = () => setSpeaking(true);
//           utt.onend = finish;
//           utt.onerror = finish;
//           window.speechSynthesis.speak(utt);
//           // 快速失敗偵測（1 秒）
//           setTimeout(() => {
//             if (!resolved && !window.speechSynthesis.speaking && !window.speechSynthesis.pending) {
//               finish();
//             }
//           }, 1000);
//           // 安全網
//           const estimatedMs = Math.max(2500, text.length * 280) + 3500;
//           setTimeout(finish, estimatedMs);
//         } catch (err) {
//           finish();
//         }
//       };

//       try {
//         const wasActive = window.speechSynthesis.speaking || window.speechSynthesis.pending;
//         if (wasActive) {
//           window.speechSynthesis.cancel();
//           setTimeout(startSpeak, 80);
//         } else {
//           startSpeak();
//         }
//       } catch (err) {
//         finish();
//       }
//     });
//   }, [supported]);

//   const stop = useCallback(() => {
//     if (!supported) return;
//     try { window.speechSynthesis.cancel(); } catch (e) {}
//     setSpeaking(false);
//   }, [supported]);

//   return { supported, speaking, speak, stop, voices, currentVoice, setVoice: applyVoice };
// };

// const useListen = () => {
//   const [supported, setSupported] = useState(false);
//   const [listening, setListening] = useState(false);
//   const [transcript, setTranscript] = useState('');
//   const [error, setError] = useState(null);
//   const recRef = useRef(null);
//   const onFinalRef = useRef(null);

//   useEffect(() => {
//     const SR = (typeof window !== 'undefined') && (window.SpeechRecognition || window.webkitSpeechRecognition);
//     if (SR) setSupported(true);
//   }, []);

//   const start = useCallback((onFinal) => {
//     setError(null);
//     if (!supported) { setError('unsupported'); return; }
//     onFinalRef.current = onFinal;
//     try {
//       const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
//       const rec = new SR();
//       rec.lang = 'zh-TW';
//       rec.continuous = false;
//       rec.interimResults = true;
//       rec.maxAlternatives = 1;

//       rec.onresult = (ev) => {
//         let interim = '', final = '';
//         for (let i = ev.resultIndex; i < ev.results.length; i++) {
//           const r = ev.results[i];
//           if (r.isFinal) final += r[0].transcript;
//           else interim += r[0].transcript;
//         }
//         setTranscript(final || interim);
//         if (final && onFinalRef.current) onFinalRef.current(final.trim());
//       };
//       rec.onend = () => { setListening(false); };
//       rec.onerror = (ev) => {
//         setListening(false);
//         setError(ev.error || 'unknown');
//       };

//       rec.start();
//       setListening(true);
//       setTranscript('');
//       recRef.current = rec;
//     } catch (err) {
//       setError('start-failed');
//       setListening(false);
//     }
//   }, [supported]);

//   const stop = useCallback(() => {
//     try { recRef.current?.stop(); } catch (e) {}
//     recRef.current = null;
//     setListening(false);
//   }, []);

//   return { supported, listening, transcript, error, start, stop, setTranscript };
// };

// /* ════════════════════════════════════════════════════════════════
//    主應用
//    ════════════════════════════════════════════════════════════════ */
// export default function App() {
//   const [emotion, setEmotion] = useState('happy');
//   const [scanning, setScanning] = useState(false);
//   const [history, setHistory] = useState([
//     { e: 'calm', t: '14:22' }, { e: 'focused', t: '14:08' }, { e: 'happy', t: '13:51' }
//   ]);
//   const [time, setTime] = useState(new Date());
//   const [bubble, setBubble] = useState(null);

//   const [leftOpen, setLeftOpen] = useState(false);
//   const [rightOpen, setRightOpen] = useState(false);
//   const [bottomOpen, setBottomOpen] = useState(false);

//   const [eyeOffset, setEyeOffset] = useState({ x: 0, y: 0 });
//   const [blinking, setBlinking] = useState(false);
//   const [pressed, setPressed] = useState(false);

//   // 語音相關
//   const tts = useSpeech();
//   const stt = useListen();
//   const [introPlaying, setIntroPlaying] = useState(false);
//   const [introStep, setIntroStep] = useState(0);
//   const introCancelRef = useRef(false);
//   const [voiceEnabled, setVoiceEnabled] = useState(true); // 使用者可關閉

//   const stageRef = useRef(null);
//   const bubbleTimerRef = useRef(null);
//   const hasIntroducedRef = useRef(false);
//   const cameraVideoRef = useRef(null);
//   const cameraStreamRef = useRef(null);
//   const [cameraReady, setCameraReady] = useState(false);
//   const [cameraBusy, setCameraBusy] = useState(false);
//   const [cameraError, setCameraError] = useState('');
//   // Live metrics from App3 guardian snapshot (null = no data yet, use EMOTIONS fallback)
//   const [liveMetrics, setLiveMetrics] = useState(null);
//   const [robotAssignment, setRobotAssignment] = useState(null);
//   const robotAssignmentRef = useRef(null);
//   const pendingAssignmentRef = useRef(null);
//   const [movementRoute, setMovementRoute] = useState(null);
//   const movementTimerRef = useRef(null);
//   const e = EMOTIONS[emotion];
//   const displayAssignment = movementRoute ? {
//     zoneId: movementRoute.fromZoneId || robotAssignment?.zoneId || 'robot-home',
//     zoneName: movementRoute.fromName || robotAssignment?.zoneName || '巡邏底盤',
//     location: movementRoute.fromLocation || robotAssignment?.location || '中控待命點',
//     riskLevel: robotAssignment?.riskLevel || 'low',
//     statusLabel: '移動中',
//     stage: movementRoute.toName ? `前往 ${movementRoute.toName}` : '前往現場',
//   } : robotAssignment;
//   const zoneTone = displayAssignment ? ZONE_TONES[normalizeZoneRisk(displayAssignment.riskLevel)] : null;
//   const movementTone = movementRoute ? ZONE_TONES[normalizeZoneRisk(movementRoute.riskLevel)] : null;
//   const movementTiming = movementRoute ? getMovementTiming(movementRoute) : null;
//   const ambientColor = zoneTone?.color ?? e.color;
//   const ambientLight = zoneTone?.light ?? e.light;
//   const ambientGlow = zoneTone?.glow ?? e.glow;
//   // Derived display values: use live data when available, fall back to EMOTIONS constants
//   const displayStress = liveMetrics?.stress ?? e.stress;
//   const displayStability = liveMetrics?.stability ?? e.stability;
//   const displayFocus = liveMetrics?.focus ?? e.focus;
//   const displayMoodLabel = liveMetrics?.moodLabel ?? null;
//   const displayRiskLabel = movementRoute ? '移動中' : (robotAssignment?.statusLabel ?? liveMetrics?.riskLabel ?? null);
//   const displayFusionScore = liveMetrics?.fusionScore ?? null;
//   const displaySignals = liveMetrics?.signals ?? null;
//   const isLiveData = liveMetrics !== null;
//   const isMoving = Boolean(movementRoute);
//   // WebSocket — 透過 LAN 橋接伺服器與主控 App3 同步情緒
//   const wsRef = useRef(null);
//   const [bcConnected, setBcConnected] = useState(false);
//   const bcHandlerRef = useRef(null);
//   const wsReconnectRef = useRef(null);
//   const bridgeAddrRef = useRef(defaultBridgeHost());

//   /* 時鐘 */
//   useEffect(() => {
//     const id = setInterval(() => setTime(new Date()), 1000);
//     return () => clearInterval(id);
//   }, []);

//   /* 開場提示（不自動發聲，避免被瀏覽器擋）*/
//   useEffect(() => {
//     const t1 = setTimeout(() => {
//       _setBubble('嗨！我是 AI 情緒守護機器人 👋\n點擊我聽自我介紹，或開始對話～', 8000);
//     }, 900);
//     return () => clearTimeout(t1);
//     // eslint-disable-next-line
//   }, []);

//   /* WebSocket setup — 透過 LAN 橋接伺服器接收主控 App3 情緒指令 */
//   /* iPad 開啟頁面時加 ?bridge=IP:PORT 指定橋接伺服器，例如 ?bridge=192.168.1.10:3203 */
//   useEffect(() => {
//     const params = new URLSearchParams(window.location.search);
//     const bridgeAddr = params.get('bridge') || defaultBridgeHost();
//     bridgeAddrRef.current = bridgeAddr;
//     let stopped = false;

//     const connect = () => {
//       if (stopped) return;
//       const ws = new WebSocket(bridgeWsUrl(bridgeAddr));
//       wsRef.current = ws;
//       ws.onopen = () => setBcConnected(true);
//       ws.onmessage = (ev) => {
//         try { bcHandlerRef.current?.(JSON.parse(ev.data)); } catch { /* ignore */ }
//       };
//       ws.onerror = () => {};
//       ws.onclose = () => {
//         setBcConnected(false);
//         wsRef.current = null;
//         if (!stopped) wsReconnectRef.current = setTimeout(connect, 3000);
//       };
//     };

//     connect();

//     return () => {
//       stopped = true;
//       if (wsReconnectRef.current) clearTimeout(wsReconnectRef.current);
//       wsRef.current?.close();
//       wsRef.current = null;
//     };
//   }, []);

//   /* Screen Wake Lock — 防止 iPad 螢幕關閉 */
//   useEffect(() => {
//     let wakeLock = null;
//     const acquire = async () => {
//       try { wakeLock = await navigator.wakeLock?.request('screen'); } catch { /* 不支援則略過 */ }
//     };
//     void acquire();
//     const onVisible = () => { if (document.visibilityState === 'visible') void acquire(); };
//     document.addEventListener('visibilitychange', onVisible);
//     return () => {
//       document.removeEventListener('visibilitychange', onVisible);
//       wakeLock?.release().catch(() => {});
//     };
//   }, []);

//   /* 隨機眨眼 */
//   useEffect(() => {
//     let cancelled = false, timeoutId;
//     const loop = () => {
//       if (cancelled) return;
//       setBlinking(true);
//       setTimeout(() => { if (!cancelled) setBlinking(false); }, 130);
//       timeoutId = setTimeout(loop, 2500 + Math.random() * 4000);
//     };
//     timeoutId = setTimeout(loop, 1800);
//     return () => { cancelled = true; clearTimeout(timeoutId); };
//   }, []);

//   /* 眼睛追視 */
//   useEffect(() => {
//     const handler = (ev) => {
//       const isTouch = ev.touches && ev.touches.length > 0;
//       const x = isTouch ? ev.touches[0].clientX : ev.clientX;
//       const y = isTouch ? ev.touches[0].clientY : ev.clientY;
//       if (typeof x !== 'number') return;
//       const stageEl = stageRef.current;
//       if (!stageEl) return;
//       const rect = stageEl.getBoundingClientRect();
//       const faceX = rect.left + rect.width / 2;
//       const faceY = rect.top + rect.height * 0.42;
//       const dx = x - faceX, dy = y - faceY;
//       const dist = Math.hypot(dx, dy);
//       if (dist < 1) { setEyeOffset({ x: 0, y: 0 }); return; }
//       const max = 4.5, factor = Math.min(1, dist / 240);
//       setEyeOffset({ x: (dx / dist) * max * factor, y: (dy / dist) * max * factor });
//     };
//     window.addEventListener('mousemove', handler);
//     window.addEventListener('touchmove', handler, { passive: true });
//     return () => {
//       window.removeEventListener('mousemove', handler);
//       window.removeEventListener('touchmove', handler);
//     };
//   }, []);

//   /* 純設定泡泡 */
//   const _setBubble = (text, duration = 6000) => {
//     if (bubbleTimerRef.current) clearTimeout(bubbleTimerRef.current);
//     setBubble(text);
//     if (duration > 0) bubbleTimerRef.current = setTimeout(() => setBubble(null), duration);
//   };

//   /* 顯示泡泡並（可選）發聲 */
//   const showBubble = useCallback((text, duration = 6000, withSpeech = true) => {
//     _setBubble(text, duration);
//     if (withSpeech && voiceEnabled && tts.supported) {
//       audio.play('speak');
//       tts.speak(text);
//     }
//   }, [tts, voiceEnabled]);

//   const startCameraStream = useCallback(async () => {
//     if (cameraStreamRef.current) {
//       setCameraReady(true);
//       return true;
//     }
//     if (!navigator.mediaDevices?.getUserMedia) {
//       setCameraError('這個瀏覽器不支援相機存取。');
//       showBubble('這個瀏覽器不支援相機存取。', 5000);
//       return false;
//     }
//     try {
//       setCameraBusy(true);
//       setCameraError('');
//       const stream = await navigator.mediaDevices.getUserMedia({
//         video: {facingMode: {ideal: 'user'}, width: {ideal: 960}, height: {ideal: 540}},
//         audio: false,
//       });
//       cameraStreamRef.current = stream;
//       setCameraReady(true);
//       return true;
//     } catch {
//       setCameraError('無法開啟相機；手機通常需要 HTTPS、同意權限，或使用本機 localhost。');
//       showBubble('無法開啟相機，請確認瀏覽器權限與 HTTPS。', 6000);
//       return false;
//     } finally {
//       setCameraBusy(false);
//     }
//   }, [showBubble]);

//   const stopCameraStream = useCallback(() => {
//     cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
//     cameraStreamRef.current = null;
//     setCameraReady(false);
//   }, []);

//   const toggleCamera = useCallback(() => {
//     if (cameraReady) {
//       stopCameraStream();
//       return;
//     }
//     void startCameraStream();
//   }, [cameraReady, startCameraStream, stopCameraStream]);

//   useEffect(() => {
//     const video = cameraVideoRef.current;
//     if (!cameraReady || !video || !cameraStreamRef.current) return;
//     video.srcObject = cameraStreamRef.current;
//     video.play?.().catch(() => {});
//   }, [cameraReady]);

//   useEffect(() => () => {
//     cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
//   }, []);

//   useEffect(() => () => {
//     if (movementTimerRef.current) clearTimeout(movementTimerRef.current);
//   }, []);

//   const notifyEmotionEvent = useCallback((emotionKey, extra = {}) => {
//     const meta = EMOTION_ALERTS[emotionKey];
//     if (!meta) return;
//     const assignment = robotAssignmentRef.current;
//     const event = {
//       zoneId: assignment?.zoneId || 'zone-field',
//       zoneName: assignment?.zoneName || '操場',
//       location: assignment?.location || '操場',
//       emotion: emotionKey,
//       emotionLabel: meta.label,
//       riskLevel: meta.riskLevel,
//       description: extra.description || meta.description,
//       source: extra.source || 'robot-display',
//     };
//     fetch(`${bridgeHttpBase(bridgeAddrRef.current)}/api/display/emotion-event`, {
//       method: 'POST',
//       headers: {'Content-Type': 'application/json'},
//       body: JSON.stringify(event),
//     }).catch(() => {});
//   }, []);

//   /* ─────── 自我介紹流程 ─────── */
//   const playIntro = useCallback(async () => {
//     if (introPlaying || isMoving) return;
//     introCancelRef.current = false;
//     setIntroPlaying(true);
//     setLeftOpen(false); setRightOpen(false); setBottomOpen(false);
//     stt.stop();

//     audio.unlock();
//     audio.play('introStart');

//     for (let i = 0; i < INTRO_SCRIPT.length; i++) {
//       if (introCancelRef.current) break;
//       const step = INTRO_SCRIPT[i];
//       setIntroStep(i);
//       setEmotion(step.emotion);
//       audio.play('sparkle');
//       _setBubble(step.text, 0);

//       if (voiceEnabled && tts.supported) {
//         audio.play('speak');
//         // ⚠ 關鍵：第 0 次必須在 gesture context 中直接呼叫 TTS（不能 await 任何東西）
//         // 否則 Safari / Chrome 會擋掉自動播放
//         if (i > 0) {
//           await new Promise(r => setTimeout(r, 180));
//         }
//         await tts.speak(step.text);
//         if (introCancelRef.current) break;
//         await new Promise(r => setTimeout(r, 300));
//       } else {
//         await new Promise(r => setTimeout(r, Math.max(2500, step.text.length * 250)));
//       }
//     }

//     setIntroPlaying(false);
//     setIntroStep(0);
//     if (!introCancelRef.current) {
//       audio.play('cute');
//       _setBubble('現在輪到你了！按下方按鈕開始～', 5000);
//     }
//   }, [introPlaying, isMoving, tts, voiceEnabled, stt]);

//   const cancelIntro = () => {
//     introCancelRef.current = true;
//     tts.stop();
//     setIntroPlaying(false);
//     setIntroStep(0);
//     _setBubble(null, 0);
//   };

//   /* ─────── 開始情緒掃描 ─────── */
//   const startScan = async () => {
//     if (scanning || introPlaying || isMoving) return;
//     setBubble(null);
//     tts.stop(); stt.stop();
//     setLeftOpen(false); setRightOpen(false); setBottomOpen(false);
//     audio.unlock();
//     audio.play('scanStart');
//     setScanning(true);
//     await startCameraStream();
//     try {
//       const res = await fetch('/api/scan-emotion', {method: 'POST'});
//       const data = await res.json().catch(() => ({}));
//       if (res.ok && data?.type === 'emotion') {
//         bcHandlerRef.current?.(data);
//         return;
//       }
//     } catch {
//       // Integrated display falls back to local demo scan when LLMEmotion middleware is absent.
//     }
//     setTimeout(() => {
//       const keys = Object.keys(EMOTIONS);
//       const next = keys[Math.floor(Math.random() * keys.length)];
//       setEmotion(next);
//       const t = new Date();
//       const tStr = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
//       setHistory(h => [{ e: next, t: tStr }, ...h.slice(0, 4)]);
//       setScanning(false);
//       audio.play('scanComplete');
//       notifyEmotionEvent(next, {source: 'robot-display-camera'});
//       showBubble(EMOTIONS[next].response, 8000);
//     }, 2400);
//   };

//   /* ─────── 手動切換情緒 ─────── */
//   const setManual = (key) => {
//     if (scanning || introPlaying || isMoving) return;
//     audio.unlock();
//     audio.play('sparkle');
//     setEmotion(key);
//     const t = new Date();
//     const tStr = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
//     setHistory(h => [{ e: key, t: tStr }, ...h.slice(0, 4)]);
//     showBubble(EMOTIONS[key].response, 7000);
//   };

//   // 每次渲染更新 handler，確保最新閉包
//   bcHandlerRef.current = (data) => {
//     if (data.type === 'emotion' && EMOTIONS[data.emotion]) {
//       setScanning(false);
//       audio.play('scanComplete');
//       setEmotion(data.emotion);
//       setLiveMetrics({
//         stress: EMOTIONS[data.emotion].stress,
//         stability: EMOTIONS[data.emotion].stability,
//         focus: EMOTIONS[data.emotion].focus,
//         fusionScore: typeof data.fusionScore === 'number' ? data.fusionScore : null,
//         signals: data.signals ?? null,
//         riskScore: typeof data.riskScore === 'number' ? data.riskScore : null,
//         riskLabel: typeof data.riskLabel === 'string' ? data.riskLabel : null,
//         moodLabel: typeof data.moodLabel === 'string' ? data.moodLabel : null,
//         robotActive: true,
//       });
//       const t = new Date();
//       const tStr = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
//       setHistory(h => [{ e: data.emotion, t: tStr }, ...h.slice(0, 4)]);
//       notifyEmotionEvent(data.emotion, {source: 'llm-emotion'});
//       showBubble(EMOTIONS[data.emotion].response, 7000);
//       return;
//     }
//     if ((data.type === 'display_emotion' || data.type === 'EMOTION_UPDATE') && EMOTIONS[data.emotion]) {
//       setManual(data.emotion);
//     }
//     if (data.type === 'robot_assignment') {
//       const riskLevel = normalizeZoneRisk(data.riskLevel);
//       const statusLabel = typeof data.statusLabel === 'string' && data.statusLabel.trim()
//         ? data.statusLabel.trim()
//         : ZONE_TONES[riskLevel].label;
//       const nextAssignment = {
//         zoneId: typeof data.zoneId === 'string' ? data.zoneId : '',
//         zoneName: typeof data.zoneName === 'string' && data.zoneName.trim() ? data.zoneName.trim() : '未指定區域',
//         location: typeof data.location === 'string' && data.location.trim() ? data.location.trim() : '校園巡查線',
//         riskLevel,
//         statusLabel,
//         stage: typeof data.stage === 'string' && data.stage.trim() ? data.stage.trim() : '現場待命',
//         missionId: typeof data.missionId === 'string' ? data.missionId : null,
//         active: data.active === true,
//         updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : new Date().toISOString(),
//       };
//       const previous = robotAssignmentRef.current ?? ROBOT_HOME_ASSIGNMENT;
//       if (movementTimerRef.current && pendingAssignmentRef.current?.zoneId === nextAssignment.zoneId) {
//         pendingAssignmentRef.current = nextAssignment;
//         setMovementRoute((current) => current ? {...current, riskLevel, statusLabel, stage: nextAssignment.stage} : current);
//         return;
//       }
//       const changedZone = Boolean(previous?.zoneId && nextAssignment.zoneId && previous.zoneId !== nextAssignment.zoneId);
//       if (movementTimerRef.current) clearTimeout(movementTimerRef.current);
//       if (data.moving === true || changedZone) {
//         const fromName = typeof data.fromZoneName === 'string' && data.fromZoneName.trim() ? data.fromZoneName.trim() : previous.zoneName;
//         const fromLocation = typeof data.fromLocation === 'string' && data.fromLocation.trim() ? data.fromLocation.trim() : previous.location;
//         const fromZoneId = typeof data.fromZoneId === 'string' && data.fromZoneId.trim() ? data.fromZoneId.trim() : previous.zoneId;
//         const receivedAt = Date.now();
//         const startedAtMs = typeof data.travelStartedAt === 'string' ? Date.parse(data.travelStartedAt) : Number.NaN;
//         const endsAtMs = typeof data.travelEndsAt === 'string' ? Date.parse(data.travelEndsAt) : Number.NaN;
//         const totalMs = Number.isFinite(startedAtMs) && Number.isFinite(endsAtMs)
//           ? Math.max(800, endsAtMs - startedAtMs)
//           : 5000;
//         const travelMs = Number.isFinite(endsAtMs)
//           ? Math.max(800, Math.min(totalMs, endsAtMs - receivedAt))
//           : totalMs;
//         pendingAssignmentRef.current = nextAssignment;
//         setLeftOpen(false);
//         setRightOpen(false);
//         setBottomOpen(false);
//         setScanning(false);
//         tts.stop();
//         stt.stop();
//         setMovementRoute({
//           fromZoneId,
//           fromName,
//           fromLocation,
//           toName: nextAssignment.zoneName,
//           toLocation: nextAssignment.location,
//           riskLevel,
//           statusLabel,
//           stage: nextAssignment.stage,
//           startedAt: receivedAt - Math.max(0, totalMs - travelMs),
//           totalMs,
//           durationMs: travelMs,
//         });
//         movementTimerRef.current = setTimeout(() => {
//           const arrivedAssignment = pendingAssignmentRef.current ?? nextAssignment;
//           robotAssignmentRef.current = arrivedAssignment;
//           setRobotAssignment(arrivedAssignment);
//           setMovementRoute(null);
//           pendingAssignmentRef.current = null;
//           movementTimerRef.current = null;
//           _setBubble(`已抵達：${arrivedAssignment.zoneName}\n${arrivedAssignment.stage} · ${arrivedAssignment.statusLabel}`, 4200);
//         }, travelMs);
//       } else {
//         pendingAssignmentRef.current = null;
//         setMovementRoute(null);
//         robotAssignmentRef.current = nextAssignment;
//         setRobotAssignment(nextAssignment);
//         if (!previous || previous.missionId !== nextAssignment.missionId || previous.stage !== nextAssignment.stage) {
//           _setBubble(`位置更新：${nextAssignment.zoneName}\n${nextAssignment.stage} · ${statusLabel}`, 4200);
//         }
//       }
//       return;
//     }
//     if (data.type === 'guardian_snapshot') {
//       if (EMOTIONS[data.emotion]) setManual(data.emotion);
//       setLiveMetrics({
//         stress: typeof data.stress === 'number' ? data.stress : null,
//         stability: typeof data.stability === 'number' ? data.stability : null,
//         focus: typeof data.focus === 'number' ? data.focus : null,
//         fusionScore: typeof data.fusionScore === 'number' ? data.fusionScore : null,
//         signals: data.signals ?? null,
//         riskScore: typeof data.riskScore === 'number' ? data.riskScore : null,
//         riskLabel: typeof data.riskLabel === 'string' ? data.riskLabel : null,
//         moodLabel: typeof data.moodLabel === 'string' ? data.moodLabel : null,
//         robotActive: data.robotActive === true,
//       });
//     }
//   };

//   /* ─────── 點擊機器人 ─────── */
//   const handleRobotTap = (ev) => {
//     ev.stopPropagation();
//     if (scanning || isMoving) return;
//     setPressed(true);
//     setTimeout(() => setPressed(false), 280);
//     audio.unlock();
//     if (!document.fullscreenElement) {
//       document.documentElement.requestFullscreen().catch(() => {});
//     }
//     audio.play('tap');

//     if (introPlaying) {
//       cancelIntro();
//       return;
//     }
//     // 第一次點擊 → 播放完整自我介紹
//     if (!hasIntroducedRef.current) {
//       hasIntroducedRef.current = true;
//       playIntro();
//       return;
//     }
//     const tapResponses = [
//       '哈囉！想和我聊聊嗎？',
//       '點下方麥克風跟我說話，或按掃描鍵讓我看看你的心情～',
//       '我隨時都在這裡陪你！',
//       '感受到你的觸碰了。',
//       '你好你好！今天過得如何？',
//       '需要我幫你檢測情緒嗎？'
//     ];
//     showBubble(tapResponses[Math.floor(Math.random() * tapResponses.length)], 4000);
//   };

//   /* ─────── 語音對話 ─────── */
//   const handleUserSpeech = useCallback((text) => {
//     if (!text) return;
//     const matched = matchEmotion(text);
//     if (matched.response === '__INTRO__') {
//       playIntro();
//       return;
//     }
//     if (matched.emotion) {
//       setEmotion(matched.emotion);
//       const t = new Date();
//       const tStr = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
//       setHistory(h => [{ e: matched.emotion, t: tStr }, ...h.slice(0, 4)]);
//     }
//     setTimeout(() => showBubble(matched.response, 8000), 400);
//   }, [playIntro, showBubble]);

//   const toggleListen = () => {
//     if (introPlaying || isMoving) return;
//     audio.unlock();
//     if (stt.listening) {
//       audio.play('listenStop');
//       stt.stop();
//     } else {
//       tts.stop();
//       _setBubble(null, 0);
//       audio.play('listenStart');
//       stt.start(handleUserSpeech);
//     }
//   };

//   /* 處理語音錯誤 */
//   useEffect(() => {
//     if (!stt.error) return;
//     const map = {
//       'not-allowed': '請允許瀏覽器使用麥克風才能語音對話喔！',
//       'no-speech': '我沒聽到你說話，再試一次？',
//       'aborted': null,
//       'audio-capture': '麥克風好像沒接好，檢查一下？',
//       'network': '網路連線問題，請稍後再試。',
//       'unsupported': '你的瀏覽器不支援語音辨識，建議使用 Chrome 或 Edge。',
//     };
//     const msg = map[stt.error] || `語音辨識發生問題：${stt.error}`;
//     if (msg) {
//       audio.play('error');
//       showBubble(msg, 5000);
//     }
//   }, [stt.error, showBubble]);

//   const timeStr = `${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`;
//   const anyDrawerOpen = leftOpen || rightOpen || bottomOpen;
//   const closeAll = () => { setLeftOpen(false); setRightOpen(false); setBottomOpen(false); };
//   const isInteracting = tts.speaking || stt.listening;

//   return (
//     <div
//       className="fixed inset-0 overflow-hidden"
//       style={{
//         background: `
//           radial-gradient(ellipse 60% 40% at 50% 0%, ${ambientGlow} 0%, transparent 60%),
//           radial-gradient(ellipse 80% 50% at 50% 100%, ${ambientLight} 0%, transparent 55%),
//           linear-gradient(180deg, #FAF7F2 0%, #F0EBE0 100%)
//         `,
//         transition: 'background 1100ms ease',
//         fontFamily: '"Noto Sans TC", "Bricolage Grotesque", system-ui, sans-serif'
//       }}
//     >
//       <style>{`
//         @import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,500;12..96,600;12..96,700;12..96,800&family=Noto+Sans+TC:wght@400;500;700;900&family=JetBrains+Mono:wght@400;500;600&display=swap');
//         @keyframes float-idle { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-7px); } }
//         .robot-float { animation: float-idle 4s ease-in-out infinite; transform-origin: center; transform-box: fill-box; }
//         @keyframes bubble-in {
//           0% { opacity: 0; transform: translateY(8px) scale(0.94); }
//           100% { opacity: 1; transform: translateY(0) scale(1); }
//         }
//         .bubble-anim { animation: bubble-in 450ms cubic-bezier(.34,1.56,.64,1); }
//         @keyframes scan-pulse {
//           0%,100% { box-shadow: 0 0 0 0 rgba(255,255,255,0.45), 0 18px 38px -8px rgba(0,0,0,0.45); }
//           50% { box-shadow: 0 0 0 14px rgba(255,255,255,0), 0 18px 38px -8px rgba(0,0,0,0.45); }
//         }
//         .scan-pulse { animation: scan-pulse 2.2s infinite; }
//         @keyframes mic-pulse {
//           0%,100% { box-shadow: 0 0 0 0 rgba(6,182,212,0.55), 0 12px 28px -8px rgba(6,182,212,0.5); }
//           50% { box-shadow: 0 0 0 14px rgba(6,182,212,0), 0 12px 28px -8px rgba(6,182,212,0.5); }
//         }
//         .mic-pulse { animation: mic-pulse 1.4s infinite; }
//         @keyframes bar-bounce {
//           0%, 100% { transform: scaleY(0.3); }
//           50% { transform: scaleY(1); }
//         }
//         @keyframes handle-bounce { 0%,100% { transform: translateY(0); opacity: 0.7; } 50% { transform: translateY(-3px); opacity: 1; } }
//         .handle-bounce { animation: handle-bounce 2.5s ease-in-out infinite; }
//         @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
//         .fade-in { animation: fade-in 350ms ease-out; }
//         @keyframes ticker { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
//         .ticker-anim { animation: ticker 24s linear infinite; }
//         @keyframes ripple { 0% { transform: scale(0.6); opacity: 0.5; } 100% { transform: scale(1.55); opacity: 0; } }
//         .ripple { animation: ripple 2s ease-out infinite; transform-origin: center; }
//         @keyframes slide-up { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
//         .slide-up { animation: slide-up 350ms cubic-bezier(.34,1.56,.64,1); }
//         @keyframes mission-progress { from { width: 0%; } to { width: 100%; } }
//         @keyframes route-move { 0% { left: 8%; transform: translate(-50%, -50%) scale(0.86); } 50% { transform: translate(-50%, -66%) scale(1.04); } 100% { left: 92%; transform: translate(-50%, -50%) scale(0.96); } }
//         @keyframes route-dash { from { stroke-dashoffset: 0; } to { stroke-dashoffset: -72; } }
//         .mission-progress { animation: mission-progress 5s linear forwards; }
//         .route-move { animation: route-move 5s cubic-bezier(.34,.9,.23,1) forwards; }
//         .route-dash { animation: route-dash 1s linear infinite; }
//         .font-display { font-family: 'Bricolage Grotesque', system-ui, sans-serif; font-variation-settings: 'opsz' 96; }
//         .font-mono-tight { font-family: 'JetBrains Mono', ui-monospace, monospace; }
//         .hide-scroll::-webkit-scrollbar { display: none; }
//         .hide-scroll { scrollbar-width: none; }
//       `}</style>

//       {/* 紋理 */}
//       <div className="absolute inset-0 pointer-events-none opacity-[0.035]" style={{
//         backgroundImage: 'radial-gradient(circle at 1px 1px, #000 1px, transparent 0)',
//         backgroundSize: '26px 26px'
//       }} />

//       {/* 地面光圈 */}
//       <div className="absolute left-1/2 -translate-x-1/2 pointer-events-none"
//         style={{
//           bottom: '12%', width: '420px', height: '420px',
//           background: `radial-gradient(circle, ${ambientGlow} 0%, transparent 65%)`,
//           transition: 'background 900ms ease'
//         }} />

//       {/* 語音互動聲波光環 */}
//       {isInteracting && (
//         <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
//           {[0, 1, 2].map(i => (
//             <div key={i}
//               className="absolute rounded-full ripple"
//               style={{
//                 width: `${320 + i * 50}px`, height: `${320 + i * 50}px`,
//                 border: `2px solid ${stt.listening ? '#06B6D4' : e.color}`,
//                 opacity: 0.5 - i * 0.12,
//                 animationDelay: `${i * 0.6}s`
//               }} />
//           ))}
//         </div>
//       )}

//       {movementRoute && movementTone && movementTiming && (
//         <div
//           className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/55 px-4 backdrop-blur-[3px] pointer-events-auto"
//           onPointerDown={(event) => event.stopPropagation()}
//           onClick={(event) => event.stopPropagation()}
//         >
//           <div key={movementRoute.startedAt} className="w-full max-w-xl overflow-hidden rounded-2xl border border-white/70 bg-white/95 shadow-2xl shadow-slate-950/25">
//             <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
//               <div>
//                 <p className="text-[10px] font-black uppercase tracking-widest text-teal-600">Robot Dispatch</p>
//                 <h2 className="mt-0.5 font-display text-3xl font-black text-slate-950">任務指派中</h2>
//               </div>
//               <span className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-black text-white shadow-sm" style={{background: movementTone.color}}>
//                 <Loader2 className="h-4 w-4 animate-spin" />
//                 移動中
//               </span>
//             </div>

//             <div className="p-4">
//               <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
//                 <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
//                   <p className="text-[10px] font-black text-slate-400">出發</p>
//                   <p className="mt-1 truncate text-lg font-black text-slate-900">{movementRoute.fromName}</p>
//                   <p className="truncate text-xs font-bold text-slate-500">{movementRoute.fromLocation}</p>
//                 </div>
//                 <div className="hidden h-px w-10 bg-slate-200 sm:block" />
//                 <div className="rounded-xl border p-3" style={{borderColor: `${movementTone.color}55`, background: `${movementTone.color}10`}}>
//                   <p className="text-[10px] font-black text-slate-400">目的地</p>
//                   <p className="mt-1 truncate text-lg font-black" style={{color: movementTone.color}}>{movementRoute.toName}</p>
//                   <p className="truncate text-xs font-bold text-slate-500">{movementRoute.toLocation}</p>
//                 </div>
//               </div>

//               <div className="relative mt-4 h-24 overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white">
//                 <svg className="absolute inset-0 h-full w-full" viewBox="0 0 360 90" preserveAspectRatio="none" aria-hidden="true">
//                   <path d="M28 52 C105 8 238 8 332 52" fill="none" stroke="#e2e8f0" strokeWidth="5" strokeLinecap="round" />
//                   <path className="route-dash" d="M28 52 C105 8 238 8 332 52" fill="none" stroke={movementTone.color} strokeWidth="5" strokeLinecap="round" strokeDasharray="10 12" />
//                 </svg>
//                 <span className="absolute left-[8%] top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full ring-4 ring-white" style={{background: movementTone.color}} />
//                 <span className="absolute left-[92%] top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full ring-4 ring-white" style={{background: movementTone.color}} />
//                 <span
//                   className="route-move absolute top-1/2 flex h-12 w-12 items-center justify-center rounded-2xl text-white shadow-xl"
//                   style={{
//                     background: movementTone.color,
//                     boxShadow: `0 18px 34px -16px ${movementTone.color}`,
//                     animationDuration: movementTiming.durationStyle,
//                     animationDelay: movementTiming.delayStyle,
//                     animationFillMode: 'both',
//                   }}
//                 >
//                   <Bot className="h-6 w-6" strokeWidth={2.6} />
//                 </span>
//               </div>

//               <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
//                 <div
//                   className="mission-progress h-full rounded-full"
//                   style={{
//                     background: movementTone.color,
//                     animationDuration: movementTiming.durationStyle,
//                     animationDelay: movementTiming.delayStyle,
//                     animationFillMode: 'both',
//                   }}
//                 />
//               </div>
//               <p className="mt-3 text-center text-xs font-bold text-slate-500">移動期間暫停所有操作，抵達後才會更新目前位置。</p>
//             </div>
//           </div>
//         </div>
//       )}

//       {/* ═══════════════ 頂部浮動列 ═══════════════ */}
//       <div className="absolute top-5 left-5 right-5 flex items-start justify-between z-30 pointer-events-none">
//         <div className="pointer-events-auto flex max-w-[calc(100vw-15rem)] flex-col items-start gap-2 sm:max-w-[calc(100vw-22rem)] sm:flex-row sm:items-center">
//           <button
//             onClick={() => { audio.unlock(); audio.play('drawerOpen'); setLeftOpen(true); }}
//             className="flex items-center gap-2.5 pl-2 pr-4 py-2 bg-white/85 backdrop-blur-xl rounded-full shadow-lg border border-white/60 transition-all hover:scale-[1.02] active:scale-95"
//           >
//             <div
//               className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
//               style={{
//                 background: `linear-gradient(135deg, ${e.color}, ${e.color}cc)`,
//                 transition: 'background 600ms',
//                 boxShadow: `0 4px 12px ${e.glow}`
//               }}
//             >
//               <Brain className="w-4 h-4 text-white" strokeWidth={2.5} />
//             </div>
//             <div className="text-left">
//               <div className="text-[9px] tracking-[0.2em] text-stone-500 font-bold uppercase leading-none">Current</div>
//               <div className="font-display text-base font-bold leading-tight" style={{ color: e.color, transition: 'color 600ms' }}>
//                 {e.zh}
//               </div>
//             </div>
//             <Info className="w-4 h-4 text-stone-400 ml-1" />
//           </button>

//           {displayAssignment && (
//             <button
//               onClick={() => { audio.unlock(); audio.play('drawerOpen'); setLeftOpen(true); }}
//               className="flex max-w-full items-center gap-2.5 pl-2 pr-3 py-2 bg-white/85 backdrop-blur-xl rounded-full shadow-lg border border-white/60 transition-all hover:scale-[1.02] active:scale-95"
//               style={{ boxShadow: `0 8px 24px -16px ${ambientColor}` }}
//               title={`${displayAssignment.zoneName} / ${displayAssignment.location}`}
//             >
//               <div
//                 className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
//                 style={{
//                   background: `linear-gradient(135deg, ${ambientColor}, ${ambientColor}cc)`,
//                   transition: 'background 600ms',
//                   boxShadow: `0 4px 12px ${ambientGlow}`,
//                 }}
//               >
//                 <MapPin className="w-4 h-4 text-white" strokeWidth={2.5} />
//               </div>
//               <div className="min-w-0 text-left">
//                 <div className="text-[9px] tracking-[0.2em] text-stone-500 font-bold uppercase leading-none">Position</div>
//                 <div className="flex min-w-0 items-center gap-2">
//                   <span className="font-display max-w-[7.5rem] truncate text-base font-bold leading-tight sm:max-w-[10rem]" style={{ color: ambientColor, transition: 'color 600ms' }}>
//                     {displayAssignment.zoneName}
//                   </span>
//                   <span className="shrink-0 rounded-full px-2 py-0.5 text-[9px] font-black leading-none text-white" style={{ background: ambientColor }}>
//                     {displayAssignment.statusLabel || '待命'}
//                   </span>
//                 </div>
//                 <div className="mt-0.5 truncate text-[10px] font-bold leading-none text-stone-500">
//                   {displayAssignment.location}{displayAssignment.stage ? ` / ${displayAssignment.stage}` : ''}
//                 </div>
//               </div>
//             </button>
//           )}
//         </div>

//         <div className="pointer-events-auto flex items-center gap-2">
//           {/* 語音 + 音效開關 */}
//           <button
//             onClick={() => {
//               const next = !voiceEnabled;
//               setVoiceEnabled(next);
//               audio.setMuted(!next);
//               if (!next) tts.stop();
//               else { audio.unlock(); audio.play('tap'); }
//             }}
//             className="w-11 h-11 bg-white/85 backdrop-blur-xl rounded-full shadow-md border border-white/60 flex items-center justify-center text-stone-700 hover:scale-105 active:scale-95 transition-transform"
//             title={voiceEnabled ? '關閉聲音' : '開啟聲音'}
//           >
//             {voiceEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5 text-stone-400" />}
//           </button>
//           <button
//             onClick={toggleCamera}
//             disabled={cameraBusy}
//             className={`w-11 h-11 backdrop-blur-xl rounded-full shadow-md border flex items-center justify-center hover:scale-105 active:scale-95 transition-transform disabled:opacity-60 ${
//               cameraReady ? 'bg-cyan-500 text-white border-cyan-300' : 'bg-white/85 text-stone-700 border-white/60'
//             }`}
//             title={cameraReady ? '關閉手機相機' : '啟用手機相機'}
//           >
//             {cameraBusy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Camera className="w-5 h-5" />}
//           </button>
//           <div className="flex items-center gap-2 px-3 py-2 bg-white/85 backdrop-blur-xl rounded-full shadow-md border border-white/60 font-mono-tight text-xs text-stone-700 tabular-nums">
//             <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
//             {timeStr}
//           </div>
//           <div
//             className="flex items-center gap-1.5 px-3 py-2 backdrop-blur-xl rounded-full shadow-md border font-mono-tight text-[10px] font-bold transition-all duration-500"
//             style={{
//               background: bcConnected ? 'rgba(16,185,129,0.12)' : 'rgba(255,255,255,0.7)',
//               borderColor: bcConnected ? 'rgba(16,185,129,0.4)' : 'rgba(255,255,255,0.6)',
//               color: bcConnected ? '#059669' : '#94a3b8',
//             }}
//             title={bcConnected ? '已與主控 App3 連線同步 (LAN WiFi)' : '等待主控端 WiFi 橋接'}
//           >
//             <span className="w-1.5 h-1.5 rounded-full" style={{ background: bcConnected ? '#10b981' : '#cbd5e1', animation: bcConnected ? 'pulse 1.5s infinite' : 'none' }} />
//             {bcConnected ? 'SYNCED' : 'SOLO'}
//           </div>
//           <button
//             onClick={() => { audio.unlock(); audio.play('drawerOpen'); setRightOpen(true); }}
//             className="w-11 h-11 bg-white/85 backdrop-blur-xl rounded-full shadow-md border border-white/60 flex items-center justify-center text-stone-700 hover:scale-105 active:scale-95 transition-transform"
//             aria-label="設定"
//           >
//             <Settings className="w-5 h-5" />
//           </button>
//         </div>
//       </div>

//       {(cameraReady || cameraError) && (
//         <div className="absolute right-5 top-20 z-20 w-36 overflow-hidden rounded-3xl border border-white/60 bg-white/85 p-2 shadow-xl backdrop-blur-xl sm:w-44">
//           <div className="relative aspect-[3/4] overflow-hidden rounded-2xl bg-stone-950">
//             <video ref={cameraVideoRef} muted playsInline autoPlay className={`h-full w-full object-cover ${cameraReady ? 'opacity-100' : 'opacity-20'}`} />
//             {!cameraReady && (
//               <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-3 text-center text-white/70">
//                 <Camera className="h-6 w-6" />
//                 <p className="text-[10px] font-black leading-4">{cameraError || '相機待啟用'}</p>
//               </div>
//             )}
//           </div>
//           <p className="mt-2 truncate text-center text-[10px] font-black text-stone-500">
//             {cameraReady ? '手機相機已啟用' : '相機未啟用'}
//           </p>
//         </div>
//       )}

//       {/* ═══════════════ 機器人主舞台 ═══════════════ */}
//       <div
//         ref={stageRef}
//         className="absolute inset-0 flex items-center justify-center pb-44 pt-20"
//         style={{ pointerEvents: 'none' }}
//       >
//         {displayAssignment && (
//           <div
//             className="absolute h-[430px] w-[430px] rounded-full blur-3xl transition-all duration-700"
//             style={{background: `radial-gradient(circle, ${ambientColor}55 0%, transparent 68%)`}}
//           />
//         )}
//         <div className="w-full max-w-[420px] px-6" style={{ pointerEvents: 'auto' }}>
//           <Robot
//             emotion={emotion}
//             scanning={scanning}
//             eyeOffset={eyeOffset}
//             blinking={blinking}
//             pressed={pressed}
//             onTap={handleRobotTap}
//             talking={tts.speaking}
//             listening={stt.listening}
//           />
//         </div>
//       </div>

//       {/* ═══════════════ 對話泡泡 ═══════════════ */}
//       {bubble && !scanning && (
//         <div className="absolute top-24 left-1/2 -translate-x-1/2 z-20 max-w-[88%] sm:max-w-[460px] bubble-anim">
//           <div className="relative bg-white rounded-3xl px-5 py-4 shadow-xl border-2"
//             style={{ borderColor: `${e.color}55` }}>
//             <div className="flex items-center justify-between gap-3 mb-2">
//               <div className="flex items-center gap-2">
//                 <Sparkles className="w-4 h-4" style={{ color: e.color }} />
//                 <span className="text-[10px] font-bold tracking-[0.18em]" style={{ color: e.color }}>
//                   {introPlaying ? `自我介紹 · ${introStep + 1}/${INTRO_SCRIPT.length}` : 'ROBOT SAYS'}
//                 </span>
//                 {tts.speaking && (
//                   <span className="flex items-end gap-0.5 ml-1 h-3">
//                     {[0, 1, 2].map(i => (
//                       <span key={i} className="w-1 rounded-full"
//                         style={{
//                           height: '12px',
//                           background: e.color,
//                           animation: `bar-bounce 0.55s ease-in-out infinite`,
//                           animationDelay: `${i * 0.15}s`,
//                           transformOrigin: 'center'
//                         }} />
//                     ))}
//                   </span>
//                 )}
//               </div>
//               {introPlaying && (
//                 <button onClick={cancelIntro}
//                   className="text-[10px] px-2 py-1 rounded-full bg-stone-100 text-stone-600 hover:bg-stone-200 transition-colors font-bold tracking-wider">
//                   跳過
//                 </button>
//               )}
//             </div>
//             <p className="text-[15px] text-stone-800 leading-relaxed whitespace-pre-line">{bubble}</p>
//             <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-white border-r-2 border-b-2 rotate-45"
//               style={{ borderColor: `${e.color}55` }} />
//           </div>
//           {/* 進度條（介紹時） */}
//           {introPlaying && (
//             <div className="mt-2 h-1 bg-white/50 rounded-full overflow-hidden">
//               <div className="h-full bg-stone-800 rounded-full transition-all duration-500"
//                 style={{ width: `${((introStep + 1) / INTRO_SCRIPT.length) * 100}%` }} />
//             </div>
//           )}
//         </div>
//       )}

//       {/* ═══════════════ 掃描中提示 ═══════════════ */}
//       {scanning && (
//         <div className="absolute top-24 left-1/2 -translate-x-1/2 z-20 fade-in">
//           <div className="flex items-center gap-2.5 px-5 py-3 bg-cyan-500/15 backdrop-blur-xl border-2 border-cyan-500/40 rounded-full shadow-lg">
//             <ScanLine className="w-5 h-5 text-cyan-700 animate-pulse" />
//             <span className="text-sm font-mono-tight text-cyan-800 tracking-widest font-bold">SCANNING · 多重感知分析中</span>
//           </div>
//         </div>
//       )}

//       {/* ═══════════════ 使用者語音 transcript（聆聽中） ═══════════════ */}
//       {stt.listening && (
//         <div className="absolute bottom-44 left-1/2 -translate-x-1/2 z-20 max-w-[86%] slide-up">
//           <div className="bg-cyan-500 text-white rounded-3xl px-5 py-3 shadow-xl flex items-center gap-3">
//             <div className="flex items-end gap-1 h-7">
//               {[0, 1, 2, 3, 4].map(i => (
//                 <span key={i} className="w-1 bg-white rounded-full"
//                   style={{
//                     height: `${14 + (i % 2 === 0 ? 8 : 4)}px`,
//                     animation: 'bar-bounce 0.6s ease-in-out infinite',
//                     animationDelay: `${i * 0.08}s`,
//                     transformOrigin: 'center'
//                   }} />
//               ))}
//             </div>
//             <div className="flex-1">
//               <div className="text-[10px] tracking-widest font-bold opacity-80 mb-0.5">YOU</div>
//               <div className="text-sm font-medium min-h-[20px]">
//                 {stt.transcript || <span className="opacity-60">聆聽中...請對我說話</span>}
//               </div>
//             </div>
//           </div>
//         </div>
//       )}

//       {/* ═══════════════ 三按鈕底部列 ═══════════════ */}
//       <div className="absolute bottom-24 inset-x-0 flex justify-center items-end gap-3 z-20 pointer-events-none">
//         {/* 麥克風 */}
//         <div className="pointer-events-auto flex flex-col items-center gap-1.5">
//           <button
//             onClick={toggleListen}
//             disabled={scanning || introPlaying || !stt.supported}
//             className={`w-16 h-16 rounded-full flex items-center justify-center text-white shadow-lg transition-all duration-300 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed ${stt.listening ? 'mic-pulse' : ''}`}
//             style={{
//               background: stt.listening
//                 ? 'linear-gradient(135deg, #06B6D4, #0891B2)'
//                 : (stt.supported ? 'linear-gradient(135deg, #475569, #334155)' : 'linear-gradient(135deg, #9CA3AF, #6B7280)')
//             }}
//             title={stt.listening ? '停止聆聽' : '語音對話'}
//           >
//             {stt.listening ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
//           </button>
//           <span className="text-[10px] font-bold tracking-widest text-stone-700">
//             {stt.listening ? '聆聽中' : '語音對話'}
//           </span>
//         </div>

//         {/* 主掃描 */}
//         <div className="pointer-events-auto flex flex-col items-center gap-1.5">
//           <button
//             onClick={startScan}
//             disabled={scanning || introPlaying}
//             className={`relative group rounded-full px-7 py-5 text-white font-display font-bold text-lg tracking-tight ${scanning ? '' : 'scan-pulse'} disabled:opacity-90 flex items-center gap-2.5 transition-transform active:scale-95`}
//             style={{
//               background: scanning
//                 ? 'linear-gradient(135deg, #06B6D4 0%, #0891B2 100%)'
//                 : `linear-gradient(135deg, #0F172A 0%, #1E293B 100%)`,
//               minHeight: '64px',
//               transition: 'background 400ms, transform 200ms'
//             }}
//           >
//             {scanning ? (
//               <>
//                 <ScanLine className="w-5 h-5 animate-pulse" />
//                 <span>掃描中…</span>
//               </>
//             ) : (
//               <>
//                 <ScanLine className="w-5 h-5 group-hover:rotate-90 transition-transform duration-500" />
//                 <span>開始情緒掃描</span>
//               </>
//             )}
//           </button>
//           <span className="text-[10px] font-bold tracking-widest text-stone-700">SCAN</span>
//         </div>

//         {/* 自我介紹 */}
//         <div className="pointer-events-auto flex flex-col items-center gap-1.5">
//           <button
//             onClick={() => introPlaying ? cancelIntro() : playIntro()}
//             disabled={scanning}
//             className="w-16 h-16 rounded-full flex items-center justify-center text-white shadow-lg transition-all duration-300 active:scale-95 disabled:opacity-40"
//             style={{
//               background: introPlaying
//                 ? 'linear-gradient(135deg, #EF4444, #DC2626)'
//                 : `linear-gradient(135deg, ${e.color}, ${e.color}cc)`,
//               transition: 'background 400ms'
//             }}
//             title={introPlaying ? '停止介紹' : '自我介紹'}
//           >
//             {introPlaying ? <Pause className="w-6 h-6" /> : <Hand className="w-6 h-6" />}
//           </button>
//           <span className="text-[10px] font-bold tracking-widest text-stone-700">
//             {introPlaying ? '播放中' : '自我介紹'}
//           </span>
//         </div>
//       </div>

//       {/* ═══════════════ 底部抽屜把手 ═══════════════ */}
//       <button
//         onClick={() => { audio.unlock(); audio.play('drawerOpen'); setBottomOpen(true); }}
//         className="absolute bottom-0 inset-x-0 z-10 pointer-events-auto flex flex-col items-center pt-3 pb-4 group"
//       >
//         <div className="flex flex-col items-center gap-1.5 handle-bounce">
//           <div className="flex items-center gap-2 px-4 py-1.5 bg-white/80 backdrop-blur-xl rounded-full shadow-md border border-white/60 group-hover:bg-white transition-colors">
//             <ChevronUp className="w-3.5 h-3.5 text-stone-600" />
//             <span className="text-[11px] font-mono-tight text-stone-700 tracking-widest font-bold">DASHBOARD</span>
//             <ChevronUp className="w-3.5 h-3.5 text-stone-600" />
//           </div>
//           <span className="text-[10px] text-stone-500">向上滑動查看儀表板</span>
//         </div>
//       </button>

//       {/* 背景遮罩 */}
//       <div
//         onClick={closeAll}
//         className="absolute inset-0 bg-black/30 backdrop-blur-sm z-30 transition-opacity duration-400"
//         style={{
//           opacity: anyDrawerOpen ? 1 : 0,
//           pointerEvents: anyDrawerOpen ? 'auto' : 'none'
//         }}
//       />

//       {/* ═══════════════ 左抽屜 ═══════════════ */}
//       <Drawer position="left" open={leftOpen} onClose={() => setLeftOpen(false)}>
//         <div className="px-6 pt-6 pb-8">
//           <div className="text-[10px] tracking-[0.2em] text-stone-500 font-bold uppercase mb-2">System Status</div>
//           <h2 className="font-display text-3xl font-bold text-stone-900 tracking-tight mb-1">系統狀態</h2>
//           <p className="text-xs text-stone-500 mb-6">Edge AI · 邊緣運算保護隱私</p>

//           <div className="rounded-2xl p-5 mb-5 relative overflow-hidden border"
//             style={{ background: `linear-gradient(135deg, ${e.light}cc, white)`, borderColor: `${e.color}40` }}>
//             <div className="flex items-center justify-between mb-2">
//               <div className="text-[10px] tracking-[0.2em] text-stone-500 uppercase font-bold">即時偵測</div>
//               {isLiveData && <div className="text-[9px] font-bold tracking-widest px-2 py-0.5 rounded-full" style={{ background: e.color, color: 'white' }}>LIVE</div>}
//             </div>
//             <div className="flex items-baseline gap-2 mb-1">
//               <span className="font-display text-4xl font-bold" style={{ color: e.color }}>{e.zh}</span>
//               <span className="text-sm font-mono-tight text-stone-400">{e.en}</span>
//             </div>
//             {(displayMoodLabel || displayRiskLabel) && (
//               <div className="flex items-center gap-2 mb-3">
//                 {displayMoodLabel && <span className="text-[10px] font-bold text-stone-500">心情：{displayMoodLabel}</span>}
//                 {displayRiskLabel && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: `${e.color}22`, color: e.color }}>{displayRiskLabel}</span>}
//               </div>
//             )}
//             <div className="space-y-2 mt-2">
//               <StatBar label="壓力指數" value={displayStress} color={e.color} />
//               <StatBar label="穩定度" value={displayStability} color="#14B8A6" />
//               <StatBar label="專注力" value={displayFocus} color="#0EA5E9" />
//             </div>
//           </div>

//           <div className="text-[10px] tracking-[0.2em] text-stone-500 font-bold uppercase mb-3">語音引擎</div>
//           <div className="rounded-2xl p-4 mb-4 bg-stone-50 border border-stone-200">
//             <div className="grid grid-cols-2 gap-3">
//               <div className="flex flex-col">
//                 <div className="flex items-center gap-1.5 mb-1">
//                   <Volume2 className="w-3.5 h-3.5 text-stone-600" />
//                   <span className="text-[10px] tracking-widest text-stone-500 font-bold">TTS</span>
//                 </div>
//                 <div className={`text-xs font-bold ${tts.supported ? 'text-emerald-600' : 'text-stone-400'}`}>
//                   {tts.supported ? '✓ 可用' : '✗ 不支援'}
//                 </div>
//                 <div className="text-[10px] text-stone-500 font-mono-tight">{tts.speaking ? 'SPEAKING…' : 'STANDBY'}</div>
//               </div>
//               <div className="flex flex-col">
//                 <div className="flex items-center gap-1.5 mb-1">
//                   <Mic className="w-3.5 h-3.5 text-stone-600" />
//                   <span className="text-[10px] tracking-widest text-stone-500 font-bold">STT</span>
//                 </div>
//                 <div className={`text-xs font-bold ${stt.supported ? 'text-emerald-600' : 'text-stone-400'}`}>
//                   {stt.supported ? '✓ 可用' : '✗ 不支援'}
//                 </div>
//                 <div className="text-[10px] text-stone-500 font-mono-tight">{stt.listening ? 'LISTENING…' : 'STANDBY'}</div>
//               </div>
//             </div>
//           </div>

//           {/* 語音選擇 + 試聽 */}
//           {tts.supported && (() => {
//             const allVoices = tts.voices || [];
//             const zhVoices = allVoices.filter(v => /^(zh|cmn)/i.test(v.lang) || /chinese|mandarin|中文|國語|普通話|粵語/i.test(v.name));
//             const noChineseVoice = allVoices.length > 0 && zhVoices.length === 0;
//             return (
//               <div className="rounded-2xl p-4 mb-6 bg-white border border-stone-200">
//                 <div className="flex items-center justify-between mb-3">
//                   <span className="text-[10px] tracking-[0.2em] text-stone-500 font-bold uppercase">中文語音</span>
//                   <span className="text-[10px] font-mono-tight text-stone-400">
//                     {zhVoices.length} / {allVoices.length}
//                   </span>
//                 </div>

//                 {noChineseVoice && (
//                   <div className="mb-3 p-3 rounded-xl bg-amber-50 border border-amber-200">
//                     <div className="flex items-start gap-2">
//                       <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
//                       <div className="text-[11px] text-amber-900 leading-relaxed">
//                         <div className="font-bold mb-1">未偵測到中文語音</div>
//                         <div>iPad 請確認系統語言含中文。Android 請至「設定 → 語言與輸入 → 文字轉語音」安裝中文語音資料。</div>
//                       </div>
//                     </div>
//                   </div>
//                 )}

//                 {allVoices.length === 0 && (
//                   <div className="text-xs text-stone-500 mb-3 flex items-center gap-2">
//                     <Loader2 className="w-3.5 h-3.5 animate-spin" />
//                     語音清單載入中…
//                   </div>
//                 )}

//                 {(zhVoices.length > 0 ? zhVoices : allVoices.slice(0, 8)).map((v, i) => {
//                   const isSelected = tts.currentVoice && tts.currentVoice.voiceURI === v.voiceURI;
//                   return (
//                     <button
//                       key={v.voiceURI || i}
//                       onClick={() => { tts.setVoice(v); audio.unlock(); audio.play('tap'); }}
//                       className="w-full flex items-center justify-between gap-2 p-2.5 rounded-xl mb-1.5 text-left transition-colors"
//                       style={{
//                         background: isSelected ? '#0F172A' : '#F5F5F4',
//                         color: isSelected ? 'white' : '#44403C',
//                         borderColor: isSelected ? '#0F172A' : '#E7E5E4',
//                         border: '1px solid'
//                       }}
//                     >
//                       <div className="min-w-0 flex-1">
//                         <div className="text-xs font-bold truncate">{v.name}</div>
//                         <div className={`text-[10px] font-mono-tight ${isSelected ? 'text-stone-400' : 'text-stone-500'}`}>{v.lang}</div>
//                       </div>
//                       {isSelected && <span className="text-[10px] font-bold tracking-widest opacity-90">選中</span>}
//                     </button>
//                   );
//                 })}

//                 {/* 試聽按鈕 */}
//                 <button
//                   onClick={() => {
//                     audio.unlock();
//                     audio.play('speak');
//                     tts.speak('你好，我是情緒小幫手！');
//                   }}
//                   className="w-full mt-2 px-4 py-3 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 text-white font-bold text-sm flex items-center justify-center gap-2 active:scale-95 transition-transform"
//                 >
//                   <PlayCircle className="w-4 h-4" />
//                   試聽：「你好，我是情緒小幫手！」
//                 </button>
//               </div>
//             );
//           })()}

//           <div className="text-[10px] tracking-[0.2em] text-stone-500 font-bold uppercase mb-3">感測器</div>
//           <div className="space-y-2 mb-6">
//             {[
//               { icon: <Camera className="w-4 h-4" />, label: '攝影鏡頭 Camera', val: 'ONLINE · 30fps' },
//               { icon: <Mic className="w-4 h-4" />, label: '麥克風陣列 Mic', val: 'ONLINE · -42dB' },
//               { icon: <Wifi className="w-4 h-4" />, label: '5G / Wi-Fi', val: 'ONLINE · 92ms' },
//               { icon: <Activity className="w-4 h-4" />, label: '空氣品質 AQ', val: 'ONLINE · 良好' }
//             ].map((s, i) => (
//               <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-stone-50 border border-stone-100">
//                 <div className="w-9 h-9 rounded-lg bg-white flex items-center justify-center text-stone-700 shrink-0 shadow-sm">{s.icon}</div>
//                 <div className="flex-1 min-w-0">
//                   <div className="text-sm font-medium text-stone-800">{s.label}</div>
//                   <div className="text-[10px] font-mono-tight text-stone-500">{s.val}</div>
//                 </div>
//                 <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
//               </div>
//             ))}
//           </div>

//           <div className="text-[10px] tracking-[0.2em] text-stone-500 font-bold uppercase mb-3">部署節點</div>
//           <div className="rounded-2xl bg-stone-900 text-stone-100 p-4 mb-6 relative overflow-hidden">
//             <div className="space-y-2 relative z-10">
//               {[
//                 { z: '教室 Classroom', n: '12', s: 'ok' },
//                 { z: '走廊 Hallway', n: '6', s: 'ok' },
//                 { z: '操場 Playground', n: '3', s: 'ok' },
//                 { z: '廁所周邊 Restroom', n: '4', s: 'alert' },
//                 { z: '輔導室 Counselor', n: '1', s: 'ok' }
//               ].map((z, i) => (
//                 <div key={i} className="flex items-center justify-between text-xs">
//                   <span className="text-stone-300">{z.z}</span>
//                   <div className="flex items-center gap-2">
//                     <span className="font-mono-tight text-stone-400">×{z.n}</span>
//                     <span className={`w-1.5 h-1.5 rounded-full ${z.s === 'alert' ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'}`} />
//                   </div>
//                 </div>
//               ))}
//             </div>
//             <Shield className="absolute -right-4 -bottom-4 w-24 h-24 text-stone-700 opacity-30" />
//           </div>

//           <div className="rounded-2xl bg-gradient-to-br from-stone-100 to-stone-50 p-4 border border-stone-200">
//             <div className="text-[10px] tracking-[0.2em] text-stone-500 font-bold uppercase mb-1">參賽資訊</div>
//             <div className="font-display text-base font-bold text-stone-900 leading-tight mb-1">
//               115 年度資通訊應用大賽
//             </div>
//             <div className="text-xs text-stone-600">智組型機器人 · 創意賽</div>
//             <div className="mt-3 pt-3 border-t border-stone-200 flex items-center justify-between">
//               <span className="text-xs font-medium text-stone-700">隊伍</span>
//               <span className="font-display text-sm font-bold" style={{ color: e.color }}>印度咖喱隊</span>
//             </div>
//           </div>
//         </div>
//       </Drawer>

//       {/* ═══════════════ 右抽屜 ═══════════════ */}
//       <Drawer position="right" open={rightOpen} onClose={() => setRightOpen(false)}>
//         <div className="px-6 pt-6 pb-8">
//           <div className="text-[10px] tracking-[0.2em] text-stone-500 font-bold uppercase mb-2">Settings & Test</div>
//           <h2 className="font-display text-3xl font-bold text-stone-900 tracking-tight mb-1">情緒設定</h2>
//           <p className="text-xs text-stone-500 mb-6">Manual emotion test · 手動測試六大情緒狀態</p>

//           {/* 自我介紹按鈕 */}
//           <button
//             onClick={() => playIntro()}
//             disabled={introPlaying}
//             className="w-full mb-6 p-4 rounded-2xl bg-gradient-to-br from-stone-900 to-stone-700 text-white text-left flex items-center gap-3 active:scale-95 transition-transform disabled:opacity-50"
//           >
//             <div className="w-11 h-11 rounded-xl bg-white/15 flex items-center justify-center backdrop-blur">
//               <PlayCircle className="w-6 h-6" />
//             </div>
//             <div className="flex-1">
//               <div className="font-display text-lg font-bold leading-tight">聽我自我介紹</div>
//               <div className="text-[11px] opacity-70 mt-0.5">Hear Robot Self-Introduction</div>
//             </div>
//             <Sparkles className="w-5 h-5 text-amber-300" />
//           </button>

//           <div className="text-[10px] tracking-[0.2em] text-stone-500 font-bold uppercase mb-3">情緒測試</div>
//           <div className="grid grid-cols-2 gap-3 mb-6">
//             {Object.entries(EMOTIONS).map(([key, val]) => (
//               <button
//                 key={key}
//                 onClick={() => setManual(key)}
//                 disabled={scanning || introPlaying}
//                 className="group relative p-4 rounded-2xl border-2 text-left transition-all duration-300 disabled:opacity-50 active:scale-95"
//                 style={{
//                   background: emotion === key ? `linear-gradient(135deg, ${val.color}, ${val.color}dd)` : 'white',
//                   color: emotion === key ? 'white' : '#44403C',
//                   borderColor: emotion === key ? val.color : '#E7E5E4',
//                   boxShadow: emotion === key ? `0 12px 28px -10px ${val.color}` : 'none',
//                   transform: emotion === key ? 'translateY(-2px)' : 'none',
//                   minHeight: '92px'
//                 }}
//               >
//                 <div className="flex items-center gap-2 mb-1">
//                   <span className="w-2.5 h-2.5 rounded-full" style={{ background: emotion === key ? 'white' : val.color }} />
//                   <span className="text-[9px] tracking-widest font-bold opacity-80">{val.short}</span>
//                 </div>
//                 <div className="font-display text-2xl font-bold tracking-tight">{val.zh}</div>
//                 <div className="text-[10px] font-mono-tight opacity-70 mt-0.5">{val.en}</div>
//                 <div className="text-[10px] mt-2 opacity-80">壓力 {val.stress}%</div>
//               </button>
//             ))}
//           </div>

//           <div className="rounded-2xl p-4 mb-5 border"
//             style={{ background: `${e.light}88`, borderColor: `${e.color}40` }}>
//             <div className="flex items-center gap-2 mb-2">
//               <div className="w-7 h-7 rounded-lg bg-stone-900 flex items-center justify-center">
//                 <Zap className="w-3.5 h-3.5 text-amber-300" />
//               </div>
//               <span className="text-[10px] tracking-[0.2em] text-stone-600 uppercase font-bold">AI 即時建議</span>
//             </div>
//             <p className="text-sm text-stone-800 leading-relaxed">{e.advice}</p>
//           </div>

//           {/* 語音對話試試看 */}
//           <div className="rounded-2xl p-4 bg-stone-50 border border-stone-200">
//             <div className="flex items-center gap-2 mb-3">
//               <MessageCircle className="w-4 h-4 text-stone-700" />
//               <span className="text-[10px] tracking-[0.2em] text-stone-600 uppercase font-bold">試試語音對話</span>
//             </div>
//             <div className="text-xs text-stone-600 mb-3 leading-relaxed">
//               點下方麥克風後，試著說：
//             </div>
//             <div className="flex flex-wrap gap-1.5">
//               {['我好難過', '我有點緊張', '今天好開心', '我要考試了', '你是誰？'].map((q, i) => (
//                 <span key={i} className="px-2.5 py-1 text-[11px] bg-white border border-stone-200 rounded-full text-stone-600">
//                   「{q}」
//                 </span>
//               ))}
//             </div>
//           </div>
//         </div>
//       </Drawer>

//       {/* ═══════════════ 底抽屜：儀表板 ═══════════════ */}
//       <Drawer position="bottom" open={bottomOpen} onClose={() => setBottomOpen(false)}>
//         <div className="px-6 pb-8">
//           <div className="text-[10px] tracking-[0.2em] text-stone-500 font-bold uppercase mb-1 text-center">Live Dashboard</div>
//           <h2 className="font-display text-2xl font-bold text-stone-900 tracking-tight text-center mb-5">即時儀表板</h2>

//           <div className="rounded-3xl p-5 mb-4 relative overflow-hidden border"
//             style={{ background: `linear-gradient(135deg, ${e.light}cc, white)`, borderColor: `${e.color}40` }}>
//             <div className="flex items-start justify-between mb-3">
//               <div>
//                 <div className="flex items-center gap-2 mb-1">
//                   <div className="text-[10px] tracking-[0.2em] text-stone-500 uppercase font-bold">Current Emotion</div>
//                   {isLiveData && <div className="text-[9px] font-bold tracking-widest px-1.5 py-0.5 rounded-full" style={{ background: e.color, color: 'white' }}>LIVE</div>}
//                 </div>
//                 <div className="flex items-baseline gap-2">
//                   <h3 className="font-display text-4xl font-bold tracking-tight" style={{ color: e.color }}>{e.zh}</h3>
//                   <span className="text-sm font-mono-tight text-stone-400">{e.en}</span>
//                 </div>
//                 {(displayMoodLabel || displayRiskLabel) && (
//                   <div className="flex items-center gap-2 mt-1">
//                     {displayMoodLabel && <span className="text-[10px] font-bold text-stone-500">心情：{displayMoodLabel}</span>}
//                     {displayRiskLabel && <span className="text-[10px] font-bold" style={{ color: e.color }}>{displayRiskLabel}</span>}
//                   </div>
//                 )}
//               </div>
//               <div className="text-right">
//                 <div className="px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wider mb-1" style={{ background: e.color, color: 'white' }}>
//                   {e.short}
//                 </div>
//                 {displayFusionScore !== null && (
//                   <div className="text-[10px] font-mono-tight text-stone-500">融合 {displayFusionScore}/10</div>
//                 )}
//               </div>
//             </div>
//             <div className="flex items-center justify-around gap-2 mt-4">
//               <Gauge value={displayStress} color={e.color} label="壓力指數" size="lg" />
//               <Gauge value={displayStability} color="#14B8A6" label="穩定度" size="lg" />
//               <Gauge value={displayFocus} color="#0EA5E9" label="專注力" size="lg" />
//             </div>
//           </div>

//           <div className="rounded-2xl bg-white p-5 border border-stone-200 mb-4">
//             <div className="flex items-center justify-between mb-4">
//               <div className="flex items-center gap-2">
//                 <Activity className="w-4 h-4 text-stone-700" />
//                 <span className="text-sm font-bold text-stone-800">多重感知融合</span>
//               </div>
//               <span className="text-[10px] font-mono-tight text-stone-400 tracking-widest">
//                 {isLiveData ? 'APP3 · LIVE' : 'DEMO MODE'}
//               </span>
//             </div>
//             {isLiveData && displaySignals ? (
//               <div className="grid grid-cols-2 gap-x-5 gap-y-3">
//                 <StatBar label="心情訊號 Mood" value={Math.round((displaySignals.moodScore / 2) * 100)} color={e.color} />
//                 <StatBar label="聲量訊號 Acoustic" value={Math.round((displaySignals.soundScore / 3) * 100)} color="#14B8A6" />
//                 <StatBar label="節點狀態 Nodes" value={Math.max(0, 100 - Math.round((displaySignals.nodeScore / 3) * 100))} color="#0EA5E9" />
//                 <StatBar label="警示狀態 Alerts" value={Math.max(0, 100 - Math.round((displaySignals.alertScore / 2) * 100))} color="#A855F7" />
//               </div>
//             ) : (
//               <div className="grid grid-cols-2 gap-x-5 gap-y-3">
//                 <StatBar label="臉部表情 Face" value={e.stability} color={e.color} />
//                 <StatBar label="語音語氣 Voice" value={Math.round((e.stability + e.focus) / 2)} color="#14B8A6" />
//                 <StatBar label="行為模式 Behavior" value={e.focus} color="#0EA5E9" />
//                 <StatBar label="環境感測 Ambient" value={Math.max(20, 100 - e.stress)} color="#A855F7" />
//               </div>
//             )}
//           </div>

//           <div className="rounded-2xl bg-white p-5 border border-stone-200 mb-4">
//             <div className="flex items-center justify-between mb-3">
//               <div className="flex items-center gap-2">
//                 <TrendingUp className="w-4 h-4 text-stone-700" />
//                 <span className="text-sm font-bold text-stone-800">情緒偵測時間軸</span>
//               </div>
//               <span className="text-[10px] font-mono-tight text-stone-400 tracking-widest">RECENT 5</span>
//             </div>
//             <div className="flex items-stretch gap-2 overflow-x-auto pb-1 hide-scroll">
//               {history.map((h, i) => {
//                 const ev = EMOTIONS[h.e];
//                 return (
//                   <div key={i} className="flex-shrink-0 rounded-xl p-3 min-w-[110px] border"
//                     style={{ background: `${ev.light}88`, borderColor: `${ev.color}33` }}>
//                     <div className="text-[9px] font-mono-tight text-stone-500 tracking-widest mb-1">{h.t}</div>
//                     <div className="font-display font-bold text-base" style={{ color: ev.color }}>{ev.zh}</div>
//                     <div className="text-[10px] text-stone-500 mt-0.5">壓力 {ev.stress}%</div>
//                   </div>
//                 );
//               })}
//               {history.length < 5 && Array.from({ length: 5 - history.length }).map((_, i) => (
//                 <div key={`p-${i}`} className="flex-shrink-0 rounded-xl p-3 min-w-[110px] border border-dashed border-stone-300 bg-stone-50/50 flex items-center justify-center">
//                   <span className="text-stone-300 text-xs">—</span>
//                 </div>
//               ))}
//             </div>
//           </div>

//           <div className="overflow-hidden rounded-full bg-stone-900 text-stone-300 px-4 py-2 font-mono-tight text-[10px] tracking-widest">
//             <div className="flex whitespace-nowrap ticker-anim">
//               <TickerContent e={e} stress={displayStress} stability={displayStability} isLive={isLiveData} moodLabel={displayMoodLabel} riskLabel={displayRiskLabel} fusionScore={displayFusionScore} />
//               <TickerContent e={e} stress={displayStress} stability={displayStability} isLive={isLiveData} moodLabel={displayMoodLabel} riskLabel={displayRiskLabel} fusionScore={displayFusionScore} />
//             </div>
//           </div>
//         </div>
//       </Drawer>
//     </div>
//   );
// }

// const TickerContent = ({ e, stress, stability, isLive, moodLabel, riskLabel, fusionScore }) => (
//   <div className="flex items-center gap-8 px-4 shrink-0">
//     <span>● 系統正常 SYSTEM OK</span>
//     <span style={{ color: e.color }}>● 當前狀態 {e.short}</span>
//     {isLive ? (
//       <>
//         <span>● 壓力指數 {stress}%</span>
//         <span>● 穩定度 {stability}%</span>
//         {moodLabel && <span style={{ color: e.color }}>● 心情：{moodLabel}</span>}
//         {riskLabel && <span>● {riskLabel}</span>}
//         {fusionScore !== null && <span>● AI融合分數 {fusionScore}/10</span>}
//         <span style={{ color: '#10b981' }}>● APP3 LIVE SYNC</span>
//       </>
//     ) : (
//       <>
//         <span>● 壓力指數 {e.stress}%</span>
//         <span>● 穩定度 {e.stability}%</span>
//         <span>● 邊緣運算延遲 92ms</span>
//         <span>● DEMO MODE</span>
//       </>
//     )}
//     <span>● 加密保護 AES-256</span>
//     <span>● 5 節點 ONLINE</span>
//   </div>
// );
