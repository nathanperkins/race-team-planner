import styles from "./expectations.module.css"

export default function ExpectationsPage() {
  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <header className={styles.header}>
          <h1 className={styles.title}>SRG Endurance – Team Expectations</h1>
          <p className={styles.subtitle}>
            Please review the expectations below <span className={styles.highlight}>before signing up</span>.
            <br />
            These standards exist to keep races clean, competitive, and enjoyable for everyone.
          </p>
        </header>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <span className={styles.icon}>🏁</span>
            <h2 className={styles.sectionTitle}>Team Culture</h2>
          </div>
          <span className={styles.tagline}>Have fun and respect your teammates.</span>
          <ul className={styles.list}>
            <li className={styles.listItem}>No berating, blaming, or disrespect</li>
            <li className={styles.listItem}>Accidents happen — reckless over-driving is not acceptable</li>
          </ul>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <span className={styles.icon}>🎯</span>
            <h2 className={styles.sectionTitle}>Race Philosophy</h2>
          </div>
          <span className={styles.tagline}>Lap count over lap time.</span>
          <ul className={styles.list}>
            <li className={styles.listItem}>Consistency and control matter more than raw pace</li>
            <li className={styles.listItem}>Endurance results come from minimizing mistakes</li>
          </ul>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <span className={styles.icon}>🚦</span>
            <h2 className={styles.sectionTitle}>Driving Standards</h2>
          </div>
          <span className={styles.tagline}>Race within your limits.</span>
          <ul className={styles.list}>
            <li className={styles.listItem}>It is always OK to let faster cars pass</li>
            <li className={styles.listItem}>Avoid unnecessary risks and incident points</li>
          </ul>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <span className={styles.icon}>🤝</span>
            <h2 className={styles.sectionTitle}>Team Commitment</h2>
          </div>
          <span className={styles.tagline}>Reliability and communication are critical.</span>
          <ul className={styles.list}>
            <li className={styles.listItem}>Be present and responsive in Discord at registration</li>
            <li className={styles.listItem}>If you commit, you are expected to show up</li>
            <li className={styles.listItem}>No-shows risk team disqualification and IR penalties</li>
            <li className={styles.listItem}>Communicate early if you need to step back</li>
          </ul>
        </section>

        <section className={`${styles.section} ${styles.acknowledgement}`}>
          <div className={styles.sectionHeader}>
            <span className={styles.icon}>✅</span>
            <h2 className={styles.sectionTitle}>Acknowledgement Required</h2>
          </div>
          <span className={styles.tagline}>By signing up, you confirm that you:</span>
          <ul className={styles.list}>
            <li className={styles.listItem}>Have read and understand these expectations</li>
            <li className={styles.listItem}>Agree to operate with the team in mind</li>
          </ul>
        </section>
      </div>
    </div>
  )
}
