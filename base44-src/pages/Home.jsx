import React, { useEffect, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import '@/styles/site.css';

// תאי סיקרט - storefront. Port of the static scroll-cinematic site (green-bio/site).
// One continuous film scrubs to the scroll position; the order form writes straight
// into the Order entity that /crm-admin reads. No Make, no webhooks.

const MEDIA = '/media';
const PRICES = { 1: 249, 2: 419 };
const DUR = [8, 5, 6, 6, 6]; // per-scene seconds of the film - update when the real film is built

export default function Home() {
  const rootRef = useRef(null);
  const [qty, setQty] = useState('1');
  const [status, setStatus] = useState({ type: '', msg: '' });
  const [errors, setErrors] = useState({});
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute('lang', 'he');
    document.documentElement.setAttribute('dir', 'rtl');
    document.documentElement.classList.add('js');
    document.title = 'תאי סיקרט | Green Bio Super Treatment - מסכת שיער מתאילנד, 24 שקיות';
    return () => document.documentElement.classList.remove('js', 'reveal-on');
  }, []);

  /* ---------- scrub engine (from the static site's main.js) ---------- */
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const mqMobile = window.matchMedia('(max-width: 820px), (orientation: portrait)');
    const film = root.querySelector('#film');
    const video = root.querySelector('#filmVideo');
    const caps = Array.from(root.querySelectorAll('.cap'));
    const dots = Array.from(root.querySelectorAll('.dots a'));
    const cue = root.querySelector('#scrollCue');
    const nav = root.querySelector('#nav');
    const pbar = root.querySelector('#progress');
    const loader = root.querySelector('#loader');
    const sticky = root.querySelector('#stickybar');
    const orderSec = root.querySelector('#order');

    const TOTAL = DUR.reduce((a, b) => a + b, 0);
    const bands = []; let acc = 0;
    DUR.forEach(d => { const from = acc / TOTAL; acc += d; bands.push({ from, to: acc / TOTAL }); });

    let loaderGone = false;
    const hideLoader = () => { if (loaderGone || !loader) return; loaderGone = true; loader.classList.add('is-hidden'); loader.setAttribute('aria-hidden', 'true'); };
    const loaderCap = setTimeout(hideLoader, 2800);

    let ready = false, primed = false;
    const wantSrc = () => mqMobile.matches ? video.dataset.srcM : video.dataset.src;
    const loadFilm = () => { const want = wantSrc(); if (video.getAttribute('src') !== want) { video.setAttribute('src', want); video.load(); ready = false; primed = false; } };
    const onMeta = () => { ready = true; update(); };
    video.addEventListener('loadedmetadata', onMeta);
    video.addEventListener('loadeddata', hideLoader);
    video.addEventListener('canplay', hideLoader);
    video.addEventListener('error', hideLoader);
    const prime = () => {
      if (primed) return; primed = true;
      const p = video.play();
      if (p && p.then) p.then(() => video.pause()).catch(() => { primed = false; });
      else { try { video.pause(); } catch (e) { /* noop */ } }
    };

    const dur = () => (video.duration && isFinite(video.duration)) ? video.duration : TOTAL;
    const filmProgress = () => {
      const scrollable = film.offsetHeight - window.innerHeight;
      if (scrollable <= 0) return 0;
      const p = -film.getBoundingClientRect().top / scrollable;
      return p < 0 ? 0 : (p > 1 ? 1 : p);
    };
    const activeIndex = (p) => { for (let i = 0; i < bands.length; i++) if (p < bands[i].to) return i; return bands.length - 1; };
    let lastP = 0;
    const bufferedEnd = () => { try { return video.buffered.length ? video.buffered.end(video.buffered.length - 1) : 0; } catch (e) { return 0; } };
    const seek = (t) => { if (!ready) return; const safe = Math.min(t, Math.max(0, bufferedEnd() - 0.05)); try { video.currentTime = safe; } catch (e) { /* noop */ } };
    const lerpOn = !prefersReduced && typeof window.requestAnimationFrame === 'function';
    let targetT = 0, currentT = 0, rafId = null;
    const tick = () => {
      const diff = targetT - currentT;
      if (Math.abs(diff) < 0.008) { currentT = targetT; seek(currentT); rafId = null; return; }
      currentT += diff * 0.22; seek(currentT); rafId = window.requestAnimationFrame(tick);
    };
    const requestSeek = (t) => { if (!lerpOn) { seek(t); return; } targetT = t; if (rafId === null) rafId = window.requestAnimationFrame(tick); };

    const revealEls = Array.from(root.querySelectorAll('.reveal'));
    const runReveals = () => {
      const vh = window.innerHeight || document.documentElement.clientHeight || 800;
      revealEls.forEach(el => { if (!el.classList.contains('is-in') && el.getBoundingClientRect().top < vh * 0.92) el.classList.add('is-in'); });
    };
    function update() {
      const p = filmProgress(); lastP = p;
      const idx = activeIndex(p);
      caps.forEach((c, i) => c.classList.toggle('is-active', i === idx));
      dots.forEach((d, j) => d.classList.toggle('is-active', j === idx));
      if (cue) cue.style.opacity = p > 0.02 ? '0' : '';
      requestSeek(p * dur());
    }
    const onScroll = () => {
      update();
      const st = window.scrollY || window.pageYOffset;
      const h = document.documentElement.scrollHeight - window.innerHeight;
      if (pbar) pbar.style.transform = `scaleX(${h > 0 ? st / h : 0})`;
      if (nav) nav.classList.toggle('is-scrolled', st > 40);
      if (sticky) {
        const vh = window.innerHeight || 800;
        const onForm = orderSec && orderSec.getBoundingClientRect().top < vh * 0.6;
        const on = st > vh * 0.9 && !onForm;
        sticky.classList.toggle('is-on', on);
        sticky.setAttribute('aria-hidden', String(!on));
      }
      runReveals();
    };
    const onProgress = () => requestSeek(lastP * dur());
    const onMQ = () => { loadFilm(); prime(); update(); };
    const scrollToBand = (i) => {
      const scrollable = film.offsetHeight - window.innerHeight;
      const mid = (bands[i].from + bands[i].to) / 2;
      window.scrollTo({ top: Math.round(film.offsetTop + mid * scrollable), behavior: 'smooth' });
    };
    const dotHandlers = dots.map((d, i) => { const h = (e) => { e.preventDefault(); scrollToBand(i); }; d.addEventListener('click', h); return h; });

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', update, { passive: true });
    video.addEventListener('progress', onProgress);
    const primeEvents = ['touchstart', 'pointerdown', 'click', 'keydown'];
    primeEvents.forEach(ev => window.addEventListener(ev, prime, { once: true, passive: true }));
    if (mqMobile.addEventListener) mqMobile.addEventListener('change', onMQ);

    loadFilm(); prime();
    if (!prefersReduced) document.documentElement.classList.add('reveal-on');
    onScroll();

    return () => {
      clearTimeout(loaderCap);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', update);
      video.removeEventListener('loadedmetadata', onMeta);
      video.removeEventListener('loadeddata', hideLoader);
      video.removeEventListener('canplay', hideLoader);
      video.removeEventListener('error', hideLoader);
      video.removeEventListener('progress', onProgress);
      primeEvents.forEach(ev => window.removeEventListener(ev, prime));
      if (mqMobile.removeEventListener) mqMobile.removeEventListener('change', onMQ);
      dots.forEach((d, i) => d.removeEventListener('click', dotHandlers[i]));
      if (rafId !== null) window.cancelAnimationFrame(rafId);
    };
  }, []);

  /* ---------- order form ---------- */
  const pick = (v) => (e) => { setQty(v); };
  const submit = async (e) => {
    e.preventDefault();
    const f = e.target;
    const val = (n) => (f.elements[n].value || '').trim();
    const name = val('name'), phone = val('phone').replace(/[\s-]/g, ''), city = val('city'), street = val('address'), notes = val('notes');
    const errs = {};
    if (name.length < 2) errs.name = 'איך קוראים לך? שם מלא בבקשה';
    if (!/^0(5\d|[2-4,8-9])\d{7}$/.test(phone)) errs.phone = 'מספר טלפון ישראלי, לדוגמה 052-1234567';
    if (city.length < 2) errs.city = 'באיזו עיר?';
    if (street.length < 3) errs.address = 'רחוב ומספר בית למשלוח';
    setErrors(errs);
    if (Object.keys(errs).length) { f.elements[Object.keys(errs)[0]].focus(); return; }
    setSending(true); setStatus({ type: '', msg: '' });
    try {
      await base44.entities.Order.create({
        full_name: name, phone: val('phone'), city, street, notes,
        boxes: Number(qty), total_amount: PRICES[qty],
        product: 'Green Bio Super Treatment 24x30ml',
        status: 'New', payment_status: 'Waiting for Payment', source: 'site',
        order_number: 'TS-' + Date.now().toString(36).toUpperCase().slice(-6),
      });
      setDone(true);
    } catch (err) {
      setStatus({ type: 'err', msg: 'משהו השתבש בשליחה. נסו שוב, או כתבו לנו באינסטגרם.' });
    }
    setSending(false);
  };
  const field = (id, name, label, extra = {}) => (
    <div className={`field${errors[name] ? ' is-invalid' : ''}`}>
      <label htmlFor={id}>{label} <span aria-hidden="true">*</span></label>
      <input id={id} name={name} required aria-invalid={errors[name] ? 'true' : 'false'} onBlur={() => errors[name] && setErrors({ ...errors, [name]: '' })} {...extra} />
      <p className="field__err" id={`${id}-err`}>{errors[name] || ''}</p>
    </div>
  );
  const closeMenu = () => setMenuOpen(false);

  return (
    <div ref={rootRef} id="top">
      <a className="skip-link" href="#product">דלגו לתוכן</a>

      <div className="loader" id="loader" aria-hidden="true">
        <div className="loader__inner">
          <span className="loader__brand">תאי סיקרט</span>
          <span className="loader__sub">Green Bio Super Treatment</span>
          <span className="loader__line"></span>
        </div>
      </div>
      <div className="progress" id="progress" aria-hidden="true"></div>

      <header className={`nav${menuOpen ? ' is-open' : ''}`} id="nav">
        <a className="nav__brand" href="#top">
          <span className="nav__brand-main">תאי סיקרט</span>
          <span className="nav__brand-sub">Thai Secret</span>
        </a>
        <nav className="nav__links" id="navLinks" aria-label="ניווט ראשי">
          <a href="#product" onClick={closeMenu}>המוצר</a>
          <a href="#why" onClick={closeMenu}>למה זה עובד</a>
          <a href="#how" onClick={closeMenu}>איך משתמשים</a>
          <a href="#faq" onClick={closeMenu}>שאלות</a>
          <a href="#order" className="btn btn--primary" onClick={closeMenu}>הזמינו עכשיו</a>
        </nav>
        <button className="nav__toggle" id="navToggle" aria-label="פתיחת תפריט" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>
          <span></span><span></span><span></span>
        </button>
      </header>

      <nav className="dots" id="dots" aria-label="ניווט בסצנות">
        {[0, 1, 2, 3, 4].map(i => <a key={i} href="#film" data-scene={i} aria-label={`סצנה ${i + 1}`}></a>)}
      </nav>

      <main>
        <section className="film" id="film">
          <div className="film__stage">
            <video className="film__video" id="filmVideo" muted playsInline preload="auto"
              data-src={`${MEDIA}/film.mp4`} data-src-m={`${MEDIA}/film_m.mp4`}
              poster={`${MEDIA}/poster.jpg`} aria-label="סרטון: שיער לפני ואחרי הטיפול"></video>
            <div className="film__scrim"></div>
            <div className="caps">
              <div className="cap cap--start is-active" data-scene="0">
                <div className="cap__inner"><div className="cap__text">
                  <p className="eyebrow">תאי סיקרט &middot; Green Bio</p>
                  <h1 className="hero__title">השיער שלך מגיע לכאן עייף</h1>
                  <p className="hero__tagline">החלקה, צבע, הבהרה. הטיפול מתאילנד שמחזיר את מה שהכימיה לקחה.</p>
                  <a className="btn btn--primary btn--lg" href="#order">הזמינו עכשיו</a>
                </div></div>
              </div>
              <div className="cap cap--end" data-scene="1">
                <div className="cap__inner"><div className="cap__text">
                  <p className="eyebrow">שקית אחת</p>
                  <h2 className="scene__title">30 מ״ל של תיקון</h2>
                  <p className="scene__body">קרם עשיר עם קרטין, תמצית משי ושמן חמניות. שקית אחת = טיפול אחד מלא.</p>
                </div></div>
              </div>
              <div className="cap cap--start" data-scene="2">
                <div className="cap__inner"><div className="cap__text">
                  <p className="eyebrow">המריחה</p>
                  <h2 className="scene__title">עוטף כל שערה</h2>
                  <p className="scene__body">על שיער נקי ולח, מהאמצע עד הקצוות. הקרם נמס פנימה תוך דקות.</p>
                </div></div>
              </div>
              <div className="cap cap--end" data-scene="3">
                <div className="cap__inner"><div className="cap__text">
                  <p className="eyebrow">2 עד 5 דקות</p>
                  <h2 className="scene__title">שוטפים. וזהו.</h2>
                  <p className="scene__body">בלי אדים, בלי מכשירים. מים נקיים, והיד עוברת בלי להיתקע.</p>
                </div></div>
              </div>
              <div className="cap cap--end cap--cta" data-scene="4">
                <div className="cap__inner"><div className="cap__text">
                  <p className="eyebrow">24 שקיות. 24 טיפולים.</p>
                  <h2 className="scene__title scene__title--xl">חלק. מבריק. שלך.</h2>
                  <div className="cta__actions">
                    <a className="btn btn--primary btn--lg" href="#order" onClick={pick('1')}>הזמינו עכשיו <span className="ltr">249 ₪</span></a>
                    <a className="btn btn--ghost btn--lg" href="#order" onClick={pick('2')}>מבצע זוג <span className="ltr">419 ₪</span></a>
                  </div>
                </div></div>
              </div>
            </div>
            <a className="scroll-cue" id="scrollCue" href="#product" aria-label="גללו למטה">
              <span className="scroll-cue__label">גללו</span>
              <span className="scroll-cue__line"></span>
            </a>
          </div>
        </section>

        <section className="product" id="product">
          <div className="product__inner">
            <div className="product__media reveal">
              <img className="product__img" src={`${MEDIA}/box.jpg`} width="1400" height="1867" alt="קופסת Green Bio Super Treatment עם 24 שקיות" loading="lazy" />
              <img className="product__img product__img--sachet" src={`${MEDIA}/sachet-front.jpg`} width="1050" height="1400" alt="שקית Green Bio Super Treatment Cream 30 מ״ל" loading="lazy" />
            </div>
            <div className="product__info">
              <p className="eyebrow reveal">המוצר</p>
              <h2 className="section-title reveal">Green Bio Super Treatment</h2>
              <p className="product__lead reveal">מסכת טיפול עמוק מתאילנד לשיער שעבר טיפול כימי. קופסה אחת = 24 שקיות של 30 מ״ל, 720 מ״ל סך הכל. שקית לכל טיפול, בלי לנחש כמויות.</p>
              <ul className="spec reveal">
                <li><span className="spec__k">כמות</span><span className="spec__v"><span className="ltr">24 x 30</span> מ״ל</span></li>
                <li><span className="spec__k">מתאים ל</span><span className="spec__v">שיער אחרי החלקה, צבע, הבהרה</span></li>
                <li><span className="spec__k">זמן טיפול</span><span className="spec__v">2 עד 5 דקות</span></li>
                <li><span className="spec__k">רכיבים בולטים</span><span className="spec__v">קרטין, תמצית משי, שמן חמניות, גליצרין</span></li>
                <li><span className="spec__k">מקור</span><span className="spec__v">Vechmart, תאילנד</span></li>
              </ul>
              <div className="prices reveal">
                <a className="price" href="#order" onClick={pick('1')}>
                  <span className="price__label">קופסה אחת</span>
                  <span className="price__num ltr">249 ₪</span>
                  <span className="price__note">24 טיפולים &middot; משלוח כלול</span>
                </a>
                <a className="price price--deal" href="#order" onClick={pick('2')}>
                  <span className="price__badge">המבצע</span>
                  <span className="price__label">2 קופסאות</span>
                  <span className="price__num ltr">419 ₪</span>
                  <span className="price__note">48 טיפולים &middot; חיסכון של <span className="ltr">79 ₪</span></span>
                </a>
              </div>
            </div>
          </div>
        </section>

        <section className="why" id="why">
          <div className="section-head">
            <p className="eyebrow">למה זה עובד</p>
            <h2 className="section-title">מה שהכימיה לוקחת, הקרם מחזיר</h2>
            <p className="section-sub">החלקה, צבע והבהרה פותחים את הסיב ומרוקנים אותו. הטיפול נכנס פנימה ומאזן מחדש.</p>
          </div>
          <div className="why__grid">
            <article className="card reveal">
              <svg className="card__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3c-2 4-6 6-6 11a6 6 0 0 0 12 0c0-5-4-7-6-11z" /></svg>
              <h3>חודר לעומק הסיב</h3>
              <p>נוסחה שמיועדת לשיער אחרי טיפול כימי: לא רק מצפה מבחוץ, אלא נכנסת פנימה ומחזירה גמישות.</p>
            </article>
            <article className="card reveal">
              <svg className="card__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 12c3-6 6-6 9 0s6 6 9 0" /><path d="M3 18c3-6 6-6 9 0s6 6 9 0" opacity=".5" /></svg>
              <h3>קרטין ותמצית משי</h3>
              <p>קרטין ממלא את מה שנשחק, תמצית משי ושמן חמניות מוסיפים ברק והחלקה שמרגישים ביד.</p>
            </article>
            <article className="card reveal">
              <svg className="card__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
              <h3>2 עד 5 דקות, בלי אדים</h3>
              <p>לא צריך מכשיר, לא צריך מספרה. חופפים, מורחים, ממתינים כמה דקות, שוטפים.</p>
            </article>
            <article className="card reveal">
              <svg className="card__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></svg>
              <h3>שקית = טיפול</h3>
              <p>30 מ״ל בכל שקית, המידה הנכונה לטיפול אחד. 24 שקיות בקופסה, בלי לנחש ובלי לבזבז.</p>
            </article>
          </div>
        </section>

        <section className="how" id="how">
          <div className="how__inner">
            <div className="how__text">
              <p className="eyebrow">איך משתמשים</p>
              <h2 className="section-title">ארבעה צעדים</h2>
              <ol className="steps">
                <li className="reveal"><span className="steps__n ltr">1</span><div><h3>חופפים</h3><p>שמפו רגיל, ומסירים את רוב המים במגבת. השיער צריך להיות לח, לא נוטף.</p></div></li>
                <li className="reveal"><span className="steps__n ltr">2</span><div><h3>מורחים שקית אחת</h3><p>מהאמצע עד הקצוות, ומעסים בעדינות כך שכל שערה מכוסה.</p></div></li>
                <li className="reveal"><span className="steps__n ltr">3</span><div><h3>ממתינים 2 עד 5 דקות</h3><p>בלי כיסוי, בלי חום. הקרם עובד לבד.</p></div></li>
                <li className="reveal"><span className="steps__n ltr">4</span><div><h3>שוטפים במים נקיים</h3><p>עד שהמים יוצאים צלולים. מייבשים כרגיל ומרגישים את ההבדל.</p></div></li>
              </ol>
              <p className="how__tip">טיפ: אחרי החלקה או צבע, טיפול פעם בשבוע שומר על התוצאה לאורך זמן.</p>
            </div>
            <figure className="how__media reveal">
              <img src={`${MEDIA}/sachet-hand.jpg`} width="1050" height="1400" alt="שקית Green Bio Super Treatment ביד" loading="lazy" />
            </figure>
          </div>
        </section>

        <section className="faq" id="faq">
          <div className="section-head">
            <p className="eyebrow">שאלות ותשובות</p>
            <h2 className="section-title">מה שרוצים לדעת</h2>
          </div>
          <div className="faq__list">
            <details className="faq__item reveal"><summary>למי הטיפול מתאים?</summary><p>לכל מי שהשיער שלו עבר החלקה, צבע, הבהרה או פרמננט ומרגיש יבש, מחוספס או חסר ברק. מתאים גם לשיער בריא כטיפול שבועי.</p></details>
            <details className="faq__item reveal"><summary>כמה זמן מספיקה קופסה?</summary><p>24 שקיות. בטיפול אחד בשבוע זה כחצי שנה. בשיער ארוך במיוחד לפעמים משתמשים בשקית וחצי.</p></details>
            <details className="faq__item reveal"><summary>צריך חום או אדים?</summary><p>לא. הנוסחה מיועדת לעבוד בטמפרטורת החדר. 2 עד 5 דקות ושוטפים.</p></details>
            <details className="faq__item reveal"><summary>איך משלמים ומה עם המשלוח?</summary><p>ממלאים את טופס ההזמנה, אנחנו חוזרים אליכם לאישור ולתיאום תשלום (ביט, פייבוקס או מזומן במשלוח). המשלוח כלול במחיר.</p></details>
            <details className="faq__item reveal"><summary>מה יש בפנים?</summary><p>מים, Cetrimonium Chloride, Cetyl Alcohol, Stearyl Alcohol, Isopropyl Myristate, Propylene Glycol, Silicone Quaternium-8, קרטין, תמצית משי (Silkworm Extract), Behentrimonium Chloride, שמן זרעי חמניות, גליצרין, ניחוח, DMDM Hydantoin.</p></details>
          </div>
        </section>

        <section className="order" id="order">
          <div className="order__inner">
            <div className="order__intro">
              <p className="eyebrow">הזמנה</p>
              <h2 className="section-title">הזמינו עכשיו</h2>
              <p className="section-sub">ממלאים פרטים, אנחנו חוזרים אליכם לאישור ולתיאום תשלום. משלוח כלול במחיר.</p>
              <ul className="order__trust">
                <li>משלוח עד הבית כלול</li>
                <li>תשלום רק אחרי אישור טלפוני</li>
                <li>ביט &middot; פייבוקס &middot; מזומן</li>
              </ul>
            </div>

            <form className={`form${done ? ' is-done' : ''}`} id="orderForm" noValidate onSubmit={submit}>
              <fieldset className="form__qty">
                <legend>מה מזמינים?</legend>
                <label className="qty">
                  <input type="radio" name="qty" value="1" checked={qty === '1'} onChange={() => setQty('1')} />
                  <span className="qty__box">
                    <span className="qty__label">קופסה אחת</span>
                    <span className="qty__price ltr">249 ₪</span>
                    <span className="qty__note">24 שקיות</span>
                  </span>
                </label>
                <label className="qty">
                  <input type="radio" name="qty" value="2" checked={qty === '2'} onChange={() => setQty('2')} />
                  <span className="qty__box">
                    <span className="qty__badge">המבצע</span>
                    <span className="qty__label">2 קופסאות</span>
                    <span className="qty__price ltr">419 ₪</span>
                    <span className="qty__note">48 שקיות &middot; חיסכון <span className="ltr">79 ₪</span></span>
                  </span>
                </label>
              </fieldset>

              <div className="form__grid">
                {field('fName', 'name', 'שם מלא', { type: 'text', autoComplete: 'name' })}
                {field('fPhone', 'phone', 'טלפון', { type: 'tel', inputMode: 'tel', autoComplete: 'tel', dir: 'ltr', placeholder: '05X-XXXXXXX' })}
                {field('fCity', 'city', 'עיר', { type: 'text', autoComplete: 'address-level2' })}
                {field('fAddress', 'address', 'רחוב ומספר', { type: 'text', autoComplete: 'street-address' })}
                <div className="field field--full">
                  <label htmlFor="fNotes">הערות למשלוח <span className="field__opt">(לא חובה)</span></label>
                  <textarea id="fNotes" name="notes" rows="2" placeholder="קומה, כניסה, שעות נוחות"></textarea>
                </div>
              </div>

              <div className="form__total">
                <span>סה״כ לתשלום</span>
                <strong className="ltr" id="orderTotal">{PRICES[qty]} ₪</strong>
              </div>

              <button className={`btn btn--primary btn--lg form__submit${sending ? ' is-loading' : ''}`} type="submit" disabled={sending}>
                <span className="form__submit-label">שליחת הזמנה</span>
              </button>
              <p className={`form__status${status.type ? ' is-' + status.type : ''}`} role="status" aria-live="polite">{status.msg}</p>
              <p className="form__fine">בלחיצה על שליחה אתם מאשרים שניצור קשר לאישור ההזמנה. לא נדרש תשלום עכשיו.</p>
              <div className="form__done" id="orderDone" tabIndex="-1">
                <h3>ההזמנה התקבלה</h3>
                <p>תודה! נחזור אליכם בהקדם לאישור ולתיאום התשלום והמשלוח.</p>
              </div>
            </form>
          </div>
        </section>

        <footer className="footer">
          <div className="footer__brand">
            <span className="footer__main">תאי סיקרט</span>
            <span className="footer__sub">Green Bio Super Treatment &middot; יבוא ישיר מתאילנד</span>
          </div>
          <nav className="footer__links" aria-label="ניווט תחתון">
            <a href="#top">למעלה</a>
            <a href="#product">המוצר</a>
            <a href="#how">איך משתמשים</a>
            <a href="#order">הזמנה</a>
          </nav>
          <p className="footer__legal">&copy; <span className="ltr">2026</span> תאי סיקרט. המוצר אינו תרופה ואינו מיועד לריפוי. לשימוש חיצוני בלבד.</p>
        </footer>
      </main>

      <div className="stickybar" id="stickybar" aria-hidden="true">
        <span className="stickybar__price"><strong className="ltr">249 ₪</strong> קופסה &middot; משלוח כלול</span>
        <a className="btn btn--primary" href="#order">הזמינו עכשיו</a>
      </div>
    </div>
  );
}
