import {
  CTASection,
  Features,
  HomeHero,
  HomeIntro,
  HowItWorks,
  WhyPersonalisation,
} from "@/components/home/sections";
import { SavedProfileBanner } from "@/components/home/SavedProfileBanner";

export default function HomePage() {
  return (
    <>
      <SavedProfileBanner />
      <HomeHero />
      <HomeIntro />
      <HowItWorks />
      <Features />
      <WhyPersonalisation />
      <CTASection />
    </>
  );
}
