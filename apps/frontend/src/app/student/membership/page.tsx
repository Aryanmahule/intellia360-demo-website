import { Suspense } from "react";
import MembershipClient from "./MembershipClient";

// useSearchParams (the plan chosen on /pricing) needs a Suspense boundary in a static export.
export default function StudentMembershipPage() {
  return (
    <Suspense fallback={null}>
      <MembershipClient />
    </Suspense>
  );
}
