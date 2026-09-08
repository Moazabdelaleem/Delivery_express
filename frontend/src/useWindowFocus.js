import { useEffect } from 'react';

export function useWindowFocus(callback) {
  useEffect(() => {
    const handleFocus = () => {
      if (typeof callback === 'function') {
        callback();
      }
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [callback]);
}
