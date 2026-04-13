import config from "../config";

export async function uploadImages(files) {
  if (!config.uploadWorkerUrl) {
    throw new Error("Brak adresu upload workera w VITE_UPLOAD_WORKER_URL");
  }

  const formData = new FormData();

  files.forEach((file) => {
    formData.append("files", file);
  });

  const response = await fetch(config.uploadWorkerUrl, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Błąd uploadu: ${response.status} ${text}`);
  }

  const data = await response.json();

  if (!data || !Array.isArray(data.files)) {
    throw new Error("Worker zwrócił nieprawidłową odpowiedź");
  }

  return data.files;
}