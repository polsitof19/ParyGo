'use client';

import dynamic from 'next/dynamic';

// Three.js stays out of the initial bundle; the component only loads after
// hydration on the client.
const HeroTicket3D = dynamic(() => import('./HeroTicket3D'), {
  ssr: false,
  loading: () => null,
});

export function HeroTicket3DLazy() {
  return <HeroTicket3D />;
}
