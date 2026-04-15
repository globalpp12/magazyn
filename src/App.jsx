import { useEffect, useMemo, useState } from "react";
import JSZip from "jszip";
import { supabase } from "./supabase";
import "./App.css";

const UPLOAD_WORKER_URL = "https://magazyn-upload.globalpp.workers.dev/";

const zones = [
  { id: "magazyn", name: "MAGAZYN", hasMap: true },
  { id: "garaz_dol", name: "GARAŻ DÓŁ", hasMap: false },
  { id: "garaz_gora", name: "GARAŻ GÓRA", hasMap: false },
  { id: "wiata", name: "WIATA", hasMap: false },
  { id: "zewnatrz", name: "ZEWNĄTRZ", hasMap: false },
];

const shelves = [
  { id: "1", col: 1, row: 1, rowSpan: 3 },
  { id: "2", col: 1, row: 4, rowSpan: 3 },
  { id: "3", col: 1, row: 7, rowSpan: 3 },

  { id: "4", col: 1, row: 10, rowSpan: 3 },
  { id: "5", col: 1, row: 13, rowSpan: 3 },
  { id: "6", col: 1, row: 16, rowSpan: 3 },

  { id: "7", col: 2, row: 10, rowSpan: 3 },
  { id: "8", col: 2, row: 13, rowSpan: 3 },
  { id: "9", col: 2, row: 16, rowSpan: 3 },

  { id: "10", col: 3, row: 10, rowSpan: 3 },
  { id: "11", col: 3, row: 13, rowSpan: 3 },
  { id: "12", col: 3, row: 16, rowSpan: 3 },

  { id: "R1", col: 4, row: 11, rowSpan: 1 },
  { id: "R2", col: 4, row: 12, rowSpan: 1 },
  { id: "R3", col: 4, row: 13, rowSpan: 1 },
  { id: "R4", col: 4, row: 14, rowSpan: 1 },
  { id: "R5", col: 4, row: 15, rowSpan: 1 },
  { id: "R6", col: 4, row: 16, rowSpan: 3 },
  { id: "R7", col: 5, row: 18, rowSpan: 1 },

  { id: "13", col: 6, row: 10, rowSpan: 3 },
  { id: "14", col: 6, row: 13, rowSpan: 3 },
  { id: "15", col: 6, row: 16, rowSpan: 3 },

  { id: "16", col: 7, row: 10, rowSpan: 3 },
  { id: "17", col: 7, row: 13, rowSpan: 3 },
  { id: "18", col: 7, row: 16, rowSpan: 3 },

  { id: "D1", col: 1, colSpan: 2, row: 20, rowSpan: 2, wide: true },
  { id: "D2", col: 3, colSpan: 2, row: 20, rowSpan: 2, wide: true },
  { id: "D3", col: 5, colSpan: 3, row: 20, rowSpan: 2, wide: true },
];

function getZoneName(zoneId) {
  return zones.find((zone) => zone.id === zoneId)?.name || zoneId;
}

function getShelvesForZone(zoneId) {
  if (zoneId === "magazyn") return shelves;
  return [];
}

function formatDate(value) {
  if (!value) return "Brak";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Brak";
  return date.toLocaleString("pl-PL");
}

function loadImageDimensions(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function canvasToBlob(canvas, quality = 0.82) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/jpeg", quality);
  });
}

async function resizeImageFile(
  file,
  maxWidth = 1920,
  maxHeight = 1080,
  quality = 0.82
) {
  const originalUrl = URL.createObjectURL(file);

  try {
    const img = await loadImageDimensions(originalUrl);

    let targetWidth = img.width;
    let targetHeight = img.height;

    const ratio = Math.min(
      maxWidth / targetWidth,
      maxHeight / targetHeight,
      1
    );

    targetWidth = Math.round(targetWidth * ratio);
    targetHeight = Math.round(targetHeight * ratio);

    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Brak canvas context.");
    }

    ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

    const blob = await canvasToBlob(canvas, quality);

    if (!blob) {
      throw new Error("Nie udało się skompresować zdjęcia.");
    }

    const fileNameBase =
      file.name?.replace(/\.[^/.]+$/, "") || `zdjecie-${Date.now()}`;

    return {
      localId: `${Date.now()}-${Math.random()}`,
      file_name: `${fileNameBase}.jpg`,
      blob,
      preview_url: URL.createObjectURL(blob),
      width: targetWidth,
      height: targetHeight,
      size: blob.size,
      original_size: file.size,
      mime_type: "image/jpeg",
      sort_order: 0,
      uploaded: false,
      file_url: null,
    };
  } finally {
    URL.revokeObjectURL(originalUrl);
  }
}

function sanitizeFileName(value) {
  return (value || "produkt")
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/\s+/g, "_")
    .trim();
}

async function blobUrlToBlob(blobUrl) {
  const response = await fetch(blobUrl);
  return await response.blob();
}

function mapDbItem(item) {
  return {
    ...item,
    images: Array.isArray(item.item_images)
      ? [...item.item_images].sort(
          (a, b) => (a.sort_order || 0) - (b.sort_order || 0)
        )
      : [],
  };
}

export default function App() {
  const [dbItems, setDbItems] = useState([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [isSavingItem, setIsSavingItem] = useState(false);

  const [view, setView] = useState("start");
  const [selectedZone, setSelectedZone] = useState(null);
  const [selectedShelf, setSelectedShelf] = useState(null);
  const [selectedItemId, setSelectedItemId] = useState(null);

  const [globalSearch, setGlobalSearch] = useState("");
  const [zoneSearch, setZoneSearch] = useState("");
  const [archiveSearch, setArchiveSearch] = useState("");
  const [toListSort, setToListSort] = useState("date_desc");

  const [showAddForm, setShowAddForm] = useState(false);
  const [editingItemId, setEditingItemId] = useState(null);
  const [isProcessingImages, setIsProcessingImages] = useState(false);
  const [isDownloadingZip, setIsDownloadingZip] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    partNumber: "",
    description: "",
    status: "neutralny",
    images: [],
  });

  async function loadItemsFromSupabase() {
    setIsLoadingData(true);

    const { data, error } = await supabase
      .from("items")
      .select("*, item_images(*)")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Błąd ładowania items:", error);
      alert("Nie udało się pobrać danych z bazy.");
      setIsLoadingData(false);
      return;
    }

    const normalized = (data || []).map(mapDbItem);
    setDbItems(normalized);
    setIsLoadingData(false);
  }

  useEffect(() => {
    async function bootstrap() {
      const { data, error } = await supabase.from("zones").select("*");
      if (error) {
        console.error("Supabase zones error:", error);
      } else {
        console.log("Supabase zones:", data);
      }

      await loadItemsFromSupabase();
    }

    bootstrap();
  }, []);

  useEffect(() => {
    return () => {
      formData.images.forEach((image) => {
        if (image.preview_url) {
          URL.revokeObjectURL(image.preview_url);
        }
      });
    };
  }, [formData.images]);

  const activeItems = useMemo(
    () => dbItems.filter((item) => !item.deleted_at),
    [dbItems]
  );

  const archiveItems = useMemo(
    () => dbItems.filter((item) => !!item.deleted_at),
    [dbItems]
  );

  const itemsByZone = useMemo(() => {
    const result = {
      magazyn: {},
      garaz_dol: {},
      garaz_gora: {},
      wiata: {},
      zewnatrz: {},
    };

    activeItems.forEach((item) => {
      if (!result[item.zone_id]) {
        result[item.zone_id] = {};
      }
      if (!result[item.zone_id][item.shelf_id]) {
        result[item.zone_id][item.shelf_id] = [];
      }
      result[item.zone_id][item.shelf_id].push(item);
    });

    return result;
  }, [activeItems]);

  const itemsByShelf = itemsByZone[selectedZone] || {};
  const selectedItems = selectedShelf ? itemsByShelf[selectedShelf] || [] : [];
  const selectedItem =
    dbItems.find((item) => String(item.id) === String(selectedItemId)) || null;

  const allItems = useMemo(() => {
    return activeItems.map((item) => ({
      ...item,
      zoneId: item.zone_id,
      zoneName: getZoneName(item.zone_id),
      shelfId: item.shelf_id,
    }));
  }, [activeItems]);

  const globalSearchResults = useMemo(() => {
    const q = globalSearch.trim().toLowerCase();

    if (!q) return [];

    return allItems.filter((item) => {
      return (
        item.name.toLowerCase().includes(q) ||
        (item.part_number || "").toLowerCase().includes(q) ||
        (item.description || "").toLowerCase().includes(q) ||
        item.shelfId.toLowerCase().includes(q) ||
        item.zoneName.toLowerCase().includes(q)
      );
    });
  }, [globalSearch, allItems]);

  const filteredShelves = useMemo(() => {
    const zoneShelves = getShelvesForZone(selectedZone);
    const q = zoneSearch.trim().toLowerCase();

    if (!q) return zoneShelves;

    return zoneShelves.filter((shelf) => {
      if (shelf.id.toLowerCase().includes(q)) return true;

      const items = itemsByShelf[shelf.id] || [];

      return items.some((item) => {
        return (
          item.name.toLowerCase().includes(q) ||
          (item.part_number || "").toLowerCase().includes(q) ||
          (item.description || "").toLowerCase().includes(q)
        );
      });
    });
  }, [selectedZone, zoneSearch, itemsByShelf]);

  const filteredArchiveItems = useMemo(() => {
    const q = archiveSearch.trim().toLowerCase();
    if (!q) return archiveItems;

    return archiveItems.filter((item) => {
      return (
        item.name.toLowerCase().includes(q) ||
        (item.shelf_id || "").toLowerCase().includes(q) ||
        getZoneName(item.zone_id).toLowerCase().includes(q) ||
        (item.part_number || "").toLowerCase().includes(q) ||
        (item.description || "").toLowerCase().includes(q) ||
        formatDate(item.deleted_at).toLowerCase().includes(q)
      );
    });
  }, [archiveItems, archiveSearch]);

  const toListItems = useMemo(() => {
    const items = activeItems
      .filter(
        (item) =>
          item.zone_id === selectedZone && item.status === "do_wystawienia"
      )
      .map((item) => ({
        ...item,
        shelfId: item.shelf_id,
        zoneId: item.zone_id,
        zoneName: getZoneName(item.zone_id),
      }));

    if (toListSort === "name_asc") {
      return [...items].sort((a, b) => a.name.localeCompare(b.name, "pl"));
    }

    return [...items].sort((a, b) => {
      const dateA = new Date(a.created_at || 0).getTime();
      const dateB = new Date(b.created_at || 0).getTime();
      return dateB - dateA;
    });
  }, [activeItems, selectedZone, toListSort]);

  function resetForm() {
    formData.images.forEach((image) => {
      if (image.preview_url) {
        URL.revokeObjectURL(image.preview_url);
      }
    });

    setFormData({
      name: "",
      partNumber: "",
      description: "",
      status: "neutralny",
      images: [],
    });
    setEditingItemId(null);
  }

  function handleFormChange(e) {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  }

  async function handleImagesChange(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    try {
      setIsProcessingImages(true);

      const resizedImages = [];

      for (let i = 0; i < files.length; i += 1) {
        const processedImage = await resizeImageFile(files[i], 1920, 1080, 0.82);
        resizedImages.push({
          ...processedImage,
          sort_order: formData.images.length + i,
        });
      }

      setFormData((prev) => ({
        ...prev,
        images: [...prev.images, ...resizedImages],
      }));
    } catch (error) {
      console.error(error);
      alert("Nie udało się przetworzyć zdjęcia.");
    } finally {
      setIsProcessingImages(false);
      e.target.value = "";
    }
  }

  function removeImageFromForm(imageId) {
    const imageToRemove = formData.images.find(
      (image) => String(image.id || image.localId) === String(imageId)
    );

    if (imageToRemove?.preview_url) {
      URL.revokeObjectURL(imageToRemove.preview_url);
    }

    setFormData((prev) => ({
      ...prev,
      images: prev.images.filter(
        (image) => String(image.id || image.localId) !== String(imageId)
      ),
    }));
  }

  async function uploadImageToWorker(image) {
    if (image.file_url && !image.blob) {
      return image;
    }

    let blob = image.blob;

    if (!blob && image.preview_url) {
      blob = await blobUrlToBlob(image.preview_url);
    }

    if (!blob) {
      throw new Error("Brak blob do uploadu.");
    }

    const file = new File([blob], image.file_name || "zdjecie.jpg", {
      type: image.mime_type || "image/jpeg",
    });

    const payload = new FormData();
    payload.append("file", file);

    const response = await fetch(UPLOAD_WORKER_URL, {
      method: "POST",
      body: payload,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Upload error: ${text}`);
    }

    const result = await response.json();

    return {
      file_name: result.fileName || image.file_name,
      file_url: result.url,
      sort_order: image.sort_order || 0,
      width: image.width || null,
      height: image.height || null,
      mime_type: result.contentType || image.mime_type || "image/jpeg",
    };
  }

  async function replaceItemImages(itemId, images) {
    const { error: deleteError } = await supabase
      .from("item_images")
      .delete()
      .eq("item_id", itemId);

    if (deleteError) {
      throw deleteError;
    }

    if (!images.length) return;

    const uploadedImages = [];
    for (let i = 0; i < images.length; i += 1) {
      const uploaded = await uploadImageToWorker({
        ...images[i],
        sort_order: i,
      });
      uploadedImages.push(uploaded);
    }

    const payload = uploadedImages.map((image, index) => ({
      item_id: itemId,
      file_name: image.file_name || `zdjecie_${index + 1}.jpg`,
      file_url: image.file_url,
      sort_order: index,
    }));

    const { error: insertError } = await supabase
      .from("item_images")
      .insert(payload);

    if (insertError) {
      throw insertError;
    }
  }

  async function handleSaveItem(e) {
    e.preventDefault();

    if (!formData.name.trim()) {
      alert("Podaj nazwę części.");
      return;
    }

    try {
      setIsSavingItem(true);

      if (editingItemId) {
        const { error: updateError } = await supabase
          .from("items")
          .update({
            zone_id: selectedZone,
            shelf_id: selectedShelf,
            name: formData.name.trim(),
            part_number: formData.partNumber.trim() || null,
            description: formData.description.trim() || null,
            status: formData.status,
            updated_at: new Date().toISOString(),
          })
          .eq("id", editingItemId);

        if (updateError) {
          throw updateError;
        }

        await replaceItemImages(editingItemId, formData.images);
      } else {
        const { data: insertedItem, error: insertError } = await supabase
          .from("items")
          .insert({
            zone_id: selectedZone,
            shelf_id: selectedShelf,
            name: formData.name.trim(),
            part_number: formData.partNumber.trim() || null,
            description: formData.description.trim() || null,
            status: formData.status,
          })
          .select()
          .single();

        if (insertError) {
          throw insertError;
        }

        await replaceItemImages(insertedItem.id, formData.images);
      }

      await loadItemsFromSupabase();
      resetForm();
      setShowAddForm(false);
    } catch (error) {
      console.error("Błąd zapisu:", error);
      alert("Nie udało się zapisać rzeczy.");
    } finally {
      setIsSavingItem(false);
    }
  }

  function startEditItem(item) {
    setEditingItemId(item.id);
    setFormData({
      name: item.name || "",
      partNumber: item.part_number || "",
      description: item.description || "",
      status: item.status || "neutralny",
      images: Array.isArray(item.images)
        ? item.images.map((image) => ({
            ...image,
            localId: `${image.id}-${Math.random()}`,
            preview_url: image.file_url,
            uploaded: true,
          }))
        : [],
    });
    setShowAddForm(true);
  }

  function cancelForm() {
    setShowAddForm(false);
    resetForm();
  }

  async function handleDeleteItem(itemId) {
    try {
      const { error } = await supabase
        .from("items")
        .update({
          deleted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", itemId);

      if (error) {
        throw error;
      }

      if (selectedItemId === itemId) {
        setSelectedItemId(null);
        setView("shelf");
      }

      if (editingItemId === itemId) {
        cancelForm();
      }

      await loadItemsFromSupabase();
    } catch (error) {
      console.error("Błąd archiwizacji:", error);
      alert("Nie udało się usunąć rzeczy.");
    }
  }

  async function handleDeleteArchiveItemPermanently(archiveItemId) {
    try {
      const { error } = await supabase
        .from("items")
        .delete()
        .eq("id", archiveItemId);

      if (error) {
        throw error;
      }

      await loadItemsFromSupabase();
    } catch (error) {
      console.error("Błąd trwałego usuwania:", error);
      alert("Nie udało się usunąć rzeczy na stałe.");
    }
  }

  async function handleChangeItemStatus(itemId, newStatus) {
    try {
      const { error } = await supabase
        .from("items")
        .update({
          status: newStatus,
          updated_at: new Date().toISOString(),
        })
        .eq("id", itemId);

      if (error) {
        throw error;
      }

      await loadItemsFromSupabase();
    } catch (error) {
      console.error("Błąd zmiany statusu:", error);
      alert("Nie udało się zmienić statusu.");
    }
  }

  function getStatusLabel(status) {
    if (status === "neutralny") return "Neutralny";
    if (status === "do_wystawienia") return "Do wystawienia";
    if (status === "wystawiony") return "Wystawiony";
    return status;
  }

  function downloadImage(image) {
    const link = document.createElement("a");
    link.href = image.file_url || image.preview_url || image.url;
    link.download = image.file_name || image.name || "zdjecie.jpg";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  async function downloadAllImagesAsZip(item) {
    if (!item?.images || item.images.length === 0) {
      alert("Brak zdjęć do pobrania.");
      return;
    }

    try {
      setIsDownloadingZip(true);

      const zip = new JSZip();
      const folderName = sanitizeFileName(item.name || "produkt");
      const folder = zip.folder(folderName);

      for (let i = 0; i < item.images.length; i += 1) {
        const image = item.images[i];
        const response = await fetch(image.file_url || image.preview_url || image.url);
        const blob = await response.blob();

        const safeBaseName = sanitizeFileName(
          (image.file_name || image.name || `${folderName}_${i + 1}`).replace(
            /\.[^/.]+$/,
            ""
          )
        );

        folder.file(
          `${String(i + 1).padStart(2, "0")}_${safeBaseName}.jpg`,
          blob
        );
      }

      const zipBlob = await zip.generateAsync({ type: "blob" });
      const zipUrl = URL.createObjectURL(zipBlob);

      const link = document.createElement("a");
      link.href = zipUrl;
      link.download = `${folderName}_zdjecia.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      URL.revokeObjectURL(zipUrl);
    } catch (error) {
      console.error(error);
      alert("Nie udało się pobrać wszystkich zdjęć.");
    } finally {
      setIsDownloadingZip(false);
    }
  }

  function openZone(zoneId) {
    setSelectedZone(zoneId);
    setSelectedShelf(null);
    setSelectedItemId(null);
    cancelForm();
    setZoneSearch("");
    setView("zone");
  }

  function openShelf(zoneId, shelfId) {
    setSelectedZone(zoneId);
    setSelectedShelf(shelfId);
    setSelectedItemId(null);
    cancelForm();
    setView("shelf");
  }

  function openItem(zoneId, shelfId, item) {
    setSelectedZone(zoneId);
    setSelectedShelf(shelfId);
    setSelectedItemId(item.id);
    cancelForm();
    setView("item");
  }

  function goToStart() {
    setView("start");
    setSelectedZone(null);
    setSelectedShelf(null);
    setSelectedItemId(null);
    cancelForm();
    setZoneSearch("");
  }

  function openArchive() {
    setView("archive");
  }

  function openToList() {
    setView("to_list");
  }

  if (isLoadingData) {
    return (
      <div className="app">
        <h1>Ładowanie danych...</h1>
      </div>
    );
  }

  if (view === "item" && selectedItem && selectedShelf && selectedZone) {
    return (
      <div className="app">
        <header className="topbar">
          <button className="back" onClick={() => setView("shelf")}>
            ← Wróć do regału
          </button>
          <h1>Produkt</h1>
          <div className="top-controls">
            <button onClick={openToList}>Do wystawienia</button>
            <button onClick={openArchive}>Archiwum</button>
            <button onClick={goToStart}>Start</button>
          </div>
        </header>

        <div className="product-view">
          <div className="product-card">
            <div className="item-top">
              <h2>{selectedItem.name}</h2>
              <span className={`status ${selectedItem.status}`}>
                {getStatusLabel(selectedItem.status)}
              </span>
            </div>

            <p>
              <strong>Strefa:</strong> {getZoneName(selectedZone)}
            </p>

            <p>
              <strong>Regał:</strong> {selectedShelf}
            </p>

            <p>
              <strong>Data dodania:</strong> {formatDate(selectedItem.created_at)}
            </p>

            {selectedItem.part_number && (
              <p>
                <strong>Nr części:</strong> {selectedItem.part_number}
              </p>
            )}

            {selectedItem.description && (
              <p>
                <strong>Opis:</strong> {selectedItem.description}
              </p>
            )}

            <div className="status-actions">
              <button onClick={() => handleChangeItemStatus(selectedItem.id, "neutralny")}>
                Neutralny
              </button>
              <button
                onClick={() =>
                  handleChangeItemStatus(selectedItem.id, "do_wystawienia")
                }
              >
                Do wystawienia
              </button>
              <button onClick={() => handleChangeItemStatus(selectedItem.id, "wystawiony")}>
                Wystawiony
              </button>
            </div>

            <div className="item-actions">
              <button onClick={() => startEditItem(selectedItem)}>Edytuj</button>
              <button
                className="danger"
                onClick={() => handleDeleteItem(selectedItem.id)}
              >
                Usuń z regału
              </button>
            </div>
          </div>

          <div className="product-card">
            <div className="item-top">
              <h3>Zdjęcia</h3>
              <button
                onClick={() => downloadAllImagesAsZip(selectedItem)}
                disabled={isDownloadingZip || !selectedItem.images?.length}
              >
                {isDownloadingZip ? "Pakowanie..." : "Pobierz wszystkie zdjęcia"}
              </button>
            </div>

            {!selectedItem.images || selectedItem.images.length === 0 ? (
              <p>Brak zdjęć.</p>
            ) : (
              <div className="images-grid">
                {selectedItem.images.map((image) => (
                  <div key={image.id || image.localId} className="image-card">
                    <img src={image.file_url || image.preview_url || image.url} alt={image.file_name || image.name} />
                    <div className="image-actions">
                      <button onClick={() => downloadImage(image)}>
                        Pobierz zdjęcie
                      </button>
                    </div>
                    <div
                      style={{
                        marginTop: "8px",
                        fontSize: "12px",
                        color: "#6b7280",
                      }}
                    >
                      {image.width || "?"}x{image.height || "?"}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {showAddForm && editingItemId === selectedItem.id && (
            <form className="add-form" onSubmit={handleSaveItem}>
              <h3>Edycja rzeczy</h3>

              <label>Nazwa</label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleFormChange}
                placeholder="Np. Lampa tył Audi A3"
              />

              <label>Nr części (opcjonalnie)</label>
              <input
                type="text"
                name="partNumber"
                value={formData.partNumber}
                onChange={handleFormChange}
                placeholder="Np. 8V4945095"
              />

              <label>Opis</label>
              <textarea
                name="description"
                value={formData.description}
                onChange={handleFormChange}
                placeholder="Np. Sprawna, zdjęta z auta"
                rows="4"
              />

              <label>Status</label>
              <select
                name="status"
                value={formData.status}
                onChange={handleFormChange}
              >
                <option value="neutralny">Neutralny</option>
                <option value="do_wystawienia">Do wystawienia</option>
                <option value="wystawiony">Wystawiony</option>
              </select>

              <label>Zdjęcia</label>
              <input
                type="file"
                multiple
                accept="image/*"
                capture="environment"
                onChange={handleImagesChange}
              />

              {isProcessingImages && <p>Przetwarzanie zdjęć...</p>}

              {formData.images.length > 0 && (
                <div className="images-grid form-images">
                  {formData.images.map((image) => (
                    <div
                      key={image.id || image.localId}
                      className="image-card"
                    >
                      <img src={image.file_url || image.preview_url || image.url} alt={image.file_name || image.name} />
                      <div
                        style={{
                          marginTop: "8px",
                          fontSize: "12px",
                          color: "#6b7280",
                        }}
                      >
                        {image.width || "?"}x{image.height || "?"}
                      </div>
                      <div className="image-actions">
                        <button
                          type="button"
                          className="danger"
                          onClick={() =>
                            removeImageFromForm(image.id || image.localId)
                          }
                        >
                          Usuń zdjęcie
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="form-buttons">
                <button
                  type="submit"
                  disabled={isProcessingImages || isSavingItem}
                >
                  {isSavingItem ? "Zapisywanie..." : "Zapisz zmiany"}
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={cancelForm}
                >
                  Anuluj
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    );
  }

  if (view === "archive") {
    return (
      <div className="app">
        <header className="topbar">
          <button
            className="back"
            onClick={() => {
              if (selectedShelf) {
                setView("shelf");
              } else if (selectedZone) {
                setView("zone");
              } else {
                goToStart();
              }
              setArchiveSearch("");
            }}
          >
            ← Wróć
          </button>
          <h1>Archiwum usunięć</h1>
        </header>

        <div className="shelf-view">
          <div className="top-controls" style={{ marginBottom: "20px" }}>
            <input
              type="text"
              placeholder="Szukaj w archiwum: nazwa, nr części, regał, strefa..."
              value={archiveSearch}
              onChange={(e) => setArchiveSearch(e.target.value)}
            />
          </div>

          <div className="items-list">
            <h3>Usunięte rzeczy</h3>

            {filteredArchiveItems.length === 0 ? (
              <p>Brak wyników w archiwum.</p>
            ) : (
              filteredArchiveItems.map((item) => (
                <div key={item.id} className="item-card">
                  <div className="item-top">
                    <h4>{item.name}</h4>
                    <span className={`status ${item.status}`}>
                      {getStatusLabel(item.status)}
                    </span>
                  </div>

                  <p>
                    <strong>Strefa:</strong> {getZoneName(item.zone_id)}
                  </p>

                  <p>
                    <strong>Regał:</strong> {item.shelf_id}
                  </p>

                  <p>
                    <strong>Data dodania:</strong> {formatDate(item.created_at)}
                  </p>

                  <p>
                    <strong>Data usunięcia:</strong> {formatDate(item.deleted_at)}
                  </p>

                  {item.part_number && (
                    <p>
                      <strong>Nr części:</strong> {item.part_number}
                    </p>
                  )}

                  {item.description && (
                    <p>
                      <strong>Opis:</strong> {item.description}
                    </p>
                  )}

                  <div className="item-actions">
                    <button
                      className="danger"
                      onClick={() => handleDeleteArchiveItemPermanently(item.id)}
                    >
                      Usuń na stałe
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    );
  }

  if (view === "to_list" && selectedZone) {
    return (
      <div className="app">
        <header className="topbar">
          <button
            className="back"
            onClick={() => {
              if (selectedShelf) {
                setView("shelf");
              } else {
                setView("zone");
              }
            }}
          >
            ← Wróć
          </button>
          <h1>{getZoneName(selectedZone)} / Do wystawienia</h1>
        </header>

        <div className="shelf-view">
          <div className="sort-bar">
            <label>Sortowanie:</label>
            <select
              value={toListSort}
              onChange={(e) => setToListSort(e.target.value)}
            >
              <option value="date_desc">Według daty dodania</option>
              <option value="name_asc">Według nazwy</option>
            </select>
          </div>

          <div className="items-list">
            <h3>Rzeczy oznaczone jako do wystawienia</h3>

            {toListItems.length === 0 ? (
              <p>Brak rzeczy do wystawienia w tej strefie.</p>
            ) : (
              toListItems.map((item) => (
                <div key={item.id} className="item-card">
                  <div
                    className="item-clickable"
                    onClick={() => openItem(item.zone_id, item.shelf_id, item)}
                  >
                    <div className="item-top">
                      <h4>{item.name}</h4>
                      <span className={`status ${item.status}`}>
                        {getStatusLabel(item.status)}
                      </span>
                    </div>

                    <p>
                      <strong>Regał:</strong> {item.shelf_id}
                    </p>

                    <p>
                      <strong>Data dodania:</strong> {formatDate(item.created_at)}
                    </p>

                    {item.part_number && (
                      <p>
                        <strong>Nr części:</strong> {item.part_number}
                      </p>
                    )}

                    {item.description && (
                      <p>
                        <strong>Opis:</strong> {item.description}
                      </p>
                    )}
                  </div>

                  <div className="status-actions">
                    <button
                      onClick={() =>
                        handleChangeItemStatus(item.id, "wystawiony")
                      }
                    >
                      Wystawiony
                    </button>
                    <button
                      onClick={() =>
                        handleChangeItemStatus(item.id, "neutralny")
                      }
                    >
                      Neutralny
                    </button>
                    <button onClick={() => openItem(item.zone_id, item.shelf_id, item)}>
                      Edytuj
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    );
  }

  if (view === "shelf" && selectedShelf && selectedZone) {
    return (
      <div className="app">
        <header className="topbar">
          <button
            className="back"
            onClick={() => {
              setSelectedShelf(null);
              setSelectedItemId(null);
              cancelForm();
              setView("zone");
            }}
          >
            ← Wróć do strefy
          </button>

          <h1>
            {getZoneName(selectedZone)} / Regał {selectedShelf}
          </h1>

          <div className="top-controls">
            <button onClick={openToList}>Do wystawienia</button>
            <button onClick={openArchive}>Archiwum</button>
            <button onClick={goToStart}>Start</button>
          </div>
        </header>

        <div className="shelf-view">
          <div className="shelf-actions">
            <button
              onClick={() => {
                resetForm();
                setShowAddForm(true);
              }}
            >
              Dodaj rzecz
            </button>
          </div>

          {showAddForm && (
            <form className="add-form" onSubmit={handleSaveItem}>
              <h3>
                {editingItemId
                  ? `Edytuj rzecz w regale ${selectedShelf}`
                  : `Dodaj rzecz do regału ${selectedShelf}`}
              </h3>

              <label>Nazwa</label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleFormChange}
                placeholder="Np. Lampa tył Audi A3"
              />

              <label>Nr części (opcjonalnie)</label>
              <input
                type="text"
                name="partNumber"
                value={formData.partNumber}
                onChange={handleFormChange}
                placeholder="Np. 8V4945095"
              />

              <label>Opis</label>
              <textarea
                name="description"
                value={formData.description}
                onChange={handleFormChange}
                placeholder="Np. Sprawna, zdjęta z auta"
                rows="4"
              />

              <label>Status</label>
              <select
                name="status"
                value={formData.status}
                onChange={handleFormChange}
              >
                <option value="neutralny">Neutralny</option>
                <option value="do_wystawienia">Do wystawienia</option>
                <option value="wystawiony">Wystawiony</option>
              </select>

              <label>Zdjęcia</label>
              <input
                type="file"
                multiple
                accept="image/*"
                capture="environment"
                onChange={handleImagesChange}
              />

              {isProcessingImages && <p>Przetwarzanie zdjęć...</p>}

              {formData.images.length > 0 && (
                <div className="images-grid form-images">
                  {formData.images.map((image) => (
                    <div
                      key={image.id || image.localId}
                      className="image-card"
                    >
                      <img src={image.file_url || image.preview_url || image.url} alt={image.file_name || image.name} />
                      <div
                        style={{
                          marginTop: "8px",
                          fontSize: "12px",
                          color: "#6b7280",
                        }}
                      >
                        {image.width || "?"}x{image.height || "?"}
                      </div>
                      <div className="image-actions">
                        <button
                          type="button"
                          className="danger"
                          onClick={() =>
                            removeImageFromForm(image.id || image.localId)
                          }
                        >
                          Usuń zdjęcie
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="form-buttons">
                <button
                  type="submit"
                  disabled={isProcessingImages || isSavingItem}
                >
                  {isSavingItem
                    ? "Zapisywanie..."
                    : editingItemId
                    ? "Zapisz zmiany"
                    : "Zapisz"}
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={cancelForm}
                >
                  Anuluj
                </button>
              </div>
            </form>
          )}

          <div className="items-list">
            <h3>Rzeczy na regale</h3>

            {selectedItems.length === 0 ? (
              <p>Ten regał jest pusty.</p>
            ) : (
              selectedItems.map((item) => (
                <div key={item.id} className="item-card">
                  <div
                    className="item-clickable"
                    onClick={() => openItem(selectedZone, selectedShelf, item)}
                  >
                    <div className="item-top">
                      <h4>{item.name}</h4>
                      <span className={`status ${item.status}`}>
                        {getStatusLabel(item.status)}
                      </span>
                    </div>

                    <p>
                      <strong>Data dodania:</strong> {formatDate(item.created_at)}
                    </p>

                    {item.part_number && (
                      <p>
                        <strong>Nr części:</strong> {item.part_number}
                      </p>
                    )}

                    {item.description && (
                      <p>
                        <strong>Opis:</strong> {item.description}
                      </p>
                    )}

                    <p>
                      <strong>Zdjęcia:</strong> {item.images?.length || 0}
                    </p>
                  </div>

                  <div className="status-actions">
                    <button
                      onClick={() => handleChangeItemStatus(item.id, "neutralny")}
                    >
                      Neutralny
                    </button>
                    <button
                      onClick={() =>
                        handleChangeItemStatus(item.id, "do_wystawienia")
                      }
                    >
                      Do wystawienia
                    </button>
                    <button
                      onClick={() => handleChangeItemStatus(item.id, "wystawiony")}
                    >
                      Wystawiony
                    </button>
                    <button onClick={() => startEditItem(item)}>Edytuj</button>
                  </div>

                  <div className="item-actions">
                    <button
                      className="danger"
                      onClick={() => handleDeleteItem(item.id)}
                    >
                      Usuń z regału
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    );
  }

  if (view === "zone" && selectedZone) {
    const zoneConfig = zones.find((zone) => zone.id === selectedZone);

    return (
      <div className="app">
        <header className="topbar">
          <button className="back" onClick={goToStart}>
            ← Wróć do startu
          </button>

          <h1>{getZoneName(selectedZone)}</h1>

          <div className="top-controls">
            <input
              placeholder="Szukaj tylko w tej strefie..."
              value={zoneSearch}
              onChange={(e) => setZoneSearch(e.target.value)}
            />
            <button onClick={openToList}>Do wystawienia</button>
            <button onClick={openArchive}>Archiwum</button>
          </div>
        </header>

        {zoneConfig?.hasMap ? (
          <>
            {zoneSearch && filteredShelves.length === 0 && (
              <div className="items-list" style={{ marginBottom: "20px" }}>
                <h3>Wyniki wyszukiwania w strefie</h3>
                <p>Brak wyników.</p>
              </div>
            )}

            <div className="map-wrap">
              <div className="map">
                {filteredShelves.map((shelf) => {
                  const shelfItemsCount = itemsByShelf[shelf.id]?.length || 0;
                  const isOccupied = shelfItemsCount > 0;

                  const gridColumn = shelf.colSpan
                    ? `${shelf.col} / span ${shelf.colSpan}`
                    : shelf.col;

                  return (
                    <button
                      key={shelf.id}
                      className={`shelf ${isOccupied ? "occupied" : "empty"} ${
                        shelf.wide ? "wide-shelf" : ""
                      }`}
                      style={{
                        gridColumn,
                        gridRow: `${shelf.row} / span ${shelf.rowSpan}`,
                      }}
                      onClick={() => openShelf(selectedZone, shelf.id)}
                    >
                      <span className="shelf-label">{shelf.id}</span>
                      {isOccupied && (
                        <span className="shelf-count">{shelfItemsCount}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        ) : (
          <div className="empty-zone-card">
            <h3>Ta strefa jest jeszcze pusta</h3>
            <p>Mapa dla tej sekcji będzie dodana później.</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="app">
      <header className="topbar start-topbar">
        <div>
          <h1>Magazyn części</h1>
          <p className="subtitle">
            Ekran startowy z globalnym wyszukiwaniem we wszystkich strefach
          </p>
        </div>

        <div className="top-controls">
          <button onClick={openArchive}>Archiwum</button>
        </div>
      </header>

      <div className="start-search-card">
        <input
          className="global-search"
          placeholder="Szukaj we wszystkich magazynach / strefach..."
          value={globalSearch}
          onChange={(e) => setGlobalSearch(e.target.value)}
        />
      </div>

      {globalSearch && (
        <div className="items-list global-results">
          <h3>Wyniki globalne</h3>

          {globalSearchResults.length === 0 ? (
            <p>Brak wyników.</p>
          ) : (
            globalSearchResults.map((item) => (
              <div
                key={item.id}
                className="item-card"
                style={{ cursor: "pointer" }}
                onClick={() => openItem(item.zone_id, item.shelf_id, item)}
              >
                <div className="item-top">
                  <h4>{item.name}</h4>
                  <span className={`status ${item.status}`}>
                    {getStatusLabel(item.status)}
                  </span>
                </div>

                <p>
                  <strong>Strefa:</strong> {item.zoneName}
                </p>

                <p>
                  <strong>Regał:</strong> {item.shelfId}
                </p>

                <p>
                  <strong>Data dodania:</strong> {formatDate(item.created_at)}
                </p>

                {item.part_number && (
                  <p>
                    <strong>Nr części:</strong> {item.part_number}
                  </p>
                )}

                {item.description && (
                  <p>
                    <strong>Opis:</strong> {item.description}
                  </p>
                )}

                <p>
                  <strong>Zdjęcia:</strong> {item.images?.length || 0}
                </p>
              </div>
            ))
          )}
        </div>
      )}

      <div className="start-buttons">
        {zones.map((zone) => (
          <button
            key={zone.id}
            className="start-zone-button"
            onClick={() => openZone(zone.id)}
          >
            {zone.name}
          </button>
        ))}
      </div>
    </div>
  );
}