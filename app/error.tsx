"use client";
export default function Error({ reset }: { reset: () => void }) {
  return (
    <main className="error-page">
      <h1>Något gick fel</h1>
      <p>Försök läsa in arbetsytan igen. Dina sparade uppgifter finns kvar.</p>
      <button onClick={reset}>Försök igen</button>
    </main>
  );
}
