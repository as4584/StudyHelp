"use client";

/** Last resort when the root layout itself fails: plain markup, no app styles or providers. */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0, padding: "48px 16px", background: "#faf9f6" }}>
        <main style={{ maxWidth: 480, margin: "0 auto" }}>
          <h1 style={{ fontSize: 24, color: "#14161b" }}>StudyHelp is having trouble loading.</h1>
          <p style={{ color: "#3d4250", lineHeight: 1.5 }}>Nothing you saved was lost. Please try again in a moment.</p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              marginTop: 16,
              padding: "12px 20px",
              fontSize: 16,
              borderRadius: 8,
              border: 0,
              background: "#1e1b4b",
              color: "#fff",
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
