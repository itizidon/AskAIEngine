"use client";

import { BusinessProvider } from "../app/context/BusinessContext";

export default function Providers({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <BusinessProvider>
      {children}
    </BusinessProvider>
  );
}