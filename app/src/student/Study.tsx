import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useMotionValue, useSpring, useReducedMotion } from 'framer-motion';
import type { Grade } from 'ts-fsrs';
import { S, addStudySeconds, mediaUrl, useStore, type Card } from '../lib/store';
import { counts, fmtInterval, pickNext, preview, rate, undo, Rating, type Pick, type Undo } from '../lib/srs';
import { imageNames, renderCard } from '../lib/render';
import { scheduleSync } from '../lib/sync';
import { IClose, IUndo, Rosette } from '../ui/icons';
import type { StudyTarget } from './StudentApp';

const KEYS: { g: Grade; label: string; cls: string }[] = [
  { g: Rating.Again, label: 'نسيت', cls: 'again' },
  { g: Rating.Hard, label: 'صعبة', cls: 'hard' },
  { g: Rating.Good, label: 'جيدة', cls: 'good' },
  { g: Rating.Easy, label: 'سهلة', cls: 'easy' },
];

function useStudyClock() {
  const [sessionSec, setSessionSec] = useState(0);
  const lastAct = useRef(Date.now());
  const pending = useRef(0);
  useEffect(() => {
    const act = () => { lastAct.current = Date.now(); };
    window.addEventListener('pointerdown', act);
    window.addEventListener('keydown', act);
    const tick = setInterval(() => {
      if (document.visibilityState !== 'visible' || Date.now() - lastAct.current > 90_000) return;
      pending.current++;
      setSessionSec((s) => s + 1);
      if (pending.current >= 10) { addStudySeconds(pending.current); pending.current = 0; }
    }, 1000);
    return () => {
      clearInterval(tick);
      window.removeEventListener('pointerdown', act);
      window.removeEventListener('keydown', act);
      addStudySeconds(pending.current);
      pending.current = 0;
    };
  }, []);
  return sessionSec;
}

function Watermark() {
  const s = S.session;
  const text = `${s?.label ?? ''} ${s?.code ? s.code.slice(0, 4) + '-' + s.code.slice(4) : ''}`.trim();
  return <div className="watermark" aria-hidden>{Array.from({ length: 24 }, (_, i) => <span key={i}>{text}</span>)}</div>;
}

function Face({ card, side, media }: { card: Card; side: 'front' | 'back'; media: Map<string, string> }) {
  const html = useMemo(() => renderCard(card, side, media), [card, side, media]);
  const long = (side === 'back' ? card.front.length + card.back.length : card.front.length) > 240;
  const deck = S.decks.find((d) => d.id === card.deck_id)?.name ?? '';
  return (
    <div className={'face ' + side}>
      <div className="edge" />
      <div className="deckname"><span>{deck}</span><span>{side === 'front' ? 'السؤال' : 'الإجابة'}</span></div>
      <div className={'content' + (long ? ' long' : '')} dangerouslySetInnerHTML={{ __html: html }} />
      <Watermark />
    </div>
  );
}

export default function Study({ target, onClose }: { target: StudyTarget; onClose: () => void }) {
  useStore();
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(0);
  const [cur, setCur] = useState<Pick>(() => pickNext(target.deckIds, 0));
  const [flipped, setFlipped] = useState(false);
  const [media, setMedia] = useState<Map<string, string>>(new Map());
  const [last, setLast] = useState<Undo | null>(null);
  const busy = useRef(false);
  const shownAt = useRef(Date.now());
  const sessionSec = useStudyClock();

  const card = cur && 'card' in cur ? cur.card : null;
  const kind = cur && 'card' in cur ? cur.kind : null;

  // load images for the current card
  useEffect(() => {
    if (!card) return;
    let live = true;
    shownAt.current = Date.now();
    setFlipped(false);
    const names = imageNames(card);
    Promise.all(names.map(async (n) => [n, await mediaUrl(n)] as const)).then((pairs) => {
      if (!live) return;
      const m = new Map<string, string>();
      for (const [n, u] of pairs) if (u) m.set(n, u);
      setMedia(m);
    });
    return () => { live = false; };
  }, [card?.id, shown]); // eslint-disable-line react-hooks/exhaustive-deps

  // waiting for a learning card
  useEffect(() => {
    if (!cur || !('wait' in cur)) return;
    const t = setTimeout(() => setCur(pickNext(target.deckIds, shown)), Math.max(1000, cur.wait.getTime() - Date.now() - 20 * 60 * 1000 + 500));
    return () => clearTimeout(t);
  }, [cur, shown, target.deckIds]);

  useEffect(() => { if (cur === null) scheduleSync(0); }, [cur]);

  const intervals = useMemo(() => (card && flipped ? preview(card.id) : null), [card, flipped]);

  const answer = useCallback(async (g: Grade) => {
    if (!card || !flipped || busy.current) return;
    busy.current = true;
    try {
      const u = await rate(card.id, g, Date.now() - shownAt.current);
      setLast(u);
      const next = shown + 1;
      setShown(next);
      setCur(pickNext(target.deckIds, next, card.id));
    } finally {
      busy.current = false;
    }
  }, [card, flipped, shown, target.deckIds]);

  const doUndo = useCallback(async () => {
    if (!last) return;
    await undo(last);
    const c = S.cards.get(last.cardId);
    setLast(null);
    setShown((s) => Math.max(0, s - 1));
    if (c) setCur({ card: c, kind: 'review' });
  }, [last]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); if (!flipped) setFlipped(true); else answer(Rating.Good); return; }
      if (flipped && ['1', '2', '3', '4'].includes(e.key)) answer(Number(e.key) as Grade);
      if (e.key.toLowerCase() === 'z') doUndo();
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [flipped, answer, doUndo, onClose]);

  // tilt with pointer
  const rx = useMotionValue(0), ry = useMotionValue(0);
  const srx = useSpring(rx, { stiffness: 140, damping: 16 });
  const sry = useSpring(ry, { stiffness: 140, damping: 16 });
  const stageRef = useRef<HTMLDivElement>(null);
  const onMove = (e: React.PointerEvent) => {
    if (reduce || !stageRef.current) return;
    const r = stageRef.current.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    ry.set((x - 0.5) * 9);
    rx.set((0.5 - y) * 7);
    stageRef.current.style.setProperty('--gx', `${x * 100}%`);
    stageRef.current.style.setProperty('--gy', `${y * 100}%`);
  };
  const onLeave = () => { rx.set(0); ry.set(0); };

  const c = counts(target.deckIds);
  const mm = String(Math.floor(sessionSec / 60)).padStart(2, '0');
  const ss = String(sessionSec % 60).padStart(2, '0');

  return (
    <motion.div className="study protect" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
      <div className="study-top">
        <button className="icon-btn" onClick={onClose} aria-label="إغلاق"><IClose /></button>
        <div className="counts num">
          <span className={'n' + (kind === 'new' ? ' cur' : '')}>{c.fresh}</span>
          <span className={'l' + (kind === 'learn' ? ' cur' : '')}>{c.learn}</span>
          <span className={'r' + (kind === 'review' ? ' cur' : '')}>{c.review}</span>
        </div>
        <span className="timer num ltr">{mm}:{ss}</span>
        <button className="icon-btn" onClick={doUndo} disabled={!last} aria-label="تراجع" style={{ opacity: last ? 1 : 0.35 }}><IUndo /></button>
      </div>

      {card ? (
        <>
          <div className="stage" ref={stageRef} onPointerMove={onMove} onPointerLeave={onLeave}>
            <div className="sheet" style={{ transform: 'translateY(16px) scale(0.92)', opacity: 0.6 }} />
            <div className="sheet" style={{ transform: 'translateY(8px) scale(0.96)' }} />
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.div
                key={card.id + ':' + shown}
                style={{ position: 'absolute', inset: 0, rotateX: srx, rotateY: sry, transformStyle: 'preserve-3d' }}
                initial={reduce ? { opacity: 0 } : { y: 8, scale: 0.96, opacity: 0.4 }}
                animate={{ y: 0, scale: 1, opacity: 1 }}
                exit={reduce ? { opacity: 0 } : { y: -36, scale: 0.97, opacity: 0, rotateZ: -2 }}
                transition={{ type: 'spring', stiffness: 260, damping: 26 }}
              >
                <motion.div
                  className="flipcard"
                  animate={{ rotateY: flipped ? 180 : 0 }}
                  transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 170, damping: 20 }}
                  onClick={() => !flipped && setFlipped(true)}
                >
                  <Face card={card} side="front" media={media} />
                  <Face card={card} side="back" media={media} />
                </motion.div>
              </motion.div>
            </AnimatePresence>
          </div>

          <div className="answerbar">
            {!flipped ? (
              <button className="btn block" style={{ minHeight: 62, fontSize: 17 }} onClick={() => setFlipped(true)}>إظهار الإجابة</button>
            ) : (
              <motion.div className="keys" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>
                {KEYS.map((k) => (
                  <button key={k.g} className={'key ' + k.cls} onClick={() => answer(k.g)}>
                    <b>{k.label}</b>
                    <span className="num">{intervals ? fmtInterval(intervals[k.g]) : ''}</span>
                  </button>
                ))}
              </motion.div>
            )}
          </div>
        </>
      ) : cur && 'wait' in cur ? (
        <div className="stage" style={{ flexDirection: 'column', gap: 16, textAlign: 'center' }}>
          <div className="done-mark"><Rosette size={56} /></div>
          <h2 style={{ fontSize: 22 }}>استراحة قصيرة</h2>
          <p className="muted">البطاقة التالية بعد {fmtInterval(cur.wait)}. يمكنك الانتظار هنا أو العودة لاحقاً.</p>
          <button className="btn light" onClick={onClose}>العودة للرئيسية</button>
        </div>
      ) : (
        <div className="stage" style={{ flexDirection: 'column', gap: 16, textAlign: 'center' }}>
          <motion.div className="done-mark" initial={{ scale: 0.6, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 200, damping: 12 }}>
            <Rosette size={56} />
          </motion.div>
          <h2 style={{ fontSize: 24 }}>{shown ? 'أحسنت، أنهيت مراجعة اليوم' : 'لا توجد بطاقات مستحقة الآن'}</h2>
          {shown > 0 && <p className="muted num">راجعت {shown} بطاقة خلال {Math.max(1, Math.round(sessionSec / 60))} دقيقة في {target.title}.</p>}
          <button className="btn" onClick={onClose}>العودة للرئيسية</button>
        </div>
      )}
    </motion.div>
  );
}
