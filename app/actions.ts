"use server"

import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { z } from "zod"

const RegistrationSchema = z.object({
  raceId: z.string(),
  carClass: z.string().min(1, "Car class is required"),
})


type State = {
  message: string
  errors?: Record<string, string[]>
}

export async function registerForRace(prevState: State, formData: FormData) {
  const session = await auth()
  if (!session || !session.user?.id) {
    return { message: "Unauthorized" }
  }

  // Check race exists and is not completed
  const requestedRaceId = formData.get("raceId") as string
  if (!requestedRaceId) return { message: "Race ID required" }

  const race = await prisma.race.findUnique({
    where: { id: requestedRaceId },
    select: { endTime: true, eventId: true }
  })

  if (!race) return { message: "Race not found" }
  if (new Date() > race.endTime) {
      return { message: "Usage of time machine detected! This race has already finished." }
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { expectationsVersion: true }
  })

  if (!user || (user.expectationsVersion ?? 0) < CURRENT_EXPECTATIONS_VERSION) {
    return { message: "You must agree to the team expectations before signing up." }
  }

  const validatedFields = RegistrationSchema.safeParse({
    raceId: formData.get("raceId"),
    carClass: formData.get("carClass"),
  })

  if (!validatedFields.success) {
    return { message: "Invalid fields", errors: validatedFields.error.flatten().fieldErrors }
  }

  const { raceId, carClass } = validatedFields.data

  try {
    await prisma.registration.create({
      data: {
        userId: session.user.id,
        raceId,
        carClass,
      },
    })

    revalidatePath(`/events/${race.eventId}`)
    return { message: "Success" }
  } catch (e) {
    console.error("Registration error:", e)
    return { message: "Failed to register. You might be already registered for this race." }
  }
}

export async function deleteRegistration(registrationId: string) {
  const session = await auth()
  if (!session || !session.user?.id) {
    throw new Error("Unauthorized")
  }

  try {
    const registration = await prisma.registration.findUnique({
      where: {
        id: registrationId
      },
      include: {
        race: {
          select: { endTime: true, eventId: true }
        }
      }
    })

    if (!registration) {
        throw new Error("Registration not found")
    }

    if (registration.userId !== session.user.id) {
        throw new Error("Unauthorized")
    }

    if (new Date() > registration.race.endTime) {
        throw new Error("Cannot drop from a completed race")
    }

    await prisma.registration.delete({
      where: {
         id: registrationId
      }
    })

    revalidatePath(`/events/${registration.race.eventId}`)
    revalidatePath(`/users/${session.user.id}/signups`)
    return { message: "Success" }

  } catch (e) {
    console.error("Delete registration error:", e)
    throw new Error("Failed to delete registration")
  }
}

import { CURRENT_EXPECTATIONS_VERSION } from "@/lib/config"

export async function agreeToExpectations() {
  const session = await auth()
  if (!session || !session.user?.id) {
    throw new Error("Unauthorized")
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { expectationsVersion: CURRENT_EXPECTATIONS_VERSION }
  })

  revalidatePath("/expectations")
  revalidatePath("/expectations")
  revalidatePath("/events/[id]", "page") // Revalidate all event pages to potentially unlock signup
}

export async function unagreeToExpectations() {
  const session = await auth()
  if (!session || !session.user?.id) {
    throw new Error("Unauthorized")
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { expectationsVersion: 0 }
  })

  revalidatePath("/expectations")
  revalidatePath("/events/[id]", "page")
}
