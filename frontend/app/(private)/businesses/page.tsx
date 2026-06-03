"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useBusiness } from "@/app/context/BusinessContext";
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type Business = {
  id: number;
  name: string;
};

export default function SelectBusinessPage() {
  const router = useRouter();
  const { selectBusiness } = useBusiness();
  console.log('hit here', selectBusiness)
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selecting, setSelecting] = useState<number | null>(null);

  useEffect(() => {
    async function loadBusinesses() {
      try {
        setLoading(true);

        const res = await fetch(`${API_BASE}/me/businesses`, {
          method: "GET",
          credentials: "include",
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data?.detail || "Failed to load businesses");
        }

        setBusinesses(data?.businesses);
      } catch (err: any) {
        setError(err.message || "Something went wrong");
      } finally {
        setLoading(false);
      }
    }

    loadBusinesses();
  }, []);

  async function handleBusiness(business: Business) {
    try {
      setSelecting(business.id);
      selectBusiness(business);
    } catch (err: any) {
      alert(err.message || "Failed to select business");
    } finally {
      setSelecting(null);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-zinc-500">
        Loading businesses...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center text-red-500">
        {error}
      </div>
    );
  }

  console.log(businesses, ' business')

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-6 dark:bg-black">
      <div className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
          Select a workspace
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Choose which business you want to work in
        </p>

        <div className="mt-6 space-y-3">
          {businesses.map((biz) => (
            <button
              key={biz.id}
              onClick={() => handleBusiness(biz)}
              disabled={selecting === biz.id}
              className="w-full rounded-lg border border-zinc-200 bg-white px-4 py-3 text-left text-sm text-zinc-900 transition hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
            >
              <div className="flex items-center justify-between">
                <span>{biz.name}</span>

                {selecting === biz.id && (
                  <span className="text-xs text-zinc-500">
                    Selecting...
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>

        {businesses.length === 0 && (
          <p className="mt-4 text-sm text-zinc-500">
            No businesses found
          </p>
        )}
      </div>
    </div>
  );
}