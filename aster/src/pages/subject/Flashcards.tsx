import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Play, Plus, RotateCcw, Trash2, Zap } from 'lucide-react';
import type { Card, SubjectId } from '../../types';
import { useStore } from '../../state/store';
import { subjectMeta } from '../../data/subjects';
import { cx, dayMonth, todayISO } from '../../lib/dates';
import { Empty } from '../../components/ui';

const shuffle = <T,>(a: T[]) => {
  const b = a.slice();
  for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; }
  return b;
};

/** "front :: back", "front | back" or a tab between them, one card per line. */
function parseBulk(text: string) {
  return text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
    const m = l.split(/\s*(?:::|\||\t)\s*/);
    return m.length >= 2 ? { front: m[0], back: m.slice(1).join(' ') } : null;
  }).filter((x): x is { front: string; back: string } => !!x && !!x.front && !!x.back);
}

export function Flashcards({ subject }: { subject: SubjectId }) {
  const { cards, addCards, deleteCard, reviewCard, notify } = useStore();
  const meta = subjectMeta(subject);
  const mine = useMemo(() => cards.filter((c) => c.subject === subject), [cards, subject]);
  const today = todayISO();
  const decks = useMemo(() => [...new Set(mine.map((c) => c.deck))].sort(), [mine]);
  const [deck, setDeck] = useState<string>('all');
  const [session, setSession] = useState<string[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [bulk, setBulk] = useState(false);
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [deckName, setDeckName] = useState('General');
  const [bulkText, setBulkText] = useState('');

  const inDeck = (c: Card) => deck === 'all' || c.deck === deck;
  const due = mine.filter((c) => c.due <= today && inDeck(c));
  const shown = mine.filter(inDeck);
  const known = mine.filter((c) => c.box >= 3).length;

  const add = (e: FormEvent) => {
    e.preventDefault();
    if (bulk) {
      const list = parseBulk(bulkText);
      if (!list.length) { notify('No cards found. Put one card per line as: question :: answer', 'warn'); return; }
      addCards(list.map((x) => ({ subject, deck: deckName.trim() || 'General', ...x })));
      setBulkText(''); notify(`Added ${list.length} card${list.length === 1 ? '' : 's'}`);
    } else {
      if (!front.trim() || !back.trim()) return;
      addCards([{ subject, deck: deckName.trim() || 'General', front: front.trim(), back: back.trim() }]);
      setFront(''); setBack('');
    }
  };

  if (session) return <Study ids={session} cards={mine} onReview={reviewCard} onExit={() => setSession(null)} color={meta.color} />;

  return (
    <div>
      <div className="fc-head">
        <div className="fc-stats">
          <div><span className="num num--big">{due.length}</span><span className="muted">due today</span></div>
          <div><span className="num num--big">{mine.length}</span><span className="muted">cards</span></div>
          <div><span className="num num--big">{known}</span><span className="muted">well known</span></div>
        </div>
        <div className="fc-actions">
          <button type="button" className="btn" disabled={!due.length} onClick={() => setSession(shuffle(due).map((c) => c.id))}><Play size={16} />Study {due.length ? `${due.length} due` : 'now'}</button>
          <button type="button" className="btn btn--ghost" onClick={() => setAdding(!adding)}><Plus size={16} />Add cards</button>
        </div>
      </div>

      {adding && (
        <form className="form fc-form" onSubmit={add}>
          <div className="fc-form__mode seg" role="group" aria-label="How to add">
            <button type="button" className={cx('seg__btn', !bulk && 'is-on')} aria-pressed={!bulk} onClick={() => setBulk(false)}>One card</button>
            <button type="button" className={cx('seg__btn', bulk && 'is-on')} aria-pressed={bulk} onClick={() => setBulk(true)}>Paste many</button>
          </div>
          <label className="field"><span className="field__label">Deck</span>
            <input className="input" list="deck-names" value={deckName} onChange={(e) => setDeckName(e.target.value)} placeholder="e.g. Trigonometry" />
            <datalist id="deck-names">{decks.map((d) => <option key={d} value={d} />)}</datalist>
          </label>
          {bulk ? (
            <label className="field field--full"><span className="field__label">One card per line: question :: answer</span>
              <textarea className="input" rows={6} value={bulkText} onChange={(e) => setBulkText(e.target.value)} placeholder={'sin 30 :: 0.5\nArea of a circle :: pi r squared\nPrivate limited company :: Shares cannot be sold to the public'} />
            </label>
          ) : (
            <>
              <label className="field field--full"><span className="field__label">Front (question)</span><textarea className="input" rows={2} value={front} onChange={(e) => setFront(e.target.value)} /></label>
              <label className="field field--full"><span className="field__label">Back (answer)</span><textarea className="input" rows={2} value={back} onChange={(e) => setBack(e.target.value)} /></label>
            </>
          )}
          <div className="form__actions"><button className="btn" type="submit">{bulk ? 'Add all' : 'Add card'}</button><button type="button" className="btn btn--ghost" onClick={() => setAdding(false)}>Done</button></div>
        </form>
      )}

      {decks.length > 0 && (
        <div className="decks" role="group" aria-label="Decks">
          <button type="button" className={cx('deck', deck === 'all' && 'is-on')} aria-pressed={deck === 'all'} onClick={() => setDeck('all')}>All decks<span>{mine.length}</span></button>
          {decks.map((d) => (
            <button key={d} type="button" className={cx('deck', deck === d && 'is-on')} aria-pressed={deck === d} onClick={() => setDeck(d)}>
              {d}<span>{mine.filter((c) => c.deck === d && c.due <= today).length || mine.filter((c) => c.deck === d).length}</span>
            </button>
          ))}
        </div>
      )}

      {mine.length === 0 ? (
        <Empty title="No flashcards for this subject yet.">Add a card for each formula, definition or rule you keep forgetting. Aster shows them again just before you would forget them.</Empty>
      ) : (
        <ul className="rows">
          {shown.map((c) => (
            <li key={c.id} className="rows__item fcrow">
              <div className="rows__text"><strong>{c.front}</strong><span className="muted">{c.back}</span></div>
              <span className="pill">{c.deck}</span>
              <span className={cx('muted fcrow__due', c.due <= today && 'warn')}>{c.due <= today ? 'Due' : dayMonth(c.due)}</span>
              <button type="button" className="iconbtn" aria-label={`Delete card: ${c.front}`} onClick={() => deleteCard(c.id)}><Trash2 size={15} /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Study({ ids, cards, onReview, onExit, color }: { ids: string[]; cards: Card[]; onReview: (id: string, g: 'again' | 'good' | 'easy') => void; onExit: () => void; color: string }) {
  const [queue, setQueue] = useState(ids);
  const [flipped, setFlipped] = useState(false);
  const [seen, setSeen] = useState(0);
  const card = cards.find((c) => c.id === queue[0]);
  const total = ids.length;

  const rate = (g: 'again' | 'good' | 'easy') => {
    if (!card) return;
    onReview(card.id, g);
    setFlipped(false);
    setSeen((n) => (g === 'again' ? n : n + 1));
    setQueue((q) => (g === 'again' ? [...q.slice(1), q[0]] : q.slice(1)));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setFlipped((f) => !f); }
      else if (flipped && e.key === '1') rate('again');
      else if (flipped && e.key === '2') rate('good');
      else if (flipped && e.key === '3') rate('easy');
      else if (e.key === 'Escape') onExit();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  if (!card) {
    return (
      <div className="study study--done">
        <div className="study__burst" aria-hidden="true"><Zap size={34} /></div>
        <h2>Session finished</h2>
        <p className="lede">You went through {total} card{total === 1 ? '' : 's'}. They will come back when they are due.</p>
        <button type="button" className="btn" onClick={onExit}>Back to cards</button>
      </div>
    );
  }
  return (
    <div className="study" style={{ ['--accent' as string]: color }}>
      <div className="study__top">
        <button type="button" className="btn btn--sm btn--ghost" onClick={onExit}>End session</button>
        <span className="muted">{Math.min(seen + 1, total)} of {total}</span>
        <span className="pill">{card.deck}</span>
      </div>
      <div className="study__bar"><span style={{ width: `${(seen / total) * 100}%` }} /></div>
      <button type="button" className={cx('flip', flipped && 'is-flipped')} onClick={() => setFlipped(!flipped)} aria-label={flipped ? 'Showing the answer. Press to see the question.' : 'Showing the question. Press to see the answer.'}>
        <span className="flip__inner">
          <span className="flip__face flip__front"><span className="flip__tag">Question</span><span className="flip__text">{card.front}</span><span className="flip__hint">Press space to flip</span></span>
          <span className="flip__face flip__back"><span className="flip__tag">Answer</span><span className="flip__text">{card.back}</span></span>
        </span>
      </button>
      <div className={cx('rate', !flipped && 'is-hidden')}>
        <button type="button" className="rate__btn rate__again" onClick={() => rate('again')}><RotateCcw size={16} />Again <kbd>1</kbd></button>
        <button type="button" className="rate__btn rate__good" onClick={() => rate('good')}>Good <kbd>2</kbd></button>
        <button type="button" className="rate__btn rate__easy" onClick={() => rate('easy')}>Easy <kbd>3</kbd></button>
      </div>
    </div>
  );
}
