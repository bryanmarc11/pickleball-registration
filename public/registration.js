(() => {
  "use strict";

  const form = document.getElementById("regForm");
  const playersContainer = document.getElementById("players");
  const status = document.getElementById("submitStatus");
  const thanks = document.getElementById("thanks");
  const summary = document.getElementById("summary");

  if (!form || !playersContainer || !status || !thanks || !summary) {
    return;
  }

  const players = [
    {
      key: "p1",
      title: "Player 1 (Team Captain)",
      num: 2,
      emailRequired: true
    },
    {
      key: "p2",
      title: "Player 2 (Partner)",
      num: 3,
      emailRequired: false
    }
  ];

  const sizes = ["XS", "S", "M", "L", "XL", "2XL", "3XL"];

  playersContainer.innerHTML = players.map((p) => `
    <section>
      <h2><span class="num">${p.num}</span> ${p.title}</h2>

      <div class="field">
        <label class="q" for="${p.key}_name">
          Full name <span class="req">*</span>
        </label>
        <input type="text" id="${p.key}_name" name="${p.key}_name" required>
        <div class="error-msg">Required.</div>
      </div>

      <div class="row">
        <div class="field" data-required-group="${p.key}_gender">
          <label class="q">Gender <span class="req">*</span></label>
          <div class="choices">
            <label class="choice">
              <input type="radio" name="${p.key}_gender" value="Male">
              <span>Male</span>
            </label>
            <label class="choice">
              <input type="radio" name="${p.key}_gender" value="Female">
              <span>Female</span>
            </label>
          </div>
          <div class="error-msg">Please choose one.</div>
        </div>

        <div class="field">
          <label class="q" for="${p.key}_dob">
            Date of birth <span class="req">*</span>
          </label>
          <input type="date" id="${p.key}_dob" name="${p.key}_dob" required>
          <div class="error-msg">Required.</div>
        </div>
      </div>

      <div class="row">
        <div class="field">
          <label class="q" for="${p.key}_phone">
            Mobile number <span class="req">*</span>
          </label>
          <input
            type="tel"
            id="${p.key}_phone"
            name="${p.key}_phone"
            required
            pattern="09\\d{9}"
            placeholder="09171234567"
            inputmode="numeric"
          >
          <div class="error-msg">Enter an 11-digit number starting with 09.</div>
        </div>

        <div class="field">
          <label class="q" for="${p.key}_email">
            Email ${p.emailRequired ? '<span class="req">*</span>' : ""}
          </label>
          <input
            type="email"
            id="${p.key}_email"
            name="${p.key}_email"
            ${p.emailRequired ? "required" : ""}
          >
          <div class="error-msg">Enter a valid email.</div>
        </div>
      </div>

      <div class="row">
        <div class="field">
          <label class="q" for="${p.key}_dupr">DUPR rating (doubles)</label>
          <p class="help">e.g. 3.452 — blank if none</p>
          <input
            type="number"
            id="${p.key}_dupr"
            name="${p.key}_dupr"
            min="2"
            max="8"
            step="0.001"
          >
          <div class="error-msg">Rating must be between 2.000 and 8.000.</div>
        </div>

        <div class="field">
          <label class="q" for="${p.key}_duprid">DUPR ID</label>
          <p class="help">From your DUPR app profile</p>
          <input type="text" id="${p.key}_duprid" name="${p.key}_dupr_id">
        </div>
      </div>

      <div class="field">
        <label class="q" for="${p.key}_shirt">
          Shirt size <span class="req">*</span>
        </label>
        <select id="${p.key}_shirt" name="${p.key}_shirt" required>
          <option value="">Select size</option>
          ${sizes.map((size) => `<option>${size}</option>`).join("")}
        </select>
        <div class="error-msg">Please select a size.</div>
      </div>
    </section>
  `).join("");

  const submitButton = form.querySelector('button[type="submit"]');
  const originalButtonText = submitButton.textContent;

  let busy = false;
  let completed = false;
  let pendingRequest = null;
  let previewObjectUrl = null;

  const fieldLimits = {
    team_name: 120,
    club: 160,
    p1_name: 120,
    p2_name: 120,
    p1_email: 254,
    p2_email: 254,
    p1_phone: 11,
    p2_phone: 11,
    p1_dupr_id: 80,
    p2_dupr_id: 80,
    emergency_name: 120,
    emergency_phone: 11,
    emergency_relationship: 80,
    notes: 2000,
    business_name: 160
  };

  for (const [name, limit] of Object.entries(fieldLimits)) {
    const control = form.elements.namedItem(name);
    if (control && "maxLength" in control) {
      control.maxLength = limit;
    }
  }

  const today = new Date(
    Date.now() + 8 * 60 * 60 * 1000
  ).toISOString().slice(0, 10);

  for (const key of ["p1", "p2"]) {
    const dateInput = document.getElementById(`${key}_dob`);
    dateInput.max = today;
  }

  const promotionField = document.getElementById("promotion-field");
  const businessExtra = document.getElementById("business-extra");
  const businessName = document.getElementById("business_name");
  const businessLogo = document.getElementById("business_logo");
  const businessLogoLabel = document.getElementById("business_logo_label");
  const logoPreviewWrap = document.getElementById("logo_preview_wrap");
  const logoPreview = document.getElementById("logo_preview");
  const maxLogoSize = 2 * 1024 * 1024;
  const allowedLogoTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

  function showError(message) {
    status.textContent = message;
    status.style.display = "block";
    status.focus();
  }

  function clearError() {
    status.textContent = "";
    status.style.display = "none";
  }

  function getCheckedValue(name) {
    return form.querySelector(`input[name="${name}"]:checked`)?.value || "";
  }

  function clearLogoPreview() {
    businessLogo.value = "";
    businessLogo.setCustomValidity("");
    businessLogoLabel.textContent = "Choose logo image";
    if (previewObjectUrl) {
      URL.revokeObjectURL(previewObjectUrl);
      previewObjectUrl = null;
    }
    logoPreview.removeAttribute("src");
    logoPreviewWrap.hidden = true;
  }

  function updateBusinessSection() {
    const hasBusiness = getCheckedValue("has_business");
    const wantsPromotion = getCheckedValue("wants_promotion");

    const showPromotion = hasBusiness === "yes";
    promotionField.hidden = !showPromotion;

    form.querySelectorAll('input[name="wants_promotion"]').forEach((input) => {
      input.disabled = !showPromotion;
      if (!showPromotion) input.checked = false;
    });

    const showBusinessExtra = showPromotion && wantsPromotion === "yes";
    businessExtra.hidden = !showBusinessExtra;

    businessName.disabled = !showBusinessExtra;
    businessName.required = showBusinessExtra;

    businessLogo.disabled = !showBusinessExtra;
    businessLogo.required = showBusinessExtra;

    if (!showBusinessExtra) {
      businessName.value = "";
      clearLogoPreview();
    }
  }

  form.addEventListener("change", (event) => {
    if (
      event.target.name === "has_business" ||
      event.target.name === "wants_promotion"
    ) {
      updateBusinessSection();
    }
  });

  businessLogo?.addEventListener("change", () => {
    businessLogo.setCustomValidity("");

    const file = businessLogo.files?.[0];
    if (!file) {
      clearLogoPreview();
      return;
    }

    if (!allowedLogoTypes.has(file.type)) {
      businessLogo.setCustomValidity("Please upload a JPG, PNG, or WebP image.");
      businessLogo.closest(".field")?.classList.add("invalid");
      businessLogo.reportValidity();
      return;
    }

    if (file.size > maxLogoSize) {
      businessLogo.setCustomValidity("The image must be 2 MB or smaller.");
      businessLogo.closest(".field")?.classList.add("invalid");
      businessLogo.reportValidity();
      return;
    }

    businessLogo.closest(".field")?.classList.remove("invalid");
    businessLogoLabel.textContent = file.name;

    if (previewObjectUrl) {
      URL.revokeObjectURL(previewObjectUrl);
    }

    previewObjectUrl = URL.createObjectURL(file);
    logoPreview.src = previewObjectUrl;
    logoPreviewWrap.hidden = false;
  });

  function validateForm() {
    let valid = true;

    form.querySelectorAll(".invalid").forEach((field) => {
      field.classList.remove("invalid");
    });

    const controls = form.querySelectorAll(
      "input[required], select[required], input[type=number], input[type=email], input[maxlength], textarea[maxlength]"
    );

    controls.forEach((control) => {
      if (control.disabled) {
        control.setCustomValidity("");
        return;
      }

      control.setCustomValidity("");

      if (
        control.required &&
        control.type === "text" &&
        !control.value.trim()
      ) {
        control.setCustomValidity("This field is required.");
      }

      const bad = !control.checkValidity();
      control.closest(".field")?.classList.toggle("invalid", bad);

      if (bad) valid = false;
    });

    form.querySelectorAll("[data-required-group]").forEach((field) => {
      const availableControls = [
        ...field.querySelectorAll(
          'input[type="radio"]:not(:disabled), input[type="checkbox"]:not(:disabled)'
        )
      ];

      if (field.hidden || availableControls.length === 0) {
        field.classList.remove("invalid");
        return;
      }

      const selected = availableControls.some((control) => control.checked);
      field.classList.toggle("invalid", !selected);

      if (!selected) valid = false;
    });

    const division = getCheckedValue("division");
    const gender1 = getCheckedValue("p1_gender");
    const gender2 = getCheckedValue("p2_gender");

    if (division && gender1 && gender2) {
      const mismatch =
        (division === "Mixed Doubles" && gender1 === gender2) ||
        (division === "Men's Doubles" && (gender1 !== "Male" || gender2 !== "Male")) ||
        (division === "Women's Doubles" && (gender1 !== "Female" || gender2 !== "Female"));

      if (mismatch) {
        showError("Player genders do not match the selected division.");
        valid = false;
      }
    }

    const logoFile = businessLogo.files?.[0];
    if (!businessLogo.disabled) {
      if (!logoFile) {
        businessLogo.closest(".field")?.classList.add("invalid");
        valid = false;
      }
    }

    if (!valid) {
      const firstInvalid = form.querySelector(".invalid");
      if (firstInvalid) {
        firstInvalid.scrollIntoView({
          behavior: "smooth",
          block: "center"
        });

        firstInvalid.querySelector("input, select, textarea")?.focus();
      }
    }

    return valid;
  }

function readApiError(result, fallback) {
  const candidates = [
    typeof result === "string" ? result : null,
    result?.error,
    result?.error?.message,
    result?.error?.error,
    result?.message
  ];

  const message = candidates.find(
    (value) =>
      typeof value === "string" &&
      value.trim() &&
      !value.includes("[object Object]")
  );

  return message ? message.trim() : fallback;
}

  function setBusy(value) {
    busy = value;
    submitButton.disabled = value;
    submitButton.textContent = value ? "Saving registration…" : originalButtonText;
    submitButton.style.opacity = value ? "0.65" : "";
    submitButton.style.cursor = value ? "wait" : "";

    if (value) {
      form.setAttribute("aria-busy", "true");
    } else {
      form.removeAttribute("aria-busy");
    }
  }

  function showSuccess(result, fields) {
    const lines = [
      `Registration reference: ${result.registrationId}`,
      `Payment status: ${result.paymentStatus.toUpperCase()}`,
      `Fee due: ₱${result.feeDuePhp.toLocaleString("en-PH")}`,
      result.businessLogoUploaded ? "Business logo uploaded: YES" : "Business logo uploaded: NO",
      ""
    ];

    for (const [key, value] of Object.entries(fields)) {
      if (value) {
        lines.push(`${key.replace(/_/g, " ")}: ${value}`);
      }
    }

    summary.textContent = lines.join("\n");
    form.style.display = "none";
    thanks.style.display = "block";
    thanks.setAttribute("tabindex", "-1");
    thanks.focus();

    window.scrollTo({
      top: 0,
      behavior: "smooth"
    });
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (busy || completed) return;

    clearError();

    if (!pendingRequest) {
      if (!validateForm()) return;

      if (!window.crypto?.randomUUID) {
        showError("Open the registration form using HTTPS or localhost.");
        return;
      }

      const rawFormData = new FormData(form);
      const fields = {};

      for (const [name, value] of rawFormData.entries()) {
        if (typeof value === "string") {
          fields[name] = value;
        }
      }

      if (fields.has_business === "no") {
        fields.wants_promotion = "no";
        fields.business_name = "";
      }

      if (fields.wants_promotion !== "yes") {
        fields.business_name = "";
      }

      pendingRequest = {
        submissionId: window.crypto.randomUUID(),
        fields,
        businessLogo: businessLogo.files?.[0] || null
      };
    }

    const request = pendingRequest;
    setBusy(true);

    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      controller.abort();
    }, 20000);

    try {
      const multipartData = new FormData();

      multipartData.append(
        "payload",
        JSON.stringify({
          submissionId: request.submissionId,
          fields: request.fields
        })
      );

      if (request.businessLogo) {
        multipartData.append(
          "business_logo",
          request.businessLogo,
          request.businessLogo.name
        );
      }

      const response = await fetch(form.action, {
        method: "POST",
        headers: {
          "Accept": "application/json"
        },
        signal: controller.signal,
        body: multipartData
      });

const result = await response.json().catch(() => null);

function extractErrorMessage(result, response) {
  const candidates = [
    typeof result === "string" ? result : null,
    typeof result?.error === "string" ? result.error : null,
    typeof result?.message === "string" ? result.message : null,
    typeof result?.error?.message === "string" ? result.error.message : null,
    typeof result?.error?.error === "string" ? result.error.error : null
  ];

  const found = candidates.find(
    (value) => typeof value === "string" && value.trim()
  );

  return found || `Registration was not confirmed (${response.status}).`;
}

if (!response.ok) {
  const message = extractErrorMessage(result, response);

  if ([400, 413, 415, 503].includes(response.status)) {
    pendingRequest = null;
    unlockFormFields();
  }

  throw new Error(message);

}

      if (
        result?.ok !== true ||
        result.registrationId !== request.submissionId ||
        !Number.isInteger(result.feeDuePhp) ||
        typeof result.paymentStatus !== "string"
      ) {
        throw new Error("The server response was incomplete. Retry on this page.");
      }

      completed = true;
      showSuccess(result, request.fields);
    } catch (error) {
      let message;

      if (error.name === "AbortError") {
        message =
          "The request timed out and may already have been saved. Click Register Team again on this page to safely retry the same submission. Do not refresh.";
      } else if (error instanceof TypeError) {
        message =
          "Could not connect to the server. Click Register Team again on this page to retry the same submission. Do not refresh.";
      } else {
        message = error.message || "Registration was not confirmed.";
      }

      showError(message);
    } finally {
      window.clearTimeout(timeout);
      setBusy(false);
    }
  });

  function clearFieldError(event) {
    const target = event.target;
    target.closest?.(".field")?.classList.remove("invalid");
    target.setCustomValidity?.("");
  }

  form.addEventListener("input", clearFieldError);
  form.addEventListener("change", clearFieldError);

  updateBusinessSection();
})();