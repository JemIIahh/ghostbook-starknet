import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "GhostBook — Private orders on Starknet";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "linear-gradient(145deg, #050505 0%, #0a1208 45%, #000000 100%)",
          padding: "64px 72px",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 20,
          }}
        >
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: 20,
              background: "rgba(184,255,48,0.12)",
              border: "2px solid rgba(184,255,48,0.45)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 40,
            }}
          >
            👻
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              style={{
                fontSize: 42,
                fontWeight: 700,
                color: "#ffffff",
                letterSpacing: "-0.03em",
              }}
            >
              GhostBook
            </div>
            <div
              style={{
                fontSize: 20,
                color: "#b8ff30",
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                marginTop: 4,
              }}
            >
              STRK20
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div
            style={{
              fontSize: 56,
              fontWeight: 700,
              color: "#ffffff",
              lineHeight: 1.1,
              letterSpacing: "-0.035em",
              maxWidth: 900,
            }}
          >
            Private orders on Starknet
          </div>
          <div
            style={{
              fontSize: 26,
              color: "#a1a1aa",
              lineHeight: 1.35,
              maxWidth: 820,
            }}
          >
            Private limit orders & TWAP · enforced on-chain · filled through Ekubo
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div
            style={{
              display: "flex",
              gap: 12,
            }}
          >
            {["Balance", "Orders"].map((label) => (
              <div
                key={label}
                style={{
                  padding: "10px 18px",
                  borderRadius: 999,
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  color: "#e4e4e7",
                  fontSize: 18,
                  fontWeight: 600,
                }}
              >
                {label}
              </div>
            ))}
          </div>
          <div
            style={{
              fontSize: 18,
              color: "#71717a",
              fontWeight: 500,
            }}
          >
            Starknet mainnet · SN_MAIN
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
