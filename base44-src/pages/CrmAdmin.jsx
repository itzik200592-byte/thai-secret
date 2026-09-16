import React, { useState, useEffect, useRef, useCallback } from 'react';
import { base44 } from '@/api/base44Client';

// תאי סיקרט - CRM ADMIN
// Same skeleton as the ULTRAS KIT /crm-admin: admin-only gate, dark UI, auto refresh,
// new-order toast, tabs. Single product, so no OrderItem / categories / coupons.
// Orders are written by the site directly into the Order entity (no Make, no webhook).

const Order = base44.entities.Order;
const Expense = base44.entities.Expense;

const PRODUCT_NAME = 'Green Bio Super Treatment 24x30ml';
const PRICES = { 1: 249, 2: 419 };
const DEFAULT_COST_PER_BOX = 0; // set from the finance tab (saved in localStorage, like ULTRAS KIT)
const COST_KEY = 'ts_cost_per_box';
const HIDDEN_KEY = 'ts_hidden_orders';

const STATUS_META = {
  New:        { label: 'חדשה',      color: '#6366f1' },
  Processing: { label: 'בטיפול',    color: '#f59e0b' },
  Shipped:    { label: 'נשלחה',     color: '#3b82f6' },
  Delivered:  { label: 'נמסרה',     color: '#10b981' },
  Cancelled:  { label: 'בוטלה',     color: '#6b7280' },
};
const PAYMENT_METHODS = ['ביט', 'פייבוקס', 'מזומן במשלוח', 'העברה בנקאית', 'אחר'];

// ---- Israel-time date helpers (Base44 stores UTC without a 'Z') ----
function ilParse(dateStr) {
  if (!dateStr) return null;
  let s = String(dateStr).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) s = s + 'T12:00:00Z';
  else {
    const hasTz = /[zZ]$/.test(s) || /[+-]\d{2}:?\d{2}$/.test(s);
    if (!hasTz) s = s.replace(' ', 'T') + 'Z';
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}
function ilDateTime(dateStr) {
  const d = ilParse(dateStr);
  return d ? d.toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
}
function ilMonthKey(dateStr) {
  const d = ilParse(dateStr);
  if (!d) return 'unknown';
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit' }).formatToParts(d);
  return `${parts.find(p => p.type === 'year')?.value}-${parts.find(p => p.type === 'month')?.value}`;
}
function ilMonthLabel(key) {
  if (!key || key === 'unknown') return 'ללא תאריך';
  const [y, m] = key.split('-');
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('he-IL', { month: 'long', year: 'numeric' });
}
function ilDayKeyOfDate(d) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
  const get = (t) => parts.find(p => p.type === t)?.value || '00';
  return `${get('year')}-${get('month')}-${get('day')}`;
}
function elapsedLabel(diffSec) {
  const m = Math.floor(diffSec / 60), h = Math.floor(diffSec / 3600), d = Math.floor(diffSec / 86400);
  const mins = (n) => n === 1 ? 'דקה' : `${n} דקות`;
  const hrs = (n) => n === 1 ? 'שעה' : `${n} שעות`;
  if (m < 1) return 'פחות מדקה';
  if (h < 1) return mins(m);
  if (d < 1) { const rm = m % 60; return rm ? `${hrs(h)} ו-${mins(rm)}` : hrs(h); }
  const rh = h % 24;
  const days = d === 1 ? 'יום' : `${d} ימים`;
  return rh ? `${days} ו-${hrs(rh)}` : days;
}
function relativeTime(dateStr) {
  const dt = ilParse(dateStr);
  if (!dt) return '';
  const diff = Math.floor((Date.now() - dt.getTime()) / 1000);
  if (diff < 60) return `לפני ${diff} שניות`;
  if (diff < 3600) return `לפני ${Math.floor(diff / 60)} דקות`;
  const timeStr = dt.toLocaleTimeString('he-IL', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit' });
  const key = ilDayKeyOfDate(dt);
  const now = new Date();
  const todayKey = ilDayKeyOfDate(now);
  const yesterdayKey = ilDayKeyOfDate(new Date(now.getTime() - 86400000));
  let when;
  if (key === todayKey) when = `היום ב-${timeStr}`;
  else if (key === yesterdayKey) when = `אתמול ב-${timeStr}`;
  else when = `${dt.toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem', day: 'numeric', month: 'numeric' })} ב-${timeStr}`;
  return `${when} · לפני ${elapsedLabel(diff)}`;
}
function toIntlPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.startsWith('972')) return digits;
  if (digits.startsWith('0')) return '972' + digits.slice(1);
  return digits;
}
function waLink(phone, text) {
  return `https://wa.me/${toIntlPhone(phone)}?text=${encodeURIComponent(text)}`;
}
function shortId(o) { return o.order_number || (o.id ? o.id.slice(-6).toUpperCase() : ''); }
function boxesLabel(n) { return n === 2 ? '2 קופסאות' : 'קופסה אחת'; }

// ---- WhatsApp message templates ----
const MSG = {
  confirm: (o) => `היי ${o.full_name}, כאן תאי סיקרט 🌿\nקיבלנו את ההזמנה שלך (${boxesLabel(o.boxes)} Green Bio Super Treatment, ${o.total_amount} ₪ כולל משלוח).\nאיך נוח לך לשלם? ביט / פייבוקס / מזומן במשלוח.\nברגע שהתשלום מאושר אנחנו שולחים 🙏`,
  paid: (o) => `היי ${o.full_name}, התשלום התקבל, תודה! 🙏\nההזמנה שלך יוצאת למשלוח בימים הקרובים ונעדכן אותך עם מספר מעקב.\nתאי סיקרט`,
  tracking: (o) => `היי ${o.full_name}, ההזמנה שלך יצאה למשלוח 📦\nמספר מעקב: ${o.tracking_number}\nמעקב: https://mypost.israelpost.co.il/itemtrace\nתאי סיקרט`,
  delivered: (o) => `היי ${o.full_name}, מקווים שהחבילה הגיעה בשלום 🌿\nטיפ: שקית אחת על שיער נקי ולח, 2 עד 5 דקות, ושוטפים. נשמח לשמוע איך היה!\nתאי סיקרט`,
};

export default function CrmAdmin() {
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);
  const [secondsAgo, setSecondsAgo] = useState(0);
  const [toast, setToast] = useState(null);
  const [orders, setOrders] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [paidDialog, setPaidDialog] = useState(null);
  const [trackingDialog, setTrackingDialog] = useState(null);
  const [costPerBox, setCostPerBox] = useState(() => Number(localStorage.getItem(COST_KEY)) || DEFAULT_COST_PER_BOX);
  const prevOrderIdsRef = useRef(null);

  useEffect(() => {
    base44.auth.me().then(u => { setUser(u); setAuthChecked(true); }).catch(() => setAuthChecked(true));
  }, []);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 5000); };

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [o, ex] = await Promise.all([
        Order.list('-created_date', 1000),
        Expense.list('-expense_date', 1000).catch(() => []),
      ]);
      const newOrders = o || [];
      if (prevOrderIdsRef.current !== null) {
        const newOnes = newOrders.filter(ord => !prevOrderIdsRef.current.includes(ord.id));
        if (newOnes.length > 0) showToast(`🎉 הזמנה חדשה מ-${newOnes[0].full_name}!`);
      }
      prevOrderIdsRef.current = newOrders.map(ord => ord.id);
      setOrders(newOrders);
      setExpenses(ex || []);
      setLastUpdated(new Date());
      setSecondsAgo(0);
    } catch (e) { console.error(e); }
    if (!silent) setLoading(false);
  }, []);

  useEffect(() => {
    if (!user || user.role !== 'admin') return;
    loadData();
    const interval = setInterval(() => loadData(true), 30000);
    return () => clearInterval(interval);
  }, [user, loadData]);

  useEffect(() => {
    if (!lastUpdated) return;
    const tick = setInterval(() => setSecondsAgo(Math.floor((Date.now() - lastUpdated) / 1000)), 1000);
    return () => clearInterval(tick);
  }, [lastUpdated]);

  const patchLocal = (id, fields) => setOrders(prev => prev.map(o => o.id === id ? { ...o, ...fields } : o));
  const saveOrder = async (o, fields, okMsg) => {
    patchLocal(o.id, fields);
    try { await Order.update(o.id, fields); if (okMsg) showToast(okMsg); }
    catch (e) { alert('שגיאה בשמירה: ' + e.message); loadData(true); }
  };
  const deleteOrder = async (o) => {
    if (!window.confirm(`למחוק את ההזמנה של ${o.full_name}? פעולה זו אינה ניתנת לביטול.`)) return;
    try { await Order.delete(o.id); loadData(); } catch (e) { alert('שגיאה במחיקה: ' + e.message); }
  };
  const saveCost = (v) => { const n = Number(v) || 0; setCostPerBox(n); localStorage.setItem(COST_KEY, String(n)); };

  const active = orders.filter(o => o.status !== 'Cancelled');
  const paidOrders = active.filter(o => o.payment_status === 'Paid')
    .sort((a, b) => (ilParse(b.paid_at || b.created_date) || 0) - (ilParse(a.paid_at || a.created_date) || 0));
  const pendingOrders = active.filter(o => o.payment_status !== 'Paid')
    .sort((a, b) => (ilParse(b.created_date) || 0) - (ilParse(a.created_date) || 0));
  const noTracking = paidOrders.filter(o => o.status !== 'Delivered' && !(o.tracking_number && String(o.tracking_number).trim()));
  const cancelled = orders.filter(o => o.status === 'Cancelled');

  const totalRevenue = paidOrders.reduce((s, o) => s + (Number(o.total_amount) || 0), 0);
  const totalBoxes = paidOrders.reduce((s, o) => s + (Number(o.boxes) || 1), 0);
  const totalCost = totalBoxes * costPerBox;
  const totalExpenses = expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const totalProfit = totalRevenue - totalCost - totalExpenses;

  const filterBySearch = (items) => {
    if (!search) return items;
    const q = search.toLowerCase();
    return items.filter(o => ['full_name', 'phone', 'city', 'street', 'order_number', 'tracking_number'].some(f => (o[f] || '').toString().toLowerCase().includes(q)));
  };

  if (!authChecked) {
    return <div dir="rtl" style={{ minHeight: '100vh', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888' }}>טוען...</div>;
  }
  if (!user) {
    return (
      <div dir="rtl" style={{ minHeight: '100vh', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
        <div style={{ background: '#111', padding: '40px', borderRadius: '16px', maxWidth: '400px', width: '100%', border: '1px solid #333', textAlign: 'center' }}>
          <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#fff', letterSpacing: '3px', marginBottom: '8px' }}>CRM ADMIN</div>
          <div style={{ fontSize: '12px', color: '#888', letterSpacing: '2px', marginBottom: '30px' }}>THAI SECRET MANAGEMENT</div>
          <p style={{ color: '#ccc', fontSize: '14px', marginBottom: '24px' }}>התחברות נדרשת לגישה</p>
          <button onClick={() => base44.auth.redirectToLogin(window.location.pathname)} style={{ width: '100%', padding: '14px', background: '#fff', color: '#000', border: 'none', borderRadius: '10px', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer' }}>כניסה ←</button>
        </div>
      </div>
    );
  }
  if (user.role !== 'admin') {
    return (
      <div dir="rtl" style={{ minHeight: '100vh', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
        <div style={{ background: '#111', padding: '40px', borderRadius: '16px', maxWidth: '400px', textAlign: 'center', border: '1px solid #7f1d1d' }}>
          <div style={{ fontSize: '48px', marginBottom: '15px' }}>🔒</div>
          <div style={{ color: '#fff', fontSize: '18px', marginBottom: '10px' }}>אין הרשאה</div>
          <p style={{ color: '#888', fontSize: '14px' }}>המשתמש שלך אינו admin במערכת.</p>
        </div>
      </div>
    );
  }

  const tabs = [
    { id: 'dashboard', label: 'דשבורד', icon: '📊' },
    { id: 'pending', label: 'ממתינות לתשלום', icon: '📞', badge: pendingOrders.length, badgeColor: '#fb923c' },
    { id: 'orders', label: 'הזמנות ששולמו', icon: '📦', badge: paidOrders.length },
    { id: 'no_tracking', label: 'ללא מעקב', icon: '🚚', badge: noTracking.length, badgeColor: '#fb923c' },
    { id: 'finance', label: 'כספים', icon: '📈' },
    { id: 'expenses', label: 'הוצאות', icon: '💸' },
    { id: 'cancelled', label: 'בוטלו', icon: '🗑️', badge: cancelled.length },
  ];
  const tabBtn = (t) => (
    <button key={t.id} onClick={() => setActiveTab(t.id)} style={{ background: activeTab === t.id ? '#fff' : 'transparent', color: activeTab === t.id ? '#000' : '#fff', border: '1px solid #333', padding: '10px 14px', borderRadius: '10px', margin: '0 3px', cursor: 'pointer', fontSize: '14px', fontWeight: activeTab === t.id ? 'bold' : 'normal', display: 'inline-flex', alignItems: 'center', gap: '6px', minHeight: '44px', whiteSpace: 'nowrap' }}>
      <span>{t.icon}</span><span>{t.label}</span>
      {t.badge > 0 && <span style={{ background: t.badgeColor || '#333', color: '#fff', padding: '2px 7px', borderRadius: '10px', fontSize: '11px', fontWeight: 'bold' }}>{t.badge}</span>}
    </button>
  );
  const listProps = { onView: setSelectedOrder, onPaid: setPaidDialog, onTracking: setTrackingDialog, onSave: saveOrder, onDelete: deleteOrder, showToast };

  return (
    <div dir="rtl" style={{ minHeight: '100vh', background: '#0a0a0a', color: '#fff', fontFamily: 'Heebo,Assistant,Arial,sans-serif', overflowX: 'hidden', maxWidth: '100vw' }}>
      {/* HEADER */}
      <div style={{ background: '#000', borderBottom: '1px solid #222', padding: '12px 16px', position: 'sticky', top: 0, zIndex: 100, display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '18px', fontWeight: 'bold', letterSpacing: '2px' }}>CRM ADMIN</div>
            <div style={{ fontSize: '11px', color: '#666', marginTop: '1px' }}>תאי סיקרט · Green Bio</div>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
            {lastUpdated && <div style={{ fontSize: '11px', color: '#555', whiteSpace: 'nowrap' }}>עודכן {secondsAgo}s</div>}
            <button onClick={() => loadData()} title="רענון" style={{ background: '#222', color: '#fff', border: '1px solid #333', padding: '10px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '16px', minWidth: '44px', minHeight: '44px' }}>🔄</button>
            <a href="/" style={{ background: '#222', color: '#fff', border: '1px solid #333', padding: '10px 12px', borderRadius: '8px', fontSize: '13px', minHeight: '44px', display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>לאתר</a>
            <button onClick={() => base44.auth.logout('/')} style={{ background: '#7f1d1d', color: '#fff', border: 'none', padding: '10px 14px', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', minHeight: '44px', fontWeight: 'bold' }}>יציאה</button>
          </div>
        </div>
        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 חיפוש לפי שם, טלפון, עיר, מעקב..." style={{ width: '100%', padding: '12px 14px', background: '#111', border: '1px solid #333', borderRadius: '8px', color: '#fff', fontSize: '16px', boxSizing: 'border-box' }} />
      </div>

      {/* TABS */}
      <div style={{ background: '#111', borderBottom: '1px solid #222', padding: '10px 8px', overflowX: 'auto', whiteSpace: 'nowrap', WebkitOverflowScrolling: 'touch' }}>
        {tabs.map(tabBtn)}
      </div>

      {/* CONTENT */}
      <div style={{ padding: '12px', maxWidth: '1400px', margin: '0 auto' }}>
        {loading && <div style={{ textAlign: 'center', padding: '60px', color: '#888', fontSize: '18px' }}>טוען נתונים...</div>}

        {activeTab === 'dashboard' && !loading && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: '16px', marginBottom: '30px' }}>
              <StatCard title="הכנסות" value={`₪${totalRevenue.toLocaleString()}`} subtitle={`${paidOrders.length} הזמנות ששולמו · ${totalBoxes} קופסאות`} color="#10b981" />
              <StatCard title="רווח נטו" value={`₪${totalProfit.toLocaleString()}`} subtitle={costPerBox ? `אחרי עלות קופסאות ופרסום · ${totalRevenue > 0 ? Math.round(totalProfit / totalRevenue * 100) : 0}% מרווח` : 'הגדר עלות לקופסה בטאב כספים'} color={totalProfit >= 0 ? '#22c55e' : '#ef4444'} />
              <StatCard title="ממתינות לתשלום" value={pendingOrders.length} subtitle="להתקשר ולסגור" color="#fb923c" />
              <StatCard title="ללא מעקב" value={noTracking.length} subtitle="שולמו וטרם נשלחו" color="#3b82f6" />
            </div>

            {pendingOrders.length > 0 && (
              <div style={{ background: '#111', border: '1px solid #fb923c', borderRadius: '12px', padding: '20px', marginBottom: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                  <span style={{ fontSize: '24px' }}>📞</span>
                  <div>
                    <div style={{ fontWeight: 'bold', fontSize: '16px' }}>הזמנות שמחכות לשיחה</div>
                    <div style={{ color: '#888', fontSize: '13px' }}>{pendingOrders.length} לקוחות השאירו פרטים וממתינים לאישור ותשלום</div>
                  </div>
                </div>
                <button onClick={() => setActiveTab('pending')} style={{ background: '#fb923c', color: '#000', border: 'none', padding: '10px 20px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>טפל עכשיו ←</button>
              </div>
            )}

            <div style={{ background: '#111', borderRadius: '12px', padding: '20px', border: '1px solid #222' }}>
              <h3 style={{ margin: '0 0 16px 0' }}>הזמנות אחרונות ששולמו</h3>
              {paidOrders.length === 0 && <p style={{ color: '#888', fontSize: '13px' }}>אין הזמנות ששולמו עדיין</p>}
              {paidOrders.slice(0, 5).map(o => (
                <div key={o.id} onClick={() => setSelectedOrder(o)} style={{ padding: '12px 0', borderBottom: '1px solid #1a1a1a', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
                  <div>
                    <div style={{ fontWeight: 'bold' }}>{o.full_name} <span style={{ color: '#888', fontWeight: 'normal', fontSize: '13px' }}>· {boxesLabel(o.boxes)}</span></div>
                    <div style={{ fontSize: '12px', color: '#888', marginTop: '2px' }}>{shortId(o)} · {relativeTime(o.paid_at || o.created_date)}</div>
                  </div>
                  <div style={{ color: '#10b981', fontWeight: 'bold', fontSize: '18px' }}>₪{o.total_amount}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'pending' && !loading && <OrdersList title="ממתינות לתשלום" mode="pending" orders={filterBySearch(pendingOrders)} {...listProps} />}
        {activeTab === 'orders' && !loading && <OrdersList title="הזמנות ששולמו" mode="paid" orders={filterBySearch(paidOrders)} {...listProps} />}
        {activeTab === 'no_tracking' && !loading && <OrdersList title="שולמו וממתינות למספר מעקב" mode="paid" orders={filterBySearch(noTracking)} {...listProps} />}
        {activeTab === 'cancelled' && !loading && <OrdersList title="הזמנות שבוטלו" mode="cancelled" orders={filterBySearch(cancelled)} {...listProps} />}
        {activeTab === 'finance' && !loading && <FinancePanel orders={paidOrders} expenses={expenses} costPerBox={costPerBox} onCostChange={saveCost} />}
        {activeTab === 'expenses' && !loading && <ExpensesPanel expenses={expenses} onRefresh={() => loadData(true)} />}
      </div>

      {selectedOrder && <OrderDetailDialog order={orders.find(o => o.id === selectedOrder.id) || selectedOrder} onClose={() => setSelectedOrder(null)} />}
      {paidDialog && <PaidDialog order={paidDialog} onClose={() => setPaidDialog(null)} onSave={saveOrder} />}
      {trackingDialog && <TrackingDialog order={trackingDialog} onClose={() => setTrackingDialog(null)} onSave={saveOrder} />}

      {toast && (
        <div style={{ position: 'fixed', bottom: '24px', left: '24px', background: '#10b981', color: '#fff', padding: '14px 20px', borderRadius: '12px', fontWeight: 'bold', fontSize: '15px', zIndex: 9999, boxShadow: '0 8px 30px rgba(16,185,129,0.4)' }}>{toast}</div>
      )}
    </div>
  );
}

function StatCard({ title, value, subtitle, color }) {
  return (
    <div style={{ background: '#111', borderRadius: '12px', padding: '20px', border: '1px solid #222', borderTop: `3px solid ${color}` }}>
      <div style={{ color: '#888', fontSize: '13px', marginBottom: '6px' }}>{title}</div>
      <div style={{ fontSize: '28px', fontWeight: 'bold', color }}>{value}</div>
      {subtitle && <div style={{ color: '#666', fontSize: '12px', marginTop: '4px' }}>{subtitle}</div>}
    </div>
  );
}

const btn = (bg, color = '#fff', extra = {}) => ({ background: bg, color, border: 'none', padding: '9px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold', minHeight: '40px', whiteSpace: 'nowrap', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '5px', ...extra });

function OrdersList({ title, mode, orders, onView, onPaid, onTracking, onSave, onDelete, showToast }) {
  const sendWA = (o, key, stampField) => {
    window.open(waLink(o.phone, MSG[key](o)), '_blank', 'noopener');
    if (stampField) onSave(o, { [stampField]: new Date().toISOString() });
  };
  const markDelivered = (o) => {
    if (!window.confirm(`לסמן שההזמנה של ${o.full_name} נמסרה?`)) return;
    onSave(o, { status: 'Delivered', delivered_at: new Date().toISOString() }, 'סומן כנמסר');
  };
  const cancel = (o) => {
    if (!window.confirm(`לבטל את ההזמנה של ${o.full_name}?`)) return;
    onSave(o, { status: 'Cancelled', cancelled_at: new Date().toISOString() }, 'ההזמנה בוטלה');
  };
  const restore = (o) => onSave(o, { status: o.payment_status === 'Paid' ? 'Processing' : 'New', cancelled_at: null }, 'ההזמנה שוחזרה');

  return (
    <div>
      <h2 style={{ marginBottom: '16px' }}>{title} ({orders.length})</h2>
      <div style={{ display: 'grid', gap: '12px' }}>
        {orders.length === 0 && <div style={{ color: '#888', padding: '40px', textAlign: 'center' }}>אין הזמנות</div>}
        {orders.map(o => {
          const st = STATUS_META[o.status] || STATUS_META.New;
          return (
            <div key={o.id} style={{ background: '#111', border: `1px solid ${mode === 'pending' ? '#fb923c55' : '#222'}`, borderRadius: '12px', padding: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
                <div style={{ cursor: 'pointer', flex: 1, minWidth: '200px' }} onClick={() => onView(o)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 'bold', fontSize: '17px' }}>{o.full_name}</span>
                    <span style={{ background: st.color + '33', color: st.color, padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 'bold' }}>{st.label}</span>
                    {o.payment_status === 'Paid' && <span style={{ background: '#10b98133', color: '#10b981', padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 'bold' }}>שולם · {o.payment_method || ''}</span>}
                  </div>
                  <div style={{ color: '#aaa', fontSize: '13px', marginTop: '4px', direction: 'ltr', textAlign: 'right' }}>{o.phone}</div>
                  <div style={{ color: '#888', fontSize: '13px' }}>{o.city}, {o.street}{o.notes ? ` · ${o.notes}` : ''}</div>
                  <div style={{ color: '#666', fontSize: '12px', marginTop: '4px' }}>{shortId(o)} · {relativeTime(o.created_date)}</div>
                  {o.tracking_number && <div style={{ color: '#3b82f6', fontSize: '13px', marginTop: '4px' }}>מעקב: <span dir="ltr">{o.tracking_number}</span>{o.tracking_message_sent_at ? ' · נשלח ללקוח ✓' : ''}</div>}
                  {o.confirm_message_sent_at && mode === 'pending' && <div style={{ color: '#fbbf24', fontSize: '12px', marginTop: '4px' }}>הודעת אישור נשלחה {relativeTime(o.confirm_message_sent_at)}</div>}
                </div>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontSize: '22px', fontWeight: 'bold', color: o.payment_status === 'Paid' ? '#10b981' : '#fb923c' }}>₪{o.total_amount}</div>
                  <div style={{ color: '#888', fontSize: '12px' }}>{boxesLabel(o.boxes)}</div>
                </div>
              </div>

              <div className="crm-action-btns" style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '12px' }}>
                <a href={`tel:${o.phone}`} style={btn('#222')}>📞 חייג</a>
                {mode === 'pending' && <>
                  <button onClick={() => sendWA(o, 'confirm', 'confirm_message_sent_at')} style={btn('#25d366', '#000')}>💬 אישור + תשלום</button>
                  <button onClick={() => onPaid(o)} style={btn('#10b981')}>✓ סמן שולם</button>
                  <button onClick={() => cancel(o)} style={btn('#333')}>בטל</button>
                </>}
                {mode === 'paid' && <>
                  {!o.paid_message_sent_at && <button onClick={() => sendWA(o, 'paid', 'paid_message_sent_at')} style={btn('#25d366', '#000')}>💬 תודה על התשלום</button>}
                  <button onClick={() => onTracking(o)} style={btn(o.tracking_number ? '#1e3a8a' : '#3b82f6')}>🚚 {o.tracking_number ? 'עדכן מעקב' : 'מספר מעקב'}</button>
                  {o.tracking_number && o.status !== 'Delivered' && <button onClick={() => sendWA(o, 'tracking', 'tracking_message_sent_at')} style={btn(o.tracking_message_sent_at ? '#166534' : '#25d366', o.tracking_message_sent_at ? '#fff' : '#000')}>💬 שלח מעקב{o.tracking_message_sent_at ? ' שוב' : ''}</button>}
                  {o.status !== 'Delivered' && <button onClick={() => markDelivered(o)} style={btn('#065f46')}>📬 נמסר</button>}
                  {o.status === 'Delivered' && !o.delivered_message_sent_at && <button onClick={() => sendWA(o, 'delivered', 'delivered_message_sent_at')} style={btn('#25d366', '#000')}>💬 הודעת "הגיע?"</button>}
                  <button onClick={() => cancel(o)} style={btn('#333')}>בטל</button>
                </>}
                {mode === 'cancelled' && <>
                  <button onClick={() => restore(o)} style={btn('#3b82f6')}>שחזר</button>
                  <button onClick={() => onDelete(o)} style={btn('#7f1d1d')}>מחק לצמיתות</button>
                </>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FinancePanel({ orders, expenses, costPerBox, onCostChange }) {
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const months = {};
  orders.forEach(o => {
    const k = ilMonthKey(o.paid_at || o.created_date);
    months[k] = months[k] || { revenue: 0, boxes: 0, orders: 0, ads: 0 };
    months[k].revenue += Number(o.total_amount) || 0;
    months[k].boxes += Number(o.boxes) || 1;
    months[k].orders += 1;
  });
  expenses.forEach(e => {
    const k = ilMonthKey(e.expense_date || e.created_date);
    months[k] = months[k] || { revenue: 0, boxes: 0, orders: 0, ads: 0 };
    months[k].ads += Number(e.amount) || 0;
  });
  const years = [...new Set(Object.keys(months).map(k => k.split('-')[0]))].sort().reverse();
  const keys = Object.keys(months).filter(k => k.startsWith(year)).sort().reverse();
  const sum = (f) => keys.reduce((s, k) => s + months[k][f], 0);
  const cost = sum('boxes') * costPerBox;
  const profit = sum('revenue') - cost - sum('ads');
  const cell = { padding: '10px 8px', borderBottom: '1px solid #222', fontSize: '14px', whiteSpace: 'nowrap' };

  return (
    <div>
      <h2 style={{ marginBottom: '16px' }}>כספים</h2>
      <div style={{ background: '#111', border: '1px solid #222', borderRadius: '12px', padding: '16px', marginBottom: '16px', display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' }}>
          עלות לקופסה (₪)
          <input type="number" value={costPerBox} onChange={e => onCostChange(e.target.value)} style={{ width: '100px', padding: '8px', background: '#000', border: '1px solid #333', borderRadius: '8px', color: '#fff', fontSize: '16px' }} />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' }}>
          שנה
          <select value={year} onChange={e => setYear(e.target.value)} style={{ padding: '8px', background: '#000', border: '1px solid #333', borderRadius: '8px', color: '#fff', fontSize: '16px' }}>
            {(years.length ? years : [year]).map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>
        <span style={{ color: '#666', fontSize: '12px' }}>עלות הקופסה נשמרת בדפדפן הזה בלבד (כמו ב-ULTRAS KIT)</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: '12px', marginBottom: '20px' }}>
        <StatCard title="הכנסות" value={`₪${sum('revenue').toLocaleString()}`} subtitle={`${sum('orders')} הזמנות`} color="#10b981" />
        <StatCard title="עלות סחורה" value={`₪${cost.toLocaleString()}`} subtitle={`${sum('boxes')} קופסאות × ${costPerBox}`} color="#f59e0b" />
        <StatCard title="פרסום" value={`₪${sum('ads').toLocaleString()}`} color="#ec4899" />
        <StatCard title="רווח נטו" value={`₪${profit.toLocaleString()}`} subtitle={sum('revenue') > 0 ? `${Math.round(profit / sum('revenue') * 100)}% מרווח` : ''} color={profit >= 0 ? '#22c55e' : '#ef4444'} />
      </div>
      <div style={{ background: '#111', border: '1px solid #222', borderRadius: '12px', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right' }}>
          <thead><tr style={{ color: '#888', fontSize: '12px' }}>
            <th style={cell}>חודש</th><th style={cell}>הזמנות</th><th style={cell}>קופסאות</th><th style={cell}>הכנסות</th><th style={cell}>עלות</th><th style={cell}>פרסום</th><th style={cell}>רווח</th>
          </tr></thead>
          <tbody>
            {keys.length === 0 && <tr><td colSpan="7" style={{ ...cell, color: '#888', textAlign: 'center' }}>אין נתונים לשנה זו</td></tr>}
            {keys.map(k => { const m = months[k]; const c = m.boxes * costPerBox; const p = m.revenue - c - m.ads; return (
              <tr key={k}>
                <td style={cell}>{ilMonthLabel(k)}</td><td style={cell}>{m.orders}</td><td style={cell}>{m.boxes}</td>
                <td style={{ ...cell, color: '#10b981' }}>₪{m.revenue.toLocaleString()}</td><td style={cell}>₪{c.toLocaleString()}</td><td style={cell}>₪{m.ads.toLocaleString()}</td>
                <td style={{ ...cell, color: p >= 0 ? '#22c55e' : '#ef4444', fontWeight: 'bold' }}>₪{p.toLocaleString()}</td>
              </tr>); })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const PLATFORM_META = {
  instagram: { label: 'אינסטגרם', color: '#e1306c' },
  tiktok: { label: 'טיקטוק', color: '#22d3ee' },
  facebook: { label: 'פייסבוק', color: '#3b82f6' },
  google: { label: 'גוגל', color: '#f59e0b' },
  other: { label: 'אחר', color: '#9ca3af' },
};
function ExpensesPanel({ expenses, onRefresh }) {
  const today = ilDayKeyOfDate(new Date());
  const [form, setForm] = useState({ expense_date: today, platform: 'instagram', amount: '', category: 'פרסום', note: '' });
  const [saving, setSaving] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (!form.amount) return;
    setSaving(true);
    try { await Expense.create({ ...form, amount: Number(form.amount) }); setForm({ ...form, amount: '', note: '' }); onRefresh(); }
    catch (err) { alert('שגיאה: ' + err.message); }
    setSaving(false);
  };
  const remove = async (x) => { if (!window.confirm('למחוק את ההוצאה?')) return; await Expense.delete(x.id); onRefresh(); };
  const input = { padding: '10px', background: '#000', border: '1px solid #333', borderRadius: '8px', color: '#fff', fontSize: '16px' };
  return (
    <div>
      <h2 style={{ marginBottom: '16px' }}>הוצאות (פרסום ואחרות)</h2>
      <form onSubmit={submit} style={{ background: '#111', border: '1px solid #222', borderRadius: '12px', padding: '16px', marginBottom: '16px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: '10px', alignItems: 'end' }}>
        <label style={{ fontSize: '12px', color: '#888' }}>תאריך<input type="date" value={form.expense_date} onChange={e => setForm({ ...form, expense_date: e.target.value })} style={{ ...input, width: '100%', display: 'block', marginTop: '4px' }} /></label>
        <label style={{ fontSize: '12px', color: '#888' }}>פלטפורמה<select value={form.platform} onChange={e => setForm({ ...form, platform: e.target.value })} style={{ ...input, width: '100%', display: 'block', marginTop: '4px' }}>{Object.entries(PLATFORM_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></label>
        <label style={{ fontSize: '12px', color: '#888' }}>סוג<select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} style={{ ...input, width: '100%', display: 'block', marginTop: '4px' }}>{['פרסום', 'מלאי', 'משלוח', 'אחר'].map(c => <option key={c}>{c}</option>)}</select></label>
        <label style={{ fontSize: '12px', color: '#888' }}>סכום ₪<input type="number" min="0" step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} required style={{ ...input, width: '100%', display: 'block', marginTop: '4px' }} /></label>
        <label style={{ fontSize: '12px', color: '#888', gridColumn: 'span 2' }}>הערה / קמפיין<input type="text" value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} style={{ ...input, width: '100%', display: 'block', marginTop: '4px' }} /></label>
        <button type="submit" disabled={saving} style={btn('#fff', '#000', { minHeight: '44px', justifyContent: 'center' })}>{saving ? 'שומר...' : '+ הוסף הוצאה'}</button>
      </form>
      <div style={{ display: 'grid', gap: '8px' }}>
        {expenses.length === 0 && <div style={{ color: '#888', padding: '30px', textAlign: 'center' }}>אין הוצאות עדיין</div>}
        {expenses.map(x => { const pm = PLATFORM_META[x.platform] || PLATFORM_META.other; return (
          <div key={x.id} style={{ background: '#111', border: '1px solid #222', borderRadius: '10px', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <div>
              <span style={{ background: pm.color + '33', color: pm.color, padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 'bold', marginInlineEnd: '8px' }}>{pm.label}</span>
              <span style={{ fontSize: '13px', color: '#aaa' }}>{x.category}{x.note ? ` · ${x.note}` : ''}</span>
              <div style={{ fontSize: '12px', color: '#666', marginTop: '2px' }}>{x.expense_date}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontWeight: 'bold', fontSize: '18px', color: '#ec4899' }}>₪{Number(x.amount).toLocaleString()}</span>
              <button onClick={() => remove(x)} style={btn('#333', '#fff', { minHeight: '36px', padding: '6px 10px' })}>מחק</button>
            </div>
          </div>); })}
      </div>
    </div>
  );
}

const dialogBg = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 1000, padding: '12px', overflowY: 'auto' };
const dialogBox = { background: '#111', borderRadius: '16px', maxWidth: '560px', width: '95%', maxHeight: '90vh', overflow: 'auto', border: '1px solid #333', margin: 'auto', padding: '20px' };
function Row({ label, value }) {
  return <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', padding: '8px 0', borderBottom: '1px solid #1f1f1f', fontSize: '14px' }}><span style={{ color: '#888' }}>{label}</span><span style={{ textAlign: 'left' }}>{value || '-'}</span></div>;
}

function OrderDetailDialog({ order: o, onClose }) {
  const st = STATUS_META[o.status] || STATUS_META.New;
  return (
    <div style={dialogBg} onClick={onClose}>
      <div style={dialogBox} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h3 style={{ margin: 0 }}>הזמנה {shortId(o)}</h3>
          <button onClick={onClose} style={btn('#222')}>✕</button>
        </div>
        <Row label="שם" value={o.full_name} />
        <Row label="טלפון" value={<a href={`tel:${o.phone}`} dir="ltr" style={{ color: '#3b82f6' }}>{o.phone}</a>} />
        <Row label="כתובת" value={`${o.street || ''}, ${o.city || ''}`} />
        <Row label="הערות" value={o.notes} />
        <Row label="מוצר" value={`${boxesLabel(o.boxes)} · ${PRODUCT_NAME}`} />
        <Row label="סכום" value={`₪${o.total_amount}`} />
        <Row label="סטטוס" value={<span style={{ color: st.color }}>{st.label}</span>} />
        <Row label="תשלום" value={o.payment_status === 'Paid' ? `שולם ✓ · ${o.payment_method || ''} · ${ilDateTime(o.paid_at)}` : 'ממתין לתשלום'} />
        <Row label="מעקב" value={o.tracking_number ? <span dir="ltr">{o.tracking_number}</span> : null} />
        <Row label="נוצרה" value={ilDateTime(o.created_date)} />
        <Row label="מקור" value={o.source} />
        <div style={{ marginTop: '14px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <a href={waLink(o.phone, `היי ${o.full_name}, כאן תאי סיקרט 🌿`)} target="_blank" rel="noopener" style={btn('#25d366', '#000')}>💬 וואטסאפ חופשי</a>
          <button onClick={() => { navigator.clipboard.writeText(`${o.full_name}\n${o.phone}\n${o.street}, ${o.city}\n${boxesLabel(o.boxes)} · ₪${o.total_amount}${o.notes ? '\n' + o.notes : ''}`); }} style={btn('#222')}>📋 העתק פרטי משלוח</button>
        </div>
      </div>
    </div>
  );
}

function PaidDialog({ order: o, onClose, onSave }) {
  const [method, setMethod] = useState(PAYMENT_METHODS[0]);
  const [amount, setAmount] = useState(o.total_amount);
  const [saving, setSaving] = useState(false);
  const confirm = async () => {
    setSaving(true);
    await onSave(o, { payment_status: 'Paid', payment_method: method, paid_at: new Date().toISOString(), total_amount: Number(amount) || o.total_amount, status: 'Processing' }, `סומן כשולם · ${method}`);
    setSaving(false); onClose();
  };
  return (
    <div style={dialogBg} onClick={onClose}>
      <div style={dialogBox} onClick={e => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>סימון תשלום · {o.full_name}</h3>
        <div style={{ color: '#888', fontSize: '13px', marginBottom: '14px' }}>{boxesLabel(o.boxes)} · ההזמנה תעבור ל"בטיפול"</div>
        <label style={{ display: 'block', fontSize: '13px', color: '#888', marginBottom: '10px' }}>סכום שהתקבל (₪)
          <input type="number" value={amount} onChange={e => setAmount(e.target.value)} style={{ display: 'block', width: '100%', marginTop: '4px', padding: '10px', background: '#000', border: '1px solid #333', borderRadius: '8px', color: '#fff', fontSize: '16px', boxSizing: 'border-box' }} />
        </label>
        <div style={{ fontSize: '13px', color: '#888', marginBottom: '6px' }}>אמצעי תשלום</div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
          {PAYMENT_METHODS.map(m => <button key={m} onClick={() => setMethod(m)} style={btn(method === m ? '#fff' : '#222', method === m ? '#000' : '#fff')}>{m}</button>)}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={confirm} disabled={saving} style={btn('#10b981', '#fff', { flex: 1, justifyContent: 'center', minHeight: '46px' })}>{saving ? 'שומר...' : '✓ אשר תשלום'}</button>
          <button onClick={onClose} style={btn('#222')}>ביטול</button>
        </div>
      </div>
    </div>
  );
}

function TrackingDialog({ order: o, onClose, onSave }) {
  const [val, setVal] = useState(o.tracking_number || '');
  const [saving, setSaving] = useState(false);
  const save = async () => {
    const t = val.trim();
    if (!t) return;
    setSaving(true);
    await onSave(o, { tracking_number: t, tracking_added_at: new Date().toISOString(), status: o.status === 'Delivered' ? 'Delivered' : 'Shipped' }, 'מספר המעקב נשמר');
    setSaving(false); onClose();
  };
  return (
    <div style={dialogBg} onClick={onClose}>
      <div style={dialogBox} onClick={e => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>מספר מעקב · {o.full_name}</h3>
        <input autoFocus dir="ltr" value={val} onChange={e => setVal(e.target.value)} placeholder="RR123456789IL" style={{ width: '100%', padding: '12px', background: '#000', border: '1px solid #333', borderRadius: '8px', color: '#fff', fontSize: '18px', boxSizing: 'border-box', marginBottom: '14px' }} />
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={save} disabled={saving || !val.trim()} style={btn('#3b82f6', '#fff', { flex: 1, justifyContent: 'center', minHeight: '46px' })}>{saving ? 'שומר...' : 'שמור וסמן "נשלחה"'}</button>
          <button onClick={onClose} style={btn('#222')}>ביטול</button>
        </div>
      </div>
    </div>
  );
}
