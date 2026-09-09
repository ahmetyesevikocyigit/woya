import type { Metadata } from "next";
import {
  SiteHeader,
  SiteFooter,
  TopAnnouncement,
} from "../components/site-chrome";
import { pageSession } from "@/lib/customer/auth";
import { AccountNav } from "./account-nav";
import { Logout } from "./forms";
import styles from "./account.module.css";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Hesabım",
  robots: { index: false, follow: false },
};
export default async function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await pageSession();
  return (
    <div className={styles.shell}>
      <a className="skip-link" href="#hesap-icerik">
        İçeriğe geç
      </a>
      <TopAnnouncement />
      <SiteHeader />
      <main className={styles.main} id="hesap-icerik">
        <aside className={styles.sidebar}>
          <div className={styles.identity}>
            {session && (
              <span className={styles.avatar} aria-hidden="true">
                {session.customer.firstName
                  .slice(0, 1)
                  .toLocaleUpperCase("tr-TR")}
                {session.customer.lastName
                  .slice(0, 1)
                  .toLocaleUpperCase("tr-TR")}
              </span>
            )}
            <div>
              <p className={styles.identityName}>
                {session
                  ? `${session.customer.firstName} ${session.customer.lastName}`
                  : "Hesabım"}
              </p>
              {session && (
                <p className={styles.identityEmail}>{session.customer.email}</p>
              )}
            </div>
          </div>
          <AccountNav authenticated={!!session} />
          {session && (
            <div className={styles.logout}>
              <Logout />
            </div>
          )}
        </aside>
        <div className={styles.content}>{children}</div>
      </main>
      <SiteFooter />
    </div>
  );
}
