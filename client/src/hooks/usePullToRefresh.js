import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Custom hook for mobile pull-to-refresh
 * Provides smooth gesture tracking, threshold detection, and haptic feedback
 */
export function usePullToRefresh(onRefresh, options = {}) {
  const {
    threshold = 70,
    maxPull = 120,
    resistance = 2.5,
  } = options;

  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isReady, setIsReady] = useState(false);

  const startY = useRef(0);
  const isDragging = useRef(false);
  const hasHapticTriggered = useRef(false);

  const handleTouchStart = useCallback((e) => {
    // Only allow pull to refresh if scroll position is at the very top
    const scrollTop = window.scrollY || document.documentElement.scrollTop || 0;
    if (scrollTop <= 0 && !isRefreshing) {
      startY.current = e.touches[0].clientY;
      isDragging.current = true;
      hasHapticTriggered.current = false;
    }
  }, [isRefreshing]);

  const handleTouchMove = useCallback((e) => {
    if (!isDragging.current || isRefreshing) return;

    const currentY = e.touches[0].clientY;
    const diff = currentY - startY.current;

    if (diff > 0) {
      // Calculate pull with progressive resistance
      const pull = Math.min(diff / resistance, maxPull);
      setPullDistance(pull);

      const reached = pull >= threshold;
      setIsReady(reached);

      // Light haptic feedback on iOS/Android when threshold is hit
      if (reached && !hasHapticTriggered.current) {
        hasHapticTriggered.current = true;
        if (navigator.vibrate) {
          navigator.vibrate(15);
        }
      } else if (!reached && hasHapticTriggered.current) {
        hasHapticTriggered.current = false;
      }
    }
  }, [isRefreshing, maxPull, resistance, threshold]);

  const handleTouchEnd = useCallback(async () => {
    if (!isDragging.current) return;
    isDragging.current = false;

    if (isReady && !isRefreshing) {
      setIsRefreshing(true);
      setPullDistance(50); // Hold spinner position
      if (navigator.vibrate) {
        navigator.vibrate([10, 30, 20]);
      }

      try {
        if (onRefresh) await onRefresh();
      } catch (err) {
        console.warn('[PullToRefresh] error:', err);
      } finally {
        setTimeout(() => {
          setIsRefreshing(false);
          setIsReady(false);
          setPullDistance(0);
        }, 400);
      }
    } else {
      setIsReady(false);
      setPullDistance(0);
    }
  }, [isReady, isRefreshing, onRefresh]);

  useEffect(() => {
    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  return {
    pullDistance,
    isRefreshing,
    isReady,
  };
}
