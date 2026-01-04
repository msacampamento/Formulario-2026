const form = document.getElementById("f");
const msg = document.getElementById("msg");
const siblingBlock = document.getElementById("siblingBlock");

function getAllergies(fd, key) {
  const arr = fd.getAll(key).filter(Boolean);
  return arr.includes("NINGUNA") ? ["NINGUNA"] : arr;
}

function showMessage(text) {
  msg.textContent = text;
}

function toggleSiblingBlock(show) {
  siblingBlock.style.display = show ? "block" : "none";

  // Activar/desactivar required de los campos del hermano
  const req = siblingBlock.querySelectorAll("input, select, textarea");
  req.forEach((el) => {
    // Solo marcamos required a lo necesario (nombre, apellidos, curso, medical2)
    if (["camper2_name", "camper2_surname"].includes(el.name)) el.required = show;
    if (el.name === "camper2_course") el.required = show;
    if (el.name === "medical2_notes") el.required = show;
  });
}

form.addEventListener("change", (e) => {
  if (e.target.name === "has_sibling") {
    toggleSiblingBlock(e.target.value === "yes");
  }
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  showMessage("Enviando…");

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

  // Pequeñas validaciones extra (por si acaso)
  if (!kids[0].camper_name || !kids[0].camper_surname) {
    showMessage("Faltan nombre/apellidos del acampado.");
    return;
  }
  if (hasSibling && (!kids[1].camper_name || !kids[1].camper_surname)) {
    showMessage("Faltan nombre/apellidos del segundo hermano/a.");
    return;
  }

  const payload = {
    // Contacto
    email: (fd.get("email") || "").trim(),
    parent_name: (fd.get("parent_name") || "").trim(),
    phones: (fd.get("phones") || "").trim(),
    other_contact: (fd.get("other_contact") || "").trim() || null,

    // Procedencia real
    origin: fd.get("origin"),

    // Consentimientos (checkbox: si existe en FormData es true)
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
      showMessage(result.error || "Error al enviar.");
      return;
    }

    showMessage(result.message || "Enviado.");
    form.reset();
    toggleSiblingBlock(false);
  } catch (err) {
    showMessage("Error de conexión.");
  }
});
