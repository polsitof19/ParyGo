'use client';

import { useState } from 'react';
import { Reveal } from '@/components/animations/Reveal';
import { cn } from '@/lib/utils';
import { FAQ_ITEMS } from '@/lib/faq';

export function Faq() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section id="faq" className="wrap section-y">
      <div className="mb-[120px] grid items-end gap-12 md:grid-cols-2 md:gap-16">
        <Reveal>
          <div className="mono">[ 09 — PREGUNTAS ]</div>
        </Reveal>
        <div className="md:col-span-2">
          <Reveal as="h2" delay={0.08} className="h-section mt-6">
            Lo que <span className="serif-i">preguntan</span><br />
            antes de empezar.
          </Reveal>
        </div>
      </div>

      <div className="border-t border-border">
        {FAQ_ITEMS.map((item, i) => {
          const isOpen = open === i;
          return (
            <div key={i} className="border-b border-border">
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : i)}
                className="group flex w-full items-center justify-between gap-6 py-7 text-left transition-colors hover:bg-bg-cream/40"
                aria-expanded={isOpen}
              >
                <span className="text-[18px] leading-[1.3] -tracking-[0.015em] md:text-[22px]">
                  {item.q}
                </span>
                <span
                  className={cn(
                    'serif-i shrink-0 text-[32px] leading-none transition-transform duration-500 ease-editorial',
                    isOpen ? 'rotate-45' : 'rotate-0'
                  )}
                  aria-hidden
                >
                  +
                </span>
              </button>
              <div
                className={cn(
                  'grid transition-[grid-template-rows] duration-500 ease-editorial',
                  isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
                )}
              >
                <div className="overflow-hidden">
                  <p className="max-w-[72ch] pb-8 pr-12 text-[16px] leading-[1.55] text-fg-muted">
                    {item.a}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
