import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export default async function PrivateLayout({ children }) {
  const token = (await cookies()).get("token")?.value;

  if (!token) redirect("/auth");

  return <>{children}</>;
}