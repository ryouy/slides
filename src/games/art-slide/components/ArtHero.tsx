import { useEffect, useState } from 'react';
import { moveTile, neighbors, solvedBoard, type ArtBoard as Board } from '../logic/board';
import { shuffleBoard } from '../logic/generator';
import { rngFromString } from '../../../utils/rng';
import type { Artwork } from '../types';
import { ArtBoard } from './ArtBoard';

/** A small self-playing 3x3 puzzle of today's painting: slides a tile every moment, then rests assembled. */
export function ArtHero({ artwork }: { artwork: Artwork }) {
  const [board, setBoard] = useState<Board>(() => shuffleBoard(rngFromString(`hero|${artwork.id}`), 3).board);

  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setBoard(solvedBoard(3)); // no motion: just show the finished painting
      return;
    }
    let prev = -1;
    let rng = rngFromString(`hero-walk|${artwork.id}`);
    const id = setInterval(() => {
      if (document.hidden) return;
      setBoard((b) => {
        const blank = b.indexOf(null);
        const opts = neighbors(blank, 3).filter((c) => c !== prev);
        const next = opts[Math.floor(rng() * opts.length)];
        prev = blank;
        return moveTile(b, 3, next) ?? b;
      });
    }, 1300);
    return () => clearInterval(id);
  }, [artwork.id]);

  return (
    <div className="hero-board" data-testid="art-hero">
      <ArtBoard board={board} n={3} artwork={artwork} showNumbers={false} disabled complete={false} onTap={() => undefined} onSwipe={() => undefined} />
    </div>
  );
}
