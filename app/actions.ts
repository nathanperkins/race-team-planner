"use server"

import { auth } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { z } from "zod"

const RegistrationSchema = z.object({
  eventId: z.string(),
  carClass: z.string().min(1, "Car class is required"),
  preferredTimeslot: z.string().optional(),
})


type State = {
  message: string
  errors?: Record<string, string[]>
}

export async function registerForEvent(prevState: State, formData: FormData) {
  const session = await auth()
  if (!session || !session.user?.id) {
    return { message: "Unauthorized" }
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { expectationsVersion: true }
  })

  if (!user || (user.expectationsVersion ?? 0) < CURRENT_EXPECTATIONS_VERSION) {
    return { message: "You must agree to the team expectations before signing up." }
  }

  const validatedFields = RegistrationSchema.safeParse({
    eventId: formData.get("eventId"),
    carClass: formData.get("carClass"),
    preferredTimeslot: formData.get("preferredTimeslot"),
  })

  if (!validatedFields.success) {
    return { message: "Invalid fields", errors: validatedFields.error.flatten().fieldErrors }
  }

  const { eventId, carClass, preferredTimeslot } = validatedFields.data

  try {
    await prisma.registration.create({
      data: {
        userId: session.user.id,
        eventId,
        carClass,
        preferredTimeslot,
      },
    })

    revalidatePath(`/events/${eventId}`)
    return { message: "Success" }
  } catch (e) {
    console.error("Registration error:", e)
    return { message: "Failed to register. You might be already registered." }
  }
}

export async function deleteRegistration(eventId: string) {
  const session = await auth()
  if (!session || !session.user?.id) {
    throw new Error("Unauthorized")
  }

  try {
    // Determine if the registration exists and if the user owns it
    const registration = await prisma.registration.findUnique({
      where: {
        userId_eventId: {
          userId: session.user.id,
          eventId: eventId
        }
      }
    })

    if (!registration) {
        throw new Error("Registration not found")
    }

    await prisma.registration.delete({
      where: {
         id: registration.id
      }
    })

    revalidatePath(`/events/${eventId}`)
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
