import ProtectedLayout from "../lib/protected";
import Providers from "../providers";
import BusinessGate from "./BusinessGate";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedLayout>
      <Providers>
        {children}
        {/* <BusinessGate>
          {children}
        </BusinessGate> */}
      </Providers>
    </ProtectedLayout>
  );
}