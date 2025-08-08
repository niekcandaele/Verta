import { ReactNode, useEffect, useState } from 'react';
import { motion, AnimatePresence, Transition } from 'framer-motion';
import { useRouter } from 'next/router';

interface PageTransitionWrapperProps {
  children: ReactNode;
  transitionKey: string;
}

const pageVariants = {
  initial: {
    opacity: 0,
    y: 6,
  },
  in: {
    opacity: 1,
    y: 0,
  },
  out: {
    opacity: 0,
    y: -6,
  },
};

const pageTransition: Transition = {
  duration: 0.18,
  ease: [0.2, 0.8, 0.2, 1], // cubic-bezier for smooth motion
};

const loadingVariants = {
  start: {
    scaleX: 0,
    originX: 0,
  },
  end: {
    scaleX: 1,
    originX: 0,
  },
};

export default function PageTransitionWrapper({ children, transitionKey }: PageTransitionWrapperProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);

    const handleChange = (e: MediaQueryListEvent) => {
      setPrefersReducedMotion(e.matches);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  useEffect(() => {
    const handleStart = () => setIsLoading(true);
    const handleComplete = () => setIsLoading(false);

    router.events.on('routeChangeStart', handleStart);
    router.events.on('routeChangeComplete', handleComplete);
    router.events.on('routeChangeError', handleComplete);

    return () => {
      router.events.off('routeChangeStart', handleStart);
      router.events.off('routeChangeComplete', handleComplete);
      router.events.off('routeChangeError', handleComplete);
    };
  }, [router]);

  return (
    <>
      {/* Loading Progress Bar */}
      <AnimatePresence>
        {isLoading && (
          <motion.div
            className="fixed top-0 left-0 right-0 z-50 h-0.5 bg-primary/20"
            initial="start"
            animate="end"
            exit="start"
            variants={loadingVariants}
            transition={{ duration: 0.5, ease: 'easeInOut' }}
          >
            <motion.div 
              className="h-full bg-gradient-to-r from-primary via-purple-400 to-primary"
              animate={{ x: ['0%', '100%'] }}
              transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
              style={{ filter: 'brightness(1.2)' }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Page Content with Transition */}
      <AnimatePresence mode="wait">
        {prefersReducedMotion ? (
          <div key={transitionKey} className="min-h-screen">
            {children}
          </div>
        ) : (
          <motion.div
            key={transitionKey}
            initial="initial"
            animate="in"
            exit="out"
            variants={pageVariants}
            transition={pageTransition}
            className="min-h-screen"
            style={{ willChange: 'opacity, transform' }}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
