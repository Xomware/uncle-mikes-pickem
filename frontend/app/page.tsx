import { Hero } from "@/components/landing/hero";
import { HowItWorks } from "@/components/landing/how-it-works";
import { Faq, Features, FinalCta, Footer, Standings, SuddenDeath } from "@/components/landing/landing-sections";
import { LandingNav } from "@/components/landing/landing-nav";
import { ScrollReveals } from "@/components/landing/scroll-reveals";

import "@/components/landing/landing.css";

export default function LandingPage() {
  return (
    <>
      <LandingNav />
      <main className="flex flex-1 flex-col overflow-x-clip">
        <Hero />
        <HowItWorks />
        <Standings />
        <SuddenDeath />
        <Features />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
      <ScrollReveals />
    </>
  );
}
