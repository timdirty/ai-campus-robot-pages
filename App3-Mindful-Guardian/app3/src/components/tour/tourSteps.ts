export type TourStep = {
  id: string;
  targetDataTour?: string;
  title: string;
  body: string;
  demoTip: string;
  tooltipSide?: 'top' | 'bottom' | 'left' | 'right';
  isFullscreen?: boolean;
};

export const TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    isFullscreen: true,
    title: '學生操作導覽',
    body: '這份導覽協助學生掌握操作順序，每一步都需要人員確認。',
    demoTip: '先選區域、看 AI 判讀、補現場事件，最後交給老師確認。',
  },
  {
    id: 'signal-overview',
    targetDataTour: 'signal-overview',
    title: '先看今日狀態',
    body: '先用總覽掌握目前校園狀態，再查看需要優先確認的區域。',
    demoTip: '先看全校狀態，知道哪個區域需要優先確認。',
    tooltipSide: 'bottom',
  },
  {
    id: 'campus-map',
    targetDataTour: 'campus-map',
    title: '選區域，不直接移動',
    body: '點地圖只是在選區域和看資訊，不會讓機器人立刻移動。',
    demoTip: '點圖書館只是選擇區域，真正派遣一定要等老師確認。',
    tooltipSide: 'bottom',
  },
  {
    id: 'zone-inspector',
    targetDataTour: 'zone-inspector',
    title: 'AI 副駕',
    body: '這裡把判讀、補事件、老師確認三個步驟排好，讓現場操作有固定順序。',
    demoTip: 'AI 只是整理建議，最後仍由老師決定是否派遣。',
    tooltipSide: 'left',
  },
  {
    id: 'panel-dock',
    targetDataTour: 'panel-dock',
    title: '延伸面板',
    body: '預警、感知、照護只是補充資料，需要時再打開，不搶主流程。',
    demoTip: '主線留在地圖和 AI 副駕，面板只拿來補充證據。',
    tooltipSide: 'top',
  },
  {
    id: 'complete',
    isFullscreen: true,
    title: '準備開始',
    body: '現場操作時照順序處理：選區域 → AI 判讀 → 補事件 → 老師確認 → 查看結果。',
    demoTip: '系統會把風險整理清楚，讓老師更快做出安全決策。',
  },
];

export const TOUR_STORAGE_KEY = 'tour-app3:v1';
