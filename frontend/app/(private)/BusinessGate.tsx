"use client";

import { useBusiness } from "@/app/context/BusinessContext";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function BusinessGate({ children }) {
  const { selectedBusiness } = useBusiness();
  const router = useRouter();

  useEffect(() => {
    if (!selectedBusiness) {
      router.push("/select-business");
    }
  }, [selectedBusiness]);

  if (!selectedBusiness) return null;

  return children;
}