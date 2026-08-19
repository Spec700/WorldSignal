import styles from "./home.module.css";

export default function HomeLoading() {
  return (
    <main className={styles.routeState} role="status">
      <span>Priority roster</span>
      <h1>Loading people and approved locations…</h1>
    </main>
  );
}
