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

  // Preserve the original player sections and frontend.
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

        <input
          type="text"
          id="${p.key}_name"
          name="${p.key}_name"
          required
        >

        <div class="error-msg">Required.</div>
      </div>

      <div class="row">
        <div class="field" data-required-group="${p.key}_gender">
          <label class="q">
            Gender <span class="req">*</span>
          </label>

          <div class="choices">
            <label class="choice">
              <input
                type="radio"
                name="${p.key}_gender"
                value="Male"
              >
              <span>Male</span>
            </label>

            <label class="choice">
              <input
                type="radio"
                name="${p.key}_gender"
                value="Female"
              >
              <span>Female</span>
            </label>
          </div>

          <div class="error-msg">Please choose one.</div>
        </div>

        <div class="field">
          <label class="q" for="${p.key}_dob">
            Date of birth <span class="req">*</span>
          </label>

          <input
            type="date"
            id="${p.key}_dob"
            name="${p.key}_dob"
            required
          >

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

          <div class="error-msg">
            Enter an 11-digit number starting with 09.
          </div>
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
          <label class="q" for="${p.key}_dupr">
            DUPR rating (doubles)
          </label>

          <p class="help">e.g. 3.452 — blank if none</p>

          <input
            type="number"
            id="${p.key}_dupr"
            name="${p.key}_dupr"
            min="2"
            max="8"
            step="0.001"
          >

          <div class="error-msg">
            Rating must be between 2.000 and 8.000.
          </div>
        </div>

        <div class="field">
          <label class="q" for="${p.key}_duprid">
            DUPR ID
          </label>

          <p class="help">From your DUPR app profile</p>

          <input
            type="text"
            id="${p.key}_duprid"
            name="${p.key}_dupr_id"
          >
        </div>
      </div>

      <div class="field">
        <label class="q" for="${p.key}_shirt">
          Shirt size <span class="req">*</span>
        </label>

        <select
          id="${p.key}_shirt"
          name="${p.key}_shirt"
          required
        >
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

  // Keep the same request when retrying after an uncertain response.
  let pendingRequest = null;

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
    notes: 2000
  };

  for (const [name, limit] of Object.entries(fieldLimits)) {
    const control = form.elements.namedItem(name);

    if (control && "maxLength" in control) {
      control.maxLength = limit;
    }
  }

  // Philippines calendar date.
  const today = new Date(
    Date.now() + 8 * 60 * 60 * 1000
  ).toISOString().slice(0, 10);

  for (const key of ["p1", "p2"]) {
    const dateInput = document.getElementById(`${key}_dob`);
    dateInput.max = today;
  }

  function showError(message) {
    status.textContent = message;
    status.style.display = "block";
    status.focus();
  }

  function clearError() {
    status.textContent = "";
    status.style.display = "none";
  }

  function validateForm() {
    let valid = true;

    form.querySelectorAll(".invalid").forEach((field) => {
      field.classList.remove("invalid");
    });

    const controls = form.querySelectorAll(
      "input[required], select[required], " +
      "input[type=number], input[type=email], " +
      "input[maxlength], textarea[maxlength]"
    );

    controls.forEach((control) => {
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

      if (bad) {
        valid = false;
      }
    });

    form.querySelectorAll("[data-required-group]").forEach((field) => {
      const selected = field.querySelector(
        'input[type="radio"]:checked, input[type="checkbox"]:checked'
      );

      field.classList.toggle("invalid", !selected);

      if (!selected) {
        valid = false;
      }
    });

    const division = form.querySelector(
      'input[name="division"]:checked'
    )?.value;

    const gender1 = form.querySelector(
      'input[name="p1_gender"]:checked'
    )?.value;

    const gender2 = form.querySelector(
      'input[name="p2_gender"]:checked'
    )?.value;

    if (division && gender1 && gender2) {
      const mismatch =
        (division === "Mixed Doubles" && gender1 === gender2) ||
        (
          division === "Men's Doubles" &&
          (gender1 !== "Male" || gender2 !== "Male")
        ) ||
        (
          division === "Women's Doubles" &&
          (gender1 !== "Female" || gender2 !== "Female")
        );

      if (mismatch) {
        showError(
          "Player genders do not match the selected division."
        );
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

  function setBusy(value) {
    busy = value;
    submitButton.disabled = value;

    submitButton.textContent = value
      ? "Saving registration…"
      : originalButtonText;

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
      ""
    ];

    for (const [key, value] of Object.entries(fields)) {
      if (value) {
        lines.push(`${key.replace(/_/g, " ")}: ${value}`);
      }
    }

    // Use textContent, not innerHTML, for submitted data.
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

    if (busy || completed) {
      return;
    }

    clearError();

    if (!pendingRequest) {
      if (!validateForm()) {
        return;
      }

      if (!window.crypto?.randomUUID) {
        showError(
          "Open the registration form using HTTPS or localhost."
        );
        return;
      }

      pendingRequest = {
        submissionId: window.crypto.randomUUID(),
        fields: Object.fromEntries(new FormData(form).entries())
      };
    }

    // An uncertain retry resends the exact same payload and ID.
    const request = pendingRequest;

    setBusy(true);

    const controller = new AbortController();

    const timeout = window.setTimeout(() => {
      controller.abort();
    }, 20000);

    try {
      const response = await fetch(form.action, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        signal: controller.signal,
        body: JSON.stringify(request)
      });

      const result = await response.json().catch(() => null);

      if (!response.ok) {
        // Validation/closed-registration responses did not insert a row.
        // Let the next submission use the corrected/current form.
        if ([400, 413, 415, 503].includes(response.status)) {
          pendingRequest = null;
        }

        throw new Error(
          result?.error ||
          `Registration was not confirmed (${response.status}).`
        );
      }

      if (
        result?.ok !== true ||
        result.registrationId !== request.submissionId ||
        !Number.isInteger(result.feeDuePhp) ||
        typeof result.paymentStatus !== "string"
      ) {
        throw new Error(
          "The server response was incomplete. Retry on this page."
        );
      }

      completed = true;
      showSuccess(result, request.fields);
    } catch (error) {
      let message;

      if (error.name === "AbortError") {
        message =
          "The request timed out and may already have been saved. " +
          "Click Register Team again on this page to safely retry " +
          "the same submission. Do not refresh.";
      } else if (error instanceof TypeError) {
        message =
          "Could not connect to the server. Click Register Team " +
          "again on this page to retry the same submission. " +
          "Do not refresh.";
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
})();   