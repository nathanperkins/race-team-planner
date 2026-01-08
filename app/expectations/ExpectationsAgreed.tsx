"use client"

import { useTransition } from "react"
import { unagreeToExpectations } from "@/app/actions"
import styles from "./expectations.module.css"

export default function ExpectationsAgreed() {
    const [isPending, startTransition] = useTransition()

    return (
        <div className={styles.agreedBadge}>
            <div className={styles.agreedContent}>
                <span className={styles.icon}>✅</span>
                <span>You have agreed to the current team expectations.</span>
            </div>

            <button
                onClick={() => startTransition(async () => {
                    await unagreeToExpectations()
                })}
                disabled={isPending}
                className={styles.unagreeButton}
                title="Revoke agreement"
            >
                {isPending ? "..." : "Revoke"}
            </button>
        </div>
    )
}
