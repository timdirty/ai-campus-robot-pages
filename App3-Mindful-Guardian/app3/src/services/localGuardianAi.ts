import {GuardianAlert, GuardianState} from '../types';
import {askGemini} from './geminiAi';

// ---------------------------------------------------------------------------
// Fallback template bank
// ---------------------------------------------------------------------------

const CRISIS_TEMPLATES = [
  '你說的話讓我很擔心你。請你現在去找輔導老師，或撥打心理諮詢專線1925。你不是一個人。',
  '聽到你說這些，我想先確認你現在是安全的。請你告訴一位你信任的大人，輔導室就在你身邊。',
  '你願意說出來，這需要很大的勇氣。現在最重要的是讓你平安。請你陪我一起去輔導室，好嗎？',
];

const BULLYING_TEMPLATES = [
  '你被這樣對待，真的很不公平，你有權利被尊重。可以告訴我發生了什麼事嗎？',
  '謝謝你告訴我這件事。霸凌不是你的錯。我們可以一起去跟老師說，讓大人幫忙處理。',
  '聽起來你受了很多委屈。你現在身邊安全嗎？讓我們一起想辦法，這種情況是可以改變的。',
  '你願意開口說出來，這是很勇敢的一步。霸凌問題需要大人介入，老師和輔導師都可以幫助你。',
  '你不需要一個人扛。先記錄下發生的事（時間、地點、對方的言行），這些資訊能幫助老師處理。',
];

const ACADEMIC_STRESS_TEMPLATES = [
  '考試壓力很正常，幾乎每個同學都有。試著把大的目標拆成小步驟，每天完成一點點，不要一次全部想。',
  '成績只是學習的一部分，不代表你這個人的全部價值。你還有很多地方是很棒的。',
  '考試前焦慮是身體在幫你準備，這是正常的。深呼吸、規律作息、適當休息——這些都能幫助你發揮最好。',
  '如果某個科目一直學不好，可以去找老師問問題，或者找同學一起複習。不用獨自面對。',
  '我理解你現在的壓力。學習有困難的時候，最重要的是不要放棄，一步一步來。',
  '成績暫時不好沒關係，重要的是從中找出哪裡需要加強。你已經很努力了，再給自己一點時間。',
];

const SOCIAL_ISOLATION_TEMPLATES = [
  '感到孤單是很真實的感受，你不是唯一有這種感覺的人。願意和我多說一點嗎？',
  '有時候融入一個新環境需要時間。試著找一個你有興趣的社團或活動，從共同興趣開始認識人。',
  '你有沒有一個你覺得還OK的同學？也許可以從一對一的互動開始，慢慢建立連結。',
  '孤單的感覺很難受，但這不是你的問題。每個人找到朋友的時間和方式都不一樣。',
  '輔導老師可以幫你想想怎麼更自在地和大家相處。你有興趣去聊聊嗎？',
];

const GENERAL_TIRED_TEMPLATES = [
  '聽起來你最近真的很累。好好休息是很重要的，你有照顧自己的時間嗎？',
  '壓力大的時候身體和心都會累。試著今晚早點睡，明天可能會好一些。',
  '你願意說說是什麼讓你這麼累嗎？有時候說出來，感覺會輕一點。',
  '疲憊的時候容易覺得一切都很難。你現在能做的最小一件讓自己舒服的事是什麼？',
  '你不需要一直撐著。適當的休息不是懶惰，是讓自己能繼續前進的方法。',
];

const POSITIVE_GRATITUDE_TEMPLATES = [
  '聽到你這麼說，我也覺得很開心！你的努力被看見了。',
  '這真的很棒！你可以告訴我是怎麼做到的嗎？',
  '每一個小小的進步都值得被肯定。繼續保持！',
  '感謝你分享這個好消息。你的正能量也感染到我了。',
  '真的好厲害！你為自己努力的樣子很令人欽佩。',
  '開心的事要好好記住。當以後遇到困難的時候，這些快樂可以給你力量。',
];

const GENERAL_TEMPLATES = [
  '謝謝你和我說這些。我在這裡陪你，你想繼續說說嗎？',
  '聽起來你今天有很多感受。能告訴我更多嗎？',
  '我聽到了你說的話。不管什麼事，你都可以來和我說。',
  '每個人都有狀況不太好的時候，這沒關係。你現在感覺怎麼樣？',
  '你能說出你的感受，這本身就是很重要的一步。我在這裡支持你。',
];

// ---------------------------------------------------------------------------
// Keyword detection & deterministic selector
// ---------------------------------------------------------------------------

function pickTemplate(templates: string[], seed: string): string {
  return templates[seed.length % templates.length];
}

function selectLocalFallback(text: string, mood?: string): string {
  // Crisis always wins regardless of mood
  if (/想死|活不下去|自殺|不想活|消失|傷害自己|尋死|割腕|跳樓|喝農藥|結束生命|不想存在/.test(text)) {
    return pickTemplate(CRISIS_TEMPLATES, text);
  }

  // Check text keywords first (most specific signal)
  if (/被欺負|霸凌|嘲笑|排擠|孤立|打我|罵我/.test(text)) {
    return pickTemplate(BULLYING_TEMPLATES, text);
  }
  if (/考試|成績|不及格|壓力|讀書|功課|怕|緊張/.test(text)) {
    return pickTemplate(ACADEMIC_STRESS_TEMPLATES, text);
  }
  if (/沒朋友|孤單|沒人理|被忽略|融不入|格格不入/.test(text)) {
    return pickTemplate(SOCIAL_ISOLATION_TEMPLATES, text);
  }
  if (/累|疲憊|很累|撐不住|睡不好|沒精神|想休息/.test(text)) {
    return pickTemplate(GENERAL_TIRED_TEMPLATES, text);
  }
  if (/開心|感謝|很棒|成功|進步|高興|快樂/.test(text)) {
    return pickTemplate(POSITIVE_GRATITUDE_TEMPLATES, text);
  }

  // Mood fallback when no keyword matches
  if (mood) {
    const moodCategory: Record<string, string> = {
      'anxious': 'academic_stress',  // 焦慮
      'sad': 'social_isolation',     // 難過
      'angry': 'bullying',           // 憤怒
      'tired': 'general_tired',      // 疲憊
      'happy': 'positive_gratitude', // 開心
    };
    const category = moodCategory[mood];
    if (category === 'academic_stress') return pickTemplate(ACADEMIC_STRESS_TEMPLATES, text);
    if (category === 'social_isolation') return pickTemplate(SOCIAL_ISOLATION_TEMPLATES, text);
    if (category === 'bullying') return pickTemplate(BULLYING_TEMPLATES, text);
    if (category === 'general_tired') return pickTemplate(GENERAL_TIRED_TEMPLATES, text);
    if (category === 'positive_gratitude') return pickTemplate(POSITIVE_GRATITUDE_TEMPLATES, text);
  }

  return pickTemplate(GENERAL_TEMPLATES, text);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function generateSupportReply(
  text: string,
  mood?: string,
  location?: string,
  alertSummary?: string
): Promise<string> {
  const trimmed = text.trim();

  try {
    const data = await askGemini('/api/ai/guardian-chat', {
      text: trimmed,
      mood,
      location,
      alertSummary,
    });
    const reply = data.reply ?? data.text ?? data.message;
    if (reply && typeof reply === 'string' && reply.length > 0) {
      return reply;
    }
    throw new Error('empty proxy reply');
  } catch {
    // Proxy unavailable or returned empty — use local fallback
    return selectLocalFallback(trimmed, mood);
  }
}

export async function summarizeGuardianState(state: GuardianState): Promise<string> {
  const openAlerts = state.alerts.filter((alert) => alert.status !== 'resolved');
  const highAlerts = openAlerts.filter((alert) => alert.riskLevel === 'high');
  return `目前校園穩定度 ${state.stabilityScore}%，仍有 ${openAlerts.length} 則關懷提醒，其中 ${highAlerts.length} 則需優先由導師或輔導室確認。`;
}

export function recommendationForAlert(alert: GuardianAlert): string {
  if (alert.riskLevel === 'high') {
    return '先由熟悉學生的老師進行低壓關懷，不公開點名；若學生提到立即危險，再啟動緊急轉介。';
  }
  if (alert.category.includes('課業')) {
    return '建議提供任務拆解表，讓學生先完成最小可行的一步。';
  }
  return '維持觀察並記錄變化，下一次班級活動後再回看趨勢。';
}
