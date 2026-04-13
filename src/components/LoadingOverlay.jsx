export default function LoadingOverlay({ show, text = "Ładowanie..." }) {
  if (!show) return null;

  return (
    <div style={overlayStyle}>
      <div style={boxStyle}>
        <div style={spinnerStyle} />
        <div style={textStyle}>{text}</div>
      </div>
    </div>
  );
}

const overlayStyle = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.35)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 9999,
};

const boxStyle = {
  background: "#fff",
  padding: "20px 24px",
  borderRadius: "16px",
  boxShadow: "0 10px 30px rgba(0,0,0,0.18)",
  minWidth: "220px",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "12px",
};

const spinnerStyle = {
  width: "34px",
  height: "34px",
  border: "4px solid #e5e7eb",
  borderTop: "4px solid #111827",
  borderRadius: "50%",
  animation: "spin 1s linear infinite",
};

const textStyle = {
  fontSize: "15px",
  fontWeight: 600,
  color: "#111827",
};