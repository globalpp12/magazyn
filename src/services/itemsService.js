import { supabase } from "../lib/supabase";

export async function fetchZones() {
  const { data, error } = await supabase
    .from("zones")
    .select("*")
    .order("name", { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function fetchItemsByZone(zoneId) {
  const { data, error } = await supabase
    .from("items")
    .select(`
      *,
      item_images (*)
    `)
    .eq("zone_id", zoneId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function fetchArchivedItems() {
  const { data, error } = await supabase
    .from("items")
    .select(`
      *,
      item_images (*),
      zones (id, name)
    `)
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function createItem(payload) {
  const { data, error } = await supabase
    .from("items")
    .insert([payload])
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateItem(id, payload) {
  const { data, error } = await supabase
    .from("items")
    .update(payload)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function archiveItem(id) {
  const { data, error } = await supabase
    .from("items")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function restoreItem(id) {
  const { data, error } = await supabase
    .from("items")
    .update({ deleted_at: null })
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function addItemImages(images) {
  const { data, error } = await supabase
    .from("item_images")
    .insert(images)
    .select();

  if (error) throw error;
  return data || [];
}