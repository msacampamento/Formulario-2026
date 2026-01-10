import { createClient } from "@supabase/supabase-js";

const json = (statusCode, data) => ({
  statusCode,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(data),
});

const ALLOWED_ORIGINS = ["Alagon", "Borja", "Canal", "Guadalajara", "Villacruz", "FSA"];
const ALLOWED_COURSES = [
  "4º Primaria",
  "5º Primaria",
  "6º Primaria",
  "1º ESO",
  "2º ESO",
  "3º ESO",
];

function normalizeAllergies(arr) {
  const list = Array.isArray(arr) ? arr.filter(Boolean) : [];
  return list.includes("NINGUNA") ? ["NINGUNA"] : list;
}

function validateKid(kid) {
  if (!kid?.camper_name || !kid?.camper_surname) {
    return "Faltan nombre y apellidos del acampado.";
  }
  if (!ALLOWED_COURSES.includes(kid.course)) {
    return "El curso seleccionado no es válido.";
  }
  if (!Array.isArray(kid.allergies)) {
    return "Las alergias indicadas no son válidas.";
  }
  if (!kid.medical_notes) {
    return "Falta la información médica obligatoria.";
  }
  return null;
}

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Método no permitido." });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "Datos enviados no válidos." });
  }

  /* -----------------------------
     DATOS DE CONTACTO OBLIGATORIOS
  ------------------------------ */
  const requiredContact = [
    "email",
    "parent_name_mother",
    "parent_name_father",
    "phones",
    "origin",
  ];

  for (const field of requiredContact) {
    if (!payload[field]) {
      return json(400, {
        error: `Falta el campo obligatorio: ${field}`,
        userMessage: "Por favor, completa todos los datos de contacto obligatorios.",
      });
    }
  }

  // ✅ Endurecer: no permitir solo espacios en madre/padre
  const mother = String(payload.parent_name_mother || "").trim();
  const father = String(payload.parent_name_father || "").trim();

  if (!mother || !father) {
    return json(400, {
      error: "Datos de tutor incompletos",
      userMessage: "Debes indicar el nombre y apellidos de madre/tutora y padre/tutor.",
    });
  }

  if (!ALLOWED_ORIGINS.includes(payload.origin)) {
    return json(400, {
      error: "Procedencia no válida",
      userMessage: "La procedencia seleccionada no es válida.",
    });
  }

  /* -----------------------------
     CONSENTIMIENTOS OBLIGATORIOS
  ------------------------------ */
  const requiredConsentsMap = {
    consent_health: {
      code: "Tratamiento_datos_salud",
      message:
        "Para poder realizar la inscripción es obligatorio autorizar el tratamiento de datos de salud y la atención sanitaria en caso de urgencia.",
    },
    consent_privacy_read: {
      code: "confirmacion_leido",
      message:
        "Debes confirmar que has leído y comprendido la información sobre protección de datos para continuar con la inscripción.",
    },
    consent_rules: {
      code: "confirmacion_normativa",
      message:
        "Debes confirmar que has leído y aceptas la normativa de la actividad para poder realizar la inscripción.",
    },
  };

  for (const [field, info] of Object.entries(requiredConsentsMap)) {
    if (payload[field] !== true) {
      return json(400, {
        error: `Falta consentimiento obligatorio: ${info.code}`,
        userMessage: info.message,
      });
    }
  }

  // 👉 consent_internal_media y consent_public_media
  // pueden ser true o false (NO bloquean la inscripción)

  /* -----------------------------
     VALIDACIÓN DE ACAMPADOS
  ------------------------------ */
  const kids = Array.isArray(payload.kids) ? payload.kids : [];
  if (kids.length < 1 || kids.length > 2) {
    return json(400, {
      error: "Número de acampados no válido",
      userMessage: "Debes inscribir al menos un acampado y como máximo dos.",
    });
  }

  for (const kid of kids) {
    const err = validateKid(kid);
    if (err) {
      return json(400, {
        error: err,
        userMessage: err,
      });
    }
    kid.allergies = normalizeAllergies(kid.allergies);
  }

  /* -----------------------------
     SUPABASE
  ------------------------------ */
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return json(500, {
      error: "Servidor no configurado",
      userMessage: "Error interno del servidor. Inténtalo más tarde.",
    });
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  /* -----------------------------
     COMPROBACIÓN DE CUPO
  ------------------------------ */
  const { data: quotaRow, error: qErr } = await supabase
    .from("origin_quota")
    .select("max_slots, enabled")
    .eq("origin", payload.origin)
    .single();

  if (qErr || !quotaRow) {
    return json(400, {
      error: "Procedencia sin cupo configurado",
      userMessage: "La procedencia seleccionada no tiene cupo configurado.",
    });
  }

  if (!quotaRow.enabled) {
    return json(409, {
      error: "Procedencia deshabilitada",
      userMessage: "Las inscripciones para esta procedencia están cerradas.",
    });
  }

  const { count, error: cErr } = await supabase
    .from("reservations")
    .select("*", { count: "exact", head: true })
    .eq("origin", payload.origin)
    .eq("status", "reserved");

  if (cErr) {
    return json(500, {
      error: "Error comprobando cupo",
      userMessage: "No se pudo comprobar la disponibilidad de plazas.",
    });
  }

  const libres = quotaRow.max_slots - (count ?? 0);
  const needed = kids.length;
  const statusGroup = libres >= needed ? "reserved" : "waitlist";

  /* -----------------------------
     INSERCIÓN EN BD
  ------------------------------ */
  const group_id = crypto.randomUUID();

  const rows = kids.map((kid) => ({
    group_id,
    status: statusGroup,

    email: String(payload.email || "").trim(),
    parent_name_mother: mother,
    parent_name_father: father,
    phones: String(payload.phones || "").trim(),
    other_contact: payload.other_contact?.trim() || null,

    camper_name: kid.camper_name.trim(),
    camper_surname: kid.camper_surname.trim(),
    course: kid.course,
    origin: payload.origin,

    allergies: kid.allergies,
    medical_notes: kid.medical_notes.trim(),
    special_notes: kid.special_notes?.trim() || null,

    consent_internal_media: payload.consent_internal_media,
    consent_public_media: payload.consent_public_media,
    consent_health: payload.consent_health,
    consent_privacy_read: payload.consent_privacy_read,
    consent_rules: payload.consent_rules,
  }));

  const { error: insErr } = await supabase.from("reservations").insert(rows);

  if (insErr) {
    return json(500, {
      error: "No se pudo guardar la reserva",
      userMessage: "No se pudo completar la inscripción. Inténtalo de nuevo más tarde.",
    });
  }

  /* -----------------------------
     RESPUESTA FINAL
  ------------------------------ */
  return json(200, {
    ok: true,
    status: statusGroup,
    message:
      statusGroup === "reserved"
        ? "Reserva registrada correctamente."
        : "El cupo está completo. La inscripción se ha añadido a la lista de espera.",
  });
}
