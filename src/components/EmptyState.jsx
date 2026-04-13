export default function EmptyState({
  title = "Brak danych",
  description = "Tutaj jeszcze nic nie ma."
}) {
  return (
    <div style={wrapStyle}>
      <div style={iconStyle}>📦</div>
      <h3 style={titleStyle}>{title}</h3>
      <p style={descStyle}>{description}</p>
    </div>
  );
}

const wrapStyle = {
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: "16px",
  padding: "28px 18px",
  textAlign: "center",
};

const iconStyle = {
  fontSize: "34px",
  marginBottom: "10px",
};

const titleStyle = {
  margin: "0 0 8px 0",
  fontSize: "18px",
  color: "#111827",
};

const descStyle = {
  margin: 0,
  fontSize: "14px",
  color: "#6b7280",
};