import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

const json = (statusCode, data) => ({
  statusCode,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(data),
});

const ALLOWED_ORIGINS = ["Alagon", "Borja", "Canal", "Guadalajara", "Villacruz", "FSA"];
const ALLOWED_COURSES = ["4º Primaria","5º Primaria","6º Primaria","1º ESO","2º ESO","3º ESO"];

function normalizeAllergies(arr) {
  const list = Array.isArray(arr) ? arr.filter(Boolean) : [];
  return list.includes("NINGUNA") ? ["NINGUNA"] : list;
}

function validateKid(kid) {
  if (!kid?.camper_name || !kid?.camper_surname) return "Faltan nombre/apellidos del acampado";
  if (!ALLOWED_COURSES.includes(kid.course)) return "Curso no válido";
  if (!Array.isArray(kid.allergies)) return "Alergias no válidas";
  if (!kid.medical_notes) return "Falta información médica";
  return null;
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function kidSummaryHtml(kid, idx) {
  const name = `${escapeHtml(kid.camper_name)} ${escapeHtml(kid.camper_surname)}`.trim();
  const course = escapeHtml(kid.course);
  const allergies = Array.isArray(kid.allergies) && kid.allergies.length
    ? escapeHtml(kid.allergies.join(", "))
    : "—";
  const medical = escapeHtml(kid.medical_notes);
  const notes = kid.special_notes ? escapeHtml(kid.special_notes) : "—";

  return `
    <div style="margin:12px 0;padding:12px;border:1px solid #e5e7eb;border-radius:10px;">
      <div style="font-weight:700;margin-bottom:6px;">Acampado/a ${idx}</div>
      <div><strong>Nombre:</strong> ${name}</div>
      <div><strong>Curso:</strong> ${course}</div>
      <div><strong>Alergias/Intolerancias:</strong> ${allergies}</div>
      <div><strong>Info médica:</strong> ${medical}</div>
      <div><strong>Observaciones:</strong> ${notes}</div>
    </div>
  `;
}

export async function handler(event) {
  if (event.httpMethod !== "POST") return json(405, { error: "Método no permitido" });

  let payload;
  try { payload = JSON.parse(event.body || "{}"); }
  catch { return json(400, { error: "JSON inválido" }); }

  // Contacto obligatorio
  const requiredContact = ["email","parent_name","phones","origin"];
  for (const k of requiredContact) {
    if (!payload[k]) return json(400, { error: `Falta el campo obligatorio: ${k}` });
  }

  if (!ALLOWED_ORIGINS.includes(payload.origin)) {
    return json(400, { error: "Procedencia no válida" });
  }

  // Consentimientos obligatorios (boolean true)
  const consents = ["consent_internal_media","consent_public_media","consent_health","consent_privacy_read","consent_rules"];
  for (const c of consents) {
    if (payload[c] !== true) return json(400, { error: `Falta consentimiento obligatorio: ${c}` });
  }

  // Niños: 1 o 2
  const kids = Array.isArray(payload.kids) ? payload.kids : [];
  if (kids.length < 1 || kids.length > 2) {
    return json(400, { error: "Debes enviar 1 o 2 acampados" });
  }

  for (const k of kids) {
    const err = validateKid(k);
    if (err) return json(400, { error: err });
    k.allergies = normalizeAllergies(k.allergies);
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return json(500, { error: "Servidor no configurado" });

  const supabase = createClient(supabaseUrl, serviceKey);

  // 1) Leer cupo
  const { data: quotaRow, error: qErr } = await supabase
    .from("origin_quota")
    .select("max_slots, enabled")
    .eq("origin", payload.origin)
    .single();

  if (qErr || !quotaRow) return json(400, { error: "Procedencia sin cupo configurado" });
  if (!quotaRow.enabled) return json(409, { error: "Procedencia deshabilitada" });

  // 2) Contar reservas activas
  const { count, error: cErr } = await supabase
    .from("reservations")
    .select("*", { count: "exact", head: true })
    .eq("origin", payload.origin)
    .eq("status", "reserved");

  if (cErr) return json(500, { error: "Error comprobando cupo" });

  const libres = quotaRow.max_slots - (count ?? 0);
  const needed = kids.length;

  const statusGroup = libres >= needed ? "reserved" : "waitlist";

  // 3) Insertar N filas con mismo group_id
  const group_id = crypto.randomUUID();

  const rows = kids.map((kid) => ({
    group_id,
    status: statusGroup,

    email: payload.email.trim(),
    parent_name: payload.parent_name.trim(),
    phones: payload.phones.trim(),
    other_contact: payload.other_contact?.trim() || null,

    camper_name: kid.camper_name.trim(),
    camper_surname: kid.camper_surname.trim(),
    course: kid.course,
    origin: payload.origin,

    allergies: kid.allergies,
    medical_notes: kid.medical_notes.trim(),

    // ✅ por niño
    special_notes: kid.special_notes?.trim() || null,

    consent_internal_media: payload.consent_internal_media,
    consent_public_media: payload.consent_public_media,
    consent_health: payload.consent_health,
    consent_privacy_read: payload.consent_privacy_read,
    consent_rules: payload.consent_rules,
  }));

  const { error: insErr } = await supabase.from("reservations").insert(rows);
  if (insErr) return json(500, { error: "No se pudo guardar la reserva" });

  // 4) Enviar email con Resend (si está configurado)
  const resendKey = process.env.RESEND_API_KEY;
  const resendFrom = process.env.RESEND_FROM;

  if (resendKey && resendFrom) {
    const resend = new Resend(resendKey);

    const subject =
      statusGroup === "reserved"
        ? "Reserva registrada – Campamento MSA 2026"
        : "Lista de espera – Campamento MSA 2026";

    const statusText =
      statusGroup === "reserved"
        ? "Reserva registrada"
        : "Cupo completo. Añadido a lista de espera";

    const kidsHtml = kids.map((k, i) => kidSummaryHtml(k, i + 1)).join("");

    const html = `
      <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;line-height:1.4;color:#111;">
        <h2 style="margin:0 0 12px;">${escapeHtml(subject)}</h2>
        <p style="margin:0 0 10px;"><strong>Estado:</strong> ${escapeHtml(statusText)}</p>

        <div style="margin:10px 0;">
          <div><strong>Procedencia:</strong> ${escapeHtml(payload.origin)}</div>
          <div><strong>Madre/Padre/Tutor:</strong> ${escapeHtml(payload.parent_name)}</div>
          <div><strong>Teléfonos:</strong> ${escapeHtml(payload.phones)}</div>
        </div>

        ${kidsHtml}

        <p style="margin-top:16px;">Si hay algún error en los datos, responde a este correo o escribe a MSACampamento@gmail.com.</p>
        <p style="margin:0;color:#666;font-size:12px;">© 2026 Campamento MSA</p>
      </div>
    `;

    try {
      await resend.emails.send({
        from: resendFrom,
        to: payload.email.trim(),
        subject,
        html,
      });
    } catch (e) {
      // No rompemos la reserva si falla el email
      // (pero lo ideal es verlo en logs de Netlify)
      console.error("Resend error:", e);
    }
  }

  return json(200, {
    ok: true,
    status: statusGroup,
    message: statusGroup === "reserved"
      ? "Reserva registrada"
      : "Cupo completo. Añadido a lista de espera",
  });
}
