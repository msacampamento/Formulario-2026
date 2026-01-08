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

const newReservationBtn = document.getElementById("newReservationBtn");

// ✅ Botón submit (para evitar doble click)
const submitBtn = form.querySelector('button[type="submit"]');

// ✅ Candado extra anti-doble envío (no usa IDs ni BD)
let inFlight = false;

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

function showSuccessViewData({ title, text, email, origin, status }) {
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

  window.scrollTo({ top: 0, behavior: "smooth" });
}

newReservationBtn?.addEventListener("click", resetToForm);

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

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  // ✅ Anti-doble envío (clicks rápidos / Enter / lag)
  if (inFlight) return;
  inFlight = true;

  showMessage("Enviando…");
  setSubmitting(true);

  const fd = new FormData(form);
  const hasSibling = fd.get("has_sibling") === "yes";

  const kid1 = {
    camper_name: (fd.get("camper_name") || "").trim(),
    camper_surname: (fd.get("camper_surname") || "").trim(),
    course: fd.get("course"),
    allergies: getAllergies(fd, "allergies"),
    medical_notes: (fd.get("medical_notes") || "").trim(),
    special_notes: (fd.get("special_notes") || "").trim() || null,
  };

  const kids = [kid1];

  if (hasSibling) {
    const kid2 = {
      camper_name: (fd.get("camper2_name") || "").trim(),
      camper_surname: (fd.get("camper2_surname") || "").trim(),
      course: fd.get("camper2_course"),
      allergies: getAllergies(fd, "allergies2"),
      medical_notes: (fd.get("medical2_notes") || "").trim(),
      special_notes: (fd.get("special2_notes") || "").trim() || null,
    };
    kids.push(kid2);
  }

  // Validaciones rápidas (UX)
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
      // ✅ Si backend manda userMessage, se ve humano
      showMessage(result.userMessage || result.error || "Error al enviar.");
      setSubmitting(false);
      inFlight = false;
      return;
    }

    // ✅ Éxito: mostrar vista y ocultar el formulario
    const kidsCount = kids.length;

    showSuccessViewData({
      title: result.status === "reserved" ? "✅ Reserva registrada" : "⏳ Lista de espera",
      text: result.message || "Reserva enviada correctamente.",
      email: payload.email,
      origin: payload.origin,
      status: result.status,
    });

    // Nota: no reactivamos inFlight aquí porque el formulario se oculta.
    // Si quieren otra reserva, el botón "Hacer otra reserva" resetea y habilita de nuevo.
  } catch (err) {
    showMessage("Error de conexión. Inténtalo de nuevo.");
    setSubmitting(false);
    inFlight = false;
  }
});
