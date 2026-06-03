import { cookies } from "next/headers";
import { redirect } from "next/navigation";

async function getUser() {
  const token = (await cookies()).get("token")?.value;
  if (!token) return null;

  const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
  const res = await fetch(`${apiBase}/api/auth/me`, {
    headers: { Cookie: `token=${token}` },
    cache: "no-store",
  });

  if (!res.ok) return null;
  return res.json();
}

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getUser();

  if (!user) redirect("/auth");

  return <>{children}</>;
}