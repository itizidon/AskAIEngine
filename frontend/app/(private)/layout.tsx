import ProtectedLayout from "../lib/protected";
import Providers from "../providers";
import BusinessGate from "../(private)/BusinessGate";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedLayout>
      <Providers>
        <BusinessGate>
          {children}
        </BusinessGate>
      </Providers>
    </ProtectedLayout>
  );
}