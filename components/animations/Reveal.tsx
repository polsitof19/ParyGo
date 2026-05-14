'use client';

import { motion, type Variants } from 'framer-motion';
import { type ReactNode } from 'react';

type RevealProps = {
  children: ReactNode;
  delay?: number;
  as?: 'div' | 'span' | 'p' | 'h1' | 'h2' | 'h3' | 'li';
  className?: string;
  amount?: number;
  y?: number;
};

const variants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: (custom: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.8,
      ease: [0.2, 0.7, 0.2, 1],
      delay: custom,
    },
  }),
};

export function Reveal({
  children,
  delay = 0,
  as = 'div',
  className,
  amount = 0.15,
  y = 20,
}: RevealProps) {
  const Component = motion[as];
  return (
    <Component
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount }}
      custom={delay}
      variants={{
        hidden: { opacity: 0, y },
        visible: (custom: number) => ({
          opacity: 1,
          y: 0,
          transition: {
            duration: 0.8,
            ease: [0.2, 0.7, 0.2, 1],
            delay: custom,
          },
        }),
      }}
    >
      {children}
    </Component>
  );
}

export { variants as revealVariants };
