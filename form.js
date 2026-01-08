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
const successMedical2Item = document.getElementById("successMedical2Item");
const newReservationBtn = document.getElementById("newReservationBtn");

// ✅ Botón submit (para evitar doble click)
const submitBtn = form.querySelector('button[type="submit"]');

// ✅ Candado extra anti-doble envío
let inFlight = false;

function getAllergies(fd, key) {
  const arr = fd.getAll(key).filter(Boolean);
  return arr.includes("NINGUNA") ? ["NINGUNA"] : arr;
}

function allergiesToText(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return "Ninguna";
  if (arr.length === 1 && arr[0] === "NINGUNA") return "Ninguna";
  return arr.join(", ");
}

function showMessage(text) {
  msg.textContent = text;
}

function setSubmitting(isSubmitting) {
  if (!submitBtn) return;
  submitBtn.disabled = isSubmitting;
  submitBtn.textContent = isSubmitting ? "Enviando…" : "Enviar reserva";
}

function showSuccessViewData({ title, text, email, origin, status, medical1Text, medical2Text }) {
  // Oculta formulario y mensaje inferior
  form.style.display = "none";
  msg.style.display = "none";

  // Rellena y muestra la vista de éxito
  successTitle.textContent = title;
  successText.textContent = text;

  successEmail.textContent = `Correo: ${email || "-"}`;
  successOrigin.textContent = `Procedencia: ${origin || "-"}`;
  successStatus.textContent =
    status === "reserved"
      ? "Plaza: Con plaza"
      : "Plaza: Lista de espera";

  // ✅ 1ª línea médica (siempre)
  successMedical1.textContent = `Información médica: Alergias registradas: ${medical1Text}`;

  // ✅ 2ª línea médica (solo si hay hermano)
  if (medical2Text) {
    successMedical2.textContent = `Información médica segundo/a hermano/a: Alergias registradas: ${medical2Text}`;
    if (successMedical2Item) successMedical2Item.style.display = "list-item";
  } else {
    successMedical2.textContent = "";
    if (successMedical2Item) successMedical2Item.style.display = "none";
  }

  successView.style.display = "block";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function resetToForm() {
  // Vuelve a mostrar el formulario vacío
  successView.style.display = "none";

  form.reset();
  toggleSiblingBlock(false);

  form.style.display = "block";
  msg.style.display = "block";
  showMessage("");

  // re-habilita envíos
  setSubmitting(false);
  inFlight = false;

  // deja el item 2 oculto por defecto
  if (successMedical2Item) successMedical2Item.style.display = "none";

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
      if (el.type === "checkbox" || el.type === "radio") {
        el.checked = false;
      } else {
        el.value = "";
      }
    });
  }
}

form.addEventListener("change", (e) => {
  if (e.target.name === "has_sibling") {
    toggleSiblingBlock(e.target.value === "yes");
  }
});

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

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  // ✅ Anti-doble envío
  if (inFlight) return;
  inFlight = true;

  showMessage("Enviando…");
  setSubmitting(true);

  const fd = new FormData(form);
  const hasSibling = fd.get("has_sibling") === "yes";

  // ---------- ACAMPADO 1 ----------
  const allergies1 = getAllergies(fd, "allergies");
  const otherAllergy1 = (fd.get("allergy_other_text") || "").trim();

  // ✅ Evita duplicado: si hay texto, REEMPLAZA "OTROS" por "OTROS: texto"
  if (allergies1.includes("OTROS") && otherAllergy1) {
    const idx = allergies1.indexOf("OTROS");
    allergies1[idx] = `OTROS: ${otherAllergy1}`;
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

  // ---------- ACAMPADO 2 ----------
  if (hasSibling) {
    const allergies2 = getAllergies(fd, "allergies2");
    const otherAllergy2 = (fd.get("allergy2_other_text") || "").trim();

    if (allergies2.includes("OTROS") && otherAllergy2) {
      const idx = allergies2.indexOf("OTROS");
      allergies2[idx] = `OTROS: ${otherAllergy2}`;
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

  // ---------- VALIDACIONES RÁPIDAS ----------
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

  // ---------- PAYLOAD ----------
  const payload = {
    // Contacto
    email: (fd.get("email") || "").trim(),
    parent_name: (fd.get("parent_name") || "").trim(),
    phones: (fd.get("phones") || "").trim(),
    other_contact: (fd.get("other_contact") || "").trim() || null,

    // Procedencia
    origin: fd.get("origin"),

    // Consentimientos (radio yes/no -> boolean)
    consent_internal_media: fd.get("consent_internal_media") === "yes",
    consent_public_media: fd.get("consent_public_media") === "yes",
    consent_health: fd.get("consent_health") === "yes",
    consent_privacy_read: fd.get("consent_privacy_read") === "yes",
    consent_rules: fd.get("consent_rules") === "yes",

    // Niños
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

    // ✅ Resúmenes médicos (1 línea, sin “espacios” extra)
    const medical1Text = allergiesToText(kids[0].allergies);
    const medical2Text = kids.length === 2 ? allergiesToText(kids[1].allergies) : "";

    showSuccessViewData({
      title: "✅ Reserva registrada",
      text: "Reserva enviada correctamente.",
      email: payload.email,
      origin: payload.origin,
      status: result.status,
      medical1Text,
      medical2Text,
    });

  } catch (err) {
    showMessage("Error de conexión. Inténtalo de nuevo.");
    setSubmitting(false);
    inFlight = false;
  }
});
