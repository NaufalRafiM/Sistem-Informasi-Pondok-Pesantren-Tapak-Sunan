import React, { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

interface SplitTitleProps {
  as?: 'h1' | 'h2' | 'h3';
  text: string;
  className?: string;
  stagger?: number;
  duration?: number;
  delay?: number;
  icon?: React.ReactNode;
}

export const SplitTitle: React.FC<SplitTitleProps> = ({
  as = 'h2',
  text,
  className = '',
  stagger = 0.055,
  duration = 0.6,
  delay = 0,
  icon,
}) => {
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const words = text.trim().split(/\s+/).filter(Boolean);

  useEffect(() => {
    const el = headingRef.current;
    if (!el) return;

    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) return;

    const ctx = gsap.context(() => {
      const wordNodes = el.querySelectorAll<HTMLElement>('.gsap-word');
      if (!wordNodes.length) return;

      gsap.fromTo(
        wordNodes,
        { yPercent: 115, opacity: 0 },
        {
          yPercent: 0,
          opacity: 1,
          duration,
          stagger,
          delay,
          ease: 'power3.out',
          clearProps: 'transform,willChange',
          scrollTrigger: {
            trigger: el,
            start: 'top 92%',
            toggleActions: 'play none none none',
            once: true,
          },
        }
      );
    }, headingRef);

    const rafId = window.requestAnimationFrame(() => {
      ScrollTrigger.refresh();
    });

    return () => {
      window.cancelAnimationFrame(rafId);
      ctx.revert();
    };
  }, [text, stagger, duration, delay]);

  const Tag = as;

  return (
    <Tag ref={headingRef} className={className} aria-label={text}>
      {icon && <span className="shrink-0 inline-flex">{icon}</span>}
      <span>
        {words.map((word, idx) => (
          <React.Fragment key={`${text}-${idx}`}>
            <span className="inline-block overflow-hidden align-bottom leading-[1.22] pb-[0.06em] -mb-[0.06em]">
              <span className="gsap-word inline-block will-change-transform">{word}</span>
            </span>
            {idx < words.length - 1 ? ' ' : ''}
          </React.Fragment>
        ))}
      </span>
    </Tag>
  );
};
