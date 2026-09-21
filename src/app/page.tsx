import { Hero } from "@/components/home/Hero";
import {
  CTASection,
  Features,
  HomeIntro,
  HowItWorks,
  WhyPersonalisation,
} from "@/components/home/sections";
import { SavedProfileBanner } from "@/components/home/SavedProfileBanner";

export default function HomePage() {
  return (
    <>
      <SavedProfileBanner />
      <Hero />
      <HomeIntro />
      <HowItWorks />
      <Features />
      <WhyPersonalisation />
      <CTASection />
    </>
  );
}
