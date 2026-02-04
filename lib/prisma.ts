import { PrismaClient } from '@prisma/client'
import { fieldEncryptionExtension } from 'prisma-field-encryption'

const prismaClientSingleton = () => {
  const client = new PrismaClient({
    // log: [{ level: 'query', emit: 'event' }],
  })

  // client.$on('query', (e: Prisma.QueryEvent) => {
  //   console.log(`[Prisma] Query: ${e.query} - ${e.duration}ms`)
  // })

  return client.$extends(fieldEncryptionExtension())
}

type PrismaClientSingleton = ReturnType<typeof prismaClientSingleton>

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClientSingleton | undefined
}

const prisma = globalForPrisma.prisma ?? prismaClientSingleton()

export default prisma

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
