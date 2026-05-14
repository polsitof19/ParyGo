'use client';

import { useEffect } from 'react';

export function JsOn() {
  useEffect(() => {
    document.documentElement.classList.add('js-on');
  }, []);
  return null;
}
