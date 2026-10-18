import Link from "next/link";
export default function NotFound() {
  return (
    <main className="error-page">
      <h1>Sidan finns inte</h1>
      <Link href="/">Till Dashboard</Link>
    </main>
  );
}
