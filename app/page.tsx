import Image from "next/image";
import Link from "next/link";
import { auth, signOut } from "@/lib/auth";

export default async function Home() {
  const session = await auth();

  return (
    <div className="grid grid-rows-[20px_1fr_20px] items-center justify-items-center min-h-screen p-8 pb-20 gap-16 sm:p-20 font-[family-name:var(--font-geist-sans)]">
      <main className="flex flex-col gap-8 row-start-2 items-center sm:items-start">
        <h1 className="text-4xl font-bold">iRacing Team Planner</h1>

        {session ? (
            <div className="flex flex-col items-center gap-4">
              <p className="text-xl">Welcome, {session.user?.name}!</p>
              <p className="text-sm text-gray-500">{session.user?.email}</p>
              {session.user?.image && (
                <img src={session.user.image} alt="Avatar" className="w-16 h-16 rounded-full" />
              )}
               <form
                action={async () => {
                  "use server"
                  await signOut()
                }}
              >
                <button type="submit" className="rounded-full border border-solid border-black/[.08] dark:border-white/[.145] transition-colors flex items-center justify-center hover:bg-[#f2f2f2] dark:hover:bg-[#1a1a1a] hover:border-transparent text-sm sm:text-base h-10 sm:h-12 px-4 sm:px-5 sm:min-w-44">
                  Sign Out
                </button>
              </form>
            </div>
        ) : (
             <Link href="/login" className="rounded-full border border-solid border-transparent transition-colors flex items-center justify-center bg-foreground text-background gap-2 hover:bg-[#383838] dark:hover:bg-[#ccc] text-sm sm:text-base h-10 sm:h-12 px-4 sm:px-5">
              Login
            </Link>
        )}
      </main>
    </div>
  );
}
