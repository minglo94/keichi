import type { Role } from "@prisma/client"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      role: Role
      name?: string | null
      email?: string | null
      image?: string | null
    }
    accessToken?: string
  }
  interface User {
    role: Role
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id:   string
    role: Role
    accessToken?: string
  }
}
