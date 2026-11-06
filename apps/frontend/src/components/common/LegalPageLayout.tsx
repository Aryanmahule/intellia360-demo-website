import type { ReactNode } from "react";
import SiteHeader from "@/components/common/SiteHeader";
import SiteFooter from "@/components/common/SiteFooter";
import "@/styles/site-pages.css";

interface LegalPageLayoutProps {
  title: string;
  introduction: ReactNode;
  updatedDate?: string;
  children: ReactNode;
}

export default function LegalPageLayout({
  title,
  introduction,
  updatedDate,
  children,
}: LegalPageLayoutProps) {
  return (
    <main className="site-page legal-page">
      <SiteHeader />

      <header className="site-doc-hero legal-page-hero">
        <div className="site-container">
          <h1>{title}</h1>
          <div className="legal-page-introduction">{introduction}</div>
          {updatedDate ? (
            <p className="site-doc-meta">Last Updated: {updatedDate}</p>
          ) : null}
        </div>
      </header>

      <article className="site-doc">
        <div className="site-container site-doc-body legal-page-body">
          {children}
        </div>
      </article>

      <SiteFooter />
    </main>
  );
}
