import React, { useState, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, Package, Cookie, PencilLine, Coffee, X, Truck, Loader2, Rocket, MapPin, CheckCircle2, Clock3, UserRound } from 'lucide-react';
import { BottomSheet } from '../components/ui';
import { useAppActions, useAppState } from '../state/AppStateProvider';
import type { Product } from '../state/appState';

const CATEGORIES = [
  { id: 'snacks', icon: Cookie, label: '精選零食' },
  { id: 'stationery', icon: PencilLine, label: '文具用品' },
  { id: 'drinks', icon: Coffee, label: '飲品' },
];

const LOCATIONS = ['101 教室', '507 教室', '教職員辦公室', '圖書館', '操場 A 區'] as const;

const containerVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.1 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 300, damping: 24 } },
};

export function DeliveryView({ showToast, navigateTo }: { showToast: (msg: string) => void, navigateTo: (id: string, props?: any) => void }) {
  const state = useAppState();
  const actions = useAppActions();
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [modal, setModal] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [qty, setQty] = useState(1);
  const [isOrdering, setIsOrdering] = useState(false);
  const [dest, setDest] = useState('101 教室');
  const pendingTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    return () => {
      for (const t of pendingTimers.current) clearTimeout(t);
    };
  }, []);

  const activeOrder = useMemo(
    () => state.orders.find((order) => order.status === 'in_transit') ?? null,
    [state.orders],
  );
  const primaryRobot = state.robots[0] ?? null;
  const assignedRobot = activeOrder
    ? state.robots.find((robot) => robot.id === activeOrder.robotId) ?? primaryRobot
    : primaryRobot;
  const robotName = assignedRobot?.serial ?? '校園服務機 R-01';
  const robotPhase = activeOrder ? '配送中' : '單機待命';
  const orderStatus = activeOrder
    ? `送達 ${activeOrder.destination}: ${activeOrder.productName} x${activeOrder.quantity}`
    : null;

  const filteredProducts = useMemo(() => {
    let filtered = state.products;
    if (activeCategory !== 'all') {
      filtered = filtered.filter(p => p.category === activeCategory);
    }
    if (searchQuery.trim() !== '') {
      filtered = filtered.filter(p => p.name.includes(searchQuery.trim()) || p.desc.includes(searchQuery.trim()));
    }
    return filtered;
  }, [activeCategory, searchQuery, state.products]);

  const openProduct = (p: Product) => {
    setSelectedProduct(p);
    setQty(1);
    setModal('product');
  };

  const handleOrder = () => {
    if (!selectedProduct) return;
    setIsOrdering(true);
    const t1 = setTimeout(() => {
      actions.createDeliveryOrder({ productId: selectedProduct!.id, quantity: qty, destination: dest });
      showToast(`預約成功！機器人即將前往 ${dest}`);
      setIsOrdering(false);
      setModal(null);
      const t2 = setTimeout(() => {
        actions.autoCompleteInTransit();
        showToast('✅ 配送完成！機器人已送達目的地');
      }, 35000);
      const t3 = setTimeout(() => navigateTo('delivery-tracking'), 600);
      pendingTimers.current.push(t2, t3);
    }, 1200);
    pendingTimers.current.push(t1);
  };

  const completeActiveOrder = () => {
    if (!activeOrder) return;
    actions.completeOrder(activeOrder.id);
    showToast(`取件完成：${activeOrder.productName} 已送達 ${activeOrder.destination}`);
  };

  const deliveryTasks = state.tasks.filter((t) => t.source === 'delivery');
  const inProgressCount = deliveryTasks.filter((t) => t.status === 'in_progress').length;
  const completedCount = state.orders.filter((order) => order.status === 'delivered').length;
  const commandCount = state.robotCommandLogs.filter((log) => log.source === 'delivery').length;

  return (
    <div className="space-y-5 pb-6">
      {/* Summary bar */}
      <section className="grid grid-cols-3 gap-2.5 px-1">
        {[
          { label: '進行中', value: inProgressCount },
          { label: '已完成', value: completedCount },
          { label: '配送次數', value: commandCount },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2.5 text-center shadow-inner">
            <p className="text-[9px] font-extrabold text-on-surface-variant tracking-widest uppercase">{label}</p>
            <p className="mt-0.5 text-xl font-extrabold text-primary">{value}</p>
          </div>
        ))}
      </section>

      <section data-tour="delivery-user-loop" className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_0.9fr]">
        <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-4 shadow-sm">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.28em] text-primary">Pickup desk</p>
              <h3 className="mt-1 font-headline text-base font-bold tracking-wide">學生 / 教職員取件</h3>
            </div>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <UserRound size={18} />
            </div>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {LOCATIONS.map((location) => (
              <button
                key={location}
                type="button"
                onClick={() => setDest(location)}
                className={`shrink-0 rounded-xl border px-3 py-2 text-xs font-black transition active:scale-95 ${
                  dest === location
                    ? 'border-primary bg-primary text-white shadow-sm'
                    : 'border-outline-variant/25 bg-surface-container text-on-surface-variant hover:border-primary/30 hover:text-primary'
                }`}
              >
                {location}
              </button>
            ))}
          </div>
          <div className="mt-3 rounded-xl border border-outline-variant/20 bg-surface-container px-3 py-3">
            <p className="text-[10px] font-black tracking-widest text-on-surface-variant">目前目的地</p>
            <div className="mt-2 flex items-center justify-between gap-3">
              <p className="min-w-0 truncate text-sm font-black text-on-surface">{dest}</p>
              <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-black tracking-widest text-primary">下單會同步派車</span>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-4 shadow-sm">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.28em] text-primary">Task flow</p>
              <h3 className="mt-1 font-headline text-base font-bold tracking-wide">配送收件流程</h3>
            </div>
            <span className={`rounded-full border px-3 py-1 text-[10px] font-black tracking-widest ${
              activeOrder ? 'border-primary/20 bg-primary/10 text-primary' : 'border-outline-variant/25 bg-surface-container text-on-surface-variant'
            }`}>
              {activeOrder ? '運送中' : '待命'}
            </span>
          </div>
          <div className="min-h-24 rounded-xl border border-outline-variant/20 bg-surface-container px-3 py-3">
            {activeOrder ? (
              <>
                <div className="flex items-center gap-2">
                  <Truck size={17} className="shrink-0 text-primary" />
                  <p className="min-w-0 truncate text-sm font-black text-on-surface">{activeOrder.productName} x{activeOrder.quantity}</p>
                </div>
                <p className="mt-2 flex items-center gap-1.5 text-xs font-bold text-on-surface-variant">
                  <MapPin size={12} className="text-primary" />
                  前往 {activeOrder.destination}
                </p>
                <p className="mt-1 flex items-center gap-1.5 text-xs font-bold text-on-surface-variant">
                  <Clock3 size={12} className="text-primary" />
                  比賽現場可直接完成取件，也可進追蹤頁看路徑
                </p>
              </>
            ) : (
              <div className="flex h-full min-h-20 items-center gap-2 text-xs font-bold text-on-surface-variant">
                <CheckCircle2 size={17} className="text-primary" />
                目前沒有配送中訂單，選擇商品後會自動建立任務與指令紀錄。
              </div>
            )}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => navigateTo('delivery-tracking')}
              className="h-12 rounded-xl border border-primary/20 bg-primary/10 px-3 text-xs font-black tracking-widest text-primary transition hover:bg-primary/15 active:scale-95"
            >
              查看追蹤
            </button>
            <button
              data-e2e="delivery-complete-pickup"
              type="button"
              onClick={completeActiveOrder}
              disabled={!activeOrder}
              className="h-12 rounded-xl bg-primary px-3 text-xs font-black tracking-widest text-white shadow-[0_4px_12px_rgba(var(--color-primary),0.25)] transition active:scale-95 disabled:bg-surface-container-high disabled:text-on-surface-variant"
            >
              完成取件
            </button>
          </div>
        </div>
      </section>

      {/* Search */}
      <section className="relative px-1">
        <div className="group relative flex items-center bg-surface-container-low rounded-2xl px-4 py-3 transition-all focus-within:bg-surface-container-lowest focus-within:ring-2 focus-within:ring-primary/10 shadow-inner border border-outline-variant/10">
          <Search className="text-on-surface-variant mr-3 shrink-0 transition-colors group-focus-within:text-primary" size={18} />
          <input
            type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value.slice(0, 50))}
            maxLength={50}
            className="bg-transparent border-none focus:outline-none focus:ring-0 w-full text-sm font-bold placeholder:text-on-surface-variant/40"
            placeholder="搜尋課程餐盒、文具或實驗室耗材..."
          />
          {searchQuery && (
            <motion.button aria-label="清除搜尋" initial={{ scale: 0 }} animate={{ scale: 1 }} onClick={() => setSearchQuery('')} className="ml-2 bg-surface-container-high rounded-full p-2 hover:bg-surface-container-highest transition-colors flex items-center justify-center shrink-0">
              <X size={16} className="text-on-surface-variant" />
            </motion.button>
          )}
        </div>
      </section>

      {/* Delivery Tracking Herocard */}
      <section data-tour="order-list" className="space-y-3">
        <h2 className="text-base font-headline font-bold tracking-tight px-2 flex items-center gap-2">
           即時配送狀態
           <span className={`w-1.5 h-1.5 rounded-full ${activeOrder ? 'bg-primary animate-pulse' : 'bg-on-surface-variant/30'}`}></span>
        </h2>
        <button onClick={() => navigateTo('delivery-tracking')} className="w-full text-left bg-surface-container-low border border-outline-variant/30 rounded-2xl p-1 cursor-pointer group active:scale-[0.985] transition-all shadow-[0_2px_12px_rgba(0,0,0,0.02)] flex flex-col">
          <div className="bg-surface-container-lowest rounded-xl p-4 space-y-4 group-hover:shadow-md transition-shadow relative overflow-hidden">
            <div className="flex justify-between items-start relative z-10">
              <div className="space-y-1">
                <span className="text-[9px] font-extrabold text-primary flex items-center gap-2">
                  {activeOrder ? '配送中' : '單機待命'}
                </span>
                <h3 className="text-lg font-headline font-bold tracking-tight">{robotName}</h3>
                <div className="flex items-center gap-2">
                  <p className="text-[10px] text-on-surface-variant font-bold bg-surface-container-low px-2.5 py-1 rounded-xl border border-outline-variant/10 shadow-inner flex items-center gap-1.5">
                    <MapPin size={10} className="text-primary" /> {activeOrder ? `前往 ${activeOrder.destination}` : `${robotPhase} · 無配送任務`}
                  </p>
                </div>
              </div>
              <div className="w-14 h-14 bg-primary text-white rounded-2xl flex items-center justify-center shadow-[0_6px_18px_rgba(var(--color-primary),0.25)] shrink-0 group-hover:-translate-y-1 transition-transform rotate-3">
                <Package size={26} />
              </div>
            </div>

            {/* Minimal Timeline preview inside Hero */}
            <div className="relative pl-5 z-10">
              <div className="absolute left-2 top-2 bottom-2 w-0.5 bg-outline-variant/30"></div>
              <div className="relative flex items-center gap-4">
                <div className={`z-10 w-4 h-4 rounded-full border-4 border-surface-container-lowest ${activeOrder ? 'bg-primary shadow-[0_0_12px_rgba(var(--color-primary),0.4)]' : 'bg-surface-container-highest'}`}></div>
                <div className={`flex-1 px-4 py-2.5 rounded-xl transition-all border ${activeOrder ? 'bg-surface-container-low border-outline-variant/30 text-on-surface shadow-sm' : 'bg-surface-container-low border-outline-variant/20 text-on-surface-variant'}`}>
                  <p className="text-sm font-bold truncate leading-none mb-0.5">{activeOrder ? '已離開配送中心' : '目前沒有配送任務'}</p>
                  <p className={`text-[10px] font-extrabold ${activeOrder ? 'text-primary' : 'text-on-surface-variant/70'}`}>
                    {activeOrder ? '預計 4 分鐘抵達' : '選擇商品並確認訂單後才會派車'}
                  </p>
                </div>
              </div>
            </div>

            <div className="absolute -right-20 -bottom-20 w-64 h-64 opacity-5 blur-[70px] rounded-full bg-primary pointer-events-none group-hover:opacity-10 transition-opacity"></div>
          </div>
        </button>
      </section>

      {/* Categories */}
      <section className="space-y-3 px-1">
        <div className="flex justify-between items-center px-1">
          <h2 className="text-sm font-headline font-bold tracking-tight">分類</h2>
          <button onClick={() => { setActiveCategory('all'); setSearchQuery(''); }} className="text-[10px] text-primary font-bold hover:bg-primary/5 px-3 py-2.5 min-h-11 rounded-xl transition-all border border-primary/10 active:scale-95">顯示全部</button>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
          {CATEGORIES.map(cat => {
            const isActive = activeCategory === cat.id;
            const Icon = cat.icon;
            return (
              <motion.button
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.95 }}
                key={cat.id}
                onClick={() => setActiveCategory(isActive ? 'all' : cat.id)}
                className={`flex-shrink-0 font-bold px-4 py-2.5 min-h-11 rounded-2xl flex items-center gap-2 transition-all border shadow-sm ${isActive ? 'bg-primary text-white border-primary shadow-lg shadow-primary/20' : 'bg-surface-container-lowest border-outline-variant/30 text-on-surface-variant hover:bg-surface-container-low'}`}
              >
                <Icon size={16} className={isActive ? 'text-white' : 'text-primary'} />
                <span className="text-xs tracking-tight">{cat.label}</span>
              </motion.button>
            );
          })}
        </div>
      </section>

      {/* Products List */}
      <section data-tour="new-order-btn" className="space-y-3 min-h-50 px-1">
        <div className="flex items-center gap-2.5 px-1 mb-1">
           <div className="w-1 h-5 bg-primary rounded-full"></div>
           <h2 className="text-base font-headline font-bold tracking-tight">
             {searchQuery ? '搜尋結果' : (activeCategory !== 'all' ? CATEGORIES.find(c => c.id === activeCategory)?.label : '熱門推薦商品')}
           </h2>
        </div>

        {filteredProducts.length === 0 ? (
          <div className="py-12 text-center text-on-surface-variant bg-surface-container-lowest rounded-2xl border-2 border-dashed border-outline-variant/30 px-6">
            <div className="w-14 h-14 bg-surface-container rounded-full flex items-center justify-center mx-auto mb-4">
               <Package size={28} className="opacity-20" />
            </div>
            <p className="font-bold text-base tracking-tight text-on-surface">
              {searchQuery ? '無相符搜尋結果' : activeCategory !== 'all' ? '此分類目前無商品' : '找不到商品'}
            </p>
            <p className="text-xs mt-1.5 opacity-60">
              {searchQuery ? `找不到「${searchQuery}」，請嘗試其他關鍵字` : '請切換分類或清除篩選'}
            </p>
          </div>
        ) : (
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="show"
            key={activeCategory + searchQuery}
            className="grid grid-cols-1 md:grid-cols-2 gap-3"
          >
            {filteredProducts.map(product => (
              <motion.div
                variants={itemVariants}
                key={product.id}
                data-e2e="delivery-product-card"
                onClick={() => openProduct(product)}
                className={`flex gap-4 items-center group cursor-pointer bg-surface-container-lowest p-4 rounded-2xl border transition-all active:scale-[0.985] ${product.stock === 0 ? 'opacity-60 grayscale-50 pointer-events-none border-outline-variant/10' : 'border-outline-variant/30 shadow-[0_2px_10px_rgba(0,0,0,0.02)] hover:shadow-lg hover:border-primary/20'}`}
              >
                <div className="w-20 h-20 rounded-2xl overflow-hidden bg-surface-container-low shrink-0 relative shadow-inner">
                  <div className="absolute inset-0 bg-black/5 group-hover:bg-transparent z-10 transition-colors"></div>
                  <img src={product.img} alt={product.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700 ease-out" />
                  {product.stock === 0 && (
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] z-20 flex items-center justify-center">
                      <span className="text-white text-[10px] font-bold px-2 py-1 bg-black/50 rounded-lg">已售罄</span>
                    </div>
                  )}
                  <div className="absolute top-1.5 left-1.5 z-20">
                     <div className="bg-white/90 backdrop-blur shadow-sm px-1.5 py-0.5 rounded-md text-[9px] font-bold text-primary">推薦</div>
                  </div>
                </div>
                <div className="flex-1 space-y-1.5 min-w-0">
                  <h3 className="font-bold text-sm leading-tight text-on-surface tracking-tight truncate">{product.name}</h3>
                  <p className="text-[10px] text-on-surface-variant font-medium leading-relaxed line-clamp-2 opacity-70">{product.desc}</p>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                       <span className="font-bold text-base text-primary tracking-tight">NT${product.price}</span>
                       <span className={`text-[10px] font-bold ${product.stock > 10 ? 'text-[#87d46c]' : 'text-error'}`}>
                         庫存 {product.stock}
                       </span>
                    </div>
                    <button className="bg-surface-container-high group-hover:bg-primary group-hover:text-white text-on-surface w-11 h-11 shrink-0 rounded-xl transition-all flex items-center justify-center shadow-sm active:scale-90 overflow-hidden relative">
                      <span className="text-base font-bold relative z-10">+</span>
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}
      </section>

      {/* Product Detail Modal */}
      <BottomSheet isOpen={modal === 'product'} onClose={() => setModal(null)} title="商品詳細細節">
        {selectedProduct && (
          <div className="p-4 space-y-5 pb-8">
            <div className="w-full aspect-[4/3] rounded-2xl overflow-hidden bg-surface-container shadow-xl relative border-2 border-surface-container-highest">
               <img src={selectedProduct.img} className="w-full h-full object-cover transition-transform duration-1000" />
               <div className="absolute inset-0 bg-linear-to-t from-black/60 via-transparent to-transparent"></div>
               <div className="absolute bottom-4 left-4">
                  <span className="bg-primary px-3 py-1 rounded-lg text-xs font-extrabold text-white shadow-lg shadow-primary/30">品質認證</span>
               </div>
            </div>

            <div className="space-y-2.5">
              <div className="flex items-center gap-2">
                 <span className="bg-primary/10 text-primary px-2.5 py-1 rounded-lg text-xs font-extrabold leading-none border border-primary/20">
                   {CATEGORIES.find(c => c.id === selectedProduct.category)?.label || '推薦'}
                 </span>
                 <div className="h-1 w-1 bg-outline-variant rounded-full"></div>
                 <span className="text-xs text-on-surface-variant/60 font-bold">庫存 {selectedProduct.stock}</span>
              </div>
              <h2 className="text-2xl font-headline font-bold text-on-surface tracking-tight leading-none">{selectedProduct.name}</h2>
              <p className="text-on-surface-variant font-medium leading-relaxed text-sm bg-surface-container-low/50 p-4 rounded-2xl border border-outline-variant/10 shadow-inner">
                {selectedProduct.desc}
              </p>
            </div>

            <div className="flex items-center justify-between border-y border-outline-variant/20 py-4 px-1">
               <div className="flex flex-col">
                 <span className="text-xs font-bold text-on-surface-variant/60 mb-1">訂單總計</span>
                 <motion.span
                   key={qty}
                   initial={{ scale: 0.9, opacity: 0 }}
                   animate={{ scale: 1, opacity: 1 }}
                   className="font-bold text-3xl text-primary tracking-tight"
                 >
                   <span className="text-lg mr-1 opacity-60">NT$</span>{selectedProduct.price * qty}
                 </motion.span>
               </div>

               <div className="flex items-center gap-3 bg-surface-container rounded-2xl p-2 shadow-inner border border-outline-variant/10">
                  <motion.button whileTap={{ scale: 0.9 }} onClick={() => setQty(Math.max(1, qty - 1))} disabled={isOrdering} className="w-11 h-11 rounded-xl bg-surface-container-lowest text-on-surface shadow-sm flex items-center justify-center border border-outline-variant/20 hover:bg-white transition-colors active:shadow-inner disabled:opacity-30">
                    <span className="text-2xl font-bold leading-none">-</span>
                  </motion.button>
                  <span className="font-headline font-bold text-xl w-8 text-center text-on-surface">{qty}</span>
                  <motion.button whileTap={{ scale: 0.9 }} onClick={() => setQty(Math.min(selectedProduct.stock, qty + 1))} className="w-11 h-11 rounded-xl bg-primary text-white shadow-lg shadow-primary/20 flex items-center justify-center disabled:opacity-30 hover:bg-primary/95 transition-all" disabled={qty >= selectedProduct.stock || isOrdering}>
                    <span className="text-2xl font-bold leading-none">+</span>
                  </motion.button>
               </div>
            </div>

             <div>
                <label className="block text-xs font-extrabold text-on-surface-variant/60 mb-2">選擇目的地</label>
                <div className="relative group">
                  <select value={dest} onChange={(e) => setDest(e.target.value)} className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-2xl px-4 py-3 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary/10 appearance-none shadow-sm cursor-pointer transition-all hover:border-primary/40 focus:border-primary">
                    {LOCATIONS.map(loc => <option key={loc} value={loc}>{loc}</option>)}
                  </select>
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-primary bg-primary/10 w-8 h-8 rounded-xl flex items-center justify-center border border-primary/20 group-focus-within:bg-primary group-focus-within:text-white transition-all"><Rocket size={16} className="-rotate-12" /></div>
                </div>
             </div>

            <button
              data-e2e="delivery-order-submit"
              onClick={handleOrder}
              disabled={isOrdering}
              className="w-full py-4 bg-primary hover:bg-primary/95 text-white font-bold text-base tracking-tight rounded-2xl shadow-[0_8px_24px_rgba(var(--color-primary),0.25)] active:scale-[0.985] transition-all flex items-center justify-center gap-3 disabled:opacity-80 relative overflow-hidden group/btn"
            >
              <div className="absolute inset-0 bg-linear-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover/btn:translate-x-full transition-transform duration-1000"></div>
              {isOrdering ? (
                <div className="flex items-center gap-3">
                  <Loader2 size={20} className="animate-spin" />
                  <span className="text-sm">正在建立訂單...</span>
                </div>
              ) : (
                <>
                  <Truck size={22} className="transition-transform group-hover/btn:-translate-y-1 group-hover/btn:rotate-6" />
                  <span className="tracking-tight">確認訂單並分派機器人</span>
                </>
              )}
            </button>
          </div>
        )}
      </BottomSheet>
    </div>
  );
}
