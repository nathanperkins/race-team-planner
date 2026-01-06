
import { signIn } from "@/lib/auth"

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-900 text-white">
      <div className="w-full max-w-sm rounded-lg bg-gray-800 p-8 shadow-lg">
        <h1 className="mb-6 text-center text-2xl font-bold">Sign In</h1>
        <form
          action={async () => {
            "use server"
            await signIn("discord", { redirectTo: "/" })
          }}
        >
          <button
            type="submit"
            className="w-full rounded bg-[#5865F2] px-4 py-2 font-medium text-white hover:bg-[#4752C4] focus:outline-none focus:ring-2 focus:ring-[#5865F2] focus:ring-offset-2 focus:ring-offset-gray-900"
          >
            Sign in with Discord
          </button>
        </form>
      </div>
    </div>
  )
}
