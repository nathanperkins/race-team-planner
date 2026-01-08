"use client"

import { useTransition } from "react"
import { agreeToExpectations } from "@/app/actions"
import styles from "./expectations.module.css"

export default function ExpectationsAgreement() {
    const [isPending, startTransition] = useTransition()

    return (
        <section className={`${styles.section} ${styles.pendingAgreement}`}>
            <div className={styles.sectionHeader}>
                <span className={styles.icon}>⚠️</span>
                <h2 className={styles.sectionTitle}>Action Required</h2>
            </div>
            <span className={styles.tagline}>By signing up, you confirm that you:</span>
            <ul className={styles.list}>
                <li className={styles.listItem}>Have read and understand these expectations</li>
                <li className={styles.listItem}>Agree to operate with the team in mind</li>
            </ul>

            <button
                onClick={() => startTransition(async () => {
                    await agreeToExpectations()
                })}
                disabled={isPending}
                className={styles.agreeButton}
            >
                {isPending ? "Agreeing..." : "I Agree"}
            </button>
        </section>
    )
}
