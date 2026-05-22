export type TourStep = {
  id: string;
  tab?: 'teach' | 'delivery' | 'life';
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
    title: '歡迎！先來認識一下',
    body: '我來帶你走一次比賽展示順序：教學、配送、生活安全與機器人面板同步。',
    demoTip: '「我們把校園服務拆成教學、配送、生活安全三條流程，所有操作都會留下任務與指令紀錄。」',
  },
  {
    id: 'delivery-user-loop',
    tab: 'delivery',
    targetDataTour: 'delivery-user-loop',
    title: '取件流程',
    body: '這裡從學生或教職員視角選擇目的地，建立訂單後會派出 R-01、更新追蹤與指令紀錄。',
    demoTip: '「我先選目的地，等訂單建立後 R-01 會同步顯示配送中，追蹤頁可完成取件。」',
    tooltipSide: 'bottom',
  },
  {
    id: 'new-order-btn',
    tab: 'delivery',
    targetDataTour: 'new-order-btn',
    title: '新增配送任務',
    body: '點商品就可以下訂單，選好目的地後機器人自動出發並寫入指令紀錄。',
    demoTip: '「我新增一筆訂單，把文具組送到辦公室，確認後機器人幾秒內就出發。」',
    tooltipSide: 'top',
  },
  {
    id: 'order-list',
    tab: 'delivery',
    targetDataTour: 'order-list',
    title: '配送任務追蹤',
    body: '目前在途的配送任務都在這裡，點進去可以看即時位置和預計到達時間。',
    demoTip: '「機器人現在正在送物資，這裡可以看它走到哪了。」',
    tooltipSide: 'bottom',
  },
  {
    id: 'student-professor-loop',
    tab: 'teach',
    targetDataTour: 'student-professor-loop',
    title: '學生與教授協作',
    body: '學生端可送出提問或跟不上訊號；教授端會即時看到下一步處置，機器人面板也會同步反應。',
    demoTip: '「我用學生端送出一則提問，教授端立即收到，R-01 顯示面板也會切到思考狀態。」',
    tooltipSide: 'bottom',
  },
  {
    id: 'attendance-card',
    tab: 'teach',
    targetDataTour: 'attendance-card',
    title: '智慧出缺席',
    body: '機器人掃描後自動更新出缺席名單，老師不用一個個點名。',
    demoTip: '「機器人 30 秒內完成全班掃描，比傳統點名快 10 倍，而且不會漏人。」',
    tooltipSide: 'bottom',
  },
  {
    id: 'alert-list',
    tab: 'teach',
    targetDataTour: 'alert-list',
    title: '即時告警與訊號',
    body: '同學舉手或分心時這裡會出現提示；點進去 AI 會幫你想回覆內容。',
    demoTip: '「這位同學剛剛舉手，我點進去讓 AI 建議怎麼回應——老師可以同時注意全班。」',
    tooltipSide: 'bottom',
  },
  {
    id: 'life-services',
    tab: 'life',
    targetDataTour: 'life-services',
    title: '生活安全情境',
    body: '這裡展示放學降雨、走廊慢行、廣播派遣與巡查排程，按下後會建立任務並同步 R-01。',
    demoTip: '「如果放學前下雨，系統會提前廣播慢行並安排校門巡查；如果走廊速度太快，也能直接提醒。」',
    tooltipSide: 'top',
  },
  {
    id: 'complete',
    isFullscreen: true,
    title: '你準備好了！',
    body: '比賽時照這個順序走：教學辨識、配送追蹤、生活安全、機器人面板同步。',
    demoTip: '「謝謝評審，以上就是我們校園服務機器人如何把校園任務轉成可操作、可追蹤、可落地的服務流程。」',
  },
];

export const TOUR_STORAGE_KEY = 'tour-app2:v1';
