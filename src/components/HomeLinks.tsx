import { go } from '../router';

/** Quiet text links under a game's main buttons: How to Play, Statistics, Settings... */
export function HomeLinks({ items }: { items: { label: string; to: string }[] }) {
  return (
    <div className="home-links">
      {items.map((i) => (
        <button key={i.to} onClick={() => go(i.to)}>{i.label}</button>
      ))}
    </div>
  );
}
