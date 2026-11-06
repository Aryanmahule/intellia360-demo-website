import type { Metadata } from "next";
import SiteHeader from "@/components/common/SiteHeader";
import SiteFooter from "@/components/common/SiteFooter";
import PricingClient from "./PricingClient";
import "@/styles/site-pages.css";
import "./pricing.css";

export const metadata: Metadata = {
  title: "Pricing & Memberships | Intellia360",
  description:
    "Free, Core, Plus and Ultra memberships for Intellia360 math learning, the IntelliaPlay add-on, and family pricing — in your own currency.",
};

export default function PricingPage() {
  return (
    <main className="site-page">
      <SiteHeader />
      <PricingClient />
      <SiteFooter />
    </main>
  );
}
