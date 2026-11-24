'use client';

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

type RevealProps = {
  children: ReactNode;
  className?: string;
  /** Retraso en ms, para escalonar elementos hermanos. */
  delay?: number;
  direction?: 'up' | 'left' | 'right' | 'zoom';
};

/**
 * Revela su contenido al entrar en pantalla. Sin JS (o antes de hidratar) el
 * contenido se ve normal; recién al montar se "arma" y se oculta para animarlo.
 */
export function Reveal({ children, className = '', delay = 0, direction = 'up' }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [armed, setArmed] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setArmed(true);
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          io.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -8% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`v2-reveal ${className}`}
      data-armed={armed}
      data-visible={visible}
      data-dir={direction}
      style={{ '--v2-delay': `${delay}ms` } as CSSProperties}
    >
      {children}
    </div>
  );
}

/** Título que entra palabra por palabra (CSS puro, escalonado con --i). */
export function SplitWords({ text, className = '' }: { text: string; className?: string }) {
  return (
    <>
      {text.split(' ').map((word, i) => (
        <span
          key={`${word}-${i}`}
          className={`v2-word ${className}`}
          style={{ '--i': i } as CSSProperties}
        >
          {word}
          {' '}
        </span>
      ))}
    </>
  );
}
