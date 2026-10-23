"use client";

/**
 * Kök düzenin kendisi çökerse devreye giren son çare.
 *
 * Bu dosya kök düzenin yerine geçtiği için kendi <html> ve <body> etiketlerini
 * tanımlamak zorunda; genel stiller de buraya ulaşmıyor, o yüzden biçimlendirme
 * satır içi yazıldı.
 */
export default function KokHatasi({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="tr">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f8fafc",
          color: "#0f172a",
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        }}
      >
        <main
          data-test="kok-hata-ekrani"
          style={{
            maxWidth: 480,
            width: "100%",
            margin: 16,
            padding: 24,
            background: "#fff",
            border: "1px solid #e2e8f0",
            borderRadius: 12,
          }}
        >
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
            Uygulama açılamadı
          </h1>
          <p style={{ marginTop: 8, fontSize: 14, color: "#475569" }}>
            Beklenmedik bir hata oluştu. Kaydettiğiniz veriler etkilenmedi.
            Sayfayı yenilemeyi deneyin; sorun sürerse sunucunun çalıştığını
            kontrol ettirin.
          </p>
          {error.digest ? (
            <p style={{ marginTop: 12, fontSize: 12, color: "#94a3b8" }}>
              Hata kodu: <code>{error.digest}</code>
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => retry()}
            style={{
              marginTop: 20,
              padding: "8px 16px",
              fontSize: 14,
              fontWeight: 500,
              color: "#fff",
              background: "#1e293b",
              border: "none",
              borderRadius: 8,
              cursor: "pointer",
            }}
          >
            Tekrar Dene
          </button>
        </main>
      </body>
    </html>
  );
}
