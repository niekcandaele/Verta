import "@/styles/globals.css";
import type { AppProps } from "next/app";
import PageTransitionWrapper from "@/components/PageTransitionWrapper";
import { useRouter } from "next/router";
import { useEffect } from "react";

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter();
  
  useEffect(() => {
    // Force dark theme on mount
    document.documentElement.setAttribute('data-theme', 'dark');
    document.documentElement.classList.add('dark');
  }, []);
  
  return (
    <PageTransitionWrapper transitionKey={router.asPath}>
      <Component {...pageProps} />
    </PageTransitionWrapper>
  );
}
