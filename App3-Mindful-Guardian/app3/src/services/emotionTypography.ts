import type {MoodType} from '../types';

export type EmotionTone = 'bright' | 'steady' | 'rest' | 'support';

export interface EmotionTypographyResult {
  mood: MoodType;
  tone: EmotionTone;
  label: string;
  intensity: number;
  fontClass: string;
  preview: string;
  guidance: string;
  keywords: string[];
}

const keywordGroups: Array<{
  mood: MoodType;
  tone: EmotionTone;
  label: string;
  keywords: string[];
  guidance: string;
  fontClass: string;
}> = [
  {
    mood: 'worried',
    tone: 'support',
    label: '需要支持',
    keywords: ['不想活', '想死', '自殺', '消失', '傷害自己', '活不下去', '被欺負', '害怕', '焦慮', '擔心', '崩潰'],
    guidance: '先把訊息轉成低刺激、高可讀的支持樣式，並提醒老師保留關懷紀錄。',
    fontClass: 'tracking-normal font-black text-rose-700',
  },
  {
    mood: 'tired',
    tone: 'rest',
    label: '疲累降載',
    keywords: ['累', '疲倦', '睡不著', '沒力', '壓力', '考試', '煩', '喘不過氣'],
    guidance: '使用較寬鬆的行距與柔和重量，讓學生能慢慢讀完並降低壓迫感。',
    fontClass: 'tracking-normal font-semibold text-amber-700',
  },
  {
    mood: 'happy',
    tone: 'bright',
    label: '正向放大',
    keywords: ['開心', '進步', '成功', '謝謝', '喜歡', '做到', '很好', '放心'],
    guidance: '保留明亮、有力量的字重，用來回饋成就感與同儕支持。',
    fontClass: 'tracking-normal font-black text-emerald-700',
  },
  {
    mood: 'steady',
    tone: 'steady',
    label: '穩定陪伴',
    keywords: ['還好', '普通', '可以', '慢慢', '平常', '不知道'],
    guidance: '維持清楚中性的閱讀節奏，適合一般心情簽到與匿名留言。',
    fontClass: 'tracking-normal font-bold text-sky-700',
  },
];

function uniqueMatches(text: string, keywords: string[]) {
  return keywords.filter((keyword) => text.includes(keyword));
}

export function analyzeEmotionTypography(input: string): EmotionTypographyResult {
  const text = input.trim();
  const source = text || '今天還可以，我想慢慢把事情做好。';
  const scored = keywordGroups
    .map((group) => ({...group, matches: uniqueMatches(source, group.keywords)}))
    .sort((a, b) => b.matches.length - a.matches.length);
  const fallback = {...keywordGroups[3], matches: []};
  const best = scored[0].matches.length > 0 ? scored[0] : fallback;
  const intensity = Math.min(95, 48 + best.matches.length * 17 + Math.min(13, Math.floor(source.length / 12)));
  const preview = source.length > 72 ? `${source.slice(0, 72)}...` : source;

  return {
    mood: best.mood,
    tone: best.tone,
    label: best.label,
    intensity,
    fontClass: best.fontClass,
    preview,
    guidance: best.guidance,
    keywords: best.matches,
  };
}
