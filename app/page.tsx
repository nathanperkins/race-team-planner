import Image from "next/image";
import Link from "next/link";
import { auth, signOut } from "@/lib/auth";
import styles from "./home.module.css";

export default async function Home() {
  const session = await auth();

  return (
    <div className={styles.mainContainer}>
      <main className={styles.content}>
        <h1 className={styles.title}>iRacing Team Planner</h1>

        {session ? (
            <div className={styles.userSection}>
              <p className={styles.welcome}>Welcome, {session.user?.name}!</p>
              <p className={styles.email}>{session.user?.email}</p>
              {session.user?.image && (
                <Image src={session.user.image} alt="Avatar" width={64} height={64} className={styles.avatar} />
              )}
               <form
                action={async () => {
                  "use server"
                  await signOut()
                }}
              >
                <button type="submit" className={styles.signOutButton}>
                  Sign Out
                </button>
              </form>
            </div>
        ) : (
             <Link href="/login" className={styles.loginLink}>
              Login
            </Link>
        )}
      </main>
    </div>
  );
}
