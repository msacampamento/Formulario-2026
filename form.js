const form = document.getElementById("f");
const msg = document.getElementById("msg");
const siblingBlock = document.getElementById("siblingBlock");

// ✅ Vista de confirmación
const successView = document.getElementById("successView");
const successTitle = document.getElementById("successTitle");
const successText = document.getElementById("successText");
const successEmail = document.getElementById("successEmail");
const successOrigin = document.getElementById("successOrigin");
const successStatus = document.getElementById("successStatus");
const successMedical1 = document.getElementById("successMedical1");
const successMedical2 = document.getElementById("successMedical2");

const newReservationBtn = document.getElementById("newReservationBtn");

// ✅ Botón submit (anti doble click)
const submitBtn = form.querySelector('button[type="submit"]');

// ✅ Candado extra anti-doble envío
let inFlight = false;

/* -------------------------
   UTILIDADES
-------------------------- */
function getAllergies(fd, key) {
  const arr = fd.getAll(key).filter(Boolean);
  return arr.includes("NINGUNA") ? ["NINGUNA"] : arr;
}

function showMessage(text) {
  msg.textContent = text;
}

function setSubmitting(isSubmitting) {
  if (!submitBtn) return;
  submitBtn.disabled = isSubmitting;
  submitBtn.textContent = isSubmitting ? "Enviando…" : "Enviar reserva";
}

function allergiesToText(allergiesArr) {
  if (!Array.isArray(allergiesArr) || allergiesArr.length === 0) return "Ninguna";
  if (allergiesArr.length === 1 && allergiesArr[0] === "NINGUNA") return "Ninguna";
  return allergiesArr.join(", ");
}

/* -------------------------
   AUTOCHECK "OTROS"
-------------------------- */
function autoCheckOther(textName, checkboxSelector) {
  const textInput = document.querySelector(`input[name="${textName}"]`);
  const checkbox = document.querySelector(checkboxSelector);

  if (!textInput || !checkbox) return;

  textInput.addEventListener("input", () => {
    if (textInput.value.trim()) {
      checkbox.checked = true;
    }
  });
}

// Niño 1
autoCheckOther("allergy_other_text", 'input[name="allergies"][value="OTROS"]');
// Niño 2
autoCheckOther("allergy2_other_text", 'input[name="allergies2"][value="OTROS"]');

/* -------------------------
   VISTA DE ÉXITO
-------------------------- */
function showSuccessViewData({ title, text, email, origin, status, medical1, medical2 }) {
  // Oculta formulario y mensaje inferior
  form.style.display = "none";
  msg.style.display = "none";

  // Rellena y muestra la vista de éxito
  successTitle.textContent = title;
  successText.textContent = text;

  successEmail.textContent = `Correo: ${email || "-"}`;
  successOrigin.textContent = `Procedencia: ${origin || "-"}`;
  successStatus.textContent =
    status === "reserved" ? "Plaza: Con plaza" : "Plaza: Lista de espera";

  // Para que los saltos de línea "\n" se vean sin tocar CSS
  if (successMedical1) successMedical1.style.whiteSpace = "pre-line";
  if (successMedical2) successMedical2.style.whiteSpace = "pre-line";

  if (successMedical1) successMedical1.textContent = medical1 || "";
  if (successMedical2) successMedical2.textContent = medical2 || "";

  successView.style.display = "block";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function resetToForm() {
  successView.style.display = "none";

  form.reset();
  toggleSiblingBlock(false);

  form.style.display = "block";
  msg.style.display = "block";
  showMessage("");

  setSubmitting(false);
  inFlight = false;

  window.scrollTo({ top: 0, behavior: "smooth" });
}

newReservationBtn?.addEventListener("click", resetToForm);

/* -------------------------
   HERMANOS
-------------------------- */
function toggleSiblingBlock(show) {
  siblingBlock.style.display = show ? "block" : "none";

  const fields = siblingBlock.querySelectorAll("input, select, textarea");

  fields.forEach((el) => {
    if (["camper2_name", "camper2_surname"].includes(el.name)) el.required = show;
    if (el.name === "camper2_course") el.required = show;
    if (el.name === "medical2_notes") el.required = show;
  });

  if (!show) {
    fields.forEach((el) => {
      if (el.type === "checkbox" || el.type === "radio") el.checked = false;
      else el.value = "";
    });
  }
}

form.addEventListener("change", (e) => {
  if (e.target.name === "has_sibling") {
    toggleSiblingBlock(e.target.value === "yes");
  }
});

/* -------------------------
   SUBMIT
-------------------------- */
form.addEventListener("submit", async (e) => {
  e.preventDefault();

  // ✅ Anti-doble envío
  if (inFlight) return;
  inFlight = true;

  showMessage("Enviando…");
  setSubmitting(true);

  const fd = new FormData(form);
  const hasSibling = fd.get("has_sibling") === "yes";

  /* ---------- ACAMPADO 1 ---------- */
  const allergies1 = getAllergies(fd, "allergies");
  const otherAllergy1 = (fd.get("allergy_other_text") || "").trim();

  if (allergies1.includes("OTROS") && otherAllergy1) {
    allergies1.push(`OTROS: ${otherAllergy1}`);
  }

  const kid1 = {
    camper_name: (fd.get("camper_name") || "").trim(),
    camper_surname: (fd.get("camper_surname") || "").trim(),
    course: fd.get("course"),
    allergies: allergies1,
    medical_notes: (fd.get("medical_notes") || "").trim(),
    special_notes: (fd.get("special_notes") || "").trim() || null,
  };

  const kids = [kid1];

  /* ---------- ACAMPADO 2 ---------- */
  if (hasSibling) {
    const allergies2 = getAllergies(fd, "allergies2");
    const otherAllergy2 = (fd.get("allergy2_other_text") || "").trim();

    if (allergies2.includes("OTROS") && otherAllergy2) {
      allergies2.push(`OTROS: ${otherAllergy2}`);
    }

    const kid2 = {
      camper_name: (fd.get("camper2_name") || "").trim(),
      camper_surname: (fd.get("camper2_surname") || "").trim(),
      course: fd.get("camper2_course"),
      allergies: allergies2,
      medical_notes: (fd.get("medical2_notes") || "").trim(),
      special_notes: (fd.get("special2_notes") || "").trim() || null,
    };

    kids.push(kid2);
  }

  /* ---------- VALIDACIONES RÁPIDAS ---------- */
  if (!kids[0].camper_name || !kids[0].camper_surname) {
    showMessage("Faltan nombre/apellidos del acampado.");
    setSubmitting(false);
    inFlight = false;
    return;
  }

  if (hasSibling && (!kids[1].camper_name || !kids[1].camper_surname)) {
    showMessage("Faltan nombre/apellidos del segundo hermano/a.");
    setSubmitting(false);
    inFlight = false;
    return;
  }

  /* ---------- RESUMEN MÉDICO PARA CONFIRMACIÓN ---------- */
  const medicalSummary1 =
    "Información médica:\n" +
    "Alergias registradas: " +
    allergiesToText(kids[0].allergies);

  let medicalSummary2 = "";
  if (kids.length === 2) {
    medicalSummary2 =
      "Información médica segundo/a hermano/a:\n" +
      "Alergias registradas: " +
      allergiesToText(kids[1].allergies);
  }

  /* ---------- PAYLOAD ---------- */
  const payload = {
    email: (fd.get("email") || "").trim(),
    parent_name: (fd.get("parent_name") || "").trim(),
    phones: (fd.get("phones") || "").trim(),
    other_contact: (fd.get("other_contact") || "").trim() || null,

    origin: fd.get("origin"),

    consent_internal_media: fd.get("consent_internal_media") === "yes",
    consent_public_media: fd.get("consent_public_media") === "yes",
    consent_health: fd.get("consent_health") === "yes",
    consent_privacy_read: fd.get("consent_privacy_read") === "yes",
    consent_rules: fd.get("consent_rules") === "yes",

    kids,
  };

  try {
    const res = await fetch("/.netlify/functions/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const result = await res.json().catch(() => ({}));

    if (!res.ok) {
      showMessage(result.userMessage || result.error || "Error al enviar.");
      setSubmitting(false);
      inFlight = false;
      return;
    }

    showSuccessViewData({
      title: "✅ Reserva registrada",
      text: "Reserva enviada correctamente.",
      email: payload.email,
      origin: payload.origin,
      status: result.status,
      medical1: medicalSummary1,
      medical2: medicalSummary2,
    });

    // Nota: no reactivamos inFlight aquí porque el formulario se oculta.
  } catch (err) {
    showMessage("Error de conexión. Inténtalo de nuevo.");
    setSubmitting(false);
    inFlight = false;
  }
});
