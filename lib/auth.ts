import NextAuth from "next-auth"
import { PrismaAdapter } from "@auth/prisma-adapter"
import prisma from "./prisma"
import Discord from "next-auth/providers/discord"
import Credentials from "next-auth/providers/credentials"
import { MOCK_USERS } from "./mock-users"

const mockAuthProvider = Credentials({
  name: "Mock User",
  credentials: {
    email: { label: "Email", type: "email" },
  },
  authorize: async (credentials) => {
    if (!credentials?.email) {
      return null
    }

    const email = credentials.email as string
    const mockUser = MOCK_USERS.find((u) => u.email === email)

    if (!mockUser) {
      return null
    }

    const { name, image } = mockUser

    // Upsert the user to ensure they exist
    const user = await prisma.user.upsert({
      where: { email },
      update: { name, image },
      create: {
        email,
        name,
        image,
      },
    })

    return user
  },
})

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: {
    strategy: process.env.NODE_ENV === "development" ? "jwt" : "database",
  },
  providers: [
    Discord,
    ...(process.env.NODE_ENV === "development" ? [mockAuthProvider] : []),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
      }
      return token
    },
    async session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id as string
      }
      return session
    },
  },
})
